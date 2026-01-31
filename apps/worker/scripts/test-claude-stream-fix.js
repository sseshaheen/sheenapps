const { spawn } = require('child_process');

console.log('Testing Claude CLI with stdin closed...');

const args = [
  '-p', 'Create a simple hello world HTML file',
  '--output-format', 'stream-json'
];

const claude = spawn('/opt/homebrew/bin/claude', args, {
  cwd: process.cwd(),
  env: process.env,
  stdio: ['ignore', 'pipe', 'pipe'] // Close stdin
});

// Log stderr
claude.stderr.on('data', (data) => {
  console.error('STDERR:', data.toString());
});

// Log stdout
claude.stdout.on('data', (chunk) => {
  console.log('STDOUT:', chunk.toString());
});

claude.on('exit', (code, signal) => {
  console.log(`Process exited with code ${code}, signal ${signal}`);
});

// Test with pipe instead
setTimeout(() => {
  console.log('\nTesting with pipe to file...');
  
  const fs = require('fs');
  const outStream = fs.createWriteStream('claude-output.json');
  
  const claude2 = spawn('/opt/homebrew/bin/claude', args, {
    cwd: process.cwd(),
    env: process.env
  });
  
  claude2.stdout.pipe(outStream);
  
  claude2.stderr.on('data', (data) => {
    console.error('STDERR2:', data.toString());
  });
  
  claude2.on('exit', (code) => {
    console.log(`Process 2 exited with code ${code}`);
    
    // Check if file has content
    const content = fs.readFileSync('claude-output.json', 'utf8');
    console.log('File content length:', content.length);
    if (content.length > 0) {
      console.log('First 200 chars:', content.substring(0, 200));
    }
  });
}, 5000);