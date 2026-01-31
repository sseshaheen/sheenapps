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

async function testSimpleClaude() {
  console.log(`\n🎯 Testing Direct Mode with Real Claude CLI (Simple Prompt)`);
  console.log(`⚠️  This test uses a very simple prompt for quick response\n`);

  const requestBody = {
    userId: 'test-user',
    projectId: 'test-simple-' + Date.now(),
    prompt: 'Create a file named hello.txt with the text "Hello World"',
    framework: 'react'
  };

  const signature = await generateSignature(requestBody);

  try {
    console.log('⏳ Sending simple request to Claude CLI...');
    console.log('📝 Simple Prompt:', requestBody.prompt);
    console.log('');
    
    const startTime = Date.now();
    
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(`${WORKER_URL}/build-preview-for-new-project`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-sheen-signature': signature
      },
      body: JSON.stringify(requestBody),
      // 10 minute timeout for Claude
      signal: AbortSignal.timeout(600000)
    });

    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
    const result = await response.json() as any;

    if (response.ok) {
      console.log(`✅ Success! (took ${elapsedTime} seconds)`);
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
      console.error(`❌ Error after ${elapsedTime} seconds:`, response.status, response.statusText);
      console.error(JSON.stringify(result, null, 2));
      
      if (result.error?.includes('Claude CLI failed')) {
        console.error('\n💡 Make sure Claude CLI is installed and accessible');
        console.error('   Run: claude --version');
      }
    }
  } catch (error: any) {
    console.error('❌ Request failed:', error.message);
    
    if (error.name === 'AbortError') {
      console.error('\n⏱️  Request timed out after 10 minutes');
      console.error('   Claude might be taking too long to respond');
    }
  }
}

// Run the test
testSimpleClaude().catch(console.error);