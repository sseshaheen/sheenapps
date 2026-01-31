'use client'

/**
 * Hero Coming Soon Component
 * Modified hero section for the coming soon / preview page
 */

import { m } from '@/components/ui/motion-provider'
import { WaitlistForm } from './waitlist-form'
import { Icon } from '@/components/ui/icon'

interface HeroComingSoonProps {
  translations: {
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
  }
  locale: string
}

export function HeroComingSoon({ translations, locale }: HeroComingSoonProps) {
  const isRTL = locale.startsWith('ar')

  return (
    <section
      className="relative min-h-[90vh] flex items-center justify-center overflow-hidden bg-black"
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-black to-pink-900/20" />

      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <m.div
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute top-1/4 start-1/4 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl"
        />
        <m.div
          animate={{
            scale: [1.2, 1, 1.2],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute bottom-1/4 end-1/4 w-96 h-96 bg-pink-600/20 rounded-full blur-3xl"
        />
      </div>

      <div className="container mx-auto px-4 sm:px-6 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <m.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30 mb-8"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            <span className="text-sm font-medium text-purple-300">
              {translations.badge}
            </span>
          </m.div>

          {/* Title */}
          <m.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-white mb-6"
          >
            {translations.title.split(translations.titleHighlight).map((part, index, array) => (
              <span key={index}>
                {part}
                {index < array.length - 1 && (
                  <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                    {translations.titleHighlight}
                  </span>
                )}
              </span>
            ))}
          </m.h1>

          {/* Subtitle */}
          <m.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-lg sm:text-xl text-gray-300 mb-4 max-w-2xl mx-auto"
          >
            {translations.subtitle}
          </m.p>
          <m.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.25 }}
            className="text-lg sm:text-xl text-gray-400 mb-12 max-w-2xl mx-auto"
          >
            {translations.subtitleSecond}
          </m.p>

          {/* Waitlist Form */}
          <m.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mb-16"
          >
            <WaitlistForm translations={translations.waitlist} locale={locale} />
          </m.div>

          {/* Feature highlights */}
          <m.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl mx-auto"
          >
            {/* AI Feature */}
            <div className="p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
              <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center mb-4 mx-auto">
                <Icon name="sparkles" className="w-6 h-6 text-purple-400" />
              </div>
              <h3 className="font-semibold text-white mb-2">
                {translations.features.ai.title}
              </h3>
              <p className="text-sm text-gray-400">
                {translations.features.ai.description}
              </p>
            </div>

            {/* Speed Feature */}
            <div className="p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
              <div className="w-12 h-12 rounded-xl bg-pink-500/20 flex items-center justify-center mb-4 mx-auto">
                <Icon name="zap" className="w-6 h-6 text-pink-400" />
              </div>
              <h3 className="font-semibold text-white mb-2">
                {translations.features.speed.title}
              </h3>
              <p className="text-sm text-gray-400">
                {translations.features.speed.description}
              </p>
            </div>

            {/* Team Feature */}
            <div className="p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
              <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center mb-4 mx-auto">
                <Icon name="users" className="w-6 h-6 text-blue-400" />
              </div>
              <h3 className="font-semibold text-white mb-2">
                {translations.features.team.title}
              </h3>
              <p className="text-sm text-gray-400">
                {translations.features.team.description}
              </p>
            </div>
          </m.div>
        </div>
      </div>
    </section>
  )
}
