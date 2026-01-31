'use client'

/**
 * @deprecated This component uses hardcoded pricing.
 * Use DynamicPricingModal instead which uses database-driven catalog.
 *
 * Migration: Replace all imports with DynamicPricingModal
 *
 * Example:
 * ```tsx
 * // Old (deprecated):
 * import { CreditsModal } from '@/components/ui/credits-modal'
 * <CreditsModal isOpen={isOpen} onClose={onClose} context={context} />
 *
 * // New (recommended):
 * import { DynamicPricingModal } from '@/components/ui/dynamic-pricing-modal'
 * <DynamicPricingModal
 *   isOpen={isOpen}
 *   onClose={onClose}
 *   locale={locale}
 *   translations={translations.pricingModal}
 *   context={context}
 * />
 * ```
 */

import React from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useAuthStore } from '@/store'
import { PLAN_METADATA, PLAN_FEATURES, getPlanLimits, type PlanName } from '@/config/pricing-plans'
import { getPricingForLocale } from '@/i18n/pricing'
import Icon from '@/components/ui/icon'
import { logger } from '@/utils/logger'

interface CreditsModalProps {
  isOpen: boolean
  onClose: () => void
  context?: {
    message?: string
    costToComplete?: number
    suggestedPackage?: string
  }
}

// AI Time Credits packages focused on generations/usage
const AI_CREDITS_PACKAGES = [
  {
    id: 'starter-credits',
    name: 'Starter Boost',
    description: 'Perfect for completing your current project',
    generations: 100,
    planEquivalent: 'starter' as PlanName,
    popular: false,
    features: [
      '100 AI Generations',
      'Premium Templates',
      'Priority Support',
      'Valid for 30 days'
    ]
  },
  {
    id: 'growth-credits', 
    name: 'Growth Power',
    description: 'Great for multiple projects and iterations',
    generations: 500,
    planEquivalent: 'growth' as PlanName,
    popular: true,
    features: [
      '500 AI Generations',
      'Unlimited Projects',
      'Team Collaboration', 
      'API Access',
      'Valid for 30 days'
    ]
  },
  {
    id: 'unlimited-credits',
    name: 'Unlimited Access',
    description: 'No limits, maximum flexibility',
    generations: -1,
    planEquivalent: 'scale' as PlanName,
    popular: false,
    features: [
      'Unlimited AI Generations',
      'Unlimited Projects & Exports',
      'White Label Options',
      'Dedicated Support',
      'Valid for 30 days'
    ]
  }
]

export function CreditsModal({ isOpen, onClose, context }: CreditsModalProps) {
  const { user } = useAuthStore()
  const [isLoading, setIsLoading] = React.useState<string | null>(null)

  // Get locale from window location (client-safe)
  const locale = typeof window !== 'undefined' ? window.location.pathname.split('/')[1] || 'en' : 'en'
  const pricing = getPricingForLocale(locale)

  const currentPlan = (user?.plan || 'free') as PlanName
  const currentLimits = getPlanLimits(currentPlan)

  const handlePurchase = async (packageId: string, planEquivalent: PlanName) => {
    setIsLoading(packageId)
    try {
      logger.info('credits-modal', `Creating checkout for ${packageId} (${planEquivalent})`)
      
      const response = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planName: planEquivalent,
          successUrl: `${window.location.origin}/${locale}/dashboard/billing?success=true&credits=true`,
          cancelUrl: window.location.origin + window.location.pathname,
          metadata: {
            type: 'credits',
            package: packageId
          }
        }),
      })

      if (!response.ok) throw new Error('Failed to create checkout session')
      
      const { url } = await response.json()
      if (url) {
        logger.info('credits-modal', `Redirecting to Stripe checkout: ${url}`)
        window.location.href = url
      }
    } catch (error) {
      logger.error('credits-modal', 'Purchase error:', error)
      // TODO: Show error toast notification
    } finally {
      setIsLoading(null)
    }
  }

  const getRecommendedPackage = () => {
    if (context?.costToComplete) {
      // If we know exact cost, recommend package that covers it
      if (context.costToComplete <= 100) return 'starter-credits'
      if (context.costToComplete <= 500) return 'growth-credits'
      return 'unlimited-credits'
    }
    
    // Default recommendation based on current plan
    if (currentPlan === 'free') return 'starter-credits'
    if (currentPlan === 'lite') return 'growth-credits'
    return 'unlimited-credits'
  }

  const recommendedPackageId = getRecommendedPackage()

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
        <DialogHeader>
          <div className="text-center">
            <div className="mb-3">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-full mb-3">
                <Icon name="zap" className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
            <DialogTitle className="text-2xl text-gray-900 dark:text-white">
              Add AI Time Credits
            </DialogTitle>
            <DialogDescription className="text-base text-gray-600 dark:text-gray-300">
              {context?.message || 'Choose the perfect AI credits package to continue building your project'}
            </DialogDescription>
          </div>
        </DialogHeader>

        {/* Context Info */}
        {context?.costToComplete && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <Icon name="info" className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-1">
                  Completion Estimate
                </h4>
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  You need approximately <strong>{context.costToComplete} AI generations</strong> to complete this update.
                  {context.suggestedPackage && ` ${context.suggestedPackage}`}
                </p>
              </div>
            </div>
        </div>
        )}

        {/* Current Usage */}
        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium text-gray-900 dark:text-gray-100">
                Current Plan: {PLAN_METADATA[currentPlan].name}
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {currentLimits.max_ai_operations_per_month === -1 
                  ? 'Unlimited AI operations' 
                  : `${currentLimits.max_ai_operations_per_month} AI operations/month`}
              </p>
            </div>
            <Badge variant="outline" className="capitalize">
              {currentPlan}
            </Badge>
          </div>
        </div>

        {/* Credits Packages */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {AI_CREDITS_PACKAGES.map((pkg) => {
            const planPricing = pricing[pkg.planEquivalent]
            const isRecommended = pkg.id === recommendedPackageId
            const isLoadingThis = isLoading === pkg.id
            
            return (
              <Card 
                key={pkg.id}
                className={`relative transition-all bg-white dark:bg-gray-800 ${
                  isRecommended 
                    ? 'border-2 border-purple-400 dark:border-purple-500 bg-purple-50/50 dark:bg-purple-900/20' 
                    : 'border border-gray-200 dark:border-gray-600'
                }`}
              >
                {isRecommended && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                    <Badge className="bg-purple-600 text-white">
                      <Icon name="star" className="w-3 h-3 mr-1" />
                      Recommended
                    </Badge>
                  </div>
                )}

                {pkg.popular && !isRecommended && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                    <Badge className="bg-gradient-to-r from-purple-600 to-pink-600 text-white">
                      Most Popular
                    </Badge>
                  </div>
                )}

                <CardHeader className="text-center pb-4">
                  <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white">
                    {pkg.name}
                  </CardTitle>
                  <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
                    {pkg.description}
                  </p>
                  
                  <div className="space-y-1">
                    <div className="text-3xl font-bold text-gray-900 dark:text-white">
                      {pricing.symbol}{planPricing.monthly}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {pkg.generations === -1 ? 'Unlimited' : `${pkg.generations}`} AI Generations
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="pt-0">
                  <ul className="space-y-2 mb-6">
                    {pkg.features.map((feature, index) => (
                      <li key={index} className="flex items-start gap-2 text-sm">
                        <Icon 
                          name="check" 
                          className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                            isRecommended ? 'text-purple-600 dark:text-purple-400' : 'text-green-600 dark:text-green-400'
                          }`} 
                        />
                        <span className="text-gray-600 dark:text-gray-300">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Button 
                    onClick={() => handlePurchase(pkg.id, pkg.planEquivalent)}
                    disabled={isLoadingThis || isLoading !== null}
                    className={isRecommended 
                      ? "w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white border-0" 
                      : "w-full border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                    }
                    variant={isRecommended ? "default" : "outline"}
                  >
                    {isLoadingThis ? (
                      <>
                        <Icon name="loader-2" className="w-4 h-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Icon name="zap" className="w-4 h-4 mr-2" />
                        Get Credits
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-600">
          <Button 
            variant="ghost" 
            onClick={onClose} 
            disabled={isLoading !== null}
            className="text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100"
          >
            Maybe Later
          </Button>
          
          <div className="text-right">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Secure payment via Stripe • Cancel anytime • 30-day guarantee
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}