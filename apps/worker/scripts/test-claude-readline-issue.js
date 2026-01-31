const { spawn } = require('child_process');
const readline = require('readline');

console.log('=== Testing Readline Interface Issue ===\n');

// Test 1: Without readline interface
function testWithoutReadline() {
  console.log('Test 1: Direct stdout monitoring (no readline)');
  
  const claude = spawn('/opt/homebrew/bin/claude', [
    '--output-format', 'stream-json',
    '--verbose'
  ], {
    cwd: process.cwd(),
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  let rawDataReceived = false;
  let dataCount = 0;
  
  // Monitor stdout directly
  claude.stdout.on('data', (chunk) => {
    rawDataReceived = true;
    dataCount++;
    console.log(`  [Direct stdout] Chunk #${dataCount}: ${chunk.length} bytes`);
    console.log(`  [Preview] ${chunk.toString().substring(0, 100)}`);
  });
  
  // Check after 5 seconds
  setTimeout(() => {
    if (!rawDataReceived) {
      console.error('  [CHECK] No stdout data received after 5 seconds');
    } else {
      console.log(`  [CHECK] Received ${dataCount} chunks after 5 seconds`);
    }
  }, 5000);
  
  // Send prompt
  console.log('  Sending prompt via stdin...');
  claude.stdin.write('Say just "hello"');
  claude.stdin.end();
  
  claude.on('exit', (code) => {
    console.log(`  Exit code: ${code}`);
    console.log(`  Total chunks received: ${dataCount}\n`);
    
    setTimeout(() => testWithReadline(), 1000);
  });
  
  // Kill after 10 seconds
  setTimeout(() => {
    if (!claude.killed) {
      claude.kill();
    }
  }, 10000);
}

// Test 2: With readline interface (mimics server implementation)
function testWithReadline() {
  console.log('Test 2: With readline interface (server implementation)');
  
  const claude = spawn('/opt/homebrew/bin/claude', [
    '--output-format', 'stream-json',
    '--verbose'
  ], {
    cwd: process.cwd(),
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  let rawDataReceived = false;
  let dataCount = 0;
  let lineCount = 0;
  
  // Monitor stdout directly BEFORE creating readline
  claude.stdout.on('data', (chunk) => {
    rawDataReceived = true;
    dataCount++;
    console.log(`  [Direct stdout] Chunk #${dataCount}: ${chunk.length} bytes`);
  });
  
  // Create readline interface (this might consume the stream)
  const rl = readline.createInterface({
    input: claude.stdout,
    crlfDelay: Infinity
  });
  
  rl.on('line', (line) => {
    lineCount++;
    console.log(`  [Readline] Line #${lineCount}: ${line.substring(0, 100)}`);
  });
  
  // Check after 5 seconds
  setTimeout(() => {
    if (!rawDataReceived) {
      console.error('  [CHECK] No stdout data received after 5 seconds');
    } else {
      console.log(`  [CHECK] Received ${dataCount} chunks, ${lineCount} lines after 5 seconds`);
    }
  }, 5000);
  
  // Send prompt
  console.log('  Sending prompt via stdin...');
  claude.stdin.write('Say just "hello"');
  claude.stdin.end();
  
  claude.on('exit', (code) => {
    console.log(`  Exit code: ${code}`);
    console.log(`  Total chunks: ${dataCount}, Total lines: ${lineCount}\n`);
    
    setTimeout(() => testReadlineAfterDataHandler(), 1000);
  });
  
  // Kill after 10 seconds
  setTimeout(() => {
    if (!claude.killed) {
      claude.kill();
    }
  }, 10000);
}

// Test 3: Create readline AFTER setting up data handler
function testReadlineAfterDataHandler() {
  console.log('Test 3: Create readline AFTER data handler setup');
  
  const claude = spawn('/opt/homebrew/bin/claude', [
    '--output-format', 'stream-json',
    '--verbose'
  ], {
    cwd: process.cwd(),
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  let rawDataReceived = false;
  let dataCount = 0;
  let lineCount = 0;
  
  // Monitor stdout directly
  claude.stdout.on('data', (chunk) => {
    rawDataReceived = true;
    dataCount++;
    console.log(`  [Direct stdout] Chunk #${dataCount}: ${chunk.length} bytes`);
  });
  
  // Check after 5 seconds
  setTimeout(() => {
    if (!rawDataReceived) {
      console.error('  [CHECK] No stdout data received after 5 seconds');
    } else {
      console.log(`  [CHECK] Received ${dataCount} chunks after 5 seconds`);
    }
  }, 5000);
  
  // Send prompt
  console.log('  Sending prompt via stdin...');
  claude.stdin.write('Say just "hello"');
  claude.stdin.end();
  
  // Create readline interface AFTER sending prompt
  setTimeout(() => {
    console.log('  Creating readline interface...');
    const rl = readline.createInterface({
      input: claude.stdout,
      crlfDelay: Infinity
    });
    
    rl.on('line', (line) => {
      lineCount++;
      console.log(`  [Readline] Line #${lineCount}: ${line.substring(0, 100)}`);
    });
  }, 100);
  
  claude.on('exit', (code) => {
    console.log(`  Exit code: ${code}`);
    console.log(`  Total chunks: ${dataCount}, Total lines: ${lineCount}`);
    
    console.log('\n=== ANALYSIS ===');
    console.log('If Test 1 works but Test 2 fails, readline is consuming the stream');
    console.log('before the data handler can see it. The fix would be to either:');
    console.log('1. Remove the debug data handler, OR');
    console.log('2. Use a PassThrough stream to duplicate the data');
  });
  
  // Kill after 10 seconds
  setTimeout(() => {
    if (!claude.killed) {
      claude.kill();
    }
  }, 10000);
}

// Start tests
testWithoutReadline();