const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('=== Claude CLI Debug Test ===\n');

// Test configuration
const claudeBinary = '/opt/homebrew/bin/claude';
const testPrompt = 'Say just the word "hello" and nothing else';
const testWorkDir = process.cwd();

// Check if Claude exists
if (!fs.existsSync(claudeBinary)) {
  console.error(`Claude CLI not found at: ${claudeBinary}`);
  process.exit(1);
}

console.log('Claude CLI found at:', claudeBinary);
console.log('Working directory:', testWorkDir);
console.log('Environment vars:');
console.log('  CLAUDE_CODE_ENTRYPOINT:', process.env.CLAUDE_CODE_ENTRYPOINT || 'not set');
console.log('  CLAUDECODE:', process.env.CLAUDECODE || 'not set');
console.log('\n');

// Test 1: Using -p flag (should work)
function test1_withPFlag() {
  console.log('Test 1: Using -p flag with stream-json output');
  console.log('Command: claude -p "..." --output-format stream-json --verbose\n');
  
  const claude = spawn(claudeBinary, [
    '-p', testPrompt,
    '--output-format', 'stream-json',
    '--verbose'
  ], {
    cwd: testWorkDir,
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let stdout = '';
  let stderr = '';
  let gotData = false;

  claude.stdout.on('data', (data) => {
    gotData = true;
    stdout += data.toString();
    console.log('  [STDOUT] Received', data.length, 'bytes');
    console.log('  [STDOUT] First 100 chars:', data.toString().substring(0, 100).replace(/\n/g, '\\n'));
  });

  claude.stderr.on('data', (data) => {
    stderr += data.toString();
    console.log('  [STDERR]:', data.toString().trim());
  });

  claude.on('exit', (code, signal) => {
    console.log('\n  Exit code:', code);
    console.log('  Signal:', signal);
    console.log('  Got stdout data:', gotData);
    console.log('  Total stdout length:', stdout.length);
    console.log('\n');
    
    // Run test 2 after test 1 completes
    setTimeout(() => test2_withStdin(), 1000);
  });

  // Kill after 10 seconds if stuck
  setTimeout(() => {
    if (claude.killed === false) {
      console.log('  [TIMEOUT] Killing process after 10 seconds');
      claude.kill('SIGTERM');
    }
  }, 10000);
}

// Test 2: Using stdin (current implementation)
function test2_withStdin() {
  console.log('Test 2: Using stdin with stream-json output');
  console.log('Command: claude --output-format stream-json --verbose');
  console.log('Sending prompt via stdin...\n');
  
  const claude = spawn(claudeBinary, [
    '--output-format', 'stream-json',
    '--verbose'
  ], {
    cwd: testWorkDir,
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let stdout = '';
  let stderr = '';
  let gotData = false;
  let stdinWritten = false;

  claude.stdout.on('data', (data) => {
    gotData = true;
    stdout += data.toString();
    console.log('  [STDOUT] Received', data.length, 'bytes');
    console.log('  [STDOUT] First 100 chars:', data.toString().substring(0, 100).replace(/\n/g, '\\n'));
  });

  claude.stderr.on('data', (data) => {
    stderr += data.toString();
    console.log('  [STDERR]:', data.toString().trim());
  });

  // Send prompt via stdin
  if (claude.stdin) {
    console.log('  [STDIN] Writing prompt...');
    claude.stdin.write(testPrompt);
    claude.stdin.end();
    stdinWritten = true;
  } else {
    console.error('  [ERROR] No stdin available!');
  }

  claude.on('exit', (code, signal) => {
    console.log('\n  Exit code:', code);
    console.log('  Signal:', signal);
    console.log('  Stdin written:', stdinWritten);
    console.log('  Got stdout data:', gotData);
    console.log('  Total stdout length:', stdout.length);
    console.log('\n');
    
    // Run test 3 after test 2 completes
    setTimeout(() => test3_withExec(), 1000);
  });

  // Kill after 10 seconds if stuck
  setTimeout(() => {
    if (claude.killed === false) {
      console.log('  [TIMEOUT] Killing process after 10 seconds');
      claude.kill('SIGTERM');
    }
  }, 10000);
}

// Test 3: Using exec with shell
function test3_withExec() {
  console.log('Test 3: Using exec with shell');
  const command = `echo '${testPrompt}' | ${claudeBinary} --output-format stream-json --verbose`;
  console.log('Command:', command, '\n');
  
  exec(command, { 
    cwd: testWorkDir,
    timeout: 10000 
  }, (error, stdout, stderr) => {
    if (error) {
      console.log('  [ERROR]:', error.message);
      if (error.code) console.log('  Exit code:', error.code);
      if (error.signal) console.log('  Signal:', error.signal);
    }
    
    console.log('  Stdout length:', stdout ? stdout.length : 0);
    if (stdout) {
      console.log('  First 200 chars:', stdout.substring(0, 200).replace(/\n/g, '\\n'));
    }
    
    if (stderr) {
      console.log('  Stderr:', stderr.trim());
    }
    
    console.log('\n');
    
    // Run test 4
    setTimeout(() => test4_interactiveMode(), 1000);
  });
}

// Test 4: Check if Claude expects interactive mode
function test4_interactiveMode() {
  console.log('Test 4: Testing with --no-interactive flag');
  console.log('Command: claude --no-interactive --output-format stream-json --verbose\n');
  
  const claude = spawn(claudeBinary, [
    '--no-interactive',
    '--output-format', 'stream-json',
    '--verbose'
  ], {
    cwd: testWorkDir,
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let stdout = '';
  let stderr = '';
  let gotData = false;

  claude.stdout.on('data', (data) => {
    gotData = true;
    stdout += data.toString();
    console.log('  [STDOUT] Received', data.length, 'bytes');
  });

  claude.stderr.on('data', (data) => {
    stderr += data.toString();
    console.log('  [STDERR]:', data.toString().trim());
  });

  // Send prompt via stdin
  if (claude.stdin) {
    console.log('  [STDIN] Writing prompt...');
    claude.stdin.write(testPrompt + '\n');
    claude.stdin.end();
  }

  claude.on('exit', (code, signal) => {
    console.log('\n  Exit code:', code);
    console.log('  Signal:', signal);
    console.log('  Got stdout data:', gotData);
    console.log('\n');
    
    // Final test
    setTimeout(() => test5_cleanEnv(), 1000);
  });

  // Kill after 10 seconds if stuck
  setTimeout(() => {
    if (claude.killed === false) {
      console.log('  [TIMEOUT] Killing process after 10 seconds');
      claude.kill('SIGTERM');
    }
  }, 10000);
}

// Test 5: Clean environment (remove Claude env vars)
function test5_cleanEnv() {
  console.log('Test 5: Using clean environment (no Claude env vars)');
  console.log('Command: claude -p "..." --output-format stream-json --verbose\n');
  
  const cleanEnv = { ...process.env };
  delete cleanEnv.CLAUDE_CODE_ENTRYPOINT;
  delete cleanEnv.CLAUDECODE;
  
  const claude = spawn(claudeBinary, [
    '-p', testPrompt,
    '--output-format', 'stream-json',
    '--verbose'
  ], {
    cwd: testWorkDir,
    env: cleanEnv,
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let gotData = false;

  claude.stdout.on('data', (data) => {
    gotData = true;
    console.log('  [STDOUT] Received', data.length, 'bytes');
    console.log('  [STDOUT] First 100 chars:', data.toString().substring(0, 100).replace(/\n/g, '\\n'));
  });

  claude.stderr.on('data', (data) => {
    console.log('  [STDERR]:', data.toString().trim());
  });

  claude.on('exit', (code, signal) => {
    console.log('\n  Exit code:', code);
    console.log('  Signal:', signal);
    console.log('  Got stdout data:', gotData);
    console.log('\n=== Test Summary ===');
    console.log('Check which test methods work to determine the issue.');
    console.log('Exit code 143 = SIGTERM (timeout)');
    console.log('Exit code 0 = Success');
  });

  // Kill after 10 seconds if stuck
  setTimeout(() => {
    if (claude.killed === false) {
      console.log('  [TIMEOUT] Killing process after 10 seconds');
      claude.kill('SIGTERM');
    }
  }, 10000);
}

// Start tests
test1_withPFlag();