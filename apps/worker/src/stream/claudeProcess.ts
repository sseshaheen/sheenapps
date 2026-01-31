import { ChildProcess, spawn } from 'child_process';
import * as path from 'path';
import * as readline from 'readline';
import { PROCESS_TIMEOUTS } from '../config/timeouts.env';
import { PathGuard } from '../services/pathGuard';
import { attachProcessLogging } from '../services/buildLogger';
import { logger } from '../observability/logger';

export class ClaudeStreamProcess {
  private process: ChildProcess | null = null;
  private pathGuard = new PathGuard();

  async spawn(prompt: string, workDir: string, buildId?: string, userId?: string, projectId?: string): Promise<readline.Interface> {
    // CRITICAL: Validate working directory
    if (!this.pathGuard.isProjectDirectory(workDir)) {
      throw new Error(`Invalid working directory: ${workDir}`);
    }

    // Ensure directory exists
    const fs = require('fs');
    if (!fs.existsSync(workDir)) {
      console.error(`[ClaudeStreamProcess] Working directory does not exist: ${workDir}`);
      throw new Error(`Working directory does not exist: ${workDir}`);
    }

    console.log(`[ClaudeStreamProcess] Working directory exists:`, fs.existsSync(workDir));
    console.log(`[ClaudeStreamProcess] Directory contents:`, fs.readdirSync(workDir));

    // Find claude binary - check common locations
    const claudeBinary = await this.findClaudeBinary();

    // Try without -p flag, sending prompt via stdin instead
    const args = [
      '--output-format', 'stream-json',
      '--verbose',
      '--dangerously-skip-permissions'  // Skip permission prompts for automated builds
    ];

    console.log(`[ClaudeStreamProcess] Spawning claude in ${workDir}`);
    console.log(`[ClaudeStreamProcess] Command: ${claudeBinary} ${args.join(' ')}`);
    console.log(`[ClaudeStreamProcess] Process CWD will be: ${workDir}`);
    console.log(`[ClaudeStreamProcess] Current process.cwd(): ${process.cwd()}`);
    
    // Verify the directory exists
    if (!fs.existsSync(workDir)) {
      throw new Error(`Working directory does not exist: ${workDir}`);
    }
    
    // Log directory contents before spawn
    console.log(`[ClaudeStreamProcess] Directory contents before spawn:`);
    const dirContents = fs.readdirSync(workDir);
    console.log(`[ClaudeStreamProcess]   ${dirContents.join(', ') || '(empty)'}`);
    
    // Also log worker directory contents to detect misdirected files
    console.log(`[ClaudeStreamProcess] Worker root directory contents:`);
    const workerContents = fs.readdirSync(process.cwd());
    console.log(`[ClaudeStreamProcess]   ${workerContents.join(', ')}`);

    // Use shell to ensure we're in the right directory
    const shellCommand = `cd "${workDir}" && "${claudeBinary}" ${args.join(' ')}`;
    console.log(`[ClaudeStreamProcess] Shell command: ${shellCommand}`);
    
    this.process = spawn('sh', ['-c', shellCommand], {
      cwd: workDir,  // Still set cwd as backup
      env: {
        ...process.env,
        NODE_ENV: 'production',
        // Ensure HOME is set for claude auth
        HOME: process.env.HOME || '/home/user'
      },
      // Try with different stdio options
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false  // We're already using sh -c
    });

    if (!this.process.stdout) {
      throw new Error('Failed to spawn Claude process - no stdout');
    }

    if (!this.process.stderr) {
      throw new Error('Failed to spawn Claude process - no stderr');
    }

    // Attach per-build logging if parameters are provided
    if (buildId && userId && projectId) {
      try {
        attachProcessLogging(this.process, buildId, userId, projectId, logger);
        console.log(`[ClaudeStreamProcess] Attached per-build logging for build ${buildId}`);
      } catch (error) {
        console.error(`[ClaudeStreamProcess] Failed to attach logging for build ${buildId}:`, error);
        // Continue without logging rather than failing the build
      }
    }

    // Log stderr for debugging with size cap to prevent memory bloat
    const MAX_STDERR_SIZE = 256 * 1024; // 256KB
    let stderrData = '';
    let stderrTruncated = false;
    this.process.stderr.on('data', (data) => {
      const str = data.toString();
      if (!stderrTruncated) {
        if (stderrData.length + str.length > MAX_STDERR_SIZE) {
          stderrData = stderrData.slice(0, MAX_STDERR_SIZE) + '\n[stderr truncated]';
          stderrTruncated = true;
        } else {
          stderrData += str;
        }
      }
      console.error(`[Claude stderr]: ${str}`);
    });

    // Add warning timeout to detect if Claude is stuck
    const warningTimeout = setTimeout(() => {
      if (this.process && !this.process.killed) {
        console.log(`[ClaudeStreamProcess] Warning: Claude still running after 2 minutes. stderr so far:`, stderrData || '(none)');
        console.log(`[ClaudeStreamProcess] Process PID: ${this.process.pid}, killed: ${this.process.killed}`);
      }
    }, PROCESS_TIMEOUTS.claudeWarning);

    // Add hard kill timeout to prevent zombie processes
    const hardKillTimeout = setTimeout(() => {
      if (this.process && !this.process.killed) {
        console.error(`[ClaudeStreamProcess] Hard kill timeout reached (${PROCESS_TIMEOUTS.claudeHardKill}ms). Killing process ${this.process.pid}`);
        this.process.kill('SIGKILL');
      }
    }, PROCESS_TIMEOUTS.claudeHardKill);

    // Clear timeouts when process exits
    this.process.on('close', () => {
      clearTimeout(warningTimeout);
      clearTimeout(hardKillTimeout);
    });

    // Handle process errors
    this.process.on('error', (error) => {
      console.error(`[Claude process error]:`, error);
    });

    // Handle process exit
    this.process.on('exit', (code, signal) => {
      console.log(`[Claude process] Exited with code ${code}, signal ${signal}`);
    });

    // Debug: Log raw stdout data
    let rawDataReceived = false;
    this.process.stdout.on('data', (chunk) => {
      rawDataReceived = true;
      console.log(`[ClaudeStreamProcess] Raw stdout chunk (${chunk.length} bytes):`, chunk.toString().substring(0, 200));
    });

    // Debug: Check if we're getting any data at all (extend timeout)
    setTimeout(() => {
      if (!rawDataReceived) {
        console.log('[ClaudeStreamProcess] No stdout data received after 15 seconds - Claude may be initializing');
      }
    }, 15000);

    // Send prompt via stdin
    if (this.process.stdin) {
      console.log('[ClaudeStreamProcess] Sending prompt via stdin...');
      console.log('[ClaudeStreamProcess] Prompt length:', prompt.length, 'characters');
      console.log('[ClaudeStreamProcess] First 100 chars of prompt:', prompt.substring(0, 100));

      this.process.stdin.write(prompt, (err) => {
        if (err) {
          console.error('[ClaudeStreamProcess] Error writing to stdin:', err);
        } else {
          console.log('[ClaudeStreamProcess] Successfully wrote prompt to stdin');
        }
      });

      this.process.stdin.end(() => {
        console.log('[ClaudeStreamProcess] stdin ended');
      });
    } else {
      console.error('[ClaudeStreamProcess] No stdin available!');
    }

    // Use readline for line-by-line parsing
    return readline.createInterface({
      input: this.process.stdout,
      crlfDelay: Infinity
    });
  }

  private async findClaudeBinary(): Promise<string> {
    const fs = require('fs').promises;

    // Common locations where claude might be installed
    const possiblePaths = [
      '/usr/local/bin/claude',
      '/opt/homebrew/bin/claude',
      '/usr/bin/claude',
      path.join(process.env.HOME || '', '.local', 'bin', 'claude'),
      'claude' // Try PATH
    ];

    for (const claudePath of possiblePaths) {
      try {
        if (claudePath === 'claude') {
          // Just return it and let spawn handle PATH resolution
          return claudePath;
        }
        await fs.access(claudePath, fs.constants.X_OK);
        console.log(`[ClaudeStreamProcess] Found claude at: ${claudePath}`);
        return claudePath;
      } catch {
        // Continue searching
      }
    }

    throw new Error('Claude CLI not found. Please ensure claude is installed and in PATH');
  }

  kill() {
    if (this.process) {
      console.log(`[ClaudeStreamProcess] Killing process ${this.process.pid}`);

      // First try SIGTERM
      this.process.kill('SIGTERM');

      // If process is still alive after 5 seconds, force kill with SIGKILL
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          console.log(`[ClaudeStreamProcess] Process ${this.process.pid} did not terminate with SIGTERM, using SIGKILL`);
          this.process.kill('SIGKILL');
        }
      }, 5000);

      this.process = null;
    }
  }

  getProcess(): ChildProcess | null {
    return this.process;
  }

  async spawnResume(sessionId: string, prompt: string, workDir: string, buildId?: string, userId?: string, projectId?: string): Promise<readline.Interface> {
    // CRITICAL: Validate working directory
    if (!this.pathGuard.isProjectDirectory(workDir)) {
      throw new Error(`Invalid working directory: ${workDir}`);
    }

    // Ensure directory exists
    const fs = require('fs');
    if (!fs.existsSync(workDir)) {
      console.error(`[ClaudeStreamProcess] Working directory does not exist: ${workDir}`);
      throw new Error(`Working directory does not exist: ${workDir}`);
    }

    console.log(`[ClaudeStreamProcess] Resuming session ${sessionId} in ${workDir}`);

    // Find claude binary
    const claudeBinary = await this.findClaudeBinary();

    // Resume session with: claude -r <session-id> --output-format stream-json --verbose --dangerously-skip-permissions
    // Prompt will be passed via stdin to avoid command line parsing issues
    const args = [
      '-r', sessionId,
      '--output-format', 'stream-json',
      '--verbose',
      '--dangerously-skip-permissions'
    ];

    console.log(`[ClaudeStreamProcess] Command: ${claudeBinary} -r ${sessionId} --output-format stream-json --verbose --dangerously-skip-permissions`);
    console.log(`[ClaudeStreamProcess] Prompt length: ${prompt.length} characters (will be sent via stdin)`);

    // Use shell to ensure we're in the right directory for resume too
    const shellCommand = `cd "${workDir}" && "${claudeBinary}" ${args.join(' ')}`;
    console.log(`[ClaudeStreamProcess] Resume shell command: ${shellCommand}`);
    
    this.process = spawn('sh', ['-c', shellCommand], {
      cwd: workDir,  // Still set cwd as backup
      env: {
        ...process.env,
        NODE_ENV: 'production',
        HOME: process.env.HOME || '/home/user'
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false  // We're already using sh -c
    });

    if (!this.process.stdout) {
      throw new Error('Failed to spawn Claude process - no stdout');
    }

    if (!this.process.stderr) {
      throw new Error('Failed to spawn Claude process - no stderr');
    }

    // Attach per-build logging if parameters are provided
    if (buildId && userId && projectId) {
      try {
        attachProcessLogging(this.process, buildId, userId, projectId, logger);
        console.log(`[ClaudeStreamProcess] Attached per-build logging for resumed build ${buildId}`);
      } catch (error) {
        console.error(`[ClaudeStreamProcess] Failed to attach logging for resumed build ${buildId}:`, error);
        // Continue without logging rather than failing the build
      }
    }

    // Log stderr for debugging with size cap to prevent memory bloat
    const MAX_STDERR_SIZE = 256 * 1024; // 256KB
    let stderrData = '';
    let stderrTruncated = false;
    this.process.stderr.on('data', (data) => {
      const str = data.toString();
      if (!stderrTruncated) {
        if (stderrData.length + str.length > MAX_STDERR_SIZE) {
          stderrData = stderrData.slice(0, MAX_STDERR_SIZE) + '\n[stderr truncated]';
          stderrTruncated = true;
        } else {
          stderrData += str;
        }
      }
      console.error(`[Claude stderr]: ${str}`);
    });

    // Add hard kill timeout to prevent zombie processes
    const hardKillTimeout = setTimeout(() => {
      if (this.process && !this.process.killed) {
        console.error(`[ClaudeStreamProcess] Hard kill timeout reached for resumed session. Killing process ${this.process.pid}`);
        this.process.kill('SIGKILL');
      }
    }, PROCESS_TIMEOUTS.claudeHardKill);

    // Handle process errors
    this.process.on('error', (error) => {
      clearTimeout(hardKillTimeout);
      console.error(`[Claude process error]:`, error);
    });

    // Handle process exit
    this.process.on('exit', (code, signal) => {
      clearTimeout(hardKillTimeout);
      console.log(`[Claude process] Exited with code ${code}, signal ${signal}`);
    });

    // Send prompt to stdin
    if (this.process.stdin) {
      console.log('[ClaudeStreamProcess] Sending prompt via stdin...');
      this.process.stdin.write(prompt, (err) => {
        if (err) {
          console.error('[ClaudeStreamProcess] Error writing to stdin:', err);
        } else {
          console.log('[ClaudeStreamProcess] Successfully wrote prompt to stdin');
        }
      });
      this.process.stdin.end(() => {
        console.log('[ClaudeStreamProcess] stdin ended');
      });
    } else {
      console.error('[ClaudeStreamProcess] No stdin available!');
    }

    // Return readline interface
    return readline.createInterface({
      input: this.process.stdout,
      crlfDelay: Infinity
    });
  }
}
