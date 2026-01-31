'use client'

import { useState } from 'react'
import { Link } from '@/i18n/routing'
import { m, AnimatePresence } from '@/components/ui/motion-provider'
import Icon from '@/components/ui/icon'
import { resetPassword } from '@/lib/actions/auth-actions'
import { logger } from '@/utils/logger'

interface PasswordResetFormProps {
  translations: {
    reset: {
      title: string
      subtitle: string
      emailLabel: string
      emailPlaceholder: string
      submitButton: string
      submitting: string
      backToLogin: string
      checkEmail: string
      emailSent: string
      errorTitle: string
      tryAgain: string
      errors: {
        invalidEmail: string
        userNotFound: string
        rateLimited: string
        generic: string
      }
    }
    common: {
      email: string
      or: string
      loading: string
    }
  }
  locale: string
  defaultEmail?: string
}

export function PasswordResetForm({ translations, locale, defaultEmail }: PasswordResetFormProps) {
  const [email, setEmail] = useState(defaultEmail || '')
  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      const result = await resetPassword(email, locale)

      if (!result.success) {
        logger.error('Password reset error:', result.error)
        
        // Map server action errors to user-friendly messages
        const errorMessage = result.error || ''
        if (errorMessage.includes('rate')) {
          setError(translations.reset.errors.rateLimited)
        } else if (errorMessage.includes('not found')) {
          setError(translations.reset.errors.userNotFound)
        } else {
          setError(translations.reset.errors.generic)
        }
      } else {
        setIsSuccess(true)
      }
    } catch (err) {
      logger.error('Password reset error:', err)
      setError(translations.reset.errors.generic)
    } finally {
      setIsLoading(false)
    }
  }

  // Show success state
  if (isSuccess) {
    return (
      <m.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md mx-auto text-center"
      >
        <div className="mb-6">
          <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
            <Icon name="check-circle" className="w-8 h-8 text-green-600"  />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            {translations.reset.checkEmail}
          </h2>
          <p className="text-gray-600">
            {translations.reset.emailSent}
          </p>
        </div>

        <Link
          href="/auth/login"
          className="inline-flex items-center text-sm text-purple-600 hover:text-purple-700"
        >
          <Icon name="arrow-left" className="w-4 h-4 mr-1"  />
          {translations.reset.backToLogin}
        </Link>
      </m.div>
    )
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">
          {translations.reset.title}
        </h2>
        <p className="text-gray-600">
          {translations.reset.subtitle}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            {translations.reset.emailLabel}
          </label>
          <div className="relative">
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={translations.reset.emailPlaceholder}
              className="w-full px-4 py-3 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              required
              disabled={isLoading}
              autoComplete="email"
            />
            <Icon name="mail" className="absolute left-3 top-3.5 h-5 w-5 text-gray-400"  />
          </div>
        </div>

        <AnimatePresence mode="wait">
          {error && (
            <m.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-red-50 border border-red-200 rounded-lg p-4"
            >
              <div className="flex items-start">
                <Icon name="alert-circle" className="w-5 h-5 text-red-600 mr-2 flex-shrink-0 mt-0.5"  />
                <div className="flex-1">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              </div>
            </m.div>
          )}
        </AnimatePresence>

        <button
          type="submit"
          disabled={isLoading || !email}
          className={`
            w-full py-3 px-4 rounded-lg font-medium transition-all duration-200
            ${isLoading || !email
              ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
              : 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]'
            }
          `}
        >
          {isLoading ? (
            <span className="flex items-center justify-center">
              <m.span
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full mr-2"
              />
              {translations.reset.submitting}
            </span>
          ) : (
            translations.reset.submitButton
          )}
        </button>

        <div className="text-center">
          <Link
            href="/auth/login"
            className="text-sm text-purple-600 hover:text-purple-700"
          >
            {translations.reset.backToLogin}
          </Link>
        </div>
      </form>
    </div>
  )
}