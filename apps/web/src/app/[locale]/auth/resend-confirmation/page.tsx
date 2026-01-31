/**
 * 📧 Resend Confirmation Email Page
 * Allows users to request a new confirmation email
 */

import { ResendConfirmationForm } from '@/components/auth/resend-confirmation-form'
import { AuthLayout } from '@/components/auth/auth-layout'
import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getNamespacedMessages } from '@/i18n/request'

export const metadata: Metadata = {
  title: 'Resend Confirmation Email - SheenApps',
  description: 'Request a new email confirmation link for your SheenApps account.',
}

interface ResendConfirmationPageProps {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ 
    email?: string
  }>
}

export default async function ResendConfirmationPage({ params, searchParams }: ResendConfirmationPageProps) {
  const { locale } = await params
  const { email } = await searchParams

  // Load only the namespaces this page needs
  const messages = await getNamespacedMessages(locale, [
    'auth',
    'common'
  ])

  // Map translations to component props
  const translations = {
    resendConfirmation: {
      title: messages.auth.resendConfirmation?.title || 'Resend Confirmation Email',
      subtitle: messages.auth.resendConfirmation?.subtitle || 'Enter your email to receive a new confirmation link',
      emailLabel: messages.auth.resendConfirmation?.emailLabel || 'Email Address',
      emailPlaceholder: messages.auth.resendConfirmation?.emailPlaceholder || 'your@email.com',
      sendButton: messages.auth.resendConfirmation?.sendButton || 'Send Confirmation Email',
      sending: messages.auth.resendConfirmation?.sending || 'Sending...',
      backToLogin: messages.auth.resendConfirmation?.backToLogin || 'Back to login',
      successMessage: messages.auth.resendConfirmation?.successMessage || 'Confirmation email sent! Check your inbox.',
      rateLimitError: messages.auth.resendConfirmation?.rateLimitError || 'Too many requests. Please wait a few minutes.',
      notFoundError: messages.auth.resendConfirmation?.notFoundError || 'No account found with this email.',
      alreadyConfirmed: messages.auth.resendConfirmation?.alreadyConfirmed || 'This email is already confirmed. You can log in.',
    },
    validation: {
      emailRequired: messages.auth.validation?.emailRequired || 'Email is required',
      emailInvalid: messages.auth.validation?.emailInvalid || 'Please enter a valid email',
    }
  };

  return (
    <AuthLayout
      title="Resend Confirmation Email"
      subtitle="Get a new confirmation link sent to your email"
      locale={locale}
    >
      <ResendConfirmationForm 
        prefillEmail={email}
        locale={locale}
        translations={translations}
      />
    </AuthLayout>
  )
}