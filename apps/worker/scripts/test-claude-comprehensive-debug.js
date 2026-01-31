const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('=== Comprehensive Claude CLI Debug ===\n');

// 1. Environment check
console.log('1. Environment Check:');
console.log('   Node version:', process.version);
console.log('   Platform:', process.platform);
console.log('   Working directory:', process.cwd());
console.log('   User:', process.env.USER || process.env.USERNAME);
console.log('   Shell:', process.env.SHELL);
console.log('   PATH includes:', process.env.PATH?.split(':').filter(p => p.includes('homebrew') || p.includes('local')).join(', '));

// 2. Claude binary check
console.log('\n2. Claude Binary Check:');
const claudePaths = [
  '/opt/homebrew/bin/claude',
  '/usr/local/bin/claude',
  '/usr/bin/claude'
];

let claudeBinary = null;
for (const path of claudePaths) {
  try {
    if (fs.existsSync(path)) {
      const stats = fs.statSync(path);
      console.log(`   Found at ${path}:`);
      console.log(`     - Size: ${stats.size} bytes`);
      console.log(`     - Executable: ${(stats.mode & 0o111) !== 0}`);
      claudeBinary = path;
      break;
    }
  } catch (e) {
    // Continue
  }
}

if (!claudeBinary) {
  console.log('   ERROR: Claude binary not found!');
  process.exit(1);
}

// 3. Process limits check
console.log('\n3. System Limits:');
try {
  const ulimit = execSync('ulimit -a', { encoding: 'utf8' });
  const relevantLimits = ulimit.split('\n').filter(line => 
    line.includes('open files') || 
    line.includes('processes') || 
    line.includes('pipe size')
  );
  relevantLimits.forEach(line => console.log('   ' + line.trim()));
} catch (e) {
  console.log('   Could not check ulimit');
}

// 4. Test with different spawn options
console.log('\n4. Testing Different Spawn Configurations:\n');

const testConfigs = [
  {
    name: 'Default stdio',
    options: {
      stdio: ['pipe', 'pipe', 'pipe']
    }
  },
  {
    name: 'Inherit stderr',
    options: {
      stdio: ['pipe', 'pipe', 'inherit']
    }
  },
  {
    name: 'With shell',
    options: {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true
    }
  },
  {
    name: 'Detached process',
    options: {
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: true
    }
  },
  {
    name: 'Clean environment',
    options: {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        USER: process.env.USER
      }
    }
  }
];

let configIndex = 0;

function runNextConfig() {
  if (configIndex >= testConfigs.length) {
    console.log('\n=== Final Analysis ===');
    analyzeResults();
    return;
  }
  
  const config = testConfigs[configIndex++];
  console.log(`Test ${configIndex}: ${config.name}`);
  
  const startTime = Date.now();
  const claude = spawn(claudeBinary, [
    '--output-format', 'stream-json',
    '--verbose'
  ], config.options);
  
  let stdout = '';
  let stderr = '';
  let gotData = false;
  let firstDataTime = null;
  
  // Only set up stdout handler if not inherited
  if (config.options.stdio[1] === 'pipe') {
    claude.stdout.on('data', (chunk) => {
      if (!gotData) {
        firstDataTime = Date.now() - startTime;
      }
      gotData = true;
      stdout += chunk.toString();
    });
  }
  
  // Only set up stderr handler if not inherited
  if (config.options.stdio[2] === 'pipe') {
    claude.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
  }
  
  // Send prompt
  if (claude.stdin) {
    claude.stdin.write('Say "test"');
    claude.stdin.end();
  }
  
  claude.on('error', (error) => {
    console.log(`  ERROR: ${error.message}`);
  });
  
  claude.on('exit', (code, signal) => {
    const duration = Date.now() - startTime;
    console.log(`  Exit: code=${code}, signal=${signal}, duration=${duration}ms`);
    console.log(`  Got data: ${gotData}, First data at: ${firstDataTime}ms`);
    if (gotData) {
      console.log(`  Output size: ${stdout.length} bytes`);
    }
    if (stderr) {
      console.log(`  Stderr: ${stderr.substring(0, 100)}`);
    }
    console.log('');
    
    // Clean up detached process
    if (config.options.detached && !claude.killed) {
      try {
        process.kill(-claude.pid);
      } catch (e) {
        // Ignore
      }
    }
    
    setTimeout(runNextConfig, 500);
  });
  
  // Kill after 5 seconds
  setTimeout(() => {
    if (!claude.killed) {
      console.log(`  TIMEOUT: Killing after 5 seconds`);
      if (config.options.detached) {
        try {
          process.kill(-claude.pid, 'SIGTERM');
        } catch (e) {
          claude.kill('SIGTERM');
        }
      } else {
        claude.kill('SIGTERM');
      }
    }
  }, 5000);
}

function analyzeResults() {
  console.log('If all tests timeout with code 143:');
  console.log('- Check if Claude CLI requires authentication');
  console.log('- Check if there are permission issues with the working directory');
  console.log('- Try running claude manually in the terminal to see if it works');
  console.log('- Check system logs (Console.app on macOS) for any security blocks');
  console.log('\nThe issue is likely environmental rather than code-related.');
  console.log('\nRecommended fix for the server:');
  console.log('1. Keep using stdin approach (it works when Claude is properly configured)');
  console.log('2. Add better error handling for the timeout case');
  console.log('3. Log the stderr output to help diagnose issues');
}

// Start tests
runNextConfig();