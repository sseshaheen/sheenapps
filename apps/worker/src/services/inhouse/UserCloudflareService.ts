/**
 * User Cloudflare Service
 *
 * Manages DNS records on a user's Cloudflare zone using their API token.
 * Unlike CloudflareService (which uses our platform token), this service
 * is instantiated per-request with the user's decrypted token.
 *
 * Part of Phase 2C: Cloudflare API Token Integration.
 */

import { EMAIL_DNS } from './emailDnsConstants'

// =============================================================================
// CONFIGURATION
// =============================================================================

const CLOUDFLARE_API_URL = 'https://api.cloudflare.com/client/v4'
const REQUEST_TIMEOUT_MS = 15000

// =============================================================================
// TYPES
// =============================================================================

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

interface CloudflareZoneRaw {
  id: string
  name: string
  status: string
}

interface CloudflareDnsRecordRaw {
  id: string
  zone_id: string
  zone_name: string
  name: string
  type: string
  content: string
  ttl: number
  priority?: number
}

export interface UserCloudflareZone {
  id: string
  name: string
  status: string
}

// =============================================================================
// SERVICE
// =============================================================================

export class UserCloudflareService {
  private apiToken: string

  constructor(apiToken: string) {
    this.apiToken = apiToken
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

  // ===========================================================================
  // Token Verification
  // ===========================================================================

  /**
   * Verify the API token is valid
   */
  async verifyToken(): Promise<boolean> {
    try {
      const result = await this.request<{ id: string; status: string }>(
        'GET',
        '/user/tokens/verify'
      )
      return result.status === 'active'
    } catch {
      return false
    }
  }

  // ===========================================================================
  // Zone Discovery
  // ===========================================================================

  /**
   * List zones accessible by this token, optionally filtered by domain name
   */
  async listZones(domain?: string): Promise<UserCloudflareZone[]> {
    let path = '/zones?per_page=50'
    if (domain) {
      path += `&name=${encodeURIComponent(domain)}`
    }

    const result = await this.request<CloudflareZoneRaw[]>('GET', path)
    return result.map(z => ({ id: z.id, name: z.name, status: z.status }))
  }

  /**
   * Find the zone for a domain, trying both the exact domain and its parent domain.
   * e.g., for "mail.example.com", tries "mail.example.com" first, then "example.com".
   */
  async findZoneForDomain(domain: string): Promise<UserCloudflareZone | null> {
    // Try exact domain first
    const exactZones = await this.listZones(domain)
    if (exactZones.length > 0) {
      return exactZones[0]!
    }

    // Try parent domain
    const parts = domain.split('.')
    if (parts.length > 2) {
      const parentDomain = parts.slice(1).join('.')
      const parentZones = await this.listZones(parentDomain)
      if (parentZones.length > 0) {
        return parentZones[0]!
      }
    }

    return null
  }

  // ===========================================================================
  // DNS Record Management
  // ===========================================================================

  /**
   * Provision all email DNS records on a user's zone.
   * Uses upsert pattern (find existing, update or create).
   */
  async provisionEmailDnsRecords(
    zoneId: string,
    domain: string,
    verificationToken: string
  ): Promise<void> {
    const records = [
      // Ownership verification
      {
        type: 'TXT' as const,
        name: EMAIL_DNS.OWNERSHIP_HOST(domain),
        content: EMAIL_DNS.OWNERSHIP_VALUE(verificationToken),
        comment: 'SheenApps domain ownership verification',
      },
      // SPF
      {
        type: 'TXT' as const,
        name: domain,
        content: EMAIL_DNS.SPF_VALUE,
        comment: 'SPF record for email sending via Resend',
      },
      // DKIM
      {
        type: 'CNAME' as const,
        name: EMAIL_DNS.DKIM_HOST(domain),
        content: 'resend._domainkey.resend.dev',
        comment: 'DKIM record for email authentication',
      },
      // DMARC
      {
        type: 'TXT' as const,
        name: EMAIL_DNS.DMARC_HOST(domain),
        content: EMAIL_DNS.DMARC_VALUE(domain),
        comment: 'DMARC policy for email authentication',
      },
      // MX
      {
        type: 'MX' as const,
        name: domain,
        content: EMAIL_DNS.MX_TARGET,
        priority: EMAIL_DNS.MX_PRIORITY,
        comment: 'MX record for receiving emails via Resend',
      },
      // Return-Path
      {
        type: 'CNAME' as const,
        name: EMAIL_DNS.RETURN_PATH_HOST(domain),
        content: EMAIL_DNS.RETURN_PATH_TARGET,
        comment: 'Return-Path for bounce handling',
      },
    ]

    for (const record of records) {
      await this.upsertDnsRecord(zoneId, record)
    }
  }

  /**
   * Remove SheenApps email DNS records from a user's zone
   */
  async deprovisionEmailDnsRecords(zoneId: string, domain: string): Promise<void> {
    const recordSpecs = [
      { type: 'TXT', name: EMAIL_DNS.OWNERSHIP_HOST(domain) },
      { type: 'CNAME', name: EMAIL_DNS.DKIM_HOST(domain) },
      { type: 'TXT', name: EMAIL_DNS.DMARC_HOST(domain) },
      { type: 'MX', name: domain },
      { type: 'CNAME', name: EMAIL_DNS.RETURN_PATH_HOST(domain) },
      // SPF: find TXT records at root that contain our SPF value
      { type: 'TXT', name: domain, contentMatch: EMAIL_DNS.SPF_VALUE },
    ]

    for (const spec of recordSpecs) {
      try {
        const existing = await this.findDnsRecords(zoneId, spec.type, spec.name)
        for (const record of existing) {
          // For SPF, only delete if it matches our exact value
          if (spec.contentMatch && record.content !== spec.contentMatch) {
            continue
          }
          // For MX, only delete if it points to our target
          if (spec.type === 'MX' && record.content !== EMAIL_DNS.MX_TARGET) {
            continue
          }
          await this.deleteDnsRecord(zoneId, record.id)
        }
      } catch (error) {
        console.warn(`[UserCloudflare] Failed to remove ${spec.type} record ${spec.name}:`, error)
      }
    }
  }

  // ===========================================================================
  // Private DNS Helpers
  // ===========================================================================

  private async findDnsRecords(
    zoneId: string,
    type: string,
    name: string
  ): Promise<Array<{ id: string; content: string }>> {
    const path = `/zones/${zoneId}/dns_records?type=${type}&name=${encodeURIComponent(name)}`
    const result = await this.request<CloudflareDnsRecordRaw[]>('GET', path)
    return result.map(r => ({ id: r.id, content: r.content }))
  }

  private async upsertDnsRecord(
    zoneId: string,
    record: {
      type: string
      name: string
      content: string
      priority?: number
      comment?: string
    }
  ): Promise<void> {
    const existing = await this.findDnsRecords(zoneId, record.type, record.name)

    // TXT records can legitimately have multiple values at the same name
    // (SPF, Google verification, DMARC, etc). Never overwrite — only add if missing.
    if (record.type === 'TXT') {
      const alreadyExists = existing.some(r => r.content === record.content)
      if (alreadyExists) return // our record is already present
      // Create new TXT alongside any existing ones
      await this.request('POST', `/zones/${zoneId}/dns_records`, {
        type: record.type,
        name: record.name,
        content: record.content,
        ttl: EMAIL_DNS.DEFAULT_TTL,
        proxied: false,
        comment: record.comment,
      })
      return
    }

    // For CNAME/MX: expect one record per name for our use-case.
    // If one exists, update it; otherwise create.
    const firstExisting = existing[0]
    if (firstExisting) {
      await this.request('PATCH', `/zones/${zoneId}/dns_records/${firstExisting.id}`, {
        type: record.type,
        name: record.name,
        content: record.content,
        ttl: EMAIL_DNS.DEFAULT_TTL,
        priority: record.priority,
        proxied: false,
        comment: record.comment,
      })
      return
    }

    // Create new
    await this.request('POST', `/zones/${zoneId}/dns_records`, {
      type: record.type,
      name: record.name,
      content: record.content,
      ttl: EMAIL_DNS.DEFAULT_TTL,
      priority: record.priority,
      proxied: false,
      comment: record.comment,
    })
  }

  private async deleteDnsRecord(zoneId: string, recordId: string): Promise<void> {
    try {
      await this.request('DELETE', `/zones/${zoneId}/dns_records/${recordId}`)
    } catch {
      // Ignore deletion errors
    }
  }
}
