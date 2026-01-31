/**
 * InhousePaymentsService
 *
 * Payment processing for Easy Mode projects using BYO (Bring Your Own) Stripe keys.
 * Each project stores their own Stripe secret key in @sheenapps/secrets.
 *
 * Architecture:
 * - Stripe secret key stored in secrets table (name: 'stripe_secret_key')
 * - Webhook secret stored in secrets table (name: 'stripe_webhook_secret')
 * - All Stripe operations use the project's own credentials
 * - Payment events are stored per-project for tracking
 */

import Stripe from 'stripe'
import { Pool } from 'pg'
import { getPool } from '../database'
import { getBusinessEventsService } from '../businessEventsService'

// =============================================================================
// Types
// =============================================================================

export interface PaymentClientConfig {
  projectId: string
  stripeSecretKey: string
  stripeWebhookSecret?: string
}

export interface CreateCheckoutParams {
  priceId: string
  successUrl: string
  cancelUrl: string
  customerId?: string
  customerEmail?: string
  mode?: 'payment' | 'subscription' | 'setup'
  quantity?: number
  metadata?: Record<string, string>
  idempotencyKey?: string
  allowPromotionCodes?: boolean
  clientReferenceId?: string
}

export interface CreatePortalParams {
  customerId: string
  returnUrl: string
}

export interface CreateCustomerParams {
  email: string
  name?: string
  metadata?: Record<string, string>
}

export interface GetSubscriptionParams {
  subscriptionId: string
}

export interface CancelSubscriptionParams {
  subscriptionId: string
  immediately?: boolean
}

export interface WebhookEventResult {
  id: string
  type: string
  data: Record<string, unknown>
  created: number
}

export interface CheckoutSession {
  id: string
  url: string
  status: string
  customerId: string | null
  customerEmail: string | null
  mode: string
  metadata: Record<string, string>
  expiresAt: string
}

export interface Customer {
  id: string
  email: string | null
  name: string | null
  metadata: Record<string, string>
  created: string
}

export interface Subscription {
  id: string
  status: string
  customerId: string
  priceId: string | null
  productId: string | null
  currentPeriodStart: string
  currentPeriodEnd: string
  cancelAtPeriodEnd: boolean
  canceledAt: string | null
  metadata: Record<string, string>
}

export interface PortalSession {
  id: string
  url: string
  returnUrl: string
  created: string
}

export interface PaymentEvent {
  id: string
  projectId: string
  stripeEventId: string
  eventType: string
  eventData: Record<string, unknown>
  customerId: string | null
  subscriptionId: string | null
  status: 'pending' | 'processed' | 'failed'
  processedAt: string | null
  createdAt: string
}

// =============================================================================
// Stripe Client Cache
// =============================================================================

// Cache Stripe clients per project to avoid recreating on every request
const stripeClientCache = new Map<string, { client: Stripe; createdAt: number }>()
const CLIENT_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes
const MAX_CLIENT_CACHE_SIZE = 100
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

function getCachedStripeClient(projectId: string, secretKey: string): Stripe {
  const cached = stripeClientCache.get(projectId)
  const now = Date.now()

  if (cached && now - cached.createdAt < CLIENT_CACHE_TTL_MS) {
    return cached.client
  }

  const client = new Stripe(secretKey, {
    apiVersion: '2024-11-20.acacia' as Stripe.LatestApiVersion,
    typescript: true
  })

  stripeClientCache.set(projectId, { client, createdAt: now })
  return client
}

function cleanupStripeClientCache(): void {
  const now = Date.now()

  // Remove entries older than TTL
  for (const [projectId, cached] of stripeClientCache.entries()) {
    if (now - cached.createdAt > CLIENT_CACHE_TTL_MS) {
      stripeClientCache.delete(projectId)
    }
  }

  // Enforce max size by removing oldest entries
  if (stripeClientCache.size > MAX_CLIENT_CACHE_SIZE) {
    const entries = [...stripeClientCache.entries()]
      .sort((a, b) => a[1].createdAt - b[1].createdAt)
    const toDelete = entries.slice(0, entries.length - MAX_CLIENT_CACHE_SIZE)
    for (const [key] of toDelete) {
      stripeClientCache.delete(key)
    }
  }
}

// Clean up stale clients periodically
setInterval(cleanupStripeClientCache, CLEANUP_INTERVAL_MS)

// =============================================================================
// Service Class
// =============================================================================

export class InhousePaymentsService {
  private pool: Pool
  private stripe: Stripe
  private projectId: string
  private webhookSecret?: string

  constructor(config: PaymentClientConfig) {
    this.pool = getPool()
    this.projectId = config.projectId
    this.webhookSecret = config.stripeWebhookSecret
    this.stripe = getCachedStripeClient(config.projectId, config.stripeSecretKey)
  }

  // ---------------------------------------------------------------------------
  // Customer Operations
  // ---------------------------------------------------------------------------

  async createCustomer(params: CreateCustomerParams): Promise<Customer> {
    const customer = await this.stripe.customers.create({
      email: params.email,
      name: params.name,
      metadata: {
        ...params.metadata,
        projectId: this.projectId
      }
    })

    // Store customer mapping
    await this.pool.query(
      `INSERT INTO inhouse_payment_customers (id, project_id, stripe_customer_id, email, name, metadata)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
       ON CONFLICT (project_id, stripe_customer_id) DO UPDATE
       SET email = EXCLUDED.email, name = EXCLUDED.name, metadata = EXCLUDED.metadata, updated_at = now()`,
      [this.projectId, customer.id, customer.email, customer.name, params.metadata || {}]
    )

    return {
      id: customer.id,
      email: customer.email ?? null,
      name: customer.name ?? null,
      metadata: (customer.metadata || {}) as Record<string, string>,
      created: new Date(customer.created * 1000).toISOString()
    }
  }

  async getCustomer(customerId: string): Promise<Customer | null> {
    try {
      const customer = await this.stripe.customers.retrieve(customerId)

      if (customer.deleted) {
        return null
      }

      return {
        id: customer.id,
        email: customer.email ?? null,
        name: customer.name ?? null,
        metadata: (customer.metadata || {}) as Record<string, string>,
        created: new Date(customer.created * 1000).toISOString()
      }
    } catch (error: unknown) {
      const stripeError = error as Stripe.errors.StripeError
      if (stripeError.code === 'resource_missing') {
        return null
      }
      throw error
    }
  }

  // ---------------------------------------------------------------------------
  // Checkout Operations
  // ---------------------------------------------------------------------------

  async createCheckoutSession(params: CreateCheckoutParams): Promise<CheckoutSession> {
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: params.mode || 'subscription',
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      line_items: [
        {
          price: params.priceId,
          quantity: params.quantity || 1
        }
      ],
      metadata: {
        ...params.metadata,
        projectId: this.projectId
      }
    }

    if (params.customerId) {
      sessionParams.customer = params.customerId
    } else if (params.customerEmail) {
      sessionParams.customer_email = params.customerEmail
    }

    if (params.allowPromotionCodes) {
      sessionParams.allow_promotion_codes = true
    }

    if (params.clientReferenceId) {
      sessionParams.client_reference_id = params.clientReferenceId
    }

    const requestOptions: Stripe.RequestOptions = {}
    if (params.idempotencyKey) {
      requestOptions.idempotencyKey = params.idempotencyKey
    }

    const session = await this.stripe.checkout.sessions.create(sessionParams, requestOptions)

    // Emit checkout_started business event (fire-and-forget)
    void getBusinessEventsService().insertEvent({
      projectId: this.projectId,
      eventType: 'checkout_started',
      occurredAt: new Date().toISOString(),
      source: 'server',
      idempotencyKey: `checkout:${session.id}`,
      payload: {
        sessionId: session.id,
        mode: session.mode || 'subscription',
        priceId: params.priceId,
        customerEmail: session.customer_email || params.customerEmail || null,
      },
      entityType: 'checkout_session',
      entityId: session.id,
    }).catch(err => {
      console.error('[InhousePaymentsService] Failed to emit checkout_started event:', err)
    })

    return {
      id: session.id,
      url: session.url || '',
      status: session.status || 'open',
      customerId: typeof session.customer === 'string' ? session.customer : session.customer?.id || null,
      customerEmail: session.customer_email,
      mode: session.mode || 'subscription',
      metadata: (session.metadata || {}) as Record<string, string>,
      expiresAt: new Date(session.expires_at * 1000).toISOString()
    }
  }

  // ---------------------------------------------------------------------------
  // Portal Operations
  // ---------------------------------------------------------------------------

  async createPortalSession(params: CreatePortalParams): Promise<PortalSession> {
    const session = await this.stripe.billingPortal.sessions.create({
      customer: params.customerId,
      return_url: params.returnUrl
    })

    return {
      id: session.id,
      url: session.url,
      returnUrl: session.return_url || params.returnUrl,
      created: new Date(session.created * 1000).toISOString()
    }
  }

  // ---------------------------------------------------------------------------
  // Subscription Operations
  // ---------------------------------------------------------------------------

  async getSubscription(params: GetSubscriptionParams): Promise<Subscription | null> {
    try {
      const subscription = await this.stripe.subscriptions.retrieve(params.subscriptionId) as Stripe.Subscription

      const item = subscription.items.data[0]

      return {
        id: subscription.id,
        status: subscription.status,
        customerId: typeof subscription.customer === 'string'
          ? subscription.customer
          : subscription.customer.id,
        priceId: item?.price?.id || null,
        productId: typeof item?.price?.product === 'string'
          ? item.price.product
          : item?.price?.product?.id || null,
        currentPeriodStart: new Date((subscription as any).current_period_start * 1000).toISOString(),
        currentPeriodEnd: new Date((subscription as any).current_period_end * 1000).toISOString(),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        canceledAt: subscription.canceled_at
          ? new Date(subscription.canceled_at * 1000).toISOString()
          : null,
        metadata: (subscription.metadata || {}) as Record<string, string>
      }
    } catch (error: unknown) {
      const stripeError = error as Stripe.errors.StripeError
      if (stripeError.code === 'resource_missing') {
        return null
      }
      throw error
    }
  }

  async cancelSubscription(params: CancelSubscriptionParams): Promise<Subscription> {
    let subscription: Stripe.Subscription

    if (params.immediately) {
      subscription = await this.stripe.subscriptions.cancel(params.subscriptionId)
    } else {
      subscription = await this.stripe.subscriptions.update(params.subscriptionId, {
        cancel_at_period_end: true
      })
    }

    const item = subscription.items.data[0]

    return {
      id: subscription.id,
      status: subscription.status,
      customerId: typeof subscription.customer === 'string'
        ? subscription.customer
        : subscription.customer.id,
      priceId: item?.price?.id || null,
      productId: typeof item?.price?.product === 'string'
        ? item.price.product
        : item?.price?.product?.id || null,
      currentPeriodStart: new Date((subscription as any).current_period_start * 1000).toISOString(),
      currentPeriodEnd: new Date((subscription as any).current_period_end * 1000).toISOString(),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      canceledAt: subscription.canceled_at
        ? new Date(subscription.canceled_at * 1000).toISOString()
        : null,
      metadata: (subscription.metadata || {}) as Record<string, string>
    }
  }

  async listSubscriptions(customerId: string): Promise<Subscription[]> {
    const subscriptions = await this.stripe.subscriptions.list({
      customer: customerId,
      limit: 100
    })

    return subscriptions.data.map(subscription => {
      const item = subscription.items.data[0]

      return {
        id: subscription.id,
        status: subscription.status,
        customerId: typeof subscription.customer === 'string'
          ? subscription.customer
          : subscription.customer.id,
        priceId: item?.price?.id || null,
        productId: typeof item?.price?.product === 'string'
          ? item.price.product
          : item?.price?.product?.id || null,
        currentPeriodStart: new Date((subscription as any).current_period_start * 1000).toISOString(),
        currentPeriodEnd: new Date((subscription as any).current_period_end * 1000).toISOString(),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        canceledAt: subscription.canceled_at
          ? new Date(subscription.canceled_at * 1000).toISOString()
          : null,
        metadata: (subscription.metadata || {}) as Record<string, string>
      }
    })
  }

  // ---------------------------------------------------------------------------
  // Webhook Operations
  // ---------------------------------------------------------------------------

  async verifyWebhook(
    payload: string | Buffer,
    signature: string
  ): Promise<{ event: WebhookEventResult } | { error: string }> {
    if (!this.webhookSecret) {
      return { error: 'Webhook secret not configured' }
    }

    try {
      const event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        this.webhookSecret
      )

      return {
        event: {
          id: event.id,
          type: event.type,
          data: event.data.object as unknown as Record<string, unknown>,
          created: event.created
        }
      }
    } catch (error: unknown) {
      const stripeError = error as Error
      return { error: `Webhook verification failed: ${stripeError.message}` }
    }
  }

  async storeWebhookEvent(event: WebhookEventResult): Promise<void> {
    // Deduplicate by stripe event ID
    const result = await this.pool.query(
      `INSERT INTO inhouse_payment_events
       (id, project_id, stripe_event_id, event_type, event_data, status, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'pending', now())
       ON CONFLICT (project_id, stripe_event_id) DO NOTHING
       RETURNING id`,
      [this.projectId, event.id, event.type, event.data]
    )

    if (result.rows.length === 0) {
      // Already processed - this is a duplicate
      return
    }

    // Extract customer and subscription IDs based on event type
    const eventData = event.data as Record<string, unknown>
    const customerId = (eventData.customer as string) || null

    // For subscription events, the data object IS the subscription
    // For invoice/charge events, subscription ID is in the .subscription field
    let subscriptionId: string | null = null
    if (event.type.startsWith('customer.subscription.')) {
      subscriptionId = eventData.id as string || null
    } else if (eventData.subscription) {
      subscriptionId = eventData.subscription as string
    }

    if (customerId || subscriptionId) {
      await this.pool.query(
        `UPDATE inhouse_payment_events
         SET customer_id = $1, subscription_id = $2
         WHERE project_id = $3 AND stripe_event_id = $4`,
        [customerId, subscriptionId, this.projectId, event.id]
      )
    }

    // =========================================================================
    // PHASE 1: Emit business events for Run Hub KPIs
    // =========================================================================
    await this.emitBusinessEventFromStripe(event, customerId, subscriptionId)
  }

  /**
   * Map Stripe webhook events to business events for Run Hub KPIs.
   * Only emits events that feed into the KPI rollup job.
   */
  private async emitBusinessEventFromStripe(
    event: WebhookEventResult,
    customerId: string | null,
    subscriptionId: string | null
  ): Promise<void> {
    const eventData = event.data as Record<string, unknown>
    const businessEventsService = getBusinessEventsService()
    const occurredAt = new Date(event.created * 1000).toISOString()

    try {
      switch (event.type) {
        // Payment succeeded (one-time or subscription payment)
        case 'payment_intent.succeeded': {
          const amountCents = (eventData.amount as number) || 0
          const currency = ((eventData.currency as string) || 'usd').toUpperCase()

          await businessEventsService.insertEvent({
            projectId: this.projectId,
            eventType: 'payment_succeeded',
            occurredAt,
            source: 'webhook',
            idempotencyKey: `stripe:${event.id}`,
            entityType: 'payment_intent',
            entityId: eventData.id as string,
            actorType: customerId ? 'customer' : undefined,
            actorId: customerId || undefined,
            payload: {
              amount_cents: amountCents,
              currency,
              stripe_event_id: event.id,
              payment_intent_id: eventData.id
            }
          })
          break
        }

        // Invoice payment succeeded (subscription renewals)
        case 'invoice.payment_succeeded': {
          const amountCents = (eventData.amount_paid as number) || 0
          const currency = ((eventData.currency as string) || 'usd').toUpperCase()

          await businessEventsService.insertEvent({
            projectId: this.projectId,
            eventType: 'payment_succeeded',
            occurredAt,
            source: 'webhook',
            idempotencyKey: `stripe:${event.id}`,
            entityType: 'invoice',
            entityId: eventData.id as string,
            actorType: customerId ? 'customer' : undefined,
            actorId: customerId || undefined,
            correlationId: subscriptionId || undefined,
            payload: {
              amount_cents: amountCents,
              currency,
              stripe_event_id: event.id,
              invoice_id: eventData.id,
              subscription_id: subscriptionId
            }
          })
          break
        }

        // Charge refunded
        case 'charge.refunded': {
          const amountRefunded = (eventData.amount_refunded as number) || 0
          const currency = ((eventData.currency as string) || 'usd').toUpperCase()

          await businessEventsService.insertEvent({
            projectId: this.projectId,
            eventType: 'refund_issued',
            occurredAt,
            source: 'webhook',
            idempotencyKey: `stripe:${event.id}`,
            entityType: 'charge',
            entityId: eventData.id as string,
            actorType: customerId ? 'customer' : undefined,
            actorId: customerId || undefined,
            payload: {
              amount_cents: amountRefunded,
              currency,
              stripe_event_id: event.id,
              charge_id: eventData.id,
              payment_intent_id: eventData.payment_intent
            }
          })
          break
        }

        // Subscription started
        case 'customer.subscription.created': {
          await businessEventsService.insertEvent({
            projectId: this.projectId,
            eventType: 'subscription_started',
            occurredAt,
            source: 'webhook',
            idempotencyKey: `stripe:${event.id}`,
            entityType: 'subscription',
            entityId: eventData.id as string,
            actorType: customerId ? 'customer' : undefined,
            actorId: customerId || undefined,
            payload: {
              stripe_event_id: event.id,
              subscription_id: eventData.id,
              status: eventData.status
            }
          })
          break
        }

        // Subscription canceled
        case 'customer.subscription.deleted': {
          await businessEventsService.insertEvent({
            projectId: this.projectId,
            eventType: 'subscription_canceled',
            occurredAt,
            source: 'webhook',
            idempotencyKey: `stripe:${event.id}`,
            entityType: 'subscription',
            entityId: eventData.id as string,
            actorType: customerId ? 'customer' : undefined,
            actorId: customerId || undefined,
            payload: {
              stripe_event_id: event.id,
              subscription_id: eventData.id,
              canceled_at: eventData.canceled_at
            }
          })
          break
        }

        // Checkout completed - could trigger lead_created or signup
        case 'checkout.session.completed': {
          const mode = eventData.mode as string
          // If it's a subscription checkout, the customer signed up
          if (mode === 'subscription') {
            await businessEventsService.insertEvent({
              projectId: this.projectId,
              eventType: 'signup',
              occurredAt,
              source: 'webhook',
              idempotencyKey: `stripe:${event.id}:signup`,
              entityType: 'checkout_session',
              entityId: eventData.id as string,
              actorType: customerId ? 'customer' : undefined,
              actorId: customerId || undefined,
              payload: {
                stripe_event_id: event.id,
                checkout_session_id: eventData.id,
                mode
              }
            })
          }
          break
        }

        // Payment failed - for Run Hub alerts
        case 'invoice.payment_failed': {
          await businessEventsService.insertEvent({
            projectId: this.projectId,
            eventType: 'payment_failed',
            occurredAt,
            source: 'webhook',
            idempotencyKey: `stripe:${event.id}`,
            entityType: 'invoice',
            entityId: eventData.id as string,
            actorType: customerId ? 'customer' : undefined,
            actorId: customerId || undefined,
            correlationId: subscriptionId || undefined,
            payload: {
              stripe_event_id: event.id,
              invoice_id: eventData.id,
              subscription_id: subscriptionId,
              attempt_count: eventData.attempt_count
            }
          })
          break
        }

        default:
          // Other Stripe events don't map to business KPIs
          break
      }
    } catch (error) {
      // Log but don't fail the webhook - payment event is already stored
      console.error('[InhousePaymentsService] Failed to emit business event:', error, {
        projectId: this.projectId,
        stripeEventType: event.type,
        stripeEventId: event.id
      })
    }
  }

  async markEventProcessed(stripeEventId: string, status: 'processed' | 'failed'): Promise<void> {
    await this.pool.query(
      `UPDATE inhouse_payment_events
       SET status = $1, processed_at = now()
       WHERE project_id = $2 AND stripe_event_id = $3`,
      [status, this.projectId, stripeEventId]
    )
  }

  async listEvents(options: {
    eventType?: string
    status?: 'pending' | 'processed' | 'failed'
    limit?: number
    offset?: number
  } = {}): Promise<{ events: PaymentEvent[]; total: number }> {
    const { eventType, status, limit = 20, offset = 0 } = options

    let query = `
      SELECT id, project_id, stripe_event_id, event_type, event_data,
             customer_id, subscription_id, status, processed_at, created_at
      FROM inhouse_payment_events
      WHERE project_id = $1
    `
    const params: (string | number)[] = [this.projectId]
    let paramIndex = 2

    if (eventType) {
      query += ` AND event_type = $${paramIndex++}`
      params.push(eventType)
    }

    if (status) {
      query += ` AND status = $${paramIndex++}`
      params.push(status)
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`
    params.push(limit, offset)

    const result = await this.pool.query(query, params)

    // Get total count
    let countQuery = `SELECT COUNT(*) FROM inhouse_payment_events WHERE project_id = $1`
    const countParams: (string | number)[] = [this.projectId]
    let countParamIndex = 2

    if (eventType) {
      countQuery += ` AND event_type = $${countParamIndex++}`
      countParams.push(eventType)
    }

    if (status) {
      countQuery += ` AND status = $${countParamIndex++}`
      countParams.push(status)
    }

    const countResult = await this.pool.query(countQuery, countParams)

    return {
      events: result.rows.map(row => ({
        id: row.id,
        projectId: row.project_id,
        stripeEventId: row.stripe_event_id,
        eventType: row.event_type,
        eventData: row.event_data,
        customerId: row.customer_id,
        subscriptionId: row.subscription_id,
        status: row.status,
        processedAt: row.processed_at?.toISOString() || null,
        createdAt: row.created_at.toISOString()
      })),
      total: parseInt(countResult.rows[0].count, 10)
    }
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a payments service for a project.
 *
 * @param projectId - The project ID
 * @param stripeSecretKey - The project's Stripe secret key (from secrets)
 * @param stripeWebhookSecret - Optional webhook secret for verifying webhooks
 */
/**
 * Create an InhousePaymentsService instance with project validation.
 *
 * @throws Error if project does not exist
 */
export async function createInhousePaymentsService(
  projectId: string,
  stripeSecretKey: string,
  stripeWebhookSecret?: string
): Promise<InhousePaymentsService> {
  // Validate project exists (defense-in-depth - routes also check ownership)
  const pool = getPool()
  const result = await pool.query(
    'SELECT id FROM projects WHERE id = $1',
    [projectId]
  )

  if (result.rows.length === 0) {
    throw new Error(`Project not found: ${projectId}`)
  }

  return new InhousePaymentsService({
    projectId,
    stripeSecretKey,
    stripeWebhookSecret
  })
}
