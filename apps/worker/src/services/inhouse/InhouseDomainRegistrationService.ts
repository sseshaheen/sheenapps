/**
 * In-House Domain Registration Service
 *
 * High-level service for domain purchase, registration, and lifecycle management.
 * Coordinates between OpenSRS API, Cloudflare DNS, and Stripe billing.
 *
 * Part of easy-mode-email-plan.md (Phase 3: Domain Registration)
 */

import { getPool } from '../databaseWrapper'
import { logActivity } from './InhouseActivityLogger'
import {
  OpenSrsService,
  getOpenSrsService,
  isOpenSrsConfigured,
  DomainAvailability,
  DomainSearchResult,
  DomainContact,
  DomainRegistrationInput,
  DomainInfo,
  DomainPricing,
} from './OpenSrsService'
import {
  CloudflareService,
  getCloudflareService,
  isCloudflareConfigured,
} from './CloudflareService'
import {
  DomainBillingService,
  getDomainBillingService,
  isDomainBillingConfigured,
} from './DomainBillingService'

// =============================================================================
// TYPES
// =============================================================================

export type RegisteredDomainStatus =
  | 'pending'
  | 'active'
  | 'expired'
  | 'grace'
  | 'redemption'
  | 'suspended'
  | 'transferred'

export interface RegisteredDomain {
  id: string
  projectId: string
  domain: string
  tld: string
  opensrsOrderId?: string
  opensrsDomainId?: string
  registeredAt: string
  expiresAt: string
  lastRenewedAt?: string
  status: RegisteredDomainStatus
  autoRenew: boolean
  whoisPrivacy: boolean
  locked: boolean
  nameservers: string[]
  contacts: {
    owner: DomainContact
    admin?: DomainContact
    billing?: DomainContact
    tech?: DomainContact
  }
  lastPaymentId?: string
  nextRenewalPriceCents?: number
  currency: string
  emailDomainId?: string
  cloudflareZoneId?: string
  createdAt: string
  updatedAt: string
}

export interface DomainEvent {
  id: string
  domainId: string
  projectId: string
  eventType: string
  metadata: Record<string, unknown>
  actorType: 'user' | 'system' | 'webhook'
  actorId?: string
  createdAt: string
}

export interface DomainSearchInput {
  query: string
  tlds?: string[]
}

export interface DomainSearchResponse {
  query: string
  results: Array<{
    domain: string
    available: boolean
    tld: string
    priceCents: number
    currency: string
    premium?: boolean
    reason?: string
  }>
}

export interface DomainPurchaseInput {
  domain: string
  contacts: {
    owner: DomainContact
    admin?: DomainContact
    billing?: DomainContact
    tech?: DomainContact
  }
  period?: number // Years, default 1
  autoRenew?: boolean
  whoisPrivacy?: boolean
  paymentMethodId?: string // Stripe payment method
  userId: string // User making the purchase
  userEmail: string // User email for billing
}

export interface DomainPurchaseResult {
  success: boolean
  domain?: RegisteredDomain
  orderId?: string
  paymentIntentId?: string
  paymentIntentClientSecret?: string // For client-side payment confirmation
  requiresPaymentAction?: boolean // True if 3DS or other action needed
  error?: string
}

export interface DomainRenewalInput {
  domainId: string
  period?: number
  paymentMethodId?: string
  userId: string
  userEmail: string
}

export interface DomainRenewalResult {
  success: boolean
  domain?: RegisteredDomain
  newExpiresAt?: string
  error?: string
}

export interface TldPricingInfo {
  tld: string
  registrationPriceCents: number
  renewalPriceCents: number
  transferPriceCents: number
  currency: string
  available: boolean
}

// =============================================================================
// SERVICE
// =============================================================================

export class InhouseDomainRegistrationService {
  private projectId: string
  private openSrs: OpenSrsService | null = null
  private cloudflare: CloudflareService | null = null
  private billing: DomainBillingService | null = null

  constructor(projectId: string) {
    this.projectId = projectId

    if (isOpenSrsConfigured()) {
      this.openSrs = getOpenSrsService()
    }

    if (isCloudflareConfigured()) {
      this.cloudflare = getCloudflareService()
    }

    if (isDomainBillingConfigured()) {
      this.billing = getDomainBillingService()
    }
  }

  // ===========================================================================
  // Domain Search & Availability
  // ===========================================================================

  /**
   * Search for available domains
   */
  async searchDomains(input: DomainSearchInput): Promise<DomainSearchResponse> {
    const pool = getPool()

    // Get pricing from database
    const { rows: pricingRows } = await pool.query(
      `SELECT tld, registration_price_cents, available
       FROM inhouse_domain_pricing
       WHERE available = TRUE`
    )
    const pricingMap = new Map(pricingRows.map(r => [r.tld, r.registration_price_cents]))

    // Normalize query (remove spaces, lowercase)
    const query = input.query.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    const tlds = input.tlds || ['com', 'net', 'org', 'io', 'co']

    // Check availability via OpenSRS if configured
    let searchResults: DomainAvailability[] = []

    if (this.openSrs) {
      const osrsResult = await this.openSrs.searchDomains(query, tlds)
      searchResults = osrsResult.results
    } else {
      // Without OpenSRS, just return domains with pricing (assume available)
      searchResults = tlds.map(tld => ({
        domain: `${query}.${tld}`,
        available: true,
      }))
    }

    // Build response with pricing
    const results = searchResults.map(result => {
      const tld = result.domain.split('.').slice(1).join('.')
      const priceCents = pricingMap.get(tld) || 1999 // Default $19.99

      return {
        domain: result.domain,
        available: result.available,
        tld,
        priceCents,
        currency: 'USD',
        premium: result.premium,
        reason: result.reason,
      }
    })

    // Log activity
    logActivity({
      projectId: this.projectId,
      service: 'domain-registration',
      action: 'search_domains',
      actorType: 'user',
      resourceType: 'domain_search',
      metadata: { query, resultCount: results.filter(r => r.available).length },
    })

    return { query, results }
  }

  /**
   * Check single domain availability
   */
  async checkAvailability(domain: string): Promise<{
    domain: string
    available: boolean
    priceCents: number
    currency: string
    reason?: string
  }> {
    const tld = domain.split('.').slice(1).join('.')
    const pool = getPool()

    // Get pricing
    const { rows } = await pool.query(
      `SELECT registration_price_cents FROM inhouse_domain_pricing WHERE tld = $1`,
      [tld]
    )
    const priceCents = rows[0]?.registration_price_cents || 1999

    // Check availability
    let available = true
    let reason: string | undefined

    if (this.openSrs) {
      const result = await this.openSrs.checkAvailability(domain)
      available = result.available
      reason = result.reason
    }

    return {
      domain,
      available,
      priceCents,
      currency: 'USD',
      reason,
    }
  }

  // ===========================================================================
  // Domain Registration
  // ===========================================================================

  /**
   * Purchase and register a domain
   */
  async purchaseDomain(input: DomainPurchaseInput): Promise<DomainPurchaseResult> {
    if (!this.openSrs) {
      return {
        success: false,
        error: 'Domain registration is not configured. Please contact support.',
      }
    }

    const pool = getPool()
    const domain = input.domain.toLowerCase()
    const tld = domain.split('.').slice(1).join('.')

    // Check if domain already registered in our system
    const { rows: existing } = await pool.query(
      `SELECT id FROM inhouse_registered_domains WHERE domain = $1`,
      [domain]
    )
    if (existing.length > 0) {
      return {
        success: false,
        error: 'This domain is already registered in your account.',
      }
    }

    // Get pricing
    const { rows: pricingRows } = await pool.query(
      `SELECT registration_price_cents FROM inhouse_domain_pricing WHERE tld = $1`,
      [tld]
    )
    const priceCents = pricingRows[0]?.registration_price_cents || 1999

    // Process payment via Stripe
    let paymentIntentId: string | undefined
    let paymentIntentClientSecret: string | undefined

    if (this.billing) {
      const paymentResult = await this.billing.createDomainPayment({
        userId: input.userId,
        userEmail: input.userEmail,
        domain,
        amountCents: priceCents,
        paymentMethodId: input.paymentMethodId,
        description: `Domain registration: ${domain} (${input.period || 1} year)`,
        metadata: {
          project_id: this.projectId,
          tld,
          period: String(input.period || 1),
        },
      })

      if (!paymentResult.success) {
        return {
          success: false,
          error: `Payment failed: ${paymentResult.error}`,
        }
      }

      paymentIntentId = paymentResult.paymentIntentId
      paymentIntentClientSecret = paymentResult.paymentIntentClientSecret

      // If payment requires action (3DS, etc.), return early for client-side handling
      if (paymentResult.status === 'requires_action' || paymentResult.status === 'requires_payment_method') {
        return {
          success: false,
          requiresPaymentAction: true,
          paymentIntentId,
          paymentIntentClientSecret,
          error: 'Payment requires additional verification. Please complete the payment flow.',
        }
      }

      // If not succeeded yet, return for client-side handling
      if (paymentResult.status !== 'succeeded') {
        return {
          success: false,
          requiresPaymentAction: true,
          paymentIntentId,
          paymentIntentClientSecret,
          error: 'Please complete the payment to proceed with domain registration.',
        }
      }
    }

    // Register domain via OpenSRS
    const registrationInput: DomainRegistrationInput = {
      domain,
      period: input.period || 1,
      contacts: input.contacts,
      autoRenew: input.autoRenew ?? true,
      whoisPrivacy: input.whoisPrivacy ?? true,
    }

    const regResult = await this.openSrs.registerDomain(registrationInput)

    if (!regResult.success) {
      // Refund payment if domain registration fails
      if (this.billing && paymentIntentId) {
        await this.billing.refundPayment(paymentIntentId, 'Domain registration failed with registrar')
        logActivity({
          projectId: this.projectId,
          service: 'domain-registration',
          action: 'refund_issued',
          actorType: 'system',
          resourceType: 'payment',
          resourceId: paymentIntentId,
          metadata: { domain, reason: regResult.error },
        })
      }
      return {
        success: false,
        error: regResult.error || 'Domain registration failed',
      }
    }

    // Create Cloudflare zone for DNS management (if configured)
    let cloudflareZoneId: string | null = null
    let finalNameservers = regResult.nameservers // Track final nameservers (may be updated to Cloudflare NS)
    if (this.cloudflare) {
      try {
        const zone = await this.cloudflare.createZone({
          name: domain,
          type: 'full',
          jumpStart: false,
        })
        cloudflareZoneId = zone.id

        // Update nameservers to Cloudflare's and track the final values
        if (zone.nameServers.length > 0) {
          await this.openSrs.updateNameservers(domain, zone.nameServers)
          finalNameservers = zone.nameServers // Store the actual Cloudflare nameservers
        }

        // Provision email DNS records
        await this.cloudflare.provisionEmailDnsRecords(
          zone.id,
          domain,
          `sheenapps-verify-${Date.now()}`
        )
      } catch (error) {
        console.error('[DomainRegistration] Failed to create Cloudflare zone:', error)
        // Continue without Cloudflare - not critical
      }
    }

    // Store in database with final nameservers (Cloudflare NS if zone was created, otherwise original)
    const { rows: insertedRows } = await pool.query(
      `INSERT INTO inhouse_registered_domains (
        project_id, user_id, domain, tld, opensrs_order_id,
        registered_at, expires_at, status,
        auto_renew, whois_privacy, locked,
        nameservers, contacts,
        next_renewal_price_cents, cloudflare_zone_id, last_payment_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *`,
      [
        this.projectId,
        input.userId,
        domain,
        tld,
        regResult.orderId,
        regResult.registrationDate || new Date().toISOString(),
        regResult.expirationDate,
        'active',
        input.autoRenew ?? true,
        input.whoisPrivacy ?? true,
        true, // Locked by default
        JSON.stringify(finalNameservers),
        JSON.stringify(input.contacts),
        priceCents, // Next renewal same as registration
        cloudflareZoneId,
        paymentIntentId,
      ]
    )

    const registeredDomain = this.rowToRegisteredDomain(insertedRows[0])

    // Record event
    await this.recordEvent(registeredDomain.id, 'registered', {
      orderId: regResult.orderId,
      price: priceCents,
      period: input.period || 1,
      cloudflareZoneId,
    })

    // Log activity
    logActivity({
      projectId: this.projectId,
      service: 'domain-registration',
      action: 'register_domain',
      actorType: 'user',
      resourceType: 'registered_domain',
      resourceId: registeredDomain.id,
      status: 'success',
      metadata: { domain, orderId: regResult.orderId },
    })

    return {
      success: true,
      domain: registeredDomain,
      orderId: regResult.orderId,
      paymentIntentId,
    }
  }

  // ===========================================================================
  // Domain Management
  // ===========================================================================

  /**
   * List all registered domains for the project
   */
  async listDomains(): Promise<RegisteredDomain[]> {
    const pool = getPool()

    const { rows } = await pool.query(
      `SELECT * FROM inhouse_registered_domains
       WHERE project_id = $1
       ORDER BY domain ASC`,
      [this.projectId]
    )

    return rows.map(row => this.rowToRegisteredDomain(row))
  }

  /**
   * Get a single registered domain
   */
  async getDomain(domainId: string): Promise<RegisteredDomain | null> {
    const pool = getPool()

    const { rows } = await pool.query(
      `SELECT * FROM inhouse_registered_domains
       WHERE id = $1 AND project_id = $2`,
      [domainId, this.projectId]
    )

    if (rows.length === 0) return null
    return this.rowToRegisteredDomain(rows[0])
  }

  /**
   * Get domain by domain name
   */
  async getDomainByName(domain: string): Promise<RegisteredDomain | null> {
    const pool = getPool()

    const { rows } = await pool.query(
      `SELECT * FROM inhouse_registered_domains
       WHERE domain = $1 AND project_id = $2`,
      [domain.toLowerCase(), this.projectId]
    )

    if (rows.length === 0) return null
    return this.rowToRegisteredDomain(rows[0])
  }

  /**
   * Renew a domain
   */
  async renewDomain(input: DomainRenewalInput): Promise<DomainRenewalResult> {
    if (!this.openSrs) {
      return {
        success: false,
        error: 'Domain renewal is not configured. Please contact support.',
      }
    }

    const pool = getPool()

    // Get domain
    const domain = await this.getDomain(input.domainId)
    if (!domain) {
      return { success: false, error: 'Domain not found' }
    }

    const renewalPriceCents = domain.nextRenewalPriceCents || 1599 // Default $15.99
    let paymentIntentId: string | undefined

    // Require payment method when billing is enabled
    if (this.billing && !input.paymentMethodId) {
      return {
        success: false,
        error: 'Payment method required for renewal',
      }
    }

    // Process Stripe payment for renewal
    if (this.billing && input.paymentMethodId) {
      const paymentResult = await this.billing.createDomainPayment({
        userId: input.userId,
        userEmail: input.userEmail,
        domain: domain.domain,
        amountCents: renewalPriceCents * (input.period || 1),
        paymentMethodId: input.paymentMethodId,
        description: `Domain renewal: ${domain.domain} (${input.period || 1} year)`,
        metadata: {
          project_id: this.projectId,
          domain_id: input.domainId,
          type: 'renewal',
        },
      })

      if (!paymentResult.success) {
        return {
          success: false,
          error: `Payment failed: ${paymentResult.error}`,
        }
      }

      if (paymentResult.status !== 'succeeded') {
        return {
          success: false,
          error: 'Payment requires additional verification.',
        }
      }

      paymentIntentId = paymentResult.paymentIntentId
    }

    // Renew via OpenSRS
    const renewResult = await this.openSrs.renewDomain(domain.domain, input.period || 1)

    if (!renewResult.success) {
      // Refund payment if renewal fails
      if (this.billing && paymentIntentId) {
        await this.billing.refundPayment(paymentIntentId, 'Domain renewal failed with registrar')
      }
      return {
        success: false,
        error: renewResult.error || 'Domain renewal failed',
      }
    }

    // Update database
    await pool.query(
      `UPDATE inhouse_registered_domains
       SET expires_at = $1, last_renewed_at = NOW(), last_payment_id = $3, updated_at = NOW()
       WHERE id = $2`,
      [renewResult.newExpirationDate, input.domainId, paymentIntentId]
    )

    // Record event
    await this.recordEvent(input.domainId, 'renewed', {
      orderId: renewResult.orderId,
      newExpiresAt: renewResult.newExpirationDate,
      period: input.period || 1,
    })

    // Get updated domain
    const updatedDomain = await this.getDomain(input.domainId)

    logActivity({
      projectId: this.projectId,
      service: 'domain-registration',
      action: 'renew_domain',
      actorType: 'user',
      resourceType: 'registered_domain',
      resourceId: input.domainId,
      status: 'success',
      metadata: { domain: domain.domain, newExpiresAt: renewResult.newExpirationDate },
    })

    return {
      success: true,
      domain: updatedDomain!,
      newExpiresAt: renewResult.newExpirationDate,
    }
  }

  /**
   * Get transfer auth code
   */
  async getAuthCode(domainId: string): Promise<{ success: boolean; authCode?: string; error?: string }> {
    if (!this.openSrs) {
      return { success: false, error: 'Not configured' }
    }

    const domain = await this.getDomain(domainId)
    if (!domain) {
      return { success: false, error: 'Domain not found' }
    }

    // Unlock domain first
    await this.openSrs.setDomainLock(domain.domain, false)

    const result = await this.openSrs.getAuthCode(domain.domain)

    if (result.success) {
      await this.recordEvent(domainId, 'auth_code_requested', {})

      logActivity({
        projectId: this.projectId,
        service: 'domain-registration',
        action: 'get_auth_code',
        actorType: 'user',
        resourceType: 'registered_domain',
        resourceId: domainId,
        metadata: { domain: domain.domain },
      })
    }

    return result
  }

  /**
   * Update domain settings (auto-renew, whois privacy, lock)
   */
  async updateSettings(domainId: string, settings: {
    autoRenew?: boolean
    whoisPrivacy?: boolean
    locked?: boolean
  }): Promise<RegisteredDomain | null> {
    const pool = getPool()

    const domain = await this.getDomain(domainId)
    if (!domain) return null

    // Update via OpenSRS
    if (this.openSrs) {
      if (settings.autoRenew !== undefined) {
        await this.openSrs.setAutoRenew(domain.domain, settings.autoRenew)
      }
      if (settings.whoisPrivacy !== undefined) {
        await this.openSrs.setWhoisPrivacy(domain.domain, settings.whoisPrivacy)
      }
      if (settings.locked !== undefined) {
        await this.openSrs.setDomainLock(domain.domain, settings.locked)
      }
    }

    // Update database
    const updates: string[] = []
    const values: unknown[] = []
    let paramIndex = 1

    if (settings.autoRenew !== undefined) {
      updates.push(`auto_renew = $${paramIndex++}`)
      values.push(settings.autoRenew)
    }
    if (settings.whoisPrivacy !== undefined) {
      updates.push(`whois_privacy = $${paramIndex++}`)
      values.push(settings.whoisPrivacy)
    }
    if (settings.locked !== undefined) {
      updates.push(`locked = $${paramIndex++}`)
      values.push(settings.locked)
    }

    if (updates.length > 0) {
      values.push(domainId)
      await pool.query(
        `UPDATE inhouse_registered_domains
         SET ${updates.join(', ')}, updated_at = NOW()
         WHERE id = $${paramIndex}`,
        values
      )

      await this.recordEvent(domainId, 'settings_updated', settings)
    }

    return this.getDomain(domainId)
  }

  // ===========================================================================
  // Pricing
  // ===========================================================================

  /**
   * Get pricing for all available TLDs
   */
  async getTldPricing(): Promise<TldPricingInfo[]> {
    const pool = getPool()

    const { rows } = await pool.query(
      `SELECT * FROM inhouse_domain_pricing WHERE available = TRUE ORDER BY tld`
    )

    // Apply markup to base prices (markup_percent is admin-managed)
    return rows.map(row => {
      const markupMultiplier = 1 + (row.markup_percent || 0) / 100
      return {
        tld: row.tld,
        registrationPriceCents: Math.round(row.registration_price_cents * markupMultiplier),
        renewalPriceCents: Math.round(row.renewal_price_cents * markupMultiplier),
        transferPriceCents: Math.round(row.transfer_price_cents * markupMultiplier),
        currency: 'USD',
        available: row.available,
      }
    })
  }

  // ===========================================================================
  // Events
  // ===========================================================================

  /**
   * Get domain events
   */
  async getDomainEvents(domainId: string, limit = 50): Promise<DomainEvent[]> {
    const pool = getPool()

    const { rows } = await pool.query(
      `SELECT * FROM inhouse_domain_events
       WHERE domain_id = $1 AND project_id = $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [domainId, this.projectId, limit]
    )

    return rows.map(row => ({
      id: row.id,
      domainId: row.domain_id,
      projectId: row.project_id,
      eventType: row.event_type,
      metadata: row.metadata || {},
      actorType: row.actor_type,
      actorId: row.actor_id,
      createdAt: row.created_at.toISOString(),
    }))
  }

  private async recordEvent(
    domainId: string,
    eventType: string,
    metadata: Record<string, unknown>,
    actorType: 'user' | 'system' | 'webhook' = 'user',
    actorId?: string
  ): Promise<void> {
    const pool = getPool()

    await pool.query(
      `INSERT INTO inhouse_domain_events (domain_id, project_id, event_type, metadata, actor_type, actor_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [domainId, this.projectId, eventType, JSON.stringify(metadata), actorType, actorId]
    )
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  /**
   * Safely parse JSON values from database rows
   * PostgreSQL JSONB may return already-parsed objects or strings depending on driver/query
   */
  private parseJson<T>(value: unknown, fallback: T): T {
    if (value == null) return fallback
    // Already parsed by PostgreSQL driver
    if (typeof value === 'object') return value as T
    // String that needs parsing (e.g., from text column or some drivers)
    if (typeof value === 'string') {
      try {
        return JSON.parse(value) as T
      } catch {
        return fallback
      }
    }
    return fallback
  }

  private rowToRegisteredDomain(row: Record<string, unknown>): RegisteredDomain {
    return {
      id: row.id as string,
      projectId: row.project_id as string,
      domain: row.domain as string,
      tld: row.tld as string,
      opensrsOrderId: row.opensrs_order_id as string | undefined,
      opensrsDomainId: row.opensrs_domain_id as string | undefined,
      registeredAt: (row.registered_at as Date).toISOString(),
      expiresAt: (row.expires_at as Date).toISOString(),
      lastRenewedAt: row.last_renewed_at ? (row.last_renewed_at as Date).toISOString() : undefined,
      status: row.status as RegisteredDomainStatus,
      autoRenew: row.auto_renew as boolean,
      whoisPrivacy: row.whois_privacy as boolean,
      locked: row.locked as boolean,
      nameservers: this.parseJson<string[]>(row.nameservers, []),
      contacts: this.parseJson<RegisteredDomain['contacts']>(row.contacts, { owner: {} as DomainContact }),
      lastPaymentId: row.last_payment_id as string | undefined,
      nextRenewalPriceCents: row.next_renewal_price_cents as number | undefined,
      currency: row.currency as string,
      emailDomainId: row.email_domain_id as string | undefined,
      cloudflareZoneId: row.cloudflare_zone_id as string | undefined,
      createdAt: (row.created_at as Date).toISOString(),
      updatedAt: (row.updated_at as Date).toISOString(),
    }
  }
}

// =============================================================================
// SINGLETON FACTORY
// =============================================================================

const serviceCache = new Map<string, { service: InhouseDomainRegistrationService; timestamp: number }>()
const CACHE_TTL = 60000 // 1 minute

export function getInhouseDomainRegistrationService(projectId: string): InhouseDomainRegistrationService {
  const now = Date.now()
  const cached = serviceCache.get(projectId)

  if (cached && now - cached.timestamp < CACHE_TTL) {
    return cached.service
  }

  const service = new InhouseDomainRegistrationService(projectId)
  serviceCache.set(projectId, { service, timestamp: now })
  return service
}
