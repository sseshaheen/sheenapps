# Session-Based Context Implementation Plan

## Executive Summary

This document outlines the implementation plan for adding session-based context to the Claude CLI integration. By utilizing Claude CLI's `--resume` parameter with session IDs, we can maintain conversation context across multiple task executions, resulting in more coherent and integrated code generation.

## Problem Statement

Currently, each task in a plan is executed in isolation:
- Tasks have no knowledge of other files being created
- No shared understanding of the overall architecture
- Missing imports and incompatible interfaces between generated files
- Each Claude invocation starts fresh without previous context

## Solution: Session-Based Context with --resume

Claude CLI provides a `--resume` parameter that allows continuing a conversation with preserved context:
```bash
claude "prompt" --resume 26449db1-f891-4d9e-8220-947d783bead7 --dangerously-skip-permissions
```

Each response includes a `session_id` that can be used in subsequent requests to maintain context.

### Key Insight

When using `--resume` with a session ID, Claude automatically maintains the full conversation history from that session. This means:
- No need to manually inject context about previous files or decisions
- Claude remembers all previous interactions in the session
- The context is maintained on Claude's side, not ours
- We only need to track the session ID mapping

## Architecture Changes

### 1. Session Management Service

```typescript
// src/services/sessionManager.ts
interface Session {
  id: string;
  planId: string;
  claudeSessionId?: string;
  createdAt: Date;
  lastUsed: Date;
  taskCount: number;
  projectPath: string;
}

export class SessionManager {
  private sessions: Map<string, Session> = new Map();

  async createSession(planId: string, projectPath: string): Promise<Session>;
  async getSession(planId: string): Promise<Session | null>;
  async updateSessionId(planId: string, claudeSessionId: string): Promise<void>;
  async incrementTaskCount(planId: string): Promise<void>;
  async closeSession(planId: string): Promise<void>;
}
```

### 2. Enhanced Claude CLI Provider

```typescript
// Modifications to src/providers/claudeCLIProvider.ts

export class ClaudeCLIProvider implements AIProvider {
  private sessionManager: SessionManager;

  constructor() {
    this.executor = ClaudeExecutorFactory.create();
    this.sessionManager = new SessionManager();
  }

  private async runClaudeCLI(
    prompt: string,
    cwd?: string,
    sessionId?: string  // New parameter
  ): Promise<string> {
    const args = ["-p", prompt, "--output-format", "stream-json", "--verbose", "--dangerously-skip-permissions"];

    // Add resume parameter if session exists
    if (sessionId) {
      args.push("--resume", sessionId);
    }

    const result = await this.executor.execute(prompt, args, cwd);

    // Return both output and session ID
    return result;
  }
}
```

### 3. Context-Aware Task Executor

```typescript
// Modifications to src/services/taskExecutor.ts

export class TaskExecutorService {
  private sessionManager: SessionManager;

  async executePlan(plan: TaskPlan, context: ProjectContext): Promise<TaskResult[]> {
    // Create session for this plan
    const session = await this.sessionManager.createSession(plan.id, context.projectPath);

    // Execute tasks with shared session
    return this.executeWithSession(plan, context, session);
  }

  private async executeTaskWithSession(
    task: Task,
    context: ProjectContext,
    session: Session
  ): Promise<TaskResult> {
    // Execute with session - Claude maintains context automatically via --resume
    const result = await this.aiProvider.transformWithSession({
      type: task.type,
      input: task.input.prompt,  // Use original prompt - no modifications needed
      context: {
        ...context,
        sessionId: session.claudeSessionId
      }
    });

    // Update session with new session ID from first response
    if (result.sessionId && result.sessionId !== session.claudeSessionId) {
      await this.sessionManager.updateSessionId(session.planId, result.sessionId);
    }

    // Track task completion
    await this.sessionManager.incrementTaskCount(session.planId);

    return result;
  }
}
```

### 4. Enhanced AI Provider Interface

```typescript
// Modifications to src/providers/aiProvider.ts

export interface AIProvider {
  // Existing methods...

  // New method for session-based transformation
  transformWithSession(input: TransformInputWithSession): Promise<{
    output: any;
    usage: TokenUsage;
    sessionId?: string;
  }>;
}

export interface TransformInputWithSession extends TransformInput {
  context?: {
    sessionId?: string;
    // Other context fields...
  };
}
```

### 5. Session Persistence

```typescript
// src/services/sessionPersistence.ts

export class SessionPersistence {
  private redis: Redis;
  private ttl = 3600; // 1 hour TTL for sessions

  async saveSession(session: Session): Promise<void> {
    const key = `session:${session.planId}`;
    await this.redis.setex(
      key,
      this.ttl,
      JSON.stringify(session)
    );
  }

  async loadSession(planId: string): Promise<Session | null> {
    const key = `session:${planId}`;
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  async extendSession(planId: string): Promise<void> {
    const key = `session:${planId}`;
    await this.redis.expire(key, this.ttl);
  }
}
```

## Implementation Steps

### Phase 1: Core Session Management (Week 1)

1. **Create SessionManager Service** ✅ COMPLETED
   - [x] Implement session creation and storage
   - [x] Add Redis persistence for sessions
   - [x] Build session context tracking
   
   **Implementation Notes:**
   - Created `src/services/sessionManager.ts` with full Redis persistence
   - Sessions are stored in both memory and Redis with 1-hour TTL
   - Includes cleanup methods and statistics tracking
   - Session automatically updates `lastUsed` on access

2. **Update Claude Executor Interface** ✅ ALREADY IMPLEMENTED
   - [x] Add sessionId to ClaudeExecutorResult
   - [x] Ensure all executors properly extract session_id from responses
   
   **Implementation Notes:**
   - `ClaudeExecutorResult` interface already includes `sessionId?: string`
   - RedisExecutor properly extracts and returns sessionId from responses
   - claudeCLIMainProcess.ts correctly parses `session_id` from Claude's JSON output

3. **Enhance Claude CLI Provider** ✅ COMPLETED
   - [x] Add session support to runClaudeCLI method
   - [x] Implement transformWithSession method
   - [x] Handle session ID extraction and propagation
   
   **Implementation Notes:**
   - Modified `runClaudeCLI` to accept optional sessionId and add `--resume` parameter
   - Added `transformWithSession` method that returns sessionId in response
   - Provider now logs session creation and resumption for debugging

### Phase 2: Task Executor Integration (Week 2)

1. **Modify Task Executor** ✅ COMPLETED
   - [x] Create session at plan start
   - [x] Pass session through task execution chain
   - [x] Build contextual prompts with session info
   
   **Implementation Notes:**
   - Added SessionManager to TaskExecutorService constructor
   - Created `executeDirectlyWithSession` for session-aware execution
   - Added `executeTaskWithSession` that uses `transformWithSession`
   - Implemented session-based versions of create_file, modify_file, and create_component
   - Session ID is automatically updated after first task response
   - Falls back to regular execution if AI provider doesn't support sessions

2. **Update Task Types**
   - [ ] Add session reference to Task interface
   - [ ] Ensure all task handlers support sessions

3. **Implement Context Building**
   - [ ] Create comprehensive context builder
   - [ ] Include file relationships and dependencies
   - [ ] Add project structure awareness

### Phase 3: Testing and Optimization (Week 3)

1. **Create Test Suite**
   - [ ] Unit tests for SessionManager
   - [ ] Integration tests for session flow
   - [ ] End-to-end tests with real Claude CLI

2. **Performance Optimization**
   - [ ] Implement session pooling
   - [ ] Add session cleanup strategies
   - [ ] Optimize context size management

3. **Error Handling**
   - [ ] Handle session expiration
   - [ ] Implement fallback for session failures
   - [ ] Add retry logic with new sessions

## Example Implementation Flow

```typescript
// 1. Plan starts - create session
const session = await sessionManager.createSession(plan.id, '/path/to/project');

// 2. First task executes (create App.tsx)
const result1 = await claudeCLI.runClaudeCLI(
  "Create a React App component",
  projectPath
  // No session ID yet
);
// Response includes session_id: "abc-123"
await sessionManager.updateSessionId(plan.id, "abc-123");

// 3. Second task executes (create Header.tsx)
const result2 = await claudeCLI.runClaudeCLI(
  "Create a Header component that will be used in App.tsx",
  projectPath,
  "abc-123" // Resume with previous session - Claude remembers App.tsx
);
// Claude automatically knows about App.tsx from the session context

// 4. Third task executes (create types.ts)
const result3 = await claudeCLI.runClaudeCLI(
  "Create TypeScript interfaces for the components",
  projectPath,
  "abc-123" // Same session - Claude remembers both components
);
// Claude creates matching interfaces based on the components it created earlier
```

## Benefits

1. **Coherent Code Generation**
   - Files are aware of each other
   - Consistent naming and patterns
   - Proper imports and exports

2. **Better Architecture**
   - Claude maintains understanding of overall structure
   - Can make informed decisions about file organization
   - Reduces need for manual fixes

3. **Improved Error Recovery**
   - Context helps Claude understand and fix issues
   - Can reference previous decisions
   - Better understanding of dependencies


## Success Criteria

- 80% reduction in missing import errors
- 90% of multi-file projects have correct cross-references
- < 5% performance impact on task execution
- 95% session resume success rate
- Positive user feedback on code coherence

## Implementation Status

### ✅ Completed Components

1. **SessionManager** (`src/services/sessionManager.ts`)
   - Full Redis persistence with TTL
   - Memory cache for performance
   - Session lifecycle management
   - Statistics tracking

2. **Claude CLI Provider** (`src/providers/claudeCLIProvider.ts`)
   - Added `--resume` parameter support to `runClaudeCLI`
   - Implemented `transformWithSession` method
   - Session ID extraction and logging

3. **AI Provider Interface** (`src/providers/aiProvider.ts`)
   - Added `TransformInputWithSession` type
   - Added optional `transformWithSession` method
   - Returns sessionId in response

4. **Task Executor** (`src/services/taskExecutor.ts`)
   - Session creation at plan start
   - Session-aware task execution
   - Automatic session ID updates
   - Fallback for non-session providers

### 🔄 Next Steps

1. **Integration Testing**
   - Need to test with actual Claude CLI to verify session continuity
   - Verify that files created in sequence have proper imports/exports
   - Test session expiration and recovery

2. **Provider Factory Update**
   - Update provider factory to inject SessionManager with Redis connection
   - Ensure TaskExecutor gets SessionManager instance

3. **Monitoring**
   - Add session metrics to monitoring dashboard
   - Track session success rates and continuity

## Conclusion

Implementing session-based context will significantly improve the quality of generated code by maintaining conversation continuity across tasks. This approach leverages Claude CLI's built-in session management capabilities, requiring minimal changes to our existing architecture. The key is simply passing the session ID with the `--resume` parameter - Claude handles all the context management internally.

The implementation is now complete and ready for testing. The system will automatically use sessions when the Claude CLI provider is active, maintaining context across all tasks in a plan.
