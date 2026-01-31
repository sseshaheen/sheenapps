/**
 * OpenSRS Email Adapter
 *
 * Implements MailboxEngineAdapter using OpenSRS Hosted Email (OMA) API.
 *
 * Part of easy-mode-email-plan.md (Phase 4: Real Mailbox)
 */

import { getOpenSrsEmailService, type OpenSrsEmailService } from '../OpenSrsEmailService'
import { OPENSRS_EMAIL_DNS } from '../emailDnsConstants'
import type {
  MailboxEngineAdapter,
  MailboxProviderInfo,
  CreateMailboxInput,
  CreateMailboxResult,
  MailboxInfo,
  UpdateMailboxInput,
  SsoTokenResult,
} from './MailboxEngineAdapter'

// =============================================================================
// HELPERS
// =============================================================================

const MB_TO_BYTES = 1024 * 1024
const BYTES_TO_MB = 1 / MB_TO_BYTES

function splitEmail(email: string): { localPart: string; domain: string } {
  const atIndex = email.lastIndexOf('@')
  if (atIndex === -1) throw new Error(`Invalid email address: ${email}`)
  return {
    localPart: email.slice(0, atIndex),
    domain: email.slice(atIndex + 1),
  }
}

// =============================================================================
// ADAPTER
// =============================================================================

export class OpenSrsEmailAdapter implements MailboxEngineAdapter {
  private service: OpenSrsEmailService
  readonly providerInfo: MailboxProviderInfo

  constructor() {
    this.service = getOpenSrsEmailService()

    const cluster = process.env.OPENSRS_EMAIL_CLUSTER || 'a'
    const dns = OPENSRS_EMAIL_DNS[cluster as 'a' | 'b'] || OPENSRS_EMAIL_DNS.a

    this.providerInfo = {
      name: 'OpenSRS Hosted Email',
      imapHost: dns.IMAP_HOST,
      imapPort: dns.IMAP_PORT,
      popHost: dns.POP_HOST,
      popPort: dns.POP_PORT,
      smtpHost: dns.SMTP_HOST,
      smtpPort: dns.SMTP_PORT,
      smtpSubmissionPort: dns.SMTP_SUBMISSION_PORT,
      webmailUrl: dns.WEBMAIL_URL,
      mxTarget: dns.MX_TARGET,
      mxPriority: dns.MX_PRIORITY,
      spfInclude: dns.SPF_INCLUDE,
    }
  }

  // ===========================================================================
  // Domain
  // ===========================================================================

  async provisionDomain(domain: string, maxUsers?: number): Promise<void> {
    await this.service.createDomain(domain, maxUsers)
  }

  async deprovisionDomain(domain: string): Promise<void> {
    await this.service.deleteDomain(domain)
  }

  // ===========================================================================
  // Mailbox CRUD
  // ===========================================================================

  async createMailbox(input: CreateMailboxInput): Promise<CreateMailboxResult> {
    await this.service.createUser({
      localPart: input.localPart,
      domain: input.domain,
      password: input.password,
      display_name: input.displayName,
      quota: input.quotaMb ? input.quotaMb * MB_TO_BYTES : undefined,
    })

    return {
      email: input.email,
      provisioned: true,
    }
  }

  async getMailbox(email: string): Promise<MailboxInfo | null> {
    const { localPart, domain } = splitEmail(email)
    const user = await this.service.getUser(localPart, domain)
    if (!user) return null

    return {
      email,
      localPart,
      domain,
      displayName: user.display_name,
      suspended: user.suspended ?? false,
      quotaBytes: user.quota,
      diskUsageBytes: user.disk_usage,
      imapEnabled: user.imap_enabled ?? true,
      popEnabled: user.pop_enabled ?? false,
      webmailEnabled: user.webmail_enabled ?? true,
      smtpEnabled: user.smtp_enabled ?? true,
      forwardTo: user.forward_email,
      forwardKeepCopy: user.keep_copy ?? true,
      autoresponderEnabled: user.vacation_enabled ?? false,
      autoresponderSubject: user.vacation_subject,
      autoresponderBody: user.vacation_body,
      lastLogin: user.last_login,
      messageCount: user.num_messages,
    }
  }

  async updateMailbox(input: UpdateMailboxInput): Promise<void> {
    const { localPart, domain } = splitEmail(input.email)

    await this.service.updateUser({
      localPart,
      domain,
      display_name: input.displayName,
      quota: input.quotaMb ? input.quotaMb * MB_TO_BYTES : undefined,
      forward_email: input.forwardTo === null ? '' : input.forwardTo,
      keep_copy: input.forwardKeepCopy,
      imap_enabled: input.imapEnabled,
      pop_enabled: input.popEnabled,
      webmail_enabled: input.webmailEnabled,
      smtp_enabled: input.smtpEnabled,
      vacation_enabled: input.autoresponderEnabled,
      vacation_subject: input.autoresponderSubject,
      vacation_body: input.autoresponderBody,
    })
  }

  async deleteMailbox(email: string): Promise<void> {
    const { localPart, domain } = splitEmail(email)
    await this.service.deleteUser(localPart, domain)
  }

  async restoreMailbox(email: string): Promise<void> {
    const { localPart, domain } = splitEmail(email)
    await this.service.restoreUser(localPart, domain)
  }

  async setPassword(email: string, newPassword: string): Promise<void> {
    const { localPart, domain } = splitEmail(email)
    await this.service.setPassword(localPart, domain, newPassword)
  }

  async listMailboxes(domain: string): Promise<string[]> {
    const users = await this.service.searchUsers(domain)
    return users.map(u => `${u}@${domain}`)
  }

  // ===========================================================================
  // Auth & Webmail
  // ===========================================================================

  async generateWebmailSsoToken(email: string): Promise<SsoTokenResult> {
    const { localPart, domain } = splitEmail(email)
    const token = await this.service.generateSsoToken(localPart, domain)
    const url = `${this.providerInfo.webmailUrl}/?rcmlogintoken=${encodeURIComponent(token)}&rcmloginuser=${encodeURIComponent(email)}`
    return { token, url }
  }

  // ===========================================================================
  // Quota
  // ===========================================================================

  async syncQuota(email: string): Promise<{ quotaMb: number; quotaUsedMb: number }> {
    const { localPart, domain } = splitEmail(email)
    const user = await this.service.getUser(localPart, domain)
    if (!user) {
      throw new Error(`Mailbox not found: ${email}`)
    }

    return {
      quotaMb: Math.round((user.quota ?? 0) * BYTES_TO_MB),
      quotaUsedMb: Math.round((user.disk_usage ?? 0) * BYTES_TO_MB),
    }
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let adapterInstance: OpenSrsEmailAdapter | null = null

export function getOpenSrsEmailAdapter(): OpenSrsEmailAdapter {
  if (!adapterInstance) {
    adapterInstance = new OpenSrsEmailAdapter()
  }
  return adapterInstance
}
