import { config } from 'dotenv';
import { Pool } from 'pg';

// Load environment variables
config();

async function verifyMigration() {
  console.log('🔍 Verifying Migration Results...');
  console.log('=================================');
  
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
    // Check project status distribution
    console.log('\n📊 Project Status Distribution:');
    const statusResult = await pool.query(`
      SELECT build_status, framework, COUNT(*) as count
      FROM projects 
      GROUP BY build_status, framework 
      ORDER BY build_status, framework
    `);
    
    statusResult.rows.forEach(row => {
      console.log(`  ${row.build_status} (${row.framework}): ${row.count} projects`);
    });

    // Check for any remaining config data
    console.log('\n🧹 Config Column Cleanup Status:');
    const configResult = await pool.query(`
      SELECT 
        COUNT(*) as total_projects,
        COUNT(CASE WHEN config = '{}'::jsonb THEN 1 END) as cleaned_configs,
        COUNT(CASE WHEN config != '{}'::jsonb THEN 1 END) as remaining_configs
      FROM projects
    `);
    
    const stats = configResult.rows[0];
    console.log(`  Total projects: ${stats.total_projects}`);
    console.log(`  Cleaned configs: ${stats.cleaned_configs}`);
    console.log(`  Configs with remaining data: ${stats.remaining_configs}`);

    // Show sample of remaining config data
    if (parseInt(stats.remaining_configs) > 0) {
      console.log('\n📋 Sample of remaining config data:');
      const sampleResult = await pool.query(`
        SELECT id, config 
        FROM projects 
        WHERE config != '{}'::jsonb 
        LIMIT 3
      `);
      
      sampleResult.rows.forEach(row => {
        console.log(`  Project ${row.id}: ${JSON.stringify(row.config)}`);
      });
    }

    // Check constraint health
    console.log('\n🔒 Constraint Health Check:');
    const constraintResult = await pool.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN last_build_completed IS NULL OR last_build_started IS NULL OR last_build_completed >= last_build_started THEN 1 END) as valid_timing
      FROM projects
    `);
    
    const constraintStats = constraintResult.rows[0];
    console.log(`  Projects with valid timing constraints: ${constraintStats.valid_timing}/${constraintStats.total}`);

    console.log('\n✅ Migration verification completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Verification failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

verifyMigration();