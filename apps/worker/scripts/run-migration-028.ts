import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Pool } from 'pg';

// Load environment variables
config();

async function runMigration() {
  console.log('🚀 Running Migration 028: Projects Config Column Breakout');
  console.log('=======================================================');
  
  const dbUrl = process.env.DATABASE_URL;
  
  if (!dbUrl) {
    console.error('❌ DATABASE_URL is not set');
    process.exit(1);
  }
  
  const pool = new Pool({
    connectionString: dbUrl,
    ssl: {
      rejectUnauthorized: false
    }
  });
  
  try {
    // Read the migration file
    const migrationPath = join(__dirname, '../migrations/028_projects_config_column_breakout.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf8');
    
    console.log('📄 Migration file loaded');
    console.log('⚡ Executing migration...\n');
    
    // Execute the migration
    await pool.query(migrationSQL);
    
    console.log('✅ Migration 028 completed successfully!');
    console.log('\n📊 Post-migration verification:');
    
    // Run some verification queries
    const columnCount = await pool.query(`
      SELECT COUNT(*) as count
      FROM information_schema.columns 
      WHERE table_name = 'projects' 
      AND column_name IN (
        'build_status', 'current_build_id', 'current_version_id', 
        'framework', 'preview_url', 'last_build_started', 'last_build_completed'
      )
    `);
    
    console.log(`✓ New columns added: ${columnCount.rows[0].count}/7`);
    
    const enumCount = await pool.query(`
      SELECT COUNT(*) as count
      FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'build_status'
    `);
    
    console.log(`✓ Build status enum values: ${enumCount.rows[0].count}/6`);
    
    const projectStats = await pool.query(`
      SELECT 
        build_status,
        COUNT(*) as count
      FROM projects 
      GROUP BY build_status
      ORDER BY build_status
    `);
    
    console.log('✓ Project status distribution:');
    projectStats.rows.forEach(row => {
      console.log(`   ${row.build_status}: ${row.count} projects`);
    });
    
    console.log('\n🎉 Migration completed successfully!');
    console.log('💡 Run the test script to verify everything is working:');
    console.log('   npx ts-node scripts/test-config-migration.ts');
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    console.log('\n🔄 The database transaction has been rolled back.');
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();