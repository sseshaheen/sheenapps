// Sign-up route handler with proper SSR client
import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { RequestCookies, ResponseCookies } from 'next/dist/compiled/@edge-runtime/cookies'
import type { Database } from '@/types/supabase'
import { logger } from '@/utils/logger'

// Helper functions for locale and security (same as sign-in)
function hasLocalePrefix(path: string): boolean {
  return /^\/[a-z]{2}(?:-[a-z]{2})?\//.test(path)
}

function sanitizeReturnTo(raw: string, locale: string, origin: string): string {
  // Start with fallback
  let path = raw || `/${locale}/dashboard`
  
  // Handle absolute URLs
  if (/^https?:\/\//i.test(path)) {
    try {
      const url = new URL(path)
      // Only allow same-origin URLs
      if (url.origin !== origin) {
        logger.warn('🚨 Blocked external returnTo URL:', path)
        return `/${locale}/dashboard`
      }
      path = url.pathname + url.search
    } catch {
      logger.warn('🚨 Invalid absolute returnTo URL:', path)
      return `/${locale}/dashboard`
    }
  }
  
  // Ensure it starts with /
  if (!path.startsWith('/')) path = `/${path}`
  
  // Add locale prefix if missing
  if (!hasLocalePrefix(path)) {
    path = `/${locale}${path}`
  }
  
  // Prevent auth page loops
  if (/^\/[a-z]{2}(?:-[a-z]{2})?\/auth\//.test(path)) {
    logger.warn('🚨 Prevented auth loop, redirecting to dashboard')
    return `/${locale}/dashboard`
  }
  
  return path
}

// EXPERT FIX: Force dynamic execution and Node runtime for auth operations
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const runtime = 'nodejs'

const SUPABASE_URL = process.env.SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!

export async function POST(req: Request) {
  try {
    const form = await req.formData()
    const email = String(form.get('email') ?? '')
    const password = String(form.get('password') ?? '')
    const locale = String(form.get('locale') ?? 'en')
    const returnTo = String(form.get('returnTo') ?? '')
    const name = String(form.get('name') ?? '')
    const plan = String(form.get('plan') ?? 'free')

    logger.info('📝 Sign-up form data extracted', {
      email,
      hasPassword: !!password,
      locale,
      returnTo,
      name,
      plan
    })

    if (!email || !password) {
      return NextResponse.redirect(
        new URL(`/${locale}/auth/signup?reason=missing_fields`, req.url),
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

    console.log('📝 Sign-up attempt:', { email, locale })

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${new URL(req.url).origin}/${locale}/auth/callback`,
        data: {
          name,
          plan,
          locale
        }
      }
    })

    if (error) {
      console.log('❌ Sign-up error:', error.message)
      
      let reason = 'signup_failed'
      if (error.message.includes('already registered')) {
        reason = 'email_already_exists'
      } else if (error.message.includes('Password')) {
        reason = 'weak_password'
      }
      
      return NextResponse.redirect(
        new URL(`/${locale}/auth/signup?reason=${reason}`, req.url),
        { status: 303 }
      )
    }

    logger.info('✅ Sign-up success:', { userId: data.user?.id, needsConfirmation: !data.session })

    // ✅ EXPERT FIX: Use sanitized returnTo for redirect destination
    const origin = new URL(req.url).origin
    const safeReturnTo = sanitizeReturnTo(returnTo, locale, origin)

    // If email confirmation is required, redirect to login with check_email message
    // If confirmation is off, user is already signed in and can go to intended destination
    let redirectUrl: URL
    if (!data.session) {
      // Need email confirmation - go to login page but preserve returnTo
      redirectUrl = new URL(`/${locale}/auth/login`, req.url)
      redirectUrl.searchParams.set('reason', 'check_email')
      redirectUrl.searchParams.set('returnTo', safeReturnTo)
    } else {
      // User is immediately signed in - go to intended destination
      redirectUrl = new URL(safeReturnTo, origin)
      redirectUrl.searchParams.set('auth_success', 'true')
    }

    logger.info('🔄 Signup redirect URL construction', {
      originalReturnTo: returnTo,
      safeReturnTo,
      needsConfirmation: !data.session,
      finalRedirectUrl: redirectUrl.toString()
    })

    const res = NextResponse.redirect(redirectUrl, { status: 303 })

    // EXPERT FIX: Append ALL headers (especially multiple Set-Cookie headers)
    for (const [key, value] of resHeaders) {
      // Important: append, don't set — multiple Set-Cookie headers are allowed
      res.headers.append(key, value)
    }

    return res
  } catch (error) {
    console.error('💥 Sign-up route error:', error)
    return NextResponse.redirect(
      new URL(`/en/auth/signup?reason=unexpected_error`, req.url),
      { status: 303 }
    )
  }
}