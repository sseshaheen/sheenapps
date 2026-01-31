/**
 * In-House Domains Service
 *
 * Manages custom email domains for Easy Mode projects.
 * Handles domain verification, DNS checking, and Resend integration.
 *
 * Part of easy-mode-email-plan.md (Phase 2A: Custom Domain - Manual DNS)
 */

import { getPool } from '../databaseWrapper'
import { logActivity } from './InhouseActivityLogger'
import {
  DnsVerificationService,
  DnsVerificationStatus,
  DnsInstructions,
  DnsScanResult,
  ScannedDnsRecord,
  getDnsVerificationService,
  generateVerificationToken
} from './DnsVerificationService'
import {
  CloudflareService,
  getCloudflareService,
  isCloudflareConfigured,
  CloudflareZone,
  CloudflareDnsRecord,
} from './CloudflareService'
import { UserCloudflareService } from './UserCloudflareService'
import { encrypt, decrypt } from '../../utils/credentialEncryption'

// =============================================================================
// CONFIGURATION
// =============================================================================

const RESEND_API_KEY = process.env.RESEND_API_KEY
const RESEND_API_URL = 'https://api.resend.com'

// Maximum domains per project
const MAX_DOMAINS_FREE = 1
const MAX_DOMAINS_PRO = 5
const MAX_DOMAINS_ENTERPRISE = 50

// =============================================================================
// TYPES
// =============================================================================

export type AuthorityLevel = 'manual' | 'subdomain' | 'nameservers' | 'cf_token'
export type DomainStatus = 'pending' | 'verifying' | 'verified' | 'error'

export interface EmailDomain {
  id: string
  projectId: string
  domain: string
  isSubdomain: boolean
  authorityLevel: AuthorityLevel
  provider: string
  resendDomainId?: string
  cloudflareZoneId?: string
  importedRecords?: CloudflareDnsRecord[]
  dnsStatus: {
    spf: { verified: boolean; actual?: string; error?: string }
    dkim: { verified: boolean; actual?: string; error?: string }
    dmarc: { verified: boolean; actual?: string; error?: string }
    mx: { verified: boolean; actual?: string; error?: string }
    returnPath: { verified: boolean; actual?: string; error?: string }
  }
  verificationToken: string
  ownershipVerified: boolean
  ownershipVerifiedAt?: string
  status: DomainStatus
  lastError?: string
  lastCheckedAt?: string
  createdAt: string
  updatedAt: string
}

export interface ChangeAuthorityLevelResult {
  domain: EmailDomain
  previousAuthorityLevel: AuthorityLevel
  dnsInstructions: DnsInstructions
}

export interface AddDomainInput {
  domain: string
  isSubdomain?: boolean
  authorityLevel?: AuthorityLevel
}

export interface AddDomainResult {
  domain: EmailDomain
  dnsInstructions: DnsInstructions
}

export interface VerifyDomainResult {
  domain: EmailDomain
  verification: DnsVerificationStatus
  readyForSending: boolean
}

export interface SubdomainDelegationResult {
  domain: EmailDomain
  nameServers: string[]
  instructions: string
}

export interface NameserverSwitchResult {
  domain: EmailDomain
  nameServers: string[]
  existingRecords: CloudflareDnsRecord[]
  instructions: string
}

export interface CloudflareDelegationStatus {
  delegated: boolean
  zoneActive: boolean
  nameServers: string[]
  emailRecordsProvisioned: boolean
}

export interface NameserverSwitchPreview {
  domain: string
  currentNameservers: string[]
  newNameservers: string[]
  existingRecords: ScannedDnsRecord[]
  recordsToImport: number
  warnings: string[]
  instructions: string
}

// =============================================================================
// RESEND API TYPES
// =============================================================================

interface ResendDomain {
  id: string
  name: string
  status: string
  created_at: string
  records: Array<{
    record: string
    name: string
    type: string
    ttl: string
    status: string
    value: string
    priority?: number
  }>
}

// =============================================================================
// SERVICE
// =============================================================================

export class InhouseDomainsService {
  private projectId: string
  private dnsService: DnsVerificationService

  constructor(projectId: string) {
    this.projectId = projectId
    this.dnsService = getDnsVerificationService()
  }

  // ===========================================================================
  // Domain Management
  // ===========================================================================

  /**
   * Add a new custom domain
   */
  async addDomain(input: AddDomainInput): Promise<AddDomainResult> {
    const pool = getPool()

    // Normalize domain
    const domain = input.domain.toLowerCase().trim()

    // Validate domain format
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)) {
      throw new Error('INVALID_DOMAIN: Domain format is invalid')
    }

    // Check domain count limit (basic check - enhance with subscription status)
    const countResult = await pool.query(
      `SELECT COUNT(*) as count FROM inhouse_email_domains WHERE project_id = $1`,
      [this.projectId]
    )
    const currentCount = parseInt(countResult.rows[0].count, 10)
    if (currentCount >= MAX_DOMAINS_FREE) {
      throw new Error('QUOTA_EXCEEDED: Maximum domains reached for this plan')
    }

    // Generate verification token
    const verificationToken = generateVerificationToken()

    // Determine if this is a subdomain
    const isSubdomain = input.isSubdomain ?? domain.split('.').length > 2
    const authorityLevel = input.authorityLevel ?? 'manual'

    // Insert domain
    const result = await pool.query(
      `INSERT INTO inhouse_email_domains (
        project_id, domain, is_subdomain, authority_level, verification_token
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *`,
      [this.projectId, domain, isSubdomain, authorityLevel, verificationToken]
    )

    const domainRecord = this.rowToDomain(result.rows[0])

    // Generate DNS instructions
    const dnsInstructions = this.dnsService.generateDnsInstructions(domain, verificationToken)

    // Log activity
    logActivity({
      projectId: this.projectId,
      service: 'domains',
      action: 'add_domain',
      actorType: 'user',
      resourceType: 'email_domain',
      resourceId: domainRecord.id,
      metadata: { domain, authorityLevel }
    })

    return { domain: domainRecord, dnsInstructions }
  }

  /**
   * List all domains for the project
   */
  async listDomains(): Promise<EmailDomain[]> {
    const pool = getPool()

    const result = await pool.query(
      `SELECT * FROM inhouse_email_domains
       WHERE project_id = $1
       ORDER BY created_at DESC`,
      [this.projectId]
    )

    return result.rows.map(row => this.rowToDomain(row))
  }

  /**
   * Get a single domain by ID
   */
  async getDomain(domainId: string): Promise<EmailDomain | null> {
    const pool = getPool()

    const result = await pool.query(
      `SELECT * FROM inhouse_email_domains
       WHERE id = $1 AND project_id = $2`,
      [domainId, this.projectId]
    )

    if (result.rows.length === 0) {
      return null
    }

    return this.rowToDomain(result.rows[0])
  }

  /**
   * Get domain by domain name
   */
  async getDomainByName(domain: string): Promise<EmailDomain | null> {
    const pool = getPool()

    const result = await pool.query(
      `SELECT * FROM inhouse_email_domains
       WHERE domain = $1 AND project_id = $2`,
      [domain.toLowerCase(), this.projectId]
    )

    if (result.rows.length === 0) {
      return null
    }

    return this.rowToDomain(result.rows[0])
  }

  /**
   * Get the primary verified domain ready for sending emails.
   * Returns the oldest verified domain (first verified wins as primary).
   */
  async getVerifiedSendingDomain(): Promise<EmailDomain | null> {
    const pool = getPool()

    // Get verified domains ordered by verification time (oldest first = primary)
    const result = await pool.query(
      `SELECT * FROM inhouse_email_domains
       WHERE project_id = $1
         AND status = 'verified'
         AND resend_domain_id IS NOT NULL
         AND dns_status->'spf'->>'verified' = 'true'
         AND dns_status->'dkim'->>'verified' = 'true'
       ORDER BY ownership_verified_at ASC
       LIMIT 1`,
      [this.projectId]
    )

    if (result.rows.length === 0) {
      return null
    }

    return this.rowToDomain(result.rows[0])
  }

  /**
   * Check if a domain is ready for sending (SPF + DKIM verified)
   */
  isDomainReadyForSending(domain: EmailDomain): boolean {
    return (
      domain.status === 'verified' &&
      domain.resendDomainId != null &&
      domain.dnsStatus.spf.verified &&
      domain.dnsStatus.dkim.verified
    )
  }

  /**
   * Delete a domain
   */
  async deleteDomain(domainId: string): Promise<boolean> {
    const pool = getPool()

    // Get domain first for logging and Resend cleanup
    const domain = await this.getDomain(domainId)
    if (!domain) {
      return false
    }

    // Remove from Resend if added
    if (domain.resendDomainId) {
      try {
        await this.removeFromResend(domain.resendDomainId)
      } catch (error) {
        console.error('[DomainsService] Failed to remove from Resend:', error)
        // Continue with deletion even if Resend removal fails
      }
    }

    // Delete from database
    const result = await pool.query(
      `DELETE FROM inhouse_email_domains
       WHERE id = $1 AND project_id = $2`,
      [domainId, this.projectId]
    )

    if (result.rowCount === 0) {
      return false
    }

    // Log activity
    logActivity({
      projectId: this.projectId,
      service: 'domains',
      action: 'delete_domain',
      actorType: 'user',
      resourceType: 'email_domain',
      resourceId: domainId,
      metadata: { domain: domain.domain }
    })

    return true
  }

  // ===========================================================================
  // Verification
  // ===========================================================================

  /**
   * Verify domain DNS records
   */
  async verifyDomain(domainId: string): Promise<VerifyDomainResult> {
    const pool = getPool()

    // Get domain
    const domain = await this.getDomain(domainId)
    if (!domain) {
      throw new Error('NOT_FOUND: Domain not found')
    }

    // Update status to verifying
    await pool.query(
      `UPDATE inhouse_email_domains
       SET status = 'verifying', updated_at = NOW()
       WHERE id = $1`,
      [domainId]
    )

    // Get DKIM value from Resend if we have a domain ID
    let dkimValue: string | undefined
    if (domain.resendDomainId) {
      const resendDomain = await this.getResendDomain(domain.resendDomainId)
      if (resendDomain) {
        const dkimRecord = resendDomain.records.find(r => r.record === 'DKIM')
        dkimValue = dkimRecord?.value
      }
    }

    // Run DNS verification
    const verification = await this.dnsService.verifyAll(
      domain.domain,
      domain.verificationToken,
      { dkimValue }
    )

    // Check if ready for sending
    const readyForSending = this.dnsService.isReadyForSending(verification)

    // Determine new status
    let newStatus: DomainStatus = 'pending'
    let lastError: string | null = null

    if (readyForSending) {
      newStatus = 'verified'
    } else if (verification.ownership.verified) {
      // Ownership verified but not ready for sending
      newStatus = 'verifying'
      const errors = []
      if (!verification.spf.verified) errors.push('SPF')
      if (!verification.dkim.verified) errors.push('DKIM')
      lastError = `Missing: ${errors.join(', ')}`
    } else {
      newStatus = 'pending'
      lastError = 'Domain ownership not verified'
    }

    // Convert verification status to storage format (camelCase keys to match TypeScript interface)
    // source: 'observed' means we checked actual DNS records (vs 'provisioned' for auto-verify)
    const dnsStatus = {
      spf: { verified: verification.spf.verified, actual: verification.spf.actual, error: verification.spf.error, source: 'observed' as const },
      dkim: { verified: verification.dkim.verified, actual: verification.dkim.actual, error: verification.dkim.error, source: 'observed' as const },
      dmarc: { verified: verification.dmarc.verified, actual: verification.dmarc.actual, error: verification.dmarc.error, source: 'observed' as const },
      mx: { verified: verification.mx.verified, actual: verification.mx.actual, error: verification.mx.error, source: 'observed' as const },
      returnPath: { verified: verification.returnPath.verified, actual: verification.returnPath.actual, error: verification.returnPath.error, source: 'observed' as const }
    }

    // Update database
    await pool.query(
      `UPDATE inhouse_email_domains
       SET dns_status = $1,
           ownership_verified = $2,
           ownership_verified_at = CASE WHEN $2 AND ownership_verified_at IS NULL THEN NOW() ELSE ownership_verified_at END,
           status = $3,
           last_error = $4,
           last_checked_at = NOW(),
           updated_at = NOW()
       WHERE id = $5`,
      [JSON.stringify(dnsStatus), verification.ownership.verified, newStatus, lastError, domainId]
    )

    // If newly verified and not yet added to Resend, add it
    if (readyForSending && !domain.resendDomainId) {
      try {
        const resendDomain = await this.addToResend(domain.domain)
        if (resendDomain) {
          await pool.query(
            `UPDATE inhouse_email_domains
             SET resend_domain_id = $1, updated_at = NOW()
             WHERE id = $2`,
            [resendDomain.id, domainId]
          )
        }
      } catch (error) {
        console.error('[DomainsService] Failed to add to Resend:', error)
        // Don't fail verification if Resend add fails
      }
    }

    // Get updated domain
    const updatedDomain = await this.getDomain(domainId)

    // Log activity
    logActivity({
      projectId: this.projectId,
      service: 'domains',
      action: 'verify_domain',
      actorType: 'system',
      resourceType: 'email_domain',
      resourceId: domainId,
      status: readyForSending ? 'success' : 'pending',
      metadata: {
        domain: domain.domain,
        ownershipVerified: verification.ownership.verified,
        spfVerified: verification.spf.verified,
        dkimVerified: verification.dkim.verified,
        readyForSending
      }
    })

    return {
      domain: updatedDomain!,
      verification,
      readyForSending
    }
  }

  /**
   * Get DNS instructions for a domain
   */
  async getDnsInstructions(domainId: string): Promise<DnsInstructions | null> {
    const domain = await this.getDomain(domainId)
    if (!domain) {
      return null
    }

    // Get DKIM records from Resend if available
    let resendRecords: { dkimHost?: string; dkimValue?: string } | undefined
    if (domain.resendDomainId) {
      const resendDomain = await this.getResendDomain(domain.resendDomainId)
      if (resendDomain) {
        const dkimRecord = resendDomain.records.find(r => r.record === 'DKIM')
        if (dkimRecord) {
          resendRecords = {
            dkimHost: dkimRecord.name,
            dkimValue: dkimRecord.value
          }
        }
      }
    }

    return this.dnsService.generateDnsInstructions(
      domain.domain,
      domain.verificationToken,
      resendRecords
    )
  }

  // ===========================================================================
  // Resend Integration
  // ===========================================================================

  /**
   * Add domain to Resend
   */
  private async addToResend(domain: string): Promise<ResendDomain | null> {
    if (!RESEND_API_KEY) {
      console.warn('[DomainsService] RESEND_API_KEY not configured')
      return null
    }

    try {
      const response = await fetch(`${RESEND_API_URL}/domains`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: domain })
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Resend API error: ${response.status} ${error}`)
      }

      return await response.json()
    } catch (error) {
      console.error('[DomainsService] Failed to add domain to Resend:', error)
      throw error
    }
  }

  /**
   * Get domain from Resend
   */
  private async getResendDomain(resendDomainId: string): Promise<ResendDomain | null> {
    if (!RESEND_API_KEY) {
      return null
    }

    try {
      const response = await fetch(`${RESEND_API_URL}/domains/${resendDomainId}`, {
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`
        }
      })

      if (!response.ok) {
        return null
      }

      return await response.json()
    } catch (error) {
      console.error('[DomainsService] Failed to get domain from Resend:', error)
      return null
    }
  }

  /**
   * Remove domain from Resend
   */
  private async removeFromResend(resendDomainId: string): Promise<void> {
    if (!RESEND_API_KEY) {
      return
    }

    try {
      const response = await fetch(`${RESEND_API_URL}/domains/${resendDomainId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`
        }
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Resend API error: ${response.status} ${error}`)
      }
    } catch (error) {
      console.error('[DomainsService] Failed to remove domain from Resend:', error)
      throw error
    }
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  /**
   * Convert database row to EmailDomain
   */
  private rowToDomain(row: any): EmailDomain {
    return {
      id: row.id,
      projectId: row.project_id,
      domain: row.domain,
      isSubdomain: row.is_subdomain,
      authorityLevel: row.authority_level,
      provider: row.provider,
      resendDomainId: row.resend_domain_id,
      cloudflareZoneId: row.cloudflare_zone_id,
      importedRecords: row.imported_records,
      dnsStatus: row.dns_status || {
        spf: { verified: false },
        dkim: { verified: false },
        dmarc: { verified: false },
        mx: { verified: false },
        returnPath: { verified: false }
      },
      verificationToken: row.verification_token,
      ownershipVerified: row.ownership_verified,
      ownershipVerifiedAt: row.ownership_verified_at?.toISOString(),
      status: row.status,
      lastError: row.last_error,
      lastCheckedAt: row.last_checked_at?.toISOString(),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString()
    }
  }

  // ===========================================================================
  // Subdomain Delegation (Path 1a)
  // ===========================================================================

  /**
   * Initiate subdomain delegation for a domain like mail.example.com
   * Creates Cloudflare zone and returns NS records for user to add at their registrar.
   */
  async initiateSubdomainDelegation(domainId: string): Promise<SubdomainDelegationResult> {
    if (!isCloudflareConfigured()) {
      throw new Error('CLOUDFLARE_NOT_CONFIGURED: Cloudflare integration is not configured')
    }

    const pool = getPool()
    const cfService = getCloudflareService()

    // Get domain
    const domain = await this.getDomain(domainId)
    if (!domain) {
      throw new Error('NOT_FOUND: Domain not found')
    }

    if (domain.authorityLevel !== 'subdomain') {
      throw new Error('INVALID_AUTHORITY: Domain must have subdomain authority level')
    }

    // Check if zone already exists
    if (domain.cloudflareZoneId) {
      const existingZone = await cfService.getZone(domain.cloudflareZoneId)
      if (existingZone) {
        return {
          domain,
          nameServers: existingZone.nameServers,
          instructions: this.generateSubdomainInstructions(domain.domain, existingZone.nameServers),
        }
      }
    }

    // Create Cloudflare zone for the subdomain
    const zone = await cfService.createZone({
      name: domain.domain,
      type: 'full',
      jumpStart: false, // No existing records to import for subdomain
    })

    // Update domain with Cloudflare zone ID
    await pool.query(
      `UPDATE inhouse_email_domains
       SET cloudflare_zone_id = $1, updated_at = NOW()
       WHERE id = $2`,
      [zone.id, domainId]
    )

    // Log activity
    logActivity({
      projectId: this.projectId,
      service: 'domains',
      action: 'initiate_subdomain_delegation',
      actorType: 'user',
      resourceType: 'email_domain',
      resourceId: domainId,
      metadata: {
        domain: domain.domain,
        zoneId: zone.id,
        nameServers: zone.nameServers,
      },
    })

    // Get updated domain
    const updatedDomain = await this.getDomain(domainId)

    return {
      domain: updatedDomain!,
      nameServers: zone.nameServers,
      instructions: this.generateSubdomainInstructions(domain.domain, zone.nameServers),
    }
  }

  /**
   * Check subdomain delegation status
   */
  async checkSubdomainDelegation(domainId: string): Promise<CloudflareDelegationStatus> {
    if (!isCloudflareConfigured()) {
      throw new Error('CLOUDFLARE_NOT_CONFIGURED: Cloudflare integration is not configured')
    }

    const cfService = getCloudflareService()

    // Get domain
    const domain = await this.getDomain(domainId)
    if (!domain) {
      throw new Error('NOT_FOUND: Domain not found')
    }

    if (!domain.cloudflareZoneId) {
      return {
        delegated: false,
        zoneActive: false,
        nameServers: [],
        emailRecordsProvisioned: false,
      }
    }

    // Check zone status
    const zoneStatus = await cfService.checkZoneStatus(domain.cloudflareZoneId)

    // Check if email records are provisioned
    let emailRecordsProvisioned = false
    if (zoneStatus.active) {
      const records = await cfService.listDnsRecords(domain.cloudflareZoneId)
      const hasSPF = records.some(r => r.type === 'TXT' && r.content.includes('spf'))
      const hasDKIM = records.some(r => r.name.includes('_domainkey'))
      emailRecordsProvisioned = hasSPF && hasDKIM
    }

    return {
      delegated: zoneStatus.active,
      zoneActive: zoneStatus.active,
      nameServers: zoneStatus.nameServers,
      emailRecordsProvisioned,
    }
  }

  /**
   * Provision email DNS records after subdomain delegation is complete
   */
  async provisionSubdomainEmailRecords(domainId: string): Promise<void> {
    if (!isCloudflareConfigured()) {
      throw new Error('CLOUDFLARE_NOT_CONFIGURED: Cloudflare integration is not configured')
    }

    const pool = getPool()
    const cfService = getCloudflareService()

    // Get domain
    const domain = await this.getDomain(domainId)
    if (!domain) {
      throw new Error('NOT_FOUND: Domain not found')
    }

    if (!domain.cloudflareZoneId) {
      throw new Error('NO_ZONE: No Cloudflare zone configured for this domain')
    }

    // Check zone is active
    const zoneStatus = await cfService.checkZoneStatus(domain.cloudflareZoneId)
    if (!zoneStatus.active) {
      throw new Error('ZONE_NOT_ACTIVE: Cloudflare zone is not active yet. Please complete NS delegation.')
    }

    // Provision email records
    await cfService.provisionEmailDnsRecords(
      domain.cloudflareZoneId,
      domain.domain,
      domain.verificationToken
    )

    // Auto-verify since we control the DNS — we just created all records
    // source: 'provisioned' distinguishes from 'observed' (actual DNS query verification)
    const dnsStatus = {
      spf: { verified: true, source: 'provisioned' },
      dkim: { verified: true, source: 'provisioned' },
      dmarc: { verified: true, source: 'provisioned' },
      mx: { verified: true, source: 'provisioned' },
      returnPath: { verified: true, source: 'provisioned' },
    }

    // Add domain to Resend for outbound sending
    let resendDomainId: string | null = null
    try {
      const resendDomain = await this.addToResend(domain.domain)
      if (resendDomain) {
        resendDomainId = resendDomain.id
      }
    } catch (error) {
      console.error('[DomainsService] Failed to add to Resend during auto-verify:', error)
    }

    await pool.query(
      `UPDATE inhouse_email_domains
       SET dns_status = $1,
           ownership_verified = true,
           ownership_verified_at = COALESCE(ownership_verified_at, NOW()),
           status = 'verified',
           last_error = NULL,
           last_checked_at = NOW(),
           resend_domain_id = COALESCE($2, resend_domain_id),
           updated_at = NOW()
       WHERE id = $3`,
      [JSON.stringify(dnsStatus), resendDomainId, domainId]
    )

    // Log activity
    logActivity({
      projectId: this.projectId,
      service: 'domains',
      action: 'provision_email_records',
      actorType: 'system',
      resourceType: 'email_domain',
      resourceId: domainId,
      metadata: { domain: domain.domain, autoVerified: true },
    })
  }

  // ===========================================================================
  // Nameserver Switch (Path 1b)
  // ===========================================================================

  /**
   * Preview what will happen when nameservers are switched.
   * Scans existing DNS records to show user what will be imported.
   * Call this BEFORE initiating the switch so user can verify.
   */
  async previewNameserverSwitch(domainId: string): Promise<NameserverSwitchPreview> {
    if (!isCloudflareConfigured()) {
      throw new Error('CLOUDFLARE_NOT_CONFIGURED: Cloudflare integration is not configured')
    }

    // Get domain
    const domain = await this.getDomain(domainId)
    if (!domain) {
      throw new Error('NOT_FOUND: Domain not found')
    }

    if (domain.authorityLevel !== 'nameservers') {
      throw new Error('INVALID_AUTHORITY: Domain must have nameservers authority level')
    }

    // Scan existing DNS records
    const scanResult = await this.dnsService.scanExistingDnsRecords(domain.domain)

    // Cloudflare nameservers will be assigned after zone creation
    // For now, show typical CF nameserver format
    const newNameservers = [
      '*.ns.cloudflare.com',
      '*.ns.cloudflare.com',
    ]

    // Generate warnings based on scan
    const warnings = [...scanResult.warnings]

    // Check for potential issues
    const hasExistingDkim = scanResult.records.some(r => r.name.includes('_domainkey'))
    if (hasExistingDkim) {
      warnings.push('Existing DKIM records found. These will be preserved but may need updating for SheenApps email.')
    }

    const hasExistingSpf = scanResult.records.some(r => r.type === 'TXT' && r.value.includes('v=spf1'))
    if (hasExistingSpf) {
      warnings.push('Existing SPF record found. SheenApps will add its own SPF include after switch.')
    }

    // Generate instructions
    const instructions = this.generateNameserverPreviewInstructions(domain.domain, scanResult)

    // Log activity
    logActivity({
      projectId: this.projectId,
      service: 'domains',
      action: 'preview_nameserver_switch',
      actorType: 'user',
      resourceType: 'email_domain',
      resourceId: domainId,
      metadata: {
        domain: domain.domain,
        recordCount: scanResult.records.length,
        warningCount: warnings.length,
      },
    })

    return {
      domain: domain.domain,
      currentNameservers: scanResult.currentNameservers,
      newNameservers,
      existingRecords: scanResult.records,
      recordsToImport: scanResult.records.length,
      warnings,
      instructions,
    }
  }

  private generateNameserverPreviewInstructions(domain: string, scan: DnsScanResult): string {
    return `
## Nameserver Switch Preview for ${domain}

### Current Setup
- **Current Nameservers:** ${scan.currentNameservers.join(', ') || 'Unknown'}
- **Records Found:** ${scan.records.length}

### What Will Happen

1. **Cloudflare zone will be created** for ${domain}
2. **Existing DNS records will be imported** automatically by Cloudflare
3. You'll receive **new Cloudflare nameservers** to set at your registrar
4. **Once propagated**, SheenApps will provision email DNS records

### Records That Will Be Imported

${this.formatRecordsForPreview(scan.records)}

### Important Notes

- DNS propagation can take up to 48 hours
- Your website and existing services should continue working
- Email records (SPF, DKIM, DMARC) will be added after switch completes
- You can always switch back to your original nameservers if needed

${scan.warnings.length > 0 ? `\n### Warnings\n\n${scan.warnings.map(w => `⚠️ ${w}`).join('\n')}` : ''}
`.trim()
  }

  private formatRecordsForPreview(records: ScannedDnsRecord[]): string {
    if (records.length === 0) {
      return '*No records found*'
    }

    const grouped = records.reduce((acc, record) => {
      const existingArr = acc[record.type]
      if (existingArr) {
        existingArr.push(record)
      } else {
        acc[record.type] = [record]
      }
      return acc
    }, {} as Record<string, ScannedDnsRecord[]>)

    const lines: string[] = []
    for (const [type, recs] of Object.entries(grouped)) {
      lines.push(`\n**${type} Records:**`)
      for (const rec of recs.slice(0, 5)) { // Limit to 5 per type
        const priority = rec.priority ? ` (priority: ${rec.priority})` : ''
        const value = rec.value.length > 60 ? rec.value.substring(0, 57) + '...' : rec.value
        lines.push(`- ${rec.name}: ${value}${priority}`)
      }
      if (recs.length > 5) {
        lines.push(`- ... and ${recs.length - 5} more ${type} records`)
      }
    }

    return lines.join('\n')
  }

  /**
   * Initiate nameserver switch for full domain management.
   * Creates Cloudflare zone and imports existing DNS records.
   */
  async initiateNameserverSwitch(domainId: string): Promise<NameserverSwitchResult> {
    if (!isCloudflareConfigured()) {
      throw new Error('CLOUDFLARE_NOT_CONFIGURED: Cloudflare integration is not configured')
    }

    const pool = getPool()
    const cfService = getCloudflareService()

    // Get domain
    const domain = await this.getDomain(domainId)
    if (!domain) {
      throw new Error('NOT_FOUND: Domain not found')
    }

    if (domain.authorityLevel !== 'nameservers') {
      throw new Error('INVALID_AUTHORITY: Domain must have nameservers authority level')
    }

    // Check if zone already exists
    if (domain.cloudflareZoneId) {
      const existingZone = await cfService.getZone(domain.cloudflareZoneId)
      if (existingZone) {
        const records = await cfService.listDnsRecords(domain.cloudflareZoneId)
        return {
          domain,
          nameServers: existingZone.nameServers,
          existingRecords: records,
          instructions: this.generateNameserverInstructions(domain.domain, existingZone.nameServers),
        }
      }
    }

    // Create Cloudflare zone with jump start to import existing records
    const zone = await cfService.createZone({
      name: domain.domain,
      type: 'full',
      jumpStart: true, // Import existing DNS records
    })

    // Wait a moment for records to be imported
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Get imported records
    const importedRecords = await cfService.listDnsRecords(zone.id)

    // Update domain with Cloudflare zone ID and imported records
    await pool.query(
      `UPDATE inhouse_email_domains
       SET cloudflare_zone_id = $1, imported_records = $2, updated_at = NOW()
       WHERE id = $3`,
      [zone.id, JSON.stringify(importedRecords), domainId]
    )

    // Log activity
    logActivity({
      projectId: this.projectId,
      service: 'domains',
      action: 'initiate_nameserver_switch',
      actorType: 'user',
      resourceType: 'email_domain',
      resourceId: domainId,
      metadata: {
        domain: domain.domain,
        zoneId: zone.id,
        nameServers: zone.nameServers,
        importedRecordsCount: importedRecords.length,
      },
    })

    // Get updated domain
    const updatedDomain = await this.getDomain(domainId)

    return {
      domain: updatedDomain!,
      nameServers: zone.nameServers,
      existingRecords: importedRecords,
      instructions: this.generateNameserverInstructions(domain.domain, zone.nameServers),
    }
  }

  /**
   * Check nameserver switch status
   */
  async checkNameserverSwitch(domainId: string): Promise<CloudflareDelegationStatus> {
    // Same logic as subdomain delegation check
    return this.checkSubdomainDelegation(domainId)
  }

  /**
   * Provision email DNS records after nameserver switch is complete
   */
  async provisionNameserverEmailRecords(domainId: string): Promise<void> {
    // Same logic as subdomain email records provisioning
    return this.provisionSubdomainEmailRecords(domainId)
  }

  // ===========================================================================
  // Instruction Generators
  // ===========================================================================

  private generateSubdomainInstructions(domain: string, nameServers: string[]): string {
    const parentDomain = domain.split('.').slice(1).join('.')
    const subdomain = domain.split('.')[0]

    return `
## Subdomain Delegation Setup

To complete the setup, add the following NS records at your domain registrar for ${parentDomain}:

**Subdomain:** ${subdomain}
**Record Type:** NS

Add these two NS records:
${nameServers.map((ns, i) => `${i + 1}. ${ns}`).join('\n')}

### Instructions by Registrar

**GoDaddy:**
1. Go to DNS Management for ${parentDomain}
2. Click "Add" under DNS Records
3. Type: NS, Host: ${subdomain}, Points to: ${nameServers[0]}
4. Repeat for the second nameserver

**Namecheap:**
1. Go to Domain List > ${parentDomain} > Advanced DNS
2. Add New Record > NS Record
3. Host: ${subdomain}, Value: ${nameServers[0]}
4. Repeat for the second nameserver

**Cloudflare (if managing ${parentDomain} elsewhere):**
1. Go to DNS settings for ${parentDomain}
2. Add NS records for ${subdomain} pointing to the nameservers above

DNS changes may take up to 48 hours to propagate.
`.trim()
  }

  private generateNameserverInstructions(domain: string, nameServers: string[]): string {
    return `
## Nameserver Switch Setup

To complete the setup, change your nameservers at your domain registrar for ${domain}:

**New Nameservers:**
${nameServers.map((ns, i) => `${i + 1}. ${ns}`).join('\n')}

### Instructions by Registrar

**GoDaddy:**
1. Go to My Products > Domains > ${domain}
2. Click "Manage DNS" > "DNS Settings"
3. Under Nameservers, click "Change"
4. Select "Enter my own nameservers"
5. Enter the nameservers listed above

**Namecheap:**
1. Go to Domain List > ${domain}
2. Under Nameservers, select "Custom DNS"
3. Enter the nameservers listed above

**Google Domains:**
1. Go to My domains > ${domain} > DNS
2. Under "Name servers", switch to "Use custom name servers"
3. Enter the nameservers listed above

### Important Notes

- Your existing DNS records have been imported automatically
- DNS changes may take up to 48 hours to propagate
- During propagation, some users may see old records while others see new ones
- Once complete, we will automatically provision email DNS records
`.trim()
  }

  // ===========================================================================
  // Cloudflare Token Integration (Phase 2C)
  // ===========================================================================

  /**
   * Connect a user-provided Cloudflare API token to a domain.
   * Verifies the token, finds the matching zone, and stores encrypted.
   */
  async connectCloudflareToken(domainId: string, apiToken: string): Promise<{ zoneId: string; zoneName: string }> {
    const pool = getPool()

    // Get domain
    const domain = await this.getDomain(domainId)
    if (!domain) {
      throw new Error('NOT_FOUND: Domain not found')
    }

    const userCf = new UserCloudflareService(apiToken)

    // Verify token is valid
    const isValid = await userCf.verifyToken()
    if (!isValid) {
      throw new Error('INVALID_TOKEN: Cloudflare API token is invalid or inactive')
    }

    // Find zone for domain
    const zone = await userCf.findZoneForDomain(domain.domain)
    if (!zone) {
      throw new Error('ZONE_NOT_FOUND: No Cloudflare zone found for this domain. Ensure the token has Zone:Read permission.')
    }

    // Encrypt token
    const { encrypted, iv } = encrypt(apiToken)

    // Store encrypted token + zone ID
    await pool.query(
      `UPDATE inhouse_email_domains
       SET cf_user_token_encrypted = $1,
           cf_user_token_iv = $2,
           cf_user_zone_id = $3,
           authority_level = 'cf_token',
           updated_at = NOW()
       WHERE id = $4`,
      [encrypted, iv, zone.id, domainId]
    )

    logActivity({
      projectId: this.projectId,
      service: 'domains',
      action: 'connect_cloudflare_token',
      actorType: 'user',
      resourceType: 'email_domain',
      resourceId: domainId,
      metadata: { domain: domain.domain, zoneId: zone.id, zoneName: zone.name },
    })

    return { zoneId: zone.id, zoneName: zone.name }
  }

  /**
   * Provision email DNS records using the user's stored Cloudflare token.
   * Auto-verifies since we just created the records.
   */
  async provisionCfTokenEmailRecords(domainId: string): Promise<void> {
    const pool = getPool()

    // Get domain with CF token
    const domain = await this.getDomain(domainId)
    if (!domain) {
      throw new Error('NOT_FOUND: Domain not found')
    }

    if (domain.authorityLevel !== 'cf_token') {
      throw new Error('INVALID_AUTHORITY: Domain must have cf_token authority level to provision via token')
    }

    // Get encrypted token from DB
    const { rows } = await pool.query(
      `SELECT cf_user_token_encrypted, cf_user_token_iv, cf_user_zone_id
       FROM inhouse_email_domains WHERE id = $1`,
      [domainId]
    )
    const row = rows[0]
    if (!row?.cf_user_token_encrypted || !row?.cf_user_token_iv || !row?.cf_user_zone_id) {
      throw new Error('NO_CF_TOKEN: No Cloudflare token configured for this domain')
    }

    // Decrypt token
    const apiToken = decrypt(row.cf_user_token_encrypted, row.cf_user_token_iv)
    const userCf = new UserCloudflareService(apiToken)

    // Provision DNS records
    await userCf.provisionEmailDnsRecords(row.cf_user_zone_id, domain.domain, domain.verificationToken)

    // Auto-verify since we just created the records
    // source: 'provisioned' distinguishes from 'observed' (actual DNS query verification)
    const dnsStatus = {
      spf: { verified: true, source: 'provisioned' },
      dkim: { verified: true, source: 'provisioned' },
      dmarc: { verified: true, source: 'provisioned' },
      mx: { verified: true, source: 'provisioned' },
      returnPath: { verified: true, source: 'provisioned' },
    }

    // Add domain to Resend for outbound sending
    let resendDomainId: string | null = null
    try {
      const resendDomain = await this.addToResend(domain.domain)
      if (resendDomain) {
        resendDomainId = resendDomain.id
      }
    } catch (error) {
      console.error('[DomainsService] Failed to add to Resend during CF token provision:', error)
    }

    await pool.query(
      `UPDATE inhouse_email_domains
       SET dns_status = $1,
           ownership_verified = true,
           ownership_verified_at = COALESCE(ownership_verified_at, NOW()),
           status = 'verified',
           last_error = NULL,
           last_checked_at = NOW(),
           resend_domain_id = COALESCE($2, resend_domain_id),
           updated_at = NOW()
       WHERE id = $3`,
      [JSON.stringify(dnsStatus), resendDomainId, domainId]
    )

    logActivity({
      projectId: this.projectId,
      service: 'domains',
      action: 'provision_cf_token_email_records',
      actorType: 'user',
      resourceType: 'email_domain',
      resourceId: domainId,
      metadata: { domain: domain.domain, autoVerified: true },
    })
  }

  /**
   * Disconnect a Cloudflare API token from a domain.
   * Optionally removes provisioned DNS records from the user's zone.
   */
  async disconnectCloudflareToken(domainId: string, removeRecords: boolean = false): Promise<void> {
    const pool = getPool()

    const domain = await this.getDomain(domainId)
    if (!domain) {
      throw new Error('NOT_FOUND: Domain not found')
    }

    // Optionally deprovision records
    if (removeRecords) {
      const { rows } = await pool.query(
        `SELECT cf_user_token_encrypted, cf_user_token_iv, cf_user_zone_id
         FROM inhouse_email_domains WHERE id = $1`,
        [domainId]
      )
      const row = rows[0]
      if (row?.cf_user_token_encrypted && row?.cf_user_token_iv && row?.cf_user_zone_id) {
        try {
          const apiToken = decrypt(row.cf_user_token_encrypted, row.cf_user_token_iv)
          const userCf = new UserCloudflareService(apiToken)
          await userCf.deprovisionEmailDnsRecords(row.cf_user_zone_id, domain.domain)
        } catch (error) {
          console.error('[DomainsService] Failed to deprovision records during disconnect:', error)
        }
      }
    }

    // Clear token columns, reset authority
    await pool.query(
      `UPDATE inhouse_email_domains
       SET cf_user_token_encrypted = NULL,
           cf_user_token_iv = NULL,
           cf_user_zone_id = NULL,
           authority_level = 'manual',
           updated_at = NOW()
       WHERE id = $1`,
      [domainId]
    )

    logActivity({
      projectId: this.projectId,
      service: 'domains',
      action: 'disconnect_cloudflare_token',
      actorType: 'user',
      resourceType: 'email_domain',
      resourceId: domainId,
      metadata: { domain: domain.domain, recordsRemoved: removeRecords },
    })
  }

  /**
   * Atomically change a domain's authority level in a single transaction.
   * Resets verification state and cleans up CF credentials when switching away from cf_token.
   * CF DNS record cleanup is a soft-fail side effect outside the transaction.
   */
  async changeAuthorityLevel(domainId: string, newAuthorityLevel: AuthorityLevel): Promise<ChangeAuthorityLevelResult> {
    const pool = getPool()
    const client = await pool.connect()

    let lockedRow: any
    let previousAuthorityLevel: AuthorityLevel

    try {
      await client.query('BEGIN')

      // Lock the row for update to prevent concurrent modifications
      const { rows } = await client.query(
        `SELECT * FROM inhouse_email_domains
         WHERE id = $1 AND project_id = $2
         FOR UPDATE`,
        [domainId, this.projectId]
      )

      if (rows.length === 0) {
        await client.query('ROLLBACK')
        throw new Error('NOT_FOUND: Domain not found')
      }

      lockedRow = rows[0]
      previousAuthorityLevel = lockedRow.authority_level

      // No-op if same authority level
      if (previousAuthorityLevel === newAuthorityLevel) {
        await client.query('ROLLBACK')
        const domain = this.rowToDomain(lockedRow)
        const dnsInstructions = this.dnsService.generateDnsInstructions(domain.domain, domain.verificationToken)
        return { domain, previousAuthorityLevel, dnsInstructions }
      }

      // Build UPDATE: reset verification state, clear stale associations
      // Always clear resend_domain_id, cloudflare_zone_id, imported_records
      // (switching approach means starting over — stale DKIM/zone refs cause confusion)
      // Only clear CF token columns when switching away from cf_token
      const clearCfTokenColumns = previousAuthorityLevel === 'cf_token'

      if (clearCfTokenColumns) {
        await client.query(
          `UPDATE inhouse_email_domains
           SET authority_level = $1,
               status = 'pending',
               dns_status = NULL,
               ownership_verified = false,
               ownership_verified_at = NULL,
               last_error = NULL,
               last_checked_at = NULL,
               resend_domain_id = NULL,
               cloudflare_zone_id = NULL,
               imported_records = NULL,
               cf_user_token_encrypted = NULL,
               cf_user_token_iv = NULL,
               cf_user_zone_id = NULL,
               updated_at = NOW()
           WHERE id = $2`,
          [newAuthorityLevel, domainId]
        )
      } else {
        await client.query(
          `UPDATE inhouse_email_domains
           SET authority_level = $1,
               status = 'pending',
               dns_status = NULL,
               ownership_verified = false,
               ownership_verified_at = NULL,
               last_error = NULL,
               last_checked_at = NULL,
               resend_domain_id = NULL,
               cloudflare_zone_id = NULL,
               imported_records = NULL,
               updated_at = NOW()
           WHERE id = $2`,
          [newAuthorityLevel, domainId]
        )
      }

      // Fetch updated row
      const { rows: updatedRows } = await client.query(
        `SELECT * FROM inhouse_email_domains WHERE id = $1`,
        [domainId]
      )

      await client.query('COMMIT')

      const updatedDomain = this.rowToDomain(updatedRows[0])

      // Outside transaction: soft-fail CF cleanup
      if (previousAuthorityLevel === 'cf_token' &&
          lockedRow.cf_user_token_encrypted &&
          lockedRow.cf_user_token_iv &&
          lockedRow.cf_user_zone_id) {
        try {
          const apiToken = decrypt(lockedRow.cf_user_token_encrypted, lockedRow.cf_user_token_iv)
          const userCf = new UserCloudflareService(apiToken)
          await userCf.deprovisionEmailDnsRecords(lockedRow.cf_user_zone_id, updatedDomain.domain)
        } catch (error) {
          console.error('[DomainsService] Soft-fail: CF cleanup after authority level change:', error)
        }
      }

      // Generate DNS instructions for new approach
      const dnsInstructions = this.dnsService.generateDnsInstructions(updatedDomain.domain, updatedDomain.verificationToken)

      // Log activity
      logActivity({
        projectId: this.projectId,
        service: 'domains',
        action: 'change_authority_level',
        actorType: 'user',
        resourceType: 'email_domain',
        resourceId: domainId,
        metadata: {
          domain: updatedDomain.domain,
          previousAuthorityLevel,
          newAuthorityLevel,
        },
      })

      return { domain: updatedDomain, previousAuthorityLevel, dnsInstructions }
    } catch (error) {
      // Rollback if not already done
      try { await client.query('ROLLBACK') } catch (_) { /* ignore */ }
      throw error
    } finally {
      client.release()
    }
  }
}

// =============================================================================
// SINGLETON FACTORY
// =============================================================================

const serviceCache = new Map<string, { service: InhouseDomainsService; timestamp: number }>()
const CACHE_TTL = 60000 // 1 minute

export function getInhouseDomainsService(projectId: string): InhouseDomainsService {
  const now = Date.now()
  const cached = serviceCache.get(projectId)

  if (cached && now - cached.timestamp < CACHE_TTL) {
    return cached.service
  }

  const service = new InhouseDomainsService(projectId)
  serviceCache.set(projectId, { service, timestamp: now })
  return service
}
