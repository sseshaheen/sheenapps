/**
 * 🛡️ Secure Redirect Whitelist (OWASP 2025 Compliant)
 * Implements explicit allowlist approach for post-login redirects
 * Following OWASP Unvalidated Redirects and Forwards Cheat Sheet
 */

import { logger } from '@/utils/logger'

// OWASP RECOMMENDATION: Use explicit allowlist instead of regex patterns
export const ALLOWED_REDIRECT_PATHS = [
  // Public pages
  '/',
  
  // Dashboard and main app areas  
  '/dashboard',
  '/dashboard/billing',
  '/dashboard/settings',
  '/dashboard/projects',
  
  // Builder paths
  '/builder',
  '/builder/new', 
  '/builder/workspace',
  
  // Account management
  '/profile',
  '/settings',
  '/billing',
  
  // Help and support
  '/help',
  '/docs'
] as const

// OWASP RECOMMENDATION: Validate against path traversal attacks
const PATH_TRAVERSAL_PATTERNS = [
  /\.\./,           // Parent directory
  /\/\./,           // Current directory  
  /%2e%2e/i,        // URL encoded ..
  /%2f/i,           // URL encoded /
  /%5c/i,           // URL encoded \
  /\\$/,            // Backslash
  /\/+/,            // Multiple slashes
  /<script/i,       // XSS attempt
  /javascript:/i,   // JavaScript protocol
  /data:/i,         // Data protocol
  /vbscript:/i      // VBScript protocol
]

// SECURITY: Dangerous query parameters that should be stripped
const DANGEROUS_QUERY_PARAMS = [
  'javascript',
  'vbscript', 
  'data',
  'blob',
  'script',
  'eval',
  'expression',
  'onload',
  'onerror'
]

/**
 * OWASP COMPLIANT: Check if path is in explicit allowlist
 */
function isPathAllowed(path: string, locale: string): boolean {
  // Remove locale prefix for checking
  const pathWithoutLocale = path.startsWith(`/${locale}`) 
    ? path.substring(`/${locale}`.length) || '/'
    : path
    
  return ALLOWED_REDIRECT_PATHS.includes(pathWithoutLocale as any)
}

/**
 * SECURITY: Detect path traversal attempts
 */
function hasPathTraversal(path: string): boolean {
  return PATH_TRAVERSAL_PATTERNS.some(pattern => pattern.test(path))
}

/**
 * SECURITY: Sanitize query parameters
 */
function sanitizeQueryParams(url: URL): URL {
  const cleanUrl = new URL(url.toString())
  
  // Remove dangerous parameters
  DANGEROUS_QUERY_PARAMS.forEach(param => {
    if (cleanUrl.searchParams.has(param)) {
      logger.warn('🚨 SECURITY: Removed dangerous query parameter', { param })
      cleanUrl.searchParams.delete(param)
    }
  })
  
  // Check for dangerous values in remaining parameters
  for (const [key, value] of cleanUrl.searchParams.entries()) {
    if (PATH_TRAVERSAL_PATTERNS.some(pattern => pattern.test(value))) {
      logger.warn('🚨 SECURITY: Removed parameter with dangerous value', { key, value: value.substring(0, 50) })
      cleanUrl.searchParams.delete(key)
    }
  }
  
  return cleanUrl
}

/**
 * 🛡️ OWASP COMPLIANT: Secure redirect validation
 * Implements OWASP recommendations for preventing open redirect vulnerabilities
 */
export function validateSecureRedirect(
  rawPath: string, 
  locale: string, 
  origin: string
): { isValid: boolean; safePath: string; securityEvents: string[] } {
  
  const securityEvents: string[] = []
  
  // SECURITY: Start with safe fallback
  let safePath = `/${locale}/dashboard`
  
  try {
    // SECURITY: Handle empty or undefined paths
    if (!rawPath || typeof rawPath !== 'string') {
      securityEvents.push('INVALID_INPUT: Empty or non-string path')
      return { isValid: false, safePath, securityEvents }
    }
    
    let workingPath = rawPath.trim()
    
    // SECURITY: Handle absolute URLs - extract pathname only
    if (/^https?:\/\//i.test(workingPath)) {
      try {
        const url = new URL(workingPath)
        
        // OWASP REQUIREMENT: Same-origin check
        if (url.origin !== origin) {
          securityEvents.push(`SECURITY_VIOLATION: External redirect attempt to ${url.origin}`)
          return { isValid: false, safePath, securityEvents }
        }
        
        // SECURITY: Sanitize query parameters
        const cleanUrl = sanitizeQueryParams(url)
        workingPath = cleanUrl.pathname + cleanUrl.search
        
      } catch (error) {
        securityEvents.push('SECURITY_VIOLATION: Malformed absolute URL')
        return { isValid: false, safePath, securityEvents }
      }
    }
    
    // SECURITY: Normalize path
    if (!workingPath.startsWith('/')) {
      workingPath = `/${workingPath}`
    }
    
    // OWASP CRITICAL: Check for path traversal attacks
    if (hasPathTraversal(workingPath)) {
      securityEvents.push(`SECURITY_VIOLATION: Path traversal attempt detected in ${workingPath}`)
      return { isValid: false, safePath, securityEvents }
    }
    
    // SECURITY: Ensure locale prefix exists
    if (!workingPath.startsWith(`/${locale}`)) {
      workingPath = `/${locale}${workingPath}`
    }
    
    // OWASP REQUIREMENT: Check against explicit allowlist
    if (!isPathAllowed(workingPath, locale)) {
      securityEvents.push(`SECURITY_VIOLATION: Path not in allowlist: ${workingPath}`)
      return { isValid: false, safePath, securityEvents }
    }
    
    // SECURITY: Prevent auth page loops
    if (workingPath.includes('/auth/')) {
      securityEvents.push('SECURITY_VIOLATION: Auth page loop prevention')
      return { isValid: false, safePath, securityEvents }
    }
    
    // SUCCESS: Path is validated and secure
    safePath = workingPath
    securityEvents.push(`SECURITY_SUCCESS: Validated redirect to ${safePath}`)
    return { isValid: true, safePath, securityEvents }
    
  } catch (error) {
    securityEvents.push(`SECURITY_ERROR: Validation failed - ${error instanceof Error ? error.message : 'Unknown error'}`)
    return { isValid: false, safePath, securityEvents }
  }
}

/**
 * UTILITY: Check if current environment allows debug logging
 */
export function shouldLogSecurityEvents(): boolean {
  return process.env.NODE_ENV === 'development' || process.env.ENABLE_SECURITY_LOGGING === 'true'
}

/**
 * SECURITY AUDIT: Log all security events for monitoring
 */
export function logSecurityEvent(event: string, details: Record<string, any> = {}) {
  if (shouldLogSecurityEvents()) {
    logger.warn('🛡️ SECURITY EVENT:', {
      event,
      timestamp: new Date().toISOString(),
      ...details
    })
  }
}