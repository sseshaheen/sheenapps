'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
  Star,
  Bug,
  Lightbulb,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Clock,
  Search,
  Filter,
  MoreVertical,
  Send,
  Eye,
  RefreshCw,
  Download,
  Users,
  BarChart3,
  Inbox,
  Archive,
  Tag,
  UserCheck,
  ExternalLink,
} from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import { cn } from '@/lib/utils'

interface Props {
  adminId: string
  adminEmail: string
  adminRole: 'admin' | 'super_admin'
  permissions: string[]
}

interface FeedbackSubmission {
  id: string
  type: 'nps' | 'csat' | 'binary' | 'emoji' | 'text' | 'feature_request' | 'bug_report'
  value: Record<string, unknown>
  text_comment: string | null
  user_id: string | null
  anonymous_id: string
  session_id: string
  page_url: string
  feature_id: string | null
  trigger_point: string
  prompt_id: string
  placement: string
  goal: string
  device_type: string | null
  created_at: string
  status: 'unprocessed' | 'acknowledged' | 'in_progress' | 'resolved' | 'closed'
  disposition: string | null
  priority: 'low' | 'medium' | 'high' | 'critical'
  assigned_to: string | null
  labels: string[]
  resolution_note: string | null
  notified_at: string | null
  updated_at: string
}

interface TriageStats {
  unprocessed: number
  acknowledged: number
  in_progress: number
  resolved: number
  closed: number
  critical_count: number
  oldest_hours: number | null
}

interface NPSStats {
  total_nps: number
  detractor_count: number
  passive_count: number
  promoter_count: number
  detractor_rate: number
  nps_score: number
}

interface FrustrationStats {
  rage_clicks: number
  dead_clicks: number
  errors: number
  unique_sessions: number
}

const STATUS_COLORS: Record<string, string> = {
  unprocessed: 'bg-gray-100 text-gray-700',
  acknowledged: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-yellow-100 text-yellow-700',
  resolved: 'bg-green-100 text-green-700',
  closed: 'bg-slate-100 text-slate-500',
}

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-slate-100 text-slate-600',
  medium: 'bg-blue-100 text-blue-600',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  nps: <TrendingUp className="h-4 w-4" />,
  csat: <Star className="h-4 w-4" />,
  binary: <ThumbsUp className="h-4 w-4" />,
  emoji: <MessageSquare className="h-4 w-4" />,
  text: <MessageSquare className="h-4 w-4" />,
  feature_request: <Lightbulb className="h-4 w-4" />,
  bug_report: <Bug className="h-4 w-4" />,
}

const COMMON_LABELS = [
  'ux-issue',
  'performance',
  'mobile',
  'onboarding',
  'billing',
  'builder',
  'api',
  'documentation',
  'pricing',
  'competitor-mentioned',
]

export function FeedbackDashboard({
  adminId,
  adminEmail,
  adminRole,
  permissions,
}: Props) {
  // Data state
  const [submissions, setSubmissions] = useState<FeedbackSubmission[]>([])
  const [triageStats, setTriageStats] = useState<TriageStats | null>(null)
  const [npsStats, setNpsStats] = useState<NPSStats | null>(null)
  const [frustrationStats, setFrustrationStats] = useState<FrustrationStats | null>(null)

  // UI state
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [selectedFeedback, setSelectedFeedback] = useState<FeedbackSubmission | null>(null)
  const [showNotifyDialog, setShowNotifyDialog] = useState(false)
  const [notifyMessage, setNotifyMessage] = useState('')
  const [notifyType, setNotifyType] = useState<'feature_shipped' | 'bug_fixed' | 'resolved'>('resolved')
  const [actionLoading, setActionLoading] = useState(false)

  // Filters
  const [filters, setFilters] = useState({
    status: 'unprocessed',
    type: 'all',
    priority: 'all',
    dateRange: '7d',
    search: '',
  })

  // Pagination
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const pageSize = 25

  // Fetch data
  const fetchSubmissions = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const params = new URLSearchParams({
        page: page.toString(),
        limit: pageSize.toString(),
      })

      if (filters.status !== 'all') params.append('status', filters.status)
      if (filters.type !== 'all') params.append('type', filters.type)
      if (filters.priority !== 'all') params.append('priority', filters.priority)
      if (filters.dateRange !== 'all') params.append('dateRange', filters.dateRange)
      if (filters.search) params.append('search', filters.search)

      const response = await fetch(`/api/admin/feedback?${params}`)
      if (!response.ok) {
        throw new Error(`Failed to fetch feedback: ${response.status}`)
      }

      const data = await response.json()

      if (data.success) {
        setSubmissions(data.submissions || [])
        setTotalPages(Math.ceil((data.total || 0) / pageSize))
        if (data.stats) {
          setTriageStats(data.stats.triage)
          setNpsStats(data.stats.nps)
          setFrustrationStats(data.stats.frustration)
        }
      } else {
        setError(data.error || 'Failed to load feedback')
      }
    } catch (err) {
      console.error('Failed to fetch feedback:', err)
      setError(err instanceof Error ? err.message : 'Failed to load feedback')
    } finally {
      setLoading(false)
    }
  }, [page, filters])

  useEffect(() => {
    fetchSubmissions()
  }, [fetchSubmissions])

  // Actions
  const updateFeedback = async (
    id: string,
    updates: Partial<FeedbackSubmission>
  ) => {
    try {
      setActionLoading(true)
      const response = await fetch(`/api/admin/feedback/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })

      if (!response.ok) {
        throw new Error('Failed to update feedback')
      }

      // Refresh list
      await fetchSubmissions()
    } catch (err) {
      console.error('Update failed:', err)
      setError(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setActionLoading(false)
    }
  }

  const bulkUpdateStatus = async (status: string) => {
    if (selectedItems.size === 0) return

    try {
      setActionLoading(true)
      const response = await fetch('/api/admin/feedback/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: Array.from(selectedItems),
          action: 'status_change',
          value: status,
        }),
      })

      if (!response.ok) {
        throw new Error('Bulk update failed')
      }

      setSelectedItems(new Set())
      await fetchSubmissions()
    } catch (err) {
      console.error('Bulk update failed:', err)
      setError(err instanceof Error ? err.message : 'Bulk update failed')
    } finally {
      setActionLoading(false)
    }
  }

  const sendNotification = async () => {
    if (!selectedFeedback) return

    try {
      setActionLoading(true)
      const response = await fetch('/api/admin/feedback/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feedbackId: selectedFeedback.id,
          type: notifyType,
          message: notifyMessage,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to send notification')
      }

      setShowNotifyDialog(false)
      setNotifyMessage('')
      await fetchSubmissions()
    } catch (err) {
      console.error('Notification failed:', err)
      setError(err instanceof Error ? err.message : 'Notification failed')
    } finally {
      setActionLoading(false)
    }
  }

  const toggleSelectAll = () => {
    if (selectedItems.size === submissions.length) {
      setSelectedItems(new Set())
    } else {
      setSelectedItems(new Set(submissions.map((s) => s.id)))
    }
  }

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedItems)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedItems(newSelected)
  }

  const formatValue = (feedback: FeedbackSubmission): string => {
    const value = feedback.value
    if (feedback.type === 'nps') {
      return `Score: ${value.score}`
    }
    if (feedback.type === 'csat') {
      return `${value.rating}/5 stars`
    }
    if (feedback.type === 'binary') {
      return value.positive ? 'Positive' : 'Negative'
    }
    if (feedback.type === 'emoji') {
      return `${value.rating}/5`
    }
    return String(value.text || value.description || JSON.stringify(value))
  }

  const getNPSCategory = (score: number): string => {
    if (score >= 9) return 'Promoter'
    if (score >= 7) return 'Passive'
    return 'Detractor'
  }

  const exportData = () => {
    const csv = submissions
      .map(
        (s) =>
          `${s.created_at},${s.type},${formatValue(s)},${s.status},${s.priority},"${s.text_comment || ''}"`
      )
      .join('\n')

    const blob = new Blob(
      [`timestamp,type,value,status,priority,comment\n${csv}`],
      { type: 'text/csv' }
    )
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `feedback-export-${format(new Date(), 'yyyy-MM-dd')}.csv`
    a.click()
  }

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Inbox className="h-4 w-4" />
              Unprocessed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {triageStats?.unprocessed ?? '-'}
            </p>
            {triageStats?.oldest_hours && triageStats.oldest_hours > 24 && (
              <p className="text-xs text-orange-600">
                Oldest: {Math.round(triageStats.oldest_hours)}h
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              In Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {triageStats?.in_progress ?? '-'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              Critical
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">
              {triageStats?.critical_count ?? '-'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              NPS Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={cn(
                'text-2xl font-bold',
                npsStats?.nps_score && npsStats.nps_score >= 50
                  ? 'text-green-600'
                  : npsStats?.nps_score && npsStats.nps_score >= 0
                    ? 'text-yellow-600'
                    : 'text-red-600'
              )}
            >
              {npsStats?.nps_score ?? '-'}
            </p>
            <p className="text-xs text-muted-foreground">
              {npsStats?.total_nps ?? 0} responses
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-orange-500" />
              Detractor Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {npsStats?.detractor_rate ?? '-'}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Bug className="h-4 w-4 text-red-500" />
              Frustration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {frustrationStats
                ? frustrationStats.rage_clicks + frustrationStats.dead_clicks
                : '-'}
            </p>
            <p className="text-xs text-muted-foreground">
              {frustrationStats?.unique_sessions ?? 0} sessions
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="triage" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="triage">
            <Inbox className="h-4 w-4 mr-2" />
            Triage Queue
          </TabsTrigger>
          <TabsTrigger value="all">
            <MessageSquare className="h-4 w-4 mr-2" />
            All Feedback
          </TabsTrigger>
          <TabsTrigger value="signals">
            <BarChart3 className="h-4 w-4 mr-2" />
            Implicit Signals
          </TabsTrigger>
          <TabsTrigger value="segments">
            <Users className="h-4 w-4 mr-2" />
            Segments
          </TabsTrigger>
        </TabsList>

        <TabsContent value="triage" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Filters</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4">
                <div className="flex-1 min-w-[200px]">
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search feedback..."
                      className="pl-9"
                      value={filters.search}
                      onChange={(e) =>
                        setFilters({ ...filters, search: e.target.value })
                      }
                    />
                  </div>
                </div>

                <Select
                  value={filters.status}
                  onValueChange={(v) => setFilters({ ...filters, status: v })}
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="unprocessed">Unprocessed</SelectItem>
                    <SelectItem value="acknowledged">Acknowledged</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={filters.type}
                  onValueChange={(v) => setFilters({ ...filters, type: v })}
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="nps">NPS</SelectItem>
                    <SelectItem value="csat">CSAT</SelectItem>
                    <SelectItem value="binary">Binary</SelectItem>
                    <SelectItem value="emoji">Emoji Scale</SelectItem>
                    <SelectItem value="bug_report">Bug Report</SelectItem>
                    <SelectItem value="feature_request">Feature Request</SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={filters.priority}
                  onValueChange={(v) => setFilters({ ...filters, priority: v })}
                >
                  <SelectTrigger className="w-[130px]">
                    <SelectValue placeholder="Priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Priority</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={filters.dateRange}
                  onValueChange={(v) => setFilters({ ...filters, dateRange: v })}
                >
                  <SelectTrigger className="w-[130px]">
                    <SelectValue placeholder="Date" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24h">Last 24h</SelectItem>
                    <SelectItem value="7d">Last 7 days</SelectItem>
                    <SelectItem value="30d">Last 30 days</SelectItem>
                    <SelectItem value="90d">Last 90 days</SelectItem>
                    <SelectItem value="all">All Time</SelectItem>
                  </SelectContent>
                </Select>

                <Button variant="outline" onClick={() => fetchSubmissions()}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>

                <Button variant="outline" onClick={exportData}>
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Bulk Actions */}
          {selectedItems.size > 0 && (
            <Card className="border-blue-200 bg-blue-50">
              <CardContent className="py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {selectedItems.size} item(s) selected
                  </span>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => bulkUpdateStatus('acknowledged')}
                      disabled={actionLoading}
                    >
                      Acknowledge
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => bulkUpdateStatus('in_progress')}
                      disabled={actionLoading}
                    >
                      Mark In Progress
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => bulkUpdateStatus('resolved')}
                      disabled={actionLoading}
                    >
                      Resolve
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSelectedItems(new Set())}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Error State */}
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Feedback Table */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={
                          selectedItems.size === submissions.length &&
                          submissions.length > 0
                        }
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Comment</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8">
                        <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />
                        Loading feedback...
                      </TableCell>
                    </TableRow>
                  ) : submissions.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="text-center py-8 text-muted-foreground"
                      >
                        <Inbox className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        No feedback found matching filters
                      </TableCell>
                    </TableRow>
                  ) : (
                    submissions.map((feedback) => (
                      <TableRow
                        key={feedback.id}
                        className={cn(
                          selectedItems.has(feedback.id) && 'bg-blue-50',
                          feedback.priority === 'critical' && 'bg-red-50/50'
                        )}
                      >
                        <TableCell>
                          <Checkbox
                            checked={selectedItems.has(feedback.id)}
                            onCheckedChange={() => toggleSelect(feedback.id)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {TYPE_ICONS[feedback.type]}
                            <span className="capitalize text-sm">
                              {feedback.type.replace('_', ' ')}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-sm">
                            {formatValue(feedback)}
                          </div>
                          {feedback.type === 'nps' && (
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-xs mt-1',
                                (feedback.value.score as number) >= 9 &&
                                  'border-green-500 text-green-700',
                                (feedback.value.score as number) >= 7 &&
                                  (feedback.value.score as number) < 9 &&
                                  'border-yellow-500 text-yellow-700',
                                (feedback.value.score as number) < 7 &&
                                  'border-red-500 text-red-700'
                              )}
                            >
                              {getNPSCategory(feedback.value.score as number)}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[200px]">
                          {feedback.text_comment ? (
                            <p className="text-sm text-muted-foreground truncate">
                              {feedback.text_comment}
                            </p>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              -
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={cn(
                              'text-xs',
                              STATUS_COLORS[feedback.status]
                            )}
                          >
                            {feedback.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-xs',
                              PRIORITY_COLORS[feedback.priority]
                            )}
                          >
                            {feedback.priority}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(feedback.created_at), {
                            addSuffix: true,
                          })}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              <DropdownMenuItem
                                onClick={() => setSelectedFeedback(feedback)}
                              >
                                <Eye className="h-4 w-4 mr-2" />
                                View Details
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() =>
                                  updateFeedback(feedback.id, {
                                    status: 'acknowledged',
                                  })
                                }
                              >
                                <CheckCircle className="h-4 w-4 mr-2" />
                                Acknowledge
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  updateFeedback(feedback.id, {
                                    status: 'in_progress',
                                  })
                                }
                              >
                                <Clock className="h-4 w-4 mr-2" />
                                Mark In Progress
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  updateFeedback(feedback.id, {
                                    status: 'resolved',
                                  })
                                }
                              >
                                <CheckCircle className="h-4 w-4 mr-2" />
                                Resolve
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedFeedback(feedback)
                                  setShowNotifyDialog(true)
                                }}
                              >
                                <Send className="h-4 w-4 mr-2" />
                                Notify User
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() =>
                                  updateFeedback(feedback.id, {
                                    priority: 'critical',
                                  })
                                }
                              >
                                <AlertTriangle className="h-4 w-4 mr-2" />
                                Mark Critical
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between p-4 border-t">
                <p className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(page - 1)}
                    disabled={page === 1}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(page + 1)}
                    disabled={page === totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="all" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>All Feedback</CardTitle>
              <CardDescription>
                Complete history of all feedback submissions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Change filters above to view all feedback including resolved and
                closed items.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="signals" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Implicit Signals</CardTitle>
              <CardDescription>
                Passive behavioral data: rage clicks, dead clicks, scroll depth,
                errors
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {frustrationStats ? (
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-red-50 rounded-lg">
                    <p className="text-3xl font-bold text-red-600">
                      {frustrationStats.rage_clicks}
                    </p>
                    <p className="text-sm text-muted-foreground">Rage Clicks</p>
                  </div>
                  <div className="text-center p-4 bg-orange-50 rounded-lg">
                    <p className="text-3xl font-bold text-orange-600">
                      {frustrationStats.dead_clicks}
                    </p>
                    <p className="text-sm text-muted-foreground">Dead Clicks</p>
                  </div>
                  <div className="text-center p-4 bg-yellow-50 rounded-lg">
                    <p className="text-3xl font-bold text-yellow-600">
                      {frustrationStats.errors}
                    </p>
                    <p className="text-sm text-muted-foreground">Errors</p>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">
                  No implicit signal data available yet
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="segments" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Segment Representation</CardTitle>
              <CardDescription>
                Monthly review of feedback by user segment to ensure balanced
                representation
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Alert>
                <Users className="h-4 w-4" />
                <AlertDescription>
                  <strong>Monthly Review Process:</strong> At the start of each
                  month, review feedback distribution across segments (free vs
                  paid, plan tier, account age, platform) to ensure no segment
                  is over/under-represented. Adjust sampling rates or targeting
                  if needed.
                </AlertDescription>
              </Alert>

              <div className="mt-4 space-y-4">
                <div>
                  <h4 className="font-medium mb-2">Checklist</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>
                      - Compare response rates by plan tier (Free, Basic, Pro,
                      Enterprise)
                    </li>
                    <li>- Check mobile vs desktop representation</li>
                    <li>- Review new user vs established user balance</li>
                    <li>
                      - Verify geographic distribution matches user base
                    </li>
                    <li>
                      - Document any anomalies and adjust targeting for next
                      month
                    </li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Detail Dialog */}
      <Dialog
        open={!!selectedFeedback && !showNotifyDialog}
        onOpenChange={() => setSelectedFeedback(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Feedback Details</DialogTitle>
            <DialogDescription>
              Full details and context for this feedback submission
            </DialogDescription>
          </DialogHeader>
          {selectedFeedback && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Type</Label>
                  <div className="flex items-center gap-2 mt-1">
                    {TYPE_ICONS[selectedFeedback.type]}
                    <span className="capitalize">
                      {selectedFeedback.type.replace('_', ' ')}
                    </span>
                  </div>
                </div>
                <div>
                  <Label>Value</Label>
                  <p className="mt-1 font-medium">
                    {formatValue(selectedFeedback)}
                  </p>
                </div>
              </div>

              {selectedFeedback.text_comment && (
                <div>
                  <Label>Comment</Label>
                  <p className="mt-1 text-sm bg-muted p-3 rounded">
                    {selectedFeedback.text_comment}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Status</Label>
                  <Select
                    value={selectedFeedback.status}
                    onValueChange={(v) =>
                      updateFeedback(selectedFeedback.id, {
                        status: v as FeedbackSubmission['status'],
                      })
                    }
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unprocessed">Unprocessed</SelectItem>
                      <SelectItem value="acknowledged">Acknowledged</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="resolved">Resolved</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Priority</Label>
                  <Select
                    value={selectedFeedback.priority}
                    onValueChange={(v) =>
                      updateFeedback(selectedFeedback.id, {
                        priority: v as FeedbackSubmission['priority'],
                      })
                    }
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Labels</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {selectedFeedback.labels.map((label) => (
                    <Badge key={label} variant="secondary">
                      {label}
                    </Badge>
                  ))}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Tag className="h-3 w-3 mr-1" />
                        Add
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      {COMMON_LABELS.filter(
                        (l) => !selectedFeedback.labels.includes(l)
                      ).map((label) => (
                        <DropdownMenuItem
                          key={label}
                          onClick={() =>
                            updateFeedback(selectedFeedback.id, {
                              labels: [...selectedFeedback.labels, label],
                            })
                          }
                        >
                          {label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <Label className="text-xs">Page URL</Label>
                  <p className="text-muted-foreground truncate">
                    {selectedFeedback.page_url}
                  </p>
                </div>
                <div>
                  <Label className="text-xs">Feature ID</Label>
                  <p className="text-muted-foreground">
                    {selectedFeedback.feature_id || '-'}
                  </p>
                </div>
                <div>
                  <Label className="text-xs">Device</Label>
                  <p className="text-muted-foreground">
                    {selectedFeedback.device_type || 'Unknown'}
                  </p>
                </div>
                <div>
                  <Label className="text-xs">Trigger</Label>
                  <p className="text-muted-foreground">
                    {selectedFeedback.trigger_point}
                  </p>
                </div>
              </div>

              <div className="border-t pt-4">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    Created:{' '}
                    {format(
                      new Date(selectedFeedback.created_at),
                      'PPpp'
                    )}
                  </span>
                  {selectedFeedback.notified_at && (
                    <span className="flex items-center gap-1">
                      <CheckCircle className="h-3 w-3 text-green-500" />
                      Notified:{' '}
                      {formatDistanceToNow(
                        new Date(selectedFeedback.notified_at),
                        { addSuffix: true }
                      )}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowNotifyDialog(true)
              }}
              disabled={!selectedFeedback?.user_id}
            >
              <Send className="h-4 w-4 mr-2" />
              Notify User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Notify User Dialog */}
      <Dialog open={showNotifyDialog} onOpenChange={setShowNotifyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Notify User</DialogTitle>
            <DialogDescription>
              Close the loop by letting the user know their feedback was heard
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Notification Type</Label>
              <Select
                value={notifyType}
                onValueChange={(v) =>
                  setNotifyType(v as typeof notifyType)
                }
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="feature_shipped">
                    Feature Shipped
                  </SelectItem>
                  <SelectItem value="bug_fixed">Bug Fixed</SelectItem>
                  <SelectItem value="resolved">General Resolution</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Message</Label>
              <Textarea
                className="mt-1"
                placeholder="Thanks for your feedback! We've addressed..."
                value={notifyMessage}
                onChange={(e) => setNotifyMessage(e.target.value)}
                rows={4}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Be personal and specific. Reference what they reported.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowNotifyDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={sendNotification}
              disabled={!notifyMessage.trim() || actionLoading}
            >
              {actionLoading ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Send Notification
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
