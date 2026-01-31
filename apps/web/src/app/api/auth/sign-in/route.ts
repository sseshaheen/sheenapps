// EXPERT SOLUTION: Clean NextResponse cookie handling to fix Set-Cookie overwriting
import { NextResponse } from 'next/server'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { logger } from '@/utils/logger'
import { validateAndNormalizeRedirect, normalizeLocale, collapseSlashes } from '@/lib/redirect-utils'

/**
 * ✅ EXPERT SOLUTION: Prefix-aware validation with locale preservation
 * Validates on locale-free path but always restores locale to final redirect
 */
function sanitizeReturnTo(raw: string, requestOrigin: string, fallbackLocale = 'en'): string {
  // 🔍 DIAGNOSTIC LOGGING
  console.log('🔍 SERVER REDIRECT DIAGNOSTIC (Expert Solution):', {
    receivedReturnTo: raw,
    requestOrigin,
    fallbackLocale
  })

  const { isValid, finalPath, locale, events } = validateAndNormalizeRedirect(raw, requestOrigin, fallbackLocale)
  
  console.log('🔍 SERVER VALIDATION RESULT (Expert):', {
    isValid,
    finalPath,
    locale,
    events
  })
  
  // Log security events
  events.forEach(event => {
    if (event.includes('VIOLATION') || event.includes('ERROR')) {
      console.log('🚨 SERVER SECURITY EVENT:', { event, rawPath: raw, finalPath })
      logger.warn('🛡️ Security event:', { event, rawPath: raw, finalPath })
    } else {
      console.log('✅ SERVER VALIDATION:', { event })
      logger.info('🛡️ Redirect validation:', { event, rawPath: raw, finalPath })
    }
  })
  
  if (!isValid) {
    console.log('❌ SERVER: Using fallback due to validation failure')
  }
  
  console.log('🎯 SERVER: Final path (Expert):', finalPath)
  return finalPath
}

// EXPERT FIX: Force dynamic execution and Node runtime for auth operations
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    logger.info('🔐 Sign-in request received', {
      url: req.url,
      method: req.method
    })

    const form = await req.formData()
    const email = String(form.get('email') ?? '')
    const password = String(form.get('password') ?? '')
    const rawLocale = String(form.get('locale') ?? 'en')
    const locale = normalizeLocale(rawLocale, 'en') // ✅ Expert Fix: Guard against locale poisoning
    const returnTo = String(form.get('returnTo') ?? `/${locale}/dashboard`)

    logger.info('📝 Form data extracted', {
      email,
      hasPassword: !!password,
      rawLocale,
      locale,  // ✅ normalized locale
      returnTo
    })

    if (!email || !password) {
      logger.error('⚠️ Missing required fields', {
        hasEmail: !!email,
        hasPassword: !!password
      })
      return NextResponse.redirect(
        new URL(`/${locale}/auth/login?reason=missing_fields`, req.url), 
        { status: 303 }
      )
    }

    // ✅ CRITICAL FIX: Use standardized server client for cookie compatibility
    // This ensures compatibility with /api/auth/me route
    const supabase = await createServerSupabaseClientNew()

    logger.info('🔑 Attempting Supabase authentication', { 
      email, 
      locale, 
      returnTo
    })

    const { data, error } = await supabase.auth.signInWithPassword({ 
      email, 
      password 
    })

    if (error) {
      logger.error('❌ Supabase authentication failed', {
        errorMessage: error.message,
        errorName: error.name
      })
      
      // Map specific error types to reason codes
      let reason = 'invalid_credentials'
      if (error.message.includes('Email not confirmed')) {
        reason = 'email_not_confirmed'
      } else if (error.message.includes('Invalid login credentials')) {
        reason = 'invalid_credentials'
      }
      
      logger.info('↩️ Redirecting to login with error', {
        reason,
        redirectUrl: `/${locale}/auth/login?reason=${reason}`
      })
      
      return NextResponse.redirect(
        new URL(`/${locale}/auth/login?reason=${reason}`, req.url),
        { status: 303 }
      )
    }

    logger.info('✅ Supabase authentication successful', {
      userId: data.user?.id,
      email: data.user?.email,
      sessionExists: !!data.session
    })

    // EXPERT FIX: Extract session data for manual cookie setting
    const session = data.session
    if (!session?.access_token) {
      logger.error('❌ No session data in successful login response')
      return NextResponse.redirect(
        new URL(`/${locale}/auth/login?reason=session_error`, req.url),
        { status: 303 }
      )
    }

    // ✅ EXPERT FIX: Sanitize with locale preservation
    const origin = new URL(req.url).origin
    const safeReturnTo = sanitizeReturnTo(returnTo, origin, locale)
    const cleanPath = collapseSlashes(safeReturnTo) // ✅ Expert Fix: Collapse accidental double slashes
    const redirectTo = new URL(cleanPath, origin)
    redirectTo.searchParams.set('auth_success', 'true')
    
    logger.info('🔄 Auth redirect URL construction', {
      originalReturnTo: returnTo,
      safeReturnTo,
      cleanPath, // ✅ after slash collapsing
      locale,
      origin,
      finalRedirectUrl: redirectTo.toString()
    })
    
    // ✅ CRITICAL FIX: Simplified cookie handling with standardized client
    // The createServerSupabaseClientNew() handles cookies automatically via getAll/setAll
    logger.info('✅ Authentication successful - cookies handled automatically by Supabase client', {
      userId: data.user?.id,
      email: data.user?.email
    })
    
    const res = NextResponse.redirect(redirectTo, { status: 303 })

    logger.info('✅ Sign-in flow completed', {
      redirectTo: redirectTo.toString(),
      status: 303
    })

    return res
  } catch (error) {
    logger.error('❌ Unexpected error in sign-in route', {
      errorMessage: error instanceof Error ? error.message : String(error)
    })
    
    return NextResponse.redirect(
      new URL(`/en/auth/login?reason=unexpected_error`, req.url),
      { status: 303 }
    )
  }
}