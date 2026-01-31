'use client'

import { useState } from 'react'
import { m } from '@/components/ui/motion-provider'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import Icon from '@/components/ui/icon'
import { cn } from '@/lib/utils'
import { formatCurrencyAmount } from '@/hooks/use-pricing-catalog'
import type { SubscriptionPlan } from '@/types/billing'
import type { SupportedCurrency } from '@/hooks/use-pricing-catalog'
import { PricingCard } from './pricing-card'

// Map backend plan keys to expected test IDs for E2E tests
function getTestId(planKey: string): string {
  const testIdMap: Record<string, string> = {
    'growth': 'pro-plan-select',  // Map 'growth' to 'pro' for tests
    'pro': 'pro-plan-select',     // Direct mapping
    'starter': 'basic-plan-select', // Map 'starter' to 'basic' for tests
    'basic': 'basic-plan-select',   // Direct mapping
    'scale': 'scale-plan-select',
    'free': 'free-plan-select'
  }
  return testIdMap[planKey.toLowerCase()] || `${planKey}-plan-select`
}

// Format advisor sessions using API data
function getAdvisorSessions(subscription: any, translations: any): string {
  const sessionCount = subscription.advisor?.sessions

  if (sessionCount === 'community') {
    return translations.pricingPage.plans.advisor.communitySupport
  } else if (sessionCount === 'daily') {
    return translations.pricingPage.plans.advisor.dailySessions
  } else if (typeof sessionCount === 'number') {
    return translations.pricingPage.plans.advisor.sessionsIncluded.replace('{count}', sessionCount)
  }

  return 'Advisor access included' // fallback
}

interface SubscriptionPlansProps {
  subscriptions: SubscriptionPlan[]
  billingCycle: 'monthly' | 'yearly'
  currency: SupportedCurrency
  translations: any
  locale: string
}

export function SubscriptionPlans({ 
  subscriptions, 
  billingCycle, 
  currency, 
  translations,
  locale 
}: SubscriptionPlansProps) {
  // Sort subscriptions by price (ascending)
  const sortedSubscriptions = [...subscriptions].sort((a, b) => {
    const priceA = billingCycle === 'yearly' ? a.yearlyPrice / 12 : a.monthlyPrice
    const priceB = billingCycle === 'yearly' ? b.yearlyPrice / 12 : b.monthlyPrice
    return priceA - priceB
  })

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
      {sortedSubscriptions.map((subscription, index) => {
        // Use backend-provided prices (enhanced format)
        const monthlyPrice = subscription.monthlyPrice
        const yearlyTotalPrice = subscription.yearlyPrice // This is the total annual amount
        const yearlyMonthlyRate = yearlyTotalPrice / 12 // Convert to effective monthly rate
        const displayPrice = billingCycle === 'yearly' ? yearlyMonthlyRate : monthlyPrice

        // Create display name with Arabic translation for Arabic locales
        const isArabicLocale = locale.startsWith('ar')
        const arabicName = translations.pricingPage?.packages?.names?.[subscription.key.toLowerCase()]
        const displayName = isArabicLocale && arabicName
          ? `${subscription.name} (${arabicName})`
          : subscription.name

        return (
          <m.div
            key={subscription.key}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: index * 0.1 }}
            className={cn(
              "relative",
              subscription.popular && "md:-mt-4"
            )}
          >
            <PricingCard
              plan={{
                key: subscription.key,
                name: displayName,
                description: subscription.key === 'free'
                  ? (subscription.bonusDaily
                      ? translations.pricingPage.plans.free.dailyBonusWithGift.replace('{bonusDaily}', subscription.bonusDaily)
                      : translations.pricingPage.plans.free.welcomeGiftOnly)
                  : translations.pricingPage.plans.descriptions.minutesIncluded.replace('{minutes}', subscription.minutes),
                price: displayPrice,
                originalPrice: billingCycle === 'yearly' ? monthlyPrice : undefined,
                currency: currency,
                popular: subscription.popular,
                features: subscription.features || [
                  subscription.key === 'free' && subscription.bonusDaily
                    ? translations.pricingPage.plans.features.bonusMinutesDaily.replace('{bonusDaily}', subscription.bonusDaily)
                    : translations.pricingPage.plans.features.aiMinutesMonthly.replace('{minutes}', subscription.minutes),
                  getAdvisorSessions(subscription, translations),
                  ...(subscription.key === 'free' ? [translations.pricingPage.plans.free.welcomeGiftFeature] : []),
                  ...(subscription.bonusDaily && subscription.key !== 'free' && subscription.key !== 'lite' ? [translations.pricingPage.plans.features.bonusMinutesDaily.replace('{bonusDaily}', subscription.bonusDaily)] : []),
                  ...(subscription.rolloverCap ? [translations.pricingPage.plans.features.rolloverMinutes.replace('{rolloverCap}', subscription.rolloverCap)] : []),
                ],
                cta: subscription.key === 'free'
                  ? (translations.pricingPage?.cta?.getStarted || 'Get Started')
                  : (translations.pricingPage?.cta?.choosePlan || 'Choose Plan'),
                billingPeriod: billingCycle,
                badge: subscription.popular ? translations.pricingPage.popularPlan : undefined
              }}
              onSelect={() => handlePlanSelect(subscription, translations, locale)}
              translations={translations}
              testId={getTestId(subscription.key)}
              locale={locale}
            />
            
            {/* Savings indicator for yearly billing */}
            {billingCycle === 'yearly' && subscription.displayedDiscount && subscription.displayedDiscount > 0 && (
              <m.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.1 + 0.3 }}
                className="absolute -top-2 -right-2 z-10"
              >
                <div className="bg-green-500 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg">
                  {translations.pricingPage?.packages?.savings?.saveAtLeast?.replace('{discount}',
                    subscription.displayedDiscount % 1 === 0
                      ? subscription.displayedDiscount.toString()
                      : subscription.displayedDiscount.toFixed(1)
                  ) || `Save at least ${subscription.displayedDiscount % 1 === 0
                    ? subscription.displayedDiscount.toString()
                    : subscription.displayedDiscount.toFixed(1)}%`}
                </div>
              </m.div>
            )}
          </m.div>
        )
      })}
    </div>
  )
}

// Handle plan selection
async function handlePlanSelect(subscription: SubscriptionPlan, translations: any, locale: string) {
  // Handle free plan - just redirect to signup/dashboard
  if (subscription.key === 'free') {
    // Check if user is authenticated
    try {
      const authResponse = await fetch('/api/auth/me', {
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache' }
      })

      if (authResponse.ok) {
        const authData = await authResponse.json()
        if (authData.isAuthenticated) {
          // User is logged in, redirect to locale-aware dashboard
          window.location.href = `/${locale}/dashboard`
          return
        }
      }
    } catch (error) {
      console.log('Auth check failed, redirecting to signup')
    }

    // User is not logged in, redirect to locale-aware signup
    window.location.href = `/${locale}/auth/signup?plan=free`
    return
  }

  // Handle paid plans - redirect to subscription checkout
  try {
    // Call the subscription checkout API
    const response = await fetch('/api/billing/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'x-sheen-locale': locale
      },
      body: JSON.stringify({
        planId: subscription.key,
        trial: false // Can be made configurable if needed
      })
    })

    if (!response.ok) {
      const errorData = await response.json()
      console.error('Checkout failed:', errorData)

      // Handle specific error cases
      if (response.status === 401) {
        // Redirect to login
        window.location.href = '/auth/login?redirect=' + encodeURIComponent('/pricing')
        return
      }

      if (response.status === 402) {
        alert('Insufficient balance. Please add funds to your account.')
        return
      }

      alert('Checkout failed. Please try again or contact support.')
      return
    }

    const result = await response.json()

    if (result.success && result.url) {
      // Redirect to Stripe checkout
      window.location.href = result.url
    } else {
      console.error('Invalid checkout response:', result)
      alert('Checkout failed. Please try again or contact support.')
    }

  } catch (error) {
    console.error('Checkout error:', error)
    alert('Network error. Please check your connection and try again.')
  }
}