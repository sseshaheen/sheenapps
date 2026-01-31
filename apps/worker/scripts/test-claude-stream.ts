#!/usr/bin/env npx tsx

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { ClaudeSession } from '../src/stream';

async function testClaudeStream() {
  console.log('Testing Claude Stream Implementation...\n');

  // Create a test project directory in the allowed location
  const testProjectPath = path.join(os.homedir(), 'projects', 'test-user', `stream-test-${Date.now()}`);
  await fs.mkdir(testProjectPath, { recursive: true });

  console.log(`Created test directory: ${testProjectPath}`);

  // Create a simple prompt
  const prompt = `Create a simple React component called HelloWorld that displays "Hello from Claude Stream!" with some basic styling.

Requirements:
- Use TypeScript (.tsx file)
- Include some CSS-in-JS styling
- Make it colorful and centered
- Export it as default`;

  const session = new ClaudeSession();

  try {
    console.log('\nStarting AI session...');
    const result = await session.run(
      prompt,
      testProjectPath,
      'test-build-' + Date.now(),
      60000 // 1 minute timeout for test
    );

    console.log('\n=== Session Result ===');
    console.log('Success:', result.success);
    console.log('Session ID:', result.sessionId);
    console.log('Result:', result.result);
    if (result.error) {
      console.log('Error:', result.error);
    }
    if (result.totalCost !== undefined) {
      console.log('Cost: $', result.totalCost.toFixed(4));
    }
    if (result.tokenUsage) {
      console.log('Tokens - Input:', result.tokenUsage.input, 'Output:', result.tokenUsage.output);
    }

    // Check if files were created
    console.log('\n=== Files Created ===');
    const files = await fs.readdir(testProjectPath);
    for (const file of files) {
      const stats = await fs.stat(path.join(testProjectPath, file));
      console.log(`- ${file} (${stats.size} bytes)`);
    }

    // Read and display the created component if it exists
    const expectedFile = 'HelloWorld.tsx';
    const componentPath = path.join(testProjectPath, expectedFile);
    try {
      const content = await fs.readFile(componentPath, 'utf8');
      console.log(`\n=== Content of ${expectedFile} ===`);
      console.log(content);
    } catch (err) {
      console.log(`\nFile ${expectedFile} not found`);
    }

  } catch (error) {
    console.error('\nTest failed:', error);
  }
}

// Run the test
testClaudeStream().catch(console.error);
