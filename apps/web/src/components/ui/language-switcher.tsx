"use client"

import { useState } from 'react'
import { useRouter, usePathname } from '@/i18n/routing'
import { useParams } from 'next/navigation'
import { m, AnimatePresence } from '@/components/ui/motion-provider'
import Icon from '@/components/ui/icon'
import { localeConfig, locales, type Locale } from '@/i18n/config'
import { Button } from '@/components/ui/button'
import { useTranslations } from 'next-intl'

interface LanguageSwitcherProps {
  variant?: 'header' | 'footer' | 'inline'
  showLabel?: boolean
  currentLocale?: string
}

export function LanguageSwitcher({ 
  variant = 'header', 
  showLabel = false,
  currentLocale: propLocale
}: LanguageSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const t = useTranslations('common')
  const params = useParams()

  // Get current locale from props or params
  const currentLocale = propLocale || (params.locale as string) || 'en'
  const currentConfig = localeConfig[currentLocale as Locale] || localeConfig['en']

  const handleLocaleChange = (newLocale: Locale) => {
    setIsOpen(false)
    // Use next-intl's proper locale switching pattern
    router.replace(
      // @ts-expect-error -- TypeScript will validate params
      { pathname, params },
      { locale: newLocale }
    )
  }

  if (variant === 'footer') {
    return (
      <select 
        value={currentLocale}
        onChange={(e) => handleLocaleChange(e.target.value as Locale)}
        className="bg-gray-800 border border-gray-600 rounded px-3 py-1 text-sm text-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer hover:bg-gray-700 transition-colors"
      >
        {locales.map((locale) => (
          <option key={locale} value={locale}>
            {localeConfig[locale].flag} {localeConfig[locale].label}
          </option>
        ))}
      </select>
    )
  }

  if (variant === 'inline') {
    return (
      <div className="flex flex-wrap gap-2">
        {locales.map((locale) => (
          <Button
            key={locale}
            variant={locale === currentLocale ? "default" : "ghost"}
            size="sm"
            onClick={() => handleLocaleChange(locale)}
            className="text-xs"
          >
            {localeConfig[locale].flag} {localeConfig[locale].label}
          </Button>
        ))}
      </div>
    )
  }

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-gray-300 hover:text-white hover:bg-white/10"
      >
        <Icon name="globe" className="w-4 h-4"  />
        <span className="flex items-center gap-1">
          <span className="text-base">{currentConfig.flag}</span>
          {showLabel && (
            <span className="hidden sm:inline text-sm">
              {currentConfig.label}
            </span>
          )}
        </span>
        <Icon name="chevron-down" className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`}  />
      </Button>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <div 
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />
            
            {/* Dropdown */}
            <m.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute top-full right-0 mt-2 w-64 bg-gray-900/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl z-50"
            >
              <div className="p-2">
                <div className="text-xs text-gray-400 px-3 py-2 font-medium">
                  {t('chooseLanguage')}
                </div>
                
                {locales.map((locale) => {
                  const config = localeConfig[locale]
                  const isActive = locale === currentLocale
                  
                  return (
                    <m.button
                      key={locale}
                      whileHover={{ backgroundColor: 'rgba(255, 255, 255, 0.05)' }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleLocaleChange(locale)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                        isActive 
                          ? 'bg-purple-600/20 text-purple-300' 
                          : 'text-gray-300 hover:text-white'
                      }`}
                    >
                      <span className="text-lg">{config.flag}</span>
                      <div className="flex-1">
                        <div className="font-medium text-sm">{config.label}</div>
                        <div className="text-xs opacity-70">
                          {config.region} • {config.currency}
                        </div>
                      </div>
                      {isActive && (
                        <div className="w-2 h-2 rounded-full bg-purple-400" />
                      )}
                    </m.button>
                  )
                })}
                
                <div className="border-t border-white/10 mt-2 pt-2">
                  <div className="text-xs text-gray-500 px-3 py-1">
                    {t('pricesInLocalCurrency')}
                  </div>
                </div>
              </div>
            </m.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}