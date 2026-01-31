/**
 * InhouseAnalyticsService
 *
 * Simple analytics tracking for Easy Mode projects.
 * Provides page views, custom events, and user identification.
 *
 * MVP scope:
 * - Page view tracking
 * - Custom event tracking with properties
 * - User identification (link events to users)
 * - Basic event storage and querying
 *
 * Not in MVP:
 * - Aggregations/funnels (use raw events)
 * - Real-time dashboards
 * - A/B testing
 */

import { randomUUID } from 'crypto'
import { Pool } from 'pg'
import { getPool } from '../database'

// =============================================================================
// Types
// =============================================================================

export interface TrackEventInput {
  event: string
  properties?: Record<string, unknown>
  userId?: string
  anonymousId?: string
  timestamp?: string
  context?: EventContext
}

export interface PageViewInput {
  path: string
  title?: string
  referrer?: string
  userId?: string
  anonymousId?: string
  timestamp?: string
  context?: EventContext
}

export interface IdentifyInput {
  userId: string
  traits?: Record<string, unknown>
  anonymousId?: string
  timestamp?: string
}

export interface EventContext {
  userAgent?: string
  ip?: string
  locale?: string
  timezone?: string
  screen?: {
    width?: number
    height?: number
  }
  page?: {
    url?: string
    path?: string
    referrer?: string
  }
}

export interface AnalyticsEvent {
  id: string
  projectId: string
  eventType: 'track' | 'page' | 'identify'
  eventName: string
  userId: string | null
  anonymousId: string | null
  properties: Record<string, unknown>
  context: EventContext
  timestamp: string
  createdAt: string
}

export interface ListEventsOptions {
  eventType?: 'track' | 'page' | 'identify'
  eventName?: string
  userId?: string
  anonymousId?: string
  startDate?: string
  endDate?: string
  limit?: number
  offset?: number
}

export interface ListEventsResult {
  events: AnalyticsEvent[]
  total: number
  hasMore: boolean
}

export interface EventCounts {
  eventName: string
  count: number
}

export interface GetCountsOptions {
  eventType?: 'track' | 'page' | 'identify'
  startDate?: string
  endDate?: string
  groupBy?: 'event' | 'day' | 'hour'
}

// =============================================================================
// Service Class
// =============================================================================

export class InhouseAnalyticsService {
  private pool: Pool
  private projectId: string

  constructor(projectId: string) {
    this.pool = getPool()
    this.projectId = projectId
  }

  // ---------------------------------------------------------------------------
  // Track Event
  // ---------------------------------------------------------------------------

  async track(input: TrackEventInput): Promise<{ success: boolean; eventId: string }> {
    const {
      event,
      properties = {},
      userId,
      anonymousId,
      timestamp,
      context = {}
    } = input

    // Validate - must have userId or anonymousId
    if (!userId && !anonymousId) {
      throw new Error('Either userId or anonymousId is required')
    }

    const eventId = randomUUID()
    const eventTimestamp = timestamp ? new Date(timestamp) : new Date()

    await this.pool.query(
      `INSERT INTO inhouse_analytics_events
       (id, project_id, event_type, event_name, user_id, anonymous_id, properties, context, timestamp)
       VALUES ($1, $2, 'track', $3, $4, $5, $6, $7, $8)`,
      [
        eventId,
        this.projectId,
        event,
        userId || null,
        anonymousId || null,
        properties,
        context,
        eventTimestamp
      ]
    )

    return { success: true, eventId }
  }

  // ---------------------------------------------------------------------------
  // Page View
  // ---------------------------------------------------------------------------

  async page(input: PageViewInput): Promise<{ success: boolean; eventId: string }> {
    const {
      path,
      title,
      referrer,
      userId,
      anonymousId,
      timestamp,
      context = {}
    } = input

    // Validate - must have userId or anonymousId
    if (!userId && !anonymousId) {
      throw new Error('Either userId or anonymousId is required')
    }

    const eventId = randomUUID()
    const eventTimestamp = timestamp ? new Date(timestamp) : new Date()

    // Store page view as event with standard properties
    const properties = {
      path,
      title: title || null,
      referrer: referrer || null
    }

    await this.pool.query(
      `INSERT INTO inhouse_analytics_events
       (id, project_id, event_type, event_name, user_id, anonymous_id, properties, context, timestamp)
       VALUES ($1, $2, 'page', $3, $4, $5, $6, $7, $8)`,
      [
        eventId,
        this.projectId,
        path, // Use path as event_name for page views
        userId || null,
        anonymousId || null,
        properties,
        context,
        eventTimestamp
      ]
    )

    return { success: true, eventId }
  }

  // ---------------------------------------------------------------------------
  // Identify User
  // ---------------------------------------------------------------------------

  async identify(input: IdentifyInput): Promise<{ success: boolean; eventId: string }> {
    const {
      userId,
      traits = {},
      anonymousId,
      timestamp
    } = input

    const eventId = randomUUID()
    const eventTimestamp = timestamp ? new Date(timestamp) : new Date()

    await this.pool.query(
      `INSERT INTO inhouse_analytics_events
       (id, project_id, event_type, event_name, user_id, anonymous_id, properties, context, timestamp)
       VALUES ($1, $2, 'identify', 'identify', $3, $4, $5, '{}'::jsonb, $6)`,
      [
        eventId,
        this.projectId,
        userId,
        anonymousId || null,
        traits,
        eventTimestamp
      ]
    )

    // Also update/insert user profile
    await this.pool.query(
      `INSERT INTO inhouse_analytics_users
       (id, project_id, user_id, anonymous_id, traits, first_seen, last_seen)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $5)
       ON CONFLICT (project_id, user_id) DO UPDATE
       SET traits = inhouse_analytics_users.traits || EXCLUDED.traits,
           anonymous_id = COALESCE(EXCLUDED.anonymous_id, inhouse_analytics_users.anonymous_id),
           last_seen = EXCLUDED.last_seen`,
      [
        this.projectId,
        userId,
        anonymousId || null,
        traits,
        eventTimestamp
      ]
    )

    return { success: true, eventId }
  }

  // ---------------------------------------------------------------------------
  // Query Events
  // ---------------------------------------------------------------------------

  async listEvents(options: ListEventsOptions = {}): Promise<ListEventsResult> {
    try {
      const {
        eventType,
        eventName,
        userId,
        anonymousId,
        startDate,
        endDate,
        limit = 50,
        offset = 0
      } = options

      const conditions: string[] = ['project_id = $1']
      const params: (string | number | Date)[] = [this.projectId]
      let paramIndex = 2

      if (eventType) {
        conditions.push(`event_type = $${paramIndex++}`)
        params.push(eventType)
      }

      if (eventName) {
        conditions.push(`event_name = $${paramIndex++}`)
        params.push(eventName)
      }

      if (userId) {
        conditions.push(`user_id = $${paramIndex++}`)
        params.push(userId)
      }

      if (anonymousId) {
        conditions.push(`anonymous_id = $${paramIndex++}`)
        params.push(anonymousId)
      }

      if (startDate) {
        const parsedStart = new Date(startDate)
        if (!isNaN(parsedStart.getTime())) {
          conditions.push(`timestamp >= $${paramIndex++}`)
          params.push(parsedStart)
        }
      }

      if (endDate) {
        const parsedEnd = new Date(endDate)
        if (!isNaN(parsedEnd.getTime())) {
          conditions.push(`timestamp <= $${paramIndex++}`)
          params.push(parsedEnd)
        }
      }

      const whereClause = conditions.join(' AND ')

      // Get events
      const eventsQuery = `
        SELECT id, project_id, event_type, event_name, user_id, anonymous_id,
               properties, context, timestamp, created_at
        FROM inhouse_analytics_events
        WHERE ${whereClause}
        ORDER BY timestamp DESC
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `
      params.push(limit + 1, offset) // Fetch one extra to check hasMore

      const eventsResult = await this.pool.query(eventsQuery, params)

      // Get total count (use params without LIMIT/OFFSET)
      const countQuery = `
        SELECT COUNT(*) FROM inhouse_analytics_events
        WHERE ${whereClause}
      `
      const countResult = await this.pool.query(countQuery, params.slice(0, -2))

      const hasMore = eventsResult.rows.length > limit
      const events = eventsResult.rows.slice(0, limit).map(row => ({
        id: row.id,
        projectId: row.project_id,
        eventType: row.event_type,
        eventName: row.event_name,
        userId: row.user_id,
        anonymousId: row.anonymous_id,
        properties: row.properties || {},
        context: row.context || {},
        // Handle both Date objects and string timestamps from DB
        timestamp: row.timestamp instanceof Date ? row.timestamp.toISOString() : String(row.timestamp),
        createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at)
      }))

      return {
        events,
        total: parseInt(countResult.rows[0]?.count || '0', 10),
        hasMore
      }
    } catch (error) {
      console.error('[Analytics] listEvents error:', error)
      return { events: [], total: 0, hasMore: false }
    }
  }

  // ---------------------------------------------------------------------------
  // Get Event Counts
  // ---------------------------------------------------------------------------

  async getCounts(options: GetCountsOptions = {}): Promise<EventCounts[]> {
    const {
      eventType,
      startDate,
      endDate,
      groupBy = 'event'
    } = options

    const conditions: string[] = ['project_id = $1']
    const params: (string | Date)[] = [this.projectId]
    let paramIndex = 2

    if (eventType) {
      conditions.push(`event_type = $${paramIndex++}`)
      params.push(eventType)
    }

    if (startDate) {
      const parsedStart = new Date(startDate)
      if (!isNaN(parsedStart.getTime())) {
        conditions.push(`timestamp >= $${paramIndex++}`)
        params.push(parsedStart)
      }
    }

    if (endDate) {
      const parsedEnd = new Date(endDate)
      if (!isNaN(parsedEnd.getTime())) {
        conditions.push(`timestamp <= $${paramIndex++}`)
        params.push(parsedEnd)
      }
    }

    const whereClause = conditions.join(' AND ')

    let groupColumn: string
    switch (groupBy) {
      case 'day':
        groupColumn = "DATE_TRUNC('day', timestamp)::text"
        break
      case 'hour':
        groupColumn = "DATE_TRUNC('hour', timestamp)::text"
        break
      default:
        groupColumn = 'event_name'
    }

    const query = `
      SELECT ${groupColumn} as event_name, COUNT(*) as count
      FROM inhouse_analytics_events
      WHERE ${whereClause}
      GROUP BY ${groupColumn}
      ORDER BY count DESC
      LIMIT 100
    `

    const result = await this.pool.query(query, params)

    return result.rows.map(row => ({
      eventName: row.event_name,
      count: parseInt(row.count, 10)
    }))
  }

  // ---------------------------------------------------------------------------
  // Get User Profile
  // ---------------------------------------------------------------------------

  async getUser(userId: string): Promise<{
    userId: string
    anonymousId: string | null
    traits: Record<string, unknown>
    firstSeen: string
    lastSeen: string
  } | null> {
    const result = await this.pool.query(
      `SELECT user_id, anonymous_id, traits, first_seen, last_seen
       FROM inhouse_analytics_users
       WHERE project_id = $1 AND user_id = $2`,
      [this.projectId, userId]
    )

    if (result.rows.length === 0) {
      return null
    }

    const row = result.rows[0]
    return {
      userId: row.user_id,
      anonymousId: row.anonymous_id,
      traits: row.traits || {},
      firstSeen: row.first_seen.toISOString(),
      lastSeen: row.last_seen.toISOString()
    }
  }
}

// =============================================================================
// Singleton Factory
// =============================================================================

const SERVICE_TTL_MS = 60 * 60 * 1000 // 1 hour
const MAX_CACHE_SIZE = 100
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

interface CacheEntry {
  service: InhouseAnalyticsService
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

export function getInhouseAnalyticsService(projectId: string): InhouseAnalyticsService {
  const cached = serviceCache.get(projectId)
  const now = Date.now()

  // Return cached if exists and not expired
  if (cached && now - cached.createdAt < SERVICE_TTL_MS) {
    return cached.service
  }

  // Create new service instance
  const service = new InhouseAnalyticsService(projectId)
  serviceCache.set(projectId, { service, createdAt: now })
  return service
}

// Run cleanup periodically (unref prevents blocking test exit)
const cleanupTimer = setInterval(cleanupServiceCache, CLEANUP_INTERVAL_MS)
cleanupTimer.unref?.()
