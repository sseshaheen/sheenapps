const { spawn } = require('child_process');
const readline = require('readline');

const testDir = '/Users/sh/projects/test-claude-stream';
const fs = require('fs');

// Create test directory
if (!fs.existsSync(testDir)) {
  fs.mkdirSync(testDir, { recursive: true });
}

console.log('Testing Claude CLI stream output...');
console.log('Working directory:', testDir);

const args = [
  '-p', 'Create a simple hello world HTML file',
  '--output-format', 'stream-json'
];

const claude = spawn('/opt/homebrew/bin/claude', args, {
  cwd: testDir,
  env: process.env
});

if (!claude.stdout) {
  console.error('Failed to get stdout');
  process.exit(1);
}

// Log stderr
claude.stderr.on('data', (data) => {
  console.error('STDERR:', data.toString());
});

// Log raw stdout
let hasData = false;
claude.stdout.on('data', (chunk) => {
  hasData = true;
  console.log('RAW STDOUT:', chunk.toString());
});

// Setup readline
const rl = readline.createInterface({
  input: claude.stdout,
  crlfDelay: Infinity
});

let lineCount = 0;
rl.on('line', (line) => {
  lineCount++;
  console.log(`LINE ${lineCount}:`, line);
});

claude.on('exit', (code, signal) => {
  console.log(`Process exited with code ${code}, signal ${signal}`);
  console.log(`Total lines: ${lineCount}, Has data: ${hasData}`);
});

claude.on('error', (err) => {
  console.error('Process error:', err);
});

// Timeout
setTimeout(() => {
  if (!hasData) {
    console.error('No data received after 30 seconds, killing process');
    claude.kill();
  }
}, 30000);