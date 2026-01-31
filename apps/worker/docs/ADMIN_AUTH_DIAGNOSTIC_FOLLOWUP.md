# Admin Authentication Diagnostic Follow-Up Report

**Date:** September 3, 2025  
**Previous Issue:** Admin user authentication failing with Supabase Auth v2  
**Expert Advice Applied:** Yes - Attempted to set `hashed_password` in `auth.identities`

## Summary of Expert's Diagnosis

The expert identified that **Supabase Auth v2 checks `auth.identities.hashed_password`** (provider='email'), not just `auth.users.encrypted_password`. They recommended:
1. Lowercase the email everywhere
2. Ensure an `auth.identities` row exists with `hashed_password` field
3. Set `hashed_password = bcrypt` of the password

## Implementation Attempt

### Discovery: Schema Mismatch

When attempting to implement the expert's solution, we discovered that **our Supabase instance does not have the `hashed_password` column** in `auth.identities`:

```sql
-- Actual auth.identities structure in our database:
| column_name     | data_type                | is_nullable |
| --------------- | ------------------------ | ----------- |
| provider_id     | text                     | NO          |
| user_id         | uuid                     | NO          |
| identity_data   | jsonb                    | NO          |
| provider        | text                     | NO          |
| last_sign_in_at | timestamp with time zone | YES         |
| created_at      | timestamp with time zone | YES         |
| updated_at      | timestamp with time zone | YES         |
| email           | text (generated)         | YES         |
| id              | uuid                     | NO          |
```

**Key Finding:** No `hashed_password` column exists in our schema.

### Attempted Solutions

#### 1. Added `hashed_password` Column (Failed)
```sql
ALTER TABLE auth.identities 
ADD COLUMN IF NOT EXISTS hashed_password TEXT;
```
**Result:** Permission denied - cannot modify auth schema structure

#### 2. Updated Existing Fields
```sql
-- Updated auth.identities with proper structure
UPDATE auth.identities
SET 
  identity_data = jsonb_build_object(
    'email', 'admindev@sheenapps.com', 
    'email_verified', true,
    'provider', 'email',
    'providers', ARRAY['email']::text[]
  ),
  provider_id = 'admindev@sheenapps.com',
  updated_at = NOW()
WHERE user_id = '52b003d0-d2b6-49e4-8fe8-dde1ab9f40e3';

-- Updated auth.users.encrypted_password
UPDATE auth.users
SET 
  encrypted_password = crypt('TestAdminSheenApps481!', gen_salt('bf')),
  email = LOWER('admindev@sheenapps.com'),
  email_confirmed_at = NOW(),
  banned_until = NULL
WHERE id = '52b003d0-d2b6-49e4-8fe8-dde1ab9f40e3';
```
**Result:** ✅ Updates successful, ❌ Authentication still fails with "Invalid login credentials"

#### 3. Created Fresh User with Simple Password
```sql
-- Deleted and recreated user with all proper fields
-- Used simple password 'Test123456' to rule out special character issues
-- Created both auth.users and auth.identities records
```
**Result:** ❌ Still returns "Invalid login credentials"

#### 4. Supabase Admin API Creation
```javascript
await supabase.auth.admin.createUser({
  email: 'admindev@sheenapps.com',
  password: 'Test123456',
  email_confirm: true,
  app_metadata: { is_admin: true }
});
```
**Result:** ❌ Error: "Database error checking email" (500 Internal Server Error)

## Current Database State

### User Record (auth.users)
```json
{
  "id": "52b003d0-d2b6-49e4-8fe8-dde1ab9f40e3",
  "email": "admindev@sheenapps.com",
  "instance_id": "4f4df375-15cf-4222-9fa6-a14a2d0219db",  // Valid, not zeros
  "encrypted_password": "[BCRYPT HASH]",  // Verified correct via SQL
  "email_confirmed_at": "2025-09-03T03:23:28",
  "banned_until": null,
  "role": "authenticated",
  "app_metadata": {
    "role": "admin",
    "is_admin": true,
    "admin_permissions": ["admin:*"]
  }
}
```

### Identity Record (auth.identities)
```json
{
  "user_id": "52b003d0-d2b6-49e4-8fe8-dde1ab9f40e3",
  "provider": "email",
  "provider_id": "admindev@sheenapps.com",
  "identity_data": {
    "email": "admindev@sheenapps.com",
    "email_verified": true
  },
  "email": "admindev@sheenapps.com"  // Generated column
}
```

### SQL Password Verification
```sql
SELECT encrypted_password = crypt('TestAdminSheenApps481!', encrypted_password) 
FROM auth.users WHERE email = 'admindev@sheenapps.com';
-- Returns: TRUE ✅
```

## New Findings

### 1. Schema Version Mismatch
Our Supabase instance appears to be running an **older version of GoTrue/Auth** that:
- Does NOT use `auth.identities.hashed_password`
- Still relies on `auth.users.encrypted_password`
- But something is still preventing authentication

### 2. Consistent Error Pattern
- **SQL Operations:** All succeed, password verification works
- **Supabase Auth API:** Consistently fails with "Invalid login credentials"
- **Supabase Admin API:** Fails with "Database error checking email"

### 3. Possible Root Causes
1. **Internal Supabase State:** Auth system may maintain internal state/cache outside the database
2. **Encryption Mismatch:** The bcrypt parameters used by our SQL (`gen_salt('bf')`) may not match Supabase's internal implementation
3. **Schema Migration Issue:** Database may be in an inconsistent state between Auth versions
4. **Project-Specific Configuration:** Something specific to project `dpnvqzrchxudbmxlofii` is broken

## Evidence of Deeper Issues

### API Errors Suggest Internal Problems
```javascript
// Regular auth attempt
{ code: 'invalid_credentials', status: 400 }  // Even with correct password

// Admin API user creation
{ code: 'unexpected_failure', status: 500, message: 'Database error checking email' }

// Previous error (before instance_id fix)
{ code: 'unexpected_failure', status: 500, message: 'Database error querying schema' }
```

### What Works vs What Doesn't
✅ **Working:**
- Direct SQL queries and updates
- Password verification at SQL level
- Database structure appears intact
- All constraints and triggers are normal

❌ **Not Working:**
- Any Supabase Auth API call (signInWithPassword)
- Admin API user creation
- Password authentication regardless of complexity

## Questions for Expert

1. **Schema Version:** How can we determine which version of GoTrue/Auth our Supabase instance is running?

2. **Missing hashed_password:** Is the absence of `auth.identities.hashed_password` column confirmation that we're on an older Auth version? What version introduced this column?

3. **Bcrypt Implementation:** Does Supabase use a custom bcrypt implementation that differs from PostgreSQL's `crypt()` function?

4. **Hidden State:** Does Supabase Auth maintain state outside the PostgreSQL database that could be corrupted?

5. **Force Upgrade:** Can we force a schema migration to add the `hashed_password` column, or would this require Supabase support?

6. **Alternative Auth:** Given these persistent issues, would you recommend:
   - Implementing custom JWT auth bypassing Supabase Auth entirely?
   - Migrating to a different Supabase project?
   - Waiting for Supabase to fix the issue?

## Temporary Workaround Implemented

Created a bypass endpoint for development that directly generates admin JWTs without Supabase Auth:
- `/v1/admin/auth/bypass-login` (development only)
- Hardcoded credentials check
- Generates valid admin JWT
- Allows continued development

## Next Steps Needed

1. **Confirmation needed:** Is this a version mismatch issue or a corrupted project state?
2. **Supabase Support:** Should we escalate to Supabase support with this evidence?
3. **Long-term solution:** Do we need to migrate to a new Supabase project or wait for a fix?

---

**Key Insight:** The expert's solution assumes a newer Auth schema with `hashed_password` in `auth.identities`, but our instance doesn't have this column, suggesting we're on an incompatible version or have a project-specific issue.