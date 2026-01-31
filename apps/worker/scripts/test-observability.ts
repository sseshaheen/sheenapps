#!/usr/bin/env ts-node
/**
 * Test script to verify OpenTelemetry instrumentation
 * Run with: npm run test:observability
 */

import * as dotenv from 'dotenv';
dotenv.config();

// Initialize OpenTelemetry
import '../src/observability/init';
import { JobTracer, logger, metrics } from '../src/observability';
import { trace } from '@opentelemetry/api';

async function testObservability() {
  logger.info('Starting observability test');
  
  // Test 1: Create a simple span
  const tracer = trace.getTracer('test-script', '1.0.0');
  const span = tracer.startSpan('test.operation');
  
  span.setAttribute('test.attribute', 'value');
  span.addEvent('test.event', {
    'event.data': 'test data',
  });
  
  // Test 2: Simulate a job
  const mockJob = {
    id: 'test-job-1',
    type: 'test',
    queue: 'test-queue',
    attempt: 1,
    createdAt: new Date(),
  };
  
  logger.info('Processing mock job');
  
  const result = await JobTracer.processWithTrace(mockJob, async (job, jobSpan) => {
    logger.info('Inside job processing');
    
    // Simulate some work
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Test external call tracing
    await JobTracer.traceExternalCall('test-api', 'call', async () => {
      logger.info('Making external call');
      await new Promise(resolve => setTimeout(resolve, 50));
      return { success: true };
    });
    
    // Test metrics
    metrics.recordJobMetrics('test', 150, true, 'test-queue');
    
    return { processed: true };
  });
  
  span.end();
  
  logger.info('Observability test completed');
  
  // Give time for telemetry to flush
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  console.log('\n✅ Observability test completed successfully!');
  console.log('Check the following:');
  console.log('1. Logs should include trace_id and span_id');
  console.log('2. If Alloy is running, check http://localhost:13133/healthz');
  console.log('3. Metrics should be available at http://localhost:8888/metrics');
  
  process.exit(0);
}

testObservability().catch(error => {
  logger.error('Test failed', error);
  process.exit(1);
});