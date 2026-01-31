'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Icon } from '@/components/ui/icon';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  initiateSupabaseOAuth,
  getSupabaseConnectionStatus,
  discoverSupabaseProjects,
  getSupabaseCredentials,
  disconnectSupabase
} from '@/lib/actions/supabase-oauth-actions';
import { useSearchParams } from 'next/navigation';
import { logger } from '@/utils/logger';

// Feature flag for Supabase OAuth integration
// eslint-disable-next-line no-restricted-globals
const ENABLE_SUPABASE_OAUTH = process.env.NEXT_PUBLIC_ENABLE_SUPABASE_OAUTH === 'true';

interface ConnectSupabaseProps {
  projectId: string;
  className?: string;
}

interface SupabaseProject {
  id: string;
  ref: string;
  name: string;
  organization: string;
  status: string;
  canConnect: boolean;
  url: string;
}

interface ConnectionStatus {
  connected: boolean;
  status: string;
  connectionId?: string;
  expiresAt?: string;
  isExpired: boolean;
  error?: string;
}

export function ConnectSupabase({ projectId, className }: ConnectSupabaseProps) {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus | null>(null);
  const [projects, setProjects] = useState<SupabaseProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [credentials, setCredentials] = useState<{ url: string; publishableKey: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const searchParams = useSearchParams();

  // Check for OAuth callback results
  useEffect(() => {
    const supabaseStatus = searchParams.get('supabase');
    const message = searchParams.get('message');
    const connectionId = searchParams.get('connectionId');

    if (supabaseStatus === 'connected' && connectionId) {
      setSuccess('✅ Supabase connected successfully! Loading your projects...');
      // Refresh connection status
      checkConnectionStatus();
    } else if (supabaseStatus === 'error' && message) {
      setError(decodeURIComponent(message));
    }
  }, [searchParams]);

  const checkConnectionStatus = async () => {
    try {
      setError(null);
      const status = await getSupabaseConnectionStatus(projectId);
      
      // ✅ CRITICAL FIX: Check if status exists before using 'in' operator
      if (!status) {
        logger.error('getSupabaseConnectionStatus returned undefined/null', { projectId });
        setError('No response from connection status check');
        setConnectionStatus({ connected: false, status: 'error', isExpired: false });
        return;
      }
      
      // Type guard for status response - now safe to use 'in' operator
      if ('error' in status) {
        setError(status.error);
        setConnectionStatus({ connected: false, status: 'error', isExpired: false });
      } else {
        setConnectionStatus(status);
        
        if (status.connected && status.connectionId) {
          await loadProjects(status.connectionId);
        }
      }
    } catch (error) {
      logger.error('Failed to check Supabase connection status:', error);
      setError('Failed to check connection status');
    } finally {
      setLoading(false);
    }
  };

  const loadProjects = async (connectionId: string) => {
    try {
      const discovery = await discoverSupabaseProjects(connectionId);
      setProjects(discovery.projects || []);
      
      // Auto-select the first available project
      if (discovery.projects.length > 0 && !selectedProject) {
        const firstProject = discovery.projects.find(p => p.canConnect) || discovery.projects[0];
        setSelectedProject(firstProject.ref);
      }
    } catch (error) {
      logger.error('Failed to load Supabase projects:', error);
      setError('Failed to load your Supabase projects');
    }
  };

  const handleConnect = async () => {
    try {
      setConnecting(true);
      setError(null);
      
      // Initiate OAuth flow - this will redirect to Supabase
      await initiateSupabaseOAuth(projectId);
    } catch (error) {
      logger.error('Failed to initiate OAuth:', error);
      setError(error instanceof Error ? error.message : 'Failed to connect to Supabase');
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      setDisconnecting(true);
      setError(null);
      
      await disconnectSupabase(projectId);
      
      // Reset state
      setConnectionStatus({ connected: false, status: 'disconnected', isExpired: false });
      setProjects([]);
      setSelectedProject('');
      setCredentials(null);
      setSuccess('Supabase disconnected successfully');
    } catch (error) {
      logger.error('Failed to disconnect Supabase:', error);
      setError(error instanceof Error ? error.message : 'Failed to disconnect Supabase');
    } finally {
      setDisconnecting(false);
    }
  };

  const handleProjectChange = async (ref: string) => {
    setSelectedProject(ref);
    setCredentials(null);
    
    if (ref) {
      try {
        const creds = await getSupabaseCredentials(ref, projectId);
        setCredentials(creds);
      } catch (error) {
        logger.error('Failed to get credentials:', error);
        setError('Failed to get project credentials');
      }
    }
  };

  // Load initial connection status
  useEffect(() => {
    if (ENABLE_SUPABASE_OAUTH) {
      checkConnectionStatus();
    } else {
      setLoading(false);
    }
  }, [projectId]);

  // Clear messages after 5 seconds
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 8000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Show feature flag message if OAuth is disabled
  if (!ENABLE_SUPABASE_OAUTH) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Icon name="database" className="h-5 w-5" />
            Supabase Integration
          </CardTitle>
          <CardDescription>
            Connect your Supabase project for automatic database configuration
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <Icon name="info" className="h-4 w-4" />
            <AlertDescription>
              Supabase OAuth integration is currently disabled. Manual configuration is available through environment variables.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center py-8">
          <LoadingSpinner size="sm" className="mr-2" />
          <span className="text-sm text-muted-foreground">Checking Supabase connection...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Icon name="database" className="h-5 w-5" />
              Supabase Integration
            </CardTitle>
            <CardDescription>
              Connect your Supabase project for automatic database configuration
            </CardDescription>
          </div>
          {connectionStatus?.connected && (
            <Badge variant="default" className="bg-green-500">
              <Icon name="check" className="h-3 w-3 mr-1" />
              Connected
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Success Message */}
        {success && (
          <Alert className="border-green-200 bg-green-50 text-green-800">
            <Icon name="check-circle" className="h-4 w-4" />
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        {/* Error Message */}
        {error && (
          <Alert variant="destructive">
            <Icon name="alert-circle" className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Connection Status */}
        {!connectionStatus?.connected ? (
          <div className="space-y-4">
            <div className="text-center py-6">
              <Icon name="database" className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2 text-foreground">Connect Your Supabase Account</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Automatically configure your project with Supabase database credentials
              </p>
              
              <Button 
                onClick={handleConnect} 
                disabled={connecting}
                className="bg-green-600 hover:bg-green-700"
              >
                {connecting ? (
                  <>
                    <LoadingSpinner size="sm" className="mr-2" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Icon name="external-link" className="h-4 w-4 mr-2" />
                    Connect Supabase Account
                  </>
                )}
              </Button>
            </div>

            <div className="border-t pt-4">
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  Prefer manual configuration?
                </summary>
                <div className="mt-2 text-muted-foreground">
                  You can also manually add your Supabase URL and API keys in the environment variables section.
                </div>
              </details>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Connection Info */}
            <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800">
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 bg-green-500 rounded-full"></div>
                <div>
                  <div className="text-sm font-medium text-foreground">Connected to Supabase</div>
                  <div className="text-xs text-muted-foreground">
                    Status: {connectionStatus.status}
                    {connectionStatus.isExpired && (
                      <Badge variant="destructive" className="ml-2">Expired</Badge>
                    )}
                  </div>
                </div>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleDisconnect}
                disabled={disconnecting}
              >
                {disconnecting ? (
                  <LoadingSpinner size="sm" />
                ) : (
                  'Disconnect'
                )}
              </Button>
            </div>

            {/* Project Selection */}
            {projects.length > 0 && (
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-foreground">Select Supabase Project</label>
                  <p className="text-xs text-muted-foreground">
                    Choose which Supabase project to use for this application
                  </p>
                </div>
                
                <Select value={selectedProject} onValueChange={handleProjectChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a project..." />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project) => (
                      <SelectItem key={project.ref} value={project.ref}>
                        <div className="flex items-center justify-between w-full">
                          <span>{project.name}</span>
                          <div className="flex items-center gap-2 ml-2">
                            <Badge variant="secondary" className="text-xs">
                              {project.organization}
                            </Badge>
                            {!project.canConnect && (
                              <Badge variant="destructive" className="text-xs">
                                Limited Access
                              </Badge>
                            )}
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Project Info */}
                {selectedProject && credentials && (
                  <div className="p-4 bg-muted/50 rounded-lg space-y-3">
                    <div className="flex items-center gap-2">
                      <Icon name="check-circle" className="h-4 w-4 text-green-500" />
                      <span className="text-sm font-medium text-foreground">Project Configured</span>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      <div>
                        <div className="font-medium text-muted-foreground">Database URL</div>
                        <div className="font-mono bg-background p-2 rounded border">
                          {credentials.url}
                        </div>
                      </div>
                      <div>
                        <div className="font-medium text-muted-foreground">Publishable Key</div>
                        <div className="font-mono bg-background p-2 rounded border">
                          {credentials.publishableKey.slice(0, 20)}...
                        </div>
                      </div>
                    </div>
                    
                    <div className="text-xs text-muted-foreground">
                      ✅ Environment variables will be injected automatically during deployment
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* No Projects */}
            {projects.length === 0 && (
              <div className="text-center py-6">
                <Icon name="database" className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground mb-3">
                  No accessible Supabase projects found
                </p>
                <Button variant="outline" size="sm" asChild>
                  <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer">
                    <Icon name="external-link" className="h-4 w-4 mr-2" />
                    Create Project in Supabase
                  </a>
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
