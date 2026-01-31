import { EventEmitter } from 'events';
import { CodexSession, CodexSessionResult } from '../codexSession';
import { CodexEvent } from '../codexMessageParser';
import { SAMPLE_EVENTS, SESSION_FLOWS } from '../../../__tests__/helpers/codexTestFixtures';

// Mock all dependencies
jest.mock('../codexProcess');
jest.mock('../codexMessageParser');
jest.mock('../../services/eventService');
jest.mock('../rateLimiter');
jest.mock('../../config/timeouts.env', () => ({
  PROCESS_TIMEOUTS: {
    claudeComplex: 900000,
    claudeDocumentation: 300000
  }
}));

// Get mocked modules
import { CodexStreamProcess } from '../codexProcess';
import { CodexMessageParser } from '../codexMessageParser';
import { emitBuildEvent, CleanEventEmitter } from '../../services/eventService';
import { getGlobalRateLimiter } from '../rateLimiter';

const MockedCodexStreamProcess = CodexStreamProcess as jest.MockedClass<typeof CodexStreamProcess>;
const MockedCodexMessageParser = CodexMessageParser as jest.MockedClass<typeof CodexMessageParser>;
const mockedEmitBuildEvent = emitBuildEvent as jest.MockedFunction<typeof emitBuildEvent>;
const MockedCleanEventEmitter = CleanEventEmitter as jest.MockedClass<typeof CleanEventEmitter>;
const mockedGetGlobalRateLimiter = getGlobalRateLimiter as jest.MockedFunction<typeof getGlobalRateLimiter>;

/**
 * Create a mock readline interface that can emit events
 */
function createMockReadlineInterface() {
  const emitter = new EventEmitter() as any;
  emitter[Symbol.asyncIterator] = async function* () {
    // Will be populated by test
  };
  return emitter;
}

describe('CodexSession', () => {
  let session: CodexSession;
  let mockProcess: jest.Mocked<CodexStreamProcess>;
  let mockParser: jest.Mocked<CodexMessageParser>;
  let mockReadline: ReturnType<typeof createMockReadlineInterface>;
  let mockRateLimiter: { acquire: jest.Mock; release: jest.Mock };
  let mockCleanEmitter: jest.Mocked<CleanEventEmitter>;

  const defaultBuildId = 'build-123';
  const defaultWorkDir = '/tmp/builds/project-123';
  const defaultPrompt = 'Build a React app';

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Setup mock rate limiter
    mockRateLimiter = {
      acquire: jest.fn().mockReturnValue(undefined),
      release: jest.fn()
    };
    mockedGetGlobalRateLimiter.mockReturnValue(mockRateLimiter as any);

    // Setup mock process
    mockProcess = {
      spawn: jest.fn(),
      spawnResume: jest.fn(),
      kill: jest.fn(),
      getProcess: jest.fn()
    } as any;
    MockedCodexStreamProcess.mockImplementation(() => mockProcess);

    // Setup mock parser
    mockParser = {
      parse: jest.fn(),
      toAgentEvent: jest.fn(),
      getUsage: jest.fn(),
      getFinalMessage: jest.fn(),
      getError: jest.fn(),
      getSessionId: jest.fn(),
      getToolCalls: jest.fn(),
      reset: jest.fn()
    } as any;
    MockedCodexMessageParser.mockImplementation(() => mockParser);

    // Setup mock clean emitter
    mockCleanEmitter = {
      phaseProgress: jest.fn().mockResolvedValue(undefined),
      phaseProgressWithCode: jest.fn().mockResolvedValue(undefined)
    } as any;
    MockedCleanEventEmitter.mockImplementation(() => mockCleanEmitter);

    // Setup mock readline
    mockReadline = createMockReadlineInterface();
    mockProcess.spawn.mockReturnValue(mockReadline as any);
    mockProcess.spawnResume.mockReturnValue(mockReadline as any);

    session = new CodexSession();
  });

  afterEach(() => {
    // Clean up all timers
    jest.clearAllTimers();
    jest.useRealTimers();

    // Clean up event emitters
    if (mockReadline) {
      mockReadline.removeAllListeners();
    }
  });

  describe('run() - Successful Completion', () => {
    it('acquires and releases rate limiter', async () => {
      const lines = SESSION_FLOWS.simpleSuccess;

      mockReadline[Symbol.asyncIterator] = async function* () {
        for (const line of lines) {
          yield line;
        }
      };

      // Mock parser responses
      let callCount = 0;
      mockParser.parse.mockImplementation((line: string) => {
        const parsed = JSON.parse(line);
        return { type: parsed.type, raw: line, ...parsed } as any;
      });
      mockParser.toAgentEvent.mockReturnValue(null);
      mockParser.getUsage.mockReturnValue({ input_tokens: 150, output_tokens: 75 });
      mockParser.getFinalMessage.mockReturnValue('Task completed');
      mockParser.getError.mockReturnValue(null);

      await session.run(defaultPrompt, defaultWorkDir, defaultBuildId, 10000);

      expect(mockRateLimiter.acquire).toHaveBeenCalled();
      expect(mockRateLimiter.release).toHaveBeenCalled();
    });

    it('spawns process with correct options', async () => {
      mockReadline[Symbol.asyncIterator] = async function* () {
        yield SAMPLE_EVENTS.threadStarted;
        yield SAMPLE_EVENTS.turnCompleted;
      };

      mockParser.parse.mockImplementation((line: string) => {
        const parsed = JSON.parse(line);
        return { type: parsed.type, raw: line, ...parsed } as any;
      });
      mockParser.toAgentEvent.mockReturnValue(null);
      mockParser.getUsage.mockReturnValue(null);
      mockParser.getFinalMessage.mockReturnValue('');
      mockParser.getError.mockReturnValue(null);

      const userId = 'user-456';
      const projectId = 'project-789';
      const customOptions = { model: 'gpt-5.2-codex' };

      await session.run(
        defaultPrompt,
        defaultWorkDir,
        defaultBuildId,
        10000,
        userId,
        projectId,
        customOptions
      );

      expect(mockProcess.spawn).toHaveBeenCalledWith({
        prompt: defaultPrompt,
        workDir: defaultWorkDir,
        buildId: defaultBuildId,
        userId,
        projectId,
        ...customOptions
      });
    });

    it('captures thread ID from thread.started event', async () => {
      mockReadline[Symbol.asyncIterator] = async function* () {
        yield SAMPLE_EVENTS.threadStarted;
        yield SAMPLE_EVENTS.turnCompleted;
      };

      mockParser.parse.mockImplementation((line: string) => {
        const parsed = JSON.parse(line);
        return { type: parsed.type, raw: line, ...parsed } as any;
      });
      mockParser.toAgentEvent.mockReturnValue(null);
      mockParser.getUsage.mockReturnValue(null);
      mockParser.getFinalMessage.mockReturnValue('');
      mockParser.getError.mockReturnValue(null);

      const result = await session.run(defaultPrompt, defaultWorkDir, defaultBuildId, 10000);

      expect(result.sessionId).toBe('th_abc123');
      expect(session.getSessionId()).toBe('th_abc123');
    });

    it('returns success result on turn.completed', async () => {
      mockReadline[Symbol.asyncIterator] = async function* () {
        yield SAMPLE_EVENTS.turnCompleted;
      };

      mockParser.parse.mockImplementation((line: string) => {
        const parsed = JSON.parse(line);
        return { type: parsed.type, raw: line, ...parsed } as any;
      });
      mockParser.toAgentEvent.mockReturnValue(null);
      mockParser.getUsage.mockReturnValue({ input_tokens: 150, output_tokens: 75 });
      mockParser.getFinalMessage.mockReturnValue('Build successful');
      mockParser.getError.mockReturnValue(null);

      const result = await session.run(defaultPrompt, defaultWorkDir, defaultBuildId, 10000);

      expect(result.success).toBe(true);
      expect(result.result).toBe('Build successful');
      expect(result.tokenUsage).toEqual({
        input: 150,
        output: 75
      });
    });

    it('closes stdin after turn.completed', async () => {
      const mockStdin = {
        end: jest.fn(),
        destroyed: false,
        writable: true
      };

      mockProcess.getProcess.mockReturnValue({
        stdin: mockStdin
      } as any);

      mockReadline[Symbol.asyncIterator] = async function* () {
        yield SAMPLE_EVENTS.turnCompleted;
      };

      mockParser.parse.mockImplementation((line: string) => {
        const parsed = JSON.parse(line);
        return { type: parsed.type, raw: line, ...parsed } as any;
      });
      mockParser.toAgentEvent.mockReturnValue(null);
      mockParser.getUsage.mockReturnValue(null);
      mockParser.getFinalMessage.mockReturnValue('');
      mockParser.getError.mockReturnValue(null);

      await session.run(defaultPrompt, defaultWorkDir, defaultBuildId, 10000);

      expect(mockStdin.end).toHaveBeenCalled();
    });

    it('kills process in finally block', async () => {
      mockReadline[Symbol.asyncIterator] = async function* () {
        yield SAMPLE_EVENTS.turnCompleted;
      };

      mockParser.parse.mockImplementation((line: string) => {
        const parsed = JSON.parse(line);
        return { type: parsed.type, raw: line, ...parsed } as any;
      });
      mockParser.toAgentEvent.mockReturnValue(null);
      mockParser.getUsage.mockReturnValue(null);
      mockParser.getFinalMessage.mockReturnValue('');
      mockParser.getError.mockReturnValue(null);

      await session.run(defaultPrompt, defaultWorkDir, defaultBuildId, 10000);

      expect(mockProcess.kill).toHaveBeenCalled();
    });
  });

  describe('run() - Failure Handling', () => {
    it('returns failure result on turn.failed', async () => {
      mockReadline[Symbol.asyncIterator] = async function* () {
        yield SAMPLE_EVENTS.turnFailed;
      };

      mockParser.parse.mockImplementation((line: string) => {
        const parsed = JSON.parse(line);
        return { type: parsed.type, raw: line, ...parsed } as any;
      });
      mockParser.toAgentEvent.mockReturnValue(null);
      mockParser.getUsage.mockReturnValue(null);
      mockParser.getFinalMessage.mockReturnValue('');
      mockParser.getError.mockReturnValue(null);

      const result = await session.run(defaultPrompt, defaultWorkDir, defaultBuildId, 10000);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Rate limit exceeded');
      expect(result.errorsEncountered).toBe(1);
    });

    it('handles timeout by killing process', async () => {
      mockReadline[Symbol.asyncIterator] = async function* () {
        // Never yield - simulate hung process
        await new Promise(() => {}); // Never resolves
      };

      const resultPromise = session.run(defaultPrompt, defaultWorkDir, defaultBuildId, 5000);

      // Fast-forward time past timeout
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      jest.advanceTimersByTime(5000);

      // Allow async operations to complete
      await Promise.resolve();
      await Promise.resolve();

      expect(mockProcess.kill).toHaveBeenCalled();
    });

    it('returns error result when stream ends without data', async () => {
      mockReadline[Symbol.asyncIterator] = async function* () {
        // Empty - no lines
      };

      mockParser.parse.mockReturnValue(null);
      mockParser.getUsage.mockReturnValue(null);
      mockParser.getFinalMessage.mockReturnValue('');
      mockParser.getError.mockReturnValue(null);

      const result = await session.run(defaultPrompt, defaultWorkDir, defaultBuildId, 10000);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Stream ended without result');
    });

    it('returns partial result when stream ends with some data', async () => {
      mockReadline[Symbol.asyncIterator] = async function* () {
        yield SAMPLE_EVENTS.threadStarted;
        yield SAMPLE_EVENTS.itemCompletedMessage;
        // Stream ends without turn.completed
      };

      mockParser.parse.mockImplementation((line: string) => {
        const parsed = JSON.parse(line);
        return { type: parsed.type, raw: line, ...parsed } as any;
      });
      mockParser.toAgentEvent.mockReturnValue(null);
      mockParser.getUsage.mockReturnValue(null);
      mockParser.getFinalMessage.mockReturnValue('Partial output');
      mockParser.getError.mockReturnValue(null);

      const result = await session.run(defaultPrompt, defaultWorkDir, defaultBuildId, 10000);

      expect(result.success).toBe(true);
      expect(result.result).toBe('Partial output');
    });

    it('catches and returns spawn errors', async () => {
      mockProcess.spawn.mockRejectedValue(new Error('Spawn failed'));

      const result = await session.run(defaultPrompt, defaultWorkDir, defaultBuildId, 10000);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Spawn failed');
    });
  });

  describe('run() - Activity Tracking', () => {
    it('tracks files created from Write tool', async () => {
      mockReadline[Symbol.asyncIterator] = async function* () {
        yield SAMPLE_EVENTS.itemStartedFileCreate;
        yield SAMPLE_EVENTS.itemCompletedFileCreate;
        yield SAMPLE_EVENTS.turnCompleted;
      };

      mockParser.parse.mockImplementation((line: string) => {
        const parsed = JSON.parse(line);
        return { type: parsed.type, raw: line, ...parsed } as any;
      });

      mockParser.toAgentEvent
        .mockReturnValueOnce({ type: 'tool_call', tool: 'Write', toolInput: { file_path: 'src/App.tsx' } } as any)
        .mockReturnValueOnce({ type: 'tool_result', tool: 'Write' } as any)
        .mockReturnValueOnce(null);

      mockParser.getUsage.mockReturnValue(null);
      mockParser.getFinalMessage.mockReturnValue('');
      mockParser.getError.mockReturnValue(null);

      const result = await session.run(defaultPrompt, defaultWorkDir, defaultBuildId, 10000);

      expect(result.filesCreated).toBe(1);
      expect(result.toolCallsTotal).toBe(1);
    });

    it('tracks files modified from Edit tool', async () => {
      mockReadline[Symbol.asyncIterator] = async function* () {
        yield SAMPLE_EVENTS.itemStartedFileModify;
        yield SAMPLE_EVENTS.itemCompletedFileModify;
        yield SAMPLE_EVENTS.turnCompleted;
      };

      mockParser.parse.mockImplementation((line: string) => {
        const parsed = JSON.parse(line);
        return { type: parsed.type, raw: line, ...parsed } as any;
      });

      mockParser.toAgentEvent
        .mockReturnValueOnce({ type: 'tool_call', tool: 'Edit', toolInput: { file_path: 'src/index.ts' } } as any)
        .mockReturnValueOnce({ type: 'tool_result', tool: 'Edit' } as any)
        .mockReturnValueOnce(null);

      mockParser.getUsage.mockReturnValue(null);
      mockParser.getFinalMessage.mockReturnValue('');
      mockParser.getError.mockReturnValue(null);

      const result = await session.run(defaultPrompt, defaultWorkDir, defaultBuildId, 10000);

      expect(result.filesModified).toBe(1);
      expect(result.toolCallsTotal).toBe(1);
    });

    it('tracks multiple tool calls', async () => {
      mockReadline[Symbol.asyncIterator] = async function* () {
        yield SAMPLE_EVENTS.itemStartedFileCreate;
        yield SAMPLE_EVENTS.itemStartedBash;
        yield SAMPLE_EVENTS.itemStartedFileModify;
        yield SAMPLE_EVENTS.turnCompleted;
      };

      mockParser.parse.mockImplementation((line: string) => {
        const parsed = JSON.parse(line);
        return { type: parsed.type, raw: line, ...parsed } as any;
      });

      mockParser.toAgentEvent
        .mockReturnValueOnce({ type: 'tool_call', tool: 'Write' } as any)
        .mockReturnValueOnce({ type: 'tool_call', tool: 'Bash' } as any)
        .mockReturnValueOnce({ type: 'tool_call', tool: 'Edit' } as any)
        .mockReturnValueOnce(null);

      mockParser.getUsage.mockReturnValue(null);
      mockParser.getFinalMessage.mockReturnValue('');
      mockParser.getError.mockReturnValue(null);

      const result = await session.run(defaultPrompt, defaultWorkDir, defaultBuildId, 10000);

      expect(result.toolCallsTotal).toBe(3);
    });

    it('tracks errors from error events', async () => {
      mockReadline[Symbol.asyncIterator] = async function* () {
        yield SAMPLE_EVENTS.errorEvent;
        yield SAMPLE_EVENTS.turnFailed;
      };

      mockParser.parse.mockImplementation((line: string) => {
        const parsed = JSON.parse(line);
        return { type: parsed.type, raw: line, ...parsed } as any;
      });

      mockParser.toAgentEvent
        .mockReturnValueOnce({ type: 'error', text: 'Something went wrong' } as any)
        .mockReturnValueOnce(null);

      mockParser.getUsage.mockReturnValue(null);
      mockParser.getFinalMessage.mockReturnValue('');
      mockParser.getError.mockReturnValue(null);

      const result = await session.run(defaultPrompt, defaultWorkDir, defaultBuildId, 10000);

      expect(result.errorsEncountered).toBeGreaterThanOrEqual(2); // One from error event, one from turn.failed
    });
  });

  describe('run() - Progress Events', () => {
    it('emits initial progress with CleanEventEmitter when userId provided', async () => {
      mockReadline[Symbol.asyncIterator] = async function* () {
        yield SAMPLE_EVENTS.turnCompleted;
      };

      mockParser.parse.mockImplementation((line: string) => {
        const parsed = JSON.parse(line);
        return { type: parsed.type, raw: line, ...parsed } as any;
      });
      mockParser.toAgentEvent.mockReturnValue(null);
      mockParser.getUsage.mockReturnValue(null);
      mockParser.getFinalMessage.mockReturnValue('');
      mockParser.getError.mockReturnValue(null);

      await session.run(defaultPrompt, defaultWorkDir, defaultBuildId, 10000, 'user-123');

      expect(mockCleanEmitter.phaseProgressWithCode).toHaveBeenCalledWith(
        'development',
        'BUILD_DEVELOPMENT_STARTING',
        expect.any(Number)
      );
    });

    it('emits progress via emitBuildEvent when no userId', async () => {
      mockReadline[Symbol.asyncIterator] = async function* () {
        yield SAMPLE_EVENTS.turnCompleted;
      };

      mockParser.parse.mockImplementation((line: string) => {
        const parsed = JSON.parse(line);
        return { type: parsed.type, raw: line, ...parsed } as any;
      });
      mockParser.toAgentEvent.mockReturnValue(null);
      mockParser.getUsage.mockReturnValue(null);
      mockParser.getFinalMessage.mockReturnValue('');
      mockParser.getError.mockReturnValue(null);

      await session.run(defaultPrompt, defaultWorkDir, defaultBuildId, 10000);

      expect(mockedEmitBuildEvent).toHaveBeenCalledWith(
        defaultBuildId,
        'ai_started',
        expect.objectContaining({
          message: expect.stringContaining('Codex')
        })
      );
    });

    it('emits tool progress for Write tool', async () => {
      mockReadline[Symbol.asyncIterator] = async function* () {
        yield SAMPLE_EVENTS.itemStartedFileCreate;
        yield SAMPLE_EVENTS.turnCompleted;
      };

      mockParser.parse.mockImplementation((line: string) => {
        const parsed = JSON.parse(line);
        return { type: parsed.type, raw: line, ...parsed } as any;
      });

      mockParser.toAgentEvent
        .mockReturnValueOnce({
          type: 'tool_call',
          tool: 'Write',
          toolInput: { file_path: 'src/App.tsx' }
        } as any)
        .mockReturnValueOnce(null);

      mockParser.getUsage.mockReturnValue(null);
      mockParser.getFinalMessage.mockReturnValue('');
      mockParser.getError.mockReturnValue(null);

      await session.run(defaultPrompt, defaultWorkDir, defaultBuildId, 10000, 'user-123');

      expect(mockCleanEmitter.phaseProgressWithCode).toHaveBeenCalledWith(
        'development',
        'BUILD_FILE_CREATING',
        expect.any(Number),
        expect.objectContaining({ filename: 'App.tsx' })
      );
    });

    it('emits tool progress for Bash npm install', async () => {
      mockReadline[Symbol.asyncIterator] = async function* () {
        yield SAMPLE_EVENTS.itemStartedBash;
        yield SAMPLE_EVENTS.turnCompleted;
      };

      mockParser.parse.mockImplementation((line: string) => {
        const parsed = JSON.parse(line);
        return { type: parsed.type, raw: line, ...parsed } as any;
      });

      mockParser.toAgentEvent
        .mockReturnValueOnce({
          type: 'tool_call',
          tool: 'Bash',
          toolInput: { command: 'npm install' }
        } as any)
        .mockReturnValueOnce(null);

      mockParser.getUsage.mockReturnValue(null);
      mockParser.getFinalMessage.mockReturnValue('');
      mockParser.getError.mockReturnValue(null);

      await session.run(defaultPrompt, defaultWorkDir, defaultBuildId, 10000, 'user-123');

      expect(mockCleanEmitter.phaseProgressWithCode).toHaveBeenCalledWith(
        'development',
        'BUILD_DEPENDENCIES_INSTALLING',
        expect.any(Number),
        undefined
      );
    });

    it('emits tool progress for TodoWrite', async () => {
      mockReadline[Symbol.asyncIterator] = async function* () {
        yield SAMPLE_EVENTS.itemCompletedTodoList;
        yield SAMPLE_EVENTS.turnCompleted;
      };

      mockParser.parse.mockImplementation((line: string) => {
        const parsed = JSON.parse(line);
        return { type: parsed.type, raw: line, ...parsed } as any;
      });

      mockParser.toAgentEvent
        .mockReturnValueOnce({
          type: 'tool_call',
          tool: 'TodoWrite',
          toolInput: {
            todos: [
              { content: 'Create App.tsx', status: 'completed' },
              { content: 'Add styles', status: 'in_progress' },
              { content: 'Write tests', status: 'pending' }
            ]
          }
        } as any)
        .mockReturnValueOnce(null);

      mockParser.getUsage.mockReturnValue(null);
      mockParser.getFinalMessage.mockReturnValue('');
      mockParser.getError.mockReturnValue(null);

      await session.run(defaultPrompt, defaultWorkDir, defaultBuildId, 10000, 'user-123');

      expect(mockCleanEmitter.phaseProgressWithCode).toHaveBeenCalledWith(
        'development',
        'BUILD_TASK_WORKING',
        expect.any(Number),
        expect.objectContaining({
          task: 'Add styles',
          completed: 1,
          total: 3
        })
      );
    });
  });

  describe('resume()', () => {
    const threadId = 'th_abc123';

    it('calls spawnResume with threadId', async () => {
      mockReadline.on = jest.fn((event, handler) => {
        if (event === 'close') {
          setTimeout(() => handler(), 0);
        }
        return mockReadline;
      });

      mockParser.getUsage.mockReturnValue(null);
      mockParser.getFinalMessage.mockReturnValue('');
      mockParser.getError.mockReturnValue(null);

      const resultPromise = session.resume(
        threadId,
        'Continue building',
        defaultWorkDir,
        defaultBuildId,
        10000
      );

      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(mockProcess.spawnResume).toHaveBeenCalledWith(
        threadId,
        expect.objectContaining({
          prompt: 'Continue building',
          workDir: defaultWorkDir,
          buildId: defaultBuildId
        })
      );
    });

    it('returns needsFallback when thread not found', async () => {
      let lineHandler: ((line: string) => void) | undefined;
      let closeHandler: (() => void) | undefined;

      mockReadline.on = jest.fn((event, handler) => {
        if (event === 'line') {
          lineHandler = handler;
        } else if (event === 'close') {
          closeHandler = handler;
        }
        return mockReadline;
      });

      mockParser.getUsage.mockReturnValue(null);
      mockParser.getFinalMessage.mockReturnValue('');
      mockParser.getError.mockReturnValue(null);

      const resultPromise = session.resume(
        threadId,
        'Continue',
        defaultWorkDir,
        defaultBuildId,
        10000
      );

      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      // Simulate "Thread not found" error
      if (lineHandler) {
        lineHandler('Error: Thread not found - th_abc123 does not exist');
      }

      // Simulate close
      if (closeHandler) {
        closeHandler();
      }

      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.needsFallback).toBe(true);
      expect(result.success).toBe(false);
    });

    it('handles resume timeout', async () => {
      mockReadline.on = jest.fn((event, handler) => {
        // Don't trigger close - let timeout fire
        return mockReadline;
      });

      mockParser.getUsage.mockReturnValue(null);
      mockParser.getFinalMessage.mockReturnValue('');
      mockParser.getError.mockReturnValue(null);

      const resultPromise = session.resume(
        threadId,
        'Continue',
        defaultWorkDir,
        defaultBuildId,
        5000
      );

      // Fast-forward past timeout
      await Promise.resolve();
      await Promise.resolve();
      await jest.advanceTimersByTimeAsync(5000);

      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    });

    it('processes events during resume', async () => {
      let lineHandler: ((line: string) => void) | undefined;
      let closeHandler: (() => void) | undefined;

      mockReadline.on = jest.fn((event, handler) => {
        if (event === 'line') {
          lineHandler = handler;
        } else if (event === 'close') {
          closeHandler = handler;
        }
        return mockReadline;
      });

      mockParser.parse.mockImplementation((line: string) => {
        const parsed = JSON.parse(line);
        return { type: parsed.type, raw: line, ...parsed } as any;
      });

      mockParser.toAgentEvent
        .mockReturnValueOnce({ type: 'tool_call', tool: 'Write' } as any);

      mockParser.getUsage.mockReturnValue({ input_tokens: 100, output_tokens: 50 });
      mockParser.getFinalMessage.mockReturnValue('Resumed successfully');
      mockParser.getError.mockReturnValue(null);

      const resultPromise = session.resume(
        threadId,
        'Continue',
        defaultWorkDir,
        defaultBuildId,
        10000
      );

      await Promise.resolve();
      await Promise.resolve();

      // Simulate some events
      if (lineHandler) {
        lineHandler(SAMPLE_EVENTS.itemStartedFileCreate);
      }

      // Simulate close
      if (closeHandler) {
        closeHandler();
      }

      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.result).toBe('Resumed successfully');
      expect(result.tokenUsage).toEqual({ input: 100, output: 50 });
    });

    it('handles readline errors', async () => {
      mockParser.getUsage.mockReturnValue(null);
      mockParser.getFinalMessage.mockReturnValue('');
      mockParser.getError.mockReturnValue(null);

      const resultPromise = session.resume(
        threadId,
        'Continue',
        defaultWorkDir,
        defaultBuildId,
        10000
      );

      await Promise.resolve();
      await Promise.resolve();

      // Simulate error
      mockReadline.emit('error', new Error('Readline error'));

      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error).toBe('Readline error');
    });
  });

  describe('getSessionId()', () => {
    it('returns null before running', () => {
      expect(session.getSessionId()).toBeNull();
    });

    it('returns threadId after capturing from thread.started', async () => {
      mockReadline[Symbol.asyncIterator] = async function* () {
        yield SAMPLE_EVENTS.threadStarted;
        yield SAMPLE_EVENTS.turnCompleted;
      };

      mockParser.parse.mockImplementation((line: string) => {
        const parsed = JSON.parse(line);
        return { type: parsed.type, raw: line, ...parsed } as any;
      });
      mockParser.toAgentEvent.mockReturnValue(null);
      mockParser.getUsage.mockReturnValue(null);
      mockParser.getFinalMessage.mockReturnValue('');
      mockParser.getError.mockReturnValue(null);

      await session.run(defaultPrompt, defaultWorkDir, defaultBuildId, 10000);

      expect(session.getSessionId()).toBe('th_abc123');
    });
  });

  describe('Continue Prompt Mechanism', () => {
    it('sends continue prompt when no output for 60 seconds', async () => {
      const mockStdin = {
        write: jest.fn(),
        writable: true,
        destroyed: false
      };

      mockProcess.getProcess.mockReturnValue({
        stdin: mockStdin
      } as any);

      mockReadline[Symbol.asyncIterator] = async function* () {
        // Yield one line then pause
        yield SAMPLE_EVENTS.threadStarted;
        // Simulate long pause
        await new Promise(() => {}); // Never resolves
      };

      mockParser.parse.mockImplementation((line: string) => {
        const parsed = JSON.parse(line);
        return { type: parsed.type, raw: line, ...parsed } as any;
      });
      mockParser.toAgentEvent.mockReturnValue(null);

      const resultPromise = session.run(defaultPrompt, defaultWorkDir, defaultBuildId, 120000);

      // Fast-forward past continue check intervals
      // Continue check runs every 10 seconds, triggers after 60 seconds of no output
      await jest.advanceTimersByTimeAsync(70000);

      // Should have sent continue prompt
      expect(mockStdin.write).toHaveBeenCalledWith('\n');
    });
  });
});
