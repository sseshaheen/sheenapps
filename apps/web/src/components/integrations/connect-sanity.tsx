/**
 * Sanity CMS Integration Component for Workspace Builder
 * Allows users to connect their Sanity projects to their workspace
 * Simplified UI optimized for the builder settings panel
 */

'use client'

import { useState } from 'react'
import { useSanityConnections, useSanityConnection } from '@/hooks/use-sanity-connection'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Database,
  Plus,
  CheckCircle,
  AlertCircle,
  Loader2,
  Trash2,
  ExternalLink
} from 'lucide-react'
import type { CreateSanityConnectionRequest, SanityConnection } from '@/types/sanity-integration'

interface ConnectSanityProps {
  projectId: string
  className?: string
}

type SetupMode = 'list' | 'create' | 'view'

export function ConnectSanity({ projectId, className }: ConnectSanityProps) {
  const [mode, setMode] = useState<SetupMode>('list')
  // Track which specific connection is being deleted (not global boolean - expert review fix)
  const [deletingConnectionId, setDeletingConnectionId] = useState<string | null>(null)
  const [formData, setFormData] = useState<CreateSanityConnectionRequest>({
    sanity_project_id: '',
    dataset_name: 'production',
    project_title: '',
    auth_token: '',
    api_version: '2023-05-03',
    use_cdn: true,
    perspective: 'published',
    realtime_enabled: true
  })

  const {
    connections,
    isLoading: isLoadingConnections,
    error: connectionsError,
    refetch: refetchConnections
  } = useSanityConnections(projectId)

  const {
    testConnection,
    createConnection,
    isTestingConnection,
    isCreatingConnection,
    testResult,
    testError,
    createError
  } = useSanityConnection()

  // Get active connections for this project
  // Defensive: connections can be undefined during loading/error (expert review fix)
  const safeConnections = connections ?? []
  const activeConnections = safeConnections.filter(conn =>
    conn.project_id === projectId && conn.status === 'connected'
  )

  const updateFormData = (field: keyof CreateSanityConnectionRequest, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleTestConnection = () => {
    if (!formData.sanity_project_id || !formData.dataset_name || !formData.auth_token) {
      return
    }

    testConnection({
      projectId: formData.sanity_project_id,
      dataset: formData.dataset_name,
      apiVersion: formData.api_version,
      token: formData.auth_token,
      useCdn: formData.use_cdn,
      perspective: formData.perspective
    })
  }

  const handleCreateConnection = () => {
    if (!testResult?.success) return

    createConnection({
      ...formData,
      project_id: projectId
    }, {
      onSuccess: () => {
        setMode('list')
        setFormData({
          sanity_project_id: '',
          dataset_name: 'production',
          project_title: '',
          auth_token: '',
          api_version: '2023-05-03',
          use_cdn: true,
          perspective: 'published',
          realtime_enabled: true
        })
        refetchConnections()
      }
    })
  }

  // Fix per expert review: properly pass connectionId and await completion before refetch
  // Uses per-item tracking to only show spinner on the card being deleted
  const handleDeleteConnection = async (connectionIdToDelete: string) => {
    if (!window.confirm('Are you sure you want to disconnect this Sanity project?')) {
      return
    }

    setDeletingConnectionId(connectionIdToDelete)
    try {
      // Direct API call since useSanityConnection expects connectionId at hook level
      const response = await fetch(`/api/sanity/connections/${connectionIdToDelete}`, {
        method: 'DELETE',
        credentials: 'include', // Ensure auth cookies are sent
        headers: { 'Content-Type': 'application/json' }
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to delete connection')
      }

      // Only refetch after delete completes successfully
      refetchConnections()
    } catch (error) {
      console.error('Failed to delete Sanity connection:', error)
    } finally {
      setDeletingConnectionId(null)
    }
  }

  const getStatusIcon = (status: SanityConnection['status']) => {
    switch (status) {
      case 'connected':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'disconnected':
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />
      default:
        return <AlertCircle className="h-4 w-4 text-orange-500" />
    }
  }

  if (mode === 'create') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-medium">Connect Sanity Project</h4>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMode('list')}
          >
            ← Back
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Project Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="sanity_project_id">Project ID *</Label>
                <Input
                  id="sanity_project_id"
                  value={formData.sanity_project_id}
                  onChange={(e) => updateFormData('sanity_project_id', e.target.value)}
                  placeholder="abc123def"
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="dataset_name">Dataset *</Label>
                <Select
                  value={formData.dataset_name}
                  onValueChange={(value) => updateFormData('dataset_name', value)}
                >
                  <SelectTrigger id="dataset_name">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="production">production</SelectItem>
                    <SelectItem value="staging">staging</SelectItem>
                    <SelectItem value="development">development</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="project_title">Display Name</Label>
              <Input
                id="project_title"
                value={formData.project_title}
                onChange={(e) => updateFormData('project_title', e.target.value)}
                placeholder="My Blog Content"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="auth_token">API Token *</Label>
              <Input
                id="auth_token"
                type="password"
                value={formData.auth_token}
                onChange={(e) => updateFormData('auth_token', e.target.value)}
                placeholder="sk..."
                required
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="realtime_enabled">Real-time Sync</Label>
                <div className="text-xs text-muted-foreground">
                  Automatically update content via webhooks
                </div>
              </div>
              <Switch
                id="realtime_enabled"
                checked={formData.realtime_enabled}
                onCheckedChange={(checked) => updateFormData('realtime_enabled', checked)}
              />
            </div>

            {/* Test Result */}
            {testResult && (
              <Alert className={testResult.success ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}>
                {testResult.success ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-red-600" />
                )}
                <AlertDescription className={testResult.success ? "text-green-800" : "text-red-800"}>
                  {testResult.message}
                </AlertDescription>
              </Alert>
            )}

            {(testError || createError) && (
              <Alert className="border-red-200 bg-red-50">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <AlertDescription className="text-red-800">
                  {(testError || createError)?.message}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex gap-2 pt-2">
              <Button
                onClick={handleTestConnection}
                disabled={!formData.sanity_project_id || !formData.dataset_name || !formData.auth_token || isTestingConnection}
                variant="outline"
                size="sm"
                className="flex-1"
              >
                {isTestingConnection ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Testing...
                  </>
                ) : (
                  'Test Connection'
                )}
              </Button>

              <Button
                onClick={handleCreateConnection}
                disabled={!testResult?.success || isCreatingConnection}
                size="sm"
                className="flex-1"
              >
                {isCreatingConnection ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  'Connect'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5 text-orange-500" />
          <div>
            <div className="font-medium">Sanity CMS</div>
            <div className="text-sm text-muted-foreground">
              Connect your headless content management system
            </div>
          </div>
        </div>

        <Button
          onClick={() => setMode('create')}
          size="sm"
          variant="outline"
        >
          <Plus className="h-4 w-4 mr-1" />
          Connect
        </Button>
      </div>

      {/* Error Display */}
      {connectionsError && (
        <Alert className="border-red-200 bg-red-50">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800">
            Failed to load connections: {connectionsError.message}
          </AlertDescription>
        </Alert>
      )}

      {/* Loading State */}
      {isLoadingConnections ? (
        <Card>
          <CardContent className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
          </CardContent>
        </Card>
      ) : activeConnections.length === 0 ? (
        /* No Connections */
        <Card>
          <CardContent className="text-center py-6">
            <Database className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground mb-3">
              No Sanity projects connected to this workspace
            </p>
            <Button
              onClick={() => setMode('create')}
              size="sm"
              variant="outline"
            >
              <Plus className="h-4 w-4 mr-1" />
              Connect Your First Project
            </Button>
          </CardContent>
        </Card>
      ) : (
        /* Connected Projects */
        <div className="space-y-2">
          {activeConnections.map((connection) => (
            <Card key={connection.id} className="p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {getStatusIcon(connection.status)}
                  <div className="min-w-0">
                    <div className="font-medium truncate">
                      {connection.project_title || connection.sanity_project_id}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {connection.dataset_name} • {connection.perspective}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <Badge variant={connection.status === 'connected' ? 'default' : 'secondary'} className="text-xs">
                    {connection.status}
                  </Badge>
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.open(`https://${connection.sanity_project_id}.sanity.studio`, '_blank', 'noopener,noreferrer')}
                    aria-label="Open Sanity Studio"
                    title="Open Sanity Studio"
                  >
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteConnection(connection.id)}
                    disabled={deletingConnectionId === connection.id}
                    aria-label="Disconnect Sanity project"
                    title="Disconnect"
                  >
                    {deletingConnectionId === connection.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                    ) : (
                      <Trash2 className="h-3 w-3" aria-hidden="true" />
                    )}
                  </Button>
                </div>
              </div>
            </Card>
          ))}

          {activeConnections.length > 0 && (
            <Button
              onClick={() => setMode('create')}
              size="sm"
              variant="ghost"
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-1" />
              Connect Another Project
            </Button>
          )}
        </div>
      )}
    </div>
  )
}