#!/usr/bin/env node

/**
 * Test script to verify OpenTelemetry verbose log suppression
 */

const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Set environment to test suppression
process.env.NODE_ENV = 'development';
process.env.OTEL_EXPORTER_CONSOLE = 'false';  // Disable console exporter
process.env.OTEL_TRACES_SAMPLER = 'alwayson'; // Test invalid sampler fix
process.env.OTEL_SDK_DISABLED = 'false';

console.log('=' .repeat(60));
console.log('🧪 Testing OpenTelemetry Clean Configuration');
console.log('=' .repeat(60));
console.log('');
console.log('Expected behavior:');
console.log('✅ No verbose instrumentation loading messages');
console.log('✅ No "OTEL_TRACES_SAMPLER value alwayson invalid" warning');
console.log('✅ No console exporter output');
console.log('✅ Single clean startup message');
console.log('');
console.log('Starting OTEL with clean configuration...');
console.log('-'.repeat(40));

// Initialize OpenTelemetry
try {
  const { initializeClusterSafeTelemetry } = require('./dist/observability/cluster-safe');
  initializeClusterSafeTelemetry();
  
  // Wait a moment for any async logs
  setTimeout(() => {
    console.log('-'.repeat(40));
    console.log('');
    console.log('✅ If you only see minimal output above, the fix is working!');
    console.log('');
    
    // Now test with debug mode
    console.log('Testing with OTEL_DEBUG=true for comparison...');
    console.log('-'.repeat(40));
    process.env.OTEL_DEBUG = 'true';
    
    // Force re-initialization by resetting the singleton
    delete require.cache[require.resolve('./dist/observability/otel')];
    delete require.cache[require.resolve('./dist/observability/cluster-safe')];
    
    const { initializeClusterSafeTelemetry: init2 } = require('./dist/observability/cluster-safe');
    init2();
    
    setTimeout(() => {
      console.log('-'.repeat(40));
      console.log('');
      console.log('📊 Summary:');
      console.log('- First init (clean mode): Should show minimal output');
      console.log('- Second init (debug mode): Should show detailed debug info');
      console.log('');
      console.log('=' .repeat(60));
      process.exit(0);
    }, 500);
  }, 500);
  
} catch (error) {
  console.error('❌ Failed to initialize:', error.message);
  process.exit(1);
}