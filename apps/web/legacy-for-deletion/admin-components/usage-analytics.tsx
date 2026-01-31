'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Icon, type IconName } from '@/components/ui/icon'
import { Button } from '@/components/ui/button'
import { QuotaMonitoring, UserQuotaStatus } from '@/services/quota/monitoring-queries'
import { UsageTrendsChart } from './usage-trends-chart'
import { UsagePrediction } from './usage-prediction'
import { OptimizationSuggestions } from './optimization-suggestions'
import { cn } from '@/lib/utils'

interface UsageAnalyticsProps {
  userId: string
  onUpgradeClick?: () => void
}

export function UsageAnalytics({ userId, onUpgradeClick }: UsageAnalyticsProps) {
  const [quotaStatuses, setQuotaStatuses] = useState<UserQuotaStatus[]>([])
  const [selectedMetric, setSelectedMetric] = useState<string>('ai_generations')
  const [isLoading, setIsLoading] = useState(true)
  const [usageHistory, setUsageHistory] = useState<any[]>([])
  
  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 60000) // Refresh every minute
    
    return () => clearInterval(interval)
  }, [userId])
  
  const loadData = async () => {
    try {
      const statuses = await QuotaMonitoring.getUserQuotaStatus(userId)
      setQuotaStatuses(statuses)
      
      // Load usage history (mock data for now)
      const history = generateMockHistory(statuses)
      setUsageHistory(history)
    } catch (error) {
      console.error('Failed to load usage data:', error)
    } finally {
      setIsLoading(false)
    }
  }
  
  const generateMockHistory = (statuses: UserQuotaStatus[]) => {
    // Generate mock historical data for the chart
    const days = 30
    const history = []
    
    for (let i = days; i >= 0; i--) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      
      const dayData: any = {
        date: date.toISOString(),
        day: date.getDate()
      }
      
      statuses.forEach(status => {
        // Simulate gradual usage increase
        const maxUsage = status.currentUsage
        const dailyUsage = Math.floor((maxUsage / 30) * (30 - i) + Math.random() * 5)
        dayData[status.metric] = Math.max(0, dailyUsage)
      })
      
      history.push(dayData)
    }
    
    return history
  }
  
  const getMetricIcon = (metric: string) => {
    switch (metric) {
      case 'ai_generations': return 'brain'
      case 'exports': return 'download'
      case 'projects': return 'folder'
      default: return 'activity'
    }
  }
  
  const getMetricLabel = (metric: string) => {
    switch (metric) {
      case 'ai_generations': return 'AI Generations'
      case 'exports': return 'Exports'
      case 'projects': return 'Projects'
      default: return metric
    }
  }
  
  const getUsageColor = (percent: number) => {
    if (percent >= 90) return 'text-red-600'
    if (percent >= 70) return 'text-orange-600'
    if (percent >= 50) return 'text-yellow-600'
    return 'text-green-600'
  }
  
  const getProgressColor = (percent: number) => {
    if (percent >= 90) return 'bg-red-200'
    if (percent >= 70) return 'bg-orange-200'
    if (percent >= 50) return 'bg-yellow-200'
    return 'bg-green-200'
  }
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Icon name="loader-2" className="h-8 w-8 animate-spin" />
      </div>
    )
  }
  
  const selectedStatus = quotaStatuses.find(s => s.metric === selectedMetric)
  
  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {quotaStatuses.map(status => (
          <Card 
            key={status.metric}
            className={cn(
              "cursor-pointer transition-all",
              selectedMetric === status.metric && "ring-2 ring-blue-500"
            )}
            onClick={() => setSelectedMetric(status.metric)}
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon name={getMetricIcon(status.metric)} className="h-4 w-4 text-gray-500" />
                  <span>{getMetricLabel(status.metric)}</span>
                </div>
                <Badge 
                  variant="outline"
                  className={cn(
                    "text-xs",
                    status.usagePercent >= 90 && "bg-red-50 text-red-700 border-red-200"
                  )}
                >
                  {Math.round(status.usagePercent)}%
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className={getUsageColor(status.usagePercent)}>
                    {status.currentUsage} used
                  </span>
                  <span className="text-gray-500">
                    {status.planLimit === -1 ? 'Unlimited' : `${status.planLimit} total`}
                  </span>
                </div>
                <Progress 
                  value={status.usagePercent} 
                  className={cn("h-2", getProgressColor(status.usagePercent))}
                />
                {status.bonusAvailable > 0 && (
                  <p className="text-xs text-gray-500">
                    +{status.bonusAvailable} bonus available
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      
      {/* Detailed Analytics */}
      {selectedStatus && (
        <Tabs defaultValue="trends" className="space-y-4">
          <TabsList>
            <TabsTrigger value="trends">Usage Trends</TabsTrigger>
            <TabsTrigger value="prediction">Predictions</TabsTrigger>
            <TabsTrigger value="optimization">Optimization</TabsTrigger>
          </TabsList>
          
          <TabsContent value="trends" className="space-y-4">
            <UsageTrendsChart 
              data={usageHistory}
              metric={selectedMetric}
              limit={selectedStatus.planLimit}
            />
            
            {/* Usage Insights */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Usage Insights</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <InsightItem
                    icon="trending-up"
                    title="Peak Usage Day"
                    value="Tuesday"
                    description="You use 40% more on Tuesdays"
                  />
                  <InsightItem
                    icon="clock"
                    title="Most Active Time"
                    value="2-4 PM"
                    description="60% of usage during this period"
                  />
                  <InsightItem
                    icon="calendar"
                    title="Days Until Reset"
                    value={Math.ceil((new Date(selectedStatus.nextReset).getTime() - Date.now()) / (1000 * 60 * 60 * 24))}
                    description={`Resets on ${new Date(selectedStatus.nextReset).toLocaleDateString()}`}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="prediction">
            <UsagePrediction
              current={selectedStatus.currentUsage}
              limit={selectedStatus.planLimit}
              daysRemaining={Math.ceil((new Date(selectedStatus.nextReset).getTime() - Date.now()) / (1000 * 60 * 60 * 24))}
              historicalData={usageHistory}
              metric={selectedMetric}
            />
          </TabsContent>
          
          <TabsContent value="optimization">
            <OptimizationSuggestions
              usage={selectedStatus}
              historicalData={usageHistory}
              onUpgradeClick={onUpgradeClick}
            />
          </TabsContent>
        </Tabs>
      )}
      
      {/* Quick Actions */}
      <Card>
        <CardContent className="flex items-center justify-between py-4">
          <div>
            <p className="font-medium">Need more capacity?</p>
            <p className="text-sm text-gray-500">Upgrade your plan for increased limits</p>
          </div>
          <Button onClick={onUpgradeClick}>
            View Upgrade Options
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function InsightItem({ 
  icon, 
  title, 
  value, 
  description 
}: { 
  icon: IconName
  title: string
  value: string | number
  description: string
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon name={icon} className="h-5 w-5 text-gray-400 mt-0.5" />
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{title}</span>
          <span className="font-semibold">{value}</span>
        </div>
        <p className="text-xs text-gray-500">{description}</p>
      </div>
    </div>
  )
}