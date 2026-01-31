/**
 * In-House Mailbox Service
 *
 * Core orchestrator for real email mailboxes via OpenSRS Hosted Email.
 * Manages domain mailbox mode switching, mailbox CRUD, password resets,
 * webmail SSO, quota sync, and suspend/unsuspend.
 *
 * Part of easy-mode-email-plan.md (Phase 4: Real Mailbox)
 */

import { promises as dnsPromises } from 'dns'
import { getPool } from '../databaseWrapper'
import { getOpenSrsEmailAdapter } from './adapters/OpenSrsEmailAdapter'
import { getCloudflareService, isCloudflareConfigured } from './CloudflareService'
import { getDnsVerificationService } from './DnsVerificationService'
import { EMAIL_DNS, OPENSRS_EMAIL_DNS, RESEND_MX_TARGET } from './emailDnsConstants'
import type { MailboxEngineAdapter } from './adapters/MailboxEngineAdapter'
import type { DnsRecordStatus, DnsRecord } from './DnsVerificationService'

// =============================================================================
// TYPES
// =============================================================================

export interface Mailbox {
  id: string
  projectId: string
  domainId: string
  localPart: string
  emailAddress: string
  displayName: string | null
  provider: string
  provisioningStatus: string
  provisioningError: string | null
  provisionedAt: string | null
  quotaMb: number
  quotaUsedMb: number
  quotaLastSyncedAt: string | null
  imapEnabled: boolean
  popEnabled: boolean
  webmailEnabled: boolean
  smtpEnabled: boolean
  forwardTo: string | null
  forwardKeepCopy: boolean
  autoresponderEnabled: boolean
  autoresponderSubject: string | null
  autoresponderBody: string | null
  lastLoginAt: string | null
  messageCount: number
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateMailboxInput {
  localPart: string
  password: string
  displayName?: string
  quotaMb?: number
}

export interface UpdateMailboxInput {
  displayName?: string
  quotaMb?: number
  forwardTo?: string | null
  forwardKeepCopy?: boolean
  imapEnabled?: boolean
  popEnabled?: boolean
  webmailEnabled?: boolean
  smtpEnabled?: boolean
  autoresponderEnabled?: boolean
  autoresponderSubject?: string
  autoresponderBody?: string
}

export interface MailboxClientConfig {
  email: string
  imap: { host: string; port: number; security: string }
  pop: { host: string; port: number; security: string }
  smtp: { host: string; port: number; security: string }
  webmailUrl: string
}

export interface EnableMailboxesResult {
  success: boolean
  mxSwitched: boolean
  mxInstructions?: string
  cluster: string
}

export interface MailboxDnsReadinessResult {
  status: 'ready' | 'needs_action'
  checks: {
    mx: DnsRecordStatus
    spf: DnsRecordStatus
    dmarc: DnsRecordStatus
  }
  requiredRecords: DnsRecord[]
  lastCheckedAt: string
}

// =============================================================================
// SERVICE
// =============================================================================

export class InhouseMailboxService {
  private projectId: string
  private adapter: MailboxEngineAdapter

  constructor(projectId: string) {
    this.projectId = projectId
    this.adapter = getOpenSrsEmailAdapter()
  }

  // ===========================================================================
  // Domain-Level Operations
  // ===========================================================================

  /**
   * Enable hosted mailboxes on a domain.
   * Provisions domain on OpenSRS, switches MX records, updates DB.
   */
  async enableMailboxes(domainId: string): Promise<EnableMailboxesResult> {
    const domain = await this.getDomainRecord(domainId)
    if (!domain) throw this.notFound('Domain not found')

    if (domain.mailbox_mode === 'hosted') {
      return { success: true, mxSwitched: true, cluster: domain.opensrs_email_cluster || 'a' }
    }

    if (domain.mailbox_mode === 'hosted_pending_mx') {
      // Already provisioned on OpenSRS but MX not switched yet — return instructions
      const cluster = (domain.opensrs_email_cluster || 'a') as 'a' | 'b'
      const opensrsMx = OPENSRS_EMAIL_DNS[cluster]?.MX_TARGET || 'mail.hostedemail.com'
      const mxInstructions = `Update your MX record for ${domain.domain}:\n` +
        `- Set MX to: ${opensrsMx} (priority 10)\n\n` +
        `Warning: If you use another email provider (e.g. Google Workspace, Microsoft 365), ` +
        `changing MX records will redirect all inbound email. Review your setup before proceeding.`
      return { success: true, mxSwitched: false, mxInstructions, cluster }
    }

    const cluster = process.env.OPENSRS_EMAIL_CLUSTER || 'a'

    // 1. Provision domain on OpenSRS
    await this.adapter.provisionDomain(domain.domain)

    // 2. Switch MX records
    let mxSwitched = false
    let mxInstructions: string | undefined

    const opensrsMx = OPENSRS_EMAIL_DNS[cluster as 'a' | 'b']?.MX_TARGET || 'mail.hostedemail.com'

    if (domain.cloudflare_zone_id && isCloudflareConfigured()) {
      try {
        const cf = getCloudflareService()
        await cf.switchMxRecords(
          domain.cloudflare_zone_id,
          domain.domain,
          RESEND_MX_TARGET,
          opensrsMx,
          10
        )
        mxSwitched = true
      } catch (error: any) {
        if (error?.code === 'MX_NOT_AUTO_SWITCHABLE') {
          // MX set is not in expected state — give manual instructions instead
          mxInstructions = `Your domain ${domain.domain} has custom MX records we can't auto-switch.\n` +
            `Please update manually:\n` +
            `- Set MX to: ${opensrsMx} (priority 10)\n\n` +
            `Warning: If you use another email provider (e.g. Google Workspace, Microsoft 365), ` +
            `changing MX records will redirect all inbound email. Review your setup before proceeding.`
        } else {
          throw error
        }
      }
    } else {
      mxInstructions = `Update your MX record for ${domain.domain}:\n` +
        `- Set MX to: ${opensrsMx} (priority 10)\n\n` +
        `Warning: If you use another email provider (e.g. Google Workspace, Microsoft 365), ` +
        `changing MX records will redirect all inbound email. Review your setup before proceeding.`
    }

    // 3. Update domain record — only mark 'hosted' if MX actually switched
    if (mxSwitched) {
      await getPool().query(
        `UPDATE inhouse_email_domains
         SET mailbox_mode = 'hosted',
             opensrs_email_cluster = $1,
             updated_at = NOW()
         WHERE id = $2 AND project_id = $3`,
        [cluster, domainId, this.projectId]
      )
    } else {
      // OpenSRS provisioned but MX not auto-switched — mark pending so UI can show readiness
      await getPool().query(
        `UPDATE inhouse_email_domains
         SET mailbox_mode = 'hosted_pending_mx',
             opensrs_email_cluster = $1,
             updated_at = NOW()
         WHERE id = $2 AND project_id = $3`,
        [cluster, domainId, this.projectId]
      )
    }

    // 4. Log event
    await this.logEvent(null, 'mx_switched_to_hosted', {
      domain: domain.domain,
      cluster,
      mxSwitched,
    }, 'system', undefined, domainId)

    return { success: true, mxSwitched, mxInstructions, cluster }
  }

  /**
   * Disable hosted mailboxes on a domain.
   * Verifies no active mailboxes, switches MX back, deprovisions from OpenSRS.
   */
  async disableMailboxes(domainId: string): Promise<{ success: boolean; mxInstructions?: string }> {
    const domain = await this.getDomainRecord(domainId)
    if (!domain) throw this.notFound('Domain not found')

    if (domain.mailbox_mode === 'resend') {
      return { success: true }
    }

    // If hosted_pending_mx: MX was never switched away from Resend.
    // Just deprovision OpenSRS and revert to resend — no MX switching needed.
    if (domain.mailbox_mode === 'hosted_pending_mx') {
      try {
        await this.adapter.deprovisionDomain(domain.domain)
      } catch (error) {
        console.error(`[Mailbox] Error deprovisioning domain ${domain.domain} from OpenSRS:`, error)
      }

      await getPool().query(
        `UPDATE inhouse_email_domains
         SET mailbox_mode = 'resend',
             opensrs_email_cluster = NULL,
             updated_at = NOW()
         WHERE id = $1 AND project_id = $2`,
        [domainId, this.projectId]
      )

      await this.logEvent(null, 'mx_switched_to_resend', {
        domain: domain.domain,
        mxSwitchedBack: true,
        note: 'was-hosted_pending_mx',
      }, 'system', undefined, domainId)

      return { success: true }
    }

    // Check for any non-deleted mailboxes (including suspended, error, etc.)
    const { rows: existingMailboxes } = await getPool().query(
      `SELECT COUNT(*)::int as count FROM inhouse_mailboxes
       WHERE domain_id = $1 AND deleted_at IS NULL`,
      [domainId]
    )
    if ((existingMailboxes[0]?.count ?? 0) > 0) {
      throw {
        statusCode: 409,
        code: 'MAILBOXES_EXIST',
        message: 'Delete all mailboxes before disabling hosted email',
      }
    }

    // Switch MX back to Resend
    let mxInstructions: string | undefined
    const cluster = domain.opensrs_email_cluster || 'a'
    const opensrsMx = OPENSRS_EMAIL_DNS[cluster as 'a' | 'b']?.MX_TARGET || 'mail.hostedemail.com'

    if (domain.cloudflare_zone_id && isCloudflareConfigured()) {
      try {
        const cf = getCloudflareService()
        await cf.switchMxRecords(
          domain.cloudflare_zone_id,
          domain.domain,
          opensrsMx,
          RESEND_MX_TARGET,
          EMAIL_DNS.MX_PRIORITY
        )
      } catch (error: any) {
        if (error?.code === 'MX_NOT_AUTO_SWITCHABLE') {
          mxInstructions = `Your domain ${domain.domain} has custom MX records we can't auto-switch.\n` +
            `Please update manually:\n` +
            `- Remove existing MX records\n` +
            `- Add: ${RESEND_MX_TARGET} (priority ${EMAIL_DNS.MX_PRIORITY})\n\n` +
            `This restores inbound email to the programmatic inbox.`
        } else {
          throw error
        }
      }
    } else {
      mxInstructions = `Update your MX record for ${domain.domain}:\n` +
        `- Remove: ${opensrsMx}\n` +
        `- Add: ${RESEND_MX_TARGET} (priority ${EMAIL_DNS.MX_PRIORITY})\n\n` +
        `This restores inbound email to the programmatic inbox.`
    }

    const mxSwitchedBack = !mxInstructions

    if (mxSwitchedBack) {
      // MX confirmed restored — safe to deprovision and revert mode
      try {
        await this.adapter.deprovisionDomain(domain.domain)
      } catch (error) {
        console.error(`[Mailbox] Error deprovisioning domain ${domain.domain} from OpenSRS:`, error)
      }

      await getPool().query(
        `UPDATE inhouse_email_domains
         SET mailbox_mode = 'resend',
             opensrs_email_cluster = NULL,
             updated_at = NOW()
         WHERE id = $1 AND project_id = $2`,
        [domainId, this.projectId]
      )
    } else {
      // MX not switched back yet — keep domain on OpenSRS so email isn't lost,
      // mark pending so user can complete the manual MX change back to Resend
      await getPool().query(
        `UPDATE inhouse_email_domains
         SET mailbox_mode = 'resend_pending_mx',
             updated_at = NOW()
         WHERE id = $1 AND project_id = $2`,
        [domainId, this.projectId]
      )
    }

    await this.logEvent(null, 'mx_switched_to_resend', {
      domain: domain.domain,
      mxSwitchedBack,
    }, 'system', undefined, domainId)

    return { success: true, mxInstructions }
  }

  // ===========================================================================
  // Mailbox CRUD
  // ===========================================================================

  async createMailbox(domainId: string, input: CreateMailboxInput): Promise<Mailbox> {
    const domain = await this.getDomainRecord(domainId)
    if (!domain) throw this.notFound('Domain not found')

    if (domain.mailbox_mode !== 'hosted') {
      throw {
        statusCode: 400,
        code: 'MAILBOXES_NOT_ENABLED',
        message: 'Enable hosted mailboxes on this domain first',
      }
    }

    const localPart = input.localPart.toLowerCase().trim()
    const emailAddress = `${localPart}@${domain.domain}`
    const quotaMb = input.quotaMb ?? 5120

    // Insert DB record as pending_create
    const { rows } = await getPool().query(
      `INSERT INTO inhouse_mailboxes (
        project_id, domain_id, local_part, email_address, display_name,
        provisioning_status, quota_mb
      ) VALUES ($1, $2, $3, $4, $5, 'pending_create', $6)
      RETURNING *`,
      [this.projectId, domainId, localPart, emailAddress, input.displayName || null, quotaMb]
    )

    const mailbox = this.rowToMailbox(rows[0])

    // Log creation event (DB record exists)
    await this.logEvent(mailbox.id, 'created', { emailAddress })

    // Provision on OpenSRS
    try {
      await this.adapter.createMailbox({
        email: emailAddress,
        localPart,
        domain: domain.domain,
        password: input.password,
        displayName: input.displayName,
        quotaMb,
      })

      // Update to active
      await getPool().query(
        `UPDATE inhouse_mailboxes
         SET provisioning_status = 'active', provisioned_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [mailbox.id]
      )
      mailbox.provisioningStatus = 'active'
      mailbox.provisionedAt = new Date().toISOString()

      await this.logEvent(mailbox.id, 'provisioned', { emailAddress })
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)

      // If provider says mailbox already exists, treat as successfully provisioned
      // (handles partial failures where OpenSRS succeeded but DB update didn't)
      if (/already exists|exists/i.test(errorMsg)) {
        await getPool().query(
          `UPDATE inhouse_mailboxes
           SET provisioning_status = 'active', provisioned_at = NOW(), provisioning_error = NULL
           WHERE id = $1`,
          [mailbox.id]
        )
        await this.logEvent(mailbox.id, 'provisioned', { emailAddress, note: 'provider-already-exists' })
        return await this.getMailbox(mailbox.id)
      }

      await getPool().query(
        `UPDATE inhouse_mailboxes
         SET provisioning_status = 'error', provisioning_error = $1
         WHERE id = $2`,
        [errorMsg, mailbox.id]
      )
      mailbox.provisioningStatus = 'error'
      mailbox.provisioningError = errorMsg

      await this.logEvent(mailbox.id, 'error', { error: errorMsg })
      throw error
    }

    return mailbox
  }

  async listMailboxes(domainId: string): Promise<Mailbox[]> {
    const { rows } = await getPool().query(
      `SELECT * FROM inhouse_mailboxes
       WHERE domain_id = $1 AND project_id = $2 AND deleted_at IS NULL
       ORDER BY created_at ASC`,
      [domainId, this.projectId]
    )
    return rows.map(r => this.rowToMailbox(r))
  }

  async getMailbox(mailboxId: string): Promise<Mailbox> {
    const { rows } = await getPool().query(
      `SELECT * FROM inhouse_mailboxes
       WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL`,
      [mailboxId, this.projectId]
    )
    if (rows.length === 0) throw this.notFound('Mailbox not found')
    return this.rowToMailbox(rows[0])
  }

  async updateMailbox(mailboxId: string, input: UpdateMailboxInput): Promise<Mailbox> {
    const mailbox = await this.getMailbox(mailboxId)

    // Update on OpenSRS
    await this.adapter.updateMailbox({
      email: mailbox.emailAddress,
      displayName: input.displayName,
      quotaMb: input.quotaMb,
      forwardTo: input.forwardTo,
      forwardKeepCopy: input.forwardKeepCopy,
      imapEnabled: input.imapEnabled,
      popEnabled: input.popEnabled,
      webmailEnabled: input.webmailEnabled,
      smtpEnabled: input.smtpEnabled,
      autoresponderEnabled: input.autoresponderEnabled,
      autoresponderSubject: input.autoresponderSubject,
      autoresponderBody: input.autoresponderBody,
    })

    // Build SET clause dynamically
    const setClauses: string[] = ['updated_at = NOW()']
    const values: unknown[] = []
    let paramIndex = 1

    const fields: Array<[string, unknown]> = [
      ['display_name', input.displayName],
      ['quota_mb', input.quotaMb],
      ['forward_to', input.forwardTo],
      ['forward_keep_copy', input.forwardKeepCopy],
      ['imap_enabled', input.imapEnabled],
      ['pop_enabled', input.popEnabled],
      ['webmail_enabled', input.webmailEnabled],
      ['smtp_enabled', input.smtpEnabled],
      ['autoresponder_enabled', input.autoresponderEnabled],
      ['autoresponder_subject', input.autoresponderSubject],
      ['autoresponder_body', input.autoresponderBody],
    ]

    for (const [col, val] of fields) {
      if (val !== undefined) {
        setClauses.push(`${col} = $${paramIndex}`)
        values.push(val)
        paramIndex++
      }
    }

    values.push(mailboxId, this.projectId)
    const { rows } = await getPool().query(
      `UPDATE inhouse_mailboxes
       SET ${setClauses.join(', ')}
       WHERE id = $${paramIndex} AND project_id = $${paramIndex + 1} AND deleted_at IS NULL
       RETURNING *`,
      values
    )

    return this.rowToMailbox(rows[0])
  }

  async deleteMailbox(mailboxId: string): Promise<void> {
    const mailbox = await this.getMailbox(mailboxId)

    // Mark as pending_delete
    await getPool().query(
      `UPDATE inhouse_mailboxes
       SET provisioning_status = 'pending_delete', updated_at = NOW()
       WHERE id = $1`,
      [mailboxId]
    )

    // Delete from OpenSRS (soft-delete on their side)
    try {
      await this.adapter.deleteMailbox(mailbox.emailAddress)
    } catch (error) {
      console.error(`[Mailbox] Error deleting ${mailbox.emailAddress} from OpenSRS:`, error)
    }

    // Soft-delete in DB
    await getPool().query(
      `UPDATE inhouse_mailboxes
       SET provisioning_status = 'deleted', deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [mailboxId]
    )

    await this.logEvent(mailboxId, 'deleted', { emailAddress: mailbox.emailAddress })
  }

  async restoreMailbox(mailboxId: string): Promise<Mailbox> {
    const { rows: existing } = await getPool().query(
      `SELECT * FROM inhouse_mailboxes
       WHERE id = $1 AND project_id = $2 AND deleted_at IS NOT NULL`,
      [mailboxId, this.projectId]
    )
    if (existing.length === 0) throw this.notFound('Deleted mailbox not found')

    const mailbox = this.rowToMailbox(existing[0])

    // Check for conflict with an existing non-deleted mailbox at the same address
    const { rows: conflict } = await getPool().query(
      `SELECT 1 FROM inhouse_mailboxes
       WHERE domain_id = $1 AND local_part = $2 AND deleted_at IS NULL`,
      [mailbox.domainId, mailbox.localPart]
    )
    if (conflict.length > 0) {
      throw {
        statusCode: 409,
        code: 'MAILBOX_CONFLICT',
        message: 'A mailbox with this address already exists',
      }
    }

    // Restore on OpenSRS
    await this.adapter.restoreMailbox(mailbox.emailAddress)

    // Restore in DB
    const { rows } = await getPool().query(
      `UPDATE inhouse_mailboxes
       SET provisioning_status = 'active', deleted_at = NULL, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [mailboxId]
    )

    await this.logEvent(mailboxId, 'restored', { emailAddress: mailbox.emailAddress })

    return this.rowToMailbox(rows[0])
  }

  // ===========================================================================
  // Password & Auth
  // ===========================================================================

  async resetPassword(mailboxId: string, newPassword: string): Promise<void> {
    const mailbox = await this.getMailbox(mailboxId)
    await this.adapter.setPassword(mailbox.emailAddress, newPassword)
    await this.logEvent(mailboxId, 'password_reset', { emailAddress: mailbox.emailAddress })
  }

  async getWebmailSsoUrl(mailboxId: string): Promise<{ url: string }> {
    const mailbox = await this.getMailbox(mailboxId)
    const result = await this.adapter.generateWebmailSsoToken(mailbox.emailAddress)
    await this.logEvent(mailboxId, 'sso_token_generated', { emailAddress: mailbox.emailAddress })
    return { url: result.url }
  }

  // ===========================================================================
  // Client Config
  // ===========================================================================

  async getClientConfig(mailboxId: string): Promise<MailboxClientConfig> {
    const { rows } = await getPool().query(
      `SELECT m.email_address, d.opensrs_email_cluster
       FROM inhouse_mailboxes m
       JOIN inhouse_email_domains d ON m.domain_id = d.id
       WHERE m.id = $1 AND m.project_id = $2 AND m.deleted_at IS NULL`,
      [mailboxId, this.projectId]
    )
    if (rows.length === 0) throw this.notFound('Mailbox not found')

    const cluster = (rows[0].opensrs_email_cluster || 'a') as 'a' | 'b'
    const cfg = OPENSRS_EMAIL_DNS[cluster]

    return {
      email: rows[0].email_address,
      imap: { host: cfg.IMAP_HOST, port: cfg.IMAP_PORT, security: 'SSL/TLS' },
      pop: { host: cfg.POP_HOST, port: cfg.POP_PORT, security: 'SSL/TLS' },
      smtp: { host: cfg.SMTP_HOST, port: cfg.SMTP_SUBMISSION_PORT, security: 'STARTTLS' },
      webmailUrl: cfg.WEBMAIL_URL,
    }
  }

  // ===========================================================================
  // DNS Readiness
  // ===========================================================================

  // In-memory cache to avoid hammering DNS on rapid UI refreshes (30s TTL)
  private static dnsReadinessCache = new Map<string, { result: MailboxDnsReadinessResult; expiresAt: number }>()
  private static readonly DNS_CACHE_TTL_MS = 30_000

  /**
   * Check DNS readiness for a hosted mailbox domain.
   * Verifies MX, SPF, and DMARC are configured for OpenSRS.
   * Results are cached in-memory for 30s to avoid redundant DNS queries.
   */
  async checkDnsReadiness(domainId: string): Promise<MailboxDnsReadinessResult> {
    const domain = await this.getDomainRecord(domainId)
    if (!domain) throw this.notFound('Domain not found')

    if (domain.mailbox_mode !== 'hosted' && domain.mailbox_mode !== 'hosted_pending_mx') {
      throw {
        statusCode: 400,
        code: 'MAILBOXES_NOT_ENABLED',
        message: 'Hosted mailboxes are not enabled on this domain',
      }
    }

    // Check cache
    const now = Date.now()
    const cacheKey = `${domain.domain}:${domain.opensrs_email_cluster || 'a'}`
    const cached = InhouseMailboxService.dnsReadinessCache.get(cacheKey)
    if (cached && cached.expiresAt > now) {
      return cached.result
    }

    const cluster = (domain.opensrs_email_cluster || 'a') as 'a' | 'b'
    const clusterDns = OPENSRS_EMAIL_DNS[cluster]
    const dnsService = getDnsVerificationService()

    // Run all DNS checks in parallel
    const [mx, spf, dmarc] = await Promise.all([
      dnsService.verifyMX(domain.domain, clusterDns.MX_TARGET),
      this.verifySpfInclude(domain.domain, clusterDns.SPF_INCLUDE),
      dnsService.verifyDMARC(domain.domain),
    ])

    const checkedAt = new Date().toISOString()

    // Build required records list for anything not verified
    const requiredRecords: DnsRecord[] = []

    if (!mx.verified) {
      requiredRecords.push({
        type: 'MX',
        name: domain.domain,
        value: clusterDns.MX_TARGET,
        priority: clusterDns.MX_PRIORITY,
        description: 'MX record for receiving email via hosted mailboxes',
      })
    }

    if (!spf.verified) {
      requiredRecords.push({
        type: 'TXT',
        name: domain.domain,
        value: `v=spf1 ${clusterDns.SPF_INCLUDE} ~all`,
        description: 'SPF record to authorize hosted email sending (add include to existing SPF or create new)',
      })
    }

    if (!dmarc.verified) {
      requiredRecords.push({
        type: 'TXT',
        name: EMAIL_DNS.DMARC_HOST(domain.domain),
        value: EMAIL_DNS.DMARC_VALUE(domain.domain),
        description: 'DMARC policy for improved email deliverability (recommended)',
      })
    }

    // MX and SPF are required; DMARC is recommended but not required for "ready"
    const isReady = mx.verified && spf.verified

    const result: MailboxDnsReadinessResult = {
      status: isReady ? 'ready' : 'needs_action',
      checks: { mx, spf, dmarc },
      requiredRecords,
      lastCheckedAt: checkedAt,
    }

    // Cache result
    InhouseMailboxService.dnsReadinessCache.set(cacheKey, {
      result,
      expiresAt: Date.now() + InhouseMailboxService.DNS_CACHE_TTL_MS,
    })

    // Lazy prune if cache grows (unlikely but safe)
    if (InhouseMailboxService.dnsReadinessCache.size > 200) {
      const cutoff = Date.now()
      for (const [key, entry] of InhouseMailboxService.dnsReadinessCache) {
        if (entry.expiresAt <= cutoff) InhouseMailboxService.dnsReadinessCache.delete(key)
      }
    }

    return result
  }

  /**
   * Verify SPF record includes a specific include directive (e.g. OpenSRS).
   * Separate from DnsVerificationService.verifySPF which is hardcoded to Resend.
   */
  private async verifySpfInclude(domain: string, expectedInclude: string): Promise<DnsRecordStatus> {
    const now = new Date().toISOString()
    try {
      let txtRecords: string[]
      try {
        const raw = await dnsPromises.resolveTxt(domain)
        txtRecords = raw.map(chunks => chunks.join(''))
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code === 'ENODATA' || code === 'ENOTFOUND') {
          txtRecords = []
        } else {
          throw error
        }
      }

      const spfRecords = txtRecords.filter(r => r.toLowerCase().startsWith('v=spf1'))

      if (spfRecords.length === 0) {
        return {
          verified: false,
          expected: `v=spf1 ${expectedInclude} ~all`,
          actual: '(no SPF record)',
          lastChecked: now,
          error: 'No SPF record found',
        }
      }

      if (spfRecords.length > 1) {
        return {
          verified: false,
          expected: `v=spf1 ${expectedInclude} ~all`,
          actual: spfRecords.join(' | '),
          lastChecked: now,
          error: 'Multiple SPF records found; only one is allowed per RFC 7208',
        }
      }

      const spfRecord = spfRecords[0] as string
      const verified = spfRecord.includes(expectedInclude)

      return {
        verified,
        expected: `v=spf1 ${expectedInclude} ~all`,
        actual: spfRecord,
        lastChecked: now,
        error: verified ? undefined : `SPF record missing "${expectedInclude}"`,
      }
    } catch (error) {
      return {
        verified: false,
        lastChecked: now,
        error: `DNS lookup failed: ${(error as Error).message}`,
      }
    }
  }

  // ===========================================================================
  // Quota
  // ===========================================================================

  async syncQuota(mailboxId: string): Promise<{ quotaMb: number; quotaUsedMb: number }> {
    const mailbox = await this.getMailbox(mailboxId)
    const quota = await this.adapter.syncQuota(mailbox.emailAddress)

    await getPool().query(
      `UPDATE inhouse_mailboxes
       SET quota_mb = $1, quota_used_mb = $2, quota_last_synced_at = NOW(), updated_at = NOW()
       WHERE id = $3`,
      [quota.quotaMb, quota.quotaUsedMb, mailboxId]
    )

    return quota
  }

  async updateQuota(mailboxId: string, newQuotaMb: number): Promise<void> {
    const mailbox = await this.getMailbox(mailboxId)

    await this.adapter.updateMailbox({
      email: mailbox.emailAddress,
      quotaMb: newQuotaMb,
    })

    await getPool().query(
      `UPDATE inhouse_mailboxes
       SET quota_mb = $1, updated_at = NOW()
       WHERE id = $2`,
      [newQuotaMb, mailboxId]
    )

    await this.logEvent(mailboxId, 'quota_changed', {
      emailAddress: mailbox.emailAddress,
      oldQuotaMb: mailbox.quotaMb,
      newQuotaMb,
    })
  }

  // ===========================================================================
  // Suspend / Unsuspend
  // ===========================================================================

  async suspendMailbox(mailboxId: string): Promise<void> {
    const mailbox = await this.getMailbox(mailboxId)

    await this.adapter.updateMailbox({
      email: mailbox.emailAddress,
      imapEnabled: false,
      popEnabled: false,
      smtpEnabled: false,
      webmailEnabled: false,
    })

    await getPool().query(
      `UPDATE inhouse_mailboxes
       SET provisioning_status = 'suspended',
           imap_enabled = false, pop_enabled = false,
           smtp_enabled = false, webmail_enabled = false,
           updated_at = NOW()
       WHERE id = $1`,
      [mailboxId]
    )

    await this.logEvent(mailboxId, 'suspended', { emailAddress: mailbox.emailAddress })
  }

  async unsuspendMailbox(mailboxId: string): Promise<void> {
    const mailbox = await this.getMailbox(mailboxId)

    await this.adapter.updateMailbox({
      email: mailbox.emailAddress,
      imapEnabled: true,
      popEnabled: false,
      smtpEnabled: true,
      webmailEnabled: true,
    })

    await getPool().query(
      `UPDATE inhouse_mailboxes
       SET provisioning_status = 'active',
           imap_enabled = true, pop_enabled = false,
           smtp_enabled = true, webmail_enabled = true,
           updated_at = NOW()
       WHERE id = $1`,
      [mailboxId]
    )

    await this.logEvent(mailboxId, 'unsuspended', { emailAddress: mailbox.emailAddress })
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private async getDomainRecord(domainId: string): Promise<any | null> {
    const { rows } = await getPool().query(
      `SELECT * FROM inhouse_email_domains
       WHERE id = $1 AND project_id = $2`,
      [domainId, this.projectId]
    )
    return rows[0] || null
  }

  private async logEvent(
    mailboxId: string | null,
    eventType: string,
    metadata: Record<string, unknown> = {},
    actorType: string = 'system',
    actorId?: string,
    domainId?: string
  ): Promise<void> {
    try {
      await getPool().query(
        `INSERT INTO inhouse_mailbox_events
         (mailbox_id, domain_id, project_id, event_type, metadata, actor_type, actor_id)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
        [
          mailboxId,
          domainId ?? null,
          this.projectId,
          eventType,
          JSON.stringify(metadata),
          actorType,
          actorId ?? null,
        ]
      )
    } catch (error) {
      console.error('[Mailbox] Error logging event:', error)
    }
  }

  private rowToMailbox(row: any): Mailbox {
    return {
      id: row.id,
      projectId: row.project_id,
      domainId: row.domain_id,
      localPart: row.local_part,
      emailAddress: row.email_address,
      displayName: row.display_name,
      provider: row.provider,
      provisioningStatus: row.provisioning_status,
      provisioningError: row.provisioning_error,
      provisionedAt: row.provisioned_at?.toISOString?.() ?? row.provisioned_at,
      quotaMb: row.quota_mb,
      quotaUsedMb: row.quota_used_mb,
      quotaLastSyncedAt: row.quota_last_synced_at?.toISOString?.() ?? row.quota_last_synced_at,
      imapEnabled: row.imap_enabled,
      popEnabled: row.pop_enabled,
      webmailEnabled: row.webmail_enabled,
      smtpEnabled: row.smtp_enabled,
      forwardTo: row.forward_to,
      forwardKeepCopy: row.forward_keep_copy,
      autoresponderEnabled: row.autoresponder_enabled,
      autoresponderSubject: row.autoresponder_subject,
      autoresponderBody: row.autoresponder_body,
      lastLoginAt: row.last_login_at?.toISOString?.() ?? row.last_login_at,
      messageCount: row.message_count,
      deletedAt: row.deleted_at?.toISOString?.() ?? row.deleted_at,
      createdAt: row.created_at?.toISOString?.() ?? row.created_at,
      updatedAt: row.updated_at?.toISOString?.() ?? row.updated_at,
    }
  }

  private notFound(message: string) {
    return { statusCode: 404, code: 'NOT_FOUND', message }
  }
}

// =============================================================================
// FACTORY (TTL-cached, same pattern as other services)
// =============================================================================

const serviceCache = new Map<string, { service: InhouseMailboxService; expiresAt: number }>()
const SERVICE_TTL_MS = 60_000 // 1 minute

export function getInhouseMailboxService(projectId: string): InhouseMailboxService {
  const now = Date.now()
  const cached = serviceCache.get(projectId)
  if (cached && cached.expiresAt > now) {
    return cached.service
  }

  const service = new InhouseMailboxService(projectId)
  serviceCache.set(projectId, { service, expiresAt: now + SERVICE_TTL_MS })

  // Lazy cleanup
  if (serviceCache.size > 100) {
    for (const [key, entry] of serviceCache) {
      if (entry.expiresAt <= now) serviceCache.delete(key)
    }
  }

  return service
}
