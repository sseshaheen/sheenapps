import { config } from 'dotenv';
import { Pool } from 'pg';

// Load environment variables
config();

async function testDatabaseConnection() {
  console.log('Testing database connection...\n');
  
  const dbUrl = process.env.DATABASE_URL;
  console.log('DATABASE_URL exists:', !!dbUrl);
  
  if (!dbUrl) {
    console.error('DATABASE_URL is not set in environment variables');
    return;
  }
  
  // Mask the password for display
  const maskedUrl = dbUrl.replace(/:([^:@]+)@/, ':****@');
  console.log('Using DATABASE_URL:', maskedUrl);
  
  const pool = new Pool({
    connectionString: dbUrl,
    ssl: {
      rejectUnauthorized: false
    }
  });
  
  try {
    const client = await pool.connect();
    console.log('\n✅ Successfully connected to database!');
    
    // Test query
    const result = await client.query('SELECT current_database(), current_user, version()');
    console.log('Database:', result.rows[0].current_database);
    console.log('User:', result.rows[0].current_user);
    console.log('Version:', result.rows[0].version.split(',')[0]);
    
    // Check if tables exist
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    console.log('\nTables in database:');
    tablesResult.rows.forEach(row => console.log('  -', row.table_name));
    
    client.release();
    await pool.end();
  } catch (error: any) {
    console.error('\n❌ Failed to connect to database:');
    console.error('Error:', error.message);
    if (error.code) console.error('Code:', error.code);
  }
}

testDatabaseConnection();