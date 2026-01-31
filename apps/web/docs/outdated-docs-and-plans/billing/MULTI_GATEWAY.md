# Multi-Gateway Payment Architecture

## Overview
The multi-gateway architecture provides a unified interface for integrating multiple payment providers (Stripe, Cashier, PayPal, etc.) with automatic gateway selection based on country, currency, and business rules.

## Database Schema

```sql
-- Unified transactions table
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  gateway VARCHAR(50) NOT NULL, -- 'stripe', 'cashier', 'paypal', etc.
  gateway_transaction_id VARCHAR(255) NOT NULL, -- External reference
  gateway_customer_id VARCHAR(255),
  status VARCHAR(50) NOT NULL, -- 'pending', 'completed', 'failed', 'refunded'
  amount_cents INTEGER NOT NULL,
  currency VARCHAR(3) NOT NULL,
  plan_name VARCHAR(50),
  product_type VARCHAR(50) NOT NULL, -- 'subscription', 'one-time', 'bonus'
  transaction_date TIMESTAMP NOT NULL,
  country VARCHAR(2),
  
  -- Attribution tracking
  utm_source VARCHAR(255),
  utm_medium VARCHAR(255),
  utm_campaign VARCHAR(255),
  utm_content VARCHAR(255),
  utm_term VARCHAR(255),
  
  -- Additional data
  metadata JSONB DEFAULT '{}',
  tax_amount_cents INTEGER DEFAULT 0,
  discount_amount_cents INTEGER DEFAULT 0,
  
  -- Sync tracking
  chartmogul_synced_at TIMESTAMP,
  chartmogul_customer_uuid VARCHAR(255),
  chartmogul_sync_error TEXT,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_transactions_user ON transactions(user_id);
CREATE INDEX idx_transactions_gateway ON transactions(gateway, created_at DESC);
CREATE INDEX idx_transactions_status ON transactions(status, created_at DESC);
CREATE INDEX idx_transactions_chartmogul_sync ON transactions(chartmogul_synced_at) 
  WHERE chartmogul_synced_at IS NULL;

-- Gateway configuration
CREATE TABLE gateway_config (
  gateway_name VARCHAR(50) PRIMARY KEY,
  supported_countries TEXT[], -- Array of country codes
  supported_currencies TEXT[], -- Array of currency codes
  priority INTEGER DEFAULT 100, -- Lower number = higher priority
  is_active BOOLEAN DEFAULT TRUE,
  config JSONB DEFAULT '{}', -- Gateway-specific configuration
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Price mapping for different gateways
CREATE TABLE gateway_price_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway VARCHAR(50) NOT NULL,
  plan_name VARCHAR(50) NOT NULL,
  currency VARCHAR(3) NOT NULL,
  price_id VARCHAR(255) NOT NULL, -- Gateway-specific price/plan ID
  amount_cents INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(gateway, plan_name, currency)
);
```

## Gateway Interface

### Core Gateway Interface
```typescript
// src/services/payment/gateways/payment-gateway.interface.ts
export interface PaymentGateway {
  name: string;
  
  /**
   * Create a checkout session
   */
  createCheckoutSession(params: CheckoutParams): Promise<CheckoutResult>;
  
  /**
   * Create a customer
   */
  createCustomer(params: CustomerParams): Promise<Customer>;
  
  /**
   * Update a subscription
   */
  updateSubscription(
    subscriptionId: string, 
    params: UpdateSubscriptionParams
  ): Promise<Subscription>;
  
  /**
   * Cancel a subscription
   */
  cancelSubscription(
    subscriptionId: string,
    immediately?: boolean
  ): Promise<void>;
  
  /**
   * Get subscription status
   */
  getSubscriptionStatus(subscriptionId: string): Promise<SubscriptionStatus>;
  
  /**
   * Create billing portal session
   */
  createPortalSession(
    customerId: string,
    returnUrl: string
  ): Promise<PortalSession>;
  
  /**
   * Verify webhook signature
   */
  verifyWebhook(params: WebhookParams): Promise<boolean>;
  
  /**
   * Process webhook event
   */
  processWebhook(event: any): Promise<WebhookResult>;
  
  /**
   * Create a refund
   */
  createRefund(
    transactionId: string,
    amount?: number,
    reason?: string
  ): Promise<Refund>;
}

// Common types
export interface CheckoutParams {
  userId: string;
  customerId?: string;
  customerEmail: string;
  planId: string;
  planName: string;
  currency: string;
  successUrl: string;
  cancelUrl: string;
  trialDays?: number;
  metadata?: Record<string, any>;
}

export interface CheckoutResult {
  sessionId: string;
  url: string;
  customerId?: string;
}

export interface Customer {
  id: string;
  email: string;
  name?: string;
  metadata?: Record<string, any>;
}

export interface Subscription {
  id: string;
  customerId: string;
  status: SubscriptionStatus;
  planId: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  trialEnd?: Date;
}

export type SubscriptionStatus = 
  | 'active' 
  | 'trialing' 
  | 'past_due' 
  | 'canceled' 
  | 'paused';
```

## Gateway Implementations

### Stripe Gateway
```typescript
// src/services/payment/gateways/stripe-gateway.ts
import Stripe from 'stripe';

export class StripeGateway implements PaymentGateway {
  name = 'stripe';
  private stripe: Stripe;
  
  constructor() {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2023-10-16'
    });
  }
  
  async createCheckoutSession(params: CheckoutParams): Promise<CheckoutResult> {
    // Get price ID from mapping
    const priceId = await this.getPriceId(params.planName, params.currency);
    
    // Create or retrieve customer
    let customerId = params.customerId;
    if (!customerId) {
      const customer = await this.createCustomer({
        email: params.customerEmail,
        metadata: params.metadata
      });
      customerId = customer.id;
    }
    
    // Create checkout session
    const session = await this.stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{
        price: priceId,
        quantity: 1
      }],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      subscription_data: {
        trial_period_days: params.trialDays,
        metadata: {
          user_id: params.userId,
          plan_name: params.planName,
          ...params.metadata
        }
      },
      automatic_tax: {
        enabled: true
      },
      customer_update: {
        address: 'auto',
        name: 'auto'
      },
      tax_id_collection: {
        enabled: true
      }
    });
    
    return {
      sessionId: session.id,
      url: session.url!,
      customerId
    };
  }
  
  async createCustomer(params: CustomerParams): Promise<Customer> {
    const customer = await this.stripe.customers.create({
      email: params.email,
      name: params.name,
      metadata: params.metadata
    });
    
    return {
      id: customer.id,
      email: customer.email!,
      name: customer.name || undefined,
      metadata: customer.metadata
    };
  }
  
  async verifyWebhook(params: WebhookParams): Promise<boolean> {
    try {
      this.stripe.webhooks.constructEvent(
        params.payload,
        params.signature,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
      return true;
    } catch (error) {
      return false;
    }
  }
  
  async processWebhook(event: Stripe.Event): Promise<WebhookResult> {
    switch (event.type) {
      case 'checkout.session.completed':
        return this.handleCheckoutComplete(event.data.object);
      case 'customer.subscription.updated':
        return this.handleSubscriptionUpdate(event.data.object);
      case 'customer.subscription.deleted':
        return this.handleSubscriptionCanceled(event.data.object);
      case 'invoice.payment_failed':
        return this.handlePaymentFailed(event.data.object);
      default:
        return { processed: false };
    }
  }
  
  private async getPriceId(planName: string, currency: string): Promise<string> {
    const { data } = await supabase
      .from('gateway_price_mappings')
      .select('price_id')
      .eq('gateway', 'stripe')
      .eq('plan_name', planName)
      .eq('currency', currency.toUpperCase())
      .eq('is_active', true)
      .single();
    
    if (!data) {
      throw new Error(`No price mapping found for ${planName} in ${currency}`);
    }
    
    return data.price_id;
  }
}
```

### Cashier Gateway (Egypt)
```typescript
// src/services/payment/gateways/cashier-gateway.ts
export class CashierGateway implements PaymentGateway {
  name = 'cashier';
  private apiKey: string;
  private baseUrl: string;
  
  constructor() {
    this.apiKey = process.env.CASHIER_API_KEY!;
    this.baseUrl = process.env.CASHIER_API_URL || 'https://api.cashier.com';
  }
  
  async createCheckoutSession(params: CheckoutParams): Promise<CheckoutResult> {
    // Cashier-specific implementation
    const response = await fetch(`${this.baseUrl}/checkout/sessions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        customer_email: params.customerEmail,
        plan_id: await this.getPlanId(params.planName, 'EGP'),
        success_url: params.successUrl,
        cancel_url: params.cancelUrl,
        metadata: {
          user_id: params.userId,
          plan_name: params.planName,
          ...params.metadata
        }
      })
    });
    
    const data = await response.json();
    
    return {
      sessionId: data.session_id,
      url: data.checkout_url,
      customerId: data.customer_id
    };
  }
  
  // ... other method implementations
}
```

## Gateway Factory & Selection

### Gateway Factory
```typescript
// src/services/payment/gateways/gateway-factory.ts
export class PaymentGatewayFactory {
  private static gateways: Map<string, PaymentGateway> = new Map();
  
  static {
    // Register gateways
    this.registerGateway(new StripeGateway());
    this.registerGateway(new CashierGateway());
    // Add more gateways as needed
  }
  
  static registerGateway(gateway: PaymentGateway): void {
    this.gateways.set(gateway.name, gateway);
  }
  
  static getGateway(name: string): PaymentGateway {
    const gateway = this.gateways.get(name);
    if (!gateway) {
      throw new Error(`Unknown gateway: ${name}`);
    }
    return gateway;
  }
  
  static async selectGateway(
    country: string,
    currency: string
  ): Promise<PaymentGateway> {
    // Get gateway configuration
    const { data: configs } = await supabase
      .from('gateway_config')
      .select('*')
      .eq('is_active', true)
      .contains('supported_countries', [country])
      .contains('supported_currencies', [currency])
      .order('priority', { ascending: true });
    
    if (!configs || configs.length === 0) {
      // Fall back to default gateway
      return this.getGateway('stripe');
    }
    
    // Return highest priority gateway
    return this.getGateway(configs[0].gateway_name);
  }
}
```

### Gateway Selection Logic
```typescript
// src/services/payment/gateway-selector.ts
export class GatewaySelector {
  /**
   * Select payment gateway based on business rules
   */
  static async selectGateway(params: {
    country: string;
    currency: string;
    userId?: string;
    planName?: string;
  }): Promise<string> {
    // Special cases
    if (params.country === 'EG') {
      return 'cashier'; // Egypt always uses Cashier
    }
    
    if (['SA', 'AE', 'KW', 'BH', 'QA', 'OM'].includes(params.country)) {
      // Middle East countries might use a specific gateway
      return 'payfort';
    }
    
    // EU countries with EUR
    if (EU_COUNTRIES.includes(params.country) && params.currency === 'EUR') {
      return 'stripe';
    }
    
    // Check user preference
    if (params.userId) {
      const userPref = await this.getUserGatewayPreference(params.userId);
      if (userPref) return userPref;
    }
    
    // Default to Stripe
    return 'stripe';
  }
  
  /**
   * Get currency for country
   */
  static getCurrencyForCountry(country: string): string {
    const currencyMap: Record<string, string> = {
      // Europe
      'DE': 'EUR', 'FR': 'EUR', 'IT': 'EUR', 'ES': 'EUR',
      'NL': 'EUR', 'BE': 'EUR', 'AT': 'EUR', 'PT': 'EUR',
      
      // Middle East
      'EG': 'EGP', 'SA': 'SAR', 'AE': 'AED', 'KW': 'KWD',
      'BH': 'BHD', 'QA': 'QAR', 'OM': 'OMR',
      
      // Others
      'GB': 'GBP', 'JP': 'JPY', 'CN': 'CNY', 'IN': 'INR',
      
      // Default
      'US': 'USD'
    };
    
    return currencyMap[country] || 'USD';
  }
}
```

## Transaction Service

### Unified Transaction Handling
```typescript
// src/services/payment/transaction-service.ts
export class TransactionService {
  /**
   * Create transaction record
   */
  async createTransaction(params: {
    userId: string;
    gateway: string;
    gatewayTransactionId: string;
    status: string;
    amount: number;
    currency: string;
    planName?: string;
    productType: string;
    metadata?: Record<string, any>;
  }): Promise<Transaction> {
    // Get user attribution
    const attribution = await this.getUserAttribution(params.userId);
    
    const transaction = await supabase.from('transactions').insert({
      user_id: params.userId,
      gateway: params.gateway,
      gateway_transaction_id: params.gatewayTransactionId,
      status: params.status,
      amount_cents: Math.round(params.amount * 100),
      currency: params.currency.toUpperCase(),
      plan_name: params.planName,
      product_type: params.productType,
      transaction_date: new Date().toISOString(),
      country: attribution.country,
      utm_source: attribution.utm_source,
      utm_medium: attribution.utm_medium,
      utm_campaign: attribution.utm_campaign,
      metadata: params.metadata
    }).select().single();
    
    return transaction.data;
  }
  
  /**
   * Update transaction status
   */
  async updateTransactionStatus(
    transactionId: string,
    status: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    await supabase
      .from('transactions')
      .update({
        status,
        metadata: metadata ? { ...metadata } : undefined,
        updated_at: new Date().toISOString()
      })
      .eq('id', transactionId);
  }
  
  /**
   * Process successful payment
   */
  async processSuccessfulPayment(params: {
    gatewayTransactionId: string;
    gateway: string;
    userId: string;
    planName: string;
    amount: number;
    currency: string;
  }): Promise<void> {
    // Create transaction
    const transaction = await this.createTransaction({
      userId: params.userId,
      gateway: params.gateway,
      gatewayTransactionId: params.gatewayTransactionId,
      status: 'completed',
      amount: params.amount,
      currency: params.currency,
      planName: params.planName,
      productType: 'subscription'
    });
    
    // Update subscription
    await this.updateUserSubscription(params.userId, params.planName);
    
    // Process referral if applicable
    const referralService = new ReferralService();
    await referralService.processReferralConversion(
      params.userId,
      params.planName,
      transaction.id
    );
    
    // Grant signup bonus
    if (await this.isFirstSubscription(params.userId)) {
      const bonusService = new BonusService();
      await bonusService.grantSignupBonus(params.userId);
    }
    
    // Track analytics
    await this.trackPaymentAnalytics(transaction);
  }
}
```

## API Integration

### Create Checkout Endpoint
```typescript
// /api/stripe/create-checkout (updated to use gateway abstraction)
export async function POST(request: NextRequest) {
  const userId = await requireAuth(request);
  const { planName, currency, country } = await request.json();
  
  // Select gateway
  const gateway = await PaymentGatewayFactory.selectGateway(
    country || 'US',
    currency || 'USD'
  );
  
  // Create checkout session
  const result = await gateway.createCheckoutSession({
    userId,
    customerEmail: user.email,
    planName,
    currency: currency || GatewaySelector.getCurrencyForCountry(country),
    successUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/dashboard/billing?success=true`,
    cancelUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/pricing`,
    metadata: {
      source: 'web',
      user_id: userId
    }
  });
  
  // Store pending transaction
  await transactionService.createTransaction({
    userId,
    gateway: gateway.name,
    gatewayTransactionId: result.sessionId,
    status: 'pending',
    amount: 0, // Will be updated on completion
    currency,
    planName,
    productType: 'subscription'
  });
  
  return NextResponse.json({
    url: result.url,
    gateway: gateway.name
  });
}
```

## Configuration Management

### Price Mapping Setup
```sql
-- Insert price mappings for each gateway
INSERT INTO gateway_price_mappings (gateway, plan_name, currency, price_id, amount_cents) VALUES
-- Stripe USD prices
('stripe', 'starter', 'USD', 'price_starter_usd', 900),
('stripe', 'growth', 'USD', 'price_growth_usd', 2900),
('stripe', 'scale', 'USD', 'price_scale_usd', 5900),

-- Stripe EUR prices
('stripe', 'starter', 'EUR', 'price_starter_eur', 800),
('stripe', 'growth', 'EUR', 'price_growth_eur', 2600),
('stripe', 'scale', 'EUR', 'price_scale_eur', 5300),

-- Cashier EGP prices
('cashier', 'starter', 'EGP', 'plan_starter_egp', 45000),
('cashier', 'growth', 'EGP', 'plan_growth_egp', 145000),
('cashier', 'scale', 'EGP', 'plan_scale_egp', 295000);

-- Gateway configuration
INSERT INTO gateway_config (gateway_name, supported_countries, supported_currencies, priority) VALUES
('stripe', ARRAY['US', 'CA', 'GB', 'DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'AT'], 
  ARRAY['USD', 'EUR', 'GBP'], 10),
('cashier', ARRAY['EG'], ARRAY['EGP'], 5),
('payfort', ARRAY['SA', 'AE', 'KW', 'BH', 'QA', 'OM'], 
  ARRAY['SAR', 'AED', 'KWD', 'BHD', 'QAR', 'OMR'], 20);
```

## Best Practices

### Do's
- Always use the gateway abstraction
- Store unified transaction records
- Map prices per gateway/currency
- Handle gateway-specific webhooks
- Test each gateway thoroughly

### Don'ts
- Don't hardcode gateway logic
- Don't lose transaction data
- Don't assume gateway availability
- Don't forget currency conversion
- Don't mix gateway responses

## Testing

### Multi-Gateway Testing
```typescript
describe('PaymentGatewayFactory', () => {
  it('should select correct gateway for country', async () => {
    const gateway = await PaymentGatewayFactory.selectGateway('EG', 'EGP');
    expect(gateway.name).toBe('cashier');
  });
  
  it('should fall back to Stripe for unsupported regions', async () => {
    const gateway = await PaymentGatewayFactory.selectGateway('XX', 'XXX');
    expect(gateway.name).toBe('stripe');
  });
  
  it('should respect gateway priority', async () => {
    // Test priority-based selection
  });
});
```

---

*Last Updated: 27 June 2025*