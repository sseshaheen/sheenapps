/**
 * 🚀 Premium Signup Form
 * Beautiful registration form with real-time validation and animations
 */

'use client'

import { useState, useEffect } from 'react'
import { m, AnimatePresence } from '@/components/ui/motion-provider'
import { Link, useRouter } from '@/i18n/routing'
import { useAuthStore } from '@/store'
import { signInWithOAuth } from '@/lib/actions/auth-actions'
import Icon from '@/components/ui/icon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { logger } from '@/utils/logger';

interface SignupFormProps {
  returnTo?: string
  selectedPlan?: string
  locale: string
  translations?: any // Auth translations object
}

interface ValidationState {
  email: { valid: boolean; message: string }
  password: { valid: boolean; message: string }
  name: { valid: boolean; message: string }
}

export function SignupForm({ returnTo, selectedPlan, locale, translations }: SignupFormProps) {
  // Fallback to English if translations not provided
  const t = translations?.signup || {
    socialButtons: {
      github: 'Continue with GitHub',
      google: 'Continue with Google',
      divider: 'Or continue with email'
    },
    form: {
      nameLabel: 'Full Name',
      namePlaceholder: 'Enter your full name',
      emailLabel: 'Email Address',
      emailPlaceholder: 'Enter your email',
      passwordLabel: 'Password',
      passwordPlaceholder: 'Create a strong password',
      confirmPasswordLabel: 'Confirm Password',
      confirmPasswordPlaceholder: 'Confirm your password',
      submitButton: 'Create account',
      submitting: 'Creating account...'
    },
    validation: {
      nameValid: 'Looks good!',
      nameInvalid: 'Name must be at least 2 characters',
      emailValid: 'Valid email address',
      emailInvalid: 'Please enter a valid email',
      passwordLength: 'Password must be at least 8 characters',
      passwordUppercase: 'Include at least one uppercase letter',
      passwordLowercase: 'Include at least one lowercase letter',
      passwordNumber: 'Include at least one number',
      passwordStrong: 'Strong password!',
      passwordsMismatch: 'Passwords do not match',
      fixErrors: 'Please fix the validation errors above'
    },
    errors: {
      createFailed: 'Failed to create account. Please try again.',
      unexpectedError: 'An unexpected error occurred. Please try again.',
      socialSignupFailed: 'Social signup failed. Please try again.'
    },
    verification: {
      title: 'Check your email',
      message: 'We\'ve sent a verification link to',
      instructions: 'You can either click the link in your email or enter the 6-digit code below.',
      codeButton: 'Enter verification code',
      loginButton: 'Go to Sign In'
    },
    footer: {
      terms: 'By creating an account, you agree to our',
      termsLink: 'Terms of Service',
      and: 'and',
      privacyLink: 'Privacy Policy',
      hasAccount: 'Already have an account?',
      signInLink: 'Sign in'
    }
  }
  const router = useRouter()
  const { login: _login } = useAuthStore() // Renamed to avoid unused variable warning
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
  })
  
  const [validation, setValidation] = useState<ValidationState>({
    email: { valid: false, message: '' },
    password: { valid: false, message: '' },
    name: { valid: false, message: '' }
  })
  
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState<'form' | 'verification'>('form')

  // Real-time validation
  useEffect(() => {
    validateField('name', formData.name)
  }, [formData.name])

  useEffect(() => {
    validateField('email', formData.email)
  }, [formData.email])

  useEffect(() => {
    validateField('password', formData.password)
  }, [formData.password])

  const validateField = (field: keyof ValidationState, value: string) => {
    let valid = false
    let message = ''

    switch (field) {
      case 'name':
        valid = value.trim().length >= 2
        message = valid ? t.validation.nameValid : t.validation.nameInvalid
        break
      
      case 'email':
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        valid = emailRegex.test(value)
        message = valid ? t.validation.emailValid : t.validation.emailInvalid
        break
      
      case 'password':
        const hasLength = value.length >= 8
        const hasUpper = /[A-Z]/.test(value)
        const hasLower = /[a-z]/.test(value)
        const hasNumber = /\d/.test(value)
        
        valid = hasLength && hasUpper && hasLower && hasNumber
        
        if (!hasLength) message = t.validation.passwordLength
        else if (!hasUpper) message = t.validation.passwordUppercase
        else if (!hasLower) message = t.validation.passwordLowercase
        else if (!hasNumber) message = t.validation.passwordNumber
        else message = t.validation.passwordStrong
        break
    }

    setValidation(prev => ({
      ...prev,
      [field]: { valid, message }
    }))
  }

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    setError('') // Clear any previous errors
  }

  const isFormValid = () => {
    return (
      validation.name.valid &&
      validation.email.valid &&
      validation.password.valid &&
      formData.password === formData.confirmPassword
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!isFormValid()) {
      setError(t.validation.fixErrors)
      return
    }

    setIsLoading(true)
    setError('')

    try {
      // ✅ EXPERT FIX: Use API route like login form for consistency
      const formDataObj = new FormData()
      formDataObj.append('email', formData.email)
      formDataObj.append('password', formData.password)
      formDataObj.append('name', formData.name)
      formDataObj.append('plan', selectedPlan || 'free')
      formDataObj.append('locale', locale)
      formDataObj.append('returnTo', returnTo || `/${locale}/dashboard`)

      const response = await fetch('/api/auth/sign-up', {
        method: 'POST',
        body: formDataObj
      })

      if (response.redirected) {
        // Success! The API route redirected us
        logger.info('Signup successful - API redirected to:', response.url)
        window.location.href = response.url
        return
      }

      if (!response.ok) {
        setError(t.errors.createFailed)
        return
      }

      // This shouldn't happen with our current flow, but handle it gracefully
      logger.info('Signup successful - manual verification step')
      setStep('verification')
      
      // Set a flag to indicate pending verification
      sessionStorage.setItem('auth_pending_verification', 'true')
      sessionStorage.setItem('auth_email', formData.email)

    } catch (err) {
      logger.error('Signup error:', err);
      setError(t.errors.unexpectedError)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSocialSignup = async (provider: 'github' | 'google') => {
    setIsLoading(true)
    
    try {
      const result = await signInWithOAuth(provider, locale, returnTo)

      if (!result.success) {
        setError(result.error || t.errors.socialSignupFailed)
        setIsLoading(false)
        return
      }

      // OAuth returns redirect URL - navigate to it
      if (result.data?.url) {
        window.location.href = result.data.url
      }
      
    } catch (err) {
      logger.error('Social signup error:', err);
      setError(t.errors.socialSignupFailed)
      setIsLoading(false)
    }
  }

  if (step === 'verification') {
    return (
      <m.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center space-y-6"
      >
        <div className="w-16 h-16 mx-auto bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
          <Icon name="mail" className="w-8 h-8 text-green-600 dark:text-green-400"  />
        </div>
        
        <div>
          <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
            {t.verification.title}
          </h3>
          <p className="text-slate-600 dark:text-slate-300">
            {t.verification.message} <br />
            <span className="font-medium">{formData.email}</span>
          </p>
        </div>

        <div className="space-y-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t.verification.instructions}
          </p>
          
          <div className="flex flex-col gap-3">
            <Button
              onClick={() => router.push(`/auth/verify-code?email=${encodeURIComponent(formData.email)}`)}
              className="w-full"
            >
              <Icon name="hash" className="w-4 h-4 mr-2" />
              {t.verification.codeButton}
            </Button>
            
            <Button
              variant="outline"
              onClick={() => router.push(`/auth/login?email=${encodeURIComponent(formData.email)}`)}
              className="w-full"
            >
              {t.verification.loginButton}
            </Button>
          </div>
        </div>
      </m.div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Social Signup */}
      <div className="space-y-3">
        <Button
          onClick={() => handleSocialSignup('github')}
          variant="outline"
          className="w-full"
          disabled={isLoading}
        >
          <Icon name="github" className="w-4 h-4 mr-2"  />
          {t.socialButtons.github}
        </Button>
        
        <Button
          onClick={() => handleSocialSignup('google')}
          variant="outline"
          className="w-full"
          disabled={isLoading}
        >
          <Icon name="mail" className="w-4 h-4 mr-2"  />
          {t.socialButtons.google}
        </Button>
      </div>

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-300 dark:border-slate-600" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-white dark:bg-slate-800 px-2 text-slate-500 dark:text-slate-300">
            {t.socialButtons.divider}
          </span>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Name Field */}
        <div className="space-y-2">
          <Label htmlFor="name">{t.form.nameLabel}</Label>
          <div className="relative">
            <Input
              id="name"
              type="text"
              placeholder={t.form.namePlaceholder}
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              className="ltr:pl-12 rtl:pr-12"
              disabled={isLoading}
            />
            <Icon name="user" className="w-4 h-4 absolute ltr:left-4 rtl:right-4 top-1/2 transform -translate-y-1/2 text-slate-400 dark:text-slate-500"  />
            <AnimatePresence>
              {formData.name && (
                <m.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="absolute ltr:right-3 rtl:left-3 top-1/2 transform -translate-y-1/2"
                >
                  {validation.name.valid ? (
                    <Icon name="check-circle" className="w-4 h-4 text-green-500"  />
                  ) : (
                    <Icon name="x" className="w-4 h-4 text-red-500"  />
                  )}
                </m.div>
              )}
            </AnimatePresence>
          </div>
          <AnimatePresence>
            {formData.name && (
              <m.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className={`text-xs ${validation.name.valid ? 'text-green-600' : 'text-red-600'}`}
              >
                {validation.name.message}
              </m.p>
            )}
          </AnimatePresence>
        </div>

        {/* Email Field */}
        <div className="space-y-2">
          <Label htmlFor="email">{t.form.emailLabel}</Label>
          <div className="relative">
            <Input
              id="email"
              type="email"
              placeholder={t.form.emailPlaceholder}
              value={formData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
              className="ltr:pl-12 rtl:pr-12"
              disabled={isLoading}
            />
            <Icon name="mail" className="w-4 h-4 absolute ltr:left-4 rtl:right-4 top-1/2 transform -translate-y-1/2 text-slate-400 dark:text-slate-500"  />
            <AnimatePresence>
              {formData.email && (
                <m.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="absolute ltr:right-3 rtl:left-3 top-1/2 transform -translate-y-1/2"
                >
                  {validation.email.valid ? (
                    <Icon name="check-circle" className="w-4 h-4 text-green-500"  />
                  ) : (
                    <Icon name="x" className="w-4 h-4 text-red-500"  />
                  )}
                </m.div>
              )}
            </AnimatePresence>
          </div>
          <AnimatePresence>
            {formData.email && (
              <m.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className={`text-xs ${validation.email.valid ? 'text-green-600' : 'text-red-600'}`}
              >
                {validation.email.message}
              </m.p>
            )}
          </AnimatePresence>
        </div>

        {/* Password Field */}
        <div className="space-y-2">
          <Label htmlFor="password">{t.form.passwordLabel}</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder={t.form.passwordPlaceholder}
              value={formData.password}
              onChange={(e) => handleInputChange('password', e.target.value)}
              className="ltr:pl-12 ltr:pr-12 rtl:pr-12 rtl:pl-12"
              disabled={isLoading}
            />
            <Icon name="lock" className="w-4 h-4 absolute ltr:left-4 rtl:right-4 top-1/2 transform -translate-y-1/2 text-slate-400 dark:text-slate-500"  />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute ltr:right-4 rtl:left-4 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
            >
              {showPassword ? <Icon name="eye-off" className="w-4 h-4"  /> : <Icon name="eye" className="w-4 h-4"  />}
            </button>
          </div>
          <AnimatePresence>
            {formData.password && (
              <m.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className={`text-xs ${validation.password.valid ? 'text-green-600' : 'text-red-600'}`}
              >
                {validation.password.message}
              </m.p>
            )}
          </AnimatePresence>
        </div>

        {/* Confirm Password Field */}
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">{t.form.confirmPasswordLabel}</Label>
          <div className="relative">
            <Input
              id="confirmPassword"
              type={showConfirmPassword ? 'text' : 'password'}
              placeholder={t.form.confirmPasswordPlaceholder}
              value={formData.confirmPassword}
              onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
              className="ltr:pl-12 ltr:pr-12 rtl:pr-12 rtl:pl-12"
              disabled={isLoading}
            />
            <Icon name="lock" className="w-4 h-4 absolute ltr:left-4 rtl:right-4 top-1/2 transform -translate-y-1/2 text-slate-400 dark:text-slate-500"  />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute ltr:right-4 rtl:left-4 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
            >
              {showConfirmPassword ? <Icon name="eye-off" className="w-4 h-4"  /> : <Icon name="eye" className="w-4 h-4"  />}
            </button>
            <AnimatePresence>
              {formData.confirmPassword && (
                <m.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="absolute ltr:right-12 rtl:left-12 top-1/2 transform -translate-y-1/2"
                >
                  {formData.password === formData.confirmPassword ? (
                    <Icon name="check-circle" className="w-4 h-4 text-green-500"  />
                  ) : (
                    <Icon name="x" className="w-4 h-4 text-red-500"  />
                  )}
                </m.div>
              )}
            </AnimatePresence>
          </div>
          <AnimatePresence>
            {formData.confirmPassword && formData.password !== formData.confirmPassword && (
              <m.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="text-xs text-red-600"
              >
                {t.validation.passwordsMismatch}
              </m.p>
            )}
          </AnimatePresence>
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
          disabled={!isFormValid() || isLoading}
        >
          {isLoading ? (
            <Icon name="loader-2" className="w-4 h-4 me-2 animate-spin"  />
          ) : (
            <Icon name="sparkles" className="w-4 h-4 me-2"  />
          )}
          {isLoading ? t.form.submitting : t.form.submitButton}
          {!isLoading && (
            <>
              <Icon name="arrow-right" className="w-4 h-4 ms-2 ltr:block rtl:hidden"  />
              <Icon name="arrow-left" className="w-4 h-4 ms-2 rtl:block ltr:hidden"  />
            </>
          )}
        </Button>

        {/* Terms */}
        <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
          {t.footer.terms}{' '}
          <Link href="/terms" className="font-medium hover:underline">
            {t.footer.termsLink}
          </Link>{' '}
          {t.footer.and}{' '}
          <Link href="/privacy" className="font-medium hover:underline">
            {t.footer.privacyLink}
          </Link>
        </p>
      </form>

      {/* Login Link */}
      <div className="text-center pt-4 border-t border-slate-200 dark:border-slate-700">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {t.footer.hasAccount}{' '}
          <Link
            href={`/auth/login${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`}
            className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
          >
            {t.footer.signInLink}
          </Link>
        </p>
      </div>
    </div>
  )
}