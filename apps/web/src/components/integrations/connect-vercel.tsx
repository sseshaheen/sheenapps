/**
 * Connect Vercel Integration Component
 * Handles OAuth connection, project linking, and deployment management
 * Follows the same patterns as ConnectSupabase component
 */

'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Icon } from '@/components/ui/icon';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  initiateVercelOAuth,
  getVercelConnectionStatus,
  disconnectVercel,
  listVercelProjects,
  linkVercelProject,
  unlinkVercelProject,
  listVercelDeployments,
  deployToVercel
} from '@/lib/actions/vercel-integration-actions';
import { logger } from '@/utils/logger';
import type {
  VercelConnection,
  VercelProject,
  VercelProjectMapping,
  VercelDeployment
} from '@/types/vercel-integration';

// Feature flag for Vercel integration
// eslint-disable-next-line no-restricted-globals
const ENABLE_VERCEL_INTEGRATION = process.env.NEXT_PUBLIC_ENABLE_VERCEL_INTEGRATION === 'true';

interface ConnectVercelProps {
  projectId?: string;
  className?: string;
}

interface ConnectionState {
  connected: boolean;
  connections: VercelConnection[];
  loading: boolean;
  error?: string;
}

interface ProjectLinkingState {
  availableProjects: VercelProject[];
  selectedProject?: VercelProject;
  linking: boolean;
  linked: boolean;
  mapping?: VercelProjectMapping;
  error?: string;
}

interface DeploymentState {
  deployments: VercelDeployment[];
  loading: boolean;
  deploying: boolean;
  error?: string;
}

export function ConnectVercel({ projectId, className }: ConnectVercelProps) {
  // Connection state
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    connected: false,
    connections: [],
    loading: true
  });

  // Project linking state (only if projectId provided)
  const [projectState, setProjectState] = useState<ProjectLinkingState>({
    availableProjects: [],
    linking: false,
    linked: false
  });

  // Deployment state (only if project is linked)
  const [deploymentState, setDeploymentState] = useState<DeploymentState>({
    deployments: [],
    loading: false,
    deploying: false
  });

  const [connecting, setConnecting] = useState(false);

  // Load connection status on mount
  useEffect(() => {
    if (!ENABLE_VERCEL_INTEGRATION) {
      return;
    }
    loadConnectionStatus();
  }, []);

  // Load available projects when connected
  useEffect(() => {
    if (!ENABLE_VERCEL_INTEGRATION) {
      return;
    }
    if (connectionState.connected && projectId) {
      loadAvailableProjects();
    }
  }, [connectionState.connected, projectId]);

  // Load deployments when project is linked
  useEffect(() => {
    if (!ENABLE_VERCEL_INTEGRATION) {
      return;
    }
    if (projectState.linked && projectId) {
      loadDeployments();
    }
  }, [projectState.linked, projectId]);

  // Check if feature is enabled
  if (!ENABLE_VERCEL_INTEGRATION) {
    return (
      <Card className={className}>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-black flex items-center justify-center">
              <Icon name="play" className="w-5 h-5 text-white" />
            </div>
            <div>
              <CardTitle>Vercel</CardTitle>
              <CardDescription>Deploy your projects to Vercel's global edge network</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Alert>
            <Icon name="info" className="h-4 w-4" />
            <AlertDescription>
              Vercel integration is currently in development and will be available soon.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const loadConnectionStatus = async () => {
    try {
      setConnectionState(prev => ({ ...prev, loading: true, error: undefined }));
      
      const result = await getVercelConnectionStatus();
      
      setConnectionState({
        connected: result.connected,
        connections: result.connections,
        loading: false
      });
    } catch (error) {
      logger.error('Failed to load Vercel connection status:', error);
      setConnectionState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to check connection status'
      }));
    }
  };

  const loadAvailableProjects = async () => {
    if (!connectionState.connected) return;

    try {
      const result = await listVercelProjects(20, 0);
      setProjectState(prev => ({
        ...prev,
        availableProjects: result.projects,
        error: undefined
      }));
    } catch (error) {
      logger.error('Failed to load Vercel projects:', error);
      setProjectState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to load projects'
      }));
    }
  };

  const loadDeployments = async () => {
    if (!projectId || !projectState.linked) return;

    try {
      setDeploymentState(prev => ({ ...prev, loading: true }));
      
      const result = await listVercelDeployments(projectId, 10, 0);
      
      setDeploymentState(prev => ({
        ...prev,
        deployments: result.deployments,
        loading: false,
        error: undefined
      }));
    } catch (error) {
      logger.error('Failed to load deployments:', error);
      setDeploymentState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to load deployments'
      }));
    }
  };

  const handleConnect = async (teamId?: string) => {
    setConnecting(true);
    
    try {
      logger.info('Starting Vercel OAuth flow', { teamId });
      
      const result = await initiateVercelOAuth(teamId);
      
      // Open OAuth URL in popup window
      const popup = window.open(
        result.authorization_url,
        'vercel-oauth',
        'width=600,height=700,scrollbars=yes,resizable=yes'
      );

      if (!popup) {
        throw new Error('Popup blocked. Please allow popups and try again.');
      }

      // Listen for completion
      const messageHandler = (event: MessageEvent) => {
        if (event.data.type === 'VERCEL_CONNECTED') {
          popup.close();
          setConnecting(false);
          loadConnectionStatus();
          window.removeEventListener('message', messageHandler);
        }
      };
      
      window.addEventListener('message', messageHandler);

      // Handle popup closed manually
      const checkClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosed);
          setConnecting(false);
          loadConnectionStatus(); // Refresh status regardless
          window.removeEventListener('message', messageHandler);
        }
      }, 1000);

    } catch (error) {
      logger.error('Failed to initiate Vercel OAuth:', error);
      setConnectionState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to start connection process'
      }));
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnectVercel();
      setConnectionState({
        connected: false,
        connections: [],
        loading: false
      });
      setProjectState({
        availableProjects: [],
        linking: false,
        linked: false
      });
    } catch (error) {
      logger.error('Failed to disconnect Vercel:', error);
      setConnectionState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to disconnect'
      }));
    }
  };

  const handleLinkProject = async () => {
    if (!projectState.selectedProject || !projectId) return;

    setProjectState(prev => ({ ...prev, linking: true }));

    try {
      const result = await linkVercelProject(projectId, projectState.selectedProject.id, {
        autoDeployEnabled: true,
        deploymentBranchPatterns: ['main', 'master'],
        environmentTargets: ['production', 'preview']
      });

      setProjectState(prev => ({
        ...prev,
        linking: false,
        linked: true,
        mapping: result.mapping,
        error: undefined
      }));

      // Start loading deployments
      loadDeployments();
    } catch (error) {
      logger.error('Failed to link Vercel project:', error);
      setProjectState(prev => ({
        ...prev,
        linking: false,
        error: error instanceof Error ? error.message : 'Failed to link project'
      }));
    }
  };

  const handleUnlinkProject = async () => {
    if (!projectId) return;

    try {
      await unlinkVercelProject(projectId);
      setProjectState({
        availableProjects: projectState.availableProjects,
        linking: false,
        linked: false
      });
    } catch (error) {
      logger.error('Failed to unlink Vercel project:', error);
      setProjectState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to unlink project'
      }));
    }
  };

  const handleDeploy = async (deploymentType: 'production' | 'preview') => {
    if (!projectId) return;

    setDeploymentState(prev => ({ ...prev, deploying: true }));

    try {
      await deployToVercel(projectId, deploymentType);
      
      // Refresh deployments list
      setTimeout(() => {
        loadDeployments();
      }, 1000);
      
      setDeploymentState(prev => ({ ...prev, deploying: false }));
    } catch (error) {
      logger.error('Failed to deploy to Vercel:', error);
      setDeploymentState(prev => ({
        ...prev,
        deploying: false,
        error: error instanceof Error ? error.message : 'Failed to deploy'
      }));
    }
  };

  const getStatusColor = (state: string) => {
    switch (state) {
      case 'READY': return 'text-green-600 bg-green-100';
      case 'BUILDING': return 'text-yellow-600 bg-yellow-100';
      case 'ERROR': return 'text-red-600 bg-red-100';
      case 'CANCELED': return 'text-gray-600 bg-gray-100';
      default: return 'text-blue-600 bg-blue-100';
    }
  };

  if (connectionState.loading) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center py-8">
          <LoadingSpinner />
        </CardContent>
      </Card>
    );
  }

  if (!connectionState.connected) {
    return (
      <Card className={className}>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-black flex items-center justify-center">
              <Icon name="play" className="w-5 h-5 text-white" />
            </div>
            <div>
              <CardTitle>Connect to Vercel</CardTitle>
              <CardDescription>Deploy your projects to Vercel's global edge network</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {connectionState.error && (
            <Alert variant="destructive">
              <Icon name="alert-circle" className="h-4 w-4" />
              <AlertDescription>{connectionState.error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Button
              onClick={() => handleConnect()}
              disabled={connecting}
              className="w-full bg-black hover:bg-gray-800 text-white"
            >
              {connecting ? (
                <>
                  <LoadingSpinner className="mr-2" />
                  Connecting...
                </>
              ) : (
                <>
                  <Icon name="play" className="w-4 h-4 mr-2" />
                  Connect Personal Account
                </>
              )}
            </Button>
            
            <Button
              onClick={() => handleConnect('team')}
              disabled={connecting}
              variant="outline"
              className="w-full"
            >
              {connecting ? (
                <>
                  <LoadingSpinner className="mr-2" />
                  Connecting...
                </>
              ) : (
                <>
                  <Icon name="users" className="w-4 h-4 mr-2" />
                  Connect Team Account
                </>
              )}
            </Button>
          </div>

          <div className="text-xs text-muted-foreground space-y-1">
            <p>• Deploy instantly to Vercel's global edge network</p>
            <p>• Automatic deployments from your git repository</p>
            <p>• Built-in CI/CD with preview deployments</p>
            <p>• Custom domains and SSL certificates</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Connected state
  const connection = connectionState.connections[0];
  
  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-black flex items-center justify-center">
              <Icon name="play" className="w-5 h-5 text-white" />
            </div>
            <div>
              <CardTitle className="flex items-center gap-2">
                Vercel
                <Badge variant="outline" className="text-green-600 border-green-600">
                  Connected
                </Badge>
              </CardTitle>
              <CardDescription>
                {connection?.account_type === 'team' ? connection.team_name : 'Personal Account'}
              </CardDescription>
            </div>
          </div>
          <Button
            onClick={handleDisconnect}
            variant="ghost"
            size="sm"
            className="text-red-600 hover:text-red-800"
          >
            <Icon name="x" className="w-4 h-4 mr-1" />
            Disconnect
          </Button>
        </div>
      </CardHeader>

      {projectId ? (
        <CardContent>
          <Tabs defaultValue="project" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="project">Project Setup</TabsTrigger>
              <TabsTrigger value="deployments">Deployments</TabsTrigger>
            </TabsList>

            <TabsContent value="project" className="mt-4 space-y-4">
              {!projectState.linked ? (
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium mb-2">Link Vercel Project</h4>
                    <Select
                      value={projectState.selectedProject?.id || ''}
                      onValueChange={(value) => {
                        const project = projectState.availableProjects.find(p => p.id === value);
                        setProjectState(prev => ({ ...prev, selectedProject: project }));
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a Vercel project..." />
                      </SelectTrigger>
                      <SelectContent>
                        {projectState.availableProjects.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            <div className="flex items-center gap-2">
                              <span>{project.name}</span>
                              <Badge variant="outline" className="text-xs">
                                {project.framework}
                              </Badge>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    onClick={handleLinkProject}
                    disabled={!projectState.selectedProject || projectState.linking}
                    className="w-full"
                  >
                    {projectState.linking ? (
                      <>
                        <LoadingSpinner className="mr-2" />
                        Linking Project...
                      </>
                    ) : (
                      <>
                        <Icon name="link" className="w-4 h-4 mr-2" />
                        Link Project
                      </>
                    )}
                  </Button>

                  {projectState.error && (
                    <Alert variant="destructive">
                      <Icon name="alert-circle" className="h-4 w-4" />
                      <AlertDescription>{projectState.error}</AlertDescription>
                    </Alert>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                    <div className="flex items-center gap-3">
                      <Icon name="check-circle" className="w-5 h-5 text-green-600" />
                      <div>
                        <p className="font-medium text-green-900 dark:text-green-100">
                          Project Linked
                        </p>
                        <p className="text-sm text-green-700 dark:text-green-300">
                          Ready for deployment to Vercel
                        </p>
                      </div>
                    </div>
                    <Button
                      onClick={handleUnlinkProject}
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-800"
                    >
                      Unlink
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="deployments" className="mt-4 space-y-4">
              {projectState.linked ? (
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleDeploy('preview')}
                      disabled={deploymentState.deploying}
                      variant="outline"
                      className="flex-1"
                    >
                      <Icon name="eye" className="w-4 h-4 mr-2" />
                      Deploy Preview
                    </Button>
                    <Button
                      onClick={() => handleDeploy('production')}
                      disabled={deploymentState.deploying}
                      className="flex-1 bg-green-600 hover:bg-green-700"
                    >
                      <Icon name="rocket" className="w-4 h-4 mr-2" />
                      Deploy Production
                    </Button>
                  </div>

                  {deploymentState.error && (
                    <Alert variant="destructive">
                      <Icon name="alert-circle" className="h-4 w-4" />
                      <AlertDescription>{deploymentState.error}</AlertDescription>
                    </Alert>
                  )}

                  <Separator />

                  <div>
                    <h4 className="font-medium mb-3">Recent Deployments</h4>
                    {deploymentState.loading ? (
                      <div className="flex justify-center py-4">
                        <LoadingSpinner />
                      </div>
                    ) : deploymentState.deployments.length > 0 ? (
                      <div className="space-y-2">
                        {deploymentState.deployments.map((deployment) => (
                          <div
                            key={deployment.id}
                            className="flex items-center justify-between p-3 border rounded-lg"
                          >
                            <div className="flex items-center gap-3">
                              <Badge className={getStatusColor(deployment.state)}>
                                {deployment.state}
                              </Badge>
                              <div>
                                <p className="font-medium">
                                  {deployment.deployment_type === 'production' ? 'Production' : 'Preview'}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {deployment.git_source?.branch || 'Manual Deploy'} • {' '}
                                  {new Date(deployment.created_at).toLocaleString()}
                                </p>
                              </div>
                            </div>
                            {deployment.deployment_url && (
                              <Button
                                asChild
                                variant="ghost"
                                size="sm"
                              >
                                <a
                                  href={deployment.deployment_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  <Icon name="external-link" className="w-4 h-4" />
                                </a>
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-center py-4">
                        No deployments yet. Click deploy to get started.
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <Alert>
                  <Icon name="info" className="h-4 w-4" />
                  <AlertDescription>
                    Link a Vercel project first to start deploying.
                  </AlertDescription>
                </Alert>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      ) : (
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Connect Vercel to your project to enable deployments and domain management.
          </p>
        </CardContent>
      )}
    </Card>
  );
}
