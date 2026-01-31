/**
 * Signed Actor Middleware
 *
 * Extracts userId from HMAC-verified request payload, preventing internal impersonation bugs.
 *
 * Security Model:
 * - Next.js proxy authenticates user from session
 * - Next.js includes authenticated userId in request body
 * - Request body is signed with HMAC
 * - Worker validates HMAC signature (via requireHmacSignature middleware)
 * - THIS middleware extracts userId from the verified payload
 * - Downstream code uses request.actorUserId, never trusting query/body directly
 *
 * This prevents bugs where:
 * - Internal services accidentally pass wrong userId
 * - Compromised internal services impersonate other users
 * - Developer mistakes in Next.js proxy logic
 *
 * Usage:
 *   fastify.post('/endpoint', {
 *     preHandler: [requireHmacSignature(), requireSignedActor()]
 *   }, async (request, reply) => {
 *     const userId = (request as any).actorUserId // Verified from signature
 *     // ... use userId for authorization
 *   })
 */

import type { FastifyReply, FastifyRequest } from 'fastify'

interface RequestWithHmacValidation extends FastifyRequest {
  hmacValidation?: {
    valid: boolean
    version: string
    timestamp: number
    nonce: string
    warnings?: string[]
  }
}

/**
 * Middleware that extracts and validates userId from HMAC-verified request payload
 *
 * Must be used AFTER requireHmacSignature() in the preHandler chain
 *
 * @returns Fastify preHandler function
 */
export function requireSignedActor() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    // Verify HMAC validation happened and succeeded
    const hmacValidation = (request as RequestWithHmacValidation).hmacValidation

    if (!hmacValidation || !hmacValidation.valid) {
      return reply.code(401).send({
        ok: false,
        error: {
          code: 'UNAUTHENTICATED',
          message: 'HMAC signature validation required before actor extraction'
        }
      })
    }

    // Extract userId from request body (POST/PUT) or query (GET)
    let userId: string | undefined

    if (request.method === 'GET' || request.method === 'DELETE') {
      // For GET/DELETE, userId typically comes from query params
      userId = (request.query as any)?.userId
    } else {
      // For POST/PUT/PATCH, userId should be in the signed body
      userId = (request.body as any)?.userId
    }

    // Validate userId is present and non-empty
    if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
      return reply.code(401).send({
        ok: false,
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Missing or invalid userId in signed request'
        }
      })
    }

    // Store verified userId for downstream use
    // This is the ONLY place userId should be extracted from the request
    ;(request as any).actorUserId = userId.trim()
  }
}
