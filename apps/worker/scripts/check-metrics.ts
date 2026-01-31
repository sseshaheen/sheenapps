import { pool } from '../src/services/database';

async function checkMetrics() {
  if (!pool) {
    console.error('No database connection available');
    return;
  }

  try {
    // Check if tables exist
    console.log('\n=== Checking Metrics Tables ===');
    const tables = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_name IN ('project_build_metrics', 'project_ai_session_metrics', 'project_deployment_metrics', 'project_error_metrics', 'project_metrics_summary')
      ORDER BY table_name
    `);

    console.log('Found tables:', tables.rows.map(r => r.table_name));

    // Check row counts
    console.log('\n=== Row Counts ===');
    for (const table of tables.rows) {
      const count = await pool.query(`SELECT COUNT(*) FROM ${table.table_name}`);
      console.log(`${table.table_name}: ${count.rows[0].count} rows`);
    }

    // Check project_build_metrics content
    const builds = await pool.query(`
      SELECT build_id, project_id, status, created_at
      FROM project_build_metrics
      ORDER BY created_at DESC
      LIMIT 5
    `);

    if (builds.rows.length > 0) {
      console.log('\n=== Recent Builds ===');
      console.table(builds.rows);

      // Try to manually update summary for the most recent build
      const latestBuild = builds.rows[0];
      console.log(`\n=== Manually updating summary for build ${latestBuild.build_id} ===`);

      try {
        const result = await pool.query('SELECT update_project_metrics_summary($1)', [latestBuild.build_id]);
        console.log('Update result:', result.rows);

        // Check if summary was created
        const summary = await pool.query(`
          SELECT * FROM project_metrics_summary
          WHERE project_id = $1
          ORDER BY date DESC
          LIMIT 1
        `, [latestBuild.project_id]);

        if (summary.rows.length > 0) {
          console.log('\n=== Project Summary ===');
          console.table(summary.rows);
        } else {
          console.log('No summary found after update');
        }
      } catch (err) {
        console.error('Error updating summary:', err);
      }
    } else {
      console.log('\nNo builds found in project_build_metrics');
    }

  } catch (error) {
    console.error('Error checking metrics:', error);
  } finally {
    await pool.end();
  }
}

checkMetrics().catch(console.error);
