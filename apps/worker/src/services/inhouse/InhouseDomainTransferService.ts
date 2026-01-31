/**
 * In-House Domain Transfer Service
 *
 * Handles domain transfer-in lifecycle including:
 * - Eligibility checking
 * - Payment intent creation
 * - Auth code submission (post-payment only)
 * - Transfer status tracking
 *
 * Part of easy-mode-email-enhancements-plan.md (Enhancement 4)
 *
 * Security note: Auth code should ONLY be accepted after payment is confirmed.
 * This prevents collecting sensitive data (EPP codes) without commitment.
 */

import { createHash, randomUUID } from 'crypto'
import Stripe from 'stripe'
import { pool } from '../database'
import { getOpenSrsService, DomainContact, TransferEligibility, TransferInResult } from './OpenSrsService'
import { getCloudflareService, isCloudflareConfigured } from './CloudflareService'
import { createLogger } from '../../observability/logger'
import { getStripeConfig } from '../../config/stripeEnvironmentValidation'

const log = createLogger('domain-transfer-service')

// =============================================================================
// TYPES
// =============================================================================

export interface TransferIntentInput {
  projectId: string
  domain: string
  contacts: {
    owner: DomainContact
    admin?: DomainContact
    billing?: DomainContact
    tech?: DomainContact
  }
  userId: string
  userEmail: string
}

export interface TransferIntentResult {
  transferId: string
  eligible: boolean
  reason?: string
  priceCents: number
  currency: string
  // Payment data if eligible
  stripePaymentIntentId?: string
  clientSecret?: string
  // Source registrar info (if available)
  currentRegistrar?: string
  expiresAt?: string
}

export interface TransferRecord {
  id: string
  projectId: string
  domain: string
  tld: string
  status: string
  statusMessage: string | null
  rawProviderStatus: string | null
  sourceRegistrar: string | null
  contacts: Record<string, unknown>
  priceCents: number
  currency: string
  stripePaymentIntentId: string | null
  opensrsOrderId: string | null
  initiatedAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
  registeredDomainId: string | null
}

export interface ConfirmTransferInput {
  transferId: string
  authCode: string
  nameservers?: string[]
  whoisPrivacy?: boolean
}

// =============================================================================
// SERVICE
// =============================================================================

export class InhouseDomainTransferService {
  private projectId: string
  private openSrs = getOpenSrsService()

  constructor(projectId: string) {
    this.projectId = projectId
  }

  // ===========================================================================
  // Step 1: Create Transfer Intent (before payment)
  // ===========================================================================

  /**
   * Create a transfer intent - checks eligibility and creates payment intent
   *
   * Does NOT require auth code yet. Auth code is only collected after payment.
   */
  async createTransferIntent(input: TransferIntentInput): Promise<TransferIntentResult> {
    const domain = input.domain.toLowerCase().trim()
    const tld = domain.split('.').slice(1).join('.')

    // Check eligibility first
    log.info({ domain, projectId: this.projectId }, 'Checking transfer eligibility')
    const eligibility = await this.openSrs.checkTransferEligibility(domain)

    if (!eligibility.eligible) {
      log.info({ domain, reason: eligibility.reason }, 'Domain not eligible for transfer')
      return {
        transferId: '',
        eligible: false,
        reason: eligibility.reason,
        priceCents: 0,
        currency: 'USD',
      }
    }

    // Get transfer pricing
    const pricing = await this.getTransferPricing(tld)
    if (!pricing) {
      return {
        transferId: '',
        eligible: false,
        reason: `Transfer pricing not available for .${tld} domains`,
        priceCents: 0,
        currency: 'USD',
      }
    }

    // Check for existing pending transfer
    const existingTransfer = await pool?.query(`
      SELECT id, status FROM inhouse_domain_transfers
      WHERE project_id = $1 AND domain = $2 AND status NOT IN ('completed', 'failed', 'cancelled')
      LIMIT 1
    `, [this.projectId, domain])

    if (existingTransfer?.rows && existingTransfer.rows.length > 0) {
      return {
        transferId: existingTransfer.rows[0].id,
        eligible: false,
        reason: `Transfer already in progress for this domain (status: ${existingTransfer.rows[0].status})`,
        priceCents: pricing.priceCents,
        currency: pricing.currency,
      }
    }

    // Create transfer record (pending_payment status, no auth code yet)
    const transferId = randomUUID()
    await pool?.query(`
      INSERT INTO inhouse_domain_transfers
      (id, project_id, domain, tld, contacts, price_cents, currency, status, user_id, user_email, source_registrar)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending_payment', $8, $9, $10)
    `, [
      transferId,
      this.projectId,
      domain,
      tld,
      JSON.stringify(input.contacts),
      pricing.priceCents,
      pricing.currency,
      input.userId,
      input.userEmail,
      eligibility.currentRegistrar || null,
    ])

    log.info({ domain, transferId, priceCents: pricing.priceCents }, 'Transfer intent created')

    return {
      transferId,
      eligible: true,
      priceCents: pricing.priceCents,
      currency: pricing.currency,
      currentRegistrar: eligibility.currentRegistrar,
      expiresAt: eligibility.expiresAt,
      // Note: Stripe payment intent should be created by caller using billing service
      // This keeps payment logic separate from transfer logic
      //
      // IMPORTANT: When creating the Stripe PaymentIntent, callers MUST set metadata:
      // {
      //   kind: 'domain_transfer_in',
      //   transferId: <this transferId>,
      //   projectId: <projectId>,
      //   userId: <userId>,
      // }
      // This is enforced in confirmTransferWithAuthCode() to prevent replay attacks.
    }
  }

  // ===========================================================================
  // Step 2: Confirm Transfer with Auth Code (after payment)
  // ===========================================================================

  /**
   * Confirm transfer with auth code - ONLY call after payment is confirmed
   *
   * Security: This is the only point where auth code is accepted.
   * Payment must be verified with Stripe before auth code submission.
   */
  async confirmTransferWithAuthCode(
    input: ConfirmTransferInput,
    paymentIntentId: string
  ): Promise<TransferInResult> {
    const { transferId, authCode, nameservers, whoisPrivacy } = input

    // Verify transfer exists and is in pending_payment status
    const result = await pool?.query(`
      SELECT * FROM inhouse_domain_transfers
      WHERE id = $1 AND project_id = $2 AND status = 'pending_payment'
    `, [transferId, this.projectId])

    if (!result?.rows || result.rows.length === 0) {
      return {
        success: false,
        domain: '',
        status: 'failed',
        error: 'Transfer not found or not in pending_payment status',
      }
    }

    const transfer = result.rows[0]

    // SECURITY: Verify payment with Stripe before accepting auth code
    const config = getStripeConfig()
    const stripe = new Stripe(config.secretKey, {
      apiVersion: '2025-08-27.basil' as Stripe.LatestApiVersion,
      telemetry: false,
      timeout: 15000,
    })

    try {
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId)

      // 1. Verify payment succeeded
      if (pi.status !== 'succeeded') {
        log.warn({ transferId, paymentIntentId, status: pi.status }, 'Payment not succeeded')
        return {
          success: false,
          domain: transfer.domain,
          status: 'failed',
          error: `Payment not completed (status: ${pi.status})`,
        }
      }

      // 2. Verify amount matches
      const expectedAmount = Number(transfer.price_cents)
      if (pi.amount_received !== expectedAmount) {
        log.warn({ transferId, expected: expectedAmount, received: pi.amount_received }, 'Payment amount mismatch')
        return {
          success: false,
          domain: transfer.domain,
          status: 'failed',
          error: `Payment amount mismatch (expected: ${expectedAmount}, received: ${pi.amount_received})`,
        }
      }

      // 3. Verify currency matches
      const expectedCurrency = String(transfer.currency).toLowerCase()
      if ((pi.currency || '').toLowerCase() !== expectedCurrency) {
        log.warn({ transferId, expected: expectedCurrency, received: pi.currency }, 'Payment currency mismatch')
        return {
          success: false,
          domain: transfer.domain,
          status: 'failed',
          error: `Payment currency mismatch (expected: ${expectedCurrency}, received: ${pi.currency})`,
        }
      }

      // 4. Verify metadata binding (MANDATORY - prevents replay attacks)
      // The PaymentIntent must be created with kind='domain_transfer_in' and transferId set
      if (pi.metadata?.kind !== 'domain_transfer_in') {
        log.warn({ transferId, paymentIntentId, kind: pi.metadata?.kind }, 'Invalid payment intent type')
        return {
          success: false,
          domain: transfer.domain,
          status: 'failed',
          error: 'Invalid payment intent type - must be created for domain_transfer_in',
        }
      }

      if (pi.metadata?.transferId !== transferId) {
        log.warn({ transferId, metadataTransferId: pi.metadata?.transferId }, 'Payment not bound to this transfer')
        return {
          success: false,
          domain: transfer.domain,
          status: 'failed',
          error: 'Payment not bound to this transfer',
        }
      }

      // Verify projectId if set (should always match)
      if (pi.metadata?.projectId && pi.metadata.projectId !== this.projectId) {
        log.warn({ transferId, expectedProject: this.projectId, metadataProject: pi.metadata.projectId }, 'Payment project mismatch')
        return {
          success: false,
          domain: transfer.domain,
          status: 'failed',
          error: 'Payment project mismatch',
        }
      }

      // Verify userId if set (should match the user who created the transfer)
      if (pi.metadata?.userId && transfer.user_id && String(pi.metadata.userId) !== String(transfer.user_id)) {
        log.warn({ transferId, expectedUser: transfer.user_id, metadataUser: pi.metadata.userId }, 'Payment user mismatch')
        return {
          success: false,
          domain: transfer.domain,
          status: 'failed',
          error: 'Payment user mismatch',
        }
      }

      log.info({ transferId, paymentIntentId, amount: pi.amount_received }, 'Payment verified successfully')
    } catch (error) {
      log.error({ error, transferId, paymentIntentId }, 'Failed to verify payment with Stripe')
      return {
        success: false,
        domain: transfer.domain,
        status: 'failed',
        error: 'Failed to verify payment',
      }
    }

    // Update status to pending (payment verified, proceeding with transfer)
    await pool?.query(`
      UPDATE inhouse_domain_transfers
      SET status = 'pending',
          stripe_payment_intent_id = $1,
          auth_code_hash = $2,
          updated_at = NOW()
      WHERE id = $3
    `, [
      paymentIntentId,
      createHash('sha256').update(authCode).digest('hex'),
      transferId,
    ])

    // Initiate transfer with OpenSRS
    log.info({ domain: transfer.domain, transferId }, 'Initiating transfer with OpenSRS')

    const contacts = typeof transfer.contacts === 'string'
      ? JSON.parse(transfer.contacts)
      : transfer.contacts

    const transferResult = await this.openSrs.initiateTransferIn({
      domain: transfer.domain,
      authCode,
      contacts,
      nameservers,
      whoisPrivacy,
    })

    if (!transferResult.success) {
      // Transfer initiation failed
      await pool?.query(`
        UPDATE inhouse_domain_transfers
        SET status = 'failed',
            status_message = $1,
            updated_at = NOW()
        WHERE id = $2
      `, [transferResult.error, transferId])

      log.error({ domain: transfer.domain, transferId, error: transferResult.error }, 'Transfer initiation failed')

      return transferResult
    }

    // Update with OpenSRS order ID and initiated status
    await pool?.query(`
      UPDATE inhouse_domain_transfers
      SET status = 'initiated',
          opensrs_order_id = $1,
          initiated_at = NOW(),
          updated_at = NOW()
      WHERE id = $2
    `, [transferResult.orderId, transferId])

    // Record domain event
    await this.recordTransferEvent(transfer.domain, 'transfer_initiated', {
      transferId,
      opensrsOrderId: transferResult.orderId,
    })

    log.info({ domain: transfer.domain, transferId, orderId: transferResult.orderId }, 'Transfer initiated successfully')

    return transferResult
  }

  // ===========================================================================
  // Transfer Status & Management
  // ===========================================================================

  /**
   * Get transfer record by ID
   */
  async getTransfer(transferId: string): Promise<TransferRecord | null> {
    const result = await pool?.query(`
      SELECT * FROM inhouse_domain_transfers
      WHERE id = $1 AND project_id = $2
    `, [transferId, this.projectId])

    if (!result?.rows || result.rows.length === 0) {
      return null
    }

    const row = result.rows[0]
    return this.mapTransferRow(row)
  }

  /**
   * Attach Stripe PaymentIntent ID to transfer record
   * Called after creating PaymentIntent via Stripe API
   */
  async attachPaymentIntent(transferId: string, stripePaymentIntentId: string): Promise<boolean> {
    const result = await pool?.query(`
      UPDATE inhouse_domain_transfers
      SET stripe_payment_intent_id = $1,
          updated_at = NOW()
      WHERE id = $2 AND project_id = $3 AND status = 'pending_payment'
      RETURNING id
    `, [stripePaymentIntentId, transferId, this.projectId])

    if (!result?.rows || result.rows.length === 0) {
      log.warn({ transferId, stripePaymentIntentId }, 'Failed to attach PaymentIntent - transfer not found or not in pending_payment status')
      return false
    }

    log.info({ transferId, stripePaymentIntentId }, 'PaymentIntent attached to transfer')
    return true
  }

  /**
   * List transfers for project
   */
  async listTransfers(options: {
    status?: string
    limit?: number
    offset?: number
  } = {}): Promise<{ transfers: TransferRecord[]; total: number }> {
    const { status, limit = 20, offset = 0 } = options

    const conditions: string[] = ['project_id = $1']
    const params: (string | number)[] = [this.projectId]
    let paramIndex = 2

    if (status) {
      conditions.push(`status = $${paramIndex}`)
      params.push(status)
      paramIndex++
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`

    const countResult = await pool?.query(
      `SELECT COUNT(*) as total FROM inhouse_domain_transfers ${whereClause}`,
      params
    )
    const total = parseInt(countResult?.rows[0]?.total || '0', 10)

    const listResult = await pool?.query(
      `SELECT * FROM inhouse_domain_transfers
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    )

    const transfers = (listResult?.rows || []).map(this.mapTransferRow)

    return { transfers, total }
  }

  /**
   * Poll transfer status from OpenSRS
   *
   * Called by webhook handler or polling job to update transfer status
   */
  async pollTransferStatus(transferId: string): Promise<TransferInResult | null> {
    const transfer = await this.getTransfer(transferId)
    if (!transfer || !transfer.opensrsOrderId) {
      return null
    }

    // Only poll if in progress
    if (!['initiated', 'processing'].includes(transfer.status)) {
      return null
    }

    const status = await this.openSrs.getTransferStatus(transfer.opensrsOrderId)

    // Update our record
    const statusMessage = status.error || null
    const rawStatus = status.rawStatus || null

    await pool?.query(`
      UPDATE inhouse_domain_transfers
      SET status = $1,
          status_message = $2,
          raw_provider_status = $3,
          updated_at = NOW()
      WHERE id = $4
    `, [status.status, statusMessage, rawStatus, transferId])

    // If completed, finalize
    if (status.status === 'completed') {
      await this.finalizeTransfer(transferId, transfer.domain)
    }

    return status
  }

  /**
   * Cancel a pending transfer
   */
  async cancelTransfer(transferId: string, reason?: string): Promise<boolean> {
    const transfer = await this.getTransfer(transferId)
    if (!transfer) {
      return false
    }

    // Can only cancel pending_payment or pending transfers
    if (!['pending_payment', 'pending'].includes(transfer.status)) {
      return false
    }

    await pool?.query(`
      UPDATE inhouse_domain_transfers
      SET status = 'cancelled',
          status_message = $1,
          updated_at = NOW()
      WHERE id = $2
    `, [reason || 'Cancelled by user', transferId])

    log.info({ transferId, domain: transfer.domain }, 'Transfer cancelled')

    return true
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private async getTransferPricing(tld: string): Promise<{ priceCents: number; currency: string } | null> {
    // Try to get from DB first
    const result = await pool?.query(`
      SELECT transfer_price_cents
      FROM inhouse_domain_pricing
      WHERE tld = $1 AND available = true
    `, [tld])

    if (result?.rows && result.rows.length > 0) {
      return {
        priceCents: result.rows[0].transfer_price_cents,
        currency: 'USD',
      }
    }

    // Fallback: get from OpenSRS
    const pricing = await this.openSrs.getDomainPricing(`example.${tld}`)
    if (pricing) {
      return {
        priceCents: Math.round(pricing.transfer * 100),
        currency: pricing.currency,
      }
    }

    return null
  }

  private async finalizeTransfer(transferId: string, domain: string): Promise<void> {
    const transfer = await this.getTransfer(transferId)
    if (!transfer) return

    // Get domain info from OpenSRS
    const domainInfo = await this.openSrs.getDomainInfo(domain)

    // Track Cloudflare zone and final nameservers
    let cloudflareZoneId: string | null = null
    let finalNameservers = domainInfo?.nameservers || []

    // Setup Cloudflare DNS if configured
    if (isCloudflareConfigured()) {
      try {
        const cloudflare = getCloudflareService()

        // Create Cloudflare zone for DNS management
        const zone = await cloudflare.createZone({
          name: domain,
          type: 'full',
          jumpStart: true, // Import existing DNS records from current nameservers
        })
        cloudflareZoneId = zone.id

        // Update nameservers at registrar to point to Cloudflare
        if (zone.nameServers.length > 0) {
          await this.openSrs.updateNameservers(domain, zone.nameServers)
          finalNameservers = zone.nameServers
        }

        // Provision email DNS records (SPF, DKIM, DMARC, MX)
        await cloudflare.provisionEmailDnsRecords(
          zone.id,
          domain,
          `sheenapps-verify-${Date.now()}`
        )

        log.info({ domain, cloudflareZoneId }, 'Cloudflare zone created and DNS provisioned for transferred domain')
      } catch (error) {
        log.error({ error, domain }, 'Failed to setup Cloudflare DNS for transferred domain')
        // Continue without Cloudflare - DNS can be setup later
      }
    }

    // Create registered domain record
    const domainId = randomUUID()
    await pool?.query(`
      INSERT INTO inhouse_registered_domains
      (id, project_id, domain, tld, status, expires_at, nameservers, auto_renew, whois_privacy, locked, contacts, provider, provider_order_id, cloudflare_zone_id, created_at, updated_at)
      VALUES ($1, $2, $3, $4, 'active', $5, $6, $7, $8, $9, $10, 'opensrs', $11, $12, NOW(), NOW())
    `, [
      domainId,
      transfer.projectId,
      domain,
      transfer.tld,
      domainInfo?.expirationDate || null,
      JSON.stringify(finalNameservers),
      domainInfo?.autoRenew || false,
      domainInfo?.whoisPrivacy || false,
      domainInfo?.locked || false,
      JSON.stringify(transfer.contacts),
      transfer.opensrsOrderId,
      cloudflareZoneId,
    ])

    // Update transfer record
    await pool?.query(`
      UPDATE inhouse_domain_transfers
      SET status = 'completed',
          completed_at = NOW(),
          registered_domain_id = $1,
          updated_at = NOW()
      WHERE id = $2
    `, [domainId, transferId])

    // Record completion event
    await this.recordTransferEvent(domain, 'transfer_completed', {
      transferId,
      registeredDomainId: domainId,
      cloudflareZoneId,
    })

    log.info({ transferId, domain, registeredDomainId: domainId, cloudflareZoneId }, 'Transfer completed successfully')
  }

  private async recordTransferEvent(
    domain: string,
    eventType: string,
    metadata: Record<string, unknown>
  ): Promise<void> {
    // Find domain record if exists
    const domainResult = await pool?.query(`
      SELECT id FROM inhouse_registered_domains
      WHERE domain = $1 AND project_id = $2
      LIMIT 1
    `, [domain, this.projectId])

    const domainId = domainResult?.rows?.[0]?.id || null

    await pool?.query(`
      INSERT INTO inhouse_domain_events
      (domain_id, project_id, event_type, metadata)
      VALUES ($1, $2, $3, $4)
    `, [domainId, this.projectId, eventType, JSON.stringify(metadata)])
  }

  private mapTransferRow(row: Record<string, unknown>): TransferRecord {
    return {
      id: String(row.id),
      projectId: String(row.project_id),
      domain: String(row.domain),
      tld: String(row.tld),
      status: String(row.status),
      statusMessage: row.status_message as string | null,
      rawProviderStatus: row.raw_provider_status as string | null,
      sourceRegistrar: row.source_registrar as string | null,
      contacts: typeof row.contacts === 'string' ? JSON.parse(row.contacts) : row.contacts as Record<string, unknown>,
      priceCents: Number(row.price_cents),
      currency: String(row.currency),
      stripePaymentIntentId: row.stripe_payment_intent_id as string | null,
      opensrsOrderId: row.opensrs_order_id as string | null,
      initiatedAt: row.initiated_at as string | null,
      completedAt: row.completed_at as string | null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      registeredDomainId: row.registered_domain_id as string | null,
    }
  }
}

// =============================================================================
// FACTORY
// =============================================================================

export function getInhouseDomainTransferService(projectId: string): InhouseDomainTransferService {
  return new InhouseDomainTransferService(projectId)
}
