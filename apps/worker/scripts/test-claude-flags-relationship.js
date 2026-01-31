const { spawn, execSync } = require('child_process');

console.log('=== Testing Claude CLI Flag Relationships ===\n');

const tests = [
  {
    name: 'Test 1: Just prompt (positional argument)',
    args: ['Say hello']
  },
  {
    name: 'Test 2: With -p flag',
    args: ['-p', 'Say hello']
  },
  {
    name: 'Test 3: With --print flag',
    args: ['--print', 'Say hello']
  },
  {
    name: 'Test 4: With --output-format stream-json (no -p)',
    args: ['--output-format', 'stream-json', 'Say hello']
  },
  {
    name: 'Test 5: With -p and --output-format stream-json',
    args: ['-p', 'Say hello', '--output-format', 'stream-json']
  },
  {
    name: 'Test 6: With -p, --output-format stream-json, and --verbose',
    args: ['-p', 'Say hello', '--output-format', 'stream-json', '--verbose']
  },
  {
    name: 'Test 7: With --print, --output-format stream-json, and --verbose',
    args: ['--print', 'Say hello', '--output-format', 'stream-json', '--verbose']
  },
  {
    name: 'Test 8: Prompt at end with all flags',
    args: ['--print', '--output-format', 'stream-json', '--verbose', 'Say hello']
  }
];

let testIndex = 0;

function runNextTest() {
  if (testIndex >= tests.length) {
    console.log('\n=== Summary ===');
    console.log('Check which combinations work to understand the correct usage.');
    return;
  }
  
  const test = tests[testIndex++];
  console.log(`\n${test.name}`);
  console.log(`Command: claude ${test.args.join(' ')}`);
  
  const claude = spawn('/opt/homebrew/bin/claude', test.args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 5000
  });
  
  let stdout = '';
  let stderr = '';
  let gotOutput = false;
  
  claude.stdout.on('data', (data) => {
    gotOutput = true;
    stdout += data.toString();
    console.log(`[STDOUT] Got ${data.length} bytes`);
    
    // For stream-json, try to parse first line
    if (test.args.includes('stream-json')) {
      const firstLine = data.toString().split('\n')[0];
      if (firstLine.trim()) {
        try {
          const parsed = JSON.parse(firstLine);
          console.log(`[PARSED] Type: ${parsed.type}, Subtype: ${parsed.subtype || 'none'}`);
        } catch (e) {
          console.log(`[RAW] ${firstLine.substring(0, 100)}`);
        }
      }
    } else {
      console.log(`[CONTENT] ${data.toString().substring(0, 100).replace(/\n/g, '\\n')}`);
    }
  });
  
  claude.stderr.on('data', (data) => {
    stderr += data.toString();
    console.log(`[STDERR] ${data.toString().trim()}`);
  });
  
  claude.on('exit', (code) => {
    console.log(`Exit code: ${code}, Got output: ${gotOutput}`);
    
    // Run next test after a short delay
    setTimeout(runNextTest, 500);
  });
  
  // Kill after 3 seconds if no exit
  setTimeout(() => {
    if (!claude.killed) {
      console.log('[TIMEOUT] Killing after 3 seconds');
      claude.kill('SIGTERM');
    }
  }, 3000);
}

// Start tests
runNextTest();