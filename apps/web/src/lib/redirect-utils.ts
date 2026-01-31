/**
 * 🛡️ Shared Redirect Utilities (Expert Solution)
 * Centralized locale and path handling to prevent drift between client/middleware/API
 */

// ✅ EXPERT FIX: Robust regex that handles /en AND /en/... 
export const LOCALE_RE = /^\/([a-z]{2}(?:-[a-z]{2})?)(?=\/|$)/i

// ✅ EXPERT FIX: Locale validation regex (for form input validation)
export const LOCALE_VALIDATION_RE = /^([a-z]{2}(?:-[a-z]{2})?)$/i

// ✅ EXPERT RECOMMENDATION: Prefix-aware allowlist instead of exact match
export const ALLOWED_REDIRECT_PATHS = [
  // Public pages
  '/',
  
  // Dashboard and main app areas  
  '/dashboard',
  '/dashboard/billing',
  '/dashboard/settings', 
  '/dashboard/projects',
  
  // Builder paths - now supports dynamic children!
  '/builder',
  '/builder/new',
  '/builder/workspace', // ✅ Now allows /builder/workspace/uuid
  
  // Account management
  '/profile',
  '/settings',
  '/billing',
  
  // Help and support
  '/help',
  '/docs'
] as const

/**
 * ✅ EXPERT: Validate and normalize locale input (prevents poisoning)
 */
export function normalizeLocale(input: string, fallback = 'en'): string {
  const v = (input || '').trim()
  return LOCALE_VALIDATION_RE.test(v) ? v.toLowerCase() : fallback
}

/**
 * ✅ EXPERT: Detect locale from path with fallback
 */
export function detectLocaleFromPath(path: string, fallback = 'en'): string {
  const match = path.match(LOCALE_RE)
  return match?.[1] ?? fallback
}

/**
 * ✅ EXPERT: Collapse accidental double slashes
 */
export function collapseSlashes(path: string): string {
  return path.replace(/\/{2,}/g, '/')
}

/**
 * ✅ EXPERT: Strip locale prefix, leaving clean path for validation
 */
export function stripLeadingLocale(path: string): string {
  return path.replace(LOCALE_RE, '') || '/'
}

/**
 * ✅ EXPERT: Ensure path starts with slash
 */
export function ensureLeadingSlash(path: string): string {
  return path.startsWith('/') ? path : `/${path}`
}

/**
 * ✅ EXPERT: Add locale prefix if missing, handle /en correctly
 */
export function ensureLocalePrefix(path: string, locale: string): string {
  // Handle absolute URLs by extracting pathname
  let workingPath = path
  if (/^https?:\/\//i.test(path)) {
    try {
      const url = new URL(path)
      workingPath = url.pathname + url.search
    } catch {
      workingPath = '/'
    }
  }
  
  // Ensure leading slash
  workingPath = ensureLeadingSlash(workingPath)
  
  // ✅ CRITICAL FIX: Handle /en AND /en/... correctly with (?=\/|$)
  if (LOCALE_RE.test(workingPath)) {
    return workingPath
  }
  
  return `/${locale}${workingPath}`
}

/**
 * ✅ EXPERT: Prefix-aware allowlist check (supports dynamic children)
 */
export function isAllowedPrefix(path: string): boolean {
  return ALLOWED_REDIRECT_PATHS.some(allowed => 
    path === allowed || path.startsWith(`${allowed}/`)
  )
}

/**
 * ✅ EXPERT: Complete validation with locale preservation
 */
export function validateAndNormalizeRedirect(
  rawPath: string, 
  requestOrigin: string,
  fallbackLocale = 'en'
): { isValid: boolean; finalPath: string; locale: string; events: string[] } {
  
  const events: string[] = []
  
  try {
    if (!rawPath || typeof rawPath !== 'string') {
      events.push('INVALID_INPUT: Empty or non-string path')
      return {
        isValid: false,
        finalPath: `/${fallbackLocale}/dashboard`,
        locale: fallbackLocale,
        events
      }
    }

    let workingPath = rawPath.trim()
    
    // Handle absolute URLs with same-origin check
    if (/^https?:\/\//i.test(workingPath)) {
      try {
        const url = new URL(workingPath)
        if (url.origin !== requestOrigin) {
          events.push(`SECURITY_VIOLATION: External redirect blocked - ${url.origin}`)
          return {
            isValid: false,
            finalPath: `/${fallbackLocale}/dashboard`,
            locale: fallbackLocale,
            events
          }
        }
        workingPath = url.pathname + url.search
      } catch {
        events.push('SECURITY_VIOLATION: Malformed absolute URL')
        return {
          isValid: false,
          finalPath: `/${fallbackLocale}/dashboard`,
          locale: fallbackLocale,
          events
        }
      }
    }
    
    // Ensure leading slash
    workingPath = ensureLeadingSlash(workingPath)
    
    // ✅ EXPERT FIX: Extract locale, then validate on locale-free path
    const detectedLocale = detectLocaleFromPath(workingPath, fallbackLocale)
    const prefixlessPath = stripLeadingLocale(workingPath)
    
    // Security checks on the clean path
    if (prefixlessPath.includes('..') || prefixlessPath.includes('<') || prefixlessPath.includes('javascript:')) {
      events.push(`SECURITY_VIOLATION: Path traversal/XSS attempt - ${prefixlessPath}`)
      return {
        isValid: false,
        finalPath: `/${detectedLocale}/dashboard`,
        locale: detectedLocale,
        events
      }
    }
    
    // ✅ EXPERT FIX: Prefix-aware validation
    const safePrefixlessPath = isAllowedPrefix(prefixlessPath) ? prefixlessPath : '/dashboard'
    
    if (safePrefixlessPath !== prefixlessPath) {
      events.push(`ALLOWLIST_FALLBACK: ${prefixlessPath} → ${safePrefixlessPath}`)
    }
    
    // Prevent auth loops
    if (safePrefixlessPath.includes('/auth/')) {
      events.push('AUTH_LOOP_PREVENTION: Blocked auth page redirect')
      return {
        isValid: false,
        finalPath: `/${detectedLocale}/dashboard`,
        locale: detectedLocale,
        events
      }
    }
    
    // ✅ EXPERT FIX: Always restore locale to final path
    const finalPath = ensureLocalePrefix(safePrefixlessPath, detectedLocale)
    
    events.push(`VALIDATION_SUCCESS: ${rawPath} → ${finalPath}`)
    return {
      isValid: true,
      finalPath,
      locale: detectedLocale,
      events
    }
    
  } catch (error) {
    events.push(`VALIDATION_ERROR: ${error instanceof Error ? error.message : 'Unknown error'}`)
    return {
      isValid: false,
      finalPath: `/${fallbackLocale}/dashboard`,
      locale: fallbackLocale,
      events
    }
  }
}