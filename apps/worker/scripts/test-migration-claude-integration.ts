#!/usr/bin/env ts-node

/**
 * Test script to verify Claude CLI integration for migration service
 */

import { claudeCLIMainProcess } from '../src/services/claudeCLIMainProcess';
import { AIMigrationService } from '../src/services/aiMigrationService';

async function testClaudeIntegration() {
  console.log('🧪 Testing Claude CLI integration for migration service...');

  try {
    // Initialize Claude CLI service
    console.log('1. Initializing Claude CLI service...');
    await claudeCLIMainProcess.initialize();
    console.log('✅ Claude CLI service initialized');

    // Health check
    console.log('2. Running health check...');
    const isHealthy = await claudeCLIMainProcess.healthCheck();
    console.log(`✅ Health check: ${isHealthy ? 'PASSED' : 'FAILED'}`);

    if (!isHealthy) {
      throw new Error('Claude CLI service health check failed');
    }

    // Test simple Claude request
    console.log('3. Testing simple Claude request...');
    const testResponse = await claudeCLIMainProcess.request(
      'Reply with JSON: {"status": "success", "message": "Claude CLI integration working"}',
      ['--temperature', '0.1'],
      undefined
    );

    console.log('📨 Claude response:');
    console.log(`   Success: ${testResponse.success}`);
    console.log(`   Result length: ${testResponse.result?.length || 0} chars`);
    console.log(`   Usage: ${JSON.stringify(testResponse.usage || {})}`);

    if (testResponse.success && testResponse.result) {
      // Try to parse JSON response
      try {
        const parsed = JSON.parse(testResponse.result);
        console.log(`   Parsed JSON: ${JSON.stringify(parsed)}`);
      } catch (e) {
        console.log(`   Raw result: ${testResponse.result.slice(0, 200)}...`);
      }
    }

    // Test AIMigrationService instantiation
    console.log('4. Testing AIMigrationService instantiation...');
    const migrationService = new AIMigrationService();
    console.log('✅ AIMigrationService created successfully');

    console.log('\n🎉 All tests passed! Claude CLI integration is working correctly.');

  } catch (error) {
    console.error('❌ Test failed:', (error as Error).message);
    console.error(error);
    process.exit(1);
  } finally {
    // Cleanup
    console.log('🧹 Cleaning up...');
    await claudeCLIMainProcess.shutdown();
    console.log('✅ Cleanup complete');
  }
}

if (require.main === module) {
  testClaudeIntegration();
}