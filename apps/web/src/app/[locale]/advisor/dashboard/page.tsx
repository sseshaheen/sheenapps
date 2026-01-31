import { notFound } from 'next/navigation';
import { AdvisorDashboardContent } from '@/components/advisor-network/advisor-dashboard-content';
import { getNamespacedMessages } from '@/i18n/request';
import { locales, type Locale } from '@/i18n/config';
import { getCurrentUserId, getAdvisorState, getAdvisorRedirect } from '@/utils/advisor-state';
import { redirectWithLocale } from '@/utils/navigation';

interface AdvisorDashboardPageProps {
  params: Promise<{ locale: string }>;
}

export default async function AdvisorDashboardPage({ params }: AdvisorDashboardPageProps) {
  const { locale } = await params;
  
  // Validate locale
  if (!locales.includes(locale as Locale)) {
    notFound();
  }

  // Check user's advisor state and redirect if necessary
  const userId = await getCurrentUserId();
  const advisorState = await getAdvisorState(userId, locale);
  
  // Check if user should be redirected based on their state
  const redirectUrl = getAdvisorRedirect(advisorState.state, '/advisor/dashboard', locale);
  if (redirectUrl) {
    redirectWithLocale(redirectUrl, locale);
  }
  
  // Only LIVE advisors should reach this point
  if (advisorState.state !== 'LIVE') {
    redirectWithLocale('/advisor/apply', locale);
  }

  // Load translations using namespace approach
  const messages = await getNamespacedMessages(locale, ['advisor', 'common']);

  const translations = {
    advisor: {
      dashboard: {
        title: messages.advisor?.dashboard?.title || 'Advisor Dashboard',
        welcome: messages.advisor?.dashboard?.welcome || 'Welcome back',
        earnings: {
          title: messages.advisor?.dashboard?.earnings?.title || 'Earnings',
          thisMonth: messages.advisor?.dashboard?.earnings?.thisMonth || 'This Month',
          lastMonth: messages.advisor?.dashboard?.earnings?.lastMonth || 'Last Month',
          lifetime: messages.advisor?.dashboard?.earnings?.lifetime || 'Lifetime Total',
          pendingPayout: messages.advisor?.dashboard?.earnings?.pendingPayout || 'Pending Payout',
          nextPayout: messages.advisor?.dashboard?.earnings?.nextPayout || 'Next Payout',
          consultations: messages.advisor?.dashboard?.earnings?.consultations || 'Consultations'
        },
        availability: {
          title: messages.advisor?.dashboard?.availability?.title || 'Availability Status',
          accepting: messages.advisor?.dashboard?.availability?.accepting || 'Accepting Bookings',
          paused: messages.advisor?.dashboard?.availability?.paused || 'Paused',
          toggle: messages.advisor?.dashboard?.availability?.toggle || 'Toggle Availability'
        },
        onboarding: {
          title: messages.advisor?.dashboard?.onboarding?.title || 'Complete Your Setup',
          stripe: messages.advisor?.dashboard?.onboarding?.stripe || 'Connect Stripe for Payouts',
          calcom: messages.advisor?.dashboard?.onboarding?.calcom || 'Connect Cal.com for Scheduling',
          profile: messages.advisor?.dashboard?.onboarding?.profile || 'Complete Your Profile'
        },
        consultations: {
          title: messages.advisor?.dashboard?.consultations?.title || 'Upcoming Consultations',
          empty: messages.advisor?.dashboard?.consultations?.empty || 'No upcoming consultations',
          viewAll: messages.advisor?.dashboard?.consultations?.viewAll || 'View All Consultations',
          free: messages.advisor?.dashboard?.consultations?.free || 'Free',
          paid: messages.advisor?.dashboard?.consultations?.paid || 'Paid'
        }
      }
    },
    common: {
      loading: messages.common?.loading || 'Loading...',
      error: messages.common?.error || 'Something went wrong',
      retry: messages.common?.retry || 'Try again'
    }
  };

  return (
    <AdvisorDashboardContent 
      translations={translations}
      locale={locale}
    />
  );
}

export async function generateMetadata({ params }: AdvisorDashboardPageProps) {
  const { locale } = await params;
  
  // Validate locale
  if (!locales.includes(locale as Locale)) {
    return {
      title: 'Advisor Dashboard - SheenApps',
      description: 'Manage your advisor profile, view earnings, and track consultations.'
    };
  }

  const messages = await getNamespacedMessages(locale, ['advisor']);

  return {
    title: messages.advisor?.dashboard?.title || 'Advisor Dashboard - SheenApps',
    description: 'Manage your advisor profile, view earnings, and track consultations.'
  };
}