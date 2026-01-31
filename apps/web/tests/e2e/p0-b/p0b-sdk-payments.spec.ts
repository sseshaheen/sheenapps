/**
 * P0-B: SDK Payments Tests (Real Stripe)
 *
 * NIGHTLY: These tests run nightly with real Stripe test mode.
 * They verify actual Stripe API integration.
 *
 * Tests:
 * - Checkout session URL points to Stripe
 * - Customer ID has Stripe format (cus_*)
 * - Subscription management
 * - Webhook signature verification
 * - Billing portal access
 *
 * Requires: STRIPE_TEST_SECRET_KEY and STRIPE_TEST_WEBHOOK_SECRET
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
import { TIMEOUTS, sleep } from '../helpers/timeouts';

test.describe('P0-B: SDK Payments Real Stripe', () => {
  let ctx: SDKTestContext | null = null;
  let clients: SDKClients;

  test.beforeAll(async () => {
    ctx = await testHarness.createProject({ plan: 'pro' });
    clients = createSDKClients(ctx);

    // Store real Stripe test keys
    if (process.env.STRIPE_TEST_SECRET_KEY) {
      await clients.secrets.create({
        name: 'STRIPE_SECRET_KEY',
        value: process.env.STRIPE_TEST_SECRET_KEY,
      });
    }
    if (process.env.STRIPE_TEST_WEBHOOK_SECRET) {
      await clients.secrets.create({
        name: 'STRIPE_WEBHOOK_SECRET',
        value: process.env.STRIPE_TEST_WEBHOOK_SECRET,
      });
    }
  });

  test.afterAll(async () => {
    if (ctx) {
      await testHarness.cleanupProject(ctx.projectId);
    }
  });

  test.describe('Checkout Sessions', () => {
    test('checkout session URL points to Stripe', async () => {
      test.setTimeout(TIMEOUTS.p0b.realStripe);

      const { data, error } = await clients.payments.createCheckoutSession({
        priceId: process.env.STRIPE_TEST_PRICE_ID || SDK_TEST_DATA.payments.testPriceId,
        successUrl: SDK_TEST_DATA.payments.urls.success,
        cancelUrl: SDK_TEST_DATA.payments.urls.cancel,
      });

      expect(error, `createCheckoutSession failed: ${error?.message}`).toBeNull();
      expect(data?.session).toBeDefined();
      expect(data?.session?.url).toBeDefined();

      // P0-B: Assert real Stripe checkout URL
      if (process.env.SDK_E2E_REAL_STRIPE === 'true') {
        expect(data?.session?.url).toContain('checkout.stripe.com');
      }

      // Session ID should have Stripe format
      if (process.env.SDK_E2E_REAL_STRIPE === 'true') {
        expect(data?.session?.id).toMatch(/^cs_/);
      }
    });

    test('checkout session with customer email', async () => {
      test.setTimeout(TIMEOUTS.p0b.realStripe);

      const { data, error } = await clients.payments.createCheckoutSession({
        priceId: process.env.STRIPE_TEST_PRICE_ID || SDK_TEST_DATA.payments.testPriceId,
        successUrl: SDK_TEST_DATA.payments.urls.success,
        cancelUrl: SDK_TEST_DATA.payments.urls.cancel,
        customerEmail: sdkUniqueEmail('p0b-checkout'),
      });

      expect(error).toBeNull();
      expect(data?.session?.id).toBeDefined();
    });

    test('checkout session with metadata', async () => {
      test.setTimeout(TIMEOUTS.p0b.realStripe);

      const { data, error } = await clients.payments.createCheckoutSession({
        priceId: process.env.STRIPE_TEST_PRICE_ID || SDK_TEST_DATA.payments.testPriceId,
        successUrl: SDK_TEST_DATA.payments.urls.success,
        cancelUrl: SDK_TEST_DATA.payments.urls.cancel,
        metadata: {
          projectId: ctx!.projectId,
          runId: RUN_ID,
          source: 'p0b-test',
        },
      });

      expect(error).toBeNull();
      expect(data?.session?.id).toBeDefined();
    });

    test('subscription mode checkout session', async () => {
      test.setTimeout(TIMEOUTS.p0b.realStripe);

      const { data, error } = await clients.payments.createCheckoutSession({
        priceId: process.env.STRIPE_TEST_PRICE_ID || SDK_TEST_DATA.payments.testPriceId,
        successUrl: SDK_TEST_DATA.payments.urls.success,
        cancelUrl: SDK_TEST_DATA.payments.urls.cancel,
        mode: 'subscription',
      });

      expect(error).toBeNull();
      expect(data?.session?.url).toContain('checkout.stripe.com');
    });

    test('payment mode checkout session', async () => {
      test.setTimeout(TIMEOUTS.p0b.realStripe);

      const { data, error } = await clients.payments.createCheckoutSession({
        priceId: process.env.STRIPE_TEST_PRICE_ID || SDK_TEST_DATA.payments.testPriceId,
        successUrl: SDK_TEST_DATA.payments.urls.success,
        cancelUrl: SDK_TEST_DATA.payments.urls.cancel,
        mode: 'payment',
      });

      expect(error).toBeNull();
      expect(data?.session?.id).toBeDefined();
    });
  });

  test.describe('Customer Management', () => {
    test('customer ID has Stripe format', async () => {
      test.setTimeout(TIMEOUTS.p0b.realStripe);

      const { data, error } = await clients.payments.createCustomer({
        email: sdkUniqueEmail('p0b-customer'),
        name: 'P0B Test Customer',
      });

      expect(error, `createCustomer failed: ${error?.message}`).toBeNull();
      expect(data?.customer).toBeDefined();

      // P0-B: Assert real Stripe customer ID format
      if (process.env.SDK_E2E_REAL_STRIPE === 'true') {
        expect(data?.customer?.id).toMatch(/^cus_/);
      }
    });

    test('get customer returns details', async () => {
      test.setTimeout(TIMEOUTS.p0b.realStripe);

      // Create customer first
      const email = sdkUniqueEmail('p0b-get-customer');
      const { data: createData } = await clients.payments.createCustomer({
        email,
        name: 'P0B Get Customer Test',
        metadata: { runId: RUN_ID },
      });

      expect(createData?.customer?.id).toBeDefined();

      // Get customer
      const { data, error } = await clients.payments.getCustomer(createData!.customer!.id);

      expect(error).toBeNull();
      expect(data?.customer).toBeDefined();
      expect(data?.customer?.email).toBe(email);
    });

    test('customer with metadata', async () => {
      test.setTimeout(TIMEOUTS.p0b.realStripe);

      const { data, error } = await clients.payments.createCustomer({
        email: sdkUniqueEmail('p0b-customer-meta'),
        name: 'P0B Metadata Customer',
        metadata: {
          userId: 'user-123',
          plan: 'pro',
          runId: RUN_ID,
        },
      });

      expect(error).toBeNull();
      expect(data?.customer?.id).toBeDefined();
    });
  });

  test.describe('Billing Portal', () => {
    test('portal session URL is valid', async () => {
      test.setTimeout(TIMEOUTS.p0b.realStripe);

      // Create customer first
      const { data: customerData } = await clients.payments.createCustomer({
        email: sdkUniqueEmail('p0b-portal'),
        name: 'P0B Portal Test',
      });

      expect(customerData?.customer?.id).toBeDefined();

      // Create portal session
      const { data, error } = await clients.payments.createPortalSession({
        customerId: customerData!.customer!.id,
        returnUrl: 'http://localhost:3000/account',
      });

      expect(error, `createPortalSession failed: ${error?.message}`).toBeNull();
      expect(data?.session).toBeDefined();
      expect(data?.session?.url).toBeDefined();

      // P0-B: Assert real Stripe billing portal URL
      if (process.env.SDK_E2E_REAL_STRIPE === 'true') {
        expect(data?.session?.url).toContain('billing.stripe.com');
      }
    });
  });

  test.describe('Subscription Management', () => {
    test('list subscriptions for customer', async () => {
      test.setTimeout(TIMEOUTS.p0b.realStripe);

      // Create customer
      const { data: customerData } = await clients.payments.createCustomer({
        email: sdkUniqueEmail('p0b-list-subs'),
        name: 'P0B List Subs Test',
      });

      expect(customerData?.customer?.id).toBeDefined();

      // List subscriptions (will be empty for new customer)
      const { data, error } = await clients.payments.listSubscriptions(
        customerData!.customer!.id
      );

      expect(error).toBeNull();
      expect(data?.subscriptions).toBeDefined();
      expect(Array.isArray(data?.subscriptions)).toBe(true);
    });
  });

  test.describe('Webhook Verification', () => {
    test('valid webhook signature verifies', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      // This test requires generating a valid Stripe signature
      // Using test harness helper if available
      const payload = JSON.stringify({
        id: `evt_test_${Date.now()}`,
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_test_123',
            customer: 'cus_test_456',
          },
        },
      });

      let signature: string;
      try {
        signature = await testHarness.generateStripeSignature(payload);
      } catch {
        // If signature generation not available, skip
        test.skip();
        return;
      }

      const { data, error } = await clients.payments.verifyWebhook({
        payload,
        signature,
      });

      expect(error).toBeNull();
      expect(data?.event).toBeDefined();
      expect(data?.event?.type).toBe('checkout.session.completed');
    });

    test('invalid webhook signature fails', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const payload = JSON.stringify({
        id: 'evt_test_invalid',
        type: 'test.event',
        data: {},
      });

      const { data, error } = await clients.payments.verifyWebhook({
        payload,
        signature: 't=1234567890,v1=invalid_signature_here',
      });

      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.code).toBe(SDK_ERROR_CODES.INVALID_SIGNATURE);
    });
  });

  test.describe('Events', () => {
    test('list payment events', async () => {
      test.setTimeout(TIMEOUTS.p0b.realStripe);

      const { data, error } = await clients.payments.listEvents({
        limit: 10,
      });

      expect(error).toBeNull();
      expect(data?.events).toBeDefined();
      expect(Array.isArray(data?.events)).toBe(true);
    });

    test('list events with type filter', async () => {
      test.setTimeout(TIMEOUTS.p0b.realStripe);

      const { data, error } = await clients.payments.listEvents({
        type: 'checkout.session.completed',
        limit: 5,
      });

      expect(error).toBeNull();
      expect(data?.events).toBeDefined();

      // All events should match the type
      for (const event of data?.events || []) {
        expect(event.type).toBe('checkout.session.completed');
      }
    });
  });

  test.describe('Error Handling', () => {
    test('invalid price ID returns error', async () => {
      test.setTimeout(TIMEOUTS.p0b.realStripe);

      const { data, error } = await clients.payments.createCheckoutSession({
        priceId: 'price_invalid_12345',
        successUrl: SDK_TEST_DATA.payments.urls.success,
        cancelUrl: SDK_TEST_DATA.payments.urls.cancel,
      });

      // With real Stripe, invalid price should return error
      if (process.env.SDK_E2E_REAL_STRIPE === 'true') {
        expect(data).toBeNull();
        expect(error).not.toBeNull();
      }
    });

    test('get nonexistent customer returns error', async () => {
      test.setTimeout(TIMEOUTS.p0b.realStripe);

      const { data, error } = await clients.payments.getCustomer('cus_nonexistent_p0b_12345');

      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.code).toBe(SDK_ERROR_CODES.NOT_FOUND);
    });
  });

  test.describe('Idempotency', () => {
    test('idempotent checkout sessions', async () => {
      test.setTimeout(TIMEOUTS.p0b.realStripe * 2);

      const idempotencyKey = `p0b-checkout-${RUN_ID}-${Date.now()}`;

      // First request
      const { data: first, error: firstError } = await clients.payments.createCheckoutSession({
        priceId: process.env.STRIPE_TEST_PRICE_ID || SDK_TEST_DATA.payments.testPriceId,
        successUrl: SDK_TEST_DATA.payments.urls.success,
        cancelUrl: SDK_TEST_DATA.payments.urls.cancel,
        idempotencyKey,
      });

      expect(firstError).toBeNull();
      expect(first?.session?.id).toBeDefined();

      // Second request with same key
      const { data: second, error: secondError } = await clients.payments.createCheckoutSession({
        priceId: process.env.STRIPE_TEST_PRICE_ID || SDK_TEST_DATA.payments.testPriceId,
        successUrl: SDK_TEST_DATA.payments.urls.success,
        cancelUrl: SDK_TEST_DATA.payments.urls.cancel,
        idempotencyKey,
      });

      expect(secondError).toBeNull();
      expect(second?.session?.id).toBe(first?.session?.id);
    });
  });
});
