import { AdvisorLandingClientWithTranslations } from '@/components/advisor-network/advisor-landing-client-i18n';
import { locales, type Locale } from '@/i18n/config';
import { redirectWithLocale } from '@/utils/navigation';

interface AdvisorLandingPageProps {
  params: Promise<{ locale: string }>;
}

/**
 * Client-Facing Advisor Landing Page
 * Uses client-side translations with useTranslations hooks for proper i18n
 */
export default async function AdvisorLandingPage({ params }: AdvisorLandingPageProps) {
  const { locale } = await params;

  // Validate locale
  if (!locales.includes(locale as Locale)) {
    redirectWithLocale('/advisor', locale);
  }

  // Pass locale to client component for useTranslations hooks
  return <AdvisorLandingClientWithTranslations locale={locale} />;
}

export async function generateMetadata({ params }: AdvisorLandingPageProps) {
  const { locale } = await params;

  return {
    title: 'Get Expert Engineering Help - SheenApps',
    description: 'Get unstuck fast with expert software engineers. Architecture reviews, code reviews, and debugging sessions.',
    keywords: 'software engineering help, code review expert, technical advisor, architecture review, debugging sessions',
    openGraph: {
      title: 'Get Expert Engineering Help',
      description: 'Connect with experienced software engineers for personalized guidance and consultations.',
      type: 'website',
    },
  };
}