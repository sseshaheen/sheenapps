'use client'

/**
 * Build Logs Content Component
 * Main content area for the build logs admin page with filtering and pagination
 */

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
// Removed server-only admin client import
import { Search, Filter, Eye, RefreshCw, Loader2, AlertCircle, Copy, Check, FileText, AlignLeft } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { BuildsList, BuildListItem, BuildsFilterState, DurationRange } from '@/types/admin-build-logs'
import { DURATION_RANGES } from '@/types/admin-build-logs'

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface BuildLogsContentProps {
  // Props no longer needed since API routes handle authentication
}

export function BuildLogsContent({}: BuildLogsContentProps) {
  const router = useRouter()
  const [builds, setBuilds] = useState<BuildsList | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(0)
  const [filters, setFilters] = useState<BuildsFilterState>({
    status: '',
    userId: '',
    projectId: '',
    userEmail: '',
    durationRange: ''
  })
  const [showFilters, setShowFilters] = useState(false)
  const [showFullPrompts, setShowFullPrompts] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const BUILDS_PER_PAGE = 25

  // Fetch builds with current filters and pagination
  // Optional override parameter to avoid stale closure issues (e.g., clearFilters)
  const fetchBuilds = async (page: number = currentPage, overrideFilters?: BuildsFilterState) => {
    const activeFilters = overrideFilters ?? filters

    try {
      setError(null)
      setLoading(true)

      const params = new URLSearchParams({
        limit: BUILDS_PER_PAGE.toString(),
        offset: (page * BUILDS_PER_PAGE).toString(),
        _t: Date.now().toString() // Cache-busting timestamp
      })

      // Add active filters
      if (activeFilters.status) params.append('status', activeFilters.status)
      if (activeFilters.userId) params.append('userId', activeFilters.userId)
      if (activeFilters.projectId) params.append('projectId', activeFilters.projectId)

      // Add duration range filter
      if (activeFilters.durationRange) {
        const range = DURATION_RANGES[activeFilters.durationRange]
        if (range.min !== undefined) params.append('minDurationMs', range.min.toString())
        if (range.max !== undefined) params.append('maxDurationMs', range.max.toString())
      }

      const response = await fetch(`/api/admin/builds?${params.toString()}`, {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-cache'
        }
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Network error' }))
        throw new Error(errorData.error || `HTTP ${response.status}`)
      }

      const result = await response.json()
      setBuilds(result)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load builds'
      setError(errorMessage)
      console.error('Build list fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  // Handle filter changes
  const handleFilterChange = (key: keyof BuildsFilterState, value: string) => {
    // Convert "all" back to empty string for the filter state
    const filterValue = value === 'all' ? '' : value
    setFilters(prev => ({ ...prev, [key]: filterValue }))
  }

  // Apply filters (reset to first page)
  const applyFilters = () => {
    setCurrentPage(0)
    fetchBuilds(0)
  }

  // Clear all filters
  const clearFilters = () => {
    const emptyFilters: BuildsFilterState = {
      status: '',
      userId: '',
      projectId: '',
      userEmail: '',
      durationRange: ''
    }
    setFilters(emptyFilters)
    setCurrentPage(0)
    fetchBuilds(0, emptyFilters) // Pass empty filters to avoid stale closure
  }

  // Handle pagination
  const goToPage = (page: number) => {
    setCurrentPage(page)
    fetchBuilds(page)
  }

  // Format timestamp
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  // Format duration in human-readable format
  const formatDuration = (durationMs: number): string => {
    const seconds = durationMs / 1000

    if (seconds < 60) {
      // Under 1 minute: show seconds with 1 decimal
      return `${seconds.toFixed(1)}s`
    } else if (seconds < 3600) {
      // Under 1 hour: show minutes and seconds
      const minutes = Math.floor(seconds / 60)
      const remainingSeconds = Math.round(seconds % 60)
      return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`
    } else {
      // 1 hour or more: show hours and minutes
      const hours = Math.floor(seconds / 3600)
      const remainingMinutes = Math.round((seconds % 3600) / 60)
      return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`
    }
  }

  // Get status badge variant
  const getStatusBadgeVariant = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
        return 'default'
      case 'failed':
        return 'destructive'
      case 'building':
        return 'secondary'
      case 'cancelled':
        return 'outline'
      default:
        return 'outline'
    }
  }

  // View build logs
  const viewBuildLogs = (buildId: string) => {
    router.push(`/admin/build-logs/${buildId}`)
  }

  // Copy to clipboard with feedback
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(text)
      setTimeout(() => setCopiedId(null), 2000) // Clear after 2 seconds
    } catch (err) {
      console.error('Failed to copy text: ', err)
    }
  }

  // Calculate page info
  const totalPages = builds ? Math.ceil(builds.pagination.total / BUILDS_PER_PAGE) : 0
  const hasNextPage = currentPage < totalPages - 1
  const hasPrevPage = currentPage > 0

  // Load initial data
  useEffect(() => {
    fetchBuilds()
  }, [])

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold">Build Filters</CardTitle>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter className="h-4 w-4 mr-1" />
                {showFilters ? 'Hide' : 'Show'} Filters
              </Button>
              <Button
                variant={showFullPrompts ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowFullPrompts(!showFullPrompts)}
                title={showFullPrompts ? 'Truncate prompts' : 'Show full prompts'}
              >
                <AlignLeft className="h-4 w-4 mr-1" />
                {showFullPrompts ? 'Truncate' : 'Full'} Prompts
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchBuilds()}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-1" />
                )}
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>

        {showFilters && (
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <div>
                <Label htmlFor="status-filter">Status</Label>
                <Select value={filters.status || 'all'} onValueChange={(value) => handleFilterChange('status', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="building">Building</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="duration-filter">Duration</Label>
                <Select
                  value={filters.durationRange || 'all'}
                  onValueChange={(value) => handleFilterChange('durationRange', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All durations" />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(DURATION_RANGES) as [DurationRange, { label: string }][]).map(([key, { label }]) => (
                      <SelectItem key={key || 'all'} value={key || 'all'}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="user-id-filter">User ID</Label>
                <Input
                  id="user-id-filter"
                  placeholder="Filter by user ID..."
                  value={filters.userId}
                  onChange={(e) => handleFilterChange('userId', e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="project-id-filter">Project ID</Label>
                <Input
                  id="project-id-filter"
                  placeholder="Filter by project ID..."
                  value={filters.projectId}
                  onChange={(e) => handleFilterChange('projectId', e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="user-email-filter">User Email</Label>
                <Input
                  id="user-email-filter"
                  placeholder="Filter by email..."
                  value={filters.userEmail}
                  onChange={(e) => handleFilterChange('userEmail', e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 mt-4">
              <Button variant="outline" onClick={clearFilters}>
                Clear Filters
              </Button>
              <Button onClick={applyFilters}>
                <Search className="h-4 w-4 mr-1" />
                Apply Filters
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Results */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold">
              Recent Builds
              {builds && (
                <Badge variant="outline" className="ml-2">
                  {builds.pagination.total} total
                </Badge>
              )}
            </CardTitle>

            {builds && builds.pagination.total > BUILDS_PER_PAGE && (
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600">
                  Page {currentPage + 1} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={!hasPrevPage || loading}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={!hasNextPage || loading}
                >
                  Next
                </Button>
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {error ? (
            <div className="p-6 text-center">
              <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
              <div className="text-red-800 font-medium mb-2">Error loading builds</div>
              <div className="text-red-600 text-sm mb-4">{error}</div>
              <Button onClick={() => fetchBuilds()}>
                Retry
              </Button>
            </div>
          ) : loading && !builds ? (
            <div className="p-6 text-center">
              <Loader2 className="h-8 w-8 text-gray-500 mx-auto mb-2 animate-spin" />
              <div className="text-gray-600">Loading builds...</div>
            </div>
          ) : !builds || builds.builds.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              No builds found matching your criteria
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Build ID</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Status</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700">User</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Project</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700 min-w-[200px]">Prompt</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Created</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Duration</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-700">Logs</th>
                  </tr>
                </thead>
                <tbody>
                  {builds.builds.map((build) => (
                    <tr key={build.build_id} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-1">
                          <code className="text-sm bg-gray-100 px-1 rounded">
                            {build.build_id.slice(0, 8)}...
                          </code>
                          <Button
                            variant="ghost"
                            size="sm"
                            className={`h-6 w-6 p-0 ${copiedId === build.build_id ? 'bg-green-100 text-green-600' : 'hover:bg-gray-200'}`}
                            onClick={() => copyToClipboard(build.build_id)}
                            title={copiedId === build.build_id ? 'Copied!' : 'Copy full Build ID'}
                          >
                            {copiedId === build.build_id ? (
                              <Check className="h-3 w-3" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </Button>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant={getStatusBadgeVariant(build.status)}>
                          {build.status}
                        </Badge>
                        {build.error_message && (
                          <div className="text-xs text-red-600 mt-1 truncate max-w-xs" title={build.error_message}>
                            {build.error_message}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-sm">
                          {build.user_email ? (
                            <>
                              <div className="font-medium">{build.user_email.split('@')[0]}</div>
                              <div className="text-gray-500 text-xs">{build.user_email.split('@')[1]}</div>
                            </>
                          ) : (
                            <div className="flex items-center space-x-1">
                              <code className="text-xs">{build.user_id.slice(0, 8)}...</code>
                              <Button
                                variant="ghost"
                                size="sm"
                                className={`h-5 w-5 p-0 ${copiedId === build.user_id ? 'bg-green-100 text-green-600' : 'hover:bg-gray-200'}`}
                                onClick={() => copyToClipboard(build.user_id)}
                                title={copiedId === build.user_id ? 'Copied!' : 'Copy full User ID'}
                              >
                                {copiedId === build.user_id ? (
                                  <Check className="h-2.5 w-2.5" />
                                ) : (
                                  <Copy className="h-2.5 w-2.5" />
                                )}
                              </Button>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-1">
                          <code className="text-sm bg-gray-100 px-1 rounded">
                            {build.project_id.slice(0, 8)}...
                          </code>
                          <Button
                            variant="ghost"
                            size="sm"
                            className={`h-6 w-6 p-0 ${copiedId === build.project_id ? 'bg-green-100 text-green-600' : 'hover:bg-gray-200'}`}
                            onClick={() => copyToClipboard(build.project_id)}
                            title={copiedId === build.project_id ? 'Copied!' : 'Copy full Project ID'}
                          >
                            {copiedId === build.project_id ? (
                              <Check className="h-3 w-3" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </Button>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {build.user_prompt ? (
                          <div
                            className={`text-sm text-gray-700 ${showFullPrompts ? 'whitespace-pre-wrap' : 'max-w-[250px] truncate cursor-help'}`}
                            title={showFullPrompts ? undefined : build.user_prompt}
                          >
                            {build.user_prompt}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400 italic">No prompt</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600">
                        {formatDate(build.created_at)}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600">
                        {build.build_duration_ms ? formatDuration(build.build_duration_ms) : '—'}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-2">
                          {build.logExists ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => viewBuildLogs(build.build_id)}
                              title="View build logs"
                            >
                              <Eye className="h-4 w-4 mr-1" />
                              Build
                            </Button>
                          ) : (
                            <span className="text-xs text-gray-500">No logs</span>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => router.push(`/admin/unified-logs?buildId=${build.build_id}`)}
                            title="View in unified logs"
                          >
                            <FileText className="h-4 w-4 mr-1" />
                            Unified
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}