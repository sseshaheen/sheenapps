/**
 * In-House Request Replay Admin
 *
 * Allows admins to find failed requests and replay them for debugging.
 *
 * Security Model:
 * 1. Route-level replayability classification
 * 2. Mandatory preview for side-effect replays
 * 3. Per-admin rate limiting
 * 4. Full audit trail
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Search,
  RefreshCw,
  Play,
  Eye,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  Filter,
  Copy,
} from 'lucide-react'
import { toast } from 'sonner'

// =============================================================================
// TYPES
// =============================================================================

interface RequestRecord {
  id: string
  correlationId: string
  projectId: string
  route: string
  method: string
  requestBody?: Record<string, unknown>
  requestHeaders?: Record<string, string>
  responseStatus?: number
  responseBody?: Record<string, unknown>
  errorCode?: string
  errorMessage?: string
  replayable: boolean
  sideEffects: 'none' | 'low' | 'high'
  createdAt: string
}

interface ReplayPreview {
  wouldExecute: {
    method: string
    path: string
    body?: Record<string, unknown>
    headers?: Record<string, string>
  }
  sideEffects: 'none' | 'low' | 'high'
  warnings: string[]
  previewToken: string
}

interface ReplayResult {
  success: boolean
  newCorrelationId: string
  idempotencyKey: string
  responseStatus?: number
  responseBody?: Record<string, unknown>
  error?: string
  durationMs: number
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getSideEffectsBadge(sideEffects: 'none' | 'low' | 'high') {
  switch (sideEffects) {
    case 'none':
      return <Badge variant="outline" className="bg-green-500/10 text-green-700 dark:text-green-300">None</Badge>
    case 'low':
      return <Badge variant="outline" className="bg-blue-500/10 text-blue-700 dark:text-blue-300">Low</Badge>
    case 'high':
      return <Badge variant="outline" className="bg-red-500/10 text-red-700 dark:text-red-300">High</Badge>
  }
}

function getStatusBadge(errorCode?: string) {
  if (errorCode) {
    return <Badge variant="destructive">{errorCode}</Badge>
  }
  return <Badge variant="outline" className="bg-green-500/10 text-green-700 dark:text-green-300">Success</Badge>
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString()
}

// =============================================================================
// COMPONENT
// =============================================================================

export function InhouseRequestReplay() {
  // Search state
  const [correlationId, setCorrelationId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [service, setService] = useState('')
  const [status, setStatus] = useState<'all' | 'success' | 'error'>('all')
  const [replayableOnly, setReplayableOnly] = useState(true)

  // Results state
  const [requests, setRequests] = useState<RequestRecord[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const pageSize = 20

  // Detail dialog state
  const [selectedRequest, setSelectedRequest] = useState<RequestRecord | null>(null)
  const [detailDialogOpen, setDetailDialogOpen] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)

  // Preview dialog state
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false)
  const [preview, setPreview] = useState<ReplayPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [replayReason, setReplayReason] = useState('')

  // Replay result state
  const [replayResult, setReplayResult] = useState<ReplayResult | null>(null)
  const [replayLoading, setReplayLoading] = useState(false)

  // Search requests
  // Accept optional page parameter to avoid closure issues with pagination
  const searchRequests = useCallback(async (opts: { resetPage?: boolean; targetPage?: number } = {}) => {
    const resetPage = opts.resetPage ?? true
    const effectivePage = resetPage ? 1 : (opts.targetPage ?? page)

    setLoading(true)
    if (resetPage) setPage(1)

    try {
      const params = new URLSearchParams()
      if (correlationId) params.set('correlationId', correlationId)
      if (projectId) params.set('projectId', projectId)
      if (service) params.set('service', service)
      if (status !== 'all') params.set('status', status)
      params.set('replayableOnly', String(replayableOnly))
      params.set('limit', String(pageSize))
      params.set('offset', String((effectivePage - 1) * pageSize))

      const response = await fetch(`/api/admin/inhouse/support/replay/requests?${params.toString()}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to search requests')
      }

      setRequests(data.requests || [])
      setTotal(data.total || 0)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to search requests')
    } finally {
      setLoading(false)
    }
  }, [correlationId, projectId, service, status, replayableOnly, page])

  // Load request details
  const loadRequestDetails = async (req: RequestRecord) => {
    setSelectedRequest(req)
    setDetailDialogOpen(true)
    setDetailLoading(true)

    try {
      const response = await fetch(`/api/admin/inhouse/support/replay/requests/${req.correlationId}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load request details')
      }

      setSelectedRequest(data.request)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load request details')
    } finally {
      setDetailLoading(false)
    }
  }

  // Preview replay
  const handlePreview = async () => {
    if (!selectedRequest) return

    setPreviewLoading(true)
    try {
      const response = await fetch(`/api/admin/inhouse/support/replay/requests/${selectedRequest.correlationId}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to preview replay')
      }

      setPreview(data)
      setDetailDialogOpen(false)
      setPreviewDialogOpen(true)
      setReplayReason('')
      setReplayResult(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to preview replay')
    } finally {
      setPreviewLoading(false)
    }
  }

  // Execute replay
  const handleReplay = async () => {
    if (!selectedRequest || !preview) return

    if (replayReason.length < 10) {
      toast.error('Reason must be at least 10 characters')
      return
    }

    setReplayLoading(true)
    try {
      const response = await fetch(`/api/admin/inhouse/support/replay/requests/${selectedRequest.correlationId}/replay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: replayReason,
          previewToken: preview.previewToken,
        }),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to execute replay')
      }

      setReplayResult(data)
      toast.success('Replay executed successfully')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to execute replay')
    } finally {
      setReplayLoading(false)
    }
  }

  // Copy to clipboard
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    toast.success(`${label} copied to clipboard`)
  }

  // Initial load
  useEffect(() => {
    searchRequests()
  }, [])

  const totalPages = Math.ceil(total / pageSize)

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Request Replay</h2>
          <p className="text-muted-foreground">
            Find failed requests and replay them for debugging
          </p>
        </div>

        {/* Security Notice */}
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Side Effects Warning</AlertTitle>
          <AlertDescription>
            Replays may create or modify data. High side-effect replays require preview before execution.
            All replays are fully audited.
          </AlertDescription>
        </Alert>

        {/* Search Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Search Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Correlation ID</label>
                <Input
                  placeholder="Search by correlation ID..."
                  value={correlationId}
                  onChange={(e) => setCorrelationId(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Project ID</label>
                <Input
                  placeholder="Filter by project..."
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Service</label>
                <Select value={service} onValueChange={setService}>
                  <SelectTrigger>
                    <SelectValue placeholder="All services" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All services</SelectItem>
                    <SelectItem value="storage">Storage</SelectItem>
                    <SelectItem value="jobs">Jobs</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="notifications">Notifications</SelectItem>
                    <SelectItem value="analytics">Analytics</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Status</label>
                <Select value={status} onValueChange={(v) => setStatus(v as 'all' | 'success' | 'error')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="error">Errors only</SelectItem>
                    <SelectItem value="success">Success only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-4 mt-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={replayableOnly}
                  onChange={(e) => setReplayableOnly(e.target.checked)}
                  className="rounded"
                />
                Show only replayable requests
              </label>
              <div className="flex-1" />
              <Button onClick={() => searchRequests()} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
                Search
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Results Table */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                {loading ? 'Searching...' : `${total} request${total !== 1 ? 's' : ''} found`}
              </CardTitle>
              <Button variant="outline" size="sm" onClick={() => searchRequests({ resetPage: false })} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {requests.length === 0 && !loading ? (
              <div className="text-center py-8 text-muted-foreground">
                No requests found. Try adjusting your search filters.
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Correlation ID</TableHead>
                      <TableHead>Route</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Side Effects</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {requests.map((req) => (
                      <TableRow key={req.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <code className="text-xs font-mono bg-muted px-1 py-0.5 rounded">
                              {req.correlationId.substring(0, 8)}...
                            </code>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => copyToClipboard(req.correlationId, 'Correlation ID')}
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Copy full ID</TooltipContent>
                            </Tooltip>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-sm">
                            <Badge variant="outline" className="mr-2">{req.method}</Badge>
                            {req.route.length > 40 ? `${req.route.substring(0, 40)}...` : req.route}
                          </span>
                        </TableCell>
                        <TableCell>{getStatusBadge(req.errorCode)}</TableCell>
                        <TableCell>{getSideEffectsBadge(req.sideEffects)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(req.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => loadRequestDetails(req)}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>View Details</TooltipContent>
                            </Tooltip>
                            {req.replayable && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      setSelectedRequest(req)
                                      handlePreview()
                                    }}
                                  >
                                    <Play className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Preview Replay</TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <div className="text-sm text-muted-foreground">
                      Page {page} of {totalPages}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page === 1 || loading}
                        onClick={() => {
                          const nextPage = page - 1
                          setPage(nextPage)
                          searchRequests({ resetPage: false, targetPage: nextPage })
                        }}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page >= totalPages || loading}
                        onClick={() => {
                          const nextPage = page + 1
                          setPage(nextPage)
                          searchRequests({ resetPage: false, targetPage: nextPage })
                        }}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Detail Dialog */}
        <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
          <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Request Details</DialogTitle>
              <DialogDescription>
                {selectedRequest?.correlationId}
              </DialogDescription>
            </DialogHeader>

            {detailLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : selectedRequest && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground">Method</div>
                    <Badge variant="outline">{selectedRequest.method}</Badge>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Status</div>
                    {getStatusBadge(selectedRequest.errorCode)}
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Side Effects</div>
                    {getSideEffectsBadge(selectedRequest.sideEffects)}
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Replayable</div>
                    {selectedRequest.replayable ? (
                      <Badge variant="outline" className="bg-green-500/10 text-green-700">Yes</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-red-500/10 text-red-700">No</Badge>
                    )}
                  </div>
                </div>

                <div>
                  <div className="text-sm text-muted-foreground mb-1">Route</div>
                  <code className="text-sm font-mono bg-muted p-2 rounded block">
                    {selectedRequest.route}
                  </code>
                </div>

                {selectedRequest.errorCode && (
                  <Alert variant="destructive">
                    <XCircle className="h-4 w-4" />
                    <AlertTitle>{selectedRequest.errorCode}</AlertTitle>
                    <AlertDescription>{selectedRequest.errorMessage}</AlertDescription>
                  </Alert>
                )}

                {selectedRequest.requestBody && (
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Request Body (scrubbed)</div>
                    <pre className="text-xs font-mono bg-muted p-2 rounded overflow-x-auto max-h-40">
                      {JSON.stringify(selectedRequest.requestBody, null, 2)}
                    </pre>
                  </div>
                )}

                {selectedRequest.responseBody && (
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Response Body</div>
                    <pre className="text-xs font-mono bg-muted p-2 rounded overflow-x-auto max-h-40">
                      {JSON.stringify(selectedRequest.responseBody, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setDetailDialogOpen(false)}>
                Close
              </Button>
              {selectedRequest?.replayable && (
                <Button onClick={handlePreview} disabled={previewLoading}>
                  {previewLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
                  Preview Replay
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Preview & Replay Dialog */}
        <Dialog open={previewDialogOpen} onOpenChange={setPreviewDialogOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
                Replay Preview
              </DialogTitle>
              <DialogDescription>
                Review the request that will be executed
              </DialogDescription>
            </DialogHeader>

            {preview && (
              <div className="space-y-4">
                {/* Warnings */}
                {preview.warnings.length > 0 && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Warnings</AlertTitle>
                    <AlertDescription>
                      <ul className="list-disc list-inside">
                        {preview.warnings.map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}

                {/* Request Preview */}
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Request to Execute</div>
                  <div className="bg-muted p-3 rounded space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{preview.wouldExecute.method}</Badge>
                      <code className="text-sm font-mono">{preview.wouldExecute.path}</code>
                    </div>
                    {preview.wouldExecute.body && (
                      <pre className="text-xs font-mono overflow-x-auto max-h-32">
                        {JSON.stringify(preview.wouldExecute.body, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>

                {/* Replay Result */}
                {replayResult && (
                  <Alert className={replayResult.success ? 'border-green-500' : 'border-red-500'}>
                    {replayResult.success ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                    <AlertTitle>{replayResult.success ? 'Replay Successful' : 'Replay Failed'}</AlertTitle>
                    <AlertDescription>
                      <div className="space-y-1 mt-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">New Correlation ID:</span>
                          <code className="text-xs font-mono bg-background px-1 py-0.5 rounded">
                            {replayResult.newCorrelationId}
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => copyToClipboard(replayResult.newCorrelationId, 'New Correlation ID')}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Duration: {replayResult.durationMs}ms
                        </div>
                      </div>
                    </AlertDescription>
                  </Alert>
                )}

                {/* Reason Input */}
                {!replayResult && (
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Reason for Replay *</label>
                    <Textarea
                      placeholder="Describe why you need to replay this request (minimum 10 characters)"
                      value={replayReason}
                      onChange={(e) => setReplayReason(e.target.value)}
                      rows={2}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      This reason will be recorded in the audit log
                    </p>
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setPreviewDialogOpen(false)}>
                {replayResult ? 'Close' : 'Cancel'}
              </Button>
              {!replayResult && (
                <Button
                  onClick={handleReplay}
                  disabled={replayLoading || replayReason.length < 10}
                >
                  {replayLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Play className="h-4 w-4 mr-2" />
                  )}
                  Execute Replay
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  )
}
