'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { QuotaMonitoring, QuotaDenial } from '@/services/quota/monitoring-queries'
import { Icon } from '@/components/ui/icon'
import { Badge } from '@/components/ui/badge'

export function QuotaDenialsChart({ timeRange = '24h' }: { timeRange?: string }) {
  const [denials, setDenials] = useState<QuotaDenial[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [stats, setStats] = useState({
    total: 0,
    byMetric: {} as Record<string, number>,
    byReason: {} as Record<string, number>
  })
  
  useEffect(() => {
    loadDenials()
    const interval = setInterval(loadDenials, 30000) // Refresh every 30 seconds
    
    return () => clearInterval(interval)
  }, [timeRange])
  
  const loadDenials = async () => {
    try {
      const hours = timeRange === '1h' ? 1 : timeRange === '24h' ? 24 : 168
      const recentDenials = await QuotaMonitoring.getRecentDenials(hours)
      setDenials(recentDenials)
      
      // Calculate stats
      const byMetric: Record<string, number> = {}
      const byReason: Record<string, number> = {}
      
      recentDenials.forEach(denial => {
        byMetric[denial.metric] = (byMetric[denial.metric] || 0) + 1
        byReason[denial.reason] = (byReason[denial.reason] || 0) + 1
      })
      
      setStats({
        total: recentDenials.length,
        byMetric,
        byReason
      })
    } catch (error) {
      console.error('Failed to load denials:', error)
    } finally {
      setIsLoading(false)
    }
  }
  
  const getReasonLabel = (reason: string) => {
    switch (reason) {
      case 'quota_exceeded': return 'Quota Exceeded'
      case 'race_condition': return 'Race Condition'
      case 'invalid_request': return 'Invalid Request'
      default: return reason
    }
  }
  
  const getReasonColor = (reason: string) => {
    switch (reason) {
      case 'quota_exceeded': return 'bg-orange-500'
      case 'race_condition': return 'bg-red-500'
      default: return 'bg-gray-500'
    }
  }
  
  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-48">
          <Icon name="loader-2" className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    )
  }
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Recent Quota Denials</span>
          <Badge variant="destructive">{stats.total} denials</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {stats.total === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">
            No quota denials in the last {timeRange}
          </p>
        ) : (
          <div className="space-y-4">
            {/* By Metric */}
            <div>
              <h4 className="text-sm font-medium mb-2">By Metric</h4>
              <div className="space-y-2">
                {Object.entries(stats.byMetric)
                  .sort((a, b) => b[1] - a[1])
                  .map(([metric, count]) => (
                    <div key={metric} className="flex items-center justify-between">
                      <span className="text-sm">{metric}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-orange-500 h-2 rounded-full"
                            style={{ width: `${(count / stats.total) * 100}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium w-12 text-right">
                          {count}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
            
            {/* By Reason */}
            <div>
              <h4 className="text-sm font-medium mb-2">By Reason</h4>
              <div className="flex flex-wrap gap-2">
                {Object.entries(stats.byReason).map(([reason, count]) => (
                  <Badge
                    key={reason}
                    variant="outline"
                    className={`${getReasonColor(reason)} text-white border-0`}
                  >
                    {getReasonLabel(reason)} ({count})
                  </Badge>
                ))}
              </div>
            </div>
            
            {/* Recent Denials List */}
            <div>
              <h4 className="text-sm font-medium mb-2">Recent Events</h4>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {denials.slice(0, 5).map((denial, index) => (
                  <div key={index} className="text-xs flex items-center justify-between py-1">
                    <span className="text-gray-600">
                      {denial.userId.slice(0, 8)}... • {denial.metric}
                    </span>
                    <span className="text-gray-400">
                      {new Date(denial.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}