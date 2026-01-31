import { Pool } from 'pg';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function runMigration029() {
  console.log('🚀 Running Migration 029: Publication-First Versioning System\n');

  if (!process.env.DATABASE_URL) {
    console.error('❌ Error: DATABASE_URL not found in environment');
    console.error('Please set DATABASE_URL in your .env file');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    // Test connection first
    console.log('🔍 Testing database connection...');
    await pool.query('SELECT 1');
    console.log('✅ Database connection successful\n');

    // Check if migration already applied
    console.log('🔍 Checking if migration already applied...');
    try {
      const checkResult = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'project_versions_metadata' 
          AND column_name = 'is_published'
      `);
      
      if (checkResult.rows.length > 0) {
        console.log('⏭️  Migration 029 already applied (is_published column exists)');
        console.log('✅ Skipping migration');
        return;
      }
    } catch (error) {
      console.log('📋 Migration check failed, proceeding with migration...');
    }

    // Read migration file
    const migrationPath = path.join(__dirname, '..', 'migrations', '029_publication_system.sql');
    console.log(`📖 Reading migration file: ${migrationPath}`);
    const sql = await fs.readFile(migrationPath, 'utf8');

    // Execute migration
    console.log('⚡ Executing migration...');
    await pool.query(sql);
    
    console.log('✅ Migration 029 completed successfully!');
    console.log('\n📊 Changes applied:');
    console.log('   • Added publication tracking columns to project_versions_metadata');
    console.log('   • Created project_published_domains table');
    console.log('   • Added versioning_metrics table');
    console.log('   • Created performance indexes');
    console.log('   • Added data integrity constraints');
    
    // Verify migration
    console.log('\n🔍 Verifying migration...');
    const verifyQuery = `
      SELECT 
        (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'project_versions_metadata' AND column_name = 'is_published') as publication_columns,
        (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'project_published_domains') as domains_table,
        (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'versioning_metrics') as metrics_table
    `;
    
    const verification = await pool.query(verifyQuery);
    const result = verification.rows[0];
    
    if (result.publication_columns > 0 && result.domains_table > 0 && result.metrics_table > 0) {
      console.log('✅ Migration verification successful!');
      console.log(`   • Publication columns: ${result.publication_columns > 0 ? '✓' : '✗'}`);
      console.log(`   • Domains table: ${result.domains_table > 0 ? '✓' : '✗'}`);
      console.log(`   • Metrics table: ${result.metrics_table > 0 ? '✓' : '✗'}`);
    } else {
      throw new Error('Migration verification failed - some components missing');
    }
    
  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run migration
runMigration029().catch(console.error);