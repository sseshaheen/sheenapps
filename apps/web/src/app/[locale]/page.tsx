import { HomeContent } from './home-content';
import { HomeContentPreview } from './home-content-preview';
import { locales, type Locale } from '@/i18n/config';
import { notFound } from 'next/navigation';
import { getAllMessagesForLocale } from '@/i18n/request';
import { loadNamespace } from '@/i18n/message-loader';
import { FEATURE_FLAGS } from '@/config/feature-flags';
import { StructuredData, MultiStructuredData } from '@/components/seo/StructuredData';
import {
  generateOrganizationSchema,
  generateSoftwareApplicationSchema,
} from '@/lib/structured-data';

// Force dynamic rendering for pages that use auth cookies
export const dynamic = 'force-dynamic';

export default async function HomePage({ 
  params 
}: { 
  params: Promise<{ locale: string }> 
}) {
  const { locale } = await params;
  if (!locales.includes(locale as Locale)) {
    notFound();
  }

  // Load messages using the helper function
  const messages = await getAllMessagesForLocale(locale);

  // Coming Soon Mode - show preview page with waitlist
  if (FEATURE_FLAGS.ENABLE_COMING_SOON_MODE) {
    // Load coming soon translations
    let comingSoonMessages = await loadNamespace(locale, 'comingSoon');
    if (Object.keys(comingSoonMessages).length === 0) {
      comingSoonMessages = await loadNamespace('en', 'comingSoon');
    }

    // Type assertion needed because loadNamespace returns Record<string, any>
    // but HomeContentPreview expects specific structure (the JSON file has correct shape)
    const previewTranslations = {
      comingSoon: comingSoonMessages as Parameters<typeof HomeContentPreview>[0]['translations']['comingSoon'],
      techTeam: {
        badge: messages.techTeam.badge,
        title: messages.techTeam.title,
        subtitle: messages.techTeam.subtitle,
        subtitleSecond: messages.techTeam.subtitleSecond,
        advisors: messages.techTeam.advisors,
        scheduleCall: messages.techTeam.scheduleCall,
        includedInPlans: messages.techTeam.includedInPlans,
        howItWorks: messages.techTeam.howItWorks,
      },
      workflow: {
        badge: messages.workflow.badge,
        title: messages.workflow.title,
        titleHighlight: messages.workflow.titleHighlight,
        subtitle: messages.workflow.subtitle,
        steps: messages.workflow.steps,
        stats: messages.workflow.stats,
      },
      locale: locale,
    };

    // SEO: Structured data for coming soon page
    const organizationSchema = generateOrganizationSchema({
      sameAs: [
        'https://twitter.com/sheenapps',
        'https://www.linkedin.com/company/sheenapps',
      ],
      contactPoint: {
        contactType: 'customer support',
        availableLanguage: ['English', 'Arabic', 'French', 'Spanish', 'German'],
      },
    });

    return (
      <>
        <StructuredData id="organization-schema" data={organizationSchema} />
        <HomeContentPreview translations={previewTranslations} />
      </>
    );
  }

  // Normal homepage
  const businessIdeas = messages.hero.businessIdeas.map((idea: string) => ({
    text: idea,
    duration: 2000,
    pauseAfter: 1500
  }));

  const translations = {
    navigation: {
      howItWorks: messages.navigation.howItWorks,
      yourTeam: messages.navigation.yourTeam,
      pricing: messages.navigation.pricing,
      features: messages.navigation.features,
      talkToAdvisor: messages.navigation.talkToAdvisor,
      startBuilding: messages.navigation.startBuilding,
      locale: locale,
    },
    hero: {
      badge: '', // messages.hero.badge.replace('{count}', '1,832'),
      title: messages.hero.title,
      titleHighlight: messages.hero.titleHighlight,
      subtitle: messages.hero.subtitle,
      subtitleSecond: messages.hero.subtitleSecond,
      demoPrompt: messages.hero.demoPrompt,
      buildingText: messages.hero.buildingText,
      buildingTextShort: messages.hero.buildingTextShort,
      startBuilding: messages.hero.startBuilding,
      startBuildingShort: messages.hero.startBuildingShort,
      useVoice: messages.hero.useVoice,
      noCreditCard: messages.hero.noCreditCard,
      demoTime: messages.hero.demoTime,
      businessIdeas: businessIdeas,
      floatingBadges: messages.hero.floatingBadges,
      trustBar: messages.hero.trustBar,
    },
    techTeam: {
      badge: messages.techTeam.badge,
      title: messages.techTeam.title,
      subtitle: messages.techTeam.subtitle,
      subtitleSecond: messages.techTeam.subtitleSecond,
      advisors: messages.techTeam.advisors,
      scheduleCall: messages.techTeam.scheduleCall,
      includedInPlans: messages.techTeam.includedInPlans,
      howItWorks: messages.techTeam.howItWorks,
    },
    workflow: {
      badge: messages.workflow.badge,
      title: messages.workflow.title,
      titleHighlight: messages.workflow.titleHighlight,
      subtitle: messages.workflow.subtitle,
      steps: messages.workflow.steps,
      stats: messages.workflow.stats,
    },
    pricing: {
      badge: messages.pricing.badge,
      title: messages.pricing.title,
      titleHighlight: messages.pricing.titleHighlight,
      subtitle: messages.pricing.subtitle,
      subtitleSecond: messages.pricing.subtitleSecond,
      billingMonthly: messages.pricing.billingMonthly,
      billingYearly: messages.pricing.billingYearly,
      billingSave: messages.pricing.billingSave,
      periodMonthly: messages.pricing.periodMonthly,
      periodYearly: messages.pricing.periodYearly,
      plans: messages.pricing.plans,
      enterprise: messages.pricing.enterprise,
      enterpriseDescription: messages.pricing.enterpriseDescription,
      guarantees: messages.pricing.guarantees,
      locale: locale,
    },
    features: {
      title: messages.features.title,
      subtitle: messages.features.subtitle,
      list: messages.features.list,
    },
    footer: {
      description: messages.footer.description,
      product: messages.footer.product,
      support: messages.footer.support,
      company: messages.footer.company,
      links: messages.footer.links,
      copyright: messages.footer.copyright,
      systemsOperational: messages.footer.systemsOperational,
      supportAvailable: messages.footer.supportAvailable,
      locale: locale,
    },
    builder: {
      floatingButton: messages.builder.floatingButton,
      ideaCapture: messages.builder.ideaCapture,
      interface: messages.builder.interface,
    },
  };

  // SEO: Structured data for homepage - Arabic-optimized for MENA region
  const isArabic = locale.startsWith('ar');

  const organizationSchema = generateOrganizationSchema({
    sameAs: [
      'https://twitter.com/sheenapps',
      'https://www.linkedin.com/company/sheenapps',
    ],
    contactPoint: {
      contactType: 'customer support',
      availableLanguage: ['English', 'Arabic', 'French', 'Spanish', 'German'],
    },
    // Arabic SEO: Regional targeting for MENA
    areaServed: [
      { name: 'Egypt', alternateName: 'مصر' },
      { name: 'Saudi Arabia', alternateName: 'المملكة العربية السعودية' },
      { name: 'United Arab Emirates', alternateName: 'الإمارات العربية المتحدة' },
      { name: 'United States' },
      { name: 'United Kingdom' },
    ],
    knowsLanguage: ['ar', 'ar-EG', 'ar-SA', 'ar-AE', 'en', 'fr', 'es', 'de'],
    slogan: isArabic ? 'فريقك التقني، إلى الأبد' : 'Your Tech Team, Forever',
    locale,
  });

  // Arabic feature list for MENA SEO
  const featureListArabic = [
    'بناء تطبيقات بالذكاء الاصطناعي',
    'تطوير بدون كود',
    'تعاون في الوقت الفعلي',
    'دعم RTL كامل للعربية',
    'خبراء بشريين للدعم',
    'دفع بالعملة المحلية',
  ];

  const featureListEnglish = [
    'AI-powered app builder',
    'No-code development',
    'Real-time collaboration',
    'Multi-language support',
    'Human expert support',
    'Local currency payments',
  ];

  const softwareSchema = generateSoftwareApplicationSchema(locale, {
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    featureList: isArabic ? featureListArabic : featureListEnglish,
  });

  return (
    <>
      <MultiStructuredData
        schemas={[
          { id: 'organization-schema', data: organizationSchema },
          { id: 'software-application-schema', data: softwareSchema },
        ]}
      />
      <HomeContent translations={translations} />
    </>
  );
}
