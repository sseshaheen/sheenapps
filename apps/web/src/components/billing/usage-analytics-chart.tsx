'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import Icon from '@/components/ui/icon'
import { cn } from '@/lib/utils'

interface OperationUsage {
  operation: string
  seconds: number
  minutes: number
  count: number
  percentage: number
}

interface TimeRange {
  start: string
  end: string
  total_seconds: number
  operations: Array<{
    operation: string
    seconds_used: number
    operation_count: number
  }>
}

interface UsageAnalyticsChartProps {
  usageData?: {
    daily?: TimeRange[]
    weekly?: TimeRange[]
    monthly?: TimeRange[]
  }
  translations: any
  className?: string
  period?: 'daily' | 'weekly' | 'monthly'
}

export function UsageAnalyticsChart({ 
  usageData, 
  translations, 
  className,
  period = 'weekly'
}: UsageAnalyticsChartProps) {
  const currentPeriodData = usageData?.[period] || []
  
  // Calculate operation breakdown for the selected period
  const operationBreakdown = useMemo(() => {
    if (!currentPeriodData.length) return []
    
    const operationTotals: Record<string, { seconds: number; count: number }> = {}
    let totalSeconds = 0
    
    // Aggregate data across all time ranges
    currentPeriodData.forEach(range => {
      totalSeconds += range.total_seconds
      range.operations?.forEach(op => {
        if (!operationTotals[op.operation]) {
          operationTotals[op.operation] = { seconds: 0, count: 0 }
        }
        operationTotals[op.operation].seconds += op.seconds_used
        operationTotals[op.operation].count += op.operation_count
      })
    })
    
    // Convert to display format
    return Object.entries(operationTotals)
      .map(([operation, data]): OperationUsage => ({
        operation,
        seconds: data.seconds,
        minutes: Math.floor(data.seconds / 60),
        count: data.count,
        percentage: totalSeconds > 0 ? (data.seconds / totalSeconds) * 100 : 0
      }))
      .sort((a, b) => b.seconds - a.seconds) // Sort by usage
  }, [currentPeriodData])

  // Calculate summary stats
  const totalMinutes = useMemo(() => {
    return currentPeriodData.reduce((sum, range) => sum + Math.floor(range.total_seconds / 60), 0)
  }, [currentPeriodData])

  const totalOperations = useMemo(() => {
    return operationBreakdown.reduce((sum, op) => sum + op.count, 0)
  }, [operationBreakdown])

  // Get operation icon and color
  const getOperationDisplay = (operation: string) => {
    const displays: Record<string, { icon: 'settings' | 'map' | 'download' | 'tag' | 'message-circle' | 'cpu'; color: string; label: string }> = {
      'build': { icon: 'settings', color: 'text-blue-600', label: translations.billing.operations?.build || 'Build' },
      'plan': { icon: 'map', color: 'text-green-600', label: translations.billing.operations?.plan || 'Plan' },
      'export': { icon: 'download', color: 'text-purple-600', label: translations.billing.operations?.export || 'Export' },
      'metadata_generation': { icon: 'tag', color: 'text-orange-600', label: translations.billing.operations?.metadata || 'Metadata' },
      'chat': { icon: 'message-circle', color: 'text-pink-600', label: translations.billing.operations?.chat || 'Chat' }
    }
    
    return displays[operation] || { 
      icon: 'cpu', 
      color: 'text-gray-600', 
      label: operation.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) 
    }
  }

  if (!usageData || operationBreakdown.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="text-lg">{translations.billing.usageAnalytics}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Icon name="bar-chart" className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-sm">{translations.billing.noUsageData}</p>
            <p className="text-xs mt-1">{translations.billing.usageDataHint}</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{translations.billing.usageAnalytics}</CardTitle>
          <Badge variant="outline" className="capitalize">
            {translations.billing.periods?.[period] || period}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-foreground">{totalMinutes}</div>
            <div className="text-sm text-muted-foreground">{translations.billing.minutesUsed}</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-foreground">{totalOperations}</div>
            <div className="text-sm text-muted-foreground">{translations.billing.totalOperations}</div>
          </div>
        </div>

        {/* Operation Breakdown */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-muted-foreground">
            {translations.billing.operationBreakdown}
          </h4>
          
          {operationBreakdown.map((op, index) => {
            const display = getOperationDisplay(op.operation)
            
            return (
              <div key={op.operation} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Icon name={display.icon} className={cn("h-4 w-4", display.color)} />
                    <div>
                      <div className="text-sm font-medium">{display.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {op.count} {op.count === 1 ? 
                          translations.billing.operation : 
                          translations.billing.operations}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium">{op.minutes}m</div>
                    <div className="text-xs text-muted-foreground">
                      {op.percentage.toFixed(1)}%
                    </div>
                  </div>
                </div>
                
                {/* Usage Bar */}
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div 
                    className={cn(
                      "h-2 rounded-full transition-all",
                      display.color.replace('text-', 'bg-').replace('-600', '-500')
                    )}
                    style={{ width: `${Math.max(op.percentage, 2)}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>

        {/* Time-based Usage Trend */}
        {currentPeriodData.length > 1 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground">
              {translations.billing.usageTrend}
            </h4>
            
            <div className="space-y-2">
              {currentPeriodData.slice(-7).map((range, index) => {
                const rangeMinutes = Math.floor(range.total_seconds / 60)
                const maxMinutes = Math.max(...currentPeriodData.map(r => Math.floor(r.total_seconds / 60)))
                const percentage = maxMinutes > 0 ? (rangeMinutes / maxMinutes) * 100 : 0
                
                return (
                  <div key={range.start} className="flex items-center gap-3">
                    <div className="text-xs text-muted-foreground w-16">
                      {new Date(range.start).toLocaleDateString(undefined, { 
                        month: 'short', 
                        day: 'numeric' 
                      })}
                    </div>
                    <div className="flex-1">
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                        <div 
                          className="bg-blue-500 h-1.5 rounded-full transition-all"
                          style={{ width: `${Math.max(percentage, 2)}%` }}
                        />
                      </div>
                    </div>
                    <div className="text-xs font-medium text-muted-foreground w-10 text-right">
                      {rangeMinutes}m
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Average Usage Insight */}
        {currentPeriodData.length > 0 && (
          <div className="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <Icon name="trending-up" className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                {translations.billing.insight}
              </span>
            </div>
            <p className="text-xs text-blue-600 dark:text-blue-400">
              {translations.billing.averageUsage}: {Math.floor(totalMinutes / currentPeriodData.length)}m {translations.billing.per} {translations.billing.periods?.[period.slice(0, -2)] || period.slice(0, -2)}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}