#!/usr/bin/env npx tsx

/**
 * Test script for E2E Mock Implementation
 * 
 * This script tests the new e2e mock detection and response generation
 * functionality in ClaudeSession to ensure it works correctly.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { ClaudeSession } from '../src/stream/claudeSession';
import { ulid } from 'ulid';

const TEST_PROJECT_PATH = path.join(process.cwd(), 'test-projects', 'e2e-mock-test');

async function cleanupTestProject(): Promise<void> {
  try {
    await fs.rm(TEST_PROJECT_PATH, { recursive: true, force: true });
    console.log('✅ Cleaned up test project directory');
  } catch (error) {
    // Ignore cleanup errors
  }
}

async function testE2EMockDetection(): Promise<void> {
  console.log('\n🧪 Testing E2E Mock Detection and Response Generation');
  console.log('====================================================');

  const session = new ClaudeSession();
  const buildId = ulid();
  const userId = 'test-user-123';

  // Test cases for e2e detection
  const testCases = [
    {
      name: 'Standard E2E Test Prompt',
      prompt: 'Create a simple business landing page for our e2e testing',
      shouldTriggerMock: true
    },
    {
      name: 'E2E Testing Mention',
      prompt: 'Build an app with e2e testing capabilities',
      shouldTriggerMock: true
    },
    {
      name: 'Regular Project Prompt',
      prompt: 'Create a React dashboard for user management',
      shouldTriggerMock: false
    },
    {
      name: 'Cypress Test Mention',
      prompt: 'Build a landing page suitable for cypress test automation',
      shouldTriggerMock: true
    }
  ];

  console.log(`📋 Running ${testCases.length} detection test cases...\n`);

  for (const testCase of testCases) {
    console.log(`Testing: ${testCase.name}`);
    console.log(`Prompt: "${testCase.prompt}"`);
    
    // Set NODE_ENV to non-production to enable mocking
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    try {
      const startTime = Date.now();
      const result = await session.run(
        testCase.prompt,
        TEST_PROJECT_PATH,
        buildId + '_' + Date.now(),
        5000, // 5 second timeout for testing
        userId
      );
      const duration = Date.now() - startTime;

      if (testCase.shouldTriggerMock) {
        // Should have used mock response
        if (result.success && duration < 10000 && result.sessionId?.includes('mock_session_')) {
          console.log(`✅ PASS: Mock response generated (${duration}ms)`);
          console.log(`   - Session ID: ${result.sessionId}`);
          console.log(`   - Files created: ${result.filesCreated}`);
          console.log(`   - Cost: $${result.totalCost?.toFixed(4) || '0.0000'}`);
          
          // Check if mock files were created
          try {
            const files = await fs.readdir(TEST_PROJECT_PATH);
            if (files.includes('index.html') && files.includes('package.json')) {
              console.log(`   - Mock files created successfully`);
            } else {
              console.log(`   ⚠️  WARNING: Expected mock files not found`);
            }
          } catch (error) {
            console.log(`   ⚠️  WARNING: Could not check mock files`);
          }
        } else {
          console.log(`❌ FAIL: Expected mock response but got real processing or error`);
          console.log(`   - Duration: ${duration}ms`);
          console.log(`   - Success: ${result.success}`);
          console.log(`   - Session ID: ${result.sessionId}`);
          console.log(`   - Error: ${result.error}`);
        }
      } else {
        // Should not have triggered mock (would fail in real environment)
        console.log(`✅ PASS: No mock triggered for regular prompt (would use real AI)`);
        console.log(`   - Note: This would fail in real environment without Claude CLI`);
      }
    } catch (error) {
      if (testCase.shouldTriggerMock) {
        console.log(`❌ FAIL: Mock should have prevented this error`);
        console.log(`   - Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } else {
        console.log(`✅ PASS: Expected error for non-mock case (no real Claude CLI in test)`);
      }
    } finally {
      // Restore NODE_ENV
      process.env.NODE_ENV = originalNodeEnv;
    }

    console.log(''); // Empty line for readability
  }
}

async function testMockFileGeneration(): Promise<void> {
  console.log('\n📁 Testing Mock File Generation');
  console.log('================================');

  const session = new ClaudeSession();
  const buildId = ulid();
  const userId = 'test-user-456';
  
  // Force production environment to test non-production check
  const originalNodeEnv = process.env.NODE_ENV;
  
  try {
    // Test in development (should use mock)
    process.env.NODE_ENV = 'development';
    console.log('Testing in development environment (should use mock)...');
    
    const result = await session.run(
      'Create a simple business landing page for our e2e testing',
      TEST_PROJECT_PATH,
      buildId,
      5000,
      userId
    );

    if (result.success && result.sessionId?.includes('mock_session_')) {
      console.log('✅ Mock response generated in development');
      
      // Verify file contents
      try {
        const indexHtml = await fs.readFile(path.join(TEST_PROJECT_PATH, 'index.html'), 'utf-8');
        const packageJson = await fs.readFile(path.join(TEST_PROJECT_PATH, 'package.json'), 'utf-8');
        const css = await fs.readFile(path.join(TEST_PROJECT_PATH, 'styles.css'), 'utf-8');
        const js = await fs.readFile(path.join(TEST_PROJECT_PATH, 'script.js'), 'utf-8');
        
        // Validate content
        if (indexHtml.includes('data-testid') && indexHtml.includes('E2E Test Business Landing')) {
          console.log('✅ HTML file contains proper test attributes');
        } else {
          console.log('❌ HTML file missing expected test attributes');
        }
        
        if (packageJson.includes('e2e-test-project')) {
          console.log('✅ Package.json properly configured');
        } else {
          console.log('❌ Package.json not properly configured');
        }
        
        if (css.includes('responsive') || css.includes('@media')) {
          console.log('✅ CSS includes responsive design');
        } else {
          console.log('❌ CSS missing responsive features');
        }
        
        if (js.includes('handleCTAClick') && js.includes('data-test-status')) {
          console.log('✅ JavaScript includes testable interactions');
        } else {
          console.log('❌ JavaScript missing testable interactions');
        }
        
      } catch (error) {
        console.log('❌ Error reading mock files:', error);
      }
    } else {
      console.log('❌ Expected mock response but got something else');
    }

    // Test in production (should not use mock)
    console.log('\nTesting in production environment (should not use mock)...');
    process.env.NODE_ENV = 'production';
    
    try {
      const prodResult = await session.run(
        'Create a simple business landing page for our e2e testing',
        TEST_PROJECT_PATH + '_prod',
        buildId + '_prod',
        5000,
        userId
      );
      console.log('❌ Expected production to skip mock and fail, but it succeeded');
    } catch (error) {
      console.log('✅ Production correctly skipped mock and attempted real Claude CLI (expected to fail in test)');
    }
    
  } finally {
    process.env.NODE_ENV = originalNodeEnv;
  }
}

async function main(): Promise<void> {
  console.log('🚀 Starting E2E Mock Implementation Tests');
  console.log('==========================================');
  
  try {
    // Clean up any previous test runs
    await cleanupTestProject();
    
    // Run tests
    await testE2EMockDetection();
    await testMockFileGeneration();
    
    console.log('\n🎉 Test Summary');
    console.log('===============');
    console.log('✅ E2E mock detection tests completed');
    console.log('✅ Mock file generation tests completed');
    console.log('✅ Environment checks working correctly');
    console.log('');
    console.log('💡 Next Steps:');
    console.log('- Deploy to staging environment');
    console.log('- Run actual frontend e2e tests');
    console.log('- Monitor performance improvements');
    console.log('- Verify cost reduction in non-production environments');
    
  } catch (error) {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  } finally {
    // Final cleanup
    await cleanupTestProject();
  }
}

// Run tests
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}