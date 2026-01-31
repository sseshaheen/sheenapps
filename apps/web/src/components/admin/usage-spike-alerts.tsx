'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Icon } from '@/components/ui/icon'
import { Badge } from '@/components/ui/badge'

interface SpikeEvent {
  id: string
  user_id: string
  metric: string
  hour: string
  usage_count: number
  avg_hourly_usage: number
  spike_ratio: number
  severity: 'critical' | 'high' | 'medium'
  created_at: string
}

export function UsageSpikeAlerts() {
  const [spikes, setSpikes] = useState<SpikeEvent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  useEffect(() => {
    loadSpikes()
    const interval = setInterval(loadSpikes, 300000) // Refresh every 5 minutes
    
    return () => clearInterval(interval)
  }, [])
  
  const loadSpikes = async () => {
    try {
      setError(null)
      
      const response = await fetch('/api/admin/usage-spikes?limit=20&hours=24&min_ratio=2.0', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store'
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to fetch usage spikes')
      }
      
      const data = await response.json()
      setSpikes(data.spikes || [])
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load usage spikes'
      setError(errorMessage)
      console.error('Failed to load usage spikes:', err)
      // Set empty array on error to show "no spikes" state
      setSpikes([])
    } finally {
      setIsLoading(false)
    }
  }
  
  const getSpikeLevel = (spike: SpikeEvent) => {
    // Use severity from API if available, otherwise calculate from ratio
    const severity = spike.severity || (
      spike.spike_ratio >= 5 ? 'critical' :
      spike.spike_ratio >= 3 ? 'high' : 'medium'
    )
    
    switch (severity) {
      case 'critical':
        return { level: 'critical', color: 'text-red-600', bg: 'bg-red-50' }
      case 'high':
        return { level: 'high', color: 'text-orange-600', bg: 'bg-orange-50' }
      case 'medium':
      default:
        return { level: 'medium', color: 'text-yellow-600', bg: 'bg-yellow-50' }
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
  
  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-600">
            <Icon name="alert-triangle" className="h-5 w-5" />
            Error Loading Usage Spikes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">
            {error}
          </div>
          <button
            onClick={loadSpikes}
            className="mt-3 text-sm text-blue-600 hover:text-blue-700 underline"
          >
            Try again
          </button>
        </CardContent>
      </Card>
    )
  }
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Usage Spikes Detected</span>
          {spikes.length > 0 && (
            <Badge variant="outline" className="bg-yellow-50">
              {spikes.length} spikes
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {spikes.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">
            No unusual usage spikes detected
          </p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {spikes.map((spike, index) => {
              const level = getSpikeLevel(spike)
              return (
                <Alert key={spike.id || index} className={level.bg}>
                  <Icon name="trending-up" className={`h-4 w-4 ${level.color}`} />
                  <AlertDescription>
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-medium">
                          {spike.spike_ratio.toFixed(1)}x spike
                        </span>
                        <span className="text-sm text-gray-600 ml-2">
                          in {spike.metric}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500">
                        {new Date(spike.hour).toLocaleString()}
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      User: {spike.user_id.slice(0, 8)}... • 
                      {spike.usage_count} requests (avg: {Math.round(spike.avg_hourly_usage)})
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