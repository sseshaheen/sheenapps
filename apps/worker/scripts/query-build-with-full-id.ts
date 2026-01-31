#!/usr/bin/env ts-node
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.DIRECT_URL;

if (!connectionString) {
  console.error('❌ No database connection string found');
  process.exit(1);
}

async function queryWithFullBuildId() {
  const pool = new Pool({ connectionString });
  const fullBuildId = 'KDJ7PPEK102JQZSYMDB422J86P';
  const shortBuildId = 'KDJ7PPEK';

  console.log('\n=== 1. Query project_build_records (FULL buildId) ===\n');

  try {
    const recordsResult = await pool.query(`
      SELECT *
      FROM project_build_records
      WHERE build_id = $1
      LIMIT 5;
    `, [fullBuildId]);

    if (recordsResult.rows.length > 0) {
      console.log(`✅ Found ${recordsResult.rows.length} records in project_build_records:`);
      console.log(JSON.stringify(recordsResult.rows, null, 2));
    } else {
      console.log('❌ No records found with FULL buildId');
    }
  } catch (err) {
    console.error('Error:', err);
  }

  console.log('\n=== 2. Query project_build_events (FULL buildId) ===\n');

  try {
    const eventsResult = await pool.query(`
      SELECT *
      FROM project_build_events
      WHERE build_id = $1
      ORDER BY created_at ASC
      LIMIT 5;
    `, [fullBuildId]);

    if (eventsResult.rows.length > 0) {
      console.log(`✅ Found ${eventsResult.rows.length} events in project_build_events:`);
      console.table(eventsResult.rows.map(e => ({
        id: e.id,
        event_type: e.event_type,
        message: e.message?.substring(0, 40),
        created_at: new Date(e.created_at).toLocaleString()
      })));

      // Count total
      const countResult = await pool.query(`
        SELECT COUNT(*) as total
        FROM project_build_events
        WHERE build_id = $1;
      `, [fullBuildId]);

      console.log(`\n📊 Total events for this build: ${countResult.rows[0].total}`);
    } else {
      console.log('❌ No events found with FULL buildId');
    }
  } catch (err) {
    console.error('Error:', err);
  }

  console.log('\n=== 3. Query project_build_events (SHORT buildId prefix) ===\n');

  try {
    const shortResult = await pool.query(`
      SELECT build_id, COUNT(*) as count
      FROM project_build_events
      WHERE build_id LIKE $1
      GROUP BY build_id;
    `, [`${shortBuildId}%`]);

    if (shortResult.rows.length > 0) {
      console.log('✅ Found builds matching prefix:');
      console.table(shortResult.rows);
    } else {
      console.log('❌ No builds match the prefix');
    }
  } catch (err) {
    console.error('Error:', err);
  }

  console.log('\n=== 4. Query project_recommendations ===\n');

  try {
    const recsResult = await pool.query(`
      SELECT *
      FROM project_recommendations
      WHERE build_id = $1
      LIMIT 10;
    `, [fullBuildId]);

    if (recsResult.rows.length > 0) {
      console.log(`✅ Found ${recsResult.rows.length} recommendations:`);
      console.table(recsResult.rows.map(r => ({
        id: r.id,
        title: r.title,
        priority: r.priority,
        complexity: r.complexity
      })));
    } else {
      console.log('❌ No recommendations found');
    }
  } catch (err) {
    console.error('Error:', err);
  }

  await pool.end();
}

queryWithFullBuildId().catch(console.error);
