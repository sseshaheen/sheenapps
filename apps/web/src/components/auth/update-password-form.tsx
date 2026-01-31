'use client'

import { useState, useEffect, Suspense } from 'react'
import { Link, useRouter } from '@/i18n/routing'
import { useSearchParams } from 'next/navigation'
import { m, AnimatePresence } from '@/components/ui/motion-provider'
import Icon from '@/components/ui/icon'
import { updatePassword, checkSession } from '@/lib/actions/auth-actions'
import { logger } from '@/utils/logger'

interface UpdatePasswordFormProps {
  translations: {
    updatePassword: {
      title: string
      subtitle: string
      passwordLabel: string
      passwordPlaceholder: string
      confirmLabel: string
      confirmPlaceholder: string
      submitButton: string
      submitting: string
      success: string
      successMessage: string
      goToLogin: string
      requirements: {
        title: string
        minLength: string
        uppercase: string
        lowercase: string
        number: string
        special: string
      }
      errors: {
        mismatch: string
        weak: string
        invalidToken: string
        generic: string
      }
    }
    common: {
      password: string
      loading: string
    }
  }
  locale: string
}

// Password validation
const validatePassword = (password: string) => {
  return {
    minLength: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /\d/.test(password),
    special: /[!@#$%^&*(),.?":{}|<>]/.test(password)
  }
}

function UpdatePasswordFormInner({ translations, locale }: UpdatePasswordFormProps) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const router = useRouter()
  const searchParams = useSearchParams()
  
  // Check for session on mount - user must have a valid recovery session
  useEffect(() => {
    const checkUserSession = async () => {
      try {
        const result = await checkSession()

        if (!result.success || !result.data?.isAuthenticated) {
          // No session found - redirect to reset page to request a new link
          logger.warn('No valid session for password update, redirecting to reset')
          router.push('/auth/reset')
        }
      } catch (err) {
        logger.error('Session check error:', err)
        router.push('/auth/reset')
      }
    }

    checkUserSession()
  }, [router])

  const passwordValidation = validatePassword(password)
  const isPasswordValid = Object.values(passwordValidation).every(Boolean)
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!isPasswordValid) {
      setError(translations.updatePassword.errors.weak)
      return
    }

    if (!passwordsMatch) {
      setError(translations.updatePassword.errors.mismatch)
      return
    }

    setIsLoading(true)

    try {
      const result = await updatePassword(password)

      if (!result.success) {
        logger.error('Password update error:', result.error)
        
        const errorMessage = result.error || ''
        if (errorMessage.includes('session')) {
          setError(translations.updatePassword.errors.invalidToken)
        } else {
          setError(translations.updatePassword.errors.generic)
        }
      } else {
        setIsSuccess(true)
        // Redirect after a delay
        setTimeout(() => {
          router.push('/builder')
        }, 2000)
      }
    } catch (err) {
      logger.error('Password update error:', err)
      setError(translations.updatePassword.errors.generic)
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
            {translations.updatePassword.success}
          </h2>
          <p className="text-gray-600">
            {translations.updatePassword.successMessage}
          </p>
        </div>

        <Link
          href="/builder"
          className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg font-medium hover:shadow-lg transition-all duration-200"
        >
          {translations.updatePassword.goToLogin}
        </Link>
      </m.div>
    )
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">
          {translations.updatePassword.title}
        </h2>
        <p className="text-gray-600">
          {translations.updatePassword.subtitle}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Password Input */}
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            {translations.updatePassword.passwordLabel}
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={translations.updatePassword.passwordPlaceholder}
              className="w-full px-4 py-3 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              required
              disabled={isLoading}
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-3.5 text-gray-400 hover:text-gray-600"
            >
              {showPassword ? <Icon name="eye-off" className="h-5 w-5"  /> : <Icon name="eye" className="h-5 w-5"  />}
            </button>
          </div>
        </div>

        {/* Password Requirements */}
        {password && (
          <m.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gray-50 rounded-lg p-4"
          >
            <p className="text-sm font-medium text-gray-700 mb-2">
              {translations.updatePassword.requirements.title}
            </p>
            <div className="space-y-1">
              {[
                { key: 'minLength', label: translations.updatePassword.requirements.minLength },
                { key: 'uppercase', label: translations.updatePassword.requirements.uppercase },
                { key: 'lowercase', label: translations.updatePassword.requirements.lowercase },
                { key: 'number', label: translations.updatePassword.requirements.number },
                { key: 'special', label: translations.updatePassword.requirements.special }
              ].map(({ key, label }) => (
                <div key={key} className="flex items-center text-sm">
                  {passwordValidation[key as keyof typeof passwordValidation] ? (
                    <Icon name="check" className="w-4 h-4 text-green-600 mr-2"  />
                  ) : (
                    <Icon name="x" className="w-4 h-4 text-gray-400 mr-2"  />
                  )}
                  <span className={passwordValidation[key as keyof typeof passwordValidation] ? 'text-green-700' : 'text-gray-600'}>
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </m.div>
        )}

        {/* Confirm Password Input */}
        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
            {translations.updatePassword.confirmLabel}
          </label>
          <div className="relative">
            <input
              id="confirmPassword"
              type={showConfirm ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={translations.updatePassword.confirmPlaceholder}
              className={`w-full px-4 py-3 pr-10 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent ${
                confirmPassword && !passwordsMatch ? 'border-red-300' : 'border-gray-300'
              }`}
              required
              disabled={isLoading}
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowConfirm(!showConfirm)}
              className="absolute right-3 top-3.5 text-gray-400 hover:text-gray-600"
            >
              {showConfirm ? <Icon name="eye-off" className="h-5 w-5"  /> : <Icon name="eye" className="h-5 w-5"  />}
            </button>
          </div>
          {confirmPassword && !passwordsMatch && (
            <p className="text-sm text-red-600 mt-1">{translations.updatePassword.errors.mismatch}</p>
          )}
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
          disabled={isLoading || !isPasswordValid || !passwordsMatch}
          className={`
            w-full py-3 px-4 rounded-lg font-medium transition-all duration-200
            ${isLoading || !isPasswordValid || !passwordsMatch
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
              {translations.updatePassword.submitting}
            </span>
          ) : (
            translations.updatePassword.submitButton
          )}
        </button>
      </form>
    </div>
  )
}

export function UpdatePasswordForm(props: UpdatePasswordFormProps) {
  return (
    <Suspense fallback={
      <div className="w-full max-w-md mx-auto text-center">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded mb-4"></div>
          <div className="h-4 bg-gray-200 rounded mb-8"></div>
          <div className="space-y-4">
            <div className="h-12 bg-gray-200 rounded"></div>
            <div className="h-12 bg-gray-200 rounded"></div>
            <div className="h-12 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    }>
      <UpdatePasswordFormInner {...props} />
    </Suspense>
  )
}