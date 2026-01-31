'use client'

import { useState } from 'react'
import { useRouter, Link } from '@/i18n/routing'
import { Button } from '@/components/ui/button'
import Icon from '@/components/ui/icon'
import { resendConfirmationEmail } from '@/lib/actions/auth-actions'
import { AuthDebug } from '@/components/debug/auth-debug'

interface VerifyEmailContentProps {
  email: string
  locale: string
}

export function VerifyEmailContent({ email, locale }: VerifyEmailContentProps) {
  const [isResending, setIsResending] = useState(false)
  const [resendMessage, setResendMessage] = useState('')
  const [error, setError] = useState('')
  const router = useRouter()

  const handleResendEmail = async () => {
    if (!email) {
      setError('Email address is required to resend verification')
      return
    }

    console.log('🔄 Resending verification email for:', email)
    setIsResending(true)
    setError('')
    setResendMessage('')
    
    try {
      const result = await resendConfirmationEmail(email, locale)
      console.log('📧 Resend result:', result)
      
      if (result.success) {
        setResendMessage('New verification email sent! Check your inbox.')
      } else {
        console.error('❌ Resend failed:', result.error)
        setError(result.error || 'Failed to resend email')
      }
    } catch (err) {
      console.error('❌ Resend error:', err)
      setError('Failed to resend email. Please try again.')
    } finally {
      setIsResending(false)
    }
  }

  return (
    <div className="text-center space-y-6">
      <div className="w-16 h-16 mx-auto bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center">
        <Icon name="mail" className="w-8 h-8 text-amber-600 dark:text-amber-400" />
      </div>
      
      <div>
        <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
          Email verification required
        </h3>
        <p className="text-slate-600 dark:text-slate-300">
          Please verify your email before accessing the dashboard
          {email && (
            <>
              <br />
              <span className="font-medium">{email}</span>
            </>
          )}
        </p>
      </div>

      {error && (
        <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md">
          {error}
        </div>
      )}

      {resendMessage && (
        <div className="p-3 text-sm text-green-600 bg-green-50 rounded-md">
          {resendMessage}
        </div>
      )}

      <div className="space-y-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          You can either click the link in the email or enter the 6-digit code below.
        </p>
        
        <div className="flex flex-col gap-3">
          <Button asChild>
            <Link href={`/auth/verify-code${email ? `?email=${encodeURIComponent(email)}` : ''}`}>
              <Icon name="hash" className="w-4 h-4 mr-2" />
              Enter verification code
            </Link>
          </Button>
          
          <Button 
            variant="outline" 
            onClick={handleResendEmail}
            disabled={isResending || !email}
          >
            {isResending ? (
              <>
                <Icon name="loader-2" className="w-4 h-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Icon name="refresh-cw" className="w-4 h-4 mr-2" />
                Resend verification email
              </>
            )}
          </Button>
          
          <Button asChild variant="ghost" className="text-slate-700 dark:text-slate-300 hover:text-white hover:bg-slate-900 dark:hover:bg-slate-700">
            <Link href="/auth/login">
              <Icon name="arrow-left" className="w-4 h-4 mr-2" />
              Back to login
            </Link>
          </Button>
        </div>
        
        <div className="pt-4 border-t">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Haven't received the email? Check your spam folder.
          </p>
        </div>
      </div>
      
      {/* Add debug component in development */}
      {/* eslint-disable-next-line no-restricted-globals */}
      {process.env.NODE_ENV === 'development' && <AuthDebug />}
    </div>
  )
}
