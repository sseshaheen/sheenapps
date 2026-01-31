/**
 * OpenClaw Webhook Handler
 *
 * Receives webhooks from OpenClaw gateways for:
 * - Message events (received, sent)
 * - Tool calls and completions
 * - Lead captures
 * - Channel status changes
 *
 * Features:
 * - HMAC-SHA256 signature validation
 * - Idempotent delivery processing (via Redis + database)
 * - BullMQ async processing
 * - Feature flag kill switch
 * - Per-project tracking
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import { ServerLoggingService } from '../services/serverLoggingService';
import { addOpenClawWebhookJob, OpenClawWebhookJobData } from '../queue/modularQueues';
import { pool } from '../services/database';
import { FeatureFlagService } from '../services/admin/FeatureFlagService';
import { makeAdminCtx } from '../lib/supabase';

// =============================================================================
// TYPES
// =============================================================================

type OpenClawEventType =
  | 'message.received'
  | 'message.sent'
  | 'tool.called'
  | 'tool.completed'
  | 'session.started'
  | 'session.ended'
  | 'lead.created'
  | 'channel.connected'
  | 'channel.disconnected'
  | 'error.occurred';

interface OpenClawWebhookPayload {
  /** Unique delivery ID for idempotency */
  deliveryId: string;
  /** Event type */
  event: OpenClawEventType;
  /** Project ID this gateway belongs to */
  projectId: string;
  /** Gateway instance ID */
  gatewayId: string;
  /** ISO timestamp */
  timestamp: string;
  /** Event-specific data */
  data: {
    channel?: string;
    senderId?: string;
    senderName?: string;
    sessionId?: string;
    messageId?: string;
    content?: string;
    toolName?: string;
    toolParams?: Record<string, unknown>;
    toolResult?: unknown;
    errorCode?: string;
    errorMessage?: string;
    [key: string]: unknown;
  };
}

// =============================================================================
// CONSTANTS
// =============================================================================

const FEATURE_FLAG_NAME = 'openclaw_webhooks_enabled';
const KILL_SWITCH_FLAG = 'openclaw_kill_switch';
const DELIVERY_TTL_DAYS = 7;

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Verify OpenClaw webhook signature using HMAC-SHA256
 * Signature format: sha256=<hex-digest>
 */
function verifyOpenClawSignature(
  rawBody: string,
  signature: string | undefined,
  secret: string
): boolean {
  if (!signature) {
    return false;
  }

  // Support both 'sha256=...' and raw hex formats
  const providedHash = signature.startsWith('sha256=')
    ? signature.slice(7)
    : signature;

  const expectedHash = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Use timing-safe comparison to prevent timing attacks
  const sourceBuffer = Buffer.from(providedHash);
  const expectedBuffer = Buffer.from(expectedHash);

  if (sourceBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(sourceBuffer, expectedBuffer);
}

/**
 * Check if a delivery has already been processed (idempotency check)
 */
async function isDeliveryProcessed(deliveryId: string): Promise<boolean> {
  if (!pool) return false;

  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT 1 FROM openclaw_webhook_deliveries
       WHERE delivery_id = $1
       LIMIT 1`,
      [deliveryId]
    );
    return result.rows.length > 0;
  } finally {
    client.release();
  }
}

/**
 * Mark a delivery as processed
 */
async function markDeliveryProcessed(
  deliveryId: string,
  projectId: string,
  event: string
): Promise<void> {
  if (!pool) return;

  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO openclaw_webhook_deliveries
       (delivery_id, project_id, event_type, processed_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (delivery_id) DO NOTHING`,
      [deliveryId, projectId, event]
    );
  } finally {
    client.release();
  }
}

/**
 * Validate that the project exists and has OpenClaw enabled
 */
async function validateProject(projectId: string): Promise<{
  valid: boolean;
  enabled?: boolean;
  killSwitchActive?: boolean;
}> {
  if (!pool) {
    return { valid: false };
  }

  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT
         id,
         COALESCE((metadata->>'openclaw_enabled')::boolean, false) as openclaw_enabled,
         COALESCE((metadata->>'openclaw_kill_switch')::boolean, false) as kill_switch
       FROM projects
       WHERE id = $1
       LIMIT 1`,
      [projectId]
    );

    if (result.rows.length === 0) {
      return { valid: false };
    }

    const project = result.rows[0];

    // Check if OpenClaw is enabled for this project
    if (!project.openclaw_enabled) {
      return { valid: true, enabled: false, killSwitchActive: false };
    }

    // Check project-level kill switch
    if (project.kill_switch) {
      return { valid: true, enabled: true, killSwitchActive: true };
    }

    return { valid: true, enabled: true, killSwitchActive: false };
  } finally {
    client.release();
  }
}

/**
 * Track OpenClaw metrics for the project
 */
async function trackMetrics(
  projectId: string,
  event: OpenClawEventType,
  data: Record<string, unknown>
): Promise<void> {
  if (!pool) return;

  const client = await pool.connect();
  try {
    // Upsert daily metrics
    await client.query(
      `INSERT INTO openclaw_daily_metrics
       (project_id, metric_date, event_type, count, metadata)
       VALUES ($1, CURRENT_DATE, $2, 1, $3::jsonb)
       ON CONFLICT (project_id, metric_date, event_type)
       DO UPDATE SET
         count = openclaw_daily_metrics.count + 1,
         updated_at = NOW()`,
      [projectId, event, JSON.stringify(data)]
    );
  } catch (error) {
    // Non-critical - log and continue
    const logger = ServerLoggingService.getInstance();
    await logger.logServerEvent(
      'error',
      'warn',
      'Failed to track OpenClaw metrics',
      { projectId, event, error: (error as Error).message }
    );
  } finally {
    client.release();
  }
}

/**
 * Enqueue webhook for async processing using dedicated OpenClaw queue
 */
async function enqueueWebhook(payload: OpenClawWebhookPayload): Promise<void> {
  const logger = ServerLoggingService.getInstance();

  // Build job data matching OpenClawWebhookJobData type
  // Cast data to match the typed interface (channel type is narrower in queue type)
  const jobData: OpenClawWebhookJobData = {
    deliveryId: payload.deliveryId,
    event: payload.event,
    projectId: payload.projectId,
    gatewayId: payload.gatewayId,
    timestamp: payload.timestamp,
    enqueuedAt: new Date().toISOString(),
    data: payload.data as OpenClawWebhookJobData['data']
  };

  // Use dedicated OpenClaw queue with idempotent job ID
  await addOpenClawWebhookJob(jobData);

  await logger.logServerEvent(
    'capacity',
    'info',
    'OpenClaw webhook enqueued',
    {
      deliveryId: payload.deliveryId,
      event: payload.event,
      projectId: payload.projectId,
      gatewayId: payload.gatewayId
    }
  );
}

// =============================================================================
// ROUTE REGISTRATION
// =============================================================================

export function registerOpenClawWebhookRoutes(app: FastifyInstance) {
  const logger = ServerLoggingService.getInstance();

  /**
   * POST /v1/webhooks/openclaw
   *
   * Receives webhooks from OpenClaw gateways.
   *
   * Headers:
   * - x-openclaw-signature: HMAC-SHA256 signature (sha256=<hex>)
   * - x-openclaw-delivery-id: Unique delivery ID
   * - x-openclaw-timestamp: ISO timestamp
   * - x-openclaw-gateway-id: Gateway instance ID
   *
   * Response codes:
   * - 202: Accepted (queued for processing)
   * - 200: Duplicate (already processed)
   * - 401: Unauthorized (invalid signature)
   * - 403: Forbidden (kill switch active)
   * - 404: Project not found
   * - 503: Service disabled (feature flag off)
   */
  app.post('/v1/webhooks/openclaw', async (
    request: FastifyRequest<{ Body: OpenClawWebhookPayload }>,
    reply: FastifyReply
  ) => {
    const startTime = Date.now();

    // Get raw body for signature verification
    const rawBody = (request as any).rawBody as string;

    // Extract headers
    const signature = request.headers['x-openclaw-signature'] as string | undefined;
    const deliveryId = request.headers['x-openclaw-delivery-id'] as string
      || request.body?.deliveryId;
    const gatewayId = request.headers['x-openclaw-gateway-id'] as string
      || request.body?.gatewayId;
    const headerTimestamp = request.headers['x-openclaw-timestamp'] as string;

    // =========================================================================
    // Step 1: Check global feature flag
    // =========================================================================
    try {
      const supabase = makeAdminCtx();
      const flagService = new FeatureFlagService(supabase);
      const isEnabled = await flagService.isEnabled(FEATURE_FLAG_NAME);

      if (!isEnabled) {
        await logger.logServerEvent(
          'error',
          'warn',
          'OpenClaw webhooks disabled by feature flag',
          { deliveryId }
        );
        return reply.code(503).send({
          status: 'disabled',
          code: 'FEATURE_DISABLED',
          message: 'OpenClaw webhooks are currently disabled'
        });
      }
    } catch (error) {
      // If feature flag check fails, default to enabled (fail-open for webhooks)
      await logger.logServerEvent(
        'error',
        'warn',
        'Feature flag check failed, defaulting to enabled',
        { error: (error as Error).message }
      );
    }

    // =========================================================================
    // Step 2: Verify signature
    // =========================================================================
    const webhookSecret = process.env.OPENCLAW_WEBHOOK_SECRET;

    if (!webhookSecret) {
      await logger.logServerEvent(
        'error',
        'error',
        'OpenClaw webhook secret not configured',
        { deliveryId }
      );
      // Return 202 to prevent retries - configuration issue
      return reply.code(202).send({
        status: 'ignored',
        code: 'CONFIGURATION_ERROR',
        message: 'Webhook secret not configured'
      });
    }

    if (!rawBody) {
      await logger.logServerEvent(
        'error',
        'error',
        'OpenClaw webhook missing raw body',
        { deliveryId }
      );
      return reply.code(400).send({
        status: 'error',
        code: 'MISSING_BODY',
        message: 'Request body is required'
      });
    }

    if (!verifyOpenClawSignature(rawBody, signature, webhookSecret)) {
      await logger.logServerEvent(
        'error',
        'error',
        'OpenClaw webhook signature verification failed',
        { deliveryId, hasSignature: !!signature }
      );
      return reply.code(401).send({
        status: 'unauthorized',
        code: 'INVALID_SIGNATURE',
        message: 'Signature verification failed'
      });
    }

    // =========================================================================
    // Step 3: Parse and validate payload
    // =========================================================================
    const payload = request.body;

    if (!payload.projectId || !payload.event) {
      await logger.logServerEvent(
        'error',
        'warn',
        'OpenClaw webhook missing required fields',
        { deliveryId, hasProjectId: !!payload.projectId, hasEvent: !!payload.event }
      );
      return reply.code(400).send({
        status: 'error',
        code: 'INVALID_PAYLOAD',
        message: 'Missing required fields: projectId, event'
      });
    }

    // Normalize payload
    const normalizedPayload: OpenClawWebhookPayload = {
      deliveryId: deliveryId || crypto.randomUUID(),
      event: payload.event,
      projectId: payload.projectId,
      gatewayId: gatewayId || payload.gatewayId || 'unknown',
      timestamp: payload.timestamp || headerTimestamp || new Date().toISOString(),
      data: payload.data || {}
    };

    // =========================================================================
    // Step 4: Check idempotency
    // =========================================================================
    if (normalizedPayload.deliveryId) {
      const alreadyProcessed = await isDeliveryProcessed(normalizedPayload.deliveryId);
      if (alreadyProcessed) {
        await logger.logServerEvent(
          'capacity',
          'info',
          'OpenClaw webhook already processed (duplicate)',
          { deliveryId: normalizedPayload.deliveryId, event: normalizedPayload.event }
        );
        return reply.code(200).send({
          status: 'duplicate',
          code: 'ALREADY_PROCESSED',
          deliveryId: normalizedPayload.deliveryId
        });
      }
    }

    // =========================================================================
    // Step 5: Validate project and check kill switch
    // =========================================================================
    const projectValidation = await validateProject(normalizedPayload.projectId);

    if (!projectValidation.valid) {
      await logger.logServerEvent(
        'error',
        'warn',
        'OpenClaw webhook for unknown project',
        { projectId: normalizedPayload.projectId, deliveryId: normalizedPayload.deliveryId }
      );
      return reply.code(404).send({
        status: 'error',
        code: 'PROJECT_NOT_FOUND',
        message: 'Project not found'
      });
    }

    // Check if OpenClaw is enabled for this project
    if (projectValidation.enabled === false) {
      await logger.logServerEvent(
        'error',
        'warn',
        'OpenClaw webhook for project with OpenClaw disabled',
        { projectId: normalizedPayload.projectId, deliveryId: normalizedPayload.deliveryId }
      );
      return reply.code(403).send({
        status: 'blocked',
        code: 'OPENCLAW_DISABLED',
        message: 'OpenClaw is not enabled for this project'
      });
    }

    if (projectValidation.killSwitchActive) {
      await logger.logServerEvent(
        'error',
        'warn',
        'OpenClaw webhook blocked by kill switch',
        { projectId: normalizedPayload.projectId, deliveryId: normalizedPayload.deliveryId }
      );
      return reply.code(403).send({
        status: 'blocked',
        code: 'KILL_SWITCH_ACTIVE',
        message: 'OpenClaw is disabled for this project'
      });
    }

    // =========================================================================
    // Step 6: Enqueue first, then mark as processed
    // (Order matters: if Redis is down, we want to return 503 so gateway retries)
    // =========================================================================
    try {
      await enqueueWebhook(normalizedPayload);
      await markDeliveryProcessed(
        normalizedPayload.deliveryId,
        normalizedPayload.projectId,
        normalizedPayload.event
      );
    } catch (err) {
      await logger.logServerEvent(
        'error',
        'error',
        'OpenClaw webhook enqueue failed',
        {
          deliveryId: normalizedPayload.deliveryId,
          projectId: normalizedPayload.projectId,
          error: (err as Error).message
        }
      );
      // Return 503 so gateway retries
      return reply.code(503).send({
        status: 'error',
        code: 'QUEUE_UNAVAILABLE',
        message: 'Webhook queue unavailable, please retry'
      });
    }

    // Track metrics (fire-and-forget)
    trackMetrics(
      normalizedPayload.projectId,
      normalizedPayload.event,
      { channel: normalizedPayload.data.channel }
    ).catch(() => { /* ignore metric errors */ });

    // =========================================================================
    // Step 7: Return 202 Accepted
    // =========================================================================
    const processingTime = Date.now() - startTime;

    await logger.logServerEvent(
      'capacity',
      'info',
      'OpenClaw webhook accepted',
      {
        deliveryId: normalizedPayload.deliveryId,
        event: normalizedPayload.event,
        projectId: normalizedPayload.projectId,
        gatewayId: normalizedPayload.gatewayId,
        processingTimeMs: processingTime
      }
    );

    return reply.code(202).send({
      status: 'accepted',
      code: 'QUEUED',
      deliveryId: normalizedPayload.deliveryId,
      processingTimeMs: processingTime
    });
  });

  console.log('✅ OpenClaw webhook endpoint registered: POST /v1/webhooks/openclaw');
}
