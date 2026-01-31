/**
 * In-House Auth Routes (Easy Mode)
 *
 * Email/password + magic link for user apps.
 * Authenticated by project API key (public or server).
 */

import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { InhouseAuthService } from '../services/inhouse/InhouseAuthService'
import { validateApiKey } from '../services/inhouse/InhouseGatewayService'
import { getInhouseEmailService, getInhouseProjectService } from '../services/inhouse'
import { validateAndNormalizeEmail, validatePassword } from '../utils/emailValidation'
import { allow } from '../utils/throttle'
import { logActivity } from '../services/inhouse/InhouseActivityLogger'

const authService = new InhouseAuthService()

// Rate limiting configuration
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000 // 10 minutes
const SIGNUP_LIMIT = 5 // Max 5 sign-up attempts per IP per 10 min (prevents enumeration)
const SIGNIN_LIMIT = 10 // Max 10 sign-in attempts per email+IP per 10 min
const MAGIC_LINK_LIMIT = 5 // Max 5 magic link requests per email+IP per 10 min

function getApiKey(request: FastifyRequest): string | null {
  const header = request.headers['x-api-key']
  if (typeof header === 'string' && header.length > 0) {
    return header
  }
  return null
}

function getSessionToken(request: FastifyRequest): string | null {
  const authHeader = request.headers.authorization
  if (!authHeader || typeof authHeader !== 'string') {
    return null
  }
  if (!authHeader.startsWith('Bearer ')) {
    return null
  }
  return authHeader.slice('Bearer '.length).trim() || null
}

async function requireProjectContext(request: FastifyRequest, reply: FastifyReply) {
  const apiKey = getApiKey(request)
  if (!apiKey) {
    reply.code(401).send({ ok: false, error: { code: 'API_KEY_REQUIRED', message: 'API key required' } })
    return null
  }

  const validation = await validateApiKey(apiKey)
  if (!validation.valid || !validation.projectId) {
    reply.code(401).send({ ok: false, error: { code: 'INVALID_API_KEY', message: validation.error || 'Invalid API key' } })
    return null
  }

  if (validation.keyType !== 'public' && validation.keyType !== 'server') {
    reply.code(403).send({ ok: false, error: { code: 'INSUFFICIENT_SCOPE', message: 'API key not permitted' } })
    return null
  }

  return { projectId: validation.projectId }
}

export async function inhouseAuthRoutes(app: FastifyInstance) {
  app.post<{ Body: { email: string; password: string; metadata?: Record<string, any> } }>(
    '/v1/inhouse/auth/sign-up',
    async (request, reply) => {
      const context = await requireProjectContext(request, reply)
      if (!context) return

      const { email, password, metadata } = request.body || {}
      if (!email || !password) {
        return reply.code(400).send({
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: 'Email and password are required' }
        })
      }

      // Validate and normalize email
      const emailValidation = validateAndNormalizeEmail(email)
      if (!emailValidation.valid) {
        return reply.code(400).send({
          ok: false,
          error: { code: 'INVALID_EMAIL', message: emailValidation.error }
        })
      }

      // Validate password
      const passwordValidation = validatePassword(password)
      if (!passwordValidation.valid) {
        return reply.code(400).send({
          ok: false,
          error: { code: 'WEAK_PASSWORD', message: passwordValidation.error }
        })
      }

      // Rate limiting: prevent enumeration and resource exhaustion attacks
      // Use IP + projectId (not email) to prevent user enumeration via timing attacks
      const rateLimitKey = `signup:${context.projectId}:${request.ip}`
      if (!allow(rateLimitKey, SIGNUP_LIMIT, RATE_LIMIT_WINDOW_MS)) {
        return reply.code(429).send({
          ok: false,
          error: {
            code: 'RATE_LIMIT',
            message: 'Too many sign-up attempts. Please try again later.'
          }
        })
      }

      const result = await authService.signUp({
        projectId: context.projectId,
        email: emailValidation.normalized!,
        password,
        ...(metadata && { metadata })
      })

      if (result.error) {
        return reply.code(409).send({
          ok: false,
          error: { code: result.error, message: 'Email already registered' }
        })
      }

      // Log successful sign-up
      logActivity({
        projectId: context.projectId,
        service: 'auth',
        action: 'sign_up',
        actorType: 'user',
        actorId: result.user?.id,
        resourceType: 'user',
        resourceId: result.user?.id,
      })

      return reply.send({ ok: true, data: { user: result.user } })
    }
  )

  app.post<{ Body: { email: string; password: string } }>(
    '/v1/inhouse/auth/sign-in',
    async (request, reply) => {
      const context = await requireProjectContext(request, reply)
      if (!context) return

      const { email, password } = request.body || {}
      if (!email || !password) {
        return reply.code(400).send({
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: 'Email and password are required' }
        })
      }

      // Normalize email for consistent lookups
      const emailValidation = validateAndNormalizeEmail(email)
      if (!emailValidation.valid) {
        return reply.code(400).send({
          ok: false,
          error: { code: 'INVALID_EMAIL', message: emailValidation.error }
        })
      }

      // Rate limiting: prevent credential stuffing attacks
      const rateLimitKey = `signin:${context.projectId}:${emailValidation.normalized}:${request.ip}`
      if (!allow(rateLimitKey, SIGNIN_LIMIT, RATE_LIMIT_WINDOW_MS)) {
        return reply.code(429).send({
          ok: false,
          error: {
            code: 'RATE_LIMIT',
            message: 'Too many sign-in attempts. Please try again later.'
          }
        })
      }

      const userAgent = request.headers['user-agent'] as string | undefined;
      const result = await authService.signIn({
        projectId: context.projectId,
        email: emailValidation.normalized!,
        password,
        ipAddress: request.ip,
        ...(userAgent && { userAgent })
      })

      if (result.error || !result.user || !result.session) {
        return reply.code(401).send({
          ok: false,
          error: { code: result.error || 'INVALID_CREDENTIALS', message: 'Invalid credentials' }
        })
      }

      // Log successful sign-in
      logActivity({
        projectId: context.projectId,
        service: 'auth',
        action: 'sign_in',
        actorType: 'user',
        actorId: result.user.id,
        resourceType: 'session',
        resourceId: undefined,
      })

      return reply.send({ ok: true, data: { user: result.user, session: result.session } })
    }
  )

  app.post<{ Body: { email: string } }>(
    '/v1/inhouse/auth/magic-link',
    async (request, reply) => {
      const context = await requireProjectContext(request, reply)
      if (!context) return

      const { email } = request.body || {}
      if (!email) {
        return reply.code(400).send({
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: 'Email is required' }
        })
      }

      // Validate and normalize email
      const emailValidation = validateAndNormalizeEmail(email)
      if (!emailValidation.valid) {
        return reply.code(400).send({
          ok: false,
          error: { code: 'INVALID_EMAIL', message: emailValidation.error }
        })
      }

      // Rate limiting: prevent magic-link spam attacks
      const rateLimitKey = `magic-link:${context.projectId}:${emailValidation.normalized}:${request.ip}`
      if (!allow(rateLimitKey, MAGIC_LINK_LIMIT, RATE_LIMIT_WINDOW_MS)) {
        return reply.code(429).send({
          ok: false,
          error: {
            code: 'RATE_LIMIT',
            message: 'Too many magic link requests. Please try again later.'
          }
        })
      }

      const userAgent1 = request.headers['user-agent'] as string | undefined;
      const result = await authService.createMagicLink({
        projectId: context.projectId,
        email: emailValidation.normalized!,
        ipAddress: request.ip,
        ...(userAgent1 && { userAgent: userAgent1 })
      })

      if (result.error || !result.token) {
        return reply.code(500).send({
          ok: false,
          error: { code: result.error || 'MAGIC_LINK_ERROR', message: 'Failed to create magic link' }
        })
      }

      // Security: Only return token in dev/staging environments
      // In production, email the link instead of returning the token
      const returnToken = process.env.INHOUSE_MAGIC_LINK_RETURN_TOKEN === 'true'

      if (returnToken) {
        return reply.send({
          ok: true,
          data: {
            token: result.token,
            expiresAt: result.expiresAt,
            message: 'Magic link token returned (dev mode only)'
          }
        })
      }

      // Production: Send magic link email via Resend
      try {
        const projectService = getInhouseProjectService()
        const project = await projectService.getProject(context.projectId)
        const projectName = project?.name || 'Your App'
        const baseUrl = project?.previewUrl || `https://${project?.subdomain || 'app'}.sheenapps.com`
        const magicLinkUrl = `${baseUrl}/auth/magic-link?token=${encodeURIComponent(result.token)}`

        const emailService = getInhouseEmailService(context.projectId)
        await emailService.send({
          to: emailValidation.normalized!,
          template: 'magic-link',
          variables: {
            magicLink: magicLinkUrl,
            expiresIn: '15 minutes',
            appName: projectName,
          },
          idempotencyKey: `magic-link:${context.projectId}:${result.token.slice(0, 16)}`,
        })
      } catch (emailError) {
        // Log but don't fail — token was created, user can request again
        request.log.error({ err: emailError, projectId: context.projectId }, 'Failed to send magic link email')
      }

      return reply.send({
        ok: true,
        data: {
          message: 'Magic link sent to your email',
          expiresAt: result.expiresAt
        }
      })
    }
  )

  app.post<{ Body: { token: string } }>(
    '/v1/inhouse/auth/magic-link/verify',
    async (request, reply) => {
      const context = await requireProjectContext(request, reply)
      if (!context) return

      const { token } = request.body || {}
      if (!token) {
        return reply.code(400).send({
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: 'Token is required' }
        })
      }

      // Rate limiting: prevent brute-force attacks on magic link tokens
      const rateLimitKey = `magic-verify:${context.projectId}:${request.ip}`
      if (!allow(rateLimitKey, 30, RATE_LIMIT_WINDOW_MS)) {
        return reply.code(429).send({
          ok: false,
          error: {
            code: 'RATE_LIMIT',
            message: 'Too many verification attempts. Please try again later.'
          }
        })
      }

      const userAgent2 = request.headers['user-agent'] as string | undefined;
      const result = await authService.verifyMagicLink({
        projectId: context.projectId,
        token,
        ipAddress: request.ip,
        ...(userAgent2 && { userAgent: userAgent2 })
      })

      if (result.error || !result.user || !result.session) {
        return reply.code(401).send({
          ok: false,
          error: { code: result.error || 'MAGIC_LINK_INVALID', message: 'Magic link invalid or expired' }
        })
      }

      // Log successful magic link sign-in
      logActivity({
        projectId: context.projectId,
        service: 'auth',
        action: 'magic_link_verified',
        actorType: 'user',
        actorId: result.user.id,
        resourceType: 'session',
        resourceId: undefined,
      })

      return reply.send({ ok: true, data: { user: result.user, session: result.session } })
    }
  )

  app.get('/v1/inhouse/auth/user', async (request, reply) => {
    const context = await requireProjectContext(request, reply)
    if (!context) return

    const token = getSessionToken(request)
    if (!token) {
      return reply.code(401).send({
        ok: false,
        error: { code: 'SESSION_REQUIRED', message: 'Session token required' }
      })
    }

    const result = await authService.getSessionUser({
      projectId: context.projectId,
      token
    })

    if (result.error || !result.user) {
      return reply.code(401).send({
        ok: false,
        error: { code: result.error || 'SESSION_INVALID', message: 'Session invalid or expired' }
      })
    }

    return reply.send({ ok: true, data: { user: result.user } })
  })

  app.post('/v1/inhouse/auth/sign-out', async (request, reply) => {
    const context = await requireProjectContext(request, reply)
    if (!context) return

    const token = getSessionToken(request)
    if (!token) {
      return reply.code(401).send({
        ok: false,
        error: { code: 'SESSION_REQUIRED', message: 'Session token required' }
      })
    }

    await authService.signOut({ projectId: context.projectId, token })

    // Log sign-out
    logActivity({
      projectId: context.projectId,
      service: 'auth',
      action: 'sign_out',
      actorType: 'user',
    })

    return reply.send({ ok: true, data: { success: true } })
  })
}
