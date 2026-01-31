# Codex Integration Test Plan

**Created**: January 16, 2026
**Based on**: Analysis of existing test infrastructure and Codex implementation

---

## Executive Summary

This document provides a comprehensive test plan for the Codex CLI integration. The plan covers unit tests, integration tests, and CODEX_HOME isolation verification based on analysis of:
- 4 core implementation files (1,924 total lines)
- Existing Jest test infrastructure patterns
- Claude-related testing approaches


  To Run Tests:

  cd /Users/sh/Sites/sheenapps/sheenapps-claude-worker

  # Run all Codex tests
  npm test -- --testPathPatterns=codex

  # Run specific test file
  npm test -- codexMessageParser.test.ts

  # See test coverage
  npm test -- --coverage --testPathPatterns=codex

  To verify coverage:
  npm test -- --coverage --collectCoverageFrom='src/stream/codex*.ts' --collectCoverageFrom='src/providers/codexCLIProvider.ts'

---

## 1. Test Infrastructure

### Framework & Configuration
- **Framework**: Jest 30.0.3 with ts-jest preset
- **Test Locations**:
  - `__tests__/` at project root for integration tests
  - `src/stream/__tests__/` for unit tests (colocated)
- **Naming**: `*.test.ts` pattern

### Required Test Files
```
sheenapps-claude-worker/
├── __tests__/
│   └── codexIntegration.test.ts       # Integration tests
├── src/
│   └── stream/
│       └── __tests__/
│           ├── codexMessageParser.test.ts
│           ├── codexProcess.test.ts
│           └── codexSession.test.ts
│   └── providers/
│       └── __tests__/
│           └── codexCLIProvider.test.ts
```

---

## 2. CodexMessageParser Unit Tests

**File**: `src/stream/__tests__/codexMessageParser.test.ts`
**Target**: `src/stream/codexMessageParser.ts` (471 lines)

### 2.1 parse() Method Tests

#### Event Type Parsing
| Test Case | Input | Expected Output |
|-----------|-------|-----------------|
| thread.started | `{"type":"thread.started","thread_id":"th_123"}` | `{type:'thread.started', thread_id:'th_123', raw:...}` |
| turn.started | `{"type":"turn.started","turn_id":"turn_456"}` | `{type:'turn.started', turn_id:'turn_456', raw:...}` |
| turn.completed with usage | `{"type":"turn.completed","usage":{...}}` | `{type:'turn.completed', usage:{...}, raw:...}` |
| turn.completed without usage | `{"type":"turn.completed"}` | `{type:'turn.completed', raw:...}` |
| turn.failed | `{"type":"turn.failed","error":{"message":"..."}}` | `{type:'turn.failed', error:{...}, raw:...}` |
| item.started (all item types) | Various item types | Correct item parsing |
| item.updated | `{"type":"item.updated","item":{...}}` | `{type:'item.updated', item:{...}, raw:...}` |
| item.completed | `{"type":"item.completed","item":{...}}` | `{type:'item.completed', item:{...}, raw:...}` |
| error | `{"type":"error","error":{"message":"..."}}` | `{type:'error', error:{...}, raw:...}` |
| unknown type | `{"type":"future.event"}` | `{type:'unknown', raw:...}` |

#### Edge Cases
| Test Case | Input | Expected Output |
|-----------|-------|-----------------|
| Empty line | `""` | `null` |
| Whitespace only | `"   "` | `null` |
| Non-JSON line | `"Loading..."` | `null` |
| Line with "codex" | `"codex v1.0.0"` | `null` |
| Malformed JSON | `"{broken"` | `null` (logged) |
| Line not starting with { | `"text {"` | `null` |
| Very long line | 10KB JSON | Parses correctly |
| Unicode content | `{"type":"error","error":{"message":"错误"}}` | Correct parsing |

### 2.2 State Accumulation Tests

```typescript
describe('state accumulation', () => {
  it('should capture threadId from thread.started', () => {
    parser.parse('{"type":"thread.started","thread_id":"th_123"}');
    expect(parser.getSessionId()).toBe('th_123');
  });

  it('should capture finalMessage from completed agent_message', () => {
    parser.parse('{"type":"item.completed","item":{"type":"agent_message","text":"Hello"}}');
    expect(parser.getFinalMessage()).toBe('Hello');
  });

  it('should capture usage from turn.completed', () => {
    parser.parse('{"type":"turn.completed","usage":{"input_tokens":100,"output_tokens":50}}');
    expect(parser.getUsage()).toEqual({input_tokens:100, output_tokens:50});
  });

  it('should capture error from turn.failed', () => {
    parser.parse('{"type":"turn.failed","error":{"message":"Rate limited"}}');
    expect(parser.getError()).toEqual({message:'Rate limited'});
  });

  it('should accumulate toolCalls from item events', () => {
    parser.parse('{"type":"item.started","item":{"type":"file_change","action":"create","file_path":"test.js"}}');
    expect(parser.getToolCalls()).toHaveLength(1);
  });

  it('should reset all state correctly', () => {
    parser.parse('{"type":"thread.started","thread_id":"th_123"}');
    parser.reset();
    expect(parser.getSessionId()).toBeNull();
  });
});
```

### 2.3 toAgentEvent() Conversion Tests

| Source Event | Expected AgentEvent Type | Key Fields |
|--------------|--------------------------|------------|
| thread.started | session_start | sessionId |
| turn.completed (with usage) | usage | inputTokens, outputTokens |
| turn.completed (no usage) | null | - |
| item.completed (agent_message) | message | text |
| item.started (file_change) | tool_call | tool, toolInput |
| item.completed (file_change) | tool_result | tool, toolResult |
| item.started (command_execution) | tool_call | tool:'Bash' |
| item.completed (reasoning) | progress | text |
| error | error | text |
| turn.failed | error | text |
| unknown | null | - |

### 2.4 itemToToolCall() Tests

| Item Type | Action | Expected Tool |
|-----------|--------|---------------|
| file_change | create | Write |
| file_change | modify | Edit |
| file_change | delete | Write (with action) |
| command_execution | - | Bash |
| web_search | - | WebSearch |
| todo_list | - | TodoWrite |
| agent_message | - | null |
| reasoning | - | null |
| mcp_tool_call | - | Unknown |

### 2.5 Static Method Tests

```typescript
describe('static methods', () => {
  describe('isToolUse', () => {
    it('returns true for file_change', () => {
      const event = {type:'item.started', item:{type:'file_change'}};
      expect(CodexMessageParser.isToolUse(event)).toBe(true);
    });
    it('returns false for agent_message', () => {
      const event = {type:'item.started', item:{type:'agent_message'}};
      expect(CodexMessageParser.isToolUse(event)).toBe(false);
    });
  });

  describe('extractToolUses', () => {
    it('extracts file_change as Write/Edit', () => {...});
    it('extracts command_execution as Bash', () => {...});
    it('returns empty for non-tool items', () => {...});
  });
});
```

---

## 3. CodexStreamProcess Unit Tests

**File**: `src/stream/__tests__/codexProcess.test.ts`
**Target**: `src/stream/codexProcess.ts` (448 lines)

### 3.1 Mocking Requirements

```typescript
// Top-level mocks
jest.mock('child_process');
jest.mock('fs');
jest.mock('../services/pathGuard');
jest.mock('../services/buildLogger');

// Mock implementations
const mockSpawn = spawn as jest.Mock;
const mockExistsSync = fs.existsSync as jest.Mock;
const mockAccess = fs.promises.access as jest.Mock;
```

### 3.2 spawn() Method Tests

| Test Case | Setup | Expected |
|-----------|-------|----------|
| Valid options | Valid workDir, binary exists | Returns readline interface |
| Invalid workDir (PathGuard) | PathGuard returns false | Throws "Invalid working directory" |
| Non-existent workDir | existsSync returns false | Throws "Working directory does not exist" |
| Binary not found | All access checks fail | Throws "Codex CLI not found" |
| Returns readline | Process spawns | readline.Interface returned |

### 3.3 buildExecArgs() Tests

```typescript
describe('buildExecArgs', () => {
  it('includes exec and --json', () => {
    const args = process['buildExecArgs']({...});
    expect(args).toContain('exec');
    expect(args).toContain('--json');
  });

  it('includes --cd with workDir', () => {
    const args = process['buildExecArgs']({workDir:'/test',...});
    expect(args).toContain('--cd');
    expect(args).toContain('/test');
  });

  it('includes model via -c when provided', () => {
    const args = process['buildExecArgs']({model:'gpt-5.2-codex',...});
    expect(args).toContain('-c');
    expect(args).toContain('model="gpt-5.2-codex"');
  });

  it('includes approval_policy', () => {
    const args = process['buildExecArgs']({approvalPolicy:'never',...});
    expect(args).toContain('approval_policy="never"');
  });

  it('includes sandbox_mode', () => {
    const args = process['buildExecArgs']({sandboxMode:'workspace-write',...});
    expect(args).toContain('sandbox_mode="workspace-write"');
  });

  it('includes --skip-git-repo-check when true', () => {
    const args = process['buildExecArgs']({skipGitRepoCheck:true,...});
    expect(args).toContain('--skip-git-repo-check');
  });

  it('omits --skip-git-repo-check when false', () => {
    const args = process['buildExecArgs']({skipGitRepoCheck:false,...});
    expect(args).not.toContain('--skip-git-repo-check');
  });
});
```

### 3.4 buildEnvironment() Tests

```typescript
describe('buildEnvironment', () => {
  it('inherits process.env', () => {
    process.env.EXISTING_VAR = 'value';
    const env = process['buildEnvironment']({});
    expect(env.EXISTING_VAR).toBe('value');
  });

  it('sets CODEX_HOME when provided', () => {
    const env = process['buildEnvironment']({codexHome:'/custom/home'});
    expect(env.CODEX_HOME).toBe('/custom/home');
  });

  it('sets CODEX_API_KEY when provided', () => {
    const env = process['buildEnvironment']({apiKey:'sk-test'});
    expect(env.CODEX_API_KEY).toBe('sk-test');
  });

  it('sets NODE_ENV to production', () => {
    const env = process['buildEnvironment']({});
    expect(env.NODE_ENV).toBe('production');
  });
});
```

### 3.5 findCodexBinary() Tests

```typescript
describe('findCodexBinary', () => {
  beforeEach(() => {
    mockAccess.mockRejectedValue(new Error('not found'));
  });

  it('returns first found binary', async () => {
    mockAccess
      .mockRejectedValueOnce(new Error()) // /usr/local/bin/codex
      .mockResolvedValueOnce(undefined);  // /usr/bin/codex (found!)

    const binary = await process['findCodexBinary']();
    expect(binary).toBe('/usr/bin/codex');
  });

  it('falls back to PATH resolution', async () => {
    // All specific paths fail
    mockAccess.mockRejectedValue(new Error());

    const binary = await process['findCodexBinary']();
    expect(binary).toBe('codex'); // PATH fallback
  });

  it('checks all expected paths in order', async () => {
    mockAccess.mockRejectedValue(new Error());
    await process['findCodexBinary']();

    expect(mockAccess).toHaveBeenCalledWith('/usr/local/bin/codex', expect.any(Number));
    expect(mockAccess).toHaveBeenCalledWith('/opt/homebrew/bin/codex', expect.any(Number));
    // ... verify all paths
  });
});
```

### 3.6 kill() Tests

```typescript
describe('kill', () => {
  it('sends SIGTERM first', () => {
    const mockProcess = {kill: jest.fn(), killed: false, pid: 123};
    process['process'] = mockProcess as any;

    process.kill();
    expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('sends SIGKILL after 5s if still alive', async () => {
    jest.useFakeTimers();
    const mockProcess = {kill: jest.fn(), killed: false, pid: 123};
    process['process'] = mockProcess as any;

    process.kill();
    jest.advanceTimersByTime(5001);

    expect(mockProcess.kill).toHaveBeenCalledWith('SIGKILL');
    jest.useRealTimers();
  });

  it('does nothing if no process', () => {
    process['process'] = null;
    expect(() => process.kill()).not.toThrow();
  });
});
```

### 3.7 spawnResume() Tests

```typescript
describe('spawnResume', () => {
  it('includes --thread flag with threadId', async () => {
    // Setup mocks...
    await process.spawnResume('thread_123', options);

    expect(mockSpawn).toHaveBeenCalledWith(
      'sh',
      ['-c', expect.stringContaining('--thread thread_123')],
      expect.any(Object)
    );
  });

  it('validates workDir same as spawn()', async () => {
    mockPathGuard.isProjectDirectory.mockReturnValue(false);

    await expect(process.spawnResume('thread_123', options))
      .rejects.toThrow('Invalid working directory');
  });
});
```

---

## 4. CodexSession Unit Tests

**File**: `src/stream/__tests__/codexSession.test.ts`
**Target**: `src/stream/codexSession.ts` (582 lines)

### 4.1 Mocking Requirements

```typescript
jest.mock('./codexProcess');
jest.mock('./codexMessageParser');
jest.mock('./rateLimiter');
jest.mock('../services/eventService');
jest.mock('../types/cleanEvents');
```

### 4.2 run() Method Tests

```typescript
describe('run', () => {
  let session: CodexSession;
  let mockProcess: jest.Mocked<CodexStreamProcess>;
  let mockParser: jest.Mocked<CodexMessageParser>;
  let mockRateLimiter: {acquire: jest.Mock, release: jest.Mock};

  beforeEach(() => {
    session = new CodexSession();
    mockProcess = new CodexStreamProcess() as jest.Mocked<CodexStreamProcess>;
    mockRateLimiter = {acquire: jest.fn(), release: jest.fn()};
    getGlobalRateLimiter.mockReturnValue(mockRateLimiter);
  });

  it('acquires and releases rate limiter', async () => {
    // Setup successful run...
    await session.run(prompt, workDir, buildId);

    expect(mockRateLimiter.acquire).toHaveBeenCalled();
    expect(mockRateLimiter.release).toHaveBeenCalled();
  });

  it('releases rate limiter on error', async () => {
    mockProcess.spawn.mockRejectedValue(new Error('spawn failed'));

    await expect(session.run(prompt, workDir, buildId)).rejects.toThrow();
    expect(mockRateLimiter.release).toHaveBeenCalled();
  });

  it('returns success result on turn.completed', async () => {
    // Mock readline to emit turn.completed event
    const result = await session.run(prompt, workDir, buildId);

    expect(result.success).toBe(true);
    expect(result.sessionId).toBeDefined();
  });

  it('returns error result on turn.failed', async () => {
    // Mock readline to emit turn.failed event
    const result = await session.run(prompt, workDir, buildId);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('handles timeout correctly', async () => {
    jest.useFakeTimers();
    // Mock readline that never completes
    const resultPromise = session.run(prompt, workDir, buildId, 1000);

    jest.advanceTimersByTime(1001);
    const result = await resultPromise;

    expect(result.success).toBe(false);
    expect(result.error).toContain('timeout');
    expect(mockProcess.kill).toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('emits progress events via CleanEventEmitter', async () => {
    // With userId to enable emitter
    await session.run(prompt, workDir, buildId, 900000, 'user_123');

    expect(CleanEventEmitter.prototype.phaseProgressWithCode).toHaveBeenCalled();
  });

  it('falls back to emitBuildEvent without userId', async () => {
    await session.run(prompt, workDir, buildId);

    expect(emitBuildEvent).toHaveBeenCalledWith(
      buildId,
      'ai_started',
      expect.any(Object)
    );
  });
});
```

### 4.3 handleAgentEvent() Tests

```typescript
describe('handleAgentEvent', () => {
  it('increments toolCallsTotal on tool_call', async () => {
    await session['handleAgentEvent'](
      {type:'tool_call', tool:'Write', toolInput:{}, source:'codex', raw:{}},
      buildId
    );
    expect(session['toolCallsTotal']).toBe(1);
  });

  it('increments filesCreated on Write tool_result', async () => {
    await session['handleAgentEvent'](
      {type:'tool_result', tool:'Write', source:'codex', raw:{}},
      buildId
    );
    expect(session['filesCreated']).toBe(1);
  });

  it('increments filesModified on Edit tool_result', async () => {
    await session['handleAgentEvent'](
      {type:'tool_result', tool:'Edit', source:'codex', raw:{}},
      buildId
    );
    expect(session['filesModified']).toBe(1);
  });

  it('adds error to buildErrors on error event', async () => {
    await session['handleAgentEvent'](
      {type:'error', text:'Something failed', source:'codex', raw:{}},
      buildId
    );
    expect(session['buildErrors']).toHaveLength(1);
  });
});
```

### 4.4 emitToolProgress() Tests

```typescript
describe('emitToolProgress', () => {
  it('emits BUILD_FILE_CREATING for Write tool', async () => {
    session['cleanEmitter'] = mockCleanEmitter;

    await session['emitToolProgress'](
      {type:'tool_call', tool:'Write', toolInput:{file_path:'/test/app.tsx'}, source:'codex', raw:{}},
      buildId
    );

    expect(mockCleanEmitter.phaseProgressWithCode).toHaveBeenCalledWith(
      'development',
      'BUILD_FILE_CREATING',
      expect.any(Number),
      {filename: 'app.tsx'}
    );
  });

  it('emits BUILD_DEPENDENCIES_INSTALLING for npm install', async () => {
    await session['emitToolProgress'](
      {type:'tool_call', tool:'Bash', toolInput:{command:'npm install'}, source:'codex', raw:{}},
      buildId
    );

    expect(mockCleanEmitter.phaseProgressWithCode).toHaveBeenCalledWith(
      'development',
      'BUILD_DEPENDENCIES_INSTALLING',
      expect.any(Number),
      undefined
    );
  });
});
```

### 4.5 resume() Method Tests

```typescript
describe('resume', () => {
  it('passes threadId to spawnResume', async () => {
    await session.resume('thread_123', prompt, workDir, buildId);

    expect(CodexStreamProcess.prototype.spawnResume).toHaveBeenCalledWith(
      'thread_123',
      expect.any(Object)
    );
  });

  it('returns needsFallback when thread not found', async () => {
    // Mock readline to emit "Thread not found" line
    const result = await session.resume('thread_123', prompt, workDir, buildId);

    expect(result.needsFallback).toBe(true);
    expect(result.success).toBe(false);
  });

  it('handles timeout correctly', async () => {
    jest.useFakeTimers();
    const resultPromise = session.resume('thread_123', prompt, workDir, buildId, 1000);

    jest.advanceTimersByTime(1001);
    const result = await resultPromise;

    expect(result.error).toContain('timeout');
    jest.useRealTimers();
  });
});
```

### 4.6 buildResult() Tests

```typescript
describe('buildResult', () => {
  it('aggregates all tracked state', () => {
    session['filesCreated'] = 5;
    session['filesModified'] = 3;
    session['toolCallsTotal'] = 10;
    session['buildErrors'] = [{type:'error', message:'test'}];
    session['threadId'] = 'thread_123';
    mockParser.getUsage.mockReturnValue({input_tokens:100, output_tokens:50});
    mockParser.getFinalMessage.mockReturnValue('Done!');

    const result = session['buildResult']();

    expect(result).toEqual({
      success: true,
      result: 'Done!',
      sessionId: 'thread_123',
      tokenUsage: {input: 100, output: 50},
      filesCreated: 5,
      filesModified: 3,
      toolCallsTotal: 10,
      errorsEncountered: 1,
      errorsFixed: 0
    });
  });
});
```

---

## 5. CodexCLIProvider Unit Tests

**File**: `src/providers/__tests__/codexCLIProvider.test.ts`
**Target**: `src/providers/codexCLIProvider.ts` (422 lines)

### 5.1 Mocking Requirements

```typescript
jest.mock('../stream/codexSession');
jest.mock('child_process');
jest.mock('ulid');
```

### 5.2 Constructor & Config Tests

```typescript
describe('constructor', () => {
  it('sets default approvalPolicy to never', () => {
    const provider = new CodexCLIProvider();
    expect(provider['config'].approvalPolicy).toBe('never');
  });

  it('sets default sandboxMode to workspace-write', () => {
    const provider = new CodexCLIProvider();
    expect(provider['config'].sandboxMode).toBe('workspace-write');
  });

  it('allows config override', () => {
    const provider = new CodexCLIProvider({
      model: 'gpt-5.2-codex',
      approvalPolicy: 'on-request'
    });
    expect(provider['config'].model).toBe('gpt-5.2-codex');
    expect(provider['config'].approvalPolicy).toBe('on-request');
  });
});
```

### 5.3 healthCheck() Tests

```typescript
describe('healthCheck', () => {
  it('returns true when codex is available', async () => {
    execSync.mockReturnValue('codex version 1.0.0');

    const provider = new CodexCLIProvider();
    const result = await provider.healthCheck();

    expect(result).toBe(true);
  });

  it('returns false when codex not found', async () => {
    execSync.mockImplementation(() => { throw new Error('not found'); });

    const provider = new CodexCLIProvider();
    const result = await provider.healthCheck();

    expect(result).toBe(false);
  });
});
```

### 5.4 plan() Tests

```typescript
describe('plan', () => {
  it('calls runCodex with built prompt', async () => {
    mockSession.run.mockResolvedValue({
      success: true,
      result: '[{"id":"1","type":"create_file","name":"Test"}]'
    });

    const result = await provider.plan('Build a React app', context);

    expect(result.tasks).toHaveLength(1);
    expect(result.claudeSessionId).toBeDefined();
  });

  it('handles session resume when sessionId provided', async () => {
    await provider.plan('Continue', context, 'session_123');

    expect(mockSession.resume).toHaveBeenCalledWith(
      'session_123',
      expect.any(String),
      expect.any(String),
      expect.any(String)
    );
  });

  it('falls back to new session when resume fails with needsFallback', async () => {
    mockSession.resume.mockResolvedValue({needsFallback: true});
    mockSession.run.mockResolvedValue({success: true, result: '[]'});

    await provider.plan('Continue', context, 'session_123');

    expect(mockSession.run).toHaveBeenCalled();
  });
});
```

### 5.5 parsePlanResponse() Tests

```typescript
describe('parsePlanResponse', () => {
  it('parses valid JSON array', () => {
    const result = provider['parsePlanResponse']('[{"id":"1","type":"create_file"}]');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBeDefined(); // ulid assigned
  });

  it('extracts JSON from markdown', () => {
    const result = provider['parsePlanResponse']('Here is the plan:\n[{"id":"1"}]\nDone!');
    expect(result).toHaveLength(1);
  });

  it('returns fallback task on invalid JSON', () => {
    const result = provider['parsePlanResponse']('not json');
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('create_file');
  });
});
```

---

## 6. Integration Tests

**File**: `__tests__/codexIntegration.test.ts`

### 6.1 With Mocked JSONL Stream

```typescript
describe('Codex Integration (Mocked)', () => {
  it('full flow: spawn → parse → result', async () => {
    const mockLines = [
      '{"type":"thread.started","thread_id":"th_123"}',
      '{"type":"turn.started","turn_id":"turn_1"}',
      '{"type":"item.started","item":{"type":"agent_message","id":"msg_1"}}',
      '{"type":"item.completed","item":{"type":"agent_message","id":"msg_1","text":"Done!"}}',
      '{"type":"turn.completed","usage":{"input_tokens":100,"output_tokens":50}}'
    ];

    // Mock readline to emit these lines
    const session = new CodexSession();
    const result = await session.run('Test prompt', '/tmp/test', 'build_123');

    expect(result.success).toBe(true);
    expect(result.sessionId).toBe('th_123');
    expect(result.result).toBe('Done!');
    expect(result.tokenUsage).toEqual({input: 100, output: 50});
  });

  it('handles file_change events correctly', async () => {
    const mockLines = [
      '{"type":"thread.started","thread_id":"th_123"}',
      '{"type":"item.started","item":{"type":"file_change","action":"create","file_path":"app.tsx"}}',
      '{"type":"item.completed","item":{"type":"file_change","action":"create","file_path":"app.tsx"}}',
      '{"type":"turn.completed"}'
    ];

    const result = await session.run(...);
    expect(result.filesCreated).toBe(1);
  });

  it('handles error events', async () => {
    const mockLines = [
      '{"type":"thread.started","thread_id":"th_123"}',
      '{"type":"turn.failed","error":{"message":"Rate limited","code":"rate_limit"}}'
    ];

    const result = await session.run(...);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Rate limited');
  });
});
```

### 6.2 With Real Codex Binary (Conditional)

```typescript
describe('Codex Integration (Real Binary)', () => {
  const CODEX_AVAILABLE = process.env.TEST_WITH_CODEX === 'true';

  beforeAll(() => {
    if (!CODEX_AVAILABLE) {
      console.log('Skipping real Codex tests (set TEST_WITH_CODEX=true to enable)');
    }
  });

  (CODEX_AVAILABLE ? it : it.skip)('simple prompt returns structured response', async () => {
    const provider = new CodexCLIProvider();
    await provider.initialize();

    const result = await provider.plan('Create a hello world HTML file', {
      framework: 'html',
      projectPath: '/tmp/codex-test',
      existingFiles: []
    });

    expect(result.tasks.length).toBeGreaterThan(0);
    expect(result.claudeSessionId).toBeDefined();
  }, 60000); // 60s timeout for real API
});
```

---

## 7. CODEX_HOME Isolation Tests

**File**: `__tests__/codexHomeIsolation.test.ts`

### 7.1 Test Strategy

```typescript
describe('CODEX_HOME Isolation', () => {
  let tempDir1: string;
  let tempDir2: string;

  beforeEach(async () => {
    tempDir1 = path.join(os.tmpdir(), `codex-test-1-${ulid()}`);
    tempDir2 = path.join(os.tmpdir(), `codex-test-2-${ulid()}`);
    await fs.mkdir(tempDir1, {recursive: true});
    await fs.mkdir(tempDir2, {recursive: true});
  });

  afterEach(async () => {
    await fs.rm(tempDir1, {recursive: true, force: true});
    await fs.rm(tempDir2, {recursive: true, force: true});
  });

  it('each session uses unique CODEX_HOME', async () => {
    const session1 = new CodexSession();
    const session2 = new CodexSession();

    // Spy on spawn to capture environment
    const spawnSpy = jest.spyOn(require('child_process'), 'spawn');

    await session1.run('test', '/tmp/work', 'build1', 900000, undefined, undefined, {
      codexHome: tempDir1
    });

    await session2.run('test', '/tmp/work', 'build2', 900000, undefined, undefined, {
      codexHome: tempDir2
    });

    const env1 = spawnSpy.mock.calls[0][2].env;
    const env2 = spawnSpy.mock.calls[1][2].env;

    expect(env1.CODEX_HOME).toBe(tempDir1);
    expect(env2.CODEX_HOME).toBe(tempDir2);
    expect(env1.CODEX_HOME).not.toBe(env2.CODEX_HOME);
  });

  it('config files are isolated between sessions', async () => {
    // Create different config in each CODEX_HOME
    await fs.writeFile(
      path.join(tempDir1, 'config.toml'),
      'model = "gpt-5.1-codex"'
    );
    await fs.writeFile(
      path.join(tempDir2, 'config.toml'),
      'model = "gpt-5.2-codex"'
    );

    // Run sessions and verify they see their own config
    // (Would need actual Codex to verify, or mock config reading)
  });

  it('no cross-contamination of history', async () => {
    // Verify that session history in one CODEX_HOME doesn't leak to another
    // This requires checking the history directory after runs
  });
});
```

---

## 8. Test Data Fixtures

### 8.1 Sample JSONL Events

```typescript
// testFixtures/codexEvents.ts
export const SAMPLE_EVENTS = {
  threadStarted: '{"type":"thread.started","thread_id":"th_abc123"}',
  turnStarted: '{"type":"turn.started","turn_id":"turn_001"}',
  turnCompleted: '{"type":"turn.completed","usage":{"input_tokens":150,"output_tokens":75,"cached_input_tokens":50}}',
  turnFailed: '{"type":"turn.failed","error":{"code":"rate_limit","message":"Rate limit exceeded"}}',

  itemStartedMessage: '{"type":"item.started","item":{"id":"item_1","type":"agent_message"}}',
  itemCompletedMessage: '{"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"Hello, I will help you build this app."}}',

  itemStartedFileCreate: '{"type":"item.started","item":{"id":"item_2","type":"file_change","action":"create","file_path":"src/App.tsx"}}',
  itemCompletedFileCreate: '{"type":"item.completed","item":{"id":"item_2","type":"file_change","action":"create","file_path":"src/App.tsx","content":"export default function App() { return <div>Hello</div>; }"}}',

  itemStartedBash: '{"type":"item.started","item":{"id":"item_3","type":"command_execution","command":"npm install"}}',
  itemCompletedBash: '{"type":"item.completed","item":{"id":"item_3","type":"command_execution","command":"npm install","exit_code":0,"output":"added 500 packages"}}',

  itemReasoning: '{"type":"item.completed","item":{"id":"item_4","type":"reasoning","reasoning":"I will create a React component..."}}',

  itemTodoList: '{"type":"item.completed","item":{"id":"item_5","type":"todo_list","todos":[{"content":"Create App.tsx","status":"completed"},{"content":"Add styles","status":"in_progress"}]}}',

  error: '{"type":"error","error":{"code":"internal_error","message":"Something went wrong"}}'
};

export const FULL_SESSION_FLOW = [
  SAMPLE_EVENTS.threadStarted,
  SAMPLE_EVENTS.turnStarted,
  SAMPLE_EVENTS.itemStartedMessage,
  SAMPLE_EVENTS.itemCompletedMessage,
  SAMPLE_EVENTS.itemStartedFileCreate,
  SAMPLE_EVENTS.itemCompletedFileCreate,
  SAMPLE_EVENTS.turnCompleted
].join('\n');
```

---

## 9. Test Execution Plan

### 9.1 Test Categories

| Category | Files | Estimated Tests | Priority |
|----------|-------|-----------------|----------|
| Unit: MessageParser | 1 | ~35 | P0 |
| Unit: StreamProcess | 1 | ~25 | P0 |
| Unit: Session | 1 | ~30 | P0 |
| Unit: Provider | 1 | ~20 | P1 |
| Integration | 1 | ~15 | P1 |
| CODEX_HOME Isolation | 1 | ~10 | P2 |
| **Total** | **6** | **~135** | - |

### 9.2 Execution Order

1. **Phase 1** (P0): Core unit tests
   - CodexMessageParser tests (pure logic, no mocking)
   - CodexStreamProcess tests (mock child_process, fs)
   - CodexSession tests (mock dependencies)

2. **Phase 2** (P1): Provider and integration
   - CodexCLIProvider tests
   - Integration tests with mocked JSONL

3. **Phase 3** (P2): Advanced
   - CODEX_HOME isolation tests
   - Real binary tests (conditional)

### 9.3 CI Configuration

```json
// package.json additions
{
  "scripts": {
    "test:codex": "jest --testPathPatterns=codex",
    "test:codex:watch": "jest --testPathPattersn=codex --watch",
    "test:codex:coverage": "jest --testPathPatterns=codex --coverage"
  }
}
```

---

## 10. Success Criteria

- [ ] All unit tests pass
- [ ] Code coverage > 80% for Codex files
- [ ] Integration tests pass with mocked JSONL
- [ ] CODEX_HOME isolation verified
- [ ] No memory leaks (timers cleaned up)
- [ ] Error paths tested (timeout, binary not found, etc.)

---

## 11. Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Flaky async tests | Use `jest.useFakeTimers()` for timeout tests |
| Process mocking complexity | Create helper function for mock ChildProcess |
| Readline mocking | Create async generator mock helper |
| CODEX_HOME tests require real Codex | Mark as conditional, run in CI with Codex installed |

---

## Appendix: Mock Helpers

### A1. Mock ChildProcess Factory

```typescript
// __tests__/helpers/mockChildProcess.ts
export function createMockChildProcess(options: {
  stdout?: string[];
  stderr?: string;
  exitCode?: number;
} = {}) {
  const {stdout = [], stderr = '', exitCode = 0} = options;

  const stdoutEmitter = new EventEmitter();
  const stderrEmitter = new EventEmitter();
  const processEmitter = new EventEmitter();

  const mockProcess = {
    stdout: Object.assign(stdoutEmitter, {
      on: stdoutEmitter.on.bind(stdoutEmitter),
      pipe: jest.fn()
    }),
    stderr: Object.assign(stderrEmitter, {
      on: stderrEmitter.on.bind(stderrEmitter)
    }),
    stdin: {
      write: jest.fn((data, cb) => cb?.()),
      end: jest.fn((cb) => cb?.()),
      writable: true,
      destroyed: false
    },
    on: processEmitter.on.bind(processEmitter),
    kill: jest.fn(),
    killed: false,
    pid: 12345
  };

  // Simulate stdout emission
  setTimeout(() => {
    stdout.forEach(line => stdoutEmitter.emit('data', Buffer.from(line + '\n')));
    processEmitter.emit('exit', exitCode, null);
  }, 10);

  return mockProcess;
}
```

### A2. Mock Readline Interface

```typescript
// __tests__/helpers/mockReadline.ts
export function createMockReadline(lines: string[]) {
  let lineIndex = 0;

  return {
    [Symbol.asyncIterator]: async function* () {
      for (const line of lines) {
        yield line;
      }
    },
    on: jest.fn((event, handler) => {
      if (event === 'line') {
        lines.forEach(line => handler(line));
      } else if (event === 'close') {
        setTimeout(() => handler(), lines.length * 10);
      }
    }),
    close: jest.fn()
  };
}
```
