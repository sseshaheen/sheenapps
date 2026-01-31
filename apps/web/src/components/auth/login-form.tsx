/**
 * 🔐 Premium Login Form
 * Elegant sign-in form with social options and smart features
 */

'use client'

import Icon from '@/components/ui/icon'
import { AnimatePresence, m } from '@/components/ui/motion-provider'
import { signInWithOAuth } from '@/lib/actions/auth-actions'
import { useAuthStore } from '@/store'
import { Link, useRouter } from '@/i18n/routing'
import { useSearchParams } from 'next/navigation'
import { useState, useEffect } from 'react'









import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { logger } from '@/utils/logger'

interface LoginFormProps {
  returnTo?: string
  reason?: 'auth_required' | 'session_expired' | 'signup_success' | 'invalid_credentials' | 'oauth_callback_failed' | 'oauth_start_failed' | 'invalid_provider' | 'check_email'
  prefillEmail?: string
  locale: string
  error?: string
  errorDescription?: string
  translations: {
    login: {
      title: string
      subtitle: string
      emailLabel: string
      emailPlaceholder: string
      passwordLabel: string
      passwordPlaceholder: string
      forgotPassword: string
      signInButton: string
      signingIn: string
      magicLinkButton: string
      noAccount: string
      createAccount: string
      continueWithGithub: string
      continueWithGoogle: string
      orContinueWithEmail: string
    }
    reasons: {
      authRequired: string
      sessionExpired: string
      signupSuccess: string
      invalidCredentials: string
      oauthCallbackFailed: string
      oauthStartFailed: string
      invalidProvider: string
      checkEmail: string
    }
    validation: {
      bothRequired: string
    }
    errors: {
      invalidCredentials: string
      emailNotConfirmed: string
      socialLoginFailed: string
      unexpectedError: string
    }
  }
}

export function LoginForm({ returnTo, reason, prefillEmail, locale, error: initialError, errorDescription, translations }: LoginFormProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { login: _login } = useAuthStore() // Renamed to avoid unused variable warning

  const [formData, setFormData] = useState({
    email: prefillEmail || '',
    password: ''
  })

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  // Set initial error from URL params if present
  useEffect(() => {
    if (initialError) {
      if (initialError === 'verification_failed') {
        setError(errorDescription || translations.errors.emailNotConfirmed)
      } else if (initialError === 'confirmation_error' || initialError === 'invalid_confirmation_link') {
        setError(errorDescription || translations.errors.unexpectedError)
      } else {
        setError(errorDescription || initialError)
      }
    }
  }, [initialError, errorDescription, translations.errors])

  // Handle errors from URL parameters (from server action redirects)
  useEffect(() => {
    const urlError = searchParams.get('error')
    if (urlError) {
      setError(decodeURIComponent(urlError))
    }
  }, [searchParams])

  const getReasonMessage = () => {
    switch (reason) {
      case 'auth_required':
        return {
          icon: 'alert-circle',
          message: translations.reasons.authRequired,
          type: 'warning' as const
        }
      case 'session_expired':
        return {
          icon: 'alert-circle',
          message: translations.reasons.sessionExpired,
          type: 'warning' as const
        }
      case 'signup_success':
        return {
          icon: 'check-circle',
          message: translations.reasons.signupSuccess,
          type: 'success' as const
        }
      case 'invalid_credentials':
        return {
          icon: 'alert-circle',
          message: translations.reasons.invalidCredentials,
          type: 'error' as const
        }
      case 'oauth_callback_failed':
        return {
          icon: 'alert-circle',
          message: translations.reasons.oauthCallbackFailed,
          type: 'error' as const
        }
      case 'oauth_start_failed':
        return {
          icon: 'alert-circle',
          message: translations.reasons.oauthStartFailed,
          type: 'error' as const
        }
      case 'invalid_provider':
        return {
          icon: 'alert-circle',
          message: translations.reasons.invalidProvider,
          type: 'error' as const
        }
      case 'check_email':
        return {
          icon: 'mail',
          message: translations.reasons.checkEmail,
          type: 'info' as const
        }
      default:
        return null
    }
  }

  const reasonInfo = getReasonMessage()


  const handleSocialLogin = (provider: 'github' | 'google') => {
    // EXPERT SOLUTION: Direct redirect to OAuth route handler for proper SSR cookie handling
    const oauthUrl = new URL('/api/auth/oauth/start', window.location.origin)
    oauthUrl.searchParams.set('provider', provider)
    oauthUrl.searchParams.set('locale', locale)
    oauthUrl.searchParams.set('returnTo', returnTo || `/${locale}/dashboard`)
    
    window.location.href = oauthUrl.toString()
  }

  return (
    <div className="space-y-6">
      {/* Reason Message */}
      <AnimatePresence>
        {reasonInfo && (
          <m.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className={`p-3 rounded-lg border ${
              reasonInfo.type === 'success'
                ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                : reasonInfo.type === 'error'
                ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                : reasonInfo.type === 'info'
                ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
              }`}
          >
            <div className="flex items-center space-x-2">
              <Icon name={reasonInfo.icon as any} className={`w-4 h-4 ${
                reasonInfo.type === 'success' ? 'text-green-600' :
                reasonInfo.type === 'error' ? 'text-red-600' :
                reasonInfo.type === 'info' ? 'text-blue-600' :
                'text-amber-600'
                }`} />
              <p className={`text-sm ${
                reasonInfo.type === 'success'
                  ? 'text-green-700 dark:text-green-300'
                  : reasonInfo.type === 'error'
                  ? 'text-red-700 dark:text-red-300'
                  : reasonInfo.type === 'info'
                  ? 'text-blue-700 dark:text-blue-300'
                  : 'text-amber-700 dark:text-amber-300'
                }`}>
                {reasonInfo.message}
              </p>
            </div>
          </m.div>
        )}
      </AnimatePresence>

      {/* Social Login */}
      <div className="space-y-3">
        <Button
          onClick={() => handleSocialLogin('github')}
          variant="outline"
          className="w-full"
          disabled={isLoading}
        >
          <Icon name="github" className="w-4 h-4 me-2" />
          {translations.login.continueWithGithub}
        </Button>

        <Button
          onClick={() => handleSocialLogin('google')}
          variant="outline"
          className="w-full"
          disabled={isLoading}
        >
          <Icon name="mail" className="w-4 h-4 me-2" />
          {translations.login.continueWithGoogle}
        </Button>
      </div>

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-300 dark:border-slate-600" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-white dark:bg-slate-800 px-2 text-slate-500 dark:text-slate-300">
            {translations.login.orContinueWithEmail}
          </span>
        </div>
      </div>

      {/* Form - Server Action (Best Practice) */}
      {/* EXPERT SOLUTION: HTML POST to route handler for proper SSR cookie handling */}
      <form action="/api/auth/sign-in" method="POST" className="space-y-4">
        <input type="hidden" name="returnTo" value={returnTo || `/${locale}/dashboard`} />
        <input type="hidden" name="locale" value={locale} />
        
        {/* Email Field */}
        <div className="space-y-2">
          <Label htmlFor="email">{translations.login.emailLabel}</Label>
          <div className="relative">
            <Input
              id="email"
              name="email"
              type="email"
              placeholder={translations.login.emailPlaceholder}
              defaultValue={formData.email}
              className="ltr:pl-10 rtl:pr-10"
              disabled={isLoading}
              autoComplete="email"
              required
            />
            <Icon name="mail" className="w-4 h-4 absolute ltr:left-3 rtl:right-3 top-1/2 transform -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          </div>
        </div>

        {/* Password Field */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">{translations.login.passwordLabel}</Label>
            <Link
              href={`/auth/reset${formData.email ? `?email=${encodeURIComponent(formData.email)}` : ''}`}
              className="text-xs text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
              prefetch={false}
            >
              {translations.login.forgotPassword}
            </Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type="password"
              placeholder={translations.login.passwordPlaceholder}
              className="ltr:pl-10 ltr:pr-10 rtl:pr-10 rtl:pl-10"
              disabled={isLoading}
              autoComplete="current-password"
              required
            />
            <Icon name="lock" className="w-4 h-4 absolute ltr:left-3 rtl:right-3 top-1/2 transform -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          </div>
        </div>

        {/* Error Message */}
        <AnimatePresence>
          {error && (
            <m.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg"
            >
              <div className="flex items-center space-x-2">
                <Icon name="alert-circle" className="w-4 h-4 text-red-500" />
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            </m.div>
          )}
        </AnimatePresence>

        {/* Submit Button */}
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? translations.login.signingIn : translations.login.signInButton}
        </Button>
      </form>

      {/* Magic Link Option */}
      <div className="text-center">
        <Link
          href={`/auth/magic${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`}
          className="text-sm font-medium text-purple-600 hover:text-purple-500 dark:text-purple-400 dark:hover:text-purple-300 flex items-center justify-center space-x-1"
        >
          <Icon name="sparkles" className="w-4 h-4" />
          <span>{translations.login.magicLinkButton}</span>
        </Link>
      </div>

      {/* Signup Link */}
      <div className="text-center pt-4 border-t border-slate-200 dark:border-slate-700">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {translations.login.noAccount}{' '}
          <Link
            href={`/auth/signup${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`}
            className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
          >
            {translations.login.createAccount}
          </Link>
        </p>
      </div>
    </div>
  )
}
