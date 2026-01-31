/**
 * 🔐 Premium Login Page
 * Elegant sign-in experience with social options
 */

import { LoginForm } from '@/components/auth/login-form'
import { AuthLayout } from '@/components/auth/auth-layout'
import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getNamespacedMessages } from '@/i18n/request'

export const metadata: Metadata = {
  title: 'Sign In - SheenApps',
  description: 'Sign in to your SheenApps account and continue building amazing websites.',
}

interface LoginPageProps {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ 
    returnTo?: string
    redirect?: string
    reason?: 'auth_required' | 'session_expired' | 'signup_success' | 'invalid_credentials' | 'oauth_callback_failed' | 'oauth_start_failed' | 'invalid_provider' | 'check_email'
    email?: string
    error?: string
    error_description?: string
  }>
}

export default async function LoginPage({ params, searchParams }: LoginPageProps) {
  const { locale } = await params
  const { returnTo, redirect, reason, email, error, error_description } = await searchParams

  // Load only the namespaces this page needs
  const messages = await getNamespacedMessages(locale, [
    'auth',
    'common',
    'errors'
  ])
  
  
  if (!messages || !messages.auth) {
    console.error('LoginPage - Missing auth translations, messages:', messages)
    notFound()
  }

  // Map translations to component props
  const translations = {
    login: {
      title: messages.auth.login.title,
      subtitle: messages.auth.login.subtitle,
      emailLabel: messages.auth.login.emailLabel,
      emailPlaceholder: messages.auth.login.emailPlaceholder,
      passwordLabel: messages.auth.login.passwordLabel,
      passwordPlaceholder: messages.auth.login.passwordPlaceholder,
      forgotPassword: messages.auth.login.forgotPassword,
      signInButton: messages.auth.login.signInButton,
      signingIn: messages.auth.login.signingIn,
      magicLinkButton: messages.auth.login.magicLinkButton,
      noAccount: messages.auth.login.noAccount,
      createAccount: messages.auth.login.createAccount,
      continueWithGithub: messages.auth.login.continueWithGithub,
      continueWithGoogle: messages.auth.login.continueWithGoogle,
      orContinueWithEmail: messages.auth.login.orContinueWithEmail,
    },
    reasons: {
      authRequired: messages.auth.reasons.authRequired,
      sessionExpired: messages.auth.reasons.sessionExpired,
      signupSuccess: messages.auth.reasons.signupSuccess,
      invalidCredentials: messages.auth.reasons.invalidCredentials || 'Invalid email or password',
      oauthCallbackFailed: messages.auth.reasons.oauthCallbackFailed || 'OAuth authentication failed',
      oauthStartFailed: messages.auth.reasons.oauthStartFailed || 'Failed to start OAuth flow',
      invalidProvider: messages.auth.reasons.invalidProvider || 'Invalid authentication provider',
      checkEmail: messages.auth.reasons.checkEmail || 'Please check your email for confirmation',
    },
    validation: {
      bothRequired: messages.auth.validation.bothRequired,
    },
    errors: {
      invalidCredentials: messages.auth.errors.invalidCredentials,
      emailNotConfirmed: messages.auth.errors.emailNotConfirmed,
      socialLoginFailed: messages.auth.errors.socialLoginFailed,
      unexpectedError: messages.auth.errors.unexpectedError,
    }
  };

  return (
    <AuthLayout
      title={translations.login.title}
      subtitle={translations.login.subtitle}
      locale={locale}
      commonTranslations={messages?.common ? { authLayout: messages.common.authLayout } : undefined}
    >
      <LoginForm 
        returnTo={returnTo || redirect}
        reason={reason}
        prefillEmail={email}
        locale={locale}
        translations={translations}
        error={error}
        errorDescription={error_description}
      />
    </AuthLayout>
  )
}