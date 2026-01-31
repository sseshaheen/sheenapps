/**
 * Active Matches Table Component
 *
 * Following CLAUDE.md patterns:
 * - Real-time match tracking with live updates
 * - Mobile-responsive data table design
 * - Status indicators with semantic colors
 * - Admin actions and monitoring capabilities
 */

'use client'

import { useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Icon } from '@/components/ui/icon'
import { toast } from '@/components/ui/toast'
import { useActiveMatches, useDashboardRefresh } from '@/hooks/use-admin-matching'
import type { MatchRequest, MatchStatus } from '@/types/advisor-matching'

interface ActiveMatchesTableProps {
  translations: {
    title: string
    searchPlaceholder: string
    filterByStatus: string
    allStatuses: string
    refresh: string
    noMatches: string
    project: string
    advisor: string
    client: string
    status: string
    created: string
    expires: string
    actions: string
    viewDetails: string
    columns: {
      matchId: string
      projectName: string
      clientName: string
      advisorName: string
      status: string
      createdAt: string
      expiresAt: string
    }
    statusLabels: Record<MatchStatus, string>
    timings: {
      justNow: string
      minutesAgo: string
      hoursAgo: string
      daysAgo: string
    }
  }
}

// Mock data structure - backend team needs to implement the actual endpoint
const MOCK_ACTIVE_MATCHES: MatchRequest[] = [
  {
    id: '1',
    project_id: 'proj-1',
    user_id: 'user-1',
    status: 'matched',
    suggested_advisor_id: 'advisor-1',
    client_decision: null,
    advisor_decision: null,
    match_criteria: {},
    expires_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
    correlation_id: 'corr-1'
  }
  // ... more mock matches
]

export function ActiveMatchesTable({ translations }: ActiveMatchesTableProps) {
  // toast is imported directly
  const { data: matches = MOCK_ACTIVE_MATCHES, isLoading, error, refetch } = useActiveMatches()
  const { refreshAllDashboardData } = useDashboardRefresh()

  // Filter and search state
  const [searchTerm, setSearchTerm] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const handleRefresh = useCallback(async () => {
    await refreshAllDashboardData()
    await refetch()

    toast.success('Data Refreshed', { description: 'Active matches have been updated' })
  }, [refreshAllDashboardData, refetch, toast])

  // Get status configuration
  const getStatusConfig = (status: MatchStatus) => {
    const configs = {
      'pending': { variant: 'secondary' as const, icon: 'clock' as const },
      'matched': { variant: 'default' as const, icon: 'users' as const },
      'client_approved': { variant: 'default' as const, icon: 'check' as const },
      'client_declined': { variant: 'destructive' as const, icon: 'x' as const },
      'advisor_accepted': { variant: 'default' as const, icon: 'user-check' as const },
      'advisor_declined': { variant: 'destructive' as const, icon: 'user-x' as const },
      'finalized': { variant: 'default' as const, icon: 'check-circle' as const },
      'expired': { variant: 'outline' as const, icon: 'clock' as const }
    }

    return configs[status] || { variant: 'outline' as const, icon: 'help-circle' as const }
  }

  // Format relative time
  const formatRelativeTime = (dateString: string): string => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMinutes = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMinutes / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMinutes < 1) return translations.timings.justNow
    if (diffMinutes < 60) return `${diffMinutes} ${translations.timings.minutesAgo}`
    if (diffHours < 24) return `${diffHours} ${translations.timings.hoursAgo}`
    return `${diffDays} ${translations.timings.daysAgo}`
  }

  // Filter matches
  const filteredMatches = matches.filter((match) => {
    const matchesSearch = searchTerm === '' ||
      match.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      match.project_id.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesStatus = statusFilter === 'all' || match.status === statusFilter

    return matchesSearch && matchesStatus
  })

  if (error) {
    return (
      <Card className="bg-card border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive flex items-center gap-2">
            <Icon name="alert-triangle" className="h-5 w-5" />
            Error Loading Active Matches
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">
            Failed to load active matches. This endpoint needs to be implemented by the backend team.
          </p>
          <Button onClick={handleRefresh} variant="outline" className="gap-2">
            <Icon name="refresh-cw" className="h-4 w-4" />
            {translations.refresh}
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-foreground flex items-center gap-2">
              <Icon name="activity" className="h-5 w-5" />
              {translations.title}
              {!isLoading && (
                <Badge variant="secondary" className="ml-2">
                  {filteredMatches.length}
                </Badge>
              )}
            </CardTitle>
            <Button onClick={handleRefresh} variant="outline" size="sm" className="gap-2">
              <Icon name="refresh-cw" className="h-4 w-4" />
              {translations.refresh}
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            {/* Search */}
            <div className="flex-1">
              <Input
                placeholder={translations.searchPlaceholder}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-sm"
              />
            </div>

            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={translations.filterByStatus} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{translations.allStatuses}</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="matched">Matched</SelectItem>
                <SelectItem value="client_approved">Client Approved</SelectItem>
                <SelectItem value="advisor_accepted">Advisor Accepted</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Matches Table */}
      <Card className="bg-card border-border">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Icon name="loader-2" className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredMatches.length === 0 ? (
            <div className="text-center py-12">
              <Icon name="mail" className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground">{translations.noMatches}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              {/* Desktop Table */}
              <table className="w-full hidden lg:table">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left p-4 font-medium text-muted-foreground">
                      {translations.columns.matchId}
                    </th>
                    <th className="text-left p-4 font-medium text-muted-foreground">
                      {translations.columns.projectName}
                    </th>
                    <th className="text-left p-4 font-medium text-muted-foreground">
                      {translations.columns.advisorName}
                    </th>
                    <th className="text-left p-4 font-medium text-muted-foreground">
                      {translations.columns.status}
                    </th>
                    <th className="text-left p-4 font-medium text-muted-foreground">
                      {translations.columns.createdAt}
                    </th>
                    <th className="text-left p-4 font-medium text-muted-foreground">
                      {translations.columns.expiresAt}
                    </th>
                    <th className="text-left p-4 font-medium text-muted-foreground">
                      {translations.actions}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMatches.map((match) => {
                    const statusConfig = getStatusConfig(match.status)
                    const isExpiringSoon = new Date(match.expires_at) < new Date(Date.now() + 24 * 60 * 60 * 1000)

                    return (
                      <tr key={match.id} className="border-b border-border hover:bg-muted/50">
                        <td className="p-4">
                          <code className="text-xs bg-muted px-2 py-1 rounded">
                            {match.id.slice(0, 8)}
                          </code>
                        </td>
                        <td className="p-4">
                          <div>
                            <p className="font-medium text-foreground">Project {match.project_id}</p>
                            <p className="text-xs text-muted-foreground">
                              User: {match.user_id}
                            </p>
                          </div>
                        </td>
                        <td className="p-4">
                          <p className="text-foreground">
                            {match.suggested_advisor_id ? `Advisor ${match.suggested_advisor_id}` : 'Not assigned'}
                          </p>
                        </td>
                        <td className="p-4">
                          <Badge variant={statusConfig.variant} className="gap-1">
                            <Icon name={statusConfig.icon} className="h-3 w-3" />
                            {translations.statusLabels[match.status] || match.status}
                          </Badge>
                        </td>
                        <td className="p-4 text-sm text-muted-foreground">
                          {formatRelativeTime(match.created_at)}
                        </td>
                        <td className="p-4">
                          <div className="text-sm">
                            <p className={isExpiringSoon ? 'text-yellow-600 dark:text-yellow-400' : 'text-muted-foreground'}>
                              {formatRelativeTime(match.expires_at)}
                            </p>
                            {isExpiringSoon && (
                              <p className="text-xs text-yellow-600 dark:text-yellow-400">
                                Expires soon
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="p-4">
                          <Button variant="ghost" size="sm" className="gap-1">
                            <Icon name="external-link" className="h-3 w-3" />
                            {translations.viewDetails}
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              {/* Mobile Cards */}
              <div className="lg:hidden space-y-4 p-4">
                {filteredMatches.map((match) => {
                  const statusConfig = getStatusConfig(match.status)
                  const isExpiringSoon = new Date(match.expires_at) < new Date(Date.now() + 24 * 60 * 60 * 1000)

                  return (
                    <Card key={match.id} className="bg-muted/50 border-border">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <code className="text-xs bg-muted px-2 py-1 rounded">
                              {match.id.slice(0, 8)}
                            </code>
                            <p className="text-sm font-medium text-foreground mt-1">
                              Project {match.project_id}
                            </p>
                          </div>
                          <Badge variant={statusConfig.variant} className="gap-1">
                            <Icon name={statusConfig.icon} className="h-3 w-3" />
                            {translations.statusLabels[match.status] || match.status}
                          </Badge>
                        </div>

                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Advisor:</span>
                            <span className="text-foreground">
                              {match.suggested_advisor_id ? `Advisor ${match.suggested_advisor_id}` : 'Not assigned'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Created:</span>
                            <span className="text-foreground">
                              {formatRelativeTime(match.created_at)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Expires:</span>
                            <span className={isExpiringSoon ? 'text-yellow-600 dark:text-yellow-400' : 'text-foreground'}>
                              {formatRelativeTime(match.expires_at)}
                              {isExpiringSoon && ' (soon)'}
                            </span>
                          </div>
                        </div>

                        <Button variant="ghost" size="sm" className="w-full mt-3 gap-1">
                          <Icon name="external-link" className="h-3 w-3" />
                          {translations.viewDetails}
                        </Button>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Backend Implementation Note */}
      <Card className="bg-card border-yellow-500/50">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Icon name="info" className="h-5 w-5 text-yellow-500 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-foreground">Backend Team Note</p>
              <p className="text-xs text-muted-foreground mt-1">
                The active matches endpoint needs to be implemented. Current data is mocked for development.
                Expected endpoint: <code>GET /api/advisor-matching/admin/active-matches</code>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}