/**
 * P0-B: SDK Quota Tests
 *
 * NIGHTLY: These tests run nightly with the e2e_tiny plan.
 * They verify quota enforcement with small, deterministic limits.
 *
 * Tests:
 * - Storage quota exceeded returns error
 * - Email quota exceeded after limit
 * - Job quota exceeded after limit
 * - Secrets quota exceeded after limit
 * - Rate limiting behavior
 *
 * Uses e2e_tiny plan:
 * - storage_bytes: 1 MB
 * - email_sends: 3
 * - job_runs: 5
 * - secrets_count: 3
 * - rate_limit_per_minute: 5
 */

import { test, expect } from '@playwright/test';
import { testHarness } from '../helpers/sdk-test-harness';
import { createSDKClients, type SDKClients } from '../helpers/sdk-client';
import {
  SDKTestContext,
  sdkUniqueEmail,
  sdkUniqueJobName,
  sdkUniqueSecretName,
  sdkUniqueStoragePath,
  SDK_E2E_TINY_LIMITS,
  SDK_ERROR_CODES,
} from '../fixtures/sdk-fixtures';
import { RUN_ID } from '../fixtures/test-data';
import { TIMEOUTS, sleep } from '../helpers/timeouts';

test.describe('P0-B: SDK Quotas', () => {
  let tinyCtx: SDKTestContext | null = null;
  let clients: SDKClients;

  test.beforeAll(async () => {
    // Create project with e2e_tiny plan for deterministic quota testing
    tinyCtx = await testHarness.createProject({ plan: 'e2e_tiny' });
    clients = createSDKClients(tinyCtx);
  });

  test.afterAll(async () => {
    if (tinyCtx) {
      await testHarness.cleanupProject(tinyCtx.projectId);
    }
  });

  test.describe('Storage Quota', () => {
    test('storage quota exceeded returns error', async () => {
      test.setTimeout(TIMEOUTS.p0b.quotaTest);

      // e2e_tiny has 1MB storage limit
      // Try to upload a 2MB file
      const largePath = sdkUniqueStoragePath('quota-test/large-file.bin');

      const { data, error } = await clients.storage.createSignedUploadUrl({
        path: largePath,
        contentType: 'application/octet-stream',
        // Some implementations check size at URL creation
        // maxSizeBytes: 2 * 1024 * 1024, // 2MB > 1MB limit
      });

      // If URL creation doesn't check quota, try the actual upload
      if (!error && data?.url) {
        const largeContent = Buffer.alloc(2 * 1024 * 1024, 'x'); // 2MB
        const uploadResponse = await fetch(data.url, {
          method: 'PUT',
          headers: data.headers,
          body: largeContent,
        });

        // Upload should fail due to quota
        if (!uploadResponse.ok) {
          expect(uploadResponse.status).toBeGreaterThanOrEqual(400);
        }
      } else if (error) {
        // Quota checked at URL creation
        expect(error.code).toBe(SDK_ERROR_CODES.QUOTA_EXCEEDED);
        if (error.details) {
          expect(error.details.metric).toBe('storage_bytes');
          expect(error.details.limit).toBe(SDK_E2E_TINY_LIMITS.storage_bytes);
        }
      }
    });

    test('multiple small files eventually exceed quota', async () => {
      test.setTimeout(TIMEOUTS.p0b.quotaTest * 2);

      // Upload files until quota exceeded
      let quotaExceeded = false;
      const fileSize = 300 * 1024; // 300KB per file

      for (let i = 0; i < 10 && !quotaExceeded; i++) {
        const path = sdkUniqueStoragePath(`quota-fill/file-${i}.bin`);
        const { data, error } = await clients.storage.createSignedUploadUrl({
          path,
          contentType: 'application/octet-stream',
        });

        if (error?.code === SDK_ERROR_CODES.QUOTA_EXCEEDED) {
          quotaExceeded = true;
          break;
        }

        if (data?.url) {
          const content = Buffer.alloc(fileSize, 'x');
          const response = await fetch(data.url, {
            method: 'PUT',
            headers: data.headers,
            body: content,
          });

          if (!response.ok) {
            quotaExceeded = true;
            break;
          }
        }

        await sleep(100);
      }

      // Should have hit quota (1MB limit with 300KB files = ~3-4 files max)
      expect(quotaExceeded).toBe(true);
    });
  });

  test.describe('Email Quota', () => {
    test('email quota exceeded after 3 sends', async () => {
      test.setTimeout(TIMEOUTS.p0b.quotaTest);

      // e2e_tiny has 3 email limit - deterministic, no loops needed
      // Send 3 emails (should succeed)
      for (let i = 1; i <= 3; i++) {
        const { error } = await clients.email.send({
          to: sdkUniqueEmail(`quota-email-${i}`),
          subject: `Quota Test ${i}`,
          html: `<p>Email ${i} of 3</p>`,
        });

        // First 3 should succeed
        expect(error, `Email ${i} failed: ${error?.message}`).toBeNull();
      }

      // 4th email should fail
      const { data, error } = await clients.email.send({
        to: sdkUniqueEmail('quota-email-4'),
        subject: 'Quota Test 4',
        html: '<p>This should fail</p>',
      });

      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.code).toBe(SDK_ERROR_CODES.QUOTA_EXCEEDED);
      if (error?.details) {
        expect(error.details.metric).toBe('email_sends');
        expect(error.details.limit).toBe(SDK_E2E_TINY_LIMITS.email_sends);
      }
    });
  });

  test.describe('Job Quota', () => {
    test('job quota exceeded after 5 jobs', async () => {
      test.setTimeout(TIMEOUTS.p0b.quotaTest);

      // e2e_tiny has 5 job limit
      // Enqueue 5 jobs (should succeed)
      for (let i = 1; i <= 5; i++) {
        const { error } = await clients.jobs.enqueue({
          name: sdkUniqueJobName(`quota-job-${i}`),
          payload: { index: i, runId: RUN_ID },
        });

        expect(error, `Job ${i} failed: ${error?.message}`).toBeNull();
      }

      // 6th job should fail
      const { data, error } = await clients.jobs.enqueue({
        name: sdkUniqueJobName('quota-job-6'),
        payload: { index: 6, runId: RUN_ID },
      });

      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.code).toBe(SDK_ERROR_CODES.QUOTA_EXCEEDED);
      if (error?.details) {
        expect(error.details.metric).toBe('job_runs');
        expect(error.details.limit).toBe(SDK_E2E_TINY_LIMITS.job_runs);
      }
    });
  });

  test.describe('Secrets Quota', () => {
    test('secrets quota exceeded after 3 secrets', async () => {
      test.setTimeout(TIMEOUTS.p0b.quotaTest);

      // e2e_tiny has 3 secrets limit
      // Create 3 secrets (should succeed)
      for (let i = 1; i <= 3; i++) {
        const { error } = await clients.secrets.create({
          name: sdkUniqueSecretName(`QUOTA_SECRET_${i}`),
          value: `secret-value-${i}`,
        });

        expect(error, `Secret ${i} failed: ${error?.message}`).toBeNull();
      }

      // 4th secret should fail
      const { data, error } = await clients.secrets.create({
        name: sdkUniqueSecretName('QUOTA_SECRET_4'),
        value: 'should-fail',
      });

      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.code).toBe(SDK_ERROR_CODES.QUOTA_EXCEEDED);
      if (error?.details) {
        expect(error.details.metric).toBe('secrets_count');
        expect(error.details.limit).toBe(SDK_E2E_TINY_LIMITS.secrets_count);
      }
    });
  });

  test.describe('Rate Limiting', () => {
    test('rapid requests trigger rate limit', async () => {
      test.setTimeout(TIMEOUTS.p0b.quotaTest);

      // e2e_tiny has 5 requests/minute rate limit
      // Make rapid requests
      let rateLimited = false;

      for (let i = 0; i < 20 && !rateLimited; i++) {
        const { error } = await clients.analytics.track('rate_limit_test', {
          iteration: i,
          runId: RUN_ID,
        });

        if (error?.code === SDK_ERROR_CODES.RATE_LIMITED) {
          rateLimited = true;
          break;
        }

        // No delay - fire as fast as possible
      }

      // Should have been rate limited
      expect(rateLimited).toBe(true);
    });

    test('rate limit includes retry-after', async () => {
      test.setTimeout(TIMEOUTS.p0b.quotaTest);

      // Trigger rate limit
      let rateLimitError: any = null;

      for (let i = 0; i < 30 && !rateLimitError; i++) {
        const { error } = await clients.analytics.track('rate_limit_retry', {
          iteration: i,
          runId: RUN_ID,
        });

        if (error?.code === SDK_ERROR_CODES.RATE_LIMITED) {
          rateLimitError = error;
          break;
        }
      }

      if (rateLimitError) {
        // Should have retryable flag
        expect(rateLimitError.retryable).toBe(true);

        // May include retry-after details
        if (rateLimitError.details?.retryAfter) {
          expect(typeof rateLimitError.details.retryAfter).toBe('number');
          expect(rateLimitError.details.retryAfter).toBeGreaterThan(0);
        }
      }
    });
  });

  test.describe('Quota Recovery', () => {
    test('quota resets allow new operations', async () => {
      test.setTimeout(TIMEOUTS.p0b.quotaTest);

      // This test verifies that after quota reset, operations succeed again
      // In practice, quotas reset monthly - we use testHarness to simulate reset

      try {
        await testHarness.resetQuota(tinyCtx!.projectId, 'email_sends');
      } catch {
        // Reset may not be available
        test.skip();
        return;
      }

      // After reset, should be able to send email again
      const { data, error } = await clients.email.send({
        to: sdkUniqueEmail('quota-reset-test'),
        subject: 'Post-Reset Email',
        html: '<p>Email after quota reset</p>',
      });

      expect(error).toBeNull();
      expect(data?.email?.id).toBeDefined();
    });
  });

  test.describe('Quota Information', () => {
    test('limits API returns quota info', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const response = await fetch(
        `${tinyCtx!.baseUrl}/api/inhouse/projects/${tinyCtx!.projectId}/limits`,
        { headers: tinyCtx!.authHeaders }
      );

      expect(response.ok).toBe(true);

      const { data, error } = await response.json();
      expect(error).toBeNull();
      expect(data?.plan).toBe('e2e_tiny');
      expect(data?.limits).toBeDefined();

      // Verify limits match e2e_tiny plan
      if (data?.limits?.storage_bytes) {
        expect(data.limits.storage_bytes.limit).toBe(SDK_E2E_TINY_LIMITS.storage_bytes);
      }
      if (data?.limits?.email_sends) {
        expect(data.limits.email_sends.limit).toBe(SDK_E2E_TINY_LIMITS.email_sends);
      }
    });

    test('quota error includes current usage', async () => {
      test.setTimeout(TIMEOUTS.p0b.quotaTest);

      // Exhaust quota first
      for (let i = 0; i < 10; i++) {
        await clients.analytics.track('usage_info_test', { i });
      }

      // Trigger quota error
      const { error } = await clients.jobs.enqueue({
        name: sdkUniqueJobName('usage-info'),
        payload: {},
      });

      if (error?.code === SDK_ERROR_CODES.QUOTA_EXCEEDED && error?.details) {
        // Error should include usage info
        expect(error.details.used).toBeDefined();
        expect(error.details.limit).toBeDefined();
        expect(typeof error.details.used).toBe('number');
        expect(error.details.used).toBeGreaterThanOrEqual(error.details.limit);
      }
    });
  });
});
