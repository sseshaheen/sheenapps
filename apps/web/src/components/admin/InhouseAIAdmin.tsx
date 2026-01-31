/**
 * In-House AI Admin Dashboard Component
 * Displays AI usage stats, requests, and errors across projects
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
  Brain,
  AlertTriangle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Zap,
  TrendingUp,
} from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'

interface AIUsageStats {
  totalRequests: number
  successfulRequests: number
  failedRequests: number
  totalTokens: number
  promptTokens: number
  completionTokens: number
  estimatedCostCents: number
  byModel: Record<string, { requests: number; tokens: number; errors: number }>
  byOperation: Record<string, { requests: number; tokens: number }>
}

interface AIRequest {
  id: string
  project_id: string
  project_name?: string
  model: string
  operation: string
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  success: boolean
  error_code: string | null
  request_id: string | null
  created_at: string
}

const OPERATIONS = ['chat', 'embed', 'image'] as const

export function InhouseAIAdmin() {
  const [stats, setStats] = useState<AIUsageStats | null>(null)
  const [requests, setRequests] = useState<AIRequest[]>([])
  const [errors, setErrors] = useState<AIRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [requestsLoading, setRequestsLoading] = useState(true)
  const [errorsLoading, setErrorsLoading] = useState(true)
  const [operation, setOperation] = useState('all')
  const [period, setPeriod] = useState('month')
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const pageSize = 50

  const abortRef = useRef<AbortController | null>(null)
  const requestsAbortRef = useRef<AbortController | null>(null)
  const errorsAbortRef = useRef<AbortController | null>(null)

  // Fetch stats
  const fetchStats = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    try {
      const params = new URLSearchParams({ period })
      const response = await fetch(`/api/admin/inhouse/ai?${params}`, {
        signal: controller.signal,
      })
      if (!response.ok) throw new Error('Failed to fetch stats')

      const data = await response.json()
      setStats(data.data || null)
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        console.error('Failed to fetch AI stats:', error)
        toast.error('Failed to load AI stats')
      }
    } finally {
      setLoading(false)
    }
  }, [period])

  // Fetch requests
  const fetchRequests = useCallback(async () => {
    requestsAbortRef.current?.abort()
    const controller = new AbortController()
    requestsAbortRef.current = controller

    setRequestsLoading(true)
    try {
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(page * pageSize),
        period,
      })
      if (operation !== 'all') params.set('operation', operation)

      const response = await fetch(`/api/admin/inhouse/ai/requests?${params}`, {
        signal: controller.signal,
      })
      if (!response.ok) throw new Error('Failed to fetch requests')

      const data = await response.json()
      setRequests(data.data?.requests || [])
      setTotal(data.data?.total || 0)
      setHasMore(data.data?.hasMore || false)
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        console.error('Failed to fetch AI requests:', error)
        toast.error('Failed to load AI requests')
      }
    } finally {
      setRequestsLoading(false)
    }
  }, [page, operation, period])

  // Fetch errors
  const fetchErrors = useCallback(async () => {
    errorsAbortRef.current?.abort()
    const controller = new AbortController()
    errorsAbortRef.current = controller

    setErrorsLoading(true)
    try {
      const params = new URLSearchParams({ limit: '50', period })
      const response = await fetch(`/api/admin/inhouse/ai/errors?${params}`, {
        signal: controller.signal,
      })
      if (!response.ok) throw new Error('Failed to fetch errors')

      const data = await response.json()
      setErrors(data.data?.errors || [])
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        console.error('Failed to fetch AI errors:', error)
      }
    } finally {
      setErrorsLoading(false)
    }
  }, [period])

  useEffect(() => {
    fetchStats()
    return () => abortRef.current?.abort()
  }, [fetchStats])

  useEffect(() => {
    fetchRequests()
    return () => requestsAbortRef.current?.abort()
  }, [fetchRequests])

  useEffect(() => {
    fetchErrors()
    return () => errorsAbortRef.current?.abort()
  }, [fetchErrors])

  const handleRefresh = () => {
    fetchStats()
    fetchRequests()
    fetchErrors()
  }

  const getOperationBadge = (op: string) => {
    const colors: Record<string, string> = {
      chat: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
      embed: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
      image: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    }
    return (
      <Badge className={colors[op] || 'bg-gray-100 text-gray-800'}>
        {op}
      </Badge>
    )
  }

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
    return num.toString()
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Today</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
            <Brain className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? '...' : formatNumber(stats?.totalRequests || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats?.failedRequests || 0} failed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tokens</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? '...' : formatNumber(stats?.totalTokens || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {formatNumber(stats?.promptTokens || 0)} prompt / {formatNumber(stats?.completionTokens || 0)} completion
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Est. Cost</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${loading ? '...' : ((stats?.estimatedCostCents || 0) / 100).toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">
              Based on avg pricing
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? '...' : stats?.totalRequests
                ? `${((stats.successfulRequests / stats.totalRequests) * 100).toFixed(1)}%`
                : '0%'}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats?.successfulRequests || 0} successful
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Model Breakdown */}
      {stats?.byModel && Object.keys(stats.byModel).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Usage by Model</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
              {Object.entries(stats.byModel).map(([model, data]) => (
                <div key={model} className="p-4 border rounded-lg">
                  <div className="font-medium text-sm truncate">{model}</div>
                  <div className="mt-2 text-2xl font-bold">{formatNumber(data.requests)}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatNumber(data.tokens)} tokens
                    {data.errors > 0 && (
                      <span className="text-red-500 ml-2">{data.errors} errors</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue="requests">
        <TabsList>
          <TabsTrigger value="requests">Recent Requests</TabsTrigger>
          <TabsTrigger value="errors" className="relative">
            Errors
            {errors.length > 0 && (
              <Badge variant="destructive" className="ml-2 h-5 w-5 p-0 justify-center">
                {errors.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="requests" className="space-y-4">
          {/* Filters */}
          <div className="flex items-center gap-4">
            <Select value={operation} onValueChange={(v) => { setOperation(v); setPage(0); }}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Operation" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Operations</SelectItem>
                {OPERATIONS.map((op) => (
                  <SelectItem key={op} value={op}>{op}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Requests Table */}
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Operation</TableHead>
                  <TableHead>Tokens</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requestsLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : requests.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No AI requests found
                    </TableCell>
                  </TableRow>
                ) : (
                  requests.map((req) => (
                    <TableRow key={req.id}>
                      <TableCell className="text-xs">
                        {format(new Date(req.created_at), 'MMM d, HH:mm:ss')}
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate">
                        {req.project_name || req.project_id.slice(0, 8)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{req.model}</TableCell>
                      <TableCell>{getOperationBadge(req.operation)}</TableCell>
                      <TableCell>{formatNumber(req.total_tokens)}</TableCell>
                      <TableCell>
                        {req.success ? (
                          <Badge variant="outline" className="text-green-600">Success</Badge>
                        ) : (
                          <Badge variant="destructive">{req.error_code || 'Error'}</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Showing {total === 0 ? 0 : page * pageSize + 1} - {total === 0 ? 0 : Math.min((page + 1) * pageSize, total)} of {total}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => p + 1)}
                disabled={!hasMore}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="errors">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                Recent Errors
              </CardTitle>
              <CardDescription>AI operation failures across all projects</CardDescription>
            </CardHeader>
            <CardContent>
              {errorsLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : errors.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No errors found</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead>Operation</TableHead>
                      <TableHead>Error</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {errors.map((err) => (
                      <TableRow key={err.id}>
                        <TableCell className="text-xs">
                          {format(new Date(err.created_at), 'MMM d, HH:mm:ss')}
                        </TableCell>
                        <TableCell className="max-w-[150px] truncate">
                          {err.project_name || err.project_id.slice(0, 8)}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{err.model}</TableCell>
                        <TableCell>{getOperationBadge(err.operation)}</TableCell>
                        <TableCell>
                          <Badge variant="destructive">{err.error_code || 'Unknown'}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
