#!/usr/bin/env npx tsx

/**
 * Simple manual test for E2E Mock Implementation
 * 
 * Test just the detection logic in isolation
 */

import { ClaudeSession } from '../src/stream/claudeSession';

// Access private method via prototype for testing
function testDetection(prompt: string): boolean {
  const session = new ClaudeSession();
  // Access private method for testing
  return (session as any).isE2ETestScenario(prompt);
}

function main(): void {
  console.log('🧪 Testing E2E Detection Logic');
  console.log('===============================');

  const testCases = [
    { prompt: 'Create a simple business landing page for our e2e testing', expected: true },
    { prompt: 'Build an app with e2e testing capabilities', expected: true },
    { prompt: 'Create a React dashboard for user management', expected: false },
    { prompt: 'Build a landing page suitable for cypress test automation', expected: true },
    { prompt: 'Add playwright test support to the project', expected: true },
    { prompt: 'Create a simple todo app', expected: false },
    { prompt: 'Setup automated testing for the app', expected: true },
    { prompt: 'Build a regular business website', expected: false }
  ];

  let passed = 0;
  let total = testCases.length;

  testCases.forEach((testCase, index) => {
    const result = testDetection(testCase.prompt);
    const status = result === testCase.expected ? '✅ PASS' : '❌ FAIL';
    
    console.log(`${index + 1}. ${status}: "${testCase.prompt}"`);
    console.log(`   Expected: ${testCase.expected}, Got: ${result}`);
    
    if (result === testCase.expected) {
      passed++;
    }
    console.log('');
  });

  console.log(`📊 Results: ${passed}/${total} tests passed`);
  
  if (passed === total) {
    console.log('🎉 All detection tests passed! The e2e mock logic is working correctly.');
  } else {
    console.log('❌ Some tests failed. Check the detection logic.');
    process.exit(1);
  }
}

main();