/**
 * 📧 Email Change Form
 * Secure email update with global session revocation
 */

'use client'

import { useState } from 'react'
import { m, AnimatePresence } from '@/components/ui/motion-provider'
import { changeEmail } from '@/lib/actions/auth-actions'
import { useRouter } from '@/i18n/routing'
import Icon from '@/components/ui/icon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { logger } from '@/utils/logger';

interface EmailChangeFormProps {
  currentEmail: string
  onSuccess?: () => void
  onCancel?: () => void
}

export function EmailChangeForm({ currentEmail, onSuccess, onCancel }: EmailChangeFormProps) {
  const router = useRouter()
  const [newEmail, setNewEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [isSuccess, setIsSuccess] = useState(false)

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  const isFormValid = () => {
    return (
      newEmail &&
      validateEmail(newEmail) &&
      newEmail !== currentEmail
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!isFormValid()) {
      setError('Please enter a valid email address that differs from your current one')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const result = await changeEmail(newEmail)

      if (!result.success) {
        setError(result.error || 'Failed to change email')
        return
      }

      // Success state
      setIsSuccess(true)
      
      // Redirect to login after delay
      setTimeout(() => {
        router.push('/auth/login?reason=email_changed&message=Email change initiated. Check both your old and new email for confirmation links.')
      }, 3000)

    } catch (err) {
      logger.error('Email change error:', err);
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  if (isSuccess) {
    return (
      <m.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center space-y-6 p-6"
      >
        <div className="w-16 h-16 mx-auto bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
          <Icon name="mail" className="w-8 h-8 text-blue-600 dark:text-blue-400"  />
        </div>
        
        <div>
          <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
            Email Change Initiated
          </h3>
          <p className="text-slate-600 dark:text-slate-300">
            We&apos;ve sent confirmation links to both your old and new email addresses. <br />
            <span className="font-medium">{newEmail}</span>
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-sm text-slate-500 dark:text-slate-300">
            Please check both email addresses and click the confirmation links to complete the change.
          </p>
          
          <div className="flex items-center justify-center space-x-2 text-sm text-amber-600 dark:text-amber-400">
            <Icon name="alert-circle" className="w-4 h-4"  />
            <span>You&apos;ve been signed out for security</span>
          </div>
        </div>
      </m.div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
          Change Email Address
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          You&apos;ll need to confirm the change via email links. For security, you&apos;ll be signed out of all devices.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Current Email (Read-only) */}
        <div className="space-y-2">
          <Label htmlFor="currentEmail">Current Email</Label>
          <div className="relative">
            <Input
              id="currentEmail"
              type="email"
              value={currentEmail}
              className="pl-10 bg-slate-50 dark:bg-slate-800"
              disabled
            />
            <Icon name="mail" className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400"  />
          </div>
        </div>

        {/* New Email */}
        <div className="space-y-2">
          <Label htmlFor="newEmail">New Email Address</Label>
          <div className="relative">
            <Input
              id="newEmail"
              type="email"
              placeholder="Enter your new email address"
              value={newEmail}
              onChange={(e) => {
                setNewEmail(e.target.value)
                setError('')
              }}
              className="pl-10 pr-10"
              disabled={isLoading}
            />
            <Icon name="mail" className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400"  />
            <AnimatePresence>
              {newEmail && (
                <m.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2"
                >
                  {validateEmail(newEmail) && newEmail !== currentEmail ? (
                    <Icon name="check-circle" className="w-4 h-4 text-green-500"  />
                  ) : (
                    <Icon name="x" className="w-4 h-4 text-red-500"  />
                  )}
                </m.div>
              )}
            </AnimatePresence>
          </div>
          <AnimatePresence>
            {newEmail && (
              <m.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className={`text-xs ${
                  validateEmail(newEmail) && newEmail !== currentEmail 
                    ? 'text-green-600' 
                    : 'text-red-600'
                }`}
              >
                {!validateEmail(newEmail) 
                  ? 'Please enter a valid email address'
                  : newEmail === currentEmail
                  ? 'New email must be different from current email'
                  : 'Valid email address'
                }
              </m.p>
            )}
          </AnimatePresence>
        </div>

        {/* Security Notice */}
        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <div className="flex items-start space-x-2">
            <Icon name="shield" className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5"  />
            <div className="text-sm text-amber-700 dark:text-amber-300">
              <p className="font-medium">Security Notice</p>
              <p>Changing your email will sign you out of all devices and require email confirmation.</p>
            </div>
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

        {/* Action Buttons */}
        <div className="flex space-x-3 pt-4">
          <Button
            type="submit"
            className="flex-1"
            disabled={!isFormValid() || isLoading}
          >
            {isLoading ? (
              <Icon name="loader-2" className="w-4 h-4 mr-2 animate-spin"  />
            ) : (
              <Icon name="mail" className="w-4 h-4 mr-2"  />
            )}
            {isLoading ? 'Updating email...' : 'Update email'}
          </Button>
          
          {onCancel && (
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isLoading}
            >
              Cancel
            </Button>
          )}
        </div>
      </form>
    </div>
  )
}