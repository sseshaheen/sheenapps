#!/usr/bin/env node
// Helper script to validate environment without starting the server
require('dotenv').config();

// First check for placeholder values
const fs = require('fs');
const path = require('path');

const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  
  // Check for common placeholder patterns
  const placeholderPatterns = [
    /COPY_YOUR_ACTUAL_/,
    /UPDATE_WITH_YOUR_/,
    /your-actual-/,
    /your-cloudflare-/,
    /replace-with-/,
    /123456789/,  // Common in AWS URLs
    /your-account-id/,
    /your-bucket/,
    /your-kv-namespace/,
    /your-pages-project/
  ];
  
  const lines = envContent.split('\n');
  const placeholderLines = [];
  
  lines.forEach((line, index) => {
    // Skip comments and empty lines
    if (line.trim().startsWith('#') || line.trim() === '') return;
    
    for (const pattern of placeholderPatterns) {
      if (pattern.test(line)) {
        placeholderLines.push({
          line: index + 1,
          content: line.substring(0, 50) + (line.length > 50 ? '...' : '')
        });
        break;
      }
    }
  });
  
  if (placeholderLines.length > 0) {
    console.error('❌ CRITICAL: Placeholder values detected in .env file!');
    console.error('\nThe following lines contain placeholder values:');
    placeholderLines.forEach(({ line, content }) => {
      console.error(`  Line ${line}: ${content}`);
    });
    console.error('\n⚠️  Please replace ALL placeholder values with actual values');
    console.error('📚 See .env.example comments for where to find each value\n');
    process.exit(1);
  }
}

// Check if dist directory exists (needed for validation import)
const distPath = path.join(process.cwd(), 'dist');
if (!fs.existsSync(distPath)) {
  console.error('❌ dist/ directory not found. Please run "npm run build" first.');
  process.exit(1);
}

// Now run the actual validation
try {
  const { validateEnvironment } = require('../dist/config/envValidation');
  validateEnvironment();
  console.log('✅ All required environment variables are set');
  console.log('✅ No placeholder values detected');
  process.exit(0);
} catch (error) {
  if (error.code === 'MODULE_NOT_FOUND') {
    console.error('❌ envValidation module not found. Please run "npm run build" first.');
  } else {
    console.error('❌ Environment validation failed:', error.message);
  }
  process.exit(1);
}