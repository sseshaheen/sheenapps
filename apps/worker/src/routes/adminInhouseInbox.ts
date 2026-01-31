/**
 * Admin In-House Inbox Routes
 *
 * Endpoints for monitoring inbox messages and threads across
 * In-House Mode projects.
 */

import { FastifyInstance } from 'fastify'
import { requireAdminAuth, AdminRequest } from '../middleware/adminAuthentication'
import { parseLimitOffset, requirePool } from './admin/_utils'
import { auditAdminAction } from './admin/_audit'
import { getInhouseInboxService } from '../services/inhouse/InhouseInboxService'
import { getInhouseStorageService } from '../services/inhouse/InhouseStorageService'
import { withStatementTimeout } from '../utils/dbTimeout'

// =============================================================================
// TYPES
// =============================================================================

interface MessagesQuery {
  projectId?: string
  unreadOnly?: string
  from?: string
  limit?: string
  offset?: string
}

interface ThreadsQuery {
  projectId?: string
  unreadOnly?: string
  limit?: string
  offset?: string
}

// =============================================================================
// ROUTES
// =============================================================================

export default async function adminInhouseInboxRoutes(fastify: FastifyInstance) {
  const readMiddleware = requireAdminAuth({ permissions: ['inhouse.read'] })
  const writeMiddleware = requireAdminAuth({ permissions: ['inhouse.write'] })

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/inbox/config
  // -------------------------------------------------------------------------
  fastify.get<{
    Querystring: { projectId?: string }
  }>('/v1/admin/inhouse/inbox/config', { preHandler: readMiddleware as never }, async (request, reply) => {
    const { projectId } = request.query

    if (!projectId) {
      return reply.status(400).send({ success: false, error: 'projectId is required' })
    }

    try {
      const service = getInhouseInboxService(projectId)
      const config = await service.getConfig()
      const aliases = await service.listAliases()

      return reply.send({
        success: true,
        data: { config, aliases },
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to get inbox config')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get inbox config',
      })
    }
  })

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/inbox/messages
  // -------------------------------------------------------------------------
  fastify.get<{
    Querystring: MessagesQuery
  }>('/v1/admin/inhouse/inbox/messages', { preHandler: readMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    try {
      const { projectId, unreadOnly, from, limit: limitStr, offset: offsetStr } = request.query
      const { limit, offset } = parseLimitOffset(limitStr, offsetStr)

      if (!projectId) {
        return reply.status(400).send({ success: false, error: 'projectId is required' })
      }

      const db = requirePool()

      const conditions: string[] = ['m.project_id = $1']
      const params: (string | number | boolean)[] = [projectId]
      let paramIndex = 2

      if (unreadOnly === 'true') {
        conditions.push('m.is_read = false')
      }

      if (from) {
        conditions.push(`m.from_email ILIKE $${paramIndex}`)
        params.push(`%${from}%`)
        paramIndex++
      }

      const whereClause = `WHERE ${conditions.join(' AND ')}`

      const { total, rows } = await withStatementTimeout(db, '5s', async (client) => {
        const countResult = await client.query(
          `SELECT COUNT(*) as total FROM inhouse_inbox_messages m ${whereClause}`,
          params
        )

        const listResult = await client.query(
          `SELECT
             m.id, m.project_id, m.from_email, m.from_name, m.to_email,
             m.subject, m.snippet, m.thread_id, m.tag,
             m.attachments, m.is_read, m.is_archived, m.is_spam,
             m.received_at, m.created_at
           FROM inhouse_inbox_messages m
           ${whereClause}
           ORDER BY m.received_at DESC
           LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
          [...params, limit, offset]
        )

        return {
          total: parseInt(countResult.rows[0]?.total || '0', 10),
          rows: listResult.rows,
        }
      })

      auditAdminAction({
        adminId: adminRequest.adminClaims.sub,
        action: 'inbox_messages_list',
        projectId,
        resourceType: 'inbox_message',
        metadata: { unreadOnly, from, limit, offset, resultCount: rows.length },
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.send({
        success: true,
        data: { messages: rows, total, hasMore: offset + rows.length < total },
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to list inbox messages')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list inbox messages',
      })
    }
  })

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/inbox/messages/:messageId
  // -------------------------------------------------------------------------
  fastify.get<{
    Params: { messageId: string }
    Querystring: { projectId?: string }
  }>('/v1/admin/inhouse/inbox/messages/:messageId', { preHandler: readMiddleware as never }, async (request, reply) => {
    try {
      const { messageId } = request.params
      const { projectId } = request.query

      if (!projectId) {
        return reply.status(400).send({ success: false, error: 'projectId is required' })
      }

      const service = getInhouseInboxService(projectId)
      const message = await service.getMessage(messageId)

      if (!message) {
        return reply.status(404).send({ success: false, error: 'Message not found' })
      }

      return reply.send({ success: true, data: message })
    } catch (error) {
      request.log.error({ error }, 'Failed to get inbox message')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get inbox message',
      })
    }
  })

  // -------------------------------------------------------------------------
  // PATCH /v1/admin/inhouse/inbox/messages/:messageId
  // -------------------------------------------------------------------------
  fastify.patch<{
    Params: { messageId: string }
    Body: { projectId: string; isRead?: boolean; isArchived?: boolean }
  }>('/v1/admin/inhouse/inbox/messages/:messageId', { preHandler: writeMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    const { messageId } = request.params
    const { projectId, isRead, isArchived } = request.body

    if (!projectId) {
      return reply.status(400).send({ success: false, error: 'projectId is required' })
    }

    if (isRead === undefined && isArchived === undefined) {
      return reply.status(400).send({ success: false, error: 'At least one of isRead or isArchived is required' })
    }

    try {
      const service = getInhouseInboxService(projectId)

      if (isRead !== undefined) {
        await service.markRead(messageId, isRead)
      }
      if (isArchived !== undefined) {
        await service.archiveMessage(messageId, isArchived)
      }

      auditAdminAction({
        adminId: adminRequest.adminClaims.sub,
        action: 'inbox_message_update',
        projectId,
        resourceType: 'inbox_message',
        resourceId: messageId,
        metadata: { isRead, isArchived },
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.send({ success: true })
    } catch (error) {
      request.log.error({ error }, 'Failed to update inbox message')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update inbox message',
      })
    }
  })

  // -------------------------------------------------------------------------
  // DELETE /v1/admin/inhouse/inbox/messages/:messageId
  // -------------------------------------------------------------------------
  fastify.delete<{
    Params: { messageId: string }
    Body: { projectId: string; reason?: string }
  }>('/v1/admin/inhouse/inbox/messages/:messageId', { preHandler: writeMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    const { messageId } = request.params
    const { projectId, reason } = request.body || {}

    if (!projectId) {
      return reply.status(400).send({ success: false, error: 'projectId is required' })
    }

    try {
      const service = getInhouseInboxService(projectId)
      const deleted = await service.deleteMessage(messageId)

      if (!deleted) {
        return reply.status(404).send({ success: false, error: 'Message not found' })
      }

      auditAdminAction({
        adminId: adminRequest.adminClaims.sub,
        action: 'inbox_message_delete',
        projectId,
        resourceType: 'inbox_message',
        resourceId: messageId,
        reason: reason || null,
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.status(204).send()
    } catch (error) {
      request.log.error({ error }, 'Failed to delete inbox message')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete inbox message',
      })
    }
  })

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/inbox/threads
  // -------------------------------------------------------------------------
  fastify.get<{
    Querystring: ThreadsQuery
  }>('/v1/admin/inhouse/inbox/threads', { preHandler: readMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    try {
      const { projectId, unreadOnly, limit: limitStr, offset: offsetStr } = request.query
      const { limit, offset } = parseLimitOffset(limitStr, offsetStr)

      if (!projectId) {
        return reply.status(400).send({ success: false, error: 'projectId is required' })
      }

      const db = requirePool()

      const conditions: string[] = ['t.project_id = $1']
      const params: (string | number)[] = [projectId]
      let paramIndex = 2

      if (unreadOnly === 'true') {
        conditions.push('t.unread_count > 0')
      }

      const whereClause = `WHERE ${conditions.join(' AND ')}`

      const { total, rows } = await withStatementTimeout(db, '5s', async (client) => {
        const countResult = await client.query(
          `SELECT COUNT(*) as total FROM inhouse_inbox_threads t ${whereClause}`,
          params
        )

        const listResult = await client.query(
          `SELECT t.*
           FROM inhouse_inbox_threads t
           ${whereClause}
           ORDER BY t.last_message_at DESC NULLS LAST
           LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
          [...params, limit, offset]
        )

        return {
          total: parseInt(countResult.rows[0]?.total || '0', 10),
          rows: listResult.rows,
        }
      })

      auditAdminAction({
        adminId: adminRequest.adminClaims.sub,
        action: 'inbox_threads_list',
        projectId,
        resourceType: 'inbox_thread',
        metadata: { unreadOnly, limit, offset, resultCount: rows.length },
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.send({
        success: true,
        data: { threads: rows, total, hasMore: offset + rows.length < total },
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to list inbox threads')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list inbox threads',
      })
    }
  })

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/inbox/threads/:threadId
  // -------------------------------------------------------------------------
  fastify.get<{
    Params: { threadId: string }
    Querystring: { projectId?: string }
  }>('/v1/admin/inhouse/inbox/threads/:threadId', { preHandler: readMiddleware as never }, async (request, reply) => {
    const { threadId } = request.params
    const { projectId } = request.query

    if (!projectId) {
      return reply.status(400).send({ success: false, error: 'projectId is required' })
    }

    try {
      const service = getInhouseInboxService(projectId)
      const result = await service.getThread(threadId)

      if (!result) {
        return reply.status(404).send({ success: false, error: 'Thread not found' })
      }

      return reply.send({ success: true, data: result })
    } catch (error) {
      request.log.error({ error }, 'Failed to get inbox thread')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get inbox thread',
      })
    }
  })

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/inbox/messages/:messageId/attachments/:index
  // -------------------------------------------------------------------------
  fastify.get<{
    Params: { messageId: string; index: string }
    Querystring: { projectId?: string }
  }>('/v1/admin/inhouse/inbox/messages/:messageId/attachments/:index', { preHandler: readMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    const { messageId, index: indexStr } = request.params
    const { projectId } = request.query

    if (!projectId) {
      return reply.status(400).send({ success: false, error: 'projectId is required' })
    }

    const attachmentIndex = parseInt(indexStr, 10)
    if (!Number.isFinite(attachmentIndex) || attachmentIndex < 0) {
      return reply.status(400).send({ success: false, error: 'Invalid attachment index' })
    }

    try {
      const service = getInhouseInboxService(projectId)
      const message = await service.getMessage(messageId)

      if (!message) {
        return reply.status(404).send({ success: false, error: 'Message not found' })
      }

      const attachments = (message as any).attachments || []
      if (attachmentIndex >= attachments.length) {
        return reply.status(404).send({ success: false, error: 'Attachment not found' })
      }

      const attachment = attachments[attachmentIndex]
      if (!attachment?.storageKey) {
        return reply.status(404).send({ success: false, error: 'Attachment file not stored' })
      }

      const storageService = getInhouseStorageService(projectId)
      const url = await storageService.createSignedDownloadUrl(attachment.storageKey)

      auditAdminAction({
        adminId: adminRequest.adminClaims.sub,
        action: 'inbox_attachment_download',
        projectId,
        resourceType: 'inbox_message',
        resourceId: messageId,
        metadata: { attachmentIndex, filename: attachment.filename },
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.send({ success: true, data: { url, filename: attachment.filename, contentType: attachment.contentType } })
    } catch (error) {
      request.log.error({ error }, 'Failed to get attachment download URL')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get attachment download URL',
      })
    }
  })
}
