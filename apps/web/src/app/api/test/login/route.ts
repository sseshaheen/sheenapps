/**
 * Test Login API
 *
 * Provides API-based authentication for E2E tests.
 * Faster than UI login and returns cookies for context setup.
 *
 * Expert-validated pattern from PLAYWRIGHT_TEST_ANALYSIS.md
 */

import { NextRequest, NextResponse } from 'next/server'
import { validateTestEndpoint, TEST_RESPONSE_HEADERS, TEST_ROUTE_CONFIG } from '../_utils/security'
import { createBrowserClient } from '@supabase/ssr'
import { logger } from '@/utils/logger'

export const { dynamic, revalidate, fetchCache } = TEST_ROUTE_CONFIG

interface LoginRequest {
  email: string
  password: string
}

interface LoginResponse {
  success: boolean
  userId?: string
  email?: string
  accessToken?: string
  refreshToken?: string
  cookies?: Array<{
    name: string
    value: string
    domain: string
    path: string
    httpOnly?: boolean
    secure?: boolean
    sameSite?: 'Strict' | 'Lax' | 'None'
  }>
  error?: string
}

/**
 * POST /api/test/login
 *
 * Authenticates test user and returns session tokens/cookies
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Security check
  const authError = validateTestEndpoint(request)
  if (authError) return authError

  try {
    const body: LoginRequest = await request.json()
    const { email, password } = body

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: 'Email and password required' },
        { status: 400, headers: TEST_RESPONSE_HEADERS }
      )
    }

    logger.info('[test-login] Attempting login', { email })

    // Create a Supabase client for auth
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
      logger.error('[test-login] Supabase config missing')
      return NextResponse.json(
        { success: false, error: 'Server configuration error' },
        { status: 500, headers: TEST_RESPONSE_HEADERS }
      )
    }

    const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    // Attempt login
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error || !data.session) {
      logger.warn('[test-login] Login failed', { email, error: error?.message })
      return NextResponse.json(
        { success: false, error: error?.message || 'Login failed' },
        { status: 401, headers: TEST_RESPONSE_HEADERS }
      )
    }

    const { session, user } = data

    logger.info('[test-login] Login successful', { userId: user.id, email })

    // EXPERT FIX: Determine secure flag based on scheme, not NODE_ENV
    // NODE_ENV=production + http://localhost = cookies dropped by browser
    const requestOrigin = request.nextUrl.origin
    const isSecureOrigin = requestOrigin.startsWith('https://')

    // EXPERT FIX: Use url-based approach for Playwright cookies
    // Playwright's addCookies works better with 'url' than 'domain'
    // Omitting domain lets the cookie apply to the request's host
    const cookieName = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`
    const cookieValue = JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      expires_in: session.expires_in,
      token_type: session.token_type,
      user: {
        id: user.id,
        email: user.email,
      },
    })

    // Build response with tokens
    const response: LoginResponse = {
      success: true,
      userId: user.id,
      email: user.email,
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      // EXPERT FIX: Cookies for Playwright - use 'url' pattern instead of fixed 'domain'
      // This allows Playwright to correctly apply cookies for localhost, 127.0.0.1, or deployed URLs
      cookies: [
        {
          name: cookieName,
          value: cookieValue,
          // EXPERT FIX: Omit domain - let the cookie apply to request origin
          // Playwright's addCookies will derive domain from url if we provide it
          domain: new URL(requestOrigin).hostname,
          path: '/',
          httpOnly: true,
          secure: isSecureOrigin,
          sameSite: 'Lax',
        },
      ],
    }

    // Also set the cookie in the response for convenience
    const nextResponse = NextResponse.json(response, {
      status: 200,
      headers: TEST_RESPONSE_HEADERS,
    })

    // Set the auth cookie directly on the response
    // EXPERT FIX: secure based on scheme, not NODE_ENV
    nextResponse.cookies.set({
      name: cookieName,
      value: cookieValue,
      path: '/',
      httpOnly: true,
      secure: isSecureOrigin,
      sameSite: 'lax',
      maxAge: session.expires_in,
    })

    return nextResponse

  } catch (error: any) {
    logger.error('[test-login] Unexpected error', { error: error.message })

    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500, headers: TEST_RESPONSE_HEADERS }
    )
  }
}

/**
 * GET /api/test/login
 *
 * Health check for login endpoint
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const authError = validateTestEndpoint(request)
  if (authError) return authError

  return NextResponse.json(
    { status: 'ok', message: 'Test login endpoint available' },
    { headers: TEST_RESPONSE_HEADERS }
  )
}
