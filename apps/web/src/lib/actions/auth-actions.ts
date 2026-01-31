/**
 * 🔐 Server-Side Authentication Actions
 * All auth operations go through the server to eliminate CORS issues
 */

'use server'

import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { revalidatePath } from 'next/cache'
import { logger } from '@/utils/logger'
import { OAuthProvider } from '@/types/auth'
import { getClientOAuthCallbackUrl } from '@/lib/auth-utils'
import { cookies } from 'next/headers'
import { FEATURE_FLAGS } from '@/lib/feature-flags'
import { redirectWithLocale } from '@/utils/navigation';

interface AuthResult {
  success: boolean
  error?: string
  code?: string // Error code for specific handling
  data?: any
  tokens?: {
    access_token: string
    refresh_token: string
  }
}

/**
 * 🔐 Password Sign In Server Action (Best Practice)
 * Handles authentication and redirect server-side following Supabase recommendations
 */
export async function signInWithPasswordAndRedirect(formData: FormData) {
  const cookieStore = await cookies() // Call cookies() before Supabase to opt out of caching
  
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const redirectTo = formData.get('redirectTo') as string || '/dashboard'
  const locale = formData.get('locale') as string || 'en'

  try {
    const supabase = await createServerSupabaseClientNew()
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (error) {
      logger.error('Password sign in error:', error)
      // Preserve returnTo parameter in error redirect
      const errorUrl = redirectTo 
        ? `/auth/login?error=${encodeURIComponent(error.message)}&returnTo=${encodeURIComponent(redirectTo)}`
        : `/auth/login?error=${encodeURIComponent(error.message)}`
      redirectWithLocale(errorUrl, locale)
    }

    if (!data.user) {
      // Preserve returnTo parameter in error redirect
      const errorUrl = redirectTo 
        ? `/auth/login?error=Authentication failed&returnTo=${encodeURIComponent(redirectTo)}`
        : '/auth/login?error=Authentication failed'
      redirectWithLocale(errorUrl, locale)
    }

    logger.info('Password sign in successful:', { 
      userId: data.user.id, 
      email: data.user.email 
    })
    
    // Set app-has-auth cookie for server auth
    if (FEATURE_FLAGS.ENABLE_SERVER_AUTH) {
      cookieStore.set('app-has-auth', 'true', {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7 // 1 week
      })
      
      // Set sync flag cookie so client knows to check auth state after redirect
      cookieStore.set('auth-pending-sync', 'true', {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 // 1 minute - just for the redirect
      })
    }

    // Revalidate the layout to update auth state
    revalidatePath('/', 'layout')
    
    // Redirect to dashboard or intended destination
    // Check if redirectTo already contains locale prefix to avoid duplication
    if (redirectTo.startsWith(`/${locale}/`)) {
      // Already has locale prefix, strip it before passing to redirect
      const pathWithoutLocale = redirectTo.substring(`/${locale}`.length) || '/'
      redirectWithLocale(pathWithoutLocale, locale)
    } else {
      // No locale prefix, use as-is
      redirectWithLocale(redirectTo, locale)
    }

  } catch (err) {
    // Handle specific error types
    if (err instanceof Error && err.message.includes('NEXT_REDIRECT')) {
      // This is actually a successful redirect being caught - let it propagate
      throw err
    }
    
    logger.error('Password sign in server action error:', err)
    
    // Better error handling with specific error types
    const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred'
    
    logger.error('Auth error details:', { 
      message: errorMessage, 
      type: typeof err,
      email: email // Safe to log email for debugging
    })
    
    if (errorMessage.includes('Invalid credentials')) {
      // Preserve returnTo parameter in error redirect
      const errorUrl = redirectTo 
        ? `/auth/login?error=Invalid email or password&returnTo=${encodeURIComponent(redirectTo)}`
        : '/auth/login?error=Invalid email or password'
      redirectWithLocale(errorUrl, locale)
    }
    
    // Preserve returnTo parameter in error redirect
    const errorUrl = redirectTo 
      ? `/auth/login?error=${encodeURIComponent(errorMessage)}&returnTo=${encodeURIComponent(redirectTo)}`
      : `/auth/login?error=${encodeURIComponent(errorMessage)}`
    redirectWithLocale(errorUrl, locale)
  }
}

/**
 * 🔐 Password Sign In Server Action (Legacy - for client-side handling)
 * Replaces client-side supabase.auth.signInWithPassword()
 */
export async function signInWithPassword(email: string, password: string): Promise<AuthResult> {
  try {
    const supabase = await createServerSupabaseClientNew()
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (error) {
      logger.error('Password sign in error:', error)
      
      // Handle specific error cases with better UX
      if (error.code === 'email_not_confirmed') {
        return { 
          success: false, 
          error: 'Please verify your email before signing in. Check your inbox or enter the verification code.',
          code: 'email_not_confirmed',
          data: { email }
        }
      }
      
      if (error.code === 'invalid_credentials') {
        return { 
          success: false, 
          error: 'Invalid email or password. Please check your credentials and try again.' 
        }
      }
      
      return { success: false, error: error.message }
    }

    if (!data.user) {
      return { success: false, error: 'Authentication failed' }
    }

    logger.info('Password sign in successful:', { 
      userId: data.user.id, 
      email: data.user.email 
    })
    
    // Set app-has-auth cookie for server auth
    if (FEATURE_FLAGS.ENABLE_SERVER_AUTH) {
      const cookieStore = await cookies()
      cookieStore.set('app-has-auth', 'true', {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7 // 1 week
      })
    }

    // Return tokens for client-side hydration
    return { 
      success: true,
      tokens: {
        access_token: data.session?.access_token || '',
        refresh_token: data.session?.refresh_token || ''
      }
    }

  } catch (err) {
    logger.error('Password sign in server action error:', err)
    return { success: false, error: 'An unexpected error occurred. Please try again.' }
  }
}

/**
 * 🎯 Magic Link Sign In Server Action
 * Replaces client-side supabase.auth.signInWithOtp()
 *
 * NOTE: For best results, update Supabase email template:
 * Change {{ .ConfirmationURL }} to:
 * {{ .SiteURL }}/{{ .Locale }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink&next={{ .RedirectTo }}
 */
export async function signInWithMagicLink(email: string, locale: string, returnTo?: string): Promise<AuthResult> {
  try {
    const supabase = await createServerSupabaseClientNew()

    // Use /auth/confirm route which handles verifyOtp properly
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    const destination = returnTo || '/dashboard'
    const emailRedirectTo = `${siteUrl}/${locale}/auth/confirm?type=magiclink&next=${encodeURIComponent(destination)}`

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo,
        data: {
          locale // Store locale for future use
        }
      }
    })

    if (error) {
      logger.error('Magic link error:', error)
      return { success: false, error: error.message }
    }

    logger.info('Magic link sent:', { locale })
    return { success: true }

  } catch (err) {
    logger.error('Magic link server action error:', err)
    return { success: false, error: 'An unexpected error occurred. Please try again.' }
  }
}

/**
 * 🌐 OAuth Sign In Server Action
 * Replaces client-side supabase.auth.signInWithOAuth()
 */
export async function signInWithOAuth(
  provider: OAuthProvider,
  locale: string, 
  returnTo?: string
): Promise<AuthResult> {
  try {
    const supabase = await createServerSupabaseClientNew()

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: getClientOAuthCallbackUrl(locale, returnTo),
        queryParams: {
          prompt: 'select_account' // Always show account selection
        }
      }
    })

    if (error) {
      logger.error('OAuth error:', error)
      return { success: false, error: error.message }
    }

    if (!data.url) {
      return { success: false, error: 'Failed to generate OAuth URL' }
    }

    // Client will handle the redirect
    logger.info('OAuth login initiated:', { provider })
    return { success: true, data: { url: data.url } }

  } catch (err) {
    logger.error('OAuth server action error:', err)
    return { success: false, error: 'Social login failed. Please try again.' }
  }
}

/**
 * 🚀 Signup Server Action
 * Replaces client-side supabase.auth.signUp()
 *
 * NOTE: For best results, update Supabase email template (Confirm signup):
 * Change {{ .ConfirmationURL }} to:
 * {{ .SiteURL }}/{{ .Locale }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/dashboard
 */
export async function signUp(email: string, password: string, metadata?: { name?: string; plan?: string; locale?: string; returnTo?: string }): Promise<AuthResult> {
  try {
    const supabase = await createServerSupabaseClientNew()

    const locale = metadata?.locale || 'en'
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    const destination = metadata?.returnTo || '/dashboard'
    const emailRedirectTo = `${siteUrl}/${locale}/auth/confirm?type=email&next=${encodeURIComponent(destination)}`

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          ...metadata,
          locale // Store locale in user metadata
        },
        emailRedirectTo
      }
    })

    if (error) {
      logger.error('Signup error:', error)
      return { success: false, error: error.message }
    }

    logger.info('Signup successful:', { locale })
    return { success: true }

  } catch (err) {
    logger.error('Signup server action error:', err)
    return { success: false, error: 'An unexpected error occurred. Please try again.' }
  }
}

/**
 * 🔄 Password Reset Server Action
 * Replaces client-side supabase.auth.resetPasswordForEmail()
 *
 * NOTE: For this to work correctly, the Supabase email template must be configured:
 * Change the Reset Password template's {{ .ConfirmationURL }} to:
 * {{ .SiteURL }}/{{ .Locale }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/auth/update-password
 *
 * Or use the redirectTo which passes to {{ .RedirectTo }} in the template.
 */
export async function resetPassword(email: string, locale: string): Promise<AuthResult> {
  try {
    const supabase = await createServerSupabaseClientNew()

    // Use the /auth/confirm route which handles verifyOtp properly
    // The locale prefix in update-password path will be added by getPostConfirmationRedirectUrl
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    const redirectTo = `${siteUrl}/${locale}/auth/confirm?type=recovery&next=/auth/update-password`

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo
    })

    if (error) {
      logger.error('Password reset error:', error)
      return { success: false, error: error.message }
    }

    logger.info('Password reset email sent:', { locale })
    return { success: true }

  } catch (err) {
    logger.error('Password reset server action error:', err)
    return { success: false, error: 'An unexpected error occurred. Please try again.' }
  }
}

/**
 * 🔑 Update Password Server Action
 * Replaces client-side supabase.auth.updateUser() for password
 */
export async function updatePassword(newPassword: string): Promise<AuthResult> {
  try {
    const supabase = await createServerSupabaseClientNew()
    
    const { error } = await supabase.auth.updateUser({
      password: newPassword
    })

    if (error) {
      logger.error('Password update error:', error)
      return { success: false, error: error.message }
    }

    logger.info('Password updated successfully')
    return { success: true }

  } catch (err) {
    logger.error('Password update server action error:', err)
    return { success: false, error: 'An unexpected error occurred. Please try again.' }
  }
}

/**
 * 🔐 Change Password with Verification Server Action
 * Verifies current password then updates to new password
 */
export async function changePasswordWithVerification(currentPassword: string, newPassword: string): Promise<AuthResult> {
  try {
    const supabase = await createServerSupabaseClientNew()
    
    // Get current user email for verification
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    
    if (userError || !user?.email) {
      return { success: false, error: 'User not authenticated' }
    }

    // Verify current password by attempting sign in
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword
    })

    if (verifyError) {
      logger.error('Current password verification failed:', verifyError)
      return { success: false, error: 'Current password is incorrect' }
    }

    // Current password verified, update to new password
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword
    })

    if (updateError) {
      logger.error('Password update error:', updateError)
      return { success: false, error: updateError.message }
    }

    logger.info('Password changed successfully for user:', user.id)
    return { success: true }

  } catch (err) {
    logger.error('Change password server action error:', err)
    return { success: false, error: 'An unexpected error occurred. Please try again.' }
  }
}

/**
 * 📧 Resend Confirmation Email Server Action
 * Resends the email confirmation link for unverified users
 */
export async function resendConfirmationEmail(email: string, locale: string = 'en', returnTo?: string): Promise<AuthResult> {
  try {
    logger.info('📧 Resending confirmation email:', { locale })
    const supabase = await createServerSupabaseClientNew()

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    const destination = returnTo || '/dashboard'
    const emailRedirectTo = `${siteUrl}/${locale}/auth/confirm?type=email&next=${encodeURIComponent(destination)}`

    // Resend confirmation email with the provided locale
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo
      }
    })

    if (error) {
      logger.error('Resend confirmation email error:', error)
      
      // Handle specific error cases
      if (error.message.includes('Email rate limit exceeded')) {
        return { 
          success: false, 
          error: 'Too many requests. Please wait a few minutes before trying again.' 
        }
      }
      
      if (error.message.includes('User not found')) {
        return { 
          success: false, 
          error: 'No account found with this email address.' 
        }
      }
      
      return { success: false, error: error.message }
    }

    logger.info('Confirmation email resent')
    return { success: true }

  } catch (err) {
    logger.error('Resend confirmation email server action error:', err)
    return { success: false, error: 'An unexpected error occurred. Please try again.' }
  }
}

/**
 * 📧 Verify Email Code Server Action
 * Verifies the 6-digit code from email
 */
export async function verifyEmailCode(email: string, code: string, type: 'signup' | 'email_change' | 'recovery' = 'signup'): Promise<AuthResult> {
  try {
    const supabase = await createServerSupabaseClientNew()
    
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: code,
      type
    })

    if (error) {
      logger.error('Email code verification error:', error)
      
      if (error.message.includes('expired')) {
        return { success: false, error: 'Verification code has expired. Please request a new one.' }
      }
      
      if (error.message.includes('invalid')) {
        return { success: false, error: 'Invalid verification code. Please check and try again.' }
      }
      
      return { success: false, error: error.message }
    }

    if (!data.user) {
      return { success: false, error: 'Verification failed' }
    }

    logger.info('Email code verification successful:', { 
      userId: data.user.id, 
      email: data.user.email 
    })
    
    // Set app-has-auth cookie for server auth
    if (FEATURE_FLAGS.ENABLE_SERVER_AUTH) {
      const cookieStore = await cookies()
      cookieStore.set('app-has-auth', 'true', {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7 // 1 week
      })
    }

    // Return tokens for client-side hydration
    return { 
      success: true,
      tokens: {
        access_token: data.session?.access_token || '',
        refresh_token: data.session?.refresh_token || ''
      }
    }

  } catch (err) {
    logger.error('Email code verification server action error:', err)
    return { success: false, error: 'An unexpected error occurred. Please try again.' }
  }
}

/**
 * 🔍 Check if user exists Server Action
 * Safe check that doesn't reveal user existence to public
 */
export async function checkUserExists(email: string): Promise<AuthResult> {
  try {
    // This is a placeholder - in production, you might want to 
    // implement this differently to avoid user enumeration
    logger.info('User existence check requested')
    
    // Always return success to prevent user enumeration
    return { 
      success: true, 
      data: { message: 'If an account exists, you will receive an email.' } 
    }

  } catch (err) {
    logger.error('Check user exists error:', err)
    return { success: false, error: 'An unexpected error occurred.' }
  }
}

/**
 * 🚪 Sign Out Server Action
 * Replaces client-side supabase.auth.signOut()
 */
export async function signOut(): Promise<void> {
  const supabase = await createServerSupabaseClientNew()
  
  const { error } = await supabase.auth.signOut()
  
  if (error) {
    logger.error('Sign out error:', error)
  }
  
  // Clear app-has-auth cookie
  if (FEATURE_FLAGS.ENABLE_SERVER_AUTH) {
    const cookieStore = await cookies()
    cookieStore.delete('app-has-auth')
  }
  
  // Note: This redirect might not work as expected in all contexts
  // Consider returning success/error and handling redirect in client
  redirectWithLocale('/', 'en')
}

/**
 * 🔄 Send Magic Link Server Action
 * Alias for signInWithMagicLink for backward compatibility
 */
export async function sendMagicLink(email: string, locale: string = 'en', returnTo?: string): Promise<AuthResult> {
  return signInWithMagicLink(email, locale, returnTo)
}

/**
 * 📧 Change Email Server Action
 * Changes user's email address
 */
export async function changeEmail(newEmail: string): Promise<AuthResult> {
  try {
    const supabase = await createServerSupabaseClientNew()
    
    const { error } = await supabase.auth.updateUser({
      email: newEmail
    })

    if (error) {
      logger.error('Email change error:', error)
      return { success: false, error: error.message }
    }

    logger.info('Email change initiated for new email')
    return { success: true }

  } catch (err) {
    logger.error('Change email server action error:', err)
    return { success: false, error: 'An unexpected error occurred. Please try again.' }
  }
}

/**
 * 🔍 Check Session Server Action
 * Checks if current session is valid
 */
export async function checkSession(): Promise<AuthResult> {
  try {
    const supabase = await createServerSupabaseClientNew()
    
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error) {
      return { success: false, error: error.message }
    }

    return { 
      success: true, 
      data: { 
        user,
        isAuthenticated: !!user
      } 
    }

  } catch (err) {
    logger.error('Check session error:', err)
    return { success: false, error: 'Session check failed' }
  }
}