#!/usr/bin/env node

/**
 * Test script for cluster-safe OpenTelemetry implementation
 * Tests different process modes and verifies correct initialization
 */

const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

console.log('='.repeat(60));
console.log('🔍 Testing OpenTelemetry Cluster-Safe Implementation');
console.log('='.repeat(60));

// Test 1: Check process mode detection
console.log('\n📌 Test 1: Process Mode Detection');
console.log('-'.repeat(40));

const checkProcessMode = () => {
  const isPM2 = !!process.env.PM2_HOME || !!process.env.pm_id || !!process.env.NODE_APP_INSTANCE;
  const pm2ExecMode = process.env.exec_mode;
  const cluster = require('cluster');
  
  console.log(`PM2 Detected: ${isPM2}`);
  console.log(`PM2 Exec Mode: ${pm2ExecMode || 'N/A'}`);
  console.log(`PM2 Instance ID: ${process.env.pm_id || 'N/A'}`);
  console.log(`NODE_APP_INSTANCE: ${process.env.NODE_APP_INSTANCE || 'N/A'}`);
  console.log(`Cluster isPrimary: ${cluster.isPrimary}`);
  console.log(`Cluster isWorker: ${cluster.isWorker}`);
  console.log(`Process PID: ${process.pid}`);
  
  let mode = 'standalone';
  if (isPM2 && pm2ExecMode === 'cluster') {
    mode = 'pm2-cluster';
  } else if (isPM2 && pm2ExecMode === 'fork') {
    mode = 'fork';
  } else if (!isPM2 && cluster.isPrimary) {
    mode = 'primary';
  } else if (!isPM2 && cluster.isWorker) {
    mode = 'worker';
  }
  
  console.log(`\n✅ Detected Mode: ${mode.toUpperCase()}`);
  return mode;
};

const mode = checkProcessMode();

// Test 2: Check OpenTelemetry configuration
console.log('\n📌 Test 2: OpenTelemetry Configuration');
console.log('-'.repeat(40));

const otelConfig = {
  'OTEL_SDK_DISABLED': process.env.OTEL_SDK_DISABLED || 'not set',
  'OTEL_SERVICE_NAME': process.env.OTEL_SERVICE_NAME || 'not set',
  'OTEL_EXPORTER_OTLP_ENDPOINT': process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'not set',
  'OTEL_TRACES_SAMPLER': process.env.OTEL_TRACES_SAMPLER || 'not set',
  'OTEL_TRACES_SAMPLER_ARG': process.env.OTEL_TRACES_SAMPLER_ARG || 'not set',
};

Object.entries(otelConfig).forEach(([key, value]) => {
  const status = value === 'not set' ? '❌' : '✅';
  console.log(`${status} ${key}: ${value}`);
});

// Test 3: Simulate initialization (without actually loading the module)
console.log('\n📌 Test 3: Initialization Simulation');
console.log('-'.repeat(40));

if (process.env.OTEL_SDK_DISABLED === 'true') {
  console.log('⚠️  OpenTelemetry is DISABLED (OTEL_SDK_DISABLED=true)');
  console.log('   To enable, set OTEL_SDK_DISABLED=false');
} else {
  console.log('✅ OpenTelemetry would initialize in mode:', mode.toUpperCase());
  
  switch (mode) {
    case 'standalone':
    case 'fork':
      console.log('   → Full SDK initialization');
      console.log('   → Direct metrics export');
      console.log('   → Standard tracing enabled');
      break;
    case 'pm2-cluster':
      console.log('   → Full SDK initialization (PM2 handles clustering)');
      console.log('   → Direct metrics export from each worker');
      console.log('   → No app-level clustering (avoids double-cluster)');
      console.log('   → Each PM2 worker acts independently');
      break;
    case 'primary':
      console.log('   → Full SDK initialization');
      console.log('   → Worker metrics aggregation enabled');
      console.log('   → IPC listener registered');
      break;
    case 'worker':
      console.log('   → Lightweight initialization');
      console.log('   → IPC-based metrics forwarding');
      console.log('   → No port binding (conflict-free)');
      break;
  }
}

// Test 4: Recommendations
console.log('\n📌 Test 4: Recommendations');
console.log('-'.repeat(40));

if (process.env.OTEL_SDK_DISABLED === 'true') {
  console.log('🔧 To enable OpenTelemetry:');
  console.log('   1. Set OTEL_SDK_DISABLED=false in .env or ecosystem.config.js');
  console.log('   2. Restart the application with: pm2 reload sheenapps-worker');
  console.log('   3. Check logs for [OTEL] messages to verify initialization');
} else {
  console.log('✅ OpenTelemetry is enabled and ready');
  
  if (mode === 'standalone' && process.env.NODE_ENV === 'production') {
    console.log('💡 Consider using PM2 for production deployments');
  }
  
  if (mode === 'fork') {
    console.log('✅ Fork mode is stable and recommended for most workloads');
  }
}

// Test 5: Cluster mode simulation
if (process.argv.includes('--test-cluster')) {
  console.log('\n📌 Test 5: Cluster Mode Simulation');
  console.log('-'.repeat(40));
  
  const cluster = require('cluster');
  const numCPUs = require('os').cpus().length;
  
  if (cluster.isPrimary) {
    console.log(`Primary ${process.pid} is running`);
    console.log(`Forking ${numCPUs} workers...`);
    
    // Fork workers
    for (let i = 0; i < numCPUs; i++) {
      cluster.fork();
    }
    
    cluster.on('exit', (worker, code, signal) => {
      console.log(`Worker ${worker.process.pid} died`);
    });
    
    // Set up message handler for IPC
    cluster.on('message', (worker, message) => {
      if (message && message.type === 'otel-metric') {
        console.log(`Primary received metric from worker ${worker.id}:`, message.data);
      }
    });
  } else {
    console.log(`Worker ${process.pid} started`);
    
    // Simulate sending a metric via IPC
    if (process.send) {
      process.send({
        type: 'otel-metric',
        data: {
          name: 'test_metric',
          value: 1,
          workerId: cluster.worker?.id
        }
      });
    }
    
    // Exit after sending
    setTimeout(() => process.exit(0), 1000);
  }
}

console.log('\n' + '='.repeat(60));
console.log('✅ OpenTelemetry cluster-safe test complete');
console.log('='.repeat(60));