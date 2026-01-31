const { spawn } = require('child_process');

console.log('Testing Claude CLI with minimal setup...');

// Test 1: Without stream-json
console.log('\nTest 1: Without stream-json (should work)');
const claude1 = spawn('/opt/homebrew/bin/claude', ['-p', 'Say just "hello"', '--print']);

claude1.stdout.on('data', (data) => {
  console.log('STDOUT:', data.toString());
});

claude1.stderr.on('data', (data) => {
  console.log('STDERR:', data.toString());
});

claude1.on('exit', (code) => {
  console.log('Exit code:', code);
  
  // Test 2: With stream-json
  console.log('\nTest 2: With stream-json');
  const claude2 = spawn('/opt/homebrew/bin/claude', [
    '-p', 'Say just "hello"',
    '--output-format', 'stream-json',
    '--verbose'
  ]);
  
  let hasOutput = false;
  
  claude2.stdout.on('data', (data) => {
    hasOutput = true;
    console.log('STDOUT length:', data.length);
    console.log('First 100 chars:', data.toString().substring(0, 100));
  });
  
  claude2.stderr.on('data', (data) => {
    console.log('STDERR:', data.toString());
  });
  
  claude2.on('exit', (code) => {
    console.log('Exit code:', code);
    console.log('Had output:', hasOutput);
  });
  
  // Kill after 5 seconds if no output
  setTimeout(() => {
    if (!hasOutput) {
      console.log('No output after 5 seconds, killing process');
      claude2.kill();
    }
  }, 5000);
});