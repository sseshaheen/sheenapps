# Adding New Payment Providers

**Date**: September 2, 2025  
**Status**: Implementation Guide  
**Purpose**: Step-by-step guide for adding new regional payment providers

## 📋 **Prerequisites**

Before adding a new provider, ensure you have:
- [ ] Provider API credentials and documentation
- [ ] Understanding of provider's webhook signature verification
- [ ] Knowledge of supported currencies and payment methods
- [ ] Compliance requirements (e.g., Arabic locale, phone validation)

## 🛠️ **Implementation Steps**

### **Step 1: Update Provider Capabilities**

Add your provider to the capabilities matrix in `src/services/payment/enhancedTypes.ts`:

```typescript
// Add to PaymentProviderKey type
export type PaymentProviderKey = 'stripe' | 'fawry' | 'paymob' | 'stcpay' | 'paytabs' | 'newprovider';

// Add to PROVIDER_CAPABILITIES
export const PROVIDER_CAPABILITIES: Record<PaymentProviderKey, ProviderCapabilities> = {
  // ... existing providers
  newprovider: {
    supports: {
      subscription: true, // or false
      oneTime: true,
      partialRefunds: false, // depends on provider
      currencies: ['SAR'], // supported currencies
      paymentMethods: ['card'], // card, wallet, cash, bank_transfer
      webhooks: ['payment_succeeded', 'payment_failed'] // supported webhook events
    },
    settlementDays: 2,
    requiresPhone: true, // if provider requires phone number
    requiresArabicLocale: true, // if provider requires Arabic UI
    slos: {
      successRateThreshold: 0.93, // target success rate
      webhookLatencyThresholdMs: 75000 // acceptable webhook delay
    }
  }
};
```

### **Step 2: Update Routing Policies**

Add regional routing rules in `enhancedTypes.ts`:

```typescript
export const PROVIDER_ROUTING_POLICIES = {
  // ... existing regions
  newregion: {
    subscription: ['newprovider', 'stripe'], // order matters - first is preferred
    package: ['newprovider', 'stripe']
  }
};
```

### **Step 3: Update Database Schema**

Add the new provider to the database enum:

```sql
-- Add to existing migration or create new one
ALTER TYPE payment_provider_key ADD VALUE 'newprovider';
```

### **Step 4: Create Price Mappings**

Insert provider-specific price mappings:

```sql
-- Example: Map existing pricing items to new provider
INSERT INTO pricing_item_prices (
  pricing_item_id, payment_provider, currency, 
  provider_price_external_id, supports_recurring, 
  unit_amount_cents, is_active
) VALUES 
  ((SELECT id FROM pricing_items WHERE item_key = 'starter'), 'newprovider', 'SAR', 'newprovider_starter_sar', true, 7125, true),
  ((SELECT id FROM pricing_items WHERE item_key = 'pro'), 'newprovider', 'SAR', 'newprovider_pro_sar', true, 25875, true);
```

### **Step 5: Implement Provider Class**

Create your provider in `src/services/payment/providers/NewProvider.ts`:

```typescript
import {
  PaymentProvider,
  PaymentProviderKey,
  CheckoutResult,
  WebhookEvent,
  PriceSnapshot,
  PaymentError,
  validatePhoneForProvider,
  validateLocaleForProvider
} from '../enhancedTypes';

export class NewProvider implements PaymentProvider {
  readonly key: PaymentProviderKey = 'newprovider';

  constructor() {
    // Initialize provider SDK
  }

  async resolvePriceReference(
    pricingItemId: string,
    currency: string,
    productType: 'subscription' | 'package'
  ): Promise<{ externalId: string; priceSnapshot: PriceSnapshot }> {
    // Implementation here
  }

  async createCheckoutSession(params: {
    userId: string;
    pricingItemId: string;
    currency: string;
    productType: 'subscription' | 'package';
    orderId: string;
    locale: 'en' | 'ar';
    idempotencyKey: string;
    priceSnapshot: PriceSnapshot;
  }): Promise<CheckoutResult> {
    // Validate provider requirements
    validatePhoneForProvider(customerPhone, 'newprovider');
    validateLocaleForProvider(params.locale, 'newprovider');
    
    // Implementation here - return either:
    // { type: 'redirect', url: '...', sessionId: '...', correlationId: '...' }
    // or
    // { type: 'voucher', reference: '...', expiresAt: '...', instructions: '...', correlationId: '...' }
  }

  verifyWebhook(rawBody: string, headers: Record<string, string>): boolean {
    // Verify webhook signature using provider's method
  }

  parseWebhookEvents(rawBody: string): WebhookEvent[] {
    // Parse provider events into standard format
  }

  // Optional methods (implement if provider supports them)
  async cancelSubscription?(subscriptionId: string): Promise<void> { }
  async getSubscriptionStatus?(subscriptionId: string): Promise<any> { }
  async refundPayment?(paymentId: string, amountCents?: number): Promise<void> { }
}
```

### **Step 6: Register Provider Factory**

Update `RegionalPaymentFactory.ts` to include your provider:

```typescript
private async createProviderInstance(providerKey: PaymentProviderKey): Promise<PaymentProvider> {
  switch (providerKey) {
    // ... existing providers
    case 'newprovider':
      const { NewProvider } = await import('./providers/NewProvider');
      return new NewProvider();
    // ...
  }
}
```

### **Step 7: Environment Variables**

Add required environment variables to your deployment:

```bash
# New Provider Configuration
NEWPROVIDER_API_KEY=your_api_key
NEWPROVIDER_SECRET_KEY=your_secret_key
NEWPROVIDER_ENVIRONMENT=sandbox # or production
NEWPROVIDER_WEBHOOK_SECRET=webhook_secret
```

### **Step 8: Testing**

Create comprehensive tests:

```typescript
// tests/providers/NewProvider.test.ts
describe('NewProvider', () => {
  test('should create checkout session', async () => {
    // Test implementation
  });

  test('should verify webhooks', () => {
    // Test webhook verification
  });

  test('should parse webhook events', () => {
    // Test event parsing
  });

  test('should validate requirements', () => {
    // Test phone/locale validation
  });
});
```

## 📊 **Provider-Specific Implementation Patterns**

### **Card-Based Providers (Stripe, PayTabs)**
- Return `redirect` checkout results
- Support both subscriptions and one-time payments
- Usually support partial refunds
- May not require phone numbers

### **Wallet Providers (STC Pay, Paymob Wallet)**
- Return `redirect` checkout results
- May only support one-time payments
- Often require phone numbers for wallet identification
- Regional currency focus

### **Cash/Voucher Providers (Fawry)**
- Return `voucher` checkout results with QR codes
- Only support one-time payments
- Require phone numbers and Arabic locale
- Have expiration times for vouchers

## 🔍 **Common Implementation Pitfalls**

1. **Currency Handling**: Always convert to cents for database storage
2. **Webhook Signatures**: Store signature headers in database for debugging
3. **Idempotency**: Use provider-specific idempotency keys
4. **Error Messages**: Provide actionable error messages with next steps
5. **Health Monitoring**: Always record success/failure for circuit breakers

## ✅ **Validation Checklist**

Before deploying a new provider:

- [ ] Provider capabilities accurately configured
- [ ] Regional routing policies updated
- [ ] Database enum includes new provider
- [ ] Price mappings created for all active pricing items
- [ ] Provider class implements all required interface methods
- [ ] Webhook verification working correctly
- [ ] Phone/locale validation enforced where required
- [ ] Health monitoring integrated
- [ ] Comprehensive test coverage
- [ ] Environment variables documented
- [ ] Admin dashboard shows provider metrics

## 🚨 **Production Deployment**

1. **Deploy to Staging**: Test with provider's sandbox environment
2. **Health Check**: Verify provider appears healthy in admin dashboard
3. **Feature Flag**: Use feature flags for gradual rollout
4. **Monitor Metrics**: Watch success rates and webhook latency
5. **Rollback Plan**: Keep previous provider as fallback

## 📈 **Post-Deployment Monitoring**

Monitor these key metrics:
- Payment success rate (target: >90%)
- Webhook processing latency (target: <2 minutes)
- Customer support tickets related to payment failures
- Provider-specific error rates
- Currency conversion accuracy (if applicable)

---

**Example Implementation**: See `FawryProvider.ts` for a complete cash/voucher provider implementation demonstrating all patterns and best practices.