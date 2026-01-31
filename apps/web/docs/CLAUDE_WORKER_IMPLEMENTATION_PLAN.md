# Claude Code Worker Implementation Plan

## Overview
A secure, scalable worker service that runs Claude Code CLI to provide AI generation capabilities without direct API usage. The system includes proper rate limiting, fallback mechanisms, and comprehensive monitoring.

**Update (June 2025)**: Claude Worker is now fully integrated into the SheenApps AI architecture as a first-class provider, with intelligent routing, feature flags, and automatic fallback mechanisms.

## Integration Status

### Latest Integration (January 2025)

Claude Worker is now integrated as a primary AI provider in the unified AI system:

1. **Service Registry Integration** (`src/services/ai/service-registry.ts`)
   - Registered as 'claude-worker' provider in the advanced tier
   - Optimized for web page design and UI generation
   - Quality score: 0.92, Reliability: 0.88

2. **Claude Worker Adapter** (`src/services/ai/claude-worker-adapter.ts`)
   - Implements AIServiceMethods interface
   - Supports specialized prompts for web design tasks
   - Includes quota checking and error handling

3. **Service Factory Support** (`src/services/ai/service-factory.ts`)
   - Automatic detection of Claude Worker availability
   - Health check integration
   - Provider configuration

4. **Feature Flags** (`src/config/feature-flags.ts`)
   - `ENABLE_CLAUDE_WORKER`: Enable/disable Claude Worker (default: true)
   - `CLAUDE_WORKER_AS_DEFAULT`: Use as default for web design (default: true)
   - `CLAUDE_WORKER_FOR_ALL_REQUESTS`: Use for all AI requests (default: false)

5. **Tier Configuration** (`src/config/ai-tiers.json`)
   - Added to advanced tier as primary provider
   - Domain-specific routing for web_design, ui, and frontend

6. **API Route Updates**
   - `/api/ai/generate`: Supports Claude Worker with tier routing
   - `/api/ai/content`: Detects web design requests for Claude Worker
   - `/api/ai/components`: Prioritizes Claude Worker for component generation

### Original Implementation Components

The following components were created in the initial implementation:

1. Claude Runner Service (src/lib/ai/claudeRunner.ts)

- Handles Claude API calls with usage tracking for analytics
- Implements retry logic with exponential backoff
- Falls back to GPT-4 on rate limits
- Tracks errors and alerts via Sentry when >3 errors occur in 5 minutes
- Tracks usage for monitoring purposes (no Claude-specific quotas)

2. Supabase Migration (supabase/migrations/20240630_claude_usage_tracking.sql)

- Creates claude_user_usage table for usage tracking and analytics
- Implements track_claude_usage function for monitoring
- Includes RLS policies for security
- Provides monitoring views and admin statistics functions (no quota enforcement)

3. Environment Variables

- Updated .env.example with:
  - NEXT_PUBLIC_CLAUDE_WORKER_URL
  - NEXT_PUBLIC_CLAUDE_SHARED_SECRET

4. Sentry Configuration

- Enhanced server-side config to tag Claude worker errors
- Created client-side config with specific Claude error tracking
- Automatically alerts on high error rates

5. Documentation

- Detailed implementation plan (CLAUDE_WORKER_IMPLEMENTATION_PLAN.md)
- Quick deployment guide (CLAUDE_WORKER_DEPLOYMENT.md)

The system is designed to:
- Track Claude usage for analytics and monitoring
- Provide seamless fallback to GPT-4 when needed
- Give full visibility into issues via Sentry
- Scale safely with global quota management (not Claude-specific)

You can now create the sheenapps-claude-worker repository and deploy the worker service to Railway using the provided implementation plan.


## Architecture Components

### A. Worker Service (Railway) - `sheenapps-claude-worker` repo

#### 1. Fastify Server Setup
```typescript
// src/server.ts
import Fastify from 'fastify';
import { Queue } from 'p-queue';
import { createHmac } from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const app = Fastify({ logger: true });
const queue = new Queue({ concurrency: 1 });

// In-memory rate limiting
const MAX_GLOBAL_CALLS_PER_HR = 100; // Adjust based on your Claude subscription
const callCounter = new Map<string, number>();

// Reset counter every hour
setInterval(() => {
  callCounter.clear();
}, 60 * 60 * 1000);

// HMAC verification
function verifySignature(payload: string, signature: string): boolean {
  const expectedSig = createHmac('sha256', process.env.SHARED_SECRET!)
    .update(payload)
    .digest('hex');
  return signature === expectedSig;
}

// Health check endpoint
app.get('/healthz', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// Main generation endpoint
app.post('/generate', async (request, reply) => {
  const signature = request.headers['x-sheen-signature'] as string;
  const payload = JSON.stringify(request.body);

  // Verify HMAC
  if (!verifySignature(payload, signature)) {
    return reply.code(401).send({ error: 'Invalid signature' });
  }

  // Check global rate limit
  const hourKey = new Date().getHours().toString();
  const currentCalls = callCounter.get(hourKey) || 0;

  if (currentCalls >= MAX_GLOBAL_CALLS_PER_HR) {
    return reply.code(429).send({
      error: 'Global rate limit exceeded',
      resetAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
    });
  }

  // Queue the work
  try {
    const result = await queue.add(async () => {
      callCounter.set(hourKey, currentCalls + 1);

      const { prompt } = request.body as { prompt: string };

      // Execute Claude Code CLI
      const { stdout, stderr } = await execFileAsync('claude', [
        'code',
        '--json',
        '--no-interactive',
        prompt
      ], {
        timeout: 120000, // 2 minute timeout
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      });

      if (stderr) {
        console.error('Claude CLI stderr:', stderr);
      }

      // Parse JSON response
      const response = JSON.parse(stdout);
      return response;
    });

    return result;
  } catch (error) {
    console.error('Claude execution error:', error);
    return reply.code(500).send({
      error: 'Claude execution failed',
      details: error.message
    });
  }
});

// Start server
const start = async () => {
  try {
    await app.listen({ port: 3000, host: '0.0.0.0' });
    console.log('Claude worker started on port 3000');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
```

#### 2. Docker Configuration
```dockerfile
# Dockerfile
FROM node:20-slim AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:20-slim

# Install Claude Code CLI dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code (adjust based on actual installation method)
RUN curl -fsSL https://claude.ai/install.sh | sh

WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .

EXPOSE 3000
CMD ["node", "src/server.js"]
```

#### 3. Environment Variables
```env
# .env.railway
SHARED_SECRET=your-secure-hmac-secret
CLAUDE_API_KEY=your-claude-key-if-needed
NODE_ENV=production
```

### B. Supabase Quota System

#### 1. Database Schema
```sql
-- Create user usage tracking table
CREATE TABLE claude_user_usage (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    window_start TIMESTAMP WITH TIME ZONE NOT NULL,
    calls INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, window_start)
);

-- Index for fast lookups
CREATE INDEX idx_claude_usage_user_window ON claude_user_usage(user_id, window_start DESC);

-- RLS policies
ALTER TABLE claude_user_usage ENABLE ROW LEVEL SECURITY;

-- Users can only see their own usage
CREATE POLICY "Users can view own usage" ON claude_user_usage
    FOR SELECT USING (auth.uid() = user_id);
```

#### 2. Quota Check Function
```sql
-- PL/pgSQL function to check and consume quota atomically
CREATE OR REPLACE FUNCTION check_and_consume_claude_quota(
    p_user_id UUID,
    p_max_calls INTEGER DEFAULT 10
) RETURNS BOOLEAN AS $$
DECLARE
    v_window_start TIMESTAMP WITH TIME ZONE;
    v_current_calls INTEGER;
    v_can_proceed BOOLEAN;
BEGIN
    -- Calculate current hour window
    v_window_start := date_trunc('hour', NOW());

    -- Try to insert or update atomically
    INSERT INTO claude_user_usage (user_id, window_start, calls)
    VALUES (p_user_id, v_window_start, 1)
    ON CONFLICT (user_id, window_start)
    DO UPDATE SET
        calls = claude_user_usage.calls + 1,
        updated_at = NOW()
    WHERE claude_user_usage.calls < p_max_calls
    RETURNING calls <= p_max_calls INTO v_can_proceed;

    -- Return whether the operation succeeded
    RETURN COALESCE(v_can_proceed, FALSE);
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION check_and_consume_claude_quota TO authenticated;
```

### C. Next.js Integration

#### 1. Claude Runner Service
```typescript
// src/lib/ai/claudeRunner.ts
import { createClient } from '@/utils/supabase/client';
import { createHmac } from 'crypto';
import * as Sentry from '@sentry/nextjs';

interface ClaudeResponse {
  completion: string;
  usage?: {
    tokens: number;
  };
}

interface ClaudeError {
  code: string;
  message: string;
}

// Track 429 errors for Sentry alerting
const recentErrors = new Map<string, number[]>();
const ERROR_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

function trackError(errorType: string) {
  const now = Date.now();
  const errors = recentErrors.get(errorType) || [];

  // Clean old errors
  const recentErrorsList = errors.filter(time => now - time < ERROR_WINDOW_MS);
  recentErrorsList.push(now);
  recentErrors.set(errorType, recentErrorsList);

  // Alert if >3 errors in 5 minutes
  if (recentErrorsList.length > 3) {
    Sentry.captureMessage(`High ${errorType} error rate: ${recentErrorsList.length} errors in 5 minutes`, 'error');
  }
}

export async function runClaude(
  prompt: string,
  userId: string,
  options?: {
    maxRetries?: number;
    fallbackToGPT?: boolean;
  }
): Promise<string> {
  const { maxRetries = 3, fallbackToGPT = true } = options || {};
  const supabase = createClient();

  // Check user quota
  const { data: canProceed, error: quotaError } = await supabase
    .rpc('check_and_consume_claude_quota', {
      p_user_id: userId,
      p_max_calls: getQuotaForUser(userId) // Implement based on subscription tier
    });

  if (quotaError || !canProceed) {
    throw new Error('USER_QUOTA_EXCEEDED');
  }

  // Generate HMAC signature
  const signature = createHmac('sha256', process.env.NEXT_PUBLIC_CLAUDE_SHARED_SECRET!)
    .update(prompt)
    .digest('hex');

  let lastError: Error | null = null;

  // Retry logic
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(process.env.NEXT_PUBLIC_CLAUDE_WORKER_URL!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-sheen-signature': signature
        },
        body: JSON.stringify({ prompt }),
        signal: AbortSignal.timeout(120000) // 2 minute timeout
      });

      if (response.status === 429) {
        trackError('429');

        if (fallbackToGPT) {
          console.log('Claude rate limited, falling back to GPT-4');
          return await gpt4Runner(prompt); // Your existing GPT-4 implementation
        }

        throw new Error('RATE_LIMITED');
      }

      if (!response.ok) {
        trackError(`HTTP_${response.status}`);
        throw new Error(`Worker returned ${response.status}`);
      }

      const data: ClaudeResponse = await response.json();
      return data.completion;

    } catch (error) {
      lastError = error as Error;

      if (attempt < maxRetries) {
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        continue;
      }
    }
  }

  // All retries failed
  Sentry.captureException(lastError, {
    tags: {
      service: 'claude-worker',
      userId
    },
    extra: {
      prompt: prompt.slice(0, 100), // Don't log full prompts
      attempts: maxRetries
    }
  });

  throw lastError;
}

// Helper to determine quota based on subscription
function getQuotaForUser(userId: string): number {
  // TODO: Implement based on your subscription tiers
  // Example:
  // const subscription = await getSubscription(userId);
  // switch(subscription.tier) {
  //   case 'free': return 10;
  //   case 'starter': return 100;
  //   case 'pro': return 1000;
  //   default: return 10;
  // }
  return 10; // Default
}
```

#### 2. Environment Configuration
```typescript
// .env.local
NEXT_PUBLIC_CLAUDE_WORKER_URL=https://claude-worker.railway.app/generate
NEXT_PUBLIC_CLAUDE_SHARED_SECRET=your-secure-hmac-secret
```

### D. Infrastructure & Operations

#### 1. Railway Configuration
```yaml
# railway.toml
[build]
builder = "dockerfile"

[deploy]
healthcheckPath = "/healthz"
healthcheckTimeout = 30
restartPolicyType = "always"
restartPolicyMaxRetries = 10

[env]
NODE_ENV = "production"
```

#### 2. Health Check Cron (Railway)
```yaml
# Create a separate cron service in Railway
# cron.yaml
schedule: "*/5 * * * *"
command: |
  curl -f https://claude-worker.railway.app/healthz || \
  (echo "Health check failed" && exit 1)
```

#### 3. Monitoring Setup

**Grafana Dashboard Queries:**
```promql
# Request rate
rate(http_requests_total{job="claude-worker"}[5m])

# Error rate
rate(http_requests_total{job="claude-worker", status=~"5.."}[5m])

# 429 rate (rate limiting)
rate(http_requests_total{job="claude-worker", status="429"}[5m])

# Queue depth
claude_worker_queue_depth

# Response time percentiles
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))
```

**Alerts:**
```yaml
# grafana-alerts.yaml
groups:
  - name: claude-worker
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{job="claude-worker", status=~"5.."}[5m]) > 0.1
        for: 5m
        annotations:
          summary: "High error rate on Claude worker"

      - alert: WorkerDown
        expr: up{job="claude-worker"} == 0
        for: 2m
        annotations:
          summary: "Claude worker is down"

      - alert: HighQueueDepth
        expr: claude_worker_queue_depth > 50
        for: 10m
        annotations:
          summary: "Claude worker queue backing up"
```

#### 4. Sentry Configuration
```typescript
// sentry.client.config.ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  integrations: [
    new Sentry.ExtraErrorDataIntegration(),
  ],
  beforeSend(event, hint) {
    // Tag Claude worker errors
    if (event.message?.includes('claude-worker')) {
      event.tags = {
        ...event.tags,
        service: 'claude-worker'
      };
    }
    return event;
  }
});
```

### E. Testing Strategy

#### 1. Unit Tests (Worker)
```typescript
// __tests__/worker.test.ts
describe('Claude Worker', () => {
  it('should verify HMAC signatures correctly', () => {
    // Test HMAC verification
  });

  it('should enforce rate limits', () => {
    // Test rate limiting logic
  });

  it('should handle CLI failures gracefully', () => {
    // Test error handling
  });
});
```

#### 2. Integration Tests
```typescript
// __tests__/integration.test.ts
describe('Claude Integration', () => {
  it('should fall back to GPT on 429', async () => {
    // Mock 429 response
    // Verify GPT fallback is called
  });

  it('should track errors in Sentry after threshold', async () => {
    // Trigger multiple errors
    // Verify Sentry capture
  });
});
```

#### 3. E2E Test (Playwright)
```typescript
// e2e/claude-generation.spec.ts
import { test, expect } from '@playwright/test';

test('Claude generation flow', async ({ page }) => {
  // Sign up
  await page.goto('/signup');
  await page.fill('[name="email"]', 'test@example.com');
  await page.fill('[name="password"]', 'testpass123');
  await page.click('button[type="submit"]');

  // Navigate to builder
  await page.goto('/builder');

  // Submit prompt
  await page.fill('[data-testid="ai-prompt"]', 'Create a simple landing page');
  await page.click('[data-testid="generate-button"]');

  // Verify Claude response
  await expect(page.locator('[data-testid="ai-response"]')).toContainText('Claude:');
});
```

## Deployment Checklist

### Phase 1: Worker Setup
- [ ] Create `sheenapps-claude-worker` repo
- [ ] Implement Fastify server with routes
- [ ] Add HMAC verification
- [ ] Implement p-queue and rate limiting
- [ ] Create Dockerfile
- [ ] Deploy to Railway
- [ ] Configure health checks

### Phase 2: Database Setup
- [ ] Create `claude_user_usage` table
- [ ] Implement `check_and_consume_claude_quota` function
- [ ] Test quota system
- [ ] Add RLS policies

### Phase 3: Next.js Integration
- [ ] Implement `claudeRunner.ts`
- [ ] Add error tracking
- [ ] Configure Sentry alerts
- [ ] Update environment variables
- [ ] Test fallback mechanism

### Phase 4: Monitoring
- [ ] Set up Grafana dashboards
- [ ] Configure alerts
- [ ] Test Sentry integration
- [ ] Verify health check automation

### Phase 5: Testing & QA
- [ ] Run unit tests
- [ ] Run integration tests
- [ ] Execute E2E tests
- [ ] Load test the worker
- [ ] Verify quota enforcement

## Security Considerations

1. **HMAC Verification**: All requests must be signed
2. **Rate Limiting**: Both global (worker) and per-user (database)
3. **Input Validation**: Sanitize prompts before CLI execution
4. **Process Isolation**: Run CLI in sandboxed environment
5. **Secrets Management**: Use Railway/Vercel secrets, never commit

## Performance Optimizations

1. **Queue Management**: Single concurrency prevents CLI conflicts
2. **Response Streaming**: Stream large responses back to client
3. **Caching**: Consider Redis for frequent prompts
4. **Fallback**: Immediate GPT-4 fallback on rate limits
5. **Monitoring**: Track p95 response times

## Cost Considerations

1. **Railway**: ~$5-20/month for worker
2. **Supabase**: Minimal (just RPC calls)
3. **Claude Subscription**: Based on your plan
4. **Monitoring**: Grafana Cloud free tier sufficient
5. **Fallback GPT-4**: Pay per token when Claude unavailable

## Usage Guide

### Configuration

1. **Environment Variables**
   ```bash
   # Required for Claude Worker
   NEXT_PUBLIC_CLAUDE_WORKER_URL=https://your-claude-worker.com/generate
   NEXT_PUBLIC_CLAUDE_SHARED_SECRET=your-secure-hmac-secret
   
   # Feature Flags (optional)
   NEXT_PUBLIC_ENABLE_CLAUDE_WORKER=true  # Enable/disable Claude Worker
   NEXT_PUBLIC_CLAUDE_WORKER_AS_DEFAULT=true  # Use as default for web design
   NEXT_PUBLIC_CLAUDE_WORKER_FOR_ALL=false  # Use for all AI requests
   
   # Tier Routing (optional)
   AI_TIER_ROUTING_ENABLED=true  # Enable intelligent AI routing
   ```

2. **Testing Claude Worker**
   ```typescript
   // Test if Claude Worker is available
   import { AIServiceFactory } from '@/services/ai/service-factory';
   
   const isAvailable = AIServiceFactory.isProviderAvailable('claude-worker');
   console.log('Claude Worker available:', isAvailable);
   ```

3. **Direct Usage**
   ```typescript
   import { UnifiedAIService } from '@/services/ai/unified-ai-service';
   
   // For web design tasks (automatically uses Claude Worker if available)
   const result = await UnifiedAIService.generateComponent({
     componentType: 'hero-section',
     style: 'modern',
     requirements: 'Include CTA button'
   });
   
   // Force Claude Worker usage
   const result = await UnifiedAIService.processRequest({
     type: 'component_generation',
     content: JSON.stringify(componentSpec),
     domain: 'web_design'
   }, {
     tierOverride: 'advanced',  // Claude Worker is in advanced tier
     forceProvider: 'claude-worker'
   });
   ```

### Monitoring

1. **Check Usage Stats**
   ```typescript
   import { getClaudeUsageStats } from '@/lib/ai/claudeRunner';
   
   const stats = await getClaudeUsageStats(userId);
   console.log(`Calls this hour: ${stats.callsThisHour}`);
   ```

2. **Error Handling**
   ```typescript
   try {
     const result = await runClaude(prompt, userId);
   } catch (error) {
     if (error.message === 'RATE_LIMITED') {
       // Handle rate limiting (will automatically fall back to GPT-4)
     }
   }
   ```

### Troubleshooting

1. **Claude Worker not being used**
   - Check environment variables are set
   - Verify feature flags are enabled
   - Ensure the request domain is 'web_design', 'ui', or 'frontend'

2. **Usage tracking errors**
   - Verify database migration was run
   - Check Supabase RPC function exists
   - Note: Usage is tracked for analytics only, not for quota enforcement

3. **Rate limiting**
   - Claude Worker has automatic GPT-4 fallback
   - Check Sentry for high error rates
   - Review worker logs in your deployment platform

## Future Enhancements

1. **Multi-region Workers**: Deploy to multiple regions
2. **WebSocket Support**: Real-time streaming
3. **Prompt Caching**: Redis cache for common prompts
4. **Advanced Quotas**: Per-feature quotas
5. **Analytics**: Track usage patterns per user/tier
6. **Template Library**: Pre-optimized prompts for common tasks
7. **Version Control**: Track and rollback AI-generated designs
