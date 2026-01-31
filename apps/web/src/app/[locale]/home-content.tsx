"use client"

import dynamic from 'next/dynamic'
// import { I18nShowcase } from "@/components/demo/i18n-showcase"
// Keep Hero synchronous - it's above the fold and critical for LCP
import { HeroV2Client } from "@/components/sections/hero-v2-client"
import { ReferralBanner } from "@/components/referral/referral-banner"
import { useReferralTracking } from "@/hooks/use-referral-tracking"
import { useLocale } from 'next-intl'

// 📦 PERFORMANCE: Lazy-load below-the-fold sections to reduce initial bundle
// These sections are not visible on first paint, so we can defer loading them
// NOTE: Using ssr: true intentionally for SEO on marketing page (pricing, features, footer
// are indexed by search engines). The code-splitting still reduces initial JS bundle.
const TechTeamClient = dynamic(
  () => import("@/components/sections/tech-team-client").then(mod => mod.TechTeamClient),
  { ssr: true }
)

const FeatureWorkflowClient = dynamic(
  () => import("@/components/sections/feature-workflow-client").then(mod => mod.FeatureWorkflowClient),
  { ssr: true }
)

const PricingClient = dynamic(
  () => import("@/components/sections/pricing-client").then(mod => mod.PricingClient),
  { ssr: true }
)

const FeaturesClient = dynamic(
  () => import("@/components/sections/features-client").then(mod => mod.FeaturesClient),
  { ssr: true }
)

const FooterClient = dynamic(
  () => import("@/components/layout/footer-client").then(mod => mod.FooterClient),
  { ssr: true }
)

// Builder is a floating button, not immediately needed
const BuilderWrapper = dynamic(
  () => import("@/components/builder/builder-wrapper").then(mod => mod.BuilderWrapper),
  { ssr: false } // Client-only since it uses browser APIs
)

interface HomeContentProps {
  translations: {
    navigation: {
      howItWorks: string;
      yourTeam: string;
      pricing: string;
      features: string;
      talkToAdvisor: string;
      startBuilding: string;
      locale: string;
    };
    hero: {
      badge: string;
      title: string;
      titleHighlight: string;
      subtitle: string;
      subtitleSecond: string;
      demoPrompt: string;
      buildingText: string;
      buildingTextShort: string;
      startBuilding: string;
      startBuildingShort: string;
      useVoice: string;
      noCreditCard: string;
      demoTime: string;
      businessIdeas: Array<{
        text: string;
        duration: number;
        pauseAfter: number;
      }>;
      floatingBadges: {
        aiHumans: string;
        sameDayFeatures: string;
      };
      trustBar: {
        featuresCount: string;
        avgDeployTime: string;
        avgDeployTimeShort: string;
        successRate: string;
      };
    };
    techTeam: {
      badge: string;
      title: string;
      subtitle: string;
      subtitleSecond: string;
      advisors: {
        ahmed: { name: string; role: string; language: string; specialties: string[]; availability: string; };
        sarah: { name: string; role: string; language: string; specialties: string[]; availability: string; };
        pierre: { name: string; role: string; language: string; specialties: string[]; availability: string; };
      };
      scheduleCall: string;
      includedInPlans: string;
      howItWorks: {
        title: string;
        instantChat: {
          title: string;
          description: string;
        };
        scheduledCalls: {
          title: string;
          description: string;
        };
        proactiveUpdates: {
          title: string;
          description: string;
        };
      };
    };
    workflow: {
      badge: string;
      title: string;
      titleHighlight: string;
      subtitle: string;
      steps: Array<{ title: string; description: string; time?: string; output?: string; }>;
      stats: Array<{ label: string; value: string; trend?: string; }>;
    };
    pricing: {
      badge: string;
      title: string;
      titleHighlight: string;
      subtitle: string;
      subtitleSecond: string;
      billingMonthly: string;
      billingYearly: string;
      billingSave: string;
      periodMonthly: string;
      periodYearly: string;
      plans: {
        free: Record<string, unknown>;
        starter: Record<string, unknown>;
        growth: Record<string, unknown>;
        scale: Record<string, unknown>;
      };
      enterprise: string;
      enterpriseDescription: string;
      guarantees: {
        moneyBack: Record<string, unknown>;
        cancel: Record<string, unknown>;
        export: Record<string, unknown>;
      };
      locale: string;
    };
    features: {
      title: string;
      subtitle: string;
      list: Array<{ title: string; description: string; }>;
    };
    footer: {
      description: string;
      product: string;
      support: string;
      company: string;
      links: {
        howItWorks: string;
        pricing: string;
        features: string;
        templates: string;
        integrations: string;
        talkToAdvisor: string;
        helpCenter: string;
        community: string;
        status: string;
        bookCall: string;
        about: string;
        blog: string;
        careers: string;
        privacy: string;
        terms: string;
      };
      copyright: string;
      systemsOperational: string;
      supportAvailable: string;
      locale: string;
    };
    builder: {
      floatingButton: string;
      ideaCapture: {
        title: string;
        description: string;
        placeholder: string;
        submitButton: string;
        voiceButton: string;
        attachButton: string;
        examples: string[];
      };
      interface: {
        chat: {
          title: string;
          thinking: string;
        };
        preview: {
          title: string;
          loading: string;
        };
        buildLog: {
          title: string;
          steps: {
            analyzing: string;
            scaffolding: string;
            generating: string;
            styling: string;
            deploying: string;
          };
        };
      };
    };
  };
}

export function HomeContent({ translations }: HomeContentProps) {
  // ✅ REFERRAL TRACKING: Track referral codes from URL and clean URLs for SEO
  useReferralTracking({ showToasts: true, trackClicks: true })
  const locale = useLocale()

  return (
    <>
      <main className="min-h-screen pt-14 sm:pt-16">
        {/* ✅ REFERRAL BANNER: Show when users arrive via referral link */}
        <div className="container mx-auto px-4 sm:px-6 pt-4">
          <ReferralBanner />
        </div>
        
        <HeroV2Client {...translations.hero} />

        {/* Internationalization Demo */}
        <section className="py-16 sm:py-20 md:py-24 bg-black">
          {/* <div className="container mx-auto px-4 sm:px-6">
            <I18nShowcase />
          </div> */}
        </section>

        <TechTeamClient {...translations.techTeam} />
        <FeatureWorkflowClient {...translations.workflow} />
        <PricingClient {...translations.pricing} />
        <FeaturesClient {...translations.features} />
      </main>
      <FooterClient {...translations.footer} />
      
      {/* Builder Interface */}
      <BuilderWrapper
        locale={locale}
        translations={{
          floatingButton: translations.builder.floatingButton,
          ideaCapture: translations.builder.ideaCapture,
          builder: translations.builder.interface
        }}
      />
    </>
  );
}
