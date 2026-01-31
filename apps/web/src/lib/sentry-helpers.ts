import * as Sentry from '@sentry/nextjs'

export function capturePaymentError(
  error: Error,
  context: {
    userId?: string
    gateway?: string
    amount?: number
    currency?: string
    operation?: string
  }
) {
  // Log to console in development for verification
  if (process.env.NODE_ENV === 'development') {
    console.warn('[Sentry] Capturing payment error:', {
      error: error.message,
      context,
    })
  }

  Sentry.withScope((scope) => {
    scope.setTag('category', 'payment')
    scope.setLevel('error')
    scope.setContext('payment', {
      gateway: context.gateway,
      amount: context.amount,
      currency: context.currency,
      operation: context.operation,
    })
    scope.setUser({ id: context.userId })

    Sentry.captureException(error)
  })
}

export function trackPaymentPerformance(
  operation: string,
  duration: number,
  success: boolean
) {
  // Log to console in development for verification
  if (process.env.NODE_ENV === 'development') {
    console.warn('[Sentry] Tracking payment performance:', {
      operation,
      duration,
      success,
    })
  }

  // Send custom breadcrumb for performance tracking
  Sentry.addBreadcrumb({
    message: `Payment ${operation} completed`,
    category: 'payment.performance',
    level: 'info',
    data: {
      operation,
      duration_ms: duration,
      success,
    },
  })

  // If the operation failed or took too long, capture as an event
  if (!success || duration > 5000) {
    Sentry.captureMessage(
      `Payment operation ${operation} ${!success ? 'failed' : 'was slow'}`,
      {
        level: 'warning',
        tags: {
          category: 'payment.performance',
          operation,
        },
        extra: {
          duration_ms: duration,
          success,
        },
      }
    )
  }
}

export function captureWebhookError(
  error: Error,
  webhookData: {
    gateway: string
    eventType: string
    eventId: string
  }
) {
  // Log to console in development for verification
  if (process.env.NODE_ENV === 'development') {
    console.warn('[Sentry] Capturing webhook error:', {
      error: error.message,
      webhookData,
    })
  }

  // Mock webhook test case for validation
  if (process.env.NODE_ENV === 'test' && webhookData.eventType === 'test.webhook') {
    console.warn('[Sentry Test] Mock webhook error captured')
    return
  }

  Sentry.withScope((scope) => {
    scope.setTag('category', 'webhook')
    scope.setTag('gateway', webhookData.gateway)
    scope.setLevel('warning')
    scope.setContext('webhook', webhookData)

    Sentry.captureException(error)
  })
}

// Test helper for development
export function testSentryIntegration() {
  if (process.env.NODE_ENV === 'development') {
    console.warn('[Sentry Test] Testing error capture...')
    
    // Test basic error
    Sentry.captureException(new Error('Test Sentry error'))
    
    // Test payment error
    capturePaymentError(new Error('Test payment failure'), {
      userId: 'test-user',
      gateway: 'stripe',
      amount: 1000,
      currency: 'USD',
      operation: 'checkout.create'
    })
    
    // Test webhook error
    captureWebhookError(new Error('Test webhook failure'), {
      gateway: 'stripe',
      eventType: 'test.webhook',
      eventId: 'test-123'
    })
    
    console.warn('[Sentry Test] Test events sent. Check Sentry dashboard.')
  }
}