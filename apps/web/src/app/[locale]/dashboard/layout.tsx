import { notFound } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard/dashboard-layout'
import { getNamespacedMessages } from '@/i18n/request'

interface DashboardLayoutProps {
  children: React.ReactNode
  params: Promise<{
    locale: string
  }>
}

export default async function Layout({ children, params }: DashboardLayoutProps) {
  const { locale } = await params

  // Load only the namespaces this layout needs
  const messages = await getNamespacedMessages(locale, [
    'dashboard',
    'navigation',
    'common',
    'userMenu'
  ])

  // Extract dashboard-specific translations
  const translations = {
    dashboard: {
      title: messages.dashboard?.title || 'Dashboard',
      subtitle: messages.dashboard?.subtitle || 'Manage your projects',
    },
    navigation: messages.navigation || {},
    common: {
      cancel: messages.common?.cancel || 'Cancel',
      confirm: messages.common?.confirm || 'Confirm',
      save: messages.common?.save || 'Save',
      loading: messages.common?.loading || 'Loading...',
      error: messages.common?.error || 'An error occurred',
      success: messages.common?.success || 'Success',
    },
  }

  return (
    <DashboardLayout translations={translations} locale={locale}>
      {children}
    </DashboardLayout>
  )
}