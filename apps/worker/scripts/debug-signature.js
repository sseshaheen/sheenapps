const crypto = require('crypto');

// Test data from your logs
const secret = '9Q6WWhZP3AlrhpdDwy3tC0bPtZSYAeJMAkdPzXFl9xs=';
const postmanSignature = '1376d39365260396cb22ab915a97568be1e550ae7ab873702c9016a4a4a26307';

const body = {
  userId: 'user123',
  projectId: 'my-app',
  prompt: 'USER SPEC: goal: Clean marketplace product teaser. section_list: Phone‑mockup hero; Chart preview; Location map; Cart drawer; Knowledge feedback thumbs. style_tags: luxury, accessibility, bauhaus, futuristic, cyberpunk industry_tag: marketplace extra: support for english and arabic interfaces',
  framework: 'react'
};

// Test different payload formats
const payloads = {
  'compact': JSON.stringify(body),
  'withNewline': JSON.stringify(body) + '\n',
  'pretty': JSON.stringify(body, null, 2),
  'prettyWithNewline': JSON.stringify(body, null, 2) + '\n'
};

console.log('=== Signature Debug ===\n');
console.log('Secret:', secret);
console.log('Postman Signature:', postmanSignature);
console.log('\n=== Testing Different Payload Formats ===\n');

Object.entries(payloads).forEach(([name, payload]) => {
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const matches = signature === postmanSignature;
  
  console.log(`${name}:`);
  console.log(`  Length: ${payload.length}`);
  console.log(`  First 50 chars: ${payload.substring(0, 50)}...`);
  console.log(`  Last 10 chars: ...${JSON.stringify(payload.slice(-10))}`);
  console.log(`  Signature: ${signature}`);
  console.log(`  Matches Postman: ${matches ? '✅' : '❌'}`);
  console.log('');
});

// Also test what the server would generate
console.log('=== Server-side Test ===');
const serverPayload = JSON.stringify(body);
const serverSignature = crypto.createHmac('sha256', secret).update(serverPayload).digest('hex');
console.log('Server would use:', serverPayload.length, 'bytes');
console.log('Server signature:', serverSignature);
console.log('');

// Check content-length mismatch
console.log('=== Content-Length Analysis ===');
console.log('Postman Content-Length: 369');
console.log('Compact JSON length:', JSON.stringify(body).length);
console.log('With newline length:', (JSON.stringify(body) + '\n').length);
console.log('Difference suggests Postman added:', 369 - JSON.stringify(body).length, 'bytes');