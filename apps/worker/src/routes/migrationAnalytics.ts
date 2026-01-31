/**
 * Migration Analytics API Routes
 * Provides analytics rollup endpoints and event tracking
 * Implements acceptance criteria from TODO_REMAINING_IMPLEMENTATION_PLAN.md
 */

import { FastifyPluginAsync } from 'fastify';
import { migrationAnalyticsService, AnalyticsEvent, TraceContext } from '../services/migrationAnalyticsService';

interface AnalyticsQuerystring {
  userId?: string;
  from?: string;
  to?: string;
}

interface AnalyticsEventBody {
  userId: string;
  migrationProjectId: string;
  eventType: 'started' | 'step_completed' | 'retry' | 'completed' | 'failed';
  stepName?: string;
  duration?: number;
  metadata?: Record<string, any>;
  requestId?: string;
  traceId?: string;
}

const migrationAnalyticsRoutes: FastifyPluginAsync = async (fastify) => {

  /**
   * GET /api/migration-analytics/rollup
   * Analytics rollup report showing last 7 days counts, P95 durations, success %
   * Implements acceptance criteria: "Roll-up endpoint/report shows last 7 days counts, P95 durations, success %"
   */
  fastify.get<{
    Querystring: AnalyticsQuerystring;
  }>('/rollup', async (request, reply) => {
    try {
      const { userId, from: fromStr, to: toStr } = request.query;

      // Parse time range (default to last 7 days)
      const to = toStr ? new Date(toStr) : new Date();
      const from = fromStr ? new Date(fromStr) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      // Validate date range
      if (isNaN(from.getTime()) || isNaN(to.getTime())) {
        reply.code(400).send({
          error: 'Invalid date format',
          message: 'Dates must be in ISO 8601 format (YYYY-MM-DDTHH:mm:ss.sssZ)'
        });
        return;
      }

      if (from >= to) {
        reply.code(400).send({
          error: 'Invalid date range',
          message: 'from date must be before to date'
        });
        return;
      }

      console.log(`[Migration Analytics] Generating rollup report for user ${userId || 'all'}, range: ${from.toISOString()} to ${to.toISOString()}`);

      // Generate analytics rollup
      const report = await migrationAnalyticsService.generateAnalyticsRollup({ from, to });

      // Add metadata for debugging
      const response = {
        ...report,
        metadata: {
          generatedAt: new Date().toISOString(),
          userId: userId || null,
          daysIncluded: Math.ceil((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)),
          blank_state: report.totalEvents === 0
        }
      };

      reply.send(response);

    } catch (error) {
      console.error('[Migration Analytics] Failed to generate rollup report:', error);
      reply.code(500).send({
        error: 'Failed to generate analytics rollup',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * POST /api/migration-analytics/events
   * Track analytics events with trace integration
   * Implements acceptance criteria: "At least 5 key events emitted (start, step, retry, success, failure) with request_id/trace_id"
   */
  fastify.post<{
    Body: AnalyticsEventBody;
  }>('/events', async (request, reply) => {
    try {
      const {
        userId,
        migrationProjectId,
        eventType,
        stepName,
        duration,
        metadata,
        requestId,
        traceId
      } = request.body;

      // Validate required fields
      if (!userId || !migrationProjectId || !eventType) {
        reply.code(400).send({
          error: 'Missing required fields',
          message: 'userId, migrationProjectId, and eventType are required'
        });
        return;
      }

      // Validate event type
      const validEventTypes = ['started', 'step_completed', 'retry', 'completed', 'failed'];
      if (!validEventTypes.includes(eventType)) {
        reply.code(400).send({
          error: 'Invalid event type',
          message: `eventType must be one of: ${validEventTypes.join(', ')}`
        });
        return;
      }

      console.log(`[Migration Analytics] Tracking event: ${eventType} for migration ${migrationProjectId}, user ${userId}`);

      // Create analytics event
      const analyticsEvent: AnalyticsEvent = {
        migrationProjectId,
        eventType,
        requestId,
        traceId,
        stepName,
        duration,
        metadata: {
          ...metadata,
          userId, // Include for internal tracking (PII-safe as it's UUID)
          source: 'migration_api'
        }
      };

      // Create trace context if provided
      const traceContext: TraceContext | undefined = (requestId && traceId) ? {
        requestId,
        traceId
      } : undefined;

      // Track the event
      await migrationAnalyticsService.trackAnalyticsEvent(analyticsEvent, traceContext);

      reply.send({
        status: 'success',
        message: 'Analytics event tracked successfully',
        eventId: requestId || 'generated',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('[Migration Analytics] Failed to track analytics event:', error);
      reply.code(500).send({
        error: 'Failed to track analytics event',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * GET /api/migration-analytics/health
   * Health check for analytics service
   */
  fastify.get('/health', async (request, reply) => {
    try {
      // Test database connectivity with a simple query
      const testReport = await migrationAnalyticsService.generateAnalyticsRollup({
        from: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
        to: new Date()
      });

      reply.send({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        features: {
          analytics_emit: process.env.ANALYTICS_EMIT || 'on',
          database_connection: true,
          last_test_events: testReport.totalEvents
        }
      });

    } catch (error) {
      console.error('[Migration Analytics] Health check failed:', error);
      reply.code(500).send({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
};

export default migrationAnalyticsRoutes;