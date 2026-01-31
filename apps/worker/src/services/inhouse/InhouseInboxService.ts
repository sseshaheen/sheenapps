/**
 * In-House Inbox Service
 *
 * Inbound email operations for Easy Mode projects (Level 0 - SheenApps Inbox).
 * Handles receiving, storing, and managing inbound emails.
 *
 * Part of easy-mode-email-plan.md
 */

import { randomBytes, randomUUID } from 'crypto'
import { PoolClient } from 'pg'
import { getPool } from '../databaseWrapper'
import { logActivity } from './InhouseActivityLogger'

// =============================================================================
// CONSTANTS
// =============================================================================

// Reserved aliases that cannot be claimed by any project
const RESERVED_ALIASES = new Set([
  'support',
  'hello',
  'sales',
  'admin',
  'billing',
  'postmaster',
  'abuse',
  'noreply',
  'no-reply',
  'info',
  'contact',
  'help',
  'security',
  'privacy',
  'legal',
  'team',
  'root',
  'webmaster',
  'hostmaster',
  'mailer-daemon',
])

// Alias limits per tier (enforced in application, not DB)
const ALIAS_LIMITS: Record<string, number> = {
  free: 5,
  pro: 20,
  enterprise: 1000,
}

// =============================================================================
// TYPES
// =============================================================================

export interface InboxConfig {
  projectId: string
  inboxId: string
  displayName: string | null
  autoReplyEnabled: boolean
  autoReplyMessage: string | null
  forwardToEmail: string | null
  retentionDays: number
  createdAt: string
  updatedAt: string
}

export interface InboxMessage {
  id: string
  projectId: string
  fromEmail: string
  fromName: string | null
  toEmail: string
  replyTo: string | null
  subject: string | null
  textBody: string | null
  htmlBody: string | null
  snippet: string | null
  messageId: string | null
  inReplyTo: string | null
  references: string[] | null
  threadId: string | null
  tag: string | null
  providerId: string | null
  attachments: AttachmentMeta[]
  isRead: boolean
  isArchived: boolean
  isSpam: boolean
  processingStatus: 'pending' | 'processing' | 'processed' | 'failed'
  processedAt: string | null
  lastProcessingError: string | null
  receivedAt: string
  createdAt: string
}

export interface AttachmentMeta {
  filename: string
  mimeType: string
  sizeBytes: number
  contentId?: string
  storageKey?: string | null
}

export interface InboxThread {
  id: string
  projectId: string
  subject: string | null
  participantEmails: string[]
  messageCount: number
  unreadCount: number
  lastMessageAt: string | null
  lastMessageSnippet: string | null
  lastMessageFrom: string | null
  isArchived: boolean
  createdAt: string
  updatedAt: string
}

export interface InboxAlias {
  id: string
  projectId: string
  alias: string
  createdAt: string
}

export interface ReceiveMessageInput {
  providerId: string
  fromEmail: string
  fromName?: string
  toEmail: string
  replyTo?: string
  subject?: string
  textBody?: string
  htmlBody?: string
  snippet?: string
  messageId?: string
  inReplyTo?: string
  references?: string[]
  rawHeaders?: Record<string, string>
  tag?: string
  attachments?: AttachmentMeta[]
  /** Extensible metadata (spam flags, etc.) stored as JSONB */
  metadata?: Record<string, unknown>
  /** Whether this message was identified as spam */
  isSpam?: boolean
}

export interface ReceiveMessageResult {
  messageId: string
  threadId: string
  duplicate: boolean
  status: 'created' | 'duplicate'
}

export interface ListMessagesOptions {
  threadId?: string
  unreadOnly?: boolean
  limit?: number
  offset?: number
  cursor?: string
}

export interface ListMessagesResult {
  messages: InboxMessage[]
  nextCursor: string | null
}

export interface ListThreadsOptions {
  unreadOnly?: boolean
  limit?: number
  offset?: number
  cursor?: string
}

export interface ListThreadsResult {
  threads: InboxThread[]
  nextCursor: string | null
}

export interface UpdateConfigInput {
  displayName?: string
  autoReplyEnabled?: boolean
  autoReplyMessage?: string
  forwardToEmail?: string | null
  retentionDays?: number
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Generate a non-guessable inbox ID
 * Format: p_ + 6-10 lowercase alphanumeric chars
 */
function generateInboxId(): string {
  const bytes = randomBytes(6)
  const id = bytes.toString('base64url').toLowerCase().slice(0, 8)
  return `p_${id}`
}

/**
 * Normalize email subject by removing Re:, Fwd:, etc.
 */
function normalizeSubject(subject: string | null | undefined): string {
  if (!subject) return ''
  return subject
    .replace(/^(re|fwd|fw):\s*/gi, '')
    .replace(/^(re|fwd|fw)\[\d+\]:\s*/gi, '')
    .trim()
}

/**
 * Extract snippet from text body (first ~200 chars)
 */
function extractSnippet(textBody: string | null | undefined, maxLength = 200): string | null {
  if (!textBody) return null
  const cleaned = textBody
    .replace(/\r\n/g, '\n')
    .replace(/\n+/g, ' ')
    .trim()
  if (cleaned.length <= maxLength) return cleaned
  return cleaned.slice(0, maxLength).trim() + '...'
}

/**
 * Extract tag from +tag in email address
 * e.g., p_7h2k9x+support@inbox.sheenapps.com -> "support"
 */
function extractTag(email: string): string | null {
  const match = email.match(/\+([^@]+)@/)
  return match?.[1] ?? null
}

/**
 * Extract inbox ID or alias from SheenApps inbox recipient address
 * e.g., p_7h2k9x@inbox.sheenapps.com -> "p_7h2k9x"
 * e.g., support@inbox.sheenapps.com -> "support"
 */
function extractInboxIdOrAlias(email: string): string | null {
  const match = email.match(/^([^+@]+)(?:\+[^@]+)?@inbox\.sheenapps\.com$/i)
  return match?.[1]?.toLowerCase() ?? null
}

/**
 * Extract local part and domain from any email address
 * e.g., support@mail.example.com -> { localPart: "support", domain: "mail.example.com" }
 */
function extractEmailParts(email: string): { localPart: string; domain: string } | null {
  const match = email.match(/^([^+@]+)(?:\+[^@]+)?@(.+)$/i)
  const localPart = match?.[1]
  const domain = match?.[2]
  if (!localPart || !domain) return null
  return {
    localPart: localPart.toLowerCase(),
    domain: domain.toLowerCase(),
  }
}

// =============================================================================
// SERVICE
// =============================================================================

export class InhouseInboxService {
  private projectId: string

  constructor(projectId: string) {
    this.projectId = projectId
  }

  // ===========================================================================
  // CONFIG
  // ===========================================================================

  /**
   * Get inbox configuration for this project
   */
  async getConfig(): Promise<InboxConfig | null> {
    try {
      const { rows } = await getPool().query(
        `SELECT * FROM inhouse_inbox_config WHERE project_id = $1`,
        [this.projectId]
      )

      if (rows.length === 0) return null
      return this.rowToConfig(rows[0])
    } catch (error) {
      console.error('[Inbox] Error getting config:', error)
      return null
    }
  }

  /**
   * Create inbox configuration (called when project is created)
   */
  async createConfig(displayName?: string): Promise<InboxConfig> {
    // Generate unique inbox ID with retry for collisions
    for (let attempt = 0; attempt < 5; attempt++) {
      const inboxId = generateInboxId()
      try {
        const { rows } = await getPool().query(
          `INSERT INTO inhouse_inbox_config (project_id, inbox_id, display_name)
           VALUES ($1, $2, $3)
           RETURNING *`,
          [this.projectId, inboxId, displayName || null]
        )

        logActivity({
          projectId: this.projectId,
          service: 'inbox',
          action: 'config_created',
          status: 'success',
          resourceType: 'inbox_config',
          resourceId: inboxId,
        })

        return this.rowToConfig(rows[0])
      } catch (error: unknown) {
        // Check for unique violation on inbox_id
        if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
          continue // Retry with new ID
        }
        throw error
      }
    }
    throw new Error('Failed to generate unique inbox ID after 5 attempts')
  }

  /**
   * Update inbox configuration
   */
  async updateConfig(input: UpdateConfigInput): Promise<InboxConfig> {
    const updates: string[] = []
    const values: (string | number | boolean | null)[] = []
    let paramIndex = 1

    if (input.displayName !== undefined) {
      updates.push(`display_name = $${++paramIndex}`)
      values.push(input.displayName)
    }
    if (input.autoReplyEnabled !== undefined) {
      updates.push(`auto_reply_enabled = $${++paramIndex}`)
      values.push(input.autoReplyEnabled)
    }
    if (input.autoReplyMessage !== undefined) {
      updates.push(`auto_reply_message = $${++paramIndex}`)
      values.push(input.autoReplyMessage)
    }
    if (input.forwardToEmail !== undefined) {
      updates.push(`forward_to_email = $${++paramIndex}`)
      values.push(input.forwardToEmail)
    }
    if (input.retentionDays !== undefined) {
      updates.push(`retention_days = $${++paramIndex}`)
      values.push(input.retentionDays)
    }

    if (updates.length === 0) {
      const existing = await this.getConfig()
      if (!existing) throw new Error('Inbox config not found')
      return existing
    }

    updates.push('updated_at = NOW()')

    const { rows } = await getPool().query(
      `UPDATE inhouse_inbox_config
       SET ${updates.join(', ')}
       WHERE project_id = $1
       RETURNING *`,
      [this.projectId, ...values]
    )

    if (rows.length === 0) {
      throw new Error('Inbox config not found')
    }

    logActivity({
      projectId: this.projectId,
      service: 'inbox',
      action: 'config_updated',
      status: 'success',
      metadata: { fields: Object.keys(input) },
    })

    return this.rowToConfig(rows[0])
  }

  // ===========================================================================
  // MESSAGES
  // ===========================================================================

  /**
   * Receive and store an inbound message
   * Idempotent: returns existing message if duplicate (by provider_id + to_email)
   */
  async receiveMessage(input: ReceiveMessageInput): Promise<ReceiveMessageResult> {
    const pool = getPool()
    const client = await pool.connect()

    try {
      await client.query('BEGIN')

      // Check for duplicate (idempotent)
      const { rows: existing } = await client.query(
        `SELECT id, thread_id FROM inhouse_inbox_messages
         WHERE provider_id = $1 AND to_email = $2
         LIMIT 1`,
        [input.providerId, input.toEmail]
      )

      if (existing.length > 0) {
        await client.query('COMMIT')
        return {
          messageId: existing[0].id,
          threadId: existing[0].thread_id,
          duplicate: true,
          status: 'duplicate',
        }
      }

      // Extract tag from recipient
      const tag = input.tag || extractTag(input.toEmail)

      // Generate snippet (use provided or generate from text body)
      const snippet = input.snippet || extractSnippet(input.textBody)

      // Find or create thread
      const threadId = await this.assignThread(client, {
        messageId: input.messageId,
        inReplyTo: input.inReplyTo,
        references: input.references,
        subject: input.subject,
        from: input.fromEmail,
      })

      // Insert message
      const messageId = randomUUID()
      await client.query(
        `INSERT INTO inhouse_inbox_messages (
          id, project_id, from_email, from_name, to_email, reply_to,
          subject, text_body, html_body, snippet,
          message_id, in_reply_to, "references", thread_id,
          tag, provider_id, raw_headers, attachments,
          metadata, is_spam, processing_status, processed_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10,
          $11, $12, $13, $14,
          $15, $16, $17, $18,
          $19, $20, 'processed', NOW()
        )`,
        [
          messageId,
          this.projectId,
          input.fromEmail,
          input.fromName || null,
          input.toEmail,
          input.replyTo || input.rawHeaders?.['reply-to'] || null,
          input.subject || null,
          input.textBody || null,
          input.htmlBody || null,
          snippet,
          input.messageId || null,
          input.inReplyTo || null,
          input.references || null,
          threadId,
          tag,
          input.providerId,
          input.rawHeaders ? JSON.stringify(input.rawHeaders) : null,
          JSON.stringify(input.attachments || []),
          JSON.stringify(input.metadata || {}),
          input.isSpam ?? false,
        ]
      )

      // Update thread counters (transactional)
      const fromEmailNorm = input.fromEmail.trim().toLowerCase()
      await client.query(
        `UPDATE inhouse_inbox_threads
         SET message_count = message_count + 1,
             unread_count = unread_count + 1,
             last_message_at = NOW(),
             last_message_snippet = $2,
             last_message_from = $3,
             participant_emails = CASE
               WHEN $3 = ANY(participant_emails) THEN participant_emails
               ELSE array_append(participant_emails, $3)
             END,
             updated_at = NOW()
         WHERE id = $1`,
        [threadId, snippet, fromEmailNorm]
      )

      await client.query('COMMIT')

      logActivity({
        projectId: this.projectId,
        service: 'inbox',
        action: 'message_received',
        status: 'success',
        resourceType: 'message',
        resourceId: messageId,
        metadata: { from: input.fromEmail, subject: input.subject, threadId },
      })

      return { messageId, threadId, duplicate: false, status: 'created' }
    } catch (error) {
      await client.query('ROLLBACK')
      console.error('[Inbox] Error receiving message:', error)
      throw error
    } finally {
      client.release()
    }
  }

  /**
   * Assign a message to a thread (find existing or create new)
   */
  private async assignThread(
    client: PoolClient,
    input: {
      messageId?: string | null
      inReplyTo?: string | null
      references?: string[] | null
      subject?: string | null
      from: string
    }
  ): Promise<string> {
    // 1. Check In-Reply-To header
    if (input.inReplyTo) {
      const { rows } = await client.query(
        `SELECT thread_id FROM inhouse_inbox_messages
         WHERE project_id = $1 AND message_id = $2 AND thread_id IS NOT NULL
         LIMIT 1`,
        [this.projectId, input.inReplyTo]
      )
      if (rows.length > 0 && rows[0].thread_id) {
        return rows[0].thread_id
      }
    }

    // 2. Check References header
    if (input.references && input.references.length > 0) {
      const { rows } = await client.query(
        `SELECT thread_id FROM inhouse_inbox_messages
         WHERE project_id = $1 AND message_id = ANY($2) AND thread_id IS NOT NULL
         LIMIT 1`,
        [this.projectId, input.references]
      )
      if (rows.length > 0 && rows[0].thread_id) {
        return rows[0].thread_id
      }
    }

    // 3. Check for existing thread by subject + participant (within 30-day window)
    const normalizedSubject = normalizeSubject(input.subject)
    const fromNorm = input.from.trim().toLowerCase()
    if (normalizedSubject) {
      const { rows } = await client.query(
        `SELECT id FROM inhouse_inbox_threads
         WHERE project_id = $1
           AND subject = $2
           AND $3 = ANY(participant_emails)
           AND last_message_at > NOW() - INTERVAL '30 days'
         ORDER BY last_message_at DESC
         LIMIT 1`,
        [this.projectId, normalizedSubject, fromNorm]
      )
      if (rows.length > 0) {
        return rows[0].id
      }
    }

    // 4. Create new thread
    const threadId = randomUUID()
    await client.query(
      `INSERT INTO inhouse_inbox_threads (id, project_id, subject, participant_emails, last_message_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [threadId, this.projectId, normalizedSubject || null, [fromNorm]]
    )

    return threadId
  }

  /**
   * List messages with pagination
   */
  async listMessages(options: ListMessagesOptions = {}): Promise<ListMessagesResult> {
    const limit = Math.min(options.limit || 20, 100)

    let query = `
      SELECT * FROM inhouse_inbox_messages
      WHERE project_id = $1 AND is_archived = FALSE
    `
    const params: (string | number | boolean)[] = [this.projectId]
    let paramIndex = 1

    if (options.threadId) {
      query += ` AND thread_id = $${++paramIndex}`
      params.push(options.threadId)
    }

    if (options.unreadOnly) {
      query += ` AND is_read = FALSE`
    }

    if (options.cursor) {
      // Cursor is the received_at timestamp of the last item
      query += ` AND received_at < $${++paramIndex}`
      params.push(options.cursor)
    }

    query += ` ORDER BY received_at DESC LIMIT $${++paramIndex}`
    params.push(limit + 1)

    const { rows } = await getPool().query(query, params)

    const hasMore = rows.length > limit
    const messages = rows.slice(0, limit).map((row: Record<string, unknown>) => this.rowToMessage(row))
    const lastMessage = messages[messages.length - 1]
    const nextCursor = hasMore && lastMessage
      ? lastMessage.receivedAt
      : null

    return { messages, nextCursor }
  }

  /**
   * Get a single message by ID
   */
  async getMessage(messageId: string): Promise<InboxMessage | null> {
    const { rows } = await getPool().query(
      `SELECT * FROM inhouse_inbox_messages
       WHERE id = $1 AND project_id = $2`,
      [messageId, this.projectId]
    )

    if (rows.length === 0) return null
    return this.rowToMessage(rows[0])
  }

  /**
   * Mark a message as read/unread
   * @returns true if message was found and updated, false if not found
   */
  async markRead(messageId: string, isRead: boolean): Promise<boolean> {
    const pool = getPool()
    const client = await pool.connect()

    try {
      await client.query('BEGIN')

      // Get current state
      const { rows } = await client.query(
        `SELECT is_read, thread_id FROM inhouse_inbox_messages
         WHERE id = $1 AND project_id = $2`,
        [messageId, this.projectId]
      )

      if (rows.length === 0) {
        await client.query('ROLLBACK')
        return false
      }

      const currentIsRead = rows[0].is_read
      const threadId = rows[0].thread_id

      if (currentIsRead === isRead) {
        await client.query('COMMIT')
        return true // No change needed, but message exists
      }

      // Update message
      await client.query(
        `UPDATE inhouse_inbox_messages SET is_read = $3
         WHERE id = $1 AND project_id = $2`,
        [messageId, this.projectId, isRead]
      )

      // Update thread unread count
      if (threadId) {
        const delta = isRead ? -1 : 1
        await client.query(
          `UPDATE inhouse_inbox_threads
           SET unread_count = GREATEST(0, unread_count + $2), updated_at = NOW()
           WHERE id = $1`,
          [threadId, delta]
        )
      }

      await client.query('COMMIT')
      return true
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  /**
   * Archive or unarchive a message
   * @returns true if message was found and updated, false if not found
   */
  async archiveMessage(messageId: string, isArchived: boolean = true): Promise<boolean> {
    const result = await getPool().query(
      `UPDATE inhouse_inbox_messages SET is_archived = $3
       WHERE id = $1 AND project_id = $2`,
      [messageId, this.projectId, isArchived]
    )
    return (result.rowCount ?? 0) > 0
  }

  /**
   * Delete a message permanently
   * @returns true if message was found and deleted, false if not found
   */
  async deleteMessage(messageId: string): Promise<boolean> {
    const result = await getPool().query(
      `DELETE FROM inhouse_inbox_messages
       WHERE id = $1 AND project_id = $2`,
      [messageId, this.projectId]
    )
    return (result.rowCount ?? 0) > 0
  }

  // ===========================================================================
  // THREADS
  // ===========================================================================

  /**
   * List threads with pagination
   */
  async listThreads(options: ListThreadsOptions = {}): Promise<ListThreadsResult> {
    const limit = Math.min(options.limit || 20, 100)

    let query = `
      SELECT * FROM inhouse_inbox_threads
      WHERE project_id = $1 AND is_archived = FALSE
    `
    const params: (string | number | boolean)[] = [this.projectId]
    let paramIndex = 1

    if (options.unreadOnly) {
      query += ` AND unread_count > 0`
    }

    if (options.cursor) {
      query += ` AND last_message_at < $${++paramIndex}`
      params.push(options.cursor)
    }

    query += ` ORDER BY last_message_at DESC NULLS LAST LIMIT $${++paramIndex}`
    params.push(limit + 1)

    const { rows } = await getPool().query(query, params)

    const hasMore = rows.length > limit
    const threads = rows.slice(0, limit).map((row: Record<string, unknown>) => this.rowToThread(row))
    const lastThread = threads[threads.length - 1]
    const nextCursor = hasMore && lastThread?.lastMessageAt
      ? lastThread.lastMessageAt
      : null

    return { threads, nextCursor }
  }

  /**
   * Get a thread with its messages
   */
  async getThread(threadId: string): Promise<{ thread: InboxThread; messages: InboxMessage[] } | null> {
    const { rows: threadRows } = await getPool().query(
      `SELECT * FROM inhouse_inbox_threads
       WHERE id = $1 AND project_id = $2`,
      [threadId, this.projectId]
    )

    if (threadRows.length === 0) return null

    const { rows: messageRows } = await getPool().query(
      `SELECT * FROM inhouse_inbox_messages
       WHERE thread_id = $1 AND project_id = $2
       ORDER BY received_at ASC`,
      [threadId, this.projectId]
    )

    return {
      thread: this.rowToThread(threadRows[0]),
      messages: messageRows.map((row: Record<string, unknown>) => this.rowToMessage(row)),
    }
  }

  /**
   * Archive a thread
   */
  async archiveThread(threadId: string): Promise<void> {
    await getPool().query(
      `UPDATE inhouse_inbox_threads SET is_archived = TRUE, updated_at = NOW()
       WHERE id = $1 AND project_id = $2`,
      [threadId, this.projectId]
    )
  }

  // ===========================================================================
  // ALIASES
  // ===========================================================================

  /**
   * Create an alias for this project's inbox
   */
  async createAlias(alias: string, tier: string = 'free'): Promise<InboxAlias> {
    const normalizedAlias = alias.toLowerCase()

    // Check reserved list
    if (RESERVED_ALIASES.has(normalizedAlias)) {
      throw { code: 'RESERVED_ALIAS', message: `Alias "${alias}" is reserved` }
    }

    // Check tier limits
    const { rows: countRows } = await getPool().query(
      `SELECT COUNT(*) FROM inhouse_inbox_aliases WHERE project_id = $1`,
      [this.projectId]
    )
    const currentCount = parseInt(countRows[0].count, 10)
    const limit = ALIAS_LIMITS[tier] ?? ALIAS_LIMITS.free ?? 5

    if (currentCount >= limit) {
      throw { code: 'ALIAS_LIMIT_EXCEEDED', message: `Alias limit (${limit}) exceeded for ${tier} tier` }
    }

    // Check premium alias (short aliases)
    if (normalizedAlias.length < 5 && tier === 'free') {
      throw { code: 'PREMIUM_ALIAS', message: 'Short aliases (<5 chars) require a paid plan' }
    }

    try {
      const { rows } = await getPool().query(
        `INSERT INTO inhouse_inbox_aliases (project_id, alias)
         VALUES ($1, $2)
         RETURNING *`,
        [this.projectId, normalizedAlias]
      )

      logActivity({
        projectId: this.projectId,
        service: 'inbox',
        action: 'alias_created',
        status: 'success',
        resourceType: 'alias',
        resourceId: normalizedAlias,
      })

      return this.rowToAlias(rows[0])
    } catch (error: unknown) {
      // Check for unique violation (global or project-level)
      if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
        throw { code: 'ALIAS_TAKEN', message: `Alias "${alias}" is already taken` }
      }
      throw error
    }
  }

  /**
   * Delete an alias
   * @returns true if alias was found and deleted, false if not found
   */
  async deleteAlias(aliasId: string): Promise<boolean> {
    const { rowCount } = await getPool().query(
      `DELETE FROM inhouse_inbox_aliases
       WHERE id = $1 AND project_id = $2`,
      [aliasId, this.projectId]
    )

    if ((rowCount ?? 0) === 0) {
      return false
    }

    logActivity({
      projectId: this.projectId,
      service: 'inbox',
      action: 'alias_deleted',
      status: 'success',
      resourceType: 'alias',
      resourceId: aliasId,
    })

    return true
  }

  /**
   * List aliases for this project
   */
  async listAliases(): Promise<InboxAlias[]> {
    const { rows } = await getPool().query(
      `SELECT * FROM inhouse_inbox_aliases
       WHERE project_id = $1
       ORDER BY created_at ASC`,
      [this.projectId]
    )

    return rows.map((row: Record<string, unknown>) => this.rowToAlias(row))
  }

  // ===========================================================================
  // ROW CONVERTERS
  // ===========================================================================

  private rowToConfig(row: Record<string, unknown>): InboxConfig {
    return {
      projectId: row.project_id as string,
      inboxId: row.inbox_id as string,
      displayName: row.display_name as string | null,
      autoReplyEnabled: row.auto_reply_enabled as boolean,
      autoReplyMessage: row.auto_reply_message as string | null,
      forwardToEmail: row.forward_to_email as string | null,
      retentionDays: row.retention_days as number,
      createdAt: (row.created_at as Date).toISOString(),
      updatedAt: (row.updated_at as Date).toISOString(),
    }
  }

  private rowToMessage(row: Record<string, unknown>): InboxMessage {
    let attachments: AttachmentMeta[] = []
    if (row.attachments) {
      try {
        attachments = typeof row.attachments === 'string'
          ? JSON.parse(row.attachments)
          : row.attachments as AttachmentMeta[]
      } catch {
        attachments = []
      }
    }

    return {
      id: row.id as string,
      projectId: row.project_id as string,
      fromEmail: row.from_email as string,
      fromName: row.from_name as string | null,
      toEmail: row.to_email as string,
      replyTo: row.reply_to as string | null,
      subject: row.subject as string | null,
      textBody: row.text_body as string | null,
      htmlBody: row.html_body as string | null,
      snippet: row.snippet as string | null,
      messageId: row.message_id as string | null,
      inReplyTo: row.in_reply_to as string | null,
      references: row.references as string[] | null,
      threadId: row.thread_id as string | null,
      tag: row.tag as string | null,
      providerId: row.provider_id as string | null,
      attachments,
      isRead: row.is_read as boolean,
      isArchived: row.is_archived as boolean,
      isSpam: row.is_spam as boolean,
      processingStatus: row.processing_status as InboxMessage['processingStatus'],
      processedAt: row.processed_at ? (row.processed_at as Date).toISOString() : null,
      lastProcessingError: row.last_processing_error as string | null,
      receivedAt: (row.received_at as Date).toISOString(),
      createdAt: (row.created_at as Date).toISOString(),
    }
  }

  private rowToThread(row: Record<string, unknown>): InboxThread {
    return {
      id: row.id as string,
      projectId: row.project_id as string,
      subject: row.subject as string | null,
      participantEmails: row.participant_emails as string[] || [],
      messageCount: row.message_count as number,
      unreadCount: row.unread_count as number,
      lastMessageAt: row.last_message_at ? (row.last_message_at as Date).toISOString() : null,
      lastMessageSnippet: row.last_message_snippet as string | null,
      lastMessageFrom: row.last_message_from as string | null,
      isArchived: row.is_archived as boolean,
      createdAt: (row.created_at as Date).toISOString(),
      updatedAt: (row.updated_at as Date).toISOString(),
    }
  }

  private rowToAlias(row: Record<string, unknown>): InboxAlias {
    return {
      id: row.id as string,
      projectId: row.project_id as string,
      alias: row.alias as string,
      createdAt: (row.created_at as Date).toISOString(),
    }
  }
}

// =============================================================================
// STATIC HELPERS (for webhook routing)
// =============================================================================

/**
 * Result of detailed recipient resolution with failure diagnostics
 */
export interface RecipientResolution {
  projectId: string | null
  source: 'inbox_id' | 'alias' | 'custom_domain' | null
  reason: 'resolved' | 'inbox_id_not_found' | 'alias_not_found' | 'domain_not_registered' | 'domain_not_verified' | 'mx_not_verified' | 'invalid_email_format'
  domain?: string
}

/**
 * Resolve a recipient address to a project ID with detailed diagnostics.
 * Used by webhook handler to route inbound emails and log failure reasons.
 *
 * Supports:
 * 1. SheenApps inbox addresses: p_xxx@inbox.sheenapps.com
 * 2. SheenApps inbox aliases: support@inbox.sheenapps.com
 * 3. Custom domain addresses: support@mail.example.com (when domain is verified)
 */
export async function resolveProjectFromRecipientDetailed(recipient: string): Promise<RecipientResolution> {
  const pool = getPool()

  // First, try to match SheenApps inbox pattern
  const inboxIdOrAlias = extractInboxIdOrAlias(recipient)

  if (inboxIdOrAlias) {
    // Check if it's a direct inbox ID (p_xxx)
    if (inboxIdOrAlias.startsWith('p_')) {
      const { rows } = await pool.query(
        `SELECT project_id FROM inhouse_inbox_config WHERE inbox_id = $1`,
        [inboxIdOrAlias]
      )
      if (rows.length > 0) {
        return { projectId: rows[0].project_id, source: 'inbox_id', reason: 'resolved' }
      }
      return { projectId: null, source: null, reason: 'inbox_id_not_found' }
    }

    // Otherwise, check SheenApps inbox aliases
    const { rows } = await pool.query(
      `SELECT project_id FROM inhouse_inbox_aliases WHERE alias = $1`,
      [inboxIdOrAlias]
    )
    if (rows.length > 0) {
      return { projectId: rows[0].project_id, source: 'alias', reason: 'resolved' }
    }
    return { projectId: null, source: null, reason: 'alias_not_found' }
  }

  // Try to match custom domain email addresses
  const emailParts = extractEmailParts(recipient)
  if (!emailParts) {
    return { projectId: null, source: null, reason: 'invalid_email_format' }
  }

  // Look up domain in inhouse_email_domains
  const { rows: domainRows } = await pool.query(
    `SELECT project_id, status, dns_status FROM inhouse_email_domains
     WHERE domain = $1`,
    [emailParts.domain]
  )

  if (domainRows.length === 0) {
    return { projectId: null, source: null, reason: 'domain_not_registered', domain: emailParts.domain }
  }

  const domainRow = domainRows[0]

  if (domainRow.status !== 'verified') {
    return { projectId: null, source: null, reason: 'domain_not_verified', domain: emailParts.domain }
  }

  const mxVerified = domainRow.dns_status?.mx?.verified === true
  if (!mxVerified) {
    return { projectId: null, source: null, reason: 'mx_not_verified', domain: emailParts.domain }
  }

  return { projectId: domainRow.project_id, source: 'custom_domain', reason: 'resolved', domain: emailParts.domain }
}

/**
 * Resolve a recipient address to a project ID
 * Backward-compatible wrapper around resolveProjectFromRecipientDetailed
 */
export async function resolveProjectFromRecipient(recipient: string): Promise<string | null> {
  const resolution = await resolveProjectFromRecipientDetailed(recipient)
  return resolution.projectId
}

// =============================================================================
// SINGLETON FACTORY
// =============================================================================

const SERVICE_TTL_MS = 60 * 60 * 1000 // 1 hour
const MAX_CACHE_SIZE = 100
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

interface CacheEntry {
  service: InhouseInboxService
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

export function getInhouseInboxService(projectId: string): InhouseInboxService {
  const cached = serviceCache.get(projectId)
  const now = Date.now()

  // Return cached if exists and not expired
  if (cached && now - cached.createdAt < SERVICE_TTL_MS) {
    return cached.service
  }

  // Create new service instance
  const service = new InhouseInboxService(projectId)
  serviceCache.set(projectId, { service, createdAt: now })
  return service
}

// Run cleanup periodically
setInterval(cleanupServiceCache, CLEANUP_INTERVAL_MS)
