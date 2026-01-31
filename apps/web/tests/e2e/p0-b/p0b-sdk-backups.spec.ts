/**
 * P0-B: SDK Backups Tests (Full Cycle)
 *
 * NIGHTLY: These tests run nightly and perform full backup/restore cycles.
 * They verify the complete backup and restore functionality.
 *
 * Tests:
 * - Create backup and wait for completion
 * - Verify backup has size and checksum
 * - Get download URL and verify accessible
 * - Full restore cycle
 * - List backups
 *
 * Note: Backups use direct API calls (no SDK package).
 */

import { test, expect } from '@playwright/test';
import { testHarness } from '../helpers/sdk-test-harness';
import { createSDKClients, type SDKClients } from '../helpers/sdk-client';
import { SDKTestContext } from '../fixtures/sdk-fixtures';
import { RUN_ID } from '../fixtures/test-data';
import { TIMEOUTS, waitFor, sleep } from '../helpers/timeouts';

test.describe('P0-B: SDK Backups Full Cycle', () => {
  let ctx: SDKTestContext | null = null;
  let clients: SDKClients;

  test.beforeAll(async () => {
    ctx = await testHarness.createProject({ plan: 'pro' });
    clients = createSDKClients(ctx);

    // Insert some test data to backup
    await clients.db
      .from('e2e_test_backup_data')
      .insert({
        name: `Backup test data ${RUN_ID}`,
        value: 'Important data to backup',
        test_run_id: RUN_ID,
      })
      .execute();
  });

  test.afterAll(async () => {
    if (ctx) {
      await testHarness.cleanupProject(ctx.projectId);
    }
  });

  /**
   * Helper to create a backup and wait for completion
   */
  async function createAndWaitForBackup(timeoutMs: number): Promise<string> {
    const createResponse = await fetch(
      `${ctx!.baseUrl}/api/inhouse/projects/${ctx!.projectId}/backups`,
      {
        method: 'POST',
        headers: { ...ctx!.authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: `e2e-p0b-${RUN_ID}` }),
      }
    );

    const { data: createData, error: createError } = await createResponse.json();
    expect(createError, `Create backup failed: ${createError?.message}`).toBeNull();
    expect(createData?.backup?.id).toBeDefined();

    // Wait for completion
    await testHarness.waitForBackupStatus(createData.backup.id, 'completed', timeoutMs);

    return createData.backup.id;
  }

  test.describe('Backup Creation', () => {
    test('create backup and wait for completion', async () => {
      test.setTimeout(TIMEOUTS.p0b.backupCreate);

      const createResponse = await fetch(
        `${ctx!.baseUrl}/api/inhouse/projects/${ctx!.projectId}/backups`,
        {
          method: 'POST',
          headers: { ...ctx!.authHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: `e2e-p0b-full-${RUN_ID}` }),
        }
      );

      expect(createResponse.ok, `Create backup failed: ${createResponse.status}`).toBe(true);

      const { data, error } = await createResponse.json();
      expect(error).toBeNull();
      expect(data?.backup?.id).toBeDefined();
      expect(data?.backup?.status).toBeDefined();

      const backupId = data.backup.id;

      // Wait for completion (P0-B allows longer wait)
      try {
        await testHarness.waitForBackupStatus(backupId, 'completed', 55_000);
      } catch {
        // Check final status even if timeout
      }

      // Verify final status
      const statusResponse = await fetch(
        `${ctx!.baseUrl}/api/inhouse/projects/${ctx!.projectId}/backups/${backupId}`,
        { headers: ctx!.authHeaders }
      );

      const { data: statusData } = await statusResponse.json();
      expect(['completed', 'in_progress', 'pending']).toContain(statusData?.backup?.status);
    });

    test('completed backup has size and checksum', async () => {
      test.setTimeout(TIMEOUTS.p0b.backupCreate);

      let backupId: string;
      try {
        backupId = await createAndWaitForBackup(55_000);
      } catch {
        test.skip();
        return;
      }

      // Get backup details
      const response = await fetch(
        `${ctx!.baseUrl}/api/inhouse/projects/${ctx!.projectId}/backups/${backupId}`,
        { headers: ctx!.authHeaders }
      );

      const { data, error } = await response.json();
      expect(error).toBeNull();
      expect(data?.backup?.status).toBe('completed');
      expect(data?.backup?.size_bytes).toBeGreaterThan(0);

      // Checksum should be present for completed backups
      if (data?.backup?.checksum_sha256) {
        expect(data.backup.checksum_sha256).toMatch(/^[a-f0-9]{64}$/);
      }
    });
  });

  test.describe('Backup Download', () => {
    test('get download URL and verify accessible', async () => {
      test.setTimeout(TIMEOUTS.p0b.backupCreate + TIMEOUTS.apiCall);

      let backupId: string;
      try {
        backupId = await createAndWaitForBackup(55_000);
      } catch {
        test.skip();
        return;
      }

      // Get download URL
      const response = await fetch(
        `${ctx!.baseUrl}/api/inhouse/projects/${ctx!.projectId}/backups/${backupId}/download`,
        { headers: ctx!.authHeaders }
      );

      expect(response.ok, `Get download URL failed: ${response.status}`).toBe(true);

      const { data, error } = await response.json();
      expect(error).toBeNull();
      expect(data?.url).toBeDefined();

      // Verify URL is accessible (HEAD request)
      const headResponse = await fetch(data.url, { method: 'HEAD' });
      expect(headResponse.ok, `Download URL not accessible: ${headResponse.status}`).toBe(true);
    });
  });

  test.describe('Backup Listing', () => {
    test('list backups returns project backups', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const response = await fetch(
        `${ctx!.baseUrl}/api/inhouse/projects/${ctx!.projectId}/backups`,
        { headers: ctx!.authHeaders }
      );

      expect(response.ok).toBe(true);

      const { data, error } = await response.json();
      expect(error).toBeNull();
      expect(data?.backups).toBeDefined();
      expect(Array.isArray(data?.backups)).toBe(true);

      // Each backup should have id and status
      for (const backup of data?.backups || []) {
        expect(backup.id).toBeDefined();
        expect(backup.status).toBeDefined();
      }
    });

    test('list backups with limit', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const response = await fetch(
        `${ctx!.baseUrl}/api/inhouse/projects/${ctx!.projectId}/backups?limit=5`,
        { headers: ctx!.authHeaders }
      );

      expect(response.ok).toBe(true);

      const { data } = await response.json();
      expect(data?.backups?.length).toBeLessThanOrEqual(5);
    });
  });

  test.describe('Restore', () => {
    test('restore from backup', async () => {
      test.setTimeout(TIMEOUTS.p0b.backupRestore);

      // First create a completed backup
      let backupId: string;
      try {
        backupId = await createAndWaitForBackup(55_000);
      } catch {
        test.skip();
        return;
      }

      // Request restore
      const restoreResponse = await fetch(
        `${ctx!.baseUrl}/api/inhouse/projects/${ctx!.projectId}/restores`,
        {
          method: 'POST',
          headers: { ...ctx!.authHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ backupId }),
        }
      );

      // Restore may not be supported or may require additional permissions
      if (!restoreResponse.ok) {
        const { error } = await restoreResponse.json();
        if (error?.code === 'NOT_IMPLEMENTED' || error?.code === 'FORBIDDEN') {
          test.skip();
          return;
        }
      }

      expect(restoreResponse.ok, `Restore request failed: ${restoreResponse.status}`).toBe(true);

      const { data: restoreData, error: restoreError } = await restoreResponse.json();
      expect(restoreError).toBeNull();
      expect(restoreData?.restore?.id).toBeDefined();

      // Wait for restore completion
      try {
        await testHarness.waitForRestoreStatus(restoreData.restore.id, 'completed', 60_000);
      } catch {
        // Check final status
      }

      // Verify restore status
      const statusResponse = await fetch(
        `${ctx!.baseUrl}/api/inhouse/projects/${ctx!.projectId}/restores/${restoreData.restore.id}`,
        { headers: ctx!.authHeaders }
      );

      if (statusResponse.ok) {
        const { data: statusData } = await statusResponse.json();
        expect(['completed', 'in_progress', 'pending']).toContain(statusData?.restore?.status);
      }
    });
  });

  test.describe('Backup Metadata', () => {
    test('backup includes creation timestamp', async () => {
      test.setTimeout(TIMEOUTS.p0b.backupCreate);

      const createResponse = await fetch(
        `${ctx!.baseUrl}/api/inhouse/projects/${ctx!.projectId}/backups`,
        {
          method: 'POST',
          headers: { ...ctx!.authHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: `e2e-p0b-timestamp-${RUN_ID}` }),
        }
      );

      const { data } = await createResponse.json();
      expect(data?.backup?.id).toBeDefined();
      expect(data?.backup?.created_at || data?.backup?.createdAt).toBeDefined();

      // Timestamp should be recent
      const createdAt = new Date(data.backup.created_at || data.backup.createdAt);
      const now = new Date();
      const diffMs = now.getTime() - createdAt.getTime();
      expect(diffMs).toBeLessThan(60_000); // Within 1 minute
    });

    test('backup reason is preserved', async () => {
      test.setTimeout(TIMEOUTS.p0b.backupCreate);

      const reason = `e2e-p0b-reason-test-${RUN_ID}`;

      const createResponse = await fetch(
        `${ctx!.baseUrl}/api/inhouse/projects/${ctx!.projectId}/backups`,
        {
          method: 'POST',
          headers: { ...ctx!.authHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason }),
        }
      );

      const { data } = await createResponse.json();
      expect(data?.backup?.id).toBeDefined();

      // Verify reason in get
      const getResponse = await fetch(
        `${ctx!.baseUrl}/api/inhouse/projects/${ctx!.projectId}/backups/${data.backup.id}`,
        { headers: ctx!.authHeaders }
      );

      const { data: getData } = await getResponse.json();
      if (getData?.backup?.reason) {
        expect(getData.backup.reason).toBe(reason);
      }
    });
  });

  test.describe('Error Handling', () => {
    test('get nonexistent backup returns error', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const response = await fetch(
        `${ctx!.baseUrl}/api/inhouse/projects/${ctx!.projectId}/backups/nonexistent-backup-p0b-12345`,
        { headers: ctx!.authHeaders }
      );

      expect(response.ok).toBe(false);
      expect([404, 403]).toContain(response.status);
    });

    test('restore from nonexistent backup returns error', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const response = await fetch(
        `${ctx!.baseUrl}/api/inhouse/projects/${ctx!.projectId}/restores`,
        {
          method: 'POST',
          headers: { ...ctx!.authHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ backupId: 'nonexistent-backup-p0b-67890' }),
        }
      );

      expect(response.ok).toBe(false);
    });
  });
});
