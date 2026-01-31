// Test the TypeScript 5.0.0 error recovery
const { getErrorInterceptor } = require('./dist/services/errorInterceptor');

async function testTypeScriptRecovery() {
  console.log('Testing TypeScript 5.0.0 Error Recovery...\n');
  
  const errorInterceptor = getErrorInterceptor();
  
  // Simulate the exact error from the logs
  const error = new Error('Non-existent packages: typescript@^5.0.0');
  
  console.log('Reporting error with proper context...');
  await errorInterceptor.reportError(error, {
    source: 'deploy',
    stage: 'package-verification',
    projectId: 'my-app',
    userId: 'user123',
    buildId: 'test-build-1'
  });
  
  // Wait for processing
  console.log('Waiting for error recovery to process...');
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  console.log('\nCheck the logs to see if recovery was triggered!');
}

testTypeScriptRecovery().catch(console.error);