// proxy.ts (renamed from middleware.ts for Next.js 16)
import { NextRequest, NextResponse } from 'next/server'
import { defaultLocale } from './src/i18n/config'
import { FEATURE_FLAGS } from './src/lib/feature-flags'
import { detectLocaleFromPath, ensureLocalePrefix } from './src/lib/redirect-utils'
import { createMiddlewareClient } from './src/lib/supabase-mw'
import { intlMiddleware } from './src/middleware-utils/intl'
import { rateLimitMiddleware } from './src/middleware-utils/rate-limit'
import { logger } from './src/utils/logger'

// ───────────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────────

function generateRequestId(): string {
  const timestamp = Date.now().toString(36)
  const randomPart = Math.random().toString(36).substring(2, 8)
  return `req_${timestamp}_${randomPart}`
}

// ✅ EXPERT FIX: Now using shared ensureLocalePrefix from redirect-utils

const PROTECTED_ROUTES = ['/builder/workspace', '/builder/new', '/dashboard']
const PUBLIC_ONLY_ROUTES = ['/auth/login', '/auth/signup', '/auth/reset', '/invite']
const PUBLIC_ROUTES = ['/auth/reset', '/auth/update-password'] // allowed for everyone
const PROTECTED_API_ROUTES = ['/api/ai', '/api/preview']

// Advisor-specific route patterns
const ADVISOR_PUBLIC_ROUTES = ['/advisor', '/advisor/apply'] // Landing page + application form
const ADVISOR_PROTECTED_ROUTES = [
  '/advisor/dashboard',
  '/advisor/profile',
  '/advisor/consultations',
  '/advisor/earnings',
  '/advisor/settings',
  '/advisor/dashboard/onboarding'
]
const ADVISOR_APPLICATION_ROUTES = ['/advisor/application-status']

function isProtectedPagePath(pathname: string) {
  return PROTECTED_ROUTES.some((r) => pathname.includes(r))
}
function isPublicOnlyPath(pathname: string) {
  return PUBLIC_ONLY_ROUTES.some((r) => pathname.includes(r))
}
function isPublicPath(pathname: string) {
  return PUBLIC_ROUTES.some((r) => pathname.includes(r))
}

// Advisor-specific route checks
function isAdvisorPublicRoute(pathname: string) {
  // Only the exact landing page is public
  return ADVISOR_PUBLIC_ROUTES.some((r) => {
    // Handle both with and without locale prefix
    const withLocaleRegex = new RegExp(`^/[a-z]{2}(-[a-z]{2})?${r}/?$`)
    const withoutLocaleRegex = new RegExp(`^${r}/?$`)
    return withLocaleRegex.test(pathname) || withoutLocaleRegex.test(pathname)
  })
}
function isAdvisorProtectedRoute(pathname: string) {
  return ADVISOR_PROTECTED_ROUTES.some((r) => pathname.includes(r))
}
function isAdvisorApplicationRoute(pathname: string) {
  return ADVISOR_APPLICATION_ROUTES.some((r) => pathname.includes(r))
}
function isAdvisorRoute(pathname: string) {
  return pathname.includes('/advisor')
}
function hasSbCookie(req: NextRequest) {
  const cookies = req.cookies.getAll()
  const sbCookies = cookies.filter((c) => c.name.startsWith('sb-'))
  const hasCookies = sbCookies.length > 0

  // Debug logging for cookie detection
  if (req.nextUrl.pathname.includes('/builder/') || req.nextUrl.pathname.includes('/dashboard')) {
    logger.debug('middleware', '🍪 COOKIE DEBUG:', {
      pathname: req.nextUrl.pathname,
      allCookies: cookies.map(c => c.name),
      sbCookies: sbCookies.map(c => c.name),
      hasSbCookies: hasCookies
    })
  }

  return hasCookies
}
// ✅ EXPERT FIX: Now using shared detectLocaleFromPath from redirect-utils

// Build CSP based on environment - stricter in production
function buildCsp(isDev: boolean): string {
  // In dev: allow unsafe-eval/inline for hot reload, localhost for iframe previews
  // In prod: remove these permissive directives
  const scriptSrc = isDev
    ? "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://unpkg.com https://challenges.cloudflare.com"
    : "script-src 'self' https://unpkg.com https://challenges.cloudflare.com"

  const frameSrc = isDev
    ? "frame-src 'self' http://localhost:3000"
    : "frame-src 'self'"

  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https: blob:",
    "connect-src 'self' https://*.supabase.co https://api.dicebear.com https://challenges.cloudflare.com ws: wss:",
    frameSrc,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
}

function addSecurityHeaders(response: NextResponse, isAuthenticated: boolean, requestId?: string) {
  const isDev = process.env.NODE_ENV !== 'production'
  const headers = response.headers
  if (requestId) headers.set('x-request-id', requestId)
  headers.set('X-Frame-Options', 'DENY')
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  headers.set('X-XSS-Protection', '1; mode=block')
  headers.set('Content-Security-Policy', buildCsp(isDev))
  if (isAuthenticated) headers.set('X-User-Authenticated', 'true')
  headers.set('X-DNS-Prefetch-Control', 'on')
}

// ───────────────────────────────────────────────────────────────────────────────
// Middleware
// ───────────────────────────────────────────────────────────────────────────────

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const requestId = generateRequestId()

  // 🔍 CRITICAL DEBUG: Console.log to verify middleware runs
  console.log('🚀 [MIDDLEWARE ENTRY] pathname:', pathname)

  // EXPERT FIX: Canonical host redirect to prevent cookie domain mismatches
  const host = request.headers.get('host') || ''
  const CANONICAL_HOST = 'www.sheenapps.com' // Choose ONE: apex or www
  const isDev = process.env.NODE_ENV !== 'production'

  logger.debug('middleware', 'Middleware processing request', {
    pathname,
    method: request.method,
    host,
    canonicalHost: CANONICAL_HOST,
    isDev,
    requestId,
    userAgent: request.headers.get('user-agent')?.slice(0, 50),
    referer: request.headers.get('referer'),
    cookieHeader: request.headers.get('cookie')?.slice(0, 100) + '...'
  })

  // Only enforce canonical host in production (skip for OAuth callbacks)
  const isOAuthCallback = pathname.includes('/auth/callback')
  if (!isDev && host !== CANONICAL_HOST && !isOAuthCallback) {
    logger.debug('middleware', 'Redirecting to canonical host', {
      from: host,
      to: CANONICAL_HOST,
      pathname
    })

    const url = new URL(request.url)
    url.host = CANONICAL_HOST
    return NextResponse.redirect(url, 308)
  }

  logger.debug('api', `[MIDDLEWARE] Request ${requestId}: ${request.method} ${pathname}`, {
    requestId,
    method: request.method,
    pathname,
    userAgent: request.headers.get('user-agent')?.slice(0, 50),
  })

  if (pathname.startsWith('/cdn-cgi/')) return NextResponse.next()

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/_vercel') ||
    pathname.includes('.') ||
    pathname.startsWith('/favicon')
  ) {
    const resp = NextResponse.next()
    resp.headers.set('x-request-id', requestId)
    return resp
  }

  // ───────────────────────────────────────────────────────────────────────────
  // API routes
  // NOTE: This block is currently DEAD CODE - the matcher at line 497 excludes
  // '/api/' routes. API routes protect themselves via authPresets.authenticated(),
  // requireAdmin(), etc. This block exists for potential future use if API
  // routes need proxy-level protection. To activate, add 'api' routes to matcher.
  // ───────────────────────────────────────────────────────────────────────────
  if (pathname.startsWith('/api/')) {
    // Rate limit first (returns a response we will continue to use)
    let apiResponse = await rateLimitMiddleware(request)
    if (apiResponse.status === 429) return apiResponse

    const isProtectedAPI = PROTECTED_API_ROUTES.some((r) => pathname.startsWith(r))

    // Only auth-gate APIs here. Use a SINGLE response; no cookie copying.
    if (isProtectedAPI && FEATURE_FLAGS.ENABLE_SUPABASE) {
      try {
        // Use server-only env vars in middleware (no NEXT_PUBLIC_ *)
        if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
          logger.warn('🚫 Supabase not configured - skipping API auth')
        } else {
          const supabase = createMiddlewareClient(request, apiResponse)
          const {
            data: { user },
            error,
          } = await supabase.auth.getUser()

          if (error) logger.error('🔐 API auth error:', error.message)

          if (!user) {
            return new NextResponse(
              JSON.stringify({
                error: 'Authentication required',
                code: 'UNAUTHORIZED',
                requestId,
              }),
              {
                status: 401,
                headers: { 'Content-Type': 'application/json', 'x-request-id': requestId },
              }
            )
          }
        }
      } catch (e) {
        logger.error('🚨 API auth critical error:', e)
        return new NextResponse(
          JSON.stringify({ error: 'AUTH_SERVICE_ERROR', requestId }),
          { status: 503, headers: { 'Content-Type': 'application/json', 'x-request-id': requestId } }
        )
      }
    }

    apiResponse.headers.set('x-request-id', requestId)
    return apiResponse
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Pages: Check for shortcut redirects BEFORE i18n middleware
  // ───────────────────────────────────────────────────────────────────────────

  // 🔍 DEBUG: Log pathname to see what we're actually checking
  console.log('[MIDDLEWARE] Checking pathname for /build redirect:', {
    pathname,
    pathnameType: typeof pathname,
    pathnameLength: pathname.length,
    startsWithSlash: pathname.startsWith('/'),
    equalsSlashBuild: pathname === '/build',
    pathnameChars: Array.from(pathname).map(c => `${c} (${c.charCodeAt(0)})`).join(', ')
  })

  // Handle /build shortcut redirect to builder/new (before intl middleware)
  if (pathname === '/build') {
    console.log('[MIDDLEWARE] ✅ /build match detected!')

    // Use request.headers to detect user's preferred locale, fallback to defaultLocale
    const acceptLang = request.headers.get('accept-language') || ''
    let userLocale = defaultLocale

    // Simple locale detection from Accept-Language header
    if (acceptLang.includes('ar')) {
      if (acceptLang.includes('eg')) userLocale = 'ar-eg'
      else if (acceptLang.includes('sa')) userLocale = 'ar-sa'
      else if (acceptLang.includes('ae')) userLocale = 'ar-ae'
      else userLocale = 'ar'
    } else if (acceptLang.includes('fr')) {
      if (acceptLang.includes('ma')) userLocale = 'fr-ma'
      else userLocale = 'fr'
    } else if (acceptLang.includes('es')) {
      userLocale = 'es'
    } else if (acceptLang.includes('de')) {
      userLocale = 'de'
    }

    const builderUrl = new URL(`/${userLocale}/builder/new`, request.url)

    console.log('[MIDDLEWARE] /build redirect executing:', {
      pathname,
      userLocale,
      redirectTo: builderUrl.toString()
    })

    return NextResponse.redirect(builderUrl, 307)
  } else {
    console.log('[MIDDLEWARE] ❌ pathname does NOT equal "/build"')
  }

  // Also check for /{locale}/build pattern (in case intl already processed it)
  const buildPathPattern = /^\/[a-z]{2}(-[a-z]{2})?\/build$/
  if (buildPathPattern.test(pathname)) {
    console.log('[MIDDLEWARE] ✅ /{locale}/build pattern match detected!')

    const locale = detectLocaleFromPath(pathname, defaultLocale)
    const builderUrl = new URL(`/${locale}/builder/new`, request.url)

    console.log('[MIDDLEWARE] /{locale}/build redirect executing:', {
      pathname,
      locale,
      redirectTo: builderUrl.toString()
    })

    return NextResponse.redirect(builderUrl, 307)
  } else {
    console.log('[MIDDLEWARE] ❌ pathname does NOT match /{locale}/build pattern')
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Run i18n middleware
  // ───────────────────────────────────────────────────────────────────────────

  let response = await intlMiddleware(request)

  // Extract the effective path after intl rewrite (if any)
  const effectivePath =
    response.headers.get('x-middleware-rewrite')?.replace(request.nextUrl.origin, '') || pathname

  // Public-only pages (login/signup): if user *appears* signed in (has sb- cookie), redirect away
  if (isPublicOnlyPath(effectivePath) && hasSbCookie(request)) {
    const locale = detectLocaleFromPath(effectivePath, defaultLocale)
    const dashboardUrl = new URL(`/${locale}/dashboard`, request.url)

    logger.debug('middleware', 'User appears signed in, redirecting away from public-only page', {
      effectivePath,
      hasAuth: true,
      redirectTo: dashboardUrl.pathname,
      locale,
      sbCookies: request.cookies.getAll().filter(c => c.name.startsWith('sb-')).map(c => c.name)
    })

    logger.debug('general', `Auth redirect (public-only): ${effectivePath} → ${dashboardUrl.pathname}`, { requestId })
    const redirectResp = NextResponse.redirect(dashboardUrl)
    addSecurityHeaders(redirectResp, true, requestId)
    return redirectResp
  }

  // Advisor route protection (comprehensive state-based routing)
  if (isAdvisorRoute(effectivePath)) {
    const locale = detectLocaleFromPath(effectivePath, defaultLocale)

    // Public advisor landing page - always allow
    if (isAdvisorPublicRoute(effectivePath)) {
      logger.debug('middleware', 'Advisor public route access allowed', {
        effectivePath,
        isPublic: true,
        locale
      })
      addSecurityHeaders(response, hasSbCookie(request), requestId)
      return response
    }

    // Protected advisor routes require authentication
    if (isAdvisorProtectedRoute(effectivePath) && !hasSbCookie(request)) {
      const loginUrl = new URL(`/${locale}/auth/login`, request.url)
      loginUrl.searchParams.set('redirect', '/advisor/dashboard')
      loginUrl.searchParams.set('reason', 'advisor_auth_required')

      logger.debug('middleware', 'Advisor protected route - redirecting to login', {
        effectivePath,
        hasAuth: false,
        redirectTo: loginUrl.pathname + loginUrl.search,
        locale
      })

      const redirectResp = NextResponse.redirect(loginUrl)
      addSecurityHeaders(redirectResp, false, requestId)
      return redirectResp
    }

    // Application routes can be accessed by authenticated users
    if (isAdvisorApplicationRoute(effectivePath) && !hasSbCookie(request)) {
      const loginUrl = new URL(`/${locale}/auth/login`, request.url)
      loginUrl.searchParams.set('redirect', effectivePath)
      loginUrl.searchParams.set('reason', 'advisor_application_auth_required')

      logger.debug('middleware', 'Advisor application route - redirecting to login', {
        effectivePath,
        hasAuth: false,
        redirectTo: loginUrl.pathname + loginUrl.search,
        locale
      })

      const redirectResp = NextResponse.redirect(loginUrl)
      addSecurityHeaders(redirectResp, false, requestId)
      return redirectResp
    }
  }

  // EXPERT FIX: Skip auth redirects in test environment for stability
  if (process.env.TEST_E2E === '1') {
    logger.debug('middleware', 'TEST_E2E mode - bypassing auth checks', {
      effectivePath,
      testMode: true
    })
    addSecurityHeaders(response, true, requestId) // Assume authenticated in tests
    return response
  }

  // Regular protected pages: if no sb- cookie, redirect to login (lightweight guard)
  if (isProtectedPagePath(effectivePath) && !hasSbCookie(request)) {
    const locale = detectLocaleFromPath(effectivePath, defaultLocale)
    const loginUrl = new URL(`/${locale}/auth/login`, request.url)

    // ✅ CRITICAL FIX: Ensure returnTo always has locale prefix
    const ensuredReturnTo = ensureLocalePrefix(effectivePath, locale)

    // 🔍 DEBUG: Log values to understand the issue
    logger.debug('middleware', '🔍 AUTH REDIRECT DEBUG:', {
      pathname,
      effectivePath,
      locale,
      originalReturnTo: pathname,
      ensuredReturnTo
    })

    loginUrl.searchParams.set('returnTo', ensuredReturnTo)
    loginUrl.searchParams.set('locale', locale) // Backup locale info
    loginUrl.searchParams.set('reason', 'auth_required')

    logger.debug('middleware', 'No auth cookie detected, redirecting to login', {
      originalPathname: pathname,
      effectivePath,
      hasAuth: false,
      redirectTo: loginUrl.pathname + loginUrl.search,
      locale,
      allCookies: request.cookies.getAll().map(c => c.name),
      sbCookies: request.cookies.getAll().filter(c => c.name.startsWith('sb-')).map(c => c.name),
      returnTo: pathname, // ✅ pathname always includes locale with 'always' setting
      reason: 'auth_required'
    })

    logger.debug('general', `Protected route redirect: ${effectivePath} → ${loginUrl.pathname}`, { requestId })
    const redirectResp = NextResponse.redirect(loginUrl)
    addSecurityHeaders(redirectResp, false, requestId)
    return redirectResp
  }

  // Log when protected pages are allowed through (user has cookies)
  if (isProtectedPagePath(effectivePath) && hasSbCookie(request)) {
    logger.debug('middleware', 'Protected page access allowed - auth cookies present', {
      effectivePath,
      hasAuth: true,
      locale: detectLocaleFromPath(effectivePath, defaultLocale),
      sbCookies: request.cookies.getAll().filter(c => c.name.startsWith('sb-')).map(c => c.name)
    })

    // EXPERT FIX: Add no-cache headers for protected builder pages
    if (effectivePath.includes('/builder/')) {
      response.headers.set('Cache-Control', 'no-store')
    }

    // EXPERT RECOMMENDATION: Belt & suspenders cache override for billing pages
    if (/^\/[a-z]{2}(-[a-z]{2})?\/billing\/(success|cancel)$/.test(effectivePath)) {
      response.headers.set('Cache-Control', 'no-store')
    }
  }

  // Public routes pass through
  if (isPublicPath(effectivePath)) {
    addSecurityHeaders(response, hasSbCookie(request), requestId)
    return response
  }

  // Set a non-HttpOnly locale cookie for workers (optional)
  const locale = detectLocaleFromPath(effectivePath, defaultLocale)
  response.cookies.set('locale', locale, {
    httpOnly: false,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
  })

  addSecurityHeaders(response, hasSbCookie(request), requestId)

  // Add pathname header for layout detection
  response.headers.set('x-pathname', effectivePath || pathname)

  return response
}

// ───────────────────────────────────────────────────────────────────────────────
// Matcher
// ───────────────────────────────────────────────────────────────────────────────
export const config = {
  matcher: [
    // Match all routes except:
    // - _next assets
    // - api routes
    // - files with extensions
    // - favicons/robots/sitemap
    // - .well-known/*
    // - cdn-cgi/*
    // - Next.js generated og/icon/apple-icon/manifest
    '/((?!_next|api|.*\\..*|favicon.ico|robots.txt|sitemap.xml|opengraph-image|icon|apple-icon|manifest.webmanifest|\\.well-known|cdn-cgi).*)',
  ],
}
