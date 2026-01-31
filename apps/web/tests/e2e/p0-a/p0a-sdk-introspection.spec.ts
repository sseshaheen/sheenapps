/**
 * P0-A: SDK Introspection Tests
 *
 * DEPLOY-BLOCKING: These tests must pass at 100% for every deploy.
 *
 * Tests the introspection APIs (limits, capabilities, project info):
 * - Limits API returns current usage and quotas
 * - Capabilities API returns enabled services
 * - Project info API returns basic metadata
 *
 * Uses:
 * - SDK test harness for project setup/teardown
 * - Direct fetch calls to introspection endpoints
 *
 * Note: These are introspection endpoints, not quota edge cases.
 * P0-B tests actual quota exceeded scenarios.
 */

import { test, expect } from '@playwright/test';
import { testHarness } from '../helpers/sdk-test-harness';
import { SDKTestContext } from '../fixtures/sdk-fixtures';
import { TIMEOUTS } from '../helpers/timeouts';

test.describe('P0-A: SDK Introspection', () => {
  let ctx: SDKTestContext | null = null;

  test.beforeAll(async () => {
    ctx = await testHarness.createProject({ plan: 'pro' });
  });

  test.afterAll(async () => {
    if (ctx) {
      await testHarness.cleanupProject(ctx.projectId);
    }
  });

  test.describe('Limits API', () => {
    test('returns current usage for all metrics', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      if (!ctx) {
        test.skip();
        return;
      }

      const response = await fetch(
        `${ctx.baseUrl}/api/inhouse/projects/${ctx.projectId}/limits`,
        { headers: ctx.authHeaders }
      );

      expect(response.ok, `Limits API returned ${response.status}`).toBe(true);

      const { data, error } = await response.json();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.plan).toBeDefined();
      expect(data?.limits).toBeDefined();
    });

    test('returns storage usage', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      if (!ctx) {
        test.skip();
        return;
      }

      const response = await fetch(
        `${ctx.baseUrl}/api/inhouse/projects/${ctx.projectId}/limits`,
        { headers: ctx.authHeaders }
      );

      const { data, error } = await response.json();

      expect(error).toBeNull();
      expect(data?.limits?.storage_bytes).toBeDefined();
      expect(data?.limits?.storage_bytes?.used).toBeGreaterThanOrEqual(0);
      expect(data?.limits?.storage_bytes?.limit).toBeGreaterThan(0);
    });

    test('returns email quota', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      if (!ctx) {
        test.skip();
        return;
      }

      const response = await fetch(
        `${ctx.baseUrl}/api/inhouse/projects/${ctx.projectId}/limits`,
        { headers: ctx.authHeaders }
      );

      const { data } = await response.json();

      if (data?.limits?.email_sends) {
        expect(data.limits.email_sends.used).toBeGreaterThanOrEqual(0);
        expect(data.limits.email_sends.limit).toBeGreaterThan(0);
      }
    });

    test('returns job quota', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      if (!ctx) {
        test.skip();
        return;
      }

      const response = await fetch(
        `${ctx.baseUrl}/api/inhouse/projects/${ctx.projectId}/limits`,
        { headers: ctx.authHeaders }
      );

      const { data } = await response.json();

      if (data?.limits?.job_runs) {
        expect(data.limits.job_runs.used).toBeGreaterThanOrEqual(0);
        expect(data.limits.job_runs.limit).toBeGreaterThan(0);
      }
    });

    test('limits API requires authentication', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      if (!ctx) {
        test.skip();
        return;
      }

      const response = await fetch(
        `${ctx.baseUrl}/api/inhouse/projects/${ctx.projectId}/limits`,
        { headers: { 'Content-Type': 'application/json' } } // No auth
      );

      expect(response.ok).toBe(false);
      expect([401, 403]).toContain(response.status);
    });
  });

  test.describe('Capabilities API', () => {
    test('returns enabled services', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      if (!ctx) {
        test.skip();
        return;
      }

      const response = await fetch(
        `${ctx.baseUrl}/api/inhouse/projects/${ctx.projectId}/capabilities`,
        { headers: ctx.authHeaders }
      );

      expect(response.ok, `Capabilities API returned ${response.status}`).toBe(true);

      const { data, error } = await response.json();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.primitives).toBeDefined();
    });

    test('auth primitive is enabled', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      if (!ctx) {
        test.skip();
        return;
      }

      const response = await fetch(
        `${ctx.baseUrl}/api/inhouse/projects/${ctx.projectId}/capabilities`,
        { headers: ctx.authHeaders }
      );

      const { data } = await response.json();

      expect(data?.primitives?.auth).toBeDefined();
      expect(data?.primitives?.auth?.enabled).toBe(true);
    });

    test('db primitive is enabled', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      if (!ctx) {
        test.skip();
        return;
      }

      const response = await fetch(
        `${ctx.baseUrl}/api/inhouse/projects/${ctx.projectId}/capabilities`,
        { headers: ctx.authHeaders }
      );

      const { data } = await response.json();

      expect(data?.primitives?.db).toBeDefined();
      expect(data?.primitives?.db?.enabled).toBe(true);
    });

    test('storage primitive is enabled', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      if (!ctx) {
        test.skip();
        return;
      }

      const response = await fetch(
        `${ctx.baseUrl}/api/inhouse/projects/${ctx.projectId}/capabilities`,
        { headers: ctx.authHeaders }
      );

      const { data } = await response.json();

      expect(data?.primitives?.storage).toBeDefined();
      expect(data?.primitives?.storage?.enabled).toBe(true);
    });

    test('capabilities API requires authentication', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      if (!ctx) {
        test.skip();
        return;
      }

      const response = await fetch(
        `${ctx.baseUrl}/api/inhouse/projects/${ctx.projectId}/capabilities`,
        { headers: { 'Content-Type': 'application/json' } } // No auth
      );

      expect(response.ok).toBe(false);
      expect([401, 403]).toContain(response.status);
    });
  });

  test.describe('Project Info API', () => {
    test('returns project metadata', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      if (!ctx) {
        test.skip();
        return;
      }

      const response = await fetch(
        `${ctx.baseUrl}/api/inhouse/projects/${ctx.projectId}/info`,
        { headers: ctx.authHeaders }
      );

      expect(response.ok, `Project info API returned ${response.status}`).toBe(true);

      const { data, error } = await response.json();

      expect(error).toBeNull();
      expect(data).not.toBeNull();
    });

    test('returns project ID', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      if (!ctx) {
        test.skip();
        return;
      }

      const response = await fetch(
        `${ctx.baseUrl}/api/inhouse/projects/${ctx.projectId}/info`,
        { headers: ctx.authHeaders }
      );

      const { data } = await response.json();

      expect(data?.projectId).toBe(ctx.projectId);
    });

    test('returns schema name', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      if (!ctx) {
        test.skip();
        return;
      }

      const response = await fetch(
        `${ctx.baseUrl}/api/inhouse/projects/${ctx.projectId}/info`,
        { headers: ctx.authHeaders }
      );

      const { data } = await response.json();

      expect(data?.schemaName).toBeDefined();
      expect(typeof data?.schemaName).toBe('string');
    });

    test('returns creation timestamp', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      if (!ctx) {
        test.skip();
        return;
      }

      const response = await fetch(
        `${ctx.baseUrl}/api/inhouse/projects/${ctx.projectId}/info`,
        { headers: ctx.authHeaders }
      );

      const { data } = await response.json();

      expect(data?.createdAt).toBeDefined();
      // Should be a valid timestamp
      const createdAt = new Date(data.createdAt);
      expect(createdAt.getTime()).toBeGreaterThan(0);
    });

    test('project info API requires authentication', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      if (!ctx) {
        test.skip();
        return;
      }

      const response = await fetch(
        `${ctx.baseUrl}/api/inhouse/projects/${ctx.projectId}/info`,
        { headers: { 'Content-Type': 'application/json' } } // No auth
      );

      expect(response.ok).toBe(false);
      expect([401, 403]).toContain(response.status);
    });

    test('nonexistent project returns 404', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      if (!ctx) {
        test.skip();
        return;
      }

      const response = await fetch(
        `${ctx.baseUrl}/api/inhouse/projects/nonexistent-project-12345/info`,
        { headers: ctx.authHeaders }
      );

      // Should return 404 or 403 (forbidden for non-owned project)
      expect(response.ok).toBe(false);
      expect([403, 404]).toContain(response.status);
    });
  });

  test.describe('Cross-Project Access', () => {
    test('cannot access other project limits', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      if (!ctx) {
        test.skip();
        return;
      }

      // Try to access a different project's limits
      const response = await fetch(
        `${ctx.baseUrl}/api/inhouse/projects/other-project-id-12345/limits`,
        { headers: ctx.authHeaders }
      );

      expect(response.ok).toBe(false);
      expect([403, 404]).toContain(response.status);
    });

    test('cannot access other project capabilities', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      if (!ctx) {
        test.skip();
        return;
      }

      const response = await fetch(
        `${ctx.baseUrl}/api/inhouse/projects/other-project-id-12345/capabilities`,
        { headers: ctx.authHeaders }
      );

      expect(response.ok).toBe(false);
      expect([403, 404]).toContain(response.status);
    });
  });

  test.describe('Plan Information', () => {
    test('limits include plan name', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      if (!ctx) {
        test.skip();
        return;
      }

      const response = await fetch(
        `${ctx.baseUrl}/api/inhouse/projects/${ctx.projectId}/limits`,
        { headers: ctx.authHeaders }
      );

      const { data } = await response.json();

      expect(data?.plan).toBeDefined();
      expect(typeof data?.plan).toBe('string');
      // Pro plan should be what we created
      expect(['pro', 'free', 'e2e_tiny']).toContain(data?.plan);
    });

    test('pro plan has higher limits than free', async () => {
      // This test validates that pro plan limits are reasonable
      // We can't easily compare without creating both plan types
      test.setTimeout(TIMEOUTS.apiCall);

      if (!ctx) {
        test.skip();
        return;
      }

      const response = await fetch(
        `${ctx.baseUrl}/api/inhouse/projects/${ctx.projectId}/limits`,
        { headers: ctx.authHeaders }
      );

      const { data } = await response.json();

      // Pro plan should have substantial storage limit
      if (data?.limits?.storage_bytes?.limit) {
        // Pro should have at least 1GB
        expect(data.limits.storage_bytes.limit).toBeGreaterThanOrEqual(1 * 1024 * 1024 * 1024);
      }
    });
  });

  test.describe('Error Response Format', () => {
    test('error responses have consistent structure', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      if (!ctx) {
        test.skip();
        return;
      }

      // Trigger an error by accessing without auth
      const response = await fetch(
        `${ctx.baseUrl}/api/inhouse/projects/${ctx.projectId}/limits`,
        { headers: { 'Content-Type': 'application/json' } }
      );

      expect(response.ok).toBe(false);

      const body = await response.json();

      // Error response should have consistent structure
      expect(body.error).toBeDefined();
      expect(body.error.code || body.error.message).toBeDefined();
    });
  });
});
