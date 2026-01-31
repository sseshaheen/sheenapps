import { config } from 'dotenv';
import { Pool } from 'pg';
import * as fs from 'fs/promises';
import * as path from 'path';

// Load environment variables
config();

async function runMigration027() {
  const dbUrl = process.env.DATABASE_URL;
  
  if (!dbUrl) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }
  
  const pool = new Pool({
    connectionString: dbUrl,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    console.log('Connecting to database...');
    await pool.connect();
    console.log('Connected successfully');

    // Read the migration file
    const migrationPath = path.join(__dirname, '..', 'migrations', '027_fix_metrics_constraint_conflict.sql');
    const migrationSQL = await fs.readFile(migrationPath, 'utf8');

    console.log('Running migration 027: Fix metrics constraint conflict...');
    await pool.query(migrationSQL);
    console.log('✅ Migration 027 completed successfully');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration027();