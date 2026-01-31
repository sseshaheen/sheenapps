import { type EmailOtpType } from '@supabase/auth-js'
import { type NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { logger } from '@/utils/logger'
import { FEATURE_FLAGS } from '@/lib/feature-flags'
import { cookies } from 'next/headers'
import { 
  validateEmailConfirmationParams, 
  handleEmailConfirmationError,
  getPostConfirmationRedirectUrl 
} from '@/lib/email-confirmation-helper'

export async function GET(request: NextRequest) {
  const { searchParams, pathname } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = searchParams.get('next')
  
  // Extract locale from the URL path (e.g., /ar-sa/auth/confirm -> ar-sa)
  const pathSegments = pathname.split('/')
  const locale = pathSegments[1] || 'en' // First segment after the initial slash
  
  // Validate parameters
  const validation = validateEmailConfirmationParams({ token_hash, type })
  if (!validation.isValid) {
    logger.error('Invalid email confirmation parameters:', validation.error)
    const errorUrl = new URL(`/${locale}/auth/login`, process.env.NEXT_PUBLIC_SITE_URL || request.url)
    errorUrl.searchParams.set('error', 'invalid_confirmation_link')
    errorUrl.searchParams.set('error_description', validation.error || 'Invalid confirmation link')
    return NextResponse.redirect(errorUrl)
  }

  // Handle the verification
  if (token_hash && type) {
    try {
      const supabase = await createServerSupabaseClientNew()
      
      // Verify the OTP token
      const { data, error } = await supabase.auth.verifyOtp({
        type,
        token_hash,
      })
      
      if (error) {
        const { error: errorCode, error_description } = handleEmailConfirmationError(error)
        const errorUrl = new URL(`/${locale}/auth/login`, process.env.NEXT_PUBLIC_SITE_URL || request.url)
        errorUrl.searchParams.set('error', errorCode)
        errorUrl.searchParams.set('error_description', error_description)
        
        // If we have the user's email from the verification attempt, pass it along
        // This helps pre-fill the resend confirmation form
        const userEmail = data?.user?.email
        if (userEmail) {
          errorUrl.searchParams.set('email', userEmail)
        }
        
        return NextResponse.redirect(errorUrl)
      }
      
      logger.info('Email verification successful:', {
        userId: data.user?.id,
        email: data.user?.email
      })
      
      // Create response with redirect
      const redirectUrl = getPostConfirmationRedirectUrl(locale, next)
      const response = NextResponse.redirect(new URL(redirectUrl))
      
      // Set app-has-auth cookie for server auth
      if (FEATURE_FLAGS.ENABLE_SERVER_AUTH) {
        response.cookies.set('app-has-auth', 'true', {
          httpOnly: false,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: 60 * 60 * 24 * 7 // 1 week
        })
      }
      
      // For non-server auth, ensure Supabase cookies are set
      if (!FEATURE_FLAGS.ENABLE_SERVER_AUTH && data.session) {
        // The session cookies should already be set by verifyOtp
        // but we can ensure they're properly configured
        const cookieStore = await cookies()
        const supabaseCookies = cookieStore.getAll().filter(cookie => 
          cookie.name.startsWith('sb-')
        )
        
        // Forward any Supabase cookies to the response
        supabaseCookies.forEach(cookie => {
          response.cookies.set(cookie.name, cookie.value, {
            ...cookie,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/'
          })
        })
      }
      
      return response
      
    } catch (error) {
      const { error: errorCode, error_description } = handleEmailConfirmationError(error)
      const errorUrl = new URL(`/${locale}/auth/login`, process.env.NEXT_PUBLIC_SITE_URL || request.url)
      errorUrl.searchParams.set('error', errorCode)
      errorUrl.searchParams.set('error_description', error_description)
      return NextResponse.redirect(errorUrl)
    }
  }
  
  // This should not be reached due to validation above
  const errorUrl = new URL(`/${locale}/auth/login`, process.env.NEXT_PUBLIC_SITE_URL || request.url)
  errorUrl.searchParams.set('error', 'invalid_confirmation_link')
  errorUrl.searchParams.set('error_description', 'Missing confirmation parameters')
  return NextResponse.redirect(errorUrl)
}