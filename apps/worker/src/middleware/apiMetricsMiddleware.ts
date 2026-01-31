/**
 * API Metrics Middleware
 *
 * Records request metrics for system health dashboard and SLO tracking.
 * Integrates with AdminMetricsService to store hourly aggregated metrics.
 *
 * Metrics collected:
 * - api_requests_total: Count of requests by route and status code category
 * - api_request_duration_ms: Request duration for latency analysis
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getAdminMetricsService } from '../services/admin/AdminMetricsService';
import { normalizeRoute, categorizeStatusCode } from '../utils/routeNormalization';
import { metrics as otelMetrics } from '../observability/metrics';

// Symbols to store metrics state on request
const REQUEST_START_TIME = Symbol('requestStartTime');
const REQUEST_SHOULD_COUNT = Symbol('requestShouldCount');

// Routes to exclude from metrics (health checks, internal endpoints)
const EXCLUDED_ROUTES = new Set([
  '/healthz',
  '/myhealthz',
  '/metrics',
  '/readiness',
  '/liveness',
]);

// Prefix routes to exclude (internal/debug routes)
const EXCLUDED_PREFIXES = ['/debug/', '/__'];

interface RequestWithTiming extends FastifyRequest {
  [REQUEST_START_TIME]?: number;
  [REQUEST_SHOULD_COUNT]?: boolean;
}

/**
 * Extract pathname from URL (strips query string and normalizes trailing slashes)
 */
function getPathname(url: string): string {
  // Strip query parameters
  const queryIndex = url.indexOf('?');
  const path = queryIndex >= 0 ? url.substring(0, queryIndex) : url;

  // Normalize trailing slashes (keep root '/' as-is)
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}

/**
 * Check if a route should be excluded from metrics
 */
function shouldExcludeRoute(url: string): boolean {
  const pathname = getPathname(url);

  // Check exact matches (using pathname without query string)
  if (EXCLUDED_ROUTES.has(pathname)) {
    return true;
  }

  // Check prefixes
  for (const prefix of EXCLUDED_PREFIXES) {
    if (pathname.startsWith(prefix)) {
      return true;
    }
  }

  return false;
}

/**
 * Register API metrics hooks on Fastify instance
 *
 * @param app - Fastify instance
 * @param options - Configuration options
 */
export function registerApiMetricsHooks(
  app: FastifyInstance,
  options: {
    enabled?: boolean;
    sampleRate?: number; // 0-1, percentage of requests to track (default 1.0)
    excludeRoutes?: string[];
  } = {}
): void {
  const { enabled = true, sampleRate = 1.0, excludeRoutes = [] } = options;

  if (!enabled) {
    return;
  }

  // Add custom excluded routes
  for (const route of excludeRoutes) {
    EXCLUDED_ROUTES.add(route);
  }

  const metricsService = getAdminMetricsService();

  /**
   * onRequest hook: Mark for counting and optionally record start time for duration sampling
   */
  app.addHook('onRequest', async (request: RequestWithTiming) => {
    // Skip excluded routes entirely
    if (shouldExcludeRoute(request.url)) {
      return;
    }

    // Always count requests (for accurate request totals / SLOs)
    request[REQUEST_SHOULD_COUNT] = true;

    // Only sample duration measurements (if sampleRate < 1.0)
    // This keeps request counts accurate while reducing latency measurement overhead
    if (sampleRate >= 1.0 || Math.random() <= sampleRate) {
      request[REQUEST_START_TIME] = Date.now();
    }
  });

  /**
   * onError hook: Count requests that fail without a clean response
   * This captures timeouts, aborted requests, and unhandled errors for accurate SLOs
   */
  app.addHook('onError', async (request: RequestWithTiming, _reply, error) => {
    if (!request[REQUEST_SHOULD_COUNT]) return;

    const startTime = request[REQUEST_START_TIME];
    const durationMs = startTime ? Date.now() - startTime : null;

    // Get route path with same logic as onResponse
    const routePath = request.routeOptions?.url ?? '__unmatched__';
    const normalizedRoute = normalizeRoute(routePath);

    try {
      // Record as 5xx for SLO calculation (error = server failure)
      await metricsService.recordApiRequest(
        normalizedRoute,
        500, // Treat unhandled errors as 500
        durationMs ?? 0
      );
    } catch (err) {
      console.error('Failed to record error metrics:', err);
    }
  });

  /**
   * onResponse hook: Record metrics
   */
  app.addHook('onResponse', async (request: RequestWithTiming, reply: FastifyReply) => {
    // Skip if not marked for counting (excluded routes)
    if (!request[REQUEST_SHOULD_COUNT]) {
      return;
    }

    const startTime = request[REQUEST_START_TIME];
    const durationMs = startTime ? Date.now() - startTime : null;
    const statusCode = reply.statusCode;

    // Get the route path (prefer routeOptions.url for parameterized routes)
    // e.g., '/api/users/:id' instead of '/api/users/123'
    // Use '__unmatched__' for 404s/unregistered routes to prevent cardinality explosion
    const routePath = request.routeOptions?.url ?? '__unmatched__';
    const normalizedRoute = normalizeRoute(routePath);

    try {
      // Always record request count (for accurate SLOs)
      // Only record duration if we have start time (sampled)
      await metricsService.recordApiRequest(
        normalizedRoute,
        statusCode,
        durationMs ?? 0 // Pass 0 for unsampled requests (count-only)
      );

      // Also record to OpenTelemetry for real-time monitoring (only if sampled)
      if (durationMs !== null) {
        otelMetrics.recordExternalCallMetrics(
          'api',
          normalizedRoute,
          durationMs,
          statusCode < 400
        );
      }
    } catch (error) {
      // Don't let metrics recording fail the request
      // Silently log but continue
      console.error('Failed to record API metrics:', error);
    }
  });
}

/**
 * Standalone function to record a single API request metric
 * For use outside of middleware (e.g., in route handlers with custom timing)
 */
export async function recordApiMetric(
  route: string,
  statusCode: number,
  durationMs: number
): Promise<void> {
  const metricsService = getAdminMetricsService();
  const normalizedRoute = normalizeRoute(route);

  await metricsService.recordApiRequest(normalizedRoute, statusCode, durationMs);
}

/**
 * Record build-specific metrics
 */
export async function recordBuildMetric(
  status: 'success' | 'failed' | 'timeout',
  durationSeconds: number
): Promise<void> {
  const metricsService = getAdminMetricsService();
  await metricsService.recordBuildResult(status, durationSeconds);
}

/**
 * Record webhook event metrics
 */
export async function recordWebhookMetric(
  provider: string,
  status: 'success' | 'failed' | 'retry'
): Promise<void> {
  const metricsService = getAdminMetricsService();
  await metricsService.recordWebhookEvent(provider, status);
}

/**
 * Record payment event metrics
 */
export async function recordPaymentMetric(
  type: 'success' | 'failed' | 'retry'
): Promise<void> {
  const metricsService = getAdminMetricsService();
  await metricsService.recordPaymentEvent(type);
}
