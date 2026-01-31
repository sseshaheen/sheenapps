/**
 * InhouseConnectorService - Third-party connector service for @sheenapps/connectors SDK
 *
 * Manages OAuth flows, API key connections, and connector API calls.
 * Credentials are encrypted at rest using AES-256-GCM.
 */

import { getPool } from '../database'
import * as crypto from 'crypto'
import { encrypt, decrypt } from '../../utils/credentialEncryption'

// ============================================================================
// Types
// ============================================================================

export type ConnectorType =
  | 'stripe'
  | 'figma'
  | 'slack'
  | 'github'
  | 'google-sheets'
  | 'notion'

export type ConnectorCategory =
  | 'payments'
  | 'design'
  | 'communication'
  | 'productivity'
  | 'development'
  | 'storage'
  | 'analytics'
  | 'crm'

export type ConnectorAuthType = 'oauth2' | 'apiKey'

export type ConnectionStatus =
  | 'pending'
  | 'connected'
  | 'error'
  | 'expired'
  | 'revoked'

export interface ConnectorDefinition {
  id: ConnectorType
  displayName: string
  description: string
  category: ConnectorCategory
  authType: ConnectorAuthType
  iconUrl?: string
  scopes?: ConnectorScope[]
  docsUrl?: string
}

export interface ConnectorScope {
  id: string
  name: string
  description: string
  required?: boolean
}

export interface Connection {
  id: string
  projectId: string
  type: ConnectorType
  displayName: string
  externalAccountId?: string
  status: ConnectionStatus
  scopes: string[]
  metadata: ConnectionMetadata
  connectedAt?: string
  expiresAt?: string
  createdAt: string
  updatedAt: string
}

export interface ConnectionMetadata {
  accountName?: string
  teamName?: string
  teamId?: string
  accountType?: 'personal' | 'team'
  [key: string]: unknown
}

export interface ConnectionSummary {
  id: string
  type: ConnectorType
  displayName: string
  status: ConnectionStatus
  accountName?: string
  connectedAt?: string
}

export interface OAuthState {
  id: string
  projectId: string
  connector: ConnectorType
  redirectUri: string
  scopes: string[]
  codeVerifier?: string
  stateData?: Record<string, unknown>
  expiresAt: string
  createdAt: string
}

export interface CreateOAuthStateInput {
  connector: ConnectorType
  redirectUri: string
  scopes?: string[]
  stateData?: Record<string, unknown>
}

export interface ExchangeOAuthInput {
  state: string
  code: string
  displayName?: string
}

export interface CreateApiKeyConnectionInput {
  connector: ConnectorType
  apiKey: string
  displayName?: string
  metadata?: Record<string, unknown>
}

export interface UpdateConnectionInput {
  displayName?: string
  metadata?: Record<string, unknown>
}

export interface ListConnectionsOptions {
  type?: ConnectorType
  status?: ConnectionStatus
  limit?: number
  cursor?: string
}

export interface PaginatedResult<T> {
  items: T[]
  nextCursor: string | null
  totalCount?: number
}

export interface CallInput {
  method: string
  params?: Record<string, unknown>
  options?: {
    idempotencyKey?: string
    timeout?: number
  }
}

export interface CallResult<T = unknown> {
  data: T
  providerRequestId?: string
  rateLimit?: {
    remaining: number
    resetAt: string
    limit?: number
  }
}

// ============================================================================
// Database Row Types
// ============================================================================

interface ConnectionRow {
  id: string
  project_id: string
  connector_type: string
  display_name: string
  external_account_id: string | null
  status: string
  scopes: string[]
  metadata: ConnectionMetadata
  encrypted_credentials: string | null
  credentials_iv: string | null
  connected_at: Date | null
  expires_at: Date | null
  created_at: Date
  updated_at: Date
}

interface OAuthStateRow {
  id: string
  project_id: string
  connector_type: string
  redirect_uri: string
  scopes: string[]
  code_verifier: string | null
  state_data: Record<string, unknown> | null
  expires_at: Date
  created_at: Date
}

// ============================================================================
// Connector Registry (P0 Set)
// ============================================================================

const CONNECTOR_REGISTRY: Record<ConnectorType, ConnectorDefinition> = {
  stripe: {
    id: 'stripe',
    displayName: 'Stripe',
    description: 'Accept payments and manage subscriptions',
    category: 'payments',
    authType: 'oauth2',
    scopes: [
      { id: 'read_write', name: 'Read & Write', description: 'Full access to your Stripe account', required: true },
    ],
    docsUrl: 'https://stripe.com/docs/connect',
  },
  figma: {
    id: 'figma',
    displayName: 'Figma',
    description: 'Import designs and assets from Figma',
    category: 'design',
    authType: 'oauth2',
    scopes: [
      { id: 'file_read', name: 'Read Files', description: 'Read access to Figma files', required: true },
    ],
    docsUrl: 'https://www.figma.com/developers/api',
  },
  slack: {
    id: 'slack',
    displayName: 'Slack',
    description: 'Send messages and manage channels',
    category: 'communication',
    authType: 'oauth2',
    scopes: [
      { id: 'chat:write', name: 'Send Messages', description: 'Send messages to channels', required: true },
      { id: 'channels:read', name: 'Read Channels', description: 'List channels', required: true },
    ],
    docsUrl: 'https://api.slack.com/',
  },
  github: {
    id: 'github',
    displayName: 'GitHub',
    description: 'Access repositories and manage code',
    category: 'development',
    authType: 'oauth2',
    scopes: [
      { id: 'repo', name: 'Repository Access', description: 'Full control of private repositories' },
      { id: 'read:user', name: 'Read User', description: 'Read user profile data', required: true },
    ],
    docsUrl: 'https://docs.github.com/en/rest',
  },
  'google-sheets': {
    id: 'google-sheets',
    displayName: 'Google Sheets',
    description: 'Read and write spreadsheet data',
    category: 'productivity',
    authType: 'oauth2',
    scopes: [
      { id: 'spreadsheets', name: 'Spreadsheets', description: 'Read and write Google Sheets', required: true },
    ],
    docsUrl: 'https://developers.google.com/sheets/api',
  },
  notion: {
    id: 'notion',
    displayName: 'Notion',
    description: 'Access pages, databases, and content',
    category: 'productivity',
    authType: 'oauth2',
    scopes: [
      { id: 'read_content', name: 'Read Content', description: 'Read pages and databases', required: true },
      { id: 'insert_content', name: 'Insert Content', description: 'Create pages and database items' },
    ],
    docsUrl: 'https://developers.notion.com/',
  },
}

// ============================================================================
// Encryption Helpers (imported from shared utility)
// ============================================================================
// encrypt() and decrypt() are imported from '../../utils/credentialEncryption'

// ============================================================================
// PKCE Helpers
// ============================================================================

function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url')
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url')
}

// ============================================================================
// OAuth URL Builders
// ============================================================================

interface OAuthConfig {
  clientId: string
  authorizationUrl: string
  tokenUrl: string
}

const OAUTH_CONFIGS: Record<ConnectorType, () => OAuthConfig | null> = {
  stripe: () => ({
    clientId: process.env.STRIPE_CLIENT_ID || '',
    authorizationUrl: 'https://connect.stripe.com/oauth/authorize',
    tokenUrl: 'https://connect.stripe.com/oauth/token',
  }),
  figma: () => ({
    clientId: process.env.FIGMA_CLIENT_ID || '',
    authorizationUrl: 'https://www.figma.com/oauth',
    tokenUrl: 'https://www.figma.com/api/oauth/token',
  }),
  slack: () => ({
    clientId: process.env.SLACK_CLIENT_ID || '',
    authorizationUrl: 'https://slack.com/oauth/v2/authorize',
    tokenUrl: 'https://slack.com/api/oauth.v2.access',
  }),
  github: () => ({
    clientId: process.env.GITHUB_CLIENT_ID || '',
    authorizationUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
  }),
  'google-sheets': () => ({
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
  }),
  notion: () => ({
    clientId: process.env.NOTION_CLIENT_ID || '',
    authorizationUrl: 'https://api.notion.com/v1/oauth/authorize',
    tokenUrl: 'https://api.notion.com/v1/oauth/token',
  }),
}

function getOAuthConfig(connector: ConnectorType): OAuthConfig {
  const configFn = OAUTH_CONFIGS[connector]
  const config = configFn?.()
  if (!config || !config.clientId) {
    throw new Error(`OAuth not configured for connector: ${connector}`)
  }
  return config
}

function buildAuthUrl(
  connector: ConnectorType,
  redirectUri: string,
  scopes: string[],
  state: string,
  codeChallenge?: string
): string {
  const config = getOAuthConfig(connector)
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    state,
    response_type: 'code',
  })

  // Connector-specific scope formatting
  if (scopes.length > 0) {
    params.set('scope', scopes.join(' '))
  }

  // Add PKCE if supported
  if (codeChallenge) {
    params.set('code_challenge', codeChallenge)
    params.set('code_challenge_method', 'S256')
  }

  return `${config.authorizationUrl}?${params.toString()}`
}

// ============================================================================
// Service Cache
// ============================================================================

interface CacheEntry {
  service: InhouseConnectorService
  createdAt: number
}

const serviceCache = new Map<string, CacheEntry>()
const SERVICE_TTL_MS = 60 * 60 * 1000 // 1 hour
const MAX_CACHE_SIZE = 100
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000

function cleanupServiceCache(): void {
  const now = Date.now()
  for (const [projectId, entry] of serviceCache) {
    if (now - entry.createdAt > SERVICE_TTL_MS) {
      serviceCache.delete(projectId)
    }
  }
  if (serviceCache.size > MAX_CACHE_SIZE) {
    const entries = Array.from(serviceCache.entries()).sort((a, b) => a[1].createdAt - b[1].createdAt)
    const toDelete = entries.slice(0, serviceCache.size - MAX_CACHE_SIZE)
    for (const [key] of toDelete) {
      serviceCache.delete(key)
    }
  }
}

const cleanupTimer = setInterval(cleanupServiceCache, CLEANUP_INTERVAL_MS)
cleanupTimer.unref?.()

// ============================================================================
// Service Class
// ============================================================================

export class InhouseConnectorService {
  private readonly projectId: string

  constructor(projectId: string) {
    this.projectId = projectId
  }

  // --------------------------------------------------------------------------
  // Registry Methods
  // --------------------------------------------------------------------------

  listAvailableConnectors(filter?: {
    category?: ConnectorCategory
    authType?: ConnectorAuthType
  }): ConnectorDefinition[] {
    let connectors = Object.values(CONNECTOR_REGISTRY)

    if (filter?.category) {
      connectors = connectors.filter(c => c.category === filter.category)
    }
    if (filter?.authType) {
      connectors = connectors.filter(c => c.authType === filter.authType)
    }

    return connectors
  }

  getConnectorDefinition(type: ConnectorType): ConnectorDefinition | null {
    return CONNECTOR_REGISTRY[type] || null
  }

  // --------------------------------------------------------------------------
  // OAuth Flow
  // --------------------------------------------------------------------------

  async createOAuthState(input: CreateOAuthStateInput): Promise<{
    authUrl: string
    state: string
    codeVerifier?: string
  }> {
    const pool = getPool()
    const definition = this.getConnectorDefinition(input.connector)

    if (!definition) {
      throw new Error(`Unknown connector: ${input.connector}`)
    }

    if (definition.authType !== 'oauth2') {
      throw new Error(`Connector ${input.connector} does not support OAuth`)
    }

    // Generate state and PKCE
    const state = crypto.randomUUID()
    const codeVerifier = generateCodeVerifier()
    const codeChallenge = generateCodeChallenge(codeVerifier)

    // Determine scopes - use provided or default required scopes
    const scopes = input.scopes?.length
      ? input.scopes
      : (definition.scopes?.filter(s => s.required).map(s => s.id) ?? [])

    // Store state (expires in 10 minutes)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

    await pool.query<OAuthStateRow>(
      `INSERT INTO inhouse_oauth_states
       (id, project_id, connector_type, redirect_uri, scopes, code_verifier, state_data, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        state,
        this.projectId,
        input.connector,
        input.redirectUri,
        scopes,
        codeVerifier,
        input.stateData ? JSON.stringify(input.stateData) : null,
        expiresAt,
      ]
    )

    // Build authorization URL
    const authUrl = buildAuthUrl(
      input.connector,
      input.redirectUri,
      scopes,
      state,
      codeChallenge
    )

    return { authUrl, state, codeVerifier }
  }

  async exchangeOAuthCode(input: ExchangeOAuthInput): Promise<Connection> {
    const pool = getPool()

    // Get and validate state
    const stateResult = await pool.query<OAuthStateRow>(
      `SELECT * FROM inhouse_oauth_states
       WHERE id = $1 AND project_id = $2 AND expires_at > NOW()`,
      [input.state, this.projectId]
    )

    const stateRow = stateResult.rows[0]
    if (!stateRow) {
      throw new Error('Invalid or expired OAuth state')
    }

    const connector = stateRow.connector_type as ConnectorType
    const config = getOAuthConfig(connector)

    // Exchange code for tokens
    const tokenResponse = await this.exchangeCodeForTokens(
      connector,
      input.code,
      stateRow.redirect_uri,
      stateRow.code_verifier ?? undefined
    )

    // Delete used state
    await pool.query(
      `DELETE FROM inhouse_oauth_states WHERE id = $1`,
      [input.state]
    )

    // Get account info (connector-specific)
    const accountInfo = await this.getAccountInfo(connector, tokenResponse.accessToken)

    // Encrypt credentials
    const credentials = JSON.stringify({
      accessToken: tokenResponse.accessToken,
      refreshToken: tokenResponse.refreshToken,
      tokenType: tokenResponse.tokenType,
    })
    const { encrypted, iv } = encrypt(credentials)

    // Calculate expiry
    const expiresAt = tokenResponse.expiresIn
      ? new Date(Date.now() + tokenResponse.expiresIn * 1000)
      : null

    // Create connection
    const connectionId = crypto.randomUUID()
    const result = await pool.query<ConnectionRow>(
      `INSERT INTO inhouse_connections
       (id, project_id, connector_type, display_name, external_account_id, status, scopes, metadata, encrypted_credentials, credentials_iv, connected_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), $11)
       RETURNING *`,
      [
        connectionId,
        this.projectId,
        connector,
        input.displayName || accountInfo.accountName || `${CONNECTOR_REGISTRY[connector]?.displayName ?? connector} Connection`,
        accountInfo.externalId ?? null,
        'connected',
        stateRow.scopes,
        JSON.stringify(accountInfo.metadata ?? {}),
        encrypted,
        iv,
        expiresAt,
      ]
    )

    const row = result.rows[0]
    if (!row) {
      throw new Error('Failed to create connection')
    }

    return this.rowToConnection(row)
  }

  private async exchangeCodeForTokens(
    connector: ConnectorType,
    code: string,
    redirectUri: string,
    codeVerifier?: string
  ): Promise<{
    accessToken: string
    refreshToken?: string
    expiresIn?: number
    tokenType?: string
  }> {
    const config = getOAuthConfig(connector)
    const clientSecret = this.getClientSecret(connector)

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    })

    if (codeVerifier) {
      body.set('code_verifier', codeVerifier)
    }

    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Token exchange failed: ${error}`)
    }

    const data = await response.json() as Record<string, unknown>

    return {
      accessToken: data.access_token as string,
      refreshToken: data.refresh_token as string | undefined,
      expiresIn: data.expires_in as number | undefined,
      tokenType: data.token_type as string | undefined,
    }
  }

  private getClientSecret(connector: ConnectorType): string {
    const envMap: Record<ConnectorType, string> = {
      stripe: 'STRIPE_CLIENT_SECRET',
      figma: 'FIGMA_CLIENT_SECRET',
      slack: 'SLACK_CLIENT_SECRET',
      github: 'GITHUB_CLIENT_SECRET',
      'google-sheets': 'GOOGLE_CLIENT_SECRET',
      notion: 'NOTION_CLIENT_SECRET',
    }

    const secret = process.env[envMap[connector]]
    if (!secret) {
      throw new Error(`Client secret not configured for connector: ${connector}`)
    }
    return secret
  }

  private async getAccountInfo(
    connector: ConnectorType,
    accessToken: string
  ): Promise<{
    accountName?: string
    externalId?: string
    metadata?: Record<string, unknown>
  }> {
    // Connector-specific account info fetching
    switch (connector) {
      case 'github': {
        const resp = await fetch('https://api.github.com/user', {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (resp.ok) {
          const user = await resp.json() as Record<string, unknown>
          return {
            accountName: user.login as string,
            externalId: String(user.id),
            metadata: { name: user.name, avatarUrl: user.avatar_url },
          }
        }
        break
      }
      case 'slack': {
        const resp = await fetch('https://slack.com/api/auth.test', {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (resp.ok) {
          const data = await resp.json() as Record<string, unknown>
          return {
            accountName: data.team as string,
            externalId: data.team_id as string,
            metadata: { userId: data.user_id, userName: data.user },
          }
        }
        break
      }
      case 'figma': {
        const resp = await fetch('https://api.figma.com/v1/me', {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (resp.ok) {
          const user = await resp.json() as Record<string, unknown>
          return {
            accountName: user.email as string,
            externalId: user.id as string,
            metadata: { handle: user.handle, imgUrl: user.img_url },
          }
        }
        break
      }
      case 'notion': {
        const resp = await fetch('https://api.notion.com/v1/users/me', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Notion-Version': '2022-06-28',
          },
        })
        if (resp.ok) {
          const bot = await resp.json() as Record<string, unknown>
          const botInfo = bot.bot as Record<string, unknown> | undefined
          const owner = botInfo?.owner as Record<string, unknown> | undefined
          return {
            accountName: bot.name as string,
            externalId: bot.id as string,
            metadata: { type: bot.type, owner: owner?.type },
          }
        }
        break
      }
      // Add more connectors as needed
    }

    return {}
  }

  // --------------------------------------------------------------------------
  // Connection CRUD
  // --------------------------------------------------------------------------

  async listConnections(options?: ListConnectionsOptions): Promise<PaginatedResult<ConnectionSummary>> {
    const pool = getPool()
    const limit = Math.min(Math.max(options?.limit ?? 50, 1), 100)

    let whereClause = 'WHERE project_id = $1'
    const params: unknown[] = [this.projectId]

    if (options?.type) {
      params.push(options.type)
      whereClause += ` AND connector_type = $${params.length}`
    }
    if (options?.status) {
      params.push(options.status)
      whereClause += ` AND status = $${params.length}`
    }
    if (options?.cursor) {
      params.push(options.cursor)
      whereClause += ` AND id < $${params.length}`
    }

    const result = await pool.query<ConnectionRow>(
      `SELECT * FROM inhouse_connections ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${params.length + 1}`,
      [...params, limit + 1]
    )

    const hasMore = result.rows.length > limit
    const items = result.rows.slice(0, limit)

    return {
      items: items.map(row => ({
        id: row.id,
        type: row.connector_type as ConnectorType,
        displayName: row.display_name,
        status: row.status as ConnectionStatus,
        accountName: row.metadata?.accountName,
        connectedAt: row.connected_at?.toISOString(),
      })),
      nextCursor: hasMore && items.length > 0 ? items[items.length - 1]?.id ?? null : null,
    }
  }

  async getConnection(connectionId: string): Promise<Connection | null> {
    const pool = getPool()

    const result = await pool.query<ConnectionRow>(
      `SELECT * FROM inhouse_connections WHERE project_id = $1 AND id = $2`,
      [this.projectId, connectionId]
    )

    const row = result.rows[0]
    if (!row) {
      return null
    }

    return this.rowToConnection(row)
  }

  async createApiKeyConnection(input: CreateApiKeyConnectionInput): Promise<Connection> {
    const pool = getPool()
    const definition = this.getConnectorDefinition(input.connector)

    if (!definition) {
      throw new Error(`Unknown connector: ${input.connector}`)
    }

    // Note: API key connectors can also use this method
    // Some connectors support both OAuth and API key auth

    // Encrypt the API key
    const credentials = JSON.stringify({ apiKey: input.apiKey })
    const { encrypted, iv } = encrypt(credentials)

    const connectionId = crypto.randomUUID()
    const result = await pool.query<ConnectionRow>(
      `INSERT INTO inhouse_connections
       (id, project_id, connector_type, display_name, status, scopes, metadata, encrypted_credentials, credentials_iv, connected_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       RETURNING *`,
      [
        connectionId,
        this.projectId,
        input.connector,
        input.displayName || `${definition.displayName} Connection`,
        'connected',
        [],
        JSON.stringify(input.metadata ?? {}),
        encrypted,
        iv,
      ]
    )

    const row = result.rows[0]
    if (!row) {
      throw new Error('Failed to create connection')
    }

    return this.rowToConnection(row)
  }

  async updateConnection(connectionId: string, input: UpdateConnectionInput): Promise<Connection | null> {
    const pool = getPool()

    const updates: string[] = []
    const values: unknown[] = []
    let paramIndex = 3

    if (input.displayName !== undefined) {
      updates.push(`display_name = $${paramIndex++}`)
      values.push(input.displayName)
    }
    if (input.metadata !== undefined) {
      updates.push(`metadata = metadata || $${paramIndex++}`)
      values.push(JSON.stringify(input.metadata))
    }

    if (updates.length === 0) {
      return this.getConnection(connectionId)
    }

    const result = await pool.query<ConnectionRow>(
      `UPDATE inhouse_connections
       SET ${updates.join(', ')}, updated_at = NOW()
       WHERE project_id = $1 AND id = $2
       RETURNING *`,
      [this.projectId, connectionId, ...values]
    )

    const row = result.rows[0]
    if (!row) {
      return null
    }

    return this.rowToConnection(row)
  }

  async deleteConnection(connectionId: string): Promise<boolean> {
    const pool = getPool()

    // Optionally revoke tokens first (connector-specific)
    const connection = await this.getConnection(connectionId)
    if (connection) {
      await this.revokeTokens(connection).catch(() => {
        // Ignore revocation failures - still delete the connection
      })
    }

    const result = await pool.query(
      `DELETE FROM inhouse_connections WHERE project_id = $1 AND id = $2`,
      [this.projectId, connectionId]
    )

    return (result.rowCount ?? 0) > 0
  }

  async testConnection(connectionId: string): Promise<{ healthy: boolean; message?: string }> {
    const connection = await this.getConnection(connectionId)
    if (!connection) {
      return { healthy: false, message: 'Connection not found' }
    }

    try {
      const credentials = await this.getDecryptedCredentials(connectionId)
      if (!credentials) {
        return { healthy: false, message: 'No credentials found' }
      }

      // Test based on connector type
      const token = credentials.accessToken || credentials.apiKey
      if (!token) {
        return { healthy: false, message: 'No token available' }
      }

      // Connector-specific health check
      const healthy = await this.performHealthCheck(connection.type, token)
      return { healthy, message: healthy ? 'Connection is healthy' : 'Health check failed' }
    } catch (error) {
      return { healthy: false, message: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  private async performHealthCheck(connector: ConnectorType, token: string): Promise<boolean> {
    const endpoints: Record<ConnectorType, string> = {
      stripe: 'https://api.stripe.com/v1/account',
      figma: 'https://api.figma.com/v1/me',
      slack: 'https://slack.com/api/auth.test',
      github: 'https://api.github.com/user',
      'google-sheets': 'https://www.googleapis.com/oauth2/v1/tokeninfo',
      notion: 'https://api.notion.com/v1/users/me',
    }

    const endpoint = endpoints[connector]
    if (!endpoint) return false

    const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
    if (connector === 'notion') {
      headers['Notion-Version'] = '2022-06-28'
    }

    const response = await fetch(endpoint, { headers })
    return response.ok
  }

  async refreshConnection(connectionId: string): Promise<Connection | null> {
    const pool = getPool()
    const connection = await this.getConnection(connectionId)

    if (!connection) {
      return null
    }

    const credentials = await this.getDecryptedCredentials(connectionId)
    if (!credentials?.refreshToken) {
      throw new Error('No refresh token available')
    }

    const config = getOAuthConfig(connection.type)
    const clientSecret = this.getClientSecret(connection.type)

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: config.clientId,
      client_secret: clientSecret,
      refresh_token: credentials.refreshToken,
    })

    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
    })

    if (!response.ok) {
      // Mark connection as expired
      await pool.query(
        `UPDATE inhouse_connections SET status = 'expired', updated_at = NOW() WHERE id = $1`,
        [connectionId]
      )
      throw new Error('Token refresh failed')
    }

    const data = await response.json() as Record<string, unknown>

    // Update credentials
    const newCredentials = JSON.stringify({
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? credentials.refreshToken,
      tokenType: data.token_type,
    })
    const { encrypted, iv } = encrypt(newCredentials)

    const expiresAt = data.expires_in
      ? new Date(Date.now() + (data.expires_in as number) * 1000)
      : null

    const result = await pool.query<ConnectionRow>(
      `UPDATE inhouse_connections
       SET encrypted_credentials = $3, credentials_iv = $4, expires_at = $5, status = 'connected', updated_at = NOW()
       WHERE project_id = $1 AND id = $2
       RETURNING *`,
      [this.projectId, connectionId, encrypted, iv, expiresAt]
    )

    const row = result.rows[0]
    if (!row) {
      return null
    }

    return this.rowToConnection(row)
  }

  private async revokeTokens(connection: Connection): Promise<void> {
    // Connector-specific token revocation
    // Most OAuth providers have revocation endpoints
    // Implementation varies by connector
  }

  // --------------------------------------------------------------------------
  // API Calls
  // --------------------------------------------------------------------------

  async call<T = unknown>(connectionId: string, input: CallInput): Promise<CallResult<T>> {
    const connection = await this.getConnection(connectionId)
    if (!connection) {
      throw new Error('Connection not found')
    }

    if (connection.status !== 'connected') {
      throw new Error(`Connection is not active: ${connection.status}`)
    }

    const credentials = await this.getDecryptedCredentials(connectionId)
    if (!credentials) {
      throw new Error('No credentials found for connection')
    }

    const token = credentials.accessToken || credentials.apiKey
    if (!token) {
      throw new Error('No token available')
    }

    // Route to connector-specific handler
    return this.executeConnectorCall<T>(connection.type, token, input)
  }

  private async executeConnectorCall<T>(
    connector: ConnectorType,
    token: string,
    input: CallInput
  ): Promise<CallResult<T>> {
    // This would be implemented per-connector
    // For now, return a stub that indicates the method isn't implemented
    throw new Error(`Connector call not implemented for: ${connector}.${input.method}`)
  }

  private async getDecryptedCredentials(connectionId: string): Promise<{
    accessToken?: string
    refreshToken?: string
    apiKey?: string
    tokenType?: string
  } | null> {
    const pool = getPool()

    const result = await pool.query<{ encrypted_credentials: string | null; credentials_iv: string | null }>(
      `SELECT encrypted_credentials, credentials_iv FROM inhouse_connections
       WHERE project_id = $1 AND id = $2`,
      [this.projectId, connectionId]
    )

    const row = result.rows[0]
    if (!row?.encrypted_credentials || !row.credentials_iv) {
      return null
    }

    const decrypted = decrypt(row.encrypted_credentials, row.credentials_iv)
    return JSON.parse(decrypted)
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private rowToConnection(row: ConnectionRow): Connection {
    return {
      id: row.id,
      projectId: row.project_id,
      type: row.connector_type as ConnectorType,
      displayName: row.display_name,
      externalAccountId: row.external_account_id ?? undefined,
      status: row.status as ConnectionStatus,
      scopes: row.scopes ?? [],
      metadata: row.metadata ?? {},
      connectedAt: row.connected_at?.toISOString(),
      expiresAt: row.expires_at?.toISOString(),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function getInhouseConnectorService(projectId: string): InhouseConnectorService {
  const cached = serviceCache.get(projectId)
  const now = Date.now()

  if (cached && now - cached.createdAt < SERVICE_TTL_MS) {
    return cached.service
  }

  const service = new InhouseConnectorService(projectId)
  serviceCache.set(projectId, { service, createdAt: now })
  return service
}
