const { spawn } = require('child_process');
const readline = require('readline');

console.log('=== Mimicking Server Implementation ===\n');

// This mimics exactly what the server code is doing
function mimicServerImplementation() {
  const claudeBinary = '/opt/homebrew/bin/claude';
  const workDir = process.cwd();
  const prompt = 'Create a simple hello world function in JavaScript';
  
  const args = [
    '--output-format', 'stream-json',
    '--verbose'
  ];
  
  console.log(`Spawning claude in ${workDir}`);
  console.log(`Command: ${claudeBinary} ${args.join(' ')}`);
  console.log('Will send prompt via stdin\n');
  
  const claudeProcess = spawn(claudeBinary, args, {
    cwd: workDir,
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  // Log stderr for debugging
  let stderrData = '';
  claudeProcess.stderr.on('data', (data) => {
    const str = data.toString();
    stderrData += str;
    console.error(`[Claude stderr]: ${str}`);
  });
  
  // Add timeout to detect if Claude is stuck
  setTimeout(() => {
    if (claudeProcess && !claudeProcess.killed) {
      console.error(`[ClaudeStreamProcess] Claude seems stuck after 30s. stderr so far:`, stderrData);
    }
  }, 30000);
  
  // Handle process errors
  claudeProcess.on('error', (error) => {
    console.error(`[Claude process error]:`, error);
  });
  
  // Handle process exit
  claudeProcess.on('exit', (code, signal) => {
    console.log(`[Claude process] Exited with code ${code}, signal ${signal}`);
    
    // After server implementation fails, try with -p flag
    console.log('\n\n=== Now trying with -p flag instead ===\n');
    tryWithPFlag();
  });
  
  // Debug: Log raw stdout data
  let rawDataReceived = false;
  claudeProcess.stdout.on('data', (chunk) => {
    rawDataReceived = true;
    console.log(`[ClaudeStreamProcess] Raw stdout chunk (${chunk.length} bytes):`, chunk.toString().substring(0, 200));
  });
  
  // Debug: Check if we're getting any data at all
  setTimeout(() => {
    if (!rawDataReceived) {
      console.error('[ClaudeStreamProcess] No stdout data received after 5 seconds');
      // Kill the process to move on to the next test
      claudeProcess.kill('SIGTERM');
    }
  }, 5000);
  
  // Send prompt via stdin (THIS IS THE PROBLEMATIC PART)
  if (claudeProcess.stdin) {
    console.log('[ClaudeStreamProcess] Sending prompt via stdin...');
    claudeProcess.stdin.write(prompt);
    claudeProcess.stdin.end();
  }
  
  // Use readline for line-by-line parsing
  const rl = readline.createInterface({
    input: claudeProcess.stdout,
    crlfDelay: Infinity
  });
  
  rl.on('line', (line) => {
    console.log('[Readline] Got line:', line);
  });
}

// Alternative implementation using -p flag
function tryWithPFlag() {
  const claudeBinary = '/opt/homebrew/bin/claude';
  const workDir = process.cwd();
  const prompt = 'Create a simple hello world function in JavaScript';
  
  const args = [
    '-p', prompt,  // USE -p FLAG INSTEAD OF STDIN
    '--output-format', 'stream-json',
    '--verbose'
  ];
  
  console.log(`Spawning claude in ${workDir}`);
  console.log(`Command: ${claudeBinary} ${args.map(a => a.includes(' ') ? `"${a}"` : a).join(' ')}`);
  
  const claudeProcess = spawn(claudeBinary, args, {
    cwd: workDir,
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  // Log stderr
  claudeProcess.stderr.on('data', (data) => {
    console.error(`[Claude stderr]: ${data.toString()}`);
  });
  
  // Handle process exit
  claudeProcess.on('exit', (code, signal) => {
    console.log(`[Claude process] Exited with code ${code}, signal ${signal}`);
    
    console.log('\n=== CONCLUSION ===');
    console.log('The server implementation needs to be updated to use the -p flag');
    console.log('instead of trying to send the prompt via stdin.');
    console.log('\nRequired change in claudeProcess.ts:');
    console.log('1. Add prompt to args array: args.push("-p", prompt)');
    console.log('2. Remove the stdin.write() code');
  });
  
  // Log stdout data
  let gotData = false;
  claudeProcess.stdout.on('data', (chunk) => {
    gotData = true;
    console.log(`[With -p flag] Got stdout (${chunk.length} bytes)`);
    
    // Try to parse as JSON lines
    const lines = chunk.toString().split('\n').filter(l => l.trim());
    lines.forEach(line => {
      try {
        const msg = JSON.parse(line);
        console.log(`[Parsed message] Type: ${msg.type}`);
      } catch (e) {
        // Not JSON, log as is
        if (line.trim()) {
          console.log(`[Raw line] ${line.substring(0, 100)}`);
        }
      }
    });
  });
  
  // Check if we got data
  setTimeout(() => {
    if (!gotData) {
      console.error('[With -p flag] No stdout data received after 5 seconds');
      claudeProcess.kill('SIGTERM');
    }
  }, 5000);
}

// Start the test
mimicServerImplementation();