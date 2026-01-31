'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import Icon, { type IconName } from '@/components/ui/icon'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { AnimatePresence, m } from '@/components/ui/motion-provider'
import { useState, useEffect } from 'react'

// RTL detection utility
const isRTLLocale = (locale: string) => locale.startsWith('ar')

export interface WizardTranslations {
  steps: {
    siteType: {
      title: string
      subtitle: string
      options: {
        portfolio: { label: string; description: string }
        business: { label: string; description: string }
        store: { label: string; description: string }
        blog: { label: string; description: string }
        other: { label: string; description: string }
      }
    }
    businessName: {
      title: string
      subtitle: string
      placeholder: string
      skip: string
    }
    industry: {
      title: string
      subtitle: string
      options: string[]
      skip: string
    }
    style: {
      title: string
      subtitle: string
      options: {
        modern: { label: string; description: string }
        classic: { label: string; description: string }
        bold: { label: string; description: string }
        minimal: { label: string; description: string }
      }
    }
  }
  progress: {
    step: string
    of: string
  }
  actions: {
    next: string
    back: string
    skip: string
    startBuilding: string
  }
}

interface OnboardingWizardProps {
  translations: WizardTranslations
  locale: string
  onComplete: (data: WizardData) => void
  onSkip: () => void
}

export interface WizardData {
  siteType: string
  businessName: string
  industry: string
  style: string
}

type SiteTypeKey = 'portfolio' | 'business' | 'store' | 'blog' | 'other'
type StyleKey = 'modern' | 'classic' | 'bold' | 'minimal'

const SITE_TYPE_ICONS: Record<SiteTypeKey, IconName> = {
  portfolio: 'folder',
  business: 'building',
  store: 'package',
  blog: 'pencil',
  other: 'sparkles'
}

const STYLE_COLORS: Record<StyleKey, { bg: string; accent: string }> = {
  modern: { bg: 'from-blue-500 to-purple-600', accent: 'border-blue-500' },
  classic: { bg: 'from-amber-600 to-orange-500', accent: 'border-amber-500' },
  bold: { bg: 'from-pink-500 to-red-500', accent: 'border-pink-500' },
  minimal: { bg: 'from-gray-400 to-gray-600', accent: 'border-gray-500' }
}

// Storage key for onboarding persistence
const ONBOARDING_STORAGE_KEY = 'sa_onboard'

export function OnboardingWizard({
  translations,
  locale,
  onComplete,
  onSkip
}: OnboardingWizardProps) {
  const isRTL = isRTLLocale(locale)
  const [currentStep, setCurrentStep] = useState(0)
  const [wizardData, setWizardData] = useState<WizardData>({
    siteType: '',
    businessName: '',
    industry: '',
    style: ''
  })
  const [isRestored, setIsRestored] = useState(false)

  const totalSteps = 4
  const storageKey = `${ONBOARDING_STORAGE_KEY}_${locale}`

  // Restore state from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined' || isRestored) return
    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) {
        setIsRestored(true)
        return
      }
      const saved = JSON.parse(raw)
      if (saved?.wizardData) setWizardData(saved.wizardData)
      if (typeof saved?.currentStep === 'number') setCurrentStep(saved.currentStep)
    } catch {
      // Ignore parse errors
    }
    setIsRestored(true)
  }, [storageKey, isRestored])

  // Persist state to localStorage on changes
  useEffect(() => {
    if (typeof window === 'undefined' || !isRestored) return
    try {
      const payload = JSON.stringify({ wizardData, currentStep })
      localStorage.setItem(storageKey, payload)
    } catch {
      // Ignore storage errors
    }
  }, [wizardData, currentStep, storageKey, isRestored])

  // Clear storage on completion or skip
  const clearStorage = () => {
    if (typeof window === 'undefined') return
    try {
      localStorage.removeItem(storageKey)
    } catch {
      // Ignore errors
    }
  }

  const handleNext = () => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      clearStorage()
      onComplete(wizardData)
    }
  }

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleSiteTypeSelect = (type: string) => {
    setWizardData({ ...wizardData, siteType: type })
    // Auto-advance after selection
    setTimeout(() => setCurrentStep(1), 300)
  }

  const handleStyleSelect = (style: string) => {
    setWizardData({ ...wizardData, style })
    // Complete wizard after style selection
    setTimeout(() => {
      clearStorage()
      onComplete({ ...wizardData, style })
    }, 300)
  }

  const handleIndustrySelect = (industry: string) => {
    setWizardData({ ...wizardData, industry })
    // Auto-advance after selection
    setTimeout(() => setCurrentStep(3), 300)
  }

  // Progress bar - RTL aware
  const progressPercentage = ((currentStep + 1) / totalSteps) * 100

  return (
    <div
      className="min-h-screen bg-background flex flex-col"
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      {/* Progress Bar */}
      <div className="w-full bg-muted h-2">
        <div
          className={cn(
            "h-full bg-gradient-to-r from-purple-600 to-pink-600 transition-all duration-500 ease-out",
            isRTL && "origin-right"
          )}
          style={{
            width: `${progressPercentage}%`,
            transform: isRTL ? 'scaleX(1)' : undefined,
            transformOrigin: isRTL ? 'right' : 'left'
          }}
        />
      </div>

      {/* Step Indicator */}
      <div className="px-6 py-4 flex items-center justify-between border-b border-border">
        <button
          onClick={() => {
            clearStorage()
            onSkip()
          }}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          {translations.actions.skip}
        </button>
        <span className="text-sm text-muted-foreground">
          {translations.progress.step} {currentStep + 1} {translations.progress.of} {totalSteps}
        </span>
        {currentStep > 0 ? (
          <button
            onClick={handleBack}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            <Icon name="arrow-left" className={cn("w-4 h-4", isRTL && "rotate-180")} />
            {translations.actions.back}
          </button>
        ) : (
          <div className="w-16" /> // Spacer for alignment
        )}
      </div>

      {/* Content Area */}
      <div className="flex-1 flex items-center justify-center p-6">
        <AnimatePresence mode="wait">
          {/* Step 1: Site Type */}
          {currentStep === 0 && (
            <m.div
              key="step-1"
              initial={{ opacity: 0, x: isRTL ? -20 : 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: isRTL ? 20 : -20 }}
              transition={{ duration: 0.3 }}
              className="w-full max-w-2xl"
            >
              <div className="text-center mb-8">
                <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-3">
                  {translations.steps.siteType.title}
                </h1>
                <p className="text-lg text-muted-foreground">
                  {translations.steps.siteType.subtitle}
                </p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {(Object.entries(translations.steps.siteType.options) as [SiteTypeKey, { label: string; description: string }][]).map(([key, option]) => (
                  <Card
                    key={key}
                    className={cn(
                      "cursor-pointer transition-all hover:shadow-lg hover:border-accent/50",
                      wizardData.siteType === key && "border-accent ring-2 ring-accent/20"
                    )}
                    onClick={() => handleSiteTypeSelect(key)}
                  >
                    <CardContent className="p-6 text-center">
                      <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30 flex items-center justify-center">
                        <Icon name={SITE_TYPE_ICONS[key]} className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                      </div>
                      <h3 className="font-semibold text-foreground mb-1">
                        {option.label}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {option.description}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </m.div>
          )}

          {/* Step 2: Business Name */}
          {currentStep === 1 && (
            <m.div
              key="step-2"
              initial={{ opacity: 0, x: isRTL ? -20 : 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: isRTL ? 20 : -20 }}
              transition={{ duration: 0.3 }}
              className="w-full max-w-md"
            >
              <div className="text-center mb-8">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30 flex items-center justify-center">
                  <Icon name="edit" className="w-8 h-8 text-purple-600 dark:text-purple-400" />
                </div>
                <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-3">
                  {translations.steps.businessName.title}
                </h1>
                <p className="text-lg text-muted-foreground">
                  {translations.steps.businessName.subtitle}
                </p>
              </div>

              <div className="space-y-4">
                <Input
                  type="text"
                  value={wizardData.businessName}
                  onChange={(e) => setWizardData({ ...wizardData, businessName: e.target.value })}
                  placeholder={translations.steps.businessName.placeholder}
                  className="text-lg h-14 text-center"
                  autoFocus
                />

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setWizardData({ ...wizardData, businessName: '' })
                      setCurrentStep(2)
                    }}
                  >
                    {translations.steps.businessName.skip}
                  </Button>
                  <Button
                    className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600"
                    onClick={handleNext}
                    disabled={!wizardData.businessName.trim()}
                  >
                    {translations.actions.next}
                    <Icon name="arrow-right" className={cn("w-4 h-4 ms-2", isRTL && "rotate-180")} />
                  </Button>
                </div>
              </div>
            </m.div>
          )}

          {/* Step 3: Industry */}
          {currentStep === 2 && (
            <m.div
              key="step-3"
              initial={{ opacity: 0, x: isRTL ? -20 : 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: isRTL ? 20 : -20 }}
              transition={{ duration: 0.3 }}
              className="w-full max-w-2xl"
            >
              <div className="text-center mb-8">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30 flex items-center justify-center">
                  <Icon name="target" className="w-8 h-8 text-purple-600 dark:text-purple-400" />
                </div>
                <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-3">
                  {translations.steps.industry.title}
                </h1>
                <p className="text-lg text-muted-foreground">
                  {translations.steps.industry.subtitle}
                </p>
              </div>

              <div className="flex flex-wrap justify-center gap-3 mb-6">
                {translations.steps.industry.options.map((industry) => (
                  <button
                    key={industry}
                    onClick={() => handleIndustrySelect(industry)}
                    className={cn(
                      "px-4 py-2 rounded-full border transition-all",
                      wizardData.industry === industry
                        ? "bg-accent text-accent-foreground border-accent"
                        : "bg-secondary hover:bg-muted border-border hover:border-accent/50"
                    )}
                  >
                    {industry}
                  </button>
                ))}
              </div>

              <div className="text-center">
                <button
                  onClick={() => {
                    setWizardData({ ...wizardData, industry: '' })
                    setCurrentStep(3)
                  }}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {translations.steps.industry.skip}
                </button>
              </div>
            </m.div>
          )}

          {/* Step 4: Style */}
          {currentStep === 3 && (
            <m.div
              key="step-4"
              initial={{ opacity: 0, x: isRTL ? -20 : 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: isRTL ? 20 : -20 }}
              transition={{ duration: 0.3 }}
              className="w-full max-w-2xl"
            >
              <div className="text-center mb-8">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30 flex items-center justify-center">
                  <Icon name="palette" className="w-8 h-8 text-purple-600 dark:text-purple-400" />
                </div>
                <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-3">
                  {translations.steps.style.title}
                </h1>
                <p className="text-lg text-muted-foreground">
                  {translations.steps.style.subtitle}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {(Object.entries(translations.steps.style.options) as [StyleKey, { label: string; description: string }][]).map(([key, option]) => (
                  <Card
                    key={key}
                    className={cn(
                      "cursor-pointer transition-all hover:shadow-lg overflow-hidden",
                      wizardData.style === key && `ring-2 ${STYLE_COLORS[key].accent}`
                    )}
                    onClick={() => handleStyleSelect(key)}
                  >
                    <div className={cn("h-20 bg-gradient-to-br", STYLE_COLORS[key].bg)} />
                    <CardContent className="p-4">
                      <h3 className="font-semibold text-foreground mb-1">
                        {option.label}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {option.description}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
