/**
 * In-House Inbox Webhook Route
 *
 * Handles inbound email webhooks from Resend.
 * Pattern: verify signature → enqueue → return 200 fast
 *
 * Resend inbound email webhook format:
 * https://resend.com/docs/api-reference/webhooks
 *
 * Part of easy-mode-email-plan.md (Level 0: SheenApps Inbox)
 */

import { createHmac, timingSafeEqual } from 'crypto';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { inboxWebhookQueue, InboxWebhookJobData, requireQueue } from '../queue/modularQueues';
import { resolveProjectFromRecipientDetailed } from '../services/inhouse/InhouseInboxService';

// =============================================================================
// CONFIGURATION
// =============================================================================

const RESEND_WEBHOOK_SECRET = process.env.RESEND_INBOUND_WEBHOOK_SECRET;

/**
 * Maximum attachment size (in bytes) to include content in job data.
 * Larger attachments will have metadata only (content stripped to prevent Redis bloat).
 * 256KB is a reasonable limit for base64-encoded content in job payloads.
 */
const MAX_ATTACHMENT_BYTES_FOR_QUEUE = 256 * 1024;

// =============================================================================
// SIGNATURE VERIFICATION
// =============================================================================

/**
 * Verify Resend webhook signature using HMAC-SHA256.
 * Resend uses Svix for webhooks with signature in `svix-signature` header.
 *
 * Svix signature format: v1,<base64_signature>
 * Signed payload format: <svix-id>.<svix-timestamp>.<body>
 * Reference: https://docs.svix.com/receiving/verifying-payloads/how
 */
function verifyResendSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  timestampHeader: string | undefined,
  messageIdHeader: string | undefined
): boolean {
  // Fail closed in production if secret not configured
  if (!RESEND_WEBHOOK_SECRET) {
    const isProd = process.env.NODE_ENV === 'production';
    if (isProd) {
      console.error('[InboxWebhook] RESEND_INBOUND_WEBHOOK_SECRET not configured in production');
      return false;
    }
    console.warn('[InboxWebhook] RESEND_INBOUND_WEBHOOK_SECRET not configured (dev mode)');
    return false;
  }

  if (!signatureHeader || !timestampHeader || !messageIdHeader) {
    console.error('[InboxWebhook] Missing required Svix headers');
    return false;
  }

  try {
    // 1. Check timestamp freshness FIRST (cheap early reject before crypto)
    const timestamp = parseInt(timestampHeader, 10);
    if (!Number.isFinite(timestamp)) {
      console.error('[InboxWebhook] Invalid timestamp format');
      return false;
    }

    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > 300) {
      // Don't log specifics to avoid side-channel info leakage
      console.error('[InboxWebhook] Webhook verification failed');
      return false;
    }

    // 2. Compute signature
    // Svix signed payload format: <svix-id>.<svix-timestamp>.<body>
    const signedPayload = `${messageIdHeader}.${timestampHeader}.${rawBody.toString('utf8')}`;

    // Extract signatures from header (may contain multiple: "v1,<sig1> v1,<sig2>")
    const signatureParts = signatureHeader.split(' ').map(s => s.trim()).filter(Boolean);

    for (const versionedSignature of signatureParts) {
      const [version, sigB64] = versionedSignature.split(',');
      if (version !== 'v1' || !sigB64) continue;

      // Compute expected signature
      const expectedBuffer = createHmac('sha256', RESEND_WEBHOOK_SECRET)
        .update(signedPayload)
        .digest(); // raw bytes

      // Decode provided signature
      const providedBuffer = Buffer.from(sigB64, 'base64');

      // Timing-safe comparison (must check length first)
      if (providedBuffer.length === expectedBuffer.length &&
          timingSafeEqual(providedBuffer, expectedBuffer)) {
        return true;
      }
    }

    console.error('[InboxWebhook] Webhook verification failed');
    return false;
  } catch (error) {
    console.error('[InboxWebhook] Signature verification error:', error);
    return false;
  }
}

// =============================================================================
// TYPES
// =============================================================================

interface ResendInboundEmailPayload {
  type: 'email.received';
  created_at: string;
  data: {
    email_id: string;
    from: string;
    to: string[];
    subject?: string;
    text?: string;
    html?: string;
    raw?: string;
    headers?: Record<string, string>;
    attachments?: Array<{
      filename: string;
      content_type: string;
      size: number;
      content_id?: string;
      content?: string; // Base64 encoded
    }>;
  };
}

// =============================================================================
// ROUTE HANDLERS
// =============================================================================

export async function inhouseInboxWebhookRoutes(fastify: FastifyInstance) {
  // Add custom content parser for raw body (required for webhook signature verification)
  fastify.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    try {
      // Store raw body for signature verification
      (req as any).rawBody = body;
      const json = JSON.parse(body.toString());
      done(null, json);
    } catch (error) {
      done(error as Error, undefined);
    }
  });

  // ===========================================================================
  // POST /webhooks/resend/inbound - Receive inbound emails from Resend
  // ===========================================================================
  fastify.post<{
    Body: ResendInboundEmailPayload;
  }>('/webhooks/resend/inbound', async (request: FastifyRequest<{ Body: ResendInboundEmailPayload }>, reply: FastifyReply) => {
    const startTime = Date.now();

    // Get raw body for signature verification
    const rawBody = (request as any).rawBody as Buffer;
    if (!rawBody) {
      console.error('[InboxWebhook] No raw body available');
      return reply.code(400).send({ error: 'No body' });
    }

    // Verify signature (Resend uses Svix)
    const signatureHeader = request.headers['svix-signature'] as string | undefined;
    const timestampHeader = request.headers['svix-timestamp'] as string | undefined;
    const messageIdHeader = request.headers['svix-id'] as string | undefined;

    if (!verifyResendSignature(rawBody, signatureHeader, timestampHeader, messageIdHeader)) {
      console.error('[InboxWebhook] Invalid signature');
      return reply.code(401).send({ error: 'Invalid signature' });
    }

    // Parse the payload
    const payload = request.body;

    // Only handle email.received events
    if (payload.type !== 'email.received') {
      // Acknowledge but ignore other event types
      return reply.code(200).send({ received: true, ignored: true });
    }

    const emailData = payload.data;

    // Get the first recipient (to address)
    const toEmail = emailData.to?.[0];
    if (!toEmail) {
      console.error('[InboxWebhook] No recipient in webhook payload');
      return reply.code(400).send({ error: 'No recipient' });
    }

    // Resolve which project this email belongs to
    let projectId: string | null = null;
    let resolutionReason: string = 'unknown';
    try {
      const resolution = await resolveProjectFromRecipientDetailed(toEmail);
      projectId = resolution.projectId;
      resolutionReason = resolution.reason;
    } catch (error) {
      console.error('[InboxWebhook] Error resolving project:', error);
    }

    if (!projectId) {
      console.warn(`[InboxWebhook] No project for ${toEmail}: ${resolutionReason}`);
      // Still return 200 to prevent Resend from retrying
      return reply.code(200).send({ received: true, dropped: true, reason: resolutionReason });
    }

    // Parse headers for threading info
    const headers = emailData.headers || {};
    const messageId = headers['message-id'] || headers['Message-ID'];
    const inReplyTo = headers['in-reply-to'] || headers['In-Reply-To'];
    const referencesHeader = headers['references'] || headers['References'];
    const references = referencesHeader ? referencesHeader.split(/\s+/).filter(Boolean) : undefined;

    // Parse from address (could be "Name <email>" format)
    let fromEmail = emailData.from;
    let fromName: string | undefined;
    const fromMatch = emailData.from.match(/^(.+?)\s*<([^>]+)>$/);
    if (fromMatch && fromMatch[1] && fromMatch[2]) {
      fromName = fromMatch[1].trim().replace(/^["']|["']$/g, '');
      fromEmail = fromMatch[2];
    }

    // Build job data
    const jobData: InboxWebhookJobData = {
      projectId,
      providerId: emailData.email_id,
      toEmail,
      fromEmail,
      fromName,
      subject: emailData.subject,
      textBody: emailData.text,
      htmlBody: emailData.html,
      messageId,
      inReplyTo,
      references,
      rawHeaders: headers,
      attachments: emailData.attachments?.map(att => ({
        filename: att.filename,
        mimeType: att.content_type,
        sizeBytes: att.size,
        contentId: att.content_id,
        // Only include content for smaller attachments to prevent Redis bloat
        content: att.size <= MAX_ATTACHMENT_BYTES_FOR_QUEUE ? att.content : undefined,
      })),
      receivedAt: payload.created_at,
    };

    // Enqueue for processing
    try {
      const queue = requireQueue(inboxWebhookQueue, 'inbox-webhooks');
      await queue.add('process-inbound-email', jobData, {
        jobId: `inbox-${emailData.email_id}`, // Idempotency key
      });

      const duration = Date.now() - startTime;
      console.log(`[InboxWebhook] Enqueued email ${emailData.email_id} for project ${projectId} in ${duration}ms`);

      // Return 200 fast
      return reply.code(200).send({ received: true, queued: true });
    } catch (error) {
      // If it's a duplicate job ID error, that's OK (idempotency)
      if (error instanceof Error && error.message.includes('Job with id')) {
        console.log(`[InboxWebhook] Duplicate email ${emailData.email_id}, already queued`);
        return reply.code(200).send({ received: true, duplicate: true });
      }

      console.error('[InboxWebhook] Failed to enqueue job:', error);
      // Return 500 so Resend will retry
      return reply.code(500).send({ error: 'Failed to queue' });
    }
  });

  // ===========================================================================
  // Health check endpoint for the webhook
  // ===========================================================================
  fastify.get('/webhooks/resend/inbound/health', async (request, reply) => {
    return reply.send({
      status: 'ok',
      queue: inboxWebhookQueue ? 'connected' : 'not_configured',
      webhookSecret: RESEND_WEBHOOK_SECRET ? 'configured' : 'not_configured',
    });
  });
}
