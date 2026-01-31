/**
 * Structured Logger with Pino
 * Phase 2: Observability & Monitoring Implementation
 * 
 * Provides hierarchical correlation tracking:
 * - requestId: Universal request tracking (from middleware)
 * - correlationId: Worker-specific correlation (existing system)
 */

import pino from 'pino';

// Logger configuration based on environment
const createPinoLogger = () => {
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  return pino({
    level: isDevelopment ? 'debug' : 'info',
    
    // Development: Pretty printing for better readability
    ...(isDevelopment && {
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          ignore: 'pid,hostname',
          translateTime: 'yyyy-mm-dd HH:MM:ss',
          messageFormat: '{requestId} {correlationId} - {msg}'
        }
      }
    }),

    // Production: Structured JSON logs for aggregation
    ...(!isDevelopment && {
      formatters: {
        level: (label) => ({ level: label }),
      },
      timestamp: pino.stdTimeFunctions.isoTime,
    }),

    // Base fields included in all logs
    base: {
      service: 'sheenapps-nextjs',
      version: process.env.npm_package_version || '1.0.0',
    },
  });
};

// Global Pino logger instance
const pinoLogger = createPinoLogger();

/**
 * Structured logger with correlation tracking
 */
export class StructuredLogger {
  private logger: pino.Logger;

  constructor(defaultContext: Record<string, unknown> = {}) {
    this.logger = pinoLogger.child(defaultContext);
  }

  /**
   * Create a child logger with additional context
   */
  child(context: Record<string, unknown>): StructuredLogger {
    return new StructuredLogger(context);
  }

  /**
   * Log with automatic correlation context extraction
   */
  private enrichContext(
    level: string,
    message: string,
    context: Record<string, unknown> = {}
  ): Record<string, unknown> {
    const enriched = { ...context };

    // Extract request ID from various sources
    if (typeof window !== 'undefined') {
      // Client-side: Check if request ID is available in global context
      const globalThis = window as any;
      if (globalThis.__REQUEST_ID__) {
        enriched.requestId = globalThis.__REQUEST_ID__;
      }
    }

    // Auto-detect correlation ID from context or existing patterns
    if (!enriched.correlationId) {
      // Check if correlation ID exists in any field
      Object.entries(enriched).forEach(([key, value]) => {
        if (typeof value === 'string' && value.startsWith('nextjs_')) {
          enriched.correlationId = value;
        }
      });
    }

    // Add timestamp for correlation
    enriched.timestamp = new Date().toISOString();

    return enriched;
  }

  debug(message: string, context: Record<string, unknown> = {}): void {
    const enriched = this.enrichContext('debug', message, context);
    this.logger.debug(enriched, message);
  }

  info(message: string, context: Record<string, unknown> = {}): void {
    const enriched = this.enrichContext('info', message, context);
    this.logger.info(enriched, message);
  }

  warn(message: string, context: Record<string, unknown> = {}): void {
    const enriched = this.enrichContext('warn', message, context);
    this.logger.warn(enriched, message);
  }

  error(message: string, error?: Error | unknown, context: Record<string, unknown> = {}): void {
    const enriched = this.enrichContext('error', message, context);
    
    // Handle error object properly
    if (error) {
      if (error instanceof Error) {
        enriched.error = {
          name: error.name,
          message: error.message,
          stack: error.stack,
        };
      } else {
        enriched.error = error;
      }
    }

    this.logger.error(enriched, message);
  }

  /**
   * Create logger with request context (for API routes)
   */
  withRequest(requestId: string, additionalContext: Record<string, unknown> = {}): StructuredLogger {
    return this.child({
      requestId,
      ...additionalContext
    });
  }

  /**
   * Create logger with correlation context (for worker calls)
   */
  withCorrelation(
    correlationId: string, 
    requestId?: string,
    additionalContext: Record<string, unknown> = {}
  ): StructuredLogger {
    return this.child({
      correlationId,
      ...(requestId && { requestId }),
      ...additionalContext
    });
  }

  /**
   * Create logger with build context
   */
  withBuild(
    buildId: string,
    requestId?: string,
    correlationId?: string,
    additionalContext: Record<string, unknown> = {}
  ): StructuredLogger {
    return this.child({
      buildId,
      ...(requestId && { requestId }),
      ...(correlationId && { correlationId }),
      ...additionalContext
    });
  }

  /**
   * Create logger with user context
   */
  withUser(
    userId: string,
    requestId?: string,
    additionalContext: Record<string, unknown> = {}
  ): StructuredLogger {
    return this.child({
      userId,
      ...(requestId && { requestId }),
      ...additionalContext
    });
  }
}

// Default logger instance
export const structuredLogger = new StructuredLogger();

// Helper function to get request ID from headers (for API routes)
export function getRequestIdFromHeaders(headers: Headers): string | undefined {
  return headers.get('x-request-id') || undefined;
}

// Helper function to set request ID globally (for client-side)
export function setGlobalRequestId(requestId: string): void {
  if (typeof window !== 'undefined') {
    (window as any).__REQUEST_ID__ = requestId;
  }
}

export default structuredLogger;