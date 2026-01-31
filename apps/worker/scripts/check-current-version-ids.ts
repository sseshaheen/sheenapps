#!/usr/bin/env npx tsx

import { pool } from '../src/services/database';

async function checkCurrentVersionIds() {
  if (!pool) {
    console.error('❌ Database pool not available. Check DATABASE_URL.');
    process.exit(1);
  }

  console.log('🔍 Checking current_version_id status across projects...\n');

  try {
    // Check all projects and their current_version_id status
    const result = await pool.query(`
      SELECT 
        p.id as project_id,
        p.current_version_id,
        p.build_status,
        (SELECT COUNT(*) FROM project_versions pv WHERE pv.project_id = p.id) as version_count,
        (SELECT COUNT(*) FROM project_versions pv WHERE pv.project_id = p.id AND pv.status = 'deployed') as deployed_count,
        (SELECT pv.version_id 
         FROM project_versions pv 
         WHERE pv.project_id = p.id AND pv.status = 'deployed' 
         ORDER BY pv.created_at DESC 
         LIMIT 1
        ) as latest_deployed_version_id
      FROM projects p
      ORDER BY p.created_at DESC
      LIMIT 10
    `);

    console.log('📊 Project Status Summary:');
    console.log('==========================');
    
    let nullCurrentVersions = 0;
    let correctCurrentVersions = 0;
    let incorrectCurrentVersions = 0;
    
    for (const row of result.rows) {
      console.log(`\n📁 Project: ${row.project_id}`);
      console.log(`   Current Version ID: ${row.current_version_id || 'NULL'}`);
      console.log(`   Build Status: ${row.build_status}`);
      console.log(`   Total Versions: ${row.version_count}`);
      console.log(`   Deployed Versions: ${row.deployed_count}`);
      console.log(`   Latest Deployed: ${row.latest_deployed_version_id || 'None'}`);
      
      if (!row.current_version_id) {
        if (row.deployed_count > 0) {
          console.log(`   🔥 ISSUE: Has ${row.deployed_count} deployed versions but current_version_id is NULL`);
          nullCurrentVersions++;
        } else {
          console.log(`   ✅ OK: No deployed versions, NULL current_version_id is correct`);
          correctCurrentVersions++;
        }
      } else if (row.current_version_id === row.latest_deployed_version_id) {
        console.log(`   ✅ OK: current_version_id matches latest deployed version`);
        correctCurrentVersions++;
      } else {
        console.log(`   ⚠️  MISMATCH: current_version_id doesn't match latest deployed version`);
        incorrectCurrentVersions++;
      }
    }
    
    console.log('\n📈 Summary:');
    console.log('===========');
    console.log(`✅ Correct: ${correctCurrentVersions}`);
    console.log(`🔥 NULL but should have version: ${nullCurrentVersions}`);
    console.log(`⚠️  Incorrect version: ${incorrectCurrentVersions}`);
    console.log(`📊 Total projects checked: ${result.rows.length}`);
    
    if (nullCurrentVersions > 0 || incorrectCurrentVersions > 0) {
      console.log('\n💡 Run `npx tsx scripts/repair-project-configs.ts` to fix these issues.');
    } else {
      console.log('\n🎉 All projects have correct current_version_id values!');
    }

  } catch (error) {
    console.error('❌ Error checking project status:', error);
  } finally {
    await pool.end();
  }
}

checkCurrentVersionIds();