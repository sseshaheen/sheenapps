'use client'

import { useState } from 'react'
import { m } from '@/components/ui/motion-provider'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import Icon, { type IconName } from '@/components/ui/icon'
import { cn } from '@/lib/utils'
import { formatCurrencyAmount, formatCurrencyAmountLocalized } from '@/hooks/use-pricing-catalog'
import type { SupportedCurrency } from '@/hooks/use-pricing-catalog'
import { ExpandableFeatures } from './expandable-features'

interface PricingPlan {
  key: string
  name: string
  description: string
  price: number
  originalPrice?: number // For showing crossed-out price
  currency: SupportedCurrency
  popular?: boolean
  features: string[]
  cta: string
  billingPeriod?: 'monthly' | 'yearly'
  badge?: string
  icon?: string
  color?: string
}

interface PricingCardProps {
  plan: PricingPlan
  onSelect: () => void
  translations: any
  testId?: string
  className?: string
  locale?: string
}

export function PricingCard({
  plan,
  onSelect,
  translations,
  testId,
  className,
  locale
}: PricingCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  
  // Determine card styling
  const isPopular = plan.popular
  const isFree = plan.price === 0
  
  // Get plan icon and color based on name or key
  const getIconAndColor = (planKey: string) => {
    const iconMap: Record<string, { icon: string; color: string }> = {
      free: { icon: 'heart', color: 'from-gray-600 to-gray-700' },
      lite: { icon: 'lightbulb', color: 'from-green-500 to-emerald-600' },
      starter: { icon: 'rocket', color: 'from-blue-600 to-cyan-600' },
      builder: { icon: 'code', color: 'from-orange-500 to-amber-600' },
      pro: { icon: 'star', color: 'from-purple-600 to-pink-600' },
      ultra: { icon: 'flame', color: 'from-red-600 to-red-900' },
      // Legacy mapping for backwards compatibility
      growth: { icon: 'trending-up', color: 'from-purple-600 to-pink-600' },
      scale: { icon: 'trophy', color: 'from-yellow-600 to-orange-600' },
    }
    return iconMap[planKey.toLowerCase()] || { icon: 'zap', color: 'from-blue-600 to-cyan-600' }
  }
  
  const { icon, color } = getIconAndColor(plan.key)

  return (
    <Card className={cn(
      "h-full bg-gray-800/50 backdrop-blur-sm border transition-all duration-300 hover:scale-[1.02]",
      isPopular 
        ? "border-purple-500/50 shadow-2xl shadow-purple-500/20" 
        : "border-white/10 hover:border-white/20",
      className
    )}>
      {/* Popular Badge - Multiple responsive approaches */}
      {isPopular && plan.badge && (
        <>
          {/* Compact badge for narrow widths (hidden on larger screens) */}
          <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 z-20 block lg:hidden">
            <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold rounded-full shadow-lg text-[10px] px-2 py-1">
              ★
            </div>
          </div>

          {/* Full text badge for wider screens (hidden on smaller screens) */}
          <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 z-20 hidden lg:block">
            <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm font-semibold px-4 py-1.5 rounded-full shadow-lg whitespace-nowrap">
              {plan.badge}
            </div>
          </div>
        </>
      )}

      <CardContent className="p-6 sm:p-8 h-full flex flex-col">
        {/* Plan Icon */}
        <div className={cn(
          "w-12 h-12 rounded-xl bg-gradient-to-r flex items-center justify-center mb-6",
          plan.color || color
        )}>
          <Icon name={(plan.icon || icon) as IconName} className="w-6 h-6 text-white" />
        </div>

        {/* Plan Header */}
        <div className="mb-6">
          <h3 className="text-2xl font-bold text-white mb-2">
            {plan.name}
          </h3>
          
          {/* Price Display */}
          <div className="mb-4">
            {plan.originalPrice && plan.originalPrice !== plan.price && (
              <div className="text-lg text-gray-400 line-through mb-1">
                {formatCurrencyAmountLocalized(plan.originalPrice, plan.currency, locale, translations.pricingPage)}
              </div>
            )}
            <div className="flex items-center justify-center flex-wrap gap-1 min-h-[4rem]">
              {isFree ? (
                <span className={cn(
                  "font-bold text-white leading-tight",
                  locale?.startsWith('ar')
                    ? "text-2xl sm:text-3xl lg:text-4xl" // Smaller for Arabic "مجاني"
                    : "text-3xl sm:text-4xl lg:text-5xl leading-none"
                )}>
                  {translations.pricingPage?.pricing?.free || 'Free'}
                </span>
              ) : (() => {
                // Smart currency display logic based on research
                const formatPrice = () => {
                  const formattedPrice = formatCurrencyAmountLocalized(plan.price, plan.currency, locale, translations.pricingPage)

                  // Detect long currency formats that need two-line treatment
                  const isLongCurrency = (
                    formattedPrice.length > 8 || // General length check
                    ['EGP', 'SAR', 'AED', 'MAD'].includes(plan.currency) || // Known long currencies
                    (plan.price >= 1000 && ['EGP', 'SAR', 'AED'].includes(plan.currency)) // Large amounts in Middle Eastern currencies
                  )

                  // Arabic locales with currency translation - always two-line
                  if (locale?.startsWith('ar') && translations.pricingPage?.currencies?.[plan.currency]) {
                    return (
                      <div className="flex flex-col items-center text-center">
                        <span className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-none">
                          {new Intl.NumberFormat('en-US', {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 2
                          }).format(plan.price)}
                        </span>
                        <span className="text-sm sm:text-base text-gray-300 leading-tight mt-1">
                          {translations.pricingPage.currencies[plan.currency]}
                        </span>
                      </div>
                    )
                  }

                  // Long currency - use elegant two-line layout
                  if (isLongCurrency) {
                    // Extract number and currency parts
                    const currencySymbols = ['EGP', 'SAR', 'AED', 'MAD', '$', '€', '£', 'ج.م', 'ر.س', 'د.إ', 'د.م']
                    let numberPart = plan.price.toLocaleString('en-US')
                    let currencyPart = plan.currency

                    // For formatted strings, try to split intelligently
                    const match = formattedPrice.match(/^([A-Z]{3})\s*([\d,]+)/) || formattedPrice.match(/([\d,]+)\s*(.+)$/)
                    if (match) {
                      const currencyCode = String(plan.currency)
                      if (formattedPrice.startsWith(currencyCode)) {
                        currencyPart = match[1] as SupportedCurrency
                        numberPart = match[2]
                      } else {
                        numberPart = match[1]
                        currencyPart = match[2] as SupportedCurrency
                      }
                    }

                    return (
                      <div className="flex flex-col items-center text-center">
                        <span className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-none">
                          {numberPart}
                        </span>
                        <span className="text-sm sm:text-base text-gray-300 leading-tight mt-1 font-medium">
                          {currencyPart}
                        </span>
                      </div>
                    )
                  }

                  // Short currency - standard single-line format
                  return (
                    <span className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-none text-center">
                      {formattedPrice}
                    </span>
                  )
                }

                return formatPrice()
              })()}
              {!isFree && plan.billingPeriod && (
                <span className="text-gray-400 text-lg sm:text-xl whitespace-nowrap">
                  {translations.pricingPage?.pricing?.month || '/month'}{plan.billingPeriod === 'yearly' ? (translations.pricingPage?.pricing?.billedAnnually || ' billed annually') : ''}
                </span>
              )}
            </div>
          </div>
          
          <p className="text-gray-400 text-sm">
            {plan.description}
          </p>
        </div>

        {/* CTA Button */}
        <Button
          onClick={onSelect}
          size="lg"
          className={cn(
            "w-full mb-6 font-semibold",
            isPopular
              ? "bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white"
              : "bg-white/10 hover:bg-white/20 text-white border border-white/20"
          )}
          data-testid={testId}
        >
          {plan.cta}
        </Button>

        {/* Features */}
        <div className="flex-1">
          <ExpandableFeatures
            features={plan.features}
            isExpanded={isExpanded}
            onToggle={() => setIsExpanded(!isExpanded)}
            translations={translations.pricingPage?.features}
            maxVisibleFeatures={4}
          />
        </div>
      </CardContent>
    </Card>
  )
}