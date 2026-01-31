import { EventEmitter } from 'events';
import { CodexStreamProcess, CodexSpawnOptions } from '../codexProcess';

// Mock dependencies
jest.mock('child_process', () => ({
  spawn: jest.fn()
}));

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readdirSync: jest.fn(),
  constants: { X_OK: 1 },
  promises: {
    access: jest.fn()
  }
}));

jest.mock('readline', () => ({
  createInterface: jest.fn()
}));

jest.mock('../../services/pathGuard', () => ({
  PathGuard: jest.fn().mockImplementation(() => ({
    isProjectDirectory: jest.fn().mockReturnValue(true)
  }))
}));

jest.mock('../../services/buildLogger', () => ({
  attachProcessLogging: jest.fn()
}));

jest.mock('../../observability/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

// Get mocked modules
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as readline from 'readline';
import { PathGuard } from '../../services/pathGuard';
import { attachProcessLogging } from '../../services/buildLogger';

const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;
const mockExistsSync = fs.existsSync as jest.MockedFunction<typeof fs.existsSync>;
const mockReaddirSync = fs.readdirSync as jest.MockedFunction<typeof fs.readdirSync>;
const mockFsAccess = fs.promises.access as jest.MockedFunction<typeof fs.promises.access>;
const mockCreateInterface = readline.createInterface as jest.MockedFunction<typeof readline.createInterface>;
const mockAttachProcessLogging = attachProcessLogging as jest.MockedFunction<typeof attachProcessLogging>;

/**
 * Create a mock child process with EventEmitter capabilities
 */
function createMockChildProcess() {
  const mockStdin = new EventEmitter() as NodeJS.WritableStream & EventEmitter & {
    write: jest.Mock;
    end: jest.Mock;
  };
  mockStdin.write = jest.fn((data, cb) => {
    if (typeof cb === 'function') cb();
    return true;
  });
  mockStdin.end = jest.fn((cb) => {
    if (typeof cb === 'function') cb();
    return mockStdin;
  }) as any;

  const mockStdout = new EventEmitter();
  const mockStderr = new EventEmitter();

  const mockProcess = new EventEmitter() as any;
  mockProcess.stdin = mockStdin;
  mockProcess.stdout = mockStdout;
  mockProcess.stderr = mockStderr;
  mockProcess.pid = 12345;
  mockProcess.killed = false;
  mockProcess.kill = jest.fn((signal?: string) => {
    mockProcess.killed = true;
    mockProcess.emit('exit', signal === 'SIGKILL' ? null : 0, signal || 'SIGTERM');
    return true;
  });

  return mockProcess;
}

/**
 * Create a mock readline interface
 */
function createMockReadlineInterface() {
  const mockInterface = new EventEmitter() as any;
  mockInterface.close = jest.fn();
  return mockInterface;
}

describe('CodexStreamProcess', () => {
  let codexProcess: CodexStreamProcess;
  let mockChildProcess: ReturnType<typeof createMockChildProcess>;
  let mockReadline: ReturnType<typeof createMockReadlineInterface>;

  const defaultOptions: CodexSpawnOptions = {
    prompt: 'Build a React app',
    workDir: '/tmp/builds/project-123'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockChildProcess = createMockChildProcess();
    mockReadline = createMockReadlineInterface();

    // Default mock implementations
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['package.json', 'src'] as any);
    mockFsAccess.mockRejectedValue(new Error('Not found')); // Will fall back to 'codex' PATH
    mockSpawn.mockReturnValue(mockChildProcess as any);
    mockCreateInterface.mockReturnValue(mockReadline);

    // Reset PathGuard mock
    (PathGuard as any as jest.Mock).mockImplementation(() => ({
      isProjectDirectory: jest.fn().mockReturnValue(true)
    }));

    codexProcess = new CodexStreamProcess();
  });

  afterEach(() => {
    // Clean up all timers
    jest.clearAllTimers();
    jest.useRealTimers();

    // Clean up mock process
    if (mockChildProcess) {
      mockChildProcess.removeAllListeners();
      if (mockChildProcess.stdout) {
        mockChildProcess.stdout.removeAllListeners();
      }
      if (mockChildProcess.stderr) {
        mockChildProcess.stderr.removeAllListeners();
      }
    }
  });

  describe('spawn()', () => {
    describe('Successful Spawning', () => {
      it('spawns codex process with correct command structure', async () => {
        const rl = await codexProcess.spawn(defaultOptions);

        expect(mockSpawn).toHaveBeenCalledTimes(1);
        const cmdArgs = mockSpawn.mock.calls[0]!;
        const [cmd, args] = cmdArgs;
        expect(cmd).toBe('sh');
        expect(args[0]).toBe('-c');
        expect(args[1]).toContain('codex');
        expect(args[1]).toContain('exec');
        expect(args[1]).toContain('--json');
      });

      it('returns readline interface for JSONL parsing', async () => {
        const rl = await codexProcess.spawn(defaultOptions);

        expect(mockCreateInterface).toHaveBeenCalledWith({
          input: mockChildProcess.stdout,
          crlfDelay: Infinity
        });
        expect(rl).toBe(mockReadline);
      });

      it('sets cwd to workDir', async () => {
        await codexProcess.spawn(defaultOptions);

        const spawnOptions = mockSpawn.mock.calls[0]![2]!;
        expect(spawnOptions.cwd).toBe(defaultOptions.workDir);
      });

      it('sets stdio to pipe mode', async () => {
        await codexProcess.spawn(defaultOptions);

        const spawnOptions = mockSpawn.mock.calls[0]![2]!;
        expect(spawnOptions.stdio).toEqual(['pipe', 'pipe', 'pipe']);
      });

      it('writes prompt to stdin', async () => {
        await codexProcess.spawn(defaultOptions);

        expect(mockChildProcess.stdin.write).toHaveBeenCalledWith(
          defaultOptions.prompt,
          expect.any(Function)
        );
        expect(mockChildProcess.stdin.end).toHaveBeenCalled();
      });
    });

    describe('CLI Arguments', () => {
      it('includes --json flag for JSONL output', async () => {
        await codexProcess.spawn(defaultOptions);

        const shellCommand = mockSpawn.mock.calls[0]![1]![1];
        expect(shellCommand).toContain('--json');
      });

      it('includes --cd flag with workDir', async () => {
        await codexProcess.spawn(defaultOptions);

        const shellCommand = mockSpawn.mock.calls[0]![1]![1];
        expect(shellCommand).toContain('--cd');
        expect(shellCommand).toContain(defaultOptions.workDir);
      });

      it('sets approval_policy to never by default', async () => {
        await codexProcess.spawn(defaultOptions);

        const shellCommand = mockSpawn.mock.calls[0]![1]![1];
        expect(shellCommand).toContain('approval_policy="never"');
      });

      it('sets sandbox_mode to workspace-write by default', async () => {
        await codexProcess.spawn(defaultOptions);

        const shellCommand = mockSpawn.mock.calls[0]![1]![1];
        expect(shellCommand).toContain('sandbox_mode="workspace-write"');
      });

      it('includes --skip-git-repo-check by default', async () => {
        await codexProcess.spawn(defaultOptions);

        const shellCommand = mockSpawn.mock.calls[0]![1]![1];
        expect(shellCommand).toContain('--skip-git-repo-check');
      });

      it('includes model config when specified', async () => {
        await codexProcess.spawn({
          ...defaultOptions,
          model: 'gpt-5.2-codex'
        });

        const shellCommand = mockSpawn.mock.calls[0]![1]![1];
        expect(shellCommand).toContain('model="gpt-5.2-codex"');
      });

      it('respects custom approvalPolicy', async () => {
        await codexProcess.spawn({
          ...defaultOptions,
          approvalPolicy: 'on-failure'
        });

        const shellCommand = mockSpawn.mock.calls[0]![1]![1];
        expect(shellCommand).toContain('approval_policy="on-failure"');
      });

      it('respects custom sandboxMode', async () => {
        await codexProcess.spawn({
          ...defaultOptions,
          sandboxMode: 'off'
        });

        const shellCommand = mockSpawn.mock.calls[0]![1]![1];
        expect(shellCommand).toContain('sandbox_mode="off"');
      });

      it('omits --skip-git-repo-check when disabled', async () => {
        await codexProcess.spawn({
          ...defaultOptions,
          skipGitRepoCheck: false
        });

        const shellCommand = mockSpawn.mock.calls[0]![1]![1];
        expect(shellCommand).not.toContain('--skip-git-repo-check');
      });
    });

    describe('Environment Variables', () => {
      it('sets CODEX_HOME when provided', async () => {
        await codexProcess.spawn({
          ...defaultOptions,
          codexHome: '/tmp/codex-isolation/job-123'
        });

        const spawnOptions = mockSpawn.mock.calls[0]![2]!;
        expect(spawnOptions.env!.CODEX_HOME).toBe('/tmp/codex-isolation/job-123');
      });

      it('sets CODEX_API_KEY when provided', async () => {
        await codexProcess.spawn({
          ...defaultOptions,
          apiKey: 'sk-test-key-123'
        });

        const spawnOptions = mockSpawn.mock.calls[0]![2]!;
        expect(spawnOptions.env!.CODEX_API_KEY).toBe('sk-test-key-123');
      });

      it('preserves NODE_ENV as production', async () => {
        await codexProcess.spawn(defaultOptions);

        const spawnOptions = mockSpawn.mock.calls[0]![2]!;
        expect(spawnOptions.env!.NODE_ENV).toBe('production');
      });

      it('preserves HOME from process.env', async () => {
        const originalHome = process.env.HOME;
        process.env.HOME = '/home/testuser';

        await codexProcess.spawn(defaultOptions);

        const spawnOptions = mockSpawn.mock.calls[0]![2]!;
        expect(spawnOptions.env!.HOME).toBe('/home/testuser');

        process.env.HOME = originalHome;
      });
    });

    describe('Security - Path Validation', () => {
      it('validates workDir with PathGuard', async () => {
        const mockPathGuard = {
          isProjectDirectory: jest.fn().mockReturnValue(true)
        };
        (PathGuard as any as jest.Mock).mockImplementation(() => mockPathGuard);

        codexProcess = new CodexStreamProcess();
        await codexProcess.spawn(defaultOptions);

        expect(mockPathGuard.isProjectDirectory).toHaveBeenCalledWith(defaultOptions.workDir);
      });

      it('rejects invalid working directory', async () => {
        const mockPathGuard = {
          isProjectDirectory: jest.fn().mockReturnValue(false)
        };
        (PathGuard as any as jest.Mock).mockImplementation(() => mockPathGuard);

        codexProcess = new CodexStreamProcess();

        await expect(codexProcess.spawn({
          ...defaultOptions,
          workDir: '/etc/passwd'
        })).rejects.toThrow('Invalid working directory');
      });

      it('throws if working directory does not exist', async () => {
        mockExistsSync.mockReturnValue(false);

        await expect(codexProcess.spawn(defaultOptions)).rejects.toThrow(
          'Working directory does not exist'
        );
      });
    });

    describe('Process Logging', () => {
      it('attaches logging when buildId/userId/projectId provided', async () => {
        await codexProcess.spawn({
          ...defaultOptions,
          buildId: 'build-123',
          userId: 'user-456',
          projectId: 'project-789'
        });

        expect(mockAttachProcessLogging).toHaveBeenCalledWith(
          mockChildProcess,
          'build-123',
          'user-456',
          'project-789',
          expect.any(Object)
        );
      });

      it('does not attach logging when parameters missing', async () => {
        await codexProcess.spawn(defaultOptions);

        expect(mockAttachProcessLogging).not.toHaveBeenCalled();
      });

      it('continues even if logging attachment fails', async () => {
        mockAttachProcessLogging.mockImplementation(() => {
          throw new Error('Logging error');
        });

        // Should not throw
        const rl = await codexProcess.spawn({
          ...defaultOptions,
          buildId: 'build-123',
          userId: 'user-456',
          projectId: 'project-789'
        });

        expect(rl).toBe(mockReadline);
      });
    });

    describe('Error Handling', () => {
      it('throws if stdout is not available', async () => {
        const brokenProcess = createMockChildProcess();
        brokenProcess.stdout = null;
        mockSpawn.mockReturnValue(brokenProcess as any);

        await expect(codexProcess.spawn(defaultOptions)).rejects.toThrow(
          'Failed to spawn Codex process - no stdout'
        );
      });

      it('throws if stderr is not available', async () => {
        const brokenProcess = createMockChildProcess();
        brokenProcess.stderr = null;
        mockSpawn.mockReturnValue(brokenProcess as any);

        await expect(codexProcess.spawn(defaultOptions)).rejects.toThrow(
          'Failed to spawn Codex process - no stderr'
        );
      });
    });
  });

  describe('spawnResume()', () => {
    const threadId = 'th_abc123';

    it('includes --thread flag with threadId', async () => {
      await codexProcess.spawnResume(threadId, defaultOptions);

      const shellCommand = mockSpawn.mock.calls[0]![1]![1];
      expect(shellCommand).toContain('--thread');
      expect(shellCommand).toContain(threadId);
    });

    it('maintains same CLI structure as spawn', async () => {
      await codexProcess.spawnResume(threadId, defaultOptions);

      const shellCommand = mockSpawn.mock.calls[0]![1]![1];
      expect(shellCommand).toContain('exec');
      expect(shellCommand).toContain('--json');
      expect(shellCommand).toContain('--cd');
      expect(shellCommand).toContain('approval_policy');
    });

    it('sends prompt via stdin', async () => {
      await codexProcess.spawnResume(threadId, {
        ...defaultOptions,
        prompt: 'Continue with fixing the tests'
      });

      expect(mockChildProcess.stdin.write).toHaveBeenCalledWith(
        'Continue with fixing the tests',
        expect.any(Function)
      );
    });

    it('validates working directory', async () => {
      const mockPathGuard = {
        isProjectDirectory: jest.fn().mockReturnValue(false)
      };
      (PathGuard as any as jest.Mock).mockImplementation(() => mockPathGuard);

      codexProcess = new CodexStreamProcess();

      await expect(codexProcess.spawnResume(threadId, {
        ...defaultOptions,
        workDir: '/invalid/path'
      })).rejects.toThrow('Invalid working directory');
    });

    it('throws if working directory does not exist', async () => {
      mockExistsSync.mockReturnValue(false);

      await expect(codexProcess.spawnResume(threadId, defaultOptions)).rejects.toThrow(
        'Working directory does not exist'
      );
    });

    it('sets CODEX_HOME for session isolation', async () => {
      await codexProcess.spawnResume(threadId, {
        ...defaultOptions,
        codexHome: '/tmp/codex-home/job-456'
      });

      const spawnOptions = mockSpawn.mock.calls[0]![2]!;
      expect(spawnOptions.env!.CODEX_HOME).toBe('/tmp/codex-home/job-456');
    });

    it('attaches logging when build parameters provided', async () => {
      await codexProcess.spawnResume(threadId, {
        ...defaultOptions,
        buildId: 'build-resume',
        userId: 'user-resume',
        projectId: 'project-resume'
      });

      expect(mockAttachProcessLogging).toHaveBeenCalled();
    });
  });

  describe('findCodexBinary()', () => {
    it('finds codex in /usr/local/bin', async () => {
      mockFsAccess
        .mockRejectedValueOnce(new Error('Not found')) // First path fails
        .mockResolvedValueOnce(undefined); // Second path succeeds

      // Need to spawn to trigger findCodexBinary
      await codexProcess.spawn(defaultOptions);

      // Verify it searched and found a binary (exact path depends on order)
      expect(mockFsAccess).toHaveBeenCalled();
    });

    it('finds codex in Homebrew Apple Silicon path', async () => {
      mockFsAccess
        .mockRejectedValueOnce(new Error('Not found'))
        .mockRejectedValueOnce(new Error('Not found'))
        .mockRejectedValueOnce(new Error('Not found'))
        .mockRejectedValueOnce(new Error('Not found'))
        .mockResolvedValueOnce(undefined); // /opt/homebrew/bin/codex

      await codexProcess.spawn(defaultOptions);

      expect(mockSpawn).toHaveBeenCalled();
    });

    it('falls back to PATH resolution when not found in common locations', async () => {
      mockFsAccess.mockRejectedValue(new Error('Not found'));

      await codexProcess.spawn(defaultOptions);

      const shellCommand = mockSpawn.mock.calls[0]![1]![1];
      // Should use 'codex' for PATH resolution
      expect(shellCommand).toMatch(/["']?codex["']?\s+exec/);
    });
  });

  describe('kill()', () => {
    it('sends SIGTERM to the process', async () => {
      await codexProcess.spawn(defaultOptions);
      codexProcess.kill();

      expect(mockChildProcess.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('sends SIGKILL after 5 seconds if process still alive', async () => {
      mockChildProcess.kill = jest.fn().mockImplementation((signal) => {
        if (signal === 'SIGKILL') {
          mockChildProcess.killed = true;
        }
        // Don't set killed = true for SIGTERM to simulate hung process
        return true;
      });

      await codexProcess.spawn(defaultOptions);
      codexProcess.kill();

      expect(mockChildProcess.kill).toHaveBeenCalledWith('SIGTERM');
      expect(mockChildProcess.kill).not.toHaveBeenCalledWith('SIGKILL');

      // Advance time by 5 seconds
      jest.advanceTimersByTime(5000);

      expect(mockChildProcess.kill).toHaveBeenCalledWith('SIGKILL');
    });

    it('does nothing if no process is running', () => {
      // Don't spawn, just kill
      codexProcess.kill();

      expect(mockChildProcess.kill).not.toHaveBeenCalled();
    });

    it('clears process reference after kill', async () => {
      await codexProcess.spawn(defaultOptions);
      codexProcess.kill();

      expect(codexProcess.getProcess()).toBeNull();
    });
  });

  describe('getProcess()', () => {
    it('returns null before spawning', () => {
      expect(codexProcess.getProcess()).toBeNull();
    });

    it('returns child process after spawning', async () => {
      await codexProcess.spawn(defaultOptions);

      expect(codexProcess.getProcess()).toBe(mockChildProcess);
    });

    it('returns null after killing', async () => {
      await codexProcess.spawn(defaultOptions);
      codexProcess.kill();

      expect(codexProcess.getProcess()).toBeNull();
    });
  });

  describe('Process Event Handling', () => {
    it('handles process error events', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await codexProcess.spawn(defaultOptions);
      mockChildProcess.emit('error', new Error('Process error'));

      expect(consoleSpy).toHaveBeenCalledWith(
        '[Codex process error]:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('handles process exit events', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await codexProcess.spawn(defaultOptions);
      mockChildProcess.emit('exit', 0, null);

      expect(consoleSpy).toHaveBeenCalledWith(
        '[Codex process] Exited with code 0, signal null'
      );

      consoleSpy.mockRestore();
    });

    it('logs stderr output', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await codexProcess.spawn(defaultOptions);
      mockChildProcess.stderr.emit('data', Buffer.from('Warning: something'));

      expect(consoleSpy).toHaveBeenCalledWith(
        '[Codex stderr]: Warning: something'
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Stdin Handling', () => {
    it('handles stdin write error gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      mockChildProcess.stdin.write = jest.fn((data, cb) => {
        if (typeof cb === 'function') cb(new Error('Write error'));
        return true;
      });

      await codexProcess.spawn(defaultOptions);

      expect(consoleSpy).toHaveBeenCalledWith(
        '[CodexStreamProcess] Error writing to stdin:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('logs when stdin is not available', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const noStdinProcess = createMockChildProcess();
      noStdinProcess.stdin = null;
      mockSpawn.mockReturnValue(noStdinProcess as any);

      // This should throw because of no stdin
      await expect(codexProcess.spawn(defaultOptions)).rejects.toThrow();

      consoleSpy.mockRestore();
    });
  });

  describe('Timeout Warning', () => {
    it('logs warning after timeout period if process still running', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await codexProcess.spawn(defaultOptions);

      // Advance past warning timeout (2 minutes)
      jest.advanceTimersByTime(120000);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Warning: Codex still running'),
        expect.any(String)
      );

      consoleSpy.mockRestore();
    });

    it('includes stderr in warning if available', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await codexProcess.spawn(defaultOptions);

      // Emit some stderr
      mockChildProcess.stderr.emit('data', Buffer.from('Loading model...'));

      // Advance past warning timeout
      jest.advanceTimersByTime(120000);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Warning: Codex still running'),
        expect.stringContaining('Loading model...')
      );

      consoleSpy.mockRestore();
    });
  });
});
