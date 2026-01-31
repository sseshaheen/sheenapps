/**
 * In-House AI Assistant Admin Dashboard Component
 * Manages OpenClaw AI Assistant configuration across projects
 */

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import {
  Bot,
  MessageSquare,
  Send,
  Plug,
  AlertTriangle,
  RefreshCw,
  Copy,
  Check,
  Power,
  Wifi,
  WifiOff,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'

// =============================================================================
// TYPES
// =============================================================================

interface ChannelStatus {
  id: string
  status: 'connected' | 'disconnected' | 'error' | 'not_configured'
  connectedAt?: string
  lastMessageAt?: string
  messageCount24h: number
  errorMessage?: string
}

interface OpenClawConfig {
  projectId: string
  enabled: boolean
  killSwitchActive: boolean
  config: {
    defaultLocale: string
    businessHours: {
      timezone: string
      schedule: Array<{
        dayOfWeek: number
        startTime: string
        endTime: string
      }>
    } | null
    handoffSettings: {
      enabled: boolean
      keywords?: string[]
      message?: string
    } | null
    channels: {
      telegram: { enabled: boolean; botTokenConfigured?: boolean }
      webchat: { enabled: boolean; allowedOrigins?: string[] }
      whatsapp: { enabled: boolean }
    }
  }
}

interface OpenClawMetrics {
  projectId: string
  period: { days: number; startDate: string }
  channels: ChannelStatus[]
  totals: {
    messagesReceived: number
    messagesSent: number
    leadsCreated: number
    toolCalls: number
    errors: number
  }
  topQueries: Array<{ query: string; count: number }>
}

interface OpenClawHealth {
  projectId: string
  gatewayStatus: 'healthy' | 'degraded' | 'down' | 'not_provisioned'
  channels: Array<{
    id: string
    status: 'ok' | 'warning' | 'error'
    message?: string
    lastChecked: string
  }>
  killSwitch: {
    enabled: boolean
    enabledAt?: string | null
    reason?: string | null
  }
  lastHealthCheck: string
}

interface Project {
  id: string
  name: string
  owner_email?: string
}

interface OpenClawUsage {
  projectId: string
  billingPeriod: {
    start: string
    end: string
  }
  messages: {
    received: number
    sent: number
    limit: number
  }
  tokens: {
    prompt: number
    completion: number
    total: number
    limit: number
  }
  estimatedCostCents: number
  tier: {
    key: string
    name: string
    basePriceCents: number
  } | null
}

interface FeatureFlags {
  whatsappBetaEnabled: boolean
  openclawEnabled: boolean
}

// =============================================================================
// COMPONENT
// =============================================================================

export function InhouseAIAssistant() {
  // Project selection
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [projectsLoading, setProjectsLoading] = useState(true)

  // Config state
  const [config, setConfig] = useState<OpenClawConfig | null>(null)
  const [configLoading, setConfigLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // Metrics state
  const [metrics, setMetrics] = useState<OpenClawMetrics | null>(null)
  const [metricsLoading, setMetricsLoading] = useState(false)

  // Health state
  const [health, setHealth] = useState<OpenClawHealth | null>(null)
  const [healthLoading, setHealthLoading] = useState(false)

  // Usage & billing state
  const [usage, setUsage] = useState<OpenClawUsage | null>(null)
  const [usageLoading, setUsageLoading] = useState(false)

  // Feature flags state
  const [featureFlags, setFeatureFlags] = useState<FeatureFlags>({
    whatsappBetaEnabled: false,
    openclawEnabled: true,
  })

  // UI state
  const [activeTab, setActiveTab] = useState('overview')
  const [telegramDialogOpen, setTelegramDialogOpen] = useState(false)
  const [telegramToken, setTelegramToken] = useState('')
  const [embedCodeCopied, setEmbedCodeCopied] = useState(false)
  const [embedCode, setEmbedCode] = useState('')
  const [killSwitchDialogOpen, setKillSwitchDialogOpen] = useState(false)
  const [killSwitchReason, setKillSwitchReason] = useState('')

  const abortRef = useRef<AbortController | null>(null)

  // -------------------------------------------------------------------------
  // Fetch projects
  // -------------------------------------------------------------------------
  const fetchProjects = useCallback(async () => {
    setProjectsLoading(true)
    try {
      const response = await fetch('/api/admin/inhouse/projects?limit=100')
      if (!response.ok) throw new Error('Failed to fetch projects')
      const data = await response.json()
      setProjects(data.data?.projects || [])
      // Auto-select first project if none selected
      if (data.data?.projects?.length > 0 && !selectedProjectId) {
        setSelectedProjectId(data.data.projects[0].id)
      }
    } catch (error) {
      console.error('Failed to fetch projects:', error)
      toast.error('Failed to load projects')
    } finally {
      setProjectsLoading(false)
    }
  }, [selectedProjectId])

  // -------------------------------------------------------------------------
  // Fetch config
  // -------------------------------------------------------------------------
  const fetchConfig = useCallback(async (projectId: string) => {
    if (!projectId) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setConfigLoading(true)
    try {
      const response = await fetch(
        `/api/admin/inhouse/openclaw/config?projectId=${encodeURIComponent(projectId)}`,
        { signal: controller.signal }
      )
      if (!response.ok) throw new Error('Failed to fetch config')
      const data = await response.json()
      setConfig(data.data || null)
    } catch (error) {
      if ((error as Error)?.name !== 'AbortError') {
        console.error('Failed to fetch OpenClaw config:', error)
        toast.error('Failed to load AI Assistant config')
      }
    } finally {
      setConfigLoading(false)
    }
  }, [])

  // -------------------------------------------------------------------------
  // Fetch metrics
  // -------------------------------------------------------------------------
  const fetchMetrics = useCallback(async (projectId: string) => {
    if (!projectId) return

    setMetricsLoading(true)
    try {
      const response = await fetch(
        `/api/admin/inhouse/openclaw/metrics?projectId=${encodeURIComponent(projectId)}&days=7`
      )
      if (!response.ok) throw new Error('Failed to fetch metrics')
      const data = await response.json()
      setMetrics(data.data || null)
    } catch (error) {
      console.error('Failed to fetch OpenClaw metrics:', error)
    } finally {
      setMetricsLoading(false)
    }
  }, [])

  // -------------------------------------------------------------------------
  // Fetch health
  // -------------------------------------------------------------------------
  const fetchHealth = useCallback(async (projectId: string) => {
    if (!projectId) return

    setHealthLoading(true)
    try {
      const response = await fetch(
        `/api/admin/inhouse/openclaw/health?projectId=${encodeURIComponent(projectId)}`
      )
      if (!response.ok) throw new Error('Failed to fetch health')
      const data = await response.json()
      setHealth(data.data || null)
    } catch (error) {
      console.error('Failed to fetch OpenClaw health:', error)
    } finally {
      setHealthLoading(false)
    }
  }, [])

  // -------------------------------------------------------------------------
  // Fetch usage
  // -------------------------------------------------------------------------
  const fetchUsage = useCallback(async (projectId: string) => {
    if (!projectId) return

    setUsageLoading(true)
    try {
      const response = await fetch(
        `/api/admin/inhouse/openclaw/usage?projectId=${encodeURIComponent(projectId)}`
      )
      if (!response.ok) throw new Error('Failed to fetch usage')
      const data = await response.json()
      setUsage(data.data || null)
    } catch (error) {
      console.error('Failed to fetch OpenClaw usage:', error)
    } finally {
      setUsageLoading(false)
    }
  }, [])

  // -------------------------------------------------------------------------
  // Fetch feature flags
  // -------------------------------------------------------------------------
  const fetchFeatureFlags = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/inhouse/openclaw/feature-flags')
      if (!response.ok) throw new Error('Failed to fetch feature flags')
      const data = await response.json()
      setFeatureFlags({
        whatsappBetaEnabled: data.data?.whatsappBetaEnabled ?? false,
        openclawEnabled: data.data?.openclawEnabled ?? true,
      })
    } catch (error) {
      console.error('Failed to fetch feature flags:', error)
    }
  }, [])

  // -------------------------------------------------------------------------
  // Toggle enabled
  // -------------------------------------------------------------------------
  const toggleEnabled = async (enabled: boolean) => {
    if (!selectedProjectId) return

    setSaving(true)
    try {
      const response = await fetch('/api/admin/inhouse/openclaw/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: selectedProjectId, enabled }),
      })
      if (!response.ok) throw new Error('Failed to update config')

      toast.success(enabled ? 'AI Assistant enabled' : 'AI Assistant disabled')
      await fetchConfig(selectedProjectId)
      await fetchHealth(selectedProjectId)
    } catch (error) {
      console.error('Failed to toggle AI Assistant:', error)
      toast.error('Failed to update AI Assistant')
    } finally {
      setSaving(false)
    }
  }

  // -------------------------------------------------------------------------
  // Connect Telegram
  // -------------------------------------------------------------------------
  const connectTelegram = async () => {
    if (!selectedProjectId || !telegramToken) return

    setSaving(true)
    try {
      const response = await fetch('/api/admin/inhouse/openclaw/channels/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: selectedProjectId, botToken: telegramToken }),
      })
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to connect Telegram')
      }

      toast.success('Telegram bot connected successfully')
      setTelegramDialogOpen(false)
      setTelegramToken('')
      await fetchConfig(selectedProjectId)
      await fetchHealth(selectedProjectId)
    } catch (error) {
      console.error('Failed to connect Telegram:', error)
      toast.error((error as Error).message || 'Failed to connect Telegram')
    } finally {
      setSaving(false)
    }
  }

  // -------------------------------------------------------------------------
  // Generate embed code
  // -------------------------------------------------------------------------
  const generateEmbedCode = async () => {
    if (!selectedProjectId) return

    try {
      const response = await fetch(
        `/api/admin/inhouse/openclaw/embed-code?projectId=${encodeURIComponent(selectedProjectId)}`
      )
      if (!response.ok) throw new Error('Failed to generate embed code')
      const data = await response.json()
      setEmbedCode(data.data?.embedCode || '')
    } catch (error) {
      console.error('Failed to generate embed code:', error)
      toast.error('Failed to generate embed code')
    }
  }

  // -------------------------------------------------------------------------
  // Copy embed code
  // -------------------------------------------------------------------------
  const copyEmbedCode = async () => {
    if (!embedCode) return
    await navigator.clipboard.writeText(embedCode)
    setEmbedCodeCopied(true)
    toast.success('Embed code copied to clipboard')
    setTimeout(() => setEmbedCodeCopied(false), 2000)
  }

  // -------------------------------------------------------------------------
  // Toggle kill switch
  // -------------------------------------------------------------------------
  const toggleKillSwitch = async (enabled: boolean) => {
    if (!selectedProjectId) return
    if (enabled && !killSwitchReason.trim()) {
      toast.error('Please provide a reason for enabling the kill switch')
      return
    }

    setSaving(true)
    try {
      const response = await fetch('/api/admin/inhouse/openclaw/kill-switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProjectId,
          enabled,
          reason: killSwitchReason,
        }),
      })
      if (!response.ok) throw new Error('Failed to update kill switch')

      toast.success(enabled ? 'Kill switch enabled' : 'Kill switch disabled')
      setKillSwitchDialogOpen(false)
      setKillSwitchReason('')
      await fetchConfig(selectedProjectId)
      await fetchHealth(selectedProjectId)
    } catch (error) {
      console.error('Failed to toggle kill switch:', error)
      toast.error('Failed to update kill switch')
    } finally {
      setSaving(false)
    }
  }

  // -------------------------------------------------------------------------
  // Effects
  // -------------------------------------------------------------------------
  useEffect(() => {
    fetchProjects()
    fetchFeatureFlags()
  }, [fetchProjects, fetchFeatureFlags])

  useEffect(() => {
    if (selectedProjectId) {
      fetchConfig(selectedProjectId)
      fetchMetrics(selectedProjectId)
      fetchHealth(selectedProjectId)
      fetchUsage(selectedProjectId)
    }
  }, [selectedProjectId, fetchConfig, fetchMetrics, fetchHealth, fetchUsage])

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'connected':
      case 'healthy':
      case 'ok':
        return <Badge variant="default" className="bg-green-600">Connected</Badge>
      case 'disconnected':
      case 'not_configured':
        return <Badge variant="secondary">Not Configured</Badge>
      case 'error':
      case 'degraded':
        return <Badge variant="destructive">Error</Badge>
      case 'down':
        return <Badge variant="destructive">Down</Badge>
      case 'not_provisioned':
        return <Badge variant="secondary">Not Provisioned</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const selectedProject = projects.find(p => p.id === selectedProjectId)

  // -------------------------------------------------------------------------
  // RENDER
  // -------------------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Project Selector */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            AI Assistant Management
          </CardTitle>
          <CardDescription>
            Configure OpenClaw AI Assistant for customer support across channels
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex-1 max-w-sm">
              <Label htmlFor="project-select">Select Project</Label>
              <Select
                value={selectedProjectId}
                onValueChange={setSelectedProjectId}
                disabled={projectsLoading}
              >
                <SelectTrigger id="project-select">
                  <SelectValue placeholder="Select a project..." />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                if (selectedProjectId) {
                  fetchConfig(selectedProjectId)
                  fetchMetrics(selectedProjectId)
                  fetchHealth(selectedProjectId)
                }
              }}
              disabled={!selectedProjectId || configLoading}
            >
              <RefreshCw className={`h-4 w-4 ${configLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardContent>
      </Card>

      {selectedProjectId && config && (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="channels" className="flex items-center gap-2">
              <Plug className="h-4 w-4" />
              Channels
            </TabsTrigger>
            <TabsTrigger value="metrics" className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Metrics
            </TabsTrigger>
            <TabsTrigger value="config" className="flex items-center gap-2">
              <Bot className="h-4 w-4" />
              Config
            </TabsTrigger>
          </TabsList>

          {/* OVERVIEW TAB */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {/* Enable/Disable Card */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">AI Assistant</CardTitle>
                  <Switch
                    checked={config.enabled}
                    onCheckedChange={toggleEnabled}
                    disabled={saving || config.killSwitchActive}
                  />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {config.enabled ? 'Enabled' : 'Disabled'}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {config.killSwitchActive ? 'Kill switch active' : 'Toggle to enable/disable'}
                  </p>
                </CardContent>
              </Card>

              {/* Gateway Status */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Gateway Status</CardTitle>
                  {health?.gatewayStatus === 'healthy' ? (
                    <Wifi className="h-4 w-4 text-green-600" />
                  ) : (
                    <WifiOff className="h-4 w-4 text-muted-foreground" />
                  )}
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold capitalize">
                    {health?.gatewayStatus || 'Unknown'}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {health?.lastHealthCheck
                      ? `Last check: ${new Date(health.lastHealthCheck).toLocaleTimeString()}`
                      : 'No health data'}
                  </p>
                </CardContent>
              </Card>

              {/* Messages Today */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Messages (7d)</CardTitle>
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {(metrics?.totals.messagesReceived || 0) + (metrics?.totals.messagesSent || 0)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {metrics?.totals.messagesReceived || 0} received, {metrics?.totals.messagesSent || 0} sent
                  </p>
                </CardContent>
              </Card>

              {/* Leads Created */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Leads Created (7d)</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {metrics?.totals.leadsCreated || 0}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    From AI conversations
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Kill Switch Card */}
            {config.killSwitchActive && (
              <Card className="border-destructive">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-destructive">
                    <AlertTriangle className="h-5 w-5" />
                    Kill Switch Active
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    The AI Assistant is currently disabled via kill switch.
                    {health?.killSwitch.reason && (
                      <> Reason: {health.killSwitch.reason}</>
                    )}
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => toggleKillSwitch(false)}
                    disabled={saving}
                  >
                    Disable Kill Switch
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Channel Status Overview */}
            <Card>
              <CardHeader>
                <CardTitle>Channel Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-3">
                  {['telegram', 'webchat', 'whatsapp'].map((channel) => {
                    const channelStatus = metrics?.channels.find(c => c.id === channel)
                    const channelConfig = config.config.channels[channel as keyof typeof config.config.channels]
                    return (
                      <div key={channel} className="flex items-center justify-between p-4 border rounded-lg">
                        <div>
                          <p className="font-medium capitalize">{channel}</p>
                          <p className="text-sm text-muted-foreground">
                            {channelStatus?.messageCount24h || 0} messages (24h)
                          </p>
                        </div>
                        {getStatusBadge(channelStatus?.status || 'not_configured')}
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* CHANNELS TAB */}
          <TabsContent value="channels" className="space-y-4">
            {/* Telegram */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Send className="h-5 w-5" />
                  Telegram
                </CardTitle>
                <CardDescription>
                  Connect a Telegram bot to receive and respond to messages
                </CardDescription>
              </CardHeader>
              <CardContent>
                {config.config.channels.telegram.botTokenConfigured ? (
                  <div className="flex items-center justify-between">
                    <div>
                      <Badge variant="default" className="bg-green-600">Connected</Badge>
                      <p className="text-sm text-muted-foreground mt-1">
                        Bot token configured
                      </p>
                    </div>
                    <Button variant="outline" onClick={() => setTelegramDialogOpen(true)}>
                      Reconfigure
                    </Button>
                  </div>
                ) : (
                  <Button onClick={() => setTelegramDialogOpen(true)}>
                    <Plug className="h-4 w-4 mr-2" />
                    Connect Telegram Bot
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* WebChat */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  WebChat
                </CardTitle>
                <CardDescription>
                  Embed a chat widget on your website
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button onClick={generateEmbedCode} disabled={!config.enabled}>
                  Generate Embed Code
                </Button>
                {embedCode && (
                  <div className="space-y-2">
                    <div className="relative">
                      <pre className="p-4 bg-muted rounded-lg text-xs overflow-x-auto">
                        {embedCode}
                      </pre>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute top-2 right-2"
                        onClick={copyEmbedCode}
                      >
                        {embedCodeCopied ? (
                          <Check className="h-4 w-4 text-green-600" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Add this code before the closing &lt;/body&gt; tag on your website.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* WhatsApp */}
            <Card className={featureFlags.whatsappBetaEnabled ? '' : 'opacity-75'}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  WhatsApp
                  <Badge variant="destructive" className="text-xs">Beta</Badge>
                </CardTitle>
                <CardDescription>
                  Connect WhatsApp Business for customer messaging
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {featureFlags.whatsappBetaEnabled ? (
                  <>
                    {/* Beta Disclaimer */}
                    <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-500 mt-0.5 flex-shrink-0" />
                        <div className="text-sm">
                          <p className="font-medium text-yellow-800 dark:text-yellow-400">
                            Beta Reliability Warning
                          </p>
                          <p className="text-yellow-700 dark:text-yellow-500 mt-1">
                            WhatsApp integration uses unofficial APIs and may experience:
                          </p>
                          <ul className="list-disc list-inside text-yellow-700 dark:text-yellow-500 mt-1 space-y-0.5">
                            <li>Session disconnections requiring re-authentication</li>
                            <li>Potential account restrictions from WhatsApp</li>
                            <li>Message delivery delays during high load</li>
                          </ul>
                          <p className="text-yellow-700 dark:text-yellow-500 mt-2">
                            For production workloads, we recommend Telegram + WebChat.
                          </p>
                        </div>
                      </div>
                    </div>

                    {config?.config.channels.whatsapp.enabled ? (
                      <div className="flex items-center gap-2">
                        <Badge variant="default" className="bg-green-600">Connected</Badge>
                        <span className="text-sm text-muted-foreground">
                          WhatsApp is active for this project
                        </span>
                      </div>
                    ) : (
                      <Button variant="outline" disabled>
                        <Plug className="h-4 w-4 mr-2" />
                        Request WhatsApp Setup
                      </Button>
                    )}
                  </>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      WhatsApp integration is in limited beta. Available for Enterprise tier only.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Contact support to request access.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* METRICS TAB */}
          <TabsContent value="metrics" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {/* Totals */}
              <Card>
                <CardHeader>
                  <CardTitle>Activity (Last 7 Days)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Messages Received</span>
                      <span className="font-medium">{metrics?.totals.messagesReceived || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Messages Sent</span>
                      <span className="font-medium">{metrics?.totals.messagesSent || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Leads Created</span>
                      <span className="font-medium">{metrics?.totals.leadsCreated || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tool Calls</span>
                      <span className="font-medium">{metrics?.totals.toolCalls || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Errors</span>
                      <span className="font-medium text-destructive">{metrics?.totals.errors || 0}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Top Queries */}
              <Card>
                <CardHeader>
                  <CardTitle>Top Queries</CardTitle>
                </CardHeader>
                <CardContent>
                  {metrics?.topQueries && metrics.topQueries.length > 0 ? (
                    <div className="space-y-2">
                      {metrics.topQueries.slice(0, 5).map((q, i) => (
                        <div key={i} className="flex justify-between items-center">
                          <span className="text-sm truncate flex-1">{q.query}</span>
                          <Badge variant="secondary">{q.count}</Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No query data available</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Usage & Billing */}
            <Card>
              <CardHeader>
                <CardTitle>Usage & Billing</CardTitle>
                <CardDescription>
                  Current billing period usage and limits
                  {usage?.billingPeriod && (
                    <span className="ml-2 text-xs">
                      ({new Date(usage.billingPeriod.start).toLocaleDateString()} - {new Date(usage.billingPeriod.end).toLocaleDateString()})
                    </span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {usageLoading ? (
                  <div className="text-center py-4 text-muted-foreground">Loading usage data...</div>
                ) : usage ? (
                  <div className="space-y-6">
                    {/* Tier Info */}
                    {usage.tier && (
                      <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <div>
                          <p className="font-medium">{usage.tier.name}</p>
                          <p className="text-sm text-muted-foreground">Current plan</p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">${(usage.tier.basePriceCents / 100).toFixed(2)}/mo</p>
                          <p className="text-sm text-muted-foreground">Base price</p>
                        </div>
                      </div>
                    )}

                    {/* Messages Usage */}
                    <div>
                      <div className="flex justify-between mb-2">
                        <span className="text-sm font-medium">Messages</span>
                        <span className="text-sm text-muted-foreground">
                          {(usage.messages.received + usage.messages.sent).toLocaleString()} / {usage.messages.limit.toLocaleString()}
                        </span>
                      </div>
                      <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            ((usage.messages.received + usage.messages.sent) / usage.messages.limit) > 0.9
                              ? 'bg-destructive'
                              : ((usage.messages.received + usage.messages.sent) / usage.messages.limit) > 0.7
                              ? 'bg-yellow-500'
                              : 'bg-green-500'
                          }`}
                          style={{
                            width: `${Math.min(100, ((usage.messages.received + usage.messages.sent) / usage.messages.limit) * 100)}%`
                          }}
                        />
                      </div>
                      <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                        <span>{usage.messages.received.toLocaleString()} received</span>
                        <span>{usage.messages.sent.toLocaleString()} sent</span>
                      </div>
                    </div>

                    {/* Tokens Usage */}
                    <div>
                      <div className="flex justify-between mb-2">
                        <span className="text-sm font-medium">Tokens</span>
                        <span className="text-sm text-muted-foreground">
                          {(usage.tokens.total / 1000).toFixed(1)}K / {(usage.tokens.limit / 1000).toFixed(0)}K
                        </span>
                      </div>
                      <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            (usage.tokens.total / usage.tokens.limit) > 0.9
                              ? 'bg-destructive'
                              : (usage.tokens.total / usage.tokens.limit) > 0.7
                              ? 'bg-yellow-500'
                              : 'bg-green-500'
                          }`}
                          style={{
                            width: `${Math.min(100, (usage.tokens.total / usage.tokens.limit) * 100)}%`
                          }}
                        />
                      </div>
                      <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                        <span>{(usage.tokens.prompt / 1000).toFixed(1)}K prompt</span>
                        <span>{(usage.tokens.completion / 1000).toFixed(1)}K completion</span>
                      </div>
                    </div>

                    {/* Estimated Cost */}
                    <div className="flex justify-between items-center pt-4 border-t">
                      <span className="font-medium">Estimated Cost This Period</span>
                      <span className="text-lg font-bold">
                        ${(usage.estimatedCostCents / 100).toFixed(2)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4 text-muted-foreground">
                    No usage data available. Enable AI Assistant to start tracking.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* CONFIG TAB */}
          <TabsContent value="config" className="space-y-4">
            {/* Locale */}
            <Card>
              <CardHeader>
                <CardTitle>Default Locale</CardTitle>
                <CardDescription>
                  The default language for AI responses
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Select
                  value={config.config.defaultLocale}
                  disabled={true}
                >
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ar">Arabic (العربية)</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="ar-eg">Arabic (Egypt)</SelectItem>
                    <SelectItem value="ar-sa">Arabic (Saudi Arabia)</SelectItem>
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>

            {/* Kill Switch */}
            <Card className="border-destructive/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Power className="h-5 w-5" />
                  Kill Switch
                </CardTitle>
                <CardDescription>
                  Emergency disable for the AI Assistant
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm">
                      {config.killSwitchActive ? 'Kill switch is active' : 'Kill switch is disabled'}
                    </p>
                    {health?.killSwitch.reason && (
                      <p className="text-sm text-muted-foreground">
                        Reason: {health.killSwitch.reason}
                      </p>
                    )}
                  </div>
                  <Button
                    variant={config.killSwitchActive ? 'outline' : 'destructive'}
                    onClick={() => {
                      if (config.killSwitchActive) {
                        toggleKillSwitch(false)
                      } else {
                        setKillSwitchDialogOpen(true)
                      }
                    }}
                    disabled={saving}
                  >
                    {config.killSwitchActive ? 'Disable Kill Switch' : 'Enable Kill Switch'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* Telegram Dialog */}
      <Dialog open={telegramDialogOpen} onOpenChange={setTelegramDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect Telegram Bot</DialogTitle>
            <DialogDescription>
              Enter your Telegram bot token from @BotFather
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="telegram-token">Bot Token</Label>
              <Input
                id="telegram-token"
                type="password"
                placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                value={telegramToken}
                onChange={(e) => setTelegramToken(e.target.value)}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              1. Open Telegram and message @BotFather<br />
              2. Send /newbot and follow the prompts<br />
              3. Copy the bot token and paste it here
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTelegramDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={connectTelegram} disabled={saving || !telegramToken}>
              {saving ? 'Connecting...' : 'Connect'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Kill Switch Dialog */}
      <Dialog open={killSwitchDialogOpen} onOpenChange={setKillSwitchDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enable Kill Switch</DialogTitle>
            <DialogDescription>
              This will immediately disable the AI Assistant for this project.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="kill-reason">Reason (required)</Label>
              <Textarea
                id="kill-reason"
                placeholder="Explain why you're enabling the kill switch..."
                value={killSwitchReason}
                onChange={(e) => setKillSwitchReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setKillSwitchDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => toggleKillSwitch(true)}
              disabled={saving || !killSwitchReason.trim()}
            >
              {saving ? 'Enabling...' : 'Enable Kill Switch'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
