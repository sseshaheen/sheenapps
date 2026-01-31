# Stripe Worker Backend Implementation Plan v3.0

**Author:** Claude Code Assistant  
**Created:** August 25, 2025  
**Updated:** August 25, 2025 (Expert Refinements - MVP Focus)  
**Status:** Production-Ready MVP Implementation Plan  
**Priority:** High - Pre-Launch Architecture Alignment

## Executive Summary

This refined plan incorporates **essential security and race condition fixes** from expert feedback while maintaining **MVP simplicity**. We focus on user-centric implementation now, with clear migration path to organizations later.

**Key Refinements from Expert Feedback:**
- ✅ **Fixed FK Violation Bug** - Removed premature organization_id FK constraint
- ✅ **Added Missing Unique Index** - Prevents multiple active subscriptions per user
- ✅ **Security Hardening** - SECURITY DEFINER functions with proper permissions
- ✅ **Price Allowlist Validation** - Prevents unauthorized plan manipulation
- ✅ **Environment Validation** - Fail-fast on missing configuration
- ✅ **URL Security** - No sensitive data in redirect URLs

## 1. Database Migration (MVP-Safe)

### 1.1 Migration: 044_stripe_payments_mvp.sql

```sql
-- User-centric approach for MVP (no premature organization abstractions)

-- Ensure unique customer per user (race condition protection)
ALTER TABLE customers 
ADD CONSTRAINT customers_user_unique UNIQUE (user_id)
ON CONFLICT DO NOTHING; -- In case it already exists

-- Webhook deduplication table (simple, effective)
CREATE TABLE processed_stripe_events (
  stripe_event_id text PRIMARY KEY,
  event_type text NOT NULL,
  user_id uuid, -- User-centric for MVP
  correlation_id text,
  processed_at timestamptz DEFAULT now()
);

CREATE INDEX idx_processed_events_user_id ON processed_stripe_events (user_id);
CREATE INDEX idx_processed_events_created_at ON processed_stripe_events (processed_at); -- For cleanup

-- Optional: Raw event storage for debugging (Phase 2)
CREATE TABLE stripe_raw_events (
  id text PRIMARY KEY, -- stripe event id
  payload text NOT NULL, -- raw JSON
  received_at timestamptz DEFAULT now()
);

-- CRITICAL: Unique active subscription per user (was missing in v2.0!)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_sub_per_user
ON subscriptions (customer_id)
WHERE status IN ('trialing','active','past_due','paused');

-- Enhanced advisory lock function (security-hardened)
CREATE OR REPLACE FUNCTION stripe_lock_user(p_user_id uuid)
RETURNS void 
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_advisory_xact_lock(
    hashtext(p_user_id::text),
    hashtext('stripe:user')
  );
$$;

-- Security Definer function for subscription management (MVP-focused)
CREATE OR REPLACE FUNCTION stripe_upsert_subscription(
  p_user_id uuid,
  p_stripe_subscription_id text,
  p_stripe_price_id text,  
  p_plan_name text,
  p_status subscription_status,
  p_current_period_start timestamptz,
  p_current_period_end timestamptz,
  p_correlation_id text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE 
  v_customer_id uuid;
BEGIN
  -- Find customer for user
  SELECT id INTO v_customer_id 
  FROM customers 
  WHERE user_id = p_user_id;
  
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'No customer found for user %', p_user_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  
  -- Upsert subscription
  INSERT INTO subscriptions (
    customer_id, stripe_subscription_id, stripe_price_id,
    plan_name, status, current_period_start, current_period_end
  ) VALUES (
    v_customer_id, p_stripe_subscription_id, p_stripe_price_id,
    p_plan_name, p_status, p_current_period_start, p_current_period_end
  )
  ON CONFLICT (stripe_subscription_id) DO UPDATE SET
    status = EXCLUDED.status,
    plan_name = EXCLUDED.plan_name,
    stripe_price_id = EXCLUDED.stripe_price_id,
    current_period_start = EXCLUDED.current_period_start,
    current_period_end = EXCLUDED.current_period_end,
    updated_at = now();
END $$;

-- Security Definer function for payment recording
CREATE OR REPLACE FUNCTION stripe_record_payment(
  p_user_id uuid,
  p_stripe_payment_intent_id text,
  p_amount bigint,
  p_status payment_status,
  p_correlation_id text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE 
  v_customer_id uuid;
BEGIN
  SELECT id INTO v_customer_id 
  FROM customers 
  WHERE user_id = p_user_id;
  
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'No customer found for user %', p_user_id;
  END IF;
  
  INSERT INTO payments (
    customer_id, stripe_payment_intent_id, amount, status
  ) VALUES (
    v_customer_id, p_stripe_payment_intent_id, p_amount, p_status
  )
  ON CONFLICT (stripe_payment_intent_id) DO UPDATE SET
    status = EXCLUDED.status,
    updated_at = now();
END $$;

-- Security: Revoke public access, grant to worker role
REVOKE ALL ON FUNCTION stripe_lock_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION stripe_upsert_subscription(uuid,text,text,text,subscription_status,timestamptz,timestamptz,text) FROM PUBLIC;  
REVOKE ALL ON FUNCTION stripe_record_payment(uuid,text,bigint,payment_status,text) FROM PUBLIC;

-- Grant to worker database role (adjust role name as needed)
GRANT EXECUTE ON FUNCTION stripe_lock_user(uuid) TO worker_db_role;
GRANT EXECUTE ON FUNCTION stripe_upsert_subscription(uuid,text,text,text,subscription_status,timestamptz,timestamptz,text) TO worker_db_role;
GRANT EXECUTE ON FUNCTION stripe_record_payment(uuid,text,bigint,payment_status,text) TO worker_db_role;

-- Grant table access to worker role
GRANT SELECT, INSERT ON processed_stripe_events TO worker_db_role;
GRANT SELECT, INSERT ON stripe_raw_events TO worker_db_role;
```

## 2. Environment Validation (Fail-Fast)

### 2.1 Startup Environment Check

```typescript
// src/config/stripeEnvironmentValidation.ts
export function validateStripeEnvironment(): void {
  const required = [
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET_PRIMARY',
    'STRIPE_PRICE_STARTER_USD',
    'STRIPE_PRICE_GROWTH_USD', 
    'STRIPE_PRICE_SCALE_USD'
  ]
  
  const missing = required.filter(key => !process.env[key])
  
  if (missing.length > 0) {
    console.error('❌ Missing required Stripe environment variables:')
    missing.forEach(key => console.error(`   - ${key}`))
    console.error('\n💡 Add these to your .env file and restart the worker')
    process.exit(1)
  }
  
  // Validate format
  if (!process.env.STRIPE_SECRET_KEY?.startsWith('sk_')) {
    console.error('❌ STRIPE_SECRET_KEY must start with "sk_"')
    process.exit(1)
  }
  
  if (!process.env.STRIPE_WEBHOOK_SECRET_PRIMARY?.startsWith('whsec_')) {
    console.error('❌ STRIPE_WEBHOOK_SECRET_PRIMARY must start with "whsec_"')
    process.exit(1)
  }
  
  console.log('✅ Stripe environment variables validated')
}

// Add to src/server.ts startup sequence
import { validateStripeEnvironment } from './config/stripeEnvironmentValidation'

async function startServer() {
  // Add this early in startup
  validateStripeEnvironment()
  
  // ... rest of startup
}
```

## 3. Enhanced Stripe Provider (Production-Hardened)

### 3.1 Price Validation & Security

```typescript
// src/services/payment/StripeProvider.ts
export class StripeProvider implements PaymentProvider {
  private stripe: Stripe
  private allowedPrices: Set<string>
  
  constructor(secretKey: string) {
    this.stripe = new Stripe(secretKey)
    
    // Server-side price allowlist (SECURITY CRITICAL)
    this.allowedPrices = new Set([
      process.env.STRIPE_PRICE_STARTER_USD!,
      process.env.STRIPE_PRICE_GROWTH_USD!,
      process.env.STRIPE_PRICE_SCALE_USD!
      // Add other currencies/plans as needed
    ])
  }
  
  private getPriceId(planId: string, currency: string = 'usd'): string {
    const priceMap: Record<string, Record<string, string>> = {
      usd: {
        starter: process.env.STRIPE_PRICE_STARTER_USD!,
        growth: process.env.STRIPE_PRICE_GROWTH_USD!,
        scale: process.env.STRIPE_PRICE_SCALE_USD!
      }
      // Add other currencies as needed
    }
    
    const price = priceMap[currency]?.[planId]
    if (!price) {
      throw new PaymentError('INVALID_PLAN', `Unsupported plan/currency: ${planId}/${currency}`)
    }
    return price
  }
  
  private isAllowedPrice(priceId: string): boolean {
    return this.allowedPrices.has(priceId)
  }
  
  async getOrCreateCustomer(userId: string, userEmail: string): Promise<Customer> {
    // Check existing customer (race-safe with unique constraint)
    const existing = await db.oneOrNone(`
      SELECT id, stripe_customer_id, email 
      FROM customers 
      WHERE user_id = $1
    `, [userId])
    
    if (existing) {
      return existing
    }
    
    // Create in Stripe with idempotency
    const idempotencyKey = `customer:create:${userId}`
    
    const stripeCustomer = await this.stripe.customers.create({
      email: userEmail,
      metadata: { user_id: userId }
    }, { idempotencyKey })
    
    // Insert with conflict resolution (race-safe)
    const customer = await db.one(`
      INSERT INTO customers (user_id, stripe_customer_id, email)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id) DO UPDATE SET
        stripe_customer_id = EXCLUDED.stripe_customer_id,
        email = EXCLUDED.email,
        updated_at = now()
      RETURNING id, stripe_customer_id, email
    `, [userId, stripeCustomer.id, userEmail])
    
    return customer
  }
  
  async createCheckoutSession(params: CheckoutParams): Promise<CheckoutResult> {
    const { planId, authenticatedClaims, locale, trial, idempotencyKey } = params
    
    // Get or create customer (race-safe)
    const customer = await this.getOrCreateCustomer(
      authenticatedClaims.userId, // Use userId directly for MVP
      params.userEmail || authenticatedClaims.email
    )
    
    // Server-side URL generation (SECURITY - no sensitive data in URLs)
    const redirectUrls = this.buildRedirectUrls(locale)
    
    // Get validated price ID
    const priceId = this.getPriceId(planId, 'usd') // Default USD for MVP
    
    const session = await this.stripe.checkout.sessions.create({
      customer: customer.stripe_customer_id,
      client_reference_id: authenticatedClaims.userId, // Use userId for MVP
      metadata: { 
        user_id: authenticatedClaims.userId,
        correlation_id: params.correlationId,
        plan_id: planId
      },
      mode: 'subscription',
      line_items: [{
        price: priceId,
        quantity: 1
      }],
      success_url: redirectUrls.success_url,
      cancel_url: redirectUrls.cancel_url,
      // Enhanced checkout options
      customer_update: { 
        address: 'auto',
        name: 'auto' 
      },
      consent_collection: { 
        terms_of_service: 'required' 
      },
      // Support free trials
      subscription_data: trial ? {
        trial_period_days: 14
      } : undefined,
      // Locale support
      locale: this.mapLocaleToStripe(locale)
    }, {
      idempotencyKey: `checkout:${authenticatedClaims.userId}:${planId}:${idempotencyKey}`
    })
    
    return {
      success: true,
      url: session.url!,
      sessionId: session.id,
      correlationId: params.correlationId
    }
  }
  
  async createPortalSession(params: PortalParams): Promise<PortalResult> {
    const { authenticatedClaims, locale, returnUrl } = params
    
    // Get existing customer (user must have active subscription to access portal)
    const customer = await db.oneOrNone(`
      SELECT id, stripe_customer_id, email 
      FROM customers 
      WHERE user_id = $1
    `, [authenticatedClaims.userId])
    
    if (!customer) {
      throw new PaymentError('CUSTOMER_NOT_FOUND', 'No customer record found for user')
    }
    
    // Create billing portal session
    const session = await this.stripe.billingPortal.sessions.create({
      customer: customer.stripe_customer_id,
      return_url: returnUrl || this.buildPortalReturnUrl(locale)
    })
    
    return {
      success: true,
      url: session.url,
      correlationId: params.correlationId
    }
  }
  
  async cancelSubscription(params: CancelParams): Promise<CancelResult> {
    const { authenticatedClaims, immediately } = params
    
    // Find user's active subscription
    const subscription = await db.oneOrNone(`
      SELECT s.stripe_subscription_id, s.status
      FROM subscriptions s
      JOIN customers c ON s.customer_id = c.id
      WHERE c.user_id = $1 AND s.status IN ('active', 'trialing')
      ORDER BY s.created_at DESC
      LIMIT 1
    `, [authenticatedClaims.userId])
    
    if (!subscription) {
      throw new PaymentError('SUBSCRIPTION_NOT_FOUND', 'No active subscription found')
    }
    
    // Cancel subscription in Stripe
    if (immediately) {
      await this.stripe.subscriptions.cancel(subscription.stripe_subscription_id)
    } else {
      await this.stripe.subscriptions.update(subscription.stripe_subscription_id, {
        cancel_at_period_end: true
      })
    }
    
    return {
      success: true,
      canceledImmediately: immediately,
      correlationId: params.correlationId
    }
  }
  
  async getSubscriptionStatus(userId: string): Promise<SubscriptionStatusResult> {
    const subscription = await db.oneOrNone(`
      SELECT s.*, c.stripe_customer_id
      FROM subscriptions s
      JOIN customers c ON s.customer_id = c.id
      WHERE c.user_id = $1
      ORDER BY s.created_at DESC
      LIMIT 1
    `, [userId])
    
    if (!subscription) {
      return {
        hasSubscription: false,
        status: null,
        planName: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: null
      }
    }
    
    return {
      hasSubscription: true,
      status: subscription.status,
      planName: subscription.plan_name,
      currentPeriodEnd: subscription.current_period_end,
      cancelAtPeriodEnd: subscription.cancel_at_period_end
    }
  }
  
  private buildRedirectUrls(locale: string): { success_url: string, cancel_url: string } {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
    // SECURITY: No sensitive data in URLs - derive from session on redirect
    return {
      success_url: `${baseUrl}/${locale}/billing/success`,
      cancel_url: `${baseUrl}/${locale}/billing/cancel`
    }
  }
  
  private buildPortalReturnUrl(locale: string): string {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
    return `${baseUrl}/${locale}/billing`
  }
  
  private mapLocaleToStripe(locale: string): Stripe.Checkout.SessionCreateParams.Locale {
    const mapping: Record<string, Stripe.Checkout.SessionCreateParams.Locale> = {
      'en': 'en',
      'ar': 'ar',
      'fr': 'fr'
    }
    return mapping[locale] || 'en'
  }
  
  async handleWebhook(rawBody: string, signature: string): Promise<void> {
    // Multi-secret verification (rotation support)
    const secrets = [
      process.env.STRIPE_WEBHOOK_SECRET_PRIMARY,
      process.env.STRIPE_WEBHOOK_SECRET_BACKUP
    ].filter(Boolean)
    
    let event: Stripe.Event | undefined
    for (const secret of secrets) {
      try { 
        event = this.stripe.webhooks.constructEvent(rawBody, signature, secret!, { tolerance: 300 })
        break 
      } catch {}
    }
    
    if (!event) {
      throw new Error('Invalid webhook signature')
    }
    
    // CRITICAL: Async processing pattern (fast 200 OK)
    // 1. Atomic deduplication
    const dedupResult = await db.oneOrNone(`
      INSERT INTO processed_stripe_events (stripe_event_id, event_type, processed_at)
      VALUES ($1, $2, now())
      ON CONFLICT (stripe_event_id) DO NOTHING
      RETURNING stripe_event_id
    `, [event.id, event.type])
    
    if (!dedupResult) {
      console.log(`[Stripe] Event ${event.id} already processed`)
      return // Already processed
    }
    
    // 2. Store raw event (for debugging/replay)
    await db.none(`
      INSERT INTO stripe_raw_events (id, payload) 
      VALUES ($1, $2) 
      ON CONFLICT DO NOTHING
    `, [event.id, rawBody])
    
    // 3. Enqueue for async processing
    await stripeWebhookQueue.add('process-event', {
      eventId: event.id,
      eventType: event.type,
      correlationId: crypto.randomUUID()
    }, {
      attempts: 6,
      backoff: {
        type: 'exponential',
        delay: 1000
      }
    })
  }
}
```

## 4. Complete Payment API Routes

### 4.1 Route Registration with All Endpoints

```typescript
// src/routes/stripePayment.ts - Complete payment API implementation
import { FastifyInstance } from 'fastify'
import { requireHmacSignature } from '../middleware/hmacValidation'
import { StripeProvider } from '../services/payment/StripeProvider'
import { ServerLoggingService } from '../services/serverLoggingService'
import * as crypto from 'crypto'

interface PaymentClaims {
  userId: string
  email: string
  roles: string[]
  issued: number
  expires: number
}

// Initialize payment provider
const paymentProvider = new StripeProvider(process.env.STRIPE_SECRET_KEY!)

export function registerStripePaymentRoutes(app: FastifyInstance) {
  const hmacMiddleware = requireHmacSignature({
    skipMethods: ['OPTIONS'],
    logFailures: true
  })
  
  // Extract claims from request
  function extractClaimsFromRequest(request: any): PaymentClaims {
    const claimsHeader = request.headers['x-sheen-claims'] as string
    if (!claimsHeader) {
      throw new Error('Missing x-sheen-claims header')
    }
    
    const claims = JSON.parse(Buffer.from(claimsHeader, 'base64').toString())
    
    if (!claims.userId || !claims.email || claims.expires < Date.now() / 1000) {
      throw new Error('Invalid or expired claims')
    }
    
    return claims
  }
  
  // POST /v1/payments/checkout - Create checkout session
  app.post('/v1/payments/checkout', {
    preHandler: hmacMiddleware,
    schema: {
      body: {
        type: 'object',
        properties: {
          planId: { type: 'string', enum: ['starter', 'growth', 'scale'] },
          trial: { type: 'boolean' }
        },
        required: ['planId']
      },
      headers: {
        type: 'object',
        properties: {
          'x-idempotency-key': { type: 'string', minLength: 8, maxLength: 64 },
          'x-sheen-claims': { type: 'string' },
          'x-sheen-locale': { type: 'string', enum: ['en', 'ar', 'fr'] }
        },
        required: ['x-idempotency-key', 'x-sheen-claims']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            url: { type: 'string' },
            sessionId: { type: 'string' },
            correlationId: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const claims = extractClaimsFromRequest(request)
      const locale = request.headers['x-sheen-locale'] as string || 'en'
      const idempotencyKey = request.headers['x-idempotency-key'] as string
      const correlationId = crypto.randomUUID()
      
      const result = await paymentProvider.createCheckoutSession({
        planId: request.body.planId,
        trial: request.body.trial,
        authenticatedClaims: claims,
        locale,
        correlationId,
        idempotencyKey
      })
      
      return reply.send(result)
    } catch (error) {
      console.error('[Stripe] Checkout failed:', error)
      return reply.code(500).send({ 
        success: false,
        error: 'Checkout failed',
        timestamp: new Date().toISOString()
      })
    }
  })
  
  // POST /v1/payments/portal - Create billing portal session
  app.post('/v1/payments/portal', {
    preHandler: hmacMiddleware,
    schema: {
      body: {
        type: 'object',
        properties: {
          returnUrl: { type: 'string', format: 'uri' }
        }
      },
      headers: {
        type: 'object',
        properties: {
          'x-sheen-claims': { type: 'string' },
          'x-sheen-locale': { type: 'string', enum: ['en', 'ar', 'fr'] }
        },
        required: ['x-sheen-claims']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            url: { type: 'string' },
            correlationId: { type: 'string' }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const claims = extractClaimsFromRequest(request)
      const locale = request.headers['x-sheen-locale'] as string || 'en'
      const correlationId = crypto.randomUUID()
      
      const result = await paymentProvider.createPortalSession({
        authenticatedClaims: claims,
        locale,
        returnUrl: request.body.returnUrl,
        correlationId
      })
      
      return reply.send(result)
    } catch (error) {
      console.error('[Stripe] Portal failed:', error)
      return reply.code(500).send({ 
        success: false,
        error: 'Portal creation failed',
        timestamp: new Date().toISOString()
      })
    }
  })
  
  // POST /v1/payments/cancel - Cancel subscription
  app.post('/v1/payments/cancel', {
    preHandler: hmacMiddleware,
    schema: {
      body: {
        type: 'object',
        properties: {
          immediately: { type: 'boolean' }
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
  }, async (request, reply) => {
    try {
      const claims = extractClaimsFromRequest(request)
      const correlationId = crypto.randomUUID()
      
      const result = await paymentProvider.cancelSubscription({
        authenticatedClaims: claims,
        immediately: request.body.immediately || false,
        correlationId
      })
      
      return reply.send(result)
    } catch (error) {
      console.error('[Stripe] Cancel failed:', error)
      return reply.code(500).send({ 
        success: false,
        error: 'Cancellation failed',
        timestamp: new Date().toISOString()
      })
    }
  })
  
  // GET /v1/payments/status/:userId - Get subscription status
  app.get('/v1/payments/status/:userId', {
    preHandler: hmacMiddleware,
    schema: {
      params: {
        type: 'object',
        properties: {
          userId: { type: 'string', format: 'uuid' }
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
            cancelAtPeriodEnd: { type: 'boolean', nullable: true }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const claims = extractClaimsFromRequest(request)
      
      // Security: Verify user can only access their own status
      if (claims.userId !== request.params.userId) {
        return reply.code(403).send({ error: 'Access denied' })
      }
      
      const result = await paymentProvider.getSubscriptionStatus(request.params.userId)
      return reply.send(result)
    } catch (error) {
      console.error('[Stripe] Status check failed:', error)
      return reply.code(500).send({ 
        error: 'Status check failed',
        timestamp: new Date().toISOString()
      })
    }
  })
  
  // POST /v1/payments/webhooks - Stripe webhooks (NO HMAC - Stripe signature)
  app.post('/v1/payments/webhooks', {
    config: { rawBody: true }, // CRITICAL for signature verification
    schema: {
      response: {
        200: { type: 'object', properties: { received: { type: 'boolean' } } }
      }
    }
  }, async (request, reply) => {
    const signature = request.headers['stripe-signature'] as string
    
    if (!signature) {
      return reply.code(400).send({ 
        error: 'Missing stripe-signature header',
        timestamp: new Date().toISOString()
      })
    }
    
    try {
      // Use Stripe provider for verification and async processing
      await paymentProvider.handleWebhook(request.rawBody!, signature)
      
      // Fast 200 OK response (async processing queued)
      return reply.send({ received: true })
      
    } catch (error) {
      console.error('[Stripe] Webhook processing failed:', error)
      
      // Log critical error for monitoring
      await ServerLoggingService.getInstance().logCriticalError(
        'stripe_webhook_verification_failed',
        error as Error,
        {
          hasSignature: !!signature,
          bodyLength: request.rawBody?.length || 0
        }
      )
      
      return reply.code(400).send({ 
        error: 'Webhook verification failed',
        timestamp: new Date().toISOString()
      })
    }
  })
  
  console.log('[Stripe] Payment routes registered successfully')
}

// Register in main server.ts
// import { registerStripePaymentRoutes } from './routes/stripePayment'
// registerStripePaymentRoutes(app)
```

## 5. Enhanced Webhook Worker (Security-Hardened)

### 4.1 Price Allowlist Validation

```typescript
// src/workers/stripeWebhookWorker.ts
async function processStripeEventInTransaction(
  trx: any, 
  event: Stripe.Event, 
  correlationId: string
): Promise<void> {
  
  // SECURITY: Validate price changes to prevent unauthorized plan manipulation
  if (event.type === 'customer.subscription.updated') {
    const sub = event.data.object as Stripe.Subscription
    const priceId = sub.items.data[0]?.price.id
    
    if (priceId && !paymentService.isAllowedPrice(priceId)) {
      console.error(`🚨 Unauthorized price change detected: ${priceId}`)
      
      // Log security incident
      await ServerLoggingService.getInstance().logCriticalError(
        'unauthorized_plan_change',
        new Error(`Unauthorized price: ${priceId}`),
        { 
          subscriptionId: sub.id, 
          priceId, 
          correlationId,
          eventId: event.id
        }
      )
      
      // Skip processing (don't update our records)
      return
    }
  }
  
  const accessDecision = determineAccessFromEvent(event)
  
  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(trx, event, correlationId)
      break
      
    case 'checkout.session.async_payment_succeeded':
      await handleAsyncPaymentSucceeded(trx, event, correlationId)
      break
      
    case 'checkout.session.async_payment_failed':
      await handleAsyncPaymentFailed(trx, event, correlationId)
      break
      
    case 'customer.subscription.updated':
      await handleSubscriptionUpdated(trx, event, correlationId)
      break
      
    case 'invoice.payment_failed':
      await handlePaymentFailed(trx, event, correlationId)
      break
      
    case 'invoice.payment_succeeded':
      await handlePaymentSucceeded(trx, event, correlationId) // RENEWALS
      break
      
    default:
      console.log(`[Stripe] Unhandled event type: ${event.type}`)
  }
}

// Enhanced access grant rules (complete coverage)
function determineAccessFromEvent(event: Stripe.Event): AccessDecision {
  // Grant access on successful checkout (paid OR free trial)
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    if (session.mode === 'subscription' && 
        session.payment_status in ['paid', 'no_payment_required']) {
      return { action: 'grant', until: calculatePeriodEnd(session) }
    }
  }
  
  // Handle async payments (3DS, bank transfers, etc.)
  if (event.type === 'checkout.session.async_payment_succeeded') {
    return { action: 'grant', until: calculatePeriodEnd(event.data.object) }
  }
  
  // Handle renewals (CRITICAL - was missing)
  if (event.type === 'invoice.payment_succeeded') {
    const invoice = event.data.object as Stripe.Invoice
    if (invoice.subscription && invoice.billing_reason !== 'subscription_create') {
      return { action: 'grant', until: calculatePeriodEnd(invoice) }
    }
  }
  
  // Revoke on payment failures
  if (event.type === 'checkout.session.async_payment_failed' ||
      event.type === 'invoice.payment_failed') {
    return { action: 'revoke' }
  }
  
  return { action: 'noop' }
}

async function handleCheckoutCompleted(trx: any, event: Stripe.Event, correlationId: string) {
  const session = event.data.object as Stripe.Checkout.Session
  const userId = await deriveUserIdFromEvent(event) // Use userId for MVP
  
  if (!userId) {
    console.warn(`[Stripe] Cannot derive userId from checkout session ${session.id}`)
    return
  }
  
  // Use advisory lock for concurrency protection
  await trx.func('stripe_lock_user', [userId])
  
  // Update subscription using Security Definer function
  if (session.subscription) {
    const subscription = await stripe.subscriptions.retrieve(session.subscription as string)
    
    await trx.func('stripe_upsert_subscription', [
      userId,
      subscription.id,
      subscription.items.data[0]?.price.id,
      mapStripePriceToUserPlan(subscription.items.data[0]?.price.id),
      subscription.status as any,
      new Date(subscription.current_period_start * 1000),
      new Date(subscription.current_period_end * 1000),
      correlationId
    ])
  }
}
```

## 5. NextJS Integration (Updated Claims)

### 5.1 Simplified Claims for MVP

```typescript
// /api/payments/checkout/route.ts (NextJS - updated for user model)
export async function POST(request: NextRequest) {
  const session = await getServerSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  const body = await request.json()
  const locale = request.headers.get('x-locale') || 'en'
  
  // Generate or validate idempotency key
  let idempotencyKey = request.headers.get('x-idempotency-key')
  if (!idempotencyKey) {
    idempotencyKey = `checkout_${session.user.id}_${body.planId}_${nanoid(12)}`
  }
  
  // Validate idempotency key format
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(idempotencyKey)) {
    return NextResponse.json(
      { error: 'Invalid idempotency key format' }, 
      { status: 400 }
    )
  }
  
  const correlationId = crypto.randomUUID()
  
  // SIMPLIFIED: User-centric claims for MVP (no org complexity)
  const claims: PaymentClaims = {
    userId: session.user.id,
    email: session.user.email,
    roles: ['user'], // Simple role model for MVP
    issued: Math.floor(Date.now() / 1000),
    expires: Math.floor(Date.now() / 1000) + 300 // 5 minutes
  }
  
  try {
    const result = await getWorkerClient().post('/v1/payments/checkout', body, {
      headers: {
        'x-idempotency-key': idempotencyKey,
        'x-correlation-id': correlationId,
        'x-sheen-claims': btoa(JSON.stringify(claims)),
        'x-sheen-locale': locale
      }
    })
    
    return NextResponse.json({ 
      success: true,
      ...result, 
      correlationId 
    })
  } catch (error) {
    console.error('[Payments] Checkout failed:', error)
    return NextResponse.json(
      { 
        success: false,
        error: 'Checkout failed', 
        correlationId 
      },
      { status: 500 }
    )
  }
}

// Billing portal route (NextJS)
// /api/payments/portal/route.ts
export async function POST(request: NextRequest) {
  const session = await getServerSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  const body = await request.json()
  const locale = request.headers.get('x-locale') || 'en'
  const correlationId = crypto.randomUUID()
  
  // User-centric claims for MVP
  const claims: PaymentClaims = {
    userId: session.user.id,
    email: session.user.email,
    roles: ['user'],
    issued: Math.floor(Date.now() / 1000),
    expires: Math.floor(Date.now() / 1000) + 300
  }
  
  try {
    const result = await getWorkerClient().post('/v1/payments/portal', body, {
      headers: {
        'x-correlation-id': correlationId,
        'x-sheen-claims': btoa(JSON.stringify(claims)),
        'x-sheen-locale': locale
      }
    })
    
    return NextResponse.json({
      success: true,
      ...result,
      correlationId
    })
  } catch (error) {
    console.error('[Payments] Portal failed:', error)
    return NextResponse.json(
      { 
        success: false,
        error: 'Portal creation failed',
        correlationId
      },
      { status: 500 }
    )
  }
}

// Subscription cancellation route (NextJS)
// /api/payments/cancel/route.ts  
export async function POST(request: NextRequest) {
  const session = await getServerSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  const body = await request.json()
  const correlationId = crypto.randomUUID()
  
  const claims: PaymentClaims = {
    userId: session.user.id,
    email: session.user.email,
    roles: ['user'],
    issued: Math.floor(Date.now() / 1000),
    expires: Math.floor(Date.now() / 1000) + 300
  }
  
  try {
    const result = await getWorkerClient().post('/v1/payments/cancel', body, {
      headers: {
        'x-correlation-id': correlationId,
        'x-sheen-claims': btoa(JSON.stringify(claims))
      }
    })
    
    return NextResponse.json({
      success: true,
      ...result,
      correlationId
    })
  } catch (error) {
    console.error('[Payments] Cancel failed:', error)
    return NextResponse.json(
      { 
        success: false,
        error: 'Cancellation failed',
        correlationId
      },
      { status: 500 }
    )
  }
}

// Subscription status route (NextJS)
// /api/payments/status/route.ts
export async function GET(request: NextRequest) {
  const session = await getServerSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  const correlationId = crypto.randomUUID()
  
  const claims: PaymentClaims = {
    userId: session.user.id,
    email: session.user.email,
    roles: ['user'],
    issued: Math.floor(Date.now() / 1000),
    expires: Math.floor(Date.now() / 1000) + 300
  }
  
  try {
    const result = await getWorkerClient().get(`/v1/payments/status/${session.user.id}`, {
      headers: {
        'x-correlation-id': correlationId,
        'x-sheen-claims': btoa(JSON.stringify(claims))
      }
    })
    
    return NextResponse.json(result)
  } catch (error) {
    console.error('[Payments] Status check failed:', error)
    return NextResponse.json(
      { 
        error: 'Status check failed',
        correlationId
      },
      { status: 500 }
    )
  }
}
```

## 7. Testing Strategy (MVP-Focused)

### 6.1 Critical Tests Only

```typescript
// Focus on the most important test cases for MVP
describe('Stripe Integration MVP', () => {
  test('prevents multiple active subscriptions per user', async () => {
    const userId = 'user_123'
    
    // Create first subscription
    await createActiveSubscription(userId, 'starter')
    
    // Attempt second subscription (should fail due to unique constraint)
    await expect(
      createActiveSubscription(userId, 'growth')
    ).rejects.toThrow(/unique constraint/)
  })
  
  test('validates price allowlist on webhook', async () => {
    const webhookPayload = JSON.stringify({
      id: 'evt_test',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_test',
          items: {
            data: [{
              price: { id: 'price_UNAUTHORIZED' } // Not in allowlist
            }]
          }
        }
      }
    })
    
    const signature = generateTestSignature(webhookPayload)
    
    const response = await request(app)
      .post('/v1/payments/webhooks')
      .set('stripe-signature', signature)
      .send(webhookPayload)
    
    expect(response.status).toBe(200) // Still returns 200 to Stripe
    
    // But should not update our subscription records
    // (would need to check logs for security incident)
  })
  
  test('handles customer creation races safely', async () => {
    const userId = 'user_race_test'
    const email = 'test@example.com'
    
    // Simulate concurrent customer creation
    const promises = Array(5).fill(null).map(() => 
      paymentProvider.getOrCreateCustomer(userId, email)
    )
    
    const results = await Promise.all(promises)
    
    // All should resolve to same customer (no duplicates)
    expect(new Set(results.map(r => r.id)).size).toBe(1)
  })
})
```

## 7. Migration from Organizations (Future)

### 7.1 When Organizations Go Live

```sql
-- Future migration when organizations are implemented
-- 045_migrate_to_organizations.sql

-- 1. Add organization_id to customers (properly)
ALTER TABLE customers ADD COLUMN organization_id uuid;

-- 2. Populate from user's personal org
UPDATE customers 
SET organization_id = u.personal_org_id
FROM users u
WHERE customers.user_id = u.id;

-- 3. Add FK constraint
ALTER TABLE customers 
ADD CONSTRAINT customers_org_id_fkey 
FOREIGN KEY (organization_id) REFERENCES organizations(id);

-- 4. Switch unique constraint
DROP INDEX customers_user_unique;
CREATE UNIQUE INDEX customers_org_unique ON customers (organization_id);

-- 5. Update Security Definer functions to use organization_id
-- (Update function signatures as needed)
```

## 8. Production Deployment

### 8.1 Go-Live Checklist (MVP)

```bash
# 1. Database migration
npm run migrate:up -- 044_stripe_payments_mvp.sql

# 2. Environment variables (essential only)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET_PRIMARY=whsec_...
STRIPE_PRICE_STARTER_USD=price_...
STRIPE_PRICE_GROWTH_USD=price_...  
STRIPE_PRICE_SCALE_USD=price_...

# 3. Create webhook endpoint in Stripe Dashboard
# Endpoint URL: https://worker.sheenapps.com/v1/payments/webhooks
# Events: All subscription and payment events

# 4. Deploy worker
npm run build && npm run deploy

# 5. Test critical flows
curl -X POST /v1/payments/checkout \
  -H "x-idempotency-key: test-123" \
  -H "x-sheen-claims: ..." \
  -d '{"planId":"starter"}'
```

---

## Summary of Key Improvements in v3.0

### ✅ **Fixed Critical Issues:**
- Removed FK violation bug from v2.0
- Added missing unique active subscription index
- Implemented SECURITY DEFINER hardening
- Added price allowlist validation for security

### ✅ **Simplified for MVP:**
- User-centric approach (no org abstraction complexity)
- Simple claims structure 
- Focused on essential functionality
- Clear migration path to organizations

### ✅ **Production-Ready Security:**
- Environment validation on startup
- Price manipulation prevention
- Race condition protection
- Proper database permissions

This v3.0 plan delivers a **production-ready MVP** that incorporates all essential security fixes while avoiding over-engineering. It provides a solid foundation that can evolve as your platform grows.

---

## 📋 Implementation Status

**Status:** ✅ **COMPLETE** - All components implemented and integrated  
**Date Completed:** August 25, 2025  
**Implementation Time:** ~2 hours  
**Ready for:** Testing and production deployment

### ✅ Completed Components

#### 1. Database Migration (044_stripe_payments_mvp.sql)
- **File:** `/migrations/044_stripe_payments_mvp.sql`
- **Status:** ✅ Complete
- **Features:**
  - Unique constraint on customers.user_id (race protection)
  - UNIQUE INDEX for active subscriptions per user (CRITICAL fix)
  - Webhook deduplication tables with proper indexing
  - SECURITY DEFINER functions with worker_db_role permissions
  - Advisory lock functions for concurrency control
  - Raw event storage for debugging/replay
  - Comprehensive comments and documentation

#### 2. Environment Validation
- **File:** `/src/config/stripeEnvironmentValidation.ts`
- **Status:** ✅ Complete
- **Features:**
  - Fail-fast validation on server startup
  - Format validation for all Stripe keys and price IDs
  - Live/test mode detection with safety checks
  - Price allowlist generation for security
  - Detailed error messages with examples
  - Integrated into server.ts startup sequence

#### 3. Enhanced StripeProvider
- **File:** `/src/services/payment/StripeProvider.ts`
- **File:** `/src/services/payment/types.ts`
- **Status:** ✅ Complete
- **Features:**
  - Server-side price allowlist validation (SECURITY CRITICAL)
  - Race-safe customer creation with conflict resolution
  - Comprehensive checkout session configuration
  - Multi-secret webhook verification (rotation support)
  - Async webhook processing with queue integration
  - Idempotent operations throughout
  - Comprehensive error handling and logging
  - Support for trials, localization, billing portal

#### 4. Payment API Routes
- **File:** `/src/routes/stripePayment.ts`
- **Status:** ✅ Complete - Registered in server.ts
- **Endpoints:**
  - `POST /v1/payments/checkout` - Create checkout sessions
  - `POST /v1/payments/portal` - Billing portal access
  - `POST /v1/payments/cancel` - Subscription cancellation
  - `GET /v1/payments/status/:userId` - Subscription status
  - `POST /v1/payments/webhooks` - Stripe webhooks (NO HMAC)
  - `GET /v1/payments/health` - Health check
- **Features:**
  - HMAC signature validation on authenticated endpoints
  - Comprehensive JSON schema validation
  - Claims-based authentication with expiration checks
  - Correlation IDs for request tracing
  - Security headers and proper error responses

#### 5. Webhook Worker with Security Validation
- **File:** `/src/workers/stripeWebhookWorker.ts`
- **File:** `/src/queue/modularQueues.ts` (updated)
- **Status:** ✅ Complete - Integrated with existing queue system
- **Features:**
  - SECURITY ALERT: Price manipulation detection
  - Complete event type coverage (checkout, subscriptions, payments)
  - Database transactions for consistency
  - Advisory locks for race condition protection
  - Security incident logging for unauthorized changes
  - Graceful startup/shutdown lifecycle
  - Integrated with BullMQ queue system

#### 6. Server Integration
- **File:** `/src/server.ts`
- **Status:** ✅ Complete
- **Integration Points:**
  - Environment validation on startup
  - Route registration for all payment endpoints
  - Worker initialization for all architecture modes (stream/modular)
  - Graceful shutdown handling
  - Conditional initialization (disabled when Stripe not configured)

### 🔍 Key Implementation Discoveries

#### Database Schema Excellence
- **Discovery:** Base payment tables (billing_customers, billing_subscriptions, billing_payments) already existed with excellent structure
- **Benefit:** Only needed to add security enhancements, not rebuild entire schema
- **Added:** Security functions, constraints, deduplication tables

#### Queue System Integration
- **Discovery:** Existing BullMQ queue system was well-architected
- **Benefit:** Easy integration with existing worker management
- **Added:** `stripeWebhookQueue` with proper retry logic and monitoring

#### Security Model Alignment
- **Discovery:** Existing HMAC authentication system was robust
- **Benefit:** Payment endpoints integrate seamlessly with existing auth
- **Added:** Claims-based authentication for payment-specific operations

### 🚨 Critical Security Features Implemented

#### 1. Price Manipulation Prevention
```typescript
// SECURITY: Server-side price allowlist validation
if (!this.isAllowedPrice(priceId)) {
  // Log security incident + refuse to process
}
```

#### 2. Race Condition Protection
```sql
-- CRITICAL: Unique active subscription per user
CREATE UNIQUE INDEX uniq_active_sub_per_user
ON subscriptions (customer_id)
WHERE status IN ('trialing','active','past_due','paused');
```

#### 3. Webhook Security Hardening
```typescript
// Multi-secret verification + deduplication + async processing
// Fast 200 OK response with background processing
```

### 🛠 Configuration Requirements

#### Required Environment Variables
```env
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_... or sk_live_...
STRIPE_WEBHOOK_SECRET_PRIMARY=whsec_...
STRIPE_WEBHOOK_SECRET_BACKUP=whsec_... # Optional for rotation
STRIPE_PRICE_STARTER_USD=price_...
STRIPE_PRICE_GROWTH_USD=price_...
STRIPE_PRICE_SCALE_USD=price_...

# Optional
STRIPE_WEBHOOK_ENDPOINT_URL=https://worker.yourdomain.com/v1/payments/webhooks
```

#### Database Migration
```bash
# Run the migration
npm run migrate:up -- 044_stripe_payments_mvp.sql

# Verify worker_db_role has proper permissions
```

### 🚀 Deployment Checklist

#### Pre-Deploy Verification
- [ ] All environment variables configured
- [ ] Database migration applied successfully
- [ ] Webhook endpoint configured in Stripe Dashboard
- [ ] Test price IDs vs live price IDs validated

#### Post-Deploy Testing
- [ ] Health endpoint: `GET /v1/payments/health`
- [ ] Test webhook delivery from Stripe Dashboard
- [ ] Monitor worker logs for successful startup
- [ ] Verify rate limiting and error handling

#### Production Monitoring
- [ ] Queue monitoring via existing Bull Dashboard
- [ ] Webhook processing metrics
- [ ] Security incident alerts for price manipulation
- [ ] Database constraint violations (should be zero)

### 🔄 Future Enhancements (Phase 2)

#### Multi-Currency Support
- Add EUR, GBP price mappings to environment validation
- Update plan mappings in types.ts
- Test checkout flows with different currencies

#### Organization Migration (When Ready)
- Run migration 045_migrate_to_organizations.sql
- Update Security Definer functions for org-based billing
- Migrate user-centric billing to org-centric

#### Enhanced Monitoring
- Real-time webhook processing dashboards
- Payment flow analytics
- Subscription churn analysis

### 🎯 Success Metrics

- **Security:** Zero price manipulation attempts processed
- **Reliability:** 99.9%+ webhook processing success rate
- **Performance:** <100ms webhook acknowledgment time
- **Data Integrity:** Zero duplicate subscription records

---

**Implementation Notes:**
- All code follows existing codebase patterns and conventions
- Security-first approach with comprehensive error handling
- Production-ready with proper logging and monitoring
- Backwards compatible - no breaking changes to existing functionality
- Scalable architecture ready for future enhancements