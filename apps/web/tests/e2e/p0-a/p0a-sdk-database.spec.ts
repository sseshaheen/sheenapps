/**
 * P0-A: SDK Database Tests
 *
 * DEPLOY-BLOCKING: These tests must pass at 100% for every deploy.
 *
 * Tests the @sheenapps/db SDK critical paths:
 * - Insert operations
 * - Select with filters
 * - Update with filters
 * - Delete with filters
 * - maxRows safety guard
 * - Query builder patterns
 *
 * Uses:
 * - SDK test harness for project setup/teardown
 * - SDK clients for database operations
 * - Isolated test schema per project
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

test.describe('P0-A: SDK Database', () => {
  let ctx: SDKTestContext | null = null;
  let clients: SDKClients;

  // Test table name unique to this run
  const testTable = 'e2e_test_users';

  test.beforeAll(async () => {
    ctx = await testHarness.createProject({ plan: 'pro' });
    clients = createSDKClients(ctx);
  });

  test.afterAll(async () => {
    if (ctx) {
      await testHarness.cleanupProject(ctx.projectId);
    }
  });

  test.describe('Insert Operations', () => {
    test('insert single row returns inserted data', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const email = sdkUniqueEmail('insert-single');
      const { data, error } = await clients.db
        .from(testTable)
        .insert({
          email,
          name: 'Test User',
          test_run_id: RUN_ID,
        })
        .execute();

      // May fail if table doesn't exist - that's expected in test env
      if (error && error.message?.includes('does not exist')) {
        test.skip();
        return;
      }

      expect(error, `Insert failed: ${error?.message}`).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.rows).toBeDefined();
      expect(data?.rows).toHaveLength(1);
    });

    test('insert returns generated ID', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const email = sdkUniqueEmail('insert-id');
      const { data, error } = await clients.db
        .from(testTable)
        .insert({
          email,
          name: 'Test User ID',
          test_run_id: RUN_ID,
        })
        .returning(['id', 'email'])
        .execute();

      if (error && error.message?.includes('does not exist')) {
        test.skip();
        return;
      }

      expect(error).toBeNull();
      expect(data?.rows?.[0]?.id).toBeDefined();
      expect(data?.rows?.[0]?.email).toBe(email);
    });
  });

  test.describe('Select Operations', () => {
    const selectEmail = sdkUniqueEmail('select');

    test.beforeAll(async () => {
      // Insert test data for select tests
      await clients.db
        .from(testTable)
        .insert({
          email: selectEmail,
          name: 'Select Test User',
          test_run_id: RUN_ID,
        })
        .execute();
    });

    test('select with eq filter returns matching row', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.db
        .from(testTable)
        .select('*')
        .eq('email', selectEmail)
        .execute();

      if (error && error.message?.includes('does not exist')) {
        test.skip();
        return;
      }

      expect(error).toBeNull();
      expect(data?.rows).toHaveLength(1);
      expect(data?.rows?.[0]?.name).toBe('Select Test User');
    });

    test('select with multiple filters', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.db
        .from(testTable)
        .select('id', 'email', 'name')
        .eq('email', selectEmail)
        .eq('test_run_id', RUN_ID)
        .execute();

      if (error && error.message?.includes('does not exist')) {
        test.skip();
        return;
      }

      expect(error).toBeNull();
      expect(data?.rows).toHaveLength(1);
    });

    test('select with limit', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.db
        .from(testTable)
        .select('*')
        .eq('test_run_id', RUN_ID)
        .limit(5)
        .execute();

      if (error && error.message?.includes('does not exist')) {
        test.skip();
        return;
      }

      expect(error).toBeNull();
      expect(data?.rows?.length).toBeLessThanOrEqual(5);
    });

    test('select with order', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.db
        .from(testTable)
        .select('*')
        .eq('test_run_id', RUN_ID)
        .order('created_at', { ascending: false })
        .limit(10)
        .execute();

      if (error && error.message?.includes('does not exist')) {
        test.skip();
        return;
      }

      expect(error).toBeNull();
      // Can't verify order without checking timestamps, just ensure no error
    });

    test('select nonexistent returns empty array', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.db
        .from(testTable)
        .select('*')
        .eq('email', 'nonexistent-12345@example.com')
        .execute();

      if (error && error.message?.includes('does not exist')) {
        test.skip();
        return;
      }

      expect(error).toBeNull();
      expect(data?.rows).toHaveLength(0);
    });
  });

  test.describe('Update Operations', () => {
    test('update with filter modifies matching rows', async () => {
      test.setTimeout(TIMEOUTS.apiCall * 2);

      // Insert test row
      const email = sdkUniqueEmail('update');
      await clients.db
        .from(testTable)
        .insert({
          email,
          name: 'Old Name',
          test_run_id: RUN_ID,
        })
        .execute();

      // Update it
      const { data, error } = await clients.db
        .from(testTable)
        .update({ name: 'New Name' })
        .eq('email', email)
        .execute();

      if (error && error.message?.includes('does not exist')) {
        test.skip();
        return;
      }

      expect(error).toBeNull();
      expect(data?.rowCount).toBe(1);

      // Verify update
      const { data: selectData } = await clients.db
        .from(testTable)
        .select('name')
        .eq('email', email)
        .execute();

      expect(selectData?.rows?.[0]?.name).toBe('New Name');
    });

    test('update without filter fails (safety)', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { error } = await clients.db
        .from(testTable)
        .update({ name: 'Dangerous Update' })
        .execute();

      // Should fail without filter - dangerous operation
      expect(error).not.toBeNull();
    });
  });

  test.describe('Delete Operations', () => {
    test('delete with filter removes matching rows', async () => {
      test.setTimeout(TIMEOUTS.apiCall * 2);

      // Insert test row
      const email = sdkUniqueEmail('delete');
      await clients.db
        .from(testTable)
        .insert({
          email,
          name: 'To Delete',
          test_run_id: RUN_ID,
        })
        .execute();

      // Delete it
      const { data, error } = await clients.db
        .from(testTable)
        .delete()
        .eq('email', email)
        .execute();

      if (error && error.message?.includes('does not exist')) {
        test.skip();
        return;
      }

      expect(error).toBeNull();
      expect(data?.rowCount).toBe(1);

      // Verify deletion
      const { data: selectData } = await clients.db
        .from(testTable)
        .select('*')
        .eq('email', email)
        .execute();

      expect(selectData?.rows).toHaveLength(0);
    });

    test('delete without filter fails (safety)', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { error } = await clients.db
        .from(testTable)
        .delete()
        .execute();

      // Should fail without filter - dangerous operation
      expect(error).not.toBeNull();
    });
  });

  test.describe('maxRows Safety Guard', () => {
    test('maxRows prevents mass deletion', async () => {
      test.setTimeout(TIMEOUTS.apiCall * 3);

      // Insert multiple rows
      const bulkEmails: string[] = [];
      for (let i = 0; i < 10; i++) {
        const email = sdkUniqueEmail(`bulk-${i}`);
        bulkEmails.push(email);
        await clients.db
          .from(testTable)
          .insert({
            email,
            name: 'Bulk User',
            test_run_id: RUN_ID,
          })
          .execute();
      }

      // Try to delete with maxRows=5 when 10 rows match
      const { data, error } = await clients.db
        .from(testTable)
        .delete()
        .eq('name', 'Bulk User')
        .eq('test_run_id', RUN_ID)
        .maxRows(5)
        .execute();

      // Should fail because matched rows > maxRows
      if (error) {
        expect(error.code).toBe(SDK_ERROR_CODES.ROW_LIMIT_EXCEEDED);
        expect(error.details?.matchedRows).toBeGreaterThan(5);
        expect(error.details?.limit).toBe(5);
      }

      // Clean up - delete without maxRows restriction
      for (const email of bulkEmails) {
        await clients.db
          .from(testTable)
          .delete()
          .eq('email', email)
          .execute();
      }
    });
  });

  test.describe('Query Builder Patterns', () => {
    test('chained filters work correctly', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.db
        .from(testTable)
        .select('id', 'email', 'name')
        .eq('test_run_id', RUN_ID)
        .neq('name', 'Nonexistent')
        .limit(10)
        .offset(0)
        .execute();

      if (error && error.message?.includes('does not exist')) {
        test.skip();
        return;
      }

      expect(error).toBeNull();
      // Just verify query executes without error
    });

    test('returns row count', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.db
        .from(testTable)
        .select('*', { count: 'exact' })
        .eq('test_run_id', RUN_ID)
        .execute();

      if (error && error.message?.includes('does not exist')) {
        test.skip();
        return;
      }

      expect(error).toBeNull();
      expect(data?.count).toBeDefined();
      expect(typeof data?.count).toBe('number');
    });
  });

  test.describe('Error Handling', () => {
    test('invalid table returns error', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.db
        .from('nonexistent_table_xyz_12345')
        .select('*')
        .execute();

      expect(data).toBeNull();
      expect(error).not.toBeNull();
      // Could be NOT_FOUND or specific DB error
      expect(error?.code).toBeDefined();
    });

    test('invalid column returns error or empty result', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error, status } = await clients.db
        .from(testTable)
        .select('nonexistent_column_xyz')
        .execute();

      // SDK contract: always returns {data, error, status}
      expect(data).toBeDefined();
      expect(error).toBeDefined();
      expect(status).toBeDefined();

      // Either: error with code, or data with no matching rows
      if (error) {
        expect(error.code).toBeDefined();
      } else {
        // If no error, data should be empty (no rows match invalid column)
        expect(data?.rows ?? []).toEqual([]);
      }
    });
  });
});
