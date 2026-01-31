/**
 * In-House Projects List Component
 * Display and manage In-House Mode SDK projects
 */

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
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
  DialogFooter,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  FolderOpen,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Eye,
  Pause,
  Play,
  Mail,
  Clock,
  HardDrive,
} from 'lucide-react'
import { toast } from 'sonner'
import { format, formatDistanceToNow } from 'date-fns'
import { useRouter } from 'next/navigation'

// Types
interface InhouseProject {
  id: string
  name: string
  created_at: string
  status: string
  owner_email: string
  owner_name: string | null
  plan_name: string | null
  storage_bytes: number
  job_runs: number
  email_sends: number
}

export function InhouseProjectsList() {
  const router = useRouter()
  const [projects, setProjects] = useState<InhouseProject[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [plan, setPlan] = useState('all')
  const [status, setStatus] = useState('all')
  const [sortBy, setSortBy] = useState('created_at')
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const pageSize = 20

  // AbortController for unmount-safe fetches
  const abortRef = useRef<AbortController | null>(null)

  // Action dialog state
  const [actionDialog, setActionDialog] = useState<{
    open: boolean
    type: 'suspend' | 'unsuspend'
    project: InhouseProject | null
    reason: string
    loading: boolean
  }>({
    open: false,
    type: 'suspend',
    project: null,
    reason: '',
    loading: false,
  })

  // Fetch projects with AbortController
  const fetchProjects = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    try {
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(page * pageSize),
        sortBy,
        sortDir: 'desc',
      })
      if (search) params.set('search', search)
      if (plan !== 'all') params.set('plan', plan)
      if (status !== 'all') params.set('status', status)

      const response = await fetch(`/api/admin/inhouse/projects?${params}`, {
        signal: controller.signal,
      })
      if (!response.ok) throw new Error('Failed to fetch projects')

      const data = await response.json()
      setProjects(data.data?.projects || [])
      setTotal(data.data?.total || 0)
      setHasMore(data.data?.hasMore || false)
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        console.error('Failed to fetch projects:', error)
        toast.error('Failed to load projects')
      }
    } finally {
      setLoading(false)
    }
  }, [page, search, plan, status, sortBy])

  useEffect(() => {
    fetchProjects()
    return () => abortRef.current?.abort()
  }, [fetchProjects])

  // Handle search with debounce
  const [searchInput, setSearchInput] = useState('')
  useEffect(() => {
    const timeout = setTimeout(() => {
      setSearch(searchInput)
      setPage(0)
    }, 300)
    return () => clearTimeout(timeout)
  }, [searchInput])

  // Format bytes
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
  }

  // Handle project action (suspend/unsuspend)
  const handleAction = async () => {
    if (!actionDialog.project || !actionDialog.reason.trim()) {
      toast.error('Please provide a reason')
      return
    }

    setActionDialog(prev => ({ ...prev, loading: true }))

    try {
      const endpoint = actionDialog.type === 'suspend'
        ? `/api/admin/inhouse/projects/${actionDialog.project.id}/suspend`
        : `/api/admin/inhouse/projects/${actionDialog.project.id}/unsuspend`

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: actionDialog.reason }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || `Failed to ${actionDialog.type} project`)
      }

      toast.success(
        actionDialog.type === 'suspend'
          ? 'Project suspended successfully'
          : 'Project unsuspended successfully'
      )

      setActionDialog({
        open: false,
        type: 'suspend',
        project: null,
        reason: '',
        loading: false,
      })

      fetchProjects()
    } catch (error) {
      console.error(`Failed to ${actionDialog.type} project:`, error)
      toast.error(error instanceof Error ? error.message : `Failed to ${actionDialog.type} project`)
      setActionDialog(prev => ({ ...prev, loading: false }))
    }
  }

  // Status badge
  const getStatusBadge = (projectStatus: string) => {
    switch (projectStatus) {
      case 'active':
        return <Badge variant="default" className="bg-green-500">Active</Badge>
      case 'suspended':
        return <Badge variant="destructive">Suspended</Badge>
      case 'deleted':
        return <Badge variant="secondary">Deleted</Badge>
      default:
        return <Badge variant="outline">{projectStatus}</Badge>
    }
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:gap-6">
            {/* Search */}
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by name, ID, or owner email..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            {/* Filters */}
            <div className="flex gap-2">
              <Select value={plan} onValueChange={(v) => { setPlan(v); setPage(0); }}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="Plan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Plans</SelectItem>
                  <SelectItem value="free">Free</SelectItem>
                  <SelectItem value="starter">Starter</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                  <SelectItem value="enterprise">Enterprise</SelectItem>
                </SelectContent>
              </Select>

              <Select value={status} onValueChange={(v) => { setStatus(v); setPage(0); }}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>

              <Select value={sortBy} onValueChange={(v) => { setSortBy(v); setPage(0); }}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Sort By" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="created_at">Created Date</SelectItem>
                  <SelectItem value="last_activity">Last Activity</SelectItem>
                  <SelectItem value="storage_bytes">Storage</SelectItem>
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                size="icon"
                onClick={fetchProjects}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Projects Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            In-House Projects
          </CardTitle>
          <CardDescription>
            {total} project{total !== 1 ? 's' : ''} found
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && projects.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <FolderOpen className="h-12 w-12 mb-2" />
              <p>No projects found</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Project</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Usage</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projects.map((project) => (
                    <TableRow key={project.id}>
                      <TableCell>
                        <div className="font-medium">{project.name}</div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {project.id.slice(0, 8)}...
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{project.owner_email}</div>
                        {project.owner_name && (
                          <div className="text-xs text-muted-foreground">
                            {project.owner_name}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {project.plan_name || 'Free'}
                        </Badge>
                      </TableCell>
                      <TableCell>{getStatusBadge(project.status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end gap-1 text-xs">
                          <span className="flex items-center gap-1">
                            <HardDrive className="h-3 w-3" />
                            {formatBytes(project.storage_bytes)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {project.job_runs.toLocaleString()} jobs
                          </span>
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {project.email_sends.toLocaleString()} emails
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {format(new Date(project.created_at), 'MMM d, yyyy')}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(project.created_at), { addSuffix: true })}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => router.push(`/admin/inhouse/projects/${project.id}`)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {project.status === 'active' ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setActionDialog({
                                open: true,
                                type: 'suspend',
                                project,
                                reason: '',
                                loading: false,
                              })}
                            >
                              <Pause className="h-4 w-4 text-amber-500" />
                            </Button>
                          ) : project.status === 'suspended' ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setActionDialog({
                                open: true,
                                type: 'unsuspend',
                                project,
                                reason: '',
                                loading: false,
                              })}
                            >
                              <Play className="h-4 w-4 text-green-500" />
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              <div className="flex items-center justify-between pt-4">
                <div className="text-sm text-muted-foreground">
                  Showing {page * pageSize + 1}-{Math.min((page + 1) * pageSize, total)} of {total}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(p => p + 1)}
                    disabled={!hasMore}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Suspend/Unsuspend Dialog */}
      <Dialog
        open={actionDialog.open}
        onOpenChange={(open) => {
          if (!open && !actionDialog.loading) {
            setActionDialog({
              open: false,
              type: 'suspend',
              project: null,
              reason: '',
              loading: false,
            })
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionDialog.type === 'suspend' ? 'Suspend Project' : 'Unsuspend Project'}
            </DialogTitle>
            <DialogDescription>
              {actionDialog.type === 'suspend'
                ? 'Suspending a project will prevent all API access. The owner will be notified.'
                : 'Unsuspending will restore full API access to the project.'}
            </DialogDescription>
          </DialogHeader>

          {actionDialog.project && (
            <div className="py-4">
              <div className="rounded-md bg-muted p-3 mb-4">
                <div className="font-medium">{actionDialog.project.name}</div>
                <div className="text-sm text-muted-foreground">
                  {actionDialog.project.owner_email}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="reason">Reason (required)</Label>
                <Textarea
                  id="reason"
                  placeholder="Enter the reason for this action..."
                  value={actionDialog.reason}
                  onChange={(e) => setActionDialog(prev => ({ ...prev, reason: e.target.value }))}
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setActionDialog(prev => ({ ...prev, open: false }))}
              disabled={actionDialog.loading}
            >
              Cancel
            </Button>
            <Button
              variant={actionDialog.type === 'suspend' ? 'destructive' : 'default'}
              onClick={handleAction}
              disabled={actionDialog.loading || !actionDialog.reason.trim()}
            >
              {actionDialog.loading ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                  Processing...
                </>
              ) : actionDialog.type === 'suspend' ? (
                'Suspend Project'
              ) : (
                'Unsuspend Project'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
