#!/usr/bin/env ts-node
import { createClient } from '@supabase/supabase-js';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

// Check for available connection string env vars
const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.DIRECT_URL;

if (!connectionString) {
  console.error('❌ No database connection string found in env vars.');
  console.error('   Expected one of: DATABASE_URL, POSTGRES_URL, DIRECT_URL');
  process.exit(1);
}

async function investigatePhantomBuild() {
  const projectId = 'a7e7f6d8-16eb-4187-bdc9-e75d6497de06';
  const buildId = 'KDJ7PPEK';

  const pool = new Pool({ connectionString });

  console.log('\n=== 1. Discover Columns in projects Table ===\n');

  try {
    const columnsResult = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'projects'
      ORDER BY ordinal_position;
    `);

    console.table(columnsResult.rows);

    // Extract column names that might contain build info
    const buildRelatedCols = columnsResult.rows
      .filter(r =>
        r.column_name.toLowerCase().includes('build') ||
        r.column_name.toLowerCase().includes('version') ||
        r.column_name.toLowerCase().includes('status') ||
        r.column_name.toLowerCase().includes('current')
      )
      .map(r => r.column_name);

    console.log('\n📊 Build-related columns found:', buildRelatedCols.join(', '));

  } catch (err) {
    console.error('Error discovering columns:', err);
  }

  console.log('\n=== 2. Get Full Project Record ===\n');

  try {
    const projectResult = await pool.query(`
      SELECT *
      FROM projects
      WHERE id = $1;
    `, [projectId]);

    if (projectResult.rows.length > 0) {
      const project = projectResult.rows[0];
      console.log('Project record:');
      console.log(JSON.stringify(project, null, 2));

      // Search for buildId in the record
      const recordStr = JSON.stringify(project).toLowerCase();
      if (recordStr.includes(buildId.toLowerCase())) {
        console.log(`\n✅ Found '${buildId}' in project record!`);

        // Find which field contains it
        for (const [key, value] of Object.entries(project)) {
          if (value && String(value).includes(buildId)) {
            console.log(`   → Found in field: ${key} = ${value}`);
          }
        }
      } else {
        console.log(`\n❌ '${buildId}' NOT found in project record`);
      }
    } else {
      console.log('❌ Project not found');
    }
  } catch (err) {
    console.error('Error querying project:', err);
  }

  console.log('\n=== 3. Find All Tables with "build" in Name ===\n');

  try {
    const tablesResult = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name LIKE '%build%'
      ORDER BY table_name;
    `);

    console.log('Tables with "build" in name:');
    console.table(tablesResult.rows);

    // Try querying each table for the buildId
    for (const row of tablesResult.rows) {
      const tableName = row.table_name;

      try {
        // First check if table has build_id column
        const hasColResult = await pool.query(`
          SELECT column_name
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = $1
            AND column_name = 'build_id';
        `, [tableName]);

        if (hasColResult.rows.length > 0) {
          // Table has build_id column, query it
          const countResult = await pool.query(`
            SELECT COUNT(*) as count
            FROM ${tableName}
            WHERE build_id = $1;
          `, [buildId]);

          const count = parseInt(countResult.rows[0].count);
          if (count > 0) {
            console.log(`\n✅ Found ${count} records in ${tableName}!`);

            // Get sample records
            const sampleResult = await pool.query(`
              SELECT *
              FROM ${tableName}
              WHERE build_id = $1
              LIMIT 3;
            `, [buildId]);

            console.table(sampleResult.rows);
          }
        }
      } catch (err) {
        // Ignore errors for individual tables
      }
    }
  } catch (err) {
    console.error('Error finding tables:', err);
  }

  console.log('\n=== 4. Find All Tables with build_id Column ===\n');

  try {
    const buildIdTablesResult = await pool.query(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name = 'build_id'
      ORDER BY table_name;
    `);

    console.log('Tables with build_id column:');
    console.table(buildIdTablesResult.rows);
  } catch (err) {
    console.error('Error finding build_id columns:', err);
  }

  console.log('\n=== 5. Search JSONB Columns in Chat Messages ===\n');

  try {
    const jsonbResult = await pool.query(`
      SELECT id, seq, message_text, response_data
      FROM project_chat_log_minimal
      WHERE project_id = $1
        AND response_data IS NOT NULL
        AND response_data::text LIKE $2
      LIMIT 5;
    `, [projectId, `%${buildId}%`]);

    if (jsonbResult.rows.length > 0) {
      console.log(`✅ Found buildId in response_data JSONB:`);
      for (const row of jsonbResult.rows) {
        console.log(`\nMessage ${row.id} (seq ${row.seq}):`);
        console.log('Text:', row.message_text?.substring(0, 60));
        console.log('response_data:', JSON.stringify(row.response_data, null, 2));
      }
    } else {
      console.log('❌ No buildId found in response_data columns');
    }
  } catch (err) {
    console.error('Error searching JSONB:', err);
  }

  await pool.end();
}

investigatePhantomBuild().catch(console.error);
