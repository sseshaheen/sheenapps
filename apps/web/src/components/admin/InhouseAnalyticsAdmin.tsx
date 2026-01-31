/**
 * In-House Analytics Admin
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { RefreshCw } from 'lucide-react'

interface AnalyticsSummary {
  totals: Array<{ event_type: string; count: number }>
  topEvents: Array<{ event_name: string; count: number }>
  uniqueUsers: number
}

interface AnalyticsEvent {
  id: string
  project_id: string
  project_name?: string
  event_type: string
  event_name: string
  user_id?: string | null
  anonymous_id?: string | null
  timestamp: string
}

export function InhouseAnalyticsAdmin() {
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('month')
  const [projectId, setProjectId] = useState('')
  const [eventType, setEventType] = useState('all')
  const [eventName, setEventName] = useState('')
  const [userId, setUserId] = useState('')
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null)
  const [events, setEvents] = useState<AnalyticsEvent[]>([])
  const [loading, setLoading] = useState(true)

  const fetchSummary = useCallback(async () => {
    const params = new URLSearchParams({ period })
    if (projectId) params.set('projectId', projectId)
    const response = await fetch(`/api/admin/inhouse/analytics/summary?${params.toString()}`)
    if (response.ok) {
      const data = await response.json()
      setSummary(data.data || null)
    }
  }, [period, projectId])

  const fetchEvents = useCallback(async () => {
    const params = new URLSearchParams({ limit: '50', offset: '0' })
    if (projectId) params.set('projectId', projectId)
    if (eventType !== 'all') params.set('eventType', eventType)
    if (eventName) params.set('eventName', eventName)
    if (userId) params.set('userId', userId)
    const response = await fetch(`/api/admin/inhouse/analytics/events?${params.toString()}`)
    if (response.ok) {
      const data = await response.json()
      setEvents(data.data?.events || [])
    }
  }, [projectId, eventType, eventName, userId])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    await Promise.all([fetchSummary(), fetchEvents()])
    setLoading(false)
  }, [fetchSummary, fetchEvents])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Analytics Filters</CardTitle>
          <CardDescription>Filter events and summary</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Select value={period} onValueChange={(value) => setPeriod(value as typeof period)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Last 24h</SelectItem>
              <SelectItem value="week">Last 7 days</SelectItem>
              <SelectItem value="month">This month</SelectItem>
            </SelectContent>
          </Select>
          <Input
            placeholder="Project ID (optional)"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-[220px]"
          />
          <Select value={eventType} onValueChange={setEventType}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Event Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="track">track</SelectItem>
              <SelectItem value="page">page</SelectItem>
              <SelectItem value="identify">identify</SelectItem>
            </SelectContent>
          </Select>
          <Input
            placeholder="Event name"
            value={eventName}
            onChange={(e) => setEventName(e.target.value)}
            className="w-[220px]"
          />
          <Input
            placeholder="User/Anonymous ID"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="w-[220px]"
          />
          <Button variant="outline" onClick={fetchAll}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </CardContent>
      </Card>

      {summary ? (
        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
            <CardDescription>Top events and counts</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm">Unique users: <strong>{summary.uniqueUsers}</strong></div>
            <div className="text-sm">Totals: {summary.totals.map((row) => `${row.event_type}: ${row.count}`).join(' • ')}</div>
            <div className="text-sm">Top events: {summary.topEvents.map((row) => `${row.event_name}: ${row.count}`).join(' • ')}</div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Recent Events</CardTitle>
          <CardDescription>Showing latest 50 events</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : events.length === 0 ? (
            <div className="text-sm text-muted-foreground">No events found</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Timestamp</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell>
                      <div className="font-medium">{event.project_name || event.project_id}</div>
                      <div className="text-xs text-muted-foreground">{event.project_id}</div>
                    </TableCell>
                    <TableCell>{event.event_type}</TableCell>
                    <TableCell>{event.event_name}</TableCell>
                    <TableCell className="text-xs">{event.user_id || event.anonymous_id || '—'}</TableCell>
                    <TableCell>{new Date(event.timestamp).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
