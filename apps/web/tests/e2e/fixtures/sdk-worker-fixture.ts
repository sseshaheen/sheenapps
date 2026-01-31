/**
 * Worker-scoped SDK Test Fixture
 *
 * Creates ONE project per Playwright worker, reused across all tests in that worker.
 * This prevents the "stampede" problem where each spec file creates its own project,
 * which causes rate limits and flakiness in CI.
 *
 * Usage:
 *   import { test, expect } from '../fixtures/sdk-worker-fixture';
 *
 *   test('my test', async ({ ctx, clients }) => {
 *     // ctx and clients are shared across all tests in this worker
 *   });
 */

import { test as base, expect } from '@playwright/test';
import { testHarness } from '../helpers/sdk-test-harness';
import { createSDKClients, type SDKClients } from '../helpers/sdk-client';
import type { SDKTestContext } from './sdk-fixtures';

type SDKWorkerFixtures = {
  /** Project context - shared per worker */
  ctx: SDKTestContext;
  /** SDK clients initialized with project keys - shared per worker */
  clients: SDKClients;
};

export const test = base.extend<{}, SDKWorkerFixtures>({
  ctx: [
    async ({}, use, workerInfo) => {
      const ctx = await testHarness.createProject({
        plan: 'pro',
        name: `e2e-worker-${workerInfo.workerIndex}`,
      });

      try {
        await use(ctx);
      } finally {
        // Always cleanup, even if tests failed
        await testHarness.cleanupProject(ctx.projectId);
      }
    },
    { scope: 'worker' },
  ],

  clients: [
    async ({ ctx }, use) => {
      await use(createSDKClients(ctx));
    },
    { scope: 'worker' },
  ],
});

export { expect };
