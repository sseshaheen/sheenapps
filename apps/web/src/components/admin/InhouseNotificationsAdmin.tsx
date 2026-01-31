/**
 * In-House Notifications Admin Dashboard Component
 * Displays notification stats, delivery, and templates across projects
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
  Bell,
  RefreshCw,
  Send,
  CheckCircle,
  XCircle,
  Clock,
  Mail,
  Smartphone,
} from 'lucide-react'
import { toast } from 'sonner'

interface NotificationStats {
  totalSent: number
  totalDelivered: number
  totalFailed: number
  totalPending: number
  byChannel: Record<string, { sent: number; delivered: number; failed: number }>
  byType: Record<string, { sent: number; delivered: number; failed: number }>
  byStatus: Record<string, number>
}

export function InhouseNotificationsAdmin() {
  const [stats, setStats] = useState<NotificationStats | null>(null)
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
      const response = await fetch(`/api/admin/inhouse/notifications?${params}`, {
        signal: controller.signal,
      })
      if (!response.ok) throw new Error('Failed to fetch stats')

      const data = await response.json()
      setStats(data.data || null)
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        console.error('Failed to fetch notification stats:', error)
        toast.error('Failed to load notification stats')
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

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case 'email': return <Mail className="h-4 w-4" />
      case 'push': return <Smartphone className="h-4 w-4" />
      default: return <Bell className="h-4 w-4" />
    }
  }

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
      sent: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
      delivered: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
      failed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
      cancelled: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300',
    }
    return (
      <Badge className={colors[status] || 'bg-gray-100 text-gray-800'}>
        {status}
      </Badge>
    )
  }

  const totalNotifications = stats
    ? stats.totalSent + stats.totalDelivered + stats.totalFailed + stats.totalPending
    : 0

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
            <CardTitle className="text-sm font-medium">Sent</CardTitle>
            <Send className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? '...' : formatNumber(stats?.totalSent || 0)}
            </div>
            <p className="text-xs text-muted-foreground">Notifications sent</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Delivered</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {loading ? '...' : formatNumber(stats?.totalDelivered || 0)}
            </div>
            <p className="text-xs text-muted-foreground">Successfully delivered</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Failed</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {loading ? '...' : formatNumber(stats?.totalFailed || 0)}
            </div>
            <p className="text-xs text-muted-foreground">Delivery failures</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {loading ? '...' : formatNumber(stats?.totalPending || 0)}
            </div>
            <p className="text-xs text-muted-foreground">Awaiting delivery</p>
          </CardContent>
        </Card>
      </div>

      {/* Channel Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Delivery by Channel</CardTitle>
          <CardDescription>Notification delivery across different channels</CardDescription>
        </CardHeader>
        <CardContent>
          {stats?.byChannel && Object.keys(stats.byChannel).length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Channel</TableHead>
                  <TableHead className="text-right">Sent</TableHead>
                  <TableHead className="text-right">Delivered</TableHead>
                  <TableHead className="text-right">Failed</TableHead>
                  <TableHead className="text-right">Success Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(stats.byChannel).map(([channel, data]) => {
                  const total = data.sent + data.delivered + data.failed
                  const successRate = total > 0 ? ((data.delivered / total) * 100).toFixed(1) : '0'
                  return (
                    <TableRow key={channel}>
                      <TableCell className="flex items-center gap-2">
                        {getChannelIcon(channel)}
                        <span className="capitalize">{channel}</span>
                      </TableCell>
                      <TableCell className="text-right font-mono">{formatNumber(data.sent)}</TableCell>
                      <TableCell className="text-right font-mono text-green-600">{formatNumber(data.delivered)}</TableCell>
                      <TableCell className="text-right font-mono text-red-600">{data.failed > 0 ? formatNumber(data.failed) : '-'}</TableCell>
                      <TableCell className="text-right font-mono">{successRate}%</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No channel data available
            </div>
          )}
        </CardContent>
      </Card>

      {/* Type Breakdown */}
      {stats?.byType && Object.keys(stats.byType).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Notifications by Type</CardTitle>
            <CardDescription>Breakdown by notification type</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
              {Object.entries(stats.byType).map(([type, data]) => (
                <div key={type} className="p-4 border rounded-lg">
                  <div className="font-medium text-sm truncate">{type}</div>
                  <div className="mt-2 text-2xl font-bold">{formatNumber(data.sent)}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatNumber(data.delivered)} delivered
                    {data.failed > 0 && (
                      <span className="text-red-500 ml-2">{data.failed} failed</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Status Distribution */}
      {stats?.byStatus && Object.keys(stats.byStatus).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Status Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              {Object.entries(stats.byStatus).map(([status, count]) => (
                <div key={status} className="flex items-center gap-2">
                  {getStatusBadge(status)}
                  <span className="font-mono">{formatNumber(count)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
