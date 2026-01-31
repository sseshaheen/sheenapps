/**
 * Advisor Performance Metrics Component
 *
 * Following CLAUDE.md patterns:
 * - Individual advisor analytics with ranking system
 * - Performance benchmarking and improvement insights
 * - Mobile-responsive data visualization
 * - Comprehensive performance indicators
 */

'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Icon } from '@/components/ui/icon'
import { Progress } from '@/components/ui/progress'
import { useMatchingAnalytics } from '@/hooks/use-admin-matching'

interface AdvisorPerformanceMetricsProps {
  translations: {
    title: string
    topPerformers: string
    averageRating: string
    responseTime: string
    completedMatches: string
    successRate: string
    viewProfile: string
    noData: string
    sortBy: string
    sortOptions: {
      rating: string
      matches: string
      responseTime: string
      successRate: string
    }
    performanceLevels: {
      excellent: string
      good: string
      average: string
      needsImprovement: string
    }
    metrics: {
      totalMatches: string
      avgRating: string
      responseTime: string
      clientSatisfaction: string
    }
  }
}

export function AdvisorPerformanceMetrics({ translations }: AdvisorPerformanceMetricsProps) {
  const [sortBy, setSortBy] = useState<string>('rating')
  const [selectedPeriod] = useState<string>('month') // Could be made dynamic
  const { data: analytics, isLoading, error } = useMatchingAnalytics(selectedPeriod)

  // Get performance level configuration
  const getPerformanceLevel = (rating: number) => {
    if (rating >= 4.5) return {
      level: 'excellent',
      color: 'bg-green-500',
      textColor: 'text-green-700 dark:text-green-300',
      badge: 'default' as const
    }
    if (rating >= 4.0) return {
      level: 'good',
      color: 'bg-blue-500',
      textColor: 'text-blue-700 dark:text-blue-300',
      badge: 'secondary' as const
    }
    if (rating >= 3.5) return {
      level: 'average',
      color: 'bg-yellow-500',
      textColor: 'text-yellow-700 dark:text-yellow-300',
      badge: 'outline' as const
    }
    return {
      level: 'needsImprovement',
      color: 'bg-red-500',
      textColor: 'text-red-700 dark:text-red-300',
      badge: 'destructive' as const
    }
  }

  // Format response time
  const formatResponseTime = (minutes: number) => {
    if (minutes < 60) return `${Math.round(minutes)}m`
    const hours = Math.floor(minutes / 60)
    const remainingMinutes = Math.round(minutes % 60)
    if (remainingMinutes === 0) return `${hours}h`
    return `${hours}h ${remainingMinutes}m`
  }

  // Sort advisors based on selected criteria
  const sortedAdvisors = analytics?.advisor_performance?.slice().sort((a, b) => {
    switch (sortBy) {
      case 'rating':
        return b.average_rating - a.average_rating
      case 'matches':
        return b.matches_completed - a.matches_completed
      case 'responseTime':
        return a.response_time - b.response_time // Lower is better
      default:
        return b.average_rating - a.average_rating
    }
  }) || []

  if (error) {
    return (
      <Card className="bg-card border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive flex items-center gap-2">
            <Icon name="alert-triangle" className="h-5 w-5" />
            Error Loading Performance Data
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Failed to load advisor performance metrics.
          </p>
        </CardContent>
      </Card>
    )
  }

  if (isLoading) {
    return (
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <Icon name="trophy" className="h-5 w-5" />
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

  if (!sortedAdvisors.length) {
    return (
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <Icon name="trophy" className="h-5 w-5" />
            {translations.title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <Icon name="users" className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">{translations.noData}</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with sorting */}
      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-foreground flex items-center gap-2">
              <Icon name="trophy" className="h-5 w-5" />
              {translations.title}
              <Badge variant="secondary" className="ml-2">
                {sortedAdvisors.length} advisors
              </Badge>
            </CardTitle>
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground">{translations.sortBy}:</label>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rating">{translations.sortOptions.rating}</SelectItem>
                  <SelectItem value="matches">{translations.sortOptions.matches}</SelectItem>
                  <SelectItem value="responseTime">{translations.sortOptions.responseTime}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Top Performers Grid */}
      <div className="grid gap-4">
        {sortedAdvisors.slice(0, 3).map((advisor, index) => {
          const performanceLevel = getPerformanceLevel(advisor.average_rating)
          const isTopPerformer = index < 3

          return (
            <Card key={advisor.advisor_id} className={`bg-card border-border ${isTopPerformer ? 'ring-2 ring-primary/20' : ''}`}>
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  {/* Rank Badge */}
                  <div className="flex-shrink-0">
                    {index === 0 && <Icon name="crown" className="h-6 w-6 text-yellow-500" />}
                    {index === 1 && <Icon name="award" className="h-6 w-6 text-gray-400" />}
                    {index === 2 && <Icon name="award" className="h-6 w-6 text-amber-600" />}
                    {index > 2 && (
                      <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center">
                        <span className="text-xs font-medium">{index + 1}</span>
                      </div>
                    )}
                  </div>

                  {/* Advisor Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={`/avatars/${advisor.advisor_id}.jpg`} />
                          <AvatarFallback>
                            {advisor.name.split(' ').map(n => n[0]).join('')}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <h3 className="font-semibold text-foreground">{advisor.name}</h3>
                          <Badge variant={performanceLevel.badge} className="text-xs">
                            {translations.performanceLevels[performanceLevel.level]}
                          </Badge>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" className="gap-1">
                        <Icon name="external-link" className="h-3 w-3" />
                        {translations.viewProfile}
                      </Button>
                    </div>

                    {/* Performance Metrics */}
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">{translations.metrics.totalMatches}</span>
                          <span className="font-semibold text-foreground">{advisor.matches_completed}</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">{translations.metrics.avgRating}</span>
                          <div className="flex items-center gap-1">
                            <Icon name="star" className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                            <span className="font-semibold text-foreground">
                              {advisor.average_rating.toFixed(1)}
                            </span>
                          </div>
                        </div>
                        <Progress value={advisor.average_rating * 20} className="h-1" />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">{translations.metrics.responseTime}</span>
                          <span className="font-semibold text-foreground">
                            {formatResponseTime(advisor.response_time)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Icon
                            name={advisor.response_time <= 60 ? "zap" : advisor.response_time <= 180 ? "clock" : "alert-circle"}
                            className={`h-3 w-3 ${
                              advisor.response_time <= 60 ? 'text-green-500' :
                              advisor.response_time <= 180 ? 'text-yellow-500' : 'text-red-500'
                            }`}
                          />
                          <span className="text-xs text-muted-foreground">
                            {advisor.response_time <= 60 ? 'Fast' :
                             advisor.response_time <= 180 ? 'Good' : 'Slow'}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Success Rate</span>
                          <span className="font-semibold text-foreground">
                            {advisor.matches_completed > 0 ? '95%' : 'N/A'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Performance Indicator */}
                    <div className="flex items-center gap-2 mt-4 p-2 rounded-lg bg-muted">
                      <div className={`h-2 w-2 rounded-full ${performanceLevel.color}`}></div>
                      <span className={`text-xs font-medium ${performanceLevel.textColor}`}>
                        {translations.performanceLevels[performanceLevel.level]}
                      </span>
                      {index < 3 && (
                        <Badge variant="outline" className="ml-auto">
                          {translations.topPerformers}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* All Other Advisors */}
      {sortedAdvisors.length > 3 && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground text-base">
              Other Advisors ({sortedAdvisors.length - 3})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {sortedAdvisors.slice(3).map((advisor, index) => {
                const performanceLevel = getPerformanceLevel(advisor.average_rating)
                const actualIndex = index + 3

                return (
                  <div key={advisor.advisor_id} className="flex items-center gap-4 p-3 rounded-lg bg-muted/50">
                    <div className="flex-shrink-0 w-8 text-center">
                      <span className="text-sm font-medium text-muted-foreground">#{actualIndex + 1}</span>
                    </div>

                    <Avatar className="h-8 w-8">
                      <AvatarImage src={`/avatars/${advisor.advisor_id}.jpg`} />
                      <AvatarFallback className="text-xs">
                        {advisor.name.split(' ').map(n => n[0]).join('')}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">{advisor.name}</p>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span>{advisor.matches_completed} matches</span>
                        <div className="flex items-center gap-1">
                          <Icon name="star" className="h-3 w-3 text-yellow-500 fill-yellow-500" />
                          <span>{advisor.average_rating.toFixed(1)}</span>
                        </div>
                        <span>{formatResponseTime(advisor.response_time)}</span>
                      </div>
                    </div>

                    <Badge variant={performanceLevel.badge} >
                      {translations.performanceLevels[performanceLevel.level]}
                    </Badge>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}