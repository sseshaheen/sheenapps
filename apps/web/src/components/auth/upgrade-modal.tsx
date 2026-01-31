'use client'

import React from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store'
import { PLAN_METADATA, PLAN_FEATURES, getPlanLimits, type PlanName } from '@/config/pricing-plans'
import { getPricingForLocale } from '@/i18n/pricing'
import Icon from '@/components/ui/icon'

// Helper function to get key upgrade benefits
function getUpgradeHighlights(currentPlan: PlanName, suggestedPlan: PlanName): string[] {
  const currentLimits = getPlanLimits(currentPlan)
  const suggestedLimits = getPlanLimits(suggestedPlan)
  
  const highlights: string[] = []
  
  // Projects
  if (suggestedLimits.max_projects === -1) {
    highlights.push('Unlimited projects')
  } else if (suggestedLimits.max_projects > currentLimits.max_projects) {
    highlights.push(`${suggestedLimits.max_projects} projects (up from ${currentLimits.max_projects})`)
  }
  
  // AI Operations
  if (suggestedLimits.max_ai_operations_per_month === -1) {
    highlights.push('Unlimited AI operations')
  } else if (suggestedLimits.max_ai_operations_per_month > currentLimits.max_ai_operations_per_month) {
    highlights.push(`${suggestedLimits.max_ai_operations_per_month} AI operations/month`)
  }
  
  // Exports
  if (suggestedLimits.max_exports_per_month === -1) {
    highlights.push('Unlimited exports')
  } else if (suggestedLimits.max_exports_per_month > currentLimits.max_exports_per_month) {
    highlights.push(`${suggestedLimits.max_exports_per_month} exports/month`)
  }
  
  // Key features for lite plan
  if (suggestedPlan === 'lite') {
    highlights.push('More projects')
    highlights.push('More AI operations')
    highlights.push('Priority support')
    highlights.push('Advanced features')
  }
  
  return highlights.slice(0, 6) // Return max 6 highlights
}

export function UpgradeModal() {
  const { showUpgradeModal, closeUpgradeModal, upgradeContext, user } = useAuthStore()
  const [isLoading, setIsLoading] = React.useState(false)

  if (!upgradeContext) return null

  const currentPlan = (user?.plan || 'free') as PlanName
  const suggestedPlan = (currentPlan === 'free' ? 'lite' : 'lite') as PlanName
  
  // Get pricing for user's locale (default to 'en')
  const locale = typeof window !== 'undefined' ? window.location.pathname.split('/')[1] || 'en' : 'en'
  const pricing = getPricingForLocale(locale)

  const handleUpgrade = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planName: suggestedPlan,
          successUrl: `${window.location.origin}/${locale}/dashboard/billing?success=true`,
          cancelUrl: window.location.origin + window.location.pathname,
        }),
      })

      if (!response.ok) throw new Error('Failed to create checkout session')
      
      const { url } = await response.json()
      if (url) {
        window.location.href = url
      }
    } catch (error) {
      console.error('Upgrade error:', error)
      // TODO: Show error toast
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={showUpgradeModal} onOpenChange={closeUpgradeModal}>
      <DialogContent className="sm:max-w-2xl bg-white text-gray-900 border-gray-200">
        <DialogHeader>
          <DialogTitle className="text-center text-gray-900">
            {upgradeContext.action?.startsWith('unlock') ? 
              upgradeContext.action.charAt(0).toUpperCase() + upgradeContext.action.slice(1) : 
              `Unlock ${upgradeContext.action}`}
          </DialogTitle>
          <DialogDescription className="text-center text-gray-600">
            {upgradeContext.message || `Upgrade to ${PLAN_METADATA[suggestedPlan].name} to continue`}
          </DialogDescription>
        </DialogHeader>

        <div className="grid md:grid-cols-2 gap-4 mt-6">
          {/* Current Plan */}
          <div className="p-4 border border-gray-200 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
              <h3 className="font-semibold text-gray-900">
                {PLAN_METADATA[currentPlan].name} 
                <span className="text-sm font-normal text-gray-500 ml-1">(Current)</span>
              </h3>
            </div>
            
            <div className="text-2xl font-bold mb-3 text-gray-900">
              ${pricing[currentPlan].monthly}
              <span className="text-sm font-normal text-gray-500">/month</span>
            </div>

            <ul className="space-y-2">
              {PLAN_FEATURES[currentPlan].slice(0, 4).map((feature, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <Icon name="check" className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0"  />
                  <span className="text-gray-600">{feature}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Suggested Plan */}
          <div className="p-4 border-2 border-purple-300 bg-purple-50 rounded-lg relative">
            {PLAN_METADATA[suggestedPlan].popular && (
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1">
                  <Icon name="star" className="w-3 h-3"  />
                  {PLAN_METADATA[suggestedPlan].badge}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
              <h3 className="font-semibold text-purple-900">
                {PLAN_METADATA[suggestedPlan].name}
              </h3>
            </div>
            
            <div className="text-2xl font-bold mb-3 text-purple-900">
              ${pricing[suggestedPlan].monthly}
              <span className="text-sm font-normal text-gray-500">/month</span>
            </div>

            <ul className="space-y-2 mb-4">
              {PLAN_FEATURES[suggestedPlan].slice(0, 4).map((feature, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <Icon name="check" className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0"  />
                  <span className="text-gray-900">{feature}</span>
                </li>
              ))}
            </ul>

            <Button 
              className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
              onClick={handleUpgrade}
              disabled={isLoading}
            >
              <Icon name="zap" className="w-4 h-4 mr-2"  />
              {isLoading ? 'Processing...' : 'Upgrade Now'}
            </Button>
          </div>
        </div>

        {/* Feature Comparison */}
        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <h4 className="font-semibold mb-3 text-gray-900">What you&apos;ll unlock with {PLAN_METADATA[suggestedPlan].name}:</h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            {getUpgradeHighlights(currentPlan, suggestedPlan).map((feature, i) => (
              <div key={i} className="flex items-center gap-2">
                <Icon name="check" className="w-4 h-4 text-green-600"  />
                <span className="text-gray-900">{feature}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="flex gap-3 mt-6">
          <Button variant="outline" onClick={closeUpgradeModal} className="flex-1">
            Maybe later
          </Button>
          <Button 
            className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
            onClick={handleUpgrade}
            disabled={isLoading}
          >
            {isLoading ? 'Processing...' : `Continue with ${PLAN_METADATA[suggestedPlan].name}`}
          </Button>
        </div>

        <p className="text-xs text-gray-500 text-center mt-4">
          30-day money-back guarantee &bull; Cancel anytime &bull; Export your data
        </p>
      </DialogContent>
    </Dialog>
  )
}