/**
 * In-House Domain Transfer Routes
 *
 * API endpoints for domain transfer-in functionality.
 * Part of easy-mode-email-enhancements-plan.md (Enhancement 4)
 *
 * Flow:
 * 1. POST /transfer-check - Check eligibility
 * 2. POST /transfer-intent - Create transfer intent (returns pricing)
 * 3. Client creates Stripe PaymentIntent and confirms payment
 * 4. POST /transfer-confirm - Submit auth code after payment
 * 5. GET /transfers/:id - Check transfer status
 */

import { FastifyInstance } from 'fastify'
import Stripe from 'stripe'
import { requireHmacSignature } from '../middleware/hmacValidation'
import { getInhouseDomainTransferService, TransferIntentInput, ConfirmTransferInput } from '../services/inhouse/InhouseDomainTransferService'
import { getOpenSrsService, DomainContact } from '../services/inhouse/OpenSrsService'
import { assertProjectAccess } from '../utils/projectAuth'
import { createLogger } from '../observability/logger'
import { getStripeConfig } from '../config/stripeEnvironmentValidation'

const log = createLogger('domain-transfer-routes')

// =============================================================================
// TYPES
// =============================================================================

interface TransferCheckBody {
  projectId: string
  domain: string
  userId: string
}

interface TransferIntentBody {
  projectId: string
  domain: string
  contacts: {
    owner: DomainContact
    admin?: DomainContact
    billing?: DomainContact
    tech?: DomainContact
  }
  userId: string
  userEmail: string
}

interface TransferConfirmBody {
  projectId: string
  transferId: string
  authCode: string
  stripePaymentIntentId: string
  nameservers?: string[]
  whoisPrivacy?: boolean
  userId: string
}

interface TransferListQuery {
  projectId: string
  status?: string
  limit?: string
  offset?: string
  userId: string
}

// =============================================================================
// ROUTES
// =============================================================================

export default async function inhouseDomainTransferRoutes(fastify: FastifyInstance) {
  const hmacMiddleware = requireHmacSignature()

  // -------------------------------------------------------------------------
  // POST /v1/inhouse/projects/:projectId/transfer-check
  // Check if a domain is eligible for transfer
  // -------------------------------------------------------------------------
  fastify.post<{
    Params: { projectId: string }
    Body: TransferCheckBody
  }>('/v1/inhouse/projects/:projectId/transfer-check', { preHandler: hmacMiddleware as never }, async (request, reply) => {
    try {
      const { projectId } = request.params
      const { domain, userId } = request.body

      // Security: Verify project access
      if (userId) {
        await assertProjectAccess(projectId, userId)
      }

      if (!domain) {
        return reply.status(400).send({
          ok: false,
          error: { code: 'INVALID_REQUEST', message: 'domain is required' },
        })
      }

      log.info({ projectId, domain, userId }, 'Checking transfer eligibility')

      const openSrs = getOpenSrsService()
      const eligibility = await openSrs.checkTransferEligibility(domain.toLowerCase().trim())

      return reply.send({
        ok: true,
        data: {
          domain: eligibility.domain,
          eligible: eligibility.eligible,
          reason: eligibility.reason,
          currentRegistrar: eligibility.currentRegistrar,
          expiresAt: eligibility.expiresAt,
        },
      })
    } catch (error) {
      log.error({ error }, 'Transfer eligibility check failed')
      return reply.status(500).send({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to check transfer eligibility',
        },
      })
    }
  })

  // -------------------------------------------------------------------------
  // POST /v1/inhouse/projects/:projectId/transfer-intent
  // Create a transfer intent (before payment)
  // -------------------------------------------------------------------------
  fastify.post<{
    Params: { projectId: string }
    Body: TransferIntentBody
  }>('/v1/inhouse/projects/:projectId/transfer-intent', { preHandler: hmacMiddleware as never }, async (request, reply) => {
    try {
      const { projectId } = request.params
      const { domain, contacts, userId, userEmail } = request.body

      // Security: Verify project access
      if (userId) {
        await assertProjectAccess(projectId, userId)
      }

      if (!domain || !contacts?.owner) {
        return reply.status(400).send({
          ok: false,
          error: { code: 'INVALID_REQUEST', message: 'domain and contacts.owner are required' },
        })
      }

      log.info({ projectId, domain, userId }, 'Creating transfer intent')

      const service = getInhouseDomainTransferService(projectId)
      const result = await service.createTransferIntent({
        projectId,
        domain,
        contacts,
        userId,
        userEmail,
      })

      if (!result.eligible) {
        return reply.status(400).send({
          ok: false,
          error: {
            code: 'TRANSFER_NOT_ELIGIBLE',
            message: result.reason || 'Domain is not eligible for transfer',
          },
          data: {
            transferId: result.transferId,
            priceCents: result.priceCents,
            currency: result.currency,
          },
        })
      }

      return reply.send({
        ok: true,
        data: {
          transferId: result.transferId,
          priceCents: result.priceCents,
          currency: result.currency,
          currentRegistrar: result.currentRegistrar,
          expiresAt: result.expiresAt,
        },
      })
    } catch (error) {
      log.error({ error }, 'Create transfer intent failed')
      return reply.status(500).send({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to create transfer intent',
        },
      })
    }
  })

  // -------------------------------------------------------------------------
  // POST /v1/inhouse/projects/:projectId/transfer-payment
  // Create or retrieve Stripe PaymentIntent for transfer
  // Idempotent: returns existing PaymentIntent if one exists
  // -------------------------------------------------------------------------
  fastify.post<{
    Params: { projectId: string }
    Body: { transferId: string; userId: string }
  }>('/v1/inhouse/projects/:projectId/transfer-payment', { preHandler: hmacMiddleware as never }, async (request, reply) => {
    try {
      const { projectId } = request.params
      const { transferId, userId } = request.body

      // Security: Verify project access
      if (userId) {
        await assertProjectAccess(projectId, userId)
      }

      if (!transferId) {
        return reply.status(400).send({
          ok: false,
          error: { code: 'INVALID_REQUEST', message: 'transferId is required' },
        })
      }

      log.info({ projectId, transferId, userId }, 'Creating/retrieving transfer payment')

      const service = getInhouseDomainTransferService(projectId)
      const transfer = await service.getTransfer(transferId)

      if (!transfer) {
        return reply.status(404).send({
          ok: false,
          error: { code: 'NOT_FOUND', message: 'Transfer not found' },
        })
      }

      if (transfer.status !== 'pending_payment') {
        return reply.status(400).send({
          ok: false,
          error: {
            code: 'INVALID_STATUS',
            message: `Transfer is not awaiting payment (status: ${transfer.status})`,
          },
        })
      }

      // Initialize Stripe
      const stripeConfig = getStripeConfig()
      const stripe = new Stripe(stripeConfig.secretKey)

      // If PaymentIntent already exists, try to reuse it
      if (transfer.stripePaymentIntentId) {
        try {
          const existingPi = await stripe.paymentIntents.retrieve(transfer.stripePaymentIntentId)

          // Reuse if still valid (not canceled/succeeded)
          if (existingPi.status !== 'canceled' && existingPi.status !== 'succeeded') {
            return reply.send({
              ok: true,
              data: {
                clientSecret: existingPi.client_secret,
                paymentIntentId: existingPi.id,
              },
            })
          }

          // If succeeded, user should call transfer-confirm instead
          if (existingPi.status === 'succeeded') {
            return reply.status(400).send({
              ok: false,
              error: {
                code: 'PAYMENT_ALREADY_COMPLETED',
                message: 'Payment already completed. Please submit auth code to continue.',
              },
            })
          }
          // If canceled, fall through to create new one
        } catch (e) {
          // PaymentIntent not found, create new one
          log.warn({ transferId, stripePaymentIntentId: transfer.stripePaymentIntentId, error: e }, 'Failed to retrieve existing PaymentIntent, creating new one')
        }
      }

      // Create new PaymentIntent with idempotency key
      const pi = await stripe.paymentIntents.create(
        {
          amount: transfer.priceCents,
          currency: transfer.currency.toLowerCase(),
          metadata: {
            kind: 'domain_transfer_in',
            transferId,
            projectId,
            userId: userId || '',
            domain: transfer.domain,
          },
        },
        { idempotencyKey: `domain-transfer:${transferId}` }
      )

      // Store PaymentIntent ID on transfer record
      await service.attachPaymentIntent(transferId, pi.id)

      return reply.send({
        ok: true,
        data: {
          clientSecret: pi.client_secret,
          paymentIntentId: pi.id,
        },
      })
    } catch (error) {
      log.error({ error }, 'Create transfer payment failed')
      return reply.status(500).send({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to create payment',
        },
      })
    }
  })

  // -------------------------------------------------------------------------
  // POST /v1/inhouse/projects/:projectId/transfer-confirm
  // Confirm transfer with auth code (after payment)
  // -------------------------------------------------------------------------
  fastify.post<{
    Params: { projectId: string }
    Body: TransferConfirmBody
  }>('/v1/inhouse/projects/:projectId/transfer-confirm', { preHandler: hmacMiddleware as never }, async (request, reply) => {
    try {
      const { projectId } = request.params
      const { transferId, authCode, stripePaymentIntentId, nameservers, whoisPrivacy, userId } = request.body

      // Security: Verify project access
      if (userId) {
        await assertProjectAccess(projectId, userId)
      }

      if (!transferId || !authCode || !stripePaymentIntentId) {
        return reply.status(400).send({
          ok: false,
          error: { code: 'INVALID_REQUEST', message: 'transferId, authCode, and stripePaymentIntentId are required' },
        })
      }

      log.info({ projectId, transferId, userId }, 'Confirming transfer with auth code')

      const service = getInhouseDomainTransferService(projectId)
      const result = await service.confirmTransferWithAuthCode(
        { transferId, authCode, nameservers, whoisPrivacy },
        stripePaymentIntentId
      )

      if (!result.success) {
        return reply.status(400).send({
          ok: false,
          error: {
            code: 'TRANSFER_FAILED',
            message: result.error || 'Transfer initiation failed',
          },
          data: {
            status: result.status,
            domain: result.domain,
          },
        })
      }

      return reply.send({
        ok: true,
        data: {
          domain: result.domain,
          orderId: result.orderId,
          status: result.status,
        },
      })
    } catch (error) {
      log.error({ error }, 'Transfer confirmation failed')
      return reply.status(500).send({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to confirm transfer',
        },
      })
    }
  })

  // -------------------------------------------------------------------------
  // GET /v1/inhouse/projects/:projectId/transfers
  // List transfers for project
  // -------------------------------------------------------------------------
  fastify.get<{
    Params: { projectId: string }
    Querystring: TransferListQuery
  }>('/v1/inhouse/projects/:projectId/transfers', { preHandler: hmacMiddleware as never }, async (request, reply) => {
    try {
      const { projectId } = request.params
      const { status, limit: limitStr, offset: offsetStr, userId } = request.query

      // Security: Verify project access
      if (userId) {
        await assertProjectAccess(projectId, userId)
      }

      const limit = Math.min(parseInt(limitStr || '20', 10), 100)
      const offset = Math.max(parseInt(offsetStr || '0', 10), 0)

      const service = getInhouseDomainTransferService(projectId)
      const { transfers, total } = await service.listTransfers({ status, limit, offset })

      return reply.send({
        ok: true,
        data: {
          transfers,
          total,
          hasMore: offset + transfers.length < total,
        },
      })
    } catch (error) {
      log.error({ error }, 'List transfers failed')
      return reply.status(500).send({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to list transfers',
        },
      })
    }
  })

  // -------------------------------------------------------------------------
  // GET /v1/inhouse/projects/:projectId/transfers/:transferId
  // Get single transfer
  // -------------------------------------------------------------------------
  fastify.get<{
    Params: { projectId: string; transferId: string }
    Querystring: { userId: string }
  }>('/v1/inhouse/projects/:projectId/transfers/:transferId', { preHandler: hmacMiddleware as never }, async (request, reply) => {
    try {
      const { projectId, transferId } = request.params
      const { userId } = request.query

      // Security: Verify project access
      if (userId) {
        await assertProjectAccess(projectId, userId)
      }

      const service = getInhouseDomainTransferService(projectId)
      const transfer = await service.getTransfer(transferId)

      if (!transfer) {
        return reply.status(404).send({
          ok: false,
          error: { code: 'NOT_FOUND', message: 'Transfer not found' },
        })
      }

      return reply.send({
        ok: true,
        data: transfer,
      })
    } catch (error) {
      log.error({ error }, 'Get transfer failed')
      return reply.status(500).send({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to get transfer',
        },
      })
    }
  })

  // -------------------------------------------------------------------------
  // POST /v1/inhouse/projects/:projectId/transfers/:transferId/cancel
  // Cancel a pending transfer
  // -------------------------------------------------------------------------
  fastify.post<{
    Params: { projectId: string; transferId: string }
    Body: { userId: string; reason?: string }
  }>('/v1/inhouse/projects/:projectId/transfers/:transferId/cancel', { preHandler: hmacMiddleware as never }, async (request, reply) => {
    try {
      const { projectId, transferId } = request.params
      const { reason, userId } = request.body

      // Security: Verify project access
      if (userId) {
        await assertProjectAccess(projectId, userId)
      }

      log.info({ projectId, transferId, userId }, 'Cancelling transfer')

      const service = getInhouseDomainTransferService(projectId)
      const success = await service.cancelTransfer(transferId, reason)

      if (!success) {
        return reply.status(400).send({
          ok: false,
          error: {
            code: 'CANCEL_FAILED',
            message: 'Cannot cancel transfer. It may not exist or is already in progress.',
          },
        })
      }

      return reply.send({
        ok: true,
        data: { cancelled: true },
      })
    } catch (error) {
      log.error({ error }, 'Cancel transfer failed')
      return reply.status(500).send({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to cancel transfer',
        },
      })
    }
  })

  // -------------------------------------------------------------------------
  // POST /v1/inhouse/projects/:projectId/transfers/:transferId/poll-status
  // Poll transfer status from OpenSRS
  // -------------------------------------------------------------------------
  fastify.post<{
    Params: { projectId: string; transferId: string }
    Body: { userId: string }
  }>('/v1/inhouse/projects/:projectId/transfers/:transferId/poll-status', { preHandler: hmacMiddleware as never }, async (request, reply) => {
    try {
      const { projectId, transferId } = request.params
      const { userId } = request.body

      // Security: Verify project access
      if (userId) {
        await assertProjectAccess(projectId, userId)
      }

      const service = getInhouseDomainTransferService(projectId)
      const result = await service.pollTransferStatus(transferId)

      if (!result) {
        return reply.status(404).send({
          ok: false,
          error: { code: 'NOT_FOUND', message: 'Transfer not found or not in progress' },
        })
      }

      return reply.send({
        ok: true,
        data: result,
      })
    } catch (error) {
      log.error({ error }, 'Poll transfer status failed')
      return reply.status(500).send({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to poll transfer status',
        },
      })
    }
  })
}
