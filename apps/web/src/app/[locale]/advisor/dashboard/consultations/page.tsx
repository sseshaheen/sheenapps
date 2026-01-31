import { notFound } from 'next/navigation';
import { AdvisorConsultationsContent } from '@/components/advisor-network/advisor-consultations-content';
import { getNamespacedMessages } from '@/i18n/request';
import { locales, type Locale } from '@/i18n/config';
import { getCurrentUserId, getAdvisorState, getAdvisorRedirect } from '@/utils/advisor-state';
import { redirectWithLocale } from '@/utils/navigation';

interface AdvisorConsultationsPageProps {
  params: Promise<{ locale: string }>;
}

export default async function AdvisorConsultationsPage({ params }: AdvisorConsultationsPageProps) {
  const { locale } = await params;
  
  // Validate locale
  if (!locales.includes(locale as Locale)) {
    notFound();
  }

  // Check user's advisor state and redirect if necessary
  const userId = await getCurrentUserId();
  const advisorState = await getAdvisorState(userId, locale);
  
  // Check if user should be redirected based on their state
  const redirectUrl = getAdvisorRedirect(advisorState.state, '/advisor/dashboard/consultations', locale);
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
        consultations: {
          title: messages.advisor?.dashboard?.consultations?.title || 'Consultations',
          upcoming: messages.advisor?.dashboard?.consultations?.upcoming || 'Upcoming',
          completed: messages.advisor?.dashboard?.consultations?.completed || 'Completed',
          all: messages.advisor?.dashboard?.consultations?.all || 'All',
          empty: messages.advisor?.dashboard?.consultations?.empty || 'No consultations found',
          client: messages.advisor?.dashboard?.consultations?.client || 'Client',
          duration: messages.advisor?.dashboard?.consultations?.duration || 'Duration',
          status: messages.advisor?.dashboard?.consultations?.status || 'Status',
          scheduled: messages.advisor?.dashboard?.consultations?.scheduled || 'Scheduled',
          free: messages.advisor?.dashboard?.consultations?.free || 'Free',
          paid: messages.advisor?.dashboard?.consultations?.paid || 'Paid',
          viewDetails: messages.advisor?.dashboard?.consultations?.viewDetails || 'View Details',
          notes: messages.advisor?.dashboard?.consultations?.notes || 'Notes',
          addNotes: messages.advisor?.dashboard?.consultations?.addNotes || 'Add Notes',
          loadMore: messages.advisor?.dashboard?.consultations?.loadMore || 'Load More'
        },
        navigation: {
          overview: messages.advisor?.dashboard?.navigation?.overview || 'Overview',
          consultations: messages.advisor?.dashboard?.navigation?.consultations || 'Consultations',
          analytics: messages.advisor?.dashboard?.navigation?.analytics || 'Analytics',
          availability: messages.advisor?.dashboard?.navigation?.availability || 'Availability',
          settings: messages.advisor?.dashboard?.navigation?.settings || 'Settings'
        }
      }
    },
    common: {
      loading: messages.common?.loading || 'Loading...',
      error: messages.common?.error || 'Something went wrong',
      retry: messages.common?.retry || 'Try again',
      save: messages.common?.save || 'Save',
      cancel: messages.common?.cancel || 'Cancel'
    }
  };

  return (
    <AdvisorConsultationsContent 
      translations={translations}
      locale={locale}
    />
  );
}

export async function generateMetadata({ params }: AdvisorConsultationsPageProps) {
  const { locale } = await params;
  
  // Validate locale
  if (!locales.includes(locale as Locale)) {
    return {
      title: 'Advisor Consultations - SheenApps',
      description: 'Manage and view your advisor consultations.'
    };
  }

  const messages = await getNamespacedMessages(locale, ['advisor']);

  return {
    title: messages.advisor?.dashboard?.consultations?.title + ' - SheenApps' || 'Advisor Consultations - SheenApps',
    description: 'Manage and view your advisor consultations.'
  };
}