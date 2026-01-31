/**
 * CSRF Protection Utilities
 *
 * Protects cookie-authenticated API routes from Cross-Site Request Forgery attacks.
 * Uses Origin/Host validation (works well with SameSite cookies as defense-in-depth).
 */

import { NextRequest } from 'next/server'

/**
 * Allowed origins for CSRF protection
 * Add production, staging, and preview domains here
 */
const ALLOWED_ORIGINS = new Set([
  'https://sheenapps.com',
  'https://www.sheenapps.com',
  // Vercel preview deployments
  ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
])

/**
 * Assert that the request comes from a same-origin source.
 * Throws an error if the origin doesn't match allowed origins or host.
 *
 * Use this on all POST/PUT/PATCH/DELETE routes that use cookie authentication.
 *
 * @param req - Next.js request object
 * @throws Error if CSRF check fails
 *
 * @example
 * ```ts
 * export async function POST(req: NextRequest) {
 *   try {
 *     assertSameOrigin(req)
 *     // ... rest of handler
 *   } catch (e) {
 *     return NextResponse.json(
 *       { ok: false, error: { code: 'FORBIDDEN', message: 'Forbidden' } },
 *       { status: 403 }
 *     )
 *   }
 * }
 * ```
 */
export function assertSameOrigin(req: NextRequest): void {
  const origin = req.headers.get('origin')
  const host = req.headers.get('host')

  if (!host) {
    throw new Error('CSRF_BLOCKED: missing host header')
  }

  // Allow requests without Origin header (e.g., server-to-server, same-origin non-CORS)
  // This is safe because:
  // 1. Browsers always send Origin for cross-origin requests
  // 2. SameSite=Lax cookies provide baseline protection
  // 3. Same-origin fetch() doesn't trigger CORS, so no Origin header
  if (!origin) {
    return
  }

  // Allow localhost for development
  if (process.env.NODE_ENV === 'development') {
    if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
      return
    }
  }

  // Check if origin is in allowed list
  if (ALLOWED_ORIGINS.has(origin)) {
    return
  }

  // Last check: origin host matches request host
  try {
    const originUrl = new URL(origin)
    if (originUrl.host === host) {
      return
    }
  } catch {
    // Invalid origin URL
    throw new Error(`CSRF_BLOCKED: invalid origin ${origin}`)
  }

  // If we get here, origin is not allowed
  throw new Error(`CSRF_BLOCKED: origin ${origin} not allowed (host=${host})`)
}
