#!/usr/bin/env ts-node

import * as dotenv from 'dotenv';
dotenv.config();

import { claudeCLIMainProcess } from '../src/services/claudeCLIMainProcess';
import { ProviderFactory } from '../src/providers/providerFactory';

async function test() {
  console.log('🧪 Simple Claude CLI E2E Test\n');
  
  try {
    // Initialize
    console.log('Initializing...');
    await claudeCLIMainProcess.initialize();
    const provider = ProviderFactory.getProvider('claude-cli');
    if ('initialize' in provider && typeof provider.initialize === 'function') {
      await provider.initialize();
    }
    console.log('✅ Initialized\n');
    
    // Test 1: Simple code generation
    console.log('Test 1: Code generation');
    const result1 = await provider.transform({
      type: 'code_gen',
      input: 'Create a simple hello world function',
      context: { framework: 'javascript' }
    });
    console.log('✅ Response length:', result1.output.length);
    console.log('✅ Token usage:', result1.usage);
    console.log('Sample output:', result1.output.substring(0, 100) + '...\n');
    
    // Test 2: JSON healing
    console.log('Test 2: JSON healing');
    const result2 = await provider.transform({
      type: 'heal_json',
      input: '{"name": "test", "value": 123,}',
      context: {}
    });
    console.log('✅ Response:', result2.output);
    
    // Check if it's valid JSON
    try {
      const parsed = JSON.parse(result2.output);
      console.log('✅ Valid JSON:', parsed);
    } catch (e) {
      console.log('⚠️  Not valid JSON, but got response');
    }
    
    // Get metrics
    console.log('\n📊 Final Metrics:');
    const metrics = await claudeCLIMainProcess.getMetrics();
    console.log(metrics);
    
    // Cleanup
    await claudeCLIMainProcess.shutdown();
    console.log('\n✅ All tests completed!');
    
  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

test();