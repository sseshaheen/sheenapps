import * as crypto from 'crypto';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { TokenEncryptionService, TokenStorageUtils } from './tokenEncryptionService';
import { ServerLoggingService } from './serverLoggingService';
import { getPool } from './database';

/**
 * Vercel OAuth Service with PKCE
 * Implements secure OAuth 2.0 flow with Vercel including scope validation,
 * token encryption, and circuit breaker patterns
 */

// =============================================================================
// TYPES & SCHEMAS
// =============================================================================

export interface VercelOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
}

export interface VercelTokens {
  access_token: string;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  refresh_token?: string | undefined;
  token_type: string;
  expires_in?: number | undefined;
  granted_scopes?: string | undefined;
  installation_id?: string | undefined;
  user_id?: string | undefined;
  team_id?: string | null | undefined;
}

export interface VercelConnection {
  id: string;
  user_id: string;
  project_id?: string;
  team_id?: string;
  team_name?: string;
  account_type: 'personal' | 'team';
  access_token: string;
  access_token_iv: string;
  access_token_auth_tag: string;
  refresh_token?: string;
  refresh_token_iv?: string;
  refresh_token_auth_tag?: string;
  token_expires_at?: Date;
  installation_id?: string;
  user_email?: string;
  scopes: string[];
  granted_scopes?: string;
  metadata: Record<string, any>;
  status: 'connected' | 'disconnected' | 'error' | 'revoked' | 'expired';
  error_message?: string;
  circuit_breaker_state: {
    consecutive_failures: number;
    is_open: boolean;
    last_failure_at?: string;
    open_until?: string;
  };
  created_at: Date;
  updated_at: Date;
  last_sync_at?: Date;
}

export interface PKCEChallenge {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
}

export interface OAuthState {
  nonce: string;
  user_id: string;
  project_id?: string;
  redirect_url?: string;
  pkce_verifier: string;
}

// Validation schemas
const VercelTokenResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.string().default('bearer'),
  expires_in: z.number().optional(),
  refresh_token: z.string().optional(),
  granted_scopes: z.string().optional(),
  installation_id: z.string().optional(),
  user_id: z.string().optional(),
  team_id: z.string().nullable().optional(),
  team_name: z.string().nullable().optional()
});

const VercelUserInfoSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string().email(),
    name: z.string().optional(),
    username: z.string()
  }),
  team: z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string()
  }).nullable().optional()
});

// =============================================================================
// CUSTOM ERRORS
// =============================================================================

export class VercelOAuthError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'VercelOAuthError';
  }
}

export class ScopeError extends Error {
  constructor(message: string, public requiredScope?: string) {
    super(message);
    this.name = 'ScopeError';
  }
}

export class CircuitBreakerError extends Error {
  constructor(message: string, public retryAfter?: number) {
    super(message);
    this.name = 'CircuitBreakerError';
  }
}

// =============================================================================
// MAIN SERVICE CLASS
// =============================================================================

export class VercelOAuthService {
  private static instance: VercelOAuthService;
  private readonly config: VercelOAuthConfig;
  private readonly encryptionService: TokenEncryptionService;
  private readonly loggingService: ServerLoggingService;
  private readonly baseUrl = 'https://api.vercel.com';

  constructor() {
    this.encryptionService = TokenEncryptionService.getInstance();
    this.loggingService = ServerLoggingService.getInstance();
    
    // Initialize config from environment
    this.config = {
      clientId: process.env.VERCEL_OAUTH_CLIENT_ID!,
      clientSecret: process.env.VERCEL_OAUTH_CLIENT_SECRET!,
      redirectUri: this.getRedirectUri(),
      // Include all scopes needed by VercelAPIService operations
      scopes: [
        'user',
        'project:read',
        'project:write',      // For createProject, updateProject
        'deployment:read',
        'deployment:write',
        'env:read',           // For listEnvVars
        'env:write'           // For createEnvVar, updateEnvVar, deleteEnvVar
      ]
    };

    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error('Vercel OAuth credentials not configured');
    }
  }

  static getInstance(): VercelOAuthService {
    if (!VercelOAuthService.instance) {
      VercelOAuthService.instance = new VercelOAuthService();
    }
    return VercelOAuthService.instance;
  }

  private getRedirectUri(): string {
    const baseUrl = process.env.NODE_ENV === 'production'
      ? 'https://app.sheenapps.com'
      : 'http://localhost:3000';
    return `${baseUrl}/v1/internal/vercel/oauth/callback`;
  }

  // =============================================================================
  // PKCE IMPLEMENTATION
  // =============================================================================

  /**
   * Generate PKCE challenge for secure OAuth flow
   */
  generatePKCEChallenge(): PKCEChallenge {
    // Generate 128-bit random code verifier
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    
    // Create SHA256 hash of verifier
    const hash = crypto.createHash('sha256').update(codeVerifier).digest();
    const codeChallenge = hash.toString('base64url');

    return {
      codeVerifier,
      codeChallenge,
      codeChallengeMethod: 'S256'
    };
  }

  /**
   * Generate authorization URL with PKCE
   */
  async generateAuthUrl(
    userId: string, 
    projectId?: string, 
    redirectUrl?: string
  ): Promise<{ authUrl: string; state: string }> {
    const pkce = this.generatePKCEChallenge();
    const state = randomUUID();
    
    // Store state and PKCE verifier
    await getPool().query(
      `INSERT INTO oauth_state_nonces (nonce, user_id, provider, redirect_url, metadata, expires_at)
       VALUES ($1, $2, 'vercel', $3, $4, $5)`,
      [
        state,
        userId,
        redirectUrl,
        JSON.stringify({ 
          pkce_verifier: pkce.codeVerifier,
          project_id: projectId 
        }),
        new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
      ]
    );

    const params = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: 'code',
      scope: this.config.scopes.join(' '),
      redirect_uri: this.config.redirectUri,
      state,
      code_challenge: pkce.codeChallenge,
      code_challenge_method: pkce.codeChallengeMethod
    });

    const authUrl = `https://vercel.com/oauth/authorize?${params.toString()}`;

    await this.loggingService.logServerEvent(
      'capacity',
      'info',
      'Vercel OAuth authorization URL generated',
      { userId, projectId, hasRedirectUrl: !!redirectUrl }
    );

    return { authUrl, state };
  }

  // =============================================================================
  // TOKEN EXCHANGE & MANAGEMENT
  // =============================================================================

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(
    code: string,
    state: string
  ): Promise<{ connectionId: string; tokens: VercelTokens; userInfo: any }> {
    // Validate and retrieve state
    const stateResult = await getPool().query(
      `SELECT user_id, redirect_url, metadata, expires_at 
       FROM oauth_state_nonces 
       WHERE nonce = $1 AND provider = 'vercel' AND expires_at > NOW()`,
      [state]
    );

    if (stateResult.rows.length === 0) {
      throw new VercelOAuthError('Invalid or expired state parameter', 'INVALID_STATE');
    }

    const stateData = stateResult.rows[0];
    const metadata = stateData.metadata || {};
    const pkceVerifier = metadata.pkce_verifier;

    if (!pkceVerifier) {
      throw new VercelOAuthError('Missing PKCE verifier', 'MISSING_PKCE');
    }

    try {
      // Exchange code for tokens
      const tokenResponse = await fetch('https://api.vercel.com/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          code,
          redirect_uri: this.config.redirectUri,
          grant_type: 'authorization_code',
          code_verifier: pkceVerifier
        })
      });

      if (!tokenResponse.ok) {
        const error = await tokenResponse.text();
        throw new VercelOAuthError(`Token exchange failed: ${error}`, 'TOKEN_EXCHANGE_FAILED');
      }

      const tokenData = await tokenResponse.json();
      const tokens = VercelTokenResponseSchema.parse(tokenData);

      // Get user info
      const userInfo = await this.getUserInfo(tokens.access_token);

      // Store connection
      const connectionId = await this.storeConnection(
        stateData.user_id,
        metadata.project_id,
        tokens,
        userInfo
      );

      // Clean up state
      await getPool().query('DELETE FROM oauth_state_nonces WHERE nonce = $1', [state]);

      await this.loggingService.logServerEvent(
        'capacity',
        'info',
        'Vercel OAuth token exchange successful',
        { 
          connectionId,
          userId: stateData.user_id,
          projectId: metadata.project_id,
          teamId: tokens.team_id,
          grantedScopes: tokens.granted_scopes
        }
      );

      return { connectionId, tokens, userInfo };

    } catch (error) {
      await this.loggingService.logCriticalError(
        'vercel_oauth_exchange_failed',
        error as Error,
        { userId: stateData.user_id, state }
      );
      throw error;
    }
  }

  /**
   * Get user information from Vercel API
   */
  private async getUserInfo(accessToken: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/v2/user`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new VercelOAuthError(`Failed to fetch user info: ${response.statusText}`, 'USER_INFO_FAILED');
    }

    const data = await response.json();
    return VercelUserInfoSchema.parse(data);
  }

  /**
   * Store encrypted connection in database
   */
  private async storeConnection(
    userId: string,
    projectId: string | undefined,
    tokens: VercelTokens,
    userInfo: any
  ): Promise<string> {
    // Encrypt tokens using individual encryption
    const accessTokenEncrypted = await this.encryptionService.encryptToken(tokens.access_token);
    const refreshTokenEncrypted = tokens.refresh_token 
      ? await this.encryptionService.encryptToken(tokens.refresh_token)
      : null;

    const connectionId = randomUUID();
    const expiresAt = tokens.expires_in 
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null;

    // PostgreSQL only allows ONE ON CONFLICT clause per INSERT.
    // Use separate queries based on whether team_id exists.
    const values = [
      connectionId,
      userId,
      projectId || null,
      tokens.team_id || null,
      userInfo.team?.name || null,
      tokens.team_id ? 'team' : 'personal',
      accessTokenEncrypted.encrypted,
      accessTokenEncrypted.iv,
      accessTokenEncrypted.authTag,
      refreshTokenEncrypted?.encrypted || null,
      refreshTokenEncrypted?.iv || null,
      refreshTokenEncrypted?.authTag || null,
      expiresAt,
      tokens.installation_id || null,
      userInfo.user.email,
      this.config.scopes,
      tokens.granted_scopes || this.config.scopes.join(' '),
      JSON.stringify({ user_info: userInfo }),
      'connected',
      JSON.stringify({
        consecutive_failures: 0,
        is_open: false,
        last_failure_at: null,
        open_until: null
      })
    ];

    if (tokens.team_id) {
      // Team connection: conflict on (user_id, team_id)
      await getPool().query(`
        INSERT INTO vercel_connections (
          id, user_id, project_id, team_id, team_name, account_type,
          access_token, access_token_iv, access_token_auth_tag,
          refresh_token, refresh_token_iv, refresh_token_auth_tag,
          token_expires_at, installation_id, user_email,
          scopes, granted_scopes, metadata, status, circuit_breaker_state
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
        )
        ON CONFLICT (user_id, team_id) WHERE team_id IS NOT NULL
        DO UPDATE SET
          access_token = EXCLUDED.access_token,
          access_token_iv = EXCLUDED.access_token_iv,
          access_token_auth_tag = EXCLUDED.access_token_auth_tag,
          refresh_token = EXCLUDED.refresh_token,
          refresh_token_iv = EXCLUDED.refresh_token_iv,
          refresh_token_auth_tag = EXCLUDED.refresh_token_auth_tag,
          token_expires_at = EXCLUDED.token_expires_at,
          granted_scopes = EXCLUDED.granted_scopes,
          status = 'connected',
          updated_at = NOW()`,
        values
      );
    } else {
      // Personal connection: conflict on user_id where team_id IS NULL
      await getPool().query(`
        INSERT INTO vercel_connections (
          id, user_id, project_id, team_id, team_name, account_type,
          access_token, access_token_iv, access_token_auth_tag,
          refresh_token, refresh_token_iv, refresh_token_auth_tag,
          token_expires_at, installation_id, user_email,
          scopes, granted_scopes, metadata, status, circuit_breaker_state
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
        )
        ON CONFLICT (user_id) WHERE team_id IS NULL
        DO UPDATE SET
          access_token = EXCLUDED.access_token,
          access_token_iv = EXCLUDED.access_token_iv,
          access_token_auth_tag = EXCLUDED.access_token_auth_tag,
          refresh_token = EXCLUDED.refresh_token,
          refresh_token_iv = EXCLUDED.refresh_token_iv,
          refresh_token_auth_tag = EXCLUDED.refresh_token_auth_tag,
          token_expires_at = EXCLUDED.token_expires_at,
          granted_scopes = EXCLUDED.granted_scopes,
          status = 'connected',
          updated_at = NOW()`,
        values
      );
    }

    return connectionId;
  }

  // =============================================================================
  // CONNECTION MANAGEMENT
  // =============================================================================

  /**
   * Get connection by user and project
   */
  async getConnection(userId: string, projectId?: string): Promise<VercelConnection | null> {
    const result = await getPool().query(
      `SELECT * FROM vercel_connections 
       WHERE user_id = $1 AND (project_id = $2 OR ($2 IS NULL AND project_id IS NULL))
       ORDER BY created_at DESC LIMIT 1`,
      [userId, projectId || null]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get valid tokens (refresh if needed)
   */
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  async getValidTokens(connectionId: string): Promise<{ access_token: string; refresh_token?: string | undefined }> {
    const result = await getPool().query(
      'SELECT * FROM vercel_connections WHERE id = $1',
      [connectionId]
    );

    if (result.rows.length === 0) {
      throw new VercelOAuthError('Connection not found', 'CONNECTION_NOT_FOUND');
    }

    const connection = result.rows[0];
    
    // Check if tokens need refresh
    const needsRefresh = connection.token_expires_at && 
      new Date(connection.token_expires_at) <= new Date(Date.now() + 5 * 60 * 1000); // 5 min buffer

    if (needsRefresh && connection.refresh_token) {
      return await this.refreshTokens(connectionId);
    }

    // Decrypt existing tokens directly
    const accessToken = await this.encryptionService.decryptToken({
      encrypted: connection.access_token,
      iv: connection.access_token_iv,
      authTag: connection.access_token_auth_tag
    });

    const refreshToken = connection.refresh_token 
      ? await this.encryptionService.decryptToken({
          encrypted: connection.refresh_token,
          iv: connection.refresh_token_iv,
          authTag: connection.refresh_token_auth_tag
        })
      : undefined;

    return { access_token: accessToken, refresh_token: refreshToken };
  }

  /**
   * Refresh access tokens
   */
  private async refreshTokens(connectionId: string): Promise<{ access_token: string; refresh_token?: string | undefined }> {
    const connection = await getPool().query(
      'SELECT * FROM vercel_connections WHERE id = $1',
      [connectionId]
    );

    if (connection.rows.length === 0) {
      throw new VercelOAuthError('Connection not found', 'CONNECTION_NOT_FOUND');
    }

    const conn = connection.rows[0];
    
    // Decrypt refresh token directly
    if (!conn.refresh_token) {
      throw new VercelOAuthError('No refresh token available', 'NO_REFRESH_TOKEN');
    }

    const refreshToken = await this.encryptionService.decryptToken({
      encrypted: conn.refresh_token,
      iv: conn.refresh_token_iv,
      authTag: conn.refresh_token_auth_tag
    });

    try {
      // Request new tokens
      const response = await fetch('https://api.vercel.com/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          grant_type: 'refresh_token',
          refresh_token: refreshToken
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new VercelOAuthError(`Token refresh failed: ${error}`, 'TOKEN_REFRESH_FAILED');
      }

      const tokenData = await response.json();
      const newTokens = VercelTokenResponseSchema.parse(tokenData);

      // Encrypt and update tokens
      const newAccessTokenEncrypted = await this.encryptionService.encryptToken(newTokens.access_token);
      const newRefreshTokenEncrypted = newTokens.refresh_token 
        ? await this.encryptionService.encryptToken(newTokens.refresh_token)
        : await this.encryptionService.encryptToken(refreshToken); // Keep existing refresh token

      const expiresAt = newTokens.expires_in
        ? new Date(Date.now() + newTokens.expires_in * 1000)
        : null;

      await getPool().query(`
        UPDATE vercel_connections 
        SET access_token = $1, access_token_iv = $2, access_token_auth_tag = $3,
            refresh_token = $4, refresh_token_iv = $5, refresh_token_auth_tag = $6,
            token_expires_at = $7, status = 'connected', updated_at = NOW()
        WHERE id = $8`,
        [
          newAccessTokenEncrypted.encrypted,
          newAccessTokenEncrypted.iv,
          newAccessTokenEncrypted.authTag,
          newRefreshTokenEncrypted.encrypted,
          newRefreshTokenEncrypted.iv,
          newRefreshTokenEncrypted.authTag,
          expiresAt,
          connectionId
        ]
      );

      await this.loggingService.logServerEvent(
        'capacity',
        'info',
        'Vercel OAuth tokens refreshed successfully',
        { connectionId }
      );

      return {
        access_token: newTokens.access_token,
        refresh_token: newTokens.refresh_token || refreshToken
      };

    } catch (error) {
      await this.loggingService.logCriticalError(
        'vercel_token_refresh_failed',
        error as Error,
        { connectionId }
      );

      // Mark connection as expired on refresh failure
      await getPool().query(
        'UPDATE vercel_connections SET status = $1, error_message = $2 WHERE id = $3',
        ['expired', (error as Error).message, connectionId]
      );

      throw error;
    }
  }

  // =============================================================================
  // SCOPE VALIDATION
  // =============================================================================

  /**
   * Require specific scope for operations
   */
  async requireScope(connectionId: string, requiredScope: string): Promise<void> {
    const result = await getPool().query(
      'SELECT granted_scopes, scopes FROM vercel_connections WHERE id = $1',
      [connectionId]
    );

    if (result.rows.length === 0) {
      throw new VercelOAuthError('Connection not found', 'CONNECTION_NOT_FOUND');
    }

    const connection = result.rows[0];
    const grantedScopes = (connection.granted_scopes || connection.scopes?.join(' ') || '').split(' ');

    if (!grantedScopes.includes(requiredScope)) {
      throw new ScopeError(
        `Required scope '${requiredScope}' not granted`,
        requiredScope
      );
    }
  }

  /**
   * Require multiple scopes
   */
  async requireScopes(connectionId: string, requiredScopes: string[]): Promise<void> {
    for (const scope of requiredScopes) {
      await this.requireScope(connectionId, scope);
    }
  }

  // =============================================================================
  // DISCONNECT & CLEANUP
  // =============================================================================

  /**
   * Disconnect Vercel connection
   */
  async disconnect(userId: string, projectId?: string): Promise<boolean> {
    const result = await getPool().query(
      `UPDATE vercel_connections 
       SET status = 'disconnected', updated_at = NOW()
       WHERE user_id = $1 AND (project_id = $2 OR ($2 IS NULL AND project_id IS NULL))`,
      [userId, projectId || null]
    );

    const disconnected = (result.rowCount || 0) > 0;

    if (disconnected) {
      await this.loggingService.logServerEvent(
        'capacity',
        'info',
        'Vercel connection disconnected',
        { userId, projectId }
      );
    }

    return disconnected;
  }

  // =============================================================================
  // HEALTH & STATUS
  // =============================================================================

  /**
   * Get connection status
   */
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  async getConnectionStatus(userId: string, projectId?: string): Promise<{
    connected: boolean;
    status?: string | undefined;
    connectionId?: string | undefined;
    expiresAt?: string | undefined;
    teamId?: string | undefined;
    teamName?: string | undefined;
  }> {
    const connection = await this.getConnection(userId, projectId);

    if (!connection) {
      return { connected: false };
    }

    return {
      connected: connection.status === 'connected',
      status: connection.status,
      connectionId: connection.id,
      expiresAt: connection.token_expires_at?.toISOString(),
      teamId: connection.team_id || undefined,
      teamName: connection.team_name || undefined
    };
  }

  /**
   * Test connection health
   */
  async testConnection(connectionId: string): Promise<{ healthy: boolean; latency?: number | undefined; error?: string | undefined }> {
    try {
      const startTime = Date.now();
      const tokens = await this.getValidTokens(connectionId);
      
      const response = await fetch(`${this.baseUrl}/v2/user`, {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`,
          'Accept': 'application/json'
        }
      });

      const latency = Date.now() - startTime;

      if (!response.ok) {
        return {
          healthy: false,
          latency,
          error: `HTTP ${response.status}: ${response.statusText}`
        };
      }

      return { healthy: true, latency };

    } catch (error) {
      return {
        healthy: false,
        error: (error as Error).message
      };
    }
  }
}