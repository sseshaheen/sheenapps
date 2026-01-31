/**
 * P0-A: SDK Payments Tests
 *
 * DEPLOY-BLOCKING: These tests must pass at 100% for every deploy.
 *
 * Tests the @sheenapps/payments SDK critical paths:
 * - Create checkout session
 * - Create customer
 * - Webhook signature verification
 * - Validation errors
 *
 * Uses:
 * - SDK test harness for project setup/teardown
 * - CI-safe mode (stripe-mock or SDK_E2E_MOCK_STRIPE=true)
 * - SDK clients for payments operations
 *
 * Note: P0-A uses stripe-mock - no real Stripe ID assertions.
 * P0-B tests real Stripe test mode.
 */

import { test, expect } from '@playwright/test';
import { testHarness } from '../helpers/sdk-test-harness';
import { createSDKClients, type SDKClients } from '../helpers/sdk-client';
import {
  SDKTestContext,
  sdkUniqueEmail,
  SDK_TEST_DATA,
  SDK_ERROR_CODES,
} from '../fixtures/sdk-fixtures';
import { RUN_ID } from '../fixtures/test-data';
import { TIMEOUTS } from '../helpers/timeouts';

test.describe('P0-A: SDK Payments', () => {
  let ctx: SDKTestContext | null = null;
  let clients: SDKClients;

  test.beforeAll(async () => {
    ctx = await testHarness.createProject({ plan: 'pro' });
    clients = createSDKClients(ctx);

    // Store mock Stripe keys for payments SDK
    // (In CI-safe mode, stripe-mock accepts any key format)
    await clients.secrets.create({
      name: 'STRIPE_SECRET_KEY',
      value: 'sk_test_mock_key_for_e2e',
    });
    await clients.secrets.create({
      name: 'STRIPE_WEBHOOK_SECRET',
      value: 'whsec_test_mock_secret',
    });
  });

  test.afterAll(async () => {
    if (ctx) {
      await testHarness.cleanupProject(ctx.projectId);
    }
  });

  test.describe('Checkout Session', () => {
    test('create checkout session returns valid response', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.payments.createCheckoutSession({
        priceId: SDK_TEST_DATA.payments.testPriceId,
        successUrl: SDK_TEST_DATA.payments.urls.success,
        cancelUrl: SDK_TEST_DATA.payments.urls.cancel,
      });

      expect(error, `createCheckoutSession failed: ${error?.message}`).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.session).toBeDefined();
      // P0-A: Don't assert checkout.stripe.com - stripe-mock uses different URL
      expect(data?.session?.url).toBeDefined();
      expect(typeof data?.session?.url).toBe('string');
      expect(data?.session?.id).toBeDefined();
    });

    test('create checkout session with customer email', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.payments.createCheckoutSession({
        priceId: SDK_TEST_DATA.payments.testPriceId,
        successUrl: SDK_TEST_DATA.payments.urls.success,
        cancelUrl: SDK_TEST_DATA.payments.urls.cancel,
        customerEmail: sdkUniqueEmail('checkout'),
      });

      expect(error).toBeNull();
      expect(data?.session?.id).toBeDefined();
    });

    test('create checkout session with idempotency key', async () => {
      test.setTimeout(TIMEOUTS.apiCall * 2);

      const idempotencyKey = `e2e-checkout-${RUN_ID}-${Date.now()}`;

      // First call
      const { data: first, error: firstError } = await clients.payments.createCheckoutSession({
        priceId: SDK_TEST_DATA.payments.testPriceId,
        successUrl: SDK_TEST_DATA.payments.urls.success,
        cancelUrl: SDK_TEST_DATA.payments.urls.cancel,
        idempotencyKey,
      });

      expect(firstError).toBeNull();
      expect(first?.session?.id).toBeDefined();

      // Second call with same key - should return same session
      const { data: second, error: secondError } = await clients.payments.createCheckoutSession({
        priceId: SDK_TEST_DATA.payments.testPriceId,
        successUrl: SDK_TEST_DATA.payments.urls.success,
        cancelUrl: SDK_TEST_DATA.payments.urls.cancel,
        idempotencyKey,
      });

      expect(secondError).toBeNull();
      expect(second?.session?.id).toBe(first?.session?.id);
    });

    test('create subscription checkout session', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.payments.createCheckoutSession({
        priceId: SDK_TEST_DATA.payments.testPriceId,
        successUrl: SDK_TEST_DATA.payments.urls.success,
        cancelUrl: SDK_TEST_DATA.payments.urls.cancel,
        mode: 'subscription',
      });

      expect(error).toBeNull();
      expect(data?.session?.id).toBeDefined();
    });

    test('create one-time payment checkout session', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.payments.createCheckoutSession({
        priceId: SDK_TEST_DATA.payments.testPriceId,
        successUrl: SDK_TEST_DATA.payments.urls.success,
        cancelUrl: SDK_TEST_DATA.payments.urls.cancel,
        mode: 'payment',
      });

      expect(error).toBeNull();
      expect(data?.session?.id).toBeDefined();
    });
  });

  test.describe('Customer Management', () => {
    test('create customer returns valid response', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.payments.createCustomer({
        email: sdkUniqueEmail('customer'),
        name: SDK_TEST_DATA.payments.testCustomer.name,
      });

      expect(error, `createCustomer failed: ${error?.message}`).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.customer).toBeDefined();
      // P0-A: Don't assert cus_ prefix - stripe-mock may return different format
      expect(data?.customer?.id).toBeDefined();
      expect(typeof data?.customer?.id).toBe('string');
      expect(data?.customer?.email).toContain('customer');
    });

    test('create customer with metadata', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.payments.createCustomer({
        email: sdkUniqueEmail('customer-meta'),
        name: 'Test Customer Meta',
        metadata: {
          userId: 'user-123',
          plan: 'pro',
          runId: RUN_ID,
        },
      });

      expect(error).toBeNull();
      expect(data?.customer?.id).toBeDefined();
    });

    test('get customer returns customer details', async () => {
      test.setTimeout(TIMEOUTS.apiCall * 2);

      // Create customer first
      const { data: createData } = await clients.payments.createCustomer({
        email: sdkUniqueEmail('get-customer'),
        name: 'Get Customer Test',
      });

      expect(createData?.customer?.id).toBeDefined();

      // Get customer
      const { data, error } = await clients.payments.getCustomer(createData!.customer!.id);

      expect(error, `getCustomer failed: ${error?.message}`).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.customer?.id).toBe(createData?.customer?.id);
    });

    test('get nonexistent customer returns error', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.payments.getCustomer('cus_nonexistent_12345');

      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.code).toBe(SDK_ERROR_CODES.NOT_FOUND);
    });
  });

  test.describe('Billing Portal', () => {
    test('create portal session returns URL', async () => {
      test.setTimeout(TIMEOUTS.apiCall * 2);

      // Create customer first
      const { data: customerData } = await clients.payments.createCustomer({
        email: sdkUniqueEmail('portal'),
        name: 'Portal Test Customer',
      });

      expect(customerData?.customer?.id).toBeDefined();

      // Create portal session
      const { data, error } = await clients.payments.createPortalSession({
        customerId: customerData!.customer!.id,
        returnUrl: 'http://localhost:3000/account',
      });

      expect(error, `createPortalSession failed: ${error?.message}`).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.session).toBeDefined();
      expect(data?.session?.url).toBeDefined();
      expect(typeof data?.session?.url).toBe('string');
    });
  });

  test.describe('Webhook Verification', () => {
    test('verify webhook with valid signature succeeds', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      // Use test harness to generate valid signature
      const payload = JSON.stringify({
        type: SDK_TEST_DATA.payments.webhookEvents.checkoutCompleted,
        data: { object: { id: 'cs_test_123' } },
      });

      let signature: string;
      try {
        signature = await testHarness.generateStripeSignature(payload);
      } catch {
        // If signature generation not available, skip this test
        test.skip();
        return;
      }

      const { data, error } = await clients.payments.verifyWebhook({
        payload,
        signature,
      });

      expect(error, `verifyWebhook failed: ${error?.message}`).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.event).toBeDefined();
      expect(data?.event?.type).toBe(SDK_TEST_DATA.payments.webhookEvents.checkoutCompleted);
    });

    test('verify webhook with invalid signature fails', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const payload = JSON.stringify({ type: 'test.event', data: {} });

      const { data, error } = await clients.payments.verifyWebhook({
        payload,
        signature: 'invalid_signature_format_12345',
      });

      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.code).toBe(SDK_ERROR_CODES.INVALID_SIGNATURE);
    });

    test('verify webhook with empty payload fails', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.payments.verifyWebhook({
        payload: '',
        signature: 't=123,v1=abc',
      });

      expect(data).toBeNull();
      expect(error).not.toBeNull();
    });
  });

  test.describe('List Subscriptions', () => {
    test('list subscriptions for customer returns array', async () => {
      test.setTimeout(TIMEOUTS.apiCall * 2);

      // Create customer first
      const { data: customerData } = await clients.payments.createCustomer({
        email: sdkUniqueEmail('list-subs'),
        name: 'List Subs Test',
      });

      expect(customerData?.customer?.id).toBeDefined();

      // List subscriptions (may be empty)
      const { data, error } = await clients.payments.listSubscriptions(
        customerData!.customer!.id
      );

      expect(error, `listSubscriptions failed: ${error?.message}`).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.subscriptions).toBeDefined();
      expect(Array.isArray(data?.subscriptions)).toBe(true);
    });
  });

  test.describe('List Events', () => {
    test('list payment events returns array', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.payments.listEvents({ limit: 10 });

      expect(error, `listEvents failed: ${error?.message}`).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.events).toBeDefined();
      expect(Array.isArray(data?.events)).toBe(true);
    });

    test('list events with type filter', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.payments.listEvents({
        type: 'checkout.session.completed',
        limit: 5,
      });

      expect(error).toBeNull();
      expect(data?.events).toBeDefined();
    });
  });

  test.describe('Validation Errors', () => {
    test('create checkout without priceId returns error', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.payments.createCheckoutSession({
        priceId: '',
        successUrl: SDK_TEST_DATA.payments.urls.success,
        cancelUrl: SDK_TEST_DATA.payments.urls.cancel,
      });

      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.code).toBe(SDK_ERROR_CODES.VALIDATION_ERROR);
    });

    test('create checkout without URLs returns error', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.payments.createCheckoutSession({
        priceId: SDK_TEST_DATA.payments.testPriceId,
        successUrl: '',
        cancelUrl: '',
      });

      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.code).toBe(SDK_ERROR_CODES.VALIDATION_ERROR);
    });

    test('create customer without email returns error', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.payments.createCustomer({
        email: '',
        name: 'No Email Customer',
      });

      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.code).toBe(SDK_ERROR_CODES.VALIDATION_ERROR);
    });
  });

  test.describe('Error Contract', () => {
    test('error has code, message, and requestId', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { error } = await clients.payments.createCheckoutSession({
        priceId: '',
        successUrl: '',
        cancelUrl: '',
      });

      expect(error).not.toBeNull();
      expect(error?.code).toBeDefined();
      expect(typeof error?.code).toBe('string');
      expect(error?.message).toBeDefined();
      expect(typeof error?.message).toBe('string');
      // requestId enables support debugging
      const hasRequestId = error?.requestId || (error as any)?.correlationId;
      expect(hasRequestId).toBeDefined();
    });
  });
});
