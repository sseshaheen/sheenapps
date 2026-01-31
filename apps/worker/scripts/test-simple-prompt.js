const { spawn } = require('child_process');
const readline = require('readline');

console.log('Testing with simple single-line prompt...');

const simplePrompt = 'Create a simple hello world HTML file';

const args = [
  '-p', simplePrompt,
  '--output-format', 'stream-json',
  '--verbose'
];

const claude = spawn('/opt/homebrew/bin/claude', args, {
  cwd: process.cwd()
});

// Log stderr
claude.stderr.on('data', (data) => {
  console.error('STDERR:', data.toString());
});

// Log raw stdout
let hasData = false;
claude.stdout.on('data', (chunk) => {
  hasData = true;
  console.log('RAW STDOUT chunk received, length:', chunk.length);
  console.log('First 200 chars:', chunk.toString().substring(0, 200));
});

// Setup readline
const rl = readline.createInterface({
  input: claude.stdout,
  crlfDelay: Infinity
});

let lineCount = 0;
rl.on('line', (line) => {
  lineCount++;
  console.log(`LINE ${lineCount}: ${line.substring(0, 100)}...`);
});

claude.on('exit', (code, signal) => {
  console.log(`Process exited with code ${code}, signal ${signal}`);
  console.log(`Total lines: ${lineCount}, Has data: ${hasData}`);
});

// Timeout
setTimeout(() => {
  if (!hasData) {
    console.error('No data received after 15 seconds');
    claude.kill();
  }
}, 15000);