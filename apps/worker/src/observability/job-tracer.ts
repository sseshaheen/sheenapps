/**
 * Job Processing Tracer
 * Provides distributed tracing for async job processing with context propagation
 */

import { 
  context, 
  trace, 
  propagation, 
  SpanKind, 
  SpanStatusCode,
  Span,
  SpanOptions,
  Context
} from '@opentelemetry/api';
import { metrics } from './metrics';
import { logger } from './logger';

const tracer = trace.getTracer('sheenapps-worker', '1.0.0');

export interface JobContext {
  id: string;
  type: string;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  queue?: string | undefined;
  attempt?: number | undefined;
  priority?: number | undefined;
  createdAt?: Date | undefined;
  scheduledAt?: Date | undefined;
  metadata?: Record<string, any> | undefined;
  _traceContext?: Record<string, string> | undefined;
}

export interface JobResult<T = any> {
  success: boolean;
  data?: T;
  error?: Error;
  duration: number;
  retryable?: boolean;
}

export class JobTracer {
  /**
   * Inject trace context into job payload for distributed tracing
   */
  static injectContext(job: JobContext): JobContext {
    const carrier: Record<string, string> = {};
    
    // Inject W3C trace context
    propagation.inject(context.active(), carrier);
    
    // Add baggage for cross-service metadata
    const baggage = propagation.createBaggage({
      'job.id': { value: job.id },
      'job.type': { value: job.type },
      'job.queue': { value: job.queue || 'default' },
    });
    
    const contextWithBaggage = propagation.setBaggage(context.active(), baggage);
    propagation.inject(contextWithBaggage, carrier);
    
    return {
      ...job,
      _traceContext: carrier,
    };
  }

  /**
   * Extract trace context from job and continue the distributed trace
   */
  static extractContext(job: JobContext): Context {
    if (!job._traceContext) {
      return context.active();
    }
    
    return propagation.extract(context.active(), job._traceContext);
  }

  /**
   * Process a job with full distributed tracing
   */
  static async processWithTrace<T>(
    job: JobContext,
    handler: (job: JobContext, span: Span) => Promise<T>
  ): Promise<JobResult<T>> {
    const startTime = Date.now();
    const extractedContext = this.extractContext(job);
    
    return context.with(extractedContext, async () => {
      const spanOptions: SpanOptions = {
        kind: SpanKind.CONSUMER,
        attributes: {
          'job.id': job.id,
          'job.type': job.type,
          'job.queue': job.queue || 'default',
          'job.attempt': job.attempt || 1,
          'job.priority': job.priority || 0,
          'job.created_at': job.createdAt?.toISOString() || '',
          'job.scheduled_at': job.scheduledAt?.toISOString() || '',
          'messaging.system': 'sqs',
          'messaging.destination': job.queue || 'default',
          'messaging.operation': 'process',
        },
      };

      const span = tracer.startSpan(`job.${job.type}`, spanOptions);
      
      // Add event for job start
      span.addEvent('job.started', {
        'job.id': job.id,
        'job.attempt': job.attempt || 1,
      });

      // Set baggage on span
      const baggage = propagation.getBaggage(context.active());
      if (baggage) {
        baggage.getAllEntries().forEach(([key, entry]) => {
          span.setAttribute(`baggage.${key}`, entry.value);
        });
      }

      try {
        // Log with trace context
        logger.info('Processing job');

        // Execute the job handler
        const result = await handler(job, span);
        
        const duration = Date.now() - startTime;
        
        // Add success event
        span.addEvent('job.completed', {
          'job.duration_ms': duration,
        });
        
        // Set success status
        span.setStatus({ code: SpanStatusCode.OK });
        
        // Record metrics
        metrics.recordJobMetrics(job.type, duration, true, job.queue);
        
        // Log success
        logger.info('Job completed successfully');
        
        return {
          success: true,
          data: result,
          duration,
        };
      } catch (error) {
        const duration = Date.now() - startTime;
        const err = error as Error;
        
        // Record exception
        span.recordException(err);
        
        // Add failure event
        span.addEvent('job.failed', {
          'job.duration_ms': duration,
          'error.type': err.name,
          'error.message': err.message,
        });
        
        // Set error status
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: err.message,
        });
        
        // Determine if retryable
        const retryable = this.isRetryableError(err);
        span.setAttribute('job.retryable', retryable);
        
        // Record metrics
        metrics.recordJobMetrics(job.type, duration, false, job.queue);
        
        // Log error with trace context
        logger.error('Job failed');
        
        return {
          success: false,
          error: err,
          duration,
          retryable,
        };
      } finally {
        span.end();
      }
    });
  }

  /**
   * Create a child span for a specific operation within a job
   */
  static async withSpan<T>(
    name: string,
    operation: (span: Span) => Promise<T>,
    options?: SpanOptions
  ): Promise<T> {
    const span = tracer.startSpan(name, options);
    
    try {
      const result = await operation(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: (error as Error).message,
      });
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Add custom attributes to the current span
   */
  static addAttributes(attributes: Record<string, any>): void {
    const span = trace.getActiveSpan();
    if (span) {
      Object.entries(attributes).forEach(([key, value]) => {
        span.setAttribute(key, value);
      });
    }
  }

  /**
   * Add an event to the current span
   */
  static addEvent(name: string, attributes?: Record<string, any>): void {
    const span = trace.getActiveSpan();
    if (span) {
      span.addEvent(name, attributes);
    }
  }

  /**
   * Create a span for external service calls
   */
  static async traceExternalCall<T>(
    service: string,
    operation: string,
    call: () => Promise<T>
  ): Promise<T> {
    return this.withSpan(
      `external.${service}.${operation}`,
      async (span) => {
        span.setAttributes({
          'peer.service': service,
          'peer.operation': operation,
        });
        
        const startTime = Date.now();
        try {
          const result = await call();
          const duration = Date.now() - startTime;
          
          span.setAttribute('peer.duration_ms', duration);
          metrics.recordExternalCallMetrics(service, operation, duration, true);
          
          return result;
        } catch (error) {
          const duration = Date.now() - startTime;
          
          span.setAttribute('peer.duration_ms', duration);
          metrics.recordExternalCallMetrics(service, operation, duration, false);
          
          throw error;
        }
      },
      { kind: SpanKind.CLIENT }
    );
  }

  /**
   * Create a span for database operations
   */
  static async traceDatabaseOperation<T>(
    operation: string,
    query: string,
    execute: () => Promise<T>
  ): Promise<T> {
    return this.withSpan(
      `db.${operation}`,
      async (span) => {
        span.setAttributes({
          'db.system': 'postgresql',
          'db.operation': operation,
          'db.statement': query.substring(0, 1000), // Truncate long queries
        });
        
        return execute();
      },
      { kind: SpanKind.CLIENT }
    );
  }

  /**
   * Create a span for cache operations
   */
  static async traceCacheOperation<T>(
    operation: string,
    key: string,
    execute: () => Promise<T>
  ): Promise<T> {
    return this.withSpan(
      `cache.${operation}`,
      async (span) => {
        span.setAttributes({
          'cache.system': 'redis',
          'cache.operation': operation,
          'cache.key': key,
        });
        
        const result = await execute();
        
        // Track cache hit/miss for get operations
        if (operation === 'get') {
          const hit = result !== null && result !== undefined;
          span.setAttribute('cache.hit', hit);
          metrics.recordCacheMetrics(operation, hit);
        }
        
        return result;
      },
      { kind: SpanKind.CLIENT }
    );
  }

  /**
   * Determine if an error is retryable
   */
  private static isRetryableError(error: Error): boolean {
    // Network errors
    if (error.message.includes('ECONNREFUSED') ||
        error.message.includes('ETIMEDOUT') ||
        error.message.includes('ENOTFOUND')) {
      return true;
    }
    
    // Database errors
    if (error.message.includes('deadlock') ||
        error.message.includes('connection') ||
        error.message.includes('timeout')) {
      return true;
    }
    
    // Rate limiting
    if (error.message.includes('rate limit') ||
        error.message.includes('throttle') ||
        error.message.includes('429')) {
      return true;
    }
    
    // Service unavailable
    if (error.message.includes('503') ||
        error.message.includes('unavailable')) {
      return true;
    }
    
    // Default to non-retryable
    return false;
  }

  /**
   * Get the current trace ID
   */
  static getTraceId(): string | undefined {
    const span = trace.getActiveSpan();
    return span?.spanContext().traceId;
  }

  /**
   * Get the current span ID
   */
  static getSpanId(): string | undefined {
    const span = trace.getActiveSpan();
    return span?.spanContext().spanId;
  }
}