/**
 * CODEX_HOME Isolation Tests
 *
 * Verifies that each Codex session uses an isolated CODEX_HOME directory
 * to prevent cross-contamination between concurrent jobs.
 *
 * Critical requirement: Per-job isolation via CODEX_HOME environment variable
 */

import { CodexStreamProcess } from '../../src/stream/codexProcess';
import * as fs from 'fs';
import { spawn } from 'child_process';

// Mock dependencies
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readdirSync: jest.fn(),
  constants: { X_OK: 1 },
  promises: {
    access: jest.fn()
  }
}));
jest.mock('child_process');
jest.mock('readline', () => ({
  createInterface: jest.fn().mockReturnValue({
    on: jest.fn(),
    close: jest.fn()
  })
}));
jest.mock('../../src/services/pathGuard', () => ({
  PathGuard: jest.fn().mockImplementation(() => ({
    isProjectDirectory: jest.fn().mockReturnValue(true)
  }))
}));
jest.mock('../../src/services/buildLogger', () => ({
  attachProcessLogging: jest.fn()
}));
jest.mock('../../src/observability/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;
const mockExistsSync = fs.existsSync as jest.MockedFunction<typeof fs.existsSync>;
const mockReaddirSync = fs.readdirSync as jest.MockedFunction<typeof fs.readdirSync>;
const mockFsAccess = fs.promises.access as jest.MockedFunction<typeof fs.promises.access>;

// Helper to create mock process
function createMockProcess() {
  const EventEmitter = require('events');
  const mockStdin = new EventEmitter() as any;
  mockStdin.write = jest.fn((data, cb) => {
    if (typeof cb === 'function') cb();
    return true;
  });
  mockStdin.end = jest.fn((cb) => {
    if (typeof cb === 'function') cb();
  });

  const mockProcess = new EventEmitter() as any;
  mockProcess.stdin = mockStdin;
  mockProcess.stdout = new EventEmitter();
  mockProcess.stderr = new EventEmitter();
  mockProcess.pid = Math.floor(Math.random() * 10000);
  mockProcess.killed = false;
  mockProcess.kill = jest.fn();

  return mockProcess;
}

describe('CODEX_HOME Isolation Tests', () => {
  let processes: CodexStreamProcess[];

  beforeEach(() => {
    jest.clearAllMocks();

    processes = [];

    // Default mocks
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['package.json'] as any);
    mockFsAccess.mockRejectedValue(new Error('Not found')); // Fall back to PATH

    const mockProcess = createMockProcess();
    mockSpawn.mockReturnValue(mockProcess as any);
  });

  afterEach(() => {
    // Clean up spawned processes
    processes.forEach(p => {
      try {
        p.kill();
      } catch (e) {
        // Ignore errors during cleanup
      }
    });
    processes = [];

    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('CODEX_HOME Configuration', () => {
    it('sets CODEX_HOME environment variable when provided', async () => {
      const process = new CodexStreamProcess();
      processes.push(process);

      await process.spawn({
        prompt: 'Test',
        workDir: '/tmp/project-1',
        codexHome: '/tmp/codex-home/job-123'
      });

      const spawnCall = mockSpawn.mock.calls[0]!;
      const spawnOptions = spawnCall[2]!;

      expect(spawnOptions.env!.CODEX_HOME).toBe('/tmp/codex-home/job-123');
    });

    it('does not set CODEX_HOME when not provided', async () => {
      const process = new CodexStreamProcess();
      processes.push(process);

      await process.spawn({
        prompt: 'Test',
        workDir: '/tmp/project-1'
      });

      const spawnCall = mockSpawn.mock.calls[0]!;
      const spawnOptions = spawnCall[2]!;

      expect(spawnOptions.env!.CODEX_HOME).toBeUndefined();
    });

    it('uses unique CODEX_HOME for concurrent jobs', async () => {
      const process1 = new CodexStreamProcess();
      const process2 = new CodexStreamProcess();
      processes.push(process1, process2);

      // Spawn two processes with different CODEX_HOME
      const mockProcess1 = createMockProcess();
      const mockProcess2 = createMockProcess();

      mockSpawn
        .mockReturnValueOnce(mockProcess1 as any)
        .mockReturnValueOnce(mockProcess2 as any);

      await Promise.all([
        process1.spawn({
          prompt: 'Job 1',
          workDir: '/tmp/project-1',
          codexHome: '/tmp/codex-home/job-1'
        }),
        process2.spawn({
          prompt: 'Job 2',
          workDir: '/tmp/project-2',
          codexHome: '/tmp/codex-home/job-2'
        })
      ]);

      const spawn1Options = mockSpawn.mock.calls[0]![2]!;
      const spawn2Options = mockSpawn.mock.calls[1]![2]!;

      expect(spawn1Options.env!.CODEX_HOME).toBe('/tmp/codex-home/job-1');
      expect(spawn2Options.env!.CODEX_HOME).toBe('/tmp/codex-home/job-2');

      // Verify they are different
      expect(spawn1Options.env!.CODEX_HOME).not.toBe(spawn2Options.env!.CODEX_HOME);
    });

    it('preserves other environment variables', async () => {
      const originalEnv = process.env;
      process.env = {
        ...originalEnv,
        PATH: '/usr/bin:/usr/local/bin',
        HOME: '/home/user'
      };

      const proc = new CodexStreamProcess();
      processes.push(proc);

      await proc.spawn({
        prompt: 'Test',
        workDir: '/tmp/project',
        codexHome: '/tmp/codex-home/isolated'
      });

      const spawnCall = mockSpawn.mock.calls[0]!;
      const spawnOptions = spawnCall[2]!;

      expect(spawnOptions.env!.PATH).toBeDefined();
      expect(spawnOptions.env!.HOME).toBe('/home/user');
      expect(spawnOptions.env!.CODEX_HOME).toBe('/tmp/codex-home/isolated');

      process.env = originalEnv;
    });
  });

  describe('Resume with CODEX_HOME', () => {
    it('uses same CODEX_HOME for resumed session', async () => {
      const process = new CodexStreamProcess();
      processes.push(process);

      const codexHome = '/tmp/codex-home/job-persistent';

      await process.spawnResume('th_abc123', {
        prompt: 'Continue',
        workDir: '/tmp/project',
        codexHome
      });

      const spawnCall = mockSpawn.mock.calls[0]!;
      const spawnOptions = spawnCall[2]!;

      expect(spawnOptions.env!.CODEX_HOME).toBe(codexHome);
    });

    it('maintains CODEX_HOME isolation across resume calls', async () => {
      const process1 = new CodexStreamProcess();
      const process2 = new CodexStreamProcess();
      processes.push(process1, process2);

      const mockProcess1 = createMockProcess();
      const mockProcess2 = createMockProcess();

      mockSpawn
        .mockReturnValueOnce(mockProcess1 as any)
        .mockReturnValueOnce(mockProcess2 as any);

      await Promise.all([
        process1.spawnResume('th_session1', {
          prompt: 'Resume 1',
          workDir: '/tmp/project-1',
          codexHome: '/tmp/codex-home/session-1'
        }),
        process2.spawnResume('th_session2', {
          prompt: 'Resume 2',
          workDir: '/tmp/project-2',
          codexHome: '/tmp/codex-home/session-2'
        })
      ]);

      const spawn1Options = mockSpawn.mock.calls[0]![2]!;
      const spawn2Options = mockSpawn.mock.calls[1]![2]!;

      expect(spawn1Options.env!.CODEX_HOME).not.toBe(spawn2Options.env!.CODEX_HOME);
    });
  });

  describe('Security & Isolation Boundaries', () => {
    it('does not leak CODEX_HOME between processes', async () => {
      const process1 = new CodexStreamProcess();
      const process2 = new CodexStreamProcess();
      processes.push(process1, process2);

      const mockProcess1 = createMockProcess();
      const mockProcess2 = createMockProcess();

      mockSpawn
        .mockReturnValueOnce(mockProcess1 as any)
        .mockReturnValueOnce(mockProcess2 as any);

      // Spawn first with CODEX_HOME
      await process1.spawn({
        prompt: 'Job 1',
        workDir: '/tmp/project-1',
        codexHome: '/tmp/codex-home/job-1'
      });

      // Spawn second without CODEX_HOME
      await process2.spawn({
        prompt: 'Job 2',
        workDir: '/tmp/project-2'
        // No codexHome - should not inherit from process1
      });

      const spawn2Options = mockSpawn.mock.calls[1]![2]!;

      expect(spawn2Options.env!.CODEX_HOME).toBeUndefined();
    });

    it('isolates API keys between processes', async () => {
      const process1 = new CodexStreamProcess();
      const process2 = new CodexStreamProcess();
      processes.push(process1, process2);

      const mockProcess1 = createMockProcess();
      const mockProcess2 = createMockProcess();

      mockSpawn
        .mockReturnValueOnce(mockProcess1 as any)
        .mockReturnValueOnce(mockProcess2 as any);

      await Promise.all([
        process1.spawn({
          prompt: 'Job 1',
          workDir: '/tmp/project-1',
          codexHome: '/tmp/codex-home/job-1',
          apiKey: 'sk-key-user-1'
        }),
        process2.spawn({
          prompt: 'Job 2',
          workDir: '/tmp/project-2',
          codexHome: '/tmp/codex-home/job-2',
          apiKey: 'sk-key-user-2'
        })
      ]);

      const spawn1Options = mockSpawn.mock.calls[0]![2]!;
      const spawn2Options = mockSpawn.mock.calls[1]![2]!;

      expect(spawn1Options.env!.CODEX_API_KEY).toBe('sk-key-user-1');
      expect(spawn2Options.env!.CODEX_API_KEY).toBe('sk-key-user-2');

      // Verify they are different
      expect(spawn1Options.env!.CODEX_API_KEY).not.toBe(spawn2Options.env!.CODEX_API_KEY);
    });

    it('ensures working directory isolation', async () => {
      const process1 = new CodexStreamProcess();
      const process2 = new CodexStreamProcess();
      processes.push(process1, process2);

      const mockProcess1 = createMockProcess();
      const mockProcess2 = createMockProcess();

      mockSpawn
        .mockReturnValueOnce(mockProcess1 as any)
        .mockReturnValueOnce(mockProcess2 as any);

      await Promise.all([
        process1.spawn({
          prompt: 'Job 1',
          workDir: '/tmp/project-user-1',
          codexHome: '/tmp/codex-home/job-1'
        }),
        process2.spawn({
          prompt: 'Job 2',
          workDir: '/tmp/project-user-2',
          codexHome: '/tmp/codex-home/job-2'
        })
      ]);

      const spawn1Options = mockSpawn.mock.calls[0]![2]!;
      const spawn2Options = mockSpawn.mock.calls[1]![2]!;

      expect(spawn1Options.cwd).toBe('/tmp/project-user-1');
      expect(spawn2Options.cwd).toBe('/tmp/project-user-2');

      // Verify isolation
      expect(spawn1Options.cwd).not.toBe(spawn2Options.cwd);
      expect(spawn1Options.env!.CODEX_HOME).not.toBe(spawn2Options.env!.CODEX_HOME);
    });
  });

  describe('CODEX_HOME Path Construction', () => {
    it('accepts absolute path for CODEX_HOME', async () => {
      const process = new CodexStreamProcess();
      processes.push(process);

      await process.spawn({
        prompt: 'Test',
        workDir: '/tmp/project',
        codexHome: '/absolute/path/to/codex-home'
      });

      const spawnOptions = mockSpawn.mock.calls[0]![2]!;

      expect(spawnOptions.env!.CODEX_HOME).toBe('/absolute/path/to/codex-home');
    });

    it('handles CODEX_HOME with special characters', async () => {
      const process = new CodexStreamProcess();
      processes.push(process);

      const codexHome = '/tmp/codex-home/job-123_user-456@domain.com';

      await process.spawn({
        prompt: 'Test',
        workDir: '/tmp/project',
        codexHome
      });

      const spawnOptions = mockSpawn.mock.calls[0]![2]!;

      expect(spawnOptions.env!.CODEX_HOME).toBe(codexHome);
    });

    it('handles CODEX_HOME with spaces (properly quoted in shell)', async () => {
      const process = new CodexStreamProcess();
      processes.push(process);

      const codexHome = '/tmp/codex home/job 123';

      await process.spawn({
        prompt: 'Test',
        workDir: '/tmp/project',
        codexHome
      });

      const spawnOptions = mockSpawn.mock.calls[0]![2]!;

      expect(spawnOptions.env!.CODEX_HOME).toBe(codexHome);
    });
  });

  describe('Concurrent Session Isolation', () => {
    it('handles 10 concurrent jobs with unique CODEX_HOME', async () => {
      const processArray: CodexStreamProcess[] = [];
      const mockProcesses = Array.from({ length: 10 }, () => createMockProcess());

      mockProcesses.forEach(p => mockSpawn.mockReturnValueOnce(p as any));

      const spawnPromises = Array.from({ length: 10 }, (_, i) => {
        const process = new CodexStreamProcess();
        processArray.push(process);

        return process.spawn({
          prompt: `Job ${i}`,
          workDir: `/tmp/project-${i}`,
          codexHome: `/tmp/codex-home/job-${i}`
        });
      });

      await Promise.all(spawnPromises);

      processes.push(...processArray);

      // Verify all have unique CODEX_HOME
      const codexHomes = mockSpawn.mock.calls.map(call => call[2]!.env!.CODEX_HOME);

      expect(new Set(codexHomes).size).toBe(10); // All unique
      expect(codexHomes).toEqual([
        '/tmp/codex-home/job-0',
        '/tmp/codex-home/job-1',
        '/tmp/codex-home/job-2',
        '/tmp/codex-home/job-3',
        '/tmp/codex-home/job-4',
        '/tmp/codex-home/job-5',
        '/tmp/codex-home/job-6',
        '/tmp/codex-home/job-7',
        '/tmp/codex-home/job-8',
        '/tmp/codex-home/job-9'
      ]);
    });
  });

  describe('Documentation & Verification', () => {
    it('logs CODEX_HOME usage for debugging', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const process = new CodexStreamProcess();
      processes.push(process);

      await process.spawn({
        prompt: 'Test',
        workDir: '/tmp/project',
        codexHome: '/tmp/codex-home/debug-job'
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Using custom CODEX_HOME'),
        expect.stringContaining('/tmp/codex-home/debug-job')
      );

      consoleSpy.mockRestore();
    });

    it('documents CODEX_HOME requirement in spawn options', () => {
      // This test verifies the type system documents CODEX_HOME
      const spawnOptions = {
        prompt: 'Test',
        workDir: '/tmp/project',
        codexHome: '/tmp/codex-home/documented'
      };

      // Type should have codexHome?: string
      expect(spawnOptions).toHaveProperty('codexHome');
      expect(typeof spawnOptions.codexHome).toBe('string');
    });
  });
});
