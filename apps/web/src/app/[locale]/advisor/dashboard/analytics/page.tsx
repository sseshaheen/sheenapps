import { notFound } from 'next/navigation';
import { AdvisorAnalyticsContent } from '@/components/advisor-network/advisor-analytics-content';
import { getNamespacedMessages } from '@/i18n/request';
import { locales, type Locale } from '@/i18n/config';
import { getCurrentUserId, getAdvisorState, getAdvisorRedirect } from '@/utils/advisor-state';
import { redirectWithLocale } from '@/utils/navigation';

interface AdvisorAnalyticsPageProps {
  params: Promise<{ locale: string }>;
}

export default async function AdvisorAnalyticsPage({ params }: AdvisorAnalyticsPageProps) {
  const { locale } = await params;
  
  // Validate locale
  if (!locales.includes(locale as Locale)) {
    notFound();
  }

  // Check user's advisor state and redirect if necessary
  const userId = await getCurrentUserId();
  const advisorState = await getAdvisorState(userId, locale);
  
  // Check if user should be redirected based on their state
  const redirectUrl = getAdvisorRedirect(advisorState.state, '/advisor/dashboard/analytics', locale);
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
        analytics: {
          title: messages.advisor?.dashboard?.analytics?.title || 'Analytics',
          overview: messages.advisor?.dashboard?.analytics?.overview || 'Performance Overview',
          consultations: messages.advisor?.dashboard?.analytics?.consultations || 'Consultations',
          earnings: messages.advisor?.dashboard?.analytics?.earnings || 'Earnings',
          performance: messages.advisor?.dashboard?.analytics?.performance || 'Performance',
          trends: messages.advisor?.dashboard?.analytics?.trends || 'Trends',
          period: {
            '30d': messages.advisor?.dashboard?.analytics?.period?.['30d'] || 'Last 30 Days',
            '90d': messages.advisor?.dashboard?.analytics?.period?.['90d'] || 'Last 90 Days',
            '1y': messages.advisor?.dashboard?.analytics?.period?.['1y'] || 'Last Year'
          },
          metrics: {
            totalConsultations: messages.advisor?.dashboard?.analytics?.metrics?.totalConsultations || 'Total Consultations',
            totalEarnings: messages.advisor?.dashboard?.analytics?.metrics?.totalEarnings || 'Total Earnings',
            averageRating: messages.advisor?.dashboard?.analytics?.metrics?.averageRating || 'Average Rating',
            profileViews: messages.advisor?.dashboard?.analytics?.metrics?.profileViews || 'Profile Views',
            conversionRate: messages.advisor?.dashboard?.analytics?.metrics?.conversionRate || 'Conversion Rate',
            freeConsultations: messages.advisor?.dashboard?.analytics?.metrics?.freeConsultations || 'Free Consultations',
            paidConsultations: messages.advisor?.dashboard?.analytics?.metrics?.paidConsultations || 'Paid Consultations',
            consultationGrowth: messages.advisor?.dashboard?.analytics?.metrics?.consultationGrowth || 'Consultation Growth',
            earningsGrowth: messages.advisor?.dashboard?.analytics?.metrics?.earningsGrowth || 'Earnings Growth'
          },
          charts: {
            consultationsByDuration: messages.advisor?.dashboard?.analytics?.charts?.consultationsByDuration || 'Consultations by Duration',
            consultationsByType: messages.advisor?.dashboard?.analytics?.charts?.consultationsByType || 'Consultations by Type',
            earningsOverTime: messages.advisor?.dashboard?.analytics?.charts?.earningsOverTime || 'Earnings Over Time',
            ratingsTrend: messages.advisor?.dashboard?.analytics?.charts?.ratingsTrend || 'Ratings Trend'
          }
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
      noData: messages.common?.noData || 'No data available'
    }
  };

  return (
    <AdvisorAnalyticsContent 
      translations={translations}
      locale={locale}
    />
  );
}

export async function generateMetadata({ params }: AdvisorAnalyticsPageProps) {
  const { locale } = await params;
  
  // Validate locale
  if (!locales.includes(locale as Locale)) {
    return {
      title: 'Advisor Analytics - SheenApps',
      description: 'View your advisor performance analytics and insights.'
    };
  }

  const messages = await getNamespacedMessages(locale, ['advisor']);

  return {
    title: messages.advisor?.dashboard?.analytics?.title + ' - SheenApps' || 'Advisor Analytics - SheenApps',
    description: 'View your advisor performance analytics and insights.'
  };
}