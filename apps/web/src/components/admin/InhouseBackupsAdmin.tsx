/**
 * In-House Backups Admin Dashboard
 * Manage backups and restores across projects
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
import { RefreshCw, Database, RotateCw } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'

interface BackupRow {
  id: string
  project_id: string
  project_name?: string
  owner_email?: string
  schema_name: string
  format: string
  size_bytes: number
  checksum_sha256: string
  r2_bucket: string
  r2_key: string
  created_at: string
  created_by: string
  reason: string
  retention_expires_at: string
  status: string
  error: string | null
  completed_at: string | null
}

interface RestoreRow {
  id: string
  project_id: string
  backup_id: string
  status: string
  created_at: string
  started_at: string | null
  completed_at: string | null
  initiated_by: string | null
  initiated_by_type: string
  error: string | null
}

export function InhouseBackupsAdmin() {
  const [projectId, setProjectId] = useState('')
  const [status, setStatus] = useState('all')
  const [backups, setBackups] = useState<BackupRow[]>([])
  const [restores, setRestores] = useState<RestoreRow[]>([])
  const [loading, setLoading] = useState(true)
  const [restoresLoading, setRestoresLoading] = useState(true)

  const abortRef = useRef<AbortController | null>(null)
  const restoreAbortRef = useRef<AbortController | null>(null)

  const fetchBackups = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '50', offset: '0' })
      if (projectId) params.set('projectId', projectId)
      if (status !== 'all') params.set('status', status)

      const response = await fetch(`/api/admin/inhouse/backups?${params.toString()}`, {
        signal: controller.signal,
      })
      if (!response.ok) throw new Error('Failed to fetch backups')

      const data = await response.json()
      setBackups(data.data?.backups || [])
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        console.error('Failed to fetch backups:', error)
        toast.error('Failed to load backups')
      }
    } finally {
      setLoading(false)
    }
  }, [projectId, status])

  const fetchRestores = useCallback(async () => {
    restoreAbortRef.current?.abort()
    const controller = new AbortController()
    restoreAbortRef.current = controller

    setRestoresLoading(true)
    try {
      const params = new URLSearchParams({ limit: '50', offset: '0' })
      if (projectId) params.set('projectId', projectId)
      if (status !== 'all') params.set('status', status)

      const response = await fetch(`/api/admin/inhouse/restores?${params.toString()}`, {
        signal: controller.signal,
      })
      if (!response.ok) throw new Error('Failed to fetch restores')

      const data = await response.json()
      setRestores(data.data?.restores || [])
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        console.error('Failed to fetch restores:', error)
        toast.error('Failed to load restores')
      }
    } finally {
      setRestoresLoading(false)
    }
  }, [projectId, status])

  useEffect(() => {
    fetchBackups()
    fetchRestores()
    return () => {
      abortRef.current?.abort()
      restoreAbortRef.current?.abort()
    }
  }, [fetchBackups, fetchRestores])

  const handleTriggerBackup = async () => {
    if (!projectId) {
      toast.error('Project ID is required')
      return
    }
    try {
      const response = await fetch('/api/admin/inhouse/backups/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, reason: 'manual' }),
      })
      if (!response.ok) throw new Error('Failed to trigger backup')
      toast.success('Backup triggered')
      fetchBackups()
    } catch (error) {
      console.error('Failed to trigger backup:', error)
      toast.error('Failed to trigger backup')
    }
  }

  const handleRestore = async (backupId: string) => {
    if (!confirm('Initiate restore from this backup?')) return
    const reason = window.prompt('Reason for restore (required):')
    if (!reason) return
    try {
      const response = await fetch(`/api/admin/inhouse/backups/${backupId}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      if (!response.ok) throw new Error('Failed to initiate restore')
      toast.success('Restore initiated')
      fetchRestores()
    } catch (error) {
      console.error('Failed to initiate restore:', error)
      toast.error('Failed to initiate restore')
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
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Backup Controls
          </CardTitle>
          <CardDescription>Filter by project and trigger manual backups</CardDescription>
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
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="deleted">Deleted</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => { fetchBackups(); fetchRestores() }}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={handleTriggerBackup}>
            Trigger Backup
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Backups</CardTitle>
          <CardDescription>Recent backups across projects</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : backups.length === 0 ? (
            <div className="text-sm text-muted-foreground">No backups found</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {backups.map((backup) => (
                  <TableRow key={backup.id}>
                    <TableCell>
                      <div className="font-medium">{backup.project_name || backup.project_id}</div>
                      <div className="text-xs text-muted-foreground">{backup.project_id}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{backup.status}</Badge>
                    </TableCell>
                    <TableCell>{formatBytes(backup.size_bytes)}</TableCell>
                    <TableCell>{backup.reason}</TableCell>
                    <TableCell>{format(new Date(backup.created_at), 'PPp')}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => handleRestore(backup.id)}>
                        <RotateCw className="h-4 w-4 mr-2" />
                        Restore
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
          <CardTitle>Restores</CardTitle>
          <CardDescription>Recent restore operations</CardDescription>
        </CardHeader>
        <CardContent>
          {restoresLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : restores.length === 0 ? (
            <div className="text-sm text-muted-foreground">No restores found</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Backup</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {restores.map((restore) => (
                  <TableRow key={restore.id}>
                    <TableCell>{restore.project_id}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{restore.status}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">{restore.backup_id}</TableCell>
                    <TableCell>{format(new Date(restore.created_at), 'PPp')}</TableCell>
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
