# Test User Creation Guide

## ⚠️ IMPORTANT: Use Script Instead of Manual Creation

**TL;DR**: Run the script instead of manual Supabase dashboard creation to avoid auth issues.

```bash
# Recommended approach
ts-node scripts/create-test-users.ts
```

## Why Use the Script?

### 🚨 Known Issues with Manual Dashboard Creation

Based on previous struggles with Supabase admin user creation, manual creation through the dashboard can cause:

1. **Authentication Issues**: Users created manually may not follow the proper "golden path" for auth
2. **Metadata Problems**: Admin users need specific `app_metadata` structure that's hard to set manually
3. **Password Sync Issues**: Manual creation sometimes has password sync problems
4. **Missing Permissions**: Admin users need proper role and permission setup

### ✅ Script Advantages

The script follows the proven patterns from `manage-admins.ts`:

- **Proper Auth Flow**: Uses `admin.auth.admin.createUser()` with service role
- **Auto-Confirm**: Sets `email_confirm: true` automatically  
- **Golden Path**: Implements the multi-step auth process with proper delays
- **Correct Metadata**: Sets proper `app_metadata` for admin users
- **Password Sync**: Ensures passwords work correctly with multiple sync steps

## Test Users Created

The script creates these 4 users:

| User Type | Email | Password | Purpose |
|-----------|-------|----------|---------|
| Client (Stripe) | `client+stripe@test.sheenapps.ai` | `SmokeTest123!` | Stripe payment testing |
| Client (Paymob) | `client+paymob@test.sheenapps.ai` | `SmokeTest123!` | Egypt/Paymob testing |
| Advisor | `advisor@test.sheenapps.ai` | `SmokeTest123!` | Advisor network testing |
| Admin | `admin@test.sheenapps.ai` | `SmokeTest123!` | Admin panel testing |

## Running the Script

### Prerequisites

```bash
# Ensure environment variables are set
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### Execution

```bash
cd /path/to/sheenapps-claude-worker
ts-node scripts/create-test-users.ts
```

### Expected Output

```
🧪 Creating Test Users for Frontend Team
========================================

🚀 Creating Main Test Client (Stripe)...
   Step 1: Creating user...
   ✅ User created with ID: 12345...
   Step 2: Applying authentication golden path...
   ✅ Main Test Client (Stripe) created successfully!

[... similar for other users ...]

📊 Summary
==========
✅ Successfully created: 4 users
🎯 Test Users Ready for Frontend Testing
```

## Manual Dashboard Method (NOT Recommended)

If you must use the dashboard (not recommended), follow these steps with extra caution:

### Potential Issues to Watch For

1. **Admin User Problems**: 
   - Dashboard-created admin users may not have proper `app_metadata`
   - May require additional script run to fix permissions

2. **Auth Flow Issues**:
   - Users might not be properly confirmed
   - Password issues may occur

3. **Missing Test Metadata**:
   - No `test_user: true` flag for cleanup
   - Missing provider-specific metadata

### If Manual Creation Is Required

1. Go to https://supabase.com/dashboard
2. Select your SheenApps project  
3. Authentication → Users → Add user
4. For each user:
   - ✅ Check "Auto Confirm User"
   - Use exact emails and passwords from table above
   - **For admin user**: You'll need to run a follow-up script to set proper metadata

### Manual Admin Fix (if needed)

If you created the admin manually, run:

```bash
ts-node scripts/manage-admins.ts elevate admin@test.sheenapps.ai
```

## Verification

After creation, verify users in Supabase dashboard:

1. All users should show "Confirmed" status
2. Admin user should have proper `app_metadata` with `role: "admin"`
3. Test login with each user to ensure auth works

## Cleanup (Future)

To remove test users later:

```bash
# Remove users (script to be created when needed)
ts-node scripts/cleanup-test-users.ts
```

## Best Practices

1. **Always use scripts** for user creation in production environments
2. **Test the auth flow** after user creation
3. **Document any manual steps** that need script automation
4. **Follow the manage-admins.ts patterns** for any new user creation scripts

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "User already registered" | Script handles this gracefully - safe to re-run |
| Admin login fails | Run `manage-admins.ts elevate` command |
| Password doesn't work | Re-run script - it includes password sync steps |
| Missing metadata | Script sets proper metadata - check Supabase dashboard |

---

**Remember**: The script is battle-tested and follows the same patterns that resolved previous Supabase admin creation issues.