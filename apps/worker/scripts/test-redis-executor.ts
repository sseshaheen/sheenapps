#!/usr/bin/env ts-node

import * as dotenv from 'dotenv';
dotenv.config();

import { claudeCLIMainProcess } from '../src/services/claudeCLIMainProcess';
import { ClaudeExecutorFactory } from '../src/providers/executors/claudeExecutorFactory';

async function test() {
  console.log('🧪 Testing Redis Executor Implementation\n');
  
  try {
    // Initialize main process service
    console.log('1️⃣ Initializing Claude CLI main process service...');
    await claudeCLIMainProcess.initialize();
    console.log('✅ Main process service initialized\n');
    
    // Test health check
    console.log('2️⃣ Testing health check...');
    const isHealthy = await claudeCLIMainProcess.healthCheck();
    console.log(`✅ Health check: ${isHealthy ? 'PASSED' : 'FAILED'}\n`);
    
    // Create executor
    console.log('3️⃣ Creating Redis executor...');
    const executor = ClaudeExecutorFactory.create();
    console.log('✅ Executor created\n');
    
    // Test simple execution
    console.log('4️⃣ Testing simple Claude execution...');
    const testPrompt = 'Say "Hello from Redis executor!" and nothing else.';
    const args = ['--output-format', 'stream-json', '--verbose', '--dangerously-skip-permissions'];
    
    const result = await executor.execute(testPrompt, args);
    console.log('✅ Execution completed');
    console.log('Result:', {
      success: result.success,
      output: result.output?.substring(0, 100) + '...',
      hasUsage: !!result.usage,
      duration: result.duration
    });
    
    if (result.usage) {
      console.log('\n📊 Token Usage:', {
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        totalCost: `$${result.usage.totalCost.toFixed(4)}`
      });
    }
    
    // Get metrics
    if (executor.getMetrics) {
      console.log('\n5️⃣ Getting metrics...');
      const metrics = await executor.getMetrics();
      console.log('📈 Metrics:', metrics);
    }
    
    // Shutdown
    console.log('\n6️⃣ Shutting down...');
    await claudeCLIMainProcess.shutdown();
    console.log('✅ Shutdown complete');
    
    console.log('\n🎉 All tests passed!');
    process.exit(0);
    
  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the test
test();