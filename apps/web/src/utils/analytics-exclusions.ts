/**
 * Analytics Exclusions Utility
 * Determines when to disable analytics (security-sensitive admin pages, etc.)
 */

/**
 * Check if current path should exclude analytics tracking
 * @param pathname Current pathname (from usePathname or request)
 * @returns true if analytics should be disabled
 */
export function shouldExcludeAnalytics(pathname: string): boolean {
  // Admin routes - contain sensitive user data and operations
  if (pathname.startsWith('/admin')) {
    return true
  }

  // API routes - server-side only, no analytics needed
  if (pathname.startsWith('/api/admin')) {
    return true
  }

  // Builder routes - excluded due to heavy DOM churn causing Clarity 64KB buffer overflow
  // See: Beacon API limit for keepalive requests
  if (pathname.startsWith('/builder')) {
    return true
  }

  // Other sensitive paths can be added here
  const sensitiveRoutes = [
    '/admin-login',           // Admin authentication
  ]

  return sensitiveRoutes.some(route => pathname.startsWith(route))
}

/**
 * Check if current route is admin-related
 * Used for additional security measures
 */
export function isAdminRoute(pathname: string): boolean {
  return pathname.startsWith('/admin') || pathname.startsWith('/admin-login')
}

/**
 * Get analytics context for current route
 */
export function getAnalyticsContext(pathname: string) {
  return {
    shouldTrack: !shouldExcludeAnalytics(pathname),
    isAdmin: isAdminRoute(pathname),
    routeType: pathname.startsWith('/admin') ? 'admin' :
               pathname.startsWith('/api') ? 'api' : 'public'
  }
}