import fs from 'fs';
import path from 'path';
import { pool } from '../src/services/database';

async function runMigration() {
  if (!pool) {
    console.error('No database connection');
    return;
  }

  try {
    const sqlPath = path.join(__dirname, '..', 'migrations', '008_fix_project_deployment_metrics_constraint.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    await pool.query(sql);
    console.log('Migration 008 applied successfully');
    console.log('- Removed unique constraint on build_id');
    console.log('- Added unique constraint on (build_id, created_at)');
    console.log('- Added attempt_number and is_retry columns');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await pool.end();
  }
}

runMigration();
