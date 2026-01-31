/**
 * In-House Inbox Routes
 *
 * HTTP endpoints for Easy Mode project inbox (receive email) operations.
 *
 * Routes:
 * - GET    /v1/inhouse/projects/:projectId/inbox/messages - List messages
 * - GET    /v1/inhouse/projects/:projectId/inbox/messages/:messageId - Get message
 * - PATCH  /v1/inhouse/projects/:projectId/inbox/messages/:messageId - Update message (read/archive)
 * - DELETE /v1/inhouse/projects/:projectId/inbox/messages/:messageId - Delete message
 * - GET    /v1/inhouse/projects/:projectId/inbox/threads - List threads
 * - GET    /v1/inhouse/projects/:projectId/inbox/threads/:threadId - Get thread with messages
 * - GET    /v1/inhouse/projects/:projectId/inbox/config - Get inbox config
 * - PATCH  /v1/inhouse/projects/:projectId/inbox/config - Update inbox config
 * - POST   /v1/inhouse/projects/:projectId/inbox/aliases - Create alias
 * - DELETE /v1/inhouse/projects/:projectId/inbox/aliases/:alias - Delete alias
 * - GET    /v1/inhouse/projects/:projectId/inbox/messages/:messageId/attachments/:index - Download attachment
 *
 * Part of easy-mode-email-plan.md (Level 0: SheenApps Inbox)
 */

import { FastifyInstance } from 'fastify';
import { requireHmacSignature } from '../middleware/hmacValidation';
import { assertProjectAccess } from '../utils/projectAuth';
import { getInhouseInboxService } from '../services/inhouse/InhouseInboxService';
import { getInhouseStorageService } from '../services/inhouse/InhouseStorageService';
import { logActivity } from '../services/inhouse/InhouseActivityLogger';

// =============================================================================
// LIMITS (DoS Protection)
// =============================================================================

/**
 * Maximum messages per list request
 */
const MAX_LIST_LIMIT = 100;

/**
 * Maximum alias length
 */
const MAX_ALIAS_LENGTH = 100;

/**
 * Maximum retention days
 */
const MAX_RETENTION_DAYS = 365;

/**
 * Maximum auto-reply message length
 */
const MAX_AUTO_REPLY_LENGTH = 5000;

// =============================================================================
// VALIDATION
// =============================================================================

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate alias format: lowercase alphanumeric with dots, hyphens, underscores
 * Must be at least 2 chars and not start/end with special chars
 */
function validateAlias(alias: string): { valid: boolean; error?: string } {
  if (!alias || typeof alias !== 'string') {
    return { valid: false, error: 'alias is required' };
  }

  if (alias.length < 2 || alias.length > MAX_ALIAS_LENGTH) {
    return { valid: false, error: `alias must be between 2 and ${MAX_ALIAS_LENGTH} characters` };
  }

  // Must match: starts/ends with alphanumeric, middle can have .-_
  if (!/^[a-z0-9][a-z0-9._-]*[a-z0-9]$/.test(alias) && alias.length === 2 && !/^[a-z0-9]{2}$/.test(alias)) {
    return { valid: false, error: 'alias must be lowercase alphanumeric (dots, hyphens, underscores allowed in middle)' };
  }

  // For 2-char aliases, simpler check
  if (alias.length === 2 && !/^[a-z0-9]{2}$/.test(alias)) {
    return { valid: false, error: 'alias must be lowercase alphanumeric' };
  }

  // For longer aliases
  if (alias.length > 2 && !/^[a-z0-9][a-z0-9._-]*[a-z0-9]$/.test(alias)) {
    return { valid: false, error: 'alias must start and end with alphanumeric, middle can contain dots, hyphens, underscores' };
  }

  return { valid: true };
}

function validateEmail(email: string): boolean {
  return typeof email === 'string' && email.length <= 320 && EMAIL_REGEX.test(email);
}

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

interface ListMessagesQuery {
  limit?: string;
  offset?: string;
  threadId?: string;
  unreadOnly?: string;
  userId?: string;
}

interface ListThreadsQuery {
  limit?: string;
  offset?: string;
  unreadOnly?: string;
  userId?: string;
}

interface UpdateMessageBody {
  isRead?: boolean;
  isArchived?: boolean;
  userId?: string;
}

interface UpdateConfigBody {
  autoReplyEnabled?: boolean;
  autoReplyMessage?: string;
  forwardToEmail?: string;
  retentionDays?: number;
  userId?: string;
}

interface CreateAliasBody {
  alias: string;
  userId?: string;
}

// =============================================================================
// ROUTE HANDLERS
// =============================================================================

export async function inhouseInboxRoutes(fastify: FastifyInstance) {
  const hmacMiddleware = requireHmacSignature();

  // ===========================================================================
  // GET /v1/inhouse/projects/:projectId/inbox/messages - List messages
  // ===========================================================================
  fastify.get<{
    Params: { projectId: string };
    Querystring: ListMessagesQuery;
  }>('/v1/inhouse/projects/:projectId/inbox/messages', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId } = request.params;
    const { limit: limitStr, offset: offsetStr, threadId, unreadOnly, userId } = request.query;

    // Authorize project access
    if (userId) {
      await assertProjectAccess(projectId, userId);
    }

    // Parse and validate limit
    let limit = 20;
    if (limitStr) {
      const parsed = parseInt(limitStr, 10);
      if (isNaN(parsed) || parsed < 1 || parsed > MAX_LIST_LIMIT) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: 'INVALID_LIMIT',
            message: `limit must be an integer between 1 and ${MAX_LIST_LIMIT}`,
          },
        });
      }
      limit = parsed;
    }

    // Parse offset
    let offset = 0;
    if (offsetStr) {
      const parsed = parseInt(offsetStr, 10);
      if (isNaN(parsed) || parsed < 0) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: 'INVALID_OFFSET',
            message: 'offset must be a non-negative integer',
          },
        });
      }
      offset = parsed;
    }

    try {
      const inboxService = getInhouseInboxService(projectId);
      const result = await inboxService.listMessages({
        limit,
        offset,
        threadId,
        unreadOnly: unreadOnly === 'true',
      });

      return reply.send({
        ok: true,
        data: result,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return reply.code(500).send({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage,
        },
      });
    }
  });

  // ===========================================================================
  // GET /v1/inhouse/projects/:projectId/inbox/messages/:messageId - Get message
  // ===========================================================================
  fastify.get<{
    Params: { projectId: string; messageId: string };
    Querystring: { userId?: string };
  }>('/v1/inhouse/projects/:projectId/inbox/messages/:messageId', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId, messageId } = request.params;
    const { userId } = request.query;

    // Authorize project access
    if (userId) {
      await assertProjectAccess(projectId, userId);
    }

    try {
      const inboxService = getInhouseInboxService(projectId);
      const message = await inboxService.getMessage(messageId);

      if (!message) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: 'NOT_FOUND',
            message: `Message not found: ${messageId}`,
          },
        });
      }

      return reply.send({
        ok: true,
        data: { message },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return reply.code(500).send({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage,
        },
      });
    }
  });

  // ===========================================================================
  // PATCH /v1/inhouse/projects/:projectId/inbox/messages/:messageId - Update
  // ===========================================================================
  fastify.patch<{
    Params: { projectId: string; messageId: string };
    Body: UpdateMessageBody;
  }>('/v1/inhouse/projects/:projectId/inbox/messages/:messageId', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId, messageId } = request.params;
    const { isRead, isArchived, userId } = request.body;

    // Authorize project access
    if (userId) {
      await assertProjectAccess(projectId, userId);
    }

    // Validate at least one update field
    if (typeof isRead !== 'boolean' && typeof isArchived !== 'boolean') {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'At least one of isRead or isArchived must be provided',
        },
      });
    }

    try {
      const inboxService = getInhouseInboxService(projectId);

      // Handle mark read
      if (typeof isRead === 'boolean') {
        const result = await inboxService.markRead(messageId, isRead);
        if (!result) {
          return reply.code(404).send({
            ok: false,
            error: {
              code: 'NOT_FOUND',
              message: `Message not found: ${messageId}`,
            },
          });
        }
      }

      // Handle archive
      if (typeof isArchived === 'boolean') {
        const result = await inboxService.archiveMessage(messageId, isArchived);
        if (!result) {
          return reply.code(404).send({
            ok: false,
            error: {
              code: 'NOT_FOUND',
              message: `Message not found: ${messageId}`,
            },
          });
        }
      }

      // Log activity
      logActivity({
        projectId,
        service: 'inbox',
        action: 'update_message',
        actorType: 'user',
        actorId: userId,
        resourceType: 'inbox_message',
        resourceId: messageId,
        metadata: {
          isRead,
          isArchived,
        },
      });

      // Get updated message
      const message = await inboxService.getMessage(messageId);

      return reply.send({
        ok: true,
        data: { message },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return reply.code(500).send({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage,
        },
      });
    }
  });

  // ===========================================================================
  // DELETE /v1/inhouse/projects/:projectId/inbox/messages/:messageId - Delete
  // ===========================================================================
  fastify.delete<{
    Params: { projectId: string; messageId: string };
    Querystring: { userId?: string };
  }>('/v1/inhouse/projects/:projectId/inbox/messages/:messageId', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId, messageId } = request.params;
    const { userId } = request.query;

    // Authorize project access
    if (userId) {
      await assertProjectAccess(projectId, userId);
    }

    try {
      const inboxService = getInhouseInboxService(projectId);
      const deleted = await inboxService.deleteMessage(messageId);

      if (!deleted) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: 'NOT_FOUND',
            message: `Message not found: ${messageId}`,
          },
        });
      }

      // Log activity
      logActivity({
        projectId,
        service: 'inbox',
        action: 'delete_message',
        actorType: 'user',
        actorId: userId,
        resourceType: 'inbox_message',
        resourceId: messageId,
      });

      return reply.code(204).send();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return reply.code(500).send({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage,
        },
      });
    }
  });

  // ===========================================================================
  // GET /v1/inhouse/projects/:projectId/inbox/threads - List threads
  // ===========================================================================
  fastify.get<{
    Params: { projectId: string };
    Querystring: ListThreadsQuery;
  }>('/v1/inhouse/projects/:projectId/inbox/threads', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId } = request.params;
    const { limit: limitStr, offset: offsetStr, unreadOnly, userId } = request.query;

    // Authorize project access
    if (userId) {
      await assertProjectAccess(projectId, userId);
    }

    // Parse and validate limit
    let limit = 20;
    if (limitStr) {
      const parsed = parseInt(limitStr, 10);
      if (isNaN(parsed) || parsed < 1 || parsed > MAX_LIST_LIMIT) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: 'INVALID_LIMIT',
            message: `limit must be an integer between 1 and ${MAX_LIST_LIMIT}`,
          },
        });
      }
      limit = parsed;
    }

    // Parse offset
    let offset = 0;
    if (offsetStr) {
      const parsed = parseInt(offsetStr, 10);
      if (isNaN(parsed) || parsed < 0) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: 'INVALID_OFFSET',
            message: 'offset must be a non-negative integer',
          },
        });
      }
      offset = parsed;
    }

    try {
      const inboxService = getInhouseInboxService(projectId);
      const result = await inboxService.listThreads({
        limit,
        offset,
        unreadOnly: unreadOnly === 'true',
      });

      return reply.send({
        ok: true,
        data: result,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return reply.code(500).send({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage,
        },
      });
    }
  });

  // ===========================================================================
  // GET /v1/inhouse/projects/:projectId/inbox/threads/:threadId - Get thread
  // ===========================================================================
  fastify.get<{
    Params: { projectId: string; threadId: string };
    Querystring: { userId?: string };
  }>('/v1/inhouse/projects/:projectId/inbox/threads/:threadId', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId, threadId } = request.params;
    const { userId } = request.query;

    // Authorize project access
    if (userId) {
      await assertProjectAccess(projectId, userId);
    }

    try {
      const inboxService = getInhouseInboxService(projectId);
      const thread = await inboxService.getThread(threadId);

      if (!thread) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: 'NOT_FOUND',
            message: `Thread not found: ${threadId}`,
          },
        });
      }

      return reply.send({
        ok: true,
        data: { thread },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return reply.code(500).send({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage,
        },
      });
    }
  });

  // ===========================================================================
  // GET /v1/inhouse/projects/:projectId/inbox/config - Get inbox config
  // ===========================================================================
  fastify.get<{
    Params: { projectId: string };
    Querystring: { userId?: string };
  }>('/v1/inhouse/projects/:projectId/inbox/config', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId } = request.params;
    const { userId } = request.query;

    // Authorize project access
    if (userId) {
      await assertProjectAccess(projectId, userId);
    }

    try {
      const inboxService = getInhouseInboxService(projectId);
      const config = await inboxService.getConfig();

      if (!config) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Inbox not configured for this project',
          },
        });
      }

      // Get aliases
      const aliases = await inboxService.listAliases();

      return reply.send({
        ok: true,
        data: { config, aliases },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return reply.code(500).send({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage,
        },
      });
    }
  });

  // ===========================================================================
  // PATCH /v1/inhouse/projects/:projectId/inbox/config - Update inbox config
  // ===========================================================================
  fastify.patch<{
    Params: { projectId: string };
    Body: UpdateConfigBody;
  }>('/v1/inhouse/projects/:projectId/inbox/config', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId } = request.params;
    const { autoReplyEnabled, autoReplyMessage, forwardToEmail, retentionDays, userId } = request.body;

    // Authorize project access
    if (userId) {
      await assertProjectAccess(projectId, userId);
    }

    // Validate autoReplyMessage length
    if (autoReplyMessage && autoReplyMessage.length > MAX_AUTO_REPLY_LENGTH) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: `autoReplyMessage exceeds maximum length (${MAX_AUTO_REPLY_LENGTH} chars)`,
        },
      });
    }

    // Validate forwardToEmail
    if (forwardToEmail && !validateEmail(forwardToEmail)) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'forwardToEmail must be a valid email address',
        },
      });
    }

    // Validate retentionDays
    if (retentionDays !== undefined) {
      if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > MAX_RETENTION_DAYS) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: `retentionDays must be an integer between 1 and ${MAX_RETENTION_DAYS}`,
          },
        });
      }
    }

    try {
      const inboxService = getInhouseInboxService(projectId);
      const config = await inboxService.updateConfig({
        autoReplyEnabled,
        autoReplyMessage,
        forwardToEmail,
        retentionDays,
      });

      if (!config) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Inbox not configured for this project',
          },
        });
      }

      // Log activity
      logActivity({
        projectId,
        service: 'inbox',
        action: 'update_config',
        actorType: 'user',
        actorId: userId,
        resourceType: 'inbox_config',
        resourceId: projectId,
        metadata: {
          autoReplyEnabled,
          forwardToEmail,
          retentionDays,
        },
      });

      return reply.send({
        ok: true,
        data: { config },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return reply.code(500).send({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage,
        },
      });
    }
  });

  // ===========================================================================
  // POST /v1/inhouse/projects/:projectId/inbox/aliases - Create alias
  // ===========================================================================
  fastify.post<{
    Params: { projectId: string };
    Body: CreateAliasBody;
  }>('/v1/inhouse/projects/:projectId/inbox/aliases', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId } = request.params;
    const { alias, userId } = request.body;

    // Authorize project access
    if (userId) {
      await assertProjectAccess(projectId, userId);
    }

    // Validate alias
    const aliasValidation = validateAlias(alias);
    if (!aliasValidation.valid) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: aliasValidation.error,
        },
      });
    }

    try {
      const inboxService = getInhouseInboxService(projectId);
      const result = await inboxService.createAlias(alias);

      // Log activity
      logActivity({
        projectId,
        service: 'inbox',
        action: 'create_alias',
        actorType: 'user',
        actorId: userId,
        resourceType: 'inbox_alias',
        resourceId: result.id,
        metadata: {
          alias,
        },
      });

      return reply.code(201).send({
        ok: true,
        data: { alias: result },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Check for specific error codes
      if (errorMessage.includes('RESERVED_ALIAS')) {
        return reply.code(403).send({
          ok: false,
          error: {
            code: 'RESERVED_ALIAS',
            message: errorMessage,
          },
        });
      }

      if (errorMessage.includes('ALIAS_EXISTS')) {
        return reply.code(409).send({
          ok: false,
          error: {
            code: 'ALIAS_EXISTS',
            message: errorMessage,
          },
        });
      }

      if (errorMessage.includes('QUOTA_EXCEEDED')) {
        return reply.code(429).send({
          ok: false,
          error: {
            code: 'QUOTA_EXCEEDED',
            message: errorMessage,
          },
        });
      }

      return reply.code(500).send({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage,
        },
      });
    }
  });

  // ===========================================================================
  // DELETE /v1/inhouse/projects/:projectId/inbox/aliases/:alias - Delete alias
  // ===========================================================================
  fastify.delete<{
    Params: { projectId: string; alias: string };
    Querystring: { userId?: string };
  }>('/v1/inhouse/projects/:projectId/inbox/aliases/:alias', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId, alias } = request.params;
    const { userId } = request.query;

    // Authorize project access
    if (userId) {
      await assertProjectAccess(projectId, userId);
    }

    try {
      const inboxService = getInhouseInboxService(projectId);
      const deleted = await inboxService.deleteAlias(alias);

      if (!deleted) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: 'NOT_FOUND',
            message: `Alias not found: ${alias}`,
          },
        });
      }

      // Log activity
      logActivity({
        projectId,
        service: 'inbox',
        action: 'delete_alias',
        actorType: 'user',
        actorId: userId,
        resourceType: 'inbox_alias',
        resourceId: alias,
      });

      return reply.code(204).send();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return reply.code(500).send({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage,
        },
      });
    }
  });

  // ===========================================================================
  // GET /v1/inhouse/projects/:projectId/inbox/messages/:messageId/attachments/:index
  // ===========================================================================
  fastify.get<{
    Params: { projectId: string; messageId: string; index: string };
    Querystring: { userId?: string };
  }>('/v1/inhouse/projects/:projectId/inbox/messages/:messageId/attachments/:index', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId, messageId, index: indexStr } = request.params;
    const { userId } = request.query;

    if (userId) {
      await assertProjectAccess(projectId, userId);
    }

    const attachmentIndex = parseInt(indexStr, 10);
    if (!Number.isFinite(attachmentIndex) || attachmentIndex < 0) {
      return reply.code(400).send({
        ok: false,
        error: { code: 'INVALID_INDEX', message: 'Invalid attachment index' },
      });
    }

    try {
      const inboxService = getInhouseInboxService(projectId);
      const message = await inboxService.getMessage(messageId);

      if (!message) {
        return reply.code(404).send({
          ok: false,
          error: { code: 'NOT_FOUND', message: 'Message not found' },
        });
      }

      const attachments = (message as any).attachments || [];
      if (attachmentIndex >= attachments.length) {
        return reply.code(404).send({
          ok: false,
          error: { code: 'NOT_FOUND', message: 'Attachment not found' },
        });
      }

      const attachment = attachments[attachmentIndex];
      if (!attachment?.storageKey) {
        return reply.code(404).send({
          ok: false,
          error: { code: 'NOT_STORED', message: 'Attachment file not stored' },
        });
      }

      const storageService = getInhouseStorageService(projectId);
      const url = await storageService.createSignedDownloadUrl(attachment.storageKey);

      logActivity({
        projectId,
        service: 'inbox',
        action: 'download_attachment',
        actorType: 'user',
        actorId: userId || undefined,
        resourceType: 'inbox_message',
        resourceId: messageId,
        metadata: { attachmentIndex, filename: attachment.filename },
      });

      return reply.send({
        ok: true,
        data: {
          url,
          filename: attachment.filename,
          contentType: attachment.contentType,
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return reply.code(500).send({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: errorMessage },
      });
    }
  });
}
