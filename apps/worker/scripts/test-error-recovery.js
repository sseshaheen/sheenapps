// Test script to verify error recovery system
const { getErrorInterceptor } = require('./dist/services/errorInterceptor');

async function testErrorRecovery() {
  console.log('Testing Error Recovery System...\n');
  
  const errorInterceptor = getErrorInterceptor();
  
  // Test 1: Known pattern (TypeScript version error)
  console.log('Test 1: Non-existent package error (should match pattern)');
  const error1 = new Error('Non-existent packages: typescript@5.0.0');
  await errorInterceptor.reportError(error1, {
    source: 'deploy',
    stage: 'package-verification',
    projectId: 'test-project-1',
    userId: 'test-user',
    buildId: 'test-build-1'
  });
  
  // Wait a bit for processing
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Test 2: Unknown error (should use Claude if enabled)
  console.log('\nTest 2: Unknown error pattern (should use Claude CLI)');
  const error2 = new Error('Unexpected token } in JSON at position 245 while parsing package.json');
  await errorInterceptor.reportError(error2, {
    source: 'build',
    stage: 'parsing',
    projectId: 'test-project-2',
    userId: 'test-user',
    buildId: 'test-build-2'
  });
  
  // Wait for processing
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  console.log('\nTests submitted. Check logs for recovery results.');
}

testErrorRecovery().catch(console.error);