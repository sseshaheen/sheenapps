import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireHmacSignature } from '../middleware/hmacValidation';
import { ChatPlanService, SimplifiedChatPlanRequest } from '../services/chatPlanService';
import { WebhookService } from '../services/webhookService';
import { pool } from '../services/database';
import { Readable } from 'stream';
import { ChatStreamProcessor, StreamEvent } from '../services/chatStreamProcessor';
import { SUPPORTED_LOCALES } from '../i18n/localeUtils';
import { unifiedLogger } from '../services/unifiedLogger';
import { getEventStream } from '../services/eventStream';
import { createServerTiming } from '../utils/serverTiming';

// =====================================================================
// Schema Definitions
// =====================================================================

const simplifiedChatPlanRequestSchema = {
  headers: {
    type: 'object',
    properties: {
      'x-sheen-locale': {
        type: 'string',
        // Pattern accepts base locales (en, ar, fr, es, de) and regional variants (ar-eg, fr-ma, etc.)
        // The resolveLocale() function handles mapping regional variants to base locales
        pattern: '^[a-z]{2}(-[a-z]{2})?$',
        description: 'Preferred locale for chat plan processing (e.g., en, ar, ar-eg, fr-ma)'
      },
      'last-event-id': {
        type: 'string',
        description: 'Last event ID for SSE resumption'
      }
    }
  },
  body: {
    type: 'object',
    required: ['userId', 'projectId', 'message'],
    properties: {
      userId: { type: 'string' },
      projectId: { type: 'string' },
      message: { type: 'string', minLength: 1, maxLength: 10000 },
      buildSessionId: {
        type: 'string',
        pattern: '^bs_.+_\\d+_[a-f0-9]{8}$',
        description: 'Build session ID for tracking and SSE resumption'
      },
      locale: {
        type: 'string',
        pattern: '^[a-z]{2}(-[A-Z]{2})?$',
        description: 'DEPRECATED: Use x-sheen-locale header instead. Language locale (e.g., en-US, ar-EG, fr-FR)'
      },
      context: {
        type: 'object',
        properties: {
          includeVersionHistory: { type: 'boolean' },
          includeProjectStructure: { type: 'boolean' },
          includeBuildErrors: { type: 'boolean' }
        }
      }
    }
  }
};

const convertToBuildSchema = {
  body: {
    type: 'object',
    required: ['sessionId', 'planData', 'userId', 'projectId'],
    properties: {
      sessionId: { type: 'string' },
      planData: { type: 'object' },
      userId: { type: 'string' },
      projectId: { type: 'string' }
    }
  }
};

const timelineQuerySchema = {
  querystring: {
    type: 'object',
    properties: {
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      offset: { type: 'integer', minimum: 0, default: 0 },
      mode: { type: 'string', enum: ['all', 'plan', 'build'], default: 'all' },
      includeHidden: { type: 'boolean', default: false }
    }
  }
};

// =====================================================================
// Route Registration
// =====================================================================

export function registerChatPlanRoutes(fastify: FastifyInstance) {
  const webhookService = new WebhookService();
  const chatPlanService = new ChatPlanService(webhookService);

  /**
   * POST /v1/chat-plan
   * Simplified chat endpoint with AI-determined intent
   * Supports both REST and SSE streaming
   */
  fastify.post<{
    Headers: { 'x-sheen-locale'?: string; [key: string]: any };
    Body: SimplifiedChatPlanRequest;
  }>(
    '/v1/chat-plan',
    {
      preHandler: requireHmacSignature() as any,
      schema: simplifiedChatPlanRequestSchema
    },
    async (request: FastifyRequest<{
      Headers: { 'x-sheen-locale'?: string; [key: string]: any };
      Body: SimplifiedChatPlanRequest;
    }>, reply: FastifyReply) => {
      const isStreaming = request.headers.accept === 'text/event-stream';

      // Expert recommendation: Deprecation with user tracking (2-week timeline)
      let requestBody = { ...request.body };
      if (request.body.locale && !request.headers['x-sheen-locale']) {
        const userId = request.body.userId || 'unknown';
        console.warn(`[DEPRECATED] Route ${request.url} using body.locale - User: ${userId} - migrate to x-sheen-locale header`);
        unifiedLogger.system('warning', 'warn', `deprecated_body_locale_usage: ${request.url}`, {
          route: request.url,
          userId,
          bodyLocale: request.body.locale,
          userAgent: request.headers['user-agent'],
          timestamp: new Date().toISOString()
        });
        // Temporary compatibility: keep body locale for now
      } else {
        // Use middleware-resolved locale
        requestBody.locale = request.locale;
      }

      try {
        if (isStreaming) {
          const timing = createServerTiming();
          const eventStream = getEventStream();
          const buildSessionId = requestBody.buildSessionId || `bs_${requestBody.projectId}_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
          const lastEventId = request.headers['last-event-id'] as string | undefined;

          // Set up SSE headers with Server-Timing
          reply.raw.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
            'X-Build-Session-Id': buildSessionId
          });

          // Send connection event first
          reply.raw.write(`event: connection\n`);
          reply.raw.write(`data: ${JSON.stringify({ buildSessionId, connected: true })}\n\n`);

          // Replay missed events if resuming (Last-Event-ID support)
          if (lastEventId) {
            timing.start('replay');
            try {
              const missedEvents = await eventStream.getMissedEvents(buildSessionId, lastEventId);
              for (const event of missedEvents) {
                reply.raw.write(`id: ${event.id}\n`);
                reply.raw.write(`event: ${event.type}\n`);
                reply.raw.write(`data: ${event.data}\n\n`);
              }
              console.log(`[ChatPlan] Replayed ${missedEvents.length} missed events for session ${buildSessionId.slice(0, 20)}`);
            } catch (replayError) {
              console.error('[ChatPlan] Error replaying missed events:', replayError);
            }
            timing.end('replay');
          }

          // Keep connection alive
          const keepAlive = setInterval(() => {
            reply.raw.write(': keepalive\n\n');
          }, 15000);

          // Sequence counter for this stream
          let seq = 0;

          try {
            timing.start('stream');
            // Process with real-time streaming
            await chatPlanService.processChatPlanStream(
              requestBody,
              async (event: StreamEvent) => {
                seq++;
                const eventData = { ...event.data, seq };

                // Store event for potential resumption
                const eventId = await eventStream.storeEvent(buildSessionId, {
                  type: event.event,
                  data: eventData
                });

                // Send SSE event to client with ID for resumption
                reply.raw.write(`id: ${eventId}\n`);
                reply.raw.write(`event: ${event.event}\n`);
                reply.raw.write(`data: ${JSON.stringify(eventData)}\n\n`);
              }
            );
            timing.end('stream');
          } catch (streamError) {
            // Send error event
            const errorEventId = await eventStream.storeEvent(buildSessionId, {
              type: 'error',
              data: {
                code: 'STREAM_ERROR',
                params: {
                  message: streamError instanceof Error ? streamError.message : 'Stream processing failed'
                }
              }
            });
            reply.raw.write(`id: ${errorEventId}\n`);
            reply.raw.write('event: error\n');
            reply.raw.write(`data: ${JSON.stringify({
              code: 'STREAM_ERROR',
              params: {
                message: streamError instanceof Error ? streamError.message : 'Stream processing failed'
              }
            })}\n\n`);
          } finally {
            clearInterval(keepAlive);
            // Add Server-Timing as final comment
            reply.raw.write(`: server-timing: ${timing.getHeaderValue()}\n\n`);
            reply.raw.end();
          }
        } else {
          // Regular REST response
          const response = await chatPlanService.processChatPlan(requestBody);
          return reply.send(response);
        }
      } catch (error) {
        // Enhanced error logging for debugging
        console.error('[Chat Plan] Error processing request:', {
          error: error instanceof Error ? {
            message: error.message,
            stack: error.stack,
            name: error.name
          } : error,
          requestBody: request.body,
          requestId: request.id,
          timestamp: new Date().toISOString()
        });
        
        if (isStreaming && reply.raw.writable) {
          reply.raw.write('event: error\n');
          reply.raw.write(`data: ${JSON.stringify({
            code: 'CHAT_ERROR_GENERAL',
            params: {
              message: error instanceof Error ? error.message : 'Unknown error'
            }
          })}\n\n`);
          reply.raw.end();
        } else if (!isStreaming) {
          const statusCode = (error as any).statusCode || 500;
          if (statusCode === 402 && (error as any).insufficientFundsData) {
            // Return standardized 402 error format
            return reply.status(402).send((error as any).insufficientFundsData);
          }
          return reply.status(statusCode).send({
            type: 'chat_response',
            subtype: 'error',
            error: {
              message: error instanceof Error ? error.message : 'Unknown error',
              code: statusCode === 402 ? 'INSUFFICIENT_BALANCE' : 'INTERNAL_ERROR'
            }
          });
        }
      }
    }
  );

  /**
   * POST /v1/chat-plan/convert-to-build
   * Convert a chat plan session to an actual build
   */
  interface ConvertToBuildBody {
    sessionId: string;
    planData: any;
    userId: string;
    projectId: string;
  }

  fastify.post<{ Body: ConvertToBuildBody }>(
    '/v1/chat-plan/convert-to-build',
    {
      preHandler: requireHmacSignature() as any,
      schema: convertToBuildSchema
    },
    async (request, reply) => {
      try {
        const { sessionId, planData, userId, projectId } = request.body;
        
        const result = await chatPlanService.convertToBuild(
          sessionId,
          planData,
          userId,
          projectId
        );
        
        return reply.send({
          type: 'build_conversion',
          subtype: result.status === 'queue_failed' ? 'partial_success' : 'success',
          buildId: result.buildId,
          versionId: result.versionId,
          jobId: result.jobId,
          status: result.status,
          message: result.status === 'queued' 
            ? 'Plan successfully converted to build and queued for execution'
            : result.status === 'queue_failed'
            ? 'Plan converted but failed to queue for execution'
            : 'Plan successfully converted to build',
          error: result.error
        });
      } catch (error) {
        return reply.status(500).send({
          type: 'build_conversion',
          subtype: 'error',
          error: {
            message: error instanceof Error ? error.message : 'Conversion failed'
          }
        });
      }
    }
  );

  /**
   * GET /v1/project/:projectId/timeline
   * Get unified timeline of chat messages, builds, and deployments
   */
  fastify.get<{ 
    Params: { projectId: string };
    Querystring: { 
      limit?: number; 
      offset?: number; 
      mode?: 'all' | 'plan' | 'build';
      includeHidden?: boolean;
    } 
  }>(
    '/v1/project/:projectId/timeline',
    {
      preHandler: requireHmacSignature() as any,
      schema: {
        ...timelineQuerySchema,
        params: {
          type: 'object',
          required: ['projectId'],
          properties: {
            projectId: { type: 'string' }
          }
        }
      }
    },
    async (request, reply) => {
      const { projectId } = request.params;
      const { limit = 20, offset = 0, mode = 'all', includeHidden = false } = request.query;
      
      try {
        let query = `
          SELECT 
            pcl.id,
            pcl.project_id,
            pcl.user_id,
            pcl.mode,
            pcl.chat_mode,
            pcl.message_text,
            pcl.message_type,
            pcl.session_id,
            pcl.response_data,
            pcl.tokens_used,
            pcl.duration_ms,
            pcl.billable_seconds,
            pcl.locale,
            pcl.language,
            pcl.created_at,
            pcl.timeline_seq,
            u.name as user_name,
            u.avatar_url as user_avatar
          FROM project_chat_log_minimal pcl
          LEFT JOIN users u ON u.id = pcl.user_id
          WHERE pcl.project_id = $1
        `;
        
        const params: any[] = [projectId];
        let paramIndex = 2;
        
        // Apply mode filter
        if (mode !== 'all') {
          query += ` AND pcl.mode = $${paramIndex}`;
          params.push(mode);
          paramIndex++;
        }
        
        // Filter hidden messages
        if (!includeHidden) {
          query += ` AND pcl.is_hidden = false`;
        }
        
        // Order and pagination
        query += ` ORDER BY pcl.timeline_seq DESC, pcl.created_at DESC`;
        query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(limit, offset);
        
        if (!pool) {
          throw new Error('Database connection not available');
        }
        
        const result = await pool.query(query, params);
        
        // Get total count
        let countQuery = `
          SELECT COUNT(*) as total
          FROM project_chat_log_minimal
          WHERE project_id = $1
        `;
        
        const countParams: any[] = [projectId];
        
        if (mode !== 'all') {
          countQuery += ` AND mode = $2`;
          countParams.push(mode);
        }
        
        if (!includeHidden) {
          countQuery += ` AND is_hidden = false`;
        }
        
        if (!pool) {
          throw new Error('Database connection not available');
        }
        
        const countResult = await pool.query(countQuery, countParams);
        const total = parseInt(countResult.rows[0]?.total || '0');
        
        return reply.send({
          type: 'timeline',
          subtype: 'success',
          data: {
            items: result.rows.map((row: any) => ({
              id: row.id,
              type: row.mode === 'plan' ? 'chat' : row.mode,
              chatMode: row.chat_mode,
              message: row.message_text,
              messageType: row.message_type,
              sessionId: row.session_id,
              responseData: row.response_data,
              user: {
                id: row.user_id,
                name: row.user_name,
                avatar: row.user_avatar
              },
              metadata: {
                tokensUsed: row.tokens_used,
                durationMs: row.duration_ms,
                billableSeconds: row.billable_seconds,
                locale: row.locale,
                language: row.language
              },
              timestamp: row.created_at,
              sequenceNumber: row.timeline_seq
            })),
            pagination: {
              total,
              limit,
              offset,
              hasMore: offset + limit < total
            }
          }
        });
      } catch (error) {
        return reply.status(500).send({
          type: 'timeline',
          subtype: 'error',
          error: {
            message: error instanceof Error ? error.message : 'Failed to fetch timeline'
          }
        });
      }
    }
  );

  /**
   * GET /v1/chat-plan/session/:sessionId
   * Get details about a specific chat session
   * COMMENTED OUT: This endpoint exposes sensitive session data and should be admin-only
   */
  /*
  fastify.get<{ Params: { sessionId: string } }>(
    '/v1/chat-plan/session/:sessionId',
    {
      preHandler: requireHmacSignature() as any,
      schema: {
        params: {
          type: 'object',
          required: ['sessionId'],
          properties: {
            sessionId: { type: 'string' }
          }
        }
      }
    },
    async (request, reply) => {
      const { sessionId } = request.params;
      
      try {
        // Get session details
        const sessionQuery = `
          SELECT 
            s.id,
            s.user_id,
            s.project_id,
            s.session_id,
            s.status,
            s.created_at,
            s.updated_at,
            s.total_messages,
            s.total_tokens,
            s.total_duration_ms,
            s.total_billable_seconds,
            s.converted_build_id,
            p.name as project_name,
            u.name as user_name
          FROM chat_plan_sessions s
          LEFT JOIN projects p ON p.project_id = s.project_id
          LEFT JOIN users u ON u.id = s.user_id
          WHERE s.session_id = $1
        `;
        
        if (!pool) {
          throw new Error('Database connection not available');
        }
        
        const sessionResult = await pool.query(sessionQuery, [sessionId]);
        
        if (sessionResult.rows.length === 0) {
          return reply.status(404).send({
            type: 'session_details',
            subtype: 'error',
            error: {
              message: 'Session not found',
              code: 'SESSION_NOT_FOUND'
            }
          });
        }
        
        const session = sessionResult.rows[0];
        
        // Get all messages in session
        const messagesQuery = `
          SELECT 
            id,
            message_text,
            message_type,
            chat_mode,
            response_data,
            tokens_used,
            duration_ms,
            created_at
          FROM project_chat_log_minimal
          WHERE session_id = $1
          ORDER BY created_at ASC
        `;
        
        if (!pool) {
          throw new Error('Database connection not available');
        }
        
        const messagesResult = await pool.query(messagesQuery, [sessionId]);
        
        return reply.send({
          type: 'session_details',
          subtype: 'success',
          data: {
            session: {
              id: session.id,
              sessionId: session.session_id,
              status: session.status,
              createdAt: session.created_at,
              updatedAt: session.updated_at,
              project: {
                id: session.project_id,
                name: session.project_name
              },
              user: {
                id: session.user_id,
                name: session.user_name
              },
              metrics: {
                totalMessages: session.total_messages,
                totalTokens: session.total_tokens,
                totalDurationMs: session.total_duration_ms,
                totalBillableSeconds: session.total_billable_seconds
              },
              convertedBuildId: session.converted_build_id
            },
            messages: messagesResult.rows.map((msg: any) => ({
              id: msg.id,
              type: msg.message_type,
              chatMode: msg.chat_mode,
              content: msg.message_text,
              responseData: msg.response_data,
              tokensUsed: msg.tokens_used,
              durationMs: msg.duration_ms,
              timestamp: msg.created_at
            }))
          }
        });
      } catch (error) {
        return reply.status(500).send({
          type: 'session_details',
          subtype: 'error',
          error: {
            message: error instanceof Error ? error.message : 'Failed to fetch session'
          }
        });
      }
    }
  );
  */
}