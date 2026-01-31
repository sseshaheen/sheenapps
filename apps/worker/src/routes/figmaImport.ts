/**
 * Figma Import Routes
 *
 * Routes for importing Figma designs and converting them to React components.
 */

import { FastifyInstance } from 'fastify'
import { requireHmacSignature } from '../middleware/hmacValidation'
import { logActivity } from '../services/inhouse/InhouseActivityLogger'
import { getFigmaImportService } from '../services/ai/FigmaImportService'

// ============================================================================
// Types
// ============================================================================

interface ProjectParams {
  projectId: string
}

// ============================================================================
// Route Registration
// ============================================================================

export async function figmaImportRoutes(fastify: FastifyInstance): Promise<void> {
  const hmacMiddleware = requireHmacSignature()

  /**
   * Parse Figma URL to extract file information
   * POST /v1/inhouse/projects/:projectId/figma/parse-url
   */
  fastify.post<{
    Params: ProjectParams
    Body: {
      url: string
    }
  }>(
    '/v1/inhouse/projects/:projectId/figma/parse-url',
    { preHandler: hmacMiddleware as any },
    async (request, reply) => {
      const { projectId } = request.params
      const { url } = request.body

      if (!url) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'url is required' },
        })
      }

      const service = getFigmaImportService(projectId)
      const parsed = service.parseFigmaUrl(url)

      if (!parsed) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid Figma URL' },
        })
      }

      return reply.send({ data: parsed })
    }
  )

  /**
   * Import design from Figma URL
   * POST /v1/inhouse/projects/:projectId/figma/import
   */
  fastify.post<{
    Params: ProjectParams
    Body: {
      url: string
      connectionId: string
      options?: {
        generateTokens?: boolean
        targetPath?: string
      }
    }
  }>(
    '/v1/inhouse/projects/:projectId/figma/import',
    { preHandler: hmacMiddleware as any },
    async (request, reply) => {
      const { projectId } = request.params
      const { url, connectionId, options } = request.body

      if (!url || !connectionId) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'url and connectionId are required' },
        })
      }

      try {
        const service = getFigmaImportService(projectId)
        const result = await service.importFromUrl(url, connectionId, options)

        await logActivity({
          projectId,
          action: 'figma_import',
          service: 'connectors',
          metadata: {
            url,
            connectionId,
            success: result.success,
            componentCount: result.components.length,
          },
        })

        if (!result.success) {
          return reply.status(400).send({
            error: {
              code: 'IMPORT_FAILED',
              message: result.errors?.join(', ') || 'Import failed',
            },
          })
        }

        return reply.send({ data: result })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to import from Figma'
        return reply.status(500).send({
          error: { code: 'INTERNAL_ERROR', message },
        })
      }
    }
  )

  /**
   * Extract design tokens from a Figma file
   * POST /v1/inhouse/projects/:projectId/figma/tokens
   */
  fastify.post<{
    Params: ProjectParams
    Body: {
      url: string
      connectionId: string
    }
  }>(
    '/v1/inhouse/projects/:projectId/figma/tokens',
    { preHandler: hmacMiddleware as any },
    async (request, reply) => {
      const { projectId } = request.params
      const { url, connectionId } = request.body

      if (!url || !connectionId) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'url and connectionId are required' },
        })
      }

      try {
        const service = getFigmaImportService(projectId)
        const result = await service.importFromUrl(url, connectionId, {
          generateTokens: true,
        })

        await logActivity({
          projectId,
          action: 'figma_extract_tokens',
          service: 'connectors',
          metadata: { url, connectionId },
        })

        return reply.send({ data: { tokens: result.tokens } })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to extract tokens'
        return reply.status(500).send({
          error: { code: 'INTERNAL_ERROR', message },
        })
      }
    }
  )
}

export default figmaImportRoutes
