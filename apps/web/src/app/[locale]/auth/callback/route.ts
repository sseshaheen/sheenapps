/**
 * 🔐 Supabase Auth Callback Handler
 * Handles OAuth redirects and email confirmation flows
 */

import { defaultLocale } from '@/i18n/config'
import { getAuthRedirectUrl, sanitizeReturnUrl } from '@/lib/auth-utils'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/utils/logger';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const locale = requestUrl.pathname.split('/')[1] || defaultLocale
  const code = requestUrl.searchParams.get('code')
  const error = requestUrl.searchParams.get('error')
  const errorDescription = requestUrl.searchParams.get('error_description')
  
  // Get returnTo from temporary cookie (set by OAuth start route) 
  const rawReturnTo = request.cookies.get('oauth-return-to')?.value
  const returnTo = sanitizeReturnUrl(rawReturnTo, locale)
  
  logger.info('🔐 Auth callback received', {
    locale,
    hasCode: !!code,
    hasError: !!error,
    returnTo: rawReturnTo,
    sanitizedReturnTo: returnTo
  })

  // Handle auth errors
  if (error) {
    logger.error('🚨 Auth callback error:', error, errorDescription);

    const errorPath = `/${locale}/auth/login`
    const errorUrl = getAuthRedirectUrl(request, errorPath)
    const finalErrorUrl = new URL(errorUrl)
    finalErrorUrl.searchParams.set('error', error)
    finalErrorUrl.searchParams.set('error_description', errorDescription || 'Authentication failed')

    return NextResponse.redirect(finalErrorUrl)
  }

  // Handle successful auth with code exchange
  if (code) {
    try {
      const supabase = await createServerSupabaseClientNew()

      // Exchange code for session
      const { data, error } = await supabase.auth.exchangeCodeForSession(code)

      if (error) {
        logger.error('🚨 Code exchange failed:', error.message);

        const errorPath = `/${locale}/auth/login`
        const errorUrl = getAuthRedirectUrl(request, errorPath)
        const finalErrorUrl = new URL(errorUrl)
        finalErrorUrl.searchParams.set('error', 'exchange_failed')
        finalErrorUrl.searchParams.set('error_description', error.message)

        return NextResponse.redirect(finalErrorUrl)
      }

      // ✅ CRITICAL FIX: Verify session was actually created
      if (!data.session?.access_token) {
        logger.error('❌ No session created despite successful code exchange', {
          hasUser: !!data.user,
          hasSession: !!data.session,
          sessionAccessToken: data.session?.access_token ? 'present' : 'missing'
        });

        const errorPath = `/${locale}/auth/login`
        const errorUrl = getAuthRedirectUrl(request, errorPath)
        const finalErrorUrl = new URL(errorUrl)
        finalErrorUrl.searchParams.set('error', 'session_creation_failed')
        finalErrorUrl.searchParams.set('error_description', 'Authentication succeeded but session creation failed')

        return NextResponse.redirect(finalErrorUrl)
      }

      // ✅ ADDITIONAL VERIFICATION: Log session details (following Supabase best practices)
      logger.info('✅ Session verification successful', {
        userId: data.user?.id,
        userEmail: data.user?.email,
        provider: data.user?.app_metadata?.provider,
        hasAccessToken: !!data.session.access_token,
        hasRefreshToken: !!data.session.refresh_token,
        sessionExpiresAt: data.session.expires_at,
        tokenType: data.session.token_type
      })

      // Success! Redirect to intended destination using robust URL generation
      logger.info('Auth callback successful', {
        userId: data.user?.id,
        email: data.user?.email,
        provider: data.user?.app_metadata?.provider,
        returnTo
      })

      // ✅ CRITICAL FIX: Add auth_success=true parameter for conservative auth protection
      const successUrl = getAuthRedirectUrl(request, returnTo)
      const finalSuccessUrl = new URL(successUrl)
      finalSuccessUrl.searchParams.set('auth_success', 'true')
      
      logger.info('🔄 OAuth callback redirect URL construction', {
        originalReturnTo: returnTo,
        successUrl,
        finalSuccessUrl: finalSuccessUrl.toString()
      })
      
      const response = NextResponse.redirect(finalSuccessUrl)

      // Set success headers for client-side detection
      response.headers.set('X-Auth-Success', 'true')
      response.headers.set('X-Auth-Provider', data.user?.app_metadata?.provider || 'email')
      
      // ✅ CRITICAL FIX: Add session storage flag for client-side auth detection
      // This ensures our conservative auth logic can detect fresh OAuth logins
      response.headers.set('X-Set-Storage-Flag', 'recent_auth_success=true')
      
      // Clean up temporary OAuth cookie
      response.cookies.delete('oauth-return-to')
      
      // Set app-has-auth cookie for server auth
      response.cookies.set('app-has-auth', 'true', {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7 // 1 week
      })

      return response

    } catch (error) {
      logger.error('🚨 Auth callback error:', error);

      const errorPath = `/${locale}/auth/login`
      const errorUrl = getAuthRedirectUrl(request, errorPath)
      const finalErrorUrl = new URL(errorUrl)
      finalErrorUrl.searchParams.set('error', 'callback_failed')
      finalErrorUrl.searchParams.set('error_description', 'Authentication callback failed')

      return NextResponse.redirect(finalErrorUrl)
    }
  }

  // No code provided - check if this is a recovery flow redirect
  // When Supabase verifies a recovery token, it creates a session and redirects here
  // without a code parameter. We need to detect this and redirect to update-password.
  logger.warn('⚠️ Auth callback with no code - checking for recovery session');

  try {
    const supabase = await createServerSupabaseClientNew()
    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
      // User has a valid session - check if returnTo indicates password update
      const isPasswordRecovery = returnTo.includes('update-password')

      if (isPasswordRecovery) {
        logger.info('✅ Recovery session detected, redirecting to password update', {
          userId: user.id,
          returnTo
        })

        const updatePasswordPath = `/${locale}/auth/update-password`
        const updatePasswordUrl = getAuthRedirectUrl(request, updatePasswordPath)

        const response = NextResponse.redirect(new URL(updatePasswordUrl))

        // Set app-has-auth cookie
        response.cookies.set('app-has-auth', 'true', {
          httpOnly: false,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: 60 * 60 * 24 * 7 // 1 week
        })

        return response
      }

      // User is authenticated but not a recovery flow - redirect to returnTo
      logger.info('✅ Authenticated session found, redirecting to destination', {
        userId: user.id,
        returnTo
      })

      const destinationUrl = getAuthRedirectUrl(request, returnTo)
      const response = NextResponse.redirect(new URL(destinationUrl))

      response.cookies.set('app-has-auth', 'true', {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7
      })

      return response
    }
  } catch (sessionError) {
    logger.error('Session check in callback failed:', sessionError)
  }

  // No session and no code - redirect to login
  const loginPath = `/${locale}/auth/login`
  const loginUrl = getAuthRedirectUrl(request, loginPath)
  const finalLoginUrl = new URL(loginUrl)
  finalLoginUrl.searchParams.set('returnTo', returnTo)

  return NextResponse.redirect(finalLoginUrl)
}
