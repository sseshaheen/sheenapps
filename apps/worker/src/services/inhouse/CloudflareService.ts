/**
 * Cloudflare DNS Service
 *
 * Manages DNS zones and records via Cloudflare API for custom email domains.
 * Used for subdomain delegation (Path 1a) and nameserver switch (Path 1b).
 *
 * Part of easy-mode-email-plan.md (Phase 2B: Cloudflare-Managed DNS)
 */

import { EMAIL_DNS } from './emailDnsConstants'

// =============================================================================
// CONFIGURATION
// =============================================================================

const CLOUDFLARE_API_URL = 'https://api.cloudflare.com/client/v4'
const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN_WORKERS
const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID

// Request timeout in milliseconds
const REQUEST_TIMEOUT_MS = 15000

// =============================================================================
// TYPES
// =============================================================================

export type DnsRecordType = 'A' | 'AAAA' | 'CNAME' | 'TXT' | 'MX' | 'NS' | 'SRV' | 'CAA'

export interface CloudflareZone {
  id: string
  name: string
  status: 'active' | 'pending' | 'initializing' | 'moved' | 'deleted'
  paused: boolean
  type: 'full' | 'partial'
  nameServers: string[]
  originalNameServers?: string[]
  createdOn: string
  modifiedOn: string
}

export interface CloudflareDnsRecord {
  id: string
  zoneId: string
  zoneName: string
  name: string
  type: DnsRecordType
  content: string
  proxiable: boolean
  proxied: boolean
  ttl: number
  priority?: number
  locked: boolean
  createdOn: string
  modifiedOn: string
}

export interface CreateZoneInput {
  name: string
  /**
   * Zone type:
   * - 'full': User switches nameservers to Cloudflare
   * - 'partial': CNAME setup (Enterprise only, not used for email)
   */
  type?: 'full' | 'partial'
  /**
   * Jump start: Import existing DNS records from current nameservers
   */
  jumpStart?: boolean
}

export interface CreateDnsRecordInput {
  zoneId: string
  type: DnsRecordType
  name: string
  content: string
  ttl?: number
  priority?: number
  proxied?: boolean
  comment?: string
}

export interface UpdateDnsRecordInput {
  recordId: string
  zoneId: string
  type?: DnsRecordType
  name?: string
  content?: string
  ttl?: number
  priority?: number
  proxied?: boolean
  comment?: string
}

export interface EmailDnsRecordSet {
  ownership: CreateDnsRecordInput
  spf: CreateDnsRecordInput
  dkim: CreateDnsRecordInput
  dmarc: CreateDnsRecordInput
  mx: CreateDnsRecordInput
  returnPath: CreateDnsRecordInput
}

// Cloudflare API response types
interface CloudflareApiResponse<T> {
  success: boolean
  errors: Array<{ code: number; message: string }>
  messages: Array<{ code: number; message: string }>
  result: T
  result_info?: {
    page: number
    per_page: number
    total_pages: number
    count: number
    total_count: number
  }
}

// Raw Cloudflare zone response
interface CloudflareZoneRaw {
  id: string
  name: string
  status: string
  paused: boolean
  type: string
  name_servers: string[]
  original_name_servers?: string[]
  created_on: string
  modified_on: string
}

// Raw Cloudflare DNS record response
interface CloudflareDnsRecordRaw {
  id: string
  zone_id: string
  zone_name: string
  name: string
  type: string
  content: string
  proxiable: boolean
  proxied: boolean
  ttl: number
  priority?: number
  locked: boolean
  created_on: string
  modified_on: string
}

// =============================================================================
// SERVICE
// =============================================================================

export class CloudflareService {
  private apiToken: string
  private accountId: string

  constructor() {
    if (!CLOUDFLARE_API_TOKEN) {
      throw new Error('CLOUDFLARE_API_TOKEN is required')
    }
    if (!CLOUDFLARE_ACCOUNT_ID) {
      throw new Error('CLOUDFLARE_ACCOUNT_ID is required')
    }
    this.apiToken = CLOUDFLARE_API_TOKEN
    this.accountId = CLOUDFLARE_ACCOUNT_ID
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>
  ): Promise<T> {
    const url = `${CLOUDFLARE_API_URL}${path}`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    try {
      const response = await fetch(url, {
        method,
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      })

      const text = await response.text()
      let data: CloudflareApiResponse<T>

      try {
        data = JSON.parse(text) as CloudflareApiResponse<T>
      } catch {
        throw new Error(`Cloudflare non-JSON response (${response.status}): ${text.slice(0, 200)}`)
      }

      if (!response.ok || !data.success) {
        const errorMessages = data?.errors?.map(e => e.message).join(', ') || `HTTP ${response.status}`
        throw new Error(`Cloudflare API error: ${errorMessages}`)
      }

      return data.result
    } finally {
      clearTimeout(timeout)
    }
  }

  private async requestPaginated<T>(path: string): Promise<T[]> {
    const results: T[] = []
    let page = 1
    const perPage = 100

    while (true) {
      const url = `${CLOUDFLARE_API_URL}${path}${path.includes('?') ? '&' : '?'}page=${page}&per_page=${perPage}`
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

      try {
        const response = await fetch(url, {
          method: 'GET',
          signal: controller.signal,
          headers: {
            'Authorization': `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json',
          },
        })

        const text = await response.text()
        let data: CloudflareApiResponse<T[]>

        try {
          data = JSON.parse(text) as CloudflareApiResponse<T[]>
        } catch {
          throw new Error(`Cloudflare non-JSON response (${response.status})`)
        }

        if (!response.ok || !data.success) {
          const errorMessages = data?.errors?.map(e => e.message).join(', ') || `HTTP ${response.status}`
          throw new Error(`Cloudflare API error: ${errorMessages}`)
        }

        results.push(...data.result)

        // Check if there are more pages
        if (!data.result_info || page >= data.result_info.total_pages) {
          break
        }

        page++
      } finally {
        clearTimeout(timeout)
      }
    }

    return results
  }

  private rawToZone(raw: CloudflareZoneRaw): CloudflareZone {
    return {
      id: raw.id,
      name: raw.name,
      status: raw.status as CloudflareZone['status'],
      paused: raw.paused,
      type: raw.type as CloudflareZone['type'],
      nameServers: raw.name_servers,
      originalNameServers: raw.original_name_servers,
      createdOn: raw.created_on,
      modifiedOn: raw.modified_on,
    }
  }

  private rawToRecord(raw: CloudflareDnsRecordRaw): CloudflareDnsRecord {
    return {
      id: raw.id,
      zoneId: raw.zone_id,
      zoneName: raw.zone_name,
      name: raw.name,
      type: raw.type as DnsRecordType,
      content: raw.content,
      proxiable: raw.proxiable,
      proxied: raw.proxied,
      ttl: raw.ttl,
      priority: raw.priority,
      locked: raw.locked,
      createdOn: raw.created_on,
      modifiedOn: raw.modified_on,
    }
  }

  // ===========================================================================
  // Zone Management
  // ===========================================================================

  /**
   * Create a new DNS zone in Cloudflare
   */
  async createZone(input: CreateZoneInput): Promise<CloudflareZone> {
    const raw = await this.request<CloudflareZoneRaw>('POST', '/zones', {
      name: input.name,
      type: input.type || 'full',
      account: { id: this.accountId },
      jump_start: input.jumpStart ?? false,
    })

    return this.rawToZone(raw)
  }

  /**
   * Get zone by ID
   */
  async getZone(zoneId: string): Promise<CloudflareZone | null> {
    try {
      const raw = await this.request<CloudflareZoneRaw>('GET', `/zones/${zoneId}`)
      return this.rawToZone(raw)
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      if (message.includes('not found') || message.includes('Invalid zone')) {
        return null
      }
      throw error
    }
  }

  /**
   * Get zone by domain name
   */
  async getZoneByName(name: string): Promise<CloudflareZone | null> {
    try {
      const url = `/zones?name=${encodeURIComponent(name)}&account.id=${this.accountId}`
      const response = await fetch(`${CLOUDFLARE_API_URL}${url}`, {
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
      })

      const data = await response.json() as CloudflareApiResponse<CloudflareZoneRaw[]>

      if (!data.success || data.result.length === 0) {
        return null
      }

      const firstZone = data.result[0]
      if (!firstZone) return null

      return this.rawToZone(firstZone)
    } catch {
      return null
    }
  }

  /**
   * Delete a zone
   */
  async deleteZone(zoneId: string): Promise<boolean> {
    try {
      await this.request<{ id: string }>('DELETE', `/zones/${zoneId}`)
      return true
    } catch {
      return false
    }
  }

  /**
   * List all zones for the account
   */
  async listZones(): Promise<CloudflareZone[]> {
    const raws = await this.requestPaginated<CloudflareZoneRaw>(
      `/zones?account.id=${this.accountId}`
    )
    return raws.map(raw => this.rawToZone(raw))
  }

  /**
   * Check zone status (is nameserver switch complete?)
   */
  async checkZoneStatus(zoneId: string): Promise<{
    active: boolean
    status: CloudflareZone['status']
    nameServers: string[]
    originalNameServers?: string[]
  }> {
    const zone = await this.getZone(zoneId)
    if (!zone) {
      throw new Error('Zone not found')
    }

    return {
      active: zone.status === 'active',
      status: zone.status,
      nameServers: zone.nameServers,
      originalNameServers: zone.originalNameServers,
    }
  }

  // ===========================================================================
  // DNS Record Management
  // ===========================================================================

  /**
   * Create a DNS record
   */
  async createDnsRecord(input: CreateDnsRecordInput): Promise<CloudflareDnsRecord> {
    const raw = await this.request<CloudflareDnsRecordRaw>(
      'POST',
      `/zones/${input.zoneId}/dns_records`,
      {
        type: input.type,
        name: input.name,
        content: input.content,
        ttl: input.ttl || 1, // 1 = automatic
        priority: input.priority,
        proxied: input.proxied ?? false,
        comment: input.comment,
      }
    )

    return this.rawToRecord(raw)
  }

  /**
   * Get a DNS record by ID
   */
  async getDnsRecord(zoneId: string, recordId: string): Promise<CloudflareDnsRecord | null> {
    try {
      const raw = await this.request<CloudflareDnsRecordRaw>(
        'GET',
        `/zones/${zoneId}/dns_records/${recordId}`
      )
      return this.rawToRecord(raw)
    } catch {
      return null
    }
  }

  /**
   * List all DNS records for a zone
   */
  async listDnsRecords(zoneId: string): Promise<CloudflareDnsRecord[]> {
    const raws = await this.requestPaginated<CloudflareDnsRecordRaw>(
      `/zones/${zoneId}/dns_records`
    )
    return raws.map(raw => this.rawToRecord(raw))
  }

  /**
   * Update a DNS record
   */
  async updateDnsRecord(input: UpdateDnsRecordInput): Promise<CloudflareDnsRecord> {
    const payload: Record<string, unknown> = {}
    if (input.type) payload.type = input.type
    if (input.name) payload.name = input.name
    if (input.content) payload.content = input.content
    if (input.ttl !== undefined) payload.ttl = input.ttl
    if (input.priority !== undefined) payload.priority = input.priority
    if (input.proxied !== undefined) payload.proxied = input.proxied
    if (input.comment !== undefined) payload.comment = input.comment

    const raw = await this.request<CloudflareDnsRecordRaw>(
      'PATCH',
      `/zones/${input.zoneId}/dns_records/${input.recordId}`,
      payload
    )

    return this.rawToRecord(raw)
  }

  /**
   * Delete a DNS record
   */
  async deleteDnsRecord(zoneId: string, recordId: string): Promise<boolean> {
    try {
      await this.request<{ id: string }>(
        'DELETE',
        `/zones/${zoneId}/dns_records/${recordId}`
      )
      return true
    } catch {
      return false
    }
  }

  /**
   * Find DNS records by type and optionally name
   */
  async findDnsRecords(
    zoneId: string,
    type: DnsRecordType,
    name?: string
  ): Promise<CloudflareDnsRecord[]> {
    let url = `/zones/${zoneId}/dns_records?type=${type}`
    if (name) {
      url += `&name=${encodeURIComponent(name)}`
    }

    const raws = await this.requestPaginated<CloudflareDnsRecordRaw>(url)
    return raws.map(raw => this.rawToRecord(raw))
  }

  // ===========================================================================
  // Email DNS Provisioning
  // ===========================================================================

  /**
   * Generate email DNS records for a domain.
   * These records enable email sending via Resend.
   *
   * IMPORTANT: Uses EMAIL_DNS constants for consistency with DnsVerificationService.
   */
  generateEmailDnsRecords(
    zoneId: string,
    domain: string,
    verificationToken: string,
    resendDkimValue?: string
  ): EmailDnsRecordSet {
    return {
      // Ownership verification - uses subdomain to avoid conflicts with other TXT records
      ownership: {
        zoneId,
        type: 'TXT',
        name: EMAIL_DNS.OWNERSHIP_HOST(domain),
        content: EMAIL_DNS.OWNERSHIP_VALUE(verificationToken),
        ttl: EMAIL_DNS.DEFAULT_TTL,
        comment: 'SheenApps domain ownership verification',
      },
      // SPF record
      spf: {
        zoneId,
        type: 'TXT',
        name: domain,
        content: EMAIL_DNS.SPF_VALUE,
        ttl: EMAIL_DNS.DEFAULT_TTL,
        comment: 'SPF record for email sending via Resend',
      },
      // DKIM record (requires Resend-provided value)
      dkim: {
        zoneId,
        type: 'CNAME',
        name: EMAIL_DNS.DKIM_HOST(domain),
        content: resendDkimValue || 'resend._domainkey.resend.dev',
        ttl: EMAIL_DNS.DEFAULT_TTL,
        comment: 'DKIM record for email authentication',
      },
      // DMARC record
      dmarc: {
        zoneId,
        type: 'TXT',
        name: EMAIL_DNS.DMARC_HOST(domain),
        content: EMAIL_DNS.DMARC_VALUE(domain),
        ttl: EMAIL_DNS.DEFAULT_TTL,
        comment: 'DMARC policy for email authentication',
      },
      // MX record (for receiving emails)
      // NOTE: Auto-provisioning MX can break existing email. Consider making this opt-in.
      mx: {
        zoneId,
        type: 'MX',
        name: domain,
        content: EMAIL_DNS.MX_TARGET,
        priority: EMAIL_DNS.MX_PRIORITY,
        ttl: EMAIL_DNS.DEFAULT_TTL,
        comment: 'MX record for receiving emails via Resend',
      },
      // Return-Path (bounce handling) - uses "bounces" (plural) subdomain
      returnPath: {
        zoneId,
        type: 'CNAME',
        name: EMAIL_DNS.RETURN_PATH_HOST(domain),
        content: EMAIL_DNS.RETURN_PATH_TARGET,
        ttl: EMAIL_DNS.DEFAULT_TTL,
        comment: 'Return-Path for bounce handling',
      },
    }
  }

  /**
   * Provision all email DNS records for a zone
   */
  async provisionEmailDnsRecords(
    zoneId: string,
    domain: string,
    verificationToken: string,
    resendDkimValue?: string
  ): Promise<{
    ownership: CloudflareDnsRecord
    spf: CloudflareDnsRecord
    dkim: CloudflareDnsRecord
    dmarc: CloudflareDnsRecord
    mx: CloudflareDnsRecord
    returnPath: CloudflareDnsRecord
  }> {
    const records = this.generateEmailDnsRecords(zoneId, domain, verificationToken, resendDkimValue)

    // Check for existing records and update or create
    const [ownership, spf, dkim, dmarc, mx, returnPath] = await Promise.all([
      this.upsertDnsRecord(records.ownership),
      this.upsertDnsRecord(records.spf),
      this.upsertDnsRecord(records.dkim),
      this.upsertDnsRecord(records.dmarc),
      this.upsertDnsRecord(records.mx),
      this.upsertDnsRecord(records.returnPath),
    ])

    return { ownership, spf, dkim, dmarc, mx, returnPath }
  }

  /**
   * Create or update a DNS record (upsert)
   */
  private async upsertDnsRecord(input: CreateDnsRecordInput): Promise<CloudflareDnsRecord> {
    // Check if record already exists
    const existing = await this.findDnsRecords(input.zoneId, input.type, input.name)
    const firstExisting = existing[0]

    if (firstExisting) {
      // Update existing record
      return this.updateDnsRecord({
        recordId: firstExisting.id,
        zoneId: input.zoneId,
        type: input.type,
        name: input.name,
        content: input.content,
        ttl: input.ttl,
        priority: input.priority,
        proxied: input.proxied,
        comment: input.comment,
      })
    }

    // Create new record
    return this.createDnsRecord(input)
  }

  /**
   * Switch MX records from one target to another.
   * Used when enabling/disabling hosted mailboxes on a Cloudflare-managed domain.
   *
   * Safety: Only auto-switches if the domain has exactly one MX record matching
   * the expected old target (or zero MX records). If the MX set is unexpected,
   * throws MX_NOT_AUTO_SWITCHABLE so the caller can return manual instructions.
   */
  async switchMxRecords(
    zoneId: string,
    domain: string,
    oldMxTarget: string,
    newMxTarget: string,
    newPriority: number = 10
  ): Promise<void> {
    // Find existing MX records for this domain
    const mxRecords = await this.findDnsRecords(zoneId, 'MX', domain)

    const normMx = (v: string) => v.trim().toLowerCase().replace(/\.$/, '')
    const normalizedOld = normMx(oldMxTarget)
    const contents = mxRecords.map(r => normMx(r.content))

    // Safe to switch if: no MX records, or exactly one matching the old target
    const hasOnlyExpected = contents.length === 0 ||
      (contents.length === 1 && contents[0] === normalizedOld)

    if (!hasOnlyExpected) {
      const err = new Error(`MX records for ${domain} are not in an auto-switchable state. Found: ${contents.join(', ')}`)
      ;(err as any).code = 'MX_NOT_AUTO_SWITCHABLE'
      ;(err as any).mxRecords = mxRecords.map(r => ({ content: r.content, priority: r.priority }))
      throw err
    }

    // Delete the old MX record if it exists
    for (const record of mxRecords) {
      if (normMx(record.content) === normalizedOld) {
        await this.deleteDnsRecord(zoneId, record.id)
        console.log(`[Cloudflare] Deleted MX record: ${record.content} for ${domain}`)
      }
    }

    // Create new MX record
    await this.createDnsRecord({
      zoneId,
      type: 'MX',
      name: domain,
      content: newMxTarget,
      priority: newPriority,
      ttl: EMAIL_DNS.DEFAULT_TTL,
      comment: `MX record for ${newMxTarget === EMAIL_DNS.MX_TARGET ? 'Resend inbound' : 'OpenSRS hosted email'}`,
    })

    console.log(`[Cloudflare] Switched MX for ${domain}: ${oldMxTarget} -> ${newMxTarget}`)
  }

  /**
   * Remove all SheenApps email DNS records from a zone
   */
  async deprovisionEmailDnsRecords(zoneId: string, domain: string): Promise<void> {
    const recordNames = [
      `_sheenapps-verify.${domain}`,
      domain, // SPF (be careful - may have other TXT records)
      `resend._domainkey.${domain}`,
      `_dmarc.${domain}`,
      domain, // MX (be careful - may have other MX records)
      `bounces.${domain}`,
    ]

    // Find and delete SheenApps-specific records
    const records = await this.listDnsRecords(zoneId)

    for (const record of records) {
      // Only delete records we created (check comment or specific patterns)
      if (
        record.name === `_sheenapps-verify.${domain}` ||
        record.name === `resend._domainkey.${domain}` ||
        (record.name === `_dmarc.${domain}` && record.content.includes('sheenapps')) ||
        (record.name === `bounces.${domain}` && record.content === 'bounces.resend.com') ||
        (record.name === domain && record.type === 'TXT' && record.content.includes('resend.com')) ||
        (record.name === domain && record.type === 'MX' && record.content.includes('resend.com'))
      ) {
        await this.deleteDnsRecord(zoneId, record.id)
      }
    }
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let serviceInstance: CloudflareService | null = null

export function getCloudflareService(): CloudflareService {
  if (!serviceInstance) {
    serviceInstance = new CloudflareService()
  }
  return serviceInstance
}

/**
 * Check if Cloudflare integration is configured
 */
export function isCloudflareConfigured(): boolean {
  return Boolean(CLOUDFLARE_API_TOKEN && CLOUDFLARE_ACCOUNT_ID)
}
