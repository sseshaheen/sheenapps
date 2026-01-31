/**
 * 🔐 Password Change Form
 * Secure password update with global session revocation
 */

'use client'

import { useState } from 'react'
import { m, AnimatePresence } from '@/components/ui/motion-provider'
import { changePasswordWithVerification } from '@/lib/actions/auth-actions'
import { useRouter } from '@/i18n/routing'
import Icon from '@/components/ui/icon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { logger } from '@/utils/logger';

interface PasswordChangeFormProps {
  onSuccess?: () => void
  onCancel?: () => void
}

interface PasswordValidation {
  valid: boolean
  message: string
}

export function PasswordChangeForm({ onSuccess, onCancel }: PasswordChangeFormProps) {
  const router = useRouter()
  const [formData, setFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })
  
  const [validation, setValidation] = useState<PasswordValidation>({
    valid: false,
    message: ''
  })
  
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false
  })
  
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [isSuccess, setIsSuccess] = useState(false)

  const validatePassword = (password: string) => {
    if (!password) {
      setValidation({ valid: false, message: '' })
      return
    }

    // Client-side validation (server-side validation disabled for now)
    const hasLength = password.length >= 8
    const hasUpper = /[A-Z]/.test(password)
    const hasLower = /[a-z]/.test(password)
    const hasNumber = /\d/.test(password)
    const hasSpecial = /[^A-Za-z0-9]/.test(password)
    
    const valid = hasLength && hasUpper && hasLower && hasNumber && hasSpecial
    
    let message = ''
    if (!hasLength) message = 'Password must be at least 8 characters'
    else if (!hasUpper) message = 'Include at least one uppercase letter'
    else if (!hasLower) message = 'Include at least one lowercase letter'
    else if (!hasNumber) message = 'Include at least one number'
    else if (!hasSpecial) message = 'Include at least one special character'
    else message = 'Strong password!'
    
    setValidation({ valid, message })
  }

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    setError('')
    
    if (field === 'newPassword') {
      validatePassword(value)
    }
  }

  const isFormValid = () => {
    return (
      formData.currentPassword &&
      validation.valid &&
      formData.newPassword === formData.confirmPassword &&
      formData.newPassword !== formData.currentPassword
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!isFormValid()) {
      setError('Please fix the validation errors above')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const result = await changePasswordWithVerification(formData.currentPassword, formData.newPassword)

      if (!result.success) {
        setError(result.error || 'Failed to change password')
        return
      }

      // Success state
      setIsSuccess(true)
      
      // Redirect to login after short delay
      setTimeout(() => {
        router.push('/auth/login?reason=password_changed&message=Password updated successfully. Please sign in again.')
      }, 2000)

    } catch (err) {
      logger.error('Password change error:', err);
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
        <div className="w-16 h-16 mx-auto bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
          <Icon name="shield" className="w-8 h-8 text-green-600 dark:text-green-400"  />
        </div>
        
        <div>
          <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
            Password Updated
          </h3>
          <p className="text-slate-600 dark:text-slate-300">
            Your password has been changed successfully. <br />
            For security, you&apos;ll be signed out of all devices.
          </p>
        </div>

        <div className="flex items-center justify-center space-x-2 text-sm text-amber-600 dark:text-amber-400">
          <Icon name="alert-circle" className="w-4 h-4"  />
          <span>Redirecting to sign in...</span>
        </div>
      </m.div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
          Change Password
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          For security, you&apos;ll be signed out of all devices after changing your password.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Current Password */}
        <div className="space-y-2">
          <Label htmlFor="currentPassword">Current Password</Label>
          <div className="relative">
            <Input
              id="currentPassword"
              type={showPasswords.current ? 'text' : 'password'}
              placeholder="Enter your current password"
              value={formData.currentPassword}
              onChange={(e) => handleInputChange('currentPassword', e.target.value)}
              className="pl-10 pr-10"
              disabled={isLoading}
            />
            <Icon name="lock" className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400"  />
            <button
              type="button"
              onClick={() => setShowPasswords(prev => ({ ...prev, current: !prev.current }))}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {showPasswords.current ? <Icon name="eye-off" className="w-4 h-4"  /> : <Icon name="eye" className="w-4 h-4"  />}
            </button>
          </div>
        </div>

        {/* New Password */}
        <div className="space-y-2">
          <Label htmlFor="newPassword">New Password</Label>
          <div className="relative">
            <Input
              id="newPassword"
              type={showPasswords.new ? 'text' : 'password'}
              placeholder="Create a strong new password"
              value={formData.newPassword}
              onChange={(e) => handleInputChange('newPassword', e.target.value)}
              className="pl-10 pr-10"
              disabled={isLoading}
            />
            <Icon name="lock" className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400"  />
            <button
              type="button"
              onClick={() => setShowPasswords(prev => ({ ...prev, new: !prev.new }))}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {showPasswords.new ? <Icon name="eye-off" className="w-4 h-4"  /> : <Icon name="eye" className="w-4 h-4"  />}
            </button>
          </div>
          <AnimatePresence>
            {formData.newPassword && (
              <m.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className={`text-xs ${validation.valid ? 'text-green-600' : 'text-red-600'}`}
              >
                {validation.message}
              </m.p>
            )}
          </AnimatePresence>
        </div>

        {/* Confirm Password */}
        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm New Password</Label>
          <div className="relative">
            <Input
              id="confirmPassword"
              type={showPasswords.confirm ? 'text' : 'password'}
              placeholder="Confirm your new password"
              value={formData.confirmPassword}
              onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
              className="pl-10 pr-10"
              disabled={isLoading}
            />
            <Icon name="lock" className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400"  />
            <button
              type="button"
              onClick={() => setShowPasswords(prev => ({ ...prev, confirm: !prev.confirm }))}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {showPasswords.confirm ? <Icon name="eye-off" className="w-4 h-4"  /> : <Icon name="eye" className="w-4 h-4"  />}
            </button>
            <AnimatePresence>
              {formData.confirmPassword && (
                <m.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="absolute right-10 top-1/2 transform -translate-y-1/2"
                >
                  {formData.newPassword === formData.confirmPassword ? (
                    <Icon name="check-circle" className="w-4 h-4 text-green-500"  />
                  ) : (
                    <Icon name="x" className="w-4 h-4 text-red-500"  />
                  )}
                </m.div>
              )}
            </AnimatePresence>
          </div>
          <AnimatePresence>
            {formData.confirmPassword && formData.newPassword !== formData.confirmPassword && (
              <m.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="text-xs text-red-600"
              >
                Passwords do not match
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
              <Icon name="shield" className="w-4 h-4 mr-2"  />
            )}
            {isLoading ? 'Updating password...' : 'Update password'}
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