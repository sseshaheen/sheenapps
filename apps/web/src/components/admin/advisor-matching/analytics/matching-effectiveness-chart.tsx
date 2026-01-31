/**
 * Matching Effectiveness Chart Component
 *
 * Following CLAUDE.md patterns:
 * - Advanced analytics with trend visualization
 * - Responsive chart design with mobile optimization
 * - Semantic theme classes for dark mode compatibility
 * - Performance metrics with period selection
 */

'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Icon } from '@/components/ui/icon'
import { useMatchingAnalytics } from '@/hooks/use-admin-matching'

interface MatchingEffectivenessChartProps {
  translations: {
    title: string
    successRate: string
    approvalRate: string
    responseTime: string
    totalMatches: string
    trendingUp: string
    trendingDown: string
    stable: string
    selectPeriod: string
    periods: {
      week: string
      month: string
      quarter: string
      year: string
    }
    metrics: {
      successRate: string
      clientApprovalRate: string
      advisorAcceptanceRate: string
      averageResponseTime: string
      totalMatchesProcessed: string
      capacityUtilization: string
    }
    insights: {
      excellent: string
      good: string
      needsImprovement: string
      poor: string
    }
  }
}

export function MatchingEffectivenessChart({ translations }: MatchingEffectivenessChartProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<string>('week')
  const { data: analytics, isLoading, error, refetch } = useMatchingAnalytics(selectedPeriod)

  const getMetricTrend = (value: number, benchmark: number) => {
    const difference = value - benchmark
    const percentChange = Math.abs((difference / benchmark) * 100)

    if (Math.abs(difference) < benchmark * 0.02) { // Within 2%
      return { trend: 'stable', icon: 'minus' as const, color: 'text-muted-foreground' }
    }

    if (difference > 0) {
      return { trend: 'up', icon: 'trending-up' as const, color: 'text-green-600 dark:text-green-400' }
    } else {
      return { trend: 'down', icon: 'trending-down' as const, color: 'text-red-600 dark:text-red-400' }
    }
  }

  const getPerformanceLevel = (value: number, thresholds: { excellent: number, good: number, poor: number }) => {
    if (value >= thresholds.excellent) return { level: 'excellent', color: 'bg-green-500' }
    if (value >= thresholds.good) return { level: 'good', color: 'bg-blue-500' }
    if (value >= thresholds.poor) return { level: 'needsImprovement', color: 'bg-yellow-500' }
    return { level: 'poor', color: 'bg-red-500' }
  }

  if (error) {
    return (
      <Card className="bg-card border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive flex items-center gap-2">
            <Icon name="alert-triangle" className="h-5 w-5" />
            Analytics Error
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">
            Failed to load matching effectiveness data.
          </p>
          <Button onClick={() => refetch()} variant="outline" className="gap-2">
            <Icon name="refresh-cw" className="h-4 w-4" />
            Retry
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
            <Icon name="bar-chart" className="h-5 w-5" />
            {translations.title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-12">
            <Icon name="loader-2" className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!analytics) {
    return (
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <Icon name="bar-chart" className="h-5 w-5" />
            {translations.title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            No analytics data available for the selected period.
          </p>
        </CardContent>
      </Card>
    )
  }

  // Define performance benchmarks
  const benchmarks = {
    successRate: 75, // 75% success rate benchmark
    clientApprovalRate: 80, // 80% client approval benchmark
    advisorAcceptanceRate: 85, // 85% advisor acceptance benchmark
    responseTime: 3600 // 1 hour response time benchmark (seconds)
  }

  // Calculate trends
  const successTrend = getMetricTrend(analytics.success_rate, benchmarks.successRate)
  const clientTrend = getMetricTrend(analytics.client_approval_rate, benchmarks.clientApprovalRate)
  const advisorTrend = getMetricTrend(analytics.advisor_acceptance_rate, benchmarks.advisorAcceptanceRate)
  const responseTrend = getMetricTrend(analytics.average_response_time, benchmarks.responseTime)

  // Get performance levels
  const successLevel = getPerformanceLevel(analytics.success_rate, { excellent: 90, good: 75, poor: 50 })
  const clientLevel = getPerformanceLevel(analytics.client_approval_rate, { excellent: 85, good: 70, poor: 50 })
  const advisorLevel = getPerformanceLevel(analytics.advisor_acceptance_rate, { excellent: 90, good: 75, poor: 60 })

  return (
    <div className="space-y-6">
      {/* Header with period selection */}
      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-foreground flex items-center gap-2">
              <Icon name="bar-chart" className="h-5 w-5" />
              {translations.title}
            </CardTitle>
            <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder={translations.selectPeriod} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="week">{translations.periods.week}</SelectItem>
                <SelectItem value="month">{translations.periods.month}</SelectItem>
                <SelectItem value="quarter">{translations.periods.quarter}</SelectItem>
                <SelectItem value="year">{translations.periods.year}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
      </Card>

      {/* Key Metrics Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Success Rate */}
        <Card className="bg-card border-border">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium text-muted-foreground">
                  {translations.metrics.successRate}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-2xl font-bold text-foreground">
                    {analytics.success_rate.toFixed(1)}%
                  </p>
                  <Icon
                    name={successTrend.icon}
                    className={`h-4 w-4 ${successTrend.color}`}
                  />
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <div className={`h-2 w-2 rounded-full ${successLevel.color}`}></div>
                  <span className="text-xs text-muted-foreground">
                    {translations.insights[successLevel.level]}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Client Approval Rate */}
        <Card className="bg-card border-border">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium text-muted-foreground">
                  {translations.metrics.clientApprovalRate}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-2xl font-bold text-foreground">
                    {analytics.client_approval_rate.toFixed(1)}%
                  </p>
                  <Icon
                    name={clientTrend.icon}
                    className={`h-4 w-4 ${clientTrend.color}`}
                  />
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <div className={`h-2 w-2 rounded-full ${clientLevel.color}`}></div>
                  <span className="text-xs text-muted-foreground">
                    {translations.insights[clientLevel.level]}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Advisor Acceptance Rate */}
        <Card className="bg-card border-border">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium text-muted-foreground">
                  {translations.metrics.advisorAcceptanceRate}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-2xl font-bold text-foreground">
                    {analytics.advisor_acceptance_rate.toFixed(1)}%
                  </p>
                  <Icon
                    name={advisorTrend.icon}
                    className={`h-4 w-4 ${advisorTrend.color}`}
                  />
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <div className={`h-2 w-2 rounded-full ${advisorLevel.color}`}></div>
                  <span className="text-xs text-muted-foreground">
                    {translations.insights[advisorLevel.level]}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Average Response Time */}
        <Card className="bg-card border-border">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-sm font-medium text-muted-foreground">
                  {translations.metrics.averageResponseTime}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-2xl font-bold text-foreground">
                    {Math.round(analytics.average_response_time / 60)}m
                  </p>
                  <Icon
                    name={responseTrend.icon}
                    className={`h-4 w-4 ${responseTrend.color}`}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Target: {Math.round(benchmarks.responseTime / 60)}m or less
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Additional Metrics */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {translations.metrics.totalMatchesProcessed}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <p className="text-3xl font-bold text-foreground">
                {analytics.total_matches.toLocaleString()}
              </p>
              <Badge variant="secondary">
                {analytics.successful_matches.toLocaleString()} successful
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {translations.metrics.capacityUtilization}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <p className="text-3xl font-bold text-foreground">
                {analytics.capacity_utilization.toFixed(0)}%
              </p>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">of advisor pool</p>
                <Badge variant={analytics.capacity_utilization > 80 ? 'destructive' :
                               analytics.capacity_utilization > 60 ? 'secondary' : 'default'}>
                  {analytics.capacity_utilization > 80 ? 'High' :
                   analytics.capacity_utilization > 60 ? 'Moderate' : 'Low'}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Trending Skills */}
      {analytics.trending_skills && analytics.trending_skills.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground">Trending Skills</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {analytics.trending_skills.map((skill, index) => (
                <Badge key={index} variant="outline">
                  {skill}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Peak Demand Hours */}
      {analytics.peak_demand_hours && analytics.peak_demand_hours.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground">Peak Demand Hours</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {analytics.peak_demand_hours.map((hour, index) => (
                <Badge key={index} variant="secondary">
                  {hour}:00
                </Badge>
              ))}
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Hours with highest matching activity (24-hour format)
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}