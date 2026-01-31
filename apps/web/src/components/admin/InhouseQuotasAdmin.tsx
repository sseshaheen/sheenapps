/**
 * In-House Quotas Admin
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

interface QuotasResponse {
  quotas: Record<string, any> | null
  overrides: any[]
  adjustments: any[]
}

export function InhouseQuotasAdmin() {
  const [projectId, setProjectId] = useState('')
  const [data, setData] = useState<QuotasResponse | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchData = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    try {
      const response = await fetch(`/api/admin/inhouse/quotas/projects/${projectId}`)
      if (!response.ok) throw new Error('Failed to fetch quotas')
      const result = await response.json()
      setData(result.data || null)
    } catch (error) {
      console.error('Failed to fetch quotas:', error)
      toast.error('Failed to load quotas')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    if (projectId) fetchData()
  }, [projectId, fetchData])

  const handleOverride = async () => {
    if (!projectId) return
    const metric = window.prompt('Metric (storage_bytes, email_sends, job_runs, ai_operations, exports):')
    if (!metric) return
    const newLimitRaw = window.prompt('New limit (number):')
    if (!newLimitRaw) return
    const newLimit = Number(newLimitRaw)
    if (!Number.isFinite(newLimit)) return
    const reason = window.prompt('Reason (required):')
    if (!reason) return

    try {
      const response = await fetch(`/api/admin/inhouse/quotas/projects/${projectId}/override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metric, newLimit, reason }),
      })
      if (!response.ok) throw new Error('Failed to set override')
      toast.success('Override created')
      fetchData()
    } catch (error) {
      console.error('Failed to set override:', error)
      toast.error('Failed to set override')
    }
  }

  const handleAdjustment = async () => {
    if (!projectId) return
    const metric = window.prompt('Metric (storage_bytes, email_sends, job_runs, ai_operations, exports):')
    if (!metric) return
    const deltaRaw = window.prompt('Delta (negative to credit):')
    if (!deltaRaw) return
    const delta = Number(deltaRaw)
    if (!Number.isFinite(delta)) return
    const reason = window.prompt('Reason (required):')
    if (!reason) return

    try {
      const response = await fetch(`/api/admin/inhouse/quotas/projects/${projectId}/adjust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metric, delta, reason }),
      })
      if (!response.ok) throw new Error('Failed to apply adjustment')
      toast.success('Adjustment recorded')
      fetchData()
    } catch (error) {
      console.error('Failed to apply adjustment:', error)
      toast.error('Failed to apply adjustment')
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Quota Management</CardTitle>
          <CardDescription>Adjust and override quotas per project</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Input
            placeholder="Project ID"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-[260px]"
          />
          <Button variant="outline" onClick={fetchData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Load
          </Button>
          <Button variant="outline" onClick={handleOverride}>Create override</Button>
          <Button variant="outline" onClick={handleAdjustment}>Add adjustment</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current Quotas</CardTitle>
          <CardDescription>Raw quota record from inhouse_quotas</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading...</div>
          ) : data?.quotas ? (
            <pre className="text-xs bg-muted p-3 rounded-md whitespace-pre-wrap">
              {JSON.stringify(data.quotas, null, 2)}
            </pre>
          ) : (
            <div className="text-sm text-muted-foreground">No quota record</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Overrides</CardTitle>
          <CardDescription>Recent quota overrides</CardDescription>
        </CardHeader>
        <CardContent>
          {data?.overrides?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Metric</TableHead>
                  <TableHead>New Limit</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.overrides.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.metric}</TableCell>
                    <TableCell>{row.new_limit}</TableCell>
                    <TableCell>{row.reason}</TableCell>
                    <TableCell>{new Date(row.created_at).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-sm text-muted-foreground">No overrides</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Adjustments</CardTitle>
          <CardDescription>Admin usage adjustments (events)</CardDescription>
        </CardHeader>
        <CardContent>
          {data?.adjustments?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Metric</TableHead>
                  <TableHead>Delta</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.adjustments.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.metric}</TableCell>
                    <TableCell>{row.delta}</TableCell>
                    <TableCell>{row.reason}</TableCell>
                    <TableCell>{new Date(row.created_at).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-sm text-muted-foreground">No adjustments</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
