#!/usr/bin/env ts-node

import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

async function runMigration() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    console.log('🔄 Running Migration 006: Fix project creation race condition...');
    
    // Read migration file
    const migrationPath = path.join(__dirname, '../migrations/006_fix_project_creation_race_condition.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');
    
    // Execute migration
    await pool.query(migrationSQL);
    
    console.log('✅ Migration 006 completed successfully');
    console.log('📝 The create_project_for_build function is now idempotent and handles race conditions');
    
    // Test the function
    console.log('🧪 Testing the updated function...');
    const testResult = await pool.query(`
      SELECT routine_name, data_type, routine_definition 
      FROM information_schema.routines 
      WHERE routine_name = 'create_project_for_build' 
        AND routine_type = 'FUNCTION'
    `);
    
    if (testResult.rows.length > 0) {
      console.log('✅ Function exists and is ready');
      console.log('   Name:', testResult.rows[0].routine_name);
      console.log('   Type:', testResult.rows[0].data_type);
    } else {
      console.log('❌ Function not found after migration');
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();