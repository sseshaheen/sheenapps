/**
 * In-House Edge Functions Admin Dashboard Component
 * Displays edge functions across projects
 */

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Zap,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  ChevronLeft,
  ChevronRight,
  Play,
  Code,
} from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'

interface EdgeFunction {
  id: string
  project_id: string
  project_name?: string
  name: string
  entry_point: string
  status: 'active' | 'deploying' | 'failed' | 'inactive'
  version: number
  created_at: string
  updated_at: string
  deployed_at: string | null
}

export function InhouseEdgeFunctionsAdmin() {
  const [functions, setFunctions] = useState<EdgeFunction[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const pageSize = 50

  const abortRef = useRef<AbortController | null>(null)

  const fetchFunctions = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    try {
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(page * pageSize),
      })

      const response = await fetch(`/api/admin/inhouse/edge-functions?${params}`, {
        signal: controller.signal,
      })
      if (!response.ok) throw new Error('Failed to fetch functions')

      const data = await response.json()
      setFunctions(data.data?.functions || [])
      setTotal(data.data?.total || 0)
      setHasMore(data.data?.hasMore || false)
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        console.error('Failed to fetch edge functions:', error)
        toast.error('Failed to load edge functions')
      }
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => {
    fetchFunctions()
    return () => abortRef.current?.abort()
  }, [fetchFunctions])

  const handleRefresh = () => {
    fetchFunctions()
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return (
          <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
            <CheckCircle className="h-3 w-3 mr-1" />
            Active
          </Badge>
        )
      case 'deploying':
        return (
          <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300">
            <Clock className="h-3 w-3 mr-1 animate-spin" />
            Deploying
          </Badge>
        )
      case 'failed':
        return (
          <Badge variant="destructive">
            <XCircle className="h-3 w-3 mr-1" />
            Failed
          </Badge>
        )
      case 'inactive':
        return (
          <Badge variant="secondary">
            <Clock className="h-3 w-3 mr-1" />
            Inactive
          </Badge>
        )
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const activeCount = functions.filter(f => f.status === 'active').length
  const deployingCount = functions.filter(f => f.status === 'deploying').length
  const failedCount = functions.filter(f => f.status === 'failed').length

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Badge variant="outline" className="text-green-600">
            <Play className="h-3 w-3 mr-1" />
            {activeCount} active
          </Badge>
          {deployingCount > 0 && (
            <Badge variant="outline" className="text-blue-600">
              <Clock className="h-3 w-3 mr-1" />
              {deployingCount} deploying
            </Badge>
          )}
          {failedCount > 0 && (
            <Badge variant="outline" className="text-red-600">
              <XCircle className="h-3 w-3 mr-1" />
              {failedCount} failed
            </Badge>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Functions</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loading ? '...' : total}</div>
            <p className="text-xs text-muted-foreground">Across all projects</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{loading ? '...' : activeCount}</div>
            <p className="text-xs text-muted-foreground">Deployed & running</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Deploying</CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{loading ? '...' : deployingCount}</div>
            <p className="text-xs text-muted-foreground">In progress</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Failed</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{loading ? '...' : failedCount}</div>
            <p className="text-xs text-muted-foreground">Deployment errors</p>
          </CardContent>
        </Card>
      </div>

      {/* Functions Table */}
      <Card>
        <CardHeader>
          <CardTitle>Edge Functions</CardTitle>
          <CardDescription>Cloudflare Workers deployed across In-House Mode projects</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Function</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Deployed</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : functions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No edge functions found
                  </TableCell>
                </TableRow>
              ) : (
                functions.map((fn) => (
                  <TableRow key={fn.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Code className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="font-medium">{fn.name}</div>
                          <div className="text-xs text-muted-foreground font-mono">{fn.entry_point}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[150px] truncate">
                      {fn.project_name || fn.project_id.slice(0, 8)}
                    </TableCell>
                    <TableCell>{getStatusBadge(fn.status)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">v{fn.version}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {fn.deployed_at
                        ? format(new Date(fn.deployed_at), 'MMM d, HH:mm')
                        : '-'}
                    </TableCell>
                    <TableCell className="text-xs">
                      {format(new Date(fn.updated_at), 'MMM d, HH:mm')}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {total > pageSize && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Showing {page * pageSize + 1} - {Math.min((page + 1) * pageSize, total)} of {total}
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
      )}

      {/* Info */}
      <Card>
        <CardHeader>
          <CardTitle>Infrastructure</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Edge functions are deployed to Cloudflare Workers for Platforms. Each function runs in an isolated
            environment with access to project secrets resolved at deploy time.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
