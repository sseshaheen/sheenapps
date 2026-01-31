/**
 * OpenSRS Domain Webhook Route
 *
 * Handles domain lifecycle webhooks from OpenSRS (Tucows).
 * Events include: domain expiry, transfer status, NS changes, etc.
 *
 * OpenSRS webhook format:
 * https://domains.opensrs.guide/docs/webhooks
 *
 * Pattern: verify source → check idempotency → process → return 200
 *
 * Part of easy-mode-email-plan.md (Phase 3: Domain Registration)
 */

import { createHmac, timingSafeEqual } from 'crypto'
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { getPool } from '../services/databaseWrapper'
import { logActivity } from '../services/inhouse/InhouseActivityLogger'
import { isIpInAllowlist, parseAllowlistString } from '../utils/ipAllowlist'
import { createLogger } from '../observability/logger'

const log = createLogger('opensrs-webhook')

// =============================================================================
// CONFIGURATION
// =============================================================================

const OPENSRS_WEBHOOK_SECRET = process.env.OPENSRS_WEBHOOK_SECRET

// OpenSRS webhook IPs (optional IP allowlist with CIDR support)
// Supports individual IPs and CIDR ranges: "192.168.1.1,10.0.0.0/8"
const OPENSRS_ALLOWED_IPS = parseAllowlistString(process.env.OPENSRS_WEBHOOK_IPS)

// Maximum timestamp skew allowed (5 minutes) for replay attack prevention
const MAX_TIMESTAMP_SKEW_MS = 5 * 60 * 1000

// =============================================================================
// TYPES
// =============================================================================

interface OpenSrsWebhookPayload {
  action: string
  object: string
  data: {
    domain?: string
    order_id?: string
    status?: string
    expiry_date?: string
    transfer_status?: string
    nameservers?: string[]
    [key: string]: unknown
  }
  timestamp: string
  signature?: string
}

type DomainEventType =
  | 'domain_expiry_warning'
  | 'domain_expired'
  | 'domain_grace_period'
  | 'domain_redemption'
  | 'domain_renewed'
  | 'domain_transferred_out'
  | 'domain_transferred_in'
  | 'domain_ns_changed'
  | 'domain_lock_changed'
  | 'domain_privacy_changed'

// =============================================================================
// SIGNATURE & TIMESTAMP VERIFICATION
// =============================================================================

/**
 * Check if timestamp is fresh (within allowed skew) to prevent replay attacks
 */
function isFreshTimestamp(timestamp: string): boolean {
  const ts = Date.parse(timestamp)
  if (Number.isNaN(ts)) {
    // Try parsing as Unix timestamp (seconds)
    const unixTs = parseInt(timestamp, 10)
    if (!Number.isNaN(unixTs)) {
      return Math.abs(Date.now() - unixTs * 1000) <= MAX_TIMESTAMP_SKEW_MS
    }
    return false
  }
  return Math.abs(Date.now() - ts) <= MAX_TIMESTAMP_SKEW_MS
}

/**
 * Decode signature from hex or base64 format
 */
function decodeSig(sig: string): Buffer | null {
  try {
    // Heuristic: hex signatures contain only [0-9a-f] and have even length
    if (/^[0-9a-f]+$/i.test(sig) && sig.length % 2 === 0) {
      return Buffer.from(sig, 'hex')
    }
    // Otherwise try base64
    return Buffer.from(sig, 'base64')
  } catch {
    return null
  }
}

function verifyOpenSrsSignature(
  rawBody: string,
  signature: string | undefined,
  timestamp: string
): boolean {
  if (!OPENSRS_WEBHOOK_SECRET) {
    const isProd = process.env.NODE_ENV === 'production'
    if (isProd) {
      console.error('[OpenSRS Webhook] OPENSRS_WEBHOOK_SECRET not configured in production - rejecting')
      return false
    }
    console.warn('[OpenSRS Webhook] OPENSRS_WEBHOOK_SECRET not configured (dev mode) - allowing')
    return true
  }

  if (!signature) {
    console.error('[OpenSRS Webhook] Missing signature')
    return false
  }

  try {
    // OpenSRS signature format: HMAC-SHA256 of timestamp + body
    const signedPayload = `${timestamp}${rawBody}`
    const expectedHex = createHmac('sha256', OPENSRS_WEBHOOK_SECRET)
      .update(signedPayload)
      .digest('hex')
    const expectedBuffer = Buffer.from(expectedHex, 'hex')

    // Support both hex and base64 encoded signatures
    const signatureBuffer = decodeSig(signature)
    if (!signatureBuffer || signatureBuffer.length !== expectedBuffer.length) {
      return false
    }

    return timingSafeEqual(signatureBuffer, expectedBuffer)
  } catch (error) {
    console.error('[OpenSRS Webhook] Signature verification error:', error)
    return false
  }
}

function isAllowedIP(ip: string): boolean {
  // Uses CIDR-aware matching (supports both individual IPs and ranges)
  return isIpInAllowlist(ip, OPENSRS_ALLOWED_IPS)
}

// =============================================================================
// EVENT HANDLERS
// =============================================================================

async function handleDomainEvent(
  eventType: DomainEventType,
  domain: string,
  data: OpenSrsWebhookPayload['data'],
  idempotencyKey: string
): Promise<void> {
  const pool = getPool()

  // Find domain in our database
  const { rows } = await pool.query(
    `SELECT id, project_id, user_id, status FROM inhouse_registered_domains WHERE domain = $1`,
    [domain.toLowerCase()]
  )

  if (rows.length === 0) {
    console.warn(`[OpenSRS Webhook] Domain not found in database: ${domain}`)
    return
  }

  const domainRecord = rows[0]
  const domainId = domainRecord.id
  const projectId = domainRecord.project_id

  // Handle specific event types
  switch (eventType) {
    case 'domain_expiry_warning': {
      // Log warning, domain is still active
      await recordDomainEvent(domainId, projectId, 'expiry_warning', {
        expiryDate: data.expiry_date,
        daysUntilExpiry: data.days_until_expiry,
      }, idempotencyKey)

      // TODO: Send notification to user
      break
    }

    case 'domain_expired': {
      await pool.query(
        `UPDATE inhouse_registered_domains SET status = 'expired', updated_at = NOW() WHERE id = $1`,
        [domainId]
      )
      await recordDomainEvent(domainId, projectId, 'expired', {
        expiryDate: data.expiry_date,
      }, idempotencyKey)
      break
    }

    case 'domain_grace_period': {
      await pool.query(
        `UPDATE inhouse_registered_domains SET status = 'grace', updated_at = NOW() WHERE id = $1`,
        [domainId]
      )
      await recordDomainEvent(domainId, projectId, 'grace_period', {
        graceEndDate: data.grace_end_date,
      }, idempotencyKey)
      break
    }

    case 'domain_redemption': {
      await pool.query(
        `UPDATE inhouse_registered_domains SET status = 'redemption', updated_at = NOW() WHERE id = $1`,
        [domainId]
      )
      await recordDomainEvent(domainId, projectId, 'redemption', {
        redemptionEndDate: data.redemption_end_date,
        redemptionFee: data.redemption_fee,
      }, idempotencyKey)
      break
    }

    case 'domain_renewed': {
      await pool.query(
        `UPDATE inhouse_registered_domains
         SET status = 'active', expires_at = $1, last_renewed_at = NOW(), updated_at = NOW()
         WHERE id = $2`,
        [data.expiry_date, domainId]
      )
      await recordDomainEvent(domainId, projectId, 'renewed', {
        newExpiryDate: data.expiry_date,
        orderId: data.order_id,
      }, idempotencyKey)
      break
    }

    case 'domain_transferred_out': {
      await pool.query(
        `UPDATE inhouse_registered_domains SET status = 'transferred', updated_at = NOW() WHERE id = $1`,
        [domainId]
      )
      await recordDomainEvent(domainId, projectId, 'transferred', {
        direction: 'out',
        newRegistrar: data.new_registrar,
      }, idempotencyKey)
      break
    }

    case 'domain_transferred_in': {
      // Incoming transfer (if we're receiving a domain)
      await recordDomainEvent(domainId, projectId, 'transferred', {
        direction: 'in',
        previousRegistrar: data.previous_registrar,
      }, idempotencyKey)
      break
    }

    case 'domain_ns_changed': {
      await pool.query(
        `UPDATE inhouse_registered_domains SET nameservers = $1, updated_at = NOW() WHERE id = $2`,
        [JSON.stringify(data.nameservers), domainId]
      )
      await recordDomainEvent(domainId, projectId, 'nameservers_updated', {
        newNameservers: data.nameservers,
      }, idempotencyKey)
      break
    }

    case 'domain_lock_changed': {
      await pool.query(
        `UPDATE inhouse_registered_domains SET locked = $1, updated_at = NOW() WHERE id = $2`,
        [data.locked, domainId]
      )
      await recordDomainEvent(domainId, projectId, 'settings_updated', {
        locked: data.locked,
      }, idempotencyKey)
      break
    }

    case 'domain_privacy_changed': {
      await pool.query(
        `UPDATE inhouse_registered_domains SET whois_privacy = $1, updated_at = NOW() WHERE id = $2`,
        [data.privacy_enabled, domainId]
      )
      await recordDomainEvent(domainId, projectId, 'settings_updated', {
        whoisPrivacy: data.privacy_enabled,
      }, idempotencyKey)
      break
    }

    default:
      console.warn(`[OpenSRS Webhook] Unknown event type: ${eventType}`)
  }

  // Log activity
  logActivity({
    projectId,
    service: 'domain-registration',
    action: `webhook_${eventType}`,
    actorType: 'webhook',
    resourceType: 'registered_domain',
    resourceId: domainId,
    metadata: { domain, eventType, ...data },
  })
}

/**
 * Record a domain event with idempotency protection.
 * Uses ON CONFLICT DO NOTHING for atomic deduplication (race-safe).
 *
 * @returns true if event was recorded, false if duplicate
 */
async function recordDomainEvent(
  domainId: string,
  projectId: string,
  eventType: string,
  metadata: Record<string, unknown>,
  idempotencyKey?: string
): Promise<boolean> {
  const pool = getPool()

  const result = await pool.query(
    `INSERT INTO inhouse_domain_events (domain_id, project_id, event_type, metadata, actor_type, idempotency_key)
     VALUES ($1, $2, $3, $4, 'webhook', $5)
     ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING`,
    [domainId, projectId, eventType, JSON.stringify(metadata), idempotencyKey ?? null]
  )

  // rowCount = 0 means ON CONFLICT fired (duplicate), 1 means inserted
  return (result.rowCount ?? 0) > 0
}

// =============================================================================
// TRANSFER WEBHOOK HANDLING
// =============================================================================

/**
 * Handle webhooks for domain transfers-in.
 *
 * During transfer, the domain isn't in inhouse_registered_domains yet.
 * We must look up by opensrs_order_id in inhouse_domain_transfers.
 *
 * @returns true if handled as transfer, false if not a transfer webhook
 */
async function handleTransferWebhook(
  payload: OpenSrsWebhookPayload,
  idempotencyKey: string
): Promise<boolean> {
  const pool = getPool()
  const orderId = payload.data?.order_id
  const domain = payload.data?.domain?.toLowerCase()

  if (!orderId && !domain) return false

  // Try to find transfer by order_id first, then by domain
  let transferQuery = orderId
    ? `SELECT id, project_id, domain, status FROM inhouse_domain_transfers WHERE opensrs_order_id = $1 LIMIT 1`
    : `SELECT id, project_id, domain, status FROM inhouse_domain_transfers WHERE domain = $1 AND status IN ('initiated', 'processing') LIMIT 1`

  const { rows } = await pool.query(transferQuery, [orderId || domain])

  if (rows.length === 0) {
    return false // Not a transfer webhook, let normal domain handling proceed
  }

  const transfer = rows[0]
  const action = payload.action

  // Map OpenSRS action/status to our transfer statuses
  let nextStatus: 'pending' | 'initiated' | 'processing' | 'completed' | 'failed'
  let eventType: string

  if (action === 'transfer_in_complete' || payload.data?.transfer_status === 'completed') {
    nextStatus = 'completed'
    eventType = 'transfer_completed'
  } else if (action === 'transfer_failed' || payload.data?.transfer_status === 'failed') {
    nextStatus = 'failed'
    eventType = 'transfer_failed'
  } else if (action === 'transferred' || payload.data?.transfer_status === 'processing' || action === 'transfer_in_progress') {
    nextStatus = 'processing'
    eventType = 'transfer_processing'
  } else {
    // Unknown status, default to processing
    nextStatus = 'processing'
    eventType = 'transfer_processing'
  }

  const rawProviderStatus = payload.data?.status || payload.data?.transfer_status || action

  log.info({ transferId: transfer.id, domain: transfer.domain, action, nextStatus, rawProviderStatus }, 'Processing transfer webhook')

  // Update transfer record
  await pool.query(
    `UPDATE inhouse_domain_transfers
     SET status = $1,
         raw_provider_status = $2,
         status_message = $3,
         updated_at = NOW()
     WHERE id = $4`,
    [
      nextStatus,
      rawProviderStatus,
      payload.data?.status_info || null,
      transfer.id,
    ]
  )

  // Record domain event (domain_id is NULL since domain isn't registered yet)
  await pool.query(
    `INSERT INTO inhouse_domain_events (domain_id, project_id, event_type, metadata, actor_type, idempotency_key)
     VALUES (NULL, $1, $2, $3, 'webhook', $4)
     ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING`,
    [
      transfer.project_id,
      eventType,
      JSON.stringify({
        transferId: transfer.id,
        domain: transfer.domain,
        orderId: orderId || null,
        action,
        rawStatus: rawProviderStatus,
      }),
      idempotencyKey,
    ]
  )

  // If transfer completed, finalize it (create registered domain record + DNS)
  if (nextStatus === 'completed') {
    log.info({ transferId: transfer.id, domain: transfer.domain }, 'Transfer completed, finalizing...')
    try {
      // Import and call finalizeTransfer from transfer service
      const { getInhouseDomainTransferService } = await import('../services/inhouse/InhouseDomainTransferService')
      const transferService = getInhouseDomainTransferService(transfer.project_id)
      await transferService.pollTransferStatus(transfer.id) // This will call finalizeTransfer
    } catch (error) {
      log.error({ error, transferId: transfer.id }, 'Failed to finalize transfer')
      // Don't throw - the transfer status is updated, finalization can be retried
    }
  }

  logActivity({
    projectId: transfer.project_id,
    service: 'domain-registration',
    action: `webhook_transfer_${eventType}`,
    actorType: 'webhook',
    resourceType: 'domain_transfer',
    resourceId: transfer.id,
    metadata: { domain: transfer.domain, action, status: nextStatus },
  })

  return true
}

// =============================================================================
// IDEMPOTENCY
// =============================================================================

/**
 * Generate idempotency key from webhook payload.
 * Uses domain + action + timestamp to uniquely identify an event.
 * Includes order_id when present for transfer events.
 */
function generateIdempotencyKey(payload: OpenSrsWebhookPayload): string {
  const domain = payload.data?.domain?.toLowerCase() || 'unknown'
  const orderId = payload.data?.order_id || ''
  // Include order_id for transfer events to differentiate from domain events
  const orderPart = orderId ? `:${orderId}` : ''
  return `opensrs:${domain}:${payload.action}${orderPart}:${payload.timestamp}`
}

// =============================================================================
// ROUTE REGISTRATION
// =============================================================================

export async function opensrsWebhookRoutes(fastify: FastifyInstance): Promise<void> {
  // NOTE: Raw body is captured by the global JSON parser in server.ts
  // No need for a local parser - (req as any).rawBody is available

  /**
   * OpenSRS Domain Webhook Endpoint
   *
   * POST /webhooks/opensrs/domain
   *
   * Pattern: Persist-first, then process
   * 1. Verify security (IP, timestamp, signature)
   * 2. Persist raw event to database (atomic idempotency)
   * 3. Claim the event for processing
   * 4. Process synchronously (queue for large scale)
   * 5. Update status based on result
   */
  fastify.post<{
    Body: OpenSrsWebhookPayload
  }>('/webhooks/opensrs/domain', async (request: FastifyRequest<{ Body: OpenSrsWebhookPayload }>, reply: FastifyReply) => {
    const startTime = Date.now()
    const pool = getPool()

    // Get client IP
    const clientIP = request.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ||
                     request.ip

    // Verify IP allowlist
    if (!isAllowedIP(clientIP)) {
      console.error(`[OpenSRS Webhook] Rejected request from IP: ${clientIP}`)
      return reply.code(403).send({ error: 'Forbidden' })
    }

    const payload = request.body
    const timestamp = payload.timestamp

    // Verify timestamp freshness (prevent replay attacks)
    if (!isFreshTimestamp(timestamp)) {
      console.error(`[OpenSRS Webhook] Stale timestamp: ${timestamp}`)
      return reply.code(401).send({ error: 'Stale timestamp' })
    }

    // Verify signature (rawBody is captured by global parser in server.ts)
    const rawBody = (request as any).rawBody as string | undefined
    if (!rawBody) {
      console.error('[OpenSRS Webhook] Missing rawBody - global parser may not be configured')
      return reply.code(400).send({ error: 'Missing raw body' })
    }

    const signature = request.headers['x-opensrs-signature'] as string | undefined

    if (!verifyOpenSrsSignature(rawBody, signature, timestamp)) {
      console.error('[OpenSRS Webhook] Invalid signature')
      return reply.code(401).send({ error: 'Invalid signature' })
    }

    // Generate idempotency key
    const idempotencyKey = generateIdempotencyKey(payload)

    // Step 1: Persist raw event (atomic insert with idempotency)
    let webhookEventId: string
    let existingStatus: string | null = null

    try {
      // Try to insert new event
      const insertResult = await pool.query(`
        INSERT INTO inhouse_webhook_events
        (source, endpoint, raw_headers, raw_body, sender_ip, idempotency_key, status)
        VALUES ('opensrs', '/webhooks/opensrs/domain', $1, $2, $3, $4, 'pending')
        ON CONFLICT (source, idempotency_key) DO NOTHING
        RETURNING id
      `, [
        JSON.stringify(request.headers),
        rawBody,
        clientIP,
        idempotencyKey,
      ])

      if (insertResult.rows.length > 0) {
        // New event inserted
        webhookEventId = insertResult.rows[0].id
      } else {
        // Event already exists - get its current status
        const existing = await pool.query(`
          SELECT id, status FROM inhouse_webhook_events
          WHERE source = 'opensrs' AND idempotency_key = $1
        `, [idempotencyKey])

        if (existing.rows.length === 0) {
          console.error('[OpenSRS Webhook] Race condition: event disappeared')
          return reply.code(200).send({ status: 'race_condition' })
        }

        webhookEventId = existing.rows[0].id
        existingStatus = existing.rows[0].status
      }
    } catch (error) {
      console.error('[OpenSRS Webhook] Failed to persist event:', error)
      return reply.code(200).send({ status: 'persist_error' })
    }

    // Step 2: If already completed or processing, skip (idempotency)
    if (existingStatus === 'completed') {
      console.log(`[OpenSRS Webhook] Event ${idempotencyKey} already completed, skipping`)
      return reply.code(200).send({ status: 'duplicate' })
    }

    if (existingStatus === 'processing') {
      console.log(`[OpenSRS Webhook] Event ${idempotencyKey} already processing, skipping`)
      return reply.code(200).send({ status: 'already_processing' })
    }

    // Step 3: Atomically "claim" the event for processing
    // Only claim if: pending, OR (retrying/failed AND retry time has passed)
    const claimResult = await pool.query(`
      UPDATE inhouse_webhook_events
      SET status = 'processing', updated_at = NOW()
      WHERE id = $1
        AND (
          status = 'pending'
          OR (status IN ('retrying', 'failed') AND (next_retry_at IS NULL OR next_retry_at <= NOW()))
        )
      RETURNING id
    `, [webhookEventId])

    if (claimResult.rows.length === 0) {
      // Another worker already claimed it
      console.log(`[OpenSRS Webhook] Event ${idempotencyKey} claimed by another worker`)
      return reply.code(200).send({ status: 'claimed_by_other' })
    }

    console.log(`[OpenSRS Webhook] Processing: action=${payload.action}, object=${payload.object}`)

    // Step 4: Process the event
    try {
      // Track what type of event was processed for the webhook record
      let parsedEventType: string = payload.action

      // Try transfer handling first (for domains being transferred in)
      const handledAsTransfer = await handleTransferWebhook(payload, idempotencyKey)

      if (handledAsTransfer) {
        // Transfer webhook was handled, mark event type accordingly
        parsedEventType = `transfer_${payload.action}`
      } else {
        // Not a transfer webhook, handle as regular domain event
        const eventMapping: Record<string, DomainEventType> = {
          'expiring': 'domain_expiry_warning',
          'expired': 'domain_expired',
          'grace': 'domain_grace_period',
          'redemption': 'domain_redemption',
          'renewed': 'domain_renewed',
          'transferred': 'domain_transferred_out',
          'transfer_in_complete': 'domain_transferred_in',
          'ns_changed': 'domain_ns_changed',
          'lock_changed': 'domain_lock_changed',
          'privacy_changed': 'domain_privacy_changed',
        }

        const eventType = eventMapping[payload.action]
        const domain = payload.data.domain

        if (eventType && domain) {
          await handleDomainEvent(eventType, domain, payload.data, idempotencyKey)
          parsedEventType = eventType
        } else {
          log.warn({ action: payload.action }, 'Unhandled OpenSRS webhook action')
        }
      }

      // Step 5: Mark as completed with parsed data
      await pool.query(`
        UPDATE inhouse_webhook_events
        SET status = 'completed', processed_at = NOW(),
            parsed_event_type = $2, parsed_data = $3
        WHERE id = $1
      `, [webhookEventId, parsedEventType, JSON.stringify(payload.data)])

      const duration = Date.now() - startTime
      console.log(`[OpenSRS Webhook] Processed in ${duration}ms`)

      return reply.code(200).send({ status: 'ok' })

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('[OpenSRS Webhook] Processing error:', error)

      // Mark as retrying with exponential backoff, or failed if exceeded max retries
      // Max 12 retries = ~4 hours of exponential backoff before giving up
      const MAX_RETRIES = 12
      try {
        await pool.query(`
          UPDATE inhouse_webhook_events
          SET status = CASE WHEN retry_count >= $3 THEN 'failed' ELSE 'retrying' END,
              last_error = $2,
              retry_count = retry_count + 1,
              next_retry_at = CASE WHEN retry_count >= $3 THEN NULL ELSE NOW() + (INTERVAL '5 minutes' * LEAST(retry_count + 1, 12)) END
          WHERE id = $1
        `, [webhookEventId, errorMessage, MAX_RETRIES])
      } catch (updateError) {
        console.error('[OpenSRS Webhook] Failed to update status:', updateError)
      }

      // Still return 200 to prevent infinite retries from OpenSRS
      // The event is persisted and can be manually retried
      return reply.code(200).send({ status: 'error_persisted' })
    }
  })

  /**
   * Health check endpoint for OpenSRS webhook
   */
  fastify.get('/webhooks/opensrs/health', async (request, reply) => {
    return reply.send({
      status: 'ok',
      service: 'opensrs-webhook',
      timestamp: new Date().toISOString(),
    })
  })
}

export default opensrsWebhookRoutes
