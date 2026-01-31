/**
 * 📧 Resend Confirmation Form
 * Form to request a new email confirmation link
 */

'use client'

import { useState } from 'react'
import { useRouter, Link } from '@/i18n/routing'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Icon from '@/components/ui/icon'
import { resendConfirmationEmail } from '@/lib/actions/auth-actions'
import { logger } from '@/utils/logger'

interface ResendConfirmationFormProps {
  prefillEmail?: string
  locale: string
  translations: {
    resendConfirmation: {
      title: string
      subtitle: string
      emailLabel: string
      emailPlaceholder: string
      sendButton: string
      sending: string
      backToLogin: string
      successMessage: string
      rateLimitError: string
      notFoundError: string
      alreadyConfirmed: string
    }
    validation: {
      emailRequired: string
      emailInvalid: string
    }
  }
}

export function ResendConfirmationForm({ prefillEmail, locale, translations }: ResendConfirmationFormProps) {
  const router = useRouter()
  const [email, setEmail] = useState(prefillEmail || '')
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Clear previous messages
    setMessage(null)

    // Validate email
    if (!email) {
      setMessage({ type: 'error', text: translations.validation.emailRequired })
      return
    }

    if (!validateEmail(email)) {
      setMessage({ type: 'error', text: translations.validation.emailInvalid })
      return
    }

    setIsLoading(true)

    try {
      const result = await resendConfirmationEmail(email, locale)

      if (!result.success) {
        // Map error messages to translations
        let errorMessage = result.error || 'Failed to send confirmation email'
        
        if (result.error?.includes('rate limit')) {
          errorMessage = translations.resendConfirmation.rateLimitError
        } else if (result.error?.includes('not found')) {
          errorMessage = translations.resendConfirmation.notFoundError
        } else if (result.error?.includes('already confirmed')) {
          errorMessage = translations.resendConfirmation.alreadyConfirmed
        }
        
        setMessage({ type: 'error', text: errorMessage })
        return
      }

      // Success!
      setMessage({ type: 'success', text: translations.resendConfirmation.successMessage })
      
      // Clear the form
      setEmail('')
      
      // Optionally redirect to login after a delay
      setTimeout(() => {
        router.push('/auth/login')
      }, 3000)

    } catch (error) {
      logger.error('Resend confirmation form error:', error)
      setMessage({ type: 'error', text: 'An unexpected error occurred. Please try again.' })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="email">{translations.resendConfirmation.emailLabel}</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={translations.resendConfirmation.emailPlaceholder}
          required
          autoComplete="email"
          autoFocus
        />
      </div>

      {message && (
        <div className={`p-3 rounded-md text-sm ${
          message.type === 'success' 
            ? 'bg-green-50 text-green-700 border border-green-200' 
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          <div className="flex items-center gap-2">
            <Icon 
              name={message.type === 'success' ? 'check-circle' : 'alert-circle'} 
              className="w-4 h-4" 
            />
            {message.text}
          </div>
        </div>
      )}

      <Button 
        type="submit" 
        className="w-full" 
        disabled={isLoading}
      >
        {isLoading ? (
          <>
            <Icon name="loader-2" className="w-4 h-4 mr-2 animate-spin" />
            {translations.resendConfirmation.sending}
          </>
        ) : (
          <>
            <Icon name="mail" className="w-4 h-4 mr-2" />
            {translations.resendConfirmation.sendButton}
          </>
        )}
      </Button>

      <div className="text-center">
        <Link 
          href="/auth/login"
          className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          ← {translations.resendConfirmation.backToLogin}
        </Link>
      </div>
    </form>
  )
}