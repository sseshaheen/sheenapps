/**
 * In-House Activity Dashboard Component
 * Global view of activity across all In-House Mode projects
 */

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Activity,
  AlertTriangle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { useRouter } from 'next/navigation'

// Types
interface ActivityLogEntry {
  id: string
  project_id: string
  project_name?: string
  service: string
  action: string
  status: string
  correlation_id: string | null
  actor_type: string | null
  actor_id: string | null
  resource_type: string | null
  resource_id: string | null
  metadata: Record<string, any> | null
  duration_ms: number | null
  error_code: string | null
  created_at: string
}

// Stable list of services (avoids recreating on each render)
const SERVICES = ['auth', 'db', 'storage', 'jobs', 'email', 'payments', 'analytics', 'secrets', 'backups'] as const

export function InhouseActivityDashboard() {
  const router = useRouter()
  const [activities, setActivities] = useState<ActivityLogEntry[]>([])
  const [errors, setErrors] = useState<ActivityLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [errorsLoading, setErrorsLoading] = useState(true)
  const [service, setService] = useState('all')
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [activeTab, setActiveTab] = useState('all')
  const pageSize = 50

  // AbortController for unmount-safe fetches
  const abortRef = useRef<AbortController | null>(null)
  const errorsAbortRef = useRef<AbortController | null>(null)

  // Fetch activities with AbortController
  const fetchActivities = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    try {
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(page * pageSize),
      })
      if (service !== 'all') params.set('service', service)
      if (status !== 'all') params.set('status', status)

      const response = await fetch(`/api/admin/inhouse/activity?${params}`, {
        signal: controller.signal,
      })
      if (!response.ok) throw new Error('Failed to fetch activities')

      const data = await response.json()
      setActivities(data.data?.activities || [])
      setTotal(data.data?.total || 0)
      setHasMore(data.data?.hasMore || false)
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        console.error('Failed to fetch activities:', error)
        toast.error('Failed to load activities')
      }
    } finally {
      setLoading(false)
    }
  }, [page, service, status])

  // Fetch errors with AbortController
  const fetchErrors = useCallback(async () => {
    errorsAbortRef.current?.abort()
    const controller = new AbortController()
    errorsAbortRef.current = controller

    setErrorsLoading(true)
    try {
      const response = await fetch('/api/admin/inhouse/activity/errors?limit=50', {
        signal: controller.signal,
      })
      if (!response.ok) throw new Error('Failed to fetch errors')

      const data = await response.json()
      setErrors(data.data?.errors || [])
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        console.error('Failed to fetch errors:', error)
      }
    } finally {
      setErrorsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchActivities()
    return () => abortRef.current?.abort()
  }, [fetchActivities])

  useEffect(() => {
    fetchErrors()
    return () => errorsAbortRef.current?.abort()
  }, [fetchErrors])

  // Service badge
  const getServiceBadge = (serviceName: string) => {
    const colors: Record<string, string> = {
      auth: 'bg-blue-500',
      db: 'bg-purple-500',
      storage: 'bg-green-500',
      jobs: 'bg-orange-500',
      email: 'bg-pink-500',
      payments: 'bg-emerald-500',
      analytics: 'bg-cyan-500',
      secrets: 'bg-red-500',
      backups: 'bg-yellow-500',
    }
    return (
      <Badge className={colors[serviceName] || 'bg-gray-500'} variant="default">
        {serviceName}
      </Badge>
    )
  }

  // Status indicator
  const getStatusIcon = (activityStatus: string) => {
    switch (activityStatus) {
      case 'success':
        return <span className="h-2 w-2 rounded-full bg-green-500" />
      case 'error':
        return <span className="h-2 w-2 rounded-full bg-red-500" />
      case 'pending':
        return <span className="h-2 w-2 rounded-full bg-yellow-500" />
      default:
        return <span className="h-2 w-2 rounded-full bg-gray-500" />
    }
  }

  // Render activity table
  const renderActivityTable = (data: ActivityLogEntry[], isLoading: boolean) => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )
    }

    if (data.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
          <Activity className="h-12 w-12 mb-2" />
          <p>No activity found</p>
        </div>
      )
    }

    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[100px]">Service</TableHead>
            <TableHead>Project</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>Time</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((activity) => (
            <TableRow key={activity.id}>
              <TableCell>{getServiceBadge(activity.service)}</TableCell>
              <TableCell>
                <div className="font-medium">{activity.project_name || '-'}</div>
                <div className="text-xs text-muted-foreground font-mono">
                  {activity.project_id.slice(0, 8)}...
                </div>
              </TableCell>
              <TableCell>
                <div>
                  <span className="font-medium">{activity.action}</span>
                  {activity.resource_type && (
                    <span className="text-muted-foreground text-sm ml-1">
                      ({activity.resource_type})
                    </span>
                  )}
                </div>
                {activity.error_code && (
                  <span className="text-xs text-red-500">{activity.error_code}</span>
                )}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  {getStatusIcon(activity.status)}
                  <span className="capitalize">{activity.status}</span>
                </div>
              </TableCell>
              <TableCell>
                {activity.duration_ms ? `${activity.duration_ms}ms` : '-'}
              </TableCell>
              <TableCell>
                <div className="text-sm">
                  {format(new Date(activity.created_at), 'HH:mm:ss')}
                </div>
                <div className="text-xs text-muted-foreground">
                  {format(new Date(activity.created_at), 'MMM d, yyyy')}
                </div>
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => router.push(`/admin/inhouse/projects/${activity.project_id}`)}
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )
  }

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            All Activity
          </TabsTrigger>
          <TabsTrigger value="errors" className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Errors
            {errors.length > 0 && (
              <Badge variant="destructive" className="ml-1">
                {errors.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* All Activity Tab */}
        <TabsContent value="all" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:gap-6">
                <div className="flex gap-2">
                  <Select value={service} onValueChange={(v) => { setService(v); setPage(0); }}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="Service" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Services</SelectItem>
                      {SERVICES.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={status} onValueChange={(v) => { setStatus(v); setPage(0); }}>
                    <SelectTrigger className="w-[120px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="success">Success</SelectItem>
                      <SelectItem value="error">Error</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                    </SelectContent>
                  </Select>

                  <Button
                    variant="outline"
                    size="icon"
                    onClick={fetchActivities}
                    disabled={loading}
                  >
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Activity Table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Activity Log
              </CardTitle>
              <CardDescription>
                {total} activit{total !== 1 ? 'ies' : 'y'} found
              </CardDescription>
            </CardHeader>
            <CardContent>
              {renderActivityTable(activities, loading)}

              {/* Pagination */}
              {activities.length > 0 && (
                <div className="flex items-center justify-between pt-4">
                  <div className="text-sm text-muted-foreground">
                    Showing {page * pageSize + 1}-{Math.min((page + 1) * pageSize, total)} of {total}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.max(0, p - 1))}
                      disabled={page === 0}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => p + 1)}
                      disabled={!hasMore}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Errors Tab */}
        <TabsContent value="errors" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                Recent Errors
              </CardTitle>
              <CardDescription>
                Last 50 errors across all projects
              </CardDescription>
            </CardHeader>
            <CardContent>
              {renderActivityTable(errors, errorsLoading)}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
