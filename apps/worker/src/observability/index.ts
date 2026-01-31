/**
 * Observability Module Entry Point
 * Exports all observability components and initialization
 */

// Core SDK and initialization
export { initializeTelemetry, shutdownTelemetry } from './otel';

// Job tracing
export { JobTracer, JobContext, JobResult } from './job-tracer';

// Metrics
export { metrics } from './metrics';

// Logging
export {
  logger,
  createLogger,
  loggers,
  logError,
  logPerformance,
  logAudit,
  logRequest,
  logResponse,
  logMetric,
  logEvent,
} from './logger';

// REMOVED: Double initialization was happening here
// Initialization is now handled by src/observability/init.ts which is imported by server.ts
// DO NOT initialize here - it causes "MetricReader can not be bound to a MeterProvider again" error