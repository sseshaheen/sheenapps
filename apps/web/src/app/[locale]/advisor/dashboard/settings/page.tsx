import { redirect, notFound } from 'next/navigation';
import { AdvisorSettingsContent } from '@/components/advisor-network/advisor-settings-content';
import { getNamespacedMessages } from '@/i18n/request';
import { locales, type Locale } from '@/i18n/config';
import { getCurrentUserId, getAdvisorState, getAdvisorRedirect } from '@/utils/advisor-state';
import { redirectWithLocale } from '@/utils/navigation';

interface AdvisorSettingsPageProps {
  params: Promise<{ locale: string }>;
}

export default async function AdvisorSettingsPage({ params }: AdvisorSettingsPageProps) {
  const { locale } = await params;
  
  // Validate locale
  if (!locales.includes(locale as Locale)) {
    notFound();
  }

  // Check user's advisor state and redirect if necessary
  const userId = await getCurrentUserId();
  const advisorState = await getAdvisorState(userId, locale);
  
  // Check if user should be redirected based on their state
  const redirectUrl = getAdvisorRedirect(advisorState.state, '/advisor/dashboard/settings', locale);
  if (redirectUrl) {
    redirectWithLocale(redirectUrl, locale);
  }
  
  // Only LIVE advisors should reach this point
  if (advisorState.state !== 'LIVE') {
    redirectWithLocale('/${locale}/advisor/apply', locale);
  }

  // Load translations using namespace approach
  const messages = await getNamespacedMessages(locale, ['advisor', 'common']);

  const translations = {
    advisor: {
      dashboard: {
        settings: {
          title: messages.advisor?.dashboard?.settings?.title || 'Settings',
          pricing: messages.advisor?.dashboard?.settings?.pricing || 'Pricing Settings',
          consultations: messages.advisor?.dashboard?.settings?.consultations || 'Consultation Settings',
          pricingModel: {
            title: messages.advisor?.dashboard?.settings?.pricingModel?.title || 'Pricing Model',
            description: messages.advisor?.dashboard?.settings?.pricingModel?.description || 'Choose how you want to price your consultations',
            platformFixed: {
              title: messages.advisor?.dashboard?.settings?.pricingModel?.platformFixed?.title || 'Platform Fixed',
              description: messages.advisor?.dashboard?.settings?.pricingModel?.platformFixed?.description || 'Use platform-set prices for all consultations'
            },
            freeOnly: {
              title: messages.advisor?.dashboard?.settings?.pricingModel?.freeOnly?.title || 'Free Only',
              description: messages.advisor?.dashboard?.settings?.pricingModel?.freeOnly?.description || 'Offer only free consultations'
            },
            hybrid: {
              title: messages.advisor?.dashboard?.settings?.pricingModel?.hybrid?.title || 'Hybrid',
              description: messages.advisor?.dashboard?.settings?.pricingModel?.hybrid?.description || 'Mix of free and paid consultations'
            }
          },
          freeConsultations: {
            title: messages.advisor?.dashboard?.settings?.freeConsultations?.title || 'Free Consultation Durations',
            description: messages.advisor?.dashboard?.settings?.freeConsultations?.description || 'Select which consultation durations you want to offer for free',
            duration15: messages.advisor?.dashboard?.settings?.freeConsultations?.duration15 || '15 minutes',
            duration30: messages.advisor?.dashboard?.settings?.freeConsultations?.duration30 || '30 minutes',
            duration60: messages.advisor?.dashboard?.settings?.freeConsultations?.duration60 || '60 minutes',
            note: messages.advisor?.dashboard?.settings?.freeConsultations?.note || 'Free consultations help build trust and can lead to paid sessions'
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
      save: messages.common?.save || 'Save',
      cancel: messages.common?.cancel || 'Cancel',
      saving: messages.common?.saving || 'Saving...',
      saved: messages.common?.saved || 'Saved successfully'
    }
  };

  return (
    <AdvisorSettingsContent 
      translations={translations}
      locale={locale}
    />
  );
}

export async function generateMetadata({ params }: AdvisorSettingsPageProps) {
  const { locale } = await params;
  
  // Validate locale
  if (!locales.includes(locale as Locale)) {
    return {
      title: 'Advisor Settings - SheenApps',
      description: 'Manage your advisor settings and pricing configuration.'
    };
  }

  const messages = await getNamespacedMessages(locale, ['advisor']);

  return {
    title: messages.advisor?.dashboard?.settings?.title + ' - SheenApps' || 'Advisor Settings - SheenApps',
    description: 'Manage your advisor settings and pricing configuration.'
  };
}