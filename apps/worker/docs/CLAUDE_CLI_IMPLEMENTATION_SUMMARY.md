# Claude CLI Implementation Summary

## Overview

Successfully implemented a Main Process solution with Redis pub/sub to work around BullMQ's spawn limitations, enabling Claude CLI execution in the modular architecture.

## Problem

BullMQ workers run in a sandboxed environment that prevents ALL process spawning, including:
- `spawn()` - ENOENT errors
- `exec()` - ENOENT errors
- `execSync()` - Works for simple commands but not Claude CLI
- `execFile()` - ENOENT errors
- `execFileSync()` - Works but not for Claude CLI

## Solution Architecture

```
┌─────────────────┐     Redis Pub/Sub      ┌─────────────────────┐
│  BullMQ Worker  │ ─────────────────────> │   Main Process      │
│                 │                        │                     │
│  Uses Redis     │ <───────────────────── │  - Spawns Claude    │
│  Executor       │      Response          │  - Parses JSON      │
└─────────────────┘                        │  - Returns results  │
                                           └─────────────────────┘
```

## Implementation Details

### 1. Interface Abstraction (`IClaudeExecutor`)
- Allows swapping between Redis, HTTP, or direct execution
- Clean separation of concerns
- Environment-based selection via `CLAUDE_EXECUTOR_MODE`
- Fallback options:
  - Set `MOCK_CLAUDE=true` to use mock provider for testing
  - Set `CLAUDE_EXECUTOR_MODE=direct` for direct execution (when available)
  - Circuit breaker provides fail-fast behavior during outages

### 2. Main Process Service (`claudeCLIMainProcess`)
- Runs in main Node.js process (not sandboxed)
- Subscribes to Redis requests channel
- Executes Claude CLI with proper spawn
- Publishes results to request-specific channels
- Includes:
  - Health checks
  - Circuit breaker pattern (trips after 3 consecutive failures, resets after 30s)
  - Back-pressure management
  - Metrics collection
  - Fallback: After circuit breaker trips, requests fail fast until reset

### 3. Stream JSON Parsing
- Uses `--output-format stream-json --verbose`
- Parses line-by-line JSON output
- Extracts real token usage and costs
- Properly handles success/error states

### 4. Redis Communication
- Request-specific channels for targeted routing
- Separate pub/sub connections to avoid Redis mode conflicts
- Timeout handling for reliability
- Automatic cleanup of subscriptions

## Key Files

1. `/src/providers/IClaudeExecutor.ts` - Interface definition
2. `/src/services/claudeCLIMainProcess.ts` - Main process service
3. `/src/providers/executors/redisExecutor.ts` - Redis executor
4. `/src/providers/executors/claudeExecutorFactory.ts` - Factory pattern
5. `/src/providers/claudeCLIProvider.ts` - Updated provider using executor

## Configuration

```bash
# Enable modular architecture
ARCH_MODE=modular

# Claude executor mode (default: redis)
CLAUDE_EXECUTOR_MODE=redis

# Optional settings
CLAUDE_MAX_CONCURRENT=5
CLAUDE_TIMEOUT=60000
CLAUDE_MAX_FAILURES=3
```

### Health Check Endpoint

```bash
GET /claude-executor/health

# Returns:
{
  "status": "healthy",
  "redis": "connected",
  "claudeCLI": "accessible",
  "circuitBreaker": "closed",
  "activeRequests": 0,
  "metrics": {
    "totalRequests": 150,
    "successRate": 0.98
  }
}
```

## Testing

Run the test script to verify:
```bash
npx ts-node scripts/test-redis-executor.ts
```

## Results

✅ Claude CLI executes successfully in modular workers
✅ Real token usage tracked (not estimated)
✅ Proper error handling and circuit breaking
✅ Clean abstraction for future HTTP service option
✅ Successfully tested with simple prompts

## Next Steps

1. Team testing with real-world use cases
2. Monitor performance and costs
3. Consider HTTP service wrapper for multi-instance deployments
4. Add more comprehensive metrics and monitoring

## Appendix: Metrics

### Key Metrics Emitted

#### Request Metrics
- `claude.main.request.received` - Counter for incoming requests
- `claude.main.request.success` - Counter for successful executions
- `claude.main.request.error` - Counter for failed executions
- `claude.main.request.duration` - Histogram of request duration (ms)

#### Circuit Breaker Metrics
- `claude.main.circuit.open` - Gauge indicating circuit state (0=closed, 1=open)
- `claude.main.circuit.failures` - Counter for consecutive failures
- `claude.main.error.{errorCode}` - Counter by error type (spawn_error, timeout, etc.)

#### Resource Metrics
- `claude.main.active.requests` - Gauge of concurrent requests
- `claude.main.queue.depth` - Gauge of requests waiting for capacity
- `claude.main.backpressure.rejected` - Counter for rate-limited requests

#### Performance Metrics
- `claude.main.latency.p50` - 50th percentile latency
- `claude.main.latency.p95` - 95th percentile latency
- `claude.main.latency.p99` - 99th percentile latency

#### Cost Metrics
- `claude.main.tokens.input` - Counter for input tokens used
- `claude.main.tokens.output` - Counter for output tokens used
- `claude.main.cost.usd` - Counter for cumulative cost in USD

### Monitoring Integration

```javascript
// Example StatsD integration
statsd.increment('claude.main.request.received');
statsd.timing('claude.main.request.duration', duration);
statsd.gauge('claude.main.active.requests', activeRequests);
```

### Alert Thresholds

Recommended alerts:
- Circuit breaker open for > 5 minutes
- Error rate > 10% over 5 minutes
- P95 latency > 30 seconds
- Queue depth > 50 requests
- Cost spike > 200% of baseline
