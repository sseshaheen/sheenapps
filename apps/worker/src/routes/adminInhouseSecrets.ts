/**
 * Admin In-House Secrets Routes (audit only)
 */

import { FastifyInstance } from 'fastify'
import { requireAdminAuth, AdminRequest } from '../middleware/adminAuthentication'
import { withStatementTimeout } from '../utils/dbTimeout'
import { requirePool, parseLimitOffset } from './admin/_utils'
import { auditAdminAction } from './admin/_audit'

interface SecretsQuery {
  projectId?: string
  status?: string
  category?: string
  search?: string
  limit?: string
  offset?: string
}

interface SecretsAuditQuery {
  projectId?: string
  secretId?: string
  action?: string
  success?: string
  limit?: string
  offset?: string
}

export default async function adminInhouseSecretsRoutes(fastify: FastifyInstance) {
  const readMiddleware = requireAdminAuth({ permissions: ['inhouse.read'] })

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/secrets
  // -------------------------------------------------------------------------
  fastify.get<{ Querystring: SecretsQuery }>(
    '/v1/admin/inhouse/secrets',
    { preHandler: readMiddleware as never },
    async (request, reply) => {
      const adminRequest = request as AdminRequest
      try {
        const db = requirePool()
        const { projectId, status, category, search, limit: limitStr, offset: offsetStr } = request.query
        const { limit, offset } = parseLimitOffset(limitStr, offsetStr)

        const conditions: string[] = []
        const params: any[] = []
        let index = 1

        if (projectId) {
          conditions.push(`s.project_id = $${index}`)
          params.push(projectId)
          index += 1
        }

        if (status) {
          conditions.push(`s.status = $${index}`)
          params.push(status)
          index += 1
        }

        if (category) {
          conditions.push(`s.category = $${index}`)
          params.push(category)
          index += 1
        }

        if (search) {
          conditions.push(`(s.name ILIKE $${index} OR s.description ILIKE $${index})`)
          params.push(`%${search}%`)
          index += 1
        }

        const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

        const { total, rows } = await withStatementTimeout(db, '5s', async (client) => {
          const countResult = await client.query(
            `SELECT COUNT(*) as total FROM inhouse_secrets s ${whereClause}`,
            params
          )

          const listResult = await client.query(
            `SELECT
              s.id,
              s.project_id,
              s.name,
              s.description,
              s.category,
              s.tags,
              s.status,
              s.key_version,
              s.last_accessed_at,
              s.access_count,
              s.created_at,
              s.updated_at
             FROM inhouse_secrets s
             ${whereClause}
             ORDER BY s.updated_at DESC
             LIMIT $${index} OFFSET $${index + 1}`,
            [...params, limit, offset]
          )

          return {
            total: parseInt(countResult.rows[0]?.total || '0', 10),
            rows: listResult.rows,
          }
        })

        auditAdminAction({
          adminId: adminRequest.adminClaims.sub,
          action: 'secrets_list',
          projectId: projectId || null,
          resourceType: 'secret',
          metadata: { projectId, status, category, search, limit, offset, resultCount: rows.length },
          ipAddress: request.ip || null,
          userAgent: request.headers['user-agent'] || null,
        })

        return reply.send({
          success: true,
          data: {
            secrets: rows,
            total,
            hasMore: offset + rows.length < total,
          },
        })
      } catch (error) {
        request.log.error({ error }, 'Failed to list secrets')
        return reply.status(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to list secrets',
        })
      }
    }
  )

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/secrets/audit
  // -------------------------------------------------------------------------
  fastify.get<{ Querystring: SecretsAuditQuery }>(
    '/v1/admin/inhouse/secrets/audit',
    { preHandler: readMiddleware as never },
    async (request, reply) => {
      const adminRequest = request as AdminRequest
      try {
        const db = requirePool()
        const { projectId, secretId, action, success, limit: limitStr, offset: offsetStr } = request.query
        const { limit, offset } = parseLimitOffset(limitStr, offsetStr)

        const conditions: string[] = []
        const params: any[] = []
        let index = 1

        if (projectId) {
          conditions.push(`a.project_id = $${index}`)
          params.push(projectId)
          index += 1
        }

        if (secretId) {
          conditions.push(`a.secret_id = $${index}`)
          params.push(secretId)
          index += 1
        }

        if (action) {
          conditions.push(`a.action = $${index}`)
          params.push(action)
          index += 1
        }

        if (success === 'true') {
          conditions.push(`a.success = true`)
        } else if (success === 'false') {
          conditions.push(`a.success = false`)
        }

        const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

        const { total, rows } = await withStatementTimeout(db, '5s', async (client) => {
          const countResult = await client.query(
            `SELECT COUNT(*) as total FROM inhouse_secrets_audit a ${whereClause}`,
            params
          )

          const listResult = await client.query(
            `SELECT
              a.id,
              a.created_at,
              a.secret_id,
              a.project_id,
              a.secret_name,
              a.actor_type,
              a.actor_id,
              a.action,
              a.source_ip,
              a.user_agent,
              a.sdk_version,
              a.request_id,
              a.success,
              a.error_code,
              a.error_message
             FROM inhouse_secrets_audit a
             ${whereClause}
             ORDER BY a.created_at DESC
             LIMIT $${index} OFFSET $${index + 1}`,
            [...params, limit, offset]
          )

          return {
            total: parseInt(countResult.rows[0]?.total || '0', 10),
            rows: listResult.rows,
          }
        })

        auditAdminAction({
          adminId: adminRequest.adminClaims.sub,
          action: 'secrets_audit_list',
          projectId: projectId || null,
          resourceType: 'secret_audit',
          resourceId: secretId || null,
          metadata: { projectId, secretId, action, success, limit, offset, resultCount: rows.length },
          ipAddress: request.ip || null,
          userAgent: request.headers['user-agent'] || null,
        })

        return reply.send({
          success: true,
          data: {
            entries: rows,
            total,
            hasMore: offset + rows.length < total,
          },
        })
      } catch (error) {
        request.log.error({ error }, 'Failed to list secrets audit')
        return reply.status(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to list secrets audit',
        })
      }
    }
  )
}
