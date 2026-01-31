# Admin Authentication Diagnostic Report

**Date:** September 3, 2025  
**Issue:** Admin user authentication failing with Supabase despite correct credentials  
**Environment:** Development (local)  
**Affected Endpoint:** `/v1/admin/auth/login`

## Executive Summary

The admin authentication system is failing to authenticate a properly configured admin user (`admindev@sheenapps.com`) through Supabase Auth, despite the user existing in the database with correct metadata and password verification passing at the SQL level.

## Current Status

### ✅ Working Components
1. **User exists in database** - User record properly created in `auth.users` table
2. **Instance ID is valid** - User has correct instance_id (`4f4df375-15cf-4222-9fa6-a14a2d0219db`)
3. **Identity record exists** - Proper `auth.identities` record linked to user
4. **Password verification at SQL level** - `crypt()` function confirms password matches
5. **Admin metadata set** - User has `is_admin: true` and `admin_permissions: ['admin:*']` in app_metadata
6. **Backend routes functional** - API endpoints respond correctly
7. **Database connection working** - Can query and modify auth tables successfully

### ❌ Failing Components
1. **Supabase Auth API** - Returns "Invalid login credentials" for correct password
2. **Token exchange endpoint** - Cannot test due to login failure
3. **Admin panel access** - Blocked by authentication failure

## Technical Details

### User Configuration
```json
{
  "id": "52b003d0-d2b6-49e4-8fe8-dde1ab9f40e3",
  "email": "admindev@sheenapps.com",
  "instance_id": "4f4df375-15cf-4222-9fa6-a14a2d0219db",
  "role": "authenticated",
  "aud": "authenticated",
  "email_confirmed_at": "2025-09-03T03:23:28.656503+00",
  "app_metadata": {
    "provider": "email",
    "providers": ["email"],
    "role": "admin",
    "is_admin": true,
    "admin_permissions": ["admin:*"]
  }
}
```

### Authentication Flow
1. Frontend sends POST to `/v1/admin/auth/login` with email/password
2. Backend receives credentials correctly (verified via logging)
3. Backend calls `supabase.auth.signInWithPassword()` 
4. Supabase returns error 400: "Invalid login credentials"
5. Backend returns 401 to frontend

### Error Details
```javascript
{
  "__isAuthError": true,
  "name": "AuthApiError",
  "status": 400,
  "code": "invalid_credentials",
  "message": "Invalid login credentials"
}
```

## Troubleshooting Attempts

### 1. Password Creation Methods Tried
- ✅ Direct SQL with `crypt(password, gen_salt('bf'))`
- ✅ Migration script (999_test_admin_user_setup_SAFE.sql)
- ❌ Supabase Admin API (`createUser()` - returns "Database error creating new user")
- ✅ SQL verification shows password matches in database

### 2. Instance ID Issues Resolved
- **Initial Problem:** User had invalid instance_id (`00000000-0000-0000-0000-000000000000`)
- **Solution:** Created proper instance in `auth.instances` table
- **Result:** Fixed "Database error querying schema" but login still fails

### 3. Database Structure Verified
- ✅ All required columns present in `auth.users`
- ✅ No blocking constraints or triggers
- ✅ Proper foreign key relationships
- ✅ Identity record created and linked
- ✅ No orphaned records
- ✅ Correct permissions on auth schema

### 4. Environment Configuration
```bash
SUPABASE_URL='https://dpnvqzrchxudbmxlofii.supabase.co'
SUPABASE_ANON_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'  # Valid and matches database
ADMIN_JWT_SECRET='admin-jwt-secret-for-development-only-change-in-production'
```

## Code Changes Made

### 1. Fixed Admin Route SQL Queries
- Changed from querying non-existent `user_admin_status` columns to using `public.is_admin()` function
- Updated both `/v1/admin/auth/exchange` and `/v1/admin/auth/login` endpoints

### 2. Fixed Migration Script
- Updated 999_test_admin_user_setup_SAFE.sql to handle instance_id properly
- Added logic to create instance if none exists
- Made migration reusable for multiple users

## Hypothesis

The issue appears to be a mismatch between how the password is encrypted in the database versus what Supabase Auth expects. Possible causes:

1. **Encryption Salt Issue** - The `gen_salt('bf')` might be using different parameters than Supabase's internal implementation
2. **Schema Namespace** - Need to use `extensions.crypt()` instead of plain `crypt()`
3. **Supabase Internal State** - Supabase Auth might cache or track additional state beyond the database
4. **Password Format** - Special characters in password might need different handling

## Recommendations for Expert Review

### Immediate Actions
1. **Try creating user through Supabase Dashboard UI** - This ensures correct password format
2. **Check Supabase Auth logs** - Look for detailed error messages in Supabase dashboard
3. **Test with simple password** - Use `Test123456` to rule out special character issues
4. **Verify bcrypt cost factor** - Supabase might use specific cost factor for `gen_salt('bf')`

### Questions for Investigation
1. Does Supabase maintain internal auth state outside the database?
2. Is there a specific bcrypt configuration Supabase expects?
3. Are there additional tables or fields Supabase checks during authentication?
4. Is the `extensions` schema required for password functions?

### Alternative Solutions
1. **Use Supabase Management API** with service role key (attempted but failed with "Database error")
2. **Create user through Supabase Dashboard** and copy encrypted_password
3. **Use different authentication method** (OAuth, magic link)
4. **Implement custom JWT authentication** bypassing Supabase Auth

## Files for Reference

1. **Backend Route:** `/src/routes/adminAuth.ts`
2. **Migration:** `/migrations/999_test_admin_user_setup_SAFE.sql`
3. **Test Scripts:** 
   - `/test_supabase.js` - Direct Supabase auth test
   - `/create_admin_user.js` - Admin API user creation attempt
4. **Environment:** `/.env` (contains Supabase configuration)

## Next Steps

1. ⏳ Await expert review of this diagnostic report
2. ⏳ Try creating user through Supabase Dashboard UI
3. ⏳ Check Supabase service health/status
4. ⏳ Review Supabase Auth logs for detailed errors
5. ⏳ Consider implementing fallback authentication method

## Contact Information

- **Supabase Project:** dpnvqzrchxudbmxlofii
- **Region:** Not specified (check Supabase dashboard)
- **Auth Version:** Using @supabase/supabase-js@2.x

---

*This report documents all troubleshooting steps taken and provides a comprehensive overview for expert assistance.*