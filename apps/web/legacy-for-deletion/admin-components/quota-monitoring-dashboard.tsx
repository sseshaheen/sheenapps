'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { RealtimeQuotaAlerts } from './realtime-quota-alerts'
import { QuotaUsageChart } from './quota-usage-chart'
import { UsersNearLimitCard } from './users-near-limit-card'
import { QuotaDenialsChart } from './quota-denials-chart'
import { UsageSpikeAlerts } from './usage-spike-alerts'
import { ConcurrentAttemptsMonitor } from './concurrent-attempts-monitor'
import { AlertRuleStatus } from './alert-rule-status'
import { Icon, type IconName } from '@/components/ui/icon'
import { startGlobalMonitoring, stopGlobalMonitoring } from '@/services/quota/realtime-monitor'
import { startAlertRules, stopAlertRules } from '@/services/quota/alert-rules'

export function QuotaMonitoringDashboard() {
  const [isMonitoringActive, setIsMonitoringActive] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  
  useEffect(() => {
    // Start monitoring services
    const initializeMonitoring = async () => {
      try {
        await startGlobalMonitoring()
        startAlertRules()
        setIsMonitoringActive(true)
      } catch (error) {
        console.error('Failed to start monitoring:', error)
      } finally {
        setIsLoading(false)
      }
    }
    
    initializeMonitoring()
    
    // Cleanup on unmount
    return () => {
      stopGlobalMonitoring()
      stopAlertRules()
    }
  }, [])
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Icon name="loader-2" className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p className="text-gray-500">Initializing quota monitoring...</p>
        </div>
      </div>
    )
  }
  
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Quota Monitoring</h1>
          <p className="text-gray-500 mt-1">
            Real-time monitoring of quota usage, denials, and anomalies
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${
            isMonitoringActive ? 'bg-green-500 animate-pulse' : 'bg-red-500'
          }`} />
          <span className="text-sm font-medium">
            {isMonitoringActive ? 'Monitoring Active' : 'Monitoring Inactive'}
          </span>
        </div>
      </div>
      
      {/* Alert Rules Status */}
      <AlertRuleStatus />
      
      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Real-time Alerts */}
        <div className="lg:col-span-2">
          <RealtimeQuotaAlerts />
        </div>
        
        {/* Users Near Limit */}
        <UsersNearLimitCard threshold={80} />
        
        {/* Quota Denials Chart */}
        <QuotaDenialsChart timeRange="24h" />
        
        {/* Usage Spikes */}
        <UsageSpikeAlerts />
        
        {/* Concurrent Attempts */}
        <ConcurrentAttemptsMonitor />
        
        {/* Usage Trends */}
        <div className="lg:col-span-2">
          <QuotaUsageChart />
        </div>
      </div>
      
      {/* System Health */}
      <Card>
        <CardHeader>
          <CardTitle>System Health</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <SystemHealthMetric
              label="API Response Time"
              value="45ms"
              status="healthy"
              icon="activity"
            />
            <SystemHealthMetric
              label="Quota Check Latency"
              value="12ms"
              status="healthy"
              icon="zap"
            />
            <SystemHealthMetric
              label="Database Connections"
              value="23/100"
              status="healthy"
              icon="database"
            />
            <SystemHealthMetric
              label="Error Rate"
              value="0.02%"
              status="healthy"
              icon="alert-circle"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function SystemHealthMetric({ 
  label, 
  value, 
  status, 
  icon 
}: { 
  label: string
  value: string
  status: 'healthy' | 'warning' | 'critical'
  icon: IconName
}) {
  const statusColors = {
    healthy: 'text-green-600',
    warning: 'text-yellow-600',
    critical: 'text-red-600'
  }
  
  return (
    <div className="flex items-center gap-3">
      <Icon name={icon} className={`h-5 w-5 ${statusColors[status]}`} />
      <div>
        <div className="text-sm text-gray-500">{label}</div>
        <div className="font-semibold">{value}</div>
      </div>
    </div>
  )
}