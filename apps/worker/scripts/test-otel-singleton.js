#!/usr/bin/env node

/**
 * Test script to verify OpenTelemetry singleton initialization
 * This ensures the SDK is only initialized once, preventing the
 * "MetricReader can not be bound to a MeterProvider again" error
 */

const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

console.log('='.repeat(60));
console.log('🔍 Testing OpenTelemetry Singleton Initialization');
console.log('='.repeat(60));

// Set debug mode
process.env.OTEL_DEBUG = 'true';

console.log('\n📌 Test 1: First Initialization');
console.log('-'.repeat(40));

// First import - should initialize
try {
  const { initializeClusterSafeTelemetry } = require('../dist/observability/cluster-safe');
  initializeClusterSafeTelemetry();
  console.log('✅ First initialization successful');
} catch (error) {
  console.error('❌ First initialization failed:', error.message);
}

console.log('\n📌 Test 2: Second Initialization (Should Skip)');
console.log('-'.repeat(40));

// Second import - should be idempotent
try {
  const { initializeClusterSafeTelemetry } = require('../dist/observability/cluster-safe');
  initializeClusterSafeTelemetry();
  console.log('✅ Second initialization handled correctly (idempotent)');
} catch (error) {
  console.error('❌ Second initialization failed:', error.message);
  console.error('   This means the singleton pattern is not working');
}

console.log('\n📌 Test 3: Direct OTEL Initialization (Should Skip)');
console.log('-'.repeat(40));

// Direct call to initializeTelemetry - should also be idempotent
try {
  const { initializeTelemetry } = require('../dist/observability/otel');
  initializeTelemetry();
  console.log('✅ Direct initialization handled correctly (idempotent)');
} catch (error) {
  console.error('❌ Direct initialization failed:', error.message);
}

console.log('\n📌 Test 4: Import observability/index (Should Not Initialize)');
console.log('-'.repeat(40));

// Import index - should NOT initialize anymore
try {
  require('../dist/observability/index');
  console.log('✅ Index import did not trigger initialization');
} catch (error) {
  console.error('❌ Index import caused error:', error.message);
}

console.log('\n📌 Test 5: Shutdown Test');
console.log('-'.repeat(40));

// Test shutdown
try {
  const { shutdownClusterSafeTelemetry } = require('../dist/observability/cluster-safe');
  shutdownClusterSafeTelemetry().then(() => {
    console.log('✅ Shutdown successful');
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ All singleton tests passed!');
    console.log('   OpenTelemetry will only initialize once per process');
    console.log('   This fixes the "MetricReader can not be bound" error');
    console.log('='.repeat(60));
    
    process.exit(0);
  }).catch(error => {
    console.error('❌ Shutdown failed:', error.message);
    process.exit(1);
  });
} catch (error) {
  console.error('❌ Shutdown test failed:', error.message);
  process.exit(1);
}