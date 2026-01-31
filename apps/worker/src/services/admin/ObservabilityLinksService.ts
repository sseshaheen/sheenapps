/**
 * Observability Links Service
 *
 * Generates deep links to external observability tools (PostHog, Grafana, logs)
 * with pre-filled context (project ID, correlation ID, time range).
 *
 * Configuration:
 * - Base URLs from environment variables (secrets-adjacent)
 * - Enabled/disabled, filter params from database (admin-editable)
 *
 * Security:
 * - No secrets/tokens in generated URLs (all use SSO)
 * - No internal IDs that shouldn't be shared
 * - PII caution for filter parameters
 */

import { getDatabase } from '../database'

// =============================================================================
// TYPES
// =============================================================================

export interface ObservabilityLink {
  url: string
  label: string
  tool: 'posthog' | 'grafana' | 'logs'
}

export interface ObservabilityLinks {
  posthog?: ObservabilityLink
  grafana?: ObservabilityLink[]
  logs?: ObservabilityLink
}

interface ObservabilityConfig {
  tool: string
  enabled: boolean
  dashboard_slug: string | null
  project_filter_param: string | null
  time_filter_param: string | null
  config: Record<string, unknown>
}

interface LinkContext {
  projectId?: string
  correlationId?: string
  service?: string
  timeRange?: string // ISO format or relative like '24h'
}

// =============================================================================
// CONSTANTS
// =============================================================================

// Base URLs from environment variables
const POSTHOG_HOST = process.env.POSTHOG_HOST || 'https://app.posthog.com'
const GRAFANA_HOST = process.env.GRAFANA_HOST || ''
const LOG_VIEWER_HOST = process.env.LOG_VIEWER_HOST || ''

// Grafana dashboard slugs (configurable in DB)
const DEFAULT_GRAFANA_DASHBOARDS = [
  { slug: 'inhouse-overview', label: 'Overview' },
  { slug: 'inhouse-jobs', label: 'Jobs' },
  { slug: 'inhouse-storage', label: 'Storage' },
  { slug: 'inhouse-email', label: 'Email' },
]

// =============================================================================
// SERVICE
// =============================================================================

export class ObservabilityLinksService {
  private configCache: Map<string, ObservabilityConfig> | null = null
  private configCacheTime: number = 0
  private readonly CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

  /**
   * Get configuration from database (with caching)
   */
  private async getConfig(): Promise<Map<string, ObservabilityConfig>> {
    const now = Date.now()
    if (this.configCache && now - this.configCacheTime < this.CACHE_TTL_MS) {
      return this.configCache
    }

    const pool = getDatabase()
    const result = await pool.query<ObservabilityConfig>(`
      SELECT tool, enabled, dashboard_slug, project_filter_param, time_filter_param, config
      FROM inhouse_observability_config
    `)

    this.configCache = new Map(result.rows.map((r: ObservabilityConfig) => [r.tool, r]))
    this.configCacheTime = now
    return this.configCache
  }

  /**
   * Generate PostHog link filtered by project
   */
  async getPostHogLink(context: LinkContext): Promise<ObservabilityLink | null> {
    if (!POSTHOG_HOST) return null

    const config = await this.getConfig()
    const posthogConfig = config.get('posthog')
    if (!posthogConfig?.enabled) return null

    const params = new URLSearchParams()

    // Add project filter if available
    if (context.projectId && posthogConfig.project_filter_param) {
      params.set(posthogConfig.project_filter_param, context.projectId)
    }

    // Add time range if available
    if (context.timeRange && posthogConfig.time_filter_param) {
      params.set(posthogConfig.time_filter_param, context.timeRange)
    }

    const queryString = params.toString()
    const url = `${POSTHOG_HOST}/events${queryString ? `?${queryString}` : ''}`

    return {
      url,
      label: 'PostHog Events',
      tool: 'posthog',
    }
  }

  /**
   * Generate Grafana dashboard links
   */
  async getGrafanaLinks(context: LinkContext): Promise<ObservabilityLink[]> {
    if (!GRAFANA_HOST) return []

    const config = await this.getConfig()
    const grafanaConfig = config.get('grafana')
    if (!grafanaConfig?.enabled) return []

    const dashboards = DEFAULT_GRAFANA_DASHBOARDS
    const links: ObservabilityLink[] = []

    for (const dashboard of dashboards) {
      const params = new URLSearchParams()

      // Add project filter if available
      if (context.projectId && grafanaConfig.project_filter_param) {
        params.set(grafanaConfig.project_filter_param, context.projectId)
      }

      // Add time range if available
      if (context.timeRange && grafanaConfig.time_filter_param) {
        params.set(grafanaConfig.time_filter_param, context.timeRange)
      }

      const queryString = params.toString()
      const url = `${GRAFANA_HOST}/d/${dashboard.slug}${queryString ? `?${queryString}` : ''}`

      links.push({
        url,
        label: `Grafana: ${dashboard.label}`,
        tool: 'grafana',
      })
    }

    return links
  }

  /**
   * Generate log viewer link with filters
   */
  async getLogViewerLink(context: LinkContext): Promise<ObservabilityLink | null> {
    if (!LOG_VIEWER_HOST) return null

    const config = await this.getConfig()
    const logsConfig = config.get('logs')
    if (!logsConfig?.enabled) return null

    const params = new URLSearchParams()

    // Add project filter if available
    if (context.projectId && logsConfig.project_filter_param) {
      params.set(logsConfig.project_filter_param, context.projectId)
    }

    // Add correlation ID if available (useful for request tracing)
    if (context.correlationId) {
      params.set('correlation_id', context.correlationId)
    }

    // Add service filter if available
    if (context.service) {
      params.set('service', context.service)
    }

    // Add time range if available
    if (context.timeRange && logsConfig.time_filter_param) {
      params.set(logsConfig.time_filter_param, context.timeRange)
    }

    const queryString = params.toString()
    const url = `${LOG_VIEWER_HOST}${queryString ? `?${queryString}` : ''}`

    return {
      url,
      label: 'Logs',
      tool: 'logs',
    }
  }

  /**
   * Get all available links for a context
   */
  async getAllLinks(context: LinkContext): Promise<ObservabilityLinks> {
    const [posthog, grafana, logs] = await Promise.all([
      this.getPostHogLink(context),
      this.getGrafanaLinks(context),
      this.getLogViewerLink(context),
    ])

    const result: ObservabilityLinks = {}

    if (posthog) result.posthog = posthog
    if (grafana.length > 0) result.grafana = grafana
    if (logs) result.logs = logs

    return result
  }

  /**
   * Check if any observability tools are configured (env vars exist)
   */
  hasAnyToolsConfigured(): boolean {
    return !!(POSTHOG_HOST || GRAFANA_HOST || LOG_VIEWER_HOST)
  }

  /**
   * Check if any observability tools are both configured AND enabled in DB
   */
  async hasAnyToolsEnabled(): Promise<boolean> {
    // First check env vars
    if (!this.hasAnyToolsConfigured()) {
      return false
    }

    // Then check DB enabled flags
    const config = await this.getConfig()
    for (const [tool, conf] of config) {
      if (!conf.enabled) continue
      // Check if the corresponding env var is set
      if (tool === 'posthog' && POSTHOG_HOST) return true
      if (tool === 'grafana' && GRAFANA_HOST) return true
      if (tool === 'logs' && LOG_VIEWER_HOST) return true
    }
    return false
  }
}

// Singleton instance
let instance: ObservabilityLinksService | null = null

export function getObservabilityLinksService(): ObservabilityLinksService {
  if (!instance) {
    instance = new ObservabilityLinksService()
  }
  return instance
}
