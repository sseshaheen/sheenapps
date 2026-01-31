'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Icon } from '@/components/ui/icon'
import { Badge } from '@/components/ui/badge'
import { QuotaRealtimeMonitor } from '@/services/quota/realtime-monitor'
import { cn } from '@/lib/utils'

interface QuotaAlert {
  id: string
  timestamp: Date
  type: 'quota' | 'audit'
  severity: 'low' | 'medium' | 'high' | 'critical'
  data: any
}

export function RealtimeQuotaAlerts() {
  const [recentAlerts, setRecentAlerts] = useState<QuotaAlert[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [denialStats, setDenialStats] = useState<Map<string, number>>(new Map())
  const [monitor, setMonitor] = useState<QuotaRealtimeMonitor | null>(null)
  
  useEffect(() => {
    // Initialize real-time monitor
    const quotaMonitor = new QuotaRealtimeMonitor()
    setMonitor(quotaMonitor)
    
    // Set up event listeners
    quotaMonitor.on('connection-status', ({ connected }) => {
      setIsConnected(connected)
    })
    
    quotaMonitor.on('quota-event', (event) => {
      const alert: QuotaAlert = {
        id: event.id || Date.now().toString(),
        timestamp: new Date(event.created_at),
        type: 'quota',
        severity: event.success ? 'low' : 'high',
        data: event
      }
      addAlert(alert)
    })
    
    quotaMonitor.on('audit-event', (event) => {
      const severityMap = {
        'SPIKE_DETECTED': 'medium',
        'BYPASS_ATTEMPT': 'critical',
        'CONCURRENT_ATTEMPT': 'high',
        'RACE_CONDITION': 'critical'
      } as const
      
      const alert: QuotaAlert = {
        id: event.id || Date.now().toString(),
        timestamp: new Date(event.created_at),
        type: 'audit',
        severity: severityMap[event.event_type as keyof typeof severityMap] || 'low',
        data: event
      }
      addAlert(alert)
    })
    
    quotaMonitor.on('denial-rate', (stats) => {
      setDenialStats(prev => {
        const updated = new Map(prev)
        updated.set(stats.userId, stats.denialCount)
        return updated
      })
    })
    
    quotaMonitor.on('abuse-detected', (alert) => {
      // Could show special notification for abuse
      console.warn('Abuse detected:', alert)
    })
    
    // Start monitoring
    quotaMonitor.startMonitoring()
    
    return () => {
      quotaMonitor.stopMonitoring()
    }
  }, [])
  
  const addAlert = (alert: QuotaAlert) => {
    setRecentAlerts(prev => {
      const updated = [alert, ...prev]
      // Keep only last 50 alerts
      return updated.slice(0, 50)
    })
  }
  
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-500'
      case 'high': return 'bg-orange-500'
      case 'medium': return 'bg-yellow-500'
      case 'low': return 'bg-green-500'
      default: return 'bg-gray-500'
    }
  }
  
  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return 'alert-octagon'
      case 'high': return 'alert-triangle'
      case 'medium': return 'alert-circle'
      case 'low': return 'check-circle'
      default: return 'info'
    }
  }
  
  const formatEventType = (event: any) => {
    if (event.event_type) {
      return event.event_type.replace(/_/g, ' ')
    }
    if (event.success !== undefined) {
      return event.success ? 'Quota Consumed' : 'Quota Denied'
    }
    return 'Unknown Event'
  }
  
  const getEventDetails = (event: any) => {
    if (event.metric) {
      return `${event.metric} - ${event.attempted_amount || 1} units`
    }
    if (event.metadata?.metric) {
      return event.metadata.metric
    }
    return ''
  }
  
  // Calculate stats
  const totalAlerts = recentAlerts.length
  const criticalAlerts = recentAlerts.filter(a => a.severity === 'critical').length
  const denialCount = Array.from(denialStats.values()).reduce((sum, count) => sum + count, 0)
  
  return (
    <Card className="w-full">
      <CardHeader className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Realtime Quota Activity</h3>
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-2 h-2 rounded-full animate-pulse",
              isConnected ? 'bg-green-500' : 'bg-red-500'
            )} />
            <span className="text-sm text-gray-500">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>
        
        {/* Stats Bar */}
        <div className="grid grid-cols-3 gap-4 pt-2">
          <div className="text-center">
            <div className="text-2xl font-bold">{totalAlerts}</div>
            <div className="text-xs text-gray-500">Total Events</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">{criticalAlerts}</div>
            <div className="text-xs text-gray-500">Critical Alerts</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">{denialCount}</div>
            <div className="text-xs text-gray-500">Active Denials</div>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {recentAlerts.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">
              No quota events yet. Monitoring...
            </p>
          ) : (
            recentAlerts.map(alert => (
              <Alert 
                key={alert.id}
                variant={alert.severity === 'critical' || alert.severity === 'high' ? 'destructive' : 'default'}
                className="py-2"
              >
                <Icon 
                  name={getSeverityIcon(alert.severity)} 
                  className={cn("h-4 w-4", {
                    'text-red-600': alert.severity === 'critical',
                    'text-orange-600': alert.severity === 'high',
                    'text-yellow-600': alert.severity === 'medium',
                    'text-green-600': alert.severity === 'low'
                  })}
                />
                <AlertDescription>
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">
                          {formatEventType(alert.data)}
                        </span>
                        <Badge 
                          variant="outline"
                          className={cn("text-xs", getSeverityColor(alert.severity), "text-white")}
                        >
                          {alert.severity}
                        </Badge>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        User: {alert.data.user_id?.slice(0, 8)}...
                        {getEventDetails(alert.data) && (
                          <span className="ml-2">• {getEventDetails(alert.data)}</span>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-gray-400">
                      {alert.timestamp.toLocaleTimeString()}
                    </span>
                  </div>
                  
                  {/* Show additional details for critical events */}
                  {alert.severity === 'critical' && alert.data.context && (
                    <div className="mt-2 p-2 bg-gray-50 rounded text-xs">
                      <pre className="whitespace-pre-wrap">
                        {JSON.stringify(alert.data.context, null, 2)}
                      </pre>
                    </div>
                  )}
                </AlertDescription>
              </Alert>
            ))
          )}
        </div>
        
        {/* Active Denial Users */}
        {denialStats.size > 0 && (
          <div className="mt-4 pt-4 border-t">
            <h4 className="text-sm font-medium mb-2">Users with Recent Denials</h4>
            <div className="flex flex-wrap gap-2">
              {Array.from(denialStats.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([userId, count]) => (
                  <Badge key={userId} variant="outline" className="text-xs">
                    {userId.slice(0, 8)}... ({count} denials)
                  </Badge>
                ))}
              {denialStats.size > 5 && (
                <Badge variant="outline" className="text-xs">
                  +{denialStats.size - 5} more
                </Badge>
              )}
            </div>
          </div>
        )}
        
        {/* Control Buttons */}
        {monitor && (
          <div className="mt-4 pt-4 border-t flex gap-2">
            <button
              onClick={() => monitor.updateThresholds({ denialThreshold: 3 })}
              className="text-xs px-3 py-1 bg-gray-100 rounded hover:bg-gray-200"
            >
              Sensitive Mode
            </button>
            <button
              onClick={() => monitor.updateThresholds({ denialThreshold: 10 })}
              className="text-xs px-3 py-1 bg-gray-100 rounded hover:bg-gray-200"
            >
              Normal Mode
            </button>
            <button
              onClick={() => setRecentAlerts([])}
              className="text-xs px-3 py-1 bg-gray-100 rounded hover:bg-gray-200 ml-auto"
            >
              Clear
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}