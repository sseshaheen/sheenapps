/**
 * Integration tests for Codex CLI integration
 *
 * Tests the full flow: Process → JSONL → Parser → AgentEvent → Activity tracking
 * Uses real Parser with mocked process output
 */

import { EventEmitter } from 'events';
import { CodexSession } from '../../src/stream/codexSession';
import { CodexStreamProcess } from '../../src/stream/codexProcess';
import { CodexMessageParser } from '../../src/stream/codexMessageParser';
import { SAMPLE_EVENTS, SESSION_FLOWS } from '../helpers/codexTestFixtures';

// Mock only the process spawning, not the parser
jest.mock('../../src/stream/codexProcess');
jest.mock('../../src/services/eventService', () => ({
  emitBuildEvent: jest.fn().mockResolvedValue(undefined),
  CleanEventEmitter: jest.fn().mockImplementation(() => ({
    phaseProgress: jest.fn().mockResolvedValue(undefined),
    phaseProgressWithCode: jest.fn().mockResolvedValue(undefined)
  }))
}));
jest.mock('../../src/stream/rateLimiter', () => ({
  getGlobalRateLimiter: jest.fn().mockReturnValue({
    acquire: jest.fn().mockResolvedValue(undefined),
    release: jest.fn()
  })
}));

const MockedCodexStreamProcess = CodexStreamProcess as jest.MockedClass<typeof CodexStreamProcess>;

/**
 * Create a mock readline interface that emits lines
 */
function createMockReadlineWithLines(lines: string[]) {
  const emitter = new EventEmitter() as any;

  // Async iterator that yields lines
  emitter[Symbol.asyncIterator] = async function* () {
    for (const line of lines) {
      yield line;
    }
  };

  return emitter;
}

describe('Codex Integration Tests', () => {
  let mockProcess: jest.Mocked<CodexStreamProcess>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockProcess = {
      spawn: jest.fn(),
      spawnResume: jest.fn(),
      kill: jest.fn(),
      getProcess: jest.fn().mockReturnValue({
        stdin: {
          write: jest.fn(),
          end: jest.fn(),
          destroyed: false,
          writable: true
        }
      })
    } as any;

    MockedCodexStreamProcess.mockImplementation(() => mockProcess);
  });

  afterEach(() => {
    // Clean up all timers
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('Simple Success Flow', () => {
    it('processes thread.started → message → turn.completed', async () => {
      const readline = createMockReadlineWithLines(SESSION_FLOWS.simpleSuccess);
      mockProcess.spawn.mockResolvedValue(readline);

      const session = new CodexSession();
      const result = await session.run(
        'Build a React app',
        '/tmp/project',
        'build-123',
        10000
      );

      expect(result.success).toBe(true);
      expect(result.sessionId).toBe('th_abc123');
      expect(result.result).toContain('Hello');
      expect(result.tokenUsage).toEqual({
        input: 150,
        output: 75
      });
    });

    it('captures thread ID early in flow', async () => {
      const readline = createMockReadlineWithLines(SESSION_FLOWS.simpleSuccess);
      mockProcess.spawn.mockResolvedValue(readline);

      const session = new CodexSession();
      await session.run('Test', '/tmp/project', 'build-123', 10000);

      // Thread ID should be captured from thread.started
      expect(session.getSessionId()).toBe('th_abc123');
    });
  });

  describe('File Creation Flow', () => {
    it('tracks file creation from Write tool', async () => {
      const readline = createMockReadlineWithLines(SESSION_FLOWS.fileCreation);
      mockProcess.spawn.mockResolvedValue(readline);

      const session = new CodexSession();
      const result = await session.run('Create file', '/tmp/project', 'build-123', 10000);

      expect(result.success).toBe(true);
      expect(result.filesCreated).toBe(1);
      expect(result.toolCallsTotal).toBeGreaterThanOrEqual(1);
    });

    it('parses file_change events correctly', async () => {
      const lines = [
        SAMPLE_EVENTS.threadStarted,
        SAMPLE_EVENTS.itemStartedFileCreate,
        SAMPLE_EVENTS.itemCompletedFileCreate,
        SAMPLE_EVENTS.turnCompleted
      ];

      const readline = createMockReadlineWithLines(lines);
      mockProcess.spawn.mockResolvedValue(readline);

      const session = new CodexSession();
      const result = await session.run('Test', '/tmp/project', 'build-123', 10000);

      expect(result.filesCreated).toBe(1);
    });
  });

  describe('Command Execution Flow', () => {
    it('tracks bash commands', async () => {
      const readline = createMockReadlineWithLines(SESSION_FLOWS.commandExecution);
      mockProcess.spawn.mockResolvedValue(readline);

      const session = new CodexSession();
      const result = await session.run('Run npm install', '/tmp/project', 'build-123', 10000);

      expect(result.success).toBe(true);
      expect(result.toolCallsTotal).toBeGreaterThanOrEqual(1);
    });

    it('parses command_execution events correctly', async () => {
      const lines = [
        SAMPLE_EVENTS.threadStarted,
        SAMPLE_EVENTS.itemStartedBash,
        SAMPLE_EVENTS.itemCompletedBash,
        SAMPLE_EVENTS.turnCompleted
      ];

      const readline = createMockReadlineWithLines(lines);
      mockProcess.spawn.mockResolvedValue(readline);

      const session = new CodexSession();
      const result = await session.run('Test', '/tmp/project', 'build-123', 10000);

      expect(result.toolCallsTotal).toBe(1);
    });
  });

  describe('Turn Failure Flow', () => {
    it('handles turn.failed gracefully', async () => {
      const readline = createMockReadlineWithLines(SESSION_FLOWS.turnFailure);
      mockProcess.spawn.mockResolvedValue(readline);

      const session = new CodexSession();
      const result = await session.run('Test', '/tmp/project', 'build-123', 10000);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Rate limit exceeded');
      expect(result.errorsEncountered).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Error During Session Flow', () => {
    it('tracks errors from error events', async () => {
      const readline = createMockReadlineWithLines(SESSION_FLOWS.errorDuringSession);
      mockProcess.spawn.mockResolvedValue(readline);

      const session = new CodexSession();
      const result = await session.run('Test', '/tmp/project', 'build-123', 10000);

      expect(result.errorsEncountered).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Complex Session Flow', () => {
    it('tracks multiple file operations and tools', async () => {
      const readline = createMockReadlineWithLines(SESSION_FLOWS.complexSession);
      mockProcess.spawn.mockResolvedValue(readline);

      const session = new CodexSession();
      const result = await session.run('Complex task', '/tmp/project', 'build-123', 10000);

      expect(result.success).toBe(true);

      // Should track both created and modified files
      expect(result.filesCreated).toBeGreaterThan(0);
      expect(result.filesModified).toBeGreaterThan(0);

      // Should track multiple tool calls
      expect(result.toolCallsTotal).toBeGreaterThanOrEqual(4);

      // Should have token usage
      expect(result.tokenUsage).toBeDefined();
      expect(result.tokenUsage!.input).toBe(150);
      expect(result.tokenUsage!.output).toBe(75);
    });

    it('correctly separates file create vs modify', async () => {
      const lines = [
        SAMPLE_EVENTS.threadStarted,
        SAMPLE_EVENTS.itemStartedFileCreate,
        SAMPLE_EVENTS.itemCompletedFileCreate,
        SAMPLE_EVENTS.itemStartedFileModify,
        SAMPLE_EVENTS.itemCompletedFileModify,
        SAMPLE_EVENTS.turnCompleted
      ];

      const readline = createMockReadlineWithLines(lines);
      mockProcess.spawn.mockResolvedValue(readline);

      const session = new CodexSession();
      const result = await session.run('Test', '/tmp/project', 'build-123', 10000);

      expect(result.filesCreated).toBe(1);
      expect(result.filesModified).toBe(1);
    });
  });

  describe('Parser Integration', () => {
    it('correctly maps file_change create to Write tool', async () => {
      const lines = [
        SAMPLE_EVENTS.itemStartedFileCreate,
        SAMPLE_EVENTS.turnCompleted
      ];

      const readline = createMockReadlineWithLines(lines);
      mockProcess.spawn.mockResolvedValue(readline);

      const session = new CodexSession();
      const result = await session.run('Test', '/tmp/project', 'build-123', 10000);

      // Parser should map file_change.create → Write
      expect(result.filesCreated).toBe(1);
      expect(result.toolCallsTotal).toBe(1);
    });

    it('correctly maps file_change modify to Edit tool', async () => {
      const lines = [
        SAMPLE_EVENTS.itemStartedFileModify,
        SAMPLE_EVENTS.turnCompleted
      ];

      const readline = createMockReadlineWithLines(lines);
      mockProcess.spawn.mockResolvedValue(readline);

      const session = new CodexSession();
      const result = await session.run('Test', '/tmp/project', 'build-123', 10000);

      // Parser should map file_change.modify → Edit
      expect(result.filesModified).toBe(1);
      expect(result.toolCallsTotal).toBe(1);
    });

    it('correctly maps command_execution to Bash tool', async () => {
      const lines = [
        SAMPLE_EVENTS.itemStartedBash,
        SAMPLE_EVENTS.turnCompleted
      ];

      const readline = createMockReadlineWithLines(lines);
      mockProcess.spawn.mockResolvedValue(readline);

      const session = new CodexSession();
      const result = await session.run('Test', '/tmp/project', 'build-123', 10000);

      // Parser should map command_execution → Bash
      expect(result.toolCallsTotal).toBe(1);
    });

    it('correctly maps web_search to WebSearch tool', async () => {
      const lines = [
        SAMPLE_EVENTS.itemStartedWebSearch,
        SAMPLE_EVENTS.itemCompletedWebSearch,
        SAMPLE_EVENTS.turnCompleted
      ];

      const readline = createMockReadlineWithLines(lines);
      mockProcess.spawn.mockResolvedValue(readline);

      const session = new CodexSession();
      const result = await session.run('Test', '/tmp/project', 'build-123', 10000);

      expect(result.toolCallsTotal).toBe(1);
    });

    it('handles todo_list events', async () => {
      const lines = [
        SAMPLE_EVENTS.itemCompletedTodoList,
        SAMPLE_EVENTS.turnCompleted
      ];

      const readline = createMockReadlineWithLines(lines);
      mockProcess.spawn.mockResolvedValue(readline);

      const session = new CodexSession();
      const result = await session.run('Test', '/tmp/project', 'build-123', 10000);

      // Todo list should be tracked as a tool call
      expect(result.toolCallsTotal).toBe(1);
    });

    it('handles reasoning events', async () => {
      const lines = [
        SAMPLE_EVENTS.itemCompletedReasoning,
        SAMPLE_EVENTS.turnCompleted
      ];

      const readline = createMockReadlineWithLines(lines);
      mockProcess.spawn.mockResolvedValue(readline);

      const session = new CodexSession();
      const result = await session.run('Test', '/tmp/project', 'build-123', 10000);

      // Reasoning is not a tool call, but should not break
      expect(result.success).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('handles empty stream gracefully', async () => {
      const readline = createMockReadlineWithLines([]);
      mockProcess.spawn.mockResolvedValue(readline);

      const session = new CodexSession();
      const result = await session.run('Test', '/tmp/project', 'build-123', 10000);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Stream ended without result');
    });

    it('handles stream with only non-JSON lines', async () => {
      const lines = ['Loading codex...', 'Initializing...', ''];

      const readline = createMockReadlineWithLines(lines);
      mockProcess.spawn.mockResolvedValue(readline);

      const session = new CodexSession();
      const result = await session.run('Test', '/tmp/project', 'build-123', 10000);

      expect(result.success).toBe(false);
    });

    it('handles partial data without turn.completed', async () => {
      const lines = [
        SAMPLE_EVENTS.threadStarted,
        SAMPLE_EVENTS.itemStartedMessage,
        SAMPLE_EVENTS.itemCompletedMessage
        // Missing turn.completed
      ];

      const readline = createMockReadlineWithLines(lines);
      mockProcess.spawn.mockResolvedValue(readline);

      const session = new CodexSession();
      const result = await session.run('Test', '/tmp/project', 'build-123', 10000);

      // Should return partial result
      expect(result.success).toBe(true);
      expect(result.sessionId).toBe('th_abc123');
      expect(result.result).toContain('Hello');
    });

    it('handles malformed JSON lines gracefully', async () => {
      const lines = [
        SAMPLE_EVENTS.threadStarted,
        '{invalid json}',
        SAMPLE_EVENTS.itemCompletedMessage,
        SAMPLE_EVENTS.turnCompleted
      ];

      const readline = createMockReadlineWithLines(lines);
      mockProcess.spawn.mockResolvedValue(readline);

      const session = new CodexSession();
      const result = await session.run('Test', '/tmp/project', 'build-123', 10000);

      // Should skip malformed line and continue
      expect(result.success).toBe(true);
    });

    it('handles unicode content in events', async () => {
      const unicodeEvent = '{"type":"item.completed","item":{"id":"item_u","type":"agent_message","text":"你好世界 🌍"}}';

      const lines = [
        SAMPLE_EVENTS.threadStarted,
        unicodeEvent,
        SAMPLE_EVENTS.turnCompleted
      ];

      const readline = createMockReadlineWithLines(lines);
      mockProcess.spawn.mockResolvedValue(readline);

      const session = new CodexSession();
      const result = await session.run('Test', '/tmp/project', 'build-123', 10000);

      expect(result.success).toBe(true);
      expect(result.result).toContain('你好世界');
    });
  });

  describe('Activity Tracking Accuracy', () => {
    it('accurately counts multiple file operations', async () => {
      const lines = [
        SAMPLE_EVENTS.threadStarted,
        SAMPLE_EVENTS.itemStartedFileCreate,
        SAMPLE_EVENTS.itemCompletedFileCreate,
        SAMPLE_EVENTS.itemStartedFileCreate,
        SAMPLE_EVENTS.itemCompletedFileCreate,
        SAMPLE_EVENTS.itemStartedFileModify,
        SAMPLE_EVENTS.itemCompletedFileModify,
        SAMPLE_EVENTS.turnCompleted
      ];

      const readline = createMockReadlineWithLines(lines);
      mockProcess.spawn.mockResolvedValue(readline);

      const session = new CodexSession();
      const result = await session.run('Test', '/tmp/project', 'build-123', 10000);

      expect(result.filesCreated).toBe(2);
      expect(result.filesModified).toBe(1);
      expect(result.toolCallsTotal).toBe(3);
    });

    it('tracks errors separately from success', async () => {
      const lines = [
        SAMPLE_EVENTS.threadStarted,
        SAMPLE_EVENTS.errorEvent,
        SAMPLE_EVENTS.itemStartedFileCreate,
        SAMPLE_EVENTS.itemCompletedFileCreate,
        SAMPLE_EVENTS.turnCompleted
      ];

      const readline = createMockReadlineWithLines(lines);
      mockProcess.spawn.mockResolvedValue(readline);

      const session = new CodexSession();
      const result = await session.run('Test', '/tmp/project', 'build-123', 10000);

      expect(result.success).toBe(true); // Still successful despite error
      expect(result.filesCreated).toBe(1);
      expect(result.errorsEncountered).toBe(1);
    });

    it('does not count agent_message as tool call', async () => {
      const lines = [
        SAMPLE_EVENTS.threadStarted,
        SAMPLE_EVENTS.itemStartedMessage,
        SAMPLE_EVENTS.itemCompletedMessage,
        SAMPLE_EVENTS.turnCompleted
      ];

      const readline = createMockReadlineWithLines(lines);
      mockProcess.spawn.mockResolvedValue(readline);

      const session = new CodexSession();
      const result = await session.run('Test', '/tmp/project', 'build-123', 10000);

      // agent_message should not be counted as a tool call
      expect(result.toolCallsTotal).toBe(0);
      expect(result.result).toContain('Hello');
    });

    it('does not count reasoning as tool call', async () => {
      const lines = [
        SAMPLE_EVENTS.threadStarted,
        SAMPLE_EVENTS.itemCompletedReasoning,
        SAMPLE_EVENTS.turnCompleted
      ];

      const readline = createMockReadlineWithLines(lines);
      mockProcess.spawn.mockResolvedValue(readline);

      const session = new CodexSession();
      const result = await session.run('Test', '/tmp/project', 'build-123', 10000);

      // Reasoning should not be counted as a tool call
      expect(result.toolCallsTotal).toBe(0);
    });
  });

  describe('Session Resumption', () => {
    it('handles successful resume', async () => {
      let lineHandler: ((line: string) => void) | undefined;
      let closeHandler: (() => void) | undefined;

      const mockReadline = new EventEmitter() as any;
      mockReadline.on = jest.fn((event, handler) => {
        if (event === 'line') {
          lineHandler = handler;
        } else if (event === 'close') {
          closeHandler = handler;
        }
        return mockReadline;
      });

      mockProcess.spawnResume.mockResolvedValue(mockReadline);

      const session = new CodexSession();
      const resultPromise = session.resume(
        'th_abc123',
        'Continue building',
        '/tmp/project',
        'build-123',
        10000
      );

      await Promise.resolve();
      await Promise.resolve();

      // Simulate receiving events
      if (lineHandler) {
        lineHandler(SAMPLE_EVENTS.itemCompletedMessage);
        lineHandler('{"type":"turn.completed","usage":{"input_tokens":100,"output_tokens":50}}');
      }

      // Simulate close
      if (closeHandler) {
        closeHandler();
      }

      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(result.tokenUsage).toBeDefined();
    });

    it('handles thread not found with needsFallback', async () => {
      let lineHandler: ((line: string) => void) | undefined;
      let closeHandler: (() => void) | undefined;

      const mockReadline = new EventEmitter() as any;
      mockReadline.on = jest.fn((event, handler) => {
        if (event === 'line') {
          lineHandler = handler;
        } else if (event === 'close') {
          closeHandler = handler;
        }
        return mockReadline;
      });

      mockProcess.spawnResume.mockResolvedValue(mockReadline);

      const session = new CodexSession();
      const resultPromise = session.resume(
        'th_nonexistent',
        'Continue',
        '/tmp/project',
        'build-123',
        10000
      );

      await Promise.resolve();
      await Promise.resolve();

      // Simulate thread not found error
      if (lineHandler) {
        lineHandler('Error: Thread not found - th_nonexistent does not exist');
      }

      // Simulate close
      if (closeHandler) {
        closeHandler();
      }

      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.needsFallback).toBe(true);
    });
  });
});
