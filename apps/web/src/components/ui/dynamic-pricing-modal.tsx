'use client'

/**
 * Dynamic Pricing Modal
 * Database-driven pricing modal that replaces the hardcoded CreditsModal
 * Uses pricing catalog API for real-time pricing and multi-currency support
 */

import React, { useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useAuthStore } from '@/store'
import { usePricingCatalog, useCurrencyPreference } from '@/hooks/use-pricing-catalog'
import { CurrencySelector } from '@/components/pricing/currency-selector'
import Icon from '@/components/ui/icon'
import { logger } from '@/utils/logger'
import type { PlanName } from '@/types/billing'

interface DynamicPricingModalProps {
  isOpen: boolean
  onClose: () => void
  locale: string
  translations: {
    title: string
    description: string
    currentPlan: string
    getCredits: string
    mostPopular: string
    maybeLater: string
    securePayment: string
  }
  context?: {
    message?: string
    costToComplete?: number
  }
}

export function DynamicPricingModal({
  isOpen,
  onClose,
  locale,
  translations,
  context
}: DynamicPricingModalProps) {
  const { user } = useAuthStore()
  const [isLoading, setIsLoading] = React.useState<string | null>(null)
  const { currency } = useCurrencyPreference()

  const { data: catalog, isLoading: catalogLoading, error } = usePricingCatalog(currency)

  const currentPlan = (user?.plan || 'free') as PlanName

  // Filter and sort subscription plans for display
  const subscriptionPlans = useMemo(() => {
    if (!catalog?.subscriptions) return []

    return catalog.subscriptions
      .sort((a, b) => {
        // Sort by price to show progression
        return (a.monthlyPrice || 0) - (b.monthlyPrice || 0)
      })
  }, [catalog])

  const handlePurchase = async (planName: string) => {
    setIsLoading(planName)
    try {
      logger.info('dynamic-pricing-modal', `Creating checkout for ${planName}`)

      const response = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planName: planName.toLowerCase(),
          successUrl: `${window.location.origin}/${locale}/dashboard/billing?success=true`,
          cancelUrl: window.location.origin + window.location.pathname,
        }),
      })

      if (!response.ok) throw new Error('Failed to create checkout session')

      const { url } = await response.json()
      if (url) {
        logger.info('dynamic-pricing-modal', `Redirecting to Stripe checkout: ${url}`)
        window.location.href = url
      }
    } catch (error) {
      logger.error('dynamic-pricing-modal', 'Purchase error:', error)
    } finally {
      setIsLoading(null)
    }
  }

  const getRecommendedPlan = () => {
    // Simple logic: if user has no context, recommend starter
    // If they have a cost estimate, recommend based on that
    if (!context?.costToComplete) return 'starter'

    // This is simplified - in production you'd have more sophisticated logic
    if (context.costToComplete > 500) return 'scale'
    if (context.costToComplete > 100) return 'growth'
    return 'starter'
  }

  const recommendedPlan = getRecommendedPlan()

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
        <DialogHeader>
          <div className="text-center">
            <div className="mb-3">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-full mb-3">
                <Icon name="zap" className="w-6 h-6 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
            <DialogTitle className="text-2xl text-gray-900 dark:text-white">
              {translations.title}
            </DialogTitle>
            <DialogDescription className="text-base text-gray-600 dark:text-gray-300">
              {context?.message || translations.description}
            </DialogDescription>

            {/* Currency Selector */}
            <div className="flex justify-center mt-4">
              <CurrencySelector
                translations={{
                  currency: 'Currency',
                  currencyDescription: 'Choose your preferred currency'
                }}
              />
            </div>
          </div>
        </DialogHeader>

        {/* Loading State */}
        {catalogLoading && (
          <div className="py-12 text-center">
            <Icon name="loader-2" className="w-8 h-8 animate-spin text-purple-600 dark:text-purple-400 mx-auto mb-3" />
            <p className="text-gray-600 dark:text-gray-300">Loading pricing...</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="py-12 text-center">
            <Icon name="alert-circle" className="w-8 h-8 text-red-600 dark:text-red-400 mx-auto mb-3" />
            <p className="text-gray-600 dark:text-gray-300 mb-4">Failed to load pricing</p>
            <Button onClick={() => window.location.reload()} variant="outline">
              Retry
            </Button>
          </div>
        )}

        {/* Plans Grid */}
        {!catalogLoading && !error && subscriptionPlans.length > 0 && (
          <div className="mt-6">
            <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
              {subscriptionPlans.map((plan) => {
                const planKey = plan.key?.toLowerCase() || ''
                const isCurrentPlan = planKey === currentPlan.toLowerCase()
                const isRecommended = plan.popular || planKey === recommendedPlan.toLowerCase()
                const formattedPrice = (plan.monthlyPrice || 0).toFixed(2)
                const currencySymbol = plan.currency === 'EUR' ? '€' : plan.currency === 'GBP' ? '£' : '$'

                return (
                  <Card
                    key={plan.key}
                    className={`relative ${
                      isRecommended
                        ? 'border-2 border-purple-500 dark:border-purple-400 shadow-lg'
                        : 'border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    {isRecommended && (
                      <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                        <Badge className="bg-purple-600 dark:bg-purple-500 text-white">
                          {translations.mostPopular}
                        </Badge>
                      </div>
                    )}

                    <CardContent className="p-6">
                      <div className="text-center mb-4">
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2 capitalize">
                          {plan.name}
                        </h3>
                        <div className="text-3xl font-bold text-gray-900 dark:text-white">
                          {currencySymbol}{formattedPrice}
                          <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
                            /month
                          </span>
                        </div>
                      </div>

                      {/* Features */}
                      {plan.features && plan.features.length > 0 && (
                        <ul className="space-y-2 mb-6">
                          {plan.features.map((feature, index) => (
                            <li key={index} className="flex items-start gap-2 text-sm">
                              <Icon name="check" className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                              <span className="text-gray-700 dark:text-gray-300">{feature}</span>
                            </li>
                          ))}
                        </ul>
                      )}

                      <Button
                        onClick={() => handlePurchase(plan.key || '')}
                        disabled={isCurrentPlan || isLoading === plan.key}
                        className={`w-full ${
                          isRecommended
                            ? 'bg-purple-600 hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-600'
                            : 'bg-gray-900 hover:bg-gray-800 dark:bg-gray-700 dark:hover:bg-gray-600'
                        } text-white`}
                      >
                        {isLoading === plan.key ? (
                          <Icon name="loader-2" className="w-4 h-4 animate-spin" />
                        ) : isCurrentPlan ? (
                          translations.currentPlan
                        ) : (
                          translations.getCredits
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                )
              })}
            </div>

            {/* Footer */}
            <div className="mt-8 text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                <Icon name="lock" className="w-3 h-3 inline mr-1" />
                {translations.securePayment}
              </p>
              <Button onClick={onClose} variant="ghost">
                {translations.maybeLater}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
