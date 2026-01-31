/**
 * Structured Logger with OpenTelemetry Integration
 * Automatically adds trace context to all log entries for correlation
 */

import pino from 'pino';
import { context, trace } from '@opentelemetry/api';

// Determine log level based on environment
const getLogLevel = (): string => {
  const env = process.env.NODE_ENV || 'development';
  const level = process.env.LOG_LEVEL;
  
  if (level) return level;
  
  switch (env) {
    case 'production':
      return 'info';
    case 'staging':
      return 'debug';
    case 'development':
      return 'trace';
    case 'test':
      return 'silent';
    default:
      return 'info';
  }
};

// Configure pino with OpenTelemetry integration
export const logger = pino({
  name: 'sheenapps-worker',
  level: getLogLevel(),
  
  // Add trace context to every log
  mixin(): Record<string, any> {
    const span = trace.getSpan(context.active());
    if (!span) return {};
    
    const spanContext = span.spanContext();
    return {
      trace_id: spanContext.traceId,
      span_id: spanContext.spanId,
      trace_flags: spanContext.traceFlags,
    };
  },
  
  // Format configuration
  formatters: {
    level: (label) => {
      return { level: label };
    },
    
    bindings: (bindings) => {
      return {
        pid: bindings.pid,
        host: bindings.hostname,
        service: 'sheenapps-worker',
        version: process.env.APP_VERSION || 'unknown',
        environment: process.env.NODE_ENV || 'development',
      };
    },
  },
  
  // Serializers for common objects
  serializers: {
    error: pino.stdSerializers.err,
    
    request: (req: any) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      headers: req.headers,
      remoteAddress: req.connection?.remoteAddress,
    }),
    
    response: (res: any) => ({
      statusCode: res.statusCode,
      headers: res.getHeaders?.(),
    }),
    
    job: (job: any) => ({
      id: job.id,
      type: job.type,
      queue: job.queue,
      attempt: job.attempt,
      createdAt: job.createdAt,
      scheduledAt: job.scheduledAt,
    }),
  },
  
  // Redaction for sensitive data
  redact: {
    paths: [
      'password',
      'token',
      'apiKey',
      'api_key',
      'authorization',
      'cookie',
      'credit_card',
      'ssn',
      'email',
      '*.password',
      '*.token',
      '*.apiKey',
      '*.api_key',
      'headers.authorization',
      'headers.cookie',
    ],
    censor: '[REDACTED]',
  },
  
  // Timestamp configuration
  timestamp: pino.stdTimeFunctions.isoTime,
  
  // Base configuration - use null to disable default base (pino requires null, not undefined)
  base: null, // We're handling this in formatters.bindings
  
  // Pretty print for development
  ...(process.env.NODE_ENV === 'development' && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        levelFirst: true,
        translateTime: 'HH:MM:ss.l',
        ignore: 'pid,hostname',
      },
    },
  }),
});

// Create child loggers for specific components
export const createLogger = (component: string) => {
  return logger.child({ component });
};

// Convenience methods for structured logging
export const loggers = {
  job: createLogger('job-processor'),
  queue: createLogger('queue-manager'),
  database: createLogger('database'),
  cache: createLogger('cache'),
  api: createLogger('api-client'),
  health: createLogger('health-check'),
  startup: createLogger('startup'),
};

// Error logging with stack traces
export const logError = (
  message: string,
  error: Error,
  context?: Record<string, any>
): void => {
  logger.error({
    msg: message,
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: error.cause,
    },
    ...context,
  });
};

// Performance logging
export const logPerformance = (
  operation: string,
  duration: number,
  context?: Record<string, any>
): void => {
  const level = duration > 5000 ? 'warn' : duration > 1000 ? 'info' : 'debug';
  
  logger[level]({
    msg: `Operation completed: ${operation}`,
    operation,
    duration_ms: duration,
    duration_bucket: duration < 100 ? 'fast' : duration < 1000 ? 'normal' : 'slow',
    ...context,
  });
};

// Audit logging for important events
export const logAudit = (
  action: string,
  userId?: string,
  context?: Record<string, any>
): void => {
  logger.info({
    msg: `Audit: ${action}`,
    audit: true,
    action,
    userId,
    timestamp: new Date().toISOString(),
    ...context,
  });
};

// Request/Response logging
export const logRequest = (
  method: string,
  url: string,
  context?: Record<string, any>
): void => {
  logger.debug({
    msg: `Request: ${method} ${url}`,
    request: {
      method,
      url,
      ...context,
    },
  });
};

export const logResponse = (
  method: string,
  url: string,
  statusCode: number,
  duration: number,
  context?: Record<string, any>
): void => {
  const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'debug';
  
  logger[level]({
    msg: `Response: ${method} ${url} - ${statusCode}`,
    response: {
      method,
      url,
      statusCode,
      duration_ms: duration,
      ...context,
    },
  });
};

// Metric logging for observability
export const logMetric = (
  name: string,
  value: number,
  unit: string,
  labels?: Record<string, string>
): void => {
  logger.debug({
    msg: `Metric: ${name}`,
    metric: {
      name,
      value,
      unit,
      labels,
    },
  });
};

// Structured event logging
export const logEvent = (
  eventType: string,
  eventData: Record<string, any>
): void => {
  logger.info({
    msg: `Event: ${eventType}`,
    event: {
      type: eventType,
      data: eventData,
      timestamp: new Date().toISOString(),
    },
  });
};

// Export default logger
export default logger;