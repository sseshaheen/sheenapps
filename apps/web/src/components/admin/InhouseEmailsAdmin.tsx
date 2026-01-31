/**
 * In-House Emails Admin Dashboard
 */

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { RefreshCw, Mail, Eye, RotateCw, ShieldOff } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'

interface EmailRow {
  id: string
  project_id: string
  project_name?: string
  to_addresses: string[]
  subject: string
  template_name: string | null
  status: string
  created_at: string
  sent_at: string | null
  delivered_at: string | null
  failed_at: string | null
  error_message: string | null
}

interface EmailDetail extends EmailRow {
  from_address?: string | null
  reply_to?: string | null
  html?: string | null
  text?: string | null
  tags?: Record<string, string> | null
  locale?: string | null
}

interface EmailStats {
  byStatus: Array<{ status: string; count: number }>
  startDate: string
  endDate: string
}

interface SuppressionRow {
  id: string
  project_id: string
  project_name?: string
  email: string
  reason: string
  source: string
  status: string
  created_at: string
}

export function InhouseEmailsAdmin() {
  const [projectId, setProjectId] = useState('')
  const [status, setStatus] = useState('all')
  const [emails, setEmails] = useState<EmailRow[]>([])
  const [stats, setStats] = useState<EmailStats | null>(null)
  const [loading, setLoading] = useState(true)

  const [bounces, setBounces] = useState<SuppressionRow[]>([])
  const [suppressions, setSuppressions] = useState<SuppressionRow[]>([])
  const [bouncesLoading, setBouncesLoading] = useState(false)
  const [suppressionsLoading, setSuppressionsLoading] = useState(false)

  const [selectedEmail, setSelectedEmail] = useState<EmailDetail | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  const abortRef = useRef<AbortController | null>(null)
  const statsAbortRef = useRef<AbortController | null>(null)

  const fetchEmails = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '50', offset: '0' })
      if (projectId) params.set('projectId', projectId)
      if (status !== 'all') params.set('status', status)

      const response = await fetch(`/api/admin/inhouse/emails?${params.toString()}`, {
        signal: controller.signal,
      })
      if (!response.ok) throw new Error('Failed to fetch emails')

      const data = await response.json()
      setEmails(data.data?.emails || [])
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        console.error('Failed to fetch emails:', error)
        toast.error('Failed to load emails')
      }
    } finally {
      setLoading(false)
    }
  }, [projectId, status])

  const fetchStats = useCallback(async () => {
    statsAbortRef.current?.abort()
    const controller = new AbortController()
    statsAbortRef.current = controller

    try {
      const params = new URLSearchParams({ period: 'month' })
      if (projectId) params.set('projectId', projectId)
      const response = await fetch(`/api/admin/inhouse/emails/stats?${params.toString()}`, {
        signal: controller.signal,
      })
      if (!response.ok) throw new Error('Failed to fetch email stats')

      const data = await response.json()
      setStats(data.data || null)
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        console.error('Failed to fetch email stats:', error)
      }
    }
  }, [projectId])

  const fetchBounces = useCallback(async () => {
    setBouncesLoading(true)
    try {
      const params = new URLSearchParams({ limit: '50', offset: '0' })
      if (projectId) params.set('projectId', projectId)
      const response = await fetch(`/api/admin/inhouse/emails/bounces?${params.toString()}`)
      if (!response.ok) throw new Error('Failed to fetch bounces')
      const data = await response.json()
      setBounces(data.data?.bounces || [])
    } catch (error) {
      console.error('Failed to fetch bounces:', error)
      toast.error('Failed to load bounces')
    } finally {
      setBouncesLoading(false)
    }
  }, [projectId])

  const fetchSuppressions = useCallback(async () => {
    setSuppressionsLoading(true)
    try {
      const params = new URLSearchParams({ limit: '50', offset: '0' })
      if (projectId) params.set('projectId', projectId)
      const response = await fetch(`/api/admin/inhouse/emails/suppressions?${params.toString()}`)
      if (!response.ok) throw new Error('Failed to fetch suppressions')
      const data = await response.json()
      setSuppressions(data.data?.suppressions || [])
    } catch (error) {
      console.error('Failed to fetch suppressions:', error)
      toast.error('Failed to load suppressions')
    } finally {
      setSuppressionsLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    fetchEmails()
    fetchStats()
    fetchBounces()
    fetchSuppressions()
    return () => {
      abortRef.current?.abort()
      statsAbortRef.current?.abort()
    }
  }, [fetchEmails, fetchStats, fetchBounces, fetchSuppressions])

  const handleResend = async (emailId: string) => {
    const reason = window.prompt('Reason for resend (required):')
    if (!reason) return

    try {
      const response = await fetch(`/api/admin/inhouse/emails/${emailId}/resend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      if (!response.ok) throw new Error('Failed to resend email')
      toast.success('Email resent')
      fetchEmails()
      fetchStats()
    } catch (error) {
      console.error('Failed to resend email:', error)
      toast.error('Failed to resend email')
    }
  }

  const handleView = async (emailId: string) => {
    try {
      const response = await fetch(`/api/admin/inhouse/emails/${emailId}`)
      if (!response.ok) throw new Error('Failed to load email')
      const data = await response.json()
      setSelectedEmail(data.data || null)
      setDetailOpen(true)
    } catch (error) {
      console.error('Failed to load email:', error)
      toast.error('Failed to load email details')
    }
  }

  const handleClearBounce = async (email: string) => {
    if (!projectId) {
      toast.error('Project ID is required to clear bounces')
      return
    }
    const reason = window.prompt('Reason for clearing bounce (required):')
    if (!reason) return

    try {
      const response = await fetch(`/api/admin/inhouse/emails/bounces/${encodeURIComponent(email)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, reason }),
      })
      if (!response.ok) throw new Error('Failed to clear bounce')
      toast.success('Bounce cleared')
      fetchBounces()
      fetchSuppressions()
      fetchStats()
    } catch (error) {
      console.error('Failed to clear bounce:', error)
      toast.error('Failed to clear bounce')
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email Filters
          </CardTitle>
          <CardDescription>Filter by project and status</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Input
            placeholder="Project ID"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-[260px]"
          />
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="queued">Queued</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
              <SelectItem value="bounced">Bounced</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => { fetchEmails(); fetchStats(); fetchBounces(); fetchSuppressions() }}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </CardContent>
      </Card>

      {stats ? (
        <Card>
          <CardHeader>
            <CardTitle>Email Status (Last 30 Days)</CardTitle>
            <CardDescription>{stats.startDate} → {stats.endDate}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            {stats.byStatus.map((row) => (
              <Badge key={row.status} variant="outline">{row.status}: {row.count}</Badge>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Recent Emails</CardTitle>
          <CardDescription>Showing latest 50 emails</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : emails.length === 0 ? (
            <div className="text-sm text-muted-foreground">No emails found</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {emails.map((email) => (
                  <TableRow key={email.id}>
                    <TableCell>
                      <div className="font-medium">{email.project_name || email.project_id}</div>
                      <div className="text-xs text-muted-foreground">{email.project_id}</div>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">{email.to_addresses?.join(', ')}</TableCell>
                    <TableCell className="max-w-[260px] truncate">{email.subject}</TableCell>
                    <TableCell><Badge variant="outline">{email.status}</Badge></TableCell>
                    <TableCell>{format(new Date(email.created_at), 'PPp')}</TableCell>
                    <TableCell className="space-x-2">
                      <Button size="sm" variant="outline" onClick={() => handleView(email.id)}>
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleResend(email.id)}>
                        <RotateCw className="h-4 w-4 mr-1" />
                        Resend
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bounces</CardTitle>
          <CardDescription>Active bounce suppressions (per project)</CardDescription>
        </CardHeader>
        <CardContent>
          {bouncesLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : bounces.length === 0 ? (
            <div className="text-sm text-muted-foreground">No bounces recorded</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bounces.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.email}</TableCell>
                    <TableCell>
                      <div className="font-medium">{row.project_name || row.project_id}</div>
                      <div className="text-xs text-muted-foreground">{row.project_id}</div>
                    </TableCell>
                    <TableCell>{format(new Date(row.created_at), 'PPp')}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => handleClearBounce(row.email)}>
                        <ShieldOff className="h-4 w-4 mr-1" />
                        Clear
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Suppressions</CardTitle>
          <CardDescription>All active suppressions (bounce, complaint, manual)</CardDescription>
        </CardHeader>
        <CardContent>
          {suppressionsLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : suppressions.length === 0 ? (
            <div className="text-sm text-muted-foreground">No suppressions recorded</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppressions.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.email}</TableCell>
                    <TableCell><Badge variant="outline">{row.reason}</Badge></TableCell>
                    <TableCell>{row.source}</TableCell>
                    <TableCell>
                      <div className="font-medium">{row.project_name || row.project_id}</div>
                      <div className="text-xs text-muted-foreground">{row.project_id}</div>
                    </TableCell>
                    <TableCell>{format(new Date(row.created_at), 'PPp')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Email Details</DialogTitle>
            <DialogDescription>Rendered email content and metadata</DialogDescription>
          </DialogHeader>
          {selectedEmail ? (
            <div className="space-y-4">
              <div className="text-sm">
                <div><strong>To:</strong> {selectedEmail.to_addresses?.join(', ')}</div>
                <div><strong>Subject:</strong> {selectedEmail.subject}</div>
                <div><strong>Status:</strong> {selectedEmail.status}</div>
                <div><strong>From:</strong> {selectedEmail.from_address || '—'}</div>
                <div><strong>Reply-To:</strong> {selectedEmail.reply_to || '—'}</div>
              </div>
              {selectedEmail.html ? (
                <div className="border rounded-md overflow-hidden bg-white">
                  <iframe
                    className="w-full h-[60vh]"
                    sandbox=""
                    srcDoc={selectedEmail.html}
                    title="Email preview"
                    referrerPolicy="no-referrer"
                  />
                </div>
              ) : (
                <pre className="text-xs bg-muted p-3 rounded-md whitespace-pre-wrap">
                  {selectedEmail.text || 'No content stored'}
                </pre>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
