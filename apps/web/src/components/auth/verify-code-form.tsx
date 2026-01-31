'use client'

import { useState } from 'react'
import { useRouter } from '@/i18n/routing'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Icon from '@/components/ui/icon'
import { verifyEmailCode, resendConfirmationEmail } from '@/lib/actions/auth-actions'

interface VerifyCodeFormProps {
  email: string
  locale: string
  type: 'signup' | 'email_change' | 'recovery'
}

export function VerifyCodeForm({ email, locale, type = 'signup' }: VerifyCodeFormProps) {
  const [code, setCode] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [error, setError] = useState('')
  const [resendMessage, setResendMessage] = useState('')
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    try {
      const result = await verifyEmailCode(email, code, type)
      
      if (result.success) {
        // Set auth sync flag for server auth
        sessionStorage.setItem('auth_pending_sync', 'true')
        sessionStorage.setItem('auth_email', email)
        
        // Small delay to ensure state is updated
        setTimeout(() => {
          router.push('/dashboard')
        }, 100)
      } else {
        setError(result.error || 'Verification failed')
      }
    } catch (err) {
      setError('An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6)
    setCode(value)
  }

  const handleResendCode = async () => {
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
    <div className="space-y-6">
      <div className="text-center">
        <div className="w-16 h-16 mx-auto bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mb-4">
          <Icon name="mail" className="w-8 h-8 text-blue-600 dark:text-blue-400" />
        </div>
        
        <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
          Check your email
        </h3>
        <p className="text-slate-600 dark:text-slate-300">
          We sent a 6-digit code to
          <br />
          <span className="font-medium">{email}</span>
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="code">Verification code</Label>
          <Input
            id="code"
            type="text"
            value={code}
            onChange={handleCodeChange}
            placeholder="Enter 6-digit code"
            maxLength={6}
            className="text-center text-2xl tracking-widest"
            required
          />
          <p className="text-sm text-slate-500">
            Enter the code from your email
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

        <Button type="submit" className="w-full" disabled={isLoading || code.length !== 6}>
          {isLoading ? (
            <>
              <Icon name="loader-2" className="w-4 h-4 mr-2 animate-spin" />
              Verifying...
            </>
          ) : (
            'Verify Email'
          )}
        </Button>
      </form>

      <div className="text-center space-y-4">
        <p className="text-sm text-slate-500">
          Didn't receive the code?
        </p>
        
        <div className="flex flex-col gap-2">
          <Button 
            variant="outline" 
            onClick={handleResendCode}
            disabled={isResending}
          >
            {isResending ? (
              <>
                <Icon name="loader-2" className="w-4 h-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Icon name="refresh-cw" className="w-4 h-4 mr-2" />
                Resend code
              </>
            )}
          </Button>
          
          <Button variant="ghost" className="text-slate-700 dark:text-slate-300 hover:text-white hover:bg-slate-900 dark:hover:bg-slate-700" onClick={() => router.push('/auth/login')}>
            <Icon name="arrow-left" className="w-4 h-4 mr-2" />
            Back to login
          </Button>
        </div>
      </div>
    </div>
  )
}