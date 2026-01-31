/**
 * 🚀 Premium User Registration Page
 * Delightful signup experience with email verification
 */

import { SignupForm } from '@/components/auth/signup-form'
import { AuthLayout } from '@/components/auth/auth-layout'
import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { loadNamespace } from '@/i18n/message-loader'

// Auth pages need dynamic rendering for cookie handling
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Create Your Account - SheenApps',
  description: 'Join thousands of creators building beautiful websites with AI-powered tools.',
}

interface SignupPageProps {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ returnTo?: string; plan?: string }>
}

export default async function SignupPage({ params, searchParams }: SignupPageProps) {
  const { locale } = await params
  const { returnTo, plan } = await searchParams

  // Load translations
  const authMessages = await loadNamespace(locale, 'auth')
  const commonMessages = await loadNamespace(locale, 'common')
  if (Object.keys(authMessages).length === 0) {
    notFound()
  }

  return (
    <AuthLayout
      title={authMessages.signup.title}
      subtitle={authMessages.signup.subtitle}
      locale={locale}
      commonTranslations={commonMessages as { authLayout: typeof commonMessages.authLayout }}
    >
      <SignupForm
        returnTo={returnTo}
        selectedPlan={plan}
        locale={locale}
        translations={authMessages}
      />
    </AuthLayout>
  )
}