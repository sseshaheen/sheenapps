import { config } from 'dotenv';

// Load environment variables
const result = config();

console.log('Dotenv loading result:', result.error ? 'ERROR' : 'SUCCESS');
if (result.error) {
  console.error('Error:', result.error);
}

console.log('\nEnvironment variables:');
console.log('DATABASE_URL exists:', !!process.env.DATABASE_URL);
console.log('DATABASE_URL length:', process.env.DATABASE_URL?.length || 0);
console.log('DATABASE_URL preview:', process.env.DATABASE_URL ? process.env.DATABASE_URL.substring(0, 50) + '...' : 'undefined');

console.log('\nOther relevant vars:');
console.log('DIRECT_MODE:', process.env.DIRECT_MODE);
console.log('USE_REAL_SERVICES:', process.env.USE_REAL_SERVICES);
console.log('NODE_ENV:', process.env.NODE_ENV);