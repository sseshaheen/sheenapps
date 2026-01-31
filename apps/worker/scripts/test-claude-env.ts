import { spawn } from 'child_process';

async function testClaudeInEnvironment() {
  console.log('Testing Claude CLI in subprocess environment...\n');

  // Test 1: Check PATH
  console.log('1. Checking PATH:');
  try {
    const pathResult = await execCommand('echo $PATH');
    console.log('PATH:', pathResult.stdout);
  } catch (error) {
    console.error('Error getting PATH:', error);
  }

  // Test 2: Check if claude is found
  console.log('\n2. Looking for claude:');
  try {
    const whichResult = await execCommand('which claude');
    console.log('Claude location:', whichResult.stdout.trim());
  } catch (error) {
    console.error('Claude not found in PATH:', error);
  }

  // Test 3: Try running claude with full path
  console.log('\n3. Running claude with full path:');
  try {
    const claudeResult = await execCommand('/opt/homebrew/bin/claude --version');
    console.log('Claude version:', claudeResult.stdout.trim());
  } catch (error) {
    console.error('Error running claude with full path:', error);
  }

  // Test 4: Test the actual command that fails
  console.log('\n4. Testing the actual command:');
  const prompt = "One-line haiku about the ocean";
  try {
    const claudeCmd = `echo "${prompt}" | /opt/homebrew/bin/claude -p --print --output-format json --dangerously-skip-permissions`;
    console.log('Running:', claudeCmd);
    const result = await execCommand(claudeCmd);
    console.log('Success! Output:', result.stdout.substring(0, 200) + '...');
  } catch (error: any) {
    console.error('Failed:', error.message);
  }
}

// Helper function copied from buildWorker.ts
function execCommand(command: string, cwd?: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    console.log(`[execCommand] Running: ${command}`);
    console.log(`[execCommand] CWD: ${cwd || 'default'}`);

    const child = spawn('sh', ['-c', command], {
      cwd,
      env: process.env,
      timeout: 30000,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      console.log(`[execCommand] Process exited with code ${code}`);
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Command failed with code ${code}: ${stderr}`));
      }
    });

    child.on('error', (error) => {
      console.error(`[execCommand] Process error:`, error);
      reject(error);
    });
  });
}

testClaudeInEnvironment().catch(console.error);