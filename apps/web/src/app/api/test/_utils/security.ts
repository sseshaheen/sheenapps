/**
 * Test Endpoint Security
 *
 * CRITICAL: These endpoints can create/delete data. They must be protected.
 *
 * Security layers (expert-validated):
 * 1. ENABLE_TEST_ENDPOINTS env flag must be 'true' (not NODE_ENV-based)
 * 2. X-Test-Secret header must match TEST_ENDPOINT_SECRET env
 * 3. Rate limiting (optional, via middleware)
 */

import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'

/**
 * EXPERT FIX: Constant-time string comparison to prevent timing attacks
 * Returns true if strings are equal, false otherwise
 */
function safeCompare(a: string, b: string): boolean {
  // timingSafeEqual requires same-length buffers
  // First check lengths (this leaks length info, but that's acceptable for secrets)
  if (a.length !== b.length) {
    return false
  }

  const bufA = Buffer.from(a, 'utf-8')
  const bufB = Buffer.from(b, 'utf-8')

  return timingSafeEqual(bufA, bufB)
}

/**
 * Validate test endpoint access
 *
 * Returns null if authorized, NextResponse with error if not
 */
export function validateTestEndpoint(request: NextRequest): NextResponse | null {
  // Layer 1: Explicit enable flag (NOT based on NODE_ENV which looks "production-ish" on staging)
  if (process.env.ENABLE_TEST_ENDPOINTS !== 'true') {
    return NextResponse.json(
      { error: 'Test endpoints disabled', code: 'ENDPOINTS_DISABLED' },
      { status: 404 } // 404 so it doesn't reveal endpoint existence
    )
  }

  // Layer 2: Shared secret (prevents random probing)
  const testSecret = request.headers.get('X-Test-Secret')
  const expectedSecret = process.env.TEST_ENDPOINT_SECRET

  if (!expectedSecret) {
    console.error('[test-api] TEST_ENDPOINT_SECRET not configured')
    return NextResponse.json(
      { error: 'Test endpoints misconfigured', code: 'NO_SECRET_CONFIGURED' },
      { status: 500 }
    )
  }

  // EXPERT FIX: Use constant-time comparison to prevent timing attacks
  if (!testSecret || !safeCompare(testSecret, expectedSecret)) {
    return NextResponse.json(
      { error: 'Forbidden', code: 'INVALID_SECRET' },
      { status: 403 }
    )
  }

  // Layer 3: Log for audit trail
  const runId = request.headers.get('X-Test-Run-ID') || 'unknown'
  console.log(`[test-api] Authorized request - run: ${runId}, path: ${request.nextUrl.pathname}`)

  return null // Authorized
}

/**
 * Standard no-cache headers for test endpoints
 */
export const TEST_RESPONSE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0',
}

/**
 * Route configuration for all test endpoints
 */
export const TEST_ROUTE_CONFIG = {
  dynamic: 'force-dynamic' as const,
  revalidate: 0,
  fetchCache: 'force-no-store' as const,
}
