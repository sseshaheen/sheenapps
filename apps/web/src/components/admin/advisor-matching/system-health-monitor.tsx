/**
 * System Health Monitor Component
 *
 * Following CLAUDE.md patterns:
 * - Real-time health metrics with polling
 * - Semantic theme classes for status indicators
 * - Mobile-responsive dashboard layout
 * - Accessibility with ARIA live regions
 */

'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Icon } from '@/components/ui/icon'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useSystemHealth, useDashboardRefresh } from '@/hooks/use-admin-matching'

interface SystemHealthMonitorProps {
  enablePolling?: boolean
  translations: {
    title: string
    systemStatus: string
    uptime: string
    queueDepth: string
    avgResponseTime: string
    errorRate: string
    lastCheck: string
    refreshData: string
    criticalAlerts: string
    warningAlerts: string
    performance: string
    metrics: {
      healthy: string
      warning: string
      critical: string
    }
    alerts: {
      highQueueDepth: string
      slowResponseTime: string
      highErrorRate: string
      systemOverload: string
    }
  }
}

export function SystemHealthMonitor({
  enablePolling = true,
  translations
}: SystemHealthMonitorProps) {
  const { data: systemHealth, isLoading, error, refetch } = useSystemHealth(enablePolling)
  const { refreshAllDashboardData } = useDashboardRefresh()

  const handleRefresh = async () => {
    await refreshAllDashboardData()
    await refetch()
  }

  if (error) {
    return (
      <Card className="bg-card border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive flex items-center gap-2">
            <Icon name="alert-triangle" className="h-5 w-5" />
            System Health Monitor - Error
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <Icon name="alert-triangle" className="h-4 w-4" />
            <AlertDescription>
              Failed to load system health data. Please try refreshing or contact support if the issue persists.
            </AlertDescription>
          </Alert>
          <Button onClick={handleRefresh} variant="outline" className="mt-4 gap-2">
            <Icon name="refresh-cw" className="h-4 w-4" />
            {translations.refreshData}
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (isLoading) {
    return (
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <Icon name="activity" className="h-5 w-5" />
            {translations.title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Icon name="loader-2" className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!systemHealth) {
    return (
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <Icon name="activity" className="h-5 w-5" />
            {translations.title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            No system health data available
          </p>
        </CardContent>
      </Card>
    )
  }

  // Health status configuration
  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'healthy':
        return {
          variant: 'default' as const,
          icon: 'check-circle' as const,
          bgColor: 'bg-green-50 dark:bg-green-950',
          text: translations.metrics.healthy
        }
      case 'warning':
        return {
          variant: 'secondary' as const,
          icon: 'alert-triangle' as const,
          bgColor: 'bg-yellow-50 dark:bg-yellow-950',
          text: translations.metrics.warning
        }
      case 'critical':
        return {
          variant: 'destructive' as const,
          icon: 'alert-circle' as const,
          bgColor: 'bg-red-50 dark:bg-red-950',
          text: translations.metrics.critical
        }
      default:
        return {
          variant: 'outline' as const,
          icon: 'help-circle' as const,
          bgColor: 'bg-gray-50 dark:bg-gray-950',
          text: status
        }
    }
  }

  const statusConfig = getStatusConfig(systemHealth.status)

  // Calculate uptime display
  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)

    if (days > 0) return `${days}d ${hours}h ${minutes}m`
    if (hours > 0) return `${hours}h ${minutes}m`
    return `${minutes}m`
  }

  // Generate alerts based on metrics
  const generateAlerts = () => {
    const alerts = []

    if (systemHealth.queue_depth > 100) {
      alerts.push({
        type: 'critical' as const,
        message: translations.alerts.highQueueDepth,
        icon: 'alert-triangle' as const
      })
    }

    if (systemHealth.average_response_time > 5000) { // 5 seconds
      alerts.push({
        type: 'warning' as const,
        message: translations.alerts.slowResponseTime,
        icon: 'clock' as const
      })
    }

    if (systemHealth.error_rate > 5) { // 5% error rate
      alerts.push({
        type: 'critical' as const,
        message: translations.alerts.highErrorRate,
        icon: 'x-circle' as const
      })
    }

    return alerts
  }

  const alerts = generateAlerts()

  return (
    <div className="space-y-6">
      {/* Header with status and refresh */}
      <Card className={`border-border ${statusConfig.bgColor}`}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-foreground flex items-center gap-2">
              <Icon name="activity" className="h-5 w-5" />
              {translations.title}
            </CardTitle>
            <div className="flex items-center gap-3">
              <Badge variant={statusConfig.variant} className="gap-1">
                <Icon name={statusConfig.icon} className="h-3 w-3" />
                {statusConfig.text}
              </Badge>
              <Button onClick={handleRefresh} variant="outline" size="sm" className="gap-2">
                <Icon name="refresh-cw" className="h-4 w-4" />
                {translations.refreshData}
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Critical Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-3">
          {alerts.map((alert, index) => (
            <Alert key={index} variant={alert.type}>
              <Icon name={alert.icon} className="h-4 w-4" />
              <AlertDescription>{alert.message}</AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      {/* System Metrics Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-card border-border">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{translations.uptime}</p>
                <p className="text-2xl font-bold text-foreground">
                  {formatUptime(systemHealth.uptime)}
                </p>
              </div>
              <Icon name="clock" className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{translations.queueDepth}</p>
                <p className="text-2xl font-bold text-foreground">{systemHealth.queue_depth}</p>
                {systemHealth.queue_depth > 50 && (
                  <p className="text-xs text-yellow-600 dark:text-yellow-400">High queue depth</p>
                )}
              </div>
              <Icon name="layout-grid" className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{translations.avgResponseTime}</p>
                <p className="text-2xl font-bold text-foreground">
                  {Math.round(systemHealth.average_response_time)}ms
                </p>
                {systemHealth.average_response_time > 2000 && (
                  <p className="text-xs text-yellow-600 dark:text-yellow-400">Slow responses</p>
                )}
              </div>
              <Icon name="zap" className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{translations.errorRate}</p>
                <p className="text-2xl font-bold text-foreground">
                  {systemHealth.error_rate.toFixed(1)}%
                </p>
                {systemHealth.error_rate > 3 && (
                  <p className="text-xs text-red-600 dark:text-red-400">High error rate</p>
                )}
              </div>
              <Icon name="alert-triangle" className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Performance Overview */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground">{translations.performance}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Response Time Indicator */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Response Time Health</span>
              <span className="font-medium text-foreground">
                {systemHealth.average_response_time < 1000 ? 'Excellent' :
                 systemHealth.average_response_time < 3000 ? 'Good' : 'Poor'}
              </span>
            </div>
            <Progress
              value={Math.max(0, 100 - (systemHealth.average_response_time / 50))} // Scale to percentage
              className="h-2"
            />
          </div>

          {/* Error Rate Indicator */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">System Reliability</span>
              <span className="font-medium text-foreground">
                {100 - systemHealth.error_rate}%
              </span>
            </div>
            <Progress
              value={Math.max(0, 100 - systemHealth.error_rate)}
              className="h-2"
            />
          </div>

          {/* Queue Health */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Queue Health</span>
              <span className="font-medium text-foreground">
                {systemHealth.queue_depth < 20 ? 'Healthy' :
                 systemHealth.queue_depth < 100 ? 'Moderate' : 'Critical'}
              </span>
            </div>
            <Progress
              value={Math.max(0, 100 - (systemHealth.queue_depth / 2))} // Scale queue depth
              className="h-2"
            />
          </div>
        </CardContent>
      </Card>

      {/* System Information */}
      <Card className="bg-card border-border">
        <CardContent className="p-6">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground flex items-center gap-2">
              <Icon name="clock" className="h-4 w-4" />
              {translations.lastCheck}
            </span>
            <span className="font-medium text-foreground">
              {new Date(systemHealth.last_checked).toLocaleString()}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Live Update Indicator */}
      <div
        className="sr-only"
        aria-live="polite"
        aria-atomic="true"
        role="status"
      >
        System health status: {statusConfig.text}. Last updated: {new Date().toLocaleTimeString()}
      </div>
    </div>
  )
}