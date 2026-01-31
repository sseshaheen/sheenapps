'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { QuotaMonitoring } from '@/services/quota/monitoring-queries'
import { Icon, type IconName } from '@/components/ui/icon'

interface UserNearLimit {
  userId: string
  email: string
  metric: string
  usagePercent: number
  remaining: number
  planName: string
}

export function UsersNearLimitCard({ threshold = 80 }: { threshold?: number }) {
  const [users, setUsers] = useState<UserNearLimit[]>([])
  const [isLoading, setIsLoading] = useState(true)
  
  useEffect(() => {
    loadUsers()
    const interval = setInterval(loadUsers, 60000) // Refresh every minute
    
    return () => clearInterval(interval)
  }, [threshold])
  
  const loadUsers = async () => {
    try {
      const nearLimitUsers = await QuotaMonitoring.getUsersNearLimit(threshold)
      setUsers(nearLimitUsers as UserNearLimit[])
    } catch (error) {
      console.error('Failed to load users near limit:', error)
    } finally {
      setIsLoading(false)
    }
  }
  
  const getMetricIcon = (metric: string): IconName => {
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
          <span>Users Near Limit ({threshold}%+)</span>
          <Badge variant="outline">{users.length} users</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {users.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">
            No users are near their quota limits
          </p>
        ) : (
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {users.map((user, index) => (
              <div key={`${user.userId}-${user.metric}-${index}`} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon name={getMetricIcon(user.metric)} className="h-4 w-4 text-gray-500" />
                    <div>
                      <div className="text-sm font-medium">
                        {user.email || `User ${user.userId.slice(0, 8)}...`}
                      </div>
                      <div className="text-xs text-gray-500">
                        {getMetricLabel(user.metric)} • {user.planName} plan
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold">
                      {Math.round(user.usagePercent)}%
                    </div>
                    <div className="text-xs text-gray-500">
                      {user.remaining} left
                    </div>
                  </div>
                </div>
                <Progress 
                  value={user.usagePercent} 
                  className={`h-2 ${
                    user.usagePercent >= 95 ? 'bg-red-100' : 
                    user.usagePercent >= 80 ? 'bg-yellow-100' : 
                    'bg-gray-100'
                  }`}
                />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}