# Stripe Implementation Guide

## Overview
This document covers the Stripe-specific implementation for payment processing in SheenApps, including checkout flow, webhook handling, tax configuration, and billing portal integration.

## Architecture

### Key Components
1. **Checkout API** - Create Stripe checkout sessions
2. **Webhook Handler** - Process Stripe events
3. **Customer Portal** - Subscription management
4. **Tax Handling** - Automatic tax calculation

## Environment Variables

```env
# Stripe Keys
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# Stripe Price IDs (USD)
STRIPE_PRICE_ID_STARTER_USD=price_xxx
STRIPE_PRICE_ID_GROWTH_USD=price_xxx
STRIPE_PRICE_ID_SCALE_USD=price_xxx

# Stripe Price IDs (EUR)
STRIPE_PRICE_ID_STARTER_EUR=price_xxx
STRIPE_PRICE_ID_GROWTH_EUR=price_xxx
STRIPE_PRICE_ID_SCALE_EUR=price_xxx

# Application URL (for redirects)
NEXT_PUBLIC_BASE_URL=https://sheenapps.com
```

## Stripe SDK Configuration

```typescript
// src/lib/stripe.ts
import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
  typescript: true,
});

// Stripe configuration options
export const STRIPE_CONFIG = {
  // Retry configuration
  maxNetworkRetries: 3,
  timeout: 10000, // 10 seconds
  
  // Webhook tolerance
  webhookTolerance: 300, // 5 minutes
};
```

## API Implementations

### Create Checkout Session

```typescript
// src/app/api/stripe/create-checkout/route.ts
import { stripe } from '@/lib/stripe';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { planName, priceId } = await request.json();
    const userId = await requireAuth(request);
    const user = await getUserDetails(userId);
    
    // Create or retrieve Stripe customer
    let customerId = await getStripeCustomerId(userId);
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          user_id: userId,
        },
      });
      customerId = customer.id;
      await saveStripeCustomerId(userId, customerId);
    }
    
    // Generate idempotency key
    const idempotencyKey = `checkout_${userId}_${planName}_${Date.now()}`;
    
    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{
        price: priceId,
        quantity: 1,
      }],
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/dashboard/billing?success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/pricing`,
      
      // Enable automatic tax
      automatic_tax: {
        enabled: true,
      },
      
      // Allow promotion codes
      allow_promotion_codes: true,
      
      // Collect tax ID
      tax_id_collection: {
        enabled: true,
      },
      
      // Customer information
      customer_update: {
        address: 'auto',
        name: 'auto',
      },
      
      // Subscription data
      subscription_data: {
        metadata: {
          user_id: userId,
          plan_name: planName,
        },
        trial_period_days: 14, // If applicable
      },
      
      // Session metadata
      metadata: {
        user_id: userId,
        plan_name: planName,
      },
    }, {
      idempotencyKey,
    });
    
    return NextResponse.json({ url: session.url });
    
  } catch (error: any) {
    console.error('Checkout session creation failed:', error);
    
    // Handle specific Stripe errors
    if (error.type === 'StripeCardError') {
      return NextResponse.json(
        { error: 'Card was declined' },
        { status: 400 }
      );
    }
    
    if (error.code === 'idempotency_key_in_use') {
      // Handle duplicate request
      return NextResponse.json(
        { error: 'Checkout already in progress' },
        { status: 409 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
```

### Webhook Handler

```typescript
// src/app/api/stripe-webhook/route.ts
import { stripe } from '@/lib/stripe';
import { headers } from 'next/headers';

export async function POST(request: Request) {
  const body = await request.text();
  const signature = headers().get('stripe-signature')!;
  
  let event: Stripe.Event;
  
  try {
    // Verify webhook signature
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (error: any) {
    console.error('Webhook signature verification failed:', error.message);
    return new Response('Invalid signature', { status: 400 });
  }
  
  try {
    // Handle webhook events
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutComplete(event.data.object as Stripe.Checkout.Session);
        break;
        
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object as Stripe.Subscription);
        break;
        
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
        
      case 'customer.subscription.deleted':
        await handleSubscriptionCanceled(event.data.object as Stripe.Subscription);
        break;
        
      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;
        
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;
        
      case 'customer.subscription.trial_will_end':
        await handleTrialEnding(event.data.object as Stripe.Subscription);
        break;
        
      default:
        console.log(`Unhandled webhook event: ${event.type}`);
    }
    
    return new Response('Webhook processed', { status: 200 });
    
  } catch (error: any) {
    console.error('Webhook processing failed:', error);
    
    // Add to dead letter queue for retry
    await addToDeadLetterQueue({
      gateway: 'stripe',
      eventId: event.id,
      eventType: event.type,
      payload: event,
      error: error.message,
    });
    
    // Return success to prevent Stripe retries
    return new Response('Webhook received', { status: 200 });
  }
}

// Event handlers
async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.user_id;
  const planName = session.metadata?.plan_name;
  
  if (!userId || !planName) {
    throw new Error('Missing metadata in checkout session');
  }
  
  // Create transaction record
  await createTransaction({
    userId,
    gateway: 'stripe',
    gatewayTransactionId: session.id,
    status: 'completed',
    amount: session.amount_total! / 100,
    currency: session.currency!,
    planName,
    productType: 'subscription',
  });
  
  // Update user subscription
  await updateUserSubscription({
    userId,
    stripeCustomerId: session.customer as string,
    stripeSubscriptionId: session.subscription as string,
    planName,
    status: 'active',
  });
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  await updateSubscriptionStatus({
    stripeSubscriptionId: subscription.id,
    status: subscription.status,
    currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  });
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  // Log failed payment
  await logFailedPayment({
    customerId: invoice.customer as string,
    amount: invoice.amount_due / 100,
    currency: invoice.currency,
    attemptCount: invoice.attempt_count,
    nextPaymentAttempt: invoice.next_payment_attempt 
      ? new Date(invoice.next_payment_attempt * 1000) 
      : null,
  });
  
  // Send payment failure notification
  if (invoice.attempt_count === 1) {
    await sendPaymentFailureEmail(invoice.customer as string);
  }
}
```

### Customer Portal

```typescript
// src/app/api/billing/portal/route.ts
export async function POST(request: NextRequest) {
  try {
    const userId = await requireAuth(request);
    const customerId = await getStripeCustomerId(userId);
    
    if (!customerId) {
      return NextResponse.json(
        { error: 'No billing account found' },
        { status: 404 }
      );
    }
    
    // Create portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${process.env.NEXT_PUBLIC_BASE_URL}/dashboard/billing`,
    });
    
    return NextResponse.json({ url: session.url });
    
  } catch (error) {
    console.error('Portal session creation failed:', error);
    return NextResponse.json(
      { error: 'Failed to create portal session' },
      { status: 500 }
    );
  }
}
```

## Tax Configuration

### Automatic Tax Setup
```typescript
// Configure Stripe Tax in the dashboard or via API
const taxConfiguration = await stripe.tax.registrations.create({
  country: 'US',
  state: 'CA',
  type: 'sales_tax',
});

// For EU VAT
const euTaxConfig = await stripe.tax.registrations.create({
  country: 'DE',
  type: 'vat',
});
```

### Tax-Inclusive Pricing
```typescript
// Display tax-inclusive prices for EU
function getPriceDisplay(priceId: string, country: string): string {
  const isEU = EU_COUNTRIES.includes(country);
  const price = PRICES[priceId];
  
  if (isEU) {
    // Show tax-inclusive price
    return `€${price.eur} (incl. VAT)`;
  } else {
    // Show price without tax
    return `$${price.usd} (+ tax)`;
  }
}
```

## Idempotency & Reliability

### Idempotency Key Generation
```typescript
export function generateIdempotencyKey(
  operation: string,
  userId: string,
  uniqueId?: string
): string {
  const timestamp = Date.now();
  const id = uniqueId || crypto.randomUUID();
  return `${operation}_${userId}_${timestamp}_${id}`;
}

// Usage examples
const checkoutKey = generateIdempotencyKey('checkout', userId, planId);
const refundKey = generateIdempotencyKey('refund', userId, chargeId);
const updateKey = generateIdempotencyKey('update_sub', userId, subscriptionId);
```

### Error Handling
```typescript
export async function stripeApiCall<T>(
  operation: () => Promise<T>,
  idempotencyKey: string
): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    // Handle idempotency conflicts
    if (error.code === 'idempotency_key_in_use') {
      // Return cached result
      return await retrieveCachedResult(idempotencyKey);
    }
    
    // Handle rate limits
    if (error.code === 'rate_limit') {
      // Implement exponential backoff
      await delay(calculateBackoff(error.retry_after));
      return stripeApiCall(operation, idempotencyKey);
    }
    
    // Log and re-throw
    logger.error('Stripe API error:', {
      error: error.message,
      code: error.code,
      type: error.type,
      idempotencyKey,
    });
    
    throw error;
  }
}
```

## Testing

### Test Cards
```
Success:              4242 4242 4242 4242
Requires auth:        4000 0025 0000 3155
Declined:             4000 0000 0000 0002
Insufficient funds:   4000 0000 0000 9995
```

### Webhook Testing
```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login to Stripe
stripe login

# Forward webhooks to local
stripe listen --forward-to localhost:3000/api/stripe-webhook

# Trigger test events
stripe trigger payment_intent.succeeded
stripe trigger customer.subscription.created
```

### Test Utilities
```typescript
// src/__tests__/stripe-test-utils.ts
export function createMockCheckoutSession(): Stripe.Checkout.Session {
  return {
    id: 'cs_test_123',
    customer: 'cus_test_123',
    subscription: 'sub_test_123',
    amount_total: 2900,
    currency: 'usd',
    metadata: {
      user_id: 'user_123',
      plan_name: 'growth',
    },
    status: 'complete',
  } as Stripe.Checkout.Session;
}

export function createMockWebhookEvent(
  type: string,
  data: any
): Stripe.Event {
  return {
    id: 'evt_test_123',
    type,
    data: {
      object: data,
    },
    created: Date.now() / 1000,
  } as Stripe.Event;
}
```

## Security Considerations

### Webhook Security
- Always verify webhook signatures
- Use webhook endpoints only for Stripe
- Don't process duplicate events
- Return 200 even on errors (prevent retries)

### API Security
- Never expose secret keys
- Use server-side API only
- Validate all inputs
- Implement rate limiting

### Data Security
- Don't store card details
- Use Stripe customer IDs
- Encrypt sensitive metadata
- Audit all operations

## Best Practices

### Do's
- Use idempotency keys for all mutations
- Handle all webhook events asynchronously
- Implement proper error handling
- Monitor webhook health
- Test with Stripe CLI

### Don'ts
- Don't hardcode price IDs
- Don't trust client-side data
- Don't skip webhook verification
- Don't store sensitive data
- Don't ignore failed payments

## Common Issues & Solutions

### Duplicate Customers
```typescript
// Always check for existing customer
const existing = await stripe.customers.list({
  email: userEmail,
  limit: 1,
});

if (existing.data.length > 0) {
  return existing.data[0];
}
```

### Webhook Timeout
```typescript
// Process webhook asynchronously
export async function POST(request: Request) {
  const event = await verifyWebhook(request);
  
  // Queue for processing
  await queueWebhookEvent(event);
  
  // Return immediately
  return new Response('OK', { status: 200 });
}
```

### Currency Mismatch
```typescript
// Validate currency consistency
if (session.currency !== expectedCurrency) {
  throw new Error(`Currency mismatch: expected ${expectedCurrency}, got ${session.currency}`);
}
```

---

*Last Updated: 27 June 2025*
*Stripe API Version: 2023-10-16*

## Related Documentation
- [Billing Architecture Overview](./BILLING_ARCHITECTURE.md)
- [Multi-Gateway Architecture](./MULTI_GATEWAY.md)
- [Webhook Reliability](./WEBHOOK_RELIABILITY.md)
- [Usage Tracking](./USAGE_TRACKING.md)
- [Admin Dashboard](./ADMIN_DASHBOARD.md)