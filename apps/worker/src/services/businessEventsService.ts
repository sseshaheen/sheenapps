/**
 * BusinessEventsService
 *
 * Inserts business_events for Run Hub.
 * This is append-only and idempotent via unique constraint.
 * Triggers Run notifications when events are inserted.
 */

import { Pool } from 'pg'
import { getPool } from './database'
import { getRunNotificationService } from './runNotificationService'
import { getAttributionService } from './attributionService'

export interface BusinessEventInput {
  projectId: string
  eventType: string
  occurredAt: string
  source: 'sdk' | 'webhook' | 'server' | 'manual'
  payload: Record<string, unknown>
  idempotencyKey: string
  schemaVersion?: number
  actorType?: string
  actorId?: string
  entityType?: string
  entityId?: string
  sessionId?: string
  anonymousId?: string
  correlationId?: string
}

export interface BusinessEventResult {
  id: number
  publicId: string
}

export interface BusinessEventRecord {
  id: number
  publicId: string
  projectId: string
  eventType: string
  occurredAt: string
  receivedAt: string
  source: string
  actorType: string | null
  actorId: string | null
  entityType: string | null
  entityId: string | null
  sessionId: string | null
  anonymousId: string | null
  correlationId: string | null
  payload: Record<string, unknown>
}

export interface ListEventsOptions {
  eventTypes?: string[]
  limit?: number
  offset?: number
  startDate?: string
  endDate?: string
  /** Cursor for pagination (event id). Returns events with id < cursor. */
  cursor?: number
  /** Whether to include total count. Default: true for backwards compat. Set false after first page. */
  includeTotal?: boolean
}

export interface ListEventsResult {
  events: BusinessEventRecord[]
  /** Total count of matching events. Only included if includeTotal=true. */
  total?: number
  /** Cursor for next page (event id). Null if no more events. */
  nextCursor: number | null
  /** Whether there are more events to load */
  hasMore: boolean
}

export class BusinessEventsService {
  private pool: Pool

  constructor() {
    this.pool = getPool()
  }

  async insertEvent(input: BusinessEventInput): Promise<BusinessEventResult> {
    // Use xmax = 0 trick to detect true inserts vs conflict updates
    // This prevents duplicate notifications on idempotent retries
    const result = await this.pool.query(
      `
        INSERT INTO business_events (
          project_id,
          event_type,
          occurred_at,
          source,
          payload,
          idempotency_key,
          schema_version,
          actor_type,
          actor_id,
          entity_type,
          entity_id,
          session_id,
          anonymous_id,
          correlation_id
        )
        VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10,
          $11, $12, $13, $14
        )
        ON CONFLICT (project_id, source, event_type, idempotency_key)
        DO UPDATE SET received_at = NOW()
        RETURNING id, public_id, (xmax = 0) AS inserted
      `,
      [
        input.projectId,
        input.eventType,
        input.occurredAt,
        input.source,
        input.payload ?? {},
        input.idempotencyKey,
        input.schemaVersion ?? 1,
        input.actorType ?? null,
        input.actorId ?? null,
        input.entityType ?? null,
        input.entityId ?? null,
        input.sessionId ?? null,
        input.anonymousId ?? null,
        input.correlationId ?? null
      ]
    )

    const row = result.rows[0] as { id: number; public_id: string; inserted: boolean }

    // Only trigger notification on true inserts (not conflict updates)
    // This ensures idempotent event delivery doesn't spam notifications
    if (row.inserted) {
      void getRunNotificationService()
        .checkAndNotify(input.projectId, input.eventType, input.payload ?? {})
        .catch(err => {
          console.error('[BusinessEvents] Notification trigger error:', err)
        })

      // Check for workflow attribution on payment events (Run Hub Phase 4)
      // This links successful payments to workflow runs for impact measurement
      if (input.eventType === 'payment_succeeded') {
        void this.checkAttributionAsync(input.projectId, row.id, input.payload ?? {})
      }
    }

    return { id: row.id, publicId: row.public_id }
  }

  /**
   * List business events for a project with optional filtering.
   * Used for Leads/Customers dashboard in Run Hub.
   *
   * Supports both offset-based (legacy) and cursor-based (preferred) pagination.
   * Cursor-based pagination is more efficient for "Load More" patterns.
   */
  async listEvents(
    projectId: string,
    options: ListEventsOptions = {}
  ): Promise<ListEventsResult> {
    const { eventTypes, limit = 50, offset = 0, startDate, endDate, cursor, includeTotal = true } = options

    // Fetch one extra to determine if there are more results
    const fetchLimit = limit + 1

    // Build query with optional filters
    let query = `
      SELECT
        id,
        public_id,
        project_id,
        event_type,
        occurred_at,
        received_at,
        source,
        actor_type,
        actor_id,
        entity_type,
        entity_id,
        session_id,
        anonymous_id,
        correlation_id,
        payload
      FROM business_events
      WHERE project_id = $1
    `
    const params: (string | number | string[])[] = [projectId]
    let paramIndex = 2

    // Cursor-based pagination: get events older than the cursor
    if (cursor !== undefined) {
      query += ` AND id < $${paramIndex++}`
      params.push(cursor)
    }

    if (eventTypes && eventTypes.length > 0) {
      query += ` AND event_type = ANY($${paramIndex++})`
      params.push(eventTypes)
    }

    if (startDate) {
      query += ` AND occurred_at >= $${paramIndex++}`
      params.push(startDate)
    }

    if (endDate) {
      query += ` AND occurred_at <= $${paramIndex++}`
      params.push(endDate)
    }

    // Order by id DESC for consistent cursor pagination (id correlates with occurred_at)
    query += ` ORDER BY id DESC LIMIT $${paramIndex++}`
    params.push(fetchLimit)

    // Only apply offset for legacy offset-based pagination (when cursor not provided)
    if (cursor === undefined && offset > 0) {
      query += ` OFFSET $${paramIndex++}`
      params.push(offset)
    }

    const result = await this.pool.query(query, params)

    // Determine if there are more results
    const hasMore = result.rows.length > limit
    const events = hasMore ? result.rows.slice(0, limit) : result.rows

    // Only compute total when explicitly requested (avoids expensive COUNT(*) on every page)
    let total: number | undefined
    if (includeTotal) {
      let countQuery = `SELECT COUNT(*) FROM business_events WHERE project_id = $1`
      const countParams: (string | string[])[] = [projectId]
      let countParamIndex = 2

      if (eventTypes && eventTypes.length > 0) {
        countQuery += ` AND event_type = ANY($${countParamIndex++})`
        countParams.push(eventTypes)
      }

      if (startDate) {
        countQuery += ` AND occurred_at >= $${countParamIndex++}`
        countParams.push(startDate)
      }

      if (endDate) {
        countQuery += ` AND occurred_at <= $${countParamIndex++}`
        countParams.push(endDate)
      }

      const countResult = await this.pool.query(countQuery, countParams)
      total = parseInt(countResult.rows[0].count, 10)
    }

    // Next cursor is the id of the last returned event
    const nextCursor = hasMore && events.length > 0
      ? events[events.length - 1].id
      : null

    return {
      events: events.map(row => ({
        id: row.id,
        publicId: row.public_id,
        projectId: row.project_id,
        eventType: row.event_type,
        occurredAt: row.occurred_at?.toISOString?.() ?? row.occurred_at,
        receivedAt: row.received_at?.toISOString?.() ?? row.received_at,
        source: row.source,
        actorType: row.actor_type,
        actorId: row.actor_id,
        entityType: row.entity_type,
        entityId: row.entity_id,
        sessionId: row.session_id,
        anonymousId: row.anonymous_id,
        correlationId: row.correlation_id,
        payload: row.payload ?? {}
      })),
      total,
      nextCursor,
      hasMore
    }
  }

  /**
   * Check if a payment event should be attributed to a workflow run.
   * Called asynchronously after payment_succeeded events are inserted.
   * Part of Run Hub Phase 4: Actions → Outcomes Loop
   */
  private async checkAttributionAsync(
    projectId: string,
    eventId: number,
    payload: Record<string, unknown>
  ): Promise<void> {
    try {
      // Extract payment details from payload
      const customerEmail = (payload.customer_email as string) ||
        (payload.email as string) ||
        (payload.receipt_email as string)

      const amountCents = (payload.amount_cents as number) ||
        (payload.amount as number) ||
        ((payload.total as number) ?? 0) * 100

      const currency = (payload.currency as string) || 'USD'
      const occurredAt = (payload.occurred_at as string) || new Date().toISOString()

      // Check for workflow run ID in checkout metadata (link-based attribution)
      const checkoutMetadata: { wid?: string; cartId?: string } = {}
      const metadata = payload.metadata as Record<string, unknown> | undefined
      if (metadata?.wid) {
        checkoutMetadata.wid = metadata.wid as string
      }
      if (metadata?.cart_id || metadata?.cartId) {
        checkoutMetadata.cartId = (metadata.cart_id || metadata.cartId) as string
      }

      // Also check for cart_id at top level
      if (payload.cart_id || payload.cartId) {
        checkoutMetadata.cartId = (payload.cart_id || payload.cartId) as string
      }

      await getAttributionService().checkAndRecordAttribution({
        projectId,
        eventId,
        customerEmail: customerEmail?.toLowerCase().trim(),
        checkoutMetadata: Object.keys(checkoutMetadata).length > 0 ? checkoutMetadata : undefined,
        amountCents,
        currency,
        occurredAt,
        correlationId: payload.correlation_id as string | undefined,
      })
    } catch (err) {
      console.error('[BusinessEvents] Attribution check error:', err)
    }
  }
}

// =============================================================================
// SINGLETON FACTORY
// =============================================================================

let instance: BusinessEventsService | null = null

export function getBusinessEventsService(): BusinessEventsService {
  if (!instance) {
    instance = new BusinessEventsService()
  }
  return instance
}

/** Reset singleton for testing */
export function resetBusinessEventsServiceInstance(): void {
  instance = null
}
