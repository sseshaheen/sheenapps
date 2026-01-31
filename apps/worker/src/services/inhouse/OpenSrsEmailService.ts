/**
 * OpenSRS Hosted Email (OMA) API Client
 *
 * Low-level JSON API client for OpenSRS Hosted Email.
 * Distinct from OpenSrsService.ts which handles domain registration via XML API.
 *
 * API Documentation: https://admin.hostedemail.com/apidocs/
 *
 * Part of easy-mode-email-plan.md (Phase 4: Real Mailbox via OpenSRS Hosted Email)
 */

// =============================================================================
// CONFIGURATION
// =============================================================================

const OPENSRS_EMAIL_CLUSTER = process.env.OPENSRS_EMAIL_CLUSTER || 'a'
const OPENSRS_EMAIL_API_URL =
  process.env.OPENSRS_EMAIL_API_URL ||
  `https://admin.${OPENSRS_EMAIL_CLUSTER}.hostedemail.com/api`
const OPENSRS_EMAIL_USER = process.env.OPENSRS_EMAIL_USER
const OPENSRS_EMAIL_PASSWORD = process.env.OPENSRS_EMAIL_PASSWORD

const REQUEST_TIMEOUT_MS = 30000
const MAX_RETRIES = 2
const RETRY_BACKOFF_MS = 500

// =============================================================================
// TYPES
// =============================================================================

export interface OmaApiResponse {
  success: boolean
  error?: string
  error_number?: number
  [key: string]: unknown
}

export interface OmaDomainInfo {
  domain: string
  max_users?: number
  suspended?: boolean
}

export interface OmaUserInfo {
  user: string
  domain: string
  suspended?: boolean
  quota?: number // in bytes
  disk_usage?: number // in bytes
  imap_enabled?: boolean
  pop_enabled?: boolean
  webmail_enabled?: boolean
  smtp_enabled?: boolean
  forward_email?: string
  keep_copy?: boolean
  vacation_enabled?: boolean
  vacation_subject?: string
  vacation_body?: string
  last_login?: string
  num_messages?: number
  display_name?: string
}

export interface OmaCreateUserInput {
  localPart: string
  domain: string
  password: string
  display_name?: string
  quota?: number // in bytes
  forward_email?: string
  keep_copy?: boolean
  imap_enabled?: boolean
  pop_enabled?: boolean
  webmail_enabled?: boolean
  smtp_enabled?: boolean
}

export interface OmaUpdateUserInput {
  localPart: string
  domain: string
  display_name?: string
  quota?: number
  forward_email?: string
  keep_copy?: boolean
  imap_enabled?: boolean
  pop_enabled?: boolean
  webmail_enabled?: boolean
  smtp_enabled?: boolean
  vacation_enabled?: boolean
  vacation_subject?: string
  vacation_body?: string
}


// =============================================================================
// HELPERS
// =============================================================================

function toEmail(user: string, domain: string): string {
  return `${user}@${domain}`.toLowerCase()
}

// =============================================================================
// SERVICE
// =============================================================================

export class OpenSrsEmailService {
  private apiUrl: string
  private user: string
  private password: string

  constructor() {
    if (!OPENSRS_EMAIL_USER) {
      throw new Error('OPENSRS_EMAIL_USER is required')
    }
    if (!OPENSRS_EMAIL_PASSWORD) {
      throw new Error('OPENSRS_EMAIL_PASSWORD is required')
    }
    this.apiUrl = OPENSRS_EMAIL_API_URL
    this.user = OPENSRS_EMAIL_USER
    this.password = OPENSRS_EMAIL_PASSWORD
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private async request(method: string, params: Record<string, unknown> = {}): Promise<OmaApiResponse> {
    let lastError: Error | undefined

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        await new Promise(r => setTimeout(r, RETRY_BACKOFF_MS * attempt))
      }

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

      try {
        const body = {
          credentials: {
            user: this.user,
            password: this.password,
          },
          ...params,
        }

        const response = await fetch(`${this.apiUrl}/${method}`, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        })

        // Retry on 502/503/504
        if ([502, 503, 504].includes(response.status) && attempt < MAX_RETRIES) {
          lastError = new Error(`OpenSRS Email HTTP ${response.status}`)
          continue
        }

        const text = await response.text()
        let data: OmaApiResponse

        try {
          data = JSON.parse(text) as OmaApiResponse
        } catch {
          throw new Error(`OpenSRS Email non-JSON response (${response.status}): ${text.slice(0, 200)}`)
        }

        if (!response.ok) {
          throw new Error(`OpenSRS Email HTTP ${response.status}: ${data.error || text.slice(0, 200)}`)
        }

        if (data.success === false) {
          throw new Error(`OpenSRS Email API error: ${data.error || 'Unknown error'} (code: ${data.error_number || 'none'})`)
        }

        return data
      } catch (error) {
        clearTimeout(timeout)
        // Retry on network errors / aborted (timeout)
        const isTransient = error instanceof TypeError || // fetch network error
          (error instanceof DOMException && error.name === 'AbortError')
        if (isTransient && attempt < MAX_RETRIES) {
          lastError = error instanceof Error ? error : new Error(String(error))
          continue
        }
        throw error
      } finally {
        clearTimeout(timeout)
      }
    }

    throw lastError || new Error('OpenSRS Email request failed after retries')
  }

  // ===========================================================================
  // Domain Operations
  // ===========================================================================

  async createDomain(domain: string, maxUsers?: number): Promise<void> {
    const attributes: Record<string, unknown> = {}
    if (maxUsers !== undefined) attributes.max_users = maxUsers

    await this.request('change_domain', {
      domain,
      attributes,
      create_only: 1,
    })
    console.log(`[OpenSRS Email] Domain created: ${domain}`)
  }

  async getDomain(domain: string): Promise<OmaDomainInfo | null> {
    try {
      const response = await this.request('get_domain', { domain })
      const metadata = (response.metadata ?? {}) as Record<string, unknown>
      const attributes = (response.attributes ?? {}) as Record<string, unknown>

      return {
        domain,
        max_users: (attributes.max_users ?? metadata.max_users) as number | undefined,
        suspended: metadata.status === 'suspended',
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      if (message.includes('not found') || message.includes('does not exist')) {
        return null
      }
      throw error
    }
  }

  async deleteDomain(domain: string): Promise<void> {
    await this.request('delete_domain', { domain })
    console.log(`[OpenSRS Email] Domain deleted: ${domain}`)
  }

  // ===========================================================================
  // User (Mailbox) Operations
  // ===========================================================================

  async createUser(input: OmaCreateUserInput): Promise<void> {
    const email = toEmail(input.localPart, input.domain)

    const attributes: Record<string, unknown> = {
      password: input.password,
    }
    if (input.display_name !== undefined) attributes.display_name = input.display_name
    if (input.quota !== undefined) attributes.quota = input.quota
    if (input.forward_email !== undefined) attributes.forward_email = input.forward_email
    if (input.keep_copy !== undefined) attributes.keep_copy = input.keep_copy
    if (input.imap_enabled !== undefined) attributes.imap_enabled = input.imap_enabled
    if (input.pop_enabled !== undefined) attributes.pop_enabled = input.pop_enabled
    if (input.webmail_enabled !== undefined) attributes.webmail_enabled = input.webmail_enabled
    if (input.smtp_enabled !== undefined) attributes.smtp_enabled = input.smtp_enabled

    await this.request('change_user', {
      user: email,
      attributes,
      create_only: 1,
    })
    console.log(`[OpenSRS Email] User created: ${email}`)
  }

  async getUser(localPart: string, domain: string): Promise<OmaUserInfo | null> {
    const email = toEmail(localPart, domain)
    try {
      const response = await this.request('get_user', { user: email })

      const metadata = (response.metadata ?? {}) as Record<string, unknown>
      const attributes = (response.attributes ?? {}) as Record<string, unknown>
      const quota = (metadata.quota ?? {}) as Record<string, unknown>
      const lastLogin = (metadata.last_login ?? {}) as Record<string, unknown>

      return {
        user: localPart,
        domain,
        suspended: metadata.status === 'suspended',
        quota: quota.bytes_max as number | undefined,
        disk_usage: quota.bytes_used as number | undefined,
        imap_enabled: attributes.imap_enabled as boolean | undefined,
        pop_enabled: attributes.pop_enabled as boolean | undefined,
        webmail_enabled: attributes.webmail_enabled as boolean | undefined,
        smtp_enabled: attributes.smtp_enabled as boolean | undefined,
        forward_email: attributes.forward_email as string | undefined,
        keep_copy: attributes.keep_copy as boolean | undefined,
        vacation_enabled: attributes.vacation_enabled as boolean | undefined,
        vacation_subject: attributes.vacation_subject as string | undefined,
        vacation_body: attributes.vacation_body as string | undefined,
        last_login: lastLogin.webmail ? String(lastLogin.webmail) : undefined,
        num_messages: attributes.num_messages as number | undefined,
        display_name: attributes.display_name as string | undefined,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      if (message.includes('not found') || message.includes('does not exist')) {
        return null
      }
      throw error
    }
  }

  async updateUser(input: OmaUpdateUserInput): Promise<void> {
    const email = toEmail(input.localPart, input.domain)

    const attributes: Record<string, unknown> = {}
    if (input.display_name !== undefined) attributes.display_name = input.display_name
    if (input.quota !== undefined) attributes.quota = input.quota
    if (input.forward_email !== undefined) attributes.forward_email = input.forward_email
    if (input.keep_copy !== undefined) attributes.keep_copy = input.keep_copy
    if (input.imap_enabled !== undefined) attributes.imap_enabled = input.imap_enabled
    if (input.pop_enabled !== undefined) attributes.pop_enabled = input.pop_enabled
    if (input.webmail_enabled !== undefined) attributes.webmail_enabled = input.webmail_enabled
    if (input.smtp_enabled !== undefined) attributes.smtp_enabled = input.smtp_enabled
    if (input.vacation_enabled !== undefined) attributes.vacation_enabled = input.vacation_enabled
    if (input.vacation_subject !== undefined) attributes.vacation_subject = input.vacation_subject
    if (input.vacation_body !== undefined) attributes.vacation_body = input.vacation_body

    await this.request('change_user', {
      user: email,
      attributes,
    })
    console.log(`[OpenSRS Email] User updated: ${email}`)
  }

  async deleteUser(localPart: string, domain: string): Promise<void> {
    const email = toEmail(localPart, domain)
    await this.request('delete_user', { user: email })
    console.log(`[OpenSRS Email] User deleted: ${email}`)
  }

  async restoreUser(localPart: string, domain: string): Promise<void> {
    const email = toEmail(localPart, domain)
    await this.request('restore_user', { user: email })
    console.log(`[OpenSRS Email] User restored: ${email}`)
  }

  async searchUsers(domain: string): Promise<string[]> {
    const response = await this.request('search_users', { domain })
    const users = response.users as string[] | undefined
    return users || []
  }

  async setPassword(localPart: string, domain: string, password: string): Promise<void> {
    const email = toEmail(localPart, domain)
    await this.request('change_user', {
      user: email,
      attributes: { password },
    })
    console.log(`[OpenSRS Email] Password set for: ${email}`)
  }

  // ===========================================================================
  // SSO Token
  // ===========================================================================

  async generateSsoToken(localPart: string, domain: string): Promise<string> {
    const email = toEmail(localPart, domain)
    const response = await this.request('generate_token', {
      user: email,
      type: 'sso',
      reason: 'webmail_sso',
    })

    return response.token as string
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let serviceInstance: OpenSrsEmailService | null = null

export function getOpenSrsEmailService(): OpenSrsEmailService {
  if (!serviceInstance) {
    serviceInstance = new OpenSrsEmailService()
  }
  return serviceInstance
}

export function isOpenSrsEmailConfigured(): boolean {
  return Boolean(OPENSRS_EMAIL_USER && OPENSRS_EMAIL_PASSWORD)
}
