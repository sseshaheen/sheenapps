#!/usr/bin/env ts-node
/**
 * Unified Admin Management Script
 * Handles all admin user operations: create, elevate, list, remove
 * 
 * Usage:
 *   ts-node scripts/manage-admins.ts list
 *   ts-node scripts/manage-admins.ts create <email> <password> [role]
 *   ts-node scripts/manage-admins.ts elevate <email>
 *   ts-node scripts/manage-admins.ts demote <email>
 *   ts-node scripts/manage-admins.ts remove <email>
 *   ts-node scripts/manage-admins.ts reset-password <email> <new-password>
 *   ts-node scripts/manage-admins.ts permissions <email> [add|remove] <permission>
 *   ts-node scripts/manage-admins.ts cleanup
 *   ts-node scripts/manage-admins.ts setup
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as readline from 'readline';

// Load environment variables
dotenv.config();

const url = process.env.SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Validation
if (!url || !serviceKey) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

const admin = createClient(url, serviceKey);

// Helper functions
async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password: string): boolean {
  return password.length >= 8 && 
         /[A-Z]/.test(password) && 
         /[a-z]/.test(password) && 
         /[0-9]/.test(password);
}

async function promptUser(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question + ' (y/n): ', (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

// Command implementations
async function listAdmins() {
  console.log('📋 Listing all admin users...\n');
  
  const { data: users, error } = await admin.auth.admin.listUsers();
  
  if (error) {
    console.error('❌ Failed to list users:', error.message);
    process.exit(1);
  }

  const admins = users?.users?.filter(u => u.app_metadata?.is_admin === true) || [];
  
  if (admins.length === 0) {
    console.log('No admin users found.');
    return;
  }

  console.log(`Found ${admins.length} admin user(s):\n`);
  
  admins.forEach(user => {
    const role = user.app_metadata?.role || 'unknown';
    const permissions = user.app_metadata?.admin_permissions || [];
    
    console.log(`👤 ${user.email}`);
    console.log(`   ID: ${user.id}`);
    console.log(`   Role: ${role}`);
    console.log(`   Permissions: ${permissions.join(', ') || 'none'}`);
    console.log(`   Created: ${new Date(user.created_at).toLocaleString()}`);
    console.log(`   Last Sign In: ${user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString() : 'Never'}`);
    console.log('');
  });
}

async function createAdmin(email: string, password: string, role: string = 'admin') {
  console.log(`🚀 Creating ${role} user: ${email}\n`);

  if (!validateEmail(email)) {
    console.error('❌ Invalid email format');
    process.exit(1);
  }

  if (!validatePassword(password)) {
    console.error('❌ Password must be at least 8 characters with uppercase, lowercase, and numbers');
    process.exit(1);
  }

  const validRoles = ['admin', 'super_admin'];
  if (!validRoles.includes(role)) {
    console.error(`❌ Invalid role. Must be one of: ${validRoles.join(', ')}`);
    process.exit(1);
  }

  // Set permissions based on role
  const permissions = role === 'super_admin' 
    ? ['admin:*', 'super_admin:*']
    : ['admin:*'];

  try {
    // Step 1: Create user with metadata
    console.log('Step 1: Creating user...');
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: email.toLowerCase().trim(),
      password,
      email_confirm: true,
      app_metadata: {
        role,
        is_admin: true,
        admin_permissions: permissions,
        created_by: 'manage-admins-script',
        created_at: new Date().toISOString()
      }
    });

    if (createError) {
      if (createError.message === 'User already registered') {
        console.error('❌ User already exists');
        const confirm = await promptUser('Would you like to update the existing user?');
        if (confirm) {
          await updateExistingAdmin(email, password, role, permissions);
        }
        return;
      }
      throw createError;
    }

    const userId = created.user.id;
    console.log(`✅ User created with ID: ${userId}`);

    // Step 2: Apply golden path
    console.log('Step 2: Applying golden path for authentication...');
    await sleep(1000);
    
    await admin.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true
    });
    
    await sleep(1000);
    
    // Final password sync
    await admin.auth.admin.updateUserById(userId, {
      password
    });

    console.log('\n✅ Admin user created successfully!');
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${password}`);
    console.log(`   Role: ${role}`);
    console.log(`   Permissions: ${permissions.join(', ')}`);
    
  } catch (error) {
    console.error('❌ Failed to create admin:', error);
    process.exit(1);
  }
}

async function updateExistingAdmin(email: string, password: string, role: string, permissions: string[]) {
  const { data: users } = await admin.auth.admin.listUsers();
  const user = users?.users?.find(u => u.email === email.toLowerCase().trim());
  
  if (!user) {
    console.error('❌ User not found');
    return;
  }

  console.log(`Updating existing user ${email}...`);
  
  const { error } = await admin.auth.admin.updateUserById(user.id, {
    password,
    email_confirm: true,
    app_metadata: {
      ...user.app_metadata,
      role,
      is_admin: true,
      admin_permissions: permissions,
      updated_at: new Date().toISOString(),
      updated_by: 'manage-admins-script'
    }
  });

  if (error) {
    console.error('❌ Failed to update user:', error.message);
    process.exit(1);
  }

  console.log('✅ User updated successfully');
}

async function elevateToSuperAdmin(email: string) {
  console.log(`🎖️  Elevating ${email} to super_admin...\n`);
  
  const { data: users } = await admin.auth.admin.listUsers();
  const user = users?.users?.find(u => u.email === email.toLowerCase().trim());
  
  if (!user) {
    console.error('❌ User not found');
    process.exit(1);
  }

  if (user.app_metadata?.role === 'super_admin') {
    console.log('✅ User is already a super_admin');
    return;
  }

  const { error } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: {
      ...user.app_metadata,
      role: 'super_admin',
      is_admin: true,
      admin_permissions: ['admin:*', 'super_admin:*'],
      elevated_at: new Date().toISOString(),
      elevated_by: 'manage-admins-script'
    }
  });

  if (error) {
    console.error('❌ Failed to elevate user:', error.message);
    process.exit(1);
  }

  console.log('✅ User elevated to super_admin successfully');
}

async function demoteAdmin(email: string) {
  console.log(`⬇️  Demoting ${email} to regular admin...\n`);
  
  const { data: users } = await admin.auth.admin.listUsers();
  const user = users?.users?.find(u => u.email === email.toLowerCase().trim());
  
  if (!user) {
    console.error('❌ User not found');
    process.exit(1);
  }

  if (user.app_metadata?.role !== 'super_admin') {
    console.log('ℹ️  User is not a super_admin');
    return;
  }

  const { error } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: {
      ...user.app_metadata,
      role: 'admin',
      admin_permissions: ['admin:*'],
      demoted_at: new Date().toISOString(),
      demoted_by: 'manage-admins-script'
    }
  });

  if (error) {
    console.error('❌ Failed to demote user:', error.message);
    process.exit(1);
  }

  console.log('✅ User demoted to regular admin successfully');
}

async function removeAdmin(email: string) {
  console.log(`🗑️  Removing admin user ${email}...\n`);
  
  const confirm = await promptUser(`Are you sure you want to delete ${email}?`);
  if (!confirm) {
    console.log('Cancelled.');
    return;
  }

  const { data: users } = await admin.auth.admin.listUsers();
  const user = users?.users?.find(u => u.email === email.toLowerCase().trim());
  
  if (!user) {
    console.error('❌ User not found');
    process.exit(1);
  }

  const { error } = await admin.auth.admin.deleteUser(user.id);
  
  if (error) {
    console.error('❌ Failed to delete user:', error.message);
    process.exit(1);
  }

  console.log('✅ User deleted successfully');
}

async function resetPassword(email: string, newPassword: string) {
  console.log(`🔐 Resetting password for ${email}...\n`);

  if (!validatePassword(newPassword)) {
    console.error('❌ Password must be at least 8 characters with uppercase, lowercase, and numbers');
    process.exit(1);
  }

  const { data: users } = await admin.auth.admin.listUsers();
  const user = users?.users?.find(u => u.email === email.toLowerCase().trim());
  
  if (!user) {
    console.error('❌ User not found');
    process.exit(1);
  }

  const { error } = await admin.auth.admin.updateUserById(user.id, {
    password: newPassword
  });

  if (error) {
    console.error('❌ Failed to reset password:', error.message);
    process.exit(1);
  }

  console.log('✅ Password reset successfully');
  console.log(`   New password: ${newPassword}`);
}

async function managePermissions(email: string, action: string, permission: string) {
  console.log(`🔧 ${action === 'add' ? 'Adding' : 'Removing'} permission "${permission}" for ${email}...\n`);

  const { data: users } = await admin.auth.admin.listUsers();
  const user = users?.users?.find(u => u.email === email.toLowerCase().trim());
  
  if (!user) {
    console.error('❌ User not found');
    process.exit(1);
  }

  let permissions = user.app_metadata?.admin_permissions || [];

  if (action === 'add') {
    if (!permissions.includes(permission)) {
      permissions.push(permission);
    } else {
      console.log('ℹ️  Permission already exists');
      return;
    }
  } else if (action === 'remove') {
    permissions = permissions.filter((p: string) => p !== permission);
  } else {
    console.error('❌ Invalid action. Use "add" or "remove"');
    process.exit(1);
  }

  const { error } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: {
      ...user.app_metadata,
      admin_permissions: permissions,
      permissions_updated_at: new Date().toISOString(),
      permissions_updated_by: 'manage-admins-script'
    }
  });

  if (error) {
    console.error('❌ Failed to update permissions:', error.message);
    process.exit(1);
  }

  console.log(`✅ Permission ${action === 'add' ? 'added' : 'removed'} successfully`);
  console.log(`   Current permissions: ${permissions.join(', ') || 'none'}`);
}

async function cleanupTestAdmins() {
  console.log('🧹 Cleaning up test admin users...\n');

  const testPatterns = [
    /^admin\d+@sheenapps\.com$/,  // admin5, admin6, etc.
    /^test.*@sheenapps\.com$/,     // test*, testadmin*, etc.
    /^demo.*@sheenapps\.com$/      // demo*, demoadmin*, etc.
  ];

  const { data: users } = await admin.auth.admin.listUsers();
  const testAdmins = users?.users?.filter(u => {
    const email = u.email || '';
    return testPatterns.some(pattern => pattern.test(email));
  }) || [];

  if (testAdmins.length === 0) {
    console.log('No test admin users found.');
    return;
  }

  console.log(`Found ${testAdmins.length} test admin user(s) to remove:`);
  testAdmins.forEach(u => console.log(`  - ${u.email}`));
  console.log('');

  const confirm = await promptUser('Proceed with cleanup?');
  if (!confirm) {
    console.log('Cleanup cancelled.');
    return;
  }

  for (const user of testAdmins) {
    console.log(`Removing ${user.email}...`);
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) {
      console.log(`  ⚠️  Failed: ${error.message}`);
    } else {
      console.log(`  ✅ Removed`);
    }
  }

  console.log('\n✅ Cleanup complete');
}

async function setupDefaultAdmins() {
  console.log('🏗️  Setting up default admin structure...\n');

  const defaultAdmins = [
    {
      email: 'superadmin@sheenapps.com',
      password: 'SuperAdmin2025!',
      role: 'super_admin',
      permissions: ['admin:*', 'super_admin:*']
    },
    {
      email: 'admin@sheenapps.com',
      password: 'AdminUser2025!',
      role: 'admin',
      permissions: ['admin:*']
    },
    {
      email: 'support@sheenapps.com',
      password: 'Support2025!',
      role: 'admin',
      permissions: ['admin:users', 'admin:support']
    }
  ];

  console.log('This will create the following admin users:');
  defaultAdmins.forEach(a => {
    console.log(`  - ${a.email} (${a.role})`);
  });
  console.log('');

  const confirm = await promptUser('Proceed with setup?');
  if (!confirm) {
    console.log('Setup cancelled.');
    return;
  }

  for (const adminConfig of defaultAdmins) {
    await createAdmin(adminConfig.email, adminConfig.password, adminConfig.role);
    console.log('');
  }

  console.log('\n' + '='.repeat(60));
  console.log('📋 DEFAULT ADMIN SETUP COMPLETE');
  console.log('='.repeat(60));
  console.log('\n⚠️  IMPORTANT: Change these passwords immediately!');
}

// Main command handler
async function main() {
  const command = process.argv[2];
  const args = process.argv.slice(3);

  switch (command) {
    case 'list':
      await listAdmins();
      break;

    case 'create':
      if (args.length < 2) {
        console.error('Usage: manage-admins.ts create <email> <password> [role]');
        process.exit(1);
      }
      await createAdmin(args[0], args[1], args[2]);
      break;

    case 'elevate':
      if (args.length < 1) {
        console.error('Usage: manage-admins.ts elevate <email>');
        process.exit(1);
      }
      await elevateToSuperAdmin(args[0]);
      break;

    case 'demote':
      if (args.length < 1) {
        console.error('Usage: manage-admins.ts demote <email>');
        process.exit(1);
      }
      await demoteAdmin(args[0]);
      break;

    case 'remove':
      if (args.length < 1) {
        console.error('Usage: manage-admins.ts remove <email>');
        process.exit(1);
      }
      await removeAdmin(args[0]);
      break;

    case 'reset-password':
      if (args.length < 2) {
        console.error('Usage: manage-admins.ts reset-password <email> <new-password>');
        process.exit(1);
      }
      await resetPassword(args[0], args[1]);
      break;

    case 'permissions':
      if (args.length < 3) {
        console.error('Usage: manage-admins.ts permissions <email> [add|remove] <permission>');
        process.exit(1);
      }
      await managePermissions(args[0], args[1], args[2]);
      break;

    case 'cleanup':
      await cleanupTestAdmins();
      break;

    case 'setup':
      await setupDefaultAdmins();
      break;

    default:
      console.log('📖 Admin Management Script\n');
      console.log('Commands:');
      console.log('  list                     - List all admin users');
      console.log('  create <email> <pass> [role] - Create new admin (role: admin|super_admin)');
      console.log('  elevate <email>          - Elevate admin to super_admin');
      console.log('  demote <email>           - Demote super_admin to regular admin');
      console.log('  remove <email>           - Delete admin user');
      console.log('  reset-password <email> <pass> - Reset admin password');
      console.log('  permissions <email> add|remove <perm> - Manage permissions');
      console.log('  cleanup                  - Remove all test admin accounts');
      console.log('  setup                    - Create default admin structure');
      console.log('\nExamples:');
      console.log('  ts-node scripts/manage-admins.ts list');
      console.log('  ts-node scripts/manage-admins.ts create john@example.com Pass123! super_admin');
      console.log('  ts-node scripts/manage-admins.ts permissions john@example.com add admin:refunds');
      console.log('  ts-node scripts/manage-admins.ts cleanup');
      process.exit(0);
  }
}

// Run the script
main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});