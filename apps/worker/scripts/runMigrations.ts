import { Pool } from 'pg';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function runMigrations() {
  console.log('🗄️  Running database migrations...\n');

  if (!process.env.DATABASE_URL) {
    console.error('❌ Error: DATABASE_URL not found in environment');
    console.error('Please set DATABASE_URL in your .env file');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    // Get all migration files
    const migrationsDir = path.join(__dirname, '..', 'src', 'db', 'migrations');
    const files = await fs.readdir(migrationsDir);
    const sqlFiles = files.filter(f => f.endsWith('.sql')).sort();

    console.log(`📋 Found ${sqlFiles.length} migrations:\n`);

    for (const file of sqlFiles) {
      console.log(`▶️  Running: ${file}`);
      
      const filePath = path.join(migrationsDir, file);
      const sql = await fs.readFile(filePath, 'utf8');

      try {
        await pool.query(sql);
        console.log(`✅ Success: ${file}\n`);
      } catch (error: any) {
        if (error.message.includes('already exists')) {
          console.log(`⏭️  Skipped: ${file} (already exists)\n`);
        } else {
          console.error(`❌ Failed: ${file}`);
          console.error(error.message);
          throw error;
        }
      }
    }

    console.log('✅ All migrations completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run migrations
runMigrations();