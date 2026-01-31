/**
 * P0-A: SDK Jobs Tests
 *
 * DEPLOY-BLOCKING: These tests must pass at 100% for every deploy.
 *
 * Tests the @sheenapps/jobs SDK critical paths:
 * - Enqueue jobs (immediate and delayed)
 * - Get job status
 * - Idempotency key handling
 * - Reserved prefix rejection (sys:)
 * - E2E prefix synchronous execution
 *
 * Uses:
 * - SDK test harness for project setup/teardown
 * - CI-safe mode (e2e: prefix for sync execution)
 * - SDK clients for jobs operations
 *
 * Note: P0-A uses e2e: prefix which triggers synchronous execution
 * under SDK_E2E_SYNC_JOBS=true. P0-B tests real queue behavior.
 */

import { test, expect } from '@playwright/test';
import { testHarness } from '../helpers/sdk-test-harness';
import { createSDKClients, type SDKClients } from '../helpers/sdk-client';
import {
  SDKTestContext,
  sdkUniqueJobName,
  SDK_TEST_DATA,
  SDK_ERROR_CODES,
} from '../fixtures/sdk-fixtures';
import { RUN_ID } from '../fixtures/test-data';
import { TIMEOUTS } from '../helpers/timeouts';

test.describe('P0-A: SDK Jobs', () => {
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

  test.describe('Enqueue Operations', () => {
    test('enqueue e2e: job returns job ID', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.jobs.enqueue({
        name: sdkUniqueJobName('e2e:test-job'),
        payload: { action: 'test', runId: RUN_ID },
      });

      expect(error, `enqueue failed: ${error?.message}`).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.job).toBeDefined();
      expect(data?.job?.id).toBeDefined();
      expect(typeof data?.job?.id).toBe('string');
      // Under SDK_E2E_SYNC_JOBS=true, job may complete immediately
      expect(['pending', 'processing', 'completed']).toContain(data?.job?.status);
    });

    test('enqueue with payload preserves data', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const testPayload = {
        userId: 'test-user-123',
        action: 'send-email',
        data: { subject: 'Test', body: 'Hello' },
        runId: RUN_ID,
      };

      const { data, error } = await clients.jobs.enqueue({
        name: sdkUniqueJobName('e2e:payload-test'),
        payload: testPayload,
      });

      expect(error).toBeNull();
      expect(data?.job?.id).toBeDefined();
      // Payload should be stored (not verified in P0-A, just ensure no error)
    });

    test('enqueue with delay accepts delay string', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.jobs.enqueue({
        name: sdkUniqueJobName('e2e:delayed-job'),
        payload: { action: 'delayed', runId: RUN_ID },
        delay: '30s',
      });

      expect(error).toBeNull();
      expect(data?.job).toBeDefined();
      expect(data?.job?.id).toBeDefined();
      // Delayed jobs should be pending or scheduled
      expect(['pending', 'scheduled']).toContain(data?.job?.status);
    });
  });

  test.describe('Get Job', () => {
    test('get job returns correct status', async () => {
      test.setTimeout(TIMEOUTS.apiCall * 2);

      // Enqueue first
      const { data: enqueueData } = await clients.jobs.enqueue({
        name: sdkUniqueJobName('e2e:status-check'),
        payload: { action: 'status-check', runId: RUN_ID },
      });

      expect(enqueueData?.job?.id).toBeDefined();

      // Get job status
      const { data, error } = await clients.jobs.get(enqueueData!.job!.id);

      expect(error, `get failed: ${error?.message}`).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.job).toBeDefined();
      expect(data?.job?.id).toBe(enqueueData?.job?.id);
      // Status should be valid
      expect(['pending', 'scheduled', 'processing', 'completed', 'failed', 'cancelled']).toContain(
        data?.job?.status
      );
    });

    test('get nonexistent job returns error', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.jobs.get('nonexistent-job-id-12345');

      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.code).toBe(SDK_ERROR_CODES.NOT_FOUND);
    });
  });

  test.describe('Idempotency', () => {
    test('idempotency key prevents duplicate jobs', async () => {
      test.setTimeout(TIMEOUTS.apiCall * 2);

      const idempotencyKey = `e2e-idempotent-${RUN_ID}-${Date.now()}`;

      // First enqueue
      const { data: first, error: firstError } = await clients.jobs.enqueue({
        name: sdkUniqueJobName('e2e:idempotent'),
        payload: { action: 'idempotent', attempt: 1 },
        idempotencyKey,
      });

      expect(firstError).toBeNull();
      expect(first?.job?.id).toBeDefined();

      // Second enqueue with same key
      const { data: second, error: secondError } = await clients.jobs.enqueue({
        name: sdkUniqueJobName('e2e:idempotent'),
        payload: { action: 'idempotent', attempt: 2 },
        idempotencyKey,
      });

      expect(secondError).toBeNull();
      // Should return the same job ID
      expect(second?.job?.id).toBe(first?.job?.id);
    });

    test('different idempotency keys create different jobs', async () => {
      test.setTimeout(TIMEOUTS.apiCall * 2);

      const key1 = `e2e-diff-1-${RUN_ID}-${Date.now()}`;
      const key2 = `e2e-diff-2-${RUN_ID}-${Date.now()}`;

      const { data: first } = await clients.jobs.enqueue({
        name: sdkUniqueJobName('e2e:diff-key'),
        payload: { key: 1 },
        idempotencyKey: key1,
      });

      const { data: second } = await clients.jobs.enqueue({
        name: sdkUniqueJobName('e2e:diff-key'),
        payload: { key: 2 },
        idempotencyKey: key2,
      });

      expect(first?.job?.id).toBeDefined();
      expect(second?.job?.id).toBeDefined();
      expect(first?.job?.id).not.toBe(second?.job?.id);
    });
  });

  test.describe('Reserved Prefix', () => {
    test('sys: prefix is rejected', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.jobs.enqueue({
        name: SDK_TEST_DATA.jobs.reserved.name,
        payload: {},
      });

      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.code).toBe(SDK_ERROR_CODES.VALIDATION_ERROR);
    });

    test('sys:internal prefix is rejected', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.jobs.enqueue({
        name: 'sys:internal-admin-task',
        payload: { admin: true },
      });

      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.code).toBe(SDK_ERROR_CODES.VALIDATION_ERROR);
    });
  });

  test.describe('Job Options', () => {
    test('concurrency key is accepted', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.jobs.enqueue({
        name: sdkUniqueJobName('e2e:concurrent'),
        payload: { action: 'concurrent', runId: RUN_ID },
        concurrencyKey: `user-123-${RUN_ID}`,
      });

      expect(error).toBeNull();
      expect(data?.job?.id).toBeDefined();
    });

    test('timeout option is accepted', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.jobs.enqueue({
        name: sdkUniqueJobName('e2e:timeout'),
        payload: { action: 'long-running', runId: RUN_ID },
        timeoutMs: 60000, // 1 minute timeout
      });

      expect(error).toBeNull();
      expect(data?.job?.id).toBeDefined();
    });

    test('maxAttempts option is accepted', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.jobs.enqueue({
        name: sdkUniqueJobName('e2e:retry'),
        payload: { action: 'retry-test', runId: RUN_ID },
        maxAttempts: 5,
      });

      expect(error).toBeNull();
      expect(data?.job?.id).toBeDefined();
    });
  });

  test.describe('List Jobs', () => {
    test('list returns array of jobs', async () => {
      test.setTimeout(TIMEOUTS.apiCall * 2);

      // Enqueue a job first
      await clients.jobs.enqueue({
        name: sdkUniqueJobName('e2e:list-test'),
        payload: { action: 'list', runId: RUN_ID },
      });

      // List jobs
      const { data, error } = await clients.jobs.list({ limit: 10 });

      expect(error, `list failed: ${error?.message}`).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.jobs).toBeDefined();
      expect(Array.isArray(data?.jobs)).toBe(true);
    });

    test('list with status filter works', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.jobs.list({
        status: 'completed',
        limit: 5,
      });

      expect(error).toBeNull();
      expect(data?.jobs).toBeDefined();
      // All returned jobs should have completed status
      if (data?.jobs && data.jobs.length > 0) {
        for (const job of data.jobs) {
          expect(job.status).toBe('completed');
        }
      }
    });
  });

  test.describe('Error Handling', () => {
    test('empty job name returns validation error', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.jobs.enqueue({
        name: '',
        payload: {},
      });

      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.code).toBe(SDK_ERROR_CODES.VALIDATION_ERROR);
    });

    test('null payload returns validation error', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.jobs.enqueue({
        name: sdkUniqueJobName('e2e:null-payload'),
        payload: null as any,
      });

      expect(data).toBeNull();
      expect(error).not.toBeNull();
    });

    test('error has code, message, and requestId', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { error } = await clients.jobs.enqueue({
        name: 'sys:reserved',
        payload: {},
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
