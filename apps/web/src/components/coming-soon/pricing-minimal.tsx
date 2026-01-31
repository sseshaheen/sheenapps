'use client'

/**
 * Minimal Pricing Component
 * Simplified pricing display for coming soon / preview mode
 * Shows plan tiers without detailed features or CTAs
 */

import { m } from '@/components/ui/motion-provider'
import { Icon } from '@/components/ui/icon'

interface PricingMinimalProps {
  translations: {
    title: string
    subtitle: string
    launching: string
  }
  locale: string
}

const PLAN_TIERS = [
  {
    name: 'Free',
    icon: 'star',
    gradient: 'from-gray-500 to-gray-600',
  },
  {
    name: 'Starter',
    icon: 'rocket',
    gradient: 'from-blue-500 to-cyan-500',
  },
  {
    name: 'Growth',
    icon: 'trending-up',
    gradient: 'from-purple-500 to-pink-500',
    popular: true,
  },
  {
    name: 'Scale',
    icon: 'building',
    gradient: 'from-orange-500 to-red-500',
  },
]

export function PricingMinimal({ translations, locale }: PricingMinimalProps) {
  const isRTL = locale.startsWith('ar')

  return (
    <section
      className="py-20 sm:py-28 bg-black"
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <div className="container mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="text-center mb-16">
          <m.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4"
          >
            {translations.title}
          </m.h2>
          <m.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-lg text-gray-400 max-w-2xl mx-auto"
          >
            {translations.subtitle}
          </m.p>
        </div>

        {/* Plan tiers - visual only */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 max-w-4xl mx-auto mb-12">
          {PLAN_TIERS.map((plan, index) => (
            <m.div
              key={plan.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className={`relative p-6 rounded-2xl bg-white/5 border ${
                plan.popular
                  ? 'border-purple-500/50 ring-1 ring-purple-500/20'
                  : 'border-white/10'
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 start-1/2 -translate-x-1/2 rtl:translate-x-1/2 px-3 py-1 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full text-xs font-medium text-white">
                  Popular
                </div>
              )}

              <div className={`w-12 h-12 rounded-xl bg-gradient-to-r ${plan.gradient} flex items-center justify-center mb-4 mx-auto`}>
                <Icon name={plan.icon as any} className="w-6 h-6 text-white" />
              </div>

              <h3 className="text-lg font-semibold text-white text-center">
                {plan.name}
              </h3>
            </m.div>
          ))}
        </div>

        {/* Coming soon message */}
        <m.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-center"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10">
            <Icon name="clock" className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-400">
              {translations.launching}
            </span>
          </div>
        </m.div>
      </div>
    </section>
  )
}
