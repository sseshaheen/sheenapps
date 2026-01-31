const { spawn, execSync } = require('child_process');

console.log('=== Claude CLI Version and Configuration Check ===\n');

// Check version
try {
  console.log('1. Checking Claude version:');
  const version = execSync('/opt/homebrew/bin/claude --version', { encoding: 'utf8' });
  console.log('   Version:', version.trim());
} catch (e) {
  console.log('   Error getting version:', e.message);
}

// Check if it's actually Claude CLI or something else
try {
  console.log('\n2. Checking binary info:');
  const fileInfo = execSync('file /opt/homebrew/bin/claude', { encoding: 'utf8' });
  console.log('   File info:', fileInfo.trim());
  
  const lsInfo = execSync('ls -la /opt/homebrew/bin/claude', { encoding: 'utf8' });
  console.log('   File details:', lsInfo.trim());
} catch (e) {
  console.log('   Error:', e.message);
}

// Check environment
console.log('\n3. Environment variables:');
const envVars = ['CLAUDE_API_KEY', 'ANTHROPIC_API_KEY', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDECODE'];
envVars.forEach(varName => {
  const value = process.env[varName];
  if (value) {
    console.log(`   ${varName}: ${value.substring(0, 10)}...`);
  } else {
    console.log(`   ${varName}: not set`);
  }
});

// Test minimal command
console.log('\n4. Testing minimal Claude command:');
const claude = spawn('/opt/homebrew/bin/claude', ['-p', 'hi'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  timeout: 5000
});

let stdout = '';
let stderr = '';

claude.stdout.on('data', (data) => {
  stdout += data.toString();
});

claude.stderr.on('data', (data) => {
  stderr += data.toString();
});

claude.on('exit', (code) => {
  console.log('   Exit code:', code);
  console.log('   Stdout length:', stdout.length);
  console.log('   Stderr length:', stderr.length);
  
  if (stdout) {
    console.log('   First 200 chars of stdout:', stdout.substring(0, 200));
  }
  
  if (stderr) {
    console.log('   Stderr:', stderr.substring(0, 200));
  }
  
  // Test help output
  testHelp();
});

function testHelp() {
  console.log('\n5. Getting help output to understand usage:');
  
  try {
    const help = execSync('/opt/homebrew/bin/claude --help 2>&1', { 
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    // Extract key information
    const lines = help.split('\n');
    console.log('   Total help lines:', lines.length);
    
    // Look for usage patterns
    const usageLines = lines.filter(line => 
      line.includes('Usage:') || 
      line.includes('usage:') ||
      line.includes('USAGE:')
    );
    
    if (usageLines.length > 0) {
      console.log('\n   Usage patterns found:');
      usageLines.forEach(line => console.log('   ', line.trim()));
    }
    
    // Look for prompt-related flags
    const promptLines = lines.filter(line => 
      line.includes('-p') ||
      line.includes('--prompt') ||
      line.includes('prompt') ||
      line.includes('stdin')
    );
    
    if (promptLines.length > 0) {
      console.log('\n   Prompt-related options:');
      promptLines.slice(0, 5).forEach(line => console.log('   ', line.trim()));
    }
    
    // Look for output format options
    const formatLines = lines.filter(line => 
      line.includes('--output-format') ||
      line.includes('stream-json') ||
      line.includes('format')
    );
    
    if (formatLines.length > 0) {
      console.log('\n   Output format options:');
      formatLines.slice(0, 5).forEach(line => console.log('   ', line.trim()));
    }
    
  } catch (e) {
    console.log('   Error getting help:', e.message);
    if (e.stdout) {
      console.log('   Stdout:', e.stdout.toString().substring(0, 200));
    }
    if (e.stderr) {
      console.log('   Stderr:', e.stderr.toString().substring(0, 200));
    }
  }
}