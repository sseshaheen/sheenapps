const { spawn } = require('child_process');
const fs = require('fs');

console.log('=== Testing Claude Interactive vs Print Mode ===\n');

// First, let's create a test directory to ensure we have proper permissions
const testDir = './test-claude-workspace';
if (!fs.existsSync(testDir)) {
  fs.mkdirSync(testDir, { recursive: true });
}

console.log('Test directory:', testDir);
console.log('Current directory:', process.cwd());
console.log('Environment:', {
  CLAUDE_CODE_ENTRYPOINT: process.env.CLAUDE_CODE_ENTRYPOINT ? 'set' : 'not set',
  CLAUDECODE: process.env.CLAUDECODE ? 'set' : 'not set'
});

// Test 1: Interactive mode (no flags) with stdin
function testInteractiveMode() {
  console.log('\n1. Testing interactive mode (no flags):');
  console.log('   Sending prompt via stdin after spawn...\n');
  
  const claude = spawn('/opt/homebrew/bin/claude', [], {
    cwd: testDir,
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  let stdout = '';
  let gotOutput = false;
  
  claude.stdout.on('data', (data) => {
    gotOutput = true;
    stdout += data.toString();
    console.log('   [STDOUT]', data.length, 'bytes');
    
    // Check if it's waiting for input
    const str = data.toString();
    if (str.includes('Welcome') || str.includes('Type') || str.includes('>')) {
      console.log('   [INFO] Claude is in interactive mode, sending prompt...');
      // Send prompt after a short delay
      setTimeout(() => {
        claude.stdin.write('Say just "hello"\n');
      }, 100);
    }
  });
  
  claude.stderr.on('data', (data) => {
    console.log('   [STDERR]', data.toString().trim());
  });
  
  // Kill after 3 seconds and move to next test
  setTimeout(() => {
    console.log('   Killing process...');
    claude.kill();
    console.log('   Got output:', gotOutput);
    console.log('   Output length:', stdout.length);
    
    // Test 2
    setTimeout(testPrintModeQuoted, 1000);
  }, 3000);
}

// Test 2: Print mode with properly quoted prompt
function testPrintModeQuoted() {
  console.log('\n2. Testing print mode with quoted prompt:');
  console.log('   Command: claude -p "Say just hello"\n');
  
  const claude = spawn('/opt/homebrew/bin/claude', ['-p', 'Say just hello'], {
    cwd: testDir,
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  let stdout = '';
  let gotOutput = false;
  
  claude.stdout.on('data', (data) => {
    gotOutput = true;
    stdout += data.toString();
    console.log('   [STDOUT]', data.length, 'bytes:', data.toString().substring(0, 100));
  });
  
  claude.stderr.on('data', (data) => {
    console.log('   [STDERR]', data.toString().trim());
  });
  
  claude.on('exit', (code) => {
    console.log('   Exit code:', code);
    console.log('   Got output:', gotOutput);
    
    // Test 3
    setTimeout(testStreamJsonVerbose, 1000);
  });
  
  // Kill after 5 seconds if needed
  setTimeout(() => {
    if (!claude.killed) {
      console.log('   [TIMEOUT] Killing after 5 seconds');
      claude.kill();
    }
  }, 5000);
}

// Test 3: Stream JSON with verbose
function testStreamJsonVerbose() {
  console.log('\n3. Testing stream-json with verbose (no print flag):');
  console.log('   Sending prompt via stdin...\n');
  
  const claude = spawn('/opt/homebrew/bin/claude', [
    '--output-format', 'stream-json',
    '--verbose'
  ], {
    cwd: testDir,
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  let stdout = '';
  let gotOutput = false;
  let sentPrompt = false;
  
  claude.stdout.on('data', (data) => {
    gotOutput = true;
    stdout += data.toString();
    console.log('   [STDOUT]', data.length, 'bytes');
    
    // Try to parse first line as JSON
    const lines = data.toString().split('\n').filter(l => l.trim());
    if (lines.length > 0) {
      try {
        const msg = JSON.parse(lines[0]);
        console.log('   [JSON] type:', msg.type, 'subtype:', msg.subtype || 'none');
        
        // If we get init message, send the prompt
        if (msg.type === 'system' && msg.subtype === 'init' && !sentPrompt) {
          console.log('   [INFO] Got init message, sending prompt...');
          sentPrompt = true;
          claude.stdin.write('Say just "hello"\n');
          claude.stdin.end();
        }
      } catch (e) {
        console.log('   [RAW]', lines[0].substring(0, 50));
      }
    }
  });
  
  claude.stderr.on('data', (data) => {
    console.log('   [STDERR]', data.toString().trim());
  });
  
  // Send prompt immediately
  setTimeout(() => {
    if (!sentPrompt) {
      console.log('   [INFO] Sending prompt proactively...');
      sentPrompt = true;
      claude.stdin.write('Say just "hello"\n');
      claude.stdin.end();
    }
  }, 500);
  
  claude.on('exit', (code) => {
    console.log('   Exit code:', code);
    console.log('   Got output:', gotOutput);
    console.log('   Total output length:', stdout.length);
    
    // Summary
    console.log('\n=== FINDINGS ===');
    console.log('The issue appears to be that Claude CLI in "print" mode (-p flag)');
    console.log('may have authentication or environment issues.');
    console.log('Interactive mode with stdin works, but print mode times out.');
    console.log('\nThe server implementation should stick with stdin approach');
    console.log('but ensure proper handling of the interactive session.');
  });
  
  // Kill after 5 seconds if needed
  setTimeout(() => {
    if (!claude.killed) {
      console.log('   [TIMEOUT] Killing after 5 seconds');
      claude.kill();
    }
  }, 5000);
}

// Start tests
testInteractiveMode();