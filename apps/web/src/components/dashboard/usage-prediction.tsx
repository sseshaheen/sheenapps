'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import { Icon, type IconName } from '@/components/ui/icon'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface UsagePredictionProps {
  current: number
  limit: number
  daysRemaining: number
  historicalData: any[]
  metric: string
}

export function UsagePrediction({ 
  current, 
  limit, 
  daysRemaining, 
  historicalData,
  metric 
}: UsagePredictionProps) {
  // Calculate average daily usage from last 7 days
  const last7Days = historicalData.slice(-7)
  const totalLast7 = last7Days.reduce((sum, day) => sum + (day[metric] || 0), 0)
  const avgDailyUsage = totalLast7 / 7
  
  // Calculate predictions
  const projectedUsage = current + (avgDailyUsage * daysRemaining)
  const projectedPercent = limit === -1 ? 0 : (projectedUsage / limit) * 100
  const willExceed = limit !== -1 && projectedUsage > limit
  
  // Calculate when limit will be reached
  const remainingCapacity = limit === -1 ? Infinity : Math.max(0, limit - current)
  const daysUntilLimit = avgDailyUsage > 0 ? Math.floor(remainingCapacity / avgDailyUsage) : daysRemaining
  
  // Calculate recommended daily budget
  const recommendedDailyBudget = daysRemaining > 0 ? Math.floor(remainingCapacity / daysRemaining) : 0
  
  // Trend analysis
  const last14Days = historicalData.slice(-14, -7)
  const totalLast14to7 = last14Days.reduce((sum, day) => sum + (day[metric] || 0), 0)
  const avgLast14to7 = totalLast14to7 / 7
  const trendPercent = avgLast14to7 > 0 ? ((avgDailyUsage - avgLast14to7) / avgLast14to7) * 100 : 0
  const trend = trendPercent > 10 ? 'increasing' : trendPercent < -10 ? 'decreasing' : 'stable'
  
  return (
    <div className="space-y-4">
      {/* Projection Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Usage Projection</span>
            <Badge variant={willExceed ? 'destructive' : 'default'}>
              {willExceed ? 'Will Exceed' : 'Within Limit'}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Visual projection */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Current: {current}</span>
              <span>Projected: {Math.round(projectedUsage)}</span>
              <span>Limit: {limit === -1 ? 'Unlimited' : limit}</span>
            </div>
            <div className="relative">
              <Progress 
                value={Math.min(100, (current / (limit === -1 ? current : limit)) * 100)} 
                className="h-3"
              />
              {limit !== -1 && (
                <div 
                  className={cn(
                    "absolute top-0 h-3 opacity-50",
                    willExceed ? "bg-red-500" : "bg-blue-300"
                  )}
                  style={{ 
                    left: `${(current / limit) * 100}%`,
                    width: `${Math.min(100 - (current / limit) * 100, ((projectedUsage - current) / limit) * 100)}%`
                  }}
                />
              )}
            </div>
          </div>
          
          {/* Key metrics */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-sm text-gray-500">Average Daily Usage</p>
              <p className="text-2xl font-semibold">{Math.round(avgDailyUsage)}</p>
              <div className="flex items-center gap-1">
                <Icon 
                  name={trend === 'increasing' ? 'trending-up' : trend === 'decreasing' ? 'trending-down' : 'minus'}
                  className={cn(
                    "h-4 w-4",
                    trend === 'increasing' ? 'text-red-500' : 
                    trend === 'decreasing' ? 'text-green-500' : 
                    'text-gray-500'
                  )}
                />
                <span className={cn(
                  "text-xs",
                  trend === 'increasing' ? 'text-red-600' : 
                  trend === 'decreasing' ? 'text-green-600' : 
                  'text-gray-600'
                )}>
                  {Math.abs(Math.round(trendPercent))}% vs last week
                </span>
              </div>
            </div>
            
            <div className="space-y-1">
              <p className="text-sm text-gray-500">Days Until Limit</p>
              <p className="text-2xl font-semibold">
                {daysUntilLimit === Infinity ? '∞' : daysUntilLimit}
              </p>
              <p className="text-xs text-gray-600">
                At current rate
              </p>
            </div>
          </div>
          
          {/* Alert if will exceed */}
          {willExceed && (
            <Alert variant="destructive">
              <Icon name="alert-triangle" className="h-4 w-4" />
              <AlertDescription>
                At your current usage rate, you'll exceed your limit in {daysUntilLimit} days, 
                which is {daysRemaining - daysUntilLimit} days before the reset.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
      
      {/* Recommendations */}
      <Card>
        <CardHeader>
          <CardTitle>Recommendations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Daily budget */}
          <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
            <div className="flex items-center gap-3">
              <Icon name="calculator" className="h-5 w-5 text-blue-600" />
              <div>
                <p className="font-medium">Recommended Daily Budget</p>
                <p className="text-sm text-gray-600">To stay within your limit</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-2xl font-semibold text-blue-600">
                {recommendedDailyBudget}
              </p>
              <p className="text-xs text-gray-500">per day</p>
            </div>
          </div>
          
          {/* Usage tips based on prediction */}
          {willExceed && (
            <>
              <RecommendationItem
                icon="zap"
                title="Reduce Usage by"
                value={`${Math.round(((avgDailyUsage - recommendedDailyBudget) / avgDailyUsage) * 100)}%`}
                description="To avoid exceeding your limit"
              />
              <RecommendationItem
                icon="shield"
                title="Consider Upgrading"
                value="Next Plan"
                description="Get more capacity for your needs"
              />
            </>
          )}
          
          {!willExceed && remainingCapacity > current && (
            <RecommendationItem
              icon="trending-up"
              title="You Can Use"
              value={`${Math.round((remainingCapacity / current) * 100)}% more`}
              description="And still stay within limits"
            />
          )}
          
          {trend === 'increasing' && trendPercent > 20 && (
            <Alert>
              <Icon name="info" className="h-4 w-4" />
              <AlertDescription>
                Your usage has increased by {Math.round(trendPercent)}% compared to last week. 
                Monitor closely to avoid surprises.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function RecommendationItem({ 
  icon, 
  title, 
  value, 
  description 
}: { 
  icon: IconName
  title: string
  value: string
  description: string
}) {
  return (
    <div className="flex items-center justify-between p-3 border rounded-lg">
      <div className="flex items-center gap-3">
        <Icon name={icon} className="h-5 w-5 text-gray-400" />
        <div>
          <p className="font-medium">{title}</p>
          <p className="text-sm text-gray-600">{description}</p>
        </div>
      </div>
      <Badge variant="secondary" className="text-sm">
        {value}
      </Badge>
    </div>
  )
}