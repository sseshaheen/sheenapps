"use client"

import { AnimatedText } from "@/components/ui/animated-text"
import Icon from '@/components/ui/icon'
import { MobileOptimizedOrb } from "@/components/ui/mobile-optimized-orb"
import { m } from '@/components/ui/motion-provider'
import { TypingAnimation } from "@/components/ui/typing-animation"
import { IdeaCaptureInput } from "@/components/shared/idea-capture-input"

import { useRouter } from "@/i18n/routing"
import { isFeatureEnabled } from "@/lib/feature-flags"
import { logger } from '@/utils/logger'
import { useLocale } from "next-intl"
import { useState } from "react"


interface HeroV2ClientProps {
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
}

export function HeroV2Client({
  badge,
  title,
  titleHighlight,
  subtitle,
  subtitleSecond,
  demoPrompt,
  buildingText,
  buildingTextShort,
  startBuilding,
  startBuildingShort,
  useVoice,
  noCreditCard,
  demoTime,
  businessIdeas,
  floatingBadges
  // trustBar - commented out as trust bar is temporarily disabled
}: HeroV2ClientProps) {
  const [isBuilding, setIsBuilding] = useState(false)
  const [ideaText, setIdeaText] = useState('')
  const router = useRouter()
  const locale = useLocale()
  const isRTL = (locale as string).startsWith('ar')

  const handleStartBuilding = () => {
    // Baseline CTR metrics capture for Phase 1 Ticket 6
    const heroVersion = isFeatureEnabled('HERO_SIMPLIFICATION') ? 'simplified' : 'original'
    logger.info('🎯 Hero CTA Click:', { heroVersion, locale }, 'performance')

    setIsBuilding(true)
    // Navigate to the builder page
    router.push('/builder/new')
  }

  const handleVoiceTranscription = (transcribedText: string) => {
    // Populate the textarea with transcribed text
    setIdeaText(transcribedText)
    logger.info('✅ Voice Transcription Complete:', {
      textLength: transcribedText.length,
      locale
    }, 'performance')
  }

  return (
    <section className="relative min-h-[calc(100vh-100px)] flex items-center justify-center overflow-hidden bg-black pt-12 pb-12 sm:pb-16 md:pb-20">
      {/* Animated Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-black via-gray-900/50 to-black">
        {isFeatureEnabled('HERO_SIMPLIFICATION') ? (
          // Simplified: Only 1 orb instead of 3
          <MobileOptimizedOrb size="lg" className="top-1/4 -left-1/2 md:-left-1/4" delay={0} />
        ) : (
          // Original: 3 animated orbs
          <>
            <MobileOptimizedOrb size="lg" className="top-1/4 -left-1/2 md:-left-1/4" delay={0} />
            <MobileOptimizedOrb size="md" className="bottom-1/4 -right-1/2 md:-right-1/4" delay={2} />
            <MobileOptimizedOrb size="sm" className="top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" delay={4} />
          </>
        )}
      </div>

      {/* Grid Background */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:16px_16px] md:bg-[size:24px_24px]" />

      {/* Content */}
      <div className="relative z-10 container mx-auto px-4 sm:px-6">
        <div className="max-w-5xl mx-auto text-center">
          {/* Badge */}
          {badge && (
            <m.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-white/5 backdrop-blur-sm border border-white/10 mb-6 sm:mb-8"
            >
              <Icon name="sparkles" className="w-4 h-4 text-purple-400"  />
              <span className="text-xs sm:text-sm text-gray-300">{badge}</span>
            </m.div>
          )}

          {/* Main Headline */}
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-7xl font-bold text-white mb-4 sm:mb-6 leading-tight">
            <AnimatedText text={title} delay={0.2} dir={isRTL ? 'rtl' : 'ltr'} />
            <br />
            <AnimatedText
              text={titleHighlight}
              className="bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent"
              delay={0.6}
              dir={isRTL ? 'rtl' : 'ltr'}
            />
          </h1>

          {/* Subheadline */}
          <m.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1, duration: 0.8 }}
            className="text-base sm:text-lg md:text-xl lg:text-2xl text-gray-300 mb-8 sm:mb-12 max-w-3xl mx-auto leading-relaxed px-2"
          >
            {subtitle}
            <br className="hidden sm:block" />
            <span className="sm:hidden"> </span>{subtitleSecond}
          </m.p>

          {/* Interactive Demo */}
          <div className="relative max-w-2xl mx-auto mb-8 sm:mb-12">
            <div className="bg-gray-900/50 backdrop-blur-xl rounded-xl sm:rounded-2xl border border-white/10 p-4 sm:p-6 md:p-8">
              <div className="flex items-center gap-2 sm:gap-4 mb-4 sm:mb-6">
                <div className="flex gap-1.5 sm:gap-2">
                  <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-red-500" />
                  <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-yellow-500" />
                  <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-green-500" />
                </div>
                <span className="text-xs sm:text-sm text-gray-400 truncate">sheenapps.com/build</span>
              </div>

              <div className="space-y-4 sm:space-y-6">
                <div>
                  <label className="text-xs sm:text-sm text-gray-400 mb-2 block">{demoPrompt}</label>
                  <IdeaCaptureInput
                    variant="hero"
                    value={ideaText}
                    onChange={setIdeaText}
                    onSubmit={handleStartBuilding}
                    isSubmitting={isBuilding}
                    submitText={startBuilding}
                    voiceText={!isFeatureEnabled('HERO_SIMPLIFICATION') ? useVoice : undefined}
                    aria-label={demoPrompt}
                    onVoiceTranscription={handleVoiceTranscription}
                  >
                    {/* Typing animation slot */}
                    <div className="pointer-events-none absolute inset-0 p-3 sm:p-4">
                      <TypingAnimation
                        sequences={businessIdeas}
                        className="text-sm sm:text-base md:text-lg text-white font-mono leading-relaxed"
                        dir={isRTL ? 'rtl' : 'ltr'}
                      />
                    </div>
                  </IdeaCaptureInput>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 text-xs sm:text-sm text-gray-400">
                  <span>{noCreditCard}</span>
                  <span className="hidden sm:inline">•</span>
                  <span className="sm:hidden">•</span>
                  <span>{demoTime}</span>
                </div>
              </div>
            </div>

            {/* Floating Elements - Hidden in simplified version */}
            {/* {!isFeatureEnabled('HERO_SIMPLIFICATION') && (
              <>
                <m.div
                  animate={{
                    y: [-10, 10, -10],
                    rotate: [0, 5, 0],
                  }}
                  transition={{
                    duration: 6,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                  className="hidden sm:block absolute -top-6 -right-6 md:-top-8 md:-right-8 bg-gradient-to-br from-purple-600 to-pink-600 rounded-xl p-2 md:p-3 shadow-2xl"
                >
                  <span className="text-white text-xs md:text-sm font-semibold">{floatingBadges.aiHumans}</span>
                </m.div>

                <m.div
                  animate={{
                    y: [10, -10, 10],
                    rotate: [0, -5, 0],
                  }}
                  transition={{
                    duration: 6,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: 1
                  }}
                  className="hidden sm:block absolute -bottom-6 -left-6 md:-bottom-8 md:-left-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl p-2 md:p-3 shadow-2xl"
                >
                  <span className="text-white text-xs md:text-sm font-semibold">{floatingBadges.sameDayFeatures}</span>
                </m.div>
              </>
            )} */}
          </div>

          {/* Trust Bar - Temporarily disabled */}
          {/* <m.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 2, duration: 0.8 }}
            className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-3 sm:gap-6 text-xs sm:text-sm text-gray-400"
          >
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span>{trustBar.featuresCount}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              <span className="hidden sm:inline">{trustBar.avgDeployTime}</span>
              <span className="sm:hidden">{trustBar.avgDeployTimeShort}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
              <span>{trustBar.successRate}</span>
            </div>
          </m.div> */}
        </div>
      </div>

      {/* Scroll Indicator removed to prevent overlap issues on production */}
    </section>
  )
}
