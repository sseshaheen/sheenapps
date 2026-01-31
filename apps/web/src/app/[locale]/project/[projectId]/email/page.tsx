import { locales, type Locale } from '@/i18n/config'
import { notFound } from 'next/navigation'
import { redirect } from '@/i18n/routing'
import { getServerAuthState } from '@/lib/auth-server'
import { EmailDashboard } from '@/components/project/email/EmailDashboard'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

interface EmailPageProps {
  params: Promise<{ locale: string; projectId: string }>
}

export default async function EmailPage({ params }: EmailPageProps) {
  const { locale, projectId } = await params

  if (!locales.includes(locale as Locale)) {
    notFound()
  }

  const authState = await getServerAuthState()

  if (!authState.isAuthenticated) {
    const returnTo = `/${locale}/project/${projectId}/email`
    redirect({
      href: `/auth/login?returnTo=${encodeURIComponent(returnTo)}`,
      locale: locale as Locale,
    })
  }

  return <EmailDashboard projectId={projectId} />
}
