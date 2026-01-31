import { notFound } from 'next/navigation'
import { ReferralsDashboard } from '@/components/dashboard/referrals-dashboard'
import { getNamespacedMessages } from '@/i18n/request'

export const dynamic = 'force-dynamic'

interface ReferralsPageProps {
  params: Promise<{ locale: string }>
}

export default async function ReferralsPage({ params }: ReferralsPageProps) {
  const { locale } = await params
  
  // Load only the namespaces this page needs
  const messages = await getNamespacedMessages(locale, [
    'dashboard',
    'referral',
    'common'
  ])

  const translations = {
    dashboard: {
      title: messages.dashboard?.title || 'Dashboard',
      subtitle: messages.dashboard?.subtitle || 'Manage your account',
    },
    referrals: messages.referral?.dashboard || {
      title: 'Referrals Dashboard',
      partnerCode: 'Partner Code',
      copyLink: 'Copy Referral Link',
      linkCopied: 'Link copied!',
      generateButton: 'Generate Referral Code',
      stats: {
        clicks: 'Total Clicks',
        signups: 'Signups',
        pending: 'Pending Earnings',
      }
    }
  }

  return (
    <ReferralsDashboard 
      translations={translations}
      locale={locale}
    />
  )
}