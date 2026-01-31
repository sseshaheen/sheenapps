/**
 * Pool Status Dashboard Component
 *
 * Following CLAUDE.md patterns:
 * - Semantic theme classes for dark mode compatibility
 * - Real-time updates with React Query
 * - Mobile-first responsive design
 * - Admin role-based authentication
 */

'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Icon } from '@/components/ui/icon'
import { usePoolStatus, useDashboardRefresh } from '@/hooks/use-admin-matching'

interface PoolStatusDashboardProps {
  translations: {
    title: string
    totalAdvisors: string
    activeAdvisors: string
    availableAdvisors: string
    atCapacity: string
    onBreak: string
    utilizationRate: string
    averageResponseTime: string
    refreshData: string
    lastUpdated: string
    advisorDistribution: string
    status: {
      healthy: string
      warning: string
      critical: string
    }
    metrics: {
      totalProjects: string
      avgProjectsPerAdvisor: string
      peakHours: string
      offPeakHours: string
    }
  }
}

export function PoolStatusDashboard({ translations }: PoolStatusDashboardProps) {
  const { data: poolStatus, isLoading, error, refetch } = usePoolStatus(true)
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
            Error Loading Pool Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">
            Failed to load advisor pool status. Please try refreshing.
          </p>
          <Button onClick={handleRefresh} variant="outline" className="gap-2">
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
            <Icon name="users" className="h-5 w-5" />
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

  if (!poolStatus) {
    return (
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <Icon name="users" className="h-5 w-5" />
            {translations.title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            No pool status data available
          </p>
        </CardContent>
      </Card>
    )
  }

  // Calculate metrics
  const utilizationRate = poolStatus.total_advisors > 0
    ? Math.round((poolStatus.active_advisors / poolStatus.total_advisors) * 100)
    : 0

  const availabilityRate = poolStatus.total_advisors > 0
    ? Math.round((poolStatus.available_advisors / poolStatus.total_advisors) * 100)
    : 0

  // Determine overall pool health
  const getPoolHealthStatus = () => {
    if (availabilityRate < 20) return { status: 'critical', color: 'destructive' as const }
    if (availabilityRate < 40) return { status: 'warning', color: 'secondary' as const }
    return { status: 'healthy', color: 'default' as const }
  }

  const healthStatus = getPoolHealthStatus()

  return (
    <div className="space-y-6">
      {/* Header with refresh button */}
      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-foreground flex items-center gap-2">
              <Icon name="users" className="h-5 w-5" />
              {translations.title}
            </CardTitle>
            <div className="flex items-center gap-3">
              <Badge variant={healthStatus.color} className="gap-1">
                <Icon name={healthStatus.status === 'critical' ? 'alert-triangle' :
                           healthStatus.status === 'warning' ? 'alert-circle' : 'check-circle'}
                      className="h-3 w-3" />
                {translations.status[healthStatus.status]}
              </Badge>
              <Button onClick={handleRefresh} variant="outline" size="sm" className="gap-2">
                <Icon name="refresh-cw" className="h-4 w-4" />
                {translations.refreshData}
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Key Metrics Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-card border-border">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{translations.totalAdvisors}</p>
                <p className="text-2xl font-bold text-foreground">{poolStatus.total_advisors}</p>
              </div>
              <Icon name="users" className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{translations.availableAdvisors}</p>
                <p className="text-2xl font-bold text-foreground">{poolStatus.available_advisors}</p>
                <p className="text-xs text-muted-foreground">{availabilityRate}% available</p>
              </div>
              <Icon name="user-check" className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{translations.activeAdvisors}</p>
                <p className="text-2xl font-bold text-foreground">{poolStatus.active_advisors}</p>
                <p className="text-xs text-muted-foreground">{utilizationRate}% utilized</p>
              </div>
              <Icon name="activity" className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{translations.averageResponseTime}</p>
                <p className="text-2xl font-bold text-foreground">
                  {poolStatus.average_response_time ? `${Math.round(poolStatus.average_response_time / 60)}m` : 'N/A'}
                </p>
              </div>
              <Icon name="clock" className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Utilization Overview */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground">{translations.utilizationRate}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Pool Availability</span>
              <span className="font-medium text-foreground">{availabilityRate}%</span>
            </div>
            <Progress value={availabilityRate} className="h-2" />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Active Utilization</span>
              <span className="font-medium text-foreground">{utilizationRate}%</span>
            </div>
            <Progress value={utilizationRate} className="h-2" />
          </div>
        </CardContent>
      </Card>

      {/* Advisor Distribution */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground">{translations.advisorDistribution}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-950">
              <div className="h-3 w-3 rounded-full bg-green-500"></div>
              <div>
                <p className="text-sm font-medium text-foreground">{translations.availableAdvisors}</p>
                <p className="text-lg font-bold text-foreground">{poolStatus.available_advisors}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-950">
              <div className="h-3 w-3 rounded-full bg-blue-500"></div>
              <div>
                <p className="text-sm font-medium text-foreground">{translations.activeAdvisors}</p>
                <p className="text-lg font-bold text-foreground">{poolStatus.active_advisors}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950">
              <div className="h-3 w-3 rounded-full bg-yellow-500"></div>
              <div>
                <p className="text-sm font-medium text-foreground">{translations.atCapacity}</p>
                <p className="text-lg font-bold text-foreground">
                  {poolStatus.advisors_at_capacity || 0}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-950">
              <div className="h-3 w-3 rounded-full bg-gray-500"></div>
              <div>
                <p className="text-sm font-medium text-foreground">{translations.onBreak}</p>
                <p className="text-lg font-bold text-foreground">
                  {poolStatus.advisors_on_break || 0}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Last Updated */}
      <div className="text-xs text-muted-foreground flex items-center gap-1">
        <Icon name="clock" className="h-3 w-3" />
        {translations.lastUpdated}: {new Date().toLocaleString()}
      </div>
    </div>
  )
}