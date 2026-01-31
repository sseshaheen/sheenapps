import { ChildProcess, spawn } from 'child_process';
import * as path from 'path';
import * as readline from 'readline';
import * as fs from 'fs';
import { PROCESS_TIMEOUTS } from '../config/timeouts.env';
import { PathGuard } from '../services/pathGuard';
import { attachProcessLogging } from '../services/buildLogger';
import { logger } from '../observability/logger';

/**
 * Configuration options for Codex process spawning
 */
export interface CodexSpawnOptions {
  prompt: string;
  workDir: string;
  buildId?: string;
  userId?: string;
  projectId?: string;

  // Codex-specific options
  model?: string;  // e.g., 'gpt-5.2-codex', 'gpt-5.1-codex-max'
  approvalPolicy?: 'untrusted' | 'on-failure' | 'on-request' | 'never';
  sandboxMode?: 'off' | 'workspace-write' | 'workspace-full';
  skipGitRepoCheck?: boolean;
  codexHome?: string;  // Custom CODEX_HOME for isolation
  apiKey?: string;  // CODEX_API_KEY for API key auth
}

/**
 * CodexStreamProcess - Spawn and manage Codex CLI processes
 *
 * Handles non-interactive execution via `codex exec --json` with:
 * - Binary discovery (NPM, Homebrew, PATH)
 * - CODEX_HOME isolation per job
 * - Security constraints (approval_policy, sandbox_mode)
 * - Git repo requirement bypass
 */
export class CodexStreamProcess {
  private process: ChildProcess | null = null;
  private pathGuard = new PathGuard();
  private killTimeout: NodeJS.Timeout | null = null;
  private debugTimeout: NodeJS.Timeout | null = null;
  private warningTimeout: NodeJS.Timeout | null = null;

  /**
   * Spawn a new Codex exec process
   */
  async spawn(options: CodexSpawnOptions): Promise<readline.Interface> {
    const {
      prompt,
      workDir,
      buildId,
      userId,
      projectId,
      model,
      approvalPolicy = 'never',  // Default to non-interactive
      sandboxMode = 'workspace-write',  // Default to safe sandbox
      skipGitRepoCheck = true,  // Default to skip for ephemeral workspaces
      codexHome,
      apiKey
    } = options;

    // CRITICAL: Validate working directory
    if (!this.pathGuard.isProjectDirectory(workDir)) {
      throw new Error(`Invalid working directory: ${workDir}`);
    }

    // Ensure directory exists
    if (!fs.existsSync(workDir)) {
      console.error(`[CodexStreamProcess] Working directory does not exist: ${workDir}`);
      throw new Error(`Working directory does not exist: ${workDir}`);
    }

    console.log(`[CodexStreamProcess] Working directory exists:`, fs.existsSync(workDir));
    console.log(`[CodexStreamProcess] Directory contents:`, fs.readdirSync(workDir));

    // Find codex binary
    const codexBinary = await this.findCodexBinary();

    // Build arguments for codex exec
    const args = this.buildExecArgs({
      ...(model && { model }),
      approvalPolicy,
      sandboxMode,
      skipGitRepoCheck,
      workDir
    });

    console.log(`[CodexStreamProcess] Spawning codex exec in ${workDir}`);
    console.log(`[CodexStreamProcess] Command: ${codexBinary} ${args.join(' ')}`);
    console.log(`[CodexStreamProcess] Process CWD will be: ${workDir}`);

    // Build environment
    const env = this.buildEnvironment({
      ...(codexHome && { codexHome }),
      ...(apiKey && { apiKey })
    });

    // Use shell to ensure we're in the right directory
    const shellCommand = `cd "${workDir}" && "${codexBinary}" ${args.join(' ')}`;
    console.log(`[CodexStreamProcess] Shell command: ${shellCommand}`);

    this.process = spawn('sh', ['-c', shellCommand], {
      cwd: workDir,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false  // We're already using sh -c
    });

    if (!this.process.stdout) {
      throw new Error('Failed to spawn Codex process - no stdout');
    }

    if (!this.process.stderr) {
      throw new Error('Failed to spawn Codex process - no stderr');
    }

    // Attach per-build logging if parameters are provided
    if (buildId && userId && projectId) {
      try {
        attachProcessLogging(this.process, buildId, userId, projectId, logger);
        console.log(`[CodexStreamProcess] Attached per-build logging for build ${buildId}`);
      } catch (error) {
        console.error(`[CodexStreamProcess] Failed to attach logging for build ${buildId}:`, error);
        // Continue without logging rather than failing the build
      }
    }

    // Log stderr for debugging (keep separate from stdout per plan requirements)
    let stderrData = '';
    this.process.stderr.on('data', (data) => {
      const str = data.toString();
      stderrData += str;
      console.error(`[Codex stderr]: ${str}`);
    });

    // Add timeout to detect if Codex is stuck
    this.warningTimeout = setTimeout(() => {
      if (this.process && !this.process.killed) {
        console.log(`[CodexStreamProcess] Warning: Codex still running after 2 minutes. stderr so far:`, stderrData || '(none)');
        console.log(`[CodexStreamProcess] Process PID: ${this.process.pid}, killed: ${this.process.killed}`);
      }
      this.warningTimeout = null;
    }, PROCESS_TIMEOUTS.claudeWarning);
    // Unref so it doesn't prevent process exit in tests
    this.warningTimeout.unref();

    // Handle process errors
    this.process.on('error', (error) => {
      console.error(`[Codex process error]:`, error);
    });

    // Handle process exit
    this.process.on('exit', (code, signal) => {
      console.log(`[Codex process] Exited with code ${code}, signal ${signal}`);
    });

    // Debug: Log raw stdout data
    let rawDataReceived = false;
    this.process.stdout.on('data', (chunk) => {
      rawDataReceived = true;
      console.log(`[CodexStreamProcess] Raw stdout chunk (${chunk.length} bytes):`, chunk.toString().substring(0, 200));
    });

    // Debug: Check if we're getting any data at all
    this.debugTimeout = setTimeout(() => {
      if (!rawDataReceived) {
        console.log('[CodexStreamProcess] No stdout data received after 15 seconds - Codex may be initializing');
      }
      this.debugTimeout = null;
    }, 15000);
    // Unref so it doesn't prevent process exit in tests
    this.debugTimeout.unref();

    // Send prompt via stdin
    if (this.process.stdin) {
      console.log('[CodexStreamProcess] Sending prompt via stdin...');
      console.log('[CodexStreamProcess] Prompt length:', prompt.length, 'characters');
      console.log('[CodexStreamProcess] First 100 chars of prompt:', prompt.substring(0, 100));

      this.process.stdin.write(prompt, (err) => {
        if (err) {
          console.error('[CodexStreamProcess] Error writing to stdin:', err);
        } else {
          console.log('[CodexStreamProcess] Successfully wrote prompt to stdin');
        }
      });

      this.process.stdin.end(() => {
        console.log('[CodexStreamProcess] stdin ended');
      });
    } else {
      console.error('[CodexStreamProcess] No stdin available!');
      throw new Error('Failed to spawn Codex process - no stdin');
    }

    // Use readline for line-by-line parsing (JSONL format)
    return readline.createInterface({
      input: this.process.stdout,
      crlfDelay: Infinity
    });
  }

  /**
   * Build exec arguments for codex exec
   */
  private buildExecArgs(options: {
    model?: string | undefined;
    approvalPolicy: string;
    sandboxMode: string;
    skipGitRepoCheck: boolean;
    workDir: string;
  }): string[] {
    const args = ['exec', '--json'];

    // Set working directory explicitly
    args.push('--cd', options.workDir);

    // Model selection
    if (options.model) {
      args.push('-c', `model="${options.model}"`);
    }

    // Approval policy - critical for non-interactive operation
    args.push('-c', `approval_policy="${options.approvalPolicy}"`);

    // Sandbox mode for security
    args.push('-c', `sandbox_mode="${options.sandboxMode}"`);

    // Skip git repo check for ephemeral workspaces
    if (options.skipGitRepoCheck) {
      args.push('--skip-git-repo-check');
    }

    return args;
  }

  /**
   * Build environment variables for Codex process
   */
  private buildEnvironment(options: {
    codexHome?: string | undefined;
    apiKey?: string | undefined;
  }): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: 'production',
      HOME: process.env.HOME || '/home/user'
    };

    // CODEX_HOME isolation per job
    if (options.codexHome) {
      env.CODEX_HOME = options.codexHome;
      console.log('[CodexStreamProcess] Using custom CODEX_HOME', options.codexHome);
    }

    // CODEX_API_KEY for API key auth (not OPENAI_API_KEY per expert feedback)
    if (options.apiKey) {
      env.CODEX_API_KEY = options.apiKey;
      console.log(`[CodexStreamProcess] Using API key authentication`);
    }

    return env;
  }

  /**
   * Find codex binary - check common installation locations
   */
  private async findCodexBinary(): Promise<string> {
    const fsPromises = fs.promises;

    // Common locations where codex might be installed
    // Priority: NPM global, Homebrew, user local, PATH
    const possiblePaths = [
      // NPM global installs
      '/usr/local/bin/codex',
      '/usr/bin/codex',
      // Homebrew (Intel Mac)
      '/usr/local/opt/codex/bin/codex',
      // Homebrew (Apple Silicon)
      '/opt/homebrew/bin/codex',
      '/opt/homebrew/opt/codex/bin/codex',
      // User local install
      path.join(process.env.HOME || '', '.local', 'bin', 'codex'),
      // Cargo install (Codex is Rust-based)
      path.join(process.env.HOME || '', '.cargo', 'bin', 'codex'),
      // NPM npx location
      path.join(process.env.HOME || '', '.npm', '_npx', 'codex'),
      // Try PATH resolution
      'codex'
    ];

    for (const codexPath of possiblePaths) {
      try {
        if (codexPath === 'codex') {
          // Just return it and let spawn handle PATH resolution
          console.log(`[CodexStreamProcess] Falling back to PATH resolution for codex`);
          return codexPath;
        }
        await fsPromises.access(codexPath, fs.constants.X_OK);
        console.log(`[CodexStreamProcess] Found codex at: ${codexPath}`);
        return codexPath;
      } catch {
        // Continue searching
      }
    }

    throw new Error('Codex CLI not found. Please install codex (npm install -g @openai/codex or via Homebrew)');
  }

  /**
   * Kill the running process
   */
  kill(): void {
    // Clear any pending timeouts
    if (this.killTimeout) {
      clearTimeout(this.killTimeout);
      this.killTimeout = null;
    }
    if (this.debugTimeout) {
      clearTimeout(this.debugTimeout);
      this.debugTimeout = null;
    }
    if (this.warningTimeout) {
      clearTimeout(this.warningTimeout);
      this.warningTimeout = null;
    }

    if (this.process) {
      const proc = this.process;
      console.log(`[CodexStreamProcess] Killing process ${proc.pid}`);

      // First try SIGTERM
      proc.kill('SIGTERM');

      // If process is still alive after 5 seconds, force kill with SIGKILL
      this.killTimeout = setTimeout(() => {
        if (!proc.killed) {
          console.log(`[CodexStreamProcess] Process ${proc.pid} did not terminate with SIGTERM, using SIGKILL`);
          proc.kill('SIGKILL');
        }
        this.killTimeout = null;
      }, 5000);

      // Unref the timeout so it doesn't prevent process exit in tests
      this.killTimeout.unref();

      this.process = null;
    }
  }

  /**
   * Get the underlying child process
   */
  getProcess(): ChildProcess | null {
    return this.process;
  }

  /**
   * Resume a previous Codex session
   * Note: Codex uses thread_id for session continuity
   */
  async spawnResume(
    threadId: string,
    options: CodexSpawnOptions
  ): Promise<readline.Interface> {
    const {
      prompt,
      workDir,
      buildId,
      userId,
      projectId,
      model,
      approvalPolicy = 'never',
      sandboxMode = 'workspace-write',
      skipGitRepoCheck = true,
      codexHome,
      apiKey
    } = options;

    // CRITICAL: Validate working directory
    if (!this.pathGuard.isProjectDirectory(workDir)) {
      throw new Error(`Invalid working directory: ${workDir}`);
    }

    if (!fs.existsSync(workDir)) {
      console.error(`[CodexStreamProcess] Working directory does not exist: ${workDir}`);
      throw new Error(`Working directory does not exist: ${workDir}`);
    }

    console.log(`[CodexStreamProcess] Resuming thread ${threadId} in ${workDir}`);

    const codexBinary = await this.findCodexBinary();

    // Build arguments for resume
    const args = ['exec', '--json'];
    args.push('--cd', workDir);
    args.push('--thread', threadId);  // Resume existing thread

    if (model) {
      args.push('-c', `model="${model}"`);
    }
    args.push('-c', `approval_policy="${approvalPolicy}"`);
    args.push('-c', `sandbox_mode="${sandboxMode}"`);

    if (skipGitRepoCheck) {
      args.push('--skip-git-repo-check');
    }

    console.log(`[CodexStreamProcess] Command: ${codexBinary} ${args.join(' ')}`);
    console.log(`[CodexStreamProcess] Prompt length: ${prompt.length} characters (will be sent via stdin)`);

    const env = this.buildEnvironment({
      ...(codexHome && { codexHome }),
      ...(apiKey && { apiKey })
    });
    const shellCommand = `cd "${workDir}" && "${codexBinary}" ${args.join(' ')}`;
    console.log(`[CodexStreamProcess] Resume shell command: ${shellCommand}`);

    this.process = spawn('sh', ['-c', shellCommand], {
      cwd: workDir,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false
    });

    if (!this.process.stdout) {
      throw new Error('Failed to spawn Codex process - no stdout');
    }

    if (!this.process.stderr) {
      throw new Error('Failed to spawn Codex process - no stderr');
    }

    // Attach per-build logging if parameters are provided
    if (buildId && userId && projectId) {
      try {
        attachProcessLogging(this.process, buildId, userId, projectId, logger);
        console.log(`[CodexStreamProcess] Attached per-build logging for resumed build ${buildId}`);
      } catch (error) {
        console.error(`[CodexStreamProcess] Failed to attach logging for resumed build ${buildId}:`, error);
      }
    }

    // Log stderr for debugging
    this.process.stderr.on('data', (data) => {
      const str = data.toString();
      console.error(`[Codex stderr]: ${str}`);
    });

    // Handle process errors
    this.process.on('error', (error) => {
      console.error(`[Codex process error]:`, error);
    });

    // Handle process exit
    this.process.on('exit', (code, signal) => {
      console.log(`[Codex process] Exited with code ${code}, signal ${signal}`);
    });

    // Send prompt to stdin
    if (this.process.stdin) {
      console.log('[CodexStreamProcess] Sending prompt via stdin...');
      this.process.stdin.write(prompt, (err) => {
        if (err) {
          console.error('[CodexStreamProcess] Error writing to stdin:', err);
        } else {
          console.log('[CodexStreamProcess] Successfully wrote prompt to stdin');
        }
      });
      this.process.stdin.end(() => {
        console.log('[CodexStreamProcess] stdin ended');
      });
    } else {
      console.error('[CodexStreamProcess] No stdin available!');
      throw new Error('Failed to spawn Codex process - no stdin');
    }

    return readline.createInterface({
      input: this.process.stdout,
      crlfDelay: Infinity
    });
  }
}
