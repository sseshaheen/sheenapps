import { config } from 'dotenv';
import { Pool } from 'pg';
import * as fs from 'fs/promises';
import * as path from 'path';

// Load environment variables
config();

async function runMigrations() {
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
    const client = await pool.connect();
    
    // Read migration file
    const migrationPath = path.join(__dirname, '../src/db/migrations/000z_create_project_versions.sql');
    const migrationSQL = await fs.readFile(migrationPath, 'utf8');
    
    console.log('Running migration...');
    await client.query(migrationSQL);
    
    console.log('✅ Migration completed successfully!');
    
    // Verify table was created
    const result = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'project_versions'
      ORDER BY ordinal_position
    `);
    
    console.log('\nTable structure:');
    result.rows.forEach(row => {
      console.log(`  ${row.column_name}: ${row.data_type}`);
    });
    
    client.release();
    await pool.end();
  } catch (error: any) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  }
}

runMigrations();