# Webhook Reliability System

## Overview
The webhook reliability system ensures zero data loss from payment gateway webhooks through a dead letter queue, automatic retry mechanisms, and comprehensive monitoring.

## Database Schema

### Dead Letter Queue
```sql
CREATE TABLE webhook_dead_letter (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway VARCHAR(50) NOT NULL,
  event_id VARCHAR(255), -- Gateway-specific event ID
  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  headers JSONB,
  error_message TEXT,
  error_code VARCHAR(50),
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  retry_history JSONB[] DEFAULT '{}', -- Array of retry attempts
  next_retry_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  last_retry_at TIMESTAMP,
  resolved_at TIMESTAMP,
  resolution_type VARCHAR(50) -- 'success', 'manual', 'expired'
);

-- Indexes for performance
CREATE INDEX idx_webhook_dead_letter_retry ON webhook_dead_letter(next_retry_at) 
  WHERE retry_count < max_retries AND resolved_at IS NULL;
CREATE INDEX idx_webhook_dead_letter_gateway ON webhook_dead_letter(gateway, created_at DESC);
CREATE INDEX idx_webhook_dead_letter_unresolved ON webhook_dead_letter(resolved_at) 
  WHERE resolved_at IS NULL;

-- Webhook event log
CREATE TABLE webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway VARCHAR(50) NOT NULL,
  event_id VARCHAR(255),
  event_type VARCHAR(100) NOT NULL,
  status VARCHAR(50) NOT NULL, -- 'success', 'failed', 'retrying'
  processing_time_ms INTEGER,
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_webhook_events_gateway ON webhook_events(gateway, created_at DESC);
CREATE INDEX idx_webhook_events_status ON webhook_events(status, created_at DESC);
```

## Webhook Retry Service

### Core Implementation
```typescript
// src/services/payment/webhook-retry-service.ts
export class WebhookRetryService {
  private readonly MAX_RETRIES = 3;
  private readonly BASE_DELAY_MS = 1000; // 1 second
  private readonly MAX_DELAY_MS = 3600000; // 1 hour
  
  /**
   * Add webhook to dead letter queue
   */
  async addToDeadLetter(params: {
    gateway: string;
    eventId?: string;
    eventType: string;
    payload: any;
    headers?: Record<string, string>;
    error: Error;
  }): Promise<void> {
    const nextRetryAt = this.calculateNextRetryTime(0);
    
    await supabase.from('webhook_dead_letter').insert({
      gateway: params.gateway,
      event_id: params.eventId,
      event_type: params.eventType,
      payload: params.payload,
      headers: params.headers,
      error_message: params.error.message,
      error_code: (params.error as any).code || 'UNKNOWN',
      next_retry_at: nextRetryAt.toISOString(),
      retry_history: [{
        attempt: 0,
        timestamp: new Date().toISOString(),
        error: params.error.message,
        status_code: (params.error as any).statusCode,
      }],
    });
    
    // Log to monitoring
    logger.error('Webhook added to dead letter queue', {
      gateway: params.gateway,
      eventType: params.eventType,
      error: params.error.message,
    });
  }
  
  /**
   * Process pending retries
   */
  async processPendingRetries(): Promise<{
    processed: number;
    succeeded: number;
    failed: number;
  }> {
    const results = {
      processed: 0,
      succeeded: 0,
      failed: 0,
    };
    
    // Get webhooks ready for retry
    const { data: webhooks } = await supabase
      .from('webhook_dead_letter')
      .select('*')
      .lte('next_retry_at', new Date().toISOString())
      .lt('retry_count', 'max_retries')
      .is('resolved_at', null)
      .order('next_retry_at', { ascending: true })
      .limit(50); // Process in batches
    
    if (!webhooks || webhooks.length === 0) {
      return results;
    }
    
    // Process each webhook
    for (const webhook of webhooks) {
      results.processed++;
      
      try {
        await this.retryWebhook(webhook);
        results.succeeded++;
      } catch (error) {
        results.failed++;
        logger.error('Webhook retry failed', {
          webhookId: webhook.id,
          error: error.message,
        });
      }
    }
    
    return results;
  }
  
  /**
   * Retry a single webhook
   */
  private async retryWebhook(webhook: WebhookDeadLetter): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Get the appropriate gateway handler
      const gateway = PaymentGatewayFactory.getGateway(webhook.gateway);
      
      // Process the webhook
      const result = await gateway.processWebhook(webhook.payload);
      
      if (!result.processed) {
        throw new Error('Webhook not processed');
      }
      
      // Mark as resolved
      await supabase
        .from('webhook_dead_letter')
        .update({
          resolved_at: new Date().toISOString(),
          resolution_type: 'success',
        })
        .eq('id', webhook.id);
      
      // Log success
      await this.logWebhookEvent({
        gateway: webhook.gateway,
        eventId: webhook.event_id,
        eventType: webhook.event_type,
        status: 'success',
        processingTimeMs: Date.now() - startTime,
        metadata: {
          retryAttempt: webhook.retry_count + 1,
          webhookId: webhook.id,
        },
      });
      
    } catch (error: any) {
      const retryCount = webhook.retry_count + 1;
      const retryHistory = [
        ...webhook.retry_history,
        {
          attempt: retryCount,
          timestamp: new Date().toISOString(),
          error: error.message,
          status_code: error.statusCode,
        },
      ];
      
      if (retryCount >= this.MAX_RETRIES) {
        // Max retries reached
        await this.handleMaxRetriesReached(webhook, retryHistory);
      } else {
        // Schedule next retry
        const nextRetryAt = this.calculateNextRetryTime(retryCount);
        
        await supabase
          .from('webhook_dead_letter')
          .update({
            retry_count: retryCount,
            retry_history: retryHistory,
            next_retry_at: nextRetryAt.toISOString(),
            last_retry_at: new Date().toISOString(),
            error_message: error.message,
          })
          .eq('id', webhook.id);
      }
      
      // Log failure
      await this.logWebhookEvent({
        gateway: webhook.gateway,
        eventId: webhook.event_id,
        eventType: webhook.event_type,
        status: 'failed',
        processingTimeMs: Date.now() - startTime,
        errorMessage: error.message,
        metadata: {
          retryAttempt: retryCount,
          webhookId: webhook.id,
        },
      });
      
      throw error;
    }
  }
  
  /**
   * Calculate next retry time with exponential backoff and jitter
   */
  private calculateNextRetryTime(attemptNumber: number): Date {
    // Exponential backoff: 2^n * base delay
    const exponentialDelay = Math.pow(2, attemptNumber) * this.BASE_DELAY_MS;
    
    // Add jitter (0-25% of delay)
    const jitter = Math.random() * 0.25 * exponentialDelay;
    
    // Cap at maximum delay
    const totalDelay = Math.min(
      exponentialDelay + jitter,
      this.MAX_DELAY_MS
    );
    
    return new Date(Date.now() + totalDelay);
  }
  
  /**
   * Handle webhooks that reached max retries
   */
  private async handleMaxRetriesReached(
    webhook: WebhookDeadLetter,
    retryHistory: any[]
  ): Promise<void> {
    // Update webhook status
    await supabase
      .from('webhook_dead_letter')
      .update({
        retry_count: webhook.retry_count + 1,
        retry_history: retryHistory,
        last_retry_at: new Date().toISOString(),
      })
      .eq('id', webhook.id);
    
    // Send admin alert
    await sendAdminAlert({
      type: 'webhook_max_retries',
      severity: 'high',
      data: {
        webhookId: webhook.id,
        gateway: webhook.gateway,
        eventType: webhook.event_type,
        attempts: webhook.retry_count + 1,
        firstError: webhook.error_message,
        lastError: retryHistory[retryHistory.length - 1].error,
      },
    });
    
    // Check if critical webhook
    if (this.isCriticalWebhook(webhook.event_type)) {
      await this.escalateCriticalFailure(webhook);
    }
  }
  
  /**
   * Check if webhook is critical
   */
  private isCriticalWebhook(eventType: string): boolean {
    const criticalEvents = [
      'checkout.session.completed',
      'payment_intent.succeeded',
      'invoice.payment_succeeded',
      'customer.subscription.created',
    ];
    
    return criticalEvents.includes(eventType);
  }
}
```

## Webhook Handler Wrapper

### Reliable Webhook Processing
```typescript
// src/lib/webhook-handler.ts
export function withWebhookReliability<T>(
  handler: (event: T) => Promise<void>
) {
  return async function reliableHandler(
    request: Request,
    gateway: string
  ): Promise<Response> {
    const startTime = Date.now();
    let payload: any;
    let eventId: string | undefined;
    let eventType: string | undefined;
    
    try {
      // Parse webhook payload
      const body = await request.text();
      payload = JSON.parse(body);
      
      // Extract event details
      eventId = extractEventId(payload, gateway);
      eventType = extractEventType(payload, gateway);
      
      // Check for duplicate processing
      if (eventId) {
        const isDuplicate = await checkDuplicateEvent(eventId, gateway);
        if (isDuplicate) {
          return new Response('Event already processed', { status: 200 });
        }
      }
      
      // Process webhook
      await handler(payload);
      
      // Log success
      await logWebhookEvent({
        gateway,
        eventId,
        eventType,
        status: 'success',
        processingTimeMs: Date.now() - startTime,
      });
      
      return new Response('Webhook processed successfully', { status: 200 });
      
    } catch (error: any) {
      // Add to dead letter queue
      const retryService = new WebhookRetryService();
      await retryService.addToDeadLetter({
        gateway,
        eventId,
        eventType: eventType || 'unknown',
        payload,
        headers: Object.fromEntries(request.headers.entries()),
        error,
      });
      
      // Log failure
      await logWebhookEvent({
        gateway,
        eventId,
        eventType: eventType || 'unknown',
        status: 'failed',
        processingTimeMs: Date.now() - startTime,
        errorMessage: error.message,
      });
      
      // Return error response
      return new Response(
        JSON.stringify({ error: 'Webhook processing failed' }),
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
  };
}
```

## Cron Job for Retries

### Automated Retry Job
```typescript
// src/app/api/cron/webhook-retry/route.ts
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const retryService = new WebhookRetryService();
  
  try {
    // Process pending retries
    const results = await retryService.processPendingRetries();
    
    logger.info('Webhook retry job completed', results);
    
    // Check for stuck webhooks
    await checkStuckWebhooks();
    
    return NextResponse.json({
      success: true,
      ...results,
      timestamp: new Date().toISOString(),
    });
    
  } catch (error: any) {
    logger.error('Webhook retry job failed', error);
    
    return NextResponse.json({
      error: 'Retry job failed',
      message: error.message,
    }, { status: 500 });
  }
}

async function checkStuckWebhooks(): Promise<void> {
  // Find webhooks stuck in retrying state
  const { data: stuck } = await supabase
    .from('webhook_dead_letter')
    .select('count')
    .is('resolved_at', null)
    .lt('last_retry_at', new Date(Date.now() - 3600000).toISOString()) // 1 hour ago
    .single();
  
  if (stuck?.count > 10) {
    await sendAdminAlert({
      type: 'webhooks_stuck',
      severity: 'medium',
      data: {
        count: stuck.count,
        threshold: 10,
      },
    });
  }
}
```

## Admin API for Manual Intervention

### Manual Retry Endpoint
```typescript
// src/app/api/admin/webhooks/retry/route.ts
export const POST = withAdminAuth(async (request: NextRequest) => {
  const { webhookId } = await request.json();
  
  // Get webhook details
  const { data: webhook } = await supabase
    .from('webhook_dead_letter')
    .select('*')
    .eq('id', webhookId)
    .single();
  
  if (!webhook) {
    return NextResponse.json({ error: 'Webhook not found' }, { status: 404 });
  }
  
  const retryService = new WebhookRetryService();
  
  try {
    // Force retry
    await retryService.retryWebhook(webhook);
    
    return NextResponse.json({
      success: true,
      message: 'Webhook retried successfully',
    });
    
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
});
```

### Bulk Operations
```typescript
// src/app/api/admin/webhooks/bulk-retry/route.ts
export const POST = withAdminAuth(async (request: NextRequest) => {
  const { gateway, eventType, dateRange } = await request.json();
  
  // Build query
  let query = supabase
    .from('webhook_dead_letter')
    .select('*')
    .is('resolved_at', null);
  
  if (gateway) query = query.eq('gateway', gateway);
  if (eventType) query = query.eq('event_type', eventType);
  if (dateRange) {
    query = query
      .gte('created_at', dateRange.start)
      .lte('created_at', dateRange.end);
  }
  
  const { data: webhooks } = await query;
  
  const results = {
    total: webhooks?.length || 0,
    succeeded: 0,
    failed: 0,
  };
  
  // Process in batches
  for (const webhook of webhooks || []) {
    try {
      await retryService.retryWebhook(webhook);
      results.succeeded++;
    } catch (error) {
      results.failed++;
    }
  }
  
  return NextResponse.json(results);
});
```

## Monitoring & Alerting

### Webhook Health Metrics
```typescript
// src/services/monitoring/webhook-health.ts
export async function calculateWebhookHealth(): Promise<WebhookHealthMetrics> {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 86400000);
  const oneHourAgo = new Date(now.getTime() - 3600000);
  
  // Success rate
  const { data: stats } = await supabase.rpc('webhook_stats', {
    start_time: oneDayAgo.toISOString(),
    end_time: now.toISOString(),
  });
  
  const successRate = stats.total > 0 
    ? (stats.successful / stats.total) * 100 
    : 100;
  
  // Pending retries
  const { count: pendingRetries } = await supabase
    .from('webhook_dead_letter')
    .select('*', { count: 'exact', head: true })
    .is('resolved_at', null);
  
  // Recent failures
  const { count: recentFailures } = await supabase
    .from('webhook_events')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'failed')
    .gte('created_at', oneHourAgo.toISOString());
  
  // Average processing time
  const { data: processingTimes } = await supabase
    .from('webhook_events')
    .select('processing_time_ms')
    .eq('status', 'success')
    .gte('created_at', oneHourAgo.toISOString());
  
  const avgProcessingTime = processingTimes?.length > 0
    ? processingTimes.reduce((sum, r) => sum + r.processing_time_ms, 0) / processingTimes.length
    : 0;
  
  return {
    successRate,
    pendingRetries: pendingRetries || 0,
    recentFailures: recentFailures || 0,
    avgProcessingTimeMs: avgProcessingTime,
    healthScore: calculateHealthScore({
      successRate,
      pendingRetries: pendingRetries || 0,
      recentFailures: recentFailures || 0,
    }),
  };
}

function calculateHealthScore(metrics: any): 'healthy' | 'degraded' | 'unhealthy' {
  if (metrics.successRate >= 99 && metrics.pendingRetries < 10) {
    return 'healthy';
  }
  if (metrics.successRate >= 95 && metrics.pendingRetries < 50) {
    return 'degraded';
  }
  return 'unhealthy';
}
```

### Alert Rules
```typescript
// Alert configuration
export const WEBHOOK_ALERTS = {
  HIGH_FAILURE_RATE: {
    condition: (metrics: WebhookHealthMetrics) => metrics.successRate < 95,
    severity: 'high',
    message: 'Webhook success rate below 95%',
  },
  
  RETRY_QUEUE_BACKLOG: {
    condition: (metrics: WebhookHealthMetrics) => metrics.pendingRetries > 100,
    severity: 'medium',
    message: 'Large webhook retry backlog',
  },
  
  PROCESSING_SLOWDOWN: {
    condition: (metrics: WebhookHealthMetrics) => metrics.avgProcessingTimeMs > 5000,
    severity: 'low',
    message: 'Webhook processing slower than normal',
  },
  
  CRITICAL_WEBHOOK_FAILURE: {
    condition: (event: any) => 
      event.status === 'failed' && 
      ['checkout.session.completed', 'payment_intent.succeeded'].includes(event.eventType),
    severity: 'critical',
    message: 'Critical payment webhook failed',
  },
};
```

## Recovery Procedures

### Manual Recovery Steps
```typescript
// src/scripts/webhook-recovery.ts
export async function recoverFailedWebhooks(options: {
  gateway?: string;
  startDate: Date;
  endDate: Date;
  dryRun?: boolean;
}) {
  console.log('Starting webhook recovery...', options);
  
  // Get failed webhooks
  const { data: failed } = await supabase
    .from('webhook_dead_letter')
    .select('*')
    .is('resolved_at', null)
    .gte('created_at', options.startDate.toISOString())
    .lte('created_at', options.endDate.toISOString())
    .eq('gateway', options.gateway);
  
  console.log(`Found ${failed?.length || 0} failed webhooks`);
  
  if (options.dryRun) {
    console.log('Dry run - no changes will be made');
    return;
  }
  
  const results = {
    total: failed?.length || 0,
    recovered: 0,
    failed: 0,
  };
  
  for (const webhook of failed || []) {
    try {
      // Attempt recovery
      await processWebhook(webhook);
      
      // Mark as resolved
      await supabase
        .from('webhook_dead_letter')
        .update({
          resolved_at: new Date().toISOString(),
          resolution_type: 'manual',
        })
        .eq('id', webhook.id);
      
      results.recovered++;
    } catch (error) {
      console.error(`Failed to recover webhook ${webhook.id}:`, error);
      results.failed++;
    }
  }
  
  console.log('Recovery complete:', results);
}
```

## Best Practices

### Do's
- Always add failed webhooks to dead letter queue
- Use exponential backoff with jitter
- Monitor webhook health metrics
- Set up alerts for critical failures
- Document manual recovery procedures

### Don'ts
- Don't retry indefinitely
- Don't lose webhook data
- Don't ignore duplicate events
- Don't process webhooks synchronously
- Don't forget to verify signatures

## Testing

### Webhook Failure Simulation
```typescript
// src/__tests__/webhook-reliability.test.ts
describe('Webhook Reliability', () => {
  it('should add failed webhook to dead letter queue', async () => {
    const mockWebhook = {
      gateway: 'stripe',
      eventType: 'payment_intent.succeeded',
      payload: { id: 'pi_test123' },
    };
    
    const error = new Error('Network timeout');
    const retryService = new WebhookRetryService();
    
    await retryService.addToDeadLetter({
      ...mockWebhook,
      error,
    });
    
    // Verify webhook was added
    const { data } = await supabase
      .from('webhook_dead_letter')
      .select('*')
      .eq('event_type', mockWebhook.eventType)
      .single();
    
    expect(data).toBeDefined();
    expect(data.error_message).toBe('Network timeout');
    expect(data.retry_count).toBe(0);
  });
  
  it('should retry with exponential backoff', async () => {
    // Test retry timing calculation
    const retryService = new WebhookRetryService();
    
    const delays = [];
    for (let i = 0; i < 3; i++) {
      const nextRetry = retryService.calculateNextRetryTime(i);
      delays.push(nextRetry.getTime() - Date.now());
    }
    
    // Verify exponential increase
    expect(delays[1]).toBeGreaterThan(delays[0] * 1.5);
    expect(delays[2]).toBeGreaterThan(delays[1] * 1.5);
  });
});
```

---

*Last Updated: 27 June 2025*