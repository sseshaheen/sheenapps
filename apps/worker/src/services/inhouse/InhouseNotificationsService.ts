/**
 * In-House Notifications Service
 *
 * Multi-channel notification delivery for Easy Mode projects.
 * Supports email, push, realtime, and SMS channels.
 *
 * Part of EASY_MODE_SDK_PLAN.md - Phase 3C
 */

import { randomUUID } from 'crypto'
import { getPool } from '../databaseWrapper'
import { getInhouseMeteringService } from './InhouseMeteringService'

// =============================================================================
// TYPES
// =============================================================================

export type NotificationChannel = 'email' | 'push' | 'realtime' | 'sms'

export interface ChannelConfig {
  email?: {
    enabled?: boolean
    from?: string
    replyTo?: string
  }
  push?: {
    enabled?: boolean
    icon?: string
    badge?: string
    sound?: string
  }
  realtime?: {
    enabled?: boolean
    persistent?: boolean
  }
  sms?: {
    enabled?: boolean
    from?: string
  }
}

export interface SendNotificationOptions {
  to: string[]
  type: string
  data?: Record<string, unknown>
  title?: string
  body?: string
  channels?: NotificationChannel[]
  channelConfig?: ChannelConfig
  idempotencyKey?: string
  scheduledFor?: string
  metadata?: Record<string, unknown>
}

export interface NotificationDelivery {
  channel: NotificationChannel
  status: 'pending' | 'sent' | 'delivered' | 'failed' | 'skipped'
  sentAt?: string
  deliveredAt?: string
  failedAt?: string
  error?: string
}

export interface SentNotification {
  id: string
  type: string
  to: string[]
  title: string
  body: string
  channels: NotificationChannel[]
  deliveries: NotificationDelivery[]
  status: 'pending' | 'partial' | 'sent' | 'delivered' | 'failed'
  createdAt: string
  scheduledFor?: string
  metadata?: Record<string, unknown>
}

export interface NotificationTemplate {
  id: string
  type: string
  name: string
  description?: string
  channels: NotificationChannel[]
  defaultTitle: string
  defaultBody: string
  variables: string[]
  channelTemplates?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface CreateTemplateOptions {
  type: string
  name: string
  description?: string
  channels: NotificationChannel[]
  defaultTitle: string
  defaultBody: string
  variables?: string[]
  channelTemplates?: Record<string, unknown>
}

export interface UserPreferences {
  userId: string
  channels: {
    email: boolean
    push: boolean
    realtime: boolean
    sms: boolean
  }
  types: Record<string, {
    enabled: boolean
    channels?: NotificationChannel[]
  }>
  quietHours?: {
    enabled: boolean
    start: string
    end: string
    timezone: string
  }
  updatedAt: string
}

export interface UpdatePreferencesOptions {
  channels?: Partial<UserPreferences['channels']>
  types?: UserPreferences['types']
  quietHours?: UserPreferences['quietHours']
}

export interface ListNotificationsOptions {
  userId?: string
  type?: string
  channel?: NotificationChannel
  status?: SentNotification['status']
  startDate?: string
  endDate?: string
  limit?: number
  offset?: number
}

export interface ListNotificationsResult {
  notifications: SentNotification[]
  total: number
  hasMore: boolean
}

export interface NotificationStats {
  period: { start: string; end: string }
  totals: {
    sent: number
    delivered: number
    failed: number
    pending: number
  }
  byChannel: Record<NotificationChannel, {
    sent: number
    delivered: number
    failed: number
  }>
  byType: Record<string, {
    sent: number
    delivered: number
    failed: number
  }>
}

export interface NotificationsResult<T> {
  ok: boolean
  data?: T
  error?: {
    code: string
    message: string
    retryable: boolean
  }
}

// =============================================================================
// SERVICE CACHE
// =============================================================================

interface CachedService {
  service: InhouseNotificationsService
  createdAt: number
}

const serviceCache = new Map<string, CachedService>()
const SERVICE_TTL_MS = 5 * 60 * 1000 // 5 minutes

// =============================================================================
// SERVICE IMPLEMENTATION
// =============================================================================

export class InhouseNotificationsService {
  private projectId: string

  private constructor(projectId: string) {
    this.projectId = projectId
  }

  static getInstance(projectId: string): InhouseNotificationsService {
    const cacheKey = projectId
    const cached = serviceCache.get(cacheKey)
    const now = Date.now()

    if (cached && now - cached.createdAt < SERVICE_TTL_MS) {
      return cached.service
    }

    const service = new InhouseNotificationsService(projectId)
    serviceCache.set(cacheKey, { service, createdAt: now })
    return service
  }

  // ===========================================================================
  // NOTIFICATIONS
  // ===========================================================================

  async send(options: SendNotificationOptions): Promise<NotificationsResult<SentNotification>> {
    const pool = getPool()

    try {
      // Get template if exists
      const template = await this.getTemplateByType(options.type)

      // Determine title and body
      const title = options.title || (template ? this.interpolate(template.defaultTitle, options.data) : options.type)
      const body = options.body || (template ? this.interpolate(template.defaultBody, options.data) : '')

      // Determine channels
      const channels = options.channels || template?.channels || ['realtime']

      // Create notification record
      const notificationId = randomUUID()
      const now = new Date().toISOString()

      // Check idempotency
      if (options.idempotencyKey) {
        const existing = await this.findByIdempotencyKey(options.idempotencyKey)
        if (existing) {
          return { ok: true, data: existing }
        }
      }

      // Create deliveries
      const deliveries: NotificationDelivery[] = []

      for (const channel of channels) {
        const delivery: NotificationDelivery = {
          channel,
          status: options.scheduledFor ? 'pending' : 'pending',
        }

        if (!options.scheduledFor) {
          // Attempt immediate delivery
          const result = await this.deliverToChannel(channel, options.to, title, body, options.channelConfig?.[channel])
          delivery.status = result.success ? 'sent' : 'failed'
          if (result.success) {
            delivery.sentAt = now
          } else {
            delivery.failedAt = now
            delivery.error = result.error
          }
        }

        deliveries.push(delivery)
      }

      // Determine overall status
      const successCount = deliveries.filter(d => d.status === 'sent' || d.status === 'delivered').length
      const failCount = deliveries.filter(d => d.status === 'failed').length
      let status: SentNotification['status'] = 'pending'

      if (options.scheduledFor) {
        status = 'pending'
      } else if (successCount === deliveries.length) {
        status = 'sent'
      } else if (successCount > 0) {
        status = 'partial'
      } else if (failCount === deliveries.length) {
        status = 'failed'
      }

      const notification: SentNotification = {
        id: notificationId,
        type: options.type,
        to: options.to,
        title,
        body,
        channels,
        deliveries,
        status,
        createdAt: now,
        scheduledFor: options.scheduledFor,
        metadata: options.metadata,
      }

      // Store notification
      await pool.query(`
        INSERT INTO inhouse_notifications (
          id, project_id, type, recipients, title, body,
          channels, deliveries, status, created_at, scheduled_for,
          metadata, idempotency_key
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `, [
        notification.id,
        this.projectId,
        notification.type,
        JSON.stringify(notification.to),
        notification.title,
        notification.body,
        JSON.stringify(notification.channels),
        JSON.stringify(notification.deliveries),
        notification.status,
        notification.createdAt,
        notification.scheduledFor || null,
        notification.metadata ? JSON.stringify(notification.metadata) : null,
        options.idempotencyKey || null,
      ])

      // Log usage
      await this.logUsage('send', channels.length, status !== 'failed')

      return { ok: true, data: notification }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return {
        ok: false,
        error: { code: 'INTERNAL_ERROR', message, retryable: true },
      }
    }
  }

  async get(notificationId: string): Promise<NotificationsResult<SentNotification>> {
    const pool = getPool()

    try {
      const { rows } = await pool.query(`
        SELECT * FROM inhouse_notifications
        WHERE id = $1 AND project_id = $2
      `, [notificationId, this.projectId])

      if (rows.length === 0) {
        return {
          ok: false,
          error: { code: 'NOT_FOUND', message: 'Notification not found', retryable: false },
        }
      }

      const r = rows[0]
      return {
        ok: true,
        data: {
          id: r.id,
          type: r.type,
          to: JSON.parse(r.recipients),
          title: r.title,
          body: r.body,
          channels: JSON.parse(r.channels),
          deliveries: JSON.parse(r.deliveries),
          status: r.status as SentNotification['status'],
          createdAt: r.created_at,
          scheduledFor: r.scheduled_for || undefined,
          metadata: r.metadata ? JSON.parse(r.metadata) : undefined,
        },
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return {
        ok: false,
        error: { code: 'INTERNAL_ERROR', message, retryable: true },
      }
    }
  }

  async list(options?: ListNotificationsOptions): Promise<NotificationsResult<ListNotificationsResult>> {
    const pool = getPool()

    try {
      const limit = Math.min(options?.limit || 50, 100)
      const offset = options?.offset || 0

      let whereClause = 'WHERE project_id = $1'
      const params: unknown[] = [this.projectId]
      let paramIndex = 2

      if (options?.userId) {
        whereClause += ` AND recipients LIKE $${paramIndex}`
        params.push(`%${options.userId}%`)
        paramIndex++
      }
      if (options?.type) {
        whereClause += ` AND type = $${paramIndex}`
        params.push(options.type)
        paramIndex++
      }
      if (options?.channel) {
        whereClause += ` AND channels LIKE $${paramIndex}`
        params.push(`%${options.channel}%`)
        paramIndex++
      }
      if (options?.status) {
        whereClause += ` AND status = $${paramIndex}`
        params.push(options.status)
        paramIndex++
      }
      if (options?.startDate) {
        whereClause += ` AND created_at >= $${paramIndex}`
        params.push(options.startDate)
        paramIndex++
      }
      if (options?.endDate) {
        whereClause += ` AND created_at <= $${paramIndex}`
        params.push(options.endDate)
        paramIndex++
      }

      // Get total count
      const countResult = await pool.query(`
        SELECT COUNT(*) as count FROM inhouse_notifications ${whereClause}
      `, params)

      const total = parseInt(countResult.rows[0]?.count || '0', 10)

      // Get notifications
      const results = await pool.query(`
        SELECT * FROM inhouse_notifications
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `, [...params, limit, offset])

      const notifications: SentNotification[] = results.rows.map((r: Record<string, unknown>) => ({
        id: r.id as string,
        type: r.type as string,
        to: JSON.parse(r.recipients as string),
        title: r.title as string,
        body: r.body as string,
        channels: JSON.parse(r.channels as string),
        deliveries: JSON.parse(r.deliveries as string),
        status: r.status as SentNotification['status'],
        createdAt: r.created_at as string,
        scheduledFor: (r.scheduled_for as string) || undefined,
        metadata: r.metadata ? JSON.parse(r.metadata as string) : undefined,
      }))

      return {
        ok: true,
        data: {
          notifications,
          total,
          hasMore: offset + notifications.length < total,
        },
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return {
        ok: false,
        error: { code: 'INTERNAL_ERROR', message, retryable: true },
      }
    }
  }

  async cancel(notificationId: string): Promise<NotificationsResult<{ cancelled: boolean }>> {
    const pool = getPool()

    try {
      const result = await pool.query(`
        UPDATE inhouse_notifications
        SET status = 'cancelled'
        WHERE id = $1 AND project_id = $2 AND status = 'pending' AND scheduled_for IS NOT NULL
      `, [notificationId, this.projectId])

      const cancelled = (result.rowCount || 0) > 0

      return { ok: true, data: { cancelled } }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return {
        ok: false,
        error: { code: 'INTERNAL_ERROR', message, retryable: true },
      }
    }
  }

  // ===========================================================================
  // TEMPLATES
  // ===========================================================================

  async createTemplate(options: CreateTemplateOptions): Promise<NotificationsResult<NotificationTemplate>> {
    const pool = getPool()

    try {
      const id = randomUUID()
      const now = new Date().toISOString()

      await pool.query(`
        INSERT INTO inhouse_notification_templates (
          id, project_id, type, name, description, channels,
          default_title, default_body, variables, channel_templates,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [
        id,
        this.projectId,
        options.type,
        options.name,
        options.description || null,
        JSON.stringify(options.channels),
        options.defaultTitle,
        options.defaultBody,
        JSON.stringify(options.variables || []),
        options.channelTemplates ? JSON.stringify(options.channelTemplates) : null,
        now,
        now,
      ])

      return {
        ok: true,
        data: {
          id,
          type: options.type,
          name: options.name,
          description: options.description,
          channels: options.channels,
          defaultTitle: options.defaultTitle,
          defaultBody: options.defaultBody,
          variables: options.variables || [],
          channelTemplates: options.channelTemplates,
          createdAt: now,
          updatedAt: now,
        },
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'

      if (message.includes('unique') || message.includes('duplicate')) {
        return {
          ok: false,
          error: { code: 'ALREADY_EXISTS', message: 'Template type already exists', retryable: false },
        }
      }

      return {
        ok: false,
        error: { code: 'INTERNAL_ERROR', message, retryable: true },
      }
    }
  }

  async getTemplate(type: string): Promise<NotificationsResult<NotificationTemplate>> {
    const pool = getPool()

    try {
      const { rows } = await pool.query(`
        SELECT * FROM inhouse_notification_templates
        WHERE type = $1 AND project_id = $2
      `, [type, this.projectId])

      if (rows.length === 0) {
        return {
          ok: false,
          error: { code: 'NOT_FOUND', message: 'Template not found', retryable: false },
        }
      }

      const r = rows[0]
      return {
        ok: true,
        data: {
          id: r.id,
          type: r.type,
          name: r.name,
          description: r.description || undefined,
          channels: JSON.parse(r.channels),
          defaultTitle: r.default_title,
          defaultBody: r.default_body,
          variables: JSON.parse(r.variables),
          channelTemplates: r.channel_templates ? JSON.parse(r.channel_templates) : undefined,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        },
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return {
        ok: false,
        error: { code: 'INTERNAL_ERROR', message, retryable: true },
      }
    }
  }

  async listTemplates(): Promise<NotificationsResult<NotificationTemplate[]>> {
    const pool = getPool()

    try {
      const { rows } = await pool.query(`
        SELECT * FROM inhouse_notification_templates
        WHERE project_id = $1
        ORDER BY created_at DESC
      `, [this.projectId])

      const templates: NotificationTemplate[] = rows.map((r: Record<string, unknown>) => ({
        id: r.id as string,
        type: r.type as string,
        name: r.name as string,
        description: (r.description as string) || undefined,
        channels: JSON.parse(r.channels as string) as NotificationChannel[],
        defaultTitle: r.default_title as string,
        defaultBody: r.default_body as string,
        variables: JSON.parse(r.variables as string) as string[],
        channelTemplates: r.channel_templates ? JSON.parse(r.channel_templates as string) : undefined,
        createdAt: r.created_at as string,
        updatedAt: r.updated_at as string,
      }))

      return { ok: true, data: templates }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return {
        ok: false,
        error: { code: 'INTERNAL_ERROR', message, retryable: true },
      }
    }
  }

  async deleteTemplate(type: string): Promise<NotificationsResult<{ deleted: boolean }>> {
    const pool = getPool()

    try {
      const result = await pool.query(`
        DELETE FROM inhouse_notification_templates
        WHERE type = $1 AND project_id = $2
      `, [type, this.projectId])

      const deleted = (result.rowCount || 0) > 0

      return { ok: true, data: { deleted } }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return {
        ok: false,
        error: { code: 'INTERNAL_ERROR', message, retryable: true },
      }
    }
  }

  // ===========================================================================
  // USER PREFERENCES
  // ===========================================================================

  async getPreferences(userId: string): Promise<NotificationsResult<UserPreferences>> {
    const pool = getPool()

    try {
      const { rows } = await pool.query(`
        SELECT * FROM inhouse_notification_preferences
        WHERE user_id = $1 AND project_id = $2
      `, [userId, this.projectId])

      if (rows.length === 0) {
        // Return defaults
        return {
          ok: true,
          data: {
            userId,
            channels: { email: true, push: true, realtime: true, sms: true },
            types: {},
            updatedAt: new Date().toISOString(),
          },
        }
      }

      const r = rows[0]
      return {
        ok: true,
        data: {
          userId: r.user_id,
          channels: JSON.parse(r.channels),
          types: JSON.parse(r.types),
          quietHours: r.quiet_hours ? JSON.parse(r.quiet_hours) : undefined,
          updatedAt: r.updated_at,
        },
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return {
        ok: false,
        error: { code: 'INTERNAL_ERROR', message, retryable: true },
      }
    }
  }

  async updatePreferences(userId: string, options: UpdatePreferencesOptions): Promise<NotificationsResult<UserPreferences>> {
    const pool = getPool()

    try {
      const existing = await this.getPreferences(userId)
      if (!existing.ok || !existing.data) {
        return { ok: false, error: existing.error }
      }

      const now = new Date().toISOString()
      const channels = { ...existing.data.channels, ...options.channels }
      const types = { ...existing.data.types, ...options.types }
      const quietHours = options.quietHours !== undefined ? options.quietHours : existing.data.quietHours

      await pool.query(`
        INSERT INTO inhouse_notification_preferences (
          user_id, project_id, channels, types, quiet_hours, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (user_id, project_id) DO UPDATE SET
          channels = EXCLUDED.channels,
          types = EXCLUDED.types,
          quiet_hours = EXCLUDED.quiet_hours,
          updated_at = EXCLUDED.updated_at
      `, [
        userId,
        this.projectId,
        JSON.stringify(channels),
        JSON.stringify(types),
        quietHours ? JSON.stringify(quietHours) : null,
        now,
      ])

      return {
        ok: true,
        data: {
          userId,
          channels,
          types,
          quietHours,
          updatedAt: now,
        },
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return {
        ok: false,
        error: { code: 'INTERNAL_ERROR', message, retryable: true },
      }
    }
  }

  // ===========================================================================
  // STATISTICS
  // ===========================================================================

  async getStats(options?: { startDate?: string; endDate?: string }): Promise<NotificationsResult<NotificationStats>> {
    const pool = getPool()

    try {
      const now = new Date()
      const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0] || ''
      const defaultEnd = now.toISOString().split('T')[0] || ''

      const startDate = options?.startDate || defaultStart
      const endDate = options?.endDate || defaultEnd

      // Get usage stats
      const usageResults = await pool.query(`
        SELECT
          SUM(CASE WHEN success = true THEN delivery_count ELSE 0 END) as sent,
          SUM(CASE WHEN success = false THEN delivery_count ELSE 0 END) as failed
        FROM inhouse_notification_usage
        WHERE project_id = $1
          AND DATE(created_at) >= $2
          AND DATE(created_at) <= $3
      `, [this.projectId, startDate, endDate])

      // Get notification status breakdown
      const statusResults = await pool.query(`
        SELECT status, COUNT(*) as count
        FROM inhouse_notifications
        WHERE project_id = $1
          AND DATE(created_at) >= $2
          AND DATE(created_at) <= $3
        GROUP BY status
      `, [this.projectId, startDate, endDate])

      const statusMap: Record<string, number> = {}
      for (const r of statusResults.rows) {
        statusMap[r.status] = parseInt(r.count, 10)
      }

      // Get channel breakdown
      const channelStats: Record<NotificationChannel, { sent: number; delivered: number; failed: number }> = {
        email: { sent: 0, delivered: 0, failed: 0 },
        push: { sent: 0, delivered: 0, failed: 0 },
        realtime: { sent: 0, delivered: 0, failed: 0 },
        sms: { sent: 0, delivered: 0, failed: 0 },
      }

      // Get type breakdown
      const typeResults = await pool.query(`
        SELECT type, status, COUNT(*) as count
        FROM inhouse_notifications
        WHERE project_id = $1
          AND DATE(created_at) >= $2
          AND DATE(created_at) <= $3
        GROUP BY type, status
      `, [this.projectId, startDate, endDate])

      const typeStats: Record<string, { sent: number; delivered: number; failed: number }> = {}
      for (const r of typeResults.rows) {
        if (!typeStats[r.type]) {
          typeStats[r.type] = { sent: 0, delivered: 0, failed: 0 }
        }
        const stats = typeStats[r.type]!
        const count = parseInt(r.count, 10)
        if (r.status === 'sent' || r.status === 'partial') {
          stats.sent += count
        } else if (r.status === 'delivered') {
          stats.delivered += count
        } else if (r.status === 'failed') {
          stats.failed += count
        }
      }

      const usageRow = usageResults.rows[0] || { sent: 0, failed: 0 }

      return {
        ok: true,
        data: {
          period: { start: startDate, end: endDate },
          totals: {
            sent: parseInt(usageRow.sent || '0', 10),
            delivered: statusMap['delivered'] || 0,
            failed: parseInt(usageRow.failed || '0', 10),
            pending: statusMap['pending'] || 0,
          },
          byChannel: channelStats,
          byType: typeStats,
        },
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return {
        ok: false,
        error: { code: 'INTERNAL_ERROR', message, retryable: true },
      }
    }
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  private async getTemplateByType(type: string): Promise<NotificationTemplate | null> {
    const result = await this.getTemplate(type)
    return result.ok && result.data ? result.data : null
  }

  private interpolate(template: string, data?: Record<string, unknown>): string {
    if (!data) return template
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      return data[key] !== undefined ? String(data[key]) : `{{${key}}}`
    })
  }

  private async findByIdempotencyKey(key: string): Promise<SentNotification | null> {
    const pool = getPool()

    const { rows } = await pool.query(`
      SELECT * FROM inhouse_notifications
      WHERE idempotency_key = $1 AND project_id = $2
    `, [key, this.projectId])

    if (rows.length === 0) return null

    const r = rows[0]
    return {
      id: r.id,
      type: r.type,
      to: JSON.parse(r.recipients),
      title: r.title,
      body: r.body,
      channels: JSON.parse(r.channels),
      deliveries: JSON.parse(r.deliveries),
      status: r.status as SentNotification['status'],
      createdAt: r.created_at,
      scheduledFor: r.scheduled_for || undefined,
      metadata: r.metadata ? JSON.parse(r.metadata) : undefined,
    }
  }

  private async deliverToChannel(
    channel: NotificationChannel,
    _recipients: string[],
    _title: string,
    _body: string,
    _config?: Record<string, unknown>
  ): Promise<{ success: boolean; error?: string }> {
    // Channel delivery implementation
    // In production, this would integrate with actual delivery providers

    switch (channel) {
      case 'realtime':
        // Publish to realtime channel for each recipient
        // This would use the InhouseRealtimeService
        return { success: true }

      case 'email':
        // Use email service
        // This would use InhouseEmailService or Resend integration
        return { success: true }

      case 'push':
        // Use push notification service
        // This would integrate with FCM, APNs, or web push
        return { success: true }

      case 'sms':
        // Use SMS service
        // This would integrate with Twilio or similar
        return { success: true }

      default:
        return { success: false, error: `Unknown channel: ${channel}` }
    }
  }

  private async logUsage(operation: string, deliveryCount: number, success: boolean): Promise<void> {
    const pool = getPool()

    try {
      await pool.query(`
        INSERT INTO inhouse_notification_usage (
          id, project_id, operation, delivery_count, success, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        randomUUID(),
        this.projectId,
        operation,
        deliveryCount,
        success,
        new Date().toISOString(),
      ])
    } catch {
      // Silently fail usage logging
    }
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

export function getInhouseNotificationsService(projectId: string): InhouseNotificationsService {
  return InhouseNotificationsService.getInstance(projectId)
}
