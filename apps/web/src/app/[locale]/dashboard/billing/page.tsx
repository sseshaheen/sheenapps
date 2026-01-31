import { notFound } from 'next/navigation'
import { BillingContent } from '@/components/dashboard/billing-content'
import { getNamespacedMessages } from '@/i18n/request'

export const dynamic = 'force-dynamic'

interface BillingPageProps {
  params: Promise<{
    locale: string
  }>
}

export default async function BillingPage({ params }: BillingPageProps) {
  const { locale } = await params
  
  // Load only the namespaces this page needs
  const messages = await getNamespacedMessages(locale, [
    'billing',
    'dashboard',
    'navigation',
    'common'
  ])

  // Extract billing-specific translations
  const translations = {
    billing: {
      title: messages.billing?.title || 'Billing & Subscription',
      subtitle: messages.billing?.subtitle || 'Manage your subscription and billing',
      currentPlan: messages.billing?.currentPlan || 'Current Plan',
      free: messages.billing?.free || 'Free',
      basic: messages.billing?.basic || 'Basic',
      pro: messages.billing?.pro || 'Pro',
      enterprise: messages.billing?.enterprise || 'Enterprise',
      starter: messages.billing?.starter || 'Starter',
      growth: messages.billing?.growth || 'Growth',
      scale: messages.billing?.scale || 'Scale',
      usage: messages.billing?.usage || 'Usage',
      projects: messages.billing?.projects || 'Projects',
      aiGenerations: messages.billing?.aiGenerations || 'AI Generations',
      exports: messages.billing?.exports || 'Exports',
      storage: messages.billing?.storage || 'Storage',
      unlimited: messages.billing?.unlimited || 'Unlimited',
      upgrade: messages.billing?.upgrade || 'Upgrade',
      manage: messages.billing?.manage || 'Manage Subscription',
      portal: messages.billing?.portal || 'Billing Portal',
      invoices: messages.billing?.invoices || 'Invoices',
      active: messages.billing?.active || 'Active',
      canceled: messages.billing?.canceled || 'Canceled',
      pastDue: messages.billing?.pastDue || 'Past Due',
      trialing: messages.billing?.trialing || 'Trial',
      of: messages.billing?.of || 'of',
      used: messages.billing?.used || 'used',
      remaining: messages.billing?.remaining || 'remaining',
      perMonth: messages.billing?.perMonth || '/month',
      loading: messages.billing?.loading || 'Loading billing information...',
      error: messages.billing?.error || 'Error loading billing information',
      retry: messages.billing?.retry || 'Retry',
    },
    dashboard: messages.dashboard || {},
    navigation: messages.navigation || {},
  }

  return <BillingContent translations={translations} locale={locale} />
}