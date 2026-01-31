# Supabase Support Ticket: Auth Schema Version Drift

**Project ID:** dpnvqzrchxudbmxlofii  
**Issue Type:** Auth Schema Version Mismatch  
**Severity:** Critical - Authentication completely broken  
**Environment:** Production  
**Date:** September 3, 2025

## Issue Summary

Our Auth server and database schema are out of sync. The GoTrue server expects `auth.identities.hashed_password` column, but our database schema doesn't have it. This causes:

1. All password authentication attempts to fail with "Invalid login credentials" (400)
2. Users created via Admin API cannot authenticate despite successful creation

## Evidence

### Missing Column
```sql
-- Our auth.identities table is missing the hashed_password column
SELECT column_name FROM information_schema.columns 
WHERE table_schema = 'auth' AND table_name = 'identities';
-- Result: No hashed_password column exists
```

### Error Patterns
- `supabase.auth.signInWithPassword()` → 400: "Invalid login credentials"
- SQL password verification works: `crypt()` confirms password is correct in `auth.users.encrypted_password`

### Critical Finding: Admin API Creates Users But They Cannot Authenticate

**Test performed on September 3, 2025:**
```javascript
// User created successfully via Admin API
await admin.auth.admin.createUser({
  email: 'admindev@sheenapps.com',
  password: 'TestAdminSheenApps481!',
  email_confirm: true,
  app_metadata: { is_admin: true, admin_permissions: ['admin:*'] }
});
// Result: ✅ Success - User ID: 85870863-fe8f-475b-8cdb-45a95a6ef4af

// Same user cannot authenticate
await client.auth.signInWithPassword({
  email: 'admindev@sheenapps.com',
  password: 'TestAdminSheenApps481!'
});
// Result: ❌ Error 400: "Invalid login credentials"
```

This proves the schema drift - the Admin API can write users in the expected format, but the Auth server cannot read/validate them properly.

### What We've Tried
1. ✅ Created user via Admin API with service role key - successful
2. ✅ Verified user exists with correct metadata via `admin.auth.admin.listUsers()`
3. ✅ Password set correctly in `auth.users.encrypted_password` (verified via SQL)
4. ✅ Identity record exists with proper structure
5. ✅ Email lowercase, confirmed, not banned
6. ✅ Instance ID set to sentinel value ('00000000-0000-0000-0000-000000000000')
7. ❌ Cannot add `hashed_password` column to `auth.identities` (no permissions)
8. ❌ All authentication attempts fail despite correct setup

## Request

Please either:

### Option A: Migrate Schema Forward
Run the necessary Auth schema migrations to add `auth.identities.hashed_password` and any other missing columns to match our GoTrue server version.

### Option B: Rollback Server Version
Roll back our project's Auth server to a version compatible with our current schema (without `hashed_password` requirement).

## Impact

- **Users affected:** All admin users
- **Features blocked:** Admin panel completely inaccessible
- **Workaround:** Temporary bypass endpoint (development only)
- **Timeline:** Blocking production deployment

## Additional Context

We discovered this after extensive debugging with password encryption, instance_ids, and identity records. Expert analysis confirmed this is schema version drift, not a password or configuration issue.

### Database Schema (Current)
```
auth.identities columns:
- provider_id, user_id, identity_data, provider
- last_sign_in_at, created_at, updated_at
- email (generated column)
- id
❌ Missing: hashed_password column
```

### Expert Diagnosis
> "You've almost certainly got Auth server ↔ DB schema drift in this project. Your GoTrue version expects auth.identities.hashed_password, but the table in your DB doesn't have it. That explains both the 400 'invalid_credentials' and the 500 'Database error checking email'."

The project appears to have missed a schema migration, causing this drift between the Auth server version and database schema.

## Contact

[Your contact information]

---

**Urgent:** We need either schema migration or server rollback to restore authentication functionality.