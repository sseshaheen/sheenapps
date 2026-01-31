/**
 * 🪄 Magic Link Authentication Form
 * Passwordless authentication with email verification
 */

'use client'

import { useState } from 'react'
import { m, AnimatePresence } from '@/components/ui/motion-provider'
import { Link } from '@/i18n/routing'
import { sendMagicLink } from '@/lib/actions/auth-actions'
import Icon from '@/components/ui/icon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { logger } from '@/utils/logger';

interface MagicLinkFormProps {
  returnTo?: string
  locale: string
  translations?: any
}

export function MagicLinkForm({ returnTo, locale, translations }: MagicLinkFormProps) {
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [error, setError] = useState('')

  // Fallback translations
  const t = translations || {
    form: {
      title: 'Sign in with Magic Link',
      subtitle: 'Enter your email and we\'ll send you a secure sign-in link',
      emailLabel: 'Email Address',
      emailPlaceholder: 'Enter your email',
      submitButton: 'Send magic link',
      submitting: 'Sending magic link...'
    },
    success: {
      title: 'Magic link sent!',
      message: 'We\'ve sent a secure login link to',
      instructions: 'Click the link in your email to sign in instantly. No password required!',
      sendAnother: 'Send another link'
    },
    benefits: {
      noPassword: 'No password required',
      moreSecure: 'More secure than traditional login',
      anyDevice: 'Works from any device'
    },
    backToLogin: {
      text: 'Prefer a password?',
      link: 'Sign in traditionally'
    },
    validation: {
      emailRequired: 'Please enter your email address'
    },
    errors: {
      sendFailed: 'Failed to send magic link',
      unexpectedError: 'An unexpected error occurred. Please try again.'
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!email) {
      setError(t.validation?.emailRequired || 'Please enter your email address')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const result = await sendMagicLink(email, locale, returnTo)

      if (!result.success) {
        setError(result.error || t.errors?.sendFailed || 'Failed to send magic link')
        return
      }

      // Success! Show confirmation
      setIsSuccess(true)

    } catch (err) {
      logger.error('Magic link error:', err);
      setError(t.errors?.unexpectedError || 'An unexpected error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  if (isSuccess) {
    return (
      <m.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center space-y-6"
      >
        <div className="w-16 h-16 mx-auto bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
          <Icon name="sparkles" className="w-8 h-8 text-blue-600 dark:text-blue-400"  />
        </div>
        
        <div>
          <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
            {t.success?.title || 'Magic link sent!'}
          </h3>
          <p className="text-slate-600 dark:text-slate-300">
            {t.success?.message || 'We\'ve sent a secure login link to'} <br />
            <bdi className="font-medium">
              <span dir="ltr">{email}</span>
            </bdi>
          </p>
        </div>

        <div className="space-y-4">
          <p className="text-sm text-slate-500 dark:text-slate-300">
            {t.success?.instructions || 'Click the link in your email to sign in instantly. No password required!'}
          </p>

          <Button
            variant="outline"
            onClick={() => setIsSuccess(false)}
            className="w-full"
          >
            {t.success?.sendAnother || 'Send another link'}
          </Button>
        </div>
      </m.div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <div className="w-12 h-12 mx-auto bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
          <Icon name="sparkles" className="w-6 h-6 text-white"  />
        </div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
          {t.form?.title || 'Sign in with Magic Link'}
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {t.form?.subtitle || 'Enter your email and we\'ll send you a secure sign-in link'}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Email Field */}
        <div className="space-y-2">
          <Label htmlFor="email">{t.form?.emailLabel || 'Email Address'}</Label>
          <div className="relative">
            <Input
              id="email"
              type="email"
              placeholder={t.form?.emailPlaceholder || 'Enter your email'}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setError('')
              }}
              className="ltr:pl-10 rtl:pr-10"
              disabled={isLoading}
              autoComplete="email"
            />
            <Icon name="mail" className="w-4 h-4 absolute ltr:left-3 rtl:right-3 top-1/2 transform -translate-y-1/2 text-slate-400"  />
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
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </m.div>
          )}
        </AnimatePresence>

        {/* Submit Button */}
        <Button
          type="submit"
          className="w-full"
          disabled={!email || isLoading}
        >
          {isLoading ? (
            <Icon name="loader-2" className="w-4 h-4 me-2 animate-spin"  />
          ) : (
            <Icon name="sparkles" className="w-4 h-4 me-2"  />
          )}
          {isLoading ? (t.form?.submitting || 'Sending magic link...') : (t.form?.submitButton || 'Send magic link')}
          {!isLoading && (
            <>
              <Icon name="arrow-right" className="w-4 h-4 ms-2 ltr:block rtl:hidden"  />
              <Icon name="arrow-left" className="w-4 h-4 ms-2 rtl:block ltr:hidden"  />
            </>
          )}
        </Button>

        {/* Benefits */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <Icon name="check-circle" className="w-4 h-4 text-green-500 flex-shrink-0"  />
            <span>{t.benefits?.noPassword || 'No password required'}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <Icon name="check-circle" className="w-4 h-4 text-green-500 flex-shrink-0"  />
            <span>{t.benefits?.moreSecure || 'More secure than traditional login'}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <Icon name="check-circle" className="w-4 h-4 text-green-500 flex-shrink-0"  />
            <span>{t.benefits?.anyDevice || 'Works from any device'}</span>
          </div>
        </div>
      </form>

      {/* Back to Login */}
      <div className="text-center pt-4 border-t border-slate-200 dark:border-slate-700">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {t.backToLogin?.text || 'Prefer a password?'}{' '}
          <Link
            href={`/auth/login${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`}
            className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
          >
            {t.backToLogin?.link || 'Sign in traditionally'}
          </Link>
        </p>
      </div>
    </div>
  )
}