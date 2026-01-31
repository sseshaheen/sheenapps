export interface PaymentGateway {
  name: string

  // Core payment operations
  createCheckoutSession(params: CheckoutParams): Promise<CheckoutResult>

  // Webhook verification
  verifyWebhook(params: WebhookParams): Promise<boolean>

  // Subscription management
  cancelSubscription(subscriptionId: string): Promise<void>
  updateSubscription(subscriptionId: string, newPlanId: string): Promise<void>
  getSubscriptionStatus(subscriptionId: string): Promise<SubscriptionStatus>

  // Portal/dashboard
  createPortalSession(customerId: string, returnUrl: string): Promise<{ url: string }>
}

export interface CheckoutParams {
  planId: string
  userId: string
  successUrl: string
  cancelUrl: string
  currency: string
  customerEmail?: string
  metadata?: Record<string, string>
  idempotencyKey?: string
  trial?: boolean
  trialDays?: number
}

export interface CheckoutResult {
  url: string
  sessionId: string
}

export interface WebhookParams {
  payload: string
  signature: string
  secret?: string
}

export interface SubscriptionStatus {
  id: string
  status: 'active' | 'canceled' | 'past_due' | 'paused' | 'trialing'
  currentPeriodEnd: Date
  cancelAtPeriodEnd: boolean
}

export type SupportedGateway = 'stripe' | 'cashier' | 'paypal'

export interface Transaction {
  id: string
  userId: string
  gateway: SupportedGateway
  gatewayTransactionId: string
  status: 'pending' | 'completed' | 'failed' | 'refunded'
  amountCents: number
  currency: string
  planName?: string
  productType: 'subscription' | 'one-time' | 'bonus'
  transactionDate: Date
  country?: string
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  utmContent?: string
  metadata?: Record<string, any>
}

export interface WebhookDeadLetter {
  id: string
  gateway: string
  eventType: string
  payload: any
  errorMessage?: string
  retryCount: number
  maxRetries: number
  retryHistory: Array<{
    timestamp: Date
    error: string
    statusCode?: number
  }>
  createdAt: Date
  lastRetryAt?: Date
}