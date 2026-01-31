/**
 * 🪄 Magic Link Authentication Page
 * Passwordless sign-in experience
 */

import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { MagicLinkForm } from '@/components/auth/magic-link-form'
import { AuthLayout } from '@/components/auth/auth-layout'
import { loadNamespace } from '@/i18n/message-loader'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ returnTo?: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  await params // Consume params to avoid unused variable warning
  return {
    title: 'Magic Link Sign In - SheenApps',
    description: 'Sign in securely without a password using our magic link authentication',
  }
}

export default async function MagicLinkPage({ params, searchParams }: PageProps) {
  const { locale } = await params
  const { returnTo } = await searchParams

  // Load translations
  const authMessages = await loadNamespace(locale, 'auth')
  const commonMessages = await loadNamespace(locale, 'common')
  if (Object.keys(authMessages).length === 0) {
    notFound()
  }


  const translations = {
    title: authMessages.magicLink?.title || 'Magic Link',
    subtitle: authMessages.magicLink?.subtitle || 'Passwordless authentication',
    magicLink: authMessages.magicLink || {}
  }

  return (
    <AuthLayout
      title={translations.title}
      subtitle={translations.subtitle}
      locale={locale}
      commonTranslations={commonMessages as { authLayout: typeof commonMessages.authLayout }}
    >
      <MagicLinkForm
        returnTo={returnTo}
        locale={locale}
        translations={translations.magicLink}
      />
    </AuthLayout>
  )
}