// OAuth start route - redirect to GitHub/Google
import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { RequestCookies, ResponseCookies } from 'next/dist/compiled/@edge-runtime/cookies'
import type { Database } from '@/types/supabase'
// Provider type is now a string literal in newer Supabase versions
type Provider = 'github' | 'google' | 'discord' | 'twitter' | 'facebook' | 'linkedin_oidc'

// EXPERT FIX: Force dynamic execution and Node runtime for auth operations
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const runtime = 'nodejs'

const SUPABASE_URL = process.env.SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const provider = url.searchParams.get('provider') as Provider
    const locale = url.searchParams.get('locale') ?? 'en'
    const returnTo = url.searchParams.get('returnTo') ?? `/${locale}/dashboard`

    if (!provider || !['github', 'google'].includes(provider)) {
      return NextResponse.redirect(
        new URL(`/${locale}/auth/login?reason=invalid_provider`, req.url),
        { status: 303 }
      )
    }

    // Header-based cookie adapter that preserves HttpOnly
    const reqHeaders = new Headers(req.headers)
    const resHeaders = new Headers()

    const supabase = createServerClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
      cookies: {
        getAll: () => new RequestCookies(reqHeaders).getAll(),
        setAll: (cookies) => {
          const resCookies = new ResponseCookies(resHeaders)
          for (const { name, value, options } of cookies) {
            resCookies.set(name, value, options)
          }
        },
      },
    })

    // Use simple callback URL to avoid encoding issues
    const redirectTo = `${url.origin}/${locale}/auth/callback`

    console.log('🔗 OAuth start:', { provider, locale, returnTo })
    console.log('🔗 OAuth callback URL:', redirectTo)
    console.log('🔗 URL origin:', url.origin)

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
      },
    })

    if (error) {
      console.log('❌ OAuth start error:', error.message)
      return NextResponse.redirect(
        new URL(`/${locale}/auth/login?reason=oauth_start_failed`, req.url),
        { status: 303 }
      )
    }

    console.log('✅ OAuth start success, redirecting to:', data.url)

    // Redirect to OAuth provider
    const res = NextResponse.redirect(data.url, { status: 303 })

    // Store returnTo in a temporary cookie for the callback
    res.cookies.set('oauth-return-to', returnTo, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 300, // 5 minutes - just enough for OAuth flow
      path: '/'
    })

    // EXPERT FIX: Append ALL headers (especially multiple Set-Cookie headers)
    for (const [key, value] of resHeaders) {
      res.headers.append(key, value)
    }

    return res
  } catch (error) {
    console.error('💥 OAuth start route error:', error)
    return NextResponse.redirect(
      new URL(`/en/auth/login?reason=oauth_start_failed`, req.url),
      { status: 303 }
    )
  }
}