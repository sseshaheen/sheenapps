/**
 * AttributionService
 *
 * Handles outcome attribution for Run Hub workflows.
 * Links payments/conversions to workflow runs for impact measurement.
 *
 * Attribution Strategy:
 * 1. Link-based (highest confidence): Check for `wid` in checkout metadata
 * 2. Email match: Match customer email with recovery_email_sent events
 * 3. Cart match: Match cart_id if available
 *
 * Part of Run Hub Phase 4: Actions → Outcomes Loop
 */

import { Pool } from 'pg'
import { getPool } from './database'

// Simple logging prefix for this service
const LOG_PREFIX = '[AttributionService]'

// Attribution window in hours
const ATTRIBUTION_WINDOW_HOURS = 48

// ============================================
// TYPES
// ============================================

export interface PaymentEventInput {
  projectId: string
  eventId: number
  customerEmail?: string
  checkoutMetadata?: {
    wid?: string  // Workflow run ID from recovery link
    cartId?: string
  }
  amountCents: number
  currency: string
  occurredAt: string
  correlationId?: string
}

export interface Attribution {
  id: string
  projectId: string
  workflowRunId: string
  paymentEventId: number
  attributedAt: string
  model: 'last_touch_48h'
  matchMethod: 'wid_link' | 'email_exact' | 'cart_match' | 'amount_match'
  amountCents: number
  currency: string
  confidence: 'high' | 'medium' | 'low'
}

export interface CurrencyAmount {
  currency: string
  amountCents: number
  count: number
}

export interface WorkflowImpact {
  totalRecipients: number
  conversions: number
  recoveredRevenueCents: number
  currency: string
  /** Per-currency breakdown (when multiple currencies present) */
  currencyBreakdown?: CurrencyAmount[]
}

// ============================================
// SERVICE IMPLEMENTATION
// ============================================

export class AttributionService {
  private pool: Pool

  constructor() {
    this.pool = getPool()
  }

  /**
   * Check if a payment event can be attributed to a workflow run.
   * Called when payment_succeeded events are inserted.
   *
   * Returns the attribution if one was created, null otherwise.
   */
  async checkAndRecordAttribution(
    input: PaymentEventInput
  ): Promise<Attribution | null> {
    const {
      projectId,
      eventId,
      customerEmail,
      checkoutMetadata,
      amountCents,
      currency,
      occurredAt,
    } = input

    // 1. Check if this payment was already attributed (unique constraint)
    const existing = await this.pool.query(
      `SELECT id FROM workflow_attributions WHERE payment_event_id = $1`,
      [eventId]
    )
    if (existing.rows.length > 0) {
      // Already attributed, skip
      return null
    }

    // 2. Try link-based attribution first (highest confidence)
    if (checkoutMetadata?.wid) {
      const linkAttribution = await this.tryLinkBasedAttribution(
        projectId,
        eventId,
        checkoutMetadata.wid,
        amountCents,
        currency
      )
      if (linkAttribution) return linkAttribution
    }

    // 3. Try email-based attribution
    if (customerEmail) {
      const emailAttribution = await this.tryEmailBasedAttribution(
        projectId,
        eventId,
        customerEmail.toLowerCase().trim(),
        amountCents,
        currency,
        occurredAt,
        checkoutMetadata?.cartId
      )
      if (emailAttribution) return emailAttribution
    }

    // No attribution match found
    return null
  }

  /**
   * Try to attribute via explicit workflow run ID in checkout metadata.
   * This is the highest confidence method (wid_link).
   */
  private async tryLinkBasedAttribution(
    projectId: string,
    eventId: number,
    workflowRunId: string,
    amountCents: number,
    currency: string
  ): Promise<Attribution | null> {
    // Verify the workflow run exists and belongs to this project
    const runCheck = await this.pool.query(
      `SELECT id FROM workflow_runs
       WHERE id = $1 AND project_id = $2 AND status = 'succeeded'`,
      [workflowRunId, projectId]
    )

    if (runCheck.rows.length === 0) {
      console.warn(`${LOG_PREFIX} Invalid wid for attribution:`, { workflowRunId, projectId, eventId })
      return null
    }

    // Insert attribution with high confidence
    return this.insertAttribution({
      projectId,
      workflowRunId,
      paymentEventId: eventId,
      model: 'last_touch_48h',
      matchMethod: 'wid_link',
      amountCents,
      currency,
      confidence: 'high',
    })
  }

  /**
   * Try to attribute via email matching with recovery_email_sent events.
   * Falls back to cart_match or amount_match if cart/amount criteria met.
   */
  private async tryEmailBasedAttribution(
    projectId: string,
    eventId: number,
    customerEmail: string,
    amountCents: number,
    currency: string,
    occurredAt: string,
    cartId?: string
  ): Promise<Attribution | null> {
    // Find most recent workflow run that sent recovery email to this customer
    // within the attribution window
    const result = await this.pool.query(
      `
      SELECT
        wr.id as workflow_run_id,
        be.payload->>'abandoned_cart_id' as cart_id,
        (be.payload->>'abandoned_amount_cents')::bigint as abandoned_amount_cents,
        be.payload->>'currency' as email_currency
      FROM business_events be
      JOIN workflow_runs wr ON (
        (be.payload->>'workflow_run_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        AND (be.payload->>'workflow_run_id')::uuid = wr.id
      )
      WHERE be.project_id = $1
        AND be.event_type = 'recovery_email_sent'
        AND LOWER(TRIM(be.payload->>'recipient_email')) = $2
        AND be.occurred_at > ($3::timestamptz - interval '${ATTRIBUTION_WINDOW_HOURS} hours')
        AND be.occurred_at < $3::timestamptz
        AND wr.status = 'succeeded'
      ORDER BY be.occurred_at DESC
      LIMIT 1
      `,
      [projectId, customerEmail, occurredAt]
    )

    if (result.rows.length === 0) {
      return null
    }

    const row = result.rows[0]

    // Currency safety: Skip cross-currency attribution
    if (row.email_currency && row.email_currency !== currency) {
      console.log(`${LOG_PREFIX} Skipped attribution - currency mismatch:`, {
        eventId,
        eventCurrency: currency,
        emailCurrency: row.email_currency,
      })
      return null
    }

    // Determine match method and confidence
    let matchMethod: 'email_exact' | 'cart_match' | 'amount_match' = 'email_exact'
    let confidence: 'high' | 'medium' | 'low' = 'medium'

    // Higher confidence if cart ID matches
    if (cartId && row.cart_id === cartId) {
      matchMethod = 'cart_match'
      confidence = 'high'
    }
    // Or if amount matches exactly
    else if (row.abandoned_amount_cents === amountCents) {
      matchMethod = 'amount_match'
      // Still medium confidence - amount alone isn't definitive
    }

    return this.insertAttribution({
      projectId,
      workflowRunId: row.workflow_run_id,
      paymentEventId: eventId,
      model: 'last_touch_48h',
      matchMethod,
      amountCents,
      currency,
      confidence,
    })
  }

  /**
   * Insert an attribution record.
   * Uses UNIQUE constraint to prevent duplicate attributions.
   */
  private async insertAttribution(input: {
    projectId: string
    workflowRunId: string
    paymentEventId: number
    model: 'last_touch_48h'
    matchMethod: 'wid_link' | 'email_exact' | 'cart_match' | 'amount_match'
    amountCents: number
    currency: string
    confidence: 'high' | 'medium' | 'low'
  }): Promise<Attribution | null> {
    try {
      const result = await this.pool.query(
        `
        INSERT INTO workflow_attributions (
          project_id,
          workflow_run_id,
          payment_event_id,
          model,
          match_method,
          amount_cents,
          currency,
          confidence
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (payment_event_id) DO NOTHING
        RETURNING id, attributed_at
        `,
        [
          input.projectId,
          input.workflowRunId,
          input.paymentEventId,
          input.model,
          input.matchMethod,
          input.amountCents,
          input.currency.toUpperCase(),
          input.confidence,
        ]
      )

      if (result.rows.length === 0) {
        // Conflict - already attributed
        // Attribution already exists (conflict)
        return null
      }

      const attribution: Attribution = {
        id: result.rows[0].id,
        projectId: input.projectId,
        workflowRunId: input.workflowRunId,
        paymentEventId: input.paymentEventId,
        attributedAt: result.rows[0].attributed_at.toISOString(),
        model: input.model,
        matchMethod: input.matchMethod,
        amountCents: input.amountCents,
        currency: input.currency.toUpperCase(),
        confidence: input.confidence,
      }

      console.log(`${LOG_PREFIX} Attribution recorded:`, {
        attributionId: attribution.id,
        workflowRunId: input.workflowRunId,
        paymentEventId: input.paymentEventId,
        matchMethod: input.matchMethod,
        confidence: input.confidence,
        amountCents: input.amountCents,
        currency: input.currency,
      })

      return attribution
    } catch (err) {
      console.error(`${LOG_PREFIX} Attribution insert failed:`, (err as Error).message, input)
      return null
    }
  }

  /**
   * Get impact summary for a workflow run.
   * Used for displaying outcomes in workflow status UI.
   */
  async getWorkflowImpact(runId: string): Promise<WorkflowImpact> {
    // Group by currency to avoid MAX(currency) non-determinism
    const result = await this.pool.query(
      `
      SELECT
        currency,
        COUNT(*) as conversions,
        COALESCE(SUM(amount_cents), 0) as recovered_revenue_cents
      FROM workflow_attributions
      WHERE workflow_run_id = $1
      GROUP BY currency
      ORDER BY recovered_revenue_cents DESC
      `,
      [runId]
    )

    // Get total recipients from workflow run
    const runResult = await this.pool.query(
      `SELECT result->>'totalRecipients' as total_recipients FROM workflow_runs WHERE id = $1`,
      [runId]
    )
    const totalRecipients = parseInt(runResult.rows[0]?.total_recipients || '0', 10)

    // Build per-currency breakdown
    const currencyBreakdown: CurrencyAmount[] = result.rows.map(row => ({
      currency: row.currency || 'USD',
      amountCents: parseInt(row.recovered_revenue_cents, 10),
      count: parseInt(row.conversions, 10),
    }))

    // Total conversions and revenue across all currencies
    const totalConversions = currencyBreakdown.reduce((sum, c) => sum + c.count, 0)
    const totalRevenueCents = currencyBreakdown.reduce((sum, c) => sum + c.amountCents, 0)
    // Primary currency = highest revenue currency
    const primaryCurrency = currencyBreakdown[0]?.currency || 'USD'

    return {
      totalRecipients,
      conversions: totalConversions,
      recoveredRevenueCents: totalRevenueCents,
      currency: primaryCurrency,
      currencyBreakdown: currencyBreakdown.length > 1 ? currencyBreakdown : undefined,
    }
  }

  /**
   * Get all attributions for a project within a date range.
   * Used for daily digests and reporting.
   */
  async listAttributions(
    projectId: string,
    options: { startDate?: string; endDate?: string; limit?: number } = {}
  ): Promise<Attribution[]> {
    const { startDate, endDate, limit = 100 } = options
    const conditions: string[] = ['project_id = $1']
    const params: (string | number)[] = [projectId]
    let paramIndex = 2

    if (startDate) {
      conditions.push(`attributed_at >= $${paramIndex++}`)
      params.push(startDate)
    }

    if (endDate) {
      conditions.push(`attributed_at <= $${paramIndex++}`)
      params.push(endDate)
    }

    params.push(limit)

    const result = await this.pool.query(
      `
      SELECT
        id,
        project_id,
        workflow_run_id,
        payment_event_id,
        attributed_at,
        model,
        match_method,
        amount_cents,
        currency,
        confidence
      FROM workflow_attributions
      WHERE ${conditions.join(' AND ')}
      ORDER BY attributed_at DESC
      LIMIT $${paramIndex}
      `,
      params
    )

    return result.rows.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      workflowRunId: row.workflow_run_id,
      paymentEventId: row.payment_event_id,
      attributedAt: row.attributed_at.toISOString(),
      model: row.model,
      matchMethod: row.match_method,
      amountCents: parseInt(row.amount_cents, 10),
      currency: row.currency,
      confidence: row.confidence,
    }))
  }
}

// ============================================
// SINGLETON FACTORY
// ============================================

let attributionServiceInstance: AttributionService | null = null

export function getAttributionService(): AttributionService {
  if (!attributionServiceInstance) {
    attributionServiceInstance = new AttributionService()
  }
  return attributionServiceInstance
}

/** Reset singleton for testing */
export function resetAttributionServiceInstance(): void {
  attributionServiceInstance = null
}
