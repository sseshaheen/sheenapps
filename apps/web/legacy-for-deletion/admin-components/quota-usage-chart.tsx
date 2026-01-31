'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { QuotaMonitoring } from '@/services/quota/monitoring-queries'
import { Icon } from '@/components/ui/icon'
import { Badge } from '@/components/ui/badge'

export function QuotaUsageChart() {
  const [metrics, setMetrics] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [timeRange, setTimeRange] = useState('24 hours')
  
  useEffect(() => {
    loadMetrics()
    const interval = setInterval(loadMetrics, 120000) // Refresh every 2 minutes
    
    return () => clearInterval(interval)
  }, [timeRange])
  
  const loadMetrics = async () => {
    try {
      const data = await QuotaMonitoring.getQuotaMetrics(timeRange)
      setMetrics(data)
    } catch (error) {
      console.error('Failed to load metrics:', error)
    } finally {
      setIsLoading(false)
    }
  }
  
  if (isLoading || !metrics) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-96">
          <Icon name="loader-2" className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    )
  }
  
  // Find max value for scaling
  const maxHourlyRequests = Math.max(...metrics.hourlyDistribution.map((h: any) => h.requests))
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Usage Overview</span>
          <div className="flex gap-2">
            {['1 hour', '24 hours', '7 days'].map(range => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`text-xs px-3 py-1 rounded ${
                  timeRange === range 
                    ? 'bg-blue-500 text-white' 
                    : 'bg-gray-100 hover:bg-gray-200'
                }`}
              >
                {range}
              </button>
            ))}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Key Metrics */}
          <div className="space-y-4">
            <div>
              <div className="text-3xl font-bold">{metrics.totalRequests.toLocaleString()}</div>
              <div className="text-sm text-gray-500">Total Requests</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-red-600">
                {metrics.totalDenials.toLocaleString()}
              </div>
              <div className="text-sm text-gray-500">Total Denials</div>
            </div>
            <div>
              <div className="text-3xl font-bold">
                {metrics.denialRate.toFixed(1)}%
              </div>
              <div className="text-sm text-gray-500">Denial Rate</div>
            </div>
          </div>
          
          {/* Hourly Distribution Chart */}
          <div className="lg:col-span-2">
            <h4 className="text-sm font-medium mb-4">Hourly Distribution</h4>
            <div className="relative h-48">
              <div className="absolute inset-0 flex items-end justify-between gap-1">
                {metrics.hourlyDistribution.map((hour: any, index: number) => {
                  const heightPercent = (hour.requests / maxHourlyRequests) * 100
                  const denialPercent = hour.requests > 0 
                    ? (hour.denials / hour.requests) * 100 
                    : 0
                  
                  return (
                    <div
                      key={index}
                      className="flex-1 flex flex-col items-center group relative"
                    >
                      <div className="relative w-full">
                        <div
                          className="w-full bg-blue-500 rounded-t transition-all group-hover:bg-blue-600"
                          style={{ height: `${heightPercent}%` }}
                        >
                          {denialPercent > 0 && (
                            <div
                              className="absolute top-0 w-full bg-red-500 rounded-t"
                              style={{ height: `${denialPercent}%` }}
                            />
                          )}
                        </div>
                      </div>
                      
                      {/* Tooltip */}
                      <div className="absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 
                                    bg-gray-800 text-white text-xs rounded px-2 py-1 
                                    pointer-events-none transition-opacity z-10 whitespace-nowrap">
                        {hour.hour}:00 - {hour.requests} requests
                        {hour.denials > 0 && ` (${hour.denials} denials)`}
                      </div>
                    </div>
                  )
                })}
              </div>
              
              {/* Y-axis labels */}
              <div className="absolute left-0 top-0 -ml-8 h-full flex flex-col justify-between text-xs text-gray-500">
                <span>{maxHourlyRequests}</span>
                <span>{Math.round(maxHourlyRequests / 2)}</span>
                <span>0</span>
              </div>
            </div>
            
            {/* X-axis labels */}
            <div className="flex justify-between text-xs text-gray-500 mt-2">
              <span>0h</span>
              <span>6h</span>
              <span>12h</span>
              <span>18h</span>
              <span>23h</span>
            </div>
          </div>
        </div>
        
        {/* Top Metrics & Denied Users */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          {/* Top Metrics */}
          <div>
            <h4 className="text-sm font-medium mb-3">Top Metrics</h4>
            <div className="space-y-2">
              {metrics.topMetrics.map((item: any) => (
                <div key={item.metric} className="flex items-center justify-between">
                  <span className="text-sm">{item.metric}</span>
                  <Badge variant="outline">{item.requestCount.toLocaleString()}</Badge>
                </div>
              ))}
            </div>
          </div>
          
          {/* Top Denied Users */}
          <div>
            <h4 className="text-sm font-medium mb-3">Top Denied Users</h4>
            <div className="space-y-2">
              {metrics.topDeniedUsers.slice(0, 5).map((user: any) => (
                <div key={user.userId} className="flex items-center justify-between">
                  <span className="text-sm">User {user.userId.slice(0, 8)}...</span>
                  <Badge variant="destructive">{user.denialCount} denials</Badge>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}