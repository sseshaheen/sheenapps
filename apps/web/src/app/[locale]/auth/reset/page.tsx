import { locales, type Locale } from '@/i18n/config'
import { notFound } from 'next/navigation'
import { PasswordResetForm } from '@/components/auth/password-reset-form'
import { AuthLayout } from '@/components/auth/auth-layout'

export const dynamic = 'force-dynamic'

export default async function PasswordResetPage({ 
  params,
  searchParams
}: { 
  params: Promise<{ locale: string }>
  searchParams: Promise<{ email?: string }>
}) {
  const { locale } = await params
  const { email } = await searchParams
  
  if (!locales.includes(locale as Locale)) {
    notFound()
  }

  const translations = {
    reset: {
      title: 'Reset Password',
      subtitle: 'Enter your email to receive a password reset link',
      emailLabel: 'Email Address',
      emailPlaceholder: 'you@example.com',
      submitButton: 'Send Reset Link',
      submitting: 'Sending...',
      backToLogin: 'Back to login',
      checkEmail: 'Check your email',
      emailSent: "We've sent a password reset link to your email address. Please check your inbox.",
      errorTitle: 'Reset Failed',
      tryAgain: 'Try Again',
      errors: {
        invalidEmail: 'Please enter a valid email address',
        userNotFound: 'No account found with this email',
        rateLimited: 'Too many reset attempts. Please try again later.',
        generic: 'Unable to send reset email. Please try again.'
      }
    },
    common: {
      email: 'Email',
      or: 'or',
      loading: 'Loading...'
    }
  }

  return (
    <AuthLayout 
      title="Reset Password"
      subtitle="Enter your email to receive a password reset link"
      locale={locale}
    >
      <PasswordResetForm 
        translations={translations}
        locale={locale}
        defaultEmail={email}
      />
    </AuthLayout>
  )
}