import { pool } from '../src/services/database';
import fs from 'fs';
import path from 'path';

async function rerunMigration() {
  if (!pool) {
    console.error('No database connection');
    return;
  }
  
  try {
    console.log('Re-running migration 007 to update function with new table names...');
    
    const sqlPath = path.join(__dirname, '..', 'migrations', '007_fix_project_metrics_summary.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    await pool.query(sql);
    
    console.log('Migration 007 re-applied successfully');
    console.log('- Function now uses project_ai_session_metrics instead of claude_session_metrics');
    console.log('- Function now uses project_deployment_metrics instead of deployment_metrics');
    console.log('- Function now uses project_error_metrics instead of error_metrics');
    
    // Test the function
    console.log('\nTesting the updated function...');
    const testBuildId = '01K110BJZCCRZ16GGKRC2D7JW9';
    
    try {
      await pool.query('SELECT update_project_metrics_summary($1)', [testBuildId]);
      console.log('✅ Function executed successfully');
    } catch (err) {
      console.error('❌ Function still has errors:', err);
    }
    
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await pool.end();
  }
}

rerunMigration();