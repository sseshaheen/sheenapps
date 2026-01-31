/**
 * 🧪 Admin Utilities Test
 * Basic validation of admin utility functions
 */

import { standardizeActionName, sanitizeReason, REASON_CODES } from '../../admin-auth'
import { test, expect, describe } from 'vitest'

describe('Admin Utilities', () => {
  
  describe('Action Taxonomy Standardization', () => {
    test('standardizes common admin actions correctly', () => {
      // User operations
      expect(standardizeActionName('/api/admin/users/123/suspend', 'POST')).toBe('user.suspend.temporary')
      expect(standardizeActionName('/api/admin/users/456/ban', 'POST')).toBe('user.ban.permanent')
      
      // Financial operations
      expect(standardizeActionName('/api/admin/refunds', 'POST')).toBe('refund.issue')
      
      // Dashboard operations
      expect(standardizeActionName('/api/admin/dashboard', 'GET')).toBe('dashboard.view')
      expect(standardizeActionName('/api/admin/users', 'GET')).toBe('users.list')
      
      // Advisor operations
      expect(standardizeActionName('/api/admin/advisors/789/approve', 'PUT')).toBe('advisor.approve')
    })

    test('falls back to path-based naming for unknown endpoints', () => {
      const result = standardizeActionName('/api/admin/custom/endpoint', 'POST')
      expect(result).toBe('custom.endpoint.post')
    })
  })

  describe('PII Sanitization', () => {
    test('sanitizes credit card numbers from reasons', () => {
      const reasonWithCard = '[F01] Customer disputed charge 4111-1111-1111-1111 for duplicate billing'
      const sanitized = sanitizeReason(reasonWithCard)
      expect(sanitized).toBe('[F01] Customer disputed charge [CARD_REDACTED] for duplicate billing')
    })

    test('sanitizes API keys and tokens', () => {
      const reasonWithToken = '[T03] Fraud detected with API key abcd1234efgh5678ijkl9012mnop3456'
      const sanitized = sanitizeReason(reasonWithToken)
      expect(sanitized).toBe('[T03] Fraud detected with API key [TOKEN_REDACTED]')
    })

    test('sanitizes email addresses for privacy', () => {
      const reasonWithEmail = '[T02] User harassed customer@example.com with multiple messages'
      const sanitized = sanitizeReason(reasonWithEmail)
      expect(sanitized).toBe('[T02] User harassed [EMAIL_REDACTED] with multiple messages')
    })

    test('truncates long reasons to 1000 characters', () => {
      const longReason = 'A'.repeat(1200)
      const sanitized = sanitizeReason(longReason)
      expect(sanitized).toHaveLength(1003) // 1000 + '...'
      expect(sanitized.endsWith('...')).toBe(true)
    })

    test('handles null and empty reasons', () => {
      expect(sanitizeReason(null)).toBe(null)
      expect(sanitizeReason('')).toBe('')
    })
  })

  describe('Reason Code Structure', () => {
    test('trust reason codes are properly structured', () => {
      expect(REASON_CODES.trust).toEqual([
        { code: 'T01', label: 'Spam or promotional content' },
        { code: 'T02', label: 'Harassment or abusive behavior' },
        { code: 'T03', label: 'Fraud or chargeback risk' },
        { code: 'T04', label: 'Terms of service violation' },
        { code: 'T05', label: 'Multiple reports from users' }
      ])
    })

    test('finance reason codes are properly structured', () => {
      expect(REASON_CODES.finance).toEqual([
        { code: 'F01', label: 'Duplicate charge or billing error' },
        { code: 'F02', label: 'Customer dissatisfaction' },
        { code: 'F03', label: 'Fraud reversal or chargeback' }
      ])
    })
  })

  describe('Correlation ID Generation and Format', () => {
    test('generates valid UUID format correlation IDs', () => {
      const correlationId = crypto.randomUUID()
      
      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      expect(correlationId).toMatch(uuidRegex)
    })

    test('correlation IDs are unique across multiple generations', () => {
      const ids = new Set()
      for (let i = 0; i < 1000; i++) {
        ids.add(crypto.randomUUID())
      }
      expect(ids.size).toBe(1000) // All IDs should be unique
    })
  })
})

// Integration test helpers for correlation ID propagation
export const testCorrelationPropagation = {
  /**
   * Test helper to verify correlation ID flows through admin API calls
   */
  async testAdminApiCall(endpoint: string, options: RequestInit = {}) {
    const correlationId = crypto.randomUUID()
    
    const response = await fetch(endpoint, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-Id': correlationId,
        ...options.headers
      }
    })
    
    const responseData = await response.json()
    
    // Expert's validation: Correlation ID should be present in both header and body
    const responseCorrelationId = response.headers.get('X-Correlation-Id')
    
    return {
      originalCorrelationId: correlationId,
      responseCorrelationId,
      bodyCorrelationId: responseData.correlation_id,
      isCorrelationPropagated: 
        responseCorrelationId === correlationId && 
        responseData.correlation_id === correlationId,
      response,
      data: responseData
    }
  },

  /**
   * Test helper for admin operations requiring reasons
   */
  async testAdminActionWithReason(endpoint: string, action: any, reason: string) {
    const correlationId = crypto.randomUUID()
    
    const response = await fetch(endpoint, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-Id': correlationId,
        'X-Admin-Reason': reason
      },
      body: JSON.stringify(action)
    })
    
    const responseData = await response.json()
    
    return {
      correlationId,
      reasonProvided: reason,
      reasonSanitized: responseData.audit?.reason || null,
      success: response.ok,
      data: responseData
    }
  },

  /**
   * Test helper for financial operations with idempotency
   */
  async testFinancialOperationIdempotency(endpoint: string, operation: any) {
    const correlationId = crypto.randomUUID()
    const idempotencyKey = crypto.randomUUID()
    const reason = '[F01] Test refund for duplicate charge'
    
    // First request
    const response1 = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-Id': correlationId,
        'X-Admin-Reason': reason,
        'Idempotency-Key': idempotencyKey
      },
      body: JSON.stringify(operation)
    })
    
    const data1 = await response1.json()
    
    // Second request with same idempotency key (should be deduplicated)
    const response2 = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Correlation-Id': correlationId + '-retry',
        'X-Admin-Reason': reason,
        'Idempotency-Key': idempotencyKey // Same key
      },
      body: JSON.stringify(operation)
    })
    
    const data2 = await response2.json()
    
    return {
      firstRequest: { response: response1, data: data1 },
      retryRequest: { response: response2, data: data2 },
      idempotencyKey,
      wasDeduped: data2.refund?.deduped || false
    }
  }
}

console.log('✅ Admin middleware correlation ID and standards tests ready')
console.log('📊 Test helpers exported for integration testing')