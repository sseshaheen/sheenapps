/**
 * Email DNS Constants
 *
 * Single source of truth for all email-related DNS configuration.
 * Used by CloudflareService (provisioning) and DnsVerificationService (verification).
 *
 * CRITICAL: Both services MUST use these constants to avoid mismatches that cause
 * domains to never verify properly.
 */

// =============================================================================
// RESEND CONFIGURATION
// =============================================================================

/**
 * Resend SPF include statement.
 * This is what users need in their SPF record to allow Resend to send on their behalf.
 */
export const RESEND_SPF_INCLUDE = 'include:resend.com'

/**
 * Full SPF record value for domains using only Resend
 */
export const RESEND_SPF_RECORD = `v=spf1 ${RESEND_SPF_INCLUDE} ~all`

/**
 * Resend's MX server for inbound email
 */
export const RESEND_MX_TARGET = 'inbound-smtp.resend.io'

/**
 * Resend's bounce handling CNAME target
 */
export const RESEND_RETURN_PATH_TARGET = 'bounces.resend.com'

/**
 * Default Resend DKIM CNAME target (actual value comes from Resend API)
 */
export const RESEND_DKIM_DEFAULT_TARGET = 'resend._domainkey.resend.dev'

/**
 * DKIM selectors that Resend may use
 */
export const RESEND_DKIM_SELECTORS = ['resend', 'resend1', 'resend2']

// =============================================================================
// SHEENAPPS DNS RECORD HELPERS
// =============================================================================

export const EMAIL_DNS = {
  /**
   * SPF include statement to look for in verification
   */
  SPF_INCLUDE: RESEND_SPF_INCLUDE,

  /**
   * Full SPF record for provisioning
   */
  SPF_VALUE: RESEND_SPF_RECORD,

  /**
   * DKIM record hostname
   * @param domain - The user's domain
   */
  DKIM_HOST: (domain: string) => `resend._domainkey.${domain}`,

  /**
   * Ownership verification TXT record hostname
   * Uses a subdomain to avoid conflicts with other TXT records at root
   * @param domain - The user's domain
   */
  OWNERSHIP_HOST: (domain: string) => `_sheenapps-verify.${domain}`,

  /**
   * Ownership verification TXT record value format
   * @param token - The verification token
   */
  OWNERSHIP_VALUE: (token: string) => `sheenapps-verify=${token}`,

  /**
   * DMARC record hostname
   * @param domain - The user's domain
   */
  DMARC_HOST: (domain: string) => `_dmarc.${domain}`,

  /**
   * DMARC record value
   * @param domain - The user's domain (for rua mailto)
   */
  DMARC_VALUE: (domain: string) => `v=DMARC1; p=none; rua=mailto:dmarc@${domain}`,

  /**
   * Return-Path (bounce handling) CNAME hostname
   * NOTE: This is "bounces" (plural) to match Resend's convention
   * @param domain - The user's domain
   */
  RETURN_PATH_HOST: (domain: string) => `bounces.${domain}`,

  /**
   * Return-Path CNAME target
   */
  RETURN_PATH_TARGET: RESEND_RETURN_PATH_TARGET,

  /**
   * MX record target for inbound email
   */
  MX_TARGET: RESEND_MX_TARGET,

  /**
   * MX record priority
   */
  MX_PRIORITY: 10,

  /**
   * Default TTL for DNS records (in seconds)
   */
  DEFAULT_TTL: 3600,
} as const

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

/**
 * Check if an SPF record includes the required Resend include
 */
export function spfIncludesResend(spfRecord: string): boolean {
  return spfRecord.includes(RESEND_SPF_INCLUDE)
}

/**
 * Parse an ownership verification value to extract the token
 * @param value - The TXT record value (e.g., "sheenapps-verify=abc123")
 * @returns The token if valid format, null otherwise
 */
export function parseOwnershipValue(value: string): string | null {
  const match = value.match(/^sheenapps-verify=(.+)$/)
  return match?.[1] ?? null
}

/**
 * Check if a verification token matches the expected format
 */
export function isValidVerificationToken(token: string): boolean {
  // Token format: sheenapps-verify-<32 hex chars>
  return /^sheenapps-verify-[a-f0-9]{32}$/.test(token)
}

// =============================================================================
// OPENSRS HOSTED EMAIL CONFIGURATION
// =============================================================================

interface OpenSrsEmailClusterDns {
  MX_TARGET: string
  MX_PRIORITY: number
  SPF_INCLUDE: string
  IMAP_HOST: string
  IMAP_PORT: number
  POP_HOST: string
  POP_PORT: number
  SMTP_HOST: string
  SMTP_PORT: number
  SMTP_SUBMISSION_PORT: number
  WEBMAIL_URL: string
}

/**
 * OpenSRS Hosted Email DNS configuration per cluster.
 * Cluster A and B have identical hostnames (mail.hostedemail.com serves both).
 */
export const OPENSRS_EMAIL_DNS: Record<'a' | 'b', OpenSrsEmailClusterDns> = {
  a: {
    MX_TARGET: 'mail.hostedemail.com',
    MX_PRIORITY: 10,
    SPF_INCLUDE: 'include:_spf.hostedemail.com',
    IMAP_HOST: 'mail.a.hostedemail.com',
    IMAP_PORT: 993,
    POP_HOST: 'mail.a.hostedemail.com',
    POP_PORT: 995,
    SMTP_HOST: 'mail.a.hostedemail.com',
    SMTP_PORT: 465,
    SMTP_SUBMISSION_PORT: 587,
    WEBMAIL_URL: 'https://mail.a.hostedemail.com',
  },
  b: {
    MX_TARGET: 'mail.hostedemail.com',
    MX_PRIORITY: 10,
    SPF_INCLUDE: 'include:_spf.hostedemail.com',
    IMAP_HOST: 'mail.b.hostedemail.com',
    IMAP_PORT: 993,
    POP_HOST: 'mail.b.hostedemail.com',
    POP_PORT: 995,
    SMTP_HOST: 'mail.b.hostedemail.com',
    SMTP_PORT: 465,
    SMTP_SUBMISSION_PORT: 587,
    WEBMAIL_URL: 'https://mail.b.hostedemail.com',
  },
}
