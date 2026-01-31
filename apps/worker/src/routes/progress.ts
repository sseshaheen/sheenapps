import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { pool } from '../services/database';
import { getCleanEventsSince } from '../services/eventService';
import { UserBuildEvent } from '../types/cleanEvents';
import { requireHmacSignature } from '../middleware/hmacValidation';

interface ProgressParams {
  buildId: string;
}

interface ProgressQuery {
  lastEventId?: string;
  userId: string; // Required for security
}


export async function registerProgressRoutes(app: FastifyInstance) {
  // Apply HMAC validation to all endpoints
  const hmacMiddleware = requireHmacSignature();

  // GET /api/builds/:buildId/events - Get clean build progress events (NextJS Team API)
  app.get('/v1/builds/:buildId/events', {
    preHandler: hmacMiddleware as any
  }, async (
    request: FastifyRequest<{ Params: ProgressParams; Querystring: ProgressQuery }>,
    reply: FastifyReply
  ) => {
    const { buildId } = request.params;
    const { lastEventId, userId } = request.query;

    // Validate userId is provided for security
    if (!userId) {
      return reply.code(400).send({ error: 'userId is required for security' });
    }

    try {
      // Use new clean events system - this is what NextJS team gets
      const cleanEvents = await getCleanEventsSince(buildId, parseInt(lastEventId || '0'), userId);

      // Return clean, structured events with the last event ID for incremental polling
      const lastEvent = cleanEvents.at(-1);
      return {
        buildId,
        events: cleanEvents,
        lastEventId: lastEvent ? parseInt(lastEvent.id) : lastEventId || 0
      };
    } catch (error) {
      console.error('Failed to get clean build events:', error);
      return reply.code(500).send({ error: 'Failed to retrieve build events' });
    }
  });


  // GET /api/builds/:buildId/status - Get build status summary (updated for clean events)
  app.get('/v1/builds/:buildId/status', {
    preHandler: hmacMiddleware as any
  }, async (
    request: FastifyRequest<{ Params: ProgressParams; Querystring: ProgressQuery }>,
    reply: FastifyReply
  ) => {
    const { buildId } = request.params;
    const { userId } = request.query;

    // Validate userId is provided
    if (!userId) {
      return reply.code(400).send({ error: 'userId is required for security' });
    }

    try {
      // Get clean events for this build
      const cleanEvents = await getCleanEventsSince(buildId, 0, userId);

      // Determine current status based on clean events
      let status = 'unknown';
      let progress = 0;
      let previewUrl = null;
      let error = null;
      let currentPhase = null;
      let finished = false;

      for (const event of cleanEvents) {
        // Update progress to the latest value
        if (event.overall_progress !== undefined) {
          progress = Math.round(event.overall_progress * 100); // Convert to percentage
        }

        // Update current phase
        currentPhase = event.phase;

        // Update status based on event type and phase
        if (event.event_type === 'failed') {
          status = 'failed';
          error = event.error_message;
          finished = true;
        } else if (event.finished) {
          status = 'completed';
          previewUrl = event.preview_url;
          finished = true;
        } else {
          // Determine status from phase
          switch (event.phase) {
            case 'setup':
              status = 'starting';
              break;
            case 'development':
              status = 'developing';
              break;
            case 'dependencies':
              status = 'installing';
              break;
            case 'build':
              status = 'building';
              break;
            case 'deploy':
              status = 'deploying';
              break;
          }
        }
      }

      // No fallback needed - clean events are the only source of truth

      return {
        buildId,
        status,
        progress,
        previewUrl,
        error,
        currentPhase,
        finished,
        eventCount: cleanEvents.length,
        lastUpdate: cleanEvents.at(-1)?.created_at ?? null
      };
    } catch (error) {
      console.error('Failed to get build status:', error);
      return reply.code(500).send({ error: 'Failed to retrieve build status' });
    }
  });

  // Note: Internal events endpoint moved to /internal/builds/:buildId/events
  // in src/routes/internalEvents.ts with proper admin JWT authentication.
  // The old /v1/internal/... endpoint has been removed to prevent security gaps.

  // GET /api/webhooks/status - Get webhook delivery statistics
  app.get('/v1/webhooks/status', {
    preHandler: hmacMiddleware as any
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      if (!pool) {
        return { enabled: false, message: 'Database not available' };
      }

      const webhookUrl = process.env.MAIN_APP_WEBHOOK_URL;
      if (!webhookUrl) {
        return { enabled: false, message: 'Webhook URL not configured' };
      }

      // Get failure statistics
      const failureResult = await pool.query(`
        SELECT
          COUNT(*) as total_failures,
          COUNT(*) FILTER (WHERE attempts < 5) as pending_retries,
          COUNT(*) FILTER (WHERE attempts >= 5) as max_retries_reached,
          MAX(created_at) as latest_failure
        FROM webhook_failures
      `);

      // Get recent events count (last 24 hours)
      const eventsResult = await pool.query(`
        SELECT COUNT(*) as recent_events
        FROM project_build_events
        WHERE created_at > NOW() - INTERVAL '24 hours'
      `);

      const stats = failureResult.rows[0];
      const eventCount = eventsResult.rows[0].recent_events;

      return {
        enabled: true,
        webhookUrl,
        stats: {
          totalFailures: parseInt(stats.total_failures),
          pendingRetries: parseInt(stats.pending_retries),
          maxRetriesReached: parseInt(stats.max_retries_reached),
          latestFailure: stats.latest_failure,
          eventsLast24h: parseInt(eventCount)
        }
      };

    } catch (error) {
      console.error('Failed to get webhook status:', error);
      return reply.code(500).send({ error: 'Failed to retrieve webhook status' });
    }
  });

}
