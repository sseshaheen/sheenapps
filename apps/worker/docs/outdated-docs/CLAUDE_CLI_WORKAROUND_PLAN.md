# Claude CLI Workaround Plan

## Problem Statement
BullMQ workers cannot spawn external processes due to sandboxing, preventing direct Claude CLI execution from within workers. We need to execute Claude CLI outside the worker context while maintaining the modular architecture.

## Option 1: Execute Claude CLI in Main Process (1-2 hours)

### Overview
Move Claude CLI execution to the main server process and use Redis pub/sub for communication between workers and the main process.

### Architecture
```
Worker Process                Main Process              Claude CLI
     |                             |                         |
     |---(1) Redis Pub Request--->|                         |
     |                             |---(2) Spawn Claude---->|
     |                             |<---(3) Response--------|
     |<---(4) Redis Pub Reply-----|                         |
```

### Implementation Steps

#### Step 1: Create Claude CLI Service in Main Process (30 min)
```typescript
// src/services/claudeCLIService.ts
import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { ulid } from 'ulid';
import * as path from 'path';

export class ClaudeCLIService extends EventEmitter {
  private pendingRequests = new Map<string, {
    resolve: (value: string) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }>();

  async initialize() {
    // Subscribe to Redis channel for CLI requests
    const redis = new Redis();
    await redis.subscribe('claude:cli:requests');
    
    redis.on('message', async (channel, message) => {
      if (channel === 'claude:cli:requests') {
        const request = JSON.parse(message);
        await this.handleRequest(request);
      }
    });
    
    console.log('✅ Claude CLI service initialized in main process');
  }

  private async handleRequest(request: {
    id: string;
    prompt: string;
    cwd?: string;
    args: string[];
  }) {
    try {
      console.log(`[Main Process] Handling Claude CLI request ${request.id}`);
      
      const result = await this.executeClaudeCLI(
        request.prompt,
        request.args,
        request.cwd
      );
      
      // Publish response back
      const redis = new Redis();
      await redis.publish('claude:cli:responses', JSON.stringify({
        id: request.id,
        success: true,
        result
      }));
      
    } catch (error) {
      // Publish error back
      const redis = new Redis();
      await redis.publish('claude:cli:responses', JSON.stringify({
        id: request.id,
        success: false,
        error: error.message
      }));
    }
  }

  private async executeClaudeCLI(
    prompt: string,
    args: string[],
    cwd?: string
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const wrapperPath = path.join(process.cwd(), 'scripts', 'claude-wrapper.js');
      
      const proc = spawn('node', [wrapperPath, ...args], {
        cwd: cwd || process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe'],
        env: process.env
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('error', (err) => {
        reject(new Error(`Failed to spawn Claude: ${err.message}`));
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Claude CLI exited with code ${code}: ${stderr}`));
          return;
        }
        resolve(stdout);
      });

      // Send prompt to stdin
      proc.stdin.write(prompt);
      proc.stdin.end();
    });
  }

  // Method for workers to call
  async requestCLIExecution(
    prompt: string,
    args: string[],
    cwd?: string
  ): Promise<string> {
    const requestId = ulid();
    
    return new Promise((resolve, reject) => {
      // Setup timeout
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Claude CLI request timeout'));
      }, 60000); // 60s timeout

      // Store pending request
      this.pendingRequests.set(requestId, { resolve, reject, timeout });

      // Subscribe to responses
      const redis = new Redis();
      redis.subscribe('claude:cli:responses', (err) => {
        if (err) {
          clearTimeout(timeout);
          this.pendingRequests.delete(requestId);
          reject(err);
        }
      });

      redis.on('message', (channel, message) => {
        if (channel === 'claude:cli:responses') {
          const response = JSON.parse(message);
          if (response.id === requestId) {
            const pending = this.pendingRequests.get(requestId);
            if (pending) {
              clearTimeout(pending.timeout);
              this.pendingRequests.delete(requestId);
              redis.unsubscribe();
              redis.disconnect();
              
              if (response.success) {
                pending.resolve(response.result);
              } else {
                pending.reject(new Error(response.error));
              }
            }
          }
        }
      });

      // Publish request
      const pubRedis = new Redis();
      pubRedis.publish('claude:cli:requests', JSON.stringify({
        id: requestId,
        prompt,
        args,
        cwd
      })).then(() => {
        pubRedis.disconnect();
      });
    });
  }
}

// Singleton instance
export const claudeCLIService = new ClaudeCLIService();
```

#### Step 2: Initialize Service in Server Startup (15 min)
```typescript
// src/server.ts (add to startServer function)
import { claudeCLIService } from './services/claudeCLIService';

async function startServer() {
  try {
    // ... existing initialization ...

    // Initialize Claude CLI service in main process
    if (process.env.ARCH_MODE === 'modular') {
      await claudeCLIService.initialize();
      console.log('✅ Claude CLI service started in main process');
    }

    // ... rest of server startup ...
  } catch (err) {
    console.error('Failed to start:', err);
    process.exit(1);
  }
}
```

#### Step 3: Update Claude CLI Provider (15 min)
```typescript
// src/providers/claudeCLIProvider.ts
import { claudeCLIService } from '../services/claudeCLIService';

export class ClaudeCLIProvider implements AIProvider {
  name = 'claude-cli';

  private async runClaudeCLI(prompt: string, cwd?: string): Promise<string> {
    const args = ["-p", "--print", "--output-format", "json", "--dangerously-skip-permissions"];
    
    console.log(`[Claude CLI Provider] Requesting execution via main process`);
    
    try {
      // Use the service instead of direct spawn
      const result = await claudeCLIService.requestCLIExecution(
        prompt,
        args,
        cwd
      );
      
      console.log(`[Claude CLI Provider] Received response from main process`);
      return result;
      
    } catch (error) {
      console.error(`[Claude CLI Provider] Main process execution failed:`, error);
      throw error;
    }
  }

  // ... rest of the implementation remains the same ...
}
```

#### Step 4: Handle Edge Cases (30 min)
```typescript
// Additional features for robustness

// 1. Health check endpoint
app.get('/claude-cli/health', async (_, reply) => {
  const isHealthy = await claudeCLIService.healthCheck();
  return reply.send({
    status: isHealthy ? 'healthy' : 'unhealthy',
    mode: 'main-process',
    pendingRequests: claudeCLIService.getPendingCount()
  });
});

// 2. Graceful shutdown
process.on('SIGTERM', async () => {
  await claudeCLIService.shutdown();
  // ... rest of shutdown
});

// 3. Request queuing to prevent overload
class ClaudeCLIService {
  private concurrentExecutions = 0;
  private readonly MAX_CONCURRENT = 5;
  private queue: Array<() => void> = [];

  private async executeWithConcurrencyLimit(fn: () => Promise<any>) {
    while (this.concurrentExecutions >= this.MAX_CONCURRENT) {
      await new Promise(resolve => this.queue.push(resolve));
    }
    
    this.concurrentExecutions++;
    try {
      return await fn();
    } finally {
      this.concurrentExecutions--;
      const next = this.queue.shift();
      if (next) next();
    }
  }
}
```

### Pros & Cons

**Pros:**
- Minimal changes to existing code
- Uses familiar Redis pub/sub
- Can handle multiple worker requests
- Easy to add rate limiting and queuing
- Good for debugging (all CLI calls in one place)

**Cons:**
- Main process becomes a bottleneck
- Adds latency (Redis round-trip)
- More complex error handling
- Main process crash affects all workers
- Memory usage in main process increases

## Option 2: HTTP Service Wrapper (2-3 hours)

### Overview
Create a separate HTTP microservice that wraps Claude CLI execution, allowing workers to make HTTP calls.

### Architecture
```
Worker Process          HTTP Service           Claude CLI
     |                      |                      |
     |---(1) HTTP POST----->|                      |
     |                      |---(2) Spawn--------->|
     |                      |<---(3) Response------|
     |<---(4) HTTP Reply----|                      |
```

### Implementation Steps

#### Step 1: Create HTTP Service (45 min)
```typescript
// src/claude-service/server.ts
import Fastify from 'fastify';
import { spawn } from 'child_process';
import { z } from 'zod';
import { createHmac } from 'crypto';
import * as path from 'path';

const app = Fastify({ logger: true });

// Request validation
const ExecuteRequestSchema = z.object({
  prompt: z.string(),
  args: z.array(z.string()),
  cwd: z.string().optional(),
  timeout: z.number().optional().default(60000)
});

// Middleware for authentication
const SHARED_SECRET = process.env.CLAUDE_SERVICE_SECRET || 'change-me';

app.addHook('preHandler', async (request, reply) => {
  const signature = request.headers['x-claude-signature'];
  const timestamp = request.headers['x-claude-timestamp'];
  
  if (!signature || !timestamp) {
    return reply.code(401).send({ error: 'Missing authentication headers' });
  }
  
  // Verify timestamp is recent (prevent replay attacks)
  const now = Date.now();
  const requestTime = parseInt(timestamp as string);
  if (Math.abs(now - requestTime) > 30000) { // 30 seconds
    return reply.code(401).send({ error: 'Request timestamp too old' });
  }
  
  // Verify signature
  const payload = JSON.stringify(request.body);
  const expected = createHmac('sha256', SHARED_SECRET)
    .update(`${timestamp}:${payload}`)
    .digest('hex');
    
  if (signature !== expected) {
    return reply.code(401).send({ error: 'Invalid signature' });
  }
});

// Main execution endpoint
app.post('/execute', async (request, reply) => {
  const { prompt, args, cwd, timeout } = ExecuteRequestSchema.parse(request.body);
  
  try {
    const result = await executeClaudeCLI(prompt, args, cwd, timeout);
    return reply.send({
      success: true,
      result,
      executionTime: result.duration
    });
  } catch (error: any) {
    return reply.code(500).send({
      success: false,
      error: error.message,
      code: error.code
    });
  }
});

// Health check
app.get('/health', async (_, reply) => {
  try {
    // Test Claude CLI is accessible
    const testResult = await executeClaudeCLI(
      'Say "healthy" in one word',
      ['--print', '--output-format', 'json'],
      undefined,
      5000
    );
    
    return reply.send({
      status: 'healthy',
      claudeAvailable: true,
      testResponse: testResult.output.includes('healthy')
    });
  } catch (error) {
    return reply.code(503).send({
      status: 'unhealthy',
      claudeAvailable: false,
      error: error.message
    });
  }
});

// Metrics endpoint
const metrics = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  averageExecutionTime: 0,
  activeRequests: 0
};

app.get('/metrics', async (_, reply) => {
  return reply.send(metrics);
});

// Claude CLI execution with proper error handling
async function executeClaudeCLI(
  prompt: string,
  args: string[],
  cwd?: string,
  timeout = 60000
): Promise<{ output: string; duration: number }> {
  const startTime = Date.now();
  metrics.totalRequests++;
  metrics.activeRequests++;
  
  return new Promise((resolve, reject) => {
    const wrapperPath = path.join(process.cwd(), 'scripts', 'claude-wrapper.js');
    
    const proc = spawn('node', [wrapperPath, ...args], {
      cwd: cwd || process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env
    });

    let stdout = '';
    let stderr = '';
    let killed = false;

    // Timeout handling
    const timer = setTimeout(() => {
      killed = true;
      proc.kill('SIGTERM');
      setTimeout(() => proc.kill('SIGKILL'), 5000); // Force kill after 5s
    }, timeout);

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      metrics.failedRequests++;
      metrics.activeRequests--;
      reject(new Error(`Failed to spawn Claude: ${err.message}`));
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      metrics.activeRequests--;
      
      const duration = Date.now() - startTime;
      metrics.averageExecutionTime = 
        (metrics.averageExecutionTime * (metrics.totalRequests - 1) + duration) / 
        metrics.totalRequests;
      
      if (killed) {
        metrics.failedRequests++;
        reject(new Error(`Claude CLI timeout after ${timeout}ms`));
        return;
      }
      
      if (code !== 0) {
        metrics.failedRequests++;
        reject(new Error(`Claude CLI exited with code ${code}: ${stderr}`));
        return;
      }
      
      metrics.successfulRequests++;
      resolve({ output: stdout, duration });
    });

    // Send prompt to stdin
    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}

// Rate limiting
import rateLimit from '@fastify/rate-limit';

await app.register(rateLimit, {
  max: 100, // 100 requests
  timeWindow: '1 minute',
  allowList: ['127.0.0.1'] // Allow localhost unlimited
});

// Start server
const PORT = parseInt(process.env.CLAUDE_SERVICE_PORT || '3001');
const HOST = process.env.CLAUDE_SERVICE_HOST || '0.0.0.0';

async function start() {
  try {
    await app.listen({ port: PORT, host: HOST });
    console.log(`Claude CLI service listening on ${HOST}:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
```

#### Step 2: Create Service Client (30 min)
```typescript
// src/services/claudeHTTPClient.ts
import { createHmac } from 'crypto';

export class ClaudeHTTPClient {
  private baseURL: string;
  private secret: string;
  private timeout: number;

  constructor() {
    this.baseURL = process.env.CLAUDE_SERVICE_URL || 'http://localhost:3001';
    this.secret = process.env.CLAUDE_SERVICE_SECRET || 'change-me';
    this.timeout = parseInt(process.env.CLAUDE_SERVICE_TIMEOUT || '60000');
  }

  async execute(
    prompt: string,
    args: string[],
    cwd?: string
  ): Promise<string> {
    const timestamp = Date.now();
    const body = JSON.stringify({ prompt, args, cwd, timeout: this.timeout });
    
    // Generate signature
    const signature = createHmac('sha256', this.secret)
      .update(`${timestamp}:${body}`)
      .digest('hex');
    
    const response = await fetch(`${this.baseURL}/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Claude-Signature': signature,
        'X-Claude-Timestamp': timestamp.toString()
      },
      body,
      signal: AbortSignal.timeout(this.timeout + 5000) // Extra 5s for network
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Claude service error: ${error.error || response.statusText}`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(`Claude execution failed: ${result.error}`);
    }

    return result.result;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseURL}/health`, {
        signal: AbortSignal.timeout(5000)
      });
      const data = await response.json();
      return data.status === 'healthy' && data.claudeAvailable;
    } catch {
      return false;
    }
  }

  async getMetrics(): Promise<any> {
    const response = await fetch(`${this.baseURL}/metrics`);
    return response.json();
  }
}

// Singleton instance
export const claudeHTTPClient = new ClaudeHTTPClient();
```

#### Step 3: Update Provider to Use HTTP Client (15 min)
```typescript
// src/providers/claudeCLIProvider.ts
import { claudeHTTPClient } from '../services/claudeHTTPClient';

export class ClaudeCLIProvider implements AIProvider {
  name = 'claude-cli';
  
  async initialize() {
    // Health check on startup
    const isHealthy = await claudeHTTPClient.healthCheck();
    if (!isHealthy) {
      throw new Error('Claude HTTP service is not healthy');
    }
    console.log('✅ Claude HTTP service connection verified');
  }

  private async runClaudeCLI(prompt: string, cwd?: string): Promise<string> {
    const args = ["-p", "--print", "--output-format", "json", "--dangerously-skip-permissions"];
    
    console.log(`[Claude CLI Provider] Calling HTTP service`);
    
    try {
      const result = await claudeHTTPClient.execute(prompt, args, cwd);
      console.log(`[Claude CLI Provider] Received response from HTTP service`);
      return result;
    } catch (error) {
      console.error(`[Claude CLI Provider] HTTP service error:`, error);
      throw error;
    }
  }

  // ... rest remains the same ...
}
```

#### Step 4: Deployment Configuration (30 min)
```yaml
# docker-compose.yml for local development
version: '3.8'

services:
  claude-service:
    build:
      context: .
      dockerfile: claude-service/Dockerfile
    ports:
      - "3001:3001"
    environment:
      - CLAUDE_SERVICE_SECRET=${CLAUDE_SERVICE_SECRET}
      - NODE_ENV=production
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    deploy:
      resources:
        limits:
          memory: 512M
        reservations:
          memory: 256M

  main-app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - CLAUDE_SERVICE_URL=http://claude-service:3001
      - CLAUDE_SERVICE_SECRET=${CLAUDE_SERVICE_SECRET}
      - ARCH_MODE=modular
    depends_on:
      claude-service:
        condition: service_healthy
```

```dockerfile
# claude-service/Dockerfile
FROM node:20-alpine

WORKDIR /app

# Install Claude CLI globally
RUN npm install -g @anthropic-ai/claude-code

# Copy service files
COPY claude-service/package*.json ./
RUN npm ci --only=production

COPY claude-service/ .
COPY scripts/claude-wrapper.js ./scripts/

EXPOSE 3001

CMD ["node", "server.js"]
```

#### Step 5: Monitoring & Resilience (30 min)
```typescript
// src/services/claudeHTTPClient.ts - Enhanced with circuit breaker

import CircuitBreaker from 'opossum';

export class ClaudeHTTPClient {
  private breaker: CircuitBreaker;

  constructor() {
    // ... existing setup ...

    // Circuit breaker configuration
    this.breaker = new CircuitBreaker(
      this.executeInternal.bind(this),
      {
        timeout: this.timeout,
        errorThresholdPercentage: 50,
        resetTimeout: 30000, // 30 seconds
        volumeThreshold: 10, // Min requests before opening
      }
    );

    // Circuit breaker events
    this.breaker.on('open', () => {
      console.error('Claude HTTP circuit breaker opened - service unavailable');
    });

    this.breaker.on('halfOpen', () => {
      console.log('Claude HTTP circuit breaker half-open - testing service');
    });

    this.breaker.on('close', () => {
      console.log('Claude HTTP circuit breaker closed - service recovered');
    });
  }

  async execute(prompt: string, args: string[], cwd?: string): Promise<string> {
    try {
      return await this.breaker.fire(prompt, args, cwd);
    } catch (error) {
      if (error.code === 'EOPENBREAKER') {
        throw new Error('Claude service is temporarily unavailable');
      }
      throw error;
    }
  }

  private async executeInternal(
    prompt: string,
    args: string[],
    cwd?: string
  ): Promise<string> {
    // ... existing HTTP call implementation ...
  }

  // Fallback mechanism
  async executeWithFallback(
    prompt: string,
    args: string[],
    cwd?: string
  ): Promise<string> {
    try {
      return await this.execute(prompt, args, cwd);
    } catch (error) {
      console.error('Claude HTTP service failed, attempting fallback...');
      
      // Could fallback to:
      // 1. Mock provider for non-critical operations
      // 2. Queue for later retry
      // 3. Alternative AI provider
      
      throw new Error(`Claude service unavailable: ${error.message}`);
    }
  }
}
```

### Pros & Cons

**Pros:**
- Complete isolation from main app
- Can scale independently
- Easy to deploy on different infrastructure
- Can be shared across multiple services
- Better for production (microservice pattern)
- Built-in health checks and monitoring
- Can add caching layer easily

**Cons:**
- More complex deployment
- Additional service to maintain
- Network latency
- Requires service discovery in production
- Additional authentication complexity
- More points of failure

## Comparison Matrix

| Aspect | Main Process | HTTP Service |
|--------|--------------|--------------|
| **Implementation Time** | 1-2 hours | 2-3 hours |
| **Complexity** | Medium | High |
| **Latency** | ~10-20ms (Redis) | ~5-10ms (local) or 20-50ms (network) |
| **Scalability** | Limited by main process | Highly scalable |
| **Reliability** | Single point of failure | Can add redundancy |
| **Deployment** | No change | Additional service |
| **Monitoring** | Basic | Full metrics/health |
| **Development** | Easier | More complex |
| **Production Ready** | Yes, with limits | Yes, enterprise-grade |

## Recommendation

### For Quick Implementation (Choose Main Process)
- You need a solution today
- You're still in development/testing phase
- You don't expect high concurrent load
- You want minimal infrastructure changes

### For Production (Choose HTTP Service)
- You need high reliability
- You expect to scale
- You want proper monitoring and metrics
- You're okay with additional deployment complexity
- You might share Claude CLI across services

## Migration Path

You can start with Main Process and migrate to HTTP Service later:

1. Implement Main Process solution first
2. Abstract the client interface:
   ```typescript
   interface IClaudeExecutor {
     execute(prompt: string, args: string[], cwd?: string): Promise<string>;
   }
   ```
3. When ready, swap implementation from Redis pub/sub to HTTP client
4. No changes needed in the provider code

## Testing Strategy

### For Main Process:
```bash
# Test Redis pub/sub
redis-cli PUBLISH claude:cli:requests '{"id":"test","prompt":"Hello","args":["--print"]}'
redis-cli SUBSCRIBE claude:cli:responses
```

### For HTTP Service:
```bash
# Test health
curl http://localhost:3001/health

# Test execution
curl -X POST http://localhost:3001/execute \
  -H "Content-Type: application/json" \
  -H "X-Claude-Signature: <calculated>" \
  -H "X-Claude-Timestamp: <timestamp>" \
  -d '{"prompt":"Hello","args":["--print"]}'
```

## Next Steps

1. **Choose an approach** based on your timeline and requirements
2. **Implement the chosen solution** following the detailed steps
3. **Test thoroughly** with the modular system
4. **Monitor performance** and adjust as needed
5. **Document the setup** for team members