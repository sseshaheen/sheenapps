/**
 * Sanity Connection Dashboard Component
 * Main dashboard for managing Sanity connections and content
 * Combines connection management with document browsing
 */

'use client'

import { useState } from 'react';
import { useSanityConnections, useSanityConnection } from '@/hooks/use-sanity-connection';
import { SanityConnectionSetup } from './sanity-connection-setup';
import { SanityDocumentList } from './sanity-document-list';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Plus, 
  Settings, 
  Trash2, 
  Activity, 
  Globe, 
  Calendar,
  AlertCircle,
  CheckCircle,
  Loader2,
  RefreshCw,
  Database,
  Zap
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { SanityConnection, SanityIntegrationError } from '@/types/sanity-integration';

interface SanityConnectionDashboardProps {
  projectId?: string;
  className?: string;
}

export function SanityConnectionDashboard({ 
  projectId,
  className = ""
}: SanityConnectionDashboardProps) {
  const [selectedConnectionId, setSelectedConnectionId] = useState<string>('');
  const [showSetup, setShowSetup] = useState(false);
  const [error, setError] = useState<string>('');

  const {
    connections,
    isLoading: isLoadingConnections,
    error: connectionsError,
    refetch: refetchConnections,
    getActiveConnections
  } = useSanityConnections(projectId);

  const {
    connection: selectedConnection,
    checkHealth,
    deleteConnection,
    isCheckingHealth,
    isDeletingConnection,
    healthError
  } = useSanityConnection(selectedConnectionId);

  const activeConnections = getActiveConnections();

  const handleConnectionCreated = (connection: SanityConnection) => {
    setSelectedConnectionId(connection.id);
    setShowSetup(false);
    setError('');
    refetchConnections();
  };

  const handleConnectionError = (error: SanityIntegrationError) => {
    setError(error.message);
  };

  const handleDeleteConnection = async () => {
    if (!selectedConnectionId || !selectedConnection) return;
    
    if (window.confirm(`Are you sure you want to delete the connection to "${selectedConnection.project_title || selectedConnection.sanity_project_id}"?`)) {
      try {
        await deleteConnection();
        setSelectedConnectionId('');
        refetchConnections();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete connection');
      }
    }
  };

  const getStatusIcon = (status: SanityConnection['status']) => {
    switch (status) {
      case 'connected':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'disconnected':
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'revoked':
      case 'expired':
        return <AlertCircle className="h-4 w-4 text-orange-500" />;
      default:
        return <Activity className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: SanityConnection['status']) => {
    const variants = {
      connected: 'default' as const,
      disconnected: 'destructive' as const,
      error: 'destructive' as const,
      revoked: 'secondary' as const,
      expired: 'secondary' as const
    };

    return (
      <Badge variant={variants[status] || 'outline'}>
        {status}
      </Badge>
    );
  };

  if (showSetup) {
    return (
      <div className={className}>
        <div className="mb-4">
          <Button
            variant="outline"
            onClick={() => setShowSetup(false)}
          >
            ← Back to Dashboard
          </Button>
        </div>
        
        <SanityConnectionSetup
          projectId={projectId}
          onSuccess={handleConnectionCreated}
          onError={handleConnectionError}
        />
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Database className="h-6 w-6 text-orange-500" />
            Sanity CMS Integration
          </h2>
          <p className="text-muted-foreground">
            Manage your headless CMS connections and content
          </p>
        </div>
        
        <Button onClick={() => setShowSetup(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Connection
        </Button>
      </div>

      {/* Error Alert */}
      {(error || connectionsError) && (
        <Alert className="border-red-200 bg-red-50">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800">
            {error || connectionsError?.message}
          </AlertDescription>
        </Alert>
      )}

      {/* Loading State */}
      {isLoadingConnections ? (
        <Card>
          <CardContent className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </CardContent>
        </Card>
      ) : connections.length === 0 ? (
        /* Empty State */
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Database className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Sanity Connections</h3>
            <p className="text-muted-foreground text-center mb-4 max-w-md">
              Connect your first Sanity project to start managing headless CMS content 
              for your applications.
            </p>
            <Button onClick={() => setShowSetup(true)}>
              <Zap className="mr-2 h-4 w-4" />
              Connect Sanity Project
            </Button>
          </CardContent>
        </Card>
      ) : (
        /* Main Content */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Connection List */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Connections</CardTitle>
                <CardDescription>
                  {activeConnections.length} of {connections.length} active
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {connections.map((connection) => (
                  <div
                    key={connection.id}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedConnectionId === connection.id
                        ? 'bg-primary/5 border-primary'
                        : 'hover:bg-muted/50'
                    }`}
                    onClick={() => setSelectedConnectionId(connection.id)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium truncate">
                          {connection.project_title || connection.sanity_project_id}
                        </h4>
                        <p className="text-xs text-muted-foreground">
                          {connection.dataset_name}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusIcon(connection.status)}
                        {getStatusBadge(connection.status)}
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Globe className="h-3 w-3" />
                        {connection.perspective}
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDistanceToNow(new Date(connection.updated_at), { addSuffix: true })}
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Connection Details and Content */}
          <div className="lg:col-span-2">
            {selectedConnectionId && selectedConnection ? (
              <Tabs defaultValue="documents">
                <div className="flex items-center justify-between mb-4">
                  <TabsList>
                    <TabsTrigger value="documents">Documents</TabsTrigger>
                    <TabsTrigger value="settings">Settings</TabsTrigger>
                  </TabsList>
                  
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => checkHealth()}
                      disabled={isCheckingHealth}
                    >
                      {isCheckingHealth ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                    </Button>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDeleteConnection}
                      disabled={isDeletingConnection}
                    >
                      {isDeletingConnection ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                <TabsContent value="documents">
                  <SanityDocumentList connectionId={selectedConnectionId} />
                </TabsContent>

                <TabsContent value="settings">
                  <Card>
                    <CardHeader>
                      <CardTitle>Connection Settings</CardTitle>
                      <CardDescription>
                        Manage your Sanity connection configuration
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="font-medium">Project ID:</span>
                          <p className="text-muted-foreground">{selectedConnection.sanity_project_id}</p>
                        </div>
                        <div>
                          <span className="font-medium">Dataset:</span>
                          <p className="text-muted-foreground">{selectedConnection.dataset_name}</p>
                        </div>
                        <div>
                          <span className="font-medium">API Version:</span>
                          <p className="text-muted-foreground">{selectedConnection.api_version}</p>
                        </div>
                        <div>
                          <span className="font-medium">Perspective:</span>
                          <p className="text-muted-foreground">{selectedConnection.perspective}</p>
                        </div>
                        <div>
                          <span className="font-medium">CDN Enabled:</span>
                          <p className="text-muted-foreground">{selectedConnection.use_cdn ? 'Yes' : 'No'}</p>
                        </div>
                        <div>
                          <span className="font-medium">Real-time:</span>
                          <p className="text-muted-foreground">{selectedConnection.realtime_enabled ? 'Yes' : 'No'}</p>
                        </div>
                      </div>

                      {healthError && (
                        <Alert className="border-red-200 bg-red-50">
                          <AlertCircle className="h-4 w-4 text-red-600" />
                          <AlertDescription className="text-red-800">
                            Health check failed: {healthError.message}
                          </AlertDescription>
                        </Alert>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            ) : (
              <Card>
                <CardContent className="flex items-center justify-center py-12">
                  <div className="text-center text-muted-foreground">
                    <Settings className="h-8 w-8 mx-auto mb-2" />
                    <p>Select a connection to view details</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}