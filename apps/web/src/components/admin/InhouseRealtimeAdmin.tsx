/**
 * In-House Realtime Admin Dashboard Component
 * Displays realtime stats, channels, and connections across projects
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
import {
  Radio,
  RefreshCw,
  Users,
  MessageSquare,
  Wifi,
  AlertTriangle,
} from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'

interface RealtimeStats {
  totalMessages: number
  totalConnections: number
  totalPresenceUpdates: number
  activeChannels: number
  errorCount: number
  byOperation: Record<string, { count: number; errors: number }>
}

export function InhouseRealtimeAdmin() {
  const [stats, setStats] = useState<RealtimeStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('month')

  const abortRef = useRef<AbortController | null>(null)

  const fetchStats = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    try {
      const params = new URLSearchParams({ period })
      const response = await fetch(`/api/admin/inhouse/realtime?${params}`, {
        signal: controller.signal,
      })
      if (!response.ok) throw new Error('Failed to fetch stats')

      const data = await response.json()
      setStats(data.data || null)
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        console.error('Failed to fetch realtime stats:', error)
        toast.error('Failed to load realtime stats')
      }
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => {
    fetchStats()
    return () => abortRef.current?.abort()
  }, [fetchStats])

  const handleRefresh = () => {
    fetchStats()
  }

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
    return num.toString()
  }

  const getOperationBadge = (op: string) => {
    const colors: Record<string, string> = {
      publish: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
      connect: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
      presence: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
    }
    return (
      <Badge className={colors[op] || 'bg-gray-100 text-gray-800'}>
        {op}
      </Badge>
    )
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
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Messages</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? '...' : formatNumber(stats?.totalMessages || 0)}
            </div>
            <p className="text-xs text-muted-foreground">Published messages</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Connections</CardTitle>
            <Wifi className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? '...' : formatNumber(stats?.totalConnections || 0)}
            </div>
            <p className="text-xs text-muted-foreground">Total connections</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Presence</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? '...' : formatNumber(stats?.totalPresenceUpdates || 0)}
            </div>
            <p className="text-xs text-muted-foreground">Presence updates</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Channels</CardTitle>
            <Radio className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? '...' : formatNumber(stats?.activeChannels || 0)}
            </div>
            <p className="text-xs text-muted-foreground">Active channels</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Errors</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {loading ? '...' : formatNumber(stats?.errorCount || 0)}
            </div>
            <p className="text-xs text-muted-foreground">Failed operations</p>
          </CardContent>
        </Card>
      </div>

      {/* Operation Breakdown */}
      {stats?.byOperation && Object.keys(stats.byOperation).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Usage by Operation</CardTitle>
            <CardDescription>Breakdown of realtime operations</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Operation</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                  <TableHead className="text-right">Errors</TableHead>
                  <TableHead className="text-right">Error Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(stats.byOperation).map(([op, data]) => (
                  <TableRow key={op}>
                    <TableCell>{getOperationBadge(op)}</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatNumber(data.count)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-red-600">
                      {data.errors > 0 ? formatNumber(data.errors) : '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {data.count > 0 ? `${((data.errors / data.count) * 100).toFixed(1)}%` : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Info */}
      <Card>
        <CardHeader>
          <CardTitle>Realtime Infrastructure</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Realtime features are powered by Ably. Each project gets isolated channels with the prefix{' '}
            <code className="bg-muted px-1 rounded">project:{'<id>'}:</code>.
            View project-specific realtime details from the Projects page.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
