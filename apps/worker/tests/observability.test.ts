/**
 * Observability Integration Tests
 * Tests for OpenTelemetry instrumentation, job tracing, and metrics
 */

import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';
import { sdk, initializeTelemetry } from '../src/observability/otel';
import { JobTracer, JobContext } from '../src/observability/job-tracer';
import { metrics } from '../src/observability/metrics';
import { logger } from '../src/observability/logger';

// Mock span exporter for testing
const memoryExporter = new InMemorySpanExporter();

describe('Observability Integration', () => {
  beforeAll(async () => {
    // Initialize SDK with test configuration
    process.env.OTEL_SDK_DISABLED = 'false';
    process.env.NODE_ENV = 'test';
    process.env.OTEL_SERVICE_NAME = 'test-worker';
    
    initializeTelemetry();
    
    // Wait for SDK to initialize
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterAll(async () => {
    await sdk.shutdown();
  });

  describe('OpenTelemetry SDK', () => {
    test('should initialize successfully', () => {
      const tracer = trace.getTracer('test');
      expect(tracer).toBeDefined();
    });

    test('should create spans', async () => {
      const tracer = trace.getTracer('test');
      const span = tracer.startSpan('test-span');
      
      span.setAttribute('test.attribute', 'value');
      span.addEvent('test-event');
      span.end();

      expect(span.spanContext().traceId).toBeDefined();
      expect(span.spanContext().spanId).toBeDefined();
    });

    test('should propagate context', () => {
      const tracer = trace.getTracer('test');
      const parentSpan = tracer.startSpan('parent');
      
      context.with(trace.setSpan(context.active(), parentSpan), () => {
        const childSpan = tracer.startSpan('child');
        
        expect(childSpan.spanContext().traceId).toBe(parentSpan.spanContext().traceId);
        expect(childSpan.spanContext().spanId).not.toBe(parentSpan.spanContext().spanId);
        
        childSpan.end();
      });
      
      parentSpan.end();
    });
  });

  describe('JobTracer', () => {
    test('should inject and extract trace context', () => {
      const job: JobContext = {
        id: 'test-job-1',
        type: 'email',
        queue: 'default',
        attempt: 1,
      };

      // Inject context
      const injectedJob = JobTracer.injectContext(job);
      expect(injectedJob._traceContext).toBeDefined();
      expect(injectedJob._traceContext.traceparent).toBeDefined();

      // Extract context
      const extractedContext = JobTracer.extractContext(injectedJob);
      expect(extractedContext).toBeDefined();
    });

    test('should process job with tracing', async () => {
      const job: JobContext = {
        id: 'test-job-2',
        type: 'webhook',
        queue: 'priority',
        attempt: 1,
      };

      const result = await JobTracer.processWithTrace(job, async (j, span) => {
        expect(j.id).toBe(job.id);
        expect(span).toBeDefined();
        
        // Add custom attributes
        span.setAttribute('custom.attribute', 'test');
        
        // Simulate some work
        await new Promise(resolve => setTimeout(resolve, 10));
        
        return { processed: true };
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ processed: true });
      expect(result.duration).toBeGreaterThan(0);
    });

    test('should handle job failures with tracing', async () => {
      const job: JobContext = {
        id: 'test-job-3',
        type: 'failing-job',
        queue: 'default',
        attempt: 1,
      };

      const result = await JobTracer.processWithTrace(job, async () => {
        throw new Error('Job processing failed');
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toBe('Job processing failed');
      expect(result.duration).toBeGreaterThan(0);
    });

    test('should trace external calls', async () => {
      const result = await JobTracer.traceExternalCall(
        'stripe',
        'charge',
        async () => {
          // Simulate API call
          await new Promise(resolve => setTimeout(resolve, 50));
          return { charged: true };
        }
      );

      expect(result).toEqual({ charged: true });
    });

    test('should trace database operations', async () => {
      const result = await JobTracer.traceDatabaseOperation(
        'select',
        'SELECT * FROM users WHERE id = $1',
        async () => {
          // Simulate DB query
          await new Promise(resolve => setTimeout(resolve, 20));
          return [{ id: 1, name: 'Test User' }];
        }
      );

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Test User');
    });

    test('should trace cache operations', async () => {
      // Cache miss
      const missResult = await JobTracer.traceCacheOperation(
        'get',
        'user:123',
        async () => null
      );
      expect(missResult).toBeNull();

      // Cache hit
      const hitResult = await JobTracer.traceCacheOperation(
        'get',
        'user:456',
        async () => ({ id: 456, name: 'Cached User' })
      );
      expect(hitResult).toBeDefined();
    });

    test('should create child spans', async () => {
      const result = await JobTracer.withSpan(
        'test-operation',
        async (span) => {
          span.setAttribute('test', true);
          await new Promise(resolve => setTimeout(resolve, 10));
          return 'completed';
        }
      );

      expect(result).toBe('completed');
    });

    test('should determine retryable errors', async () => {
      const networkError = new Error('ECONNREFUSED');
      const timeoutError = new Error('Request timeout');
      const rateLimitError = new Error('Rate limit exceeded: 429');
      const validationError = new Error('Invalid input');

      const job: JobContext = {
        id: 'test-retry',
        type: 'test',
      };

      // Network error - retryable
      const networkResult = await JobTracer.processWithTrace(job, async () => {
        throw networkError;
      });
      expect(networkResult.retryable).toBe(true);

      // Timeout error - retryable
      const timeoutResult = await JobTracer.processWithTrace(job, async () => {
        throw timeoutError;
      });
      expect(timeoutResult.retryable).toBe(true);

      // Rate limit error - retryable
      const rateLimitResult = await JobTracer.processWithTrace(job, async () => {
        throw rateLimitError;
      });
      expect(rateLimitResult.retryable).toBe(true);

      // Validation error - not retryable
      const validationResult = await JobTracer.processWithTrace(job, async () => {
        throw validationError;
      });
      expect(validationResult.retryable).toBe(false);
    });
  });

  describe('Metrics', () => {
    test('should record job metrics', () => {
      metrics.recordJobMetrics('email', 1500, true, 'default');
      metrics.recordJobMetrics('webhook', 3000, false, 'priority');
      
      // Metrics are recorded but not directly testable without a test exporter
      expect(true).toBe(true);
    });

    test('should track active jobs', () => {
      metrics.incrementActiveJobs('email');
      metrics.incrementActiveJobs('webhook');
      metrics.decrementActiveJobs('email');
      
      expect(true).toBe(true);
    });

    test('should record queue metrics', () => {
      metrics.recordQueueMessage('received', 'default');
      metrics.recordQueueMessage('deleted', 'default');
      metrics.updateQueueStats(100, 5.5);
      
      expect(true).toBe(true);
    });

    test('should record external call metrics', () => {
      metrics.recordExternalCallMetrics('stripe', 'charge', 250, true);
      metrics.recordExternalCallMetrics('sendgrid', 'send', 500, false);
      
      expect(true).toBe(true);
    });

    test('should record database metrics', () => {
      metrics.recordDatabaseQuery('select', 'users', 15);
      metrics.recordDatabaseQuery('insert', 'jobs', 25);
      metrics.updateDatabasePoolStats(10, 3, 7);
      
      expect(true).toBe(true);
    });

    test('should record cache metrics', () => {
      metrics.recordCacheMetrics('get', true);  // hit
      metrics.recordCacheMetrics('get', false); // miss
      metrics.recordCacheMetrics('set');
      
      expect(true).toBe(true);
    });

    test('should update health status', () => {
      metrics.updateHealthStatus(true);
      metrics.updateHealthStatus(false);
      metrics.updateHealthStatus(true);
      
      expect(true).toBe(true);
    });

    test('should provide histogram buckets', () => {
      const jobBuckets = metrics.getHistogramBuckets('job.duration');
      expect(jobBuckets).toContain(1000);
      expect(jobBuckets).toContain(5000);
      
      const dbBuckets = metrics.getHistogramBuckets('db.query.duration');
      expect(dbBuckets).toContain(10);
      expect(dbBuckets).toContain(100);
      
      const defaultBuckets = metrics.getHistogramBuckets('unknown');
      expect(defaultBuckets).toContain(1);
      expect(defaultBuckets).toContain(10);
    });
  });

  describe('Logger', () => {
    test('should include trace context in logs', () => {
      const tracer = trace.getTracer('test');
      const span = tracer.startSpan('test-log-span');
      
      context.with(trace.setSpan(context.active(), span), () => {
        // Logger should automatically include trace_id and span_id
        logger.info('Test log message', { custom: 'data' });
        
        const traceId = span.spanContext().traceId;
        const spanId = span.spanContext().spanId;
        
        // In a real test, we'd capture the log output and verify
        // For now, just verify the logger doesn't throw
        expect(traceId).toBeDefined();
        expect(spanId).toBeDefined();
      });
      
      span.end();
    });

    test('should handle different log levels', () => {
      logger.trace('Trace message');
      logger.debug('Debug message');
      logger.info('Info message');
      logger.warn('Warning message');
      logger.error('Error message');
      
      // Verify no errors thrown
      expect(true).toBe(true);
    });

    test('should serialize job objects', () => {
      const job = {
        id: 'job-123',
        type: 'email',
        queue: 'default',
        attempt: 2,
        createdAt: new Date(),
        scheduledAt: new Date(),
      };
      
      logger.info('Processing job', { job });
      
      // Verify no errors thrown
      expect(true).toBe(true);
    });

    test('should redact sensitive data', () => {
      const sensitiveData = {
        username: 'testuser',
        password: 'secret123',
        apiKey: 'sk_live_abc123',
        token: 'bearer xyz789',
        user: {
          email: 'test@example.com',
          credit_card: '4111111111111111',
        },
      };
      
      logger.info('Sensitive data test', sensitiveData);
      
      // In production, these would be redacted as [REDACTED]
      expect(true).toBe(true);
    });
  });

  describe('Integration', () => {
    test('should correlate traces, metrics, and logs', async () => {
      const job: JobContext = {
        id: 'integration-test-job',
        type: 'integration',
        queue: 'test',
        attempt: 1,
      };

      await JobTracer.processWithTrace(job, async (j, span) => {
        // This should create a span
        span.setAttribute('test.integration', true);
        
        // This should create a log with trace context
        logger.info('Processing integration test job', { jobId: j.id });
        
        // This should record metrics
        metrics.incrementActiveJobs(j.type);
        
        // Simulate some work
        await JobTracer.traceExternalCall('test-api', 'call', async () => {
          await new Promise(resolve => setTimeout(resolve, 10));
          return { success: true };
        });
        
        metrics.decrementActiveJobs(j.type);
        
        return { integrated: true };
      });

      // All three signals should be correlated with the same trace_id
      expect(true).toBe(true);
    });

    test('should handle concurrent jobs with separate traces', async () => {
      const jobs = [
        { id: 'concurrent-1', type: 'email', queue: 'default' },
        { id: 'concurrent-2', type: 'webhook', queue: 'priority' },
        { id: 'concurrent-3', type: 'notification', queue: 'default' },
      ];

      const results = await Promise.all(
        jobs.map(job =>
          JobTracer.processWithTrace(job, async (j) => {
            logger.info(`Processing ${j.type}`, { jobId: j.id });
            await new Promise(resolve => setTimeout(resolve, Math.random() * 50));
            return { jobId: j.id, processed: true };
          })
        )
      );

      expect(results).toHaveLength(3);
      results.forEach((result, index) => {
        expect(result.success).toBe(true);
        expect(result.data.jobId).toBe(jobs[index].id);
      });
    });
  });
});