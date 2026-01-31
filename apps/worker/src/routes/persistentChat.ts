/**
 * Persistent Chat Routes
 * 
 * Enhanced endpoints for sequence-based pagination, idempotency, and real-time capabilities
 * Implements the persistent chat MVP with advisor network future-proofing
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireHmacSignature } from '../middleware/hmacValidation';
import { EnhancedChatService, ChatHistoryRequest, SendMessageRequest, ReadReceiptRequest } from '../services/enhancedChatService';
import { getPresenceService } from '../services/presenceService';
import { getSSEConnectionManager } from '../services/sseConnectionManager';
import { UnifiedChatService, UnifiedChatRequest } from '../services/unifiedChatService';
import { ChatBroadcastService, type SSEChatEvent } from '../services/chatBroadcastService';
import { chatQueue } from '../queue/modularQueues';
import { pool } from '../services/database';
import { Readable } from 'stream';
import { SUPPORTED_LOCALES, resolveLocaleWithChain } from '../i18n/localeUtils';

// =====================================================================
// Helper Functions
// =====================================================================

function getContextualErrorMessage(reason?: string): string {
  switch (reason) {
    case 'all_typing':
      return 'All your chat connections are actively typing. Please finish your messages in other tabs before opening a new connection.';
    case 'eviction_failed':
      return 'Unable to disconnect older chat connections. Please manually close other chat tabs and try again.';
    case 'eviction_in_progress':
      return 'Disconnecting an older chat connection. Please retry in a few seconds.';
    case 'eviction_success':
      return 'Successfully connected! An older chat connection was automatically closed.';
    default:
      return 'Chat connection limit reached. Please close other chat tabs to continue.';
  }
}

// =====================================================================
// Schema Definitions
// =====================================================================

const chatHistoryQuerySchema = {
  querystring: {
    type: 'object',
    properties: {
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 }, // EXPERT FIX Round 17: Use integer to prevent fractional values
      before_seq: { type: 'integer', minimum: 1 }, // EXPERT FIX Round 17: Use integer for sequence numbers
      after_seq: { type: 'integer', minimum: 1 }, // EXPERT FIX Round 17: Use integer for sequence numbers
      includeSystem: { type: 'boolean', default: false },
      actor_types: { // EXPERT FIX Round 17: Use snake_case to match DB/API convention
        type: 'array',
        items: { type: 'string', enum: ['client', 'assistant', 'advisor'] }
      },
      mode: { type: 'string', enum: ['all', 'plan', 'build', 'unified'], default: 'all' } // EXPERT FIX Round 18: Include 'unified' mode
    }
  },
  params: {
    type: 'object',
    required: ['projectId'],
    properties: {
      projectId: { type: 'string', format: 'uuid' }
    }
  },
  headers: {
    type: 'object',
    required: ['x-user-id'],
    properties: {
      'x-user-id': { type: 'string', format: 'uuid' },
      'x-sheen-locale': { type: 'string', pattern: '^[a-z]{2}(-[a-zA-Z]{2,4})?$' } // EXPERT FIX Round 16: Accept lowercase regions (en-us) and script codes (zh-Hant)
    }
  }
};

const sendMessageSchema = {
  body: {
    type: 'object',
    required: ['text', 'client_msg_id', 'mode'],
    properties: {
      text: { type: 'string', minLength: 1, maxLength: 10000 },
      client_msg_id: { type: 'string', format: 'uuid' },
      mode: { type: 'string', enum: ['plan', 'build', 'unified'] },
      actor_type: { type: 'string', enum: ['client', 'assistant', 'advisor'], default: 'client' },
      locale: { type: 'string', pattern: '^[a-z]{2}(-[a-zA-Z]{2,4})?$' }, // EXPERT FIX Round 16: Accept lowercase regions and script codes
      thread: {
        type: 'object',
        properties: {
          parentId: { type: 'string', format: 'uuid' }
        }
      }
    }
  },
  params: {
    type: 'object',
    required: ['projectId'],
    properties: {
      projectId: { type: 'string', format: 'uuid' }
    }
  },
  headers: {
    type: 'object',
    required: ['x-user-id'],
    properties: {
      'x-user-id': { type: 'string', format: 'uuid' },
      'x-sheen-locale': { type: 'string', pattern: '^[a-z]{2}(-[a-zA-Z]{2,4})?$' } // EXPERT FIX Round 16: Accept lowercase regions (en-us) and script codes (zh-Hant)
    }
  }
};

const markReadSchema = {
  body: {
    type: 'object',
    required: ['up_to_seq'],
    properties: {
      up_to_seq: { type: 'integer', minimum: 1 } // EXPERT FIX Round 17: Use integer for sequence numbers
    }
  },
  params: {
    type: 'object',
    required: ['projectId'],
    properties: {
      projectId: { type: 'string', format: 'uuid' }
    }
  },
  headers: {
    type: 'object',
    required: ['x-user-id'],
    properties: {
      'x-user-id': { type: 'string', format: 'uuid' },
      'x-sheen-locale': { type: 'string', pattern: '^[a-z]{2}(-[a-zA-Z]{2,4})?$' } // EXPERT FIX Round 16: Accept lowercase regions (en-us) and script codes (zh-Hant)
    }
  }
};

const presenceUpdateSchema = {
  body: {
    type: 'object',
    properties: {
      is_typing: { type: 'boolean', default: false },
      user_agent: { type: 'string' },
      metadata: { type: 'object' }
    }
  },
  params: {
    type: 'object',
    required: ['projectId'],
    properties: {
      projectId: { type: 'string', format: 'uuid' }
    }
  },
  headers: {
    type: 'object',
    required: ['x-user-id', 'x-user-type'],
    properties: {
      'x-user-id': { type: 'string', format: 'uuid' },
      'x-user-type': { type: 'string', enum: ['client', 'assistant', 'advisor'] },
      'x-sheen-locale': { type: 'string', pattern: '^[a-z]{2}(-[a-zA-Z]{2,4})?$' } // EXPERT FIX Round 16: Accept lowercase regions (en-us) and script codes (zh-Hant)
    }
  }
};

const searchQuerySchema = {
  querystring: {
    type: 'object',
    required: ['q'],
    properties: {
      q: { type: 'string', minLength: 1, maxLength: 500 },
      from_seq: { type: 'integer', minimum: 0 }, // EXPERT FIX Round 17: Use integer; allow 0 for "from beginning"
      to_seq: { type: 'integer', minimum: 1 }, // EXPERT FIX Round 17: Use integer for sequence numbers
      actor_types: { 
        type: 'array', 
        items: { type: 'string', enum: ['client', 'assistant', 'advisor'] }
      },
      mode: { type: 'string', enum: ['plan', 'build', 'unified'] },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 } // EXPERT FIX Round 17: Use integer to prevent fractional values
    }
  },
  params: {
    type: 'object',
    required: ['projectId'],
    properties: {
      projectId: { type: 'string', format: 'uuid' }
    }
  },
  headers: {
    type: 'object',
    required: ['x-user-id'],
    properties: {
      'x-user-id': { type: 'string', format: 'uuid' },
      'x-sheen-locale': { type: 'string', pattern: '^[a-z]{2}(-[a-zA-Z]{2,4})?$' } // EXPERT FIX Round 16: Accept lowercase regions (en-us) and script codes (zh-Hant)
    }
  }
};

// =====================================================================
// Route Handler Interfaces
// =====================================================================

interface ChatHistoryParams {
  projectId: string;
}

interface ChatHistoryQuery extends ChatHistoryRequest {}

interface SendMessageParams {
  projectId: string;
}

interface SendMessageBody extends SendMessageRequest {}

interface MarkReadParams {
  projectId: string;
}

interface PresenceParams {
  projectId: string;
}

interface SearchParams {
  projectId: string;
}

interface SearchQuery {
  q: string;
  from_seq?: number;
  to_seq?: number;
  actor_types?: string[];
  mode?: string;
  limit?: number;
}

// =====================================================================
// Route Handlers
// =====================================================================

export default async function persistentChatRoutes(fastify: FastifyInstance) {
  const chatService = new EnhancedChatService();
  const presenceService = getPresenceService(); // EXPERT FIX Round 16: Use singleton pattern to avoid multiple Redis connections

  // =====================================================================
  // EXPERT FIX Round 18: Centralized Project Authorization
  // =====================================================================

  /**
   * Assert that user has access to project (owner or collaborator).
   * Throws 403 if unauthorized.
   */
  async function assertProjectAccess(projectId: string, userId: string): Promise<void> {
    if (!pool) {
      throw new Error('Database connection not available');
    }

    const { rows } = await pool.query(
      `SELECT 1 FROM projects p
       WHERE p.id = $1
         AND (p.owner_id = $2 OR EXISTS (
           SELECT 1 FROM project_collaborators pc
           WHERE pc.project_id = p.id
             AND pc.user_id = $2
         ))`,
      [projectId, userId]
    );

    if (rows.length === 0) {
      const error: any = new Error('Unauthorized project access');
      error.statusCode = 403;
      error.code = 'UNAUTHORIZED_PROJECT_ACCESS';
      throw error;
    }
  }

  // =====================================================================
  // Chat History Endpoints
  // =====================================================================

  /**
   * GET /v1/projects/:projectId/chat/messages
   * Enhanced chat history with sequence-based pagination
   */
  fastify.get<{
    Params: ChatHistoryParams;
    Querystring: ChatHistoryQuery;
    Headers: { 'x-user-id': string; 'x-sheen-locale'?: string };
  }>('/v1/projects/:projectId/chat/messages', {
    schema: chatHistoryQuerySchema,
    preHandler: requireHmacSignature() as any
  }, async (request, reply) => {
    try {
      const { projectId } = request.params;
      const userId = request.headers['x-user-id'];
      const options = request.query;

      // EXPERT FIX Round 18: Verify project access before read
      await assertProjectAccess(projectId, userId);

      console.log('[PersistentChat] Fetching chat history:', {
        projectId,
        userId,
        options
      });

      const result = await chatService.getChatHistory(projectId, userId, options);

      reply.code(200).send(result);

    } catch (error) {
      console.error('[PersistentChat] Error fetching chat history:', error);
      
      const statusCode = (error as any).statusCode || 500;
      reply.code(statusCode).send({
        error: 'Failed to fetch chat history',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * POST /v1/projects/:projectId/chat/messages
   * Send message with idempotency support
   */
  fastify.post<{
    Params: SendMessageParams;
    Body: SendMessageBody;
    Headers: { 'x-user-id': string; 'x-sheen-locale'?: string };
  }>('/v1/projects/:projectId/chat/messages', {
    schema: sendMessageSchema,
    preHandler: requireHmacSignature() as any
  }, async (request, reply) => {
    try {
      const { projectId } = request.params;
      const userId = request.headers['x-user-id'];
      const message = request.body;

      // EXPERT FIX Round 18: Verify project access before write
      await assertProjectAccess(projectId, userId);

      // EXPERT FIX: Extract locale from body (preferred) or header (fallback)
      const rawLocale = message.locale || request.headers['x-sheen-locale'];
      // EXPERT FIX Round 12: Normalize locale at ingestion to prevent mixed data (ar-EG vs ar)
      // EXPERT FIX Round 17: Enforce SUPPORTED_LOCALES to prevent storing invalid locales like "xx"
      const resolvedLocale = rawLocale ? resolveLocaleWithChain(rawLocale).base : undefined;
      const locale = resolvedLocale && SUPPORTED_LOCALES.includes(resolvedLocale as any) ? resolvedLocale : undefined;

      console.log('[PersistentChat] Sending message:', {
        projectId,
        userId,
        client_msg_id: message.client_msg_id,
        mode: message.mode,
        locale
      });

      // Update session locale if provided (already normalized)
      if (locale) {
        await chatService.updateSessionLocale(projectId, userId, locale);
      }

      // EXPERT FIX Round 17: Force actor_type='client' to prevent impersonation
      // Client cannot claim to be 'advisor' or 'assistant' - enforce server-side
      const normalizedMessage = {
        ...message,
        actor_type: 'client' as const, // Cast to literal type for TypeScript
        ...(locale ? { locale } : {})
      };
      const result = await chatService.sendMessage(projectId, userId, normalizedMessage);

      // ✅ Enqueue message for processing (only if not duplicate)
      // CRITICAL: Only enqueue client messages (actor_type === 'client')
      if (chatQueue && !result.duplicateOf && normalizedMessage.actor_type === 'client') {
        try {
          // Detect intent from message (TODO: Frontend should send this explicitly)
          const intent = message.text.startsWith('Apply recommendation:') ? 'apply_recommendation' : undefined;
          const isRecommendation = !!intent;

          await chatQueue.add(
            'process-message',
            {
              projectId,
              userId,
              messageId: result.id,
              client_msg_id: message.client_msg_id,
              mode: message.mode,
              text: message.text,
              ...(locale && { locale }),
              intent, // Structured intent for deterministic build triggering
              recommendation_id: (message as any).recommendation_id, // If frontend provides it
              recommendation_payload: (message as any).recommendation_payload, // If frontend provides it
              ...((message as any).thread?.parentId && {
                sessionContext: {
                  previousMode: message.mode,
                  sessionId: result.id
                }
              })
            },
            {
              jobId: `msg-${result.id}`,  // Idempotency: prevents duplicate queuing
              // 🚨 CRITICAL FIX (Expert Round 8): BullMQ lower number = higher priority!
              priority: isRecommendation ? 1 : 5 // Recommendations get priority 1 (high), normal messages get 5 (lower)
            }
          );

          console.log('[PersistentChat] Message enqueued for processing:', {
            messageId: result.id,
            client_msg_id: message.client_msg_id,
            jobId: `msg-${result.id}`,
            priority: isRecommendation ? 1 : 5,
            intent
          });
        } catch (queueError) {
          // Don't fail the request if queue is down - log and continue
          console.error('[PersistentChat] Failed to enqueue message:', queueError);
        }
      }

      const statusCode = result.duplicateOf ? 200 : 201;
      reply.code(statusCode).send(result);

    } catch (error) {
      console.error('[PersistentChat] Error sending message:', error);
      
      const statusCode = (error as any).statusCode || 500;
      reply.code(statusCode).send({
        error: 'Failed to send message',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // =====================================================================
  // Unified Chat Integration
  // =====================================================================

  /**
   * POST /unified
   * Unified chat endpoint that delegates to UnifiedChatService
   * This provides the frontend-expected path: /api/persistent-chat/unified
   */
  fastify.post<{
    Body: UnifiedChatRequest;
    Headers: { 'x-user-id': string };
  }>(
    '/unified',
    {
      preHandler: requireHmacSignature() as any,
      schema: {
        headers: {
          type: 'object',
          required: ['x-user-id'],
          properties: {
            'x-user-id': { type: 'string', format: 'uuid' }
          }
        },
        body: {
          type: 'object',
          required: ['userId', 'projectId', 'message'],
          properties: {
            userId: { type: 'string' },
            projectId: { type: 'string' },
            message: { type: 'string', minLength: 1, maxLength: 10000 },
            buildImmediately: {
              type: 'boolean',
              description: 'Whether to build immediately or just analyze (plan mode). Defaults to user preference if not provided'
            },
            client_msg_id: {
              type: 'string',
              description: 'Optional UUID for idempotency. Recommended for preventing duplicate messages on retry'
            },
            locale: {
              type: 'string',
              pattern: '^[a-z]{2}(-[a-zA-Z]{2,4})?$',
              description: 'Language locale (e.g., en-US, en-us, ar-EG, zh-Hant)'
            },
            sessionContext: {
              type: 'object',
              properties: {
                previousMode: { type: 'string', enum: ['plan', 'build'] },
                sessionId: { type: 'string' }
              }
            }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        // EXPERT FIX Round 15: Cross-check userId from body against signed header
        const headerUserId = request.headers['x-user-id'];
        if (headerUserId && headerUserId !== request.body.userId) {
          return reply.code(403).send({
            accepted: false,
            success: false,
            queued: false,
            error: {
              code: 'USER_MISMATCH',
              message: 'Invalid user identity'
            }
          });
        }

        const unifiedChatService = new UnifiedChatService();
        const response = await unifiedChatService.processUnifiedChat(request.body, request.headers);

        if (response.accepted) {
          // EXPERT FIX: Use explicit isDuplicate flag from service
          const statusCode = response.isDuplicate ? 200 : 201;
          
          // Return the full response for frontend consumption
          return reply.code(statusCode).send(response);
        } else {
          return reply.code(400).send(response);
        }
      } catch (error) {
        console.error('[PersistentChat] Unified chat error:', error);
        
        return reply.code(500).send({
          accepted: false,
          success: false,
          mode: 'plan',
          sessionId: '',
          messageId: '',
          timestamp: new Date().toISOString(),
          actions: [],
          preferences: { buildImmediately: true },
          error: {
            code: 'UNIFIED_CHAT_ERROR',
            message: error instanceof Error ? error.message : 'An unexpected error occurred'
          }
        });
      }
    }
  );

  // =====================================================================
  // Real-time Subscription Endpoints
  // =====================================================================

  /**
   * GET /v1/projects/:projectId/chat/stream
   * SSE streaming with Last-Event-ID support
   */
  fastify.get<{
    Params: ChatHistoryParams;
    Querystring: { from_seq?: number; client_instance_id?: string };
    Headers: { 'x-user-id': string; 'last-event-id'?: string; 'x-sheen-locale'?: string };
  }>('/v1/projects/:projectId/chat/stream', {
    schema: {
      params: chatHistoryQuerySchema.params,
      querystring: {
        type: 'object',
        properties: {
          from_seq: { type: 'integer', minimum: 0 }, // EXPERT FIX Round 17: Use integer; allow 0 for "from beginning"
          client_instance_id: { type: 'string', format: 'uuid' } // NEW: For leader-tab pattern
        }
      },
      headers: {
        type: 'object',
        required: ['x-user-id'],
        properties: {
          'x-user-id': { type: 'string', format: 'uuid' },
          'last-event-id': { type: 'string' },
          'x-sheen-locale': { type: 'string', pattern: '^[a-z]{2}(-[a-zA-Z]{2,4})?$' }, // EXPERT FIX Round 16: Accept lowercase regions and script codes
          'x-tab-id': { type: 'string' } // For frontend tab identification
        }
      }
    },
    preHandler: requireHmacSignature() as any
  }, async (request, reply) => {
    try {
      const { projectId } = request.params;
      const userId = request.headers['x-user-id'];
      const fromSeq = request.query.from_seq || 0;
      const clientInstanceId = request.query.client_instance_id; // NEW: For leader-tab pattern

      // Handle Last-Event-ID for reconnection with NaN safety (expert recommendation)
      // EXPERT FIX: Always use radix 10 for parseInt
      const lastEventId = request.headers['last-event-id'];
      const parsedLastEventId = lastEventId ? parseInt(lastEventId, 10) : NaN;
      const resumeFromSeq = Number.isFinite(parsedLastEventId) ? parsedLastEventId : (fromSeq || 0);

      console.log('[PersistentChat] SSE stream request:', {
        projectId,
        userId,
        clientInstanceId: clientInstanceId?.substring(0, 8),
        fromSeq: resumeFromSeq
      });

      const connectionManager = getSSEConnectionManager();

      // NEW: Use atomic Lua script if client_instance_id is provided (leader-tab pattern)
      if (clientInstanceId) {
        // Atomic connection registration with graceful eviction
        const { connectionId, evicted } = await connectionManager.registerConnectionAtomic(
          userId,
          projectId,
          clientInstanceId,
          {
            userAgent: request.headers['user-agent'],
            tabId: request.headers['x-tab-id'] as string
          }
        );

        // Send graceful close to evicted connections
        for (const evictedId of evicted) {
          await connectionManager.sendGracefulClose(evictedId, 'replaced');
        }

        if (evicted.length > 0) {
          console.log('[PersistentChat] Evicted old connections:', {
            userId,
            projectId,
            evictedCount: evicted.length,
            evicted: evicted.map(id => id.substring(0, 8)),
            new: connectionId.substring(0, 8)
          });
        }

        console.log('[PersistentChat] Starting SSE stream (atomic):', {
          projectId,
          userId,
          connectionId: connectionId.substring(0, 8),
          clientInstanceId: clientInstanceId.substring(0, 8),
          fromSeq: resumeFromSeq
        });

        await handleChatStream(projectId, userId, resumeFromSeq, reply, connectionId, clientInstanceId);
        return;
      }

      // LEGACY: Fallback for clients without client_instance_id
      console.log('[PersistentChat] Legacy connection (no client_instance_id)');
      const limitCheck = await connectionManager.checkConnectionLimitWithEviction(userId, projectId, {
        userAgent: request.headers['user-agent'],
        tabId: request.headers['x-tab-id'] as string
      });

      if (!limitCheck.allowed) {
        if (limitCheck.reason === 'eviction_in_progress') {
          // Expert advice: Block briefly for eviction instead of returning 202
          console.log('[PersistentChat] Eviction in progress, blocking for 3 seconds...');
          await new Promise(resolve => setTimeout(resolve, 3000));

          // Retry the limit check after eviction grace period
          const retryCheck = await connectionManager.checkConnectionLimitWithEviction(userId, projectId, {
            userAgent: request.headers['user-agent'],
            tabId: request.headers['x-tab-id'] as string
          });

          if (retryCheck.allowed) {
            // Eviction succeeded, proceed with connection
            console.log('[PersistentChat] Eviction successful, proceeding with connection:', {
              userId,
              projectId,
              connectionId: retryCheck.connectionId?.substring(0, 8),
              evicted: limitCheck.evicted?.[0]?.substring(0, 8)
            });
            await handleChatStream(projectId, userId, resumeFromSeq, reply, retryCheck.connectionId!);
            return;
          }
        }

        // Eviction failed or hard limit reached - return 429
        console.warn('[PersistentChat] SSE connection limit exceeded:', {
          userId,
          projectId,
          reason: limitCheck.reason,
          currentCount: limitCheck.currentCount,
          maxAllowed: limitCheck.maxAllowed
        });

        const errorResponse = {
          error: 'CONNECTION_LIMIT_REACHED',
          reason: limitCheck.reason,
          message: getContextualErrorMessage(limitCheck.reason),
          current_connections: limitCheck.currentCount,
          max_connections: limitCheck.maxAllowed,
          retry_after_ms: limitCheck.retryAfterMs || 5000,
          suggestions: limitCheck.suggestions || ['Close other chat tabs', 'Wait and retry'],
          evicted_connection_id: limitCheck.evicted,
          timestamp: new Date().toISOString()
        };

        // Never return 202 to EventSource - always 429 with Retry-After
        return reply
          .code(429)
          .header('Retry-After', '5')
          .header('X-SSE-Connection-Limit', limitCheck.maxAllowed.toString())
          .header('X-SSE-Current-Connections', limitCheck.currentCount.toString())
          .header('X-SSE-Limit-Reason', limitCheck.reason || 'unknown')
          .send(errorResponse);
      }

      // Log successful eviction
      if (limitCheck.reason === 'eviction_success' && limitCheck.evicted?.length) {
        console.log('[PersistentChat] Connection eviction successful:', {
          userId,
          projectId,
          evicted: limitCheck.evicted.map(id => id.substring(0, 8)),
          new: limitCheck.connectionId?.substring(0, 8)
        });
      }

      console.log('[PersistentChat] Starting SSE stream (legacy):', {
        projectId,
        userId,
        connectionId: limitCheck.connectionId?.substring(0, 8),
        fromSeq: resumeFromSeq,
        currentConnections: limitCheck.currentCount
      });

      await handleChatStream(projectId, userId, resumeFromSeq, reply, limitCheck.connectionId!);

    } catch (error) {
      console.error('[PersistentChat] Error in SSE stream:', error);
      reply.code(500).send({
        error: 'Failed to start chat stream',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // =====================================================================
  // Session Management Endpoints
  // =====================================================================

  /**
   * GET /v1/projects/:projectId/chat/session
   * Get or create active session
   */
  fastify.get<{
    Params: { projectId: string };
    Headers: { 'x-user-id': string; 'x-sheen-locale'?: string };
  }>('/v1/projects/:projectId/chat/session', {
    schema: {
      params: {
        type: 'object',
        required: ['projectId'],
        properties: {
          projectId: { type: 'string', format: 'uuid' }
        }
      },
      headers: {
        type: 'object',
        required: ['x-user-id'],
        properties: {
          'x-user-id': { type: 'string', format: 'uuid' },
          'x-sheen-locale': { type: 'string', pattern: '^[a-z]{2}(-[a-zA-Z]{2,4})?$' } // EXPERT FIX Round 16: Accept lowercase regions (en-us) and script codes (zh-Hant)
        }
      }
    },
    preHandler: requireHmacSignature() as any
  }, async (request, reply) => {
    try {
      const { projectId } = request.params;
      const userId = request.headers['x-user-id'];

      // EXPERT FIX Round 18: Verify project access before session creation
      await assertProjectAccess(projectId, userId);

      // EXPERT FIX: Use header for locale (request.locale is not standard)
      const rawLocale = request.headers['x-sheen-locale'];
      // EXPERT FIX Round 12: Normalize locale at ingestion to prevent mixed data
      // EXPERT FIX Round 17: Enforce SUPPORTED_LOCALES to prevent storing invalid locales like "xx"
      const resolvedLocale = rawLocale ? resolveLocaleWithChain(rawLocale).base : undefined;
      const locale = resolvedLocale && SUPPORTED_LOCALES.includes(resolvedLocale as any) ? resolvedLocale : undefined;

      const session = await chatService.getOrCreateSession(projectId, userId, locale);
      
      reply.code(200).send(session);

    } catch (error) {
      console.error('[PersistentChat] Error managing session:', error);
      reply.code(500).send({
        error: 'Failed to manage session',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // =====================================================================
  // Read Receipts Endpoints
  // =====================================================================

  /**
   * PUT /v1/projects/:projectId/chat/read
   * Mark messages as read up to sequence number
   */
  fastify.put<{
    Params: MarkReadParams;
    Body: ReadReceiptRequest;
    Headers: { 'x-user-id': string; 'x-sheen-locale'?: string };
  }>('/v1/projects/:projectId/chat/read', {
    schema: markReadSchema,
    preHandler: requireHmacSignature() as any
  }, async (request, reply) => {
    try {
      const { projectId } = request.params;
      const userId = request.headers['x-user-id'];
      const readRequest = request.body;

      // EXPERT FIX Round 18: Verify project access before marking read
      await assertProjectAccess(projectId, userId);

      await chatService.markAsRead(projectId, userId, readRequest);

      reply.code(204).send();

    } catch (error) {
      console.error('[PersistentChat] Error marking as read:', error);
      reply.code(500).send({
        error: 'Failed to mark as read',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * GET /v1/projects/:projectId/chat/unread
   * Get unread message count
   */
  fastify.get<{
    Params: { projectId: string };
    Headers: { 'x-user-id': string; 'x-sheen-locale'?: string };
  }>('/v1/projects/:projectId/chat/unread', {
    schema: {
      params: {
        type: 'object',
        required: ['projectId'],
        properties: {
          projectId: { type: 'string', format: 'uuid' }
        }
      },
      headers: {
        type: 'object',
        required: ['x-user-id'],
        properties: {
          'x-user-id': { type: 'string', format: 'uuid' },
          'x-sheen-locale': { type: 'string', pattern: '^[a-z]{2}(-[a-zA-Z]{2,4})?$' } // EXPERT FIX Round 16: Accept lowercase regions (en-us) and script codes (zh-Hant)
        }
      }
    },
    preHandler: requireHmacSignature() as any
  }, async (request, reply) => {
    try {
      const { projectId } = request.params;
      const userId = request.headers['x-user-id'];

      // EXPERT FIX Round 18: Verify project access before reading unread count
      await assertProjectAccess(projectId, userId);

      const result = await chatService.getUnreadCount(projectId, userId);

      reply.code(200).send(result);

    } catch (error) {
      console.error('[PersistentChat] Error getting unread count:', error);
      reply.code(500).send({
        error: 'Failed to get unread count',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // =====================================================================
  // Presence Management Endpoints
  // =====================================================================

  /**
   * POST /v1/projects/:projectId/chat/presence
   * Update user presence (heartbeat)
   */
  fastify.post<{
    Params: PresenceParams;
    Body: { is_typing?: boolean; user_agent?: string; metadata?: any };
    Headers: { 'x-user-id': string; 'x-user-type': string; 'x-sheen-locale'?: string };
  }>('/v1/projects/:projectId/chat/presence', {
    schema: presenceUpdateSchema,
    preHandler: requireHmacSignature() as any
  }, async (request, reply) => {
    try {
      const { projectId } = request.params;
      const userId = request.headers['x-user-id'];

      // EXPERT FIX Round 18: Verify project access before presence update
      await assertProjectAccess(projectId, userId);

      // EXPERT FIX Round 18: Force userType='client' to prevent spoofing
      // Public clients cannot claim to be 'assistant' or 'advisor'
      const userType = 'client' as const;
      const { is_typing = false, user_agent, metadata = {} } = request.body;

      // Update presence
      await presenceService.updatePresence(projectId, userId, userType, {
        userAgent: user_agent,
        other: metadata
      });

      // Handle typing indicator if specified
      if (typeof is_typing === 'boolean') {
        await presenceService.setTyping(projectId, userId, userType, is_typing);
      }

      reply.code(204).send();

    } catch (error) {
      console.error('[PersistentChat] Error updating presence:', error);
      reply.code(500).send({
        error: 'Failed to update presence',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  /**
   * GET /v1/projects/:projectId/chat/presence
   * Get active users in project
   */
  fastify.get<{
    Params: PresenceParams;
    Headers: { 'x-user-id': string; 'x-sheen-locale'?: string };
  }>('/v1/projects/:projectId/chat/presence', {
    schema: {
      params: {
        type: 'object',
        required: ['projectId'],
        properties: {
          projectId: { type: 'string', format: 'uuid' }
        }
      },
      headers: {
        type: 'object',
        required: ['x-user-id'],
        properties: {
          'x-user-id': { type: 'string', format: 'uuid' },
          'x-sheen-locale': { type: 'string', pattern: '^[a-z]{2}(-[a-zA-Z]{2,4})?$' } // EXPERT FIX Round 16: Accept lowercase regions (en-us) and script codes (zh-Hant)
        }
      }
    },
    preHandler: requireHmacSignature() as any
  }, async (request, reply) => {
    try {
      const { projectId } = request.params;
      const userId = request.headers['x-user-id'];

      // EXPERT FIX Round 18: Verify project access before reading presence
      await assertProjectAccess(projectId, userId);

      const activeUsers = await presenceService.getActiveUsers(projectId);

      reply.code(200).send({
        active_users: activeUsers,
        count: activeUsers.length
      });

    } catch (error) {
      console.error('[PersistentChat] Error getting presence:', error);
      reply.code(500).send({
        error: 'Failed to get presence',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // =====================================================================
  // Search Endpoints
  // =====================================================================

  /**
   * GET /v1/projects/:projectId/chat/search
   * Search messages using PostgreSQL FTS
   */
  fastify.get<{
    Params: SearchParams;
    Querystring: SearchQuery;
    Headers: { 'x-user-id': string; 'x-sheen-locale'?: string };
  }>('/v1/projects/:projectId/chat/search', {
    schema: searchQuerySchema,
    preHandler: requireHmacSignature() as any
  }, async (request, reply) => {
    try {
      const { projectId } = request.params;
      const userId = request.headers['x-user-id'];

      // EXPERT FIX Round 18: Verify project access before search
      await assertProjectAccess(projectId, userId);

      const { q, from_seq, to_seq, actor_types, mode, limit } = request.query;

      console.log('[PersistentChat] Searching messages:', {
        projectId,
        userId,
        query: q,
        options: { from_seq, to_seq, actor_types, mode, limit }
      });

      const results = await chatService.searchMessages(projectId, userId, q, {
        from_seq,
        to_seq,
        actor_types,
        mode,
        limit
      });

      reply.code(200).send({
        results,
        count: results.length,
        query: q
      });

    } catch (error) {
      console.error('[PersistentChat] Error searching messages:', error);
      reply.code(500).send({
        error: 'Failed to search messages',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // =====================================================================
  // Debug/Monitoring Endpoints (Development/Internal Use)
  // =====================================================================

  /**
   * GET /v1/debug/sse-connections/:projectId
   * Get SSE connection information for debugging (internal use)
   */
  fastify.get<{
    Params: { projectId: string };
    Headers: { 'x-user-id': string };
  }>('/v1/debug/sse-connections/:projectId', {
    schema: {
      params: {
        type: 'object',
        required: ['projectId'],
        properties: {
          projectId: { type: 'string', format: 'uuid' }
        }
      },
      headers: {
        type: 'object',
        required: ['x-user-id'],
        properties: {
          'x-user-id': { type: 'string', format: 'uuid' }
        }
      }
    },
    preHandler: requireHmacSignature() as any
  }, async (request, reply) => {
    try {
      // EXPERT FIX Round 12: Guard debug endpoint from production exposure
      if (process.env.NODE_ENV === 'production') {
        return reply.code(404).send({ error: 'Not found' });
      }

      const { projectId } = request.params;
      const userId = request.headers['x-user-id'];

      const connectionManager = getSSEConnectionManager();

      // EXPERT FIX: Get connection info from BOTH atomic and legacy systems
      const [legacyConnections, legacyCount, atomicConnections, atomicCount] = await Promise.all([
        connectionManager.getActiveConnections(userId, projectId),
        connectionManager.getConnectionCount(userId, projectId),
        connectionManager.getActiveConnectionsAtomic(userId, projectId),
        connectionManager.getConnectionCountAtomic(userId, projectId)
      ]);

      // Get connection manager health
      const health = await connectionManager.healthCheck();

      reply.code(200).send({
        user_id: userId,
        project_id: projectId,
        // EXPERT FIX: Report both systems separately
        legacy_system: {
          connections: legacyConnections,
          connection_count: legacyCount,
          max_connections: connectionManager.getMaxConnections()
        },
        atomic_system: {
          connections: atomicConnections,
          connection_count: atomicCount,
          max_connections: connectionManager.getMaxConnectionsAtomic()
        },
        connection_manager_health: health,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('[PersistentChat] Error getting SSE connection debug info:', error);
      reply.code(500).send({
        error: 'Failed to get connection info',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  console.log('✅ Persistent Chat routes with SSE connection limits registered');
}

// =====================================================================
// SSE Stream Handler
// =====================================================================

async function handleChatStream(
  projectId: string,
  userId: string,
  fromSeq: number,
  reply: FastifyReply,
  connectionId: string,
  clientInstanceId?: string // NEW: For atomic cleanup with leader-tab pattern
): Promise<void> {
  const connectionManager = getSSEConnectionManager();

  // 1) Auth check BEFORE headers
  if (!pool) {
    throw new Error('Database connection not available');
  }
  
  const { rows } = await pool.query(
    `SELECT 1 FROM projects p 
     WHERE p.id = $1 
       AND (p.owner_id = $2 OR EXISTS (
         SELECT 1 FROM project_collaborators pc 
         WHERE pc.project_id = p.id 
           AND pc.user_id = $2
       ))`,
    [projectId, userId]
  );
  
  if (rows.length === 0) {
    return reply.code(403).send({ error: 'UNAUTHORIZED_PROJECT_ACCESS' });
  }

  // 2) Prepare Redis subscriber BEFORE headers
  // EXPERT FIX: Subscribe to BOTH chat channel AND close channel
  const subscriber = ChatBroadcastService.getSubscriber(connectionId);
  const chatChannel = `chat:${projectId}`;
  const closeChannel = `sse:${connectionId}`; // For server_close/force_disconnect events
  await subscriber.subscribe(chatChannel, closeChannel);

  console.log('[PersistentChat] Subscribed to Redis channels:', {
    projectId,
    userId,
    chatChannel,
    closeChannel,
    connectionId: connectionId.substring(0, 8)
  });

  // 3) Now start SSE
  // EXPERT FIX Round 12: Hijack reply to prevent Fastify from managing/closing the response
  // This prevents "reply already sent" errors and random disconnects under load
  reply.hijack();
  reply.raw.setHeader('Content-Type', 'text/event-stream');
  reply.raw.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  reply.raw.setHeader('Connection', 'keep-alive');
  reply.raw.setHeader('Content-Encoding', 'identity');
  reply.raw.setHeader('X-Accel-Buffering', 'no');
  reply.raw.setHeader('X-SSE-Connection-ID', connectionId.substring(0, 8));
  reply.raw.setTimeout?.(0);
  reply.raw.flushHeaders?.();
  reply.raw.write('retry: 5000\n\n');

  // EXPERT FIX Round 17: Declare write queue BEFORE heartbeat interval to avoid temporal dead zone
  // Multiple concurrent writers (subscriber, replay, heartbeat) can corrupt SSE frames
  let cleaned = false; // Declare cleaned first since writeSafe needs it
  let writeChain = Promise.resolve();

  const writeSafe = async (chunk: string): Promise<boolean> => {
    if (cleaned) return false;
    const ok = reply.raw.write(chunk);
    if (!ok) {
      await new Promise<void>((resolve) => {
        let timer: ReturnType<typeof setTimeout> | null = null;
        const onDone = () => {
          if (timer) clearTimeout(timer); // EXPERT FIX Round 15: Clear timeout on success
          reply.raw.off('drain', onDone);
          reply.raw.off('close', onDone);
          reply.raw.off('error', onDone);
          resolve();
        };
        reply.raw.once('drain', onDone);
        reply.raw.once('close', onDone);
        reply.raw.once('error', onDone);
        timer = setTimeout(onDone, 2000); // "never hang" fuse
      });
    }
    return !cleaned;
  };

  // EXPERT FIX Round 15: Single-writer queue prevents SSE frame corruption
  const enqueueWrite = (chunk: string) => {
    writeChain = writeChain.then(async () => {
      await writeSafe(chunk);
    }).catch(() => {
      // Swallow: connection may be closing
    });
    return writeChain;
  };

  // 4) Heartbeat and cleanup (now safe to use enqueueWrite)
  // EXPERT FIX: Use atomic heartbeat for atomic connections
  const stopHeartbeat = clientInstanceId
    ? connectionManager.startHeartbeatAtomic(connectionId, userId, projectId, clientInstanceId)
    : connectionManager.startHeartbeat(connectionId, userId, projectId);
  // EXPERT FIX Round 15: Use write queue for heartbeats to prevent interleaving
  const sseHeartbeat = setInterval(() => { void enqueueWrite(': keep-alive\n\n'); }, 25_000);

  const enhancedCleanup = async () => {
    if (cleaned) return;
    cleaned = true;
    clearInterval(sseHeartbeat);
    stopHeartbeat();
    try {
      await subscriber.unsubscribe(chatChannel, closeChannel);
      // EXPERT FIX: Remove all listeners to prevent memory leaks
      subscriber.removeAllListeners();
      await ChatBroadcastService.removeSubscriber(connectionId);
    } catch (e) {
      console.error('[PersistentChat] Redis cleanup error:', e);
    }
    // Use atomic cleanup if clientInstanceId is available
    if (clientInstanceId) {
      await connectionManager.removeConnectionAtomic(connectionId, userId, projectId, clientInstanceId);
    } else {
      await connectionManager.removeConnection(connectionId, userId, projectId);
    }
    console.log('[PersistentChat] SSE connection cleanup completed', {
      projectId,
      userId,
      connectionId: connectionId.substring(0, 8),
      clientInstanceId: clientInstanceId?.substring(0, 8)
    });
  };

  // 5) Handlers (now safe to reference enhancedCleanup)
  // EXPERT FIX: Handle close channel events (server_close, force_disconnect)
  subscriber.on('message', async (channel, msg) => {
    if (cleaned) return;

    try {
      const event = JSON.parse(msg);

      // Handle close channel events - gracefully close the stream
      if (channel === closeChannel) {
        if (event.event === 'server_close' || event.event === 'force_disconnect') {
          console.log('[PersistentChat] Received close event:', {
            event: event.event,
            connectionId: connectionId.substring(0, 8),
            reason: event.data?.reason
          });
          // EXPERT FIX Round 15: Use write queue to prevent interleaving
          await enqueueWrite(`event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`);
          await enhancedCleanup();
          reply.raw.end();
          return;
        }
      }

      // Normal chat events - EXPERT FIX: Use write queue for backpressure + serialization
      // EXPERT FIX: Only emit id: when numeric to prevent Last-Event-ID corruption
      const isNumericId = typeof event.id === 'string' && /^[0-9]+$/.test(event.id)
      const sse = `${isNumericId ? `id: ${event.id}\n` : ''}event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
      await enqueueWrite(sse);
    } catch (e) {
      console.error('[PersistentChat] parse error:', e);
    }
  });
  subscriber.on('error', async (e) => { console.error('[PersistentChat] sub error:', e); await enhancedCleanup(); });
  subscriber.on('end', async () => { console.log('[PersistentChat] sub end'); await enhancedCleanup(); });
  reply.raw.on('close', async () => { await enhancedCleanup(); });
  reply.raw.on('error', async (e) => { console.error('[PersistentChat] socket error:', e); await enhancedCleanup(); });

  // 6) Connection established + optional replay
  // EXPERT FIX Round 15: Use write queue for connection.established to prevent interleaving
  // EXPERT FIX: Omit id for connection.established to avoid confusing Last-Event-ID semantics
  void enqueueWrite(`event: connection.established\ndata: ${JSON.stringify({
    projectId,
    from_seq: fromSeq,
    connection_id: connectionId.substring(0, 8),
    timestamp: new Date().toISOString()
  })}\n\n`);

  // Message history replay for clients reconnecting with Last-Event-ID
  if (fromSeq > 0) {
      try {
        const REPLAY_LIMIT = 200; // Cap replay to prevent overwhelming client
        const chatService = new EnhancedChatService();
        const historyRequest: ChatHistoryRequest = {
          after_seq: fromSeq, 
          limit: REPLAY_LIMIT + 1 // Get one extra to check if more exist
        };
        const missedMessages = await chatService.getChatHistory(projectId, userId, historyRequest);
        
        const actualMessages = missedMessages.messages.slice(0, REPLAY_LIMIT);
        const hasMoreMessages = missedMessages.messages.length > REPLAY_LIMIT;
        
        console.log('[PersistentChat] Replaying missed messages:', {
          projectId,
          userId,
          fromSeq,
          totalFound: missedMessages.messages.length,
          replaying: actualMessages.length,
          hasMore: hasMoreMessages,
          connectionId: connectionId.substring(0, 8)
        });
        
        // EXPERT FIX Round 15: Replay with write queue + single-chunk events to prevent interleaving
        for (const msg of actualMessages) {
          if (cleaned) break; // Stop if connection was cleaned up

          const replayEvent: SSEChatEvent = {
            id: msg.seq.toString(), // Numeric ID for Last-Event-ID
            event: 'message.replay',
            data: {
              seq: msg.seq,
              messageId: msg.id,
              client_msg_id: msg.client_msg_id,
              projectId,
              userId: msg.user.id,
              content: {
                text: msg.message.text,
                type: msg.message.type,
                mode: msg.message.mode,
                actor_type: msg.user.type
              },
              timestamp: msg.message.timestamp,
              metadata: {
                build_id: msg.build?.id,
                response_data: null // Not available in this format
              }
            }
          };

          // EXPERT FIX Round 15: Write whole event in one chunk to prevent frame corruption
          const sse = `id: ${replayEvent.id}\nevent: ${replayEvent.event}\ndata: ${JSON.stringify(replayEvent.data)}\n\n`;
          await enqueueWrite(sse);
        }

        // If more messages exist, send tail marker for UX
        if (hasMoreMessages && !cleaned) {
          const tailEvent = {
            event: 'replay.end',
            data: {
              message: 'More messages available via HTTP history API',
              lastReplayedSeq: actualMessages[actualMessages.length - 1]?.seq,
              projectId,
              totalAvailable: missedMessages.messages.length
            }
          };

          // EXPERT FIX Round 15: Write whole event in one chunk
          await enqueueWrite(`event: ${tailEvent.event}\ndata: ${JSON.stringify(tailEvent.data)}\n\n`);
        }
        
      } catch (replayError) {
        console.error('[PersistentChat] Error during message replay:', replayError);
        // Non-fatal: continue with live subscription
      }
    }
}

// EXPERT FIX Round 16: Removed console.log at module level (runs on import, not registration)