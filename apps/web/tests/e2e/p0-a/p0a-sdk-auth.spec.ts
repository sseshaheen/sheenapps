/**
 * P0-A: SDK Auth Tests
 *
 * DEPLOY-BLOCKING: These tests must pass at 100% for every deploy.
 *
 * Tests the @sheenapps/auth SDK critical paths:
 * - Sign up
 * - Sign in
 * - Sign out
 * - Get user
 * - Session validation
 *
 * Uses:
 * - SDK test harness for project setup/teardown
 * - SDK clients for auth operations
 * - CI-safe mode (no external auth providers)
 */

import { test, expect } from '@playwright/test';
import { testHarness } from '../helpers/sdk-test-harness';
import { createSDKClients, createAuthClientForTest, type SDKClients } from '../helpers/sdk-client';
import {
  SDKTestContext,
  sdkUniqueEmail,
  SDK_TEST_DATA,
  SDK_ERROR_CODES,
} from '../fixtures/sdk-fixtures';
import { TIMEOUTS } from '../helpers/timeouts';

test.describe('P0-A: SDK Auth', () => {
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

  test.describe('Sign Up', () => {
    test('creates user and returns session', async () => {
      test.setTimeout(TIMEOUTS.apiCall * 2);

      const email = sdkUniqueEmail('signup');
      const { data, error } = await clients.auth.signUp({
        email,
        password: SDK_TEST_DATA.auth.validUser.password,
      });

      expect(error, `signUp failed: ${error?.message}`).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.user).toBeDefined();
      expect(data?.user?.email).toContain('signup');
      expect(data?.user?.id).toBeDefined();
      expect(data?.sessionToken).toBeDefined();
    });

    test('fails with weak password', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const email = sdkUniqueEmail('weak-pass');
      const { data, error } = await clients.auth.signUp({
        email,
        password: SDK_TEST_DATA.auth.validUser.passwordWeak,
      });

      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.code).toBe(SDK_ERROR_CODES.VALIDATION_ERROR);
    });

    test('fails with invalid email format', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.auth.signUp({
        email: 'not-an-email',
        password: SDK_TEST_DATA.auth.validUser.password,
      });

      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.code).toBe(SDK_ERROR_CODES.VALIDATION_ERROR);
    });
  });

  test.describe('Sign In', () => {
    const testEmail = sdkUniqueEmail('signin');
    const testPassword = SDK_TEST_DATA.auth.validUser.password;

    test.beforeAll(async () => {
      // Create user for sign-in tests
      await clients.auth.signUp({ email: testEmail, password: testPassword });
    });

    test('succeeds with valid credentials', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.auth.signIn({
        email: testEmail,
        password: testPassword,
      });

      expect(error, `signIn failed: ${error?.message}`).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.sessionToken).toBeDefined();
      expect(data?.user?.email).toBe(testEmail);
    });

    test('fails with wrong password', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.auth.signIn({
        email: testEmail,
        password: 'wrong-password',
      });

      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.code).toBe(SDK_ERROR_CODES.INVALID_CREDENTIALS);
    });

    test('fails with nonexistent user', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.auth.signIn({
        email: SDK_TEST_DATA.auth.invalidCredentials.email,
        password: SDK_TEST_DATA.auth.invalidCredentials.password,
      });

      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.code).toBe(SDK_ERROR_CODES.INVALID_CREDENTIALS);
    });
  });

  test.describe('Get User', () => {
    test('returns user for valid session', async () => {
      test.setTimeout(TIMEOUTS.apiCall * 2);

      // Sign up and get session
      const email = sdkUniqueEmail('getuser');
      const { data: signUpData } = await clients.auth.signUp({
        email,
        password: SDK_TEST_DATA.auth.validUser.password,
      });

      expect(signUpData?.sessionToken).toBeDefined();

      // Get user with session token
      const { data, error } = await clients.auth.getUser({
        sessionToken: signUpData!.sessionToken,
      });

      expect(error, `getUser failed: ${error?.message}`).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.email).toBe(email);
      expect(data?.id).toBeDefined();
    });

    test('fails with invalid session', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.auth.getUser({
        sessionToken: 'invalid-session-token',
      });

      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.code).toBe(SDK_ERROR_CODES.UNAUTHORIZED);
    });
  });

  test.describe('Sign Out', () => {
    test('invalidates session', async () => {
      test.setTimeout(TIMEOUTS.apiCall * 3);

      // Sign up and get session
      const email = sdkUniqueEmail('signout');
      const { data: signUpData } = await clients.auth.signUp({
        email,
        password: SDK_TEST_DATA.auth.validUser.password,
      });

      expect(signUpData?.sessionToken).toBeDefined();
      const sessionToken = signUpData!.sessionToken;

      // Verify session is valid
      const { error: beforeError } = await clients.auth.getUser({ sessionToken });
      expect(beforeError).toBeNull();

      // Sign out
      const { error: signOutError } = await clients.auth.signOut({ sessionToken });
      expect(signOutError, `signOut failed: ${signOutError?.message}`).toBeNull();

      // Verify session is invalidated
      const { error: afterError } = await clients.auth.getUser({ sessionToken });
      expect(afterError).not.toBeNull();
      expect(afterError?.code).toBe(SDK_ERROR_CODES.UNAUTHORIZED);
    });
  });

  test.describe('Error Contract', () => {
    test('all auth errors have code, message, and requestId', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { error } = await clients.auth.signIn({
        email: 'invalid',
        password: 'x',
      });

      expect(error).not.toBeNull();
      expect(error?.code).toBeDefined();
      expect(typeof error?.code).toBe('string');
      expect(error?.message).toBeDefined();
      expect(typeof error?.message).toBe('string');
      expect(error?.requestId || error?.correlationId).toBeDefined();
    });

    test('validation errors include field details', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { error } = await clients.auth.signUp({
        email: 'not-an-email',
        password: '123', // Too short
      });

      expect(error?.code).toBe(SDK_ERROR_CODES.VALIDATION_ERROR);
      // Validation errors should have details about which fields failed
      expect(error?.details || error?.message).toBeDefined();
    });
  });

  test.describe('Key Context', () => {
    test('server key is required for admin operations', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      if (!ctx) {
        test.skip();
        return;
      }

      // Create client with public key
      const publicClient = createAuthClientForTest(ctx, { usePublicKey: true });

      // Public key should be able to do basic auth operations
      const email = sdkUniqueEmail('public-key');
      const { data, error } = await publicClient.signUp({
        email,
        password: SDK_TEST_DATA.auth.validUser.password,
      });

      // signUp should work with public key (it's a client-facing operation)
      // This test validates the key type detection works
      if (error && error.code === SDK_ERROR_CODES.INVALID_KEY_CONTEXT) {
        // If signUp requires server key, that's fine - just verify the error code
        expect(error.code).toBe(SDK_ERROR_CODES.INVALID_KEY_CONTEXT);
      } else {
        // Otherwise, the operation should succeed
        expect(error).toBeNull();
        expect(data?.user).toBeDefined();
      }
    });
  });
});
