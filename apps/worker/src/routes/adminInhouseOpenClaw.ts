/**
 * Admin In-House OpenClaw Routes
 *
 * Endpoints for managing OpenClaw AI Assistant across In-House Mode projects.
 * Provides configuration, metrics, channel management, and health monitoring.
 */

import { FastifyInstance } from 'fastify'
import { requireAdminAuth, AdminRequest } from '../middleware/adminAuthentication'
import { withStatementTimeout } from '../utils/dbTimeout'
import { requirePool, parseLimitOffset } from './admin/_utils'
import { auditAdminAction } from './admin/_audit'
import crypto from 'crypto'

// =============================================================================
// TYPES
// =============================================================================

interface OpenClawConfigQuery {
  projectId: string
}

interface OpenClawMetricsQuery {
  projectId: string
  days?: string  // Number of days to look back (default: 7)
}

interface OpenClawConfigBody {
  projectId: string
  enabled?: boolean
  defaultLocale?: string
  businessHours?: {
    timezone: string
    schedule: Array<{
      dayOfWeek: number  // 0-6 (Sunday-Saturday)
      startTime: string  // HH:MM
      endTime: string    // HH:MM
    }>
  }
  handoffSettings?: {
    enabled: boolean
    keywords?: string[]
    message?: string
  }
  channels?: {
    telegram?: { enabled: boolean; botToken?: string }
    webchat?: { enabled: boolean; allowedOrigins?: string[] }
    whatsapp?: { enabled: boolean }  // WhatsApp requires separate setup
  }
}

interface TelegramConnectBody {
  projectId: string
  botToken: string
}

interface KillSwitchBody {
  projectId: string
  enabled: boolean
  reason: string
}

interface ChannelStatus {
  id: string
  status: 'connected' | 'disconnected' | 'error' | 'not_configured'
  connectedAt?: string
  lastMessageAt?: string
  messageCount24h: number
  errorMessage?: string
}

// =============================================================================
// HELPERS
// =============================================================================

async function ensureProject(db: ReturnType<typeof requirePool>, projectId: string) {
  const projectCheck = await db.query(
    `SELECT id, metadata FROM projects WHERE id = $1 AND infra_mode = 'easy'`,
    [projectId]
  )
  if (projectCheck.rows.length === 0) {
    return null
  }
  return projectCheck.rows[0]
}

function parseMetadata(metadata: unknown): Record<string, unknown> {
  if (!metadata) return {}
  if (typeof metadata === 'string') {
    try {
      return JSON.parse(metadata)
    } catch {
      return {}
    }
  }
  return metadata as Record<string, unknown>
}

function generateEmbedCode(projectId: string, config: Record<string, unknown>): string {
  const allowedOrigins = (config.webchat as any)?.allowedOrigins || ['*']
  const locale = config.defaultLocale || 'ar'

  return `<!-- SheenApps AI Assistant Widget -->
<script>
  (function(w,d,s,o,f,js,fjs){
    w['SheenAI']=o;w[o]=w[o]||function(){(w[o].q=w[o].q||[]).push(arguments)};
    js=d.createElement(s);fjs=d.getElementsByTagName(s)[0];
    js.id=o;js.src=f;js.async=1;fjs.parentNode.insertBefore(js,fjs);
  }(window,document,'script','sheen','https://cdn.sheenapps.com/widget/v1/chat.js'));
  sheen('init', {
    projectId: '${projectId}',
    locale: '${locale}',
    position: 'bottom-right'
  });
</script>
<!-- End SheenApps AI Assistant Widget -->`
}

// =============================================================================
// ROUTES
// =============================================================================

export default async function adminInhouseOpenClawRoutes(fastify: FastifyInstance) {
  const readMiddleware = requireAdminAuth({ permissions: ['inhouse.read'] })
  const writeMiddleware = requireAdminAuth({ permissions: ['inhouse.write'] })

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/openclaw/config
  // Get OpenClaw configuration for a project
  // -------------------------------------------------------------------------
  fastify.get<{
    Querystring: OpenClawConfigQuery
  }>('/v1/admin/inhouse/openclaw/config', { preHandler: readMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    try {
      const db = requirePool()
      const { projectId } = request.query

      if (!projectId) {
        return reply.status(400).send({
          success: false,
          error: 'projectId is required'
        })
      }

      const project = await ensureProject(db, projectId)
      if (!project) {
        return reply.status(404).send({
          success: false,
          error: 'Project not found'
        })
      }

      const metadata = parseMetadata(project.metadata)
      const openclawConfig = metadata.openclaw_config || {}

      return reply.send({
        success: true,
        data: {
          projectId,
          enabled: metadata.openclaw_enabled === true,
          killSwitchActive: metadata.openclaw_kill_switch === true,
          config: {
            defaultLocale: (openclawConfig as any).defaultLocale || 'ar',
            businessHours: (openclawConfig as any).businessHours || null,
            handoffSettings: (openclawConfig as any).handoffSettings || null,
            channels: (openclawConfig as any).channels || {
              telegram: { enabled: false },
              webchat: { enabled: false },
              whatsapp: { enabled: false }
            }
          }
        }
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to get OpenClaw config')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get OpenClaw config'
      })
    }
  })

  // -------------------------------------------------------------------------
  // PUT /v1/admin/inhouse/openclaw/config
  // Update OpenClaw configuration for a project
  // -------------------------------------------------------------------------
  fastify.put<{
    Body: OpenClawConfigBody
  }>('/v1/admin/inhouse/openclaw/config', { preHandler: writeMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    try {
      const db = requirePool()
      const { projectId, enabled, defaultLocale, businessHours, handoffSettings, channels } = request.body

      if (!projectId) {
        return reply.status(400).send({
          success: false,
          error: 'projectId is required'
        })
      }

      const project = await ensureProject(db, projectId)
      if (!project) {
        return reply.status(404).send({
          success: false,
          error: 'Project not found'
        })
      }

      const metadata = parseMetadata(project.metadata)
      const existingConfig = (metadata.openclaw_config || {}) as Record<string, unknown>

      // Build updated config
      const updatedConfig: Record<string, unknown> = {
        ...existingConfig,
        ...(defaultLocale !== undefined && { defaultLocale }),
        ...(businessHours !== undefined && { businessHours }),
        ...(handoffSettings !== undefined && { handoffSettings }),
        ...(channels !== undefined && {
          channels: {
            ...((existingConfig.channels as any) || {}),
            ...channels
          }
        }),
        updatedAt: new Date().toISOString()
      }

      // Note: Webhook signature validation uses the global OPENCLAW_WEBHOOK_SECRET env var
      // (not per-project secrets) for simplicity. All gateways share the same secret.

      // Update metadata
      const updatedMetadata = {
        ...metadata,
        ...(enabled !== undefined && { openclaw_enabled: enabled }),
        openclaw_config: updatedConfig
      }

      await withStatementTimeout(db, '5s', async (client) => {
        await client.query(
          `UPDATE projects SET metadata = $1, updated_at = NOW() WHERE id = $2`,
          [JSON.stringify(updatedMetadata), projectId]
        )
      })

      // Audit the action
      auditAdminAction({
        adminId: adminRequest.adminClaims.sub,
        action: 'openclaw_config_update',
        resourceType: 'openclaw',
        resourceId: projectId,
        metadata: {
          enabled,
          hasBusinessHours: !!businessHours,
          hasHandoff: !!handoffSettings,
          channels: channels ? Object.keys(channels) : []
        },
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.send({
        success: true,
        data: {
          projectId,
          enabled: updatedMetadata.openclaw_enabled === true,
          config: updatedConfig,
          updatedAt: new Date().toISOString()
        }
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to update OpenClaw config')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update OpenClaw config'
      })
    }
  })

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/openclaw/metrics
  // Get OpenClaw metrics for Run Hub dashboard
  // -------------------------------------------------------------------------
  fastify.get<{
    Querystring: OpenClawMetricsQuery
  }>('/v1/admin/inhouse/openclaw/metrics', { preHandler: readMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    try {
      const db = requirePool()
      const { projectId, days: daysStr } = request.query
      const days = parseInt(daysStr || '7', 10)

      if (!projectId) {
        return reply.status(400).send({
          success: false,
          error: 'projectId is required'
        })
      }

      const project = await ensureProject(db, projectId)
      if (!project) {
        return reply.status(404).send({
          success: false,
          error: 'Project not found'
        })
      }

      // Get channel status
      const channelStatusResult = await withStatementTimeout(db, '5s', async (client) => {
        return client.query(
          `SELECT channel, status, connected_at, error_message, updated_at
           FROM openclaw_channel_status
           WHERE project_id = $1`,
          [projectId]
        )
      })

      // Get daily metrics (using parameterized interval for safety)
      const metricsResult = await withStatementTimeout(db, '5s', async (client) => {
        return client.query(
          `SELECT event_type, SUM(count) as total
           FROM openclaw_daily_metrics
           WHERE project_id = $1
             AND metric_date >= CURRENT_DATE - make_interval(days => $2)
           GROUP BY event_type`,
          [projectId, days]
        )
      })

      // Get message count per channel in last 24h
      const messageCountResult = await withStatementTimeout(db, '5s', async (client) => {
        return client.query(
          `SELECT
             COALESCE(metadata->>'channel', 'unknown') as channel,
             SUM(count) as count
           FROM openclaw_daily_metrics
           WHERE project_id = $1
             AND event_type IN ('message.received', 'message.sent')
             AND metric_date >= CURRENT_DATE - INTERVAL '1 day'
           GROUP BY metadata->>'channel'`,
          [projectId]
        )
      })

      // Get top queries from event log (using parameterized interval for safety)
      const topQueriesResult = await withStatementTimeout(db, '5s', async (client) => {
        return client.query(
          `SELECT
             COALESCE(metadata->>'intent', 'unknown') as query,
             COUNT(*) as count
           FROM openclaw_event_log
           WHERE project_id = $1
             AND event_type = 'message.received'
             AND created_at >= NOW() - make_interval(days => $2)
           GROUP BY metadata->>'intent'
           ORDER BY count DESC
           LIMIT 10`,
          [projectId, days]
        )
      })

      // Build channel status array
      const channelMap = new Map<string, ChannelStatus>()
      for (const row of channelStatusResult.rows) {
        channelMap.set(row.channel, {
          id: row.channel,
          status: row.status,
          connectedAt: row.connected_at,
          lastMessageAt: row.updated_at,
          messageCount24h: 0,
          errorMessage: row.error_message
        })
      }

      // Add message counts
      for (const row of messageCountResult.rows) {
        const existing = channelMap.get(row.channel)
        if (existing) {
          existing.messageCount24h = parseInt(row.count, 10)
        }
      }

      // Build metrics map
      const metricsMap = new Map<string, number>()
      for (const row of metricsResult.rows) {
        metricsMap.set(row.event_type, parseInt(row.total, 10))
      }

      const channels: ChannelStatus[] = [
        channelMap.get('telegram') || { id: 'telegram', status: 'not_configured', messageCount24h: 0 },
        channelMap.get('webchat') || { id: 'webchat', status: 'not_configured', messageCount24h: 0 },
        channelMap.get('whatsapp') || { id: 'whatsapp', status: 'not_configured', messageCount24h: 0 }
      ]

      return reply.send({
        success: true,
        data: {
          projectId,
          period: { days, startDate: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString() },
          channels,
          totals: {
            messagesReceived: metricsMap.get('message.received') || 0,
            messagesSent: metricsMap.get('message.sent') || 0,
            leadsCreated: metricsMap.get('lead.created') || 0,
            toolCalls: metricsMap.get('tool.called') || 0,
            errors: metricsMap.get('error.occurred') || 0
          },
          topQueries: topQueriesResult.rows.map(row => ({
            query: row.query,
            count: parseInt(row.count, 10)
          }))
        }
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to get OpenClaw metrics')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get OpenClaw metrics'
      })
    }
  })

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/openclaw/health
  // Get OpenClaw gateway health status
  // -------------------------------------------------------------------------
  fastify.get<{
    Querystring: OpenClawConfigQuery
  }>('/v1/admin/inhouse/openclaw/health', { preHandler: readMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    try {
      const db = requirePool()
      const { projectId } = request.query

      if (!projectId) {
        return reply.status(400).send({
          success: false,
          error: 'projectId is required'
        })
      }

      const project = await ensureProject(db, projectId)
      if (!project) {
        return reply.status(404).send({
          success: false,
          error: 'Project not found'
        })
      }

      const metadata = parseMetadata(project.metadata)

      // Check if OpenClaw is enabled
      if (!metadata.openclaw_enabled) {
        return reply.send({
          success: true,
          data: {
            projectId,
            gatewayStatus: 'not_provisioned',
            channels: [],
            killSwitch: {
              enabled: false
            },
            lastHealthCheck: new Date().toISOString()
          }
        })
      }

      // Get channel status
      const channelStatusResult = await withStatementTimeout(db, '5s', async (client) => {
        return client.query(
          `SELECT channel, status, error_message, updated_at
           FROM openclaw_channel_status
           WHERE project_id = $1`,
          [projectId]
        )
      })

      // Determine gateway health based on channel statuses
      const channelStatuses = channelStatusResult.rows.map(row => ({
        id: row.channel,
        status: row.status === 'connected' ? 'ok' as const :
                row.status === 'error' ? 'error' as const : 'warning' as const,
        message: row.error_message,
        lastChecked: row.updated_at
      }))

      const hasErrors = channelStatuses.some(c => c.status === 'error')
      const hasWarnings = channelStatuses.some(c => c.status === 'warning')
      const gatewayStatus = hasErrors ? 'degraded' : hasWarnings ? 'degraded' : 'healthy'

      return reply.send({
        success: true,
        data: {
          projectId,
          gatewayStatus,
          channels: channelStatuses,
          killSwitch: {
            enabled: metadata.openclaw_kill_switch === true,
            enabledAt: (metadata.openclaw_kill_switch_at as string) || null,
            reason: (metadata.openclaw_kill_switch_reason as string) || null
          },
          lastHealthCheck: new Date().toISOString()
        }
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to get OpenClaw health')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get OpenClaw health'
      })
    }
  })

  // -------------------------------------------------------------------------
  // POST /v1/admin/inhouse/openclaw/channels/telegram
  // Configure Telegram bot for a project
  // -------------------------------------------------------------------------
  fastify.post<{
    Body: TelegramConnectBody
  }>('/v1/admin/inhouse/openclaw/channels/telegram', { preHandler: writeMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    try {
      const db = requirePool()
      const { projectId, botToken } = request.body

      if (!projectId || !botToken) {
        return reply.status(400).send({
          success: false,
          error: 'projectId and botToken are required'
        })
      }

      // Validate bot token format (rough check)
      if (!/^\d+:[A-Za-z0-9_-]+$/.test(botToken)) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid Telegram bot token format'
        })
      }

      const project = await ensureProject(db, projectId)
      if (!project) {
        return reply.status(404).send({
          success: false,
          error: 'Project not found'
        })
      }

      const metadata = parseMetadata(project.metadata)
      const openclawConfig = (metadata.openclaw_config || {}) as Record<string, unknown>

      // Update channels config with Telegram bot token (encrypted in production)
      const updatedConfig = {
        ...openclawConfig,
        channels: {
          ...(openclawConfig.channels as any || {}),
          telegram: {
            enabled: true,
            botTokenConfigured: true,
            // In production, store encrypted or in secrets manager
            // For now, just mark as configured
            configuredAt: new Date().toISOString()
          }
        },
        updatedAt: new Date().toISOString()
      }

      const updatedMetadata = {
        ...metadata,
        openclaw_config: updatedConfig
      }

      await withStatementTimeout(db, '5s', async (client) => {
        await client.query(
          `UPDATE projects SET metadata = $1, updated_at = NOW() WHERE id = $2`,
          [JSON.stringify(updatedMetadata), projectId]
        )
      })

      // Update channel status
      await withStatementTimeout(db, '5s', async (client) => {
        await client.query(
          `INSERT INTO openclaw_channel_status (project_id, gateway_id, channel, status, connected_at, updated_at)
           VALUES ($1, $1, 'telegram', 'connected', NOW(), NOW())
           ON CONFLICT (project_id, channel)
           DO UPDATE SET status = 'connected', connected_at = NOW(), updated_at = NOW(), error_message = NULL`,
          [projectId]
        )
      })

      // Audit the action
      auditAdminAction({
        adminId: adminRequest.adminClaims.sub,
        action: 'openclaw_telegram_connect',
        resourceType: 'openclaw',
        resourceId: projectId,
        metadata: { channel: 'telegram' },
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.send({
        success: true,
        data: {
          projectId,
          channel: 'telegram',
          status: 'connected',
          connectedAt: new Date().toISOString()
        }
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to connect Telegram')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to connect Telegram'
      })
    }
  })

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/openclaw/embed-code
  // Generate WebChat embed code for a project
  // -------------------------------------------------------------------------
  fastify.get<{
    Querystring: OpenClawConfigQuery
  }>('/v1/admin/inhouse/openclaw/embed-code', { preHandler: readMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    try {
      const db = requirePool()
      const { projectId } = request.query

      if (!projectId) {
        return reply.status(400).send({
          success: false,
          error: 'projectId is required'
        })
      }

      const project = await ensureProject(db, projectId)
      if (!project) {
        return reply.status(404).send({
          success: false,
          error: 'Project not found'
        })
      }

      const metadata = parseMetadata(project.metadata)

      if (!metadata.openclaw_enabled) {
        return reply.status(400).send({
          success: false,
          error: 'OpenClaw is not enabled for this project'
        })
      }

      const openclawConfig = (metadata.openclaw_config || {}) as Record<string, unknown>
      const embedCode = generateEmbedCode(projectId, openclawConfig)

      // Update channel status for webchat
      await withStatementTimeout(db, '5s', async (client) => {
        await client.query(
          `INSERT INTO openclaw_channel_status (project_id, gateway_id, channel, status, connected_at, updated_at)
           VALUES ($1, $1, 'webchat', 'connected', NOW(), NOW())
           ON CONFLICT (project_id, channel)
           DO UPDATE SET status = 'connected', updated_at = NOW()`,
          [projectId]
        )
      })

      return reply.send({
        success: true,
        data: {
          projectId,
          embedCode,
          channel: 'webchat',
          locale: openclawConfig.defaultLocale || 'ar'
        }
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to generate embed code')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate embed code'
      })
    }
  })

  // -------------------------------------------------------------------------
  // POST /v1/admin/inhouse/openclaw/kill-switch
  // Toggle OpenClaw kill switch for a project
  // -------------------------------------------------------------------------
  fastify.post<{
    Body: KillSwitchBody
  }>('/v1/admin/inhouse/openclaw/kill-switch', { preHandler: writeMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    try {
      const db = requirePool()
      const { projectId, enabled, reason } = request.body

      if (!projectId) {
        return reply.status(400).send({
          success: false,
          error: 'projectId is required'
        })
      }

      if (enabled && !reason) {
        return reply.status(400).send({
          success: false,
          error: 'reason is required when enabling kill switch'
        })
      }

      const project = await ensureProject(db, projectId)
      if (!project) {
        return reply.status(404).send({
          success: false,
          error: 'Project not found'
        })
      }

      const metadata = parseMetadata(project.metadata)

      const updatedMetadata = {
        ...metadata,
        openclaw_kill_switch: enabled,
        openclaw_kill_switch_at: enabled ? new Date().toISOString() : null,
        openclaw_kill_switch_reason: enabled ? reason : null,
        openclaw_kill_switch_by: enabled ? adminRequest.adminClaims.sub : null
      }

      await withStatementTimeout(db, '5s', async (client) => {
        await client.query(
          `UPDATE projects SET metadata = $1, updated_at = NOW() WHERE id = $2`,
          [JSON.stringify(updatedMetadata), projectId]
        )
      })

      // Audit the action
      auditAdminAction({
        adminId: adminRequest.adminClaims.sub,
        action: enabled ? 'openclaw_kill_switch_enable' : 'openclaw_kill_switch_disable',
        resourceType: 'openclaw',
        resourceId: projectId,
        reason: reason || null,
        metadata: { enabled },
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.send({
        success: true,
        data: {
          projectId,
          killSwitchEnabled: enabled,
          reason: enabled ? reason : null,
          updatedAt: new Date().toISOString()
        }
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to toggle kill switch')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to toggle kill switch'
      })
    }
  })

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/openclaw/usage
  // Get usage and billing data for a project
  // -------------------------------------------------------------------------
  fastify.get<{
    Querystring: OpenClawConfigQuery
  }>('/v1/admin/inhouse/openclaw/usage', { preHandler: readMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    try {
      const db = requirePool()
      const { projectId } = request.query

      if (!projectId) {
        return reply.status(400).send({
          success: false,
          error: 'projectId is required'
        })
      }

      const project = await ensureProject(db, projectId)
      if (!project) {
        return reply.status(404).send({
          success: false,
          error: 'Project not found'
        })
      }

      // Get current billing period (start of current month)
      const now = new Date()
      const billingStart = new Date(now.getFullYear(), now.getMonth(), 1)
      const billingEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)

      // Get usage data
      const usageResult = await withStatementTimeout(db, '5s', async (client) => {
        return client.query(
          `SELECT
             COALESCE(SUM(messages_received), 0) as messages_received,
             COALESCE(SUM(messages_sent), 0) as messages_sent,
             COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
             COALESCE(SUM(completion_tokens), 0) as completion_tokens,
             COALESCE(SUM(estimated_cost_cents), 0) as estimated_cost_cents
           FROM openclaw_usage
           WHERE project_id = $1
             AND billing_period_start >= $2
             AND billing_period_end <= $3`,
          [projectId, billingStart.toISOString(), billingEnd.toISOString()]
        )
      })

      // Get project quotas (or defaults)
      const quotaResult = await withStatementTimeout(db, '5s', async (client) => {
        return client.query(
          `SELECT messages_limit, tokens_limit
           FROM openclaw_quotas
           WHERE project_id = $1`,
          [projectId]
        )
      })

      // Get tier info from pricing table
      const tierResult = await withStatementTimeout(db, '5s', async (client) => {
        return client.query(
          `SELECT tier_key, name, base_price_cents
           FROM openclaw_pricing_tiers
           WHERE tier_key = 'ai_assistant_starter' AND is_active = true
           LIMIT 1`
        )
      })

      const usage = usageResult.rows[0]
      const quota = quotaResult.rows[0] || { messages_limit: 500, tokens_limit: 100000 }
      const tier = tierResult.rows[0]

      return reply.send({
        success: true,
        data: {
          projectId,
          billingPeriod: {
            start: billingStart.toISOString(),
            end: billingEnd.toISOString()
          },
          messages: {
            received: parseInt(usage?.messages_received || '0', 10),
            sent: parseInt(usage?.messages_sent || '0', 10),
            limit: parseInt(quota.messages_limit, 10)
          },
          tokens: {
            prompt: parseInt(usage?.prompt_tokens || '0', 10),
            completion: parseInt(usage?.completion_tokens || '0', 10),
            total: parseInt(usage?.prompt_tokens || '0', 10) + parseInt(usage?.completion_tokens || '0', 10),
            limit: parseInt(quota.tokens_limit, 10)
          },
          estimatedCostCents: parseInt(usage?.estimated_cost_cents || '0', 10),
          tier: tier ? {
            key: tier.tier_key,
            name: tier.name,
            basePriceCents: tier.base_price_cents
          } : null
        }
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to get OpenClaw usage')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get OpenClaw usage'
      })
    }
  })

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/openclaw/feature-flags
  // Get OpenClaw-related feature flags
  // -------------------------------------------------------------------------
  fastify.get('/v1/admin/inhouse/openclaw/feature-flags', { preHandler: readMiddleware as never }, async (request, reply) => {
    try {
      const db = requirePool()

      // Get feature flags
      const flagsResult = await withStatementTimeout(db, '5s', async (client) => {
        return client.query(
          `SELECT name, status
           FROM feature_flags
           WHERE name IN ('openclaw_whatsapp_beta', 'openclaw_enabled')`
        )
      })

      const flags = flagsResult.rows.reduce((acc, row) => {
        acc[row.name] = row.status === 'on'
        return acc
      }, {} as Record<string, boolean>)

      return reply.send({
        success: true,
        data: {
          whatsappBetaEnabled: flags['openclaw_whatsapp_beta'] ?? false,
          openclawEnabled: flags['openclaw_enabled'] ?? true
        }
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to get OpenClaw feature flags')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get feature flags'
      })
    }
  })

  console.log('✅ OpenClaw admin routes registered: /v1/admin/inhouse/openclaw/*')
}
