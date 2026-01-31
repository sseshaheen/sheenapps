/**
 * Inhouse Payments Routes
 *
 * Payment processing endpoints for Easy Mode projects using BYO Stripe keys.
 *
 * Routes:
 * POST /v1/inhouse/projects/:projectId/payments/checkout - Create checkout session
 * POST /v1/inhouse/projects/:projectId/payments/portal - Create billing portal session
 * POST /v1/inhouse/projects/:projectId/payments/customers - Create customer
 * GET  /v1/inhouse/projects/:projectId/payments/customers/:customerId - Get customer
 * GET  /v1/inhouse/projects/:projectId/payments/subscriptions/:subscriptionId - Get subscription
 * POST /v1/inhouse/projects/:projectId/payments/subscriptions/:subscriptionId/cancel - Cancel subscription
 * GET  /v1/inhouse/projects/:projectId/payments/customers/:customerId/subscriptions - List subscriptions
 * POST /v1/inhouse/projects/:projectId/payments/webhooks - Handle Stripe webhooks
 * GET  /v1/inhouse/projects/:projectId/payments/events - List payment events
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { createInhousePaymentsService, InhousePaymentsService } from '../services/inhouse/InhousePaymentsService'
import { getInhouseSecretsService } from '../services/inhouse/InhouseSecretsService'
import { requireHmacSignature } from '../middleware/hmacValidation'
import { assertProjectAccess } from '../utils/projectAuth'
import { logActivity } from '../services/inhouse/InhouseActivityLogger'

// =============================================================================
// Types
// =============================================================================

interface ProjectParams {
  projectId: string
}

interface CustomerParams extends ProjectParams {
  customerId: string
}

interface SubscriptionParams extends ProjectParams {
  subscriptionId: string
}

interface CheckoutBody {
  priceId: string
  successUrl: string
  cancelUrl: string
  customerId?: string
  customerEmail?: string
  mode?: 'payment' | 'subscription' | 'setup'
  quantity?: number
  metadata?: Record<string, string>
  idempotencyKey?: string
  allowPromotionCodes?: boolean
  clientReferenceId?: string
  userId?: string
}

interface PortalBody {
  customerId: string
  returnUrl: string
  userId?: string
}

interface CreateCustomerBody {
  email: string
  name?: string
  metadata?: Record<string, string>
  userId?: string
}

interface CancelSubscriptionBody {
  immediately?: boolean
  userId?: string
}

interface ListEventsQuery {
  eventType?: string
  status?: 'pending' | 'processed' | 'failed'
  limit?: number
  offset?: number
  userId?: string
}

// =============================================================================
// Helpers
// =============================================================================

async function getStripeKeys(projectId: string): Promise<{ secretKey: string; webhookSecret?: string } | null> {
  const secretsService = getInhouseSecretsService(projectId)

  // Decrypt the Stripe keys using envelope encryption
  const secrets = await secretsService.decryptSecrets([
    'stripe_secret_key',
    'stripe_webhook_secret'
  ])

  if (!secrets.stripe_secret_key) {
    return null
  }

  return {
    secretKey: secrets.stripe_secret_key,
    webhookSecret: secrets.stripe_webhook_secret
  }
}

async function createPaymentsService(projectId: string, reply: FastifyReply): Promise<InhousePaymentsService | null> {
  const keys = await getStripeKeys(projectId)

  if (!keys) {
    reply.code(400).send({
      ok: false,
      error: {
        code: 'STRIPE_NOT_CONFIGURED',
        message: 'Stripe keys not configured for this project. Please add stripe_secret_key to your project secrets.'
      }
    })
    return null
  }

  return await createInhousePaymentsService(projectId, keys.secretKey, keys.webhookSecret)
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function isValidHttpUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

// =============================================================================
// Route Registration
// =============================================================================

export async function inhousePaymentsRoutes(fastify: FastifyInstance): Promise<void> {
  // HMAC middleware for all routes except webhooks (which use Stripe signature verification)
  const hmacMiddleware = requireHmacSignature()

  // ---------------------------------------------------------------------------
  // POST /payments/checkout - Create checkout session
  // ---------------------------------------------------------------------------
  fastify.post<{
    Params: ProjectParams
    Body: CheckoutBody
  }>(
    '/v1/inhouse/projects/:projectId/payments/checkout',
    { preHandler: hmacMiddleware as any },
    async (request, reply) => {
      const { projectId } = request.params
      const body = request.body

      // Authorize project access
      if (body.userId) {
        await assertProjectAccess(projectId, body.userId)
      }

      // Validate required fields
      if (!body.priceId || typeof body.priceId !== 'string') {
        return reply.code(400).send({
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: 'priceId is required' }
        })
      }

      if (!body.successUrl || !isValidHttpUrl(body.successUrl)) {
        return reply.code(400).send({
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: 'Valid successUrl is required' }
        })
      }

      if (!body.cancelUrl || !isValidHttpUrl(body.cancelUrl)) {
        return reply.code(400).send({
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: 'Valid cancelUrl is required' }
        })
      }

      if (body.customerEmail && !isValidEmail(body.customerEmail)) {
        return reply.code(400).send({
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid customerEmail format' }
        })
      }

      const service = await createPaymentsService(projectId, reply)
      if (!service) return

      try {
        const session = await service.createCheckoutSession({
          priceId: body.priceId,
          successUrl: body.successUrl,
          cancelUrl: body.cancelUrl,
          customerId: body.customerId,
          customerEmail: body.customerEmail,
          mode: body.mode,
          quantity: body.quantity,
          metadata: body.metadata,
          idempotencyKey: body.idempotencyKey,
          allowPromotionCodes: body.allowPromotionCodes,
          clientReferenceId: body.clientReferenceId
        })

        // Log checkout session creation
        logActivity({
          projectId,
          service: 'payments',
          action: 'checkout_created',
          actorType: 'user',
          actorId: body.userId,
          resourceType: 'checkout_session',
          resourceId: session.id,
          metadata: { priceId: body.priceId, mode: body.mode || 'subscription' },
        })

        return reply.code(201).send({
          ok: true,
          data: { session }
        })
      } catch (error: unknown) {
        const err = error as Error
        fastify.log.error({ err, projectId }, 'Failed to create checkout session')
        return reply.code(500).send({
          ok: false,
          error: { code: 'STRIPE_API_ERROR', message: err.message }
        })
      }
    }
  )

  // ---------------------------------------------------------------------------
  // POST /payments/portal - Create billing portal session
  // ---------------------------------------------------------------------------
  fastify.post<{
    Params: ProjectParams
    Body: PortalBody
  }>(
    '/v1/inhouse/projects/:projectId/payments/portal',
    { preHandler: hmacMiddleware as any },
    async (request, reply) => {
      const { projectId } = request.params
      const body = request.body

      // Authorize project access
      if (body.userId) {
        await assertProjectAccess(projectId, body.userId)
      }

      if (!body.customerId || typeof body.customerId !== 'string') {
        return reply.code(400).send({
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: 'customerId is required' }
        })
      }

      if (!body.returnUrl || !isValidHttpUrl(body.returnUrl)) {
        return reply.code(400).send({
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: 'Valid returnUrl is required' }
        })
      }

      const service = await createPaymentsService(projectId, reply)
      if (!service) return

      try {
        const session = await service.createPortalSession({
          customerId: body.customerId,
          returnUrl: body.returnUrl
        })

        return reply.code(201).send({
          ok: true,
          data: { session }
        })
      } catch (error: unknown) {
        const err = error as Error
        fastify.log.error({ err, projectId }, 'Failed to create portal session')
        return reply.code(500).send({
          ok: false,
          error: { code: 'STRIPE_API_ERROR', message: err.message }
        })
      }
    }
  )

  // ---------------------------------------------------------------------------
  // POST /payments/customers - Create customer
  // ---------------------------------------------------------------------------
  fastify.post<{
    Params: ProjectParams
    Body: CreateCustomerBody
  }>(
    '/v1/inhouse/projects/:projectId/payments/customers',
    { preHandler: hmacMiddleware as any },
    async (request, reply) => {
      const { projectId } = request.params
      const body = request.body

      // Authorize project access
      if (body.userId) {
        await assertProjectAccess(projectId, body.userId)
      }

      if (!body.email || !isValidEmail(body.email)) {
        return reply.code(400).send({
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: 'Valid email is required' }
        })
      }

      const service = await createPaymentsService(projectId, reply)
      if (!service) return

      try {
        const customer = await service.createCustomer({
          email: body.email,
          name: body.name,
          metadata: body.metadata
        })

        // Log customer creation
        logActivity({
          projectId,
          service: 'payments',
          action: 'customer_created',
          actorType: 'user',
          actorId: body.userId,
          resourceType: 'customer',
          resourceId: customer.id,
        })

        return reply.code(201).send({
          ok: true,
          data: { customer }
        })
      } catch (error: unknown) {
        const err = error as Error
        fastify.log.error({ err, projectId }, 'Failed to create customer')
        return reply.code(500).send({
          ok: false,
          error: { code: 'STRIPE_API_ERROR', message: err.message }
        })
      }
    }
  )

  // ---------------------------------------------------------------------------
  // GET /payments/customers/:customerId - Get customer
  // ---------------------------------------------------------------------------
  fastify.get<{
    Params: CustomerParams
    Querystring: { userId?: string }
  }>(
    '/v1/inhouse/projects/:projectId/payments/customers/:customerId',
    { preHandler: hmacMiddleware as any },
    async (request, reply) => {
      const { projectId, customerId } = request.params
      const { userId } = request.query

      // Authorize project access
      if (userId) {
        await assertProjectAccess(projectId, userId)
      }

      const service = await createPaymentsService(projectId, reply)
      if (!service) return

      try {
        const customer = await service.getCustomer(customerId)

        if (!customer) {
          return reply.code(404).send({
            ok: false,
            error: { code: 'NOT_FOUND', message: 'Customer not found' }
          })
        }

        return reply.code(200).send({
          ok: true,
          data: { customer }
        })
      } catch (error: unknown) {
        const err = error as Error
        fastify.log.error({ err, projectId, customerId }, 'Failed to get customer')
        return reply.code(500).send({
          ok: false,
          error: { code: 'STRIPE_API_ERROR', message: err.message }
        })
      }
    }
  )

  // ---------------------------------------------------------------------------
  // GET /payments/subscriptions/:subscriptionId - Get subscription
  // ---------------------------------------------------------------------------
  fastify.get<{
    Params: SubscriptionParams
    Querystring: { userId?: string }
  }>(
    '/v1/inhouse/projects/:projectId/payments/subscriptions/:subscriptionId',
    { preHandler: hmacMiddleware as any },
    async (request, reply) => {
      const { projectId, subscriptionId } = request.params
      const { userId } = request.query

      // Authorize project access
      if (userId) {
        await assertProjectAccess(projectId, userId)
      }

      const service = await createPaymentsService(projectId, reply)
      if (!service) return

      try {
        const subscription = await service.getSubscription({ subscriptionId })

        if (!subscription) {
          return reply.code(404).send({
            ok: false,
            error: { code: 'NOT_FOUND', message: 'Subscription not found' }
          })
        }

        return reply.code(200).send({
          ok: true,
          data: { subscription }
        })
      } catch (error: unknown) {
        const err = error as Error
        fastify.log.error({ err, projectId, subscriptionId }, 'Failed to get subscription')
        return reply.code(500).send({
          ok: false,
          error: { code: 'STRIPE_API_ERROR', message: err.message }
        })
      }
    }
  )

  // ---------------------------------------------------------------------------
  // POST /payments/subscriptions/:subscriptionId/cancel - Cancel subscription
  // ---------------------------------------------------------------------------
  fastify.post<{
    Params: SubscriptionParams
    Body: CancelSubscriptionBody
  }>(
    '/v1/inhouse/projects/:projectId/payments/subscriptions/:subscriptionId/cancel',
    { preHandler: hmacMiddleware as any },
    async (request, reply) => {
      const { projectId, subscriptionId } = request.params
      const body = request.body

      // Authorize project access
      if (body.userId) {
        await assertProjectAccess(projectId, body.userId)
      }

      const service = await createPaymentsService(projectId, reply)
      if (!service) return

      try {
        const subscription = await service.cancelSubscription({
          subscriptionId,
          immediately: body.immediately
        })

        // Log subscription cancellation
        logActivity({
          projectId,
          service: 'payments',
          action: 'subscription_cancelled',
          actorType: 'user',
          actorId: body.userId,
          resourceType: 'subscription',
          resourceId: subscriptionId,
          metadata: { immediately: body.immediately || false },
        })

        return reply.code(200).send({
          ok: true,
          data: { subscription }
        })
      } catch (error: unknown) {
        const err = error as Error
        fastify.log.error({ err, projectId, subscriptionId }, 'Failed to cancel subscription')
        return reply.code(500).send({
          ok: false,
          error: { code: 'STRIPE_API_ERROR', message: err.message }
        })
      }
    }
  )

  // ---------------------------------------------------------------------------
  // GET /payments/customers/:customerId/subscriptions - List customer subscriptions
  // ---------------------------------------------------------------------------
  fastify.get<{
    Params: CustomerParams
    Querystring: { userId?: string }
  }>(
    '/v1/inhouse/projects/:projectId/payments/customers/:customerId/subscriptions',
    { preHandler: hmacMiddleware as any },
    async (request, reply) => {
      const { projectId, customerId } = request.params
      const { userId } = request.query

      // Authorize project access
      if (userId) {
        await assertProjectAccess(projectId, userId)
      }

      const service = await createPaymentsService(projectId, reply)
      if (!service) return

      try {
        const subscriptions = await service.listSubscriptions(customerId)

        return reply.code(200).send({
          ok: true,
          data: { subscriptions }
        })
      } catch (error: unknown) {
        const err = error as Error
        fastify.log.error({ err, projectId, customerId }, 'Failed to list subscriptions')
        return reply.code(500).send({
          ok: false,
          error: { code: 'STRIPE_API_ERROR', message: err.message }
        })
      }
    }
  )

  // ---------------------------------------------------------------------------
  // POST /payments/webhooks - Handle Stripe webhooks
  // ---------------------------------------------------------------------------
  fastify.post<{
    Params: ProjectParams
  }>(
    '/v1/inhouse/projects/:projectId/payments/webhooks',
    {
      config: {
        rawBody: true
      }
    },
    async (request, reply) => {
      const { projectId } = request.params
      const signature = request.headers['stripe-signature'] as string

      if (!signature) {
        return reply.code(400).send({
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: 'Missing stripe-signature header' }
        })
      }

      const service = await createPaymentsService(projectId, reply)
      if (!service) return

      try {
        const rawBody = (request as unknown as { rawBody: Buffer }).rawBody || request.body
        const result = await service.verifyWebhook(rawBody as string | Buffer, signature)

        if ('error' in result) {
          return reply.code(400).send({
            ok: false,
            error: { code: 'INVALID_SIGNATURE', message: result.error }
          })
        }

        // Store the event for processing
        await service.storeWebhookEvent(result.event)

        // Log webhook received
        logActivity({
          projectId,
          service: 'payments',
          action: 'webhook_received',
          actorType: 'system',
          resourceType: 'webhook_event',
          resourceId: result.event.id,
          metadata: { eventType: result.event.type },
        })

        // Return 200 with full event data for SDK client
        return reply.code(200).send({
          ok: true,
          data: {
            received: true,
            eventId: result.event.id,
            eventType: result.event.type,
            eventData: result.event.data,
            eventCreated: result.event.created
          }
        })
      } catch (error: unknown) {
        const err = error as Error
        fastify.log.error({ err, projectId }, 'Failed to process webhook')
        return reply.code(500).send({
          ok: false,
          error: { code: 'WEBHOOK_ERROR', message: err.message }
        })
      }
    }
  )

  // ---------------------------------------------------------------------------
  // GET /payments/events - List payment events
  // ---------------------------------------------------------------------------
  fastify.get<{
    Params: ProjectParams
    Querystring: ListEventsQuery
  }>(
    '/v1/inhouse/projects/:projectId/payments/events',
    { preHandler: hmacMiddleware as any },
    async (request, reply) => {
      const { projectId } = request.params
      const { eventType, status, limit, offset, userId } = request.query

      // Authorize project access
      if (userId) {
        await assertProjectAccess(projectId, userId)
      }

      const service = await createPaymentsService(projectId, reply)
      if (!service) return

      try {
        const result = await service.listEvents({
          eventType,
          status,
          limit: limit ? Math.min(Math.max(parseInt(String(limit), 10) || 20, 1), 100) : 20,
          offset: offset ? Math.max(parseInt(String(offset), 10) || 0, 0) : 0
        })

        return reply.code(200).send({
          ok: true,
          data: result
        })
      } catch (error: unknown) {
        const err = error as Error
        fastify.log.error({ err, projectId }, 'Failed to list events')
        return reply.code(500).send({
          ok: false,
          error: { code: 'INTERNAL_ERROR', message: err.message }
        })
      }
    }
  )
}
