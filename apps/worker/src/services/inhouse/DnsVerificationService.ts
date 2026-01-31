/**
 * DNS Verification Service
 *
 * Handles DNS record verification for custom domains.
 * Verifies SPF, DKIM, DMARC, MX, and Return-Path records.
 *
 * IMPORTANT: Uses EMAIL_DNS constants for consistency with CloudflareService.
 *
 * Part of easy-mode-email-plan.md (Phase 2A: Custom Domain - Manual DNS)
 */

import { promises as dns } from 'dns'
import { randomBytes } from 'crypto'
import {
  EMAIL_DNS,
  RESEND_DKIM_SELECTORS,
  spfIncludesResend,
} from './emailDnsConstants'

// =============================================================================
// CONFIGURATION
// =============================================================================

// DNS timeout in milliseconds
const DNS_TIMEOUT = 10000

// =============================================================================
// TYPES
// =============================================================================

export interface DnsRecordStatus {
  verified: boolean
  expected?: string
  actual?: string
  lastChecked?: string
  error?: string
}

export interface DnsVerificationStatus {
  spf: DnsRecordStatus
  dkim: DnsRecordStatus
  dmarc: DnsRecordStatus
  mx: DnsRecordStatus
  returnPath: DnsRecordStatus
  ownership: DnsRecordStatus
}

export interface DnsRecord {
  type: 'TXT' | 'CNAME' | 'MX'
  name: string
  value: string
  priority?: number
  description: string
}

export interface DnsInstructions {
  domain: string
  verificationToken: string
  records: DnsRecord[]
}

/**
 * Scanned DNS record from existing nameservers
 */
export interface ScannedDnsRecord {
  type: 'A' | 'AAAA' | 'CNAME' | 'TXT' | 'MX' | 'NS' | 'CAA'
  name: string
  value: string
  priority?: number
  ttl?: number
}

/**
 * Result of scanning existing DNS records
 */
export interface DnsScanResult {
  domain: string
  scannedAt: string
  currentNameservers: string[]
  records: ScannedDnsRecord[]
  warnings: string[]
}

/**
 * Known registrar detected from nameservers
 */
export type KnownRegistrar =
  | 'godaddy'
  | 'namecheap'
  | 'cloudflare'
  | 'google'
  | 'route53'
  | 'bluehost'
  | 'hostgator'
  | 'dreamhost'
  | 'hover'
  | 'name.com'
  | 'gandi'
  | 'porkbun'
  | 'dynadot'
  | 'ionos'
  | 'ovh'
  | 'unknown'

/**
 * Result of registrar detection
 */
export interface RegistrarDetectionResult {
  registrar: KnownRegistrar
  registrarName: string
  nameservers: string[]
  confidence: 'high' | 'medium' | 'low'
  dnsSettingsUrl?: string
  instructions: string
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * DNS timeout error for better debugging
 */
class DnsTimeoutError extends Error {
  constructor(public readonly ms: number, public readonly op: string, public readonly name: string) {
    super(`DNS lookup timed out after ${ms}ms (${op} ${name})`)
    this.name = 'DnsTimeoutError'
  }
}

/**
 * Wrap a promise with a timeout
 */
function withTimeout<T>(p: Promise<T>, ms: number, op: string, name: string): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    t = setTimeout(() => reject(new DnsTimeoutError(ms, op, name)), ms)
  })
  return Promise.race([p, timeout]).finally(() => t && clearTimeout(t))
}

/**
 * Normalize DNS name for comparison (lowercase, remove trailing dot)
 */
function normDnsName(v: string): string {
  return v.trim().toLowerCase().replace(/\.$/, '')
}

/**
 * Check if a TXT record looks like a valid DKIM record
 */
function looksLikeDkimTxt(v: string): boolean {
  const s = v.toLowerCase()
  return s.includes('v=dkim1') && (s.includes('p=') || s.includes('k=rsa') || s.includes('k=ed25519'))
}

/**
 * Generate a random verification token
 */
export function generateVerificationToken(): string {
  return `sheenapps-verify-${randomBytes(16).toString('hex')}`
}

/**
 * Query TXT records for a domain
 */
async function queryTxtRecords(domain: string): Promise<string[]> {
  try {
    const records = await withTimeout(dns.resolveTxt(domain), DNS_TIMEOUT, 'TXT', domain)
    // TXT records can be split into chunks, join them
    return records.map(chunks => chunks.join(''))
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENODATA' || code === 'ENOTFOUND') {
      return []
    }
    throw error
  }
}

/**
 * Query CNAME records for a domain
 */
async function queryCnameRecord(domain: string): Promise<string | null> {
  try {
    const records = await withTimeout(dns.resolveCname(domain), DNS_TIMEOUT, 'CNAME', domain)
    return records[0] || null
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENODATA' || code === 'ENOTFOUND') {
      return null
    }
    throw error
  }
}

/**
 * Query MX records for a domain
 */
async function queryMxRecords(domain: string): Promise<Array<{ priority: number; exchange: string }>> {
  try {
    const records = await withTimeout(dns.resolveMx(domain), DNS_TIMEOUT, 'MX', domain)
    return records.sort((a, b) => a.priority - b.priority)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENODATA' || code === 'ENOTFOUND') {
      return []
    }
    throw error
  }
}

/**
 * Query A records for a domain
 */
async function queryARecords(domain: string): Promise<string[]> {
  try {
    return await withTimeout(dns.resolve4(domain), DNS_TIMEOUT, 'A', domain)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENODATA' || code === 'ENOTFOUND') {
      return []
    }
    throw error
  }
}

/**
 * Query AAAA records for a domain
 */
async function queryAAAARecords(domain: string): Promise<string[]> {
  try {
    return await withTimeout(dns.resolve6(domain), DNS_TIMEOUT, 'AAAA', domain)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENODATA' || code === 'ENOTFOUND') {
      return []
    }
    throw error
  }
}

/**
 * Query NS records for a domain
 */
async function queryNsRecords(domain: string): Promise<string[]> {
  try {
    return await withTimeout(dns.resolveNs(domain), DNS_TIMEOUT, 'NS', domain)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENODATA' || code === 'ENOTFOUND') {
      return []
    }
    throw error
  }
}

/**
 * Query CAA records for a domain
 */
async function queryCaaRecords(domain: string): Promise<Array<{ critical: number; issue?: string; issuewild?: string; iodef?: string }>> {
  try {
    const records = await withTimeout(dns.resolveCaa(domain), DNS_TIMEOUT, 'CAA', domain)
    return records.map(r => ({
      critical: r.critical ? 1 : 0,
      issue: r.issue,
      issuewild: r.issuewild,
      iodef: r.iodef,
    }))
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENODATA' || code === 'ENOTFOUND') {
      return []
    }
    throw error
  }
}

// =============================================================================
// DNS VERIFICATION SERVICE
// =============================================================================

export class DnsVerificationService {
  /**
   * Verify domain ownership via TXT record
   *
   * Checks for TXT record at _sheenapps-verify.{domain} with value sheenapps-verify={token}
   * This matches what CloudflareService provisions.
   */
  async verifyOwnership(domain: string, expectedToken: string): Promise<DnsRecordStatus> {
    const now = new Date().toISOString()
    const ownershipHost = EMAIL_DNS.OWNERSHIP_HOST(domain)
    const expectedValue = EMAIL_DNS.OWNERSHIP_VALUE(expectedToken)

    try {
      // Check the subdomain where we provision the ownership record
      const txtRecords = await queryTxtRecords(ownershipHost)
      const found = txtRecords.includes(expectedValue)

      if (found) {
        return {
          verified: true,
          expected: expectedValue,
          actual: expectedValue,
          lastChecked: now,
        }
      }

      // Fallback: Also check root domain for legacy tokens (raw token format)
      const rootTxtRecords = await queryTxtRecords(domain)
      const foundLegacy = rootTxtRecords.some(record =>
        record === expectedToken || record === expectedValue
      )

      if (foundLegacy) {
        return {
          verified: true,
          expected: expectedValue,
          actual: rootTxtRecords.find(r => r === expectedToken || r === expectedValue) || expectedValue,
          lastChecked: now,
        }
      }

      return {
        verified: false,
        expected: expectedValue,
        actual: txtRecords.join(', ') || '(no TXT records)',
        lastChecked: now,
        error: `Verification TXT record not found at ${ownershipHost}`,
      }
    } catch (error) {
      return {
        verified: false,
        expected: expectedValue,
        lastChecked: now,
        error: `DNS lookup failed: ${(error as Error).message}`,
      }
    }
  }

  /**
   * Verify SPF record includes Resend
   */
  async verifySPF(domain: string): Promise<DnsRecordStatus> {
    const now = new Date().toISOString()
    try {
      const txtRecords = await queryTxtRecords(domain)
      const spfRecords = txtRecords.filter(record => record.toLowerCase().startsWith('v=spf1'))

      if (spfRecords.length === 0) {
        return {
          verified: false,
          expected: EMAIL_DNS.SPF_VALUE,
          actual: '(no SPF record)',
          lastChecked: now,
          error: 'No SPF record found',
        }
      }

      // Multiple SPF records is a known misconfiguration
      if (spfRecords.length > 1) {
        return {
          verified: false,
          expected: EMAIL_DNS.SPF_VALUE,
          actual: spfRecords.join(' | '),
          lastChecked: now,
          error: 'Multiple SPF records found; only one is allowed per RFC 7208',
        }
      }

      // At this point spfRecords.length is exactly 1 (we returned above if 0 or > 1)
      const spfRecord = spfRecords[0] as string
      // Check if SPF includes Resend's include using centralized helper
      const verified = spfIncludesResend(spfRecord)

      return {
        verified,
        expected: EMAIL_DNS.SPF_VALUE,
        actual: spfRecord,
        lastChecked: now,
        error: verified ? undefined : `SPF record missing "${EMAIL_DNS.SPF_INCLUDE}"`,
      }
    } catch (error) {
      return {
        verified: false,
        lastChecked: now,
        error: `DNS lookup failed: ${(error as Error).message}`,
      }
    }
  }

  /**
   * Verify DKIM record for Resend
   * Resend provides DKIM keys that need to be added as CNAME or TXT records
   */
  async verifyDKIM(domain: string, dkimValue?: string): Promise<DnsRecordStatus> {
    const now = new Date().toISOString()

    // If we have a specific DKIM value from Resend API, check for it
    if (dkimValue) {
      try {
        // DKIM records are typically at resend._domainkey.domain.com
        const dkimHost = `resend._domainkey.${domain}`
        const cnameValue = await queryCnameRecord(dkimHost)

        if (cnameValue) {
          // Normalize both values for comparison (case-insensitive, no trailing dot)
          const verified = normDnsName(cnameValue) === normDnsName(dkimValue)
          return {
            verified,
            expected: dkimValue,
            actual: cnameValue,
            lastChecked: now,
            error: verified ? undefined : 'DKIM CNAME does not match expected value'
          }
        }

        // Try TXT record as fallback - but validate it looks like DKIM
        const txtRecords = await queryTxtRecords(dkimHost)
        const dkimTxt = txtRecords.find(looksLikeDkimTxt)
        if (dkimTxt) {
          return {
            verified: true,
            expected: dkimValue,
            actual: dkimTxt,
            lastChecked: now
          }
        }

        // Found TXT but it doesn't look like DKIM
        if (txtRecords.length > 0) {
          return {
            verified: false,
            expected: dkimValue,
            actual: txtRecords[0],
            lastChecked: now,
            error: 'TXT record found but does not appear to be a valid DKIM record (missing v=DKIM1 or p=)'
          }
        }

        return {
          verified: false,
          expected: dkimValue,
          actual: '(no DKIM record)',
          lastChecked: now,
          error: 'No DKIM record found'
        }
      } catch (error) {
        return {
          verified: false,
          lastChecked: now,
          error: `DNS lookup failed: ${(error as Error).message}`
        }
      }
    }

    // Generic check - look for any DKIM record at known selectors
    for (const selector of RESEND_DKIM_SELECTORS) {
      try {
        const dkimHost = `${selector}._domainkey.${domain}`
        const cnameValue = await queryCnameRecord(dkimHost)
        if (cnameValue && normDnsName(cnameValue).includes('dkim')) {
          return {
            verified: true,
            actual: cnameValue,
            lastChecked: now
          }
        }

        // Check TXT records - must look like valid DKIM
        const txtRecords = await queryTxtRecords(dkimHost)
        const dkimTxt = txtRecords.find(looksLikeDkimTxt)
        if (dkimTxt) {
          return {
            verified: true,
            actual: dkimTxt,
            lastChecked: now
          }
        }
      } catch {
        // Try next selector
      }
    }

    return {
      verified: false,
      lastChecked: now,
      error: 'No DKIM record found for any known selector'
    }
  }

  /**
   * Verify DMARC record exists
   * DMARC is recommended but not required for sending
   */
  async verifyDMARC(domain: string): Promise<DnsRecordStatus> {
    const now = new Date().toISOString()
    try {
      const dmarcHost = `_dmarc.${domain}`
      const txtRecords = await queryTxtRecords(dmarcHost)
      const dmarcRecord = txtRecords.find(record => record.startsWith('v=DMARC1'))

      // Validate that it has at least v=DMARC1 and a p= policy
      const hasPolicy = dmarcRecord ? /v=dmarc1/i.test(dmarcRecord) && /\bp=/i.test(dmarcRecord) : false

      if (dmarcRecord && hasPolicy) {
        return {
          verified: true,
          expected: 'v=DMARC1; p=<policy>',
          actual: dmarcRecord,
          lastChecked: now
        }
      }

      if (dmarcRecord && !hasPolicy) {
        return {
          verified: false,
          expected: 'v=DMARC1; p=<policy>',
          actual: dmarcRecord,
          lastChecked: now,
          error: 'DMARC record found but missing required p= policy tag'
        }
      }

      return {
        verified: false,
        expected: 'v=DMARC1; p=<policy>',
        actual: '(no DMARC record)',
        lastChecked: now,
        error: 'No DMARC record found (recommended but not required)'
      }
    } catch (error) {
      return {
        verified: false,
        lastChecked: now,
        error: `DNS lookup failed: ${(error as Error).message}`
      }
    }
  }

  /**
   * Verify MX records point to expected destination
   * For inbound email, MX should point to our mail servers
   */
  async verifyMX(domain: string, expectedMx?: string): Promise<DnsRecordStatus> {
    const now = new Date().toISOString()
    try {
      const mxRecords = await queryMxRecords(domain)

      if (mxRecords.length === 0) {
        return {
          verified: false,
          expected: expectedMx || 'MX record pointing to mail server',
          actual: '(no MX records)',
          lastChecked: now,
          error: 'No MX records found'
        }
      }

      // If we have an expected MX, check for it
      if (expectedMx) {
        const normalizedExpected = normDnsName(expectedMx)
        const found = mxRecords.some(mx => {
          const normalizedExchange = normDnsName(mx.exchange)
          return normalizedExchange === normalizedExpected ||
                 normalizedExchange.endsWith(`.${normalizedExpected}`)
        })
        return {
          verified: found,
          expected: expectedMx,
          actual: mxRecords.map(mx => `${mx.priority} ${mx.exchange}`).join(', '),
          lastChecked: now,
          error: found ? undefined : `MX does not include "${expectedMx}"`
        }
      }

      // Just verify MX records exist
      return {
        verified: true,
        actual: mxRecords.map(mx => `${mx.priority} ${mx.exchange}`).join(', '),
        lastChecked: now
      }
    } catch (error) {
      return {
        verified: false,
        lastChecked: now,
        error: `DNS lookup failed: ${(error as Error).message}`
      }
    }
  }

  /**
   * Verify Return-Path CNAME (for bounce handling)
   *
   * Checks for CNAME at bounces.{domain} (plural) to match CloudflareService provisioning.
   */
  async verifyReturnPath(domain: string, expectedCname?: string): Promise<DnsRecordStatus> {
    const now = new Date().toISOString()
    const returnPathHost = EMAIL_DNS.RETURN_PATH_HOST(domain)
    const expected = expectedCname || EMAIL_DNS.RETURN_PATH_TARGET

    try {
      const cnameValue = await queryCnameRecord(returnPathHost)

      if (!cnameValue) {
        return {
          verified: false,
          expected,
          actual: '(no Return-Path CNAME)',
          lastChecked: now,
          error: 'No Return-Path CNAME found (optional but recommended)',
        }
      }

      // Check if CNAME matches expected value (normalized: case-insensitive, no trailing dot)
      const verified = normDnsName(cnameValue) === normDnsName(expected)

      return {
        verified,
        expected,
        actual: cnameValue,
        lastChecked: now,
        error: verified ? undefined : 'Return-Path CNAME does not match expected value',
      }
    } catch (error) {
      return {
        verified: false,
        expected,
        lastChecked: now,
        error: `DNS lookup failed: ${(error as Error).message}`,
      }
    }
  }

  /**
   * Run full DNS verification for a domain
   */
  async verifyAll(
    domain: string,
    verificationToken: string,
    options?: {
      dkimValue?: string
      expectedMx?: string
      returnPathCname?: string
    }
  ): Promise<DnsVerificationStatus> {
    const [ownership, spf, dkim, dmarc, mx, returnPath] = await Promise.all([
      this.verifyOwnership(domain, verificationToken),
      this.verifySPF(domain),
      this.verifyDKIM(domain, options?.dkimValue),
      this.verifyDMARC(domain),
      this.verifyMX(domain, options?.expectedMx),
      this.verifyReturnPath(domain, options?.returnPathCname)
    ])

    return {
      ownership,
      spf,
      dkim,
      dmarc,
      mx,
      returnPath
    }
  }

  /**
   * Generate DNS instructions for a domain
   * Returns the records the user needs to add
   *
   * IMPORTANT: Uses EMAIL_DNS constants for consistency with CloudflareService.
   */
  generateDnsInstructions(
    domain: string,
    verificationToken: string,
    resendRecords?: {
      dkimHost?: string
      dkimValue?: string
      returnPathHost?: string
      returnPathValue?: string
    }
  ): DnsInstructions {
    const records: DnsRecord[] = [
      // 1. Ownership verification - at subdomain with formatted value
      {
        type: 'TXT',
        name: EMAIL_DNS.OWNERSHIP_HOST(domain),
        value: EMAIL_DNS.OWNERSHIP_VALUE(verificationToken),
        description: 'Domain ownership verification',
      },
      // 2. SPF record
      {
        type: 'TXT',
        name: domain,
        value: EMAIL_DNS.SPF_VALUE,
        description: 'SPF record for email authentication (add to existing or create new)',
      },
      // 3. DKIM record (from Resend API or generic)
      {
        type: 'CNAME',
        name: resendRecords?.dkimHost || EMAIL_DNS.DKIM_HOST(domain),
        value: resendRecords?.dkimValue || '(provided by Resend after domain setup)',
        description: 'DKIM record for email signing',
      },
      // 4. DMARC record (recommended)
      {
        type: 'TXT',
        name: EMAIL_DNS.DMARC_HOST(domain),
        value: EMAIL_DNS.DMARC_VALUE(domain),
        description: 'DMARC policy (recommended for deliverability)',
      },
    ]

    // 5. Return-Path (optional, for bounce handling)
    records.push({
      type: 'CNAME',
      name: resendRecords?.returnPathHost || EMAIL_DNS.RETURN_PATH_HOST(domain),
      value: resendRecords?.returnPathValue || EMAIL_DNS.RETURN_PATH_TARGET,
      description: 'Return-Path for bounce handling (optional)',
    })

    return {
      domain,
      verificationToken,
      records,
    }
  }

  /**
   * Check if domain is ready for sending (SPF + DKIM verified)
   */
  isReadyForSending(status: DnsVerificationStatus): boolean {
    return status.ownership.verified && status.spf.verified && status.dkim.verified
  }

  /**
   * Detect the registrar/DNS provider based on nameserver patterns.
   * Returns tailored instructions for the detected registrar.
   */
  async detectRegistrar(domain: string): Promise<RegistrarDetectionResult> {
    let nameservers: string[] = []
    try {
      nameservers = await queryNsRecords(domain)
    } catch {
      // Failed to query NS records
    }

    // Registrar detection patterns
    const patterns: Array<{
      pattern: RegExp
      registrar: KnownRegistrar
      name: string
      dnsUrl?: string
    }> = [
      {
        pattern: /\.domaincontrol\.com$/i,
        registrar: 'godaddy',
        name: 'GoDaddy',
        dnsUrl: 'https://dcc.godaddy.com/manage/dns',
      },
      {
        pattern: /\.registrar-servers\.com$/i,
        registrar: 'namecheap',
        name: 'Namecheap',
        dnsUrl: 'https://ap.www.namecheap.com/domains/domaincontrolpanel',
      },
      {
        pattern: /\.cloudflare\.com$/i,
        registrar: 'cloudflare',
        name: 'Cloudflare',
        dnsUrl: 'https://dash.cloudflare.com/',
      },
      {
        pattern: /\.googledomains\.com$/i,
        registrar: 'google',
        name: 'Squarespace Domains (formerly Google Domains)',
        dnsUrl: 'https://account.squarespace.com/domains',
      },
      {
        pattern: /\.google\.com$/i,
        registrar: 'google',
        name: 'Google Cloud DNS',
        dnsUrl: 'https://console.cloud.google.com/net-services/dns',
      },
      {
        pattern: /\.awsdns-/i,
        registrar: 'route53',
        name: 'AWS Route 53',
        dnsUrl: 'https://console.aws.amazon.com/route53/v2/hostedzones',
      },
      {
        pattern: /\.bluehost\.com$/i,
        registrar: 'bluehost',
        name: 'Bluehost',
        dnsUrl: 'https://my.bluehost.com/hosting/domains',
      },
      {
        pattern: /\.hostgator\.com$/i,
        registrar: 'hostgator',
        name: 'HostGator',
        dnsUrl: 'https://portal.hostgator.com/domain',
      },
      {
        pattern: /\.dreamhost\.com$/i,
        registrar: 'dreamhost',
        name: 'DreamHost',
        dnsUrl: 'https://panel.dreamhost.com/index.cgi?tree=domain.dns',
      },
      {
        pattern: /\.hover\.com$/i,
        registrar: 'hover',
        name: 'Hover',
        dnsUrl: 'https://www.hover.com/control_panel/domains',
      },
      {
        pattern: /\.name\.com$/i,
        registrar: 'name.com',
        name: 'Name.com',
        dnsUrl: 'https://www.name.com/account/domains',
      },
      {
        pattern: /\.gandi\.net$/i,
        registrar: 'gandi',
        name: 'Gandi',
        dnsUrl: 'https://admin.gandi.net/',
      },
      {
        pattern: /\.porkbun\.com$/i,
        registrar: 'porkbun',
        name: 'Porkbun',
        dnsUrl: 'https://porkbun.com/account/domains',
      },
      {
        pattern: /\.dynadot\.com$/i,
        registrar: 'dynadot',
        name: 'Dynadot',
        dnsUrl: 'https://www.dynadot.com/account/domain/name/',
      },
      {
        pattern: /\.ui-dns\.(org|com|de)$/i,
        registrar: 'ionos',
        name: 'IONOS (1&1)',
        dnsUrl: 'https://my.ionos.com/',
      },
      {
        pattern: /\.ovh\.(net|com)$/i,
        registrar: 'ovh',
        name: 'OVH',
        dnsUrl: 'https://www.ovh.com/manager/',
      },
    ]

    let detected: { registrar: KnownRegistrar; name: string; dnsUrl?: string } | null = null
    let confidence: 'high' | 'medium' | 'low' = 'low'

    // Check each nameserver against patterns
    for (const ns of nameservers) {
      for (const p of patterns) {
        if (p.pattern.test(ns)) {
          detected = { registrar: p.registrar, name: p.name, dnsUrl: p.dnsUrl }
          confidence = 'high'
          break
        }
      }
      if (detected) break
    }

    if (!detected) {
      detected = { registrar: 'unknown', name: 'Unknown Registrar' }
      confidence = nameservers.length > 0 ? 'medium' : 'low'
    }

    return {
      registrar: detected.registrar,
      registrarName: detected.name,
      nameservers,
      confidence,
      dnsSettingsUrl: detected.dnsUrl,
      instructions: this.generateRegistrarInstructions(detected.registrar, domain),
    }
  }

  private generateRegistrarInstructions(registrar: KnownRegistrar, domain: string): string {
    // Partial map - registrars not listed fall back to 'unknown'
    const baseInstructions: Partial<Record<KnownRegistrar, string>> = {
      godaddy: `
## GoDaddy DNS Configuration

1. Go to [My Products](https://dcc.godaddy.com/manage/) and find ${domain}
2. Click **DNS** next to the domain
3. Scroll down to the **Records** section
4. Click **Add** for each record type needed

**To add a TXT record:**
- Type: TXT
- Name: @ (or the subdomain)
- Value: (paste the value provided)
- TTL: 1 Hour

**To add a CNAME record:**
- Type: CNAME
- Name: (the subdomain like resend._domainkey)
- Value: (paste the value provided)
- TTL: 1 Hour
`,
      namecheap: `
## Namecheap DNS Configuration

1. Go to [Domain List](https://ap.www.namecheap.com/domains/list)
2. Click **Manage** next to ${domain}
3. Go to **Advanced DNS** tab
4. Click **Add New Record**

**To add a TXT record:**
- Type: TXT Record
- Host: @ (or subdomain)
- Value: (paste the value)
- TTL: Automatic

**To add a CNAME record:**
- Type: CNAME Record
- Host: (subdomain like resend._domainkey)
- Target: (paste the value)
- TTL: Automatic
`,
      cloudflare: `
## Cloudflare DNS Configuration

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. Select your domain ${domain}
3. Click **DNS** in the sidebar
4. Click **Add record**

**To add a TXT record:**
- Type: TXT
- Name: @ (or subdomain)
- Content: (paste the value)
- Proxy status: DNS only

**To add a CNAME record:**
- Type: CNAME
- Name: (subdomain)
- Target: (paste the value)
- Proxy status: DNS only (important for email records!)
`,
      google: `
## Squarespace Domains DNS Configuration

*Note: Google Domains was acquired by Squarespace in 2023. Your domain may have been migrated.*

1. Go to [Squarespace Domains](https://account.squarespace.com/domains)
2. Click on ${domain}
3. Click **DNS** or **DNS Settings**
4. Scroll to **Custom Records**
5. Click **Add Record**

**To add a TXT record:**
- Host: @ (or subdomain)
- Type: TXT
- Data: (paste the value)

**To add a CNAME record:**
- Host: (subdomain)
- Type: CNAME
- Data: (paste the value)

*If still on legacy Google Domains interface, use domains.google.com*
`,
      route53: `
## AWS Route 53 Configuration

1. Go to [Route 53 Hosted Zones](https://console.aws.amazon.com/route53/v2/hostedzones)
2. Click on the hosted zone for ${domain}
3. Click **Create record**

**To add a TXT record:**
- Record name: (leave empty for root, or enter subdomain)
- Record type: TXT
- Value: "(paste the value with quotes)"
- TTL: 300

**To add a CNAME record:**
- Record name: (subdomain)
- Record type: CNAME
- Value: (paste the value)
- TTL: 300
`,
      unknown: `
## DNS Configuration

Please log in to your domain registrar or DNS provider to add the required DNS records.

**General steps:**
1. Find your domain's DNS settings or DNS management page
2. Add the TXT and CNAME records as specified below
3. Wait up to 48 hours for DNS propagation

**TXT Record:**
- Name/Host: @ or the subdomain specified
- Type: TXT
- Value: (copy the exact value provided)

**CNAME Record:**
- Name/Host: the subdomain specified (e.g., resend._domainkey)
- Type: CNAME
- Value/Target: (copy the exact value provided)

If you're unsure, contact your registrar's support team for help.
`,
    }

    return (
      baseInstructions[registrar] ||
      baseInstructions['unknown'] ||
      ''
    ).trim()
  }

  /**
   * Scan all existing DNS records for a domain.
   * Used for previewing nameserver switch to avoid breaking user's site.
   */
  async scanExistingDnsRecords(domain: string): Promise<DnsScanResult> {
    const records: ScannedDnsRecord[] = []
    const warnings: string[] = []
    const scannedAt = new Date().toISOString()

    // Get current nameservers
    let currentNameservers: string[] = []
    try {
      currentNameservers = await queryNsRecords(domain)
    } catch (error) {
      warnings.push(`Could not fetch NS records: ${(error as Error).message}`)
    }

    // Common subdomains to scan
    const hostsToScan = [
      domain,           // Root domain
      `www.${domain}`,  // WWW
      `mail.${domain}`, // Mail subdomain
      `api.${domain}`,  // API
      `app.${domain}`,  // App
      `cdn.${domain}`,  // CDN
      `blog.${domain}`, // Blog
      `shop.${domain}`, // Shop
      `admin.${domain}`,// Admin
      `dev.${domain}`,  // Dev
      `staging.${domain}`, // Staging
    ]

    // Scan each host for A, AAAA, CNAME records
    for (const host of hostsToScan) {
      try {
        // A records
        const aRecords = await queryARecords(host)
        for (const ip of aRecords) {
          records.push({
            type: 'A',
            name: host === domain ? '@' : host.replace(`.${domain}`, ''),
            value: ip,
          })
        }
      } catch {
        // Ignore errors for individual hosts
      }

      try {
        // AAAA records
        const aaaaRecords = await queryAAAARecords(host)
        for (const ip of aaaaRecords) {
          records.push({
            type: 'AAAA',
            name: host === domain ? '@' : host.replace(`.${domain}`, ''),
            value: ip,
          })
        }
      } catch {
        // Ignore errors
      }

      try {
        // CNAME records (only for subdomains, root can't have CNAME)
        if (host !== domain) {
          const cname = await queryCnameRecord(host)
          if (cname) {
            records.push({
              type: 'CNAME',
              name: host.replace(`.${domain}`, ''),
              value: cname,
            })
          }
        }
      } catch {
        // Ignore errors
      }
    }

    // Scan root domain for TXT, MX, CAA
    try {
      const txtRecords = await queryTxtRecords(domain)
      for (const txt of txtRecords) {
        records.push({
          type: 'TXT',
          name: '@',
          value: txt,
        })
      }
    } catch (error) {
      warnings.push(`Could not fetch TXT records: ${(error as Error).message}`)
    }

    try {
      const mxRecords = await queryMxRecords(domain)
      for (const mx of mxRecords) {
        records.push({
          type: 'MX',
          name: '@',
          value: mx.exchange,
          priority: mx.priority,
        })
      }
    } catch (error) {
      warnings.push(`Could not fetch MX records: ${(error as Error).message}`)
    }

    try {
      const caaRecords = await queryCaaRecords(domain)
      for (const caa of caaRecords) {
        const tag = caa.issue ? 'issue' : caa.issuewild ? 'issuewild' : 'iodef'
        const value = caa.issue || caa.issuewild || caa.iodef || ''
        records.push({
          type: 'CAA',
          name: '@',
          value: `${caa.critical} ${tag} "${value}"`,
        })
      }
    } catch {
      // CAA records are optional
    }

    // Scan for DMARC
    try {
      const dmarcRecords = await queryTxtRecords(`_dmarc.${domain}`)
      for (const txt of dmarcRecords) {
        records.push({
          type: 'TXT',
          name: '_dmarc',
          value: txt,
        })
      }
    } catch {
      // DMARC is optional
    }

    // Scan for common DKIM selectors
    const dkimSelectors = ['default', 'google', 'selector1', 'selector2', 'k1', 'k2']
    for (const selector of dkimSelectors) {
      try {
        const dkimHost = `${selector}._domainkey.${domain}`
        const cname = await queryCnameRecord(dkimHost)
        if (cname) {
          records.push({
            type: 'CNAME',
            name: `${selector}._domainkey`,
            value: cname,
          })
        }
      } catch {
        // DKIM selectors are optional
      }

      try {
        const dkimHost = `${selector}._domainkey.${domain}`
        const txtRecords = await queryTxtRecords(dkimHost)
        for (const txt of txtRecords) {
          records.push({
            type: 'TXT',
            name: `${selector}._domainkey`,
            value: txt,
          })
        }
      } catch {
        // DKIM selectors are optional
      }
    }

    // Add warnings for critical records
    const hasWebsite = records.some(r => r.type === 'A' && (r.name === '@' || r.name === 'www'))
    if (hasWebsite) {
      warnings.push('Website records detected (A/AAAA for @ or www). Ensure these are preserved after switch.')
    }

    const hasMx = records.some(r => r.type === 'MX')
    if (hasMx) {
      warnings.push('Existing MX records detected. Email routing may change after switch.')
    }

    return {
      domain,
      scannedAt,
      currentNameservers,
      records,
      warnings,
    }
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let instance: DnsVerificationService | null = null

export function getDnsVerificationService(): DnsVerificationService {
  if (!instance) {
    instance = new DnsVerificationService()
  }
  return instance
}
