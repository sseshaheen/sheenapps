/**
 * Admin Metrics Service
 *
 * Handles storing and querying system metrics for the admin dashboard.
 * Works alongside OpenTelemetry for real-time metrics, but stores
 * aggregated hourly data in PostgreSQL for dashboard queries.
 *
 * Two data sources:
 * 1. Direct instrumentation (preferred) - API middleware, build runner
 * 2. Log-derived (fallback) - External webhook events, third-party data
 */

import { makeAdminCtx } from '../../lib/supabase';
import { normalizeRoute, validateDimensionKeys, categorizeStatusCode } from '../../utils/routeNormalization';
import { ServerLoggingService } from '../serverLoggingService';

// Types
export interface MetricDimensions {
  route?: string;
  status_code?: string;
  provider?: string;
  queue?: string;
  plan?: string;
  status?: string;
  type?: string;
  service?: string;
  [key: string]: string | undefined;
}

export interface MetricRecord {
  hour: Date;
  metric_name: string;
  dimensions: MetricDimensions;
  value: number;
  source: 'instrumentation' | 'log_derived';
}

export interface ServiceStatus {
  service_name: string;
  display_name: string;
  status: 'operational' | 'degraded' | 'outage' | 'unknown';
  error_message?: string;
  metrics?: Record<string, number>;
}

export interface SLOResult {
  name: string;
  description?: string;
  target: number;
  current: number | null;
  operator: string;
  compliant: boolean;
  window_hours: number;
}

// In-memory buffer for batching metric inserts
interface MetricBuffer {
  metrics: MetricRecord[];
  lastFlush: number;
  isFlushing: boolean; // Guard to prevent concurrent flushes
}

const metricBuffer: MetricBuffer = {
  metrics: [],
  lastFlush: Date.now(),
  isFlushing: false,
};

const FLUSH_INTERVAL_MS = 60_000; // Flush every minute
const MAX_BUFFER_SIZE = 1000;

/**
 * Get the start of the current hour for metric aggregation
 */
function getCurrentHour(): Date {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  return now;
}

/**
 * Stable JSON stringify with sorted keys
 * Ensures consistent aggregation keys regardless of object property insertion order
 */
function stableStringify(obj: Record<string, unknown>): string {
  const keys = Object.keys(obj).sort();
  const sorted: Record<string, unknown> = {};
  for (const k of keys) {
    sorted[k] = obj[k];
  }
  return JSON.stringify(sorted);
}

/**
 * AdminMetricsService - Handles system metrics for admin dashboard
 */
export class AdminMetricsService {
  private logger: ServerLoggingService;

  constructor() {
    this.logger = ServerLoggingService.getInstance();

    // Start background flush
    this.startBackgroundFlush();
  }

  /**
   * Record an API request metric
   * @param path - Request path
   * @param statusCode - HTTP status code
   * @param durationMs - Request duration in ms (0 = count only, skip duration recording)
   */
  async recordApiRequest(
    path: string,
    statusCode: number,
    durationMs: number
  ): Promise<void> {
    const normalizedRoute = normalizeRoute(path);
    const hour = getCurrentHour();

    // Always record request count (for accurate SLOs)
    this.bufferMetric({
      hour,
      metric_name: 'api_requests_total',
      dimensions: {
        route: normalizedRoute,
        status_code: categorizeStatusCode(statusCode),
      },
      value: 1,
      source: 'instrumentation',
    });

    // Only record latency if we have a real measurement (durationMs > 0)
    // This supports sampling where we always count but only measure some durations
    // Store both sum and count to enable proper average calculation
    if (durationMs > 0) {
      this.bufferMetric({
        hour,
        metric_name: 'api_request_duration_ms_sum',
        dimensions: {
          route: normalizedRoute,
        },
        value: durationMs,
        source: 'instrumentation',
      });

      this.bufferMetric({
        hour,
        metric_name: 'api_request_duration_ms_count',
        dimensions: {
          route: normalizedRoute,
        },
        value: 1,
        source: 'instrumentation',
      });
    }
  }

  /**
   * Record a build result metric
   */
  async recordBuildResult(
    status: 'success' | 'failed' | 'timeout',
    durationSeconds: number
  ): Promise<void> {
    const hour = getCurrentHour();

    this.bufferMetric({
      hour,
      metric_name: 'builds_total',
      dimensions: { status },
      value: 1,
      source: 'instrumentation',
    });

    this.bufferMetric({
      hour,
      metric_name: 'build_duration_seconds',
      dimensions: {},
      value: durationSeconds,
      source: 'instrumentation',
    });
  }

  /**
   * Record a webhook event (log-derived metric)
   */
  async recordWebhookEvent(
    provider: string,
    status: 'success' | 'failed' | 'retry'
  ): Promise<void> {
    const hour = getCurrentHour();

    this.bufferMetric({
      hour,
      metric_name: 'webhook_events_total',
      dimensions: { provider, status },
      value: 1,
      source: 'log_derived',
    });
  }

  /**
   * Record a payment event (log-derived metric)
   */
  async recordPaymentEvent(
    type: 'success' | 'failed' | 'retry'
  ): Promise<void> {
    const hour = getCurrentHour();

    this.bufferMetric({
      hour,
      metric_name: 'payment_events_total',
      dimensions: { type },
      value: 1,
      source: 'log_derived',
    });
  }

  /**
   * Record active users (hourly snapshot)
   */
  async recordActiveUsers(count: number): Promise<void> {
    const hour = getCurrentHour();

    this.bufferMetric({
      hour,
      metric_name: 'active_users_hourly',
      dimensions: {},
      value: count,
      source: 'log_derived',
    });
  }

  /**
   * Buffer a metric for batch insert
   */
  private bufferMetric(metric: MetricRecord): void {
    // Validate dimensions - filter out undefined values for validation
    const definedDimensions = Object.fromEntries(
      Object.entries(metric.dimensions).filter(([, v]) => v !== undefined)
    ) as Record<string, string>;
    const validation = validateDimensionKeys(definedDimensions);
    if (!validation.valid) {
      this.logger.warn('Invalid dimension keys', {
        invalidKeys: validation.invalidKeys,
        metric_name: metric.metric_name,
      });
      return;
    }

    metricBuffer.metrics.push(metric);

    // Flush if buffer is full
    if (metricBuffer.metrics.length >= MAX_BUFFER_SIZE) {
      this.flushMetrics().catch((err) => {
        this.logger.error('Failed to flush metrics', { error: err });
      });
    }
  }

  /**
   * Start background flush interval
   */
  private startBackgroundFlush(): void {
    setInterval(() => {
      if (metricBuffer.metrics.length > 0) {
        this.flushMetrics().catch((err) => {
          this.logger.error('Background flush failed', { error: err });
        });
      }
    }, FLUSH_INTERVAL_MS);
  }

  /**
   * Flush buffered metrics to database
   */
  async flushMetrics(): Promise<void> {
    // Guard against concurrent flushes
    if (metricBuffer.isFlushing || metricBuffer.metrics.length === 0) return;

    metricBuffer.isFlushing = true;

    const metricsToFlush = [...metricBuffer.metrics];
    metricBuffer.metrics = [];
    metricBuffer.lastFlush = Date.now();

    try {
      // Aggregate metrics by hour + metric_name + dimensions
      // Use stableStringify to ensure consistent keys regardless of property order
      const aggregated = new Map<string, { metric: MetricRecord; sum: number; count: number }>();

      for (const metric of metricsToFlush) {
        const key = `${metric.hour.toISOString()}:${metric.metric_name}:${stableStringify(metric.dimensions)}`;

        if (aggregated.has(key)) {
          const existing = aggregated.get(key)!;
          existing.sum += metric.value;
          existing.count += 1;
        } else {
          aggregated.set(key, { metric, sum: metric.value, count: 1 });
        }
      }

      const supabase = makeAdminCtx();

      // Upsert aggregated metrics
      const upsertPromises = Array.from(aggregated.values()).map(async ({ metric, sum }) => {
        const { error } = await supabase.rpc('upsert_metric', {
          p_hour: metric.hour.toISOString(),
          p_metric_name: metric.metric_name,
          p_dimensions: metric.dimensions,
          p_value: sum,
          p_source: metric.source,
        });

        if (error) {
          // Fallback to simple insert if RPC doesn't exist
          const { error: insertError } = await supabase
            .from('system_metrics_hourly')
            .upsert(
              {
                hour: metric.hour.toISOString(),
                metric_name: metric.metric_name,
                dimensions: metric.dimensions,
                value: sum,
                source: metric.source,
              },
              {
                onConflict: 'hour,metric_name,dimensions',
              }
            );

          if (insertError) {
            this.logger.error('Failed to upsert metric', {
              metric_name: metric.metric_name,
              error: insertError,
            });
          }
        }
      });

      await Promise.allSettled(upsertPromises);
    } finally {
      metricBuffer.isFlushing = false;
    }
  }

  /**
   * Get metrics for dashboard
   */
  async getMetrics(
    metricName: string,
    hours: number = 24,
    dimensions?: MetricDimensions
  ): Promise<{ hour: string; value: number; dimensions: MetricDimensions }[]> {
    const supabase = makeAdminCtx();

    const since = new Date();
    since.setHours(since.getHours() - hours);

    let query = supabase
      .from('system_metrics_hourly')
      .select('hour, value, dimensions')
      .eq('metric_name', metricName)
      .gte('hour', since.toISOString())
      .order('hour', { ascending: true });

    if (dimensions) {
      // Filter by dimensions
      query = query.contains('dimensions', dimensions);
    }

    const { data, error } = await query;

    if (error) {
      this.logger.error('Failed to get metrics', { error });
      return [];
    }

    return data || [];
  }

  /**
   * Get SLO compliance for dashboard
   */
  async getSLOCompliance(): Promise<SLOResult[]> {
    const supabase = makeAdminCtx();

    const { data: slos, error: sloError } = await supabase
      .from('slo_definitions')
      .select('*')
      .eq('enabled', true);

    if (sloError || !slos) {
      this.logger.error('Failed to get SLO definitions', { error: sloError });
      return [];
    }

    // Calculate all SLO values in parallel for better performance
    const results = await Promise.all(
      slos.map(async (slo: { id: string; name: string; description?: string; metric_name: string; target_value: number; target_operator: string; window_hours: number }) => {
        const currentValue = await this.calculateSLOValue(
          slo.metric_name,
          slo.window_hours
        );

        const isCompliant = this.evaluateSLO(
          currentValue,
          slo.target_value,
          slo.target_operator
        );

        const result: SLOResult = {
          name: slo.name,
          target: slo.target_value,
          current: currentValue,
          operator: slo.target_operator,
          compliant: isCompliant,
          window_hours: slo.window_hours,
        };
        if (slo.description) {
          result.description = slo.description;
        }
        return result;
      })
    );

    return results;
  }

  /**
   * Calculate SLO value from metrics
   */
  private async calculateSLOValue(
    metricName: string,
    windowHours: number
  ): Promise<number | null> {
    const supabase = makeAdminCtx();

    const since = new Date();
    since.setHours(since.getHours() - windowHours);

    // Different calculations based on metric type
    if (metricName === 'api_success_rate') {
      // Calculate from api_requests_total
      const { data } = await supabase
        .from('system_metrics_hourly')
        .select('dimensions, value')
        .eq('metric_name', 'api_requests_total')
        .gte('hour', since.toISOString());

      if (!data || data.length === 0) return null;

      let success = 0;
      let total = 0;

      for (const row of data) {
        total += row.value;
        const statusCode = row.dimensions?.status_code;
        if (statusCode === '2xx' || statusCode === '3xx') {
          success += row.value;
        }
      }

      return total > 0 ? (success / total) * 100 : null;
    }

    if (metricName === 'build_success_rate') {
      const { data } = await supabase
        .from('system_metrics_hourly')
        .select('dimensions, value')
        .eq('metric_name', 'builds_total')
        .gte('hour', since.toISOString());

      if (!data || data.length === 0) return null;

      let success = 0;
      let total = 0;

      for (const row of data) {
        total += row.value;
        if (row.dimensions?.status === 'success') {
          success += row.value;
        }
      }

      return total > 0 ? (success / total) * 100 : null;
    }

    if (metricName === 'api_latency_avg') {
      // Average latency = sum of durations / count of samples
      // We store sum and count separately to enable proper average calculation
      const [sumResult, countResult] = await Promise.all([
        supabase
          .from('system_metrics_hourly')
          .select('value')
          .eq('metric_name', 'api_request_duration_ms_sum')
          .gte('hour', since.toISOString()),
        supabase
          .from('system_metrics_hourly')
          .select('value')
          .eq('metric_name', 'api_request_duration_ms_count')
          .gte('hour', since.toISOString()),
      ]);

      const sumData = sumResult.data || [];
      const countData = countResult.data || [];

      if (sumData.length === 0 || countData.length === 0) return null;

      const totalSum = sumData.reduce((acc: number, row: { value: number }) => acc + row.value, 0);
      const totalCount = countData.reduce((acc: number, row: { value: number }) => acc + row.value, 0);

      return totalCount > 0 ? totalSum / totalCount : null;
    }

    if (metricName === 'webhook_delivery_rate') {
      const { data } = await supabase
        .from('system_metrics_hourly')
        .select('dimensions, value')
        .eq('metric_name', 'webhook_events_total')
        .gte('hour', since.toISOString());

      if (!data || data.length === 0) return null;

      let success = 0;
      let total = 0;

      for (const row of data) {
        total += row.value;
        if (row.dimensions?.status === 'success') {
          success += row.value;
        }
      }

      return total > 0 ? (success / total) * 100 : null;
    }

    // Default: average of values
    const { data } = await supabase
      .from('system_metrics_hourly')
      .select('value')
      .eq('metric_name', metricName)
      .gte('hour', since.toISOString());

    if (!data || data.length === 0) return null;

    const sum = data.reduce((acc: number, row: { value: number }) => acc + row.value, 0);
    return sum / data.length;
  }

  /**
   * Evaluate if SLO is met
   */
  private evaluateSLO(
    current: number | null,
    target: number,
    operator: string
  ): boolean {
    if (current === null) return false;

    switch (operator) {
      case 'gt':
        return current > target;
      case 'gte':
        return current >= target;
      case 'lt':
        return current < target;
      case 'lte':
        return current <= target;
      case 'eq':
        return current === target;
      default:
        return false;
    }
  }

  /**
   * Update service status (upserts to handle new services)
   */
  async updateServiceStatus(
    serviceName: string,
    status: 'operational' | 'degraded' | 'outage' | 'unknown',
    errorMessage?: string,
    metrics?: Record<string, number>
  ): Promise<void> {
    const supabase = makeAdminCtx();

    const now = new Date().toISOString();
    const upsertData = {
      service_name: serviceName,
      display_name: serviceName, // Default display name to service_name
      status,
      error_message: errorMessage,
      metrics,
      last_check_at: now,
      ...(status === 'operational' ? { last_healthy_at: now } : {}),
    };

    const { error } = await supabase
      .from('service_status')
      .upsert(upsertData, {
        onConflict: 'service_name',
      });

    if (error) {
      this.logger.error('Failed to upsert service status', {
        serviceName,
        error,
      });
    }
  }

  /**
   * Get all service statuses
   */
  async getServiceStatuses(): Promise<ServiceStatus[]> {
    const supabase = makeAdminCtx();

    const { data, error } = await supabase
      .from('service_status')
      .select('*')
      .order('service_name');

    if (error) {
      this.logger.error('Failed to get service statuses', { error });
      return [];
    }

    return data || [];
  }

  /**
   * Get "Why is it red?" analysis for a degraded service
   *
   * Note: Currently returns API-wide error analysis. The serviceName parameter
   * filters by service dimension when available (e.g., 'api', 'build_runner').
   * If no service dimension exists on metrics, returns all error routes.
   */
  async getServiceDegradationAnalysis(serviceName: string): Promise<{
    topContributors: { route: string; errorCount: number; percentage: number }[];
    spikeStarted?: string;
    sampleError?: string;
  }> {
    const supabase = makeAdminCtx();

    const since = new Date();
    since.setHours(since.getHours() - 1);

    // Get recent errors by route, optionally filtered by service
    let query = supabase
      .from('system_metrics_hourly')
      .select('dimensions, value')
      .eq('metric_name', 'api_requests_total')
      .gte('hour', since.toISOString())
      .or(`dimensions->status_code.eq."4xx",dimensions->status_code.eq."5xx"`);

    // Filter by service if specified and not 'all'
    if (serviceName && serviceName !== 'all' && serviceName !== 'api') {
      query = query.contains('dimensions', { service: serviceName });
    }

    const { data } = await query;

    if (!data || data.length === 0) {
      return { topContributors: [] };
    }

    // Aggregate by route
    const byRoute = new Map<string, number>();
    let total = 0;

    for (const row of data) {
      const route = row.dimensions?.route || 'unknown';
      byRoute.set(route, (byRoute.get(route) || 0) + row.value);
      total += row.value;
    }

    // Sort and get top contributors
    const topContributors = Array.from(byRoute.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([route, errorCount]) => ({
        route,
        errorCount,
        percentage: total > 0 ? Math.round((errorCount / total) * 100) : 0,
      }));

    return {
      topContributors,
      spikeStarted: since.toISOString(),
    };
  }

  /**
   * Get 24-hour sparkline data for a metric
   */
  async getSparklineData(
    metricName: string,
    hours: number = 24
  ): Promise<{ hour: string; value: number }[]> {
    const supabase = makeAdminCtx();

    const since = new Date();
    since.setHours(since.getHours() - hours);

    const { data, error } = await supabase
      .from('system_metrics_hourly')
      .select('hour, value')
      .eq('metric_name', metricName)
      .gte('hour', since.toISOString())
      .order('hour', { ascending: true });

    if (error) {
      this.logger.error('Failed to get sparkline data', { error });
      return [];
    }

    // Aggregate by hour
    const byHour = new Map<string, number>();
    for (const row of data || []) {
      const hourKey = new Date(row.hour).toISOString();
      byHour.set(hourKey, (byHour.get(hourKey) || 0) + row.value);
    }

    return Array.from(byHour.entries()).map(([hour, value]) => ({
      hour,
      value,
    }));
  }
}

// Singleton instance
let adminMetricsServiceInstance: AdminMetricsService | null = null;

export function getAdminMetricsService(): AdminMetricsService {
  if (!adminMetricsServiceInstance) {
    adminMetricsServiceInstance = new AdminMetricsService();
  }
  return adminMetricsServiceInstance;
}
