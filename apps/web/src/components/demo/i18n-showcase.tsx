"use client"

import { Button } from '@/components/ui/button'
import { localeConfig, regionalPricing, type Locale } from '@/i18n/config'
import { formatPercentage, formatPrice } from '@/lib/currency'
import { AnimatePresence, m } from '@/components/ui/motion-provider'
import Icon from '@/components/ui/icon'
import { useState } from 'react'

const sampleTranslations = {
  'en': {
    title: "Your Tech Team. AI + Humans",
    subtitle: "Build your business in 5 minutes. Add features in minutes.",
    cta: "Start Building Now",
    pricing: "Pricing starts at"
  },
  'ar-eg': {
    title: "فريقك التقني، للأبد",
    subtitle: "اعمل شركتك في 5 دقايق. ضيف مميزات في أقل.",
    cta: "ابدأ البناء دلوقتي",
    pricing: "الأسعار تبدأ من"
  },
  'ar-sa': {
    title: "فريقك التقني. ذكاء اصطناعي + شريك بشري",
    subtitle: "أنشئ شركتك في 5 دقائق. أضف مميزات في أقل.",
    cta: "ابدأ البناء الآن",
    pricing: "الأسعار تبدأ من"
  },
}

export function I18nShowcase() {
  const [selectedLocale, setSelectedLocale] = useState<Locale>('en')

  const config = localeConfig[selectedLocale]
  const pricing = regionalPricing[selectedLocale]
  const translations = sampleTranslations[selectedLocale as keyof typeof sampleTranslations]
  const localizedPrice = formatPrice(29, selectedLocale)

  return (
    <div className="bg-gradient-to-br from-purple-900/20 to-pink-900/20 rounded-3xl p-8 border border-purple-500/20 max-w-4xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-white mb-4 flex items-center justify-center gap-2">
          <Icon name="globe" className="w-8 h-8 text-purple-400"  />
          Localization Demo
        </h2>
        <p className="text-gray-300">
          See how SheenApps adapts to different regions with native language support,
          local currencies, and cultural customizations.
        </p>
      </div>

      {/* Locale Selector */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {Object.entries(sampleTranslations).map(([locale]) => {
          const localeConfig_ = localeConfig[locale as Locale]
          const isSelected = locale === selectedLocale

          return (
            <Button
              key={locale}
              variant={isSelected ? "default" : "ghost"}
              onClick={() => setSelectedLocale(locale as Locale)}
              className={`flex flex-col gap-2 h-auto p-4 ${isSelected
                ? 'bg-purple-600 hover:bg-purple-700'
                : 'hover:bg-white/10'
                }`}
            >
              <span className="text-2xl">{localeConfig_.flag}</span>
              <span className="text-xs">{localeConfig_.label}</span>
              <span className="text-xs opacity-70">{localeConfig_.currency}</span>
            </Button>
          )
        })}
      </div>

      {/* Preview Section */}
      <AnimatePresence mode="wait">
        <m.div
          key={selectedLocale}
          initial={{ opacity: 0, x: config.direction === 'rtl' ? -20 : 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: config.direction === 'rtl' ? 20 : -20 }}
          transition={{ duration: 0.3 }}
          className="bg-gray-900/50 backdrop-blur-xl rounded-2xl p-8 border border-white/10"
          dir={config.direction}
        >
          {/* Sample UI */}
          <div className="text-center space-y-6">
            <h3 className="text-4xl font-bold text-white leading-relaxed">
              {translations.title}
            </h3>

            <p className="text-xl text-gray-300 leading-relaxed">
              {translations.subtitle}
            </p>

            <div className="flex items-center justify-center gap-4 text-lg">
              <Icon name="dollar-sign" className="w-5 h-5 text-green-400"  />
              <span className="text-gray-300">{translations.pricing}</span>
              <span className="font-bold text-white">{localizedPrice}/month</span>
              {pricing.discount > 0 && (
                <span className="text-green-400 text-sm">
                  ({formatPercentage(pricing.discount * 100, selectedLocale)} off!)
                </span>
              )}
            </div>

            <Button
              size="lg"
              className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
            >
              {translations.cta}
            </Button>
          </div>
        </m.div>
      </AnimatePresence>

      {/* Technical Details */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
        <div className="bg-black/30 rounded-lg p-4 border border-white/5">
          <div className="flex items-center gap-2 mb-2">
            <Icon name="globe" className="w-4 h-4 text-blue-400"  />
            <span className="font-medium text-white">Region</span>
          </div>
          <div className="text-gray-300">
            <div>Market: {config.region}</div>
            <div>Direction: {config.direction.toUpperCase()}</div>
            <div>Currency: {config.currency}</div>
          </div>
        </div>

        <div className="bg-black/30 rounded-lg p-4 border border-white/5">
          <div className="flex items-center gap-2 mb-2">
            <Icon name="dollar-sign" className="w-4 h-4 text-green-400"  />
            <span className="font-medium text-white">Pricing</span>
          </div>
          <div className="text-gray-300">
            <div>Multiplier: {pricing.multiplier}x</div>
            <div>Discount: {formatPercentage(pricing.discount * 100, selectedLocale)}</div>
            <div>Growth Plan: {localizedPrice}</div>
          </div>
        </div>

        <div className="bg-black/30 rounded-lg p-4 border border-white/5">
          <div className="flex items-center gap-2 mb-2">
            <Icon name="calendar" className="w-4 h-4 text-purple-400"  />
            <span className="font-medium text-white">Localization</span>
          </div>
          <div className="text-gray-300">
            <div>Language: {config.label}</div>
            <div>Font: {config.direction === 'rtl' ? 'Arabic-optimized' : 'Latin'}</div>
            <div>Layout: {config.direction === 'rtl' ? 'Right-to-left' : 'Left-to-right'}</div>
          </div>
        </div>
      </div>

      {/* Implementation Summary */}
      <div className="mt-8 bg-gradient-to-r from-blue-900/20 to-purple-900/20 rounded-xl p-6 border border-blue-500/20">
        <h4 className="text-lg font-semibold text-white mb-3">What&apos;s Implemented</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-300">
          <div>
            <div className="font-medium text-white mb-2">🌍 Multi-Region Support</div>
            <ul className="space-y-1 text-xs">
              <li>• Egyptian Arabic (EGP pricing)</li>
              <li>• Saudi Arabic (SAR pricing)</li>
              <li>• UAE Arabic (AED pricing)</li>
              <li>• Moroccan French (MAD pricing)</li>
              <li>• Standard French (EUR pricing)</li>
            </ul>
          </div>
          <div>
            <div className="font-medium text-white mb-2">⚡ Technical Features</div>
            <ul className="space-y-1 text-xs">
              <li>• next-intl integration</li>
              <li>• Currency formatting</li>
              <li>• RTL layout support</li>
              <li>• Dialect-specific translations</li>
              <li>• Regional pricing</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
