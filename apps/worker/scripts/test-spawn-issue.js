const { exec, spawn } = require('child_process');

console.log('Environment check:');
console.log('CLAUDE_CODE_ENTRYPOINT:', process.env.CLAUDE_CODE_ENTRYPOINT);
console.log('CLAUDECODE:', process.env.CLAUDECODE);

// Try with exec instead of spawn
console.log('\nTrying with exec...');
exec('/opt/homebrew/bin/claude -p "Say hello" --output-format stream-json --verbose', 
  { timeout: 5000 },
  (error, stdout, stderr) => {
    console.log('Exec result:');
    console.log('Error:', error);
    console.log('Stdout length:', stdout ? stdout.length : 0);
    console.log('Stderr:', stderr);
    
    if (stdout) {
      console.log('First 200 chars of stdout:', stdout.substring(0, 200));
    }
  }
);

// Also try unsetting Claude env vars
console.log('\nTrying spawn with clean env...');
const cleanEnv = { ...process.env };
delete cleanEnv.CLAUDE_CODE_ENTRYPOINT;
delete cleanEnv.CLAUDECODE;

const claude = spawn('/opt/homebrew/bin/claude', [
  '-p', 'Say hello',
  '--output-format', 'stream-json',
  '--verbose'
], {
  env: cleanEnv,
  timeout: 5000
});

let gotData = false;
claude.stdout.on('data', (data) => {
  gotData = true;
  console.log('Got data from clean env spawn:', data.length, 'bytes');
});

claude.on('exit', (code) => {
  console.log('Clean env spawn exit code:', code);
  console.log('Got data:', gotData);
});