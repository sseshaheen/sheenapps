import { pool } from '../src/services/database';

async function checkTables() {
  if (!pool) {
    console.error('No database connection');
    return;
  }

  try {
    // Check what schema we're in
    const schemaResult = await pool.query('SELECT current_schema()');
    console.log('Current schema:', schemaResult.rows[0].current_schema);

    // Check all tables in public schema
    const tablesResult = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log('\nTables in public schema:');
    tablesResult.rows.forEach(row => console.log(`  - ${row.table_name}`));

    // Check project_deployment_metrics specifically
    const deploymentMetricsExists = tablesResult.rows.some(
      row => row.table_name === 'project_deployment_metrics'
    );

    console.log(`\nproject_deployment_metrics table exists: ${deploymentMetricsExists}`);

    // Check constraints on project_deployment_metrics if it exists
    if (deploymentMetricsExists) {
      const constraintsResult = await pool.query(`
        SELECT constraint_name, constraint_type
        FROM information_schema.table_constraints
        WHERE table_name = 'project_deployment_metrics'
        AND table_schema = 'public'
      `);

      console.log('\nConstraints on project_deployment_metrics:');
      constraintsResult.rows.forEach(row =>
        console.log(`  - ${row.constraint_name} (${row.constraint_type})`)
      );
    }

  } catch (error) {
    console.error('Error checking tables:', error);
  } finally {
    await pool.end();
  }
}

checkTables();
