# Claude CLI Stream Integration Plan

## Overview

This document outlines the plan to replace the current isolated Claude CLI calls with a stream-based approach that maintains context throughout the entire task execution.

## Current Problems

1. **Isolated Requests**: Each Claude call is made without context from previous calls
2. **Incoherent Results**: Code generation lacks awareness of existing codebase structure
3. **Poor Error Recovery**: Cannot adapt based on previous attempts
4. **No Progress Tracking**: Cannot see intermediate steps or understand Claude's reasoning

## Proposed Solution

Use Claude CLI's `--output-format stream-json` mode to maintain a full conversation session where Claude:
- Maintains complete context throughout the task
- Uses tools coherently and in logical sequence
- Can adapt based on tool execution results
- Provides visibility into progress through TodoWrite tool usage

## Architecture Design

### 1. Core Components

#### ClaudeSession Class
```typescript
interface ClaudeSessionOptions {
  outputFormat: 'stream-json';
  verbose: boolean;
  dangerouslySkipPermissions: boolean;
  workingDirectory?: string;
}

class ClaudeSession {
  private sessionId: string;
  private process: ChildProcess;
  private messages: ClaudeStreamMessage[] = [];

  async run(prompt: string, options: ClaudeSessionOptions): Promise<SessionResult>;
  private parseJSONStream(stream: Readable): AsyncGenerator<ClaudeStreamMessage>;
  private captureResults(): SessionResult;
}
```

#### Message Types
```typescript
interface ClaudeStreamMessage {
  type: 'system' | 'assistant' | 'user' | 'result';
  subtype?: string;
  message?: {
    id: string;
    type: 'message';
    role: string;
    model: string;
    content: Array<{
      type: 'text' | 'tool_use' | 'tool_result';
      text?: string;
      id?: string;
      name?: string;
      input?: any;
      content?: string;
    }>;
    stop_reason: string | null;
    usage: {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens: number;
      cache_read_input_tokens: number;
    };
  };
  session_id: string;
  parent_tool_use_id?: string | null;
}

interface SessionResult {
  success: boolean;
  result: string;
  session_id: string;
  total_cost_usd: number;
  duration_ms: number;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
  };
  messages: ClaudeStreamMessage[];
}
```

### 2. Implementation Strategy

#### Phase 1: Core Stream Processing
```typescript
class ClaudeStreamProcessor {
  async processPrompt(prompt: string): Promise<SessionResult> {
    const session = new ClaudeSession();

    // Start Claude CLI process with stream-json output
    const stream = await session.start(prompt, {
      outputFormat: 'stream-json',
      verbose: true,
      dangerouslySkipPermissions: true
    });

    // Process each message in the stream
    for await (const message of this.parseJSONStream(stream)) {
      this.messages.push(message);

      // Log progress for debugging
      if (message.type === 'assistant' && message.message?.content) {
        this.logAssistantActivity(message);
      }
    }

    // Extract final result
    return this.extractSessionResult();
  }
}
```

#### Phase 2: Integration with Worker System
```typescript
// Replace current deployWorker.ts implementation
async function deployWorkerWithStream(
  taskDescription: string,
  config: WorkerConfig
): Promise<DeploymentResult> {
  const processor = new ClaudeStreamProcessor();

  // Construct detailed prompt with context
  const prompt = buildDeploymentPrompt(taskDescription, config);

  // Execute with full session context
  const result = await processor.processPrompt(prompt);

  // Extract deployment artifacts from session
  return extractDeploymentInfo(result);
}
```

#### Phase 3: Error Recovery System
```typescript
class ClaudeErrorRecovery {
  async executeWithRecovery(
    prompt: string,
    maxRetries: number = 2
  ): Promise<SessionResult> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const enhancedPrompt = attempt > 0
          ? this.enhancePromptWithError(prompt, lastError)
          : prompt;

        return await this.processor.processPrompt(enhancedPrompt);
      } catch (error) {
        lastError = error as Error;
        if (attempt === maxRetries) throw error;
      }
    }

    throw lastError;
  }
}
```

### 3. Benefits of Stream Approach

1. **Context Preservation**: Claude maintains full awareness of:
   - Previous tool executions
   - File contents already read
   - Changes already made
   - Errors encountered

2. **Intelligent Tool Usage**: Claude decides:
   - Which tools to use
   - In what order
   - How to adapt based on results

3. **Progress Visibility**: Through TodoWrite tool:
   - See planned tasks
   - Track completion status
   - Understand Claude's approach

4. **Better Code Quality**:
   - Consistent style across files
   - Proper imports and dependencies
   - Working code on first attempt

### 4. Migration Plan

#### Step 1: Create Core Infrastructure
- [ ] Implement ClaudeSession class
- [ ] Build JSON stream parser
- [ ] Create message type definitions
- [ ] Add logging and debugging utilities

#### Step 2: Prototype Implementation
- [ ] Test with simple tasks
- [ ] Validate message parsing
- [ ] Ensure tool execution tracking
- [ ] Measure performance impact

#### Step 3: Replace Existing System
- [ ] Update deployWorker.ts
- [ ] Modify error recovery system
- [ ] Adjust queue processing
- [ ] Update monitoring/logging

#### Step 4: Optimization
- [ ] Add session caching
- [ ] Implement resume capability
- [ ] Optimize token usage
- [ ] Add cost tracking

### 5. Example Usage

```typescript
// Simple task execution
const session = new ClaudeSession();
const result = await session.run(
  "Update the error handling in server.ts to use the new error recovery system",
  {
    outputFormat: 'stream-json',
    verbose: true,
    dangerouslySkipPermissions: true
  }
);

console.log(`Task completed: ${result.success}`);
console.log(`Cost: $${result.total_cost_usd}`);
console.log(`Result: ${result.result}`);
```

### 6. Monitoring and Observability

#### Metrics to Track
- Session duration
- Token usage per session
- Tool execution patterns
- Success/failure rates
- Cost per task type

#### Logging Strategy
```typescript
interface SessionLog {
  session_id: string;
  start_time: Date;
  end_time: Date;
  prompt: string;
  result: string;
  tool_executions: ToolExecution[];
  total_cost: number;
  success: boolean;
  error?: string;
}
```

## Features to Maintain from Current System

### 1. User-Friendly Progress Updates

The current system sends webhooks with human-readable messages at key stages:

#### Current Event Types & Messages:
- **plan_started**: "Analyzing your requirements..."
- **plan_generated**: "Generated plan with X tasks"
- **task_started**: "Starting: [task name]" (e.g., "Starting: Create Hero component")
- **task_completed**: "Completed: [task name] (created X files)"
- **deploy_started**: "Starting deployment process..."
- **build_progress**: Stage-specific messages during build
- **deploy_completed**: Includes preview URL
- **error messages**: Human-readable error descriptions

#### Implementation in New System:
```typescript
class ClaudeStreamProcessor {
  private async extractUserFriendlyUpdate(message: ClaudeStreamMessage): Promise<string | null> {
    if (message.type !== 'assistant' || !message.message?.content) return null;

    // Parse TodoWrite tool usage for task tracking
    const todoUpdate = message.message.content.find(c =>
      c.type === 'tool_use' && c.name === 'TodoWrite'
    );

    if (todoUpdate) {
      const todos = todoUpdate.input.todos;
      const inProgress = todos.find(t => t.status === 'in_progress');
      if (inProgress) {
        return `Working on: ${this.humanizeTaskName(inProgress.content)}`;
      }
    }

    // Parse file operations
    const fileOp = message.message.content.find(c =>
      c.type === 'tool_use' && ['Write', 'Edit', 'MultiEdit'].includes(c.name)
    );

    if (fileOp) {
      const fileName = path.basename(fileOp.input.file_path);
      return `${fileOp.name === 'Write' ? 'Creating' : 'Updating'} ${fileName}...`;
    }

    return null;
  }

  private humanizeTaskName(task: string): string {
    // Convert technical task names to user-friendly messages
    return task
      .replace(/^(Create|Implement|Add|Update|Fix)\s+/, '')
      .replace(/_/g, ' ')
      .replace(/\.(ts|tsx|js|jsx)$/, ' component');
  }
}
```

### 2. Webhook Infrastructure

Keep the existing WebhookService but adapt it to process stream messages:

```typescript
interface StreamWebhookAdapter {
  async processStreamMessage(message: ClaudeStreamMessage): Promise<void> {
    const userUpdate = await this.extractUserFriendlyUpdate(message);

    if (userUpdate) {
      await webhookService.send({
        buildId: this.buildId,
        type: this.mapToEventType(message),
        data: {
          message: userUpdate,
          timestamp: Date.now()
        }
      });
    }
  }
}
```

### 3. Event Storage & Progress API

Maintain the current event storage system:
- Store events in `project_build_events` table
- Keep `/api/builds/:buildId/events` endpoint
- Preserve progress percentage calculation
- Support incremental polling

### 4. Error Recovery Integration

The error interceptor system should continue to work:
- Capture errors from Claude's stream
- Queue recovery attempts
- Emit appropriate events
- Maintain security checks

### 5. Build Context & Metadata

Preserve all build metadata:
- buildId, userId, projectId
- Version tracking
- Cost tracking
- Timing information

## Implementation Timeline

### Minimal MVP (4 Days)
- **Day 1**: Core stream handler (claudeProcess, messageParser, claudeSession)
- **Day 2**: Integration with deployWorker + simple rate limiting
- **Day 3**: Testing and error handling
- **Day 4**: Delete old files and deploy

### Post-MVP Enhancements
- **Week 2**: Add cost tracking and session resume
- **Week 3**: Advanced error recovery
- **Week 4**: Monitoring and optimization

## Success Criteria

1. **Reliability**: >95% task completion rate
2. **Quality**: Generated code works without manual fixes
3. **Performance**: <3 minute average task completion
4. **Cost**: <$0.50 average cost per task
5. **Visibility**: Full progress tracking for all tasks

## Risk Mitigation

1. **Long Running Sessions**: Implement timeouts and chunking
2. **Cost Overruns**: Set per-session token limits
3. **Error Cascades**: Isolated session management
4. **API Changes**: Version lock Claude CLI



### 7. Future Enhancements

1. **Session Resumption**: Use session_id to resume interrupted tasks
2. **Parallel Execution**: Run multiple sessions for independent tasks
3. **Template System**: Pre-built prompts for common operations
4. **Cost Optimization**: Analyze patterns to reduce token usage
5. **Learning System**: Track successful patterns for reuse


## Conclusion

This stream-based approach will dramatically improve the reliability and quality of Claude-generated code by maintaining full context throughout task execution. The investment in refactoring will pay off through reduced debugging time and higher success rates.
