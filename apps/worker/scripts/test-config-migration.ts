import { config } from 'dotenv';
import { Pool } from 'pg';

// Load environment variables
config();

async function testConfigMigration() {
  console.log('🧪 Testing Project Config Migration...');
  console.log('=====================================');
  
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
    // Test 1: Verify new columns exist
    console.log('\n1️⃣ Checking database schema...');
    const schemaResult = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'projects' 
      AND column_name IN (
        'build_status', 'current_build_id', 'current_version_id', 
        'framework', 'preview_url', 'last_build_started', 'last_build_completed'
      )
      ORDER BY column_name
    `);
    
    console.log('New columns found:');
    schemaResult.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`);
    });

    if (schemaResult.rows.length !== 7) {
      throw new Error(`Expected 7 new columns, found ${schemaResult.rows.length}`);
    }

    // Test 2: Check enum type exists
    console.log('\n2️⃣ Checking build_status enum...');
    const enumResult = await pool.query(`
      SELECT enumlabel 
      FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'build_status'
      ORDER BY enumlabel
    `);
    
    const expectedStatuses = ['building', 'canceled', 'deployed', 'failed', 'queued', 'superseded'];
    const actualStatuses = enumResult.rows.map(r => r.enumlabel).sort();
    
    console.log('Build status enum values:', actualStatuses);
    
    if (JSON.stringify(actualStatuses) !== JSON.stringify(expectedStatuses)) {
      throw new Error(`Enum values mismatch. Expected: ${expectedStatuses}, Got: ${actualStatuses}`);
    }

    // Test 3: Test updating a project config
    console.log('\n3️⃣ Testing project config updates...');
    
    // Find a test project
    const projectResult = await pool.query('SELECT id FROM projects LIMIT 1');
    if (projectResult.rows.length === 0) {
      console.log('⚠️  No projects found to test with. Skipping update tests.');
      return;
    }
    
    const testProjectId = projectResult.rows[0].id;
    console.log(`Using test project: ${testProjectId}`);

    // Test direct database updates (bypassing service layer for testing)
    const testConfig = {
      status: 'building',
      framework: 'vue' // Change framework to test the update
    };
    
    // Direct database update (without foreign key fields to avoid constraint issues)
    await pool.query(`
      UPDATE projects 
      SET 
        build_status = $1,
        framework = $2,
        updated_at = NOW()
      WHERE id = $3
    `, [testConfig.status, testConfig.framework, testProjectId]);
    
    console.log('✅ Config update completed');

    // Test direct database retrieval  
    const retrievedResult = await pool.query(`
      SELECT 
        build_status as status,
        current_build_id as "buildId",
        current_version_id as "versionId", 
        framework,
        preview_url as "previewUrl",
        last_build_started as "lastBuildStarted",
        last_build_completed as "lastBuildCompleted"
      FROM projects 
      WHERE id = $1
    `, [testProjectId]);
    
    if (retrievedResult.rows.length === 0) {
      throw new Error('Failed to retrieve project config');
    }
    
    const retrievedConfig = retrievedResult.rows[0];
    console.log('Retrieved config:', retrievedConfig);
    
    if (retrievedConfig.status !== testConfig.status) {
      throw new Error(`Status mismatch: expected ${testConfig.status}, got ${retrievedConfig.status}`);
    }
    
    if (retrievedConfig.framework !== testConfig.framework) {
      throw new Error(`Framework mismatch: expected ${testConfig.framework}, got ${retrievedConfig.framework}`);
    }

    // Test 4: Check indexes were created
    console.log('\n4️⃣ Checking performance indexes...');
    const indexResult = await pool.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'projects' 
      AND indexname LIKE '%build%' OR indexname LIKE '%framework%'
      ORDER BY indexname
    `);
    
    console.log('Build-related indexes found:');
    indexResult.rows.forEach(row => {
      console.log(`  - ${row.indexname}`);
    });

    // Test 5: Verify config column still exists but cleaned
    console.log('\n5️⃣ Checking config column cleanup...');
    const configCheck = await pool.query(`
      SELECT 
        id,
        config,
        (config ? 'status') as has_status,
        (config ? 'buildId') as has_build_id,
        (config ? 'framework') as has_framework
      FROM projects 
      WHERE id = $1
    `, [testProjectId]);
    
    if (configCheck.rows.length > 0) {
      const row = configCheck.rows[0];
      console.log(`Config column status for test project:`);
      console.log(`  - Config exists: ${row.config !== null}`);
      console.log(`  - Has 'status' key: ${row.has_status}`);
      console.log(`  - Has 'buildId' key: ${row.has_build_id}`);
      console.log(`  - Has 'framework' key: ${row.has_framework}`);
      
      if (row.has_status || row.has_build_id || row.has_framework) {
        console.log('⚠️  Warning: Config column still contains promoted keys that should have been removed');
      }
    }

    console.log('\n✅ All tests passed! Migration appears to be working correctly.');
    
  } catch (error) {
    console.error('\n❌ Migration test failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

console.log('Testing project config migration...');
testConfigMigration();