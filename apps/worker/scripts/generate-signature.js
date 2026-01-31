#!/usr/bin/env node

const crypto = require('crypto');

// Get command line arguments
const args = process.argv.slice(2);
if (args.length < 1) {
  console.log('Usage: node generate-signature.js <SHARED_SECRET> [payload]');
  console.log('');
  console.log('Examples:');
  console.log('  node generate-signature.js my-secret \'{"userId":"test","projectId":"test","prompt":"Hello"}\'');
  console.log('  echo \'{"userId":"test","projectId":"test","prompt":"Hello"}\' | node generate-signature.js my-secret');
  process.exit(1);
}

const secret = args[0];
let payload = args[1];

// If no payload provided as argument, read from stdin
if (!payload) {
  const stdin = process.stdin;
  let inputData = '';
  
  stdin.setEncoding('utf8');
  stdin.on('data', (chunk) => {
    inputData += chunk;
  });
  
  stdin.on('end', () => {
    payload = inputData.trim();
    generateSignature(secret, payload);
  });
} else {
  generateSignature(secret, payload);
}

function generateSignature(secret, payload) {
  const signature = crypto.createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  console.log('Payload:', payload);
  console.log('Signature:', signature);
  console.log('');
  console.log('cURL command:');
  console.log(`curl -X POST http://localhost:8080/create-preview-for-new-project \\
  -H "Content-Type: application/json" \\
  -H "x-sheen-signature: ${signature}" \\
  -d '${payload}'`);
}