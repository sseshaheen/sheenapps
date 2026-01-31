import { locales, type Locale } from '@/i18n/config'
import { notFound } from 'next/navigation'
import { UpdatePasswordForm } from '@/components/auth/update-password-form'
import { AuthLayout } from '@/components/auth/auth-layout'

export const dynamic = 'force-dynamic'

export default async function UpdatePasswordPage({ 
  params
}: { 
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  
  if (!locales.includes(locale as Locale)) {
    notFound()
  }

  const translations = {
    updatePassword: {
      title: 'Set New Password',
      subtitle: 'Choose a strong password for your account',
      passwordLabel: 'New Password',
      passwordPlaceholder: 'Enter your new password',
      confirmLabel: 'Confirm Password',
      confirmPlaceholder: 'Confirm your new password',
      submitButton: 'Update Password',
      submitting: 'Updating...',
      success: 'Password Updated',
      successMessage: 'Your password has been successfully updated.',
      goToLogin: 'Go to Login',
      requirements: {
        title: 'Password must have:',
        minLength: 'At least 8 characters',
        uppercase: 'One uppercase letter',
        lowercase: 'One lowercase letter',
        number: 'One number',
        special: 'One special character'
      },
      errors: {
        mismatch: 'Passwords do not match',
        weak: 'Password is too weak',
        invalidToken: 'Invalid or expired reset link',
        generic: 'Unable to update password. Please try again.'
      }
    },
    common: {
      password: 'Password',
      loading: 'Loading...'
    }
  }

  return (
    <AuthLayout 
      title="Update Password"
      subtitle="Create a new password for your account"
      locale={locale}
    >
      <UpdatePasswordForm 
        translations={translations}
        locale={locale}
      />
    </AuthLayout>
  )
}