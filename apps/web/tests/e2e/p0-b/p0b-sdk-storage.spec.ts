/**
 * P0-B: SDK Storage Tests (Real R2)
 *
 * NIGHTLY: These tests run nightly with real R2 storage.
 * They verify actual cloud storage operations.
 *
 * Tests:
 * - Signed URL points to real R2
 * - Actual file upload and download
 * - Content integrity verification
 * - Large file handling
 * - Delete removes from R2
 *
 * Requires: SDK_E2E_REAL_STORAGE=true or real R2 credentials
 */

import { test, expect } from '@playwright/test';
import { testHarness } from '../helpers/sdk-test-harness';
import { createSDKClients, type SDKClients } from '../helpers/sdk-client';
import {
  SDKTestContext,
  sdkUniqueStoragePath,
  SDK_TEST_DATA,
} from '../fixtures/sdk-fixtures';
import { RUN_ID } from '../fixtures/test-data';
import { TIMEOUTS, sleep } from '../helpers/timeouts';

test.describe('P0-B: SDK Storage Real R2', () => {
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

  test.describe('R2 URL Verification', () => {
    test('signed upload URL points to R2', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.storage.createSignedUploadUrl({
        path: sdkUniqueStoragePath('p0b-test/url-check.txt'),
        contentType: 'text/plain',
      });

      expect(error).toBeNull();
      expect(data?.url).toBeDefined();

      // P0-B: Assert real R2 endpoint
      if (process.env.SDK_E2E_REAL_STORAGE === 'true') {
        expect(data?.url).toContain('r2.cloudflarestorage.com');
      }
    });

    test('signed download URL points to R2', async () => {
      test.setTimeout(TIMEOUTS.p0b.realStorage);

      // Upload first
      const testPath = sdkUniqueStoragePath('p0b-test/download-url-check.txt');
      const { data: uploadUrl } = await clients.storage.createSignedUploadUrl({
        path: testPath,
        contentType: 'text/plain',
      });

      await fetch(uploadUrl!.url, {
        method: 'PUT',
        headers: uploadUrl!.headers,
        body: 'test content',
      });

      // Get download URL
      const { data, error } = await clients.storage.createSignedDownloadUrl({
        path: testPath,
      });

      expect(error).toBeNull();
      expect(data?.url).toBeDefined();

      // P0-B: Assert real R2 endpoint
      if (process.env.SDK_E2E_REAL_STORAGE === 'true') {
        expect(data?.url).toContain('r2.cloudflarestorage.com');
      }
    });
  });

  test.describe('File Upload and Download', () => {
    test('upload and download text file preserves content', async () => {
      test.setTimeout(TIMEOUTS.p0b.realStorage);

      const testContent = `P0B test content - ${RUN_ID} - ${Date.now()}`;
      const testPath = sdkUniqueStoragePath('p0b-test/text-roundtrip.txt');

      // Upload
      const { data: uploadUrl, error: uploadUrlError } =
        await clients.storage.createSignedUploadUrl({
          path: testPath,
          contentType: 'text/plain',
        });

      expect(uploadUrlError).toBeNull();

      const uploadResponse = await fetch(uploadUrl!.url, {
        method: 'PUT',
        headers: uploadUrl!.headers,
        body: testContent,
      });
      expect(uploadResponse.ok).toBe(true);

      // Small delay for R2 consistency
      await sleep(500);

      // Download
      const { data: downloadUrl, error: downloadUrlError } =
        await clients.storage.createSignedDownloadUrl({
          path: testPath,
        });

      expect(downloadUrlError).toBeNull();

      const downloadResponse = await fetch(downloadUrl!.url);
      expect(downloadResponse.ok).toBe(true);

      const downloadedContent = await downloadResponse.text();
      expect(downloadedContent).toBe(testContent);
    });

    test('upload and download binary file preserves content', async () => {
      test.setTimeout(TIMEOUTS.p0b.realStorage);

      const testPath = sdkUniqueStoragePath('p0b-test/binary-roundtrip.png');
      const imageContent = SDK_TEST_DATA.storage.files.image.content;

      // Upload
      const { data: uploadUrl } = await clients.storage.createSignedUploadUrl({
        path: testPath,
        contentType: 'image/png',
      });

      const uploadResponse = await fetch(uploadUrl!.url, {
        method: 'PUT',
        headers: uploadUrl!.headers,
        body: imageContent,
      });
      expect(uploadResponse.ok).toBe(true);

      await sleep(500);

      // Download
      const { data: downloadUrl } = await clients.storage.createSignedDownloadUrl({
        path: testPath,
      });

      const downloadResponse = await fetch(downloadUrl!.url);
      expect(downloadResponse.ok).toBe(true);

      const downloadedBuffer = Buffer.from(await downloadResponse.arrayBuffer());

      // Verify content matches
      expect(downloadedBuffer.length).toBe(imageContent.length);
      expect(downloadedBuffer.equals(imageContent)).toBe(true);
    });

    test('upload JSON file and verify structure', async () => {
      test.setTimeout(TIMEOUTS.p0b.realStorage);

      const testData = {
        id: `p0b-json-${RUN_ID}`,
        timestamp: Date.now(),
        nested: {
          array: [1, 2, 3],
          object: { key: 'value' },
        },
      };
      const testPath = sdkUniqueStoragePath('p0b-test/json-roundtrip.json');

      // Upload
      const { data: uploadUrl } = await clients.storage.createSignedUploadUrl({
        path: testPath,
        contentType: 'application/json',
      });

      await fetch(uploadUrl!.url, {
        method: 'PUT',
        headers: uploadUrl!.headers,
        body: JSON.stringify(testData),
      });

      await sleep(500);

      // Download and parse
      const { data: downloadUrl } = await clients.storage.createSignedDownloadUrl({
        path: testPath,
      });

      const downloadResponse = await fetch(downloadUrl!.url);
      const downloadedData = await downloadResponse.json();

      expect(downloadedData).toEqual(testData);
    });
  });

  test.describe('File Listing', () => {
    test('list returns uploaded files with metadata', async () => {
      test.setTimeout(TIMEOUTS.p0b.realStorage);

      const prefix = sdkUniqueStoragePath('p0b-list-test/');

      // Upload multiple files
      for (let i = 0; i < 3; i++) {
        const { data: uploadUrl } = await clients.storage.createSignedUploadUrl({
          path: `${prefix}file-${i}.txt`,
          contentType: 'text/plain',
        });

        await fetch(uploadUrl!.url, {
          method: 'PUT',
          headers: uploadUrl!.headers,
          body: `File ${i} content`,
        });
      }

      await sleep(1000); // Wait for R2 consistency

      // List files
      const { data, error } = await clients.storage.list({
        prefix,
      });

      expect(error).toBeNull();
      expect(data?.files).toBeDefined();
      expect(data?.files?.length).toBeGreaterThanOrEqual(3);

      // Verify file metadata
      for (const file of data?.files || []) {
        expect(file.path || file.name).toBeDefined();
        if (file.size !== undefined) {
          expect(file.size).toBeGreaterThan(0);
        }
      }
    });
  });

  test.describe('File Deletion', () => {
    test('delete removes file from R2', async () => {
      test.setTimeout(TIMEOUTS.p0b.realStorage);

      const testPath = sdkUniqueStoragePath('p0b-test/delete-test.txt');

      // Upload
      const { data: uploadUrl } = await clients.storage.createSignedUploadUrl({
        path: testPath,
        contentType: 'text/plain',
      });

      await fetch(uploadUrl!.url, {
        method: 'PUT',
        headers: uploadUrl!.headers,
        body: 'To be deleted',
      });

      await sleep(500);

      // Verify exists
      const { data: beforeList } = await clients.storage.list({
        prefix: testPath,
      });
      const existsBefore = beforeList?.files?.some(
        (f: any) => f.path?.includes('delete-test') || f.name?.includes('delete-test')
      );
      expect(existsBefore).toBe(true);

      // Delete
      const { error: deleteError } = await clients.storage.delete({ path: testPath });
      expect(deleteError).toBeNull();

      await sleep(500);

      // Verify deleted
      const { data: afterList } = await clients.storage.list({
        prefix: testPath,
      });
      const existsAfter = afterList?.files?.some(
        (f: any) => f.path?.includes('delete-test') || f.name?.includes('delete-test')
      );
      expect(existsAfter).toBeFalsy();
    });
  });

  test.describe('Large File Handling', () => {
    test('upload 1MB file succeeds', async () => {
      test.setTimeout(TIMEOUTS.p0b.realStorage * 2);

      const testPath = sdkUniqueStoragePath('p0b-test/large-1mb.bin');
      const largeContent = Buffer.alloc(1024 * 1024, 'x'); // 1MB of 'x'

      // Upload
      const { data: uploadUrl, error: uploadUrlError } =
        await clients.storage.createSignedUploadUrl({
          path: testPath,
          contentType: 'application/octet-stream',
        });

      expect(uploadUrlError).toBeNull();

      const uploadResponse = await fetch(uploadUrl!.url, {
        method: 'PUT',
        headers: uploadUrl!.headers,
        body: largeContent,
      });

      expect(uploadResponse.ok, `Large file upload failed: ${uploadResponse.status}`).toBe(true);

      await sleep(1000);

      // Verify by downloading
      const { data: downloadUrl } = await clients.storage.createSignedDownloadUrl({
        path: testPath,
      });

      const downloadResponse = await fetch(downloadUrl!.url);
      expect(downloadResponse.ok).toBe(true);

      const downloadedBuffer = Buffer.from(await downloadResponse.arrayBuffer());
      expect(downloadedBuffer.length).toBe(1024 * 1024);
    });
  });

  test.describe('Content Type Handling', () => {
    test('content type is preserved', async () => {
      test.setTimeout(TIMEOUTS.p0b.realStorage);

      const testPath = sdkUniqueStoragePath('p0b-test/content-type.html');

      // Upload HTML
      const { data: uploadUrl } = await clients.storage.createSignedUploadUrl({
        path: testPath,
        contentType: 'text/html',
      });

      await fetch(uploadUrl!.url, {
        method: 'PUT',
        headers: uploadUrl!.headers,
        body: '<html><body>Test</body></html>',
      });

      await sleep(500);

      // Download and check content type
      const { data: downloadUrl } = await clients.storage.createSignedDownloadUrl({
        path: testPath,
      });

      const downloadResponse = await fetch(downloadUrl!.url);
      const contentType = downloadResponse.headers.get('content-type');

      // Content type should contain text/html
      expect(contentType).toContain('text/html');
    });
  });

  test.describe('Concurrent Operations', () => {
    test('multiple concurrent uploads succeed', async () => {
      test.setTimeout(TIMEOUTS.p0b.realStorage * 2);

      const uploads = Array.from({ length: 5 }, (_, i) => ({
        path: sdkUniqueStoragePath(`p0b-test/concurrent-${i}.txt`),
        content: `Concurrent upload ${i}`,
      }));

      // Upload all concurrently
      const uploadPromises = uploads.map(async ({ path, content }) => {
        const { data: uploadUrl } = await clients.storage.createSignedUploadUrl({
          path,
          contentType: 'text/plain',
        });

        const response = await fetch(uploadUrl!.url, {
          method: 'PUT',
          headers: uploadUrl!.headers,
          body: content,
        });

        return { path, success: response.ok };
      });

      const results = await Promise.all(uploadPromises);

      // All should succeed
      for (const result of results) {
        expect(result.success, `Upload failed for ${result.path}`).toBe(true);
      }
    });
  });
});
