/**
 * In-House Jobs Admin Dashboard
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
import { RefreshCw, XCircle, RotateCw, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'

interface JobInfo {
  id: string
  name: string
  status: 'pending' | 'active' | 'completed' | 'failed' | 'delayed'
  createdAt: string
  processedAt?: string
  finishedAt?: string
  attemptsMade: number
  maxAttempts: number
  error?: string
}

export function InhouseJobsAdmin() {
  const [projectId, setProjectId] = useState('')
  const [status, setStatus] = useState('all')
  const [jobs, setJobs] = useState<JobInfo[]>([])
  const [loading, setLoading] = useState(true)

  const [dlqJobs, setDlqJobs] = useState<JobInfo[]>([])
  const [dlqLoading, setDlqLoading] = useState(false)

  const abortRef = useRef<AbortController | null>(null)

  const fetchJobs = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    if (!projectId) {
      setJobs([])
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const params = new URLSearchParams({ projectId, limit: '50', offset: '0' })
      if (status !== 'all') params.set('status', status)

      const response = await fetch(`/api/admin/inhouse/jobs?${params.toString()}`, {
        signal: controller.signal,
      })
      if (!response.ok) throw new Error('Failed to fetch jobs')

      const data = await response.json()
      setJobs(data.data?.jobs || [])
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        console.error('Failed to fetch jobs:', error)
        toast.error('Failed to load jobs')
      }
    } finally {
      setLoading(false)
    }
  }, [projectId, status])

  const fetchDLQ = useCallback(async () => {
    if (!projectId) {
      setDlqJobs([])
      return
    }
    setDlqLoading(true)
    try {
      const params = new URLSearchParams({ projectId, limit: '50', offset: '0' })
      const response = await fetch(`/api/admin/inhouse/jobs/dlq?${params.toString()}`)
      if (!response.ok) throw new Error('Failed to fetch DLQ')
      const data = await response.json()
      setDlqJobs(data.data?.jobs || [])
    } catch (error) {
      console.error('Failed to fetch DLQ jobs:', error)
      toast.error('Failed to load DLQ jobs')
    } finally {
      setDlqLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    fetchJobs()
    fetchDLQ()
    return () => abortRef.current?.abort()
  }, [fetchJobs, fetchDLQ])

  const handleCancel = async (jobId: string) => {
    if (!projectId) return
    try {
      const response = await fetch(`/api/admin/inhouse/jobs/${jobId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })
      if (!response.ok) throw new Error('Failed to cancel job')
      toast.success('Job cancelled')
      fetchJobs()
    } catch (error) {
      console.error('Failed to cancel job:', error)
      toast.error('Failed to cancel job')
    }
  }

  const handleRetry = async (jobId: string) => {
    if (!projectId) return
    try {
      const response = await fetch(`/api/admin/inhouse/jobs/${jobId}/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })
      if (!response.ok) throw new Error('Failed to retry job')
      toast.success('Job retried')
      fetchJobs()
      fetchDLQ()
    } catch (error) {
      console.error('Failed to retry job:', error)
      toast.error('Failed to retry job')
    }
  }

  const handleRetryAllDLQ = async () => {
    if (!projectId) {
      toast.error('Project ID is required')
      return
    }

    try {
      const previewResp = await fetch('/api/admin/inhouse/jobs/dlq/retry-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })
      if (!previewResp.ok) throw new Error('Failed to preview retries')
      const preview = await previewResp.json()
      const count = preview.data?.wouldRetry ?? 0

      if (!count) {
        toast.info('No failed jobs to retry')
        return
      }

      const reason = window.prompt('Reason for retrying failed jobs (required):')
      if (!reason) return

      const confirm = window.prompt(`Type ${count} to confirm retrying all failed jobs:`)
      if (confirm !== String(count)) {
        toast.error('Confirmation count did not match')
        return
      }

      const response = await fetch('/api/admin/inhouse/jobs/dlq/retry-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, reason, confirmCount: count }),
      })
      if (!response.ok) throw new Error('Failed to retry DLQ jobs')
      toast.success('DLQ retry initiated')
      fetchJobs()
      fetchDLQ()
    } catch (error) {
      console.error('Failed to retry DLQ jobs:', error)
      toast.error('Failed to retry DLQ jobs')
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Jobs</CardTitle>
          <CardDescription>Inspect and operate on project jobs</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Input
            placeholder="Project ID (required)"
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
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="delayed">Delayed</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => { fetchJobs(); fetchDLQ() }}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Jobs</CardTitle>
          <CardDescription>Showing latest 50 jobs for the project</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : jobs.length === 0 ? (
            <div className="text-sm text-muted-foreground">No jobs found</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell>
                      <div className="font-medium">{job.name}</div>
                      <div className="text-xs text-muted-foreground">{job.id}</div>
                    </TableCell>
                    <TableCell><Badge variant="outline">{job.status}</Badge></TableCell>
                    <TableCell>{job.attemptsMade}/{job.maxAttempts}</TableCell>
                    <TableCell>{format(new Date(job.createdAt), 'PPp')}</TableCell>
                    <TableCell className="space-x-2">
                      <Button size="sm" variant="outline" onClick={() => handleRetry(job.id)}>
                        <RotateCw className="h-4 w-4 mr-1" />
                        Retry
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => handleCancel(job.id)}>
                        <XCircle className="h-4 w-4 mr-1" />
                        Cancel
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
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Dead Letter Queue
          </CardTitle>
          <CardDescription>Failed jobs awaiting retry</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={handleRetryAllDLQ}>
            <RotateCw className="h-4 w-4 mr-2" />
            Retry all failed jobs
          </Button>
        </CardContent>
        <CardContent>
          {dlqLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : dlqJobs.length === 0 ? (
            <div className="text-sm text-muted-foreground">No failed jobs in DLQ</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dlqJobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell>
                      <div className="font-medium">{job.name}</div>
                      <div className="text-xs text-muted-foreground">{job.id}</div>
                    </TableCell>
                    <TableCell>{job.attemptsMade}/{job.maxAttempts}</TableCell>
                    <TableCell>{format(new Date(job.createdAt), 'PPp')}</TableCell>
                    <TableCell className="max-w-[260px] truncate">{job.error || '—'}</TableCell>
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
