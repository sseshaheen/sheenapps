import { pool } from '../src/services/database';

async function debugMetricsData() {
  if (!pool) {
    console.error('No database connection');
    return;
  }

  try {
    const buildId = '01K10XSRZBGDSDP8W5TQ2483EP';

    // Check build metrics
    console.log('\n=== Build Metrics ===');
    const buildResult = await pool.query(`
      SELECT * FROM project_build_metrics WHERE build_id = $1
    `, [buildId]);
    console.log(JSON.stringify(buildResult.rows[0], null, 2));

    // Check Claude session metrics
    console.log('\n=== Claude Session Metrics ===');
    const claudeResult = await pool.query(`
      SELECT * FROM project_ai_session_metrics WHERE build_id = $1
    `, [buildId]);
    console.log(`Found ${claudeResult.rows.length} Claude sessions`);
    if (claudeResult.rows.length > 0) {
      console.log(JSON.stringify(claudeResult.rows[0], null, 2));
    }

    // Check deployment metrics
    console.log('\n=== Deployment Metrics ===');
    const deployResult = await pool.query(`
      SELECT * FROM project_deployment_metrics WHERE build_id = $1
    `, [buildId]);
    console.log(`Found ${deployResult.rows.length} deployment records`);
    if (deployResult.rows.length > 0) {
      console.log(JSON.stringify(deployResult.rows[0], null, 2));
    }

    // Check if there are any Claude sessions with different prompt types
    console.log('\n=== All Claude Sessions by Type ===');
    const allClaudeResult = await pool.query(`
      SELECT prompt_type, COUNT(*) as count
      FROM project_ai_session_metrics
      WHERE build_id = $1
      GROUP BY prompt_type
    `, [buildId]);
    console.table(allClaudeResult.rows);

  } catch (error) {
    console.error('Error debugging metrics:', error);
  } finally {
    await pool.end();
  }
}

debugMetricsData();
