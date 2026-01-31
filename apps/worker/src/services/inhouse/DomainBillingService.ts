/**
 * Domain Billing Service
 *
 * Handles Stripe billing for domain registration and renewal.
 * Uses SheenApps' platform Stripe account (not BYO).
 *
 * Key features:
 * - Payment intents for one-time domain purchases
 * - Saved payment methods for auto-renewal
 * - Invoice generation for domain-related charges
 * - Integration with InhouseDomainRegistrationService
 *
 * Architecture:
 * - Uses StripeProvider for common operations (customer management, refunds)
 * - Domain-specific operations (SetupIntents, off-session payments) use Stripe SDK directly
 * - Shared Stripe config via getStripeConfig() for consistency
 *
 * Part of easy-mode-email-plan.md (Phase 3: Domain Registration)
 */

import Stripe from 'stripe'
import { getPool } from '../databaseWrapper'
import { logActivity } from './InhouseActivityLogger'
import { StripeProvider } from '../payment/StripeProvider'
import { getStripeConfig } from '../../config/stripeEnvironmentValidation'
import { PaymentError } from '../payment/types'

// =============================================================================
// TYPES
// =============================================================================

export interface DomainPaymentInput {
  userId: string
  userEmail: string
  domain: string
  amountCents: number
  currency?: string
  paymentMethodId?: string
  description?: string
  metadata?: Record<string, string>
}

export interface DomainPaymentResult {
  success: boolean
  paymentIntentId?: string
  paymentIntentClientSecret?: string
  status?: 'succeeded' | 'requires_action' | 'requires_payment_method' | 'processing' | 'canceled'
  error?: string
}

export interface SetupIntentInput {
  userId: string
  userEmail: string
  /**
   * Return URL for client-side payment method confirmation.
   * Currently unused server-side; client uses this for Stripe.js confirmSetup()
   * @see https://stripe.com/docs/js/setup_intents/confirm_setup
   */
  returnUrl: string
}

export interface SetupIntentResult {
  success: boolean
  setupIntentId?: string
  clientSecret?: string
  error?: string
}

export interface SavedPaymentMethod {
  id: string
  type: string
  card?: {
    brand: string
    last4: string
    expMonth: number
    expYear: number
  }
  isDefault: boolean
  createdAt: string
}

export interface DomainInvoice {
  id: string
  domainId: string
  userId: string
  amountCents: number
  currency: string
  status: 'draft' | 'open' | 'paid' | 'uncollectible' | 'void'
  invoiceType: 'registration' | 'renewal' | 'transfer'
  stripeInvoiceId?: string
  stripePaymentIntentId?: string
  paidAt?: string
  createdAt: string
}

// =============================================================================
// SERVICE
// =============================================================================

export class DomainBillingService {
  private stripe: Stripe
  private stripeProvider: StripeProvider
  private pool: ReturnType<typeof getPool>

  constructor() {
    // Use shared Stripe config for consistency with StripeProvider
    const config = getStripeConfig()

    this.stripe = new Stripe(config.secretKey, {
      apiVersion: '2025-08-27.basil' as Stripe.LatestApiVersion,
      telemetry: false,
      timeout: 15000,
    })

    // Use StripeProvider for common operations (customer management, refunds)
    this.stripeProvider = new StripeProvider()

    this.pool = getPool()
    console.log('[DomainBillingService] Initialized with StripeProvider integration')
  }

  // ===========================================================================
  // Customer Management
  // ===========================================================================

  /**
   * Get or create a Stripe customer for domain billing
   * Delegates to StripeProvider for race-safe customer management with idempotency
   */
  async getOrCreateCustomer(userId: string, email: string): Promise<string> {
    try {
      // Use StripeProvider's race-safe implementation with idempotency
      const customer = await this.stripeProvider.getOrCreateCustomer(userId, email)
      return customer.stripe_customer_id
    } catch (error) {
      // Wrap StripeProvider errors for consistent domain billing error handling
      if (error instanceof PaymentError) {
        console.error('[DomainBilling] Customer management failed:', error.message)
        throw error
      }
      throw new PaymentError('STRIPE_API_ERROR', `Customer management failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // ===========================================================================
  // Payment Methods
  // ===========================================================================

  /**
   * Create a SetupIntent for saving a payment method
   */
  async createSetupIntent(input: SetupIntentInput): Promise<SetupIntentResult> {
    try {
      const customerId = await this.getOrCreateCustomer(input.userId, input.userEmail)

      const setupIntent = await this.stripe.setupIntents.create({
        customer: customerId,
        payment_method_types: ['card'],
        usage: 'off_session', // For future auto-renewals
        metadata: {
          user_id: input.userId,
          purpose: 'domain_billing',
        },
      })

      return {
        success: true,
        setupIntentId: setupIntent.id,
        clientSecret: setupIntent.client_secret || undefined,
      }
    } catch (error) {
      console.error('[DomainBilling] Failed to create setup intent:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create setup intent',
      }
    }
  }

  /**
   * List saved payment methods for a user
   */
  async listPaymentMethods(userId: string): Promise<SavedPaymentMethod[]> {
    const { rows } = await this.pool.query(
      `SELECT provider_customer_id FROM billing_customers WHERE user_id = $1`,
      [userId]
    )

    if (rows.length === 0 || !rows[0].provider_customer_id) {
      return []
    }

    const customerId = rows[0].provider_customer_id

    const paymentMethods = await this.stripe.paymentMethods.list({
      customer: customerId,
      type: 'card',
    })

    // Get default payment method
    const customer = await this.stripe.customers.retrieve(customerId) as Stripe.Customer
    const defaultPaymentMethodId = typeof customer.invoice_settings?.default_payment_method === 'string'
      ? customer.invoice_settings.default_payment_method
      : customer.invoice_settings?.default_payment_method?.id

    return paymentMethods.data.map(pm => ({
      id: pm.id,
      type: pm.type,
      card: pm.card ? {
        brand: pm.card.brand,
        last4: pm.card.last4,
        expMonth: pm.card.exp_month,
        expYear: pm.card.exp_year,
      } : undefined,
      isDefault: pm.id === defaultPaymentMethodId,
      createdAt: new Date(pm.created * 1000).toISOString(),
    }))
  }

  /**
   * Set default payment method for a user
   */
  async setDefaultPaymentMethod(userId: string, paymentMethodId: string): Promise<boolean> {
    const { rows } = await this.pool.query(
      `SELECT provider_customer_id FROM billing_customers WHERE user_id = $1`,
      [userId]
    )

    if (rows.length === 0 || !rows[0].provider_customer_id) {
      return false
    }

    try {
      await this.stripe.customers.update(rows[0].provider_customer_id, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      })
      return true
    } catch (error) {
      console.error('[DomainBilling] Failed to set default payment method:', error)
      return false
    }
  }

  /**
   * Delete a payment method
   */
  async deletePaymentMethod(paymentMethodId: string): Promise<boolean> {
    try {
      await this.stripe.paymentMethods.detach(paymentMethodId)
      return true
    } catch (error) {
      console.error('[DomainBilling] Failed to delete payment method:', error)
      return false
    }
  }

  // ===========================================================================
  // Domain Payments
  // ===========================================================================

  /**
   * Create a payment intent for domain registration
   */
  async createDomainPayment(input: DomainPaymentInput): Promise<DomainPaymentResult> {
    try {
      const customerId = await this.getOrCreateCustomer(input.userId, input.userEmail)

      const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
        amount: input.amountCents,
        currency: input.currency || 'usd',
        customer: customerId,
        description: input.description || `Domain registration: ${input.domain}`,
        metadata: {
          user_id: input.userId,
          domain: input.domain,
          type: 'domain_registration',
          ...input.metadata,
        },
        automatic_payment_methods: {
          enabled: true,
        },
      }

      // If payment method provided, use it
      if (input.paymentMethodId) {
        paymentIntentParams.payment_method = input.paymentMethodId
        paymentIntentParams.confirm = true
        paymentIntentParams.off_session = false
      }

      const paymentIntent = await this.stripe.paymentIntents.create(paymentIntentParams)

      return {
        success: true,
        paymentIntentId: paymentIntent.id,
        paymentIntentClientSecret: paymentIntent.client_secret || undefined,
        status: paymentIntent.status as DomainPaymentResult['status'],
      }
    } catch (error) {
      console.error('[DomainBilling] Failed to create payment:', error)
      const stripeError = error as Stripe.errors.StripeError
      return {
        success: false,
        error: stripeError.message || 'Payment failed',
      }
    }
  }

  /**
   * Confirm a payment intent (when user completes 3DS or other action)
   */
  async confirmPayment(paymentIntentId: string, paymentMethodId?: string): Promise<DomainPaymentResult> {
    try {
      const params: Stripe.PaymentIntentConfirmParams = {}
      if (paymentMethodId) {
        params.payment_method = paymentMethodId
      }

      const paymentIntent = await this.stripe.paymentIntents.confirm(paymentIntentId, params)

      return {
        success: paymentIntent.status === 'succeeded',
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status as DomainPaymentResult['status'],
      }
    } catch (error) {
      console.error('[DomainBilling] Failed to confirm payment:', error)
      const stripeError = error as Stripe.errors.StripeError
      return {
        success: false,
        error: stripeError.message || 'Payment confirmation failed',
      }
    }
  }

  /**
   * Process auto-renewal payment using saved payment method
   */
  async processAutoRenewal(input: {
    userId: string
    userEmail: string
    domainId: string
    domain: string
    amountCents: number
    paymentMethodId: string
  }): Promise<DomainPaymentResult> {
    try {
      const customerId = await this.getOrCreateCustomer(input.userId, input.userEmail)

      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: input.amountCents,
        currency: 'usd',
        customer: customerId,
        payment_method: input.paymentMethodId,
        confirm: true,
        off_session: true, // Automatic charge without user interaction
        description: `Domain renewal: ${input.domain}`,
        metadata: {
          user_id: input.userId,
          domain_id: input.domainId,
          domain: input.domain,
          type: 'domain_renewal',
        },
      })

      // Store invoice record
      await this.recordDomainInvoice({
        domainId: input.domainId,
        userId: input.userId,
        amountCents: input.amountCents,
        currency: 'usd',
        status: paymentIntent.status === 'succeeded' ? 'paid' : 'open',
        invoiceType: 'renewal',
        stripePaymentIntentId: paymentIntent.id,
        paidAt: paymentIntent.status === 'succeeded' ? new Date().toISOString() : undefined,
      })

      return {
        success: paymentIntent.status === 'succeeded',
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status as DomainPaymentResult['status'],
      }
    } catch (error) {
      console.error('[DomainBilling] Auto-renewal payment failed:', error)
      const stripeError = error as Stripe.errors.StripeError

      // Record the failed attempt even if we never got a PaymentIntent
      // This ensures we have an audit trail of all renewal attempts
      try {
        await this.recordDomainInvoice({
          domainId: input.domainId,
          userId: input.userId,
          amountCents: input.amountCents,
          currency: 'usd',
          status: 'open', // Failed attempt recorded as open
          invoiceType: 'renewal',
          // No stripePaymentIntentId since it failed before creation
        })
      } catch (recordError) {
        // Don't let recording failure mask the original error
        console.error('[DomainBilling] Failed to record failed attempt:', recordError)
      }

      // Handle card declined or requires_action
      if (stripeError.code === 'authentication_required') {
        return {
          success: false,
          status: 'requires_action',
          error: 'Payment requires authentication. Please update your payment method.',
        }
      }

      return {
        success: false,
        error: stripeError.message || 'Auto-renewal payment failed',
      }
    }
  }

  /**
   * Refund a domain payment
   * Delegates to StripeProvider for refunds with proper logging and idempotency
   */
  async refundPayment(paymentIntentId: string, reason?: string): Promise<{ success: boolean; refundId?: string; error?: string }> {
    try {
      // Use StripeProvider's createRefund with idempotency support
      const refund = await this.stripeProvider.createRefund(
        {
          payment_intent: paymentIntentId,
          reason: 'requested_by_customer',
          metadata: {
            refund_reason: reason || 'Domain registration failed',
            source: 'domain_billing_service',
          },
        },
        `domain-refund:${paymentIntentId}` // Idempotency key
      )

      return {
        success: refund.status === 'succeeded',
        refundId: refund.id,
      }
    } catch (error) {
      console.error('[DomainBilling] Refund failed:', error)
      if (error instanceof PaymentError) {
        return {
          success: false,
          error: error.message,
        }
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Refund failed',
      }
    }
  }

  // ===========================================================================
  // Invoice Management
  // ===========================================================================

  /**
   * Record a domain invoice in the database
   */
  private async recordDomainInvoice(invoice: {
    domainId: string
    userId: string
    amountCents: number
    currency: string
    status: DomainInvoice['status']
    invoiceType: DomainInvoice['invoiceType']
    stripeInvoiceId?: string
    stripePaymentIntentId?: string
    paidAt?: string
  }): Promise<string> {
    const { rows } = await this.pool.query(
      `INSERT INTO inhouse_domain_invoices (
        domain_id, user_id, amount_cents, currency, status, invoice_type,
        stripe_invoice_id, stripe_payment_intent_id, paid_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id`,
      [
        invoice.domainId,
        invoice.userId,
        invoice.amountCents,
        invoice.currency,
        invoice.status,
        invoice.invoiceType,
        invoice.stripeInvoiceId,
        invoice.stripePaymentIntentId,
        invoice.paidAt,
      ]
    )
    return rows[0].id
  }

  /**
   * Get domain invoices
   */
  async getDomainInvoices(domainId: string): Promise<DomainInvoice[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM inhouse_domain_invoices WHERE domain_id = $1 ORDER BY created_at DESC`,
      [domainId]
    )

    return rows.map(row => ({
      id: row.id,
      domainId: row.domain_id,
      userId: row.user_id,
      amountCents: row.amount_cents,
      currency: row.currency,
      status: row.status,
      invoiceType: row.invoice_type,
      stripeInvoiceId: row.stripe_invoice_id,
      stripePaymentIntentId: row.stripe_payment_intent_id,
      paidAt: row.paid_at?.toISOString(),
      createdAt: row.created_at.toISOString(),
    }))
  }

  /**
   * Update invoice status
   */
  async updateInvoiceStatus(invoiceId: string, status: DomainInvoice['status'], paidAt?: string): Promise<void> {
    await this.pool.query(
      `UPDATE inhouse_domain_invoices
       SET status = $1, paid_at = $2, updated_at = NOW()
       WHERE id = $3`,
      [status, paidAt, invoiceId]
    )
  }

  // ===========================================================================
  // Webhook Handlers
  // ===========================================================================

  /**
   * Handle Stripe webhook event for domain billing
   */
  async handleWebhookEvent(event: Stripe.Event): Promise<{ handled: boolean; action?: string }> {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent
        const metadata = paymentIntent.metadata

        // Only handle domain-related payments
        if (metadata.type !== 'domain_registration' && metadata.type !== 'domain_renewal') {
          return { handled: false }
        }

        // Update invoice status
        if (metadata.domain_id) {
          await this.pool.query(
            `UPDATE inhouse_domain_invoices
             SET status = 'paid', paid_at = NOW()
             WHERE stripe_payment_intent_id = $1`,
            [paymentIntent.id]
          )

          // Update domain record with payment info
          await this.pool.query(
            `UPDATE inhouse_registered_domains
             SET last_payment_id = $1, updated_at = NOW()
             WHERE id = $2`,
            [paymentIntent.id, metadata.domain_id]
          )
        }

        logActivity({
          projectId: metadata.project_id || 'system',
          service: 'domain-billing',
          action: 'payment_succeeded',
          actorType: 'webhook',
          resourceType: 'payment_intent',
          resourceId: paymentIntent.id,
          status: 'success',
          metadata: {
            domain: metadata.domain,
            type: metadata.type,
            amount: paymentIntent.amount,
          },
        })

        return { handled: true, action: 'payment_recorded' }
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent
        const metadata = paymentIntent.metadata

        if (metadata.type !== 'domain_registration' && metadata.type !== 'domain_renewal') {
          return { handled: false }
        }

        // Update invoice status
        await this.pool.query(
          `UPDATE inhouse_domain_invoices
           SET status = 'open', updated_at = NOW()
           WHERE stripe_payment_intent_id = $1`,
          [paymentIntent.id]
        )

        // Record domain event for failed payment
        if (metadata.domain_id) {
          await this.pool.query(
            `INSERT INTO inhouse_domain_events (domain_id, project_id, event_type, metadata, actor_type)
             VALUES ($1, $2, 'payment_failed', $3, 'webhook')`,
            [
              metadata.domain_id,
              metadata.project_id || '',
              JSON.stringify({
                paymentIntentId: paymentIntent.id,
                reason: paymentIntent.last_payment_error?.message,
              }),
            ]
          )
        }

        logActivity({
          projectId: metadata.project_id || 'system',
          service: 'domain-billing',
          action: 'payment_failed',
          actorType: 'webhook',
          resourceType: 'payment_intent',
          resourceId: paymentIntent.id,
          status: 'error',
          metadata: {
            domain: metadata.domain,
            type: metadata.type,
            error: paymentIntent.last_payment_error?.message,
          },
        })

        return { handled: true, action: 'payment_failed_recorded' }
      }

      default:
        return { handled: false }
    }
  }
}

// =============================================================================
// SINGLETON FACTORY
// =============================================================================

let domainBillingService: DomainBillingService | null = null

export function getDomainBillingService(): DomainBillingService {
  if (!domainBillingService) {
    domainBillingService = new DomainBillingService()
  }
  return domainBillingService
}

export function isDomainBillingConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY
}
