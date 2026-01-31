/**
 * Admin Performance API Routes
 *
 * Provides Web Vitals metrics for the admin performance dashboard.
 * Uses service role access to read from web_vitals_hourly table.
 */

import { FastifyInstance } from 'fastify';
import { requireReadOnlyAccess } from '../middleware/adminAuthentication';
import { withCorrelationId } from '../middleware/correlationIdMiddleware';
import { pool } from '../services/database';
import { ServerLoggingService } from '../services/serverLoggingService';

const loggingService = ServerLoggingService.getInstance();

// Core Web Vitals thresholds (p75 targets from Google)
const VITALS_THRESHOLDS = {
  INP: { good: 200, poor: 500 },
  LCP: { good: 2500, poor: 4000 },
  CLS: { good: 0.1, poor: 0.25 },
  TTFB: { good: 800, poor: 1800 },
  FCP: { good: 1800, poor: 3000 },
};

// Time range to milliseconds mapping
const RANGE_MS: Record<string, number> = {
  '1h': 1 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

// Number of trend points for each range
const TREND_POINTS: Record<string, number> = {
  '1h': 2,
  '24h': 24,
  '7d': 7 * 24,
  '30d': 30 * 24,
};

type MetricName = keyof typeof VITALS_THRESHOLDS;

function getRating(metric: MetricName, value: number): 'good' | 'needs-improvement' | 'poor' {
  const thresholds = VITALS_THRESHOLDS[metric];
  if (!thresholds) return 'needs-improvement';
  if (value <= thresholds.good) return 'good';
  if (value >= thresholds.poor) return 'poor';
  return 'needs-improvement';
}

interface WebVitalsQueryParams {
  range?: string;
  route?: string;
  build?: string;
}

export default async function adminPerformanceRoutes(fastify: FastifyInstance) {
  /**
   * GET /v1/admin/performance/web-vitals
   * Get aggregated Web Vitals metrics for the performance dashboard
   */
  fastify.get<{
    Querystring: WebVitalsQueryParams;
  }>('/v1/admin/performance/web-vitals', {
    preHandler: requireReadOnlyAccess()
  }, async (request, reply) => {
    const { range = '24h', route, build } = request.query;

    try {
      // Validate pool is available
      if (!pool) {
        return reply.code(503).send({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Database connection not available' },
          correlation_id: request.correlationId,
        });
      }

      const rangeKey = range in RANGE_MS ? range : '24h';
      const rangeMs = RANGE_MS[rangeKey] || 24 * 60 * 60 * 1000; // Default to 24h
      const startTime = new Date(Date.now() - rangeMs).toISOString();
      const trendPoints = TREND_POINTS[rangeKey] ?? 24;

      // Build query with optional filters
      let queryText = `
        SELECT
          hour,
          route,
          metric_name,
          p50,
          p75,
          p95,
          sample_count,
          good_count,
          needs_improvement_count,
          poor_count,
          build_version
        FROM web_vitals_hourly
        WHERE hour >= $1
      `;
      const queryParams: (string | null)[] = [startTime];
      let paramIndex = 2;

      if (route) {
        queryText += ` AND route = $${paramIndex}`;
        queryParams.push(route);
        paramIndex++;
      }
      if (build) {
        queryText += ` AND build_version = $${paramIndex}`;
        queryParams.push(build);
        paramIndex++;
      }

      queryText += ' ORDER BY hour DESC';

      const { rows: hourlyData } = await pool.query(queryText, queryParams);

      // Aggregate metrics using streaming sums for weighted averaging
      // Also build trend buckets in the same pass (O(n) instead of O(n×m))
      type Agg = {
        p50_sum: number;
        p75_sum: number;
        p95_sum: number;
        p50_w: number;
        p75_w: number;
        p95_w: number;
        samples: number;
        good: number;
        needsImprovement: number;
        poor: number;
      };

      const metricAggregates: Record<string, Agg> = {};
      // Pre-bucket trend data in single pass (expert review optimization)
      const trendBuckets: Record<string, Array<{ hour: string; p75: number }>> = {};

      for (const row of hourlyData) {
        const name = row.metric_name as string;
        if (!name) continue;

        const weight = Number(row.sample_count || 0);

        // Aggregate metrics
        if (!metricAggregates[name]) {
          metricAggregates[name] = {
            p50_sum: 0, p75_sum: 0, p95_sum: 0,
            p50_w: 0, p75_w: 0, p95_w: 0,
            samples: 0, good: 0, needsImprovement: 0, poor: 0,
          };
        }
        const agg = metricAggregates[name];

        if (row.p50 != null && Number.isFinite(Number(row.p50)) && weight > 0) {
          agg.p50_sum += Number(row.p50) * weight;
          agg.p50_w += weight;
        }
        if (row.p75 != null && Number.isFinite(Number(row.p75)) && weight > 0) {
          agg.p75_sum += Number(row.p75) * weight;
          agg.p75_w += weight;
        }
        if (row.p95 != null && Number.isFinite(Number(row.p95)) && weight > 0) {
          agg.p95_sum += Number(row.p95) * weight;
          agg.p95_w += weight;
        }

        agg.samples += weight;
        agg.good += Number(row.good_count || 0);
        agg.needsImprovement += Number(row.needs_improvement_count || 0);
        agg.poor += Number(row.poor_count || 0);

        // Build trend bucket (only if p75 exists)
        if (row.p75 != null) {
          (trendBuckets[name] ||= []).push({
            hour: row.hour,
            p75: Number(row.p75),
          });
        }
      }

      // Calculate final metrics with weighted averaging
      const metrics: Record<string, {
        p50: number;
        p75: number;
        p95: number;
        samples: number;
        rating: 'good' | 'needs-improvement' | 'poor';
        goodPercent: number;
        needsImprovementPercent: number;
        poorPercent: number;
      }> = {};

      const targetMetrics: MetricName[] = ['INP', 'LCP', 'CLS', 'TTFB', 'FCP'];
      for (const name of targetMetrics) {
        const agg = metricAggregates[name];
        if (!agg || agg.p75_w === 0) {
          metrics[name] = {
            p50: 0,
            p75: 0,
            p95: 0,
            samples: 0,
            rating: 'needs-improvement',
            goodPercent: 0,
            needsImprovementPercent: 0,
            poorPercent: 0,
          };
          continue;
        }

        const avgP50 = agg.p50_w > 0 ? agg.p50_sum / agg.p50_w : 0;
        const avgP75 = agg.p75_w > 0 ? agg.p75_sum / agg.p75_w : 0;
        const avgP95 = agg.p95_w > 0 ? agg.p95_sum / agg.p95_w : 0;
        const total = agg.good + agg.needsImprovement + agg.poor;

        metrics[name] = {
          p50: Math.round(avgP50 * 100) / 100,
          p75: Math.round(avgP75 * 100) / 100,
          p95: Math.round(avgP95 * 100) / 100,
          samples: agg.samples,
          rating: getRating(name, avgP75),
          goodPercent: total > 0 ? Math.round((agg.good / total) * 100) : 0,
          needsImprovementPercent: total > 0 ? Math.round((agg.needsImprovement / total) * 100) : 0,
          poorPercent: total > 0 ? Math.round((agg.poor / total) * 100) : 0,
        };
      }

      // Build trend data from pre-bucketed data (already DESC order from query)
      // Slice to trendPoints and reverse for ascending order (charts expect oldest→newest)
      const trendData: Record<string, Array<{ hour: string; p75: number }>> = {};
      for (const name of targetMetrics) {
        const bucket = trendBuckets[name] || [];
        trendData[name] = bucket.slice(0, trendPoints).reverse();
      }

      // Build top routes with weighted aggregation
      type RouteAgg = {
        samples: number;
        metric: Record<string, { num: number; den: number }>;
      };

      const routeAggregates: Record<string, RouteAgg> = {};

      for (const row of hourlyData) {
        const r = row.route || '/';
        const weight = Number(row.sample_count || 0);

        if (!routeAggregates[r]) {
          routeAggregates[r] = { samples: 0, metric: {} };
        }
        routeAggregates[r].samples += weight;

        if (row.p75 != null) {
          const m = row.metric_name;
          if (!routeAggregates[r].metric[m]) {
            routeAggregates[r].metric[m] = { num: 0, den: 0 };
          }
          routeAggregates[r].metric[m].num += Number(row.p75) * weight;
          routeAggregates[r].metric[m].den += weight;
        }
      }

      const topRoutes = Object.entries(routeAggregates)
        .sort((a, b) => b[1].samples - a[1].samples)
        .slice(0, 10)
        .map(([routePath, data]) => {
          const getWeightedMetric = (m: string): number | null => {
            const v = data.metric[m];
            return v && v.den > 0 ? v.num / v.den : null;
          };
          return {
            route: routePath,
            samples: data.samples,
            inp: getWeightedMetric('INP'),
            lcp: getWeightedMetric('LCP'),
            cls: getWeightedMetric('CLS'),
          };
        });

      return reply.send(
        withCorrelationId({
          success: true,
          metrics,
          trends: trendData,
          topRoutes,
          timeRange: rangeKey,
          thresholds: VITALS_THRESHOLDS,
          totalSamples: Object.values(metricAggregates).reduce((sum, m) => sum + m.samples, 0),
        }, request)
      );
    } catch (error) {
      await loggingService.logCriticalError('admin_performance_web_vitals_error', error as Error, {
        correlation_id: request.correlationId,
        range,
        route,
        build,
      });

      return reply.code(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch web vitals metrics' },
        correlation_id: request.correlationId,
      });
    }
  });
}
