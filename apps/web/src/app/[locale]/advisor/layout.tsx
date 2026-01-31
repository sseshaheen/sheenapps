import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { AdvisorLayoutClient } from '@/components/advisor-network/advisor-layout-client';
import { AdvisorWorkflowHeader } from '@/components/advisor-network/advisor-workflow-header';
import { getNamespacedMessages } from '@/i18n/request';
import { locales, type Locale } from '@/i18n/config';
import { getDirection } from '@/utils/rtl';

interface AdvisorLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

// Pages that should use minimal workflow header instead of full dashboard layout
const WORKFLOW_PAGES = [
  'dashboard/onboarding',
  'application-status'
];

export default async function AdvisorLayout({ children, params }: AdvisorLayoutProps) {
  const { locale } = await params;
  const headersList = await headers();
  const pathname = headersList.get('x-pathname') || '';
  
  // Validate locale
  if (!locales.includes(locale as Locale)) {
    notFound();
  }

  // Determine if this is a workflow page that needs minimal header
  // Fix: Direct check for onboarding page that was incorrectly showing sidebar
  const isWorkflowPage = pathname.includes('/onboarding') || pathname.includes('application-status');

  // Load translations using namespace approach
  const messages = await getNamespacedMessages(locale, ['advisor', 'common']);

  const translations = {
    advisor: {
      navigation: {
        dashboard: messages.advisor?.dashboard?.navigation?.dashboard || 'Dashboard',
        profile: messages.advisor?.dashboard?.navigation?.profile || 'Profile',
        consultations: messages.advisor?.dashboard?.navigation?.consultations || 'Consultations',
        availability: messages.advisor?.dashboard?.navigation?.availability || 'Availability',
        earnings: messages.advisor?.dashboard?.navigation?.earnings || 'Earnings',
        analytics: messages.advisor?.dashboard?.navigation?.analytics || 'Analytics',
        settings: messages.advisor?.dashboard?.navigation?.settings || 'Settings',
        more: messages.advisor?.dashboard?.navigation?.more || 'More'
      },
      layout: {
        backToDashboard: messages.advisor?.dashboard?.layout?.backToDashboard || 'Back to Dashboard',
        viewPublicProfile: messages.advisor?.dashboard?.layout?.viewPublicProfile || 'View Public Profile',
        quickStats: messages.advisor?.dashboard?.layout?.quickStats || 'Quick Stats',
        status: messages.advisor?.dashboard?.layout?.status || 'Status',
        rating: messages.advisor?.dashboard?.layout?.rating || 'Rating',
        reviews: messages.advisor?.dashboard?.layout?.reviews || 'Reviews',
        available: messages.advisor?.dashboard?.layout?.available || 'Available',
        unavailable: messages.advisor?.dashboard?.layout?.unavailable || 'Unavailable'
      },
      dashboard: {
        title: messages.advisor?.dashboard?.title || 'Advisor Dashboard',
        welcome: messages.advisor?.dashboard?.welcome || 'Welcome back'
      },
      errors: {
        title: messages.advisor?.errors?.title || 'Advisor System Error',
        description: messages.advisor?.errors?.description || 'Something went wrong with the advisor system. This might be a temporary issue.',
        actions: {
          retry: messages.advisor?.errors?.actions?.retry || 'Try Again',
          goHome: messages.advisor?.errors?.actions?.goHome || 'Go to Dashboard',
          applyToAdvisor: messages.advisor?.errors?.actions?.applyToAdvisor || 'Apply to Become Advisor'
        }
      }
    },
    common: {
      loading: messages.common?.loading || 'Loading...',
      close: messages.common?.close || 'Close'
    }
  };

  // Use workflow header for onboarding-style pages, full layout for dashboard pages
  if (isWorkflowPage) {
    return (
      <div dir={getDirection(locale)}>
        <AdvisorWorkflowHeader 
          locale={locale} 
          translations={{
            backToDashboard: translations.advisor.layout.backToDashboard,
            viewPublicProfile: translations.advisor.layout.viewPublicProfile
          }}
        />
        {children}
      </div>
    );
  }

  return (
    <AdvisorLayoutClient translations={translations} locale={locale}>
      {children}
    </AdvisorLayoutClient>
  );
}