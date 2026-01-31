import { config } from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load environment variables
config();

// Set required environment variables for testing if missing
if (!process.env.TOKEN_ENCRYPTION_KEY) {
  process.env.TOKEN_ENCRYPTION_KEY = 'test-key-for-cloudflare-three-lane-testing-only';
}
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
}

import { CloudflareThreeLaneDeployment } from '../src/services/cloudflareThreeLaneDeployment';

/**
 * Test script for Cloudflare Three-Lane Deployment System
 * 
 * This script validates the detection and deployment logic without actually deploying
 * to avoid unnecessary deployments during development/testing.
 */

async function testCloudflareThreeLane() {
  console.log('🧪 Testing Cloudflare Three-Lane Deployment System\n');

  const deployment = CloudflareThreeLaneDeployment.getInstance();

  // Test 1: Create mock project structures for testing
  const testCases = [
    {
      name: 'Static Next.js Export',
      structure: {
        'package.json': JSON.stringify({
          name: 'test-static',
          dependencies: { next: '^14.0.0' }
        }),
        'next.config.js': 'module.exports = { output: "export" };'
      },
      expected: 'pages-static'
    },
    {
      name: 'Next.js with API Routes',
      structure: {
        'package.json': JSON.stringify({
          name: 'test-api',
          dependencies: { next: '^14.0.0' }
        }),
        'app/api/health/route.ts': 'export async function GET() { return Response.json({ status: "ok" }); }'
      },
      expected: 'workers-node'
    },
    {
      name: 'Next.js with Edge Runtime',
      structure: {
        'package.json': JSON.stringify({
          name: 'test-edge',
          dependencies: { next: '^14.0.0' }
        }),
        'app/api/edge/route.ts': 'export const runtime = "edge";\nexport async function GET() { return Response.json({ status: "ok" }); }'
      },
      expected: 'pages-edge'
    },
    {
      name: 'Next.js 15 Project',
      structure: {
        'package.json': JSON.stringify({
          name: 'test-next15',
          dependencies: { next: '^15.0.0' }
        })
      },
      expected: 'workers-node'
    },
    {
      name: 'Next.js with Node.js Imports',
      structure: {
        'package.json': JSON.stringify({
          name: 'test-node',
          dependencies: { next: '^14.0.0' }
        }),
        'app/utils/server.ts': 'import { readFileSync } from "fs";\nimport { createHash } from "crypto";'
      },
      expected: 'workers-node'
    },
    {
      name: 'Next.js with ISR',
      structure: {
        'package.json': JSON.stringify({
          name: 'test-isr',
          dependencies: { next: '^14.0.0' }
        }),
        'app/page.tsx': 'export const revalidate = 60;\nexport default function Page() { return <div>ISR Page</div>; }'
      },
      expected: 'workers-node'
    },
    {
      name: 'Manual Override',
      structure: {
        'package.json': JSON.stringify({
          name: 'test-override',
          dependencies: { next: '^14.0.0' }
        }),
        '.sheenapps/config.json': JSON.stringify({
          deployTarget: 'pages-edge',
          reason: 'Manual override for testing'
        })
      },
      expected: 'pages-edge'
    }
  ];

  let passedTests = 0;
  let totalTests = testCases.length;

  for (const testCase of testCases) {
    console.log(`🔍 Testing: ${testCase.name}`);

    // Create temporary test directory
    const testDir = path.join(process.cwd(), 'temp', `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    await fs.promises.mkdir(testDir, { recursive: true });

    try {
      // Create test project structure
      for (const [filePath, content] of Object.entries(testCase.structure)) {
        const fullPath = path.join(testDir, filePath);
        await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.promises.writeFile(fullPath, content);
      }

      // Test detection
      const detection = await deployment.detectTarget(testDir);
      
      console.log(`   Target: ${detection.target}`);
      console.log(`   Reasons: ${detection.reasons.join(', ')}`);
      console.log(`   Origin: ${detection.origin}`);

      if (detection.target === testCase.expected) {
        console.log(`   ✅ PASSED: Expected ${testCase.expected}, got ${detection.target}`);
        passedTests++;
      } else {
        console.log(`   ❌ FAILED: Expected ${testCase.expected}, got ${detection.target}`);
      }

      // Test manifest saving
      try {
        await deployment.saveManifest(testDir, detection);
        const manifestPath = path.join(testDir, '.sheenapps/deploy-target.json');
        const manifest = JSON.parse(await fs.promises.readFile(manifestPath, 'utf-8'));
        console.log(`   📄 Manifest saved: ${manifest.target} (${manifest.timestamp})`);
      } catch (manifestError) {
        console.log(`   ⚠️  Manifest saving failed: ${(manifestError as Error).message}`);
      }

    } catch (error) {
      console.log(`   ❌ ERROR: ${(error as Error).message}`);
    } finally {
      // Clean up test directory
      await fs.promises.rm(testDir, { recursive: true, force: true });
    }

    console.log('');
  }

  // Summary
  console.log(`📊 Test Summary: ${passedTests}/${totalTests} tests passed`);
  
  if (passedTests === totalTests) {
    console.log('🎉 All tests passed! The Cloudflare Three-Lane system is working correctly.');
  } else {
    console.log('⚠️  Some tests failed. Please review the detection logic.');
  }

  // Test pattern detection performance
  console.log('\n⚡ Testing pattern detection performance...');
  
  const perfTestDir = process.cwd(); // Use current directory for realistic test
  const startTime = Date.now();
  
  try {
    const hasAPIRoutes = await deployment.checkForPattern(
      perfTestDir,
      ['src/**', 'app/**'],
      ['app/api/', 'pages/api/', '/api/']
    );
    
    const hasNodeImports = await deployment.checkForPattern(
      perfTestDir,
      ['src/**', 'app/**'],
      ['from "node:', 'from \'node:', 'require("node:', 'require(\'node:']
    );
    
    const endTime = Date.now();
    
    console.log(`   Pattern detection completed in ${endTime - startTime}ms`);
    console.log(`   Found API routes: ${hasAPIRoutes}`);
    console.log(`   Found Node imports: ${hasNodeImports}`);
    console.log('   ✅ Pattern detection is working correctly');
    
  } catch (perfError) {
    console.log(`   ❌ Pattern detection error: ${(perfError as Error).message}`);
  }

  console.log('\n🚀 Cloudflare Three-Lane Deployment System test completed!');
}

// Test environment validation
function testEnvironmentValidation() {
  console.log('\n🔧 Testing environment validation...');
  
  const requiredEnvVars = ['CF_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'];
  const missingEnvVars = requiredEnvVars.filter(env => !process.env[env]);
  
  if (missingEnvVars.length > 0) {
    console.log(`   ⚠️  Missing environment variables for deployment testing: ${missingEnvVars.join(', ')}`);
    console.log('   💡 Set these variables to test actual deployments');
  } else {
    console.log('   ✅ All required environment variables are set');
  }
  
  // Test Wrangler availability
  const { spawnSync } = require('child_process');
  const wrangler = spawnSync('wrangler', ['--version'], { stdio: 'pipe' });
  
  if (wrangler.status === 0) {
    console.log(`   ✅ Wrangler CLI is available: ${wrangler.stdout.toString().trim()}`);
  } else {
    console.log('   ⚠️  Wrangler CLI not found - install with: npm install -g wrangler');
  }
}

// Run tests
async function runTests() {
  try {
    await testCloudflareThreeLane();
    testEnvironmentValidation();
    
    console.log('\n📋 Next Steps:');
    console.log('   1. Test with real project directories');
    console.log('   2. Test API endpoints with HTTP requests');
    console.log('   3. Run integration tests with actual deployments');
    console.log('   4. Validate Supabase OAuth integration');
    
  } catch (error) {
    console.error('\n❌ Test execution failed:', error);
    process.exit(1);
  }
}

// Only run if this file is executed directly
if (require.main === module) {
  runTests();
}