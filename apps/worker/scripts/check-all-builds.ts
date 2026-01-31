import { pool } from '../src/services/database';

async function checkAllBuilds() {
  if (!pool) {
    console.error('No database connection');
    return;
  }

  try {
    // Check ALL builds in project_build_metrics
    console.log('\n=== ALL Builds in project_build_metrics ===');
    const allBuilds = await pool.query(`
      SELECT build_id, project_id, status, created_at
      FROM project_build_metrics
      ORDER BY created_at DESC
    `);
    console.log(`Total builds: ${allBuilds.rows.length}`);
    if (allBuilds.rows.length > 0) {
      console.table(allBuilds.rows);
    } else {
      console.log('No builds found in project_build_metrics table');
    }

    // Check if specific build exists
    const targetBuildId = '01K10XSRZBGDSDP8W5TQ2483EP';
    console.log(`\nChecking for build ${targetBuildId}...`);
    const specificBuild = await pool.query(`
      SELECT * FROM project_build_metrics WHERE build_id = $1
    `, [targetBuildId]);

    if (specificBuild.rows.length > 0) {
      console.log('Build found!');
      console.log(JSON.stringify(specificBuild.rows[0], null, 2));
    } else {
      console.log('Build NOT found in project_build_metrics');

      // Check if it exists in other tables
      console.log('\nChecking other tables...');
      const claudeCheck = await pool.query(`
        SELECT COUNT(*) as count FROM project_ai_session_metrics WHERE build_id = $1
      `, [targetBuildId]);
      console.log(`Claude sessions with this build_id: ${claudeCheck.rows[0].count}`);

      const deployCheck = await pool.query(`
        SELECT COUNT(*) as count FROM project_deployment_metrics WHERE build_id = $1
      `, [targetBuildId]);
      console.log(`Deployment records with this build_id: ${deployCheck.rows[0].count}`);
    }

  } catch (error) {
    console.error('Error checking builds:', error);
  } finally {
    await pool.end();
  }
}

checkAllBuilds();
