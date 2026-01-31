/**
 * In-House Connectors Admin Dashboard Component
 * Displays connector connections across projects
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
  Plug,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'

interface ConnectorConnection {
  id: string
  project_id: string
  project_name?: string
  connector_id: string
  display_name: string
  status: 'active' | 'expired' | 'revoked' | 'error'
  scopes: string[]
  created_at: string
  expires_at: string | null
  last_used_at: string | null
}

export function InhouseConnectorsAdmin() {
  const [connections, setConnections] = useState<ConnectorConnection[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const pageSize = 50

  const abortRef = useRef<AbortController | null>(null)

  const fetchConnections = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    try {
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(page * pageSize),
      })

      const response = await fetch(`/api/admin/inhouse/connectors?${params}`, {
        signal: controller.signal,
      })
      if (!response.ok) throw new Error('Failed to fetch connections')

      const data = await response.json()
      setConnections(data.data?.connections || [])
      setTotal(data.data?.total || 0)
      setHasMore(data.data?.hasMore || false)
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        console.error('Failed to fetch connections:', error)
        toast.error('Failed to load connector connections')
      }
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => {
    fetchConnections()
    return () => abortRef.current?.abort()
  }, [fetchConnections])

  const handleRefresh = () => {
    fetchConnections()
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
      case 'expired':
        return (
          <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Expired
          </Badge>
        )
      case 'revoked':
        return (
          <Badge variant="secondary">
            <XCircle className="h-3 w-3 mr-1" />
            Revoked
          </Badge>
        )
      case 'error':
        return (
          <Badge variant="destructive">
            <XCircle className="h-3 w-3 mr-1" />
            Error
          </Badge>
        )
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const activeCount = connections.filter(c => c.status === 'active').length
  const expiredCount = connections.filter(c => c.status === 'expired').length
  const errorCount = connections.filter(c => c.status === 'error').length

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Badge variant="outline" className="text-green-600">
            <CheckCircle className="h-3 w-3 mr-1" />
            {activeCount} active
          </Badge>
          {expiredCount > 0 && (
            <Badge variant="outline" className="text-yellow-600">
              <AlertTriangle className="h-3 w-3 mr-1" />
              {expiredCount} expired
            </Badge>
          )}
          {errorCount > 0 && (
            <Badge variant="outline" className="text-red-600">
              <XCircle className="h-3 w-3 mr-1" />
              {errorCount} errors
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
            <CardTitle className="text-sm font-medium">Total Connections</CardTitle>
            <Plug className="h-4 w-4 text-muted-foreground" />
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
            <p className="text-xs text-muted-foreground">Healthy connections</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Expired</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{loading ? '...' : expiredCount}</div>
            <p className="text-xs text-muted-foreground">Need reauthorization</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Errors</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{loading ? '...' : errorCount}</div>
            <p className="text-xs text-muted-foreground">Failing connections</p>
          </CardContent>
        </Card>
      </div>

      {/* Connections Table */}
      <Card>
        <CardHeader>
          <CardTitle>Connector Connections</CardTitle>
          <CardDescription>Third-party integrations across In-House Mode projects</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Connector</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Scopes</TableHead>
                <TableHead>Last Used</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : connections.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No connector connections found
                  </TableCell>
                </TableRow>
              ) : (
                connections.map((conn) => (
                  <TableRow key={conn.id}>
                    <TableCell>
                      <div className="font-medium">{conn.display_name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{conn.connector_id}</div>
                    </TableCell>
                    <TableCell className="max-w-[150px] truncate">
                      {conn.project_name || conn.project_id.slice(0, 8)}
                    </TableCell>
                    <TableCell>{getStatusBadge(conn.status)}</TableCell>
                    <TableCell>
                      {conn.scopes && conn.scopes.length > 0 ? (
                        <Badge variant="outline">{conn.scopes.length} scopes</Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {conn.last_used_at
                        ? format(new Date(conn.last_used_at), 'MMM d, HH:mm')
                        : '-'}
                    </TableCell>
                    <TableCell className="text-xs">
                      {format(new Date(conn.created_at), 'MMM d, yyyy')}
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
    </div>
  )
}
