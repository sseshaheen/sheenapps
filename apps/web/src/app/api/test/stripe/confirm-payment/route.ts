/**
 * EXPERT FIX: Test endpoint for server-side Stripe payment confirmation
 * Bypasses iframe selector issues in E2E tests
 */

import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/utils/logger'

// Route configuration for test endpoint
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export async function POST(request: NextRequest) {
  try {
    // Only allow in test environments
    if (process.env.NODE_ENV !== 'test' && process.env.TEST_E2E !== '1') {
      return NextResponse.json(
        { success: false, error: 'Test endpoint only available in test mode' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { sessionId, testMode, cardToken } = body

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: 'Session ID required' },
        { status: 400 }
      )
    }

    logger.info('EXPERT FIX: Confirming payment server-side for E2E test', {
      sessionId: sessionId.slice(0, 20) + '...',
      testMode,
      cardToken
    })

    // In test mode, simulate successful payment without actual Stripe calls
    if (testMode) {
      // Mock successful payment confirmation
      const mockResult = {
        success: true,
        paymentIntentId: `pi_test_${Date.now()}`,
        sessionId,
        status: 'succeeded',
        successUrl: '/en/dashboard?payment=success',
        customerId: 'cus_test_customer',
        subscriptionId: 'sub_test_subscription'
      }

      logger.info('EXPERT FIX: Mock payment confirmation successful', mockResult)

      // Simulate webhook processing delay
      setTimeout(async () => {
        try {
          // Trigger mock webhook to update subscription status
          await fetch(`${request.nextUrl.origin}/api/stripe/webhook`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Test-Mode': 'true'
            },
            body: JSON.stringify({
              id: `evt_test_${Date.now()}`,
              type: 'checkout.session.completed',
              data: {
                object: {
                  id: sessionId,
                  payment_status: 'paid',
                  customer: mockResult.customerId,
                  subscription: mockResult.subscriptionId,
                  metadata: {
                    test_mode: 'true'
                  }
                }
              }
            })
          })
        } catch (error) {
          logger.warn('Failed to trigger mock webhook', { error: error.message })
        }
      }, 1000)

      return NextResponse.json(mockResult, {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      })
    }

    // For non-test mode, you would implement actual Stripe confirmation here
    // This is a safety net - should not be reached in TEST_E2E mode
    return NextResponse.json(
      { success: false, error: 'Non-test mode not implemented' },
      { status: 501 }
    )

  } catch (error) {
    logger.error('Error in test payment confirmation', { error: error.message })
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Internal server error',
        details: error.message 
      },
      { status: 500 }
    )
  }
}