/**
 * In-House Email Routes
 *
 * HTTP endpoints for Easy Mode project email operations.
 *
 * Routes:
 * - POST /v1/inhouse/projects/:projectId/email/send - Send an email
 * - GET  /v1/inhouse/projects/:projectId/email - List emails
 * - GET  /v1/inhouse/projects/:projectId/email/:emailId - Get email details
 *
 * Part of EASY_MODE_SDK_PLAN.md
 */

import { FastifyInstance } from 'fastify';
import { requireHmacSignature } from '../middleware/hmacValidation';
import { assertProjectAccess } from '../utils/projectAuth';
import { getInhouseEmailService } from '../services/inhouse/InhouseEmailService';
import { logActivity } from '../services/inhouse/InhouseActivityLogger';

// =============================================================================
// LIMITS (DoS Protection)
// =============================================================================

/**
 * Maximum recipients per email
 */
const MAX_RECIPIENTS = 50;

/**
 * Maximum subject length
 */
const MAX_SUBJECT_LENGTH = 500;

/**
 * Maximum HTML content size (256KB)
 */
const MAX_HTML_SIZE = 256 * 1024;

/**
 * Maximum emails per list request
 */
const MAX_LIST_LIMIT = 100;

// =============================================================================
// VALIDATION
// =============================================================================

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateEmail(email: string): boolean {
  return typeof email === 'string' && email.length <= 254 && EMAIL_REGEX.test(email);
}

function validateRecipients(to: unknown): { valid: boolean; error?: string; normalized?: string[] } {
  if (!to) {
    return { valid: false, error: 'to is required' };
  }

  const recipients: string[] = Array.isArray(to) ? to : [to as string];

  if (recipients.length === 0) {
    return { valid: false, error: 'at least one recipient is required' };
  }

  if (recipients.length > MAX_RECIPIENTS) {
    return { valid: false, error: `maximum ${MAX_RECIPIENTS} recipients per email` };
  }

  for (const email of recipients) {
    if (!validateEmail(email)) {
      return { valid: false, error: `invalid email address: ${email}` };
    }
  }

  return { valid: true, normalized: recipients };
}

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

interface SendEmailBody {
  to: string | string[];
  subject?: string;
  template?: string;
  variables?: Record<string, string | number | boolean>;
  html?: string;
  text?: string;
  from?: string;
  replyTo?: string;
  tags?: Record<string, string>;
  sendAt?: string;
  idempotencyKey?: string;
  userId?: string;
}

interface ListEmailsQuery {
  status?: string;
  limit?: string;
  offset?: string;
  userId?: string;
}

// =============================================================================
// ROUTE HANDLERS
// =============================================================================

export async function inhouseEmailRoutes(fastify: FastifyInstance) {
  const hmacMiddleware = requireHmacSignature();

  // ===========================================================================
  // POST /v1/inhouse/projects/:projectId/email/send - Send an email
  // ===========================================================================
  fastify.post<{
    Params: { projectId: string };
    Body: SendEmailBody;
  }>('/v1/inhouse/projects/:projectId/email/send', {
    preHandler: hmacMiddleware as any,
    bodyLimit: MAX_HTML_SIZE,
  }, async (request, reply) => {
    const { projectId } = request.params;
    const {
      to,
      subject,
      template,
      variables,
      html,
      text,
      from,
      replyTo,
      tags,
      sendAt,
      idempotencyKey,
      userId,
    } = request.body;

    // Authorize project access
    if (userId) {
      await assertProjectAccess(projectId, userId);
    }

    // Validate recipients
    const recipientValidation = validateRecipients(to);
    if (!recipientValidation.valid) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: recipientValidation.error,
        },
      });
    }

    // Validate content - must have template OR (subject + (html or text))
    if (!template && !subject) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'subject is required when not using a template',
        },
      });
    }

    if (!template && !html && !text) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'html or text content is required when not using a template',
        },
      });
    }

    // Validate subject length
    if (subject && subject.length > MAX_SUBJECT_LENGTH) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: `subject exceeds maximum length (${MAX_SUBJECT_LENGTH} chars)`,
        },
      });
    }

    // Reject header injection (CR/LF in subject)
    if (subject && /[\r\n]/.test(subject)) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'subject cannot contain line breaks',
        },
      });
    }

    // Validate sendAt if provided
    if (sendAt) {
      const sendAtDate = new Date(sendAt);
      if (isNaN(sendAtDate.getTime())) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'sendAt must be a valid ISO timestamp',
          },
        });
      }

      // Can't schedule in the past
      if (sendAtDate.getTime() < Date.now()) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'sendAt must be in the future',
          },
        });
      }

      // Maximum 7 days in the future
      const maxFuture = Date.now() + 7 * 24 * 60 * 60 * 1000;
      if (sendAtDate.getTime() > maxFuture) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'sendAt cannot be more than 7 days in the future',
          },
        });
      }
    }

    // Validate from email if provided
    if (from && !validateEmail(from)) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'invalid from email address',
        },
      });
    }

    // Validate replyTo email if provided
    if (replyTo && !validateEmail(replyTo)) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'invalid replyTo email address',
        },
      });
    }

    try {
      const emailService = getInhouseEmailService(projectId);
      const result = await emailService.send({
        to: recipientValidation.normalized!,
        subject,
        template,
        variables,
        html,
        text,
        from,
        replyTo,
        tags,
        sendAt,
        idempotencyKey,
      });

      // Log activity (fire-and-forget)
      logActivity({
        projectId,
        service: 'email',
        action: 'send',
        actorType: 'user',
        actorId: userId,
        resourceType: 'email',
        resourceId: result.id,
        metadata: {
          recipientCount: recipientValidation.normalized!.length,
          template: template || null,
          scheduled: !!sendAt,
        },
      });

      return reply.code(201).send({
        ok: true,
        data: { email: result },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Determine error code
      let errorCode = 'INTERNAL_ERROR';
      if (errorMessage.includes('SUPPRESSED')) {
        errorCode = 'SUPPRESSED';
      } else if (errorMessage.includes('quota exceeded')) {
        errorCode = 'QUOTA_EXCEEDED';
      } else if (errorMessage.includes('not configured')) {
        errorCode = 'SERVICE_UNAVAILABLE';
      }

      // Log error activity
      logActivity({
        projectId,
        service: 'email',
        action: 'send',
        status: 'error',
        actorType: 'user',
        actorId: userId,
        resourceType: 'email',
        errorCode,
        metadata: {
          recipientCount: recipientValidation.normalized?.length || 0,
          template: template || null,
          error: errorMessage,
        },
      });

      // Check for suppression
      if (errorCode === 'SUPPRESSED') {
        return reply.code(403).send({
          ok: false,
          error: {
            code: 'SUPPRESSED',
            message: errorMessage,
          },
        });
      }

      // Check for quota exceeded
      if (errorCode === 'QUOTA_EXCEEDED') {
        return reply.code(429).send({
          ok: false,
          error: {
            code: 'QUOTA_EXCEEDED',
            message: errorMessage,
          },
        });
      }

      // Check for configuration error
      if (errorCode === 'SERVICE_UNAVAILABLE') {
        return reply.code(503).send({
          ok: false,
          error: {
            code: 'SERVICE_UNAVAILABLE',
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
  // GET /v1/inhouse/projects/:projectId/email - List emails
  // ===========================================================================
  fastify.get<{
    Params: { projectId: string };
    Querystring: ListEmailsQuery;
  }>('/v1/inhouse/projects/:projectId/email', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId } = request.params;
    const { status, limit: limitStr, offset: offsetStr, userId } = request.query;

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

    // Validate status if provided
    const validStatuses = ['queued', 'sent', 'delivered', 'bounced', 'failed'];
    if (status && !validStatuses.includes(status)) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'INVALID_STATUS',
          message: `status must be one of: ${validStatuses.join(', ')}`,
        },
      });
    }

    try {
      const emailService = getInhouseEmailService(projectId);
      const result = await emailService.list({ status, limit, offset });

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
  // GET /v1/inhouse/projects/:projectId/email/:emailId - Get email details
  // ===========================================================================
  fastify.get<{
    Params: { projectId: string; emailId: string };
    Querystring: { userId?: string };
  }>('/v1/inhouse/projects/:projectId/email/:emailId', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId, emailId } = request.params;
    const { userId } = request.query;

    // Authorize project access
    if (userId) {
      await assertProjectAccess(projectId, userId);
    }

    try {
      const emailService = getInhouseEmailService(projectId);
      const email = await emailService.get(emailId);

      if (!email) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: 'NOT_FOUND',
            message: `Email not found: ${emailId}`,
          },
        });
      }

      return reply.send({
        ok: true,
        data: { email },
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
}
