'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Icon } from '@/components/ui/icon'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase-client'

interface ConcurrentAttempt {
  id: string
  user_id: string | null
  attempted_at: string
  current_count: number | null
  created_at: string | null
}

export function ConcurrentAttemptsMonitor() {
  const [attempts, setAttempts] = useState<ConcurrentAttempt[]>([])
  const [isLoading, setIsLoading] = useState(true)
  
  useEffect(() => {
    loadConcurrentAttempts()
    const interval = setInterval(loadConcurrentAttempts, 60000) // Refresh every minute
    
    return () => clearInterval(interval)
  }, [])
  
  const loadConcurrentAttempts = async () => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('quota_concurrent_attempts')
        .select('*')
        .order('current_count', { ascending: false })
        .limit(10)
      
      if (error) throw error
      
      if (data) {
        setAttempts(data)
      }
    } catch (error) {
      console.error('Failed to load concurrent attempts:', error)
    } finally {
      setIsLoading(false)
    }
  }
  
  const getTimeDiff = (first: string, last: string) => {
    const diff = new Date(last).getTime() - new Date(first).getTime()
    if (diff < 1000) return `${diff}ms`
    return `${(diff / 1000).toFixed(1)}s`
  }
  
  const getSeverity = (count: number) => {
    if (count >= 10) return { color: 'text-red-600', bg: 'bg-red-50', label: 'Critical' }
    if (count >= 5) return { color: 'text-orange-600', bg: 'bg-orange-50', label: 'High' }
    return { color: 'text-yellow-600', bg: 'bg-yellow-50', label: 'Medium' }
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
          <span>Concurrent Attempts</span>
          {attempts.length > 0 && (
            <Badge variant="outline" className="bg-orange-50">
              {attempts.length} detected
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {attempts.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">
            No concurrent attempts detected
          </p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {attempts.map((attempt, index) => {
              const severity = getSeverity(attempt.current_count || 0)
              return (
                <Alert key={index} className={severity.bg}>
                  <Icon name="refresh-cw" className={`h-4 w-4 ${severity.color}`} />
                  <AlertDescription>
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-medium">
                          {attempt.current_count || 0} concurrent requests
                        </span>
                        <Badge variant="outline" className="ml-2 text-xs">
                          {severity.label}
                        </Badge>
                      </div>
                      <span className="text-xs text-gray-500">
                        {new Date(attempt.attempted_at).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      User: {attempt.user_id?.slice(0, 8) || 'Unknown'}...
                    </div>
                  </AlertDescription>
                </Alert>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}