import { RunPageContent } from '@/components/run/run-page-content'
import { locales, type Locale } from '@/i18n/config'
import { notFound } from 'next/navigation'
import { redirect } from '@/i18n/routing'
import { getServerAuthState } from '@/lib/auth-server'
import { logger } from '@/utils/logger'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

interface RunPageProps {
  params: Promise<{ locale: string; projectId: string }>
}

export default async function RunOverviewPage({ params }: RunPageProps) {
  const { locale, projectId } = await params

  if (!locales.includes(locale as Locale)) {
    notFound()
  }

  const authState = await getServerAuthState()

  if (!authState.isAuthenticated) {
    logger.debug('general', 'Run page: User not authenticated, redirecting to login', {
      projectId,
      hasUser: !!authState.user,
      locale
    })
    const returnTo = `/${locale}/project/${projectId}/run`
    redirect({
      href: `/auth/login?returnTo=${encodeURIComponent(returnTo)}`,
      locale: locale as Locale
    })
  }

  return <RunPageContent projectId={projectId} />
}
