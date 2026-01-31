import { Pool } from 'pg';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testConnection() {
  console.log('🔍 Testing database connection...\n');

  const dbUrl = process.env.DATABASE_URL;
  
  if (!dbUrl) {
    console.error('❌ DATABASE_URL not found in environment');
    process.exit(1);
  }

  // Mask password in the URL for display
  const maskedUrl = dbUrl.replace(/:([^@]+)@/, ':****@');
  console.log(`📌 DATABASE_URL: ${maskedUrl}\n`);

  const pool = new Pool({
    connectionString: dbUrl,
  });

  try {
    // Try a simple query
    console.log('🔄 Attempting connection...');
    const result = await pool.query('SELECT NOW()');
    console.log('✅ Connection successful!');
    console.log(`⏰ Database time: ${result.rows[0].now}\n`);

    // Check if we can see tables
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    console.log('📋 Existing tables:');
    if (tablesResult.rows.length === 0) {
      console.log('   (no tables found - database is empty)');
    } else {
      tablesResult.rows.forEach(row => {
        console.log(`   - ${row.table_name}`);
      });
    }

  } catch (error: any) {
    console.error('❌ Connection failed:', error.message);
    console.error('\n💡 Possible causes:');
    console.error('   1. DATABASE_URL is incorrect');
    console.error('   2. Supabase project might be paused (check dashboard)');
    console.error('   3. Password might be incorrect');
    console.error('   4. Network/firewall issues');
    console.error('\n📝 DATABASE_URL format should be:');
    console.error('   postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres');
  } finally {
    await pool.end();
  }
}

testConnection();