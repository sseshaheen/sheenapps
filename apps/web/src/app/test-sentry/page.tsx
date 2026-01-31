'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import * as Sentry from '@sentry/nextjs'
import { capturePaymentError, captureWebhookError, testSentryIntegration } from '@/lib/sentry-helpers'

export default function TestSentryPage() {
  const [testResults, setTestResults] = useState<string[]>([])

  const addResult = (result: string) => {
    setTestResults(prev => [...prev, `${new Date().toLocaleTimeString()}: ${result}`])
  }

  const testBasicError = () => {
    try {
      throw new Error('Test Sentry Error - Basic')
    } catch (error) {
      Sentry.captureException(error)
      addResult('✅ Basic error sent to Sentry')
    }
  }

  const testPaymentError = () => {
    const error = new Error('Test Payment Failure - Checkout')
    capturePaymentError(error, {
      userId: 'test-user-123',
      gateway: 'stripe',
      amount: 9900,
      currency: 'USD',
      operation: 'checkout.create'
    })
    addResult('✅ Payment error sent to Sentry')
  }

  const testWebhookError = () => {
    const error = new Error('Test Webhook Processing Failure')
    captureWebhookError(error, {
      gateway: 'stripe',
      eventType: 'payment_intent.succeeded',
      eventId: 'evt_test_123'
    })
    addResult('✅ Webhook error sent to Sentry')
  }

  const testUserContext = () => {
    Sentry.setUser({
      id: 'user-123',
      email: 'test@example.com',
      username: 'testuser'
    })
    addResult('✅ User context set in Sentry')
  }

  const testTransaction = () => {
    Sentry.startSpan({
      op: 'payment.checkout',
      name: 'Test Checkout Transaction',
    }, () => {
      // Simulate some work
      setTimeout(() => {
        addResult('✅ Performance transaction sent to Sentry')
      }, 1000)
    })
  }

  const runAllTests = () => {
    testSentryIntegration()
    addResult('✅ All test events sent via testSentryIntegration()')
  }

  return (
    <div className="container mx-auto py-10 max-w-4xl">
      <Card className="p-8">
        <h1 className="text-3xl font-bold mb-6">Sentry Integration Test</h1>
        
        <div className="mb-8">
          <p className="text-gray-600 mb-4">
            Click the buttons below to test different Sentry features. 
            Check your Sentry dashboard to verify the events are being captured.
          </p>
          
          <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg mb-4">
            <p className="text-sm text-yellow-800">
              <strong>Note:</strong> Make sure you have configured your Sentry environment variables in <code>.env.local</code>
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <Button onClick={testBasicError} variant="outline">
            Test Basic Error
          </Button>
          
          <Button onClick={testPaymentError} variant="outline">
            Test Payment Error
          </Button>
          
          <Button onClick={testWebhookError} variant="outline">
            Test Webhook Error
          </Button>
          
          <Button onClick={testUserContext} variant="outline">
            Set User Context
          </Button>
          
          <Button onClick={testTransaction} variant="outline">
            Test Performance Transaction
          </Button>
          
          <Button onClick={runAllTests} variant="default">
            Run All Tests
          </Button>
        </div>

        <div className="border-t pt-6">
          <h2 className="text-xl font-semibold mb-4">Test Results</h2>
          {testResults.length === 0 ? (
            <p className="text-gray-500">No tests run yet</p>
          ) : (
            <div className="space-y-2">
              {testResults.map((result, index) => (
                <div key={index} className="text-sm font-mono bg-gray-50 p-2 rounded">
                  {result}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t pt-6 mt-6">
          <h2 className="text-xl font-semibold mb-4">Environment Status</h2>
          <div className="space-y-2 text-sm">
            <div>
              DSN Configured: {process.env.NEXT_PUBLIC_SENTRY_DSN ? '✅ Yes' : '❌ No'}
            </div>
            <div>
              Environment: {process.env.NODE_ENV}
            </div>
            <div>
              App Version: {process.env.NEXT_PUBLIC_APP_VERSION || 'Not set'}
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}