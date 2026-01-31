/**
 * Secret Invite Signup Page
 * Allows early access signup via secret invite codes
 */

import { AuthLayout } from '@/components/auth/auth-layout'
import { SignupForm } from '@/components/auth/signup-form'
import { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { loadNamespace } from '@/i18n/message-loader'

// Auth pages need dynamic rendering for cookie handling
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'You\'re Invited - SheenApps',
  description: 'Create your account to get early access to SheenApps.',
  robots: 'noindex, nofollow', // Don't index invite pages
}

interface InvitePageProps {
  params: Promise<{ locale: string; code: string }>
  searchParams: Promise<{ returnTo?: string; plan?: string }>
}

export default async function InvitePage({ params, searchParams }: InvitePageProps) {
  const { locale, code } = await params
  const { returnTo, plan } = await searchParams

  // Validate invite code server-side
  const validCodes = (process.env.SECRET_INVITE_CODES || '')
    .split(',')
    .map(c => c.trim())
    .filter(Boolean)

  const isValidCode = validCodes.includes(code)

  if (!isValidCode) {
    // Silent redirect to homepage for invalid codes (no enumeration)
    redirect(`/${locale}`)
  }

  // Load translations
  const authMessages = await loadNamespace(locale, 'auth')
  const commonMessages = await loadNamespace(locale, 'common')
  if (Object.keys(authMessages).length === 0) {
    notFound()
  }

  // Use invite-specific title/subtitle if available, fallback to signup translations
  const inviteTitle = authMessages.invite?.title || authMessages.signup.title
  const inviteSubtitle = authMessages.invite?.subtitle || authMessages.signup.subtitle

  return (
    <AuthLayout
      title={inviteTitle}
      subtitle={inviteSubtitle}
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
