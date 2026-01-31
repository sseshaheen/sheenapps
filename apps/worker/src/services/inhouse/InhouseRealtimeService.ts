/**
 * In-House Realtime Service
 *
 * Realtime operations for Easy Mode projects.
 * Manages channels, presence, and message routing via Ably.
 *
 * Part of EASY_MODE_SDK_PLAN.md - Phase 3C
 */

import { randomUUID } from 'crypto'
import { getPool } from '../databaseWrapper'
import { getInhouseMeteringService } from './InhouseMeteringService'
import { getInhouseSecretsService } from './InhouseSecretsService'

// =============================================================================
// CONSTANTS
// =============================================================================

const ABLY_REST_URL = 'https://rest.ably.io'
const DEFAULT_TIMEOUT = 10000

// =============================================================================
// TYPES
// =============================================================================

export interface ChannelInfo {
  name: string
  isPresence: boolean
  isPrivate: boolean
  createdAt: string
  activeConnections: number
}

export interface PublishOptions {
  channel: string
  event: string
  data: unknown
  userId?: string
}

export interface PresenceMember {
  clientId: string
  connectionId: string
  data: unknown
  enteredAt: string
}

export interface ChannelHistory {
  messages: Array<{
    id: string
    event: string
    data: unknown
    timestamp: string
    clientId?: string
  }>
  hasMore: boolean
}

export interface AuthTokenResult {
  token: string
  expiresAt: string
  capabilities: Record<string, string[]>
}

export interface RealtimeResult<T> {
  ok: boolean
  data?: T
  error?: {
    code: string
    message: string
    retryable?: boolean
  }
}

export interface RealtimeStats {
  period: {
    start: string
    end: string
  }
  totals: {
    messages: number
    connections: number
    presenceUpdates: number
    channels: number
  }
  byChannel: Record<string, {
    messages: number
    presenceUpdates: number
    peakConnections: number
  }>
}

// =============================================================================
// SERVICE
// =============================================================================

export class InhouseRealtimeService {
  private projectId: string
  private ablyKey: string | null = null
  private keyLoaded = false

  constructor(projectId: string) {
    this.projectId = projectId
  }

  /**
   * Load Ably API key from environment or project secrets.
   */
  private async loadAblyKey(): Promise<string | null> {
    if (this.keyLoaded) {
      return this.ablyKey
    }

    // First check environment variable (platform-wide key)
    const envKey = process.env.ABLY_API_KEY
    if (envKey) {
      this.ablyKey = envKey
      this.keyLoaded = true
      return this.ablyKey
    }

    // Fall back to project-level secret
    try {
      const secretsService = getInhouseSecretsService(this.projectId)
      this.ablyKey = await secretsService.decryptSecret('ABLY_API_KEY')
      this.keyLoaded = true
      return this.ablyKey
    } catch {
      this.keyLoaded = true
      return null
    }
  }

  /**
   * Make a request to the Ably REST API.
   */
  private async ablyRequest<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: unknown
  ): Promise<RealtimeResult<T>> {
    const ablyKey = await this.loadAblyKey()
    if (!ablyKey) {
      return {
        ok: false,
        error: {
          code: 'ABLY_KEY_MISSING',
          message: 'Ably API key not configured. Set ABLY_API_KEY in environment or project secrets.',
          retryable: false,
        },
      }
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT)

    try {
      const response = await fetch(`${ABLY_REST_URL}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${Buffer.from(ablyKey).toString('base64')}`,
        },
        body: body ? JSON.stringify(body) : undefined,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as { error?: { message?: string } }
        return {
          ok: false,
          error: {
            code: response.status === 401 ? 'UNAUTHORIZED' : 'ABLY_ERROR',
            message: errorData.error?.message || `Ably API error: ${response.status}`,
            retryable: response.status >= 500 || response.status === 429,
          },
        }
      }

      // Handle 204 No Content
      if (response.status === 204) {
        return { ok: true }
      }

      const data = await response.json() as T
      return { ok: true, data }
    } catch (err) {
      clearTimeout(timeoutId)
      const isTimeout = err instanceof Error && err.name === 'AbortError'
      return {
        ok: false,
        error: {
          code: isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
          message: err instanceof Error ? err.message : 'Unknown error',
          retryable: true,
        },
      }
    }
  }

  /**
   * Get the namespace prefix for this project's channels.
   */
  private getChannelPrefix(): string {
    return `project:${this.projectId}:`
  }

  /**
   * Get the full channel name with project prefix.
   */
  private getFullChannelName(channel: string): string {
    return `${this.getChannelPrefix()}${channel}`
  }

  // ===========================================================================
  // AUTHENTICATION
  // ===========================================================================

  /**
   * Generate an authentication token for a client.
   * This is used by clients to authenticate their WebSocket connections.
   */
  async createToken(options: {
    clientId?: string
    channels?: string[]
    capabilities?: Record<string, string[]>
    ttlSeconds?: number
  }): Promise<RealtimeResult<AuthTokenResult>> {
    const clientId = options.clientId || randomUUID()
    const ttl = (options.ttlSeconds || 3600) * 1000 // Convert to milliseconds
    const prefix = this.getChannelPrefix()

    // Build capabilities
    const capabilities: Record<string, string[]> = {}

    if (options.channels && options.channels.length > 0) {
      // Specific channels requested
      for (const channel of options.channels) {
        const fullName = this.getFullChannelName(channel)
        capabilities[fullName] = options.capabilities?.[channel] || ['subscribe', 'publish', 'presence']
      }
    } else {
      // Default: access to all project channels
      capabilities[`${prefix}*`] = ['subscribe', 'publish', 'presence']
    }

    const result = await this.ablyRequest<{ token: string; expires: number }>(
      'POST',
      '/keys/:key/requestToken',
      {
        clientId,
        capability: capabilities,
        ttl,
      }
    )

    if (!result.ok) {
      return { ok: false, error: result.error }
    }

    return {
      ok: true,
      data: {
        token: result.data!.token,
        expiresAt: new Date(result.data!.expires).toISOString(),
        capabilities,
      },
    }
  }

  // ===========================================================================
  // CHANNELS
  // ===========================================================================

  /**
   * Publish a message to a channel.
   */
  async publish(options: PublishOptions): Promise<RealtimeResult<{ id: string }>> {
    const fullChannel = this.getFullChannelName(options.channel)
    const messageId = randomUUID()

    const result = await this.ablyRequest<void>(
      'POST',
      `/channels/${encodeURIComponent(fullChannel)}/messages`,
      {
        name: options.event,
        data: options.data,
        id: messageId,
        clientId: options.userId,
      }
    )

    if (!result.ok) {
      return { ok: false, error: result.error }
    }

    // Log activity (fire-and-forget)
    this.logUsage({
      operation: 'publish',
      channel: options.channel,
      success: true,
    })

    return {
      ok: true,
      data: { id: messageId },
    }
  }

  /**
   * Get channel history (recent messages).
   */
  async getHistory(channel: string, options?: {
    limit?: number
    start?: string
    end?: string
    direction?: 'forwards' | 'backwards'
  }): Promise<RealtimeResult<ChannelHistory>> {
    const fullChannel = this.getFullChannelName(channel)
    const params = new URLSearchParams()

    if (options?.limit) params.set('limit', String(options.limit))
    if (options?.start) params.set('start', options.start)
    if (options?.end) params.set('end', options.end)
    if (options?.direction) params.set('direction', options.direction)

    const query = params.toString()
    const result = await this.ablyRequest<Array<{
      id: string
      name: string
      data: unknown
      timestamp: number
      clientId?: string
    }>>(
      'GET',
      `/channels/${encodeURIComponent(fullChannel)}/messages${query ? `?${query}` : ''}`
    )

    if (!result.ok) {
      return { ok: false, error: result.error }
    }

    return {
      ok: true,
      data: {
        messages: (result.data || []).map(msg => ({
          id: msg.id,
          event: msg.name,
          data: msg.data,
          timestamp: new Date(msg.timestamp).toISOString(),
          clientId: msg.clientId,
        })),
        hasMore: (result.data || []).length >= (options?.limit || 100),
      },
    }
  }

  /**
   * Get channel info (active status, connection count).
   */
  async getChannelInfo(channel: string): Promise<RealtimeResult<ChannelInfo>> {
    const fullChannel = this.getFullChannelName(channel)

    const result = await this.ablyRequest<{
      channelId: string
      status: { isActive: boolean; occupancy?: { metrics?: { connections?: number } } }
    }>(
      'GET',
      `/channels/${encodeURIComponent(fullChannel)}`
    )

    if (!result.ok) {
      // If channel doesn't exist, return empty info
      if (result.error?.code === 'ABLY_ERROR') {
        return {
          ok: true,
          data: {
            name: channel,
            isPresence: channel.startsWith('presence:'),
            isPrivate: channel.startsWith('private:'),
            createdAt: new Date().toISOString(),
            activeConnections: 0,
          },
        }
      }
      return { ok: false, error: result.error }
    }

    return {
      ok: true,
      data: {
        name: channel,
        isPresence: channel.startsWith('presence:'),
        isPrivate: channel.startsWith('private:'),
        createdAt: new Date().toISOString(),
        activeConnections: result.data?.status?.occupancy?.metrics?.connections || 0,
      },
    }
  }

  /**
   * List active channels for this project.
   */
  async listChannels(options?: {
    prefix?: string
    limit?: number
  }): Promise<RealtimeResult<ChannelInfo[]>> {
    const projectPrefix = this.getChannelPrefix()
    const searchPrefix = options?.prefix
      ? `${projectPrefix}${options.prefix}`
      : projectPrefix

    const params = new URLSearchParams()
    params.set('prefix', searchPrefix)
    if (options?.limit) params.set('limit', String(options.limit))

    const result = await this.ablyRequest<Array<{ channelId: string }>>(
      'GET',
      `/channels?${params.toString()}`
    )

    if (!result.ok) {
      return { ok: false, error: result.error }
    }

    const channels = (result.data || []).map(ch => {
      const name = ch.channelId.replace(projectPrefix, '')
      return {
        name,
        isPresence: name.startsWith('presence:'),
        isPrivate: name.startsWith('private:'),
        createdAt: new Date().toISOString(),
        activeConnections: 0,
      }
    })

    return { ok: true, data: channels }
  }

  // ===========================================================================
  // PRESENCE
  // ===========================================================================

  /**
   * Get presence members for a channel.
   */
  async getPresence(channel: string): Promise<RealtimeResult<PresenceMember[]>> {
    const fullChannel = this.getFullChannelName(channel)

    const result = await this.ablyRequest<Array<{
      clientId: string
      connectionId: string
      data: unknown
      timestamp: number
    }>>(
      'GET',
      `/channels/${encodeURIComponent(fullChannel)}/presence`
    )

    if (!result.ok) {
      return { ok: false, error: result.error }
    }

    return {
      ok: true,
      data: (result.data || []).map(member => ({
        clientId: member.clientId,
        connectionId: member.connectionId,
        data: member.data,
        enteredAt: new Date(member.timestamp).toISOString(),
      })),
    }
  }

  /**
   * Get presence history for a channel.
   */
  async getPresenceHistory(channel: string, options?: {
    limit?: number
    start?: string
    end?: string
  }): Promise<RealtimeResult<Array<{
    action: 'enter' | 'leave' | 'update'
    clientId: string
    data: unknown
    timestamp: string
  }>>> {
    const fullChannel = this.getFullChannelName(channel)
    const params = new URLSearchParams()

    if (options?.limit) params.set('limit', String(options.limit))
    if (options?.start) params.set('start', options.start)
    if (options?.end) params.set('end', options.end)

    const query = params.toString()
    const result = await this.ablyRequest<Array<{
      action: number
      clientId: string
      data: unknown
      timestamp: number
    }>>(
      'GET',
      `/channels/${encodeURIComponent(fullChannel)}/presence/history${query ? `?${query}` : ''}`
    )

    if (!result.ok) {
      return { ok: false, error: result.error }
    }

    const actionMap: Record<number, 'enter' | 'leave' | 'update'> = {
      2: 'enter',
      3: 'leave',
      4: 'update',
    }

    return {
      ok: true,
      data: (result.data || []).map(event => ({
        action: actionMap[event.action] || 'enter',
        clientId: event.clientId,
        data: event.data,
        timestamp: new Date(event.timestamp).toISOString(),
      })),
    }
  }

  // ===========================================================================
  // USAGE STATISTICS
  // ===========================================================================

  /**
   * Get usage statistics for this project's realtime channels.
   */
  async getStats(options?: {
    startDate?: string
    endDate?: string
  }): Promise<RealtimeResult<RealtimeStats>> {
    const now = new Date()
    const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]!
    const defaultEnd = now.toISOString().split('T')[0]!
    const startDate: string = options?.startDate || defaultStart
    const endDate: string = options?.endDate || defaultEnd

    try {
      // Get stats from our usage tracking table
      const result = await getPool().query(
        `SELECT
           COUNT(*) FILTER (WHERE operation = 'publish') as messages,
           COUNT(*) FILTER (WHERE operation = 'connect') as connections,
           COUNT(*) FILTER (WHERE operation = 'presence') as presence_updates,
           COUNT(DISTINCT channel) as channels
         FROM inhouse_realtime_usage
         WHERE project_id = $1
           AND created_at >= $2::date
           AND created_at < ($3::date + interval '1 day')`,
        [this.projectId, startDate, endDate]
      )

      const totals = result.rows[0]

      // Get by channel
      const channelResult = await getPool().query(
        `SELECT
           channel,
           COUNT(*) FILTER (WHERE operation = 'publish') as messages,
           COUNT(*) FILTER (WHERE operation = 'presence') as presence_updates,
           MAX(CASE WHEN operation = 'connect' THEN 1 ELSE 0 END) as peak_connections
         FROM inhouse_realtime_usage
         WHERE project_id = $1
           AND created_at >= $2::date
           AND created_at < ($3::date + interval '1 day')
         GROUP BY channel`,
        [this.projectId, startDate, endDate]
      )

      const byChannel: Record<string, {
        messages: number
        presenceUpdates: number
        peakConnections: number
      }> = {}

      for (const row of channelResult.rows) {
        byChannel[row.channel] = {
          messages: parseInt(row.messages || '0', 10),
          presenceUpdates: parseInt(row.presence_updates || '0', 10),
          peakConnections: parseInt(row.peak_connections || '0', 10),
        }
      }

      return {
        ok: true,
        data: {
          period: { start: startDate, end: endDate },
          totals: {
            messages: parseInt(totals?.messages || '0', 10),
            connections: parseInt(totals?.connections || '0', 10),
            presenceUpdates: parseInt(totals?.presence_updates || '0', 10),
            channels: parseInt(totals?.channels || '0', 10),
          },
          byChannel,
        },
      }
    } catch (err) {
      return {
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Failed to get stats',
          retryable: true,
        },
      }
    }
  }

  // ===========================================================================
  // USAGE LOGGING
  // ===========================================================================

  private async logUsage(params: {
    operation: 'publish' | 'connect' | 'presence'
    channel?: string
    success: boolean
    errorCode?: string
  }): Promise<void> {
    try {
      await getPool().query(
        `INSERT INTO inhouse_realtime_usage
         (id, project_id, operation, channel, success, error_code, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [
          randomUUID(),
          this.projectId,
          params.operation,
          params.channel || null,
          params.success,
          params.errorCode || null,
        ]
      )
    } catch (err) {
      console.error('[InhouseRealtimeService] Failed to log usage:', err)
      // Don't fail the request if logging fails
    }
  }
}

// =============================================================================
// SINGLETON FACTORY
// =============================================================================

const SERVICE_TTL_MS = 60 * 60 * 1000 // 1 hour
const MAX_CACHE_SIZE = 100
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

interface CacheEntry {
  service: InhouseRealtimeService
  createdAt: number
}

const serviceCache = new Map<string, CacheEntry>()

function cleanupServiceCache(): void {
  const now = Date.now()

  // Remove entries older than TTL
  for (const [key, entry] of serviceCache) {
    if (now - entry.createdAt > SERVICE_TTL_MS) {
      serviceCache.delete(key)
    }
  }

  // Enforce max size by removing oldest entries
  if (serviceCache.size > MAX_CACHE_SIZE) {
    const entries = [...serviceCache.entries()]
      .sort((a, b) => a[1].createdAt - b[1].createdAt)
    const toDelete = entries.slice(0, entries.length - MAX_CACHE_SIZE)
    for (const [key] of toDelete) {
      serviceCache.delete(key)
    }
  }
}

export function getInhouseRealtimeService(projectId: string): InhouseRealtimeService {
  const cached = serviceCache.get(projectId)
  const now = Date.now()

  // Return cached if exists and not expired
  if (cached && now - cached.createdAt < SERVICE_TTL_MS) {
    return cached.service
  }

  // Create new service instance
  const service = new InhouseRealtimeService(projectId)
  serviceCache.set(projectId, { service, createdAt: now })
  return service
}

// Run cleanup periodically
setInterval(cleanupServiceCache, CLEANUP_INTERVAL_MS)
