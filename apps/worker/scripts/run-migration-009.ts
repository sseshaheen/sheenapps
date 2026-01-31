import { pool } from '../src/services/database';
import fs from 'fs';
import path from 'path';

async function runMigration() {
  if (!pool) {
    console.error('No database connection');
    return;
  }
  
  try {
    const sqlPath = path.join(__dirname, '..', 'migrations', '009_add_primary_key_to_summary.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    await pool.query(sql);
    console.log('Migration 009 applied successfully');
    console.log('- Added id column as primary key to project_metrics_summary');
    console.log('- Existing rows will be assigned sequential ids');
    
    // Check the result
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'project_metrics_summary' 
      AND column_name = 'id'
    `);
    
    if (result.rows.length > 0) {
      console.log('\nColumn details:');
      console.table(result.rows);
    }
    
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await pool.end();
  }
}

runMigration();