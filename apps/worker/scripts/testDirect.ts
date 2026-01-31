#!/usr/bin/env ts-node

import * as dotenv from 'dotenv';
import { createHmac } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// Force direct mode for this test
process.env.SKIP_QUEUE = 'true';

dotenv.config();

const WORKER_URL = process.env.WORKER_URL || 'http://localhost:3000';
const SHARED_SECRET = process.env.SHARED_SECRET!;

interface TestOptions {
  userId?: string;
  projectId?: string;
  prompt?: string;
  promptFile?: string;
  endpoint?: 'generate' | 'build-preview-for-new-project' | 'rebuild-preview';
  framework?: 'react' | 'nextjs' | 'vue' | 'svelte';
  baseVersionId?: string;
}

// Simple test prompt
const DEFAULT_PROMPT = `Create a simple React component that displays "Hello World" with a blue background`;

// Read prompt from file or stdin
async function readPromptFromFile(filePath: string): Promise<string> {
  if (filePath === '-') {
    // Read from stdin
    return new Promise((resolve, reject) => {
      let data = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', chunk => data += chunk);
      process.stdin.on('end', () => resolve(data.trim()));
      process.stdin.on('error', reject);
    });
  } else {
    // Read from file
    return fs.readFileSync(filePath, 'utf8').trim();
  }
}

async function generateSignature(payload: any): Promise<string> {
  return createHmac('sha256', SHARED_SECRET)
    .update(JSON.stringify(payload))
    .digest('hex');
}

async function testDirect(options: TestOptions = {}) {
  const {
    userId = 'test-user',
    projectId = 'test-project',
    prompt = DEFAULT_PROMPT,
    endpoint = 'build-preview-for-new-project',
    framework = 'react',
    baseVersionId
  } = options;

  console.log(`\n🎯 Testing Direct Mode (No Redis/Queue)`);
  console.log(`📍 Endpoint: ${endpoint}`);
  console.log(`👤 User ID: ${userId}`);
  console.log(`📁 Project ID: ${projectId}`);
  console.log(`🔧 Framework: ${framework}`);
  console.log(`📝 Prompt: ${prompt}\n`);

  const requestBody: any = {
    userId,
    projectId,
    prompt
  };

  if (endpoint === 'build-preview-for-new-project') {
    requestBody.framework = framework;
  } else if (endpoint === 'rebuild-preview' && baseVersionId) {
    requestBody.baseVersionId = baseVersionId;
  }

  const signature = await generateSignature(requestBody);

  try {
    console.log('⏳ Sending request (this will execute synchronously)...\n');
    
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(`${WORKER_URL}/${endpoint}`, {
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

      // Display Claude's response if available
      if (result.claudeResponse) {
        console.log('\n🤖 Claude\'s Response:');
        console.log('─'.repeat(60));
        console.log(result.claudeResponse);
        console.log('─'.repeat(60));
      }

      if (result.deploymentUrl) {
        console.log(`\n🌐 Preview URL: ${result.deploymentUrl}`);
        console.log('Note: The deployment may take a few moments to be fully accessible.');
      }
    } else {
      console.error('❌ Error:', response.status, response.statusText);
      console.error(JSON.stringify(result, null, 2));
    }
  } catch (error: any) {
    console.error('❌ Request failed:', error.message);
  }
}

// Parse command line arguments
async function main() {
  const args = process.argv.slice(2);
  const options: TestOptions = {};

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];

    switch (key) {
      case '--prompt':
      case '-p':
        options.prompt = value;
        break;
      case '--prompt-file':
      case '-f':
        options.promptFile = value;
        break;
      case '--help':
      case '-h':
        console.log(`
Direct Mode Test Script
======================

This script tests the build preview functionality in direct mode,
bypassing Redis/BullMQ and executing builds synchronously.

Usage: npm run test:direct [options]

Options:
  --prompt, -p         Custom prompt (default: simple Hello World component)
  --prompt-file, -f    Read prompt from file (use '-' for stdin)
  --help, -h           Show this help message

Examples:
  # Test with default prompt
  npm run test:direct

  # Test with custom prompt
  npm run test:direct --prompt "Create a landing page with a hero section"

  # Test with prompt from file
  npm run test:direct --prompt-file prompt.txt

  # Test with prompt from stdin
  echo "Create a button component" | npm run test:direct --prompt-file -
  
  # Test with heredoc
  npm run test:direct --prompt-file - <<'EOF'
  Create a React component that displays
  a greeting message with multiple lines
  EOF

Note: This mode is intended for local development only.
In production, builds should use the queue system.
`);
        process.exit(0);
    }
  }

  // Handle prompt-file option
  if (options.promptFile) {
    try {
      options.prompt = await readPromptFromFile(options.promptFile);
      console.log(`📝 Read prompt from ${options.promptFile === '-' ? 'stdin' : options.promptFile}`);
    } catch (error: any) {
      console.error(`❌ Error reading prompt file: ${error.message}`);
      process.exit(1);
    }
  }

  await testDirect(options);
}

// Run the test
main().catch(console.error);