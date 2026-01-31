/**
 * Unified Chat Routes
 * 
 * Provides a seamless chat experience with build mode toggle
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireHmacSignature } from '../middleware/hmacValidation';
import { UnifiedChatService, UnifiedChatRequest } from '../services/unifiedChatService';
import { EnhancedSSEService } from '../services/enhancedSSEService';
import { BuildSSEBridge } from '../services/buildSSEBridge';
import { Readable } from 'stream';
import { SUPPORTED_LOCALES } from '../i18n/localeUtils';
import { unifiedLogger } from '../services/unifiedLogger';
import { pool } from '../services/database';

// =====================================================================
// Schema Definitions
// =====================================================================

const unifiedChatRequestSchema = {
  headers: {
    type: 'object',
    properties: {
      'x-sheen-locale': {
        type: 'string',
        enum: SUPPORTED_LOCALES as any,
        description: 'Preferred locale for chat processing'
      }
    }
  },
  body: {
    type: 'object',
    required: ['userId', 'projectId', 'message'],
    properties: {
      userId: { type: 'string', format: 'uuid' }, // EXPERT FIX Round 18: UUID format validation
      projectId: { type: 'string', format: 'uuid' }, // EXPERT FIX Round 18: UUID format validation
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
        pattern: '^[a-z]{2}(-[A-Z]{2})?$',
        description: 'DEPRECATED: Use x-sheen-locale header instead. Language locale (e.g., en-US, ar-EG, fr-FR)'
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
};

const updatePreferencesSchema = {
  params: {
    type: 'object',
    required: ['projectId'],
    properties: {
      projectId: { type: 'string' }
    }
  },
  body: {
    type: 'object',
    required: ['buildImmediately'],
    properties: {
      buildImmediately: { type: 'boolean' }
    }
  }
};

const convertToBuildSchema = {
  body: {
    type: 'object',
    required: ['projectId', 'userId', 'planSessionId', 'buildPrompt'],
    properties: {
      projectId: { type: 'string' },
      userId: { type: 'string' },
      planSessionId: { type: 'string' },
      buildPrompt: { type: 'string' }
    }
  }
};

// =====================================================================
// Route Registration
// =====================================================================

// EXPERT FIX Round 18: Singleton service to prevent Redis connection leaks
let unifiedChatServiceInstance: UnifiedChatService | null = null;
function getUnifiedChatService(): UnifiedChatService {
  if (!unifiedChatServiceInstance) {
    unifiedChatServiceInstance = new UnifiedChatService();
  }
  return unifiedChatServiceInstance;
}

export function registerUnifiedChatRoutes(fastify: FastifyInstance) {
  const unifiedChatService = getUnifiedChatService();

  // EXPERT FIX Round 18: Centralized project authorization
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

  /**
   * POST /v1/chat/unified
   * Main unified chat endpoint with build mode toggle
   */
  fastify.post<{
    Headers: { 'x-sheen-locale'?: string; [key: string]: any };
    Body: UnifiedChatRequest;
  }>(
    '/v1/chat/unified',
    {
      preHandler: requireHmacSignature() as any,
      schema: unifiedChatRequestSchema
    },
    async (request: FastifyRequest<{
      Headers: { 'x-sheen-locale'?: string; [key: string]: any };
      Body: UnifiedChatRequest;
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
        // EXPERT FIX Round 18: Verify project access before processing
        await assertProjectAccess(request.body.projectId, request.body.userId);

        console.log('[UnifiedChat] Received request:', {
          projectId: request.body.projectId,
          buildImmediately: request.body.buildImmediately,
          locale: requestBody.locale,
          isStreaming
        });

        if (isStreaming) {
          // Set up enhanced SSE headers
          const requestId = request.headers['x-request-id'] as string;
          reply.raw.writeHead(200);
          EnhancedSSEService.setupSSEHeaders(reply, requestId);

          // Set up keep-alive with enhanced interval
          const keepAlive = EnhancedSSEService.setupKeepAlive(reply);

          try {
            // Process the request
            const response = await unifiedChatService.processUnifiedChat(requestBody, request.headers);
            
            // Send message created event with enhanced format
            EnhancedSSEService.sendMessageCreatedEvent(
              reply,
              response.message_seq || 1,
              {
                messageId: response.messageId,
                userId: request.body.userId,
                projectId: request.body.projectId,
                message: request.body.message,
                messageType: 'user',
                mode: 'unified'
              },
              request.body.client_msg_id,
              response.mode === 'build' ? 'build' : 'plan'
            );
            
            // Send response event
            EnhancedSSEService.sendMessageResponseEvent(
              reply,
              (response.message_seq || 1) + 1,
              {
                messageId: response.messageId,
                responseType: response.mode,
                content: response.mode === 'build' ? response.build : response.analysis
              },
              request.body.client_msg_id
            );
            
            // If it's build mode, set up real-time build event streaming
            if (response.mode === 'build' && response.build) {
              const buildBridge = new BuildSSEBridge();
              
              // Send initial build status
              EnhancedSSEService.sendBuildStatusEvent(
                reply,
                (response.message_seq || 1) + 2,
                response.build.buildId,
                response.build.status as 'queued' | 'processing' | 'completed' | 'failed',
                'Build initiated, monitoring progress...',
                undefined,
                request.body.client_msg_id
              );
              
              // Subscribe to real-time build events
              const unsubscribeBuild = buildBridge.subscribeToBuild(
                response.build.buildId,
                reply,
                request.body.userId,
                request.body.client_msg_id,
                (response.message_seq || 1) + 3
              );
              
              // Clean up build subscription when connection closes
              reply.raw.on('close', () => {
                console.log('[UnifiedChat] SSE connection closed, cleaning up build subscription');
                unsubscribeBuild();
                buildBridge.cleanup();
              });
              
              // Don't close the connection immediately in build mode
              // Let the build events control the connection lifecycle
              return;
            }
            
            // Close the stream gracefully
            EnhancedSSEService.closeConnection(reply, keepAlive);
            
          } catch (error) {
            console.error('[UnifiedChat] SSE Error:', error);
            
            // Send enhanced error event
            EnhancedSSEService.sendErrorEvent(
              reply,
              'UNIFIED_CHAT_ERROR',
              error instanceof Error ? error.message : 'An error occurred',
              1,
              request.body.client_msg_id
            );
            
            // Close connection gracefully
            EnhancedSSEService.closeConnection(reply, keepAlive);
          }
          
        } else {
          // Regular JSON response
          const response = await unifiedChatService.processUnifiedChat(requestBody, request.headers);
          
          if (response.accepted) {
            // Check if this is a duplicate request (idempotency)
            const isDuplicate = request.body.client_msg_id && response.message_seq;
            const statusCode = isDuplicate ? 200 : 201;
            
            // Return simplified response matching frontend expectations
            const frontendResponse = {
              message_seq: response.message_seq,
              success: response.success,
              queued: response.queued,
              client_msg_id: response.client_msg_id
            };
            
            return reply.code(statusCode).send(frontendResponse);
          } else {
            return reply.code(400).send({
              error: "Message not accepted",
              details: "Request validation failed or processing error occurred"
            });
          }
        }
        
      } catch (error) {
        console.error('[UnifiedChat] Error:', error);
        
        if (!isStreaming) {
          return reply.code(500).send({
            success: false,
            error: {
              code: 'INTERNAL_ERROR',
              message: error instanceof Error ? error.message : 'An unexpected error occurred'
            }
          });
        }
      }
    }
  );

  /**
   * PUT /v1/projects/:projectId/chat-preferences
   * Update chat preferences for a project
   */
  fastify.put<{ 
    Params: { projectId: string };
    Body: { buildImmediately: boolean };
  }>(
    '/v1/projects/:projectId/chat-preferences',
    {
      preHandler: requireHmacSignature() as any,
      schema: updatePreferencesSchema
    },
    async (request, reply) => {
      try {
        const { projectId } = request.params;
        const { buildImmediately } = request.body;

        console.log('[UnifiedChat] Updating preferences:', {
          projectId,
          buildImmediately
        });

        await unifiedChatService.updateUserChatPreferences(projectId, {
          buildImmediately
        });

        return reply.code(200).send({
          success: true,
          message: 'Preferences updated successfully',
          preferences: {
            buildImmediately
          }
        });
        
      } catch (error) {
        console.error('[UnifiedChat] Error updating preferences:', error);
        
        return reply.code(500).send({
          success: false,
          error: {
            code: 'UPDATE_PREFERENCES_ERROR',
            message: error instanceof Error ? error.message : 'Failed to update preferences'
          }
        });
      }
    }
  );

  /**
   * POST /v1/chat/convert-to-build
   * Convert a plan from unified chat to an actual build
   */
  fastify.post<{ 
    Body: {
      projectId: string;
      userId: string;
      planSessionId: string;
      buildPrompt: string;
    };
  }>(
    '/v1/chat/convert-to-build',
    {
      preHandler: requireHmacSignature() as any,
      schema: convertToBuildSchema
    },
    async (request, reply) => {
      try {
        const { projectId, userId, planSessionId, buildPrompt } = request.body;

        console.log('[UnifiedChat] Converting plan to build:', {
          projectId,
          planSessionId
        });

        const buildResult = await unifiedChatService.convertPlanToBuild(
          projectId,
          userId,
          planSessionId,
          buildPrompt
        );

        return reply.code(200).send({
          success: true,
          buildId: buildResult.buildId,
          versionId: buildResult.versionId,
          status: buildResult.status,
          message: 'Build initiated from plan'
        });
        
      } catch (error) {
        console.error('[UnifiedChat] Error converting to build:', error);
        
        return reply.code(500).send({
          success: false,
          error: {
            code: 'CONVERT_TO_BUILD_ERROR',
            message: error instanceof Error ? error.message : 'Failed to convert plan to build'
          }
        });
      }
    }
  );

  /**
   * GET /v1/projects/:projectId/chat-preferences
   * Get current chat preferences for a project
   */
  fastify.get<{ 
    Params: { projectId: string };
  }>(
    '/v1/projects/:projectId/chat-preferences',
    {
      preHandler: requireHmacSignature() as any,
      schema: {
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
      try {
        const { projectId } = request.params;

        // Create a temporary service instance to get preferences
        const service = new UnifiedChatService();
        const preferences = await (service as any).getUserChatPreferences(projectId);

        return reply.code(200).send({
          success: true,
          preferences
        });
        
      } catch (error) {
        console.error('[UnifiedChat] Error getting preferences:', error);
        
        return reply.code(500).send({
          success: false,
          error: {
            code: 'GET_PREFERENCES_ERROR',
            message: error instanceof Error ? error.message : 'Failed to get preferences'
          }
        });
      }
    }
  );

  // Note: Read status endpoints already exist in persistentChat.ts:
  // - GET /v1/projects/:projectId/chat/read-status
  // - PUT /v1/projects/:projectId/chat/read
  // These routes implement the same defensive max logic and enhanced responses
  // as specified in the Phase 1 implementation requirements.

  console.log('✅ Unified Chat routes registered');
}