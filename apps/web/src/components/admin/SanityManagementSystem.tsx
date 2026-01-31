/**
 * Sanity Management System for Admin Panel
 * Provides administrative oversight of Sanity CMS integrations
 * Includes breakglass access and system monitoring
 */

'use client'

import { useState, useEffect } from 'react'
import { SanityConnectionDashboard } from '@/components/sanity/sanity-connection-dashboard'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { 
  Database, 
  AlertTriangle, 
  Key, 
  Activity,
  Search,
  Calendar,
  User,
  ExternalLink,
  Loader2,
  Shield,
  Eye
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import type { 
  SanityConnection, 
  BreakglassEntry,
  ListBreakglassOptions 
} from '@/types/sanity-integration'

interface SanityManagementSystemProps {
  permissions: string[]
  userRole: 'admin' | 'super_admin'
}

interface AdminStats {
  total_connections: number
  active_connections: number
  failed_connections: number
  total_documents: number
  breakglass_entries: number
  webhooks_processed_24h: number
}

export function SanityManagementSystem({ permissions, userRole }: SanityManagementSystemProps) {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [connections, setConnections] = useState<SanityConnection[]>([])
  const [breakglassEntries, setBreakglassEntries] = useState<BreakglassEntry[]>([])
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>('')
  const [breakglassJustification, setBreakglassJustification] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isRequestingBreakglass, setIsRequestingBreakglass] = useState(false)
  const [error, setError] = useState<string>('')

  // Check permissions
  const canViewConnections = permissions.includes('sanity.read') || userRole === 'super_admin'
  const canManageConnections = permissions.includes('sanity.write') || userRole === 'super_admin'
  const canAccessBreakglass = permissions.includes('sanity.breakglass') || userRole === 'super_admin'

  useEffect(() => {
    if (!canViewConnections) return

    const fetchData = async () => {
      try {
        setIsLoading(true)

        // Fetch system stats
        const statsResponse = await fetch('/api/admin/sanity/stats')
        if (statsResponse.ok) {
          const statsData = await statsResponse.json()
          setStats(statsData)
        }

        // Fetch all connections (admin view)
        const connectionsResponse = await fetch('/api/admin/sanity/connections')
        if (connectionsResponse.ok) {
          const connectionsData = await connectionsResponse.json()
          setConnections(connectionsData.connections || [])
        }

        // Fetch breakglass entries if permitted
        if (canAccessBreakglass) {
          const breakglassResponse = await fetch('/api/admin/sanity/breakglass')
          if (breakglassResponse.ok) {
            const breakglassData = await breakglassResponse.json()
            setBreakglassEntries(breakglassData.entries || [])
          }
        }

      } catch (error) {
        console.error('Failed to fetch Sanity admin data:', error)
        setError('Failed to load Sanity management data')
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [canViewConnections, canAccessBreakglass])

  const handleBreakglassRequest = async () => {
    if (!selectedConnectionId || !breakglassJustification.trim()) return

    try {
      setIsRequestingBreakglass(true)
      
      const response = await fetch(`/api/admin/sanity/breakglass/${selectedConnectionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ justification: breakglassJustification })
      })

      if (response.ok) {
        const credentials = await response.json()
        
        // Show credentials in a secure way (could be a modal in real implementation)
        alert(`Breakglass credentials granted:\nProject: ${credentials.sanity_project_id}\nToken: ${credentials.auth_token}\nExpires: ${credentials.expires_at}\nRemaining uses: ${credentials.max_remaining_uses}`)
        
        setBreakglassJustification('')
        setSelectedConnectionId('')
        
        // Refresh breakglass entries
        const breakglassResponse = await fetch('/api/admin/sanity/breakglass')
        if (breakglassResponse.ok) {
          const breakglassData = await breakglassResponse.json()
          setBreakglassEntries(breakglassData.entries || [])
        }
      } else {
        const errorData = await response.json()
        setError(errorData.error || 'Failed to grant breakglass access')
      }
    } catch (error) {
      setError('Network error requesting breakglass access')
    } finally {
      setIsRequestingBreakglass(false)
    }
  }

  const filteredConnections = connections.filter(conn => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      conn.sanity_project_id.toLowerCase().includes(query) ||
      conn.project_title?.toLowerCase().includes(query) ||
      conn.dataset_name.toLowerCase().includes(query)
    )
  })

  const getStatusBadge = (status: SanityConnection['status']) => {
    const variants = {
      connected: 'default' as const,
      disconnected: 'destructive' as const,
      error: 'destructive' as const,
      revoked: 'secondary' as const,
      expired: 'secondary' as const
    }

    return (
      <Badge variant={variants[status] || 'outline'}>
        {status}
      </Badge>
    )
  }

  if (!canViewConnections) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-center">
            <Shield className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              You don't have permission to access Sanity management
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Database className="h-6 w-6 text-orange-500" />
            Sanity CMS Management
          </h1>
          <p className="text-muted-foreground">
            Administrative oversight of headless CMS integrations
          </p>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert className="border-red-200 bg-red-50">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800">
            {error}
          </AlertDescription>
        </Alert>
      )}

      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-semibold text-blue-600">
                {stats.total_connections}
              </div>
              <div className="text-sm text-muted-foreground">Total Connections</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-semibold text-green-600">
                {stats.active_connections}
              </div>
              <div className="text-sm text-muted-foreground">Active</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-semibold text-red-600">
                {stats.failed_connections}
              </div>
              <div className="text-sm text-muted-foreground">Failed</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-semibold text-purple-600">
                {stats.total_documents.toLocaleString()}
              </div>
              <div className="text-sm text-muted-foreground">Documents</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-semibold text-orange-600">
                {stats.breakglass_entries}
              </div>
              <div className="text-sm text-muted-foreground">Breakglass</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-semibold text-teal-600">
                {stats.webhooks_processed_24h.toLocaleString()}
              </div>
              <div className="text-sm text-muted-foreground">Webhooks (24h)</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Content */}
      <Tabs defaultValue="connections">
        <TabsList>
          <TabsTrigger value="connections">Connections</TabsTrigger>
          {canAccessBreakglass && (
            <TabsTrigger value="breakglass">Emergency Access</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="connections" className="space-y-4">
          {/* Search */}
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search connections..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {/* Connections List */}
          <div className="space-y-3">
            {filteredConnections.length === 0 ? (
              <Card>
                <CardContent className="flex items-center justify-center py-8">
                  <div className="text-center">
                    <Database className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">
                      {searchQuery ? 'No connections match your search' : 'No Sanity connections found'}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              filteredConnections.map((connection) => (
                <Card key={connection.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="font-medium">
                            {connection.project_title || connection.sanity_project_id}
                          </h4>
                          {getStatusBadge(connection.status)}
                          <Badge variant="outline" className="text-xs">
                            {connection.dataset_name}
                          </Badge>
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-muted-foreground">
                          <div>
                            <span className="font-medium">Project:</span>
                            <p className="font-mono">{connection.sanity_project_id}</p>
                          </div>
                          <div>
                            <span className="font-medium">API Version:</span>
                            <p>{connection.api_version}</p>
                          </div>
                          <div>
                            <span className="font-medium">Perspective:</span>
                            <p>{connection.perspective}</p>
                          </div>
                          <div>
                            <span className="font-medium">Updated:</span>
                            <p>{formatDistanceToNow(new Date(connection.updated_at), { addSuffix: true })}</p>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm">
                          <Eye className="h-4 w-4" />
                        </Button>
                        
                        {canAccessBreakglass && connection.status === 'connected' && (
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => setSelectedConnectionId(connection.id)}
                          >
                            <Key className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        {canAccessBreakglass && (
          <TabsContent value="breakglass" className="space-y-4">
            {/* Breakglass Request Form */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-orange-600">
                  <AlertTriangle className="h-5 w-5" />
                  Emergency Access Request
                </CardTitle>
                <CardDescription>
                  Request breakglass credentials for emergency access to Sanity projects
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Connection</Label>
                  <select 
                    className="w-full p-2 border rounded-md"
                    value={selectedConnectionId}
                    onChange={(e) => setSelectedConnectionId(e.target.value)}
                  >
                    <option value="">Select connection...</option>
                    {connections.filter(c => c.status === 'connected').map(conn => (
                      <option key={conn.id} value={conn.id}>
                        {conn.project_title || conn.sanity_project_id} ({conn.dataset_name})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label>Justification *</Label>
                  <Textarea
                    placeholder="Explain why emergency access is needed..."
                    value={breakglassJustification}
                    onChange={(e) => setBreakglassJustification(e.target.value)}
                    rows={3}
                  />
                </div>

                <Button 
                  onClick={handleBreakglassRequest}
                  disabled={!selectedConnectionId || !breakglassJustification.trim() || isRequestingBreakglass}
                  variant="destructive"
                >
                  {isRequestingBreakglass ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Requesting...
                    </>
                  ) : (
                    <>
                      <Key className="mr-2 h-4 w-4" />
                      Request Emergency Access
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Breakglass History */}
            <Card>
              <CardHeader>
                <CardTitle>Emergency Access History</CardTitle>
                <CardDescription>
                  Recent breakglass access requests and usage
                </CardDescription>
              </CardHeader>
              <CardContent>
                {breakglassEntries.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No breakglass entries found
                  </p>
                ) : (
                  <div className="space-y-3">
                    {breakglassEntries.map((entry) => (
                      <div key={entry.id} className="border rounded p-3">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="font-medium">{entry.justification}</p>
                            <p className="text-sm text-muted-foreground">
                              Used {entry.access_count}/{entry.max_uses} times
                            </p>
                          </div>
                          <Badge variant={entry.is_expired ? 'secondary' : 'destructive'}>
                            {entry.is_expired ? 'Expired' : 'Active'}
                          </Badge>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
                          <div>
                            <span className="font-medium">Expires:</span>
                            <p>{new Date(entry.expires_at).toLocaleString()}</p>
                          </div>
                          <div>
                            <span className="font-medium">Last Access:</span>
                            <p>
                              {entry.last_accessed_at 
                                ? formatDistanceToNow(new Date(entry.last_accessed_at), { addSuffix: true })
                                : 'Never'
                              }
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}