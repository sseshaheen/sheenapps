/**
 * P0-A: SDK Analytics Tests
 *
 * DEPLOY-BLOCKING: These tests must pass at 100% for every deploy.
 *
 * Tests the @sheenapps/analytics SDK critical paths:
 * - Track events
 * - Page views
 * - User identification
 * - Server-side event querying
 * - Key context (public vs server)
 *
 * Uses:
 * - SDK test harness for project setup/teardown
 * - SDK clients for analytics operations
 *
 * Note: Analytics works with both public keys (tracking) and server keys (querying).
 */

import { test, expect } from '@playwright/test';
import { testHarness } from '../helpers/sdk-test-harness';
import { createSDKClients, createAnalyticsClientForTest, type SDKClients } from '../helpers/sdk-client';
import {
  SDKTestContext,
  sdkUniqueEmail,
  SDK_TEST_DATA,
  SDK_ERROR_CODES,
} from '../fixtures/sdk-fixtures';
import { RUN_ID } from '../fixtures/test-data';
import { TIMEOUTS } from '../helpers/timeouts';

test.describe('P0-A: SDK Analytics', () => {
  let ctx: SDKTestContext | null = null;
  let clients: SDKClients;

  test.beforeAll(async () => {
    ctx = await testHarness.createProject({ plan: 'pro' });
    clients = createSDKClients(ctx);
  });

  test.afterAll(async () => {
    if (ctx) {
      await testHarness.cleanupProject(ctx.projectId);
    }
  });

  test.describe('Track Events', () => {
    test('track event succeeds', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.analytics.track('button_click', {
        button: 'submit',
        page: '/checkout',
        runId: RUN_ID,
      });

      expect(error, `track failed: ${error?.message}`).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.success).toBe(true);
    });

    test('track event with userId', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.analytics.track(
        'purchase_completed',
        {
          amount: 99.99,
          currency: 'USD',
          runId: RUN_ID,
        },
        { userId: 'user-123' }
      );

      expect(error).toBeNull();
      expect(data?.success).toBe(true);
    });

    test('track event with anonymousId', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const anonymousId = `anon-${RUN_ID}-${Date.now()}`;

      const { data, error } = await clients.analytics.track(
        'page_scroll',
        {
          scrollDepth: 50,
          page: '/blog/article',
        },
        { anonymousId }
      );

      expect(error).toBeNull();
      expect(data?.success).toBe(true);
    });

    test('track multiple events', async () => {
      test.setTimeout(TIMEOUTS.apiCall * 3);

      const events = SDK_TEST_DATA.analytics.events;

      for (const event of events) {
        const { data, error } = await clients.analytics.track(event.name, {
          ...event.properties,
          runId: RUN_ID,
        });

        expect(error, `track ${event.name} failed: ${error?.message}`).toBeNull();
        expect(data?.success).toBe(true);
      }
    });

    test('track with timestamp', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.analytics.track(
        'historical_event',
        { value: 42 },
        { timestamp: new Date().toISOString() }
      );

      expect(error).toBeNull();
      expect(data?.success).toBe(true);
    });
  });

  test.describe('Page Views', () => {
    test('page view tracking succeeds', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.analytics.page('/dashboard', {
        title: 'Dashboard',
        referrer: '/login',
      });

      expect(error, `page failed: ${error?.message}`).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.success).toBe(true);
    });

    test('page view with search query', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.analytics.page('/search', {
        query: 'test search',
        resultsCount: 42,
      });

      expect(error).toBeNull();
      expect(data?.success).toBe(true);
    });

    test('page view with userId', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.analytics.page(
        '/account/settings',
        { section: 'profile' },
        { userId: 'user-456' }
      );

      expect(error).toBeNull();
      expect(data?.success).toBe(true);
    });
  });

  test.describe('User Identification', () => {
    test('identify user with traits', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const userId = `user-${RUN_ID}-${Date.now()}`;

      const { data, error } = await clients.analytics.identify(userId, {
        email: sdkUniqueEmail('identify'),
        plan: 'pro',
        createdAt: new Date().toISOString(),
      });

      expect(error, `identify failed: ${error?.message}`).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.success).toBe(true);
    });

    test('identify links anonymous to user', async () => {
      test.setTimeout(TIMEOUTS.apiCall * 2);

      const anonymousId = `anon-${RUN_ID}-${Date.now()}`;
      const userId = `user-linked-${RUN_ID}`;

      // Track as anonymous first
      await clients.analytics.track(
        'signup_started',
        { source: 'landing_page' },
        { anonymousId }
      );

      // Identify user (links anonymous activity)
      const { data, error } = await clients.analytics.identify(
        userId,
        {
          email: sdkUniqueEmail('linked'),
          name: 'Linked User',
        },
        { anonymousId }
      );

      expect(error).toBeNull();
      expect(data?.success).toBe(true);
    });

    test('identify with minimal traits', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const userId = `user-minimal-${RUN_ID}`;

      const { data, error } = await clients.analytics.identify(userId, {});

      expect(error).toBeNull();
      expect(data?.success).toBe(true);
    });
  });

  test.describe('Server-Side Queries (Server Key)', () => {
    test('listEvents returns tracked events', async () => {
      test.setTimeout(TIMEOUTS.apiCall * 2);

      // Track some events first
      await clients.analyticsServer.track('test_event_for_list', {
        runId: RUN_ID,
      });

      // Query with server key
      const { data, error } = await clients.analyticsServer.listEvents({
        limit: 10,
      });

      expect(error, `listEvents failed: ${error?.message}`).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.events).toBeDefined();
      expect(Array.isArray(data?.events)).toBe(true);
    });

    test('listEvents with eventType filter', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.analyticsServer.listEvents({
        eventType: 'track',
        limit: 5,
      });

      expect(error).toBeNull();
      expect(data?.events).toBeDefined();
    });

    test('getCounts returns aggregated data', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.analyticsServer.getCounts({
        groupBy: 'event',
      });

      expect(error, `getCounts failed: ${error?.message}`).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.counts).toBeDefined();
    });

    test('getCounts with day grouping', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.analyticsServer.getCounts({
        groupBy: 'day',
      });

      expect(error).toBeNull();
      expect(data?.counts).toBeDefined();
    });

    test('getUser returns user profile', async () => {
      test.setTimeout(TIMEOUTS.apiCall * 2);

      const userId = `user-profile-${RUN_ID}`;

      // Identify first
      await clients.analyticsServer.identify(userId, {
        email: sdkUniqueEmail('profile'),
        plan: 'pro',
      });

      // Get user
      const { data, error } = await clients.analyticsServer.getUser(userId);

      expect(error, `getUser failed: ${error?.message}`).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.user).toBeDefined();
      if (data?.user?.traits) {
        expect(data.user.traits.plan).toBe('pro');
      }
    });

    test('getUser for nonexistent returns empty or error', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.analyticsServer.getUser(
        'nonexistent-user-xyz-12345'
      );

      // May return null user or NOT_FOUND error
      if (error) {
        expect(error.code).toBe(SDK_ERROR_CODES.NOT_FOUND);
      } else {
        expect(data?.user).toBeNull();
      }
    });
  });

  test.describe('Key Context', () => {
    test('public key can track events', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      if (!ctx) {
        test.skip();
        return;
      }

      // Create client with public key
      const publicClient = createAnalyticsClientForTest(ctx, { useServerKey: false });

      const { data, error } = await publicClient.track('public_key_track', {
        source: 'browser',
        runId: RUN_ID,
      });

      expect(error).toBeNull();
      expect(data?.success).toBe(true);
    });

    test('public key cannot query events', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      if (!ctx) {
        test.skip();
        return;
      }

      // Create client with public key
      const publicClient = createAnalyticsClientForTest(ctx, { useServerKey: false });

      const { data, error } = await publicClient.listEvents({ limit: 5 });

      // Server-only operation with public key should fail
      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.code).toBe(SDK_ERROR_CODES.FORBIDDEN);
    });

    test('server key can both track and query', async () => {
      test.setTimeout(TIMEOUTS.apiCall * 2);

      // Track with server key
      const { data: trackData, error: trackError } = await clients.analyticsServer.track(
        'server_key_track',
        { runId: RUN_ID }
      );

      expect(trackError).toBeNull();
      expect(trackData?.success).toBe(true);

      // Query with server key
      const { data: listData, error: listError } = await clients.analyticsServer.listEvents({
        limit: 5,
      });

      expect(listError).toBeNull();
      expect(listData?.events).toBeDefined();
    });
  });

  test.describe('Context Options', () => {
    test('track with full context', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.analytics.track(
        'full_context_event',
        { action: 'test' },
        {
          userId: 'user-ctx',
          context: {
            userAgent: 'E2E Test Agent',
            locale: 'en-US',
            timezone: 'America/New_York',
            page: {
              path: '/test',
              title: 'Test Page',
            },
          },
        }
      );

      expect(error).toBeNull();
      expect(data?.success).toBe(true);
    });
  });

  test.describe('Error Handling', () => {
    test('empty event name is handled', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.analytics.track('', { test: true });

      // May succeed (server normalizes) or return validation error
      if (error) {
        expect(error.code).toBe(SDK_ERROR_CODES.VALIDATION_ERROR);
      }
    });

    test('error has code, message, and requestId', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      if (!ctx) {
        test.skip();
        return;
      }

      // Use public key to trigger FORBIDDEN error on query
      const publicClient = createAnalyticsClientForTest(ctx, { useServerKey: false });
      const { error } = await publicClient.listEvents({ limit: 5 });

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
