#!/usr/bin/env ts-node

import * as dotenv from 'dotenv';
import { createKVNamespace } from '../src/services/cloudflareKV';
import { createPagesProject } from '../src/services/cloudflarePages';
import { createR2Bucket } from '../src/services/cloudflareR2';
import { Pool } from 'pg';
import * as fs from 'fs/promises';
import * as path from 'path';

dotenv.config();

async function runDatabaseMigration() {
  console.log('🔧 Running database migration...');
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    const migrationPath = path.join(__dirname, '../src/db/migrations/001_create_project_versions.sql');
    const migrationSQL = await fs.readFile(migrationPath, 'utf8');
    
    await pool.query(migrationSQL);
    console.log('✅ Database migration completed');
  } catch (error) {
    console.error('❌ Database migration failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

async function setupCloudflareKV() {
  console.log('🔧 Setting up Cloudflare KV namespace...');
  
  if (process.env.CF_KV_NAMESPACE_ID) {
    console.log('✅ KV namespace already configured');
    return;
  }

  const namespaceId = await createKVNamespace('claude-builder-versions');
  if (namespaceId) {
    console.log('✅ KV namespace created:', namespaceId);
    console.log('⚠️  Please add this to your .env file:');
    console.log(`CF_KV_NAMESPACE_ID=${namespaceId}`);
  } else {
    console.error('❌ Failed to create KV namespace');
  }
}

async function setupCloudflarePages() {
  console.log('🔧 Setting up Cloudflare Pages project...');
  
  const success = await createPagesProject();
  if (success) {
    console.log('✅ Pages project ready');
  } else {
    console.error('❌ Failed to setup Pages project');
  }
}

async function setupR2Bucket() {
  console.log('🔧 Setting up R2 bucket for artifacts...');
  
  const success = await createR2Bucket();
  if (success) {
    console.log('✅ R2 bucket ready');
  } else {
    console.error('❌ Failed to setup R2 bucket');
  }
}

async function checkRedis() {
  console.log('🔧 Checking Redis connection...');
  
  try {
    const { execSync } = require('child_process');
    const result = execSync('redis-cli ping', { encoding: 'utf8' });
    
    if (result.trim() === 'PONG') {
      console.log('✅ Redis is running');
    } else {
      console.error('❌ Redis is not responding correctly');
    }
  } catch (error) {
    console.error('❌ Redis is not running. Please install and start Redis:');
    console.log('   sudo apt-get install redis-server');
    console.log('   sudo systemctl start redis');
  }
}

async function main() {
  console.log('🚀 Claude Builder Setup Script');
  console.log('==============================\n');

  try {
    // Check environment variables
    const requiredEnvVars = [
      'SHARED_SECRET',
      'DATABASE_URL',
      'CF_ACCOUNT_ID',
      'CF_API_TOKEN_WORKERS',
    ];

    const missingVars = requiredEnvVars.filter(v => !process.env[v]);
    if (missingVars.length > 0) {
      console.error('❌ Missing required environment variables:', missingVars.join(', '));
      console.log('Please copy .env.example to .env and fill in the values');
      process.exit(1);
    }

    // Run setup steps
    await checkRedis();
    await runDatabaseMigration();
    await setupCloudflareKV();
    await setupCloudflarePages();
    await setupR2Bucket();

    console.log('\n✅ Setup completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Update your .env file with any new values shown above');
    console.log('2. Run: npm install');
    console.log('3. Run: npm run build');
    console.log('4. Start the server: npm start');
  } catch (error) {
    console.error('\n❌ Setup failed:', error);
    process.exit(1);
  }
}

// Run setup
main();