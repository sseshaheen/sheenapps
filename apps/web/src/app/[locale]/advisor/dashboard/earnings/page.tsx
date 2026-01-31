import { notFound } from 'next/navigation';
import { AdvisorEarningsContent } from '@/components/advisor-network/advisor-earnings-content';
import { getNamespacedMessages } from '@/i18n/request';
import { locales, type Locale } from '@/i18n/config';

interface AdvisorEarningsPageProps {
  params: Promise<{ locale: string }>;
}

export default async function AdvisorEarningsPage(props: AdvisorEarningsPageProps) {
  const params = await props.params;
  
  // Validate locale
  if (!locales.includes(params.locale as Locale)) {
    notFound();
  }

  // Load translations using namespace approach
  const messages = await getNamespacedMessages(params.locale, ['advisor']);

  const translations = {
    earnings: {
      title: messages.dashboard?.earnings?.title || 'Earnings',
      thisMonth: messages.dashboard?.earnings?.thisMonth || 'This Month',
      lastMonth: messages.dashboard?.earnings?.lastMonth || 'Last Month',
      lifetime: messages.dashboard?.earnings?.lifetime || 'Lifetime Total',
      pendingPayout: messages.dashboard?.earnings?.pendingPayout || 'Pending Payout',
      nextPayout: messages.dashboard?.earnings?.nextPayout || 'Next Payout',
      consultations: messages.dashboard?.earnings?.consultations || 'Consultations'
    }
  };
  
  return (
    <div className="min-h-screen bg-background">
      {/* Header spacer - semantic approach */}
      <div className="header-spacer" aria-hidden="true" />
      
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-4">
            {translations.earnings.title}
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Track your consultation earnings and payout history
          </p>
        </div>
        
        {/* Earnings content will be implemented in a separate component */}
        <div className="max-w-4xl mx-auto">
          <AdvisorEarningsContent translations={translations} />
        </div>
      </div>
    </div>
  );
}

export async function generateMetadata(props: AdvisorEarningsPageProps) {
  const params = await props.params;

  // Validate locale
  if (!locales.includes(params.locale as Locale)) {
    return {
      title: 'Advisor Earnings - SheenApps',
      description: 'Track your consultation earnings, view payout history, and manage your advisor income.'
    };
  }

  // Load translations for metadata
  const messages = await getNamespacedMessages(params.locale, ['advisor']);

  return {
    title: (messages.advisor?.dashboard?.earnings?.title || 'Advisor Earnings') + ' - SheenApps',
    description: 'Track your consultation earnings, view payout history, and manage your advisor income.'
  };
}