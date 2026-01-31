'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { QuotaMonitoring, UserQuotaStatus } from '@/services/quota/monitoring-queries'
import { Icon } from '@/components/ui/icon'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

interface UsageWarningBannerProps {
  metric: 'ai_generations' | 'exports' | 'projects'
  userId?: string
  className?: string
  onDismiss?: () => void
}

export function UsageWarningBanner({ 
  metric, 
  userId,
  className,
  onDismiss
}: UsageWarningBannerProps) {
  const router = useRouter()
  const [quotaStatus, setQuotaStatus] = useState<UserQuotaStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isDismissed, setIsDismissed] = useState(false)
  
  useEffect(() => {
    if (userId) {
      loadQuotaStatus()
    }
  }, [userId, metric])
  
  const loadQuotaStatus = async () => {
    if (!userId) return
    
    try {
      const statuses = await QuotaMonitoring.getUserQuotaStatus(userId)
      const metricStatus = statuses.find(s => s.metric === metric)
      setQuotaStatus(metricStatus || null)
    } catch (error) {
      console.error('Failed to load quota status:', error)
    } finally {
      setIsLoading(false)
    }
  }
  
  if (isLoading || !quotaStatus || isDismissed) {
    return null
  }
  
  const usagePercent = quotaStatus.usagePercent
  
  // Don't show banner if usage is below 80%
  if (usagePercent < 80) {
    return null
  }
  
  const severity = usagePercent >= 95 ? 'critical' : 'warning'
  const remaining = quotaStatus.remaining
  
  const getMetricLabel = (metric: string) => {
    switch (metric) {
      case 'ai_generations': return 'AI generations'
      case 'exports': return 'exports'
      case 'projects': return 'projects'
      default: return metric
    }
  }
  
  const getUpgradeMessage = (metric: string, limit: number) => {
    switch (metric) {
      case 'ai_generations':
        return `Upgrade to get more AI generations and unlock advanced features`
      case 'exports':
        return `Upgrade to export more projects and access premium formats`
      case 'projects':
        return `Upgrade to create unlimited projects and collaborate with your team`
      default:
        return `Upgrade to increase your ${metric} limit`
    }
  }
  
  const handleDismiss = () => {
    setIsDismissed(true)
    onDismiss?.()
  }
  
  return (
    <div className={cn(
      "relative rounded-lg p-4 mb-4",
      severity === 'critical' 
        ? "bg-red-50 border border-red-200" 
        : "bg-yellow-50 border border-yellow-200",
      className
    )}>
      <button
        onClick={handleDismiss}
        className="absolute top-2 right-2 p-1 hover:bg-white/50 rounded"
        aria-label="Dismiss"
      >
        <Icon name="x" className="h-4 w-4 text-gray-500" />
      </button>
      
      <div className="flex items-start gap-3">
        <Icon 
          name={severity === 'critical' ? 'alert-circle' : 'alert-triangle'} 
          className={cn(
            "h-5 w-5 mt-0.5",
            severity === 'critical' ? 'text-red-600' : 'text-yellow-600'
          )}
        />
        <div className="flex-1 space-y-3">
          <div>
            <p className="font-medium">
              {severity === 'critical' 
                ? `Only ${remaining} ${getMetricLabel(metric)} remaining!`
                : `You've used ${Math.round(usagePercent)}% of your ${getMetricLabel(metric)} this month`
              }
            </p>
            <p className="text-sm text-gray-600 mt-1">
              {getUpgradeMessage(metric, quotaStatus.planLimit)}
            </p>
          </div>
          
          {/* Progress bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-500">
              <span>{quotaStatus.currentUsage} used</span>
              <span>{quotaStatus.planLimit} total</span>
            </div>
            <Progress 
              value={usagePercent} 
              className={cn(
                "h-2",
                severity === 'critical' ? 'bg-red-200' : 'bg-yellow-200'
              )}
            />
          </div>
          
          {/* Actions */}
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              variant={severity === 'critical' ? 'default' : 'outline'}
              onClick={() => router.push('/dashboard/billing')}
            >
              Upgrade Plan
            </Button>
            
            {quotaStatus.bonusAvailable > 0 && (
              <span className="text-sm text-gray-600">
                +{quotaStatus.bonusAvailable} bonus {getMetricLabel(metric)} available
              </span>
            )}
            
            {severity === 'warning' && (
              <button
                onClick={handleDismiss}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Remind me later
              </button>
            )}
          </div>
          
          {/* Reset date */}
          <p className="text-xs text-gray-500">
            Usage resets on {new Date(quotaStatus.nextReset).toLocaleDateString()}
          </p>
        </div>
      </div>
    </div>
  )
}

// Convenience component for AI generations
export function AIUsageWarningBanner({ userId, ...props }: Omit<UsageWarningBannerProps, 'metric'>) {
  return <UsageWarningBanner metric="ai_generations" userId={userId} {...props} />
}

// Convenience component for exports
export function ExportUsageWarningBanner({ userId, ...props }: Omit<UsageWarningBannerProps, 'metric'>) {
  return <UsageWarningBanner metric="exports" userId={userId} {...props} />
}

// Convenience component for projects
export function ProjectUsageWarningBanner({ userId, ...props }: Omit<UsageWarningBannerProps, 'metric'>) {
  return <UsageWarningBanner metric="projects" userId={userId} {...props} />
}