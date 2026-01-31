#!/usr/bin/env ts-node
/**
 * Create Test Users Script
 * Creates test users for frontend team's unit tests and Playwright tests
 * Follows Supabase best practices from manage-admins.ts
 * 
 * Usage:
 *   ts-node scripts/create-test-users.ts
 */

import { createClient } from '@supabase/supabase-js';
import type { AdminUserAttributes } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const url = process.env.SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Validation
if (!url || !serviceKey) {
  console.error('❌ Missing environment variables: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const admin = createClient(url, serviceKey);

// Helper function for delays (following manage-admins.ts pattern)
async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Type definitions for better type safety
interface CreateUserResult {
  success: boolean;
  userId?: string;
  existed?: boolean;
  error?: string;
}

// Test users configuration
const testUsers = [
  {
    email: 'client+stripe@test.sheenapps.ai',
    password: 'SmokeTest123!',
    type: 'client',
    description: 'Main Test Client (Stripe)',
    metadata: {
      payment_provider: 'stripe',
      test_user: true,
      created_by: 'test-users-script'
    }
  },
  {
    email: 'client+paymob@test.sheenapps.ai', 
    password: 'SmokeTest123!',
    type: 'client',
    description: 'Egypt Test Client (Paymob)',
    metadata: {
      payment_provider: 'paymob',
      test_user: true,
      region: 'egypt',
      created_by: 'test-users-script'
    }
  },
  {
    email: 'advisor@test.sheenapps.ai',
    password: 'SmokeTest123!', 
    type: 'advisor',
    description: 'Test Advisor',
    metadata: {
      user_type: 'advisor',
      test_user: true,
      created_by: 'test-users-script'
    }
  },
  {
    email: 'admin@test.sheenapps.ai',
    password: 'SmokeTest123!',
    type: 'admin',
    description: 'Test Admin',
    metadata: {
      role: 'admin',
      is_admin: true,
      admin_permissions: ['admin:*'],
      test_user: true,
      created_by: 'test-users-script'
    }
  }
];

async function createTestUser(userConfig: typeof testUsers[0]): Promise<CreateUserResult> {
  console.log(`\n🚀 Creating ${userConfig.description}...`);
  console.log(`   Email: ${userConfig.email}`);
  
  try {
    // Step 1: Create user with proper metadata (following manage-admins.ts pattern)
    console.log('   Step 1: Creating user...');
    const createUserData: AdminUserAttributes = {
      email: userConfig.email.toLowerCase().trim(),
      password: userConfig.password,
      email_confirm: true, // Auto-confirm as requested
      user_metadata: {
        test_user: true,
        created_for: 'frontend_testing',
        user_type: userConfig.type
      }
    };

    // Add app_metadata for admin users (following manage-admins.ts pattern)
    if (userConfig.type === 'admin') {
      createUserData.app_metadata = {
        role: 'admin',
        is_admin: true,
        admin_permissions: ['admin:*'],
        created_by: 'test-users-script',
        created_at: new Date().toISOString(),
        test_user: true
      };
    }

    const { data: created, error: createError } = await admin.auth.admin.createUser(createUserData);

    if (createError) {
      if (createError.message === 'User already registered') {
        console.log('   ⚠️  User already exists - skipping creation');
        return { success: true, existed: true };
      }
      throw createError;
    }

    const userId = created.user.id;
    console.log(`   ✅ User created with ID: ${userId}`);

    // Step 2: Apply golden path for authentication (following manage-admins.ts pattern)
    console.log('   Step 2: Applying authentication golden path...');
    await sleep(1000);
    
    await admin.auth.admin.updateUserById(userId, {
      password: userConfig.password,
      email_confirm: true
    });
    
    await sleep(1000);
    
    // Final password sync (following manage-admins.ts pattern)
    await admin.auth.admin.updateUserById(userId, {
      password: userConfig.password
    });

    console.log(`   ✅ ${userConfig.description} created successfully!`);
    
    return { success: true, userId, existed: false };
    
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`   ❌ Failed to create ${userConfig.description}:`, errorMessage);
    return { success: false, error: errorMessage };
  }
}

async function main(): Promise<void> {
  console.log('🧪 Creating Test Users for Frontend Team');
  console.log('========================================');
  console.log('Following Supabase best practices from manage-admins.ts');
  console.log('');

  const results = [];
  
  for (const userConfig of testUsers) {
    const result = await createTestUser(userConfig);
    results.push({ 
      ...userConfig, 
      ...result 
    });
    
    // Small delay between user creations
    await sleep(500);
  }

  // Summary
  console.log('\n📊 Summary');
  console.log('==========');
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  const existed = results.filter(r => r.existed);
  
  console.log(`✅ Successfully created: ${successful.length - existed.length} users`);
  if (existed.length > 0) {
    console.log(`⚠️  Already existed: ${existed.length} users`);
  }
  if (failed.length > 0) {
    console.log(`❌ Failed: ${failed.length} users`);
  }

  console.log('\n🎯 Test Users Ready for Frontend Testing');
  console.log('========================================');
  console.log('All users have been auto-confirmed and are ready for use in:');
  console.log('• Unit tests');
  console.log('• Playwright tests'); 
  console.log('• Manual testing');
  console.log('');
  console.log('User Credentials:');
  successful.forEach(user => {
    if (!user.existed) {
      console.log(`• ${user.description}: ${user.email} / ${user.password}`);
    }
  });

  if (failed.length > 0) {
    console.log('\n⚠️  Failed Users:');
    failed.forEach(user => {
      console.log(`• ${user.description}: ${user.error}`);
    });
    process.exit(1);
  }
}

// Run the script
main().catch(error => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});