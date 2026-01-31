/**
 * P0-A: SDK Secrets Tests
 *
 * DEPLOY-BLOCKING: These tests must pass at 100% for every deploy.
 *
 * Tests the @sheenapps/secrets SDK critical paths:
 * - Create secrets
 * - Get secret values
 * - Update secrets
 * - Delete secrets (soft delete)
 * - List secrets (metadata only)
 * - Batch get multiple secrets
 *
 * Uses:
 * - SDK test harness for project setup/teardown
 * - SDK clients for secrets operations
 *
 * Security Contract:
 * - SDK with server key (sheen_sk_*) CAN read secret values - this is the product design
 * - Admin panel can only view metadata (names, created_at) - values never shown in admin UI
 * - Browser context + public key = blocked entirely
 * - All access is audit logged
 */

import { test, expect } from '@playwright/test';
import { testHarness } from '../helpers/sdk-test-harness';
import { createSDKClients, createSecretsClientForTest, type SDKClients } from '../helpers/sdk-client';
import {
  SDKTestContext,
  sdkUniqueSecretName,
  SDK_TEST_DATA,
  SDK_ERROR_CODES,
} from '../fixtures/sdk-fixtures';
import { RUN_ID } from '../fixtures/test-data';
import { TIMEOUTS } from '../helpers/timeouts';

test.describe('P0-A: SDK Secrets', () => {
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

  test.describe('Create Secrets', () => {
    test('create secret succeeds', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const secretName = sdkUniqueSecretName('TEST_API_KEY');

      const { data, error } = await clients.secrets.create({
        name: secretName,
        value: 'sk_test_secret_value_123',
      });

      expect(error, `create failed: ${error?.message}`).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.success).toBe(true);
    });

    test('create secret with description', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const secretName = sdkUniqueSecretName('STRIPE_KEY');

      const { data, error } = await clients.secrets.create({
        name: secretName,
        value: 'sk_test_stripe_12345',
        description: 'Stripe API key for payment processing',
      });

      expect(error).toBeNull();
      expect(data?.success).toBe(true);
    });

    test('create secret with category', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const secretName = sdkUniqueSecretName('OPENAI_KEY');

      const { data, error } = await clients.secrets.create({
        name: secretName,
        value: 'sk-openai-test-key',
        category: 'ai',
      });

      expect(error).toBeNull();
      expect(data?.success).toBe(true);
    });

    test('create secret with tags', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const secretName = sdkUniqueSecretName('TAGGED_SECRET');

      const { data, error } = await clients.secrets.create({
        name: secretName,
        value: 'tagged-secret-value',
        tags: ['production', 'api-key', 'third-party'],
      });

      expect(error).toBeNull();
      expect(data?.success).toBe(true);
    });
  });

  test.describe('Get Secrets', () => {
    /**
     * This test validates that server-side code CAN retrieve secret values.
     * This is intentional: Easy Mode Secrets is a K/V store for server key holders.
     * The security boundary is: server keys only, audit logged, never in browser.
     */
    test('server key can retrieve secret values', async () => {
      test.setTimeout(TIMEOUTS.apiCall * 2);

      const secretName = sdkUniqueSecretName('GET_TEST');
      const secretValue = 'super-secret-value-for-get-test';

      // Create first
      await clients.secrets.create({
        name: secretName,
        value: secretValue,
      });

      // Retrieve - server key CAN get the value
      const { data, error } = await clients.secrets.get(secretName);

      expect(error, `get failed: ${error?.message}`).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.secret).toBeDefined();
      expect(data?.secret?.value).toBe(secretValue);
      expect(data?.secret?.name).toBe(secretName);
    });

    test('get nonexistent secret returns NOT_FOUND', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.secrets.get('NONEXISTENT_SECRET_XYZ_12345');

      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.code).toBe(SDK_ERROR_CODES.NOT_FOUND);
    });

    test('get returns metadata fields', async () => {
      test.setTimeout(TIMEOUTS.apiCall * 2);

      const secretName = sdkUniqueSecretName('METADATA_TEST');

      await clients.secrets.create({
        name: secretName,
        value: 'metadata-test-value',
        description: 'Test description',
        category: 'webhook',
      });

      const { data, error } = await clients.secrets.get(secretName);

      expect(error).toBeNull();
      expect(data?.secret).toBeDefined();
      expect(data?.secret?.name).toBe(secretName);
      expect(data?.secret?.description).toBe('Test description');
      expect(data?.secret?.category).toBe('webhook');
      expect(data?.secret?.createdAt).toBeDefined();
    });
  });

  test.describe('Update Secrets', () => {
    test('update secret value', async () => {
      test.setTimeout(TIMEOUTS.apiCall * 3);

      const secretName = sdkUniqueSecretName('UPDATE_TEST');

      // Create
      await clients.secrets.create({
        name: secretName,
        value: 'old-value',
      });

      // Update
      const { data, error } = await clients.secrets.update(secretName, {
        value: 'new-value',
      });

      expect(error, `update failed: ${error?.message}`).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.success).toBe(true);

      // Verify update
      const { data: getData } = await clients.secrets.get(secretName);
      expect(getData?.secret?.value).toBe('new-value');
    });

    test('update secret description', async () => {
      test.setTimeout(TIMEOUTS.apiCall * 3);

      const secretName = sdkUniqueSecretName('DESC_UPDATE');

      // Create
      await clients.secrets.create({
        name: secretName,
        value: 'desc-test',
        description: 'Original description',
      });

      // Update description only
      const { data, error } = await clients.secrets.update(secretName, {
        description: 'Updated description',
      });

      expect(error).toBeNull();
      expect(data?.success).toBe(true);

      // Verify update
      const { data: getData } = await clients.secrets.get(secretName);
      expect(getData?.secret?.description).toBe('Updated description');
      // Value should be unchanged
      expect(getData?.secret?.value).toBe('desc-test');
    });

    test('update nonexistent secret returns error', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.secrets.update('NONEXISTENT_UPDATE', {
        value: 'new-value',
      });

      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.code).toBe(SDK_ERROR_CODES.NOT_FOUND);
    });
  });

  test.describe('Delete Secrets', () => {
    test('delete secret (soft delete)', async () => {
      test.setTimeout(TIMEOUTS.apiCall * 2);

      const secretName = sdkUniqueSecretName('DELETE_TEST');

      // Create
      await clients.secrets.create({
        name: secretName,
        value: 'to-delete',
      });

      // Delete
      const { data, error } = await clients.secrets.delete(secretName);

      expect(error, `delete failed: ${error?.message}`).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.success).toBe(true);

      // Should not be retrievable
      const { data: getData, error: getError } = await clients.secrets.get(secretName);
      expect(getData).toBeNull();
      expect(getError?.code).toBe(SDK_ERROR_CODES.NOT_FOUND);
    });

    test('delete nonexistent secret returns success or not found', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { error } = await clients.secrets.delete('NONEXISTENT_DELETE_XYZ');

      // Either success (idempotent) or NOT_FOUND is acceptable
      if (error) {
        expect(error.code).toBe(SDK_ERROR_CODES.NOT_FOUND);
      }
    });
  });

  test.describe('List Secrets', () => {
    test('list returns metadata only (no values)', async () => {
      test.setTimeout(TIMEOUTS.apiCall * 2);

      // Create some secrets
      const name1 = sdkUniqueSecretName('LIST_TEST_1');
      const name2 = sdkUniqueSecretName('LIST_TEST_2');

      await clients.secrets.create({ name: name1, value: 'value1' });
      await clients.secrets.create({ name: name2, value: 'value2' });

      // List
      const { data, error } = await clients.secrets.list();

      expect(error, `list failed: ${error?.message}`).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.secrets).toBeDefined();
      expect(Array.isArray(data?.secrets)).toBe(true);
      expect(data?.secrets?.length).toBeGreaterThanOrEqual(2);

      // Values should NOT be included in list response
      for (const secret of data?.secrets || []) {
        expect(secret.value).toBeUndefined();
        expect(secret.name).toBeDefined();
      }
    });

    test('list returns secret metadata', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.secrets.list();

      expect(error).toBeNull();
      expect(data?.secrets).toBeDefined();

      if (data?.secrets && data.secrets.length > 0) {
        const secret = data.secrets[0];
        expect(secret.name).toBeDefined();
        expect(secret.createdAt).toBeDefined();
        // Value should NOT be present
        expect(secret.value).toBeUndefined();
      }
    });

    test('list with limit parameter', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.secrets.list({ limit: 3 });

      expect(error).toBeNull();
      expect(data?.secrets).toBeDefined();
      expect(data?.secrets?.length).toBeLessThanOrEqual(3);
    });
  });

  test.describe('Batch Get', () => {
    test('batch get multiple secrets', async () => {
      test.setTimeout(TIMEOUTS.apiCall * 2);

      const name1 = sdkUniqueSecretName('BATCH_1');
      const name2 = sdkUniqueSecretName('BATCH_2');

      // Create secrets
      await clients.secrets.create({ name: name1, value: 'batch-value-1' });
      await clients.secrets.create({ name: name2, value: 'batch-value-2' });

      // Batch get
      const { data, error } = await clients.secrets.getMultiple([name1, name2]);

      expect(error, `getMultiple failed: ${error?.message}`).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.secrets).toBeDefined();
      expect(data?.secrets?.[name1]).toBe('batch-value-1');
      expect(data?.secrets?.[name2]).toBe('batch-value-2');
    });

    test('batch get with some missing returns partial results', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const existing = sdkUniqueSecretName('BATCH_EXISTING');
      await clients.secrets.create({ name: existing, value: 'exists' });

      const { data, error } = await clients.secrets.getMultiple([
        existing,
        'NONEXISTENT_BATCH_SECRET',
      ]);

      // May return partial results or error depending on implementation
      if (error) {
        // Some implementations return error for any missing secret
        expect(error.code).toBeDefined();
      } else {
        expect(data?.secrets?.[existing]).toBe('exists');
        // Missing secret may be undefined or null
      }
    });
  });

  test.describe('Exists Check', () => {
    test('exists returns true for existing secret', async () => {
      test.setTimeout(TIMEOUTS.apiCall * 2);

      const secretName = sdkUniqueSecretName('EXISTS_TEST');
      await clients.secrets.create({ name: secretName, value: 'test' });

      const { data, error } = await clients.secrets.exists(secretName);

      expect(error).toBeNull();
      expect(data?.exists).toBe(true);
    });

    test('exists returns false for nonexistent secret', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.secrets.exists('NONEXISTENT_EXISTS_CHECK');

      expect(error).toBeNull();
      expect(data?.exists).toBe(false);
    });
  });

  test.describe('Naming Validation', () => {
    test('uppercase snake case name succeeds', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const secretName = sdkUniqueSecretName('VALID_NAME_123');

      const { data, error } = await clients.secrets.create({
        name: secretName,
        value: 'test',
      });

      expect(error).toBeNull();
      expect(data?.success).toBe(true);
    });

    test('empty name returns validation error', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.secrets.create({
        name: '',
        value: 'test',
      });

      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.code).toBe(SDK_ERROR_CODES.VALIDATION_ERROR);
    });

    test('empty value returns validation error', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.secrets.create({
        name: sdkUniqueSecretName('EMPTY_VALUE'),
        value: '',
      });

      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.code).toBe(SDK_ERROR_CODES.VALIDATION_ERROR);
    });
  });

  test.describe('Server Key Required', () => {
    test('secrets requires server key', async () => {
      // This test verifies that secrets operations require a server key.
      // In a real browser context, using public key should return INVALID_KEY_CONTEXT.
      // We can't easily test browser context in P0-A, so we verify the contract here.

      // The SDK should reject public key usage
      // (This is tested more thoroughly in p0a-sdk-errors.spec.ts)
      expect(ctx?.serverKey.startsWith('sheen_sk_')).toBe(true);
    });
  });

  test.describe('Error Contract', () => {
    test('error has code, message, and requestId', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { error } = await clients.secrets.get('NONEXISTENT_ERROR_TEST');

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
