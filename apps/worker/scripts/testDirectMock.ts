#!/usr/bin/env ts-node

import * as dotenv from 'dotenv';
import { createHmac } from 'crypto';

// Force direct mode and mock Claude for this test
process.env.SKIP_QUEUE = 'true';
process.env.MOCK_CLAUDE = 'true';

dotenv.config();

const WORKER_URL = process.env.WORKER_URL || 'http://localhost:3000';
const SHARED_SECRET = process.env.SHARED_SECRET!;

async function generateSignature(payload: any): Promise<string> {
  return createHmac('sha256', SHARED_SECRET)
    .update(JSON.stringify(payload))
    .digest('hex');
}

async function testDirectMock() {
  console.log(`\n🎯 Testing Direct Mode with Mock Claude`);
  console.log(`This test bypasses both Redis/Queue AND Claude API\n`);

  const requestBody = {
    userId: 'test-user',
    projectId: 'test-project',
    prompt: 'Test prompt (will be mocked)',
    framework: 'react'
  };

  const signature = await generateSignature(requestBody);

  try {
    console.log('⏳ Sending request...\n');
    
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(`${WORKER_URL}/build-preview-for-new-project`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-sheen-signature': signature
      },
      body: JSON.stringify(requestBody)
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
    } else {
      console.error('❌ Error:', response.status, response.statusText);
      console.error(JSON.stringify(result, null, 2));
    }
  } catch (error: any) {
    console.error('❌ Request failed:', error.message);
  }
}

// Run the test
testDirectMock().catch(console.error);