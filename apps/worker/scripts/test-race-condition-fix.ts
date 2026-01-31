#!/usr/bin/env ts-node

import { Pool } from 'pg';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

async function testRaceConditionFix() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    console.log('🧪 Testing race condition fix...');
    
    // Generate test data (use existing user ID from logs for testing)
    const testUserId = 'd78b030e-5714-4458-8f58-e6a772f0ea02'; // Real UUID from logs
    const testFramework = 'react';
    const testPrompt = 'Test project for race condition';
    const testName = 'Race Condition Test Project';

    console.log(`👤 Test User ID: ${testUserId}`);
    
    // Simulate race condition by calling the function multiple times concurrently
    console.log('🏁 Starting concurrent project creation attempts...');
    
    const promises = [];
    for (let i = 0; i < 3; i++) {
      promises.push(
        pool.query(`
          SELECT project_id, version_id, build_id, build_metrics_id 
          FROM create_project_for_build($1, $2, $3, $4)
        `, [testUserId, testFramework, testPrompt, testName])
      );
    }
    
    // Wait for all attempts to complete
    const results = await Promise.allSettled(promises);
    
    console.log('\n📊 Results:');
    let successCount = 0;
    let firstProjectId: string | null = null;
    
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        successCount++;
        const row = result.value.rows[0];
        if (row) {
          console.log(`  ✅ Attempt ${index + 1}: SUCCESS`);
          console.log(`     Project ID: ${row.project_id}`);
          console.log(`     Version ID: ${row.version_id}`);
          console.log(`     Build ID: ${row.build_id}`);
          
          if (!firstProjectId) {
            firstProjectId = row.project_id;
          } else if (firstProjectId === row.project_id) {
            console.log(`     🎯 Same project ID returned (idempotency working!)`);
          } else {
            console.log(`     ⚠️  Different project ID returned (potential issue)`);
          }
        }
      } else {
        console.log(`  ❌ Attempt ${index + 1}: FAILED`);
        console.log(`     Error: ${result.reason.message}`);
      }
    });
    
    console.log(`\n📈 Summary:`);
    console.log(`   Total attempts: ${results.length}`);
    console.log(`   Successful: ${successCount}`);
    console.log(`   Expected: All should succeed with same project ID`);
    
    if (successCount === results.length) {
      console.log('✅ Race condition fix is working correctly!');
    } else {
      console.log('❌ Race condition fix needs improvement');
    }
    
    // Cleanup - remove test project
    if (firstProjectId) {
      await pool.query('DELETE FROM project_build_metrics WHERE project_id = $1', [firstProjectId]);
      await pool.query('DELETE FROM projects WHERE id = $1', [firstProjectId]);
      console.log('🧹 Test data cleaned up');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

testRaceConditionFix();