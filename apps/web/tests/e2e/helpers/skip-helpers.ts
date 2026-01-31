/**
 * Test skip helpers
 *
 * Centralized skip logic for common scenarios like missing tables,
 * unavailable features, etc.
 *
 * IMPORTANT: For P0-A deploy-blocking tests, prefer failIfTableMissing()
 * over skipIfTableMissing(). Skipping in P0-A defeats its purpose.
 */

import { test, expect } from '@playwright/test';

/**
 * FAIL test if error indicates a missing database table (P0-A appropriate)
 *
 * For deploy-blocking tests, use this to make missing tables visible.
 * In CI, this ensures the test fails rather than silently skipping.
 *
 * @example
 * const { data, error } = await clients.db.from('e2e_test_users').select('*').execute();
 * if (error) failIfTableMissing(error, 'e2e_test_users');
 */
export function failIfTableMissing(error: unknown, tableName?: string): void {
  const msg = (error as any)?.message || String(error);

  if (
    msg.includes('does not exist') ||
    msg.includes('undefined_table') ||
    msg.includes('relation') ||
    msg.includes('42P01') // PostgreSQL undefined_table error code
  ) {
    const tableInfo = tableName ? ` (${tableName})` : '';
    // In CI, fail loudly. In local dev, can be more lenient.
    if (process.env.CI) {
      expect.fail(`P0-A FAILURE: Table missing${tableInfo}. Ensure DB is properly seeded. Error: ${msg.slice(0, 100)}`);
    } else {
      test.skip(true, `Table missing in schema${tableInfo} (local dev only): ${msg.slice(0, 100)}`);
    }
  }
}

/**
 * Skip test if error indicates a missing database table (P0-B/nightly appropriate)
 *
 * Use this for nightly tests where skipping is acceptable.
 * For P0-A deploy-blocking tests, use failIfTableMissing() instead.
 *
 * @example
 * const { data, error } = await clients.db.from('e2e_test_users').select('*').execute();
 * if (error) skipIfTableMissing(error, 'e2e_test_users');
 */
export function skipIfTableMissing(error: unknown, tableName?: string): void {
  const msg = (error as any)?.message || String(error);

  if (
    msg.includes('does not exist') ||
    msg.includes('undefined_table') ||
    msg.includes('relation') ||
    msg.includes('42P01') // PostgreSQL undefined_table error code
  ) {
    const tableInfo = tableName ? ` (${tableName})` : '';
    test.skip(true, `Table missing in schema${tableInfo}: ${msg.slice(0, 100)}`);
  }
}

/**
 * Skip test if a feature is not available in the test harness
 *
 * @example
 * try {
 *   signature = await testHarness.generateStripeSignature(payload);
 * } catch (e) {
 *   skipIfFeatureUnavailable(e, 'Stripe signature generation');
 * }
 */
export function skipIfFeatureUnavailable(error: unknown, featureName: string): void {
  const msg = (error as any)?.message || String(error);
  test.skip(true, `${featureName} not available in testHarness: ${msg.slice(0, 100)}`);
}

/**
 * Skip test if running without real external services
 *
 * @example
 * skipIfNotRealServices('storage');
 * // ... test that requires real R2
 */
export function skipIfNotRealServices(
  service: 'storage' | 'stripe' | 'email' | 'queue'
): void {
  const envVar = `SDK_E2E_REAL_${service.toUpperCase()}`;
  if (process.env[envVar] !== 'true') {
    test.skip(true, `Requires real ${service} (set ${envVar}=true)`);
  }
}
