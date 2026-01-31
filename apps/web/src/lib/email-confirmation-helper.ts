/**
 * Email Confirmation Helper
 * Provides utilities for handling email verification flows
 */

import { logger } from '@/utils/logger'

interface EmailConfirmationConfig {
  siteUrl: string
  defaultLocale: string
}

/**
 * Get the email confirmation URL for Supabase email templates
 */
export function getEmailConfirmationUrl(config?: Partial<EmailConfirmationConfig>) {
  const siteUrl = config?.siteUrl || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  return `${siteUrl}/auth/confirm`
}

/**
 * Get redirect URL after successful email confirmation
 */
export function getPostConfirmationRedirectUrl(
  locale: string = 'en',
  returnTo?: string,
  config?: Partial<EmailConfirmationConfig>
) {
  const siteUrl = config?.siteUrl || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const defaultRedirect = `/${locale}/dashboard`

  if (!returnTo) {
    return `${siteUrl}${defaultRedirect}`
  }

  // Ensure redirect is relative to prevent open redirect vulnerability
  if (!returnTo.startsWith('/')) {
    return `${siteUrl}${defaultRedirect}`
  }

  // If returnTo doesn't have a locale prefix, add it
  // Check if it starts with a known locale pattern (e.g., /en/, /ar/, /fr/, etc.)
  const localePattern = /^\/(en|ar|ar-eg|ar-sa|ar-ae|fr|fr-ma|es|de)\//
  const hasLocale = localePattern.test(returnTo)

  if (hasLocale) {
    return `${siteUrl}${returnTo}`
  }

  // Prepend locale to the path
  return `${siteUrl}/${locale}${returnTo}`
}

/**
 * Handle email confirmation errors
 */
export function handleEmailConfirmationError(error: any) {
  logger.error('Email confirmation error:', error)
  
  const errorMap: Record<string, string> = {
    'otp_expired': 'The confirmation link has expired. Please request a new one.',
    'invalid_token': 'The confirmation link is invalid. Please request a new one.',
    'user_already_exists': 'This email is already confirmed.',
    'token_has_expired': 'The confirmation link has expired. Please request a new one.',
    'invalid_request': 'The confirmation link is invalid. Please request a new one.',
  }
  
  // Check both error.code and error.message for known patterns
  let errorMessage = 'Email confirmation failed. Please try again.'
  
  if (error?.code && errorMap[error.code]) {
    errorMessage = errorMap[error.code]
  } else if (error?.message) {
    // Check message content for known patterns
    if (error.message.toLowerCase().includes('expired')) {
      errorMessage = 'The confirmation link has expired. Please request a new one.'
    } else if (error.message.toLowerCase().includes('invalid')) {
      errorMessage = 'The confirmation link is invalid. Please request a new one.'
    } else {
      errorMessage = error.message
    }
  }
    
  return {
    error: error?.code || 'confirmation_error',
    error_description: errorMessage
  }
}

/**
 * Validate email confirmation parameters
 */
export function validateEmailConfirmationParams(params: {
  token_hash?: string | null
  type?: string | null
}): { isValid: boolean; error?: string } {
  if (!params.token_hash) {
    return { 
      isValid: false, 
      error: 'Missing confirmation token' 
    }
  }
  
  if (!params.type) {
    return { 
      isValid: false, 
      error: 'Missing confirmation type' 
    }
  }
  
  const validTypes = ['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email']
  if (!validTypes.includes(params.type)) {
    return { 
      isValid: false, 
      error: 'Invalid confirmation type' 
    }
  }
  
  return { isValid: true }
}

/**
 * Get instructions for email confirmation setup
 *
 * These templates use the /auth/confirm route which handles verifyOtp server-side.
 * The `next` parameter specifies where to redirect after successful verification.
 *
 * IMPORTANT: Update these templates in Supabase Dashboard → Authentication → Email Templates
 *
 * Locale handling:
 * - {{ .Data.locale | default "en" }} pulls locale from user metadata (set during signup/login)
 * - This requires storing locale in user metadata when calling auth methods
 */
export function getEmailTemplateInstructions() {
  // Use {{ .Data.locale | default "en" }} for dynamic locale from user metadata
  const localeVar = '{{ .Data.locale | default "en" }}'

  return {
    confirmSignup: {
      template: 'Confirm signup',
      instruction: `{{ .SiteURL }}/${localeVar}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/dashboard`,
      description: 'Redirects to dashboard after email confirmation'
    },
    inviteUser: {
      template: 'Invite user',
      instruction: `{{ .SiteURL }}/${localeVar}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/dashboard`,
      description: 'Redirects to dashboard after accepting invite'
    },
    magicLink: {
      template: 'Magic Link',
      instruction: `{{ .SiteURL }}/${localeVar}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink&next=/dashboard`,
      description: 'Redirects to dashboard after magic link login'
    },
    changeEmailAddress: {
      template: 'Change Email Address',
      instruction: `{{ .SiteURL }}/${localeVar}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change&next=/settings`,
      description: 'Redirects to settings after email change confirmation'
    },
    resetPassword: {
      template: 'Reset Password',
      instruction: `{{ .SiteURL }}/${localeVar}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/auth/update-password`,
      description: 'Redirects to password update form after token verification'
    }
  }
}

/**
 * Get a formatted guide for updating Supabase email templates
 */
export function getEmailTemplateGuide(): string {
  const instructions = getEmailTemplateInstructions()

  return `
# Supabase Email Template Configuration

Go to: Supabase Dashboard → Authentication → Email Templates

For each template, replace {{ .ConfirmationURL }} with the URL below.

The locale is pulled dynamically from user metadata via {{ .Data.locale | default "en" }}.
This requires storing locale in user metadata when calling signUp, signInWithOtp, etc.

## 1. Confirm signup
${instructions.confirmSignup.instruction}

## 2. Invite user
${instructions.inviteUser.instruction}

## 3. Magic Link
${instructions.magicLink.instruction}

## 4. Change Email Address
${instructions.changeEmailAddress.instruction}

## 5. Reset Password
${instructions.resetPassword.instruction}
`.trim()
}