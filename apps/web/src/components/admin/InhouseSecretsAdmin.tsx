/**
 * In-House Secrets Admin (read-only audit)
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
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
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

interface SecretRow {
  id: string
  project_id: string
  name: string
  description?: string | null
  category?: string | null
  tags?: string[] | null
  status: string
  key_version: number
  last_accessed_at?: string | null
  access_count?: number | null
  created_at: string
  updated_at: string
}

interface SecretsAuditRow {
  id: string
  created_at: string
  secret_id: string | null
  project_id: string
  secret_name: string
  actor_type: string
  actor_id?: string | null
  action: string
  success: boolean
  error_code?: string | null
}

export function InhouseSecretsAdmin() {
  const [projectId, setProjectId] = useState('')
  const [status, setStatus] = useState('')
  const [category, setCategory] = useState('')
  const [search, setSearch] = useState('')
  const [secrets, setSecrets] = useState<SecretRow[]>([])
  const [audit, setAudit] = useState<SecretsAuditRow[]>([])
  const [auditProjectId, setAuditProjectId] = useState('')
  const [auditSecretId, setAuditSecretId] = useState('')
  const [auditAction, setAuditAction] = useState('')
  const [loading, setLoading] = useState(false)

  const fetchSecrets = useCallback(async () => {
    const params = new URLSearchParams()
    if (projectId) params.set('projectId', projectId)
    if (status) params.set('status', status)
    if (category) params.set('category', category)
    if (search) params.set('search', search)

    const response = await fetch(`/api/admin/inhouse/secrets?${params.toString()}`)
    if (!response.ok) throw new Error('Failed to fetch secrets')
    const result = await response.json()
    setSecrets(result.data?.secrets || [])
  }, [projectId, status, category, search])

  const fetchAudit = useCallback(async () => {
    const params = new URLSearchParams()
    if (auditProjectId) params.set('projectId', auditProjectId)
    if (auditSecretId) params.set('secretId', auditSecretId)
    if (auditAction) params.set('action', auditAction)

    const response = await fetch(`/api/admin/inhouse/secrets/audit?${params.toString()}`)
    if (!response.ok) throw new Error('Failed to fetch audit log')
    const result = await response.json()
    setAudit(result.data?.entries || [])
  }, [auditProjectId, auditSecretId, auditAction])

  const refreshAll = useCallback(async () => {
    setLoading(true)
    try {
      await Promise.all([fetchSecrets(), fetchAudit()])
    } catch (error) {
      console.error('Failed to load secrets:', error)
      toast.error('Failed to load secrets')
    } finally {
      setLoading(false)
    }
  }, [fetchSecrets, fetchAudit])

  useEffect(() => {
    refreshAll()
  }, [refreshAll])

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Secrets Inventory</CardTitle>
          <CardDescription>Metadata only. Secret values are never exposed.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Input placeholder="Project ID" value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-[220px]" />
          <Input placeholder="Status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-[140px]" />
          <Input placeholder="Category" value={category} onChange={(e) => setCategory(e.target.value)} className="w-[140px]" />
          <Input placeholder="Search name" value={search} onChange={(e) => setSearch(e.target.value)} className="w-[200px]" />
          <Button variant="outline" onClick={fetchSecrets}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Load
          </Button>
        </CardContent>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading...</div>
          ) : secrets.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Access</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {secrets.map((secret) => (
                  <TableRow key={secret.id}>
                    <TableCell>{secret.name}</TableCell>
                    <TableCell className="truncate max-w-[140px]">{secret.project_id}</TableCell>
                    <TableCell>{secret.status}</TableCell>
                    <TableCell>{secret.category || '-'}</TableCell>
                    <TableCell>{secret.access_count || 0}</TableCell>
                    <TableCell>{new Date(secret.updated_at).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-sm text-muted-foreground">No secrets found</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Secrets Audit Log</CardTitle>
          <CardDescription>Read-only audit trail of secret operations</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Input placeholder="Project ID" value={auditProjectId} onChange={(e) => setAuditProjectId(e.target.value)} className="w-[220px]" />
          <Input placeholder="Secret ID" value={auditSecretId} onChange={(e) => setAuditSecretId(e.target.value)} className="w-[200px]" />
          <Input placeholder="Action" value={auditAction} onChange={(e) => setAuditAction(e.target.value)} className="w-[160px]" />
          <Button variant="outline" onClick={fetchAudit}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Load
          </Button>
        </CardContent>
        <CardContent>
          {audit.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Secret</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Success</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {audit.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.secret_name}</TableCell>
                    <TableCell className="truncate max-w-[140px]">{row.project_id}</TableCell>
                    <TableCell>{row.action}</TableCell>
                    <TableCell>{row.actor_type}</TableCell>
                    <TableCell>{row.success ? 'yes' : 'no'}</TableCell>
                    <TableCell>{new Date(row.created_at).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-sm text-muted-foreground">No audit entries</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
