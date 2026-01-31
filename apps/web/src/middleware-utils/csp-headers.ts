/**
 * Content Security Policy Headers
 * Provides security headers for preview routes
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * CSP configuration for different route types
 */
const CSP_CONFIGS = {
  // Strict CSP for template preview routes
  preview: {
    'default-src': ["'self'"],
    'script-src': ["'self'", "'wasm-unsafe-eval'"], // For Web Worker
    'style-src': ["'self'", "'unsafe-inline'"], // For CSS variables
    'img-src': ["'self'", 'data:', 'https:'],
    'font-src': ["'self'", 'https://fonts.gstatic.com'],
    'connect-src': ["'self'"],
    'frame-src': ["'none'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'worker-src': ["'self'"], // For Web Worker
    'child-src': ["'self'"], // For Web Worker fallback
  },
  
  // Standard CSP for other routes
  default: {
    'default-src': ["'self'"],
    'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https:'],
    'style-src': ["'self'", "'unsafe-inline'", 'https:'],
    'img-src': ["'self'", 'data:', 'https:'],
    'font-src': ["'self'", 'https:'],
    'connect-src': ["'self'", 'https:'],
    'frame-src': ["'self'", 'https:'],
    'object-src': ["'none'"],
  }
}

/**
 * Build CSP header string from config
 */
function buildCSPHeader(config: Record<string, string[]>): string {
  return Object.entries(config)
    .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
    .join('; ')
}

/**
 * Apply CSP headers to response
 */
export function applyCSPHeaders(
  request: NextRequest,
  response: NextResponse,
  routeType: 'preview' | 'default' = 'default'
): NextResponse {
  const cspConfig = CSP_CONFIGS[routeType]
  const cspHeader = buildCSPHeader(cspConfig)

  // Set CSP header
  response.headers.set('Content-Security-Policy', cspHeader)

  // Additional security headers
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  
  // Permissions Policy (restrict features)
  response.headers.set(
    'Permissions-Policy',
    'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()'
  )

  return response
}

/**
 * Middleware helper for preview routes
 */
export function withPreviewCSP(handler: (req: NextRequest) => Promise<NextResponse>) {
  return async (request: NextRequest) => {
    const response = await handler(request)
    return applyCSPHeaders(request, response, 'preview')
  }
}

/**
 * Check if route should have strict CSP
 */
export function shouldApplyStrictCSP(pathname: string): boolean {
  const strictRoutes = [
    '/builder/preview',
    '/api/preview',
    '/api/template/render',
    '/preview'
  ]
  
  return strictRoutes.some(route => pathname.startsWith(route))
}

/**
 * CSP violation report handler
 */
export async function handleCSPReport(request: NextRequest): Promise<NextResponse> {
  try {
    const report = await request.json()
    
    // Log CSP violations (in production, send to monitoring service)
    console.warn('[CSP Violation]', {
      documentUri: report['csp-report']?.['document-uri'],
      violatedDirective: report['csp-report']?.['violated-directive'],
      blockedUri: report['csp-report']?.['blocked-uri'],
      lineNumber: report['csp-report']?.['line-number'],
      columnNumber: report['csp-report']?.['column-number']
    })

    return NextResponse.json({ received: true }, { status: 204 })
  } catch (error) {
    console.error('[CSP Report Error]', error)
    return NextResponse.json({ error: 'Invalid report' }, { status: 400 })
  }
}