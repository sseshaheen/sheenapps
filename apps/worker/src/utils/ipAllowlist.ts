/**
 * IP Allowlist Utility with CIDR Support
 *
 * Supports both individual IPs and CIDR ranges.
 * Uses ipaddr.js library for safe IP parsing (handles IPv4/IPv6, no JS bitwise traps).
 *
 * Part of easy-mode-email-enhancements-plan.md (Enhancement 6)
 *
 * Examples:
 * - Individual IP: "192.168.1.100"
 * - CIDR range: "192.168.1.0/24" (matches 192.168.1.0-255)
 * - IPv6: "2001:db8::/32"
 *
 * Why use a library instead of manual bitwise:
 * - JS bitwise ops are 32-bit signed (1 << 32 wraps to 1)
 * - IPv6 requires 128-bit handling
 * - Edge cases around /0 and /32 need careful handling
 */

import ipaddr from 'ipaddr.js'

/**
 * Check if an IP address is in an allowlist of IPs and/or CIDR ranges.
 *
 * @param ip - The IP address to check
 * @param allowlist - Array of IP addresses and/or CIDR ranges
 * @returns true if IP is allowed, false otherwise
 */
export function isIpInAllowlist(ip: string, allowlist: string[]): boolean {
  if (allowlist.length === 0) {
    // Empty allowlist behavior:
    // - Production: Log warning but allow (fail open with warning)
    // - Dev: Allow silently
    // To enforce allowlist in production, configure the env var
    if (process.env.NODE_ENV === 'production') {
      console.warn('[ipAllowlist] Empty allowlist in production - allowing all IPs. Configure OPENSRS_WEBHOOK_IPS to restrict.')
    }
    return true
  }

  let parsedIp: ipaddr.IPv4 | ipaddr.IPv6
  try {
    parsedIp = ipaddr.parse(ip)
  } catch {
    // Invalid IP address - reject
    return false
  }

  for (const entry of allowlist) {
    try {
      if (entry.includes('/')) {
        // CIDR range
        const [network, prefixLength] = ipaddr.parseCIDR(entry)

        // ipaddr.match() returns true if the IP falls within the CIDR
        if (parsedIp.match(network, prefixLength)) {
          return true
        }
      } else {
        // Single IP - compare string representations
        const parsedEntry = ipaddr.parse(entry)

        // Handle IPv4-mapped IPv6 addresses
        // e.g., "::ffff:192.168.1.1" should match "192.168.1.1"
        const normalizedIp = normalizeIp(parsedIp)
        const normalizedEntry = normalizeIp(parsedEntry)

        if (normalizedIp === normalizedEntry) {
          return true
        }
      }
    } catch {
      // Invalid allowlist entry - skip it
      // Log warning in development for debugging
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[ipAllowlist] Invalid allowlist entry: ${entry}`)
      }
      continue
    }
  }

  return false
}

/**
 * Normalize IP address for comparison.
 * Handles IPv4-mapped IPv6 addresses (::ffff:x.x.x.x).
 */
function normalizeIp(ip: ipaddr.IPv4 | ipaddr.IPv6): string {
  if (ip.kind() === 'ipv6') {
    const v6 = ip as ipaddr.IPv6
    // Check if it's an IPv4-mapped IPv6 address
    if (v6.isIPv4MappedAddress()) {
      return v6.toIPv4Address().toString()
    }
  }
  return ip.toString()
}

/**
 * Parse a comma-separated allowlist string into an array.
 * Trims whitespace and filters empty entries.
 */
export function parseAllowlistString(allowlistStr: string | undefined): string[] {
  if (!allowlistStr) return []

  return allowlistStr
    .split(',')
    .map(entry => entry.trim())
    .filter(entry => entry.length > 0)
}

/**
 * Validate that all entries in an allowlist are valid IPs or CIDR ranges.
 * Returns array of invalid entries (empty array if all valid).
 */
export function validateAllowlist(allowlist: string[]): string[] {
  const invalid: string[] = []

  for (const entry of allowlist) {
    try {
      if (entry.includes('/')) {
        ipaddr.parseCIDR(entry)
      } else {
        ipaddr.parse(entry)
      }
    } catch {
      invalid.push(entry)
    }
  }

  return invalid
}
