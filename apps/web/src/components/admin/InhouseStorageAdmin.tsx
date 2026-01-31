/**
 * In-House Storage Admin Dashboard
 */

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { ReasonDialog, CopyButton, AdminPagination } from './shared'
import { usePagination } from './hooks/usePagination'
import { cn } from '@/lib/utils'

interface StorageUsageRow {
  project_id: string
  project_name?: string
  storage_size_used_bytes: number
  storage_size_limit_bytes: number
  updated_at: string
}

interface FileRow {
  path: string
  size: number
  contentType?: string
  lastModified: string
  etag?: string
  metadata?: Record<string, string>
}

export function InhouseStorageAdmin() {
  const [projectId, setProjectId] = useState('')
  const [prefix, setPrefix] = useState('')
  const [usage, setUsage] = useState<StorageUsageRow[]>([])
  const [files, setFiles] = useState<FileRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filesLoading, setFilesLoading] = useState(false)

  // Dialog state for delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [fileToDelete, setFileToDelete] = useState<string | null>(null)

  const usageAbortRef = useRef<AbortController | null>(null)
  const filesAbortRef = useRef<AbortController | null>(null)

  // Pagination for usage and files tables
  const usagePagination = usePagination(usage, { pageSize: 10 })
  const filesPagination = usePagination(files, { pageSize: 25 })

  const fetchUsage = useCallback(async () => {
    usageAbortRef.current?.abort()
    const controller = new AbortController()
    usageAbortRef.current = controller

    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '50', offset: '0' })
      if (projectId) params.set('projectId', projectId)

      const response = await fetch(`/api/admin/inhouse/storage/usage?${params.toString()}`, {
        signal: controller.signal,
      })
      if (!response.ok) throw new Error('Failed to fetch usage')

      const data = await response.json()
      setUsage(data.data?.usage || [])
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        console.error('Failed to fetch usage:', error)
        toast.error('Failed to load storage usage')
      }
    } finally {
      setLoading(false)
    }
  }, [projectId])

  const fetchFiles = useCallback(async () => {
    if (!projectId) {
      setFiles([])
      return
    }

    filesAbortRef.current?.abort()
    const controller = new AbortController()
    filesAbortRef.current = controller

    setFilesLoading(true)
    try {
      const params = new URLSearchParams({ limit: '100' })
      if (prefix) params.set('prefix', prefix)

      const response = await fetch(`/api/admin/inhouse/projects/${projectId}/storage/files?${params.toString()}`, {
        signal: controller.signal,
      })
      if (!response.ok) throw new Error('Failed to fetch files')

      const data = await response.json()
      setFiles(data.data?.files || [])
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        console.error('Failed to fetch files:', error)
        toast.error('Failed to load files')
      }
    } finally {
      setFilesLoading(false)
    }
  }, [projectId, prefix])

  useEffect(() => {
    fetchUsage()
    return () => usageAbortRef.current?.abort()
  }, [fetchUsage])

  useEffect(() => {
    fetchFiles()
    return () => filesAbortRef.current?.abort()
  }, [fetchFiles])

  const openDeleteDialog = (path: string) => {
    setFileToDelete(path)
    setDeleteDialogOpen(true)
  }

  const handleDeleteFile = async (reason: string) => {
    if (!projectId || !fileToDelete) return

    try {
      const response = await fetch(`/api/admin/inhouse/projects/${projectId}/storage/files`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: [fileToDelete], reason }),
      })
      if (!response.ok) throw new Error('Failed to delete file')
      toast.success('File deleted')
      setDeleteDialogOpen(false)
      setFileToDelete(null)
      fetchFiles()
      fetchUsage()
    } catch (error) {
      console.error('Failed to delete file:', error)
      toast.error('Failed to delete file')
    }
  }

  const formatBytes = (bytes: number) => {
    if (!bytes) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Storage Usage</CardTitle>
          <CardDescription>Per‑project usage and limits</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Input
            placeholder="Project ID (optional filter)"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-[260px]"
          />
          <Button variant="outline" onClick={fetchUsage} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
            Refresh
          </Button>
        </CardContent>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : usage.length === 0 ? (
            <div className="text-sm text-muted-foreground">No usage data</div>
          ) : (
            <div className="space-y-4">
              <div className="w-full overflow-x-auto">
                <Table className="min-w-[600px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Project</TableHead>
                      <TableHead>Used</TableHead>
                      <TableHead>Limit</TableHead>
                      <TableHead>Updated</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usagePagination.pageItems.map((row) => (
                      <TableRow key={row.project_id}>
                        <TableCell>
                          <div className="font-medium">{row.project_name || row.project_id}</div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <span className="truncate max-w-[180px]">{row.project_id}</span>
                            <CopyButton value={row.project_id} size="icon" showToast={false} className="h-5 w-5" />
                          </div>
                        </TableCell>
                        <TableCell>{formatBytes(row.storage_size_used_bytes)}</TableCell>
                        <TableCell>{formatBytes(row.storage_size_limit_bytes)}</TableCell>
                        <TableCell>{format(new Date(row.updated_at), 'PPp')}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <AdminPagination
                page={usagePagination.page}
                totalPages={usagePagination.totalPages}
                totalItems={usagePagination.totalItems}
                pageSize={usagePagination.pageSize}
                hasPrevious={usagePagination.hasPrevious}
                hasNext={usagePagination.hasNext}
                onPageChange={usagePagination.goToPage}
                onPageSizeChange={usagePagination.setPageSize}
                pageSizeOptions={[10, 25, 50]}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Files</CardTitle>
          <CardDescription>List and delete project files</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Input
            placeholder="Project ID (required)"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-[260px]"
          />
          <Input
            placeholder="Prefix (optional)"
            value={prefix}
            onChange={(e) => setPrefix(e.target.value)}
            className="w-[260px]"
          />
          <Button variant="outline" onClick={fetchFiles} disabled={filesLoading}>
            <RefreshCw className={cn('h-4 w-4 mr-2', filesLoading && 'animate-spin')} />
            Refresh
          </Button>
        </CardContent>
        <CardContent>
          {filesLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : files.length === 0 ? (
            <div className="text-sm text-muted-foreground">No files found</div>
          ) : (
            <div className="space-y-4">
              <div className="w-full overflow-x-auto">
                <Table className="min-w-[700px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Path</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Last Modified</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filesPagination.pageItems.map((file) => (
                      <TableRow key={file.path}>
                        <TableCell className="max-w-[420px] truncate">{file.path}</TableCell>
                        <TableCell>{formatBytes(file.size)}</TableCell>
                        <TableCell>{format(new Date(file.lastModified), 'PPp')}</TableCell>
                        <TableCell>
                          <Button size="sm" variant="destructive" onClick={() => openDeleteDialog(file.path)}>
                            <Trash2 className="h-4 w-4 mr-1" />
                            Delete
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <AdminPagination
                page={filesPagination.page}
                totalPages={filesPagination.totalPages}
                totalItems={filesPagination.totalItems}
                pageSize={filesPagination.pageSize}
                hasPrevious={filesPagination.hasPrevious}
                hasNext={filesPagination.hasNext}
                onPageChange={filesPagination.goToPage}
                onPageSizeChange={filesPagination.setPageSize}
                pageSizeOptions={[10, 25, 50, 100]}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <ReasonDialog
        open={deleteDialogOpen}
        title="Delete File"
        description={`Are you sure you want to delete "${fileToDelete}"? This action cannot be undone.`}
        placeholder="Reason for deletion..."
        confirmText="Delete"
        confirmVariant="destructive"
        onClose={() => {
          setDeleteDialogOpen(false)
          setFileToDelete(null)
        }}
        onConfirm={handleDeleteFile}
      />
    </div>
  )
}
