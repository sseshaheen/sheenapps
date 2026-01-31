# Admin Management Scripts

## Unified Admin Management (`manage-admins.ts`)

A comprehensive script for managing admin users in the SheenApps Claude Worker system.

### Features

- **Complete admin lifecycle management** - Create, update, elevate, demote, and remove admin users
- **Permission management** - Add or remove specific permissions for granular access control
- **Password management** - Reset passwords with validation
- **Bulk operations** - Clean up test accounts or set up default admin structure
- **Golden path authentication** - Ensures admins can authenticate properly with Supabase
- **Interactive confirmations** - Protects against accidental deletions

### Installation

```bash
# Ensure dependencies are installed
npm install

# Make script executable (optional)
chmod +x scripts/manage-admins.ts
```

### Usage

```bash
# List all admin users
npx ts-node scripts/manage-admins.ts list

# Create new admin user
npx ts-node scripts/manage-admins.ts create <email> <password> [role]

# Elevate admin to super_admin
npx ts-node scripts/manage-admins.ts elevate <email>

# Demote super_admin to regular admin
npx ts-node scripts/manage-admins.ts demote <email>

# Remove admin user
npx ts-node scripts/manage-admins.ts remove <email>

# Reset admin password
npx ts-node scripts/manage-admins.ts reset-password <email> <new-password>

# Manage permissions
npx ts-node scripts/manage-admins.ts permissions <email> [add|remove] <permission>

# Clean up test admins
npx ts-node scripts/manage-admins.ts cleanup

# Set up default admin structure
npx ts-node scripts/manage-admins.ts setup
```

### Examples

#### Create a new super admin
```bash
npx ts-node scripts/manage-admins.ts create john@example.com SecurePass123! super_admin
```

#### Add a specific permission
```bash
npx ts-node scripts/manage-admins.ts permissions support@example.com add admin:refunds
```

#### List all current admins
```bash
npx ts-node scripts/manage-admins.ts list
```

#### Clean up test accounts
```bash
npx ts-node scripts/manage-admins.ts cleanup
# This removes all admin[0-9]+@, test*@, and demo*@ accounts
```

#### Set up default hierarchy
```bash
npx ts-node scripts/manage-admins.ts setup
# Creates: superadmin@, admin@, and support@ with appropriate permissions
```

### Admin Role Hierarchy

| Role | Permissions | Can Do |
|------|------------|--------|
| **super_admin** | `admin:*`, `super_admin:*` | Everything including creating/removing other admins |
| **admin** | `admin:*` | All admin operations except admin management |
| **admin (limited)** | Custom permissions | Only specific operations (e.g., `admin:users`, `admin:support`) |

### Available Permissions

- `admin:*` - Full admin access (except admin management)
- `super_admin:*` - Admin management capabilities
- `admin:users` - User management
- `admin:support` - Support operations
- `admin:advisors` - Advisor management
- `admin:refunds` - Process refunds
- `admin:elevated` - Elevated operations

### Password Requirements

Passwords must meet these criteria:
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number

### Security Notes

1. **Golden Path Process**: The script implements a multi-step process to ensure Supabase authentication works properly
2. **Interactive Confirmations**: Destructive operations require confirmation
3. **Audit Trail**: All operations include metadata (created_by, updated_at, etc.)
4. **Permission Validation**: Wildcard permissions (`admin:*`) are properly handled

### Troubleshooting

#### "User already registered" error
The script will prompt to update the existing user. Choose 'y' to update their role and permissions.

#### Authentication fails after creation
The script implements the "golden path" with delays to ensure proper propagation. If issues persist, wait 30 seconds and try authenticating again.

#### Cannot create certain emails
Some emails (like `admin@sheenapps.com`) may have database constraints. Use alternative emails like `adminuser@sheenapps.com`.

### Legacy Scripts (Deprecated)

The following individual scripts are now consolidated into `manage-admins.ts`:
- `create-admin-complete.ts` → use `manage-admins.ts create`
- `make-regular-admin.ts` → use `manage-admins.ts create` with admin role
- `make-super-admin.ts` → use `manage-admins.ts elevate`
- `cleanup-and-setup-admins.ts` → use `manage-admins.ts cleanup` and `setup`

### Environment Requirements

Required environment variables in `.env`:
```
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### Best Practices

1. **Always use the unified script** for consistency
2. **Change default passwords** immediately after setup
3. **Use specific permissions** for support staff instead of full `admin:*`
4. **Regular cleanup** of test accounts in development
5. **Audit admin actions** through the admin panel for compliance