'use client'

import { m } from '@/components/ui/motion-provider'
import { formatCurrencyAmount, formatCurrencyAmountLocalized, useCurrencyPreference } from '@/hooks/use-pricing-catalog'
import { useAuthStore } from '@/store'
import type { Package } from '@/types/billing'
import { isRedirectResult, isVoucherResult } from '@/types/billing'
import type { SupportedCurrency } from '@/hooks/use-pricing-catalog'
import { PricingCard } from './pricing-card'
import { multiProviderBilling } from '@/services/multi-provider-billing'

interface OneOffPackagesProps {
  packages: Package[]
  currency: SupportedCurrency
  translations: any
  locale: string
}

export function OneOffPackages({ 
  packages, 
  currency, 
  translations,
  locale 
}: OneOffPackagesProps) {
  const { user } = useAuthStore()
  // Sort packages by price (ascending)
  const sortedPackages = [...packages].sort((a, b) => a.price - b.price)

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
      {sortedPackages.map((pkg, index) => {
        // Calculate value metrics
        const baseMinutes = pkg.minutes
        const bonusMinutes = pkg.bonus_minutes || 0
        const totalMinutes = baseMinutes + bonusMinutes
        const costPerMinute = pkg.price / totalMinutes

        // Determine if this is a popular package or best value
        const isPopular = pkg.popular || pkg.key === 'plus' // Plus is most popular
        const isBestValue = index === sortedPackages.length - 1 // Highest package is best value

        // Create display name with Arabic translation for Arabic locales
        const isArabicLocale = locale.startsWith('ar')
        const arabicName = translations.pricingPage?.packages?.names?.[pkg.key.toLowerCase()]
        const displayName = isArabicLocale && arabicName
          ? `${pkg.name} (${arabicName})`
          : pkg.name
        
        return (
          <m.div
            key={pkg.key}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: index * 0.1 }}
            className={isPopular ? "md:-mt-4" : ""}
          >
            <PricingCard
              plan={{
                key: pkg.key,
                name: displayName,
                description: translations.pricingPage.plans.descriptions.minutesTotal.replace('{totalMinutes}', totalMinutes),
                price: pkg.price,
                currency: currency,
                popular: isPopular || isBestValue,
                features: [
                  translations.pricingPage.packages.features.baseMinutes.replace('{baseMinutes}', baseMinutes),
                  ...(bonusMinutes > 0 ? [translations.pricingPage.packages.features.bonusMinutes.replace('{bonusMinutes}', bonusMinutes)] : []),
                  translations.pricingPage.packages.features.costPerMinute.replace('{cost}', formatCurrencyAmountLocalized(costPerMinute, currency, locale, translations.pricingPage)),
                  translations.pricingPage.packages.features.creditsNeverExpire,
                ],
                cta: translations.pricingPage?.cta?.purchase || 'Purchase Credits',
                badge: isBestValue ? translations.pricingPage.packages.badges.bestValue : (isPopular ? translations.pricingPage.packages.badges.mostPopular : undefined),
                icon: 'plus',
                color: 'from-emerald-600 to-teal-600'
              }}
              onSelect={() => handlePackageSelect(pkg, currency, user?.id)}
              translations={translations}
              testId={`${pkg.key}-package-select`}
              locale={locale}
            />
            
            {/* Bonus indicator */}
            {bonusMinutes > 0 && (
              <m.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.1 + 0.3 }}
                className="absolute -top-2 -right-2 z-10"
              >
                <div className="bg-emerald-500 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg">
                  +{bonusMinutes} Bonus
                </div>
              </m.div>
            )}
          </m.div>
        )
      })}
    </div>
  )
}

// Handle package selection - use multi-provider billing service
async function handlePackageSelect(pkg: Package, currency: SupportedCurrency, userId?: string) {
  // Check if user is authenticated
  if (!userId) {
    // Redirect to login with pricing page as redirect target
    window.location.href = '/auth/login?redirect=' + encodeURIComponent('/pricing')
    return
  }
  
  try {
    console.log('Package selected:', pkg.key, 'Currency:', currency, 'User:', userId)
    
    // Create checkout session using multi-provider billing service
    const checkoutResult = await multiProviderBilling.createCheckout({
      packageKey: pkg.key,
      currency: currency,
      userId: userId,
      // locale will be auto-detected by the service
    })
    
    console.log('Checkout created:', checkoutResult)
    
    // Handle different checkout types using type guards
    if (isRedirectResult(checkoutResult)) {
      // Redirect to hosted checkout (Stripe, etc.)
      if (checkoutResult.checkout_url) {
        window.location.href = checkoutResult.checkout_url
      } else {
        alert('Checkout URL not provided. Please try again or contact support.')
      }
    } else if (isVoucherResult(checkoutResult)) {
      // For voucher payments, redirect to voucher page or handle differently
      // This would depend on your voucher payment UI implementation
      if (checkoutResult.voucher_instructions) {
        // Handle voucher flow - for now, redirect to a generic success page with instructions
        const params = new URLSearchParams({
          type: 'voucher',
          orderId: checkoutResult.order_id,
          instructions: encodeURIComponent(JSON.stringify(checkoutResult.voucher_instructions))
        })
        window.location.href = `/billing/success?${params.toString()}`
      } else {
        alert('Voucher payment initiated. Please check your payment method for next steps.')
      }
    } else {
      // Handle any other checkout types (shouldn't happen with current types)
      console.warn('Unknown checkout type:', (checkoutResult as any).checkout_type)
      alert('Checkout initiated. Please check your email or payment method for next steps.')
    }
    
  } catch (error) {
    console.error('Package purchase error:', error)
    
    // Handle specific error types
    if (error && typeof error === 'object') {
      const errorObj = error as any
      
      // Multi-provider errors
      if (errorObj.error === 'REGION_NOT_SUPPORTED') {
        alert(`Payment not available in your region (${errorObj.region}). Please contact support for assistance.`)
        return
      }
      
      if (errorObj.error === 'CURRENCY_NOT_SUPPORTED') {
        alert(`Currency ${currency} not supported in your region. Please try a different currency.`)
        return
      }
      
      if (errorObj.error === 'INSUFFICIENT_AI_TIME') {
        alert('Insufficient balance. Please add funds to your account.')
        return
      }
    }
    
    // Generic error handling
    if (error instanceof Error) {
      if (error.message.includes('401') || error.message.includes('Unauthorized')) {
        window.location.href = '/auth/login?redirect=' + encodeURIComponent('/pricing')
        return
      }
      
      if (error.message.includes('402') || error.message.includes('Insufficient')) {
        alert('Insufficient balance. Please add funds to your account.')
        return
      }
      
      if (error.message.includes('network') || error.message.includes('fetch')) {
        alert('Network error. Please check your connection and try again.')
        return
      }
    }
    
    // Fallback error
    alert('Purchase failed. Please try again or contact support.')
  }
}