# Comprehensive Billing Tests

This directory contains comprehensive billing tests designed to catch the critical vulnerabilities found in the security audit. These tests protect against revenue loss scenarios and ensure the billing system's integrity.

## 🚨 Critical Vulnerabilities Covered

### 1. Stripe Webhook Security (Priority 1)
- **File**: `tests/unit/billing/stripe-webhook.test.ts`
- **Coverage**: 
  - Missing signature validation
  - Invalid signature rejection
  - Malformed payload handling
  - Race condition protection
  - Dead letter queue functionality
  - Environment variable validation

### 2. Quota System Bypass Prevention (Priority 1)
- **File**: `tests/unit/billing/quota-system.test.ts`
- **Coverage**:
  - Quota bypass attempts
  - Schema mismatch handling (usage_amount vs metric_value)
  - Concurrent quota checks
  - Plan limit enforcement
  - Authentication bypass prevention
  - SQL injection protection

### 3. Billing API Security (Priority 1)
- **File**: `tests/unit/billing/billing-api.test.ts`
- **Coverage**:
  - Usage tracking accuracy
  - Bonus system atomic operations
  - Subscription validation
  - Transaction integrity
  - Data validation
  - Error handling without information leakage

### 4. Complete Payment Flow Integration (Priority 1)
- **File**: `tests/integration/billing/payment-flows.test.tsx`
- **Coverage**:
  - Checkout → Webhook → Activation flow
  - Trial to paid conversion
  - Plan upgrade/downgrade handling
  - Payment failure scenarios
  - Error recovery and resilience

## 🎯 Running the Tests

### Run All Billing Tests
```bash
npm run test tests/unit/billing tests/integration/billing
```

### Run Specific Test Categories
```bash
# Webhook security tests
npm run test tests/unit/billing/stripe-webhook.test.ts

# Quota system tests  
npm run test tests/unit/billing/quota-system.test.ts

# API security tests
npm run test tests/unit/billing/billing-api.test.ts

# Integration flow tests
npm run test tests/integration/billing/payment-flows.test.tsx
```

### Run with Coverage
```bash
npm run test:coverage tests/unit/billing tests/integration/billing
```

## 🔧 Test Configuration

### Environment Variables Required
```bash
# Test environment
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_test_...
NEXT_PUBLIC_SUPABASE_URL=https://test.supabase.co
SUPABASE_SERVICE_ROLE_KEY=test_service_role_key
```

### Mock Data Usage
The tests use the extended `billingFactory` from `tests/factories/index.ts`:

```typescript
import { billingFactory } from '@/tests/factories'

// Create test data
const mockCustomer = billingFactory.createCustomer()
const mockTransaction = billingFactory.createTransaction()
const mockStripeEvent = billingFactory.createStripeWebhookEvent('checkout.session.completed')
const quotaScenario = billingFactory.createQuotaScenario('over_limit')
```

## 📊 Test Scenarios

### Critical Revenue Protection Scenarios

#### 1. Webhook Signature Bypass
```typescript
it('should reject webhooks with missing signature', async () => {
  // Tests that missing signatures are rejected
  // Prevents unauthorized webhook processing
})
```

#### 2. Quota System Bypass
```typescript
it('should prevent quota bypass attempts with manipulated user IDs', async () => {
  // Tests that users can't access other users' quotas
  // Prevents unlimited access for free users
})
```

#### 3. Race Condition Protection
```typescript
it('should handle concurrent webhooks for the same event', async () => {
  // Tests that duplicate webhooks don't create multiple subscriptions
  // Prevents double-charging or double-crediting
})
```

#### 4. Schema Mismatch Detection
```typescript
it('should handle usage_amount vs metric_value schema mismatch', async () => {
  // Tests that usage tracking works despite schema inconsistencies
  // Prevents quota bypass due to field mismatches
})
```

#### 5. Bonus System Security
```typescript
it('should consume bonuses atomically to prevent double-spending', async () => {
  // Tests that bonuses can't be spent multiple times
  // Prevents unlimited usage through bonus exploitation
})
```

#### 6. Complete Payment Flow
```typescript
it('should complete successful payment flow from checkout to subscription activation', async () => {
  // Tests entire payment pipeline end-to-end
  // Ensures users get access they paid for
})
```

## 🛡️ Security Test Matrix

| Vulnerability | Test File | Test Name | Impact |
|---------------|-----------|-----------|---------|
| Missing Webhook Signature | stripe-webhook.test.ts | should reject webhooks with missing signature | Prevents unauthorized subscription activation |
| Invalid Webhook Signature | stripe-webhook.test.ts | should reject webhooks with invalid signature | Prevents forged payment confirmations |
| Quota Bypass | quota-system.test.ts | should prevent quota bypass attempts | Prevents free users getting unlimited access |
| Schema Mismatch | quota-system.test.ts | should handle usage_amount vs metric_value | Prevents quota calculation errors |
| Race Conditions | stripe-webhook.test.ts | should handle concurrent webhooks | Prevents duplicate subscriptions |
| Bonus Double-Spend | billing-api.test.ts | should consume bonuses atomically | Prevents unlimited bonus usage |
| Authentication Bypass | quota-system.test.ts | should reject requests without valid auth | Prevents unauthorized quota access |
| SQL Injection | quota-system.test.ts | should prevent quota bypass with SQL injection | Prevents database manipulation |
| Dead Letter Queue | stripe-webhook.test.ts | should add failed webhooks to dead letter queue | Ensures webhook reliability |
| Payment Flow Integrity | payment-flows.test.tsx | should complete successful payment flow | Ensures end-to-end payment processing |

## 🚀 Continuous Integration

Add these tests to your CI pipeline:

```yaml
# .github/workflows/billing-security.yml
name: Billing Security Tests
on: [push, pull_request]

jobs:
  billing-security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - name: Run Critical Billing Tests
        run: npm run test tests/unit/billing tests/integration/billing
        env:
          STRIPE_SECRET_KEY: ${{ secrets.STRIPE_TEST_SECRET_KEY }}
          STRIPE_WEBHOOK_SECRET: ${{ secrets.STRIPE_TEST_WEBHOOK_SECRET }}
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.TEST_SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.TEST_SUPABASE_SERVICE_KEY }}
```

## 📈 Monitoring and Alerts

### Test Failure Alerts
Set up alerts for test failures in production:

```typescript
// Monitor critical test scenarios in production
const criticalScenarios = [
  'webhook_signature_validation',
  'quota_bypass_prevention', 
  'bonus_consumption_atomicity',
  'payment_flow_completion'
]

// Alert if any critical scenario fails
if (criticalScenarios.some(scenario => testResults[scenario].failed)) {
  alerting.sendCritical('Billing security test failure detected')
}
```

### Coverage Requirements
Maintain high coverage for billing code:

```json
{
  "jest": {
    "collectCoverageFrom": [
      "src/app/api/billing/**/*.ts",
      "src/app/api/stripe-webhook/**/*.ts", 
      "src/services/payment/**/*.ts"
    ],
    "coverageThreshold": {
      "global": {
        "statements": 95,
        "branches": 90,
        "functions": 95,
        "lines": 95
      }
    }
  }
}
```

## 🔍 Debugging Failed Tests

### Common Issues and Solutions

#### 1. Environment Variable Errors
```typescript
// Error: STRIPE_SECRET_KEY is undefined
// Solution: Set test environment variables
vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_mock_key')
```

#### 2. Mock Data Inconsistencies
```typescript
// Error: Customer not found
// Solution: Ensure mock data relationships are consistent
const customer = billingFactory.createCustomer()
const subscription = billingFactory.createSubscription({ 
  stripe_customer_id: customer.stripe_customer_id 
})
```

#### 3. Race Condition Test Failures
```typescript
// Error: Race condition tests are flaky
// Solution: Use proper async/await and deterministic mocks
await Promise.all(concurrentRequests)
expect(mockFunction).toHaveBeenCalledTimes(expectedCount)
```

#### 4. Webhook Signature Validation
```typescript
// Error: Webhook signature validation always fails
// Solution: Ensure mock Stripe webhook construction
mockStripe.webhooks.constructEvent.mockReturnValue(validEvent)
```

## 📚 Additional Resources

- [Stripe Webhook Security Best Practices](https://stripe.com/docs/webhooks/best-practices)
- [Supabase Auth Security](https://supabase.com/docs/guides/auth/auth-helpers/nextjs)
- [Next.js API Route Testing](https://nextjs.org/docs/testing)
- [Vitest Testing Framework](https://vitest.dev/)

## 🎯 Success Criteria

These tests are successful when they:

1. ✅ **Prevent Revenue Loss**: Block unauthorized access to paid features
2. ✅ **Ensure Payment Integrity**: Validate complete payment flows
3. ✅ **Protect Against Abuse**: Prevent quota and bonus system exploitation  
4. ✅ **Maintain Data Consistency**: Handle race conditions and failures gracefully
5. ✅ **Validate Security Controls**: Enforce authentication and authorization
6. ✅ **Provide Coverage**: Test all critical billing system components

The goal is zero revenue-impacting vulnerabilities in production through comprehensive test coverage of all identified security risks.