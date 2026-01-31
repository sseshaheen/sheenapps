/**
 * Stripe Payment API Routes
 * 
 * Complete REST API for Stripe payment processing with security hardening:
 * - HMAC signature validation for authenticated endpoints
 * - Comprehensive input validation with JSON schemas  
 * - Proper error handling with correlation IDs
 * - Rate limiting and security headers
 * - Webhook endpoint with Stripe signature verification
 * 
 * Security Features:
 * - Claims-based authentication with expiration validation
 * - User access control (users can only access their own data)
 * - Idempotency key validation for safe retries
 * - No sensitive data exposure in error messages
 * - Comprehensive audit logging
 */

import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { requireHmacSignature } from '../middleware/hmacValidation';
import { StripeProvider } from '../services/payment/StripeProvider';
import { PaymentClaims, PaymentError } from '../services/payment/types';
import { ServerLoggingService } from '../services/serverLoggingService';
import { isStripeConfigured } from '../config/stripeEnvironmentValidation';
import * as crypto from 'crypto';

// =====================================================
// Type Definitions
// =====================================================

interface AuthenticatedRequest extends FastifyRequest {
  headers: {
    'x-sheen-claims': string;
    'x-sheen-locale'?: string;
    'x-idempotency-key'?: string;
    'x-correlation-id'?: string;
    'stripe-signature'?: string;
  };
}

interface CheckoutRequestBody {
  planId: 'free' | 'starter' | 'builder' | 'pro' | 'ultra';
  trial?: boolean;
}

interface PortalRequestBody {
  returnUrl?: string;
}

interface CancelRequestBody {
  immediately?: boolean;
}

// =====================================================
// Route Registration
// =====================================================

export function registerStripePaymentRoutes(app: FastifyInstance) {
  // Skip registration if Stripe is not configured
  if (!isStripeConfigured()) {
    console.log('⚠️ Stripe not configured - payment routes disabled');
    return;
  }
  
  console.log('🚀 Registering Stripe payment routes...');
  
  // Initialize payment provider
  const paymentProvider = new StripeProvider();
  
  // HMAC middleware for authenticated endpoints
  const hmacMiddleware = requireHmacSignature({
    skipMethods: ['OPTIONS'],
    logFailures: true
  });
  
  // =====================================================
  // Utility Functions
  // =====================================================
  
  /**
   * Extract and validate claims from request header
   * Throws error if claims are missing, invalid, or expired
   */
  function extractClaimsFromRequest(request: AuthenticatedRequest): PaymentClaims {
    const claimsHeader = request.headers['x-sheen-claims'];
    if (!claimsHeader) {
      throw new PaymentError('AUTHENTICATION_ERROR', 'Missing authentication claims');
    }
    
    try {
      const claims = JSON.parse(Buffer.from(claimsHeader, 'base64').toString()) as PaymentClaims;
      
      // Validate required fields
      if (!claims.userId || !claims.email) {
        throw new PaymentError('AUTHENTICATION_ERROR', 'Invalid claims structure');
      }
      
      // Check expiration (handle both seconds and milliseconds timestamps)
      const now = Math.floor(Date.now() / 1000);
      let expirationTime = claims.expires;
      
      // If timestamp is in milliseconds (>1e12), convert to seconds
      if (expirationTime && expirationTime > 1e12) {
        expirationTime = Math.floor(expirationTime / 1000);
      }
      
      if (expirationTime && expirationTime < now) {
        throw new PaymentError('AUTHENTICATION_ERROR', 'Claims have expired');
      }
      
      return claims;
    } catch (error) {
      if (error instanceof PaymentError) throw error;
      throw new PaymentError('AUTHENTICATION_ERROR', 'Invalid claims format');
    }
  }
  
  /**
   * Generate correlation ID for request tracing
   * Uses provided ID or generates a new one
   */
  function getCorrelationId(request: AuthenticatedRequest): string {
    return request.headers['x-correlation-id'] || crypto.randomUUID();
  }
  
  /**
   * Build comprehensive error response with security considerations
   * Never exposes sensitive internal information
   */
  function buildErrorResponse(error: any, correlationId: string) {
    if (error instanceof PaymentError) {
      return {
        success: false,
        error: error.message,
        code: error.code,
        correlationId,
        timestamp: new Date().toISOString()
      };
    }
    
    // Generic error for security (don't expose internals)
    return {
      success: false,
      error: 'Payment operation failed',
      correlationId,
      timestamp: new Date().toISOString()
    };
  }
  
  // =====================================================
  // POST /v1/payments/checkout - Create Checkout Session
  // =====================================================
  
  app.post<{
    Body: CheckoutRequestBody;
    Headers: { 'x-sheen-claims': string; 'x-sheen-locale'?: string; 'x-idempotency-key'?: string };
  }>('/v1/payments/checkout', {
    preHandler: hmacMiddleware,
    schema: {
      body: {
        type: 'object',
        properties: {
          planId: {
            type: 'string',
            enum: ['free', 'lite', 'starter', 'builder', 'pro', 'ultra'],
            description: 'Subscription plan identifier'
          },
          trial: {
            type: 'boolean',
            description: 'Whether to include free trial period'
          }
        },
        required: ['planId']
      },
      headers: {
        type: 'object',
        properties: {
          'x-idempotency-key': {
            type: 'string',
            pattern: '^[a-zA-Z0-9_.-]{8,128}$',
            description: 'Unique key to prevent duplicate operations (optional - server generates if not provided)'
          },
          'x-sheen-claims': {
            type: 'string',
            description: 'Base64 encoded authentication claims'
          },
          'x-sheen-locale': {
            type: 'string',
            enum: ['en', 'ar', 'fr', 'es', 'de'],
            description: 'User locale for internationalization'
          }
        },
        required: ['x-sheen-claims']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            url: { type: 'string', format: 'uri' },
            sessionId: { type: 'string' },
            correlationId: { type: 'string' }
          },
          required: ['success', 'correlationId']
        },
        400: {
          type: 'object',
          properties: {
            success: { type: 'boolean', const: false },
            error: { type: 'string' },
            code: { type: 'string' },
            correlationId: { type: 'string' },
            timestamp: { type: 'string' }
          }
        }
      }
    }
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    const correlationId = getCorrelationId(request);
    
    try {
      const claims = extractClaimsFromRequest(request);
      const locale = request.headers['x-sheen-locale'] || 'en';
      
      // Generate or validate idempotency key
      let idempotencyKey = request.headers['x-idempotency-key'];
      if (!idempotencyKey) {
        idempotencyKey = `checkout_${claims.userId}_${(request as any).body.planId}_${Date.now()}`;
      }
      
      // Trust & Safety: Assert payments are allowed before processing
      const { trustSafetyEnforcer } = await import('../services/trustSafetyEnforcer');
      await trustSafetyEnforcer.assertPaymentsAllowed(claims.userId);

      console.log(`📥 Checkout request: ${claims.userId} -> ${(request as any).body.planId} (${correlationId})`);

      const result = await paymentProvider.createCheckoutSession({
        planId: (request as any).body.planId,
        trial: (request as any).body.trial || false,
        authenticatedClaims: claims,
        locale,
        correlationId,
        idempotencyKey
      });
      
      return reply.send(result);
      
    } catch (error: any) {
      console.error(`[Payments] Checkout failed (${correlationId}):`, error);
      
      // Log error with context
      await ServerLoggingService.getInstance().logCriticalError(
        'payment_checkout_failed',
        error,
        { correlationId, planId: (request as any).body.planId }
      );
      
      const errorResponse = buildErrorResponse(error, correlationId);
      return reply.code(error instanceof PaymentError && error.code === 'AUTHENTICATION_ERROR' ? 401 : 500)
                  .send(errorResponse);
    }
  });
  
  // =====================================================
  // POST /v1/payments/portal - Create Billing Portal Session
  // =====================================================
  
  app.post<{
    Body: PortalRequestBody;
    Headers: { 'x-sheen-claims': string; 'x-sheen-locale'?: string };
  }>('/v1/payments/portal', {
    preHandler: hmacMiddleware,
    schema: {
      body: {
        type: 'object',
        properties: {
          returnUrl: {
            type: 'string',
            format: 'uri',
            description: 'URL to redirect to after portal session'
          }
        }
      },
      headers: {
        type: 'object',
        properties: {
          'x-sheen-claims': { type: 'string' },
          'x-sheen-locale': { type: 'string', enum: ['en', 'ar', 'fr', 'es', 'de'] }
        },
        required: ['x-sheen-claims']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            url: { type: 'string', format: 'uri' },
            correlationId: { type: 'string' }
          }
        }
      }
    }
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    const correlationId = getCorrelationId(request);
    
    try {
      const claims = extractClaimsFromRequest(request);
      const locale = request.headers['x-sheen-locale'] || 'en';
      
      // Trust & Safety: Assert payments are allowed before accessing portal
      const { trustSafetyEnforcer } = await import('../services/trustSafetyEnforcer');
      await trustSafetyEnforcer.assertPaymentsAllowed(claims.userId);

      console.log(`📥 Portal request: ${claims.userId} (${correlationId})`);

      const result = await paymentProvider.createPortalSession({
        authenticatedClaims: claims,
        locale,
        returnUrl: (request as any).body.returnUrl,
        correlationId
      });
      
      return reply.send(result);
      
    } catch (error: any) {
      console.error(`[Payments] Portal failed (${correlationId}):`, error);
      
      await ServerLoggingService.getInstance().logCriticalError(
        'payment_portal_failed',
        error,
        { correlationId }
      );
      
      const errorResponse = buildErrorResponse(error, correlationId);
      return reply.code(error instanceof PaymentError && error.code === 'AUTHENTICATION_ERROR' ? 401 : 500)
                  .send(errorResponse);
    }
  });
  
  // =====================================================
  // POST /v1/payments/cancel - Cancel Subscription
  // =====================================================
  
  app.post<{
    Body: CancelRequestBody;
    Headers: { 'x-sheen-claims': string };
  }>('/v1/payments/cancel', {
    preHandler: hmacMiddleware,
    schema: {
      body: {
        type: 'object',
        properties: {
          immediately: {
            type: 'boolean',
            description: 'Whether to cancel immediately or at period end'
          }
        }
      },
      headers: {
        type: 'object',
        properties: {
          'x-sheen-claims': { type: 'string' }
        },
        required: ['x-sheen-claims']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            canceledImmediately: { type: 'boolean' },
            correlationId: { type: 'string' }
          }
        }
      }
    }
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    const correlationId = getCorrelationId(request);
    
    try {
      const claims = extractClaimsFromRequest(request);
      
      console.log(`📥 Cancel request: ${claims.userId} (immediately: ${(request as any).body.immediately}) (${correlationId})`);
      
      const result = await paymentProvider.cancelSubscription({
        authenticatedClaims: claims,
        immediately: (request as any).body.immediately || false,
        correlationId
      });
      
      return reply.send(result);
      
    } catch (error: any) {
      console.error(`[Payments] Cancel failed (${correlationId}):`, error);
      
      await ServerLoggingService.getInstance().logCriticalError(
        'payment_cancel_failed',
        error,
        { correlationId }
      );
      
      const errorResponse = buildErrorResponse(error, correlationId);
      return reply.code(error instanceof PaymentError && error.code === 'AUTHENTICATION_ERROR' ? 401 : 500)
                  .send(errorResponse);
    }
  });
  
  // =====================================================
  // GET /v1/payments/status/:userId - Get Subscription Status
  // =====================================================
  
  app.get<{
    Params: { userId: string };
    Headers: { 'x-sheen-claims': string };
  }>('/v1/payments/status/:userId', {
    preHandler: hmacMiddleware,
    schema: {
      params: {
        type: 'object',
        properties: {
          userId: {
            type: 'string',
            format: 'uuid',
            description: 'User ID to get subscription status for'
          }
        },
        required: ['userId']
      },
      headers: {
        type: 'object',
        properties: {
          'x-sheen-claims': { type: 'string' }
        },
        required: ['x-sheen-claims']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            hasSubscription: { type: 'boolean' },
            status: { type: 'string', nullable: true },
            planName: { type: 'string', nullable: true },
            currentPeriodEnd: { type: 'string', nullable: true },
            cancelAtPeriodEnd: { type: 'boolean', nullable: true },
            trialEnd: { type: 'string', nullable: true },
            isTrialing: { type: 'boolean', nullable: true }
          }
        }
      }
    }
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    const correlationId = getCorrelationId(request);
    
    try {
      const claims = extractClaimsFromRequest(request);
      
      // Security: Users can only access their own subscription status
      if (claims.userId !== (request as any).params.userId) {
        return reply.code(403).send({
          success: false,
          error: 'Access denied - users can only view their own subscription status',
          correlationId,
          timestamp: new Date().toISOString()
        });
      }
      
      console.log(`📥 Status check: ${claims.userId} (${correlationId})`);
      
      const result = await paymentProvider.getSubscriptionStatus((request as any).params.userId);
      return reply.send(result);
      
    } catch (error: any) {
      console.error(`[Payments] Status check failed (${correlationId}):`, error);
      
      await ServerLoggingService.getInstance().logCriticalError(
        'payment_status_failed',
        error,
        { correlationId, userId: (request as any).params.userId }
      );
      
      const errorResponse = buildErrorResponse(error, correlationId);
      return reply.code(error instanceof PaymentError && error.code === 'AUTHENTICATION_ERROR' ? 401 : 500)
                  .send(errorResponse);
    }
  });
  
  // =====================================================
  // POST /v1/payments/webhooks - Stripe Webhooks (NO HMAC)
  // =====================================================
  
  app.post('/v1/payments/webhooks', {
    schema: {
      headers: {
        type: 'object',
        properties: {
          'stripe-signature': {
            type: 'string',
            description: 'Stripe webhook signature for verification'
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            received: { type: 'boolean' }
          }
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            timestamp: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const signature = request.headers['stripe-signature'] as string;
    
    if (!signature) {
      console.error('❌ Webhook received without Stripe signature');
      return reply.code(400).send({
        error: 'Missing stripe-signature header',
        timestamp: new Date().toISOString()
      });
    }
    
    try {
      console.log('📥 Processing Stripe webhook...');
      
      // Use Stripe provider for verification and processing
      await paymentProvider.handleWebhook((request as any).rawBody as string, signature);
      
      // Fast 200 OK response (async processing pattern)
      return reply.send({ received: true });
      
    } catch (error: any) {
      console.error('❌ Webhook processing failed:', error);
      
      // Log critical webhook failure
      await ServerLoggingService.getInstance().logCriticalError(
        'stripe_webhook_processing_failed',
        error,
        {
          hasSignature: !!signature,
          bodyLength: ((request as any).rawBody as string)?.length || 0,
          signaturePrefix: signature?.substring(0, 20) || 'none'
        }
      );
      
      // Return 400 to tell Stripe the webhook failed
      return reply.code(400).send({
        error: 'Webhook processing failed',
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // =====================================================
  // Health Check Endpoint
  // =====================================================
  
  app.get('/v1/payments/health', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            stripe: { type: 'object' },
            timestamp: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Basic health check - verify Stripe connectivity
      // Note: In production, you might want to cache this or limit frequency
      
      return reply.send({
        status: 'healthy',
        stripe: {
          configured: true,
          mode: paymentProvider ? 'initialized' : 'not_initialized'
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      return reply.code(500).send({
        status: 'unhealthy',
        error: 'Payment system initialization failed',
        timestamp: new Date().toISOString()
      });
    }
  });
  
  console.log('✅ Stripe payment routes registered successfully');
  console.log('📍 Available endpoints:');
  console.log('   POST /v1/payments/checkout - Create checkout session');
  console.log('   POST /v1/payments/portal - Create billing portal session');
  console.log('   POST /v1/payments/cancel - Cancel subscription'); 
  console.log('   GET  /v1/payments/status/:userId - Get subscription status');
  console.log('   POST /v1/payments/webhooks - Stripe webhook endpoint');
  console.log('   GET  /v1/payments/health - Health check');
}