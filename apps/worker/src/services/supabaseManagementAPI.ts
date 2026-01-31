import { ServerLoggingService } from './serverLoggingService';
import { SupabaseConnectionService, AccountDiscovery, SupabaseProject } from './supabaseConnectionService';

/**
 * Supabase Management API Service
 * Handles all interactions with the Supabase Management API
 * Includes account discovery, project listing, and credential retrieval
 */

export interface SupabaseAPICredentials {
  url: string;
  publishableKey: string;
  serviceRoleKey?: string;
}

export interface SupabaseAPIProject {
  id: string;
  ref: string;
  name: string;
  region: string;
  status: string;
  organization?: {
    id: string;
    name: string;
    slug: string;
  };
}

export interface SupabaseAPIKey {
  id: string;
  name: string;
  api_key: string;
}

export class SupabaseManagementAPI {
  private static instance: SupabaseManagementAPI;
  private loggingService: ServerLoggingService;
  private connectionService: SupabaseConnectionService;

  constructor() {
    this.loggingService = ServerLoggingService.getInstance();
    this.connectionService = SupabaseConnectionService.getInstance();
  }

  static getInstance(): SupabaseManagementAPI {
    if (!SupabaseManagementAPI.instance) {
      SupabaseManagementAPI.instance = new SupabaseManagementAPI();
    }
    return SupabaseManagementAPI.instance;
  }

  /**
   * Discover user's Supabase account (projects, organizations)
   */
  async discoverSupabaseAccount(accessToken: string): Promise<AccountDiscovery> {
    try {
      // Single call to get all projects with timeout and retry
      const response = await this.fetchWithRetry('https://api.supabase.com/v1/projects', {
        headers: { 
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        },
        timeout: 10000
      });

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('Insufficient permissions to list projects');
        }
        if (response.status === 401) {
          throw new Error('Access token expired or invalid');
        }
        throw new Error(`Projects API failed: ${response.status}`);
      }

      const projects = await response.json() as SupabaseAPIProject[];

      // Filter and validate projects
      const validProjects: SupabaseProject[] = projects
        .map(project => ({
          id: project.id,
          ref: project.ref, // Use ref for Management API calls (per consultant feedback)
          name: project.name,
          url: `https://${project.ref}.supabase.co`,
          region: project.region,
          status: project.status,
          organization: project.organization?.name || 'Personal',
          canConnect: project.status === 'ACTIVE_HEALTHY' // Only allow connecting to healthy projects
        }))
        .filter(project => project.ref && project.status); // Filter out invalid projects

      const readyProjects = validProjects.filter(p => p.canConnect);

      await this.loggingService.logServerEvent(
        'capacity',
        'info',
        'Supabase account discovery completed',
        {
          totalProjects: projects.length,
          validProjects: validProjects.length,
          readyProjects: readyProjects.length
        }
      );

      return {
        projects: validProjects,
        needsProjectCreation: validProjects.length === 0,
        canCreateProjects: true, // Assume true for MVP; check write permissions if needed
        readyProjects: readyProjects.length
      };

    } catch (error) {
      await this.loggingService.logServerEvent('error', 'warn', 'Supabase discovery failed', {
        error: (error as Error).message,
        errorType: error instanceof Error ? error.constructor.name : 'unknown'
      });

      // Graceful fallback to manual setup
      return {
        projects: [],
        needsProjectCreation: true,
        canCreateProjects: false,
        readyProjects: 0,
        discoveryFailed: true,
        error: (error as Error).message,
        fallbackToManual: true
      };
    }
  }

  /**
   * Get project credentials (API keys) from Supabase Management API
   */
  async getProjectCredentials(
    accessToken: string, 
    projectRef: string, 
    includeServiceKey = false
  ): Promise<SupabaseAPICredentials> {
    try {
      // Fetch API keys with reveal=true to get actual key values
      const response = await this.fetchWithRetry(
        `https://api.supabase.com/v1/projects/${projectRef}/api-keys?reveal=true`,
        {
          headers: { 
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
          },
          timeout: 10000
        }
      );

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('INSUFFICIENT_PERMISSIONS: User lacks permission to read API keys for this project');
        }
        if (response.status === 404) {
          throw new Error('PROJECT_NOT_FOUND: Project not found or inaccessible');
        }
        if (response.status === 401) {
          throw new Error('UNAUTHORIZED: Access token expired or invalid');
        }
        throw new Error(`Failed to retrieve API keys: ${response.status}`);
      }

      const keys = await response.json() as SupabaseAPIKey[];

      // Find publishable (anon) key
      const publishableKey = keys.find(k => k.name === 'anon')?.api_key;
      if (!publishableKey) {
        throw new Error('No publishable (anon) key found for project');
      }

      const credentials: SupabaseAPICredentials = {
        url: `https://${projectRef}.supabase.co`,
        publishableKey
      };

      // Only include service key if explicitly requested
      if (includeServiceKey) {
        const serviceKey = keys.find(k => k.name === 'service_role')?.api_key;
        if (serviceKey) {
          credentials.serviceRoleKey = serviceKey;
        } else {
          await this.loggingService.logServerEvent(
            'capacity',
            'warn',
            'Service role key not found',
            { projectRef }
          );
        }
      }

      await this.loggingService.logServerEvent(
        'capacity',
        'info',
        'Supabase credentials retrieved successfully',
        { 
          projectRef, 
          includeServiceKey,
          hasServiceKey: !!credentials.serviceRoleKey,
          keysFound: keys.length
        }
      );

      return credentials;

    } catch (error) {
      await this.loggingService.logServerEvent('error', 'error', 'Credentials retrieval failed', {
        error: (error as Error).message,
        projectRef,
        includeServiceKey
      });

      throw error;
    }
  }

  /**
   * Exchange OAuth authorization code for access token
   */
  async exchangeOAuthCode(
    code: string,
    codeVerifier: string,
    redirectUri: string
  ): Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
  }> {
    try {
      // Verify we have the required OAuth credentials
      if (!process.env.SUPABASE_OAUTH_CLIENT_ID || !process.env.SUPABASE_OAUTH_CLIENT_SECRET) {
        throw new Error('Missing OAuth client credentials in environment');
      }

      const response = await this.fetchWithRetry('https://api.supabase.com/v1/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(
            `${process.env.SUPABASE_OAUTH_CLIENT_ID}:${process.env.SUPABASE_OAUTH_CLIENT_SECRET}`
          ).toString('base64'),
          'Accept': 'application/json'
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          code_verifier: codeVerifier
        }),
        timeout: 10000
      });

      if (!response.ok) {
        const errorText = await response.text();
        
        if (response.status === 400) {
          throw new Error(`Invalid OAuth request: ${errorText}`);
        }
        if (response.status === 401) {
          throw new Error('Invalid client credentials');
        }
        
        throw new Error(`Token exchange failed: ${response.status} - ${errorText}`);
      }

      const tokens = await response.json() as {
        access_token: string;
        refresh_token: string;
        expires_in: number;
        token_type: string;
      };

      // Validate token response
      if (!tokens.access_token || !tokens.refresh_token) {
        throw new Error('Invalid token response: missing required tokens');
      }

      await this.loggingService.logServerEvent(
        'capacity',
        'info',
        'OAuth token exchange successful',
        { 
          expiresIn: tokens.expires_in,
          tokenType: tokens.token_type,
          hasAccessToken: !!tokens.access_token,
          hasRefreshToken: !!tokens.refresh_token
        }
      );

      return tokens;

    } catch (error) {
      await this.loggingService.logCriticalError(
        'oauth_token_exchange_failed',
        error as Error,
        { redirectUri }
      );
      throw error;
    }
  }

  /**
   * Validate project access with given token
   */
  async validateProjectAccess(accessToken: string, projectRef: string): Promise<boolean> {
    try {
      const response = await this.fetchWithRetry(
        `https://api.supabase.com/v1/projects/${projectRef}`,
        {
          headers: { 
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
          },
          timeout: 5000
        }
      );

      return response.ok;
    } catch (error) {
      await this.loggingService.logServerEvent(
        'capacity',
        'warn',
        'Project access validation failed',
        { projectRef, error: (error as Error).message }
      );
      return false;
    }
  }

  /**
   * Get detailed project information
   */
  async getProjectDetails(accessToken: string, projectRef: string): Promise<SupabaseAPIProject | null> {
    try {
      const response = await this.fetchWithRetry(
        `https://api.supabase.com/v1/projects/${projectRef}`,
        {
          headers: { 
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
          },
          timeout: 10000
        }
      );

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`Failed to get project details: ${response.status}`);
      }

      return await response.json() as SupabaseAPIProject | null;
    } catch (error) {
      await this.loggingService.logServerEvent(
        'capacity',
        'warn',
        'Failed to get project details',
        { projectRef, error: (error as Error).message }
      );
      return null;
    }
  }

  /**
   * Generate OAuth authorization URL
   */
  generateAuthorizationURL(
    userId: string,
    projectId: string,
    nextUrl?: string
  ): {
    authUrl: string;
    state: string;
    codeVerifier: string;
    codeChallenge: string;
  } {
    try {
      const authUrl = new URL('https://api.supabase.com/v1/oauth/authorize');
      
      // Set required OAuth parameters
      authUrl.searchParams.set('client_id', process.env.SUPABASE_OAUTH_CLIENT_ID!);
      authUrl.searchParams.set('response_type', 'code');

      // Use fixed callback URL (registered with Supabase)
      const redirectUri = process.env.NODE_ENV === 'production'
        ? 'https://sheenapps.com/connect/supabase/callback'
        : 'http://localhost:3000/connect/supabase/callback';
      authUrl.searchParams.set('redirect_uri', redirectUri);

      // Generate PKCE parameters
      const codeVerifier = this.generateCodeVerifier();
      const codeChallenge = this.generateCodeChallenge(codeVerifier);
      authUrl.searchParams.set('code_challenge', codeChallenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');

      // Create secure state parameter
      const stateNonce = this.generateNonce();
      const stateData = {
        userId,
        projectId,
        nextUrl: nextUrl || `/projects/${projectId}/settings`,
        nonce: stateNonce,
        expiresAt: Date.now() + 300000 // 5 minutes
      };

      const stateJson = JSON.stringify(stateData);
      const stateSignature = require('crypto')
        .createHmac('sha256', process.env.OAUTH_STATE_SECRET!)
        .update(stateJson)
        .digest('hex');

      const signedState = Buffer.from(JSON.stringify({ 
        data: stateData, 
        signature: stateSignature 
      })).toString('base64');

      authUrl.searchParams.set('state', signedState);

      return {
        authUrl: authUrl.toString(),
        state: signedState,
        codeVerifier,
        codeChallenge
      };

    } catch (error) {
      throw new Error(`Failed to generate authorization URL: ${(error as Error).message}`);
    }
  }

  /**
   * Validate and parse OAuth state parameter
   */
  validateOAuthState(state: string): {
    valid: boolean;
    data?: {
      userId: string;
      projectId: string;
      nextUrl: string;
      nonce: string;
      expiresAt: number;
    };
    error?: string;
  } {
    try {
      if (!process.env.OAUTH_STATE_SECRET) {
        return { valid: false, error: 'OAuth state secret not configured' };
      }

      // Decode state
      const { data: stateData, signature } = JSON.parse(Buffer.from(state, 'base64').toString());

      // Verify signature
      const expectedSignature = require('crypto')
        .createHmac('sha256', process.env.OAUTH_STATE_SECRET)
        .update(JSON.stringify(stateData))
        .digest('hex');

      if (signature !== expectedSignature) {
        return { valid: false, error: 'Invalid state signature' };
      }

      // Check expiry
      if (Date.now() > stateData.expiresAt) {
        return { valid: false, error: 'State has expired' };
      }

      return { valid: true, data: stateData };

    } catch (error) {
      return { valid: false, error: 'Invalid state format' };
    }
  }

  /**
   * Utility: Fetch with retry logic and timeout
   */
  private async fetchWithRetry(url: string, options: any, retries = 3): Promise<Response> {
    for (let i = 0; i < retries; i++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), options.timeout || 10000);

        const response = await fetch(url, {
          ...options,
          signal: controller.signal
        });

        clearTimeout(timeoutId);
        return response;

      } catch (error) {
        if (i === retries - 1) throw error;
        
        // Exponential backoff
        const delay = Math.pow(2, i) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw new Error('Max retries exceeded');
  }

  /**
   * Generate cryptographically secure code verifier for PKCE
   */
  private generateCodeVerifier(): string {
    const array = new Uint8Array(32);
    require('crypto').getRandomValues(array);
    return Buffer.from(array).toString('base64url');
  }

  /**
   * Generate code challenge from code verifier (SHA256)
   */
  private generateCodeChallenge(codeVerifier: string): string {
    const hash = require('crypto').createHash('sha256').update(codeVerifier).digest();
    return Buffer.from(hash).toString('base64url');
  }

  /**
   * Generate secure random nonce
   */
  private generateNonce(): string {
    return require('crypto').randomBytes(16).toString('hex');
  }

  /**
   * Check if Management API is available
   */
  async healthCheck(): Promise<{ available: boolean; latency?: number; error?: string }> {
    const startTime = Date.now();

    try {
      // Simple health check - just check if the endpoint responds
      const response = await this.fetchWithRetry('https://api.supabase.com/v1/health', {
        method: 'GET',
        timeout: 5000
      });

      const latency = Date.now() - startTime;

      return {
        available: response.ok,
        latency
      };

    } catch (error) {
      return {
        available: false,
        latency: Date.now() - startTime,
        error: (error as Error).message
      };
    }
  }
}