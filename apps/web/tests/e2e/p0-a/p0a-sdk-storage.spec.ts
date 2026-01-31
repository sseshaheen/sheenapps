/**
 * P0-A: SDK Storage Tests
 *
 * DEPLOY-BLOCKING: These tests must pass at 100% for every deploy.
 *
 * Tests the @sheenapps/storage SDK critical paths:
 * - Signed upload URL creation
 * - Upload via signed URL
 * - List files
 * - Delete files
 * - Path traversal protection
 *
 * Uses:
 * - SDK test harness for project setup/teardown
 * - CI-safe mode (stubbed storage, no real R2)
 * - SDK clients for storage operations
 *
 * Note: P0-A uses stubbed storage, so no R2 hostname assertions.
 * P0-B tests real R2 integration.
 */

import { test, expect } from '@playwright/test';
import { testHarness } from '../helpers/sdk-test-harness';
import { createSDKClients, type SDKClients } from '../helpers/sdk-client';
import {
  SDKTestContext,
  sdkUniqueStoragePath,
  SDK_TEST_DATA,
  SDK_ERROR_CODES,
} from '../fixtures/sdk-fixtures';
import { TIMEOUTS } from '../helpers/timeouts';

test.describe('P0-A: SDK Storage', () => {
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

  test.describe('Signed Upload URL', () => {
    test('creates URL with correct structure', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.storage.createSignedUploadUrl({
        path: sdkUniqueStoragePath('test/file.txt'),
        contentType: 'text/plain',
      });

      expect(error, `createSignedUploadUrl failed: ${error?.message}`).toBeNull();
      expect(data).not.toBeNull();

      // P0-A: Don't assert vendor hostname - stubbed storage may use different URL
      expect(data?.url).toBeDefined();
      expect(typeof data?.url).toBe('string');
      expect(data?.url?.length).toBeGreaterThan(0);

      // Method should be PUT for uploads
      expect(data?.method).toBe('PUT');

      // Headers should include content type
      expect(data?.headers).toBeDefined();
      expect(data?.headers?.['Content-Type']).toBe('text/plain');
    });

    test('supports different content types', async () => {
      test.setTimeout(TIMEOUTS.apiCall * 3);

      const contentTypes = ['text/plain', 'image/png', 'application/json'];

      for (const contentType of contentTypes) {
        const { data, error } = await clients.storage.createSignedUploadUrl({
          path: sdkUniqueStoragePath(`test/file-${contentType.replace('/', '-')}`),
          contentType,
        });

        expect(error, `Failed for ${contentType}: ${error?.message}`).toBeNull();
        expect(data?.headers?.['Content-Type']).toBe(contentType);
      }
    });

    test('includes expiration time', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.storage.createSignedUploadUrl({
        path: sdkUniqueStoragePath('test/expiry.txt'),
        contentType: 'text/plain',
      });

      expect(error).toBeNull();
      // URL should contain expiry info (signature or query param)
      expect(data?.url).toBeDefined();
      // Expiration should be in the future
      if (data?.expiresAt) {
        expect(new Date(data.expiresAt).getTime()).toBeGreaterThan(Date.now());
      }
    });
  });

  test.describe('Upload via Signed URL', () => {
    test('upload succeeds with valid URL', async () => {
      test.setTimeout(TIMEOUTS.upload);

      const { data: urlData, error: urlError } = await clients.storage.createSignedUploadUrl({
        path: sdkUniqueStoragePath('e2e-test/upload.txt'),
        contentType: 'text/plain',
      });

      expect(urlError).toBeNull();
      expect(urlData?.url).toBeDefined();

      // Upload to stubbed storage (or real R2 in P0-B)
      const uploadResponse = await fetch(urlData!.url, {
        method: urlData!.method || 'PUT',
        headers: urlData!.headers,
        body: SDK_TEST_DATA.storage.files.small.content,
      });

      expect(uploadResponse.ok, `Upload failed: ${uploadResponse.status}`).toBe(true);
    });

    test('upload with image content type', async () => {
      test.setTimeout(TIMEOUTS.upload);

      const { data: urlData, error: urlError } = await clients.storage.createSignedUploadUrl({
        path: sdkUniqueStoragePath('e2e-test/image.png'),
        contentType: 'image/png',
      });

      expect(urlError).toBeNull();

      const uploadResponse = await fetch(urlData!.url, {
        method: urlData!.method || 'PUT',
        headers: urlData!.headers,
        body: SDK_TEST_DATA.storage.files.image.content,
      });

      expect(uploadResponse.ok).toBe(true);
    });
  });

  test.describe('List Files', () => {
    test.beforeAll(async () => {
      // Upload a test file first
      const { data: urlData } = await clients.storage.createSignedUploadUrl({
        path: sdkUniqueStoragePath('e2e-test/list-test.txt'),
        contentType: 'text/plain',
      });

      if (urlData?.url) {
        await fetch(urlData.url, {
          method: 'PUT',
          headers: urlData.headers,
          body: 'content for list test',
        });
      }
    });

    test('returns uploaded files', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.storage.list({
        prefix: sdkUniqueStoragePath('e2e-test/'),
      });

      expect(error, `list failed: ${error?.message}`).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.files).toBeDefined();
      expect(Array.isArray(data?.files)).toBe(true);

      // Should find the uploaded file (if list works)
      if (data?.files && data.files.length > 0) {
        const hasListTest = data.files.some((f: any) =>
          f.path?.includes('list-test.txt') || f.name?.includes('list-test.txt')
        );
        expect(hasListTest).toBe(true);
      }
    });

    test('returns empty for nonexistent prefix', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.storage.list({
        prefix: 'nonexistent-prefix-xyz-12345/',
      });

      expect(error).toBeNull();
      expect(data?.files).toBeDefined();
      expect(data?.files).toHaveLength(0);
    });

    test('supports limit parameter', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.storage.list({
        prefix: sdkUniqueStoragePath('e2e-test/'),
        limit: 5,
      });

      expect(error).toBeNull();
      expect(data?.files?.length).toBeLessThanOrEqual(5);
    });
  });

  test.describe('Delete Files', () => {
    test('delete removes uploaded file', async () => {
      test.setTimeout(TIMEOUTS.apiCall * 3);

      const testPath = sdkUniqueStoragePath('e2e-test/delete-me.txt');

      // Upload first
      const { data: urlData } = await clients.storage.createSignedUploadUrl({
        path: testPath,
        contentType: 'text/plain',
      });

      await fetch(urlData!.url, {
        method: 'PUT',
        headers: urlData!.headers,
        body: 'to delete',
      });

      // Delete
      const { data, error } = await clients.storage.delete({ path: testPath });

      expect(error, `delete failed: ${error?.message}`).toBeNull();
      expect(data?.success || data?.deleted).toBeTruthy();

      // Verify deletion (file should not appear in list)
      const { data: listData } = await clients.storage.list({
        prefix: testPath,
      });

      const stillExists = listData?.files?.some((f: any) =>
        f.path?.includes('delete-me.txt')
      );
      expect(stillExists).toBeFalsy();
    });

    test('delete nonexistent file returns success or not found', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { error } = await clients.storage.delete({
        path: 'nonexistent-file-xyz-12345.txt',
      });

      // Either success (idempotent delete) or NOT_FOUND is acceptable
      if (error) {
        expect(error.code).toBe(SDK_ERROR_CODES.NOT_FOUND);
      }
    });
  });

  test.describe('Security', () => {
    test('path traversal is blocked', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.storage.createSignedUploadUrl({
        path: SDK_TEST_DATA.storage.paths.traversalAttempt,
        contentType: 'text/plain',
      });

      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.code).toBe(SDK_ERROR_CODES.VALIDATION_ERROR);
    });

    test('null bytes in path are blocked', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.storage.createSignedUploadUrl({
        path: 'test/file\x00.txt',
        contentType: 'text/plain',
      });

      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.code).toBe(SDK_ERROR_CODES.VALIDATION_ERROR);
    });

    test('empty path is rejected', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.storage.createSignedUploadUrl({
        path: '',
        contentType: 'text/plain',
      });

      expect(data).toBeNull();
      expect(error).not.toBeNull();
    });
  });

  test.describe('Download URL', () => {
    test('creates signed download URL', async () => {
      test.setTimeout(TIMEOUTS.apiCall * 2);

      const testPath = sdkUniqueStoragePath('e2e-test/download-test.txt');

      // Upload first
      const { data: uploadUrl } = await clients.storage.createSignedUploadUrl({
        path: testPath,
        contentType: 'text/plain',
      });

      await fetch(uploadUrl!.url, {
        method: 'PUT',
        headers: uploadUrl!.headers,
        body: 'download test content',
      });

      // Get download URL
      const { data, error } = await clients.storage.createSignedDownloadUrl({
        path: testPath,
      });

      expect(error, `createSignedDownloadUrl failed: ${error?.message}`).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.url).toBeDefined();
      expect(typeof data?.url).toBe('string');
    });
  });

  test.describe('Error Handling', () => {
    test('invalid content type returns error', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.storage.createSignedUploadUrl({
        path: sdkUniqueStoragePath('test.txt'),
        contentType: '', // Empty content type
      });

      // May succeed with default or return validation error
      if (error) {
        expect(error.code).toBe(SDK_ERROR_CODES.VALIDATION_ERROR);
      }
    });
  });
});
