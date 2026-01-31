'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { 
  PLAN_LIMITS, 
  PLAN_FEATURES, 
  PLAN_METADATA, 
  formatLimit as formatLimitCentralized,
  type PlanName 
} from '@/config/pricing-plans'
import { getPricingForLocale } from '@/i18n/pricing'

interface SmartUpgradeModalProps {
  isOpen: boolean
  onClose: () => void
  context: {
    metric: 'ai_generations' | 'exports' | 'projects'
    currentPlan: string
    currentUsage: number
    currentLimit: number
    suggestedPlan?: string
  }
}

const UPGRADE_MESSAGES = {
  ai_generations: {
    title: "Need More AI Power? 🚀",
    message: "You're creating amazing things! Upgrade to continue using AI to build your business.",
    benefits: [
      "Generate unlimited content variations",
      "Access advanced AI models",
      "Priority processing for faster results"
    ]
  },
  exports: {
    title: "Export Without Limits 📤",
    message: "Share your work with the world. Upgrade to export in multiple formats.",
    benefits: [
      "Export to HTML, React, and more",
      "Download source code",
      "Bulk export capabilities"
    ]
  },
  projects: {
    title: "Build More Projects 🏗️",
    message: "Your creativity shouldn't be limited. Upgrade to create unlimited projects.",
    benefits: [
      "Unlimited project storage",
      "Advanced project templates",
      "Team collaboration features"
    ]
  }
}

export function SmartUpgradeModal({ isOpen, onClose, context }: SmartUpgradeModalProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  
  // Get locale and pricing
  const locale = typeof window !== 'undefined' ? window.location.pathname.split('/')[1] || 'en' : 'en'
  const pricing = getPricingForLocale(locale)
  
  const currentPlan = context.currentPlan as PlanName
  const suggestedPlan = (context.suggestedPlan || getRecommendedPlan(context)) as PlanName
  const upgradeInfo = UPGRADE_MESSAGES[context.metric]
  
  function getRecommendedPlan(ctx: typeof context): string {
    // If already on Scale, no upgrade needed
    if (ctx.currentPlan === 'scale') return 'scale'
    
    // Recommend based on usage patterns
    const usageRatio = ctx.currentUsage / ctx.currentLimit
    
    if (ctx.currentPlan === 'free') {
      return usageRatio > 0.8 ? 'starter' : 'starter'
    } else if (ctx.currentPlan === 'starter') {
      return usageRatio > 0.8 ? 'growth' : 'growth'
    } else if (ctx.currentPlan === 'growth') {
      return 'scale'
    }
    
    return 'starter'
  }
  
  const handleUpgrade = async () => {
    setIsLoading(true)
    router.push(`/dashboard/billing?plan=${suggestedPlan}&source=quota_modal`)
  }
  
  const getMetricLabel = (metric: string) => {
    switch (metric) {
      case 'ai_generations': return 'AI Generations'
      case 'exports': return 'Exports'
      case 'projects': return 'Projects'
      default: return metric
    }
  }
  
  const formatLimit = (limit: number) => {
    if (limit === -1 || limit >= 1000000) return 'Unlimited'
    if (limit >= 1000) return `${limit / 1000}k`
    return limit.toLocaleString()
  }
  
  const getIncreasePercentage = () => {
    const metricKey = context.metric === 'ai_generations' ? 'max_ai_generations_per_month' :
                      context.metric === 'exports' ? 'max_exports_per_month' :
                      'max_projects'
    
    const currentLimit = PLAN_LIMITS[currentPlan][metricKey as keyof typeof PLAN_LIMITS.free]
    const newLimit = PLAN_LIMITS[suggestedPlan][metricKey as keyof typeof PLAN_LIMITS.free]
    
    if (newLimit === -1) return 'Unlimited'
    if (currentLimit === 0) return '∞'
    
    // Ensure both values are numbers before arithmetic operations
    const currentLimitNum = typeof currentLimit === 'number' ? currentLimit : 0
    const newLimitNum = typeof newLimit === 'number' ? newLimit : 0
    
    if (currentLimitNum === 0) return '∞'
    
    const increase = ((newLimitNum - currentLimitNum) / currentLimitNum) * 100
    return `+${Math.round(increase)}%`
  }
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl">{upgradeInfo.title}</DialogTitle>
          <DialogDescription className="text-base">
            {upgradeInfo.message}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {/* Current usage visualization */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Current {getMetricLabel(context.metric)} Usage</span>
              <span className="text-sm text-gray-500">
                {context.currentUsage} / {formatLimit(context.currentLimit)}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div 
                className="bg-gradient-to-r from-blue-500 to-blue-600 h-3 rounded-full transition-all"
                style={{ width: `${Math.min((context.currentUsage / context.currentLimit) * 100, 100)}%` }}
              />
            </div>
          </div>
          
          {/* Plan comparison */}
          <div className="grid grid-cols-2 gap-4">
            <PlanComparisonCard 
              planKey={currentPlan}
              metric={context.metric}
              label="Current Plan"
              highlight={false}
              pricing={pricing}
              locale={locale}
            />
            <PlanComparisonCard 
              planKey={suggestedPlan}
              metric={context.metric}
              label="Recommended"
              highlight={true}
              increase={getIncreasePercentage()}
              pricing={pricing}
              locale={locale}
            />
          </div>
          
          {/* Benefits of upgrading */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <h3 className="font-medium text-green-900 mb-3 flex items-center gap-2">
              <Icon name="check-circle" className="w-5 h-5" />
              What you'll get with {PLAN_METADATA[suggestedPlan].name}:
            </h3>
            <ul className="space-y-2">
              {upgradeInfo.benefits.map((benefit, index) => (
                <li key={index} className="flex items-start gap-2 text-sm text-green-800">
                  <Icon name="check" className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>{benefit}</span>
                </li>
              ))}
              {PLAN_FEATURES[suggestedPlan].slice(0, 3).map((feature, index) => (
                <li key={`feature-${index}`} className="flex items-start gap-2 text-sm text-green-800">
                  <Icon name="check" className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>
          
          {/* Urgency indicator */}
          {context.currentUsage >= context.currentLimit * 0.95 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2">
              <Icon name="alert-circle" className="w-5 h-5 text-red-600" />
              <p className="text-sm text-red-800">
                You've used {Math.round((context.currentUsage / context.currentLimit) * 100)}% of your quota. 
                Upgrade now to avoid interruption.
              </p>
            </div>
          )}
        </div>
        
        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <Button 
            variant="outline" 
            onClick={onClose}
          >
            Maybe Later
          </Button>
          <Button 
            onClick={handleUpgrade}
            disabled={isLoading}
            className="min-w-[120px]"
          >
            {isLoading ? (
              <>
                <Icon name="loader-2" className="w-4 h-4 mr-2 animate-spin" />
                Loading...
              </>
            ) : (
              <>
                Upgrade to {PLAN_METADATA[suggestedPlan].name}
                <Icon name="arrow-right" className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        </div>
        
        {/* Alternative options */}
        <div className="text-center text-sm text-gray-500 pt-2 border-t">
          {context.metric === 'ai_generations' && (
            <p>
              Usage resets on the 1st of each month. 
              <button className="text-blue-600 hover:underline ml-1" onClick={() => router.push('/dashboard/usage')}>
                View usage history
              </button>
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function PlanComparisonCard({ 
  planKey,
  metric,
  label, 
  highlight,
  increase,
  pricing,
  locale
}: { 
  planKey: PlanName
  metric: string
  label: string
  highlight: boolean
  increase?: string
  pricing: any
  locale: string
}) {
  const metricKey = metric === 'ai_generations' ? 'max_ai_generations_per_month' :
                    metric === 'exports' ? 'max_exports_per_month' :
                    'max_projects'
  const metricLimit = PLAN_LIMITS[planKey][metricKey as keyof typeof PLAN_LIMITS.free]
  const planMetadata = PLAN_METADATA[planKey]
  
  const formatLimit = (limit: number | Record<string, boolean>) => {
    if (typeof limit !== 'number') return 'N/A'
    if (limit === -1) return 'Unlimited'
    return limit.toLocaleString()
  }
  
  return (
    <Card className={cn(
      "p-4 relative",
      highlight && "border-blue-500 bg-blue-50/50"
    )}>
      {highlight && (
        <Badge className="absolute -top-2 -right-2 bg-blue-600">
          Recommended
        </Badge>
      )}
      
      <div className="space-y-3">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <h4 className="text-lg font-semibold">{planMetadata.name}</h4>
        </div>
        
        <div className="space-y-1">
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold">
              {pricing[planKey].monthly === 0 ? 'Free' : `${pricing.symbol}${pricing[planKey].monthly}`}
            </span>
            {pricing[planKey].monthly > 0 && <span className="text-gray-500">/month</span>}
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-lg font-medium">
              {formatLimit(metricLimit)}
            </span>
            <span className="text-sm text-gray-500">
              {metric.replace('_', ' ')}
            </span>
            {increase && highlight && (
              <Badge variant="secondary" className="text-xs bg-green-100 text-green-700">
                {increase}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}