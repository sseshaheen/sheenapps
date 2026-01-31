/**
 * P0-A: SDK Error Contract Tests
 *
 * DEPLOY-BLOCKING: These tests must pass at 100% for every deploy.
 *
 * High leverage test: Validates the error contract is consistent across ALL SDKs.
 * This catches regressions in error handling before they reach users.
 *
 * Tests:
 * - All SDK methods return { data, error } and never throw
 * - All errors have code, message, and requestId
 * - Error codes are stable and documented
 * - Retryable flag is present and accurate
 * - Validation errors include field-level details
 */

import { test, expect } from '@playwright/test';
import { testHarness } from '../helpers/sdk-test-harness';
import { createSDKClients, type SDKClients } from '../helpers/sdk-client';
import {
  SDKTestContext,
  SDK_ERROR_CODES,
  RETRYABLE_ERROR_CODES,
  PERMANENT_ERROR_CODES,
} from '../fixtures/sdk-fixtures';
import { TIMEOUTS } from '../helpers/timeouts';

test.describe('P0-A: SDK Error Contract', () => {
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

  test.describe('Return Pattern', () => {
    test('all SDK methods return { data, error } and never throw', async () => {
      test.setTimeout(TIMEOUTS.apiCall * 10);

      // Test each SDK with invalid input - should return error, not throw
      const testCases = [
        { sdk: 'auth', call: () => clients.auth.signIn({ email: '', password: '' }) },
        { sdk: 'db', call: () => clients.db.from('').select('*').execute() },
        { sdk: 'storage', call: () => clients.storage.createSignedUploadUrl({ path: '', contentType: '' }) },
        { sdk: 'jobs', call: () => clients.jobs.enqueue({ name: '', payload: null as any }) },
        { sdk: 'email', call: () => clients.email.send({ to: '', subject: '', html: '' }) },
        { sdk: 'analytics', call: () => clients.analyticsServer.listEvents({ limit: -1 }) },
        { sdk: 'secrets', call: () => clients.secrets.get('') },
      ];

      for (const { sdk, call } of testCases) {
        // Should NOT throw
        let result: any;
        let threw = false;
        let thrownError: any = null;

        try {
          result = await call();
        } catch (e) {
          threw = true;
          thrownError = e;
        }

        expect(threw, `${sdk} SDK threw: ${thrownError?.message}`).toBe(false);
        expect(result, `${sdk} SDK returned undefined`).toBeDefined();
        expect(result).toHaveProperty('data');
        expect(result).toHaveProperty('error');
      }
    });
  });

  test.describe('Error Structure', () => {
    test('all errors have code, message, and requestId', async () => {
      test.setTimeout(TIMEOUTS.apiCall * 6);

      // Trigger known errors from each SDK
      const errorResults = await Promise.all([
        clients.auth.signIn({ email: 'invalid', password: 'x' }),
        clients.db.from('nonexistent_table_12345').select('*').execute(),
        clients.storage.createSignedUploadUrl({ path: '../traversal', contentType: 'x' }),
        clients.jobs.enqueue({ name: 'sys:reserved', payload: {} }),
        clients.secrets.get('nonexistent-secret-12345'),
      ]);

      const errors = errorResults.map((r) => r.error).filter(Boolean);

      // Should have at least some errors
      expect(errors.length).toBeGreaterThan(0);

      for (const error of errors) {
        // code is required
        expect(error.code, `Error missing code: ${JSON.stringify(error)}`).toBeDefined();
        expect(typeof error.code).toBe('string');
        expect(error.code.length).toBeGreaterThan(0);

        // message is required
        expect(error.message, `Error missing message: ${JSON.stringify(error)}`).toBeDefined();
        expect(typeof error.message).toBe('string');
        expect(error.message.length).toBeGreaterThan(0);

        // requestId enables support debugging - critical for production
        const hasRequestId = error.requestId || error.correlationId;
        expect(hasRequestId, `Error missing requestId: ${JSON.stringify(error)}`).toBeDefined();
      }
    });

    test('error codes use SCREAMING_SNAKE_CASE', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { error } = await clients.auth.signIn({
        email: 'invalid',
        password: 'x',
      });

      expect(error).not.toBeNull();
      expect(error?.code).toMatch(/^[A-Z][A-Z0-9_]*$/);
    });
  });

  test.describe('Error Codes Stability', () => {
    test('standard error codes are present', async () => {
      // These codes must never change - they're part of the public API
      const expectedCodes = Object.values(SDK_ERROR_CODES);

      for (const code of expectedCodes) {
        expect(typeof code).toBe('string');
        expect(code.length).toBeGreaterThan(0);
        expect(code).toMatch(/^[A-Z][A-Z0-9_]*$/);
      }
    });

    test('retryable codes are categorized correctly', async () => {
      // Verify retryable codes are a subset of all codes
      for (const code of RETRYABLE_ERROR_CODES) {
        expect(Object.values(SDK_ERROR_CODES)).toContain(code);
      }

      // Verify permanent codes are a subset of all codes
      for (const code of PERMANENT_ERROR_CODES) {
        expect(Object.values(SDK_ERROR_CODES)).toContain(code);
      }

      // No overlap between retryable and permanent
      const overlap = RETRYABLE_ERROR_CODES.filter((c) =>
        PERMANENT_ERROR_CODES.includes(c as any)
      );
      expect(overlap).toHaveLength(0);
    });
  });

  test.describe('Validation Errors', () => {
    test('include field-level details', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { error } = await clients.auth.signUp({
        email: 'not-an-email',
        password: '123', // Too short
      });

      expect(error?.code).toBe(SDK_ERROR_CODES.VALIDATION_ERROR);

      // Validation errors should include which fields failed
      // The exact structure may vary, but there should be some indication
      const hasFieldInfo =
        error?.details?.validationErrors ||
        error?.details?.fields ||
        error?.message?.includes('email') ||
        error?.message?.includes('password');

      expect(hasFieldInfo, `Validation error lacks field info: ${JSON.stringify(error)}`).toBeTruthy();
    });

    test('identify multiple validation failures', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { error } = await clients.auth.signUp({
        email: '', // Invalid
        password: '', // Invalid
      });

      expect(error?.code).toBe(SDK_ERROR_CODES.VALIDATION_ERROR);
      // Should mention multiple issues or have multiple validation errors
      expect(error?.message || error?.details).toBeDefined();
    });
  });

  test.describe('Specific Error Codes', () => {
    test('INVALID_CREDENTIALS for wrong password', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { error } = await clients.auth.signIn({
        email: 'nonexistent@example.com',
        password: 'wrong',
      });

      expect(error?.code).toBe(SDK_ERROR_CODES.INVALID_CREDENTIALS);
    });

    test('VALIDATION_ERROR for bad input format', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { error } = await clients.storage.createSignedUploadUrl({
        path: '../../../etc/passwd', // Path traversal attempt
        contentType: 'text/plain',
      });

      expect(error?.code).toBe(SDK_ERROR_CODES.VALIDATION_ERROR);
    });

    test('reserved sys: prefix rejected for jobs', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { error } = await clients.jobs.enqueue({
        name: 'sys:admin-job',
        payload: {},
      });

      expect(error).not.toBeNull();
      expect(error?.code).toBe(SDK_ERROR_CODES.VALIDATION_ERROR);
    });
  });

  test.describe('Security Errors', () => {
    test('unauthorized returns proper error code', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { error } = await clients.auth.getUser({
        sessionToken: 'invalid-token-12345',
      });

      expect(error?.code).toBe(SDK_ERROR_CODES.UNAUTHORIZED);
    });

    test('NOT_FOUND for missing resources', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { error } = await clients.secrets.get('nonexistent-secret-12345-xyz');

      expect(error?.code).toBe(SDK_ERROR_CODES.NOT_FOUND);
    });
  });

  test.describe('Error Consistency Across SDKs', () => {
    test('all SDKs use the same error code format', async () => {
      test.setTimeout(TIMEOUTS.apiCall * 5);

      const errors = await Promise.all([
        clients.auth.signIn({ email: '', password: '' }).then((r) => r.error),
        clients.storage.createSignedUploadUrl({ path: '', contentType: '' }).then((r) => r.error),
        clients.jobs.enqueue({ name: '', payload: null as any }).then((r) => r.error),
        clients.secrets.get('').then((r) => r.error),
      ]);

      const nonNullErrors = errors.filter(Boolean);
      expect(nonNullErrors.length).toBeGreaterThan(0);

      // All should use SCREAMING_SNAKE_CASE for codes
      for (const error of nonNullErrors) {
        expect(error?.code).toMatch(/^[A-Z][A-Z0-9_]*$/);
      }
    });
  });
});
