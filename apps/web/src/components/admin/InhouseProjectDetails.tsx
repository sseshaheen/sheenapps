/**
 * In-House Project Details Component
 * Detailed view of a single In-House Mode project
 */

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  FolderOpen,
  RefreshCw,
  ArrowLeft,
  Pause,
  Play,
  User,
  Database,
  HardDrive,
  Mail,
  Clock,
  Key,
  Shield,
  Activity,
  Copy,
  FileText,
  Inbox,
  Search,
} from 'lucide-react'
import { toast } from 'sonner'
import { format, formatDistanceToNow } from 'date-fns'
import { useRouter } from 'next/navigation'
import { DnsStatusIndicator } from '@/components/admin/DnsStatusIndicator'
import { CopyButton } from '@/components/admin/shared/CopyButton'

// Types
interface ProjectUsage {
  storage_bytes: number
  storage_limit_bytes: number
  job_runs: number
  job_runs_limit: number
  email_sends: number
  email_sends_limit: number
  secrets_count: number
  secrets_limit: number
  backup_storage_bytes: number
  backup_storage_limit_bytes: number
}

interface ProjectSchema {
  name: string | null
  table_count: number
  row_count_estimate: number
  size_bytes: number
}

interface ProjectDetails {
  id: string
  name: string
  subdomain: string | null
  framework: string | null
  created_at: string
  updated_at: string
  status: string
  owner: {
    id: string
    email: string
    full_name: string | null
  }
  plan: {
    id: string | null
    name: string | null
  }
  usage: ProjectUsage
  schema: ProjectSchema
}

interface ActivityLogEntry {
  id: string
  project_id: string
  service: string
  action: string
  status: string
  correlation_id: string | null
  actor_type: string | null
  actor_id: string | null
  resource_type: string | null
  resource_id: string | null
  metadata: Record<string, any> | null
  duration_ms: number | null
  error_code: string | null
  created_at: string
}

interface FormSummary {
  id: string
  name: string
  description: string | null
  created_at: string
  updated_at: string
  submissions_total: number
  submissions_unread: number
  submissions_read: number
  submissions_archived: number
  submissions_spam: number
  submissions_deleted: number
}

interface FormSubmission {
  id: string
  form_id: string
  form_name: string
  data: Record<string, unknown>
  status: 'unread' | 'read' | 'archived' | 'spam' | 'deleted'
  source_ip: string | null
  user_agent: string | null
  referrer: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  read_at: string | null
  archived_at: string | null
  deleted_at: string | null
}

interface SearchIndex {
  id: string
  name: string
  searchable_fields: string[]
  field_weights: Record<string, string>
  language: string
  settings: Record<string, unknown>
  document_count: number
  created_at: string
  updated_at: string
}

interface SearchQueryEntry {
  id: string
  index_id: string
  index_name: string
  query: string
  result_count: number
  latency_ms: number
  created_at: string
}

interface InhouseProjectDetailsProps {
  projectId: string
}

export function InhouseProjectDetails({
  projectId,
}: InhouseProjectDetailsProps) {
  const router = useRouter()
  const [project, setProject] = useState<ProjectDetails | null>(null)
  const [activities, setActivities] = useState<ActivityLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [activitiesLoading, setActivitiesLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')

  const [forms, setForms] = useState<FormSummary[]>([])
  const [formsLoading, setFormsLoading] = useState(false)
  const [formsLoaded, setFormsLoaded] = useState(false)

  const [submissions, setSubmissions] = useState<FormSubmission[]>([])
  const [submissionsLoading, setSubmissionsLoading] = useState(false)
  const [submissionStatus, setSubmissionStatus] = useState('all')
  const [submissionForm, setSubmissionForm] = useState('all')
  const [submissionExportFormat, setSubmissionExportFormat] = useState<'csv' | 'json'>('csv')
  const [submissionStartDate, setSubmissionStartDate] = useState('')
  const [submissionEndDate, setSubmissionEndDate] = useState('')

  const [searchIndexes, setSearchIndexes] = useState<SearchIndex[]>([])
  const [searchIndexesLoading, setSearchIndexesLoading] = useState(false)
  const [searchIndexesLoaded, setSearchIndexesLoaded] = useState(false)

  const [searchQueries, setSearchQueries] = useState<SearchQueryEntry[]>([])
  const [searchQueriesLoading, setSearchQueriesLoading] = useState(false)
  const [searchIndexFilter, setSearchIndexFilter] = useState('all')
  const [searchExportFormat, setSearchExportFormat] = useState<'csv' | 'json'>('csv')
  const [searchStartDate, setSearchStartDate] = useState('')
  const [searchEndDate, setSearchEndDate] = useState('')

  // Inbox tab state
  const [inboxConfig, setInboxConfig] = useState<any>(null)
  const [inboxMessages, setInboxMessages] = useState<any[]>([])
  const [inboxLoading, setInboxLoading] = useState(false)
  const [inboxLoaded, setInboxLoaded] = useState(false)

  // Domains tab state
  const [emailDomains, setEmailDomains] = useState<any[]>([])
  const [registeredDomains, setRegisteredDomains] = useState<any[]>([])
  const [mailboxCount, setMailboxCount] = useState(0)
  const [domainsLoading, setDomainsLoading] = useState(false)
  const [domainsLoaded, setDomainsLoaded] = useState(false)

  // AbortController for unmount-safe fetches
  const projectAbortRef = useRef<AbortController | null>(null)
  const activitiesAbortRef = useRef<AbortController | null>(null)
  const formsAbortRef = useRef<AbortController | null>(null)
  const submissionsAbortRef = useRef<AbortController | null>(null)
  const searchIndexesAbortRef = useRef<AbortController | null>(null)
  const searchQueriesAbortRef = useRef<AbortController | null>(null)
  const inboxAbortRef = useRef<AbortController | null>(null)
  const domainsAbortRef = useRef<AbortController | null>(null)

  // Action dialog state
  const [actionDialog, setActionDialog] = useState<{
    open: boolean
    type: 'suspend' | 'unsuspend'
    reason: string
    loading: boolean
  }>({
    open: false,
    type: 'suspend',
    reason: '',
    loading: false,
  })

  // Fetch project details with AbortController
  const fetchProject = useCallback(async () => {
    projectAbortRef.current?.abort()
    const controller = new AbortController()
    projectAbortRef.current = controller

    setLoading(true)
    try {
      const response = await fetch(`/api/admin/inhouse/projects/${projectId}`, {
        signal: controller.signal,
      })
      if (!response.ok) {
        if (response.status === 404) {
          toast.error('Project not found')
          router.push('/admin/inhouse/projects')
          return
        }
        throw new Error('Failed to fetch project')
      }

      const data = await response.json()
      setProject(data.data)
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        console.error('Failed to fetch project:', error)
        toast.error('Failed to load project details')
      }
    } finally {
      setLoading(false)
    }
  }, [projectId, router])

  // Fetch project activity with AbortController
  const fetchActivities = useCallback(async () => {
    activitiesAbortRef.current?.abort()
    const controller = new AbortController()
    activitiesAbortRef.current = controller

    setActivitiesLoading(true)
    try {
      const response = await fetch(`/api/admin/inhouse/projects/${projectId}/activity?limit=50`, {
        signal: controller.signal,
      })
      if (!response.ok) throw new Error('Failed to fetch activities')

      const data = await response.json()
      setActivities(data.data?.activities || [])
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        console.error('Failed to fetch activities:', error)
      }
    } finally {
      setActivitiesLoading(false)
    }
  }, [projectId])

  // Fetch forms list
  const fetchForms = useCallback(async () => {
    formsAbortRef.current?.abort()
    const controller = new AbortController()
    formsAbortRef.current = controller

    setFormsLoading(true)
    try {
      const response = await fetch(`/api/admin/inhouse/projects/${projectId}/forms`, {
        signal: controller.signal,
      })
      if (!response.ok) throw new Error('Failed to fetch forms')

      const data = await response.json()
      setForms(data.data?.forms || [])
      setFormsLoaded(true)
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        console.error('Failed to fetch forms:', error)
        toast.error('Failed to load forms')
      }
    } finally {
      setFormsLoading(false)
    }
  }, [projectId])

  // Fetch form submissions
  const fetchSubmissions = useCallback(async () => {
    submissionsAbortRef.current?.abort()
    const controller = new AbortController()
    submissionsAbortRef.current = controller

    setSubmissionsLoading(true)
    try {
      const params = new URLSearchParams({ limit: '50' })
      if (submissionStatus !== 'all') params.set('status', submissionStatus)
      if (submissionForm !== 'all') params.set('formName', submissionForm)
      if (submissionStartDate) params.set('startDate', submissionStartDate)
      if (submissionEndDate) params.set('endDate', submissionEndDate)

      const response = await fetch(`/api/admin/inhouse/projects/${projectId}/forms/submissions?${params.toString()}`, {
        signal: controller.signal,
      })
      if (!response.ok) throw new Error('Failed to fetch submissions')

      const data = await response.json()
      setSubmissions(data.data?.submissions || [])
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        console.error('Failed to fetch submissions:', error)
        toast.error('Failed to load submissions')
      }
    } finally {
      setSubmissionsLoading(false)
    }
  }, [projectId, submissionStatus, submissionForm, submissionStartDate, submissionEndDate])

  // Fetch search indexes
  const fetchSearchIndexes = useCallback(async () => {
    searchIndexesAbortRef.current?.abort()
    const controller = new AbortController()
    searchIndexesAbortRef.current = controller

    setSearchIndexesLoading(true)
    try {
      const response = await fetch(`/api/admin/inhouse/projects/${projectId}/search/indexes`, {
        signal: controller.signal,
      })
      if (!response.ok) throw new Error('Failed to fetch search indexes')

      const data = await response.json()
      setSearchIndexes(data.data?.indexes || [])
      setSearchIndexesLoaded(true)
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        console.error('Failed to fetch search indexes:', error)
        toast.error('Failed to load search indexes')
      }
    } finally {
      setSearchIndexesLoading(false)
    }
  }, [projectId])

  // Fetch search queries
  const fetchSearchQueries = useCallback(async () => {
    searchQueriesAbortRef.current?.abort()
    const controller = new AbortController()
    searchQueriesAbortRef.current = controller

    setSearchQueriesLoading(true)
    try {
      const params = new URLSearchParams({ limit: '50' })
      if (searchIndexFilter !== 'all') params.set('indexName', searchIndexFilter)
      if (searchStartDate) params.set('startDate', searchStartDate)
      if (searchEndDate) params.set('endDate', searchEndDate)

      const response = await fetch(`/api/admin/inhouse/projects/${projectId}/search/queries?${params.toString()}`, {
        signal: controller.signal,
      })
      if (!response.ok) throw new Error('Failed to fetch search queries')

      const data = await response.json()
      setSearchQueries(data.data?.queries || [])
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        console.error('Failed to fetch search queries:', error)
        toast.error('Failed to load search queries')
      }
    } finally {
      setSearchQueriesLoading(false)
    }
  }, [projectId, searchIndexFilter, searchStartDate, searchEndDate])

  // Fetch inbox data (config + recent messages)
  const fetchInboxData = useCallback(async () => {
    inboxAbortRef.current?.abort()
    const controller = new AbortController()
    inboxAbortRef.current = controller

    setInboxLoading(true)
    try {
      const [configRes, messagesRes] = await Promise.all([
        fetch(`/api/admin/inhouse/inbox/config?projectId=${projectId}`, { signal: controller.signal }),
        fetch(`/api/admin/inhouse/inbox/messages?projectId=${projectId}&limit=10&offset=0`, { signal: controller.signal }),
      ])

      if (configRes.ok) {
        const configData = await configRes.json()
        setInboxConfig(configData.data?.config || null)
      }
      if (messagesRes.ok) {
        const messagesData = await messagesRes.json()
        setInboxMessages(messagesData.data?.messages || [])
      }
      setInboxLoaded(true)
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        toast.error('Failed to load inbox data')
      }
    } finally {
      setInboxLoading(false)
    }
  }, [projectId])

  // Fetch domains data (email domains + registered domains + mailbox count)
  const fetchDomainsData = useCallback(async () => {
    domainsAbortRef.current?.abort()
    const controller = new AbortController()
    domainsAbortRef.current = controller

    setDomainsLoading(true)
    try {
      const [emailRes, regRes, mbRes] = await Promise.all([
        fetch(`/api/admin/inhouse/email-domains?projectId=${projectId}&limit=50&offset=0`, { signal: controller.signal }),
        fetch(`/api/admin/inhouse/registered-domains?projectId=${projectId}&limit=50&offset=0`, { signal: controller.signal }),
        fetch(`/api/admin/inhouse/mailboxes?projectId=${projectId}&limit=1&offset=0`, { signal: controller.signal }),
      ])

      if (emailRes.ok) {
        const data = await emailRes.json()
        setEmailDomains(data.data?.domains || [])
      }
      if (regRes.ok) {
        const data = await regRes.json()
        setRegisteredDomains(data.data?.domains || [])
      }
      if (mbRes.ok) {
        const data = await mbRes.json()
        setMailboxCount(data.data?.total || 0)
      }
      setDomainsLoaded(true)
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        toast.error('Failed to load domains data')
      }
    } finally {
      setDomainsLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    fetchProject()
    fetchActivities()
    return () => {
      projectAbortRef.current?.abort()
      activitiesAbortRef.current?.abort()
    }
  }, [fetchProject, fetchActivities])

  useEffect(() => {
    if (activeTab !== 'forms') return
    if (!formsLoaded) {
      fetchForms()
    }
    return () => {
      formsAbortRef.current?.abort()
    }
  }, [activeTab, formsLoaded, fetchForms])

  useEffect(() => {
    if (activeTab !== 'forms') return
    fetchSubmissions()
    return () => {
      submissionsAbortRef.current?.abort()
    }
  }, [activeTab, fetchSubmissions])

  useEffect(() => {
    if (activeTab !== 'search') return
    if (!searchIndexesLoaded) {
      fetchSearchIndexes()
    }
    return () => {
      searchIndexesAbortRef.current?.abort()
    }
  }, [activeTab, searchIndexesLoaded, fetchSearchIndexes])

  useEffect(() => {
    if (activeTab !== 'search') return
    fetchSearchQueries()
    return () => {
      searchQueriesAbortRef.current?.abort()
    }
  }, [activeTab, fetchSearchQueries])

  useEffect(() => {
    if (activeTab !== 'inbox') return
    if (!inboxLoaded) {
      fetchInboxData()
    }
    return () => {
      inboxAbortRef.current?.abort()
    }
  }, [activeTab, inboxLoaded, fetchInboxData])

  useEffect(() => {
    if (activeTab !== 'domains') return
    if (!domainsLoaded) {
      fetchDomainsData()
    }
    return () => {
      domainsAbortRef.current?.abort()
    }
  }, [activeTab, domainsLoaded, fetchDomainsData])

  // Format bytes
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
  }

  // Calculate usage percentage
  const getUsagePercent = (used: number, limit: number) => {
    if (limit === 0) return 0
    return Math.min(100, Math.round((used / limit) * 100))
  }

  // Handle project action
  const handleAction = async () => {
    if (!actionDialog.reason.trim()) {
      toast.error('Please provide a reason')
      return
    }

    setActionDialog(prev => ({ ...prev, loading: true }))

    try {
      const endpoint = actionDialog.type === 'suspend'
        ? `/api/admin/inhouse/projects/${projectId}/suspend`
        : `/api/admin/inhouse/projects/${projectId}/unsuspend`

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
        reason: '',
        loading: false,
      })

      fetchProject()
      fetchActivities()
    } catch (error) {
      console.error(`Failed to ${actionDialog.type} project:`, error)
      toast.error(error instanceof Error ? error.message : `Failed to ${actionDialog.type} project`)
      setActionDialog(prev => ({ ...prev, loading: false }))
    }
  }

  // Copy to clipboard
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    toast.success(`${label} copied to clipboard`)
  }

  // Status badge
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge variant="default" className="bg-green-500">Active</Badge>
      case 'suspended':
        return <Badge variant="destructive">Suspended</Badge>
      case 'deleted':
        return <Badge variant="secondary">Deleted</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  // Service badge
  const getServiceBadge = (service: string) => {
    const colors: Record<string, string> = {
      auth: 'bg-blue-500',
      db: 'bg-purple-500',
      storage: 'bg-green-500',
      jobs: 'bg-orange-500',
      email: 'bg-pink-500',
      payments: 'bg-emerald-500',
      analytics: 'bg-cyan-500',
      secrets: 'bg-red-500',
      backups: 'bg-yellow-500',
    }
    return (
      <Badge className={colors[service] || 'bg-gray-500'} variant="default">
        {service}
      </Badge>
    )
  }

  const getSubmissionStatusBadge = (status: FormSubmission['status']) => {
    const styles: Record<FormSubmission['status'], string> = {
      unread: 'bg-yellow-500',
      read: 'bg-green-500',
      archived: 'bg-gray-500',
      spam: 'bg-red-500',
      deleted: 'bg-slate-500',
    }
    return (
      <Badge className={styles[status]} variant="default">
        {status}
      </Badge>
    )
  }

  // Status indicator for activity
  const getActivityStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <span className="h-2 w-2 rounded-full bg-green-500" />
      case 'error':
        return <span className="h-2 w-2 rounded-full bg-red-500" />
      case 'pending':
        return <span className="h-2 w-2 rounded-full bg-yellow-500" />
      default:
        return <span className="h-2 w-2 rounded-full bg-gray-500" />
    }
  }

  const getSubmissionPreview = (data: Record<string, unknown>) => {
    const entries = Object.entries(data || {})
    if (entries.length === 0) return '-'
    const preview = entries
      .slice(0, 3)
      .map(([key, value]) => `${key}: ${String(value)}`)
      .join(', ')
    return preview.length > 80 ? `${preview.slice(0, 80)}…` : preview
  }

  const totalSubmissions = forms.reduce((sum, form) => sum + form.submissions_total, 0)
  const unreadSubmissions = forms.reduce((sum, form) => sum + form.submissions_unread, 0)

  const handleExportSubmissions = () => {
    if (submissionForm === 'all') {
      toast.error('Select a form to export')
      return
    }
    const params = new URLSearchParams({
      formName: submissionForm,
      format: submissionExportFormat,
    })
    if (submissionStatus !== 'all') params.set('status', submissionStatus)
    if (submissionStartDate) params.set('startDate', submissionStartDate)
    if (submissionEndDate) params.set('endDate', submissionEndDate)
    const url = `/api/admin/inhouse/projects/${projectId}/forms/submissions/export?${params.toString()}`
    window.location.href = url
  }

  const handleExportSearchQueries = () => {
    const params = new URLSearchParams({
      format: searchExportFormat,
    })
    if (searchIndexFilter !== 'all') params.set('indexName', searchIndexFilter)
    if (searchStartDate) params.set('startDate', searchStartDate)
    if (searchEndDate) params.set('endDate', searchEndDate)
    const url = `/api/admin/inhouse/projects/${projectId}/search/queries/export?${params.toString()}`
    window.location.href = url
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <FolderOpen className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground">Project not found</p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => router.push('/admin/inhouse/projects')}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Projects
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/admin/inhouse/projects')}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{project.name}</h1>
              {getStatusBadge(project.status)}
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
              <span className="font-mono">{project.id}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={() => copyToClipboard(project.id, 'Project ID')}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchProject}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          {project.status === 'active' ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setActionDialog({ open: true, type: 'suspend', reason: '', loading: false })}
            >
              <Pause className="h-4 w-4 mr-2" />
              Suspend
            </Button>
          ) : project.status === 'suspended' ? (
            <Button
              variant="default"
              size="sm"
              onClick={() => setActionDialog({ open: true, type: 'unsuspend', reason: '', loading: false })}
            >
              <Play className="h-4 w-4 mr-2" />
              Unsuspend
            </Button>
          ) : null}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="forms">Forms</TabsTrigger>
          <TabsTrigger value="search">Search</TabsTrigger>
          <TabsTrigger value="inbox">Inbox</TabsTrigger>
          <TabsTrigger value="domains">Domains</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Project Info */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FolderOpen className="h-5 w-5" />
                  Project Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Subdomain</Label>
                    <p className="font-medium">{project.subdomain || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Framework</Label>
                    <p className="font-medium">{project.framework || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Created</Label>
                    <p className="font-medium">
                      {format(new Date(project.created_at), 'PPp')}
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Updated</Label>
                    <p className="font-medium">
                      {formatDistanceToNow(new Date(project.updated_at), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Owner Info */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Owner
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-muted-foreground">Email</Label>
                  <p className="font-medium">{project.owner.email}</p>
                </div>
                {project.owner.full_name && (
                  <div>
                    <Label className="text-muted-foreground">Name</Label>
                    <p className="font-medium">{project.owner.full_name}</p>
                  </div>
                )}
                <div>
                  <Label className="text-muted-foreground">User ID</Label>
                  <p className="font-mono text-sm">{project.owner.id}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Plan</Label>
                  <p>
                    <Badge variant="outline">{project.plan.name || 'Free'}</Badge>
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Database Schema */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Database Schema
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Schema Name</Label>
                    <p className="font-mono text-sm">{project.schema.name || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Tables</Label>
                    <p className="font-medium">{project.schema.table_count}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Est. Rows</Label>
                    <p className="font-medium">{project.schema.row_count_estimate.toLocaleString()}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Size</Label>
                    <p className="font-medium">{formatBytes(project.schema.size_bytes)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Quick Stats */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Quick Stats
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <HardDrive className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Storage</p>
                      <p className="font-medium">{formatBytes(project.usage.storage_bytes)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Jobs</p>
                      <p className="font-medium">{project.usage.job_runs.toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Emails</p>
                      <p className="font-medium">{project.usage.email_sends.toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Key className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Secrets</p>
                      <p className="font-medium">{project.usage.secrets_count}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Usage Tab */}
        <TabsContent value="usage" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Storage Usage */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HardDrive className="h-5 w-5" />
                  Storage
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{formatBytes(project.usage.storage_bytes)}</span>
                  <span className="text-muted-foreground">
                    / {formatBytes(project.usage.storage_limit_bytes)}
                  </span>
                </div>
                <Progress
                  value={getUsagePercent(project.usage.storage_bytes, project.usage.storage_limit_bytes)}
                />
                <p className="text-sm text-muted-foreground">
                  {getUsagePercent(project.usage.storage_bytes, project.usage.storage_limit_bytes)}% used
                </p>
              </CardContent>
            </Card>

            {/* Jobs Usage */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Job Runs
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{project.usage.job_runs.toLocaleString()}</span>
                  <span className="text-muted-foreground">
                    / {project.usage.job_runs_limit.toLocaleString()}
                  </span>
                </div>
                <Progress
                  value={getUsagePercent(project.usage.job_runs, project.usage.job_runs_limit)}
                />
                <p className="text-sm text-muted-foreground">
                  {getUsagePercent(project.usage.job_runs, project.usage.job_runs_limit)}% used
                </p>
              </CardContent>
            </Card>

            {/* Email Usage */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  Email Sends
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{project.usage.email_sends.toLocaleString()}</span>
                  <span className="text-muted-foreground">
                    / {project.usage.email_sends_limit.toLocaleString()}
                  </span>
                </div>
                <Progress
                  value={getUsagePercent(project.usage.email_sends, project.usage.email_sends_limit)}
                />
                <p className="text-sm text-muted-foreground">
                  {getUsagePercent(project.usage.email_sends, project.usage.email_sends_limit)}% used
                </p>
              </CardContent>
            </Card>

            {/* Secrets Usage */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  Secrets
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{project.usage.secrets_count}</span>
                  <span className="text-muted-foreground">
                    / {project.usage.secrets_limit}
                  </span>
                </div>
                <Progress
                  value={getUsagePercent(project.usage.secrets_count, project.usage.secrets_limit)}
                />
                <p className="text-sm text-muted-foreground">
                  {getUsagePercent(project.usage.secrets_count, project.usage.secrets_limit)}% used
                </p>
              </CardContent>
            </Card>

            {/* Backup Storage */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Backup Storage
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{formatBytes(project.usage.backup_storage_bytes)}</span>
                  <span className="text-muted-foreground">
                    / {formatBytes(project.usage.backup_storage_limit_bytes)}
                  </span>
                </div>
                <Progress
                  value={getUsagePercent(project.usage.backup_storage_bytes, project.usage.backup_storage_limit_bytes)}
                />
                <p className="text-sm text-muted-foreground">
                  {getUsagePercent(project.usage.backup_storage_bytes, project.usage.backup_storage_limit_bytes)}% used
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Activity Tab */}
        <TabsContent value="activity" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Recent Activity
              </CardTitle>
              <CardDescription>
                Last 50 operations across all services
              </CardDescription>
            </CardHeader>
            <CardContent>
              {activitiesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : activities.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <Activity className="h-12 w-12 mb-2" />
                  <p>No activity recorded yet</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[100px]">Service</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activities.map((activity) => (
                      <TableRow key={activity.id}>
                        <TableCell>{getServiceBadge(activity.service)}</TableCell>
                        <TableCell>
                          <div>
                            <span className="font-medium">{activity.action}</span>
                            {activity.resource_type && (
                              <span className="text-muted-foreground text-sm ml-1">
                                ({activity.resource_type})
                              </span>
                            )}
                          </div>
                          {activity.error_code && (
                            <span className="text-xs text-red-500">{activity.error_code}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getActivityStatusIcon(activity.status)}
                            <span className="capitalize">{activity.status}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {activity.duration_ms ? `${activity.duration_ms}ms` : '-'}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {format(new Date(activity.created_at), 'HH:mm:ss')}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {format(new Date(activity.created_at), 'MMM d')}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Forms Tab */}
        <TabsContent value="forms" className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              <h3 className="text-lg font-semibold">Forms Overview</h3>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                fetchForms()
                fetchSubmissions()
              }}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Total Forms</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{forms.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Total Submissions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalSubmissions.toLocaleString()}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Unread Submissions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-600">{unreadSubmissions.toLocaleString()}</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Forms
              </CardTitle>
              <CardDescription>Form schemas and submission counts</CardDescription>
            </CardHeader>
            <CardContent>
              {formsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : forms.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mb-2" />
                  <p>No forms defined yet</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Submissions</TableHead>
                      <TableHead>Unread</TableHead>
                      <TableHead>Updated</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {forms.map((form) => (
                      <TableRow key={form.id}>
                        <TableCell>
                          <div className="font-medium">{form.name}</div>
                          {form.description && (
                            <div className="text-xs text-muted-foreground">{form.description}</div>
                          )}
                        </TableCell>
                        <TableCell>{form.submissions_total}</TableCell>
                        <TableCell>{form.submissions_unread}</TableCell>
                        <TableCell>{format(new Date(form.updated_at), 'PP')}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Inbox className="h-5 w-5" />
                  Recent Submissions
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Select value={submissionExportFormat} onValueChange={(value) => setSubmissionExportFormat(value as 'csv' | 'json')}>
                    <SelectTrigger className="w-[120px]">
                      <SelectValue placeholder="Format" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="csv">CSV</SelectItem>
                      <SelectItem value="json">JSON</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button size="sm" onClick={handleExportSubmissions} disabled={forms.length === 0}>
                    Export
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <Select value={submissionStatus} onValueChange={setSubmissionStatus}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="unread">Unread</SelectItem>
                    <SelectItem value="read">Read</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                    <SelectItem value="spam">Spam</SelectItem>
                    <SelectItem value="deleted">Deleted</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={submissionForm} onValueChange={setSubmissionForm}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Form" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All forms</SelectItem>
                    {forms.map((form) => (
                      <SelectItem key={form.id} value={form.name}>
                        {form.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="date"
                  value={submissionStartDate}
                  onChange={(e) => setSubmissionStartDate(e.target.value)}
                  className="w-[160px]"
                />
                <Input
                  type="date"
                  value={submissionEndDate}
                  onChange={(e) => setSubmissionEndDate(e.target.value)}
                  className="w-[160px]"
                />
              </div>
            </CardHeader>
            <CardContent>
              {submissionsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : submissions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <Inbox className="h-12 w-12 mb-2" />
                  <p>No submissions found</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Form</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Preview</TableHead>
                      <TableHead>Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {submissions.map((submission) => (
                      <TableRow key={submission.id}>
                        <TableCell className="font-medium">{submission.form_name}</TableCell>
                        <TableCell>{getSubmissionStatusBadge(submission.status)}</TableCell>
                        <TableCell className="max-w-[360px] truncate">
                          {getSubmissionPreview(submission.data)}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{format(new Date(submission.created_at), 'PPp')}</div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Search Tab */}
        <TabsContent value="search" className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              <h3 className="text-lg font-semibold">Search Overview</h3>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                fetchSearchIndexes()
                fetchSearchQueries()
              }}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Indexes
              </CardTitle>
              <CardDescription>Configured search indexes and document counts</CardDescription>
            </CardHeader>
            <CardContent>
              {searchIndexesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : searchIndexes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <Search className="h-12 w-12 mb-2" />
                  <p>No search indexes configured</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Language</TableHead>
                      <TableHead>Documents</TableHead>
                      <TableHead>Updated</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {searchIndexes.map((index) => (
                      <TableRow key={index.id}>
                        <TableCell className="font-medium">{index.name}</TableCell>
                        <TableCell>{index.language}</TableCell>
                        <TableCell>{index.document_count}</TableCell>
                        <TableCell>{format(new Date(index.updated_at), 'PP')}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Search className="h-5 w-5" />
                  Recent Queries
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Select value={searchExportFormat} onValueChange={(value) => setSearchExportFormat(value as 'csv' | 'json')}>
                    <SelectTrigger className="w-[120px]">
                      <SelectValue placeholder="Format" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="csv">CSV</SelectItem>
                      <SelectItem value="json">JSON</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button size="sm" onClick={handleExportSearchQueries}>
                    Export
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <Select value={searchIndexFilter} onValueChange={setSearchIndexFilter}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Index" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All indexes</SelectItem>
                    {searchIndexes.map((index) => (
                      <SelectItem key={index.id} value={index.name}>
                        {index.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="date"
                  value={searchStartDate}
                  onChange={(e) => setSearchStartDate(e.target.value)}
                  className="w-[160px]"
                />
                <Input
                  type="date"
                  value={searchEndDate}
                  onChange={(e) => setSearchEndDate(e.target.value)}
                  className="w-[160px]"
                />
              </div>
            </CardHeader>
            <CardContent>
              {searchQueriesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : searchQueries.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <Search className="h-12 w-12 mb-2" />
                  <p>No queries recorded</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Query</TableHead>
                      <TableHead>Index</TableHead>
                      <TableHead>Results</TableHead>
                      <TableHead>Latency</TableHead>
                      <TableHead>Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {searchQueries.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="max-w-[360px] truncate">{entry.query}</TableCell>
                        <TableCell>{entry.index_name}</TableCell>
                        <TableCell>{entry.result_count}</TableCell>
                        <TableCell>{entry.latency_ms} ms</TableCell>
                        <TableCell>{format(new Date(entry.created_at), 'PPp')}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Inbox Tab */}
        <TabsContent value="inbox" className="space-y-4">
          {inboxLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {inboxConfig && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Inbox className="h-5 w-5" />
                      Inbox Configuration
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      {inboxConfig.inboxAddress && (
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Address:</span>
                          <span className="font-mono text-xs">{inboxConfig.inboxAddress}</span>
                          <CopyButton value={inboxConfig.inboxAddress} size="icon" showToast={false} />
                        </div>
                      )}
                      <div>
                        <span className="text-muted-foreground">Auto-reply:</span>{' '}
                        <Badge variant={inboxConfig.autoReplyEnabled ? 'default' : 'outline'}>
                          {inboxConfig.autoReplyEnabled ? 'On' : 'Off'}
                        </Badge>
                      </div>
                      {inboxConfig.forwardTo && (
                        <div>
                          <span className="text-muted-foreground">Forward to:</span> {inboxConfig.forwardTo}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle>Recent Messages</CardTitle>
                  <CardDescription>Last 10 inbound messages</CardDescription>
                </CardHeader>
                <CardContent>
                  {inboxMessages.length === 0 ? (
                    <div className="text-sm text-muted-foreground py-4">No messages found</div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>From</TableHead>
                          <TableHead>Subject</TableHead>
                          <TableHead>Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {inboxMessages.map((msg: any) => (
                          <TableRow key={msg.id}>
                            <TableCell className="text-sm">
                              {msg.from_name || msg.from_email}
                            </TableCell>
                            <TableCell className="text-sm truncate max-w-[250px]">
                              {msg.subject || '(no subject)'}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                              {msg.received_at ? formatDistanceToNow(new Date(msg.received_at), { addSuffix: true }) : '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                  <div className="mt-3">
                    <Button
                      variant="link"
                      size="sm"
                      className="px-0"
                      onClick={() => router.push(`/admin/inhouse/inbox?projectId=${projectId}`)}
                    >
                      View all messages →
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* Domains Tab */}
        <TabsContent value="domains" className="space-y-4">
          {domainsLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Mail className="h-5 w-5" />
                    Email Domains
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {emailDomains.length === 0 ? (
                    <div className="text-sm text-muted-foreground py-4">No email domains configured</div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Domain</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>DNS</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {emailDomains.map((d: any) => (
                          <TableRow key={d.id}>
                            <TableCell className="font-medium text-sm">{d.domain}</TableCell>
                            <TableCell>
                              <Badge variant={d.status === 'verified' ? 'default' : d.status === 'error' ? 'destructive' : 'outline'}>
                                {d.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <DnsStatusIndicator dnsStatus={d.dns_status || {}} compact />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              {registeredDomains.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Registered Domains</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Domain</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Expires</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {registeredDomains.map((d: any) => (
                          <TableRow key={d.id}>
                            <TableCell className="font-medium text-sm">{d.domain}</TableCell>
                            <TableCell>
                              <Badge variant={d.status === 'active' ? 'default' : 'destructive'}>
                                {d.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {d.expires_at ? format(new Date(d.expires_at), 'PP') : '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {mailboxCount} mailbox{mailboxCount !== 1 ? 'es' : ''} provisioned
                    </span>
                    <Button
                      variant="link"
                      size="sm"
                      className="px-0"
                      onClick={() => router.push(`/admin/inhouse/domains?projectId=${projectId}`)}
                    >
                      Manage domains →
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Suspend/Unsuspend Dialog */}
      <Dialog
        open={actionDialog.open}
        onOpenChange={(open) => {
          if (!open && !actionDialog.loading) {
            setActionDialog({
              open: false,
              type: 'suspend',
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

          <div className="py-4">
            <div className="rounded-md bg-muted p-3 mb-4">
              <div className="font-medium">{project.name}</div>
              <div className="text-sm text-muted-foreground">{project.owner.email}</div>
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
