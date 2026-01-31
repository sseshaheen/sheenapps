#!/usr/bin/env ts-node

import * as dotenv from 'dotenv';
dotenv.config();

import { claudeCLIMainProcess } from '../src/services/claudeCLIMainProcess';
import { ProviderFactory } from '../src/providers/providerFactory';

async function test() {
  console.log('🧪 Testing Failing Cases\n');
  
  try {
    // Initialize
    await claudeCLIMainProcess.initialize();
    const provider = ProviderFactory.getProvider('claude-cli');
    if ('initialize' in provider && typeof provider.initialize === 'function') {
      await provider.initialize();
    }
    
    // Test 1: JSON healing
    console.log('Testing JSON healing...');
    try {
      const result = await provider.transform({
        type: 'heal_json',
        input: '{"name": "test", "value": 123,}',
        context: {}
      });
      
      const parsed = JSON.parse(result.output);
      console.log('✅ JSON healing passed:', parsed);
    } catch (e: any) {
      console.log('❌ JSON healing failed:', e.message);
    }
    
    // Test 2: Test generation
    console.log('\nTesting test generation...');
    try {
      const result = await provider.transform({
        type: 'test_gen',
        input: 'function multiply(a: number, b: number): number { return a * b; }',
        context: {}
      });
      
      console.log('✅ Test generation passed');
      console.log('Output preview:', result.output.substring(0, 200) + '...');
    } catch (e: any) {
      console.log('❌ Test generation failed:', e.message);
    }
    
    // Cleanup
    await claudeCLIMainProcess.shutdown();
    
  } catch (error: any) {
    console.error('Fatal error:', error.message);
    process.exit(1);
  }
}

test();