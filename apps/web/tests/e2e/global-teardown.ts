/**
 * Global Teardown for E2E Tests
 *
 * Layer 2 of the two-layer cleanup system.
 * This runs after all tests complete and cleans up any orphaned test data.
 */

import { e2eGlobalTeardown } from './helpers/cleanup';

export default async function globalTeardown() {
  console.log('🧹 Starting E2E global teardown...');

  try {
    await e2eGlobalTeardown();
    console.log('✅ E2E global teardown completed');
  } catch (error) {
    // Log but don't fail the test run
    console.error('⚠️ E2E global teardown encountered an error:', error);
  }
}
