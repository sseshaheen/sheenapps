/**
 * Feature Flags Management Component
 * Manage kill switches and targeted feature releases
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import {
  AlertTriangle,
  CheckCircle2,
  Edit2,
  Flag,
  History,
  Plus,
  Power,
  RefreshCw,
  Shield,
  Trash2,
  Users,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { format, formatDistanceToNow } from 'date-fns'

// Types
interface FeatureFlag {
  id: string
  name: string
  description: string | null
  status: 'on' | 'off'
  targetUserIds: string[]
  targetPlans: string[]
  isKillSwitch: boolean
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

interface FeatureFlagAudit {
  id: string
  flagId: string
  flagName: string
  action: 'created' | 'updated' | 'toggled' | 'deleted'
  oldValue: Record<string, any> | null
  newValue: Record<string, any> | null
  reason: string
  changedBy: string | null
  changedByEmail: string | null
  changedAt: string
}

interface FeatureFlagsManagementProps {
  adminId: string
  adminEmail: string
  adminRole: 'admin' | 'super_admin'
}

export function FeatureFlagsManagement({
  adminId,
  adminEmail,
  adminRole,
}: FeatureFlagsManagementProps) {
  const [flags, setFlags] = useState<FeatureFlag[]>([])
  const [recentAuditLogs, setRecentAuditLogs] = useState<FeatureFlagAudit[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('all')

  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [toggleDialogOpen, setToggleDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [auditDialogOpen, setAuditDialogOpen] = useState(false)

  // Selected flag for operations
  const [selectedFlag, setSelectedFlag] = useState<FeatureFlag | null>(null)
  const [flagAuditLog, setFlagAuditLog] = useState<FeatureFlagAudit[]>([])

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    status: 'off' as 'on' | 'off',
    targetUserIds: '',
    targetPlans: '',
    isKillSwitch: false,
  })
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Fetch flags
  const fetchFlags = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/feature-flags', {
        cache: 'no-store',
      })
      if (!response.ok) throw new Error('Failed to fetch flags')
      const data = await response.json()
      setFlags(data.data || [])
    } catch (error) {
      console.error('Failed to fetch flags:', error)
      toast.error('Failed to load feature flags')
    }
  }, [])

  // Fetch recent audit logs
  const fetchAuditLogs = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/feature-flags/audit/recent?limit=50', {
        cache: 'no-store',
      })
      if (!response.ok) throw new Error('Failed to fetch audit logs')
      const data = await response.json()
      setRecentAuditLogs(data.data || [])
    } catch (error) {
      console.error('Failed to fetch audit logs:', error)
    }
  }, [])

  // Initial load
  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      await Promise.all([fetchFlags(), fetchAuditLogs()])
      setLoading(false)
    }
    loadData()
  }, [fetchFlags, fetchAuditLogs])

  // Refresh data
  const handleRefresh = async () => {
    setLoading(true)
    await Promise.all([fetchFlags(), fetchAuditLogs()])
    setLoading(false)
    toast.success('Data refreshed')
  }

  // Create flag
  const handleCreate = async () => {
    if (!formData.name.trim() || !reason.trim()) {
      toast.error('Name and reason are required')
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch('/api/admin/feature-flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name.trim(),
          description: formData.description.trim() || undefined,
          status: formData.status,
          targetUserIds: formData.targetUserIds
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          targetPlans: formData.targetPlans
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          isKillSwitch: formData.isKillSwitch,
          adminId,
          adminEmail,
          reason: reason.trim(),
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to create flag')
      }

      toast.success('Feature flag created')
      setCreateDialogOpen(false)
      resetForm()
      await Promise.all([fetchFlags(), fetchAuditLogs()])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create flag')
    } finally {
      setSubmitting(false)
    }
  }

  // Update flag
  const handleUpdate = async () => {
    if (!selectedFlag || !reason.trim()) {
      toast.error('Reason is required')
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch(`/api/admin/feature-flags/${selectedFlag.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: formData.description.trim() || undefined,
          status: formData.status,
          targetUserIds: formData.targetUserIds
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          targetPlans: formData.targetPlans
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          isKillSwitch: formData.isKillSwitch,
          adminId,
          adminEmail,
          reason: reason.trim(),
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update flag')
      }

      toast.success('Feature flag updated')
      setEditDialogOpen(false)
      resetForm()
      await Promise.all([fetchFlags(), fetchAuditLogs()])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update flag')
    } finally {
      setSubmitting(false)
    }
  }

  // Toggle flag
  const handleToggle = async () => {
    if (!selectedFlag || !reason.trim()) {
      toast.error('Reason is required')
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch(`/api/admin/feature-flags/${selectedFlag.id}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminId,
          adminEmail,
          reason: reason.trim(),
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to toggle flag')
      }

      const newStatus = selectedFlag.status === 'on' ? 'off' : 'on'
      toast.success(`Flag "${selectedFlag.name}" is now ${newStatus.toUpperCase()}`)
      setToggleDialogOpen(false)
      setReason('')
      setSelectedFlag(null)
      await Promise.all([fetchFlags(), fetchAuditLogs()])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to toggle flag')
    } finally {
      setSubmitting(false)
    }
  }

  // Delete flag
  const handleDelete = async () => {
    if (!selectedFlag || !reason.trim()) {
      toast.error('Reason is required')
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch(`/api/admin/feature-flags/${selectedFlag.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminId,
          adminEmail,
          reason: reason.trim(),
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to delete flag')
      }

      toast.success(`Flag "${selectedFlag.name}" deleted`)
      setDeleteDialogOpen(false)
      setReason('')
      setSelectedFlag(null)
      await Promise.all([fetchFlags(), fetchAuditLogs()])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete flag')
    } finally {
      setSubmitting(false)
    }
  }

  // View audit log for a flag
  const handleViewAudit = async (flag: FeatureFlag) => {
    setSelectedFlag(flag)
    try {
      const response = await fetch(`/api/admin/feature-flags/${flag.id}/audit?limit=50`, {
        cache: 'no-store',
      })
      if (!response.ok) throw new Error('Failed to fetch audit log')
      const data = await response.json()
      setFlagAuditLog(data.data || [])
      setAuditDialogOpen(true)
    } catch (error) {
      toast.error('Failed to load audit log')
    }
  }

  // Reset form
  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      status: 'off',
      targetUserIds: '',
      targetPlans: '',
      isKillSwitch: false,
    })
    setReason('')
    setSelectedFlag(null)
  }

  // Open edit dialog
  const openEditDialog = (flag: FeatureFlag) => {
    setSelectedFlag(flag)
    setFormData({
      name: flag.name,
      description: flag.description || '',
      status: flag.status,
      targetUserIds: flag.targetUserIds.join(', '),
      targetPlans: flag.targetPlans.join(', '),
      isKillSwitch: flag.isKillSwitch,
    })
    setEditDialogOpen(true)
  }

  // Open toggle dialog
  const openToggleDialog = (flag: FeatureFlag) => {
    setSelectedFlag(flag)
    setReason('')
    setToggleDialogOpen(true)
  }

  // Open delete dialog
  const openDeleteDialog = (flag: FeatureFlag) => {
    setSelectedFlag(flag)
    setReason('')
    setDeleteDialogOpen(true)
  }

  // Filter flags by type
  const killSwitches = flags.filter((f) => f.isKillSwitch)
  const regularFlags = flags.filter((f) => !f.isKillSwitch)
  const activeFlags = flags.filter((f) => f.status === 'on')

  // Render flag row
  const renderFlagRow = (flag: FeatureFlag) => {
    const hasTargeting = flag.targetUserIds.length > 0 || flag.targetPlans.length > 0

    return (
      <TableRow key={flag.id}>
        <TableCell>
          <div className="flex items-center gap-2">
            {flag.isKillSwitch && (
              <span title="Kill Switch">
                <Shield className="h-4 w-4 text-orange-500" />
              </span>
            )}
            <div>
              <div className="font-medium">{flag.name}</div>
              {flag.description && (
                <div className="text-sm text-muted-foreground">{flag.description}</div>
              )}
            </div>
          </div>
        </TableCell>
        <TableCell>
          <Badge variant={flag.status === 'on' ? 'default' : 'secondary'}>
            {flag.status === 'on' ? (
              <CheckCircle2 className="h-3 w-3 mr-1" />
            ) : (
              <XCircle className="h-3 w-3 mr-1" />
            )}
            {flag.status.toUpperCase()}
          </Badge>
        </TableCell>
        <TableCell>
          {hasTargeting ? (
            <div className="text-sm">
              {flag.targetUserIds.length > 0 && (
                <div className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {flag.targetUserIds.length} users
                </div>
              )}
              {flag.targetPlans.length > 0 && (
                <div>{flag.targetPlans.join(', ')}</div>
              )}
            </div>
          ) : (
            <span className="text-muted-foreground">All users</span>
          )}
        </TableCell>
        <TableCell>
          <span className="text-sm text-muted-foreground">
            {formatDistanceToNow(new Date(flag.updatedAt), { addSuffix: true })}
          </span>
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => openToggleDialog(flag)}
              title={`Toggle ${flag.status === 'on' ? 'off' : 'on'}`}
            >
              <Power className={`h-4 w-4 ${flag.status === 'on' ? 'text-green-500' : 'text-muted-foreground'}`} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => openEditDialog(flag)}
              title="Edit"
            >
              <Edit2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleViewAudit(flag)}
              title="View history"
            >
              <History className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => openDeleteDialog(flag)}
              title="Delete"
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
    )
  }

  // Render flag table
  const renderFlagTable = (flagList: FeatureFlag[]) => {
    if (flagList.length === 0) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          No feature flags found
        </div>
      )
    }

    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Targeting</TableHead>
            <TableHead>Updated</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>{flagList.map(renderFlagRow)}</TableBody>
      </Table>
    )
  }

  // Render action badge for audit log
  const renderActionBadge = (action: string) => {
    const config: Record<string, { variant: 'default' | 'secondary' | 'destructive'; label: string }> = {
      created: { variant: 'default', label: 'Created' },
      updated: { variant: 'secondary', label: 'Updated' },
      toggled: { variant: 'default', label: 'Toggled' },
      deleted: { variant: 'destructive', label: 'Deleted' },
    }
    const { variant, label } = config[action] || { variant: 'secondary', label: action }
    return <Badge variant={variant}>{label}</Badge>
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Flags</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Flag className="h-5 w-5 text-muted-foreground" />
              <span className="text-2xl font-bold">{flags.length}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active Flags</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <span className="text-2xl font-bold">{activeFlags.length}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Kill Switches</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-orange-500" />
              <span className="text-2xl font-bold">{killSwitches.length}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Recent Changes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-muted-foreground" />
              <span className="text-2xl font-bold">{recentAuditLogs.length}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex justify-between items-center">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="all">All ({flags.length})</TabsTrigger>
            <TabsTrigger value="kill-switches">
              Kill Switches ({killSwitches.length})
            </TabsTrigger>
            <TabsTrigger value="regular">Regular ({regularFlags.length})</TabsTrigger>
            <TabsTrigger value="audit">Audit Log</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Flag
          </Button>
        </div>
      </div>

      {/* Content */}
      <Card>
        <CardContent className="pt-6">
          {activeTab === 'all' && renderFlagTable(flags)}
          {activeTab === 'kill-switches' && renderFlagTable(killSwitches)}
          {activeTab === 'regular' && renderFlagTable(regularFlags)}
          {activeTab === 'audit' && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Flag</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentAuditLogs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap">
                      {format(new Date(log.changedAt), 'MMM d, HH:mm')}
                    </TableCell>
                    <TableCell className="font-medium">{log.flagName}</TableCell>
                    <TableCell>{renderActionBadge(log.action)}</TableCell>
                    <TableCell className="max-w-[300px] truncate">{log.reason}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {log.changedByEmail || 'System'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Feature Flag</DialogTitle>
            <DialogDescription>
              Create a new feature flag for kill switches or targeted releases
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                placeholder="e.g., builds_enabled, new_dashboard"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="What does this flag control?"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Initial Status</Label>
                <p className="text-sm text-muted-foreground">Start enabled or disabled</p>
              </div>
              <Switch
                checked={formData.status === 'on'}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, status: checked ? 'on' : 'off' })
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Kill Switch</Label>
                <p className="text-sm text-muted-foreground">Mark as critical system toggle</p>
              </div>
              <Switch
                checked={formData.isKillSwitch}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, isKillSwitch: checked })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="targetUserIds">Target User IDs (comma-separated)</Label>
              <Input
                id="targetUserIds"
                placeholder="user-uuid-1, user-uuid-2"
                value={formData.targetUserIds}
                onChange={(e) => setFormData({ ...formData, targetUserIds: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="targetPlans">Target Plans (comma-separated)</Label>
              <Input
                id="targetPlans"
                placeholder="pro, enterprise"
                value={formData.targetPlans}
                onChange={(e) => setFormData({ ...formData, targetPlans: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason">Reason for creation *</Label>
              <Textarea
                id="reason"
                placeholder="Why are you creating this flag?"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={submitting}>
              {submitting ? 'Creating...' : 'Create Flag'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Feature Flag</DialogTitle>
            <DialogDescription>
              Update settings for {selectedFlag?.name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Status</Label>
                <p className="text-sm text-muted-foreground">Enable or disable the flag</p>
              </div>
              <Switch
                checked={formData.status === 'on'}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, status: checked ? 'on' : 'off' })
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Kill Switch</Label>
                <p className="text-sm text-muted-foreground">Mark as critical system toggle</p>
              </div>
              <Switch
                checked={formData.isKillSwitch}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, isKillSwitch: checked })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-targetUserIds">Target User IDs</Label>
              <Input
                id="edit-targetUserIds"
                placeholder="user-uuid-1, user-uuid-2"
                value={formData.targetUserIds}
                onChange={(e) => setFormData({ ...formData, targetUserIds: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-targetPlans">Target Plans</Label>
              <Input
                id="edit-targetPlans"
                placeholder="pro, enterprise"
                value={formData.targetPlans}
                onChange={(e) => setFormData({ ...formData, targetPlans: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-reason">Reason for change *</Label>
              <Textarea
                id="edit-reason"
                placeholder="Why are you making this change?"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={submitting}>
              {submitting ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Toggle Confirmation Dialog */}
      <Dialog open={toggleDialogOpen} onOpenChange={setToggleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedFlag?.isKillSwitch && (
                <AlertTriangle className="h-5 w-5 text-orange-500 inline mr-2" />
              )}
              Toggle Feature Flag
            </DialogTitle>
            <DialogDescription>
              You are about to turn <strong>{selectedFlag?.name}</strong>{' '}
              <strong>{selectedFlag?.status === 'on' ? 'OFF' : 'ON'}</strong>.
              {selectedFlag?.isKillSwitch && (
                <span className="block mt-2 text-orange-500">
                  This is a kill switch. Changes take effect immediately.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="toggle-reason">Reason for toggle *</Label>
              <Textarea
                id="toggle-reason"
                placeholder="Why are you toggling this flag?"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setToggleDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant={selectedFlag?.status === 'on' ? 'destructive' : 'default'}
              onClick={handleToggle}
              disabled={submitting}
            >
              {submitting
                ? 'Toggling...'
                : selectedFlag?.status === 'on'
                  ? 'Turn OFF'
                  : 'Turn ON'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Feature Flag</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{selectedFlag?.name}</strong>?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="delete-reason">Reason for deletion *</Label>
              <Textarea
                id="delete-reason"
                placeholder="Why are you deleting this flag?"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={submitting}>
              {submitting ? 'Deleting...' : 'Delete Flag'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Audit Log Dialog */}
      <Dialog open={auditDialogOpen} onOpenChange={setAuditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Audit Log: {selectedFlag?.name}</DialogTitle>
            <DialogDescription>
              History of all changes to this feature flag
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[400px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {flagAuditLog.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap">
                      {format(new Date(log.changedAt), 'MMM d, yyyy HH:mm')}
                    </TableCell>
                    <TableCell>{renderActionBadge(log.action)}</TableCell>
                    <TableCell>{log.reason}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {log.changedByEmail || 'System'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAuditDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
