/**
 * Incident Management Dashboard Component
 * Full incident lifecycle management with timeline and post-mortems
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Plus,
  RefreshCw,
  XCircle,
  MessageSquare,
  FileText,
  TrendingDown,
} from 'lucide-react'
import { toast } from 'sonner'
import { format, formatDistanceToNow } from 'date-fns'

// Types
type IncidentStatus = 'investigating' | 'identified' | 'monitoring' | 'resolved'
type IncidentSeverity = 1 | 2 | 3 | 4

interface Incident {
  id: string
  incident_key?: string
  title: string
  severity: IncidentSeverity
  status: IncidentStatus
  affected_systems: string[]
  status_page_message?: string
  description?: string
  created_at: string
  resolved_at?: string
  updated_at: string
  duration_minutes: number
}

interface TimelineEntry {
  id: string
  incident_id: string
  message: string
  entry_type: string
  created_at: string
  created_by?: string
}

interface PostMortem {
  what_happened?: string
  impact?: string
  root_cause?: string
  lessons_learned?: string
  action_items: Array<{
    title: string
    owner?: string
    due_date?: string
    status: 'pending' | 'in_progress' | 'completed'
  }>
}

interface MTTRStats {
  severity: number
  incident_count: number
  avg_duration_minutes: number
}

interface IncidentManagementDashboardProps {
  adminId: string
  adminEmail: string
  adminRole: 'admin' | 'super_admin'
  permissions: string[]
}

// Severity configuration
const severityConfig = {
  1: { label: 'SEV1 - Critical', color: 'bg-red-500', description: 'Full outage' },
  2: { label: 'SEV2 - Major', color: 'bg-orange-500', description: 'Major feature broken' },
  3: { label: 'SEV3 - Minor', color: 'bg-yellow-500', description: 'Partial degradation' },
  4: { label: 'SEV4 - Low', color: 'bg-blue-500', description: 'Minor issue' },
}

// Status configuration
const statusConfig = {
  investigating: { label: 'Investigating', icon: AlertCircle, color: 'destructive' },
  identified: { label: 'Identified', icon: AlertTriangle, color: 'warning' },
  monitoring: { label: 'Monitoring', icon: Clock, color: 'secondary' },
  resolved: { label: 'Resolved', icon: CheckCircle2, color: 'default' },
}

const SYSTEMS = ['api', 'database', 'build_runner', 'stripe', 'supabase', 'sanity']

export function IncidentManagementDashboard({
  adminId,
  adminEmail,
  adminRole,
  permissions,
}: IncidentManagementDashboardProps) {
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null)
  const [timeline, setTimeline] = useState<TimelineEntry[]>([])
  const [postMortem, setPostMortem] = useState<PostMortem | null>(null)
  const [mttrStats, setMttrStats] = useState<MTTRStats[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'active' | 'resolved' | 'stats'>('active')

  // Dialogs
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isTimelineDialogOpen, setIsTimelineDialogOpen] = useState(false)
  const [isPostMortemDialogOpen, setIsPostMortemDialogOpen] = useState(false)

  // Form state
  const [newIncident, setNewIncident] = useState({
    title: '',
    severity: 3 as IncidentSeverity,
    description: '',
    affected_systems: [] as string[],
    status_page_message: '',
  })
  const [newTimelineEntry, setNewTimelineEntry] = useState('')
  const [editingPostMortem, setEditingPostMortem] = useState<PostMortem>({
    what_happened: '',
    impact: '',
    root_cause: '',
    lessons_learned: '',
    action_items: [],
  })

  const canCreateSev1 = permissions.includes('incidents.create_sev1') || adminRole === 'super_admin'

  // Fetch incidents
  const fetchIncidents = useCallback(async () => {
    try {
      const status = activeTab === 'resolved' ? 'resolved' : 'investigating,identified,monitoring'

      const response = await fetch(`/api/admin/incidents?status=${status}`, {
        cache: 'no-store',
        credentials: 'include',
      })

      if (response.ok) {
        const result = await response.json()
        if (result.success) {
          setIncidents(result.data)
        }
      }
    } catch (error) {
      console.error('Error fetching incidents:', error)
      toast.error('Failed to load incidents')
    }
  }, [activeTab])

  // Fetch MTTR stats
  const fetchMTTRStats = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/incidents/stats/mttr', {
        cache: 'no-store',
        credentials: 'include',
      })

      if (response.ok) {
        const result = await response.json()
        if (result.success) {
          setMttrStats(result.data.stats)
        }
      }
    } catch (error) {
      console.error('Error fetching MTTR stats:', error)
    }
  }, [])

  // Fetch incident details
  const fetchIncidentDetails = useCallback(async (incidentId: string) => {
    try {
      const response = await fetch(`/api/admin/incidents/${incidentId}`, {
        cache: 'no-store',
        credentials: 'include',
      })

      if (response.ok) {
        const result = await response.json()
        if (result.success) {
          setSelectedIncident(result.data.incident)
          setTimeline(result.data.timeline)
          setPostMortem(result.data.postMortem)
          if (result.data.postMortem) {
            setEditingPostMortem(result.data.postMortem)
          }
        }
      }
    } catch (error) {
      console.error('Error fetching incident details:', error)
    }
  }, [])

  // Initial load
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true)
      await fetchIncidents()
      await fetchMTTRStats()
      setIsLoading(false)
    }
    loadData()
  }, [fetchIncidents, fetchMTTRStats])

  // Create incident
  const handleCreateIncident = async () => {
    if (!newIncident.title) {
      toast.error('Title is required')
      return
    }

    if (newIncident.severity === 1 && !canCreateSev1) {
      toast.error('You do not have permission to create SEV1 incidents')
      return
    }

    try {
      const response = await fetch('/api/admin/incidents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(newIncident),
      })

      if (response.ok) {
        toast.success('Incident created')
        setIsCreateDialogOpen(false)
        setNewIncident({
          title: '',
          severity: 3,
          description: '',
          affected_systems: [],
          status_page_message: '',
        })
        fetchIncidents()
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to create incident')
      }
    } catch (error) {
      toast.error('Failed to create incident')
    }
  }

  // Update incident status
  const handleUpdateStatus = async (incidentId: string, status: IncidentStatus) => {
    try {
      const response = await fetch(`/api/admin/incidents/${incidentId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ status }),
      })

      if (response.ok) {
        toast.success(`Status updated to ${status}`)
        fetchIncidents()
        if (selectedIncident?.id === incidentId) {
          fetchIncidentDetails(incidentId)
        }
      }
    } catch (error) {
      toast.error('Failed to update status')
    }
  }

  // Add timeline entry
  const handleAddTimelineEntry = async () => {
    if (!selectedIncident || !newTimelineEntry) return

    try {
      const response = await fetch(`/api/admin/incidents/${selectedIncident.id}/timeline`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ message: newTimelineEntry }),
      })

      if (response.ok) {
        toast.success('Timeline entry added')
        setNewTimelineEntry('')
        fetchIncidentDetails(selectedIncident.id)
      }
    } catch (error) {
      toast.error('Failed to add timeline entry')
    }
  }

  // Save post-mortem
  const handleSavePostMortem = async () => {
    if (!selectedIncident) return

    try {
      const response = await fetch(`/api/admin/incidents/${selectedIncident.id}/postmortem`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(editingPostMortem),
      })

      if (response.ok) {
        toast.success('Post-mortem saved')
        setIsPostMortemDialogOpen(false)
        fetchIncidentDetails(selectedIncident.id)
      }
    } catch (error) {
      toast.error('Failed to save post-mortem')
    }
  }

  // Resolve incident
  const handleResolve = async () => {
    if (!selectedIncident) return

    try {
      const response = await fetch(`/api/admin/incidents/${selectedIncident.id}/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({}),
      })

      if (response.ok) {
        toast.success('Incident resolved')
        fetchIncidents()
        setSelectedIncident(null)
      } else {
        const error = await response.json()
        toast.error(error.error || 'Failed to resolve incident')
      }
    } catch (error) {
      toast.error('Failed to resolve incident')
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          <TabsList>
            <TabsTrigger value="active">Active Incidents</TabsTrigger>
            <TabsTrigger value="resolved">Resolved</TabsTrigger>
            <TabsTrigger value="stats">Statistics</TabsTrigger>
          </TabsList>
        </Tabs>

        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Incident
        </Button>
      </div>

      {/* Stats Tab */}
      {activeTab === 'stats' && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((sev) => {
            const stats = mttrStats.find((s) => s.severity === sev)
            const config = severityConfig[sev as IncidentSeverity]
            return (
              <Card key={sev}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{config.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {stats?.avg_duration_minutes
                      ? `${Math.round(stats.avg_duration_minutes)} min`
                      : 'N/A'}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Avg MTTR ({stats?.incident_count || 0} incidents)
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Incidents List */}
      {activeTab !== 'stats' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Incident List */}
          <Card>
            <CardHeader>
              <CardTitle>
                {activeTab === 'active' ? 'Active Incidents' : 'Resolved Incidents'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {incidents.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No {activeTab} incidents
                </div>
              ) : (
                <div className="space-y-2">
                  {incidents.map((incident) => {
                    const sevConfig = severityConfig[incident.severity]
                    const statConfig = statusConfig[incident.status]
                    const StatusIcon = statConfig.icon

                    return (
                      <div
                        key={incident.id}
                        className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                          selectedIncident?.id === incident.id
                            ? 'border-primary bg-muted'
                            : 'hover:bg-muted/50'
                        }`}
                        onClick={() => fetchIncidentDetails(incident.id)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <div className={`w-2 h-2 rounded-full ${sevConfig.color}`} />
                              <span className="font-medium">{incident.title}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Badge variant={statConfig.color as any} className="text-xs">
                                <StatusIcon className="h-3 w-3 mr-1" />
                                {statConfig.label}
                              </Badge>
                              <span>{formatDistanceToNow(new Date(incident.created_at), { addSuffix: true })}</span>
                              <span>{incident.duration_minutes} min</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Right: Incident Details */}
          <Card>
            <CardHeader>
              <CardTitle>
                {selectedIncident ? 'Incident Details' : 'Select an Incident'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!selectedIncident ? (
                <div className="text-center py-8 text-muted-foreground">
                  Click on an incident to view details
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Info */}
                  <div className="space-y-2">
                    <h3 className="font-semibold">{selectedIncident.title}</h3>
                    <p className="text-sm text-muted-foreground">
                      {selectedIncident.description || 'No description'}
                    </p>
                    <div className="flex gap-2">
                      {selectedIncident.affected_systems.map((sys) => (
                        <Badge key={sys} variant="outline">{sys}</Badge>
                      ))}
                    </div>
                  </div>

                  {/* Status Actions */}
                  {selectedIncident.status !== 'resolved' && (
                    <div className="flex gap-2 flex-wrap">
                      {selectedIncident.status !== 'identified' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleUpdateStatus(selectedIncident.id, 'identified')}
                        >
                          Mark Identified
                        </Button>
                      )}
                      {selectedIncident.status !== 'monitoring' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleUpdateStatus(selectedIncident.id, 'monitoring')}
                        >
                          Mark Monitoring
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="default"
                        onClick={handleResolve}
                      >
                        Resolve
                      </Button>
                    </div>
                  )}

                  {/* Timeline */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium flex items-center gap-2">
                        <MessageSquare className="h-4 w-4" />
                        Timeline
                      </h4>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setIsTimelineDialogOpen(true)}
                      >
                        Add Entry
                      </Button>
                    </div>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {timeline.map((entry) => (
                        <div key={entry.id} className="text-sm border-l-2 pl-3 py-1">
                          <div className="text-muted-foreground text-xs">
                            {format(new Date(entry.created_at), 'PPp')}
                          </div>
                          <div>{entry.message}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Post-Mortem (for SEV1-2) */}
                  {selectedIncident.severity <= 2 && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          Post-Mortem
                          {selectedIncident.severity <= 2 && !postMortem && (
                            <Badge variant="destructive" className="text-xs">Required</Badge>
                          )}
                        </h4>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setIsPostMortemDialogOpen(true)}
                        >
                          {postMortem ? 'Edit' : 'Create'}
                        </Button>
                      </div>
                      {postMortem && (
                        <div className="text-sm text-muted-foreground">
                          Root cause: {postMortem.root_cause || 'Not documented'}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Create Incident Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Incident</DialogTitle>
            <DialogDescription>
              Document a new platform incident
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Title</Label>
              <Input
                value={newIncident.title}
                onChange={(e) => setNewIncident({ ...newIncident, title: e.target.value })}
                placeholder="Brief incident title"
              />
            </div>
            <div>
              <Label>Severity</Label>
              <Select
                value={String(newIncident.severity)}
                onValueChange={(v) => setNewIncident({ ...newIncident, severity: Number(v) as IncidentSeverity })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(severityConfig).map(([sev, config]) => (
                    <SelectItem
                      key={sev}
                      value={sev}
                      disabled={sev === '1' && !canCreateSev1}
                    >
                      {config.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={newIncident.description}
                onChange={(e) => setNewIncident({ ...newIncident, description: e.target.value })}
                placeholder="What's happening?"
              />
            </div>
            <div>
              <Label>Affected Systems</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {SYSTEMS.map((sys) => (
                  <Badge
                    key={sys}
                    variant={newIncident.affected_systems.includes(sys) ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => {
                      const systems = newIncident.affected_systems.includes(sys)
                        ? newIncident.affected_systems.filter((s) => s !== sys)
                        : [...newIncident.affected_systems, sys]
                      setNewIncident({ ...newIncident, affected_systems: systems })
                    }}
                  >
                    {sys}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateIncident}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Timeline Entry Dialog */}
      <Dialog open={isTimelineDialogOpen} onOpenChange={setIsTimelineDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Timeline Entry</DialogTitle>
          </DialogHeader>
          <div>
            <Textarea
              value={newTimelineEntry}
              onChange={(e) => setNewTimelineEntry(e.target.value)}
              placeholder="What's the update?"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsTimelineDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddTimelineEntry}>Add Entry</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Post-Mortem Dialog */}
      <Dialog open={isPostMortemDialogOpen} onOpenChange={setIsPostMortemDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Post-Mortem</DialogTitle>
            <DialogDescription>
              Document what happened and how to prevent it
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-96 overflow-y-auto">
            <div>
              <Label>What Happened</Label>
              <Textarea
                value={editingPostMortem.what_happened || ''}
                onChange={(e) =>
                  setEditingPostMortem({ ...editingPostMortem, what_happened: e.target.value })
                }
                placeholder="Timeline of events"
                rows={3}
              />
            </div>
            <div>
              <Label>Impact</Label>
              <Textarea
                value={editingPostMortem.impact || ''}
                onChange={(e) =>
                  setEditingPostMortem({ ...editingPostMortem, impact: e.target.value })
                }
                placeholder="Users affected, duration, revenue impact"
                rows={2}
              />
            </div>
            <div>
              <Label>Root Cause (5 Whys)</Label>
              <Textarea
                value={editingPostMortem.root_cause || ''}
                onChange={(e) =>
                  setEditingPostMortem({ ...editingPostMortem, root_cause: e.target.value })
                }
                placeholder="Why did this happen?"
                rows={3}
              />
            </div>
            <div>
              <Label>Lessons Learned</Label>
              <Textarea
                value={editingPostMortem.lessons_learned || ''}
                onChange={(e) =>
                  setEditingPostMortem({ ...editingPostMortem, lessons_learned: e.target.value })
                }
                placeholder="What will we do differently?"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPostMortemDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSavePostMortem}>Save Post-Mortem</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
