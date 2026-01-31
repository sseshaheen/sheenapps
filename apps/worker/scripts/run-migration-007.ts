import { pool } from '../src/services/database';
import fs from 'fs';
import path from 'path';

async function runMigration() {
  if (!pool) {
    console.error('No database connection');
    return;
  }
  
  try {
    const sqlPath = path.join(__dirname, '..', 'migrations', '007_fix_project_metrics_summary.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    await pool.query(sql);
    console.log('Migration 007 applied successfully');
    
    // Now update the existing build's summary
    const buildId = '01K10XSRZBGDSDP8W5TQ2483EP';
    console.log(`Updating summary for build ${buildId}...`);
    await pool.query('SELECT update_project_metrics_summary($1)', [buildId]);
    console.log('Summary updated successfully');
    
    // Check the updated summary
    const result = await pool.query(`
      SELECT * FROM project_metrics_summary 
      WHERE project_id = 'my-app' 
      ORDER BY date DESC 
      LIMIT 1
    `);
    
    if (result.rows.length > 0) {
      console.log('\nUpdated summary:');
      console.log(JSON.stringify(result.rows[0], null, 2));
    }
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await pool.end();
  }
}

runMigration();