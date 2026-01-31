/**
 * Build Stream Route
 *
 * SSE endpoint for real-time code generation streaming.
 * Provides file content updates as they're generated.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireHmacSignature } from '../middleware/hmacValidation';
import { subscribeToEvents, getCleanEventsSince } from '../services/eventService';
import { EnhancedSSEService } from '../services/enhancedSSEService';
import { UserBuildEvent } from '../types/cleanEvents';
import { assertProjectAccessByBuild } from '../utils/projectAccess';

// ============================================================================
// Types
// ============================================================================

interface BuildStreamParams {
  buildId: string;
}

interface BuildStreamQuery {
  userId: string;
  lastEventId?: string;
}

interface FileContentEvent {
  type: 'file_start' | 'file_chunk' | 'file_complete';
  path: string;
  content?: string;
  language?: string;
  cursor?: { line: number; column: number };
}

interface BuildProgressEvent {
  type: 'build_start' | 'build_progress' | 'build_complete' | 'build_failed';
  phase?: string;
  progress?: number;
  message?: string;
  previewUrl?: string;
  error?: string;
}

// ============================================================================
// SSE Event Formatting
// ============================================================================

function formatSSEEvent(
  eventId: number,
  eventType: string,
  data: any
): string {
  const event = JSON.stringify({
    id: eventId,
    type: eventType,
    timestamp: new Date().toISOString(),
    ...data
  });
  return `id: ${eventId}\nevent: ${eventType}\ndata: ${event}\n\n`;
}

// ============================================================================
// Routes
// ============================================================================

export async function buildStreamRoutes(fastify: FastifyInstance) {
  const hmacMiddleware = requireHmacSignature();

  /**
   * GET /api/v1/builds/:buildId/stream
   *
   * SSE endpoint for real-time build streaming.
   * Streams file content updates and build progress events.
   *
   * Events emitted:
   * - file_start: New file being generated
   * - file_chunk: Content chunk for current file
   * - file_complete: File generation finished
   * - build_progress: Overall build progress update
   * - build_complete: Build finished successfully
   * - build_failed: Build failed with error
   */
  fastify.get<{
    Params: BuildStreamParams;
    Querystring: BuildStreamQuery;
  }>('/api/v1/builds/:buildId/stream', {
    preHandler: hmacMiddleware as any,
    schema: {
      params: {
        type: 'object',
        properties: {
          buildId: { type: 'string' }
        },
        required: ['buildId']
      },
      querystring: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          lastEventId: { type: 'string' }
        },
        required: ['userId']
      }
    }
  }, async (
    request: FastifyRequest<{
      Params: BuildStreamParams;
      Querystring: BuildStreamQuery;
    }>,
    reply: FastifyReply
  ) => {
    const { buildId } = request.params;
    const { userId, lastEventId } = request.query;

    // Validate required parameters
    if (!userId) {
      return reply.code(400).send({
        error: 'Missing required parameter: userId',
        code: 'MISSING_USER_ID'
      });
    }

    // Verify user has access to this build's project
    try {
      await assertProjectAccessByBuild(buildId, userId);
    } catch (error: any) {
      if (error.statusCode === 403) {
        return reply.code(403).send({
          error: 'Unauthorized',
          message: 'You do not have access to this build',
          code: error.code || 'UNAUTHORIZED_PROJECT_ACCESS'
        });
      }
      throw error;
    }

    console.log(`[BuildStream] Starting SSE stream for build: ${buildId}, user: ${userId}`);

    // Set up SSE headers
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('X-Accel-Buffering', 'no'); // Nginx compatibility
    reply.raw.setHeader('Access-Control-Allow-Origin', '*');

    // Track event sequence
    let eventSeq = parseInt(lastEventId || '0') + 1;
    let isConnectionOpen = true;

    // Send initial connection event
    const connectionEvent = formatSSEEvent(eventSeq++, 'connection', {
      status: 'connected',
      buildId,
      message: 'Connected to build stream'
    });
    reply.raw.write(connectionEvent);

    // Send any missed events if lastEventId was provided
    if (lastEventId) {
      try {
        const missedEvents = await getCleanEventsSince(
          buildId,
          parseInt(lastEventId),
          userId
        );

        for (const event of missedEvents) {
          if (!isConnectionOpen) break;

          const sseEvent = formatBuildEvent(eventSeq++, event);
          reply.raw.write(sseEvent);
        }
      } catch (error) {
        console.error('[BuildStream] Error fetching missed events:', error);
      }
    }

    // Subscribe to real-time events
    const unsubscribe = subscribeToEvents(buildId, (event: any) => {
      if (!isConnectionOpen) return;

      try {
        // Handle different event types
        if (event.type?.startsWith('file_')) {
          // File-related events
          const fileEvent = formatSSEEvent(eventSeq++, event.type, {
            path: event.data?.path,
            content: event.data?.content,
            language: event.data?.language,
            cursor: event.data?.cursor
          });
          reply.raw.write(fileEvent);
        } else if (event.event_type) {
          // Clean build events
          const sseEvent = formatBuildEvent(eventSeq++, event as UserBuildEvent);
          reply.raw.write(sseEvent);
        } else {
          // Generic event passthrough
          const genericEvent = formatSSEEvent(eventSeq++, event.type || 'update', event.data || event);
          reply.raw.write(genericEvent);
        }
      } catch (error) {
        console.error('[BuildStream] Error writing event:', error);
      }
    });

    // Keep-alive ping every 30 seconds
    const keepAliveInterval = setInterval(() => {
      if (!isConnectionOpen) {
        clearInterval(keepAliveInterval);
        return;
      }

      try {
        reply.raw.write(': keep-alive\n\n');
      } catch (error) {
        // Connection closed
        isConnectionOpen = false;
        clearInterval(keepAliveInterval);
        unsubscribe();
      }
    }, 30000);

    // Handle client disconnect
    request.raw.on('close', () => {
      console.log(`[BuildStream] Client disconnected from build: ${buildId}`);
      isConnectionOpen = false;
      clearInterval(keepAliveInterval);
      unsubscribe();
    });

    request.raw.on('error', (error) => {
      console.error(`[BuildStream] Connection error for build ${buildId}:`, error);
      isConnectionOpen = false;
      clearInterval(keepAliveInterval);
      unsubscribe();
    });

    // Don't close the response - SSE keeps it open
    // The response will be closed when the client disconnects or build completes
  });
}

/**
 * Format a clean build event for SSE
 */
function formatBuildEvent(eventId: number, event: UserBuildEvent): string {
  const eventType = mapEventType(event);

  const data: any = {
    id: eventId,
    type: eventType,
    buildId: event.build_id,
    phase: event.phase,
    progress: event.overall_progress ? Math.round(event.overall_progress * 100) : undefined,
    title: event.title,
    description: event.description,
    timestamp: event.created_at
  };

  // Add phase-specific data
  if (event.finished) {
    data.finished = true;
    data.previewUrl = event.preview_url;
  }

  if (event.error_message) {
    data.error = event.error_message;
  }

  return `id: ${eventId}\nevent: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Map clean event type to SSE event type
 */
function mapEventType(event: UserBuildEvent): string {
  if (event.event_type === 'failed') {
    return 'build_failed';
  }

  if (event.finished) {
    return 'build_complete';
  }

  if (event.event_type === 'started') {
    return 'build_start';
  }

  if (event.event_type === 'progress') {
    return 'build_progress';
  }

  // Default mapping based on phase
  return `build_${event.phase || 'progress'}`;
}
