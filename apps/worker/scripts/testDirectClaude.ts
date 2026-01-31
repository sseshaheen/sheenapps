#!/usr/bin/env ts-node

import * as dotenv from 'dotenv';
import { createHmac } from 'crypto';

// Force direct mode but use real Claude CLI
process.env.SKIP_QUEUE = 'true';
// Explicitly ensure MOCK_CLAUDE is not set
delete process.env.MOCK_CLAUDE;

dotenv.config();

const WORKER_URL = process.env.WORKER_URL || 'http://localhost:3000';
const SHARED_SECRET = process.env.SHARED_SECRET!;

async function generateSignature(payload: any): Promise<string> {
  return createHmac('sha256', SHARED_SECRET)
    .update(JSON.stringify(payload))
    .digest('hex');
}

async function testDirectWithClaude() {
  console.log(`\n🎯 Testing Direct Mode with Real Claude CLI`);
  console.log(`⚠️  This requires Claude to be installed and configured\n`);

  const requestBody = {
    userId: 'test-user',
    projectId: 'test-claude-' + Date.now(),
    prompt: 'Create a simple webpage with a centered heading that says "Hello from Claude" and a light blue background',
    framework: 'react'
  };

  const signature = await generateSignature(requestBody);

  try {
    console.log('⏳ Sending request to spawn Claude CLI...\n');
    console.log('🔍 Watch for Claude CLI execution in the logs');
    console.log('📝 Prompt:', requestBody.prompt);
    console.log('');
    
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(`${WORKER_URL}/build-preview-for-new-project`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-sheen-signature': signature
      },
      body: JSON.stringify(requestBody),
      // Increase timeout since Claude might take a while
      signal: AbortSignal.timeout(300000) // 5 minute timeout
    });

    const result = await response.json() as any;

    if (response.ok) {
      console.log('✅ Success!');
      console.log(JSON.stringify(result, null, 2));
      console.log('\n📋 Summary:');
      console.log(`- Job ID: ${result.jobId}`);
      console.log(`- Version ID: ${result.versionId}`);
      console.log(`- Status: ${result.status}`);
      if (result.deploymentUrl) {
        console.log(`- Preview URL: ${result.deploymentUrl}`);
      }
      
      // Show the generated files location
      console.log(`\n📁 Generated files location:`);
      console.log(`~/projects/${requestBody.userId}/${requestBody.projectId}/`);
    } else {
      console.error('❌ Error:', response.status, response.statusText);
      console.error(JSON.stringify(result, null, 2));
      
      if (result.error?.includes('Claude CLI failed')) {
        console.error('\n💡 Make sure Claude CLI is installed and accessible');
        console.error('   Run: claude --version');
      }
    }
  } catch (error: any) {
    console.error('❌ Request failed:', error.message);
    
    if (error.name === 'AbortError') {
      console.error('\n⏱️  Request timed out after 5 minutes');
      console.error('   Claude might be taking too long to respond');
    }
  }
}

// Run the test
testDirectWithClaude().catch(console.error);