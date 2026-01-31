const { spawn } = require('child_process');

console.log('=== Simple Claude stdin test ===\n');

// First, let's check what Claude CLI help says about stdin
console.log('Checking Claude CLI help for stdin support...\n');

const help = spawn('/opt/homebrew/bin/claude', ['--help'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

let helpOutput = '';
help.stdout.on('data', (data) => {
  helpOutput += data.toString();
});

help.on('exit', () => {
  // Look for stdin-related options
  const lines = helpOutput.split('\n');
  const stdinRelated = lines.filter(line => 
    line.toLowerCase().includes('stdin') || 
    line.toLowerCase().includes('pipe') ||
    line.toLowerCase().includes('input') ||
    line.includes('-p') ||
    line.includes('--prompt')
  );
  
  console.log('Relevant help output:');
  stdinRelated.forEach(line => console.log('  ', line.trim()));
  
  console.log('\n\nNow testing actual stdin usage...\n');
  
  // Test 1: Try piping to Claude without any flags
  testStdinBasic();
});

function testStdinBasic() {
  console.log('Test: echo "hello" | claude');
  
  const claude = spawn('/opt/homebrew/bin/claude', [], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  let stdout = '';
  let stderr = '';
  let gotOutput = false;
  
  claude.stdout.on('data', (data) => {
    gotOutput = true;
    stdout += data.toString();
    console.log('[STDOUT]:', data.toString().trim().substring(0, 100));
  });
  
  claude.stderr.on('data', (data) => {
    stderr += data.toString();
    console.log('[STDERR]:', data.toString().trim());
  });
  
  // Write to stdin
  claude.stdin.write('Say just "hello"\n');
  claude.stdin.end();
  
  claude.on('exit', (code) => {
    console.log('\nExit code:', code);
    console.log('Got output:', gotOutput);
    console.log('Stdout length:', stdout.length);
    
    // Test with stream-json
    setTimeout(() => testStdinStreamJson(), 1000);
  });
  
  setTimeout(() => {
    if (!claude.killed) {
      console.log('[TIMEOUT] Killing after 5 seconds');
      claude.kill();
    }
  }, 5000);
}

function testStdinStreamJson() {
  console.log('\n\nTest: echo "hello" | claude --output-format stream-json');
  
  const claude = spawn('/opt/homebrew/bin/claude', ['--output-format', 'stream-json'], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  let stdout = '';
  let stderr = '';
  let gotOutput = false;
  
  claude.stdout.on('data', (data) => {
    gotOutput = true;
    stdout += data.toString();
    console.log('[STDOUT] Got', data.length, 'bytes');
    
    // Try to parse as JSON lines
    const lines = data.toString().split('\n').filter(l => l.trim());
    lines.forEach(line => {
      try {
        const parsed = JSON.parse(line);
        console.log('[PARSED]:', parsed.type || 'unknown type');
      } catch (e) {
        console.log('[RAW LINE]:', line.substring(0, 100));
      }
    });
  });
  
  claude.stderr.on('data', (data) => {
    stderr += data.toString();
    console.log('[STDERR]:', data.toString().trim());
  });
  
  // Write to stdin
  claude.stdin.write('Say just "hello"\n');
  claude.stdin.end();
  
  claude.on('exit', (code) => {
    console.log('\nExit code:', code);
    console.log('Got output:', gotOutput);
    console.log('Stdout length:', stdout.length);
    
    console.log('\n=== Conclusion ===');
    console.log('If stdin doesn\'t work, you need to use the -p flag instead.');
    console.log('The current implementation needs to be updated to use: claude -p "<prompt>"');
  });
  
  setTimeout(() => {
    if (!claude.killed) {
      console.log('[TIMEOUT] Killing after 5 seconds');
      claude.kill();
    }
  }, 5000);
}