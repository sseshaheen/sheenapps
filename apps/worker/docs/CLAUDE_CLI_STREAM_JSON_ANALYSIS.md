# Claude CLI Stream JSON Analysis

## Key Discovery: `--output-format stream-json`

This format provides much richer information than the basic `--json` flag and could solve several of our parsing issues.

## Output Structure

### 1. Initial System Message
```json
{
  "type": "system",
  "subtype": "init",
  "cwd": "/Users/sh/Sites",
  "session_id": "bbe5ed3c-0a8e-4650-961b-2a6df462ff8d",
  "tools": ["Task", "Bash", "Glob", "Grep", "LS", "Read", "Edit", "Write", ...],
  "model": "claude-opus-4-20250514",
  "permissionMode": "default"
}
```

### 2. Assistant Messages with Tool Use
```json
{
  "type": "assistant",
  "message": {
    "id": "msg_01NwS4QfSiTsJ9pqeswaMdLN",
    "type": "message",
    "role": "assistant",
    "model": "claude-opus-4-20250514",
    "content": [{
      "type": "tool_use",
      "id": "toolu_01JxWgMu51WuypbUwR7XV9dn",
      "name": "Write",
      "input": {
        "file_path": "/Users/sh/Sites/hello.html",
        "content": "<!DOCTYPE html>..."
      }
    }],
    "usage": {
      "input_tokens": 3,
      "cache_creation_input_tokens": 3323,
      "cache_read_input_tokens": 10491,
      "output_tokens": 200,
      "service_tier": "standard"
    }
  },
  "session_id": "bbe5ed3c-0a8e-4650-961b-2a6df462ff8d"
}
```

### 3. Final Result Message (Most Important!)
```json
{
  "type": "result",
  "subtype": "success",
  "is_error": false,
  "duration_ms": 31477,
  "duration_api_ms": 33586,
  "num_turns": 12,
  "result": "It looks like I need permission to edit the file... ABRACADABRA",
  "session_id": "bbe5ed3c-0a8e-4650-961b-2a6df462ff8d",
  "total_cost_usd": 0.2356349,
  "usage": {
    "input_tokens": 30,
    "cache_creation_input_tokens": 4436,
    "cache_read_input_tokens": 67899,
    "output_tokens": 665,
    "service_tier": "standard"
  }
}
```

## Benefits for Our Implementation

### 1. Clean Result Extraction
The final message has `type: "result"` with:
- `subtype: "success"` or `"error"` - Explicit success/failure
- `is_error: false` - Boolean flag
- `result: "..."` - The actual output we need
- `total_cost_usd: 0.2356349` - Actual cost (not estimated!)

### 2. Accurate Token Usage
Real token counts instead of our character-based estimates:
```json
"usage": {
  "input_tokens": 30,
  "cache_creation_input_tokens": 4436,
  "cache_read_input_tokens": 67899,
  "output_tokens": 665
}
```

### 3. Better Error Handling
If there's an error, we'll get:
```json
{
  "type": "result",
  "subtype": "error",
  "is_error": true,
  "error": "Error message here"
}
```

## Improved Implementation

```typescript
private async runClaudeCLI(prompt: string, cwd?: string): Promise<string> {
  const args = [
    "-p", prompt,
    "--output-format", "stream-json",  // Use stream-json instead of --json
    "--dangerously-skip-permissions"
  ];
  
  // Add verbose in debug mode
  if (process.env.DEBUG) {
    args.push("--verbose");
  }
  
  return new Promise((resolve, reject) => {
    const proc = spawn('claude', args, {
      cwd: cwd || process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env
    });
    
    let streamBuffer = '';
    let lastResult: any = null;
    
    proc.stdout.on('data', (data) => {
      streamBuffer += data.toString();
      
      // Process each line as it might be a complete JSON object
      const lines = streamBuffer.split('\n');
      streamBuffer = lines.pop() || ''; // Keep incomplete line in buffer
      
      for (const line of lines) {
        if (line.trim()) {
          try {
            const json = JSON.parse(line);
            
            // Capture the final result
            if (json.type === 'result') {
              lastResult = json;
            }
          } catch (e) {
            // Not valid JSON, ignore
          }
        }
      }
    });
    
    proc.on('close', (code) => {
      // Process any remaining data
      if (streamBuffer.trim()) {
        try {
          const json = JSON.parse(streamBuffer);
          if (json.type === 'result') {
            lastResult = json;
          }
        } catch (e) {
          // Ignore
        }
      }
      
      if (lastResult) {
        if (lastResult.is_error) {
          reject(new Error(lastResult.error || 'Unknown error'));
        } else {
          // Update our token tracking with real data
          this.lastUsage = {
            promptTokens: lastResult.usage.input_tokens,
            completionTokens: lastResult.usage.output_tokens,
            totalCost: lastResult.total_cost_usd
          };
          
          resolve(lastResult.result);
        }
      } else if (code !== 0) {
        reject(new Error(`Claude CLI exited with code ${code}`));
      } else {
        reject(new Error('No result found in Claude output'));
      }
    });
    
    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn Claude: ${err.message}`));
    });
    
    // No need to send prompt to stdin with -p flag
    proc.stdin.end();
  });
}
```

## Updated Provider Methods

```typescript
export class ClaudeCLIProvider implements AIProvider {
  private lastUsage?: TokenUsage;
  
  async plan(prompt: string, context: PlanContext): Promise<{
    tasks: any[];
    usage: TokenUsage;
  }> {
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildPlanPrompt(prompt, context);
    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
    
    const response = await this.runClaudeCLI(fullPrompt, context.projectPath);
    const tasks = this.parsePlanResponse(response);
    
    // Use real token usage from Claude CLI
    const usage = this.lastUsage || this.estimateUsage(fullPrompt, response);
    
    return { tasks, usage };
  }
  
  // Similar updates for transform method...
}
```

## Key Advantages

1. **Explicit Success/Failure**: No more guessing from output
2. **Real Token Costs**: Accurate billing information
3. **Structured Data**: Each message has a clear type and purpose
4. **Better Debugging**: Can log intermediate steps if needed
5. **Session Tracking**: `session_id` for correlation

## Migration Steps

1. Change `--json` to `--output-format stream-json`
2. Update parser to handle streaming JSON lines
3. Extract final result from `type: "result"` message
4. Use real token usage instead of estimates
5. Handle explicit error cases

## Testing

```bash
# Test success case
claude -p "Say hello and return OK" --output-format stream-json | jq -s '.[-1]'

# Test error case  
claude -p "Deliberately fail" --output-format stream-json | jq -s '.[-1]'

# Extract just the result
claude -p "Generate a task list" --output-format stream-json | jq -s '.[-1].result'
```

This format is much more robust and provides all the information we need for reliable integration!

## Implementation Feedback & Improvements

Based on architectural review, here are critical improvements for production readiness:

### 1. ✅ Simplify Redis & Diagnostics

**Adopted**: Consolidate Redis clients and add health checks.

```typescript
class ClaudeCLIMainProcessService {
  private redis: Redis; // Single client with pub/sub mode
  
  async initialize() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      // Enable pub/sub mode
      enableOfflineQueue: false,
      maxRetriesPerRequest: 3
    });
    
    // Health check
    await this.healthCheck();
  }
  
  async healthCheck(): Promise<boolean> {
    try {
      // Test Redis connection
      await this.redis.ping();
      
      // Test Claude wrapper exists
      const wrapperPath = path.join(process.cwd(), 'scripts', 'claude-wrapper.js');
      await fs.access(wrapperPath);
      
      // Test Claude CLI is accessible
      const testResult = await this.executeClaudeCLI('echo "healthy"', ['--print'], '.');
      return testResult.includes('healthy');
    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  }
}
```

### 2. ✅ Configurable Timeouts & Back-pressure

**Adopted**: Environment-based timeouts and concurrency limits.

```typescript
class ClaudeCLIMainProcessService {
  private readonly timeout = parseInt(process.env.CLAUDE_TIMEOUT || '60000');
  private readonly maxConcurrent = parseInt(process.env.CLAUDE_MAX_CONCURRENT || '5');
  private activeRequests = 0;
  private queue: Array<() => void> = [];
  
  // Circuit breaker
  private consecutiveFailures = 0;
  private readonly maxFailures = 3;
  private circuitOpen = false;
  
  private async executeWithBackpressure(fn: () => Promise<any>) {
    if (this.circuitOpen) {
      throw new Error('Claude CLI circuit breaker is open');
    }
    
    // Wait if at capacity
    while (this.activeRequests >= this.maxConcurrent) {
      await new Promise(resolve => this.queue.push(resolve));
    }
    
    this.activeRequests++;
    try {
      const result = await fn();
      this.consecutiveFailures = 0; // Reset on success
      return result;
    } catch (error) {
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= this.maxFailures) {
        this.circuitOpen = true;
        setTimeout(() => {
          this.circuitOpen = false;
          this.consecutiveFailures = 0;
        }, 30000); // Reset after 30s
      }
      throw error;
    } finally {
      this.activeRequests--;
      const next = this.queue.shift();
      if (next) next();
    }
  }
}
```

### 3. ✅ Targeted Message Routing

**Adopted**: Use request-specific channels for efficient routing.

```typescript
private async handleRequest(request: any) {
  const responseChannel = `claude:cli:response:${request.id}`;
  
  try {
    const result = await this.executeWithBackpressure(() =>
      this.executeClaudeCLI(request.prompt, request.args, request.cwd)
    );
    
    // Publish to request-specific channel
    await this.redis.publish(responseChannel, JSON.stringify({
      success: true,
      result
    }));
  } catch (error: any) {
    await this.redis.publish(responseChannel, JSON.stringify({
      success: false,
      error: error.message
    }));
  }
}

// In the worker/provider:
async request(prompt: string, args: string[], cwd?: string): Promise<string> {
  const requestId = ulid();
  const responseChannel = `claude:cli:response:${requestId}`;
  
  return new Promise((resolve, reject) => {
    const redis = new Redis();
    
    // Subscribe to specific response channel
    redis.subscribe(responseChannel, async (err) => {
      if (err) {
        reject(err);
        return;
      }
      
      // Set timeout
      const timeout = setTimeout(() => {
        redis.unsubscribe(responseChannel);
        redis.disconnect();
        reject(new Error('Claude CLI request timeout'));
      }, this.timeout);
      
      redis.on('message', (channel, message) => {
        if (channel === responseChannel) {
          clearTimeout(timeout);
          redis.unsubscribe(responseChannel);
          redis.disconnect();
          
          const response = JSON.parse(message);
          if (response.success) {
            resolve(response.result);
          } else {
            reject(new Error(response.error));
          }
        }
      });
      
      // Publish request
      await this.redis.publish('claude:cli:requests', JSON.stringify({
        id: requestId,
        prompt,
        args,
        cwd
      }));
    });
  });
}
```

### 4. ✅ Enhanced Error Reporting & Metrics

**Adopted**: Comprehensive error tracking and metrics.

```typescript
import { StatsD } from 'node-statsd';

class ClaudeCLIMainProcessService {
  private statsd = new StatsD({
    prefix: 'claude.main.',
    errorHandler: (error) => console.error('StatsD error:', error)
  });
  
  private async handleRequest(request: any) {
    const startTime = Date.now();
    const responseChannel = `claude:cli:response:${request.id}`;
    
    try {
      this.statsd.increment('request.received');
      
      const result = await this.executeWithBackpressure(() =>
        this.executeClaudeCLI(request.prompt, request.args, request.cwd)
      );
      
      this.statsd.timing('request.duration', Date.now() - startTime);
      this.statsd.increment('request.success');
      
      await this.redis.publish(responseChannel, JSON.stringify({
        success: true,
        result
      }));
    } catch (error: any) {
      this.statsd.increment('request.error');
      this.statsd.increment(`error.${error.code || 'unknown'}`);
      
      // Enhanced error logging with correlation
      console.error('Claude CLI execution failed', {
        requestId: request.id,
        error: error.message,
        stack: error.stack,
        duration: Date.now() - startTime,
        args: request.args
      });
      
      await this.redis.publish(responseChannel, JSON.stringify({
        success: false,
        error: error.message,
        requestId: request.id
      }));
    }
  }
}
```

### 5. ✅ Clean Abstraction with Interface

**Adopted**: Define interface for easy swapping between implementations.

```typescript
// src/providers/claudeExecutor.ts
export interface IClaudeExecutor {
  execute(prompt: string, args: string[], cwd?: string): Promise<string>;
  healthCheck(): Promise<boolean>;
  getMetrics?(): Promise<any>;
}

// src/providers/executors/redisExecutor.ts
export class RedisClaudeExecutor implements IClaudeExecutor {
  async execute(prompt: string, args: string[], cwd?: string): Promise<string> {
    return claudeCLIMainProcess.request(prompt, args, cwd);
  }
  
  async healthCheck(): Promise<boolean> {
    return claudeCLIMainProcess.healthCheck();
  }
}

// src/providers/executors/httpExecutor.ts
export class HTTPClaudeExecutor implements IClaudeExecutor {
  async execute(prompt: string, args: string[], cwd?: string): Promise<string> {
    return claudeHTTPClient.execute(prompt, args, cwd);
  }
  
  async healthCheck(): Promise<boolean> {
    return claudeHTTPClient.healthCheck();
  }
  
  async getMetrics(): Promise<any> {
    return claudeHTTPClient.getMetrics();
  }
}

// src/providers/executors/factory.ts
export class ClaudeExecutorFactory {
  static create(): IClaudeExecutor {
    const mode = process.env.CLAUDE_EXECUTOR_MODE || 'redis';
    
    switch (mode) {
      case 'redis':
        return new RedisClaudeExecutor();
      case 'http':
        return new HTTPClaudeExecutor();
      case 'direct':
        return new DirectClaudeExecutor(); // For testing
      default:
        throw new Error(`Unknown executor mode: ${mode}`);
    }
  }
}

// Updated provider
export class ClaudeCLIProvider implements AIProvider {
  private executor: IClaudeExecutor;
  
  constructor() {
    this.executor = ClaudeExecutorFactory.create();
  }
  
  async initialize() {
    const isHealthy = await this.executor.healthCheck();
    if (!isHealthy) {
      throw new Error('Claude executor health check failed');
    }
  }
  
  private async runClaudeCLI(prompt: string, cwd?: string): Promise<string> {
    const args = ["-p", prompt, "--output-format", "stream-json", "--dangerously-skip-permissions"];
    return this.executor.execute(prompt, args, cwd);
  }
}
```

## Considerations Not Adopted

### ❌ Complex Pub/Sub Patterns
While the feedback suggests sophisticated pub/sub patterns, for our use case the simpler approach with request-specific channels provides sufficient isolation without over-engineering.

### ❌ Prometheus Metrics
StatsD is simpler to integrate and sufficient for our monitoring needs. Prometheus can be added later if needed.

## Implementation Priority

1. **High**: Stream JSON parsing (immediate benefit)
2. **High**: IClaudeExecutor interface (enables clean switching)
3. **Medium**: Request-specific channels (better performance)
4. **Medium**: Circuit breaker & backpressure (reliability)
5. **Low**: Comprehensive metrics (can add incrementally)

## Migration Path

```typescript
// Start with:
CLAUDE_EXECUTOR_MODE=redis npm start

// Switch to HTTP when ready:
CLAUDE_EXECUTOR_MODE=http npm start

// No code changes needed!
```

## Implementation Progress

### Phase 1: Main Process Solution with Redis ✅ COMPLETED

#### Step 1: Create IClaudeExecutor Interface ✅ COMPLETED
- Created `/src/providers/IClaudeExecutor.ts` - Interface abstraction for execution strategies
- Created `/src/services/claudeCLIMainProcess.ts` - Main process service with Redis pub/sub
- Created `/src/providers/executors/redisExecutor.ts` - Redis executor implementation
- Created `/src/providers/executors/claudeExecutorFactory.ts` - Factory for executor selection

#### Step 2: Update Claude CLI Provider ✅ COMPLETED
- Updated `/src/providers/claudeCLIProvider.ts` to use IClaudeExecutor interface
- Switched from `--json` to `--output-format stream-json --verbose`
- Provider now uses real token usage from Claude CLI output
- Removed direct spawn/exec code in favor of executor abstraction

#### Step 3: Initialize Main Process Service ✅ COMPLETED
- Added initialization in server.ts for modular mode
- Added proper shutdown handling
- Service starts before workers to handle requests

#### Key Implementation Notes:
1. **MUST use `--verbose` with `--output-format stream-json`** (discovered in testing)
2. **Parse line-by-line** - each line is a complete JSON object
3. **Success/failure** explicit in `is_error` field
4. **Real costs provided** - no estimation needed!

### Phase 2: Testing & Verification ⏳ NEXT

#### Step 1: Test Main Process Redis Implementation
- Run modular system with ARCH_MODE=modular
- Test Claude CLI execution through Redis pub/sub
- Verify stream JSON parsing works correctly
- Check that token usage is properly captured

#### Step 2: Verify All Task Types
- Test plan generation
- Test code generation
- Test refactoring
- Test all transform types