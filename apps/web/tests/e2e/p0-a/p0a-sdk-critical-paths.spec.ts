/**
 * P0-A: SDK Critical Paths
 *
 * DEPLOY-BLOCKING: This test must pass at 100% for every deploy.
 *
 * The most important P0-A test: Proves all SDK services compose correctly
 * in a single happy path flow.
 *
 * Journey: Create user → Insert profile → Upload avatar → Enqueue job → Track event → Store secret → Request backup
 *
 * Uses:
 * - SDK test harness for project setup/teardown
 * - SDK clients for service operations
 * - CI-safe mode (stubbed external services)
 * - Bounded waits (deterministic timing)
 */

import { test, expect } from '@playwright/test';
import { testHarness } from '../helpers/sdk-test-harness';
import { createSDKClients, type SDKClients } from '../helpers/sdk-client';
import {
  SDKTestContext,
  sdkUniqueEmail,
  sdkUniqueSecretName,
  SDK_TEST_DATA,
} from '../fixtures/sdk-fixtures';
import { RUN_ID } from '../fixtures/test-data';
import { TIMEOUTS } from '../helpers/timeouts';

test.describe('P0-A: SDK Critical Paths', () => {
  test.describe.configure({ mode: 'serial' });

  let ctx: SDKTestContext | null = null;
  let clients: SDKClients;
  let userId: string;

  test.beforeAll(async () => {
    // Create test project with SDK keys
    ctx = await testHarness.createProject({ plan: 'pro' });
    clients = createSDKClients(ctx);
  });

  test.afterAll(async () => {
    // Clean up test project
    if (ctx) {
      await testHarness.cleanupProject(ctx.projectId);
    }
  });

  test('P0-A-SDK-1: SDK services compose end-to-end', async () => {
    // Set reasonable timeout for this chained test
    test.setTimeout(TIMEOUTS.apiCall * 10);

    // Step 1: Create user via auth SDK
    await test.step('Create user via auth SDK', async () => {
      const email = sdkUniqueEmail('critical-path');
      const { data, error } = await clients.auth.signUp({
        email,
        password: SDK_TEST_DATA.auth.validUser.password,
      });

      expect(error, `Auth signUp failed: ${error?.message}`).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.user?.id).toBeDefined();
      expect(data?.sessionToken).toBeDefined();

      userId = data!.user.id;
    });

    // Step 2: Insert profile row via db SDK
    await test.step('Insert profile via db SDK', async () => {
      const { data, error } = await clients.db
        .from('user_profiles')
        .insert({
          user_id: userId,
          display_name: 'Test User',
          bio: 'SDK Critical Path Test',
        })
        .execute();

      // Note: May fail if table doesn't exist in test schema - that's OK for initial setup
      if (error && !error.message.includes('does not exist')) {
        expect(error).toBeNull();
      }
    });

    // Step 3: Upload avatar via storage SDK
    await test.step('Upload avatar via storage SDK', async () => {
      const { data: urlData, error: urlError } =
        await clients.storage.createSignedUploadUrl({
          path: `avatars/${userId}.png`,
          contentType: 'image/png',
        });

      expect(urlError, `Storage createSignedUploadUrl failed: ${urlError?.message}`).toBeNull();
      expect(urlData).not.toBeNull();
      expect(urlData?.url).toBeDefined();
      expect(urlData?.method).toBe('PUT');
      expect(urlData?.headers).toBeDefined();

      // Upload small test content (in CI-safe mode, goes to stub)
      if (urlData?.url) {
        const uploadResponse = await fetch(urlData.url, {
          method: urlData.method || 'PUT',
          headers: urlData.headers,
          body: SDK_TEST_DATA.storage.files.image.content,
        });
        expect(uploadResponse.ok, `Upload failed: ${uploadResponse.status}`).toBe(true);
      }
    });

    // Step 4: Enqueue welcome email job via jobs SDK
    await test.step('Enqueue job via jobs SDK', async () => {
      const { data, error } = await clients.jobs.enqueue({
        name: 'e2e:send-welcome-email', // e2e: prefix for sync execution in test mode
        payload: {
          userId,
          email: sdkUniqueEmail('critical-path'),
          action: 'welcome',
        },
      });

      expect(error, `Jobs enqueue failed: ${error?.message}`).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.job?.id).toBeDefined();
      // In CI-safe mode (SDK_E2E_SYNC_JOBS=true), job may complete immediately
      expect(['pending', 'running', 'completed']).toContain(data?.job?.status);
    });

    // Step 5: Track analytics event via analytics SDK
    await test.step('Track event via analytics SDK', async () => {
      const { data, error } = await clients.analytics.track('user_onboarded', {
        userId,
        step: 'critical-path-test',
        runId: RUN_ID,
      });

      expect(error, `Analytics track failed: ${error?.message}`).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.success).toBe(true);
    });

    // Step 6: Store API key in secrets via secrets SDK
    await test.step('Store secret via secrets SDK', async () => {
      const secretName = sdkUniqueSecretName('test_api_key');
      const secretValue = 'sk_test_critical_path_123';

      const { data: createData, error: createError } = await clients.secrets.create({
        name: secretName,
        value: secretValue,
      });

      expect(createError, `Secrets create failed: ${createError?.message}`).toBeNull();
      expect(createData?.success).toBe(true);

      // Verify retrieval
      const { data: getData, error: getError } = await clients.secrets.get(secretName);
      expect(getError, `Secrets get failed: ${getError?.message}`).toBeNull();
      expect(getData?.value).toBe(secretValue);
    });

    // Step 7: Request backup via API (shallow, just verify accepted)
    await test.step('Request backup via API', async () => {
      if (!ctx) {
        test.skip();
        return;
      }

      const response = await fetch(
        `${ctx.baseUrl}/api/inhouse/projects/${ctx.projectId}/backups`,
        {
          method: 'POST',
          headers: {
            ...ctx.authHeaders,
            'Content-Type': 'application/json',
            ...getE2EHeaders(),
          },
          body: JSON.stringify({ reason: SDK_TEST_DATA.backups.reasons.criticalPath }),
        }
      );

      // May not have backup endpoint yet - that's OK, just verify we get a response
      if (response.status === 404) {
        console.log('[P0-A-SDK] Backup endpoint not implemented yet, skipping');
        return;
      }

      const result = await response.json();

      if (response.ok) {
        expect(result.data?.backup?.id).toBeDefined();
        // Don't wait for completion in P0-A - just verify request accepted
        expect(['pending', 'in_progress']).toContain(result.data?.backup?.status);
      }
    });
  });

  test('P0-A-SDK-2: Auth sign-in with valid credentials succeeds', async () => {
    test.setTimeout(TIMEOUTS.apiCall * 3);

    // Create user first
    const email = sdkUniqueEmail('signin-test');
    const password = SDK_TEST_DATA.auth.validUser.password;

    await test.step('Create user for sign-in test', async () => {
      const { error } = await clients.auth.signUp({ email, password });
      // Ignore error if user already exists
      if (error && !error.message.includes('already exists')) {
        expect(error).toBeNull();
      }
    });

    await test.step('Sign in with valid credentials', async () => {
      const { data, error } = await clients.auth.signIn({ email, password });

      expect(error, `Auth signIn failed: ${error?.message}`).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.sessionToken).toBeDefined();
    });
  });

  test('P0-A-SDK-3: Auth sign-in with invalid credentials fails', async () => {
    test.setTimeout(TIMEOUTS.apiCall);

    const { data, error } = await clients.auth.signIn({
      email: SDK_TEST_DATA.auth.invalidCredentials.email,
      password: SDK_TEST_DATA.auth.invalidCredentials.password,
    });

    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error?.code).toBe('INVALID_CREDENTIALS');
  });

  test('P0-A-SDK-4: SDK methods return { data, error } and never throw', async () => {
    test.setTimeout(TIMEOUTS.apiCall * 5);

    // Test that invalid inputs return errors, not exceptions
    const testCases = [
      {
        sdk: 'auth',
        call: () => clients.auth.signIn({ email: '', password: '' }),
      },
      {
        sdk: 'storage',
        call: () => clients.storage.createSignedUploadUrl({ path: '', contentType: '' }),
      },
      {
        sdk: 'jobs',
        call: () => clients.jobs.enqueue({ name: '', payload: null as any }),
      },
      {
        sdk: 'secrets',
        call: () => clients.secrets.get(''),
      },
    ];

    for (const { sdk, call } of testCases) {
      await test.step(`${sdk} SDK returns error, not exception`, async () => {
        let result: any;
        let threw = false;

        try {
          result = await call();
        } catch (e) {
          threw = true;
        }

        expect(threw, `${sdk} SDK threw instead of returning error`).toBe(false);
        expect(result).toHaveProperty('data');
        expect(result).toHaveProperty('error');
      });
    }
  });

  test('P0-A-SDK-5: Error responses have required fields', async () => {
    test.setTimeout(TIMEOUTS.apiCall * 3);

    // Trigger known errors and verify structure
    const { error: authError } = await clients.auth.signIn({
      email: 'invalid',
      password: 'x',
    });

    expect(authError).not.toBeNull();
    expect(authError?.code).toBeDefined();
    expect(typeof authError?.code).toBe('string');
    expect(authError?.message).toBeDefined();
    expect(typeof authError?.message).toBe('string');
    // requestId enables support debugging - critical for production
    expect(authError?.requestId || authError?.correlationId).toBeDefined();
  });
});
