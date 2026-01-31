/**
 * Internal Events Admin Routes
 * Provides secure admin access to internal build events with comprehensive audit logging
 *
 * Security Features:
 * - JWT-based admin authentication with granular permissions
 * - Comprehensive audit logging for all admin access
 * - Rate limiting and correlation ID tracking
 * - Structured error handling with security considerations
 */

import { FastifyInstance, FastifyRequest } from 'fastify';
import { requireAdminAuth, AdminRequest } from '../middleware/adminAuthentication';
import { getInternalEventsSince } from '../services/eventService';
import { ServerLoggingService } from '../services/serverLoggingService';

const loggingService = ServerLoggingService.getInstance();

interface InternalEventsParams {
  buildId: string;
}

interface InternalEventsQuery {
  lastEventId?: string;
}

export default async function internalEventsRoutes(fastify: FastifyInstance) {
  /**
   * GET /internal/builds/:buildId/events
   * Retrieve internal build events with full debug data (admin only)
   */
  fastify.get<{
    Params: InternalEventsParams;
    Querystring: InternalEventsQuery;
  }>('/internal/builds/:buildId/events', {
    preHandler: [requireAdminAuth({
      permissions: ['internal.events.read'],
      requireReason: false,
      logActions: true
    })]
  }, async (request, reply) => {
    const { buildId } = request.params;
    const { lastEventId } = request.query;
    const adminRequest = request as AdminRequest;
    const admin = adminRequest.adminClaims;

    const correlationId = request.headers['x-correlation-id'] as string ||
      `admin-events-${buildId}-${Date.now()}`;

    try {
      // Parse lastEventId with validation
      const lastEventIdNumber = lastEventId ? parseInt(lastEventId, 10) : 0;
      if (lastEventId && (isNaN(lastEventIdNumber) || lastEventIdNumber < 0)) {
        return reply.code(400).send({
          error: 'Invalid lastEventId parameter',
          code: 'INVALID_PARAMETER',
          message: 'lastEventId must be a non-negative integer',
          correlationId
        });
      }

      // Log admin access to internal events
      await loggingService.logServerEvent(
        'capacity',
        'info',
        'Internal events accessed',
        {
          userId: admin.userId || admin.sub,
          email: admin.email,
          buildId,
          lastEventId: lastEventIdNumber,
          correlationId,
          userAgent: request.headers['user-agent'],
          ip: request.ip
        }
      );

      // Get internal events - now without adminToken parameter
      const events = await getInternalEventsSince(buildId, lastEventIdNumber);

      return reply.send({
        success: true,
        buildId,
        lastEventId: lastEventIdNumber,
        eventCount: events.length,
        events,
        correlationId,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      // Log error with admin context
      await loggingService.logCriticalError(
        'internal_events_access_failed',
        error as Error,
        {
          userId: admin.userId || admin.sub,
          email: admin.email,
          buildId,
          lastEventId,
          correlationId
        }
      );

      return reply.code(500).send({
        error: 'Failed to retrieve internal events',
        code: 'INTERNAL_ERROR',
        message: 'An error occurred while accessing internal build events',
        correlationId,
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * GET /internal/builds/:buildId/summary
   * Get build event summary for admin dashboard
   */
  fastify.get<{
    Params: InternalEventsParams;
  }>('/internal/builds/:buildId/summary', {
    preHandler: [requireAdminAuth({
      permissions: ['internal.events.read'],
      requireReason: false,
      logActions: true
    })]
  }, async (request, reply) => {
    const { buildId } = request.params;
    const adminRequest = request as AdminRequest;
    const admin = adminRequest.adminClaims;

    const correlationId = request.headers['x-correlation-id'] as string ||
      `admin-summary-${buildId}-${Date.now()}`;

    try {
      // Get all events to generate summary
      const events = await getInternalEventsSince(buildId, 0);

      // Generate summary statistics
      const lastEvent = events.at(-1);
      const summary = {
        totalEvents: events.length,
        phases: {} as Record<string, number>,
        errors: [] as any[],
        progress: lastEvent?.overall_progress ?? 0,
        finished: events.some(e => e.finished),
        duration: events.length > 0 ?
          events.reduce((sum, e) => sum + (e.duration_seconds || 0), 0) : 0,
        latestEvent: lastEvent ?? null
      };

      // Count events by phase
      events.forEach(event => {
        if (event.phase) {
          summary.phases[event.phase] = (summary.phases[event.phase] || 0) + 1;
        }

        // Collect error events
        if (event.error_message) {
          summary.errors.push({
            id: event.id,
            phase: event.phase,
            message: event.error_message,
            timestamp: event.created_at
          });
        }
      });

      // Log admin access
      await loggingService.logServerEvent(
        'capacity',
        'info',
        'Build summary accessed',
        {
          userId: admin.userId || admin.sub,
          buildId,
          correlationId,
          eventCount: events.length
        }
      );

      return reply.send({
        success: true,
        buildId,
        summary,
        correlationId,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      await loggingService.logCriticalError(
        'internal_build_summary_failed',
        error as Error,
        {
          userId: admin.userId || admin.sub,
          buildId,
          correlationId
        }
      );

      return reply.code(500).send({
        error: 'Failed to generate build summary',
        code: 'INTERNAL_ERROR',
        correlationId,
        timestamp: new Date().toISOString()
      });
    }
  });
}