import { SupabaseManagementAPI } from './supabaseManagementAPI';
import { SupabaseConnectionService } from './supabaseConnectionService';
import { ServerLoggingService } from './serverLoggingService';

/**
 * Supabase Deployment Integration Service
 * Integrates Supabase OAuth with the deployment pipeline
 * Handles pattern detection, environment variable injection, and deployment validation
 */

export interface SupabaseIntegrationDetection {
  hasSupabase: boolean;
  connectionType: 'oauth' | 'manual' | null;
  connectionId?: string;
  availableProjects?: Array<{
    id: string;
    ref: string;
    name: string;
    organization: string;
    status: string;
    canConnect: boolean;
  }>;
  needsServiceRole: boolean;
  readyProjects?: number;
  selectedProjectRef?: string;
}

export interface DeploymentEnvVars {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

export class SupabaseDeploymentIntegration {
  private static instance: SupabaseDeploymentIntegration;
  private managementAPI: SupabaseManagementAPI;
  private connectionService: SupabaseConnectionService;
  private loggingService: ServerLoggingService;

  constructor() {
    this.managementAPI = SupabaseManagementAPI.getInstance();
    this.connectionService = SupabaseConnectionService.getInstance();
    this.loggingService = ServerLoggingService.getInstance();
  }

  static getInstance(): SupabaseDeploymentIntegration {
    if (!SupabaseDeploymentIntegration.instance) {
      SupabaseDeploymentIntegration.instance = new SupabaseDeploymentIntegration();
    }
    return SupabaseDeploymentIntegration.instance;
  }

  /**
   * Detect Supabase integration in a project
   * Checks for OAuth connections and manual configurations
   */
  async detectSupabaseIntegration(
    projectPath: string,
    userId: string,
    sheenProjectId: string
  ): Promise<SupabaseIntegrationDetection> {
    try {
      // Check if user has OAuth connection for this project
      const connection = await this.connectionService.getConnection(userId, sheenProjectId);
      
      if (connection) {
        const discovery = await this.connectionService.getStoredDiscovery(connection.id);
        const needsServiceRole = await this.checkForServerSidePatterns(projectPath);

        return {
          hasSupabase: true,
          connectionType: 'oauth',
          connectionId: connection.id,
          availableProjects: discovery.projects,
          needsServiceRole,
          readyProjects: discovery.readyProjects || 0
        };
      }

      // Fallback to pattern detection for manual setups
      const hasManualSupabase = await this.checkForSupabasePatterns(projectPath);

      return {
        hasSupabase: hasManualSupabase,
        connectionType: hasManualSupabase ? 'manual' : null,
        needsServiceRole: hasManualSupabase ? await this.checkForServerSidePatterns(projectPath) : false
      };

    } catch (error) {
      await this.loggingService.logCriticalError(
        'supabase_detection_failed',
        error as Error,
        { projectPath, userId, sheenProjectId }
      );

      return {
        hasSupabase: false,
        connectionType: null,
        needsServiceRole: false
      };
    }
  }

  /**
   * Inject Supabase environment variables for deployment
   */
  async injectSupabaseEnvVars(
    supabaseIntegration: SupabaseIntegrationDetection,
    deploymentLane: 'pages-static' | 'pages-edge' | 'workers-node',
    userId: string,
    projectId: string
  ): Promise<DeploymentEnvVars> {
    if (supabaseIntegration.connectionType !== 'oauth' || !supabaseIntegration.selectedProjectRef) {
      // For manual connections, environment vars should already be configured
      return {};
    }

    const { connectionId, needsServiceRole, selectedProjectRef } = supabaseIntegration;

    try {
      // Determine if service key is needed and enforce lane restrictions
      const requiresServiceKey = deploymentLane === 'workers-node' && needsServiceRole;

      // Force Workers lane if service key required
      if (needsServiceRole && deploymentLane !== 'workers-node') {
        throw new Error('Service role access requires Workers deployment lane');
      }

      const connection = await this.connectionService.getConnection(userId, projectId);
      if (!connection) {
        throw new Error('FALLBACK_TO_MANUAL: OAuth connection not found');
      }

      const tokens = await this.connectionService.getValidTokens(connection.id);

      // Get credentials from Supabase Management API
      const credentials = await this.managementAPI.getProjectCredentials(
        tokens.access_token,
        selectedProjectRef,
        requiresServiceKey
      );

      if (!credentials.publishableKey) {
        throw new Error('Failed to retrieve Supabase credentials');
      }

      const envVars: DeploymentEnvVars = {
        NEXT_PUBLIC_SUPABASE_URL: credentials.url,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: credentials.publishableKey
      };

      // Only add service key for Workers deployment with explicit need
      if (requiresServiceKey && credentials.serviceRoleKey) {
        envVars.SUPABASE_SERVICE_ROLE_KEY = credentials.serviceRoleKey;
      }

      await this.loggingService.logServerEvent(
        'capacity',
        'info',
        'Supabase environment variables injected for deployment',
        {
          userId,
          projectId,
          selectedProjectRef,
          deploymentLane,
          hasServiceKey: !!envVars.SUPABASE_SERVICE_ROLE_KEY,
          needsServiceRole
        }
      );

      // Keys are ephemeral - discarded after this function returns
      return envVars;

    } catch (error) {
      await this.loggingService.logCriticalError(
        'supabase_env_injection_failed',
        error as Error,
        { userId, projectId, deploymentLane, selectedProjectRef }
      );

      if ((error as Error).message.includes('FALLBACK_TO_MANUAL')) {
        throw new Error('FALLBACK_TO_MANUAL: Unable to fetch Supabase credentials via OAuth. Please configure manually.');
      }

      throw error;
    }
  }

  /**
   * Validate deployment configuration before build
   */
  async validateDeploymentConfiguration(
    supabaseIntegration: SupabaseIntegrationDetection,
    deploymentLane: 'pages-static' | 'pages-edge' | 'workers-node',
    userId: string,
    projectId: string
  ): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
    recommendations: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];

    try {
      // Check deployment lane compatibility
      if (supabaseIntegration.needsServiceRole && deploymentLane !== 'workers-node') {
        errors.push('Service role access requires Workers deployment lane');
        recommendations.push('Switch to Workers deployment or remove server-side Supabase patterns');
      }

      // Check OAuth connection validity
      if (supabaseIntegration.connectionType === 'oauth') {
        const connection = await this.connectionService.getConnection(userId, projectId);
        
        if (!connection) {
          errors.push('OAuth connection not found');
          recommendations.push('Reconnect Supabase in project settings or use manual configuration');
        } else if (connection.connection_status !== 'active') {
          errors.push(`OAuth connection status: ${connection.connection_status}`);
          recommendations.push('Reconnect Supabase in project settings');
        } else {
          // Test token validity
          try {
            const tokens = await this.connectionService.getValidTokens(connection.id);
            
            if (supabaseIntegration.selectedProjectRef) {
              const hasAccess = await this.managementAPI.validateProjectAccess(
                tokens.access_token,
                supabaseIntegration.selectedProjectRef
              );
              
              if (!hasAccess) {
                errors.push('Cannot access selected Supabase project');
                recommendations.push('Verify project permissions or select a different project');
              }
            }
          } catch (tokenError) {
            errors.push('OAuth tokens expired or invalid');
            recommendations.push('Reconnect Supabase in project settings');
          }
        }
      }

      // Check for missing project selection
      if (supabaseIntegration.connectionType === 'oauth' && !supabaseIntegration.selectedProjectRef) {
        errors.push('No Supabase project selected');
        recommendations.push('Select a Supabase project in project settings');
      }

      // Check deployment lane specific warnings
      if (deploymentLane === 'pages-edge' && supabaseIntegration.needsServiceRole) {
        warnings.push('Server-side patterns detected with Edge runtime - consider Workers for better compatibility');
      }

      if (deploymentLane === 'pages-static' && supabaseIntegration.hasSupabase) {
        warnings.push('Static deployment with Supabase requires client-side only patterns');
      }

      const valid = errors.length === 0;

      return {
        valid,
        errors,
        warnings,
        recommendations
      };

    } catch (error) {
      await this.loggingService.logCriticalError(
        'supabase_validation_failed',
        error as Error,
        { userId, projectId, deploymentLane }
      );

      return {
        valid: false,
        errors: ['Validation failed due to internal error'],
        warnings: [],
        recommendations: ['Try again or use manual Supabase configuration']
      };
    }
  }

  /**
   * Check for server-side Supabase patterns in project
   */
  private async checkForServerSidePatterns(projectPath: string): Promise<boolean> {
    try {
      // Use the three-lane deployment system for pattern detection
      const { CloudflareThreeLaneDeployment } = await import('./cloudflareThreeLaneDeployment');
      const deployment = CloudflareThreeLaneDeployment.getInstance();

      // Check for server-side patterns like service-role usage
      const serverPatterns = [
        'SUPABASE_SERVICE_ROLE_KEY',
        'createServerComponentClient',
        'createRouteHandlerClient',
        'createServerActionClient',
        'use server',
        'cookies().get',
        'export const runtime = \'nodejs\'',
        'process.env.SUPABASE_SERVICE_ROLE_KEY'
      ];

      const hasServerPatterns = await deployment.checkForPattern(
        projectPath,
        ['app/**', 'pages/**', 'src/**', 'server/**'],
        serverPatterns
      );

      if (hasServerPatterns) {
        return true;
      }

      // Also check for API routes which typically need service-role access
      const hasAPIRoutes = await deployment.checkForPattern(
        projectPath,
        ['app/**', 'pages/**'],
        ['app/api/', 'pages/api/']
      );

      return hasAPIRoutes;

    } catch (error) {
      await this.loggingService.logServerEvent(
        'capacity',
        'warn',
        'Server-side pattern detection failed',
        { projectPath, error: (error as Error).message }
      );
      return false;
    }
  }

  /**
   * Check for any Supabase patterns in project
   */
  private async checkForSupabasePatterns(projectPath: string): Promise<boolean> {
    try {
      // Use the three-lane deployment system for pattern detection
      const { CloudflareThreeLaneDeployment } = await import('./cloudflareThreeLaneDeployment');
      const deployment = CloudflareThreeLaneDeployment.getInstance();

      // Check for general Supabase usage
      const supabasePatterns = [
        'NEXT_PUBLIC_SUPABASE_URL',
        'createClientComponentClient',
        'supabase',
        '@supabase/supabase-js',
        'createClient',
        'supabase.co',
        'from \'@supabase/',
        'from "@supabase/',
        'import.*supabase',
        'process.env.NEXT_PUBLIC_SUPABASE_URL'
      ];

      return await deployment.checkForPattern(
        projectPath,
        ['app/**', 'pages/**', 'src/**', 'components/**', 'lib/**', 'utils/**', 'package.json'],
        supabasePatterns
      );

    } catch (error) {
      await this.loggingService.logServerEvent(
        'capacity',
        'warn',
        'Supabase pattern detection failed',
        { projectPath, error: (error as Error).message }
      );
      return false;
    }
  }

  /**
   * Get deployment guidance based on Supabase integration
   */
  getDeploymentGuidance(
    supabaseIntegration: SupabaseIntegrationDetection,
    currentLane: string
  ): {
    recommendedLane: string;
    reasoning: string;
    alternatives: Array<{ lane: string; tradeoffs: string }>;
  } {
    if (!supabaseIntegration.hasSupabase) {
      return {
        recommendedLane: currentLane,
        reasoning: 'No Supabase detected - current deployment lane is optimal',
        alternatives: []
      };
    }

    if (supabaseIntegration.needsServiceRole) {
      return {
        recommendedLane: 'workers-node',
        reasoning: 'Server-side Supabase patterns require Workers for secure service-role key access',
        alternatives: [
          {
            lane: 'pages-edge',
            tradeoffs: 'Remove server-side patterns and use client-side only'
          },
          {
            lane: 'pages-static',
            tradeoffs: 'Convert to static site with client-side authentication only'
          }
        ]
      };
    }

    if (supabaseIntegration.connectionType === 'oauth' && supabaseIntegration.availableProjects?.length === 0) {
      return {
        recommendedLane: currentLane,
        reasoning: 'OAuth connected but no projects available - current lane maintained',
        alternatives: [
          {
            lane: 'manual',
            tradeoffs: 'Configure Supabase credentials manually in project settings'
          }
        ]
      };
    }

    return {
      recommendedLane: currentLane,
      reasoning: 'Supabase configuration compatible with current deployment lane',
      alternatives: []
    };
  }

  /**
   * Generate OAuth authorization URL for project setup
   */
  generateOAuthURL(userId: string, projectId: string, nextUrl?: string): {
    authUrl: string;
    state: string;
    codeVerifier: string;
  } {
    return this.managementAPI.generateAuthorizationURL(userId, projectId, nextUrl);
  }

  /**
   * Test Supabase Management API connectivity
   */
  async testSupabaseConnectivity(): Promise<{
    available: boolean;
    latency?: number;
    error?: string;
  }> {
    return await this.managementAPI.healthCheck();
  }
}