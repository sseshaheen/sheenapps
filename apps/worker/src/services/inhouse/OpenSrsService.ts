/**
 * OpenSRS Domain Registration Service
 *
 * Handles domain registration, renewal, and management via OpenSRS API.
 * OpenSRS uses an XML-based API with MD5 signature authentication.
 *
 * Part of easy-mode-email-plan.md (Phase 3: Domain Registration)
 *
 * API Documentation: https://domains.opensrs.guide/docs
 */

import { createHash, randomBytes } from 'crypto'
import { getBestEffortRedis } from '../redisBestEffort'
import { pool } from '../database'

// Helper to safely get pool (returns null if not available)
function getPoolSafe() {
  return pool
}

// =============================================================================
// CONFIGURATION
// =============================================================================

const OPENSRS_API_URL = process.env.OPENSRS_API_URL || 'https://rr-n1-tor.opensrs.net:55443'
const OPENSRS_USERNAME = process.env.OPENSRS_USERNAME
const OPENSRS_API_KEY = process.env.OPENSRS_API_KEY

// Test mode uses different endpoint
const OPENSRS_TEST_MODE = process.env.OPENSRS_TEST_MODE === 'true'
const OPENSRS_TEST_URL = 'https://horizon.opensrs.net:55443'

// Request timeout in milliseconds
const REQUEST_TIMEOUT_MS = 30000 // 30 seconds for domain operations

// Default nameservers to set when registering domains (Cloudflare-managed)
const DEFAULT_NAMESERVERS = [
  process.env.SHEENAPPS_NS1 || 'ns1.sheenapps.com',
  process.env.SHEENAPPS_NS2 || 'ns2.sheenapps.com',
]

// =============================================================================
// TYPES
// =============================================================================

export interface DomainAvailability {
  domain: string
  available: boolean
  price?: number
  currency?: string
  premium?: boolean
  reason?: string
}

export interface DomainSearchResult {
  query: string
  results: DomainAvailability[]
  suggestions?: DomainAvailability[]
}

export interface DomainContact {
  firstName: string
  lastName: string
  orgName?: string
  email: string
  phone: string
  address1: string
  address2?: string
  city: string
  state: string
  postalCode: string
  country: string // ISO 2-letter code
}

export interface DomainRegistrationInput {
  domain: string
  period: number // Years (1-10)
  contacts: {
    owner: DomainContact
    admin?: DomainContact
    billing?: DomainContact
    tech?: DomainContact
  }
  nameservers?: string[]
  autoRenew?: boolean
  whoisPrivacy?: boolean
}

export interface DomainRegistrationResult {
  success: boolean
  domain: string
  orderId: string
  registrationDate: string
  expirationDate: string
  nameservers: string[]
  whoisPrivacy: boolean
  error?: string
}

export interface DomainInfo {
  domain: string
  status: 'active' | 'expired' | 'redemption' | 'pendingDelete' | 'transferred'
  registrationDate: string
  expirationDate: string
  autoRenew: boolean
  nameservers: string[]
  whoisPrivacy: boolean
  locked: boolean
  contacts: {
    owner: DomainContact
    admin?: DomainContact
    billing?: DomainContact
    tech?: DomainContact
  }
}

export interface DomainRenewalResult {
  success: boolean
  domain: string
  orderId: string
  newExpirationDate: string
  error?: string
}

export interface DomainPricing {
  tld: string
  registration: number
  renewal: number
  transfer: number
  currency: string
}

export interface NameserverUpdateResult {
  success: boolean
  domain: string
  nameservers: string[]
  error?: string
}

export interface AuthCodeResult {
  success: boolean
  domain: string
  authCode?: string
  error?: string
}

// =============================================================================
// TRANSFER-IN TYPES (Enhancement 4)
// =============================================================================

export interface TransferInInput {
  domain: string
  authCode: string
  contacts: {
    owner: DomainContact
    admin?: DomainContact
    billing?: DomainContact
    tech?: DomainContact
  }
  nameservers?: string[]
  whoisPrivacy?: boolean
}

export interface TransferInResult {
  success: boolean
  domain: string
  orderId?: string
  status: 'pending' | 'initiated' | 'processing' | 'completed' | 'failed'
  rawStatus?: string  // Preserve original for debugging
  error?: string
}

export interface TransferEligibility {
  eligible: boolean
  domain: string
  reason?: string
  // These fields are TLD-dependent, may not always be present
  currentRegistrar?: string
  expiresAt?: string
  daysUntilExpiry?: number
}

// OpenSRS API response structure
interface OpenSrsResponse {
  is_success: string
  response_code: string
  response_text: string
  attributes?: Record<string, unknown>
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Generate MD5 signature for OpenSRS API authentication
 * Signature = MD5(MD5(body + API_KEY) + API_KEY)
 */
function generateSignature(xmlBody: string): string {
  if (!OPENSRS_API_KEY) {
    throw new Error('OPENSRS_API_KEY is required')
  }

  const firstHash = createHash('md5')
    .update(xmlBody + OPENSRS_API_KEY)
    .digest('hex')

  const signature = createHash('md5')
    .update(firstHash + OPENSRS_API_KEY)
    .digest('hex')

  return signature
}

/**
 * Build XML request body for OpenSRS API
 */
function buildXmlRequest(action: string, object: string, attributes: Record<string, unknown>): string {
  const attributesXml = objectToXml(attributes)

  return `<?xml version='1.0' encoding='UTF-8' standalone='no' ?>
<!DOCTYPE OPS_envelope SYSTEM 'ops.dtd'>
<OPS_envelope>
  <header>
    <version>0.9</version>
  </header>
  <body>
    <data_block>
      <dt_assoc>
        <item key="protocol">XCP</item>
        <item key="action">${escapeXml(action)}</item>
        <item key="object">${escapeXml(object)}</item>
        <item key="attributes">
          <dt_assoc>
            ${attributesXml}
          </dt_assoc>
        </item>
      </dt_assoc>
    </data_block>
  </body>
</OPS_envelope>`
}

/**
 * Convert JavaScript object to OpenSRS XML format
 */
function objectToXml(obj: Record<string, unknown>, indent = ''): string {
  const items: string[] = []

  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue

    if (Array.isArray(value)) {
      items.push(`${indent}<item key="${escapeXml(key)}">`)
      items.push(`${indent}  <dt_array>`)
      value.forEach((item, index) => {
        if (typeof item === 'object') {
          items.push(`${indent}    <item key="${index}">`)
          items.push(`${indent}      <dt_assoc>`)
          items.push(objectToXml(item as Record<string, unknown>, indent + '        '))
          items.push(`${indent}      </dt_assoc>`)
          items.push(`${indent}    </item>`)
        } else {
          items.push(`${indent}    <item key="${index}">${escapeXml(String(item))}</item>`)
        }
      })
      items.push(`${indent}  </dt_array>`)
      items.push(`${indent}</item>`)
    } else if (typeof value === 'object') {
      items.push(`${indent}<item key="${escapeXml(key)}">`)
      items.push(`${indent}  <dt_assoc>`)
      items.push(objectToXml(value as Record<string, unknown>, indent + '    '))
      items.push(`${indent}  </dt_assoc>`)
      items.push(`${indent}</item>`)
    } else {
      items.push(`${indent}<item key="${escapeXml(key)}">${escapeXml(String(value))}</item>`)
    }
  }

  return items.join('\n')
}

/**
 * Escape special XML characters
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Parse OpenSRS XML response (simplified parser)
 */
function parseXmlResponse(xml: string): OpenSrsResponse {
  // Extract is_success
  const successMatch = xml.match(/<item key="is_success">(\d+)<\/item>/)
  const isSuccess = successMatch?.[1] ?? '0'

  // Extract response_code
  const codeMatch = xml.match(/<item key="response_code">(\d+)<\/item>/)
  const responseCode = codeMatch?.[1] ?? '0'

  // Extract response_text
  const textMatch = xml.match(/<item key="response_text">([^<]*)<\/item>/)
  const responseText = textMatch?.[1] ?? ''

  // Extract attributes (simplified - parse specific fields as needed)
  const attributes = parseAttributes(xml)

  return {
    is_success: isSuccess,
    response_code: responseCode,
    response_text: responseText,
    attributes,
  }
}

/**
 * Parse attributes from XML response (simplified)
 */
function parseAttributes(xml: string): Record<string, unknown> {
  const attrs: Record<string, unknown> = {}

  // Parse simple key-value items in attributes section
  const attrSection = xml.match(/<item key="attributes">([\s\S]*?)<\/item>\s*<\/dt_assoc>\s*<\/data_block>/)
  if (!attrSection?.[1]) return attrs

  const content = attrSection[1]

  // Match simple items
  const itemRegex = /<item key="([^"]+)">([^<]+)<\/item>/g
  let match
  while ((match = itemRegex.exec(content)) !== null) {
    const key = match[1]
    const value = match[2]
    if (key !== undefined) {
      attrs[key] = value
    }
  }

  return attrs
}

// =============================================================================
// SERVICE
// =============================================================================

export class OpenSrsService {
  private apiUrl: string
  private username: string

  constructor() {
    if (!OPENSRS_USERNAME) {
      throw new Error('OPENSRS_USERNAME is required')
    }
    if (!OPENSRS_API_KEY) {
      throw new Error('OPENSRS_API_KEY is required')
    }

    this.username = OPENSRS_USERNAME
    this.apiUrl = OPENSRS_TEST_MODE ? OPENSRS_TEST_URL : OPENSRS_API_URL
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private async request(action: string, object: string, attributes: Record<string, unknown>): Promise<OpenSrsResponse> {
    const xmlBody = buildXmlRequest(action, object, attributes)
    const signature = generateSignature(xmlBody)

    // Use AbortController for request timeout
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml',
          'X-Username': this.username,
          'X-Signature': signature,
          'Content-Length': String(Buffer.byteLength(xmlBody, 'utf8')),
        },
        body: xmlBody,
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error(`OpenSRS API error: ${response.status} ${response.statusText}`)
      }

      const responseXml = await response.text()
      const parsed = parseXmlResponse(responseXml)

      if (parsed.is_success !== '1') {
        throw new Error(`OpenSRS error (${parsed.response_code}): ${parsed.response_text}`)
      }

      return parsed
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`OpenSRS API request timed out after ${REQUEST_TIMEOUT_MS}ms`)
      }
      throw error
    } finally {
      clearTimeout(timeout)
    }
  }

  // ===========================================================================
  // Domain Search & Availability
  // ===========================================================================

  /**
   * Check domain availability
   */
  async checkAvailability(domain: string): Promise<DomainAvailability> {
    try {
      const response = await this.request('LOOKUP', 'DOMAIN', {
        domain,
      })

      const available = response.attributes?.status === 'available'

      return {
        domain,
        available,
        reason: available ? undefined : 'Domain is already registered',
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return {
        domain,
        available: false,
        reason: message,
      }
    }
  }

  /**
   * Search for available domains with multiple TLDs
   */
  async searchDomains(query: string, tlds: string[] = ['com', 'net', 'org', 'io', 'co']): Promise<DomainSearchResult> {
    const results: DomainAvailability[] = []

    // Check each TLD in parallel
    const checks = tlds.map(async (tld) => {
      const domain = query.includes('.') ? query : `${query}.${tld}`
      return this.checkAvailability(domain)
    })

    const checkResults = await Promise.all(checks)
    results.push(...checkResults)

    return {
      query,
      results,
    }
  }

  /**
   * Get pricing for a domain
   */
  async getDomainPricing(domain: string): Promise<DomainPricing | null> {
    try {
      const tld = domain.split('.').slice(1).join('.')

      const response = await this.request('GET_PRICE', 'DOMAIN', {
        domain,
        period: 1,
      })

      const price = parseFloat(response.attributes?.price as string || '0')

      return {
        tld,
        registration: price,
        renewal: price, // Usually same for OpenSRS
        transfer: price,
        currency: 'USD',
      }
    } catch {
      return null
    }
  }

  // ===========================================================================
  // Domain Registration
  // ===========================================================================

  /**
   * Register a new domain
   */
  async registerDomain(input: DomainRegistrationInput): Promise<DomainRegistrationResult> {
    try {
      const contactSet = this.buildContactSet(input.contacts)

      const response = await this.request('SW_REGISTER', 'DOMAIN', {
        domain: input.domain,
        period: input.period,
        reg_username: this.username,
        reg_password: randomBytes(12).toString('base64url'), // Cryptographically secure ~16 char password
        reg_type: 'new',
        handle: 'process',
        custom_nameservers: 1,
        nameserver_list: this.buildNameserverList(input.nameservers || DEFAULT_NAMESERVERS),
        contact_set: contactSet,
        auto_renew: input.autoRenew ? 1 : 0,
        f_whois_privacy: input.whoisPrivacy ? 1 : 0,
      })

      const attrs = response.attributes || {}

      return {
        success: true,
        domain: input.domain,
        orderId: String(attrs.id || attrs.order_id || ''),
        registrationDate: String(attrs.registration_date || new Date().toISOString()),
        expirationDate: String(attrs.expiration_date || ''),
        nameservers: input.nameservers || DEFAULT_NAMESERVERS,
        whoisPrivacy: input.whoisPrivacy || false,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return {
        success: false,
        domain: input.domain,
        orderId: '',
        registrationDate: '',
        expirationDate: '',
        nameservers: [],
        whoisPrivacy: false,
        error: message,
      }
    }
  }

  private buildContactSet(contacts: DomainRegistrationInput['contacts']): Record<string, unknown> {
    const contactSet: Record<string, unknown> = {}

    const buildContact = (contact: DomainContact) => ({
      first_name: contact.firstName,
      last_name: contact.lastName,
      org_name: contact.orgName || '',
      email: contact.email,
      phone: contact.phone,
      address1: contact.address1,
      address2: contact.address2 || '',
      city: contact.city,
      state: contact.state,
      postal_code: contact.postalCode,
      country: contact.country,
    })

    contactSet.owner = buildContact(contacts.owner)
    contactSet.admin = contacts.admin ? buildContact(contacts.admin) : contactSet.owner
    contactSet.billing = contacts.billing ? buildContact(contacts.billing) : contactSet.owner
    contactSet.tech = contacts.tech ? buildContact(contacts.tech) : contactSet.owner

    return contactSet
  }

  private buildNameserverList(nameservers: string[]): Record<string, unknown>[] {
    return nameservers.map((ns, index) => ({
      sortorder: index + 1,
      name: ns,
    }))
  }

  // ===========================================================================
  // Domain Management
  // ===========================================================================

  /**
   * Get domain information
   */
  async getDomainInfo(domain: string): Promise<DomainInfo | null> {
    try {
      const response = await this.request('GET', 'DOMAIN', {
        domain,
        type: 'all_info',
      })

      const attrs = response.attributes || {}

      return {
        domain,
        status: this.parseStatus(String(attrs.status || 'active')),
        registrationDate: String(attrs.registry_createdate || ''),
        expirationDate: String(attrs.expiredate || ''),
        autoRenew: attrs.auto_renew === '1',
        nameservers: this.parseNameservers(attrs.nameserver_list as unknown),
        whoisPrivacy: attrs.whois_privacy === '1',
        locked: attrs.f_lock_domain === '1',
        contacts: {
          owner: this.parseContact(attrs.contact_set as Record<string, unknown>, 'owner'),
        },
      }
    } catch {
      return null
    }
  }

  private parseStatus(status: string): DomainInfo['status'] {
    const statusMap: Record<string, DomainInfo['status']> = {
      active: 'active',
      expired: 'expired',
      redemption: 'redemption',
      'pending delete': 'pendingDelete',
      transferred: 'transferred',
    }
    return statusMap[status.toLowerCase()] || 'active'
  }

  private parseNameservers(nsList: unknown): string[] {
    if (!nsList || typeof nsList !== 'object') return []
    if (Array.isArray(nsList)) {
      return nsList.map(ns => typeof ns === 'object' && ns !== null ? String((ns as Record<string, unknown>).name || '') : String(ns))
    }
    return []
  }

  private parseContact(contactSet: Record<string, unknown> | undefined, type: string): DomainContact {
    const contact = (contactSet?.[type] as Record<string, unknown>) || {}
    return {
      firstName: String(contact.first_name || ''),
      lastName: String(contact.last_name || ''),
      orgName: String(contact.org_name || ''),
      email: String(contact.email || ''),
      phone: String(contact.phone || ''),
      address1: String(contact.address1 || ''),
      address2: String(contact.address2 || ''),
      city: String(contact.city || ''),
      state: String(contact.state || ''),
      postalCode: String(contact.postal_code || ''),
      country: String(contact.country || ''),
    }
  }

  /**
   * Update domain nameservers
   */
  async updateNameservers(domain: string, nameservers: string[]): Promise<NameserverUpdateResult> {
    try {
      await this.request('MODIFY', 'DOMAIN', {
        domain,
        data: 'nameservers',
        nameserver_list: this.buildNameserverList(nameservers),
      })

      return {
        success: true,
        domain,
        nameservers,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return {
        success: false,
        domain,
        nameservers: [],
        error: message,
      }
    }
  }

  /**
   * Renew a domain
   */
  async renewDomain(domain: string, period: number = 1): Promise<DomainRenewalResult> {
    try {
      const response = await this.request('RENEW', 'DOMAIN', {
        domain,
        period,
        handle: 'process',
      })

      const attrs = response.attributes || {}

      return {
        success: true,
        domain,
        orderId: String(attrs.id || attrs.order_id || ''),
        newExpirationDate: String(attrs.new_expiredate || ''),
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return {
        success: false,
        domain,
        orderId: '',
        newExpirationDate: '',
        error: message,
      }
    }
  }

  /**
   * Get domain transfer auth code (EPP code)
   */
  async getAuthCode(domain: string): Promise<AuthCodeResult> {
    try {
      const response = await this.request('GET', 'DOMAIN', {
        domain,
        type: 'auth_info',
      })

      const attrs = response.attributes || {}

      return {
        success: true,
        domain,
        authCode: String(attrs.auth_info || ''),
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return {
        success: false,
        domain,
        error: message,
      }
    }
  }

  /**
   * Enable/disable domain lock
   */
  async setDomainLock(domain: string, locked: boolean): Promise<boolean> {
    try {
      await this.request('MODIFY', 'DOMAIN', {
        domain,
        data: 'lock_state',
        lock_state: locked ? 1 : 0,
      })
      return true
    } catch {
      return false
    }
  }

  /**
   * Enable/disable auto-renewal
   */
  async setAutoRenew(domain: string, enabled: boolean): Promise<boolean> {
    try {
      await this.request('MODIFY', 'DOMAIN', {
        domain,
        data: 'auto_renew',
        auto_renew: enabled ? 1 : 0,
      })
      return true
    } catch {
      return false
    }
  }

  /**
   * Enable/disable WHOIS privacy
   */
  async setWhoisPrivacy(domain: string, enabled: boolean): Promise<boolean> {
    try {
      await this.request('MODIFY', 'DOMAIN', {
        domain,
        data: 'whois_privacy',
        f_whois_privacy: enabled ? 1 : 0,
      })
      return true
    } catch {
      return false
    }
  }

  // ===========================================================================
  // Transfer-In (Enhancement 4)
  // ===========================================================================

  /**
   * Check if a domain is eligible for transfer-in
   *
   * Note: Fields like currentRegistrar and expiresAt vary by TLD/registry.
   * Only `transferrable` is reliably returned.
   *
   * IMPORTANT: Run sandbox tests before production to validate actual responses.
   */
  async checkTransferEligibility(domain: string): Promise<TransferEligibility> {
    try {
      const response = await this.request('CHECK_TRANSFER', 'DOMAIN', {
        domain,
      })

      const attrs = response.attributes || {}
      const transferrable = attrs.transferrable === '1' || attrs.transferrable === 1

      return {
        eligible: transferrable,
        domain,
        reason: transferrable ? undefined : String(attrs.reason || attrs.status || 'Domain cannot be transferred'),
        // Optional fields - may not exist for all TLDs
        currentRegistrar: attrs.current_registrar as string | undefined,
        expiresAt: attrs.expiration_date as string | undefined,
        daysUntilExpiry: attrs.days_until_expiry ? parseInt(String(attrs.days_until_expiry), 10) : undefined,
      }
    } catch (error) {
      return {
        eligible: false,
        domain,
        reason: error instanceof Error ? error.message : 'Failed to check eligibility',
      }
    }
  }

  /**
   * Initiate domain transfer-in
   *
   * IMPORTANT: Only call this after payment is confirmed.
   * Auth code should not be accepted until payment succeeds.
   *
   * NOTE: Status mappings should be validated against actual OpenSRS
   * sandbox responses before going to production.
   */
  async initiateTransferIn(input: TransferInInput): Promise<TransferInResult> {
    try {
      const contactSet = this.buildContactSet(input.contacts)

      const response = await this.request('SW_REGISTER', 'DOMAIN', {
        domain: input.domain,
        reg_type: 'transfer',
        auth_info: input.authCode,
        period: 1, // Transfer extends by 1 year
        reg_username: this.username,
        reg_password: randomBytes(12).toString('base64url'),
        handle: 'process',
        contact_set: contactSet,
        custom_nameservers: input.nameservers ? 1 : 0,
        ...(input.nameservers && {
          nameserver_list: this.buildNameserverList(input.nameservers),
        }),
        f_whois_privacy: input.whoisPrivacy ? 1 : 0,
      })

      return {
        success: true,
        domain: input.domain,
        orderId: String(response.attributes?.id || response.attributes?.order_id || ''),
        status: 'initiated',
      }
    } catch (error) {
      return {
        success: false,
        domain: input.domain,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Transfer initiation failed',
      }
    }
  }

  /**
   * Check transfer status by order ID
   *
   * Note: Status field mappings should be validated against actual OpenSRS
   * sandbox responses before going to production.
   */
  async getTransferStatus(orderId: string): Promise<TransferInResult> {
    try {
      const response = await this.request('GET_ORDER_INFO', 'DOMAIN', {
        order_id: orderId,
      })

      const attrs = response.attributes || {}
      const rawStatus = String(attrs.status || attrs.order_status || 'unknown')

      // Normalize status: lowercase, trim, collapse whitespace, replace underscores
      const normalizeStatus = (s: string) =>
        s.toLowerCase().trim().replace(/[_\s]+/g, ' ')

      // TODO: Validate these mappings against actual sandbox responses
      // OpenSRS may use different fields for transfer-specific status
      const statusMap: Record<string, TransferInResult['status']> = {
        'pending': 'pending',
        'in progress': 'processing',
        'processing': 'processing',
        'completed': 'completed',
        'done': 'completed',
        'failed': 'failed',
        'cancelled': 'failed',
        'declined': 'failed',
      }

      const normalizedStatus = normalizeStatus(rawStatus)
      const mappedStatus = statusMap[normalizedStatus] || 'processing'

      return {
        success: mappedStatus === 'completed',
        domain: String(attrs.domain || ''),
        orderId,
        status: mappedStatus,
        rawStatus, // Preserve original for debugging
        error: mappedStatus === 'failed' ? String(attrs.status_info || attrs.decline_reason || 'Transfer failed') : undefined,
      }
    } catch (error) {
      return {
        success: false,
        domain: '',
        orderId,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Failed to get status',
      }
    }
  }

  // ===========================================================================
  // TLD Pricing
  // ===========================================================================

  /**
   * Get pricing for TLDs from database (synced daily by batch_pricing_sync job)
   * Falls back to OpenSRS API if DB is empty
   *
   * Caching strategy:
   * 1. Check Redis cache (5 minute TTL for hot path)
   * 2. Read from database (synced daily)
   * 3. Fall back to API if DB empty (initial setup only)
   */
  async getTldPricing(): Promise<DomainPricing[]> {
    const redis = getBestEffortRedis()
    const pool = getPoolSafe()

    // Try Redis cache first (5 minute TTL for hot path)
    if (redis) {
      try {
        const cached = await redis.get('tld-pricing-cache')
        if (cached) {
          return JSON.parse(cached)
        }
      } catch {
        // Redis error - continue to DB
      }
    }

    // Read from database (synced by batch_pricing_sync job)
    if (pool) {
      try {
        const { rows } = await pool.query(`
          SELECT tld, registration_price_cents, renewal_price_cents, transfer_price_cents
          FROM inhouse_domain_pricing
          WHERE available = true
          ORDER BY tld
        `)

        if (rows.length > 0) {
          const pricing = rows.map(row => ({
            tld: row.tld,
            registration: row.registration_price_cents / 100,
            renewal: row.renewal_price_cents / 100,
            transfer: row.transfer_price_cents / 100,
            currency: 'USD' as const,
          }))

          // Cache in Redis for 5 minutes
          if (redis) {
            try {
              await redis.setex('tld-pricing-cache', 300, JSON.stringify(pricing))
            } catch {
              // Cache write failed - non-critical
            }
          }

          return pricing
        }
      } catch (error) {
        console.warn('[OpenSrsService] DB pricing query failed:', error)
      }
    }

    // Fallback to API (should rarely happen after initial setup)
    return this.fetchTldPricingFromApi()
  }

  /**
   * Fetch TLD pricing directly from OpenSRS API
   * Used as fallback when DB is empty (initial setup)
   */
  private async fetchTldPricingFromApi(): Promise<DomainPricing[]> {
    const tlds = ['com', 'net', 'org', 'io', 'co', 'app', 'dev', 'ai']
    const pricing: DomainPricing[] = []

    for (const tld of tlds) {
      try {
        const response = await this.request('GET_PRICE', 'DOMAIN', {
          domain: `example.${tld}`,
          period: 1,
        })

        const price = parseFloat(response.attributes?.price as string || '0')
        if (price > 0) {
          pricing.push({
            tld,
            registration: price,
            renewal: price,
            transfer: price,
            currency: 'USD',
          })
        }
      } catch {
        // Skip TLDs we can't price
      }
    }

    return pricing
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let serviceInstance: OpenSrsService | null = null

export function getOpenSrsService(): OpenSrsService {
  if (!serviceInstance) {
    serviceInstance = new OpenSrsService()
  }
  return serviceInstance
}

/**
 * Check if OpenSRS is configured
 */
export function isOpenSrsConfigured(): boolean {
  return Boolean(OPENSRS_USERNAME && OPENSRS_API_KEY)
}
