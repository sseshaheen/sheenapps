"use client"

/**
 * Home Content Preview (Coming Soon Mode)
 * Displays the coming soon / waitlist version of the homepage
 * Used when ENABLE_COMING_SOON_MODE feature flag is true
 */

import { HeaderMinimal } from "@/components/coming-soon/header-minimal"
import { HeroComingSoon } from "@/components/coming-soon/hero-coming-soon"
import { PricingMinimal } from "@/components/coming-soon/pricing-minimal"
import { FooterMinimal } from "@/components/coming-soon/footer-minimal"
import { FeatureWorkflowClient } from "@/components/sections/feature-workflow-client"
import { TechTeamClient } from "@/components/sections/tech-team-client"

interface HomeContentPreviewProps {
  translations: {
    comingSoon: {
      badge: string
      title: string
      titleHighlight: string
      subtitle: string
      subtitleSecond: string
      waitlist: {
        title: string
        subtitle: string
        placeholder: string
        button: string
        submitting: string
        success: string
        successSubtitle: string
        error: string
        alreadyJoined: string
        spots: string
        privacy: string
      }
      features: {
        title: string
        ai: { title: string; description: string }
        speed: { title: string; description: string }
        team: { title: string; description: string }
      }
      pricing: {
        title: string
        subtitle: string
        launching: string
      }
      footer: {
        launching: string
        copyright: string
      }
    }
    techTeam: {
      badge: string
      title: string
      subtitle: string
      subtitleSecond: string
      advisors: {
        ahmed: { name: string; role: string; language: string; specialties: string[]; availability: string }
        sarah: { name: string; role: string; language: string; specialties: string[]; availability: string }
        pierre: { name: string; role: string; language: string; specialties: string[]; availability: string }
      }
      scheduleCall: string
      includedInPlans: string
      howItWorks: {
        title: string
        instantChat: { title: string; description: string }
        scheduledCalls: { title: string; description: string }
        proactiveUpdates: { title: string; description: string }
      }
    }
    workflow: {
      badge: string
      title: string
      titleHighlight: string
      subtitle: string
      steps: Array<{ title: string; description: string; time?: string; output?: string }>
      stats: Array<{ label: string; value: string; trend?: string }>
    }
    locale: string
  }
}

export function HomeContentPreview({ translations }: HomeContentPreviewProps) {
  const locale = translations.locale

  return (
    <>
      {/* Minimal Header - no nav links */}
      <HeaderMinimal locale={locale} />

      <main className="min-h-screen pt-14 sm:pt-16">
        {/* Hero with Waitlist */}
        <HeroComingSoon
          translations={{
            badge: translations.comingSoon.badge,
            title: translations.comingSoon.title,
            titleHighlight: translations.comingSoon.titleHighlight,
            subtitle: translations.comingSoon.subtitle,
            subtitleSecond: translations.comingSoon.subtitleSecond,
            waitlist: translations.comingSoon.waitlist,
            features: translations.comingSoon.features,
          }}
          locale={locale}
        />

        {/* Keep Tech Team section - shows the human element */}
        <TechTeamClient {...translations.techTeam} comingSoonMode />

        {/* Keep Workflow section - shows the process */}
        <FeatureWorkflowClient {...translations.workflow} comingSoonMode />

        {/* Minimal Pricing - just tier names, no details */}
        <PricingMinimal
          translations={translations.comingSoon.pricing}
          locale={locale}
        />
      </main>

      {/* Minimal Footer */}
      <FooterMinimal
        translations={translations.comingSoon.footer}
        locale={locale}
      />
    </>
  )
}
