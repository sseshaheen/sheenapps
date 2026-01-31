import { notFound } from 'next/navigation'
import { PricingPageContent } from '@/components/pricing/pricing-page-content'
import { getNamespacedMessages } from '@/i18n/request'
import { toOgLocale } from '@/lib/seo/locale'

export const dynamic = 'force-dynamic'

interface PricingPageProps {
  params: Promise<{
    locale: string
  }>
  searchParams: Promise<{
    message?: string
  }>
}

export default async function PricingPage({ params, searchParams }: PricingPageProps) {
  const { locale } = await params
  const { message } = await searchParams
  
  // Load pricing-specific translations
  const messages = await getNamespacedMessages(locale, [
    'pricing-page',
    'pricing',
    'common',
    'billing'
  ])

  const translations = {
    pricingPage: {
      title: messages['pricing-page']?.title || 'Pricing Plans',
      subtitle: messages['pricing-page']?.subtitle || 'Choose the perfect plan for your needs',
      badge: messages['pricing-page']?.badge || 'Simple, transparent pricing',
      monthlyBilling: messages['pricing-page']?.monthlyBilling || 'Monthly',
      yearlyBilling: messages['pricing-page']?.yearlyBilling || 'Yearly',
      yearlyDiscount: messages['pricing-page']?.yearlyDiscount || 'Save 20%',
      currencyNote: messages['pricing-page']?.currencyNote || 'All prices shown in {currency}',
      loadingPlans: messages['pricing-page']?.loadingPlans || 'Loading plans...',
      errorLoading: messages['pricing-page']?.errorLoading || 'Failed to load pricing plans',
      retryButton: messages['pricing-page']?.retryButton || 'Retry',
      popularPlan: messages['pricing-page']?.popularPlan || 'Most Popular',
      subscriptions: {
        title: messages['pricing-page']?.subscriptions?.title || 'Subscription Plans',
        description: messages['pricing-page']?.subscriptions?.description || 'Monthly or yearly billing with full platform access'
      },
      features: {
        expand: messages['pricing-page']?.features?.expand || 'See all features',
        collapse: messages['pricing-page']?.features?.collapse || 'Show less'
      },
      plans: {
        free: {
          dailyBonusWithGift: messages['pricing-page']?.plans?.free?.dailyBonusWithGift || '{bonusDaily} free minutes daily + welcome gift',
          welcomeGiftOnly: messages['pricing-page']?.plans?.free?.welcomeGiftOnly || 'Welcome gift included',
          welcomeGiftFeature: messages['pricing-page']?.plans?.free?.welcomeGiftFeature || 'Welcome gift on signup'
        },
        advisor: {
          communitySupport: messages['pricing-page']?.plans?.advisor?.communitySupport || 'Community support',
          sessionsIncluded: messages['pricing-page']?.plans?.advisor?.sessionsIncluded || '{count} advisor sessions included',
          unlimitedSessions: messages['pricing-page']?.plans?.advisor?.unlimitedSessions || 'Unlimited advisor sessions',
          dailySessions: messages['pricing-page']?.plans?.advisor?.dailySessions || 'Daily advisor session'
        },
        descriptions: {
          minutesIncluded: messages['pricing-page']?.plans?.descriptions?.minutesIncluded || '{minutes} AI minutes included',
          minutesTotal: messages['pricing-page']?.plans?.descriptions?.minutesTotal || '{totalMinutes} minutes total'
        },
        features: {
          bonusMinutesDaily: messages['pricing-page']?.plans?.features?.bonusMinutesDaily || '{bonusDaily} bonus minutes/day',
          aiMinutesMonthly: messages['pricing-page']?.plans?.features?.aiMinutesMonthly || '{minutes} AI minutes/month',
          rolloverMinutes: messages['pricing-page']?.plans?.features?.rolloverMinutes || 'Up to {rolloverCap} minutes rollover'
        }
      },
      packages: {
        title: messages['pricing-page']?.packages?.title || 'One-Time Packages',
        description: messages['pricing-page']?.packages?.description || 'Top-up your account with additional credits',
        badges: {
          mostPopular: messages['pricing-page']?.packages?.badges?.mostPopular || 'Most Popular',
          bestValue: messages['pricing-page']?.packages?.badges?.bestValue || 'Best Value'
        },
        names: messages['pricing-page']?.packages?.names || {},
        features: {
          baseMinutes: messages['pricing-page']?.packages?.features?.baseMinutes || '{baseMinutes} base minutes',
          bonusMinutes: messages['pricing-page']?.packages?.features?.bonusMinutes || '+{bonusMinutes} bonus minutes',
          costPerMinute: messages['pricing-page']?.packages?.features?.costPerMinute || '{cost} per minute',
          creditsNeverExpire: messages['pricing-page']?.packages?.features?.creditsNeverExpire || 'Credits never expire',
          worksWithAnyPlan: messages['pricing-page']?.packages?.features?.worksWithAnyPlan || 'Works with any subscription'
        },
        savings: {
          saveAtLeast: messages['pricing-page']?.packages?.savings?.saveAtLeast || 'Save at least {discount}%'
        }
      },
      cta: {
        getStarted: messages['pricing-page']?.cta?.getStarted || 'Get Started',
        choosePlan: messages['pricing-page']?.cta?.choosePlan || 'Choose Plan',
        purchase: messages['pricing-page']?.cta?.purchase || 'Purchase Credits'
      },
      pricing: {
        free: messages['pricing-page']?.pricing?.free || 'Free',
        month: messages['pricing-page']?.pricing?.month || '/month',
        billedAnnually: messages['pricing-page']?.pricing?.billedAnnually || ' billed annually'
      },
      currencies: messages['pricing-page']?.currencies || {},
      guarantees: {
        title: messages['pricing-page']?.guarantees?.title || 'Our Promise to You',
        moneyBack: {
          title: messages['pricing-page']?.guarantees?.moneyBack?.title || '30-Day Money Back',
          description: messages['pricing-page']?.guarantees?.moneyBack?.description || 'Full refund if you\'re not satisfied'
        },
        cancelAnytime: {
          title: messages['pricing-page']?.guarantees?.cancelAnytime?.title || 'Cancel Anytime',
          description: messages['pricing-page']?.guarantees?.cancelAnytime?.description || 'No contracts or cancellation fees'
        },
        dataExport: {
          title: messages['pricing-page']?.guarantees?.dataExport?.title || 'Own Your Data',
          description: messages['pricing-page']?.guarantees?.dataExport?.description || 'Export everything, anytime'
        }
      }
    },
    pricing: {
      // Legacy pricing translations for compatibility
      plans: messages.pricing?.plans || {}
    },
    common: {
      loading: messages.common?.loading || 'Loading...',
      error: messages.common?.error || 'An error occurred',
      retry: messages.common?.retry || 'Retry'
    },
    billing: messages.billing || {}
  }

  // Expert: Pass message for neutral UX messaging  
  return <PricingPageContent translations={translations} locale={locale} message={message} />
}

// SEO metadata - Full Arabic support for MENA region
export async function generateMetadata({ params }: PricingPageProps) {
  const { locale } = await params

  // Arabic SEO: Regional pricing pages with local currency mentions
  const titles: Record<string, string> = {
    'en': 'Pricing Plans - SheenApps | Affordable AI App Builder',
    'ar': 'أسعار شين آبس | باقات بناء التطبيقات بالذكاء الاصطناعي',
    'ar-eg': 'أسعار شين آبس | باقات بالجنيه المصري',
    'ar-sa': 'أسعار شين آبس | باقات بالريال السعودي',
    'ar-ae': 'أسعار شين آبس | باقات بالدرهم الإماراتي',
    'fr': 'Tarifs SheenApps | Créateur d\'apps IA abordable',
    'es': 'Precios SheenApps | Constructor de apps IA asequible',
    'de': 'Preise SheenApps | Erschwinglicher KI App-Builder',
  }

  const descriptions: Record<string, string> = {
    'en': 'Choose the perfect plan for your business. Transparent pricing with no hidden fees. Start free and scale as you grow.',
    'ar': 'اختر الباقة المثالية لمشروعك. أسعار شفافة بدون رسوم مخفية. ابدأ مجاناً وتوسع مع نمو مشروعك.',
    'ar-eg': 'اختار الباقة المناسبة لشغلك. أسعار واضحة من غير مصاريف مخفية. ابدأ ببلاش وكبر مع نمو مشروعك.',
    'ar-sa': 'اختر الباقة المثالية لمشروعك. أسعار شفافة بدون رسوم مخفية. ابدأ مجاناً وتوسع مع نمو أعمالك.',
    'ar-ae': 'اختر الباقة المثالية لمشروعك. أسعار شفافة بدون رسوم مخفية. ابدأ مجاناً وتوسع مع نمو أعمالك.',
    'fr': 'Choisissez le plan parfait pour votre entreprise. Prix transparents sans frais cachés. Commencez gratuitement.',
    'es': 'Elige el plan perfecto para tu negocio. Precios transparentes sin costos ocultos. Empieza gratis.',
    'de': 'Wählen Sie den perfekten Plan für Ihr Unternehmen. Transparente Preise ohne versteckte Gebühren. Starten Sie kostenlos.',
  }

  // Arabic keywords for pricing/cost searches
  const keywords: Record<string, string[]> = {
    'ar': ['أسعار بناء تطبيقات', 'تكلفة تطبيق', 'منصة ذكاء اصطناعي', 'شين آبس أسعار'],
    'ar-eg': ['أسعار بناء تطبيقات مصر', 'تكلفة تطبيق بالجنيه', 'منصة ذكاء اصطناعي مصر'],
    'ar-sa': ['أسعار بناء تطبيقات السعودية', 'تكلفة تطبيق بالريال', 'منصة ذكاء اصطناعي السعودية'],
    'ar-ae': ['أسعار بناء تطبيقات الإمارات', 'تكلفة تطبيق بالدرهم', 'منصة ذكاء اصطناعي الإمارات'],
  }

  return {
    title: titles[locale] || titles.en,
    description: descriptions[locale] || descriptions.en,
    keywords: keywords[locale] || undefined,
    alternates: {
      canonical: locale === 'en' ? '/pricing' : `/${locale}/pricing`,
    },
    openGraph: {
      title: titles[locale] || titles.en,
      description: descriptions[locale] || descriptions.en,
      locale: toOgLocale(locale),
    },
  }
}