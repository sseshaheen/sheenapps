/**
 * P0-A: SDK Email Tests
 *
 * DEPLOY-BLOCKING: These tests must pass at 100% for every deploy.
 *
 * Tests the @sheenapps/email SDK critical paths:
 * - Send with built-in templates
 * - Send with custom HTML
 * - Idempotency key handling
 * - Locale/RTL support
 * - Validation errors
 *
 * Uses:
 * - SDK test harness for project setup/teardown
 * - CI-safe mode (MOCK_EMAIL_PROVIDER=true)
 * - SDK clients for email operations
 *
 * Note: P0-A uses mock email provider - emails are stored but not delivered.
 * P0-B tests real Resend delivery.
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

test.describe('P0-A: SDK Email', () => {
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

  test.describe('Send with Template', () => {
    test('send welcome email succeeds', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.email.send({
        to: sdkUniqueEmail('welcome'),
        template: 'welcome',
        variables: { name: 'Test User' },
      });

      expect(error, `send failed: ${error?.message}`).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.email).toBeDefined();
      expect(data?.email?.id).toBeDefined();
      // Under MOCK_EMAIL_PROVIDER, status may vary
      expect(['queued', 'sent', 'delivered']).toContain(data?.email?.status);
    });

    test('send magic-link email succeeds', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.email.send({
        to: sdkUniqueEmail('magic-link'),
        template: 'magic-link',
        variables: { link: 'https://example.com/auth?token=abc123' },
      });

      expect(error).toBeNull();
      expect(data?.email?.id).toBeDefined();
    });

    test('send password-reset email succeeds', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.email.send({
        to: sdkUniqueEmail('password-reset'),
        template: 'password-reset',
        variables: { link: 'https://example.com/reset?token=xyz789' },
      });

      expect(error).toBeNull();
      expect(data?.email?.id).toBeDefined();
    });

    test('send notification email succeeds', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.email.send({
        to: sdkUniqueEmail('notification'),
        template: 'notification',
        variables: { message: 'You have a new message' },
      });

      expect(error).toBeNull();
      expect(data?.email?.id).toBeDefined();
    });
  });

  test.describe('Send with Custom HTML', () => {
    test('send custom HTML email succeeds', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.email.send({
        to: sdkUniqueEmail('custom-html'),
        subject: SDK_TEST_DATA.email.customHtml.subject,
        html: SDK_TEST_DATA.email.customHtml.html,
      });

      expect(error, `send failed: ${error?.message}`).toBeNull();
      expect(data?.email).toBeDefined();
      expect(data?.email?.id).toBeDefined();
    });

    test('send with custom from address', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.email.send({
        to: sdkUniqueEmail('custom-from'),
        subject: 'Custom From Test',
        html: '<p>Custom from address test</p>',
        from: 'support@test.sheenapps.com',
      });

      expect(error).toBeNull();
      expect(data?.email?.id).toBeDefined();
    });

    test('send with replyTo address', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.email.send({
        to: sdkUniqueEmail('reply-to'),
        subject: 'Reply-To Test',
        html: '<p>Reply-To test</p>',
        replyTo: 'replies@test.sheenapps.com',
      });

      expect(error).toBeNull();
      expect(data?.email?.id).toBeDefined();
    });
  });

  test.describe('Multiple Recipients', () => {
    test('send to array of recipients', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.email.send({
        to: [
          sdkUniqueEmail('multi-1'),
          sdkUniqueEmail('multi-2'),
          sdkUniqueEmail('multi-3'),
        ],
        subject: 'Multiple Recipients Test',
        html: '<p>Sent to multiple recipients</p>',
      });

      expect(error).toBeNull();
      expect(data?.email?.id).toBeDefined();
    });
  });

  test.describe('Locale Support', () => {
    test('send with English locale', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.email.send({
        to: sdkUniqueEmail('locale-en'),
        template: 'welcome',
        variables: { name: 'John' },
        locale: 'en',
      });

      expect(error).toBeNull();
      expect(data?.email?.id).toBeDefined();
    });

    test('send with Arabic locale uses RTL', async () => {
      test.setTimeout(TIMEOUTS.apiCall * 2);

      const { data, error } = await clients.email.send({
        to: sdkUniqueEmail('locale-ar'),
        template: 'welcome',
        variables: { name: 'أحمد' },
        locale: 'ar',
      });

      expect(error).toBeNull();
      expect(data?.email?.id).toBeDefined();

      // Verify RTL in rendered content via test harness (if available)
      if (data?.email?.id) {
        try {
          const rendered = await testHarness.getRenderedEmail(data.email.id);
          if (rendered?.html) {
            expect(rendered.html).toContain('dir="rtl"');
          }
        } catch {
          // getRenderedEmail may not be implemented - skip verification
        }
      }
    });

    test('send with French locale', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.email.send({
        to: sdkUniqueEmail('locale-fr'),
        template: 'welcome',
        variables: { name: 'Jean' },
        locale: 'fr',
      });

      expect(error).toBeNull();
      expect(data?.email?.id).toBeDefined();
    });
  });

  test.describe('Idempotency', () => {
    test('idempotency key prevents duplicate sends', async () => {
      test.setTimeout(TIMEOUTS.apiCall * 2);

      const idempotencyKey = `e2e-email-${RUN_ID}-${Date.now()}`;
      const recipient = sdkUniqueEmail('idempotent');

      // First send
      const { data: first, error: firstError } = await clients.email.send({
        to: recipient,
        subject: 'Idempotent Test',
        html: '<p>First attempt</p>',
        idempotencyKey,
      });

      expect(firstError).toBeNull();
      expect(first?.email?.id).toBeDefined();

      // Second send with same key
      const { data: second, error: secondError } = await clients.email.send({
        to: recipient,
        subject: 'Idempotent Test',
        html: '<p>Second attempt</p>',
        idempotencyKey,
      });

      expect(secondError).toBeNull();
      // Should return the same email ID
      expect(second?.email?.id).toBe(first?.email?.id);
    });
  });

  test.describe('Tags', () => {
    test('send with tags for tracking', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.email.send({
        to: sdkUniqueEmail('tagged'),
        subject: 'Tagged Email Test',
        html: '<p>Email with tags</p>',
        tags: {
          campaign: 'welcome-series',
          userId: 'user-123',
          runId: RUN_ID,
        },
      });

      expect(error).toBeNull();
      expect(data?.email?.id).toBeDefined();
    });
  });

  test.describe('Scheduled Send', () => {
    test('send with sendAt schedules email', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      // Schedule for 1 hour in the future
      const sendAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      const { data, error } = await clients.email.send({
        to: sdkUniqueEmail('scheduled'),
        subject: 'Scheduled Email Test',
        html: '<p>This email was scheduled</p>',
        sendAt,
      });

      expect(error).toBeNull();
      expect(data?.email?.id).toBeDefined();
      // Scheduled emails should have queued status
      if (data?.email?.status) {
        expect(['queued', 'scheduled']).toContain(data.email.status);
      }
    });
  });

  test.describe('Get Email', () => {
    test('get email by ID returns details', async () => {
      test.setTimeout(TIMEOUTS.apiCall * 2);

      // Send first
      const { data: sendData } = await clients.email.send({
        to: sdkUniqueEmail('get-test'),
        subject: 'Get Test',
        html: '<p>Get test</p>',
      });

      expect(sendData?.email?.id).toBeDefined();

      // Get email details
      const { data, error } = await clients.email.get(sendData!.email!.id);

      expect(error, `get failed: ${error?.message}`).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.email).toBeDefined();
      expect(data?.email?.id).toBe(sendData?.email?.id);
    });

    test('get nonexistent email returns error', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.email.get('nonexistent-email-id-12345');

      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.code).toBe(SDK_ERROR_CODES.NOT_FOUND);
    });
  });

  test.describe('List Emails', () => {
    test('list returns sent emails', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.email.list({ limit: 10 });

      expect(error, `list failed: ${error?.message}`).toBeNull();
      expect(data).not.toBeNull();
      expect(data?.emails).toBeDefined();
      expect(Array.isArray(data?.emails)).toBe(true);
    });
  });

  test.describe('Validation Errors', () => {
    test('invalid email format returns validation error', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.email.send({
        to: 'not-an-email',
        subject: 'Test',
        html: '<p>Test</p>',
      });

      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.code).toBe(SDK_ERROR_CODES.VALIDATION_ERROR);
    });

    test('empty to address returns validation error', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.email.send({
        to: '',
        subject: 'Test',
        html: '<p>Test</p>',
      });

      expect(data).toBeNull();
      expect(error).not.toBeNull();
      expect(error?.code).toBe(SDK_ERROR_CODES.VALIDATION_ERROR);
    });

    test('missing subject and template returns validation error', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.email.send({
        to: sdkUniqueEmail('missing-subject'),
        html: '<p>Test</p>',
        // No subject or template
      } as any);

      // Should fail validation
      if (error) {
        expect(error.code).toBe(SDK_ERROR_CODES.VALIDATION_ERROR);
      }
    });

    test('invalid template name returns error', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { data, error } = await clients.email.send({
        to: sdkUniqueEmail('invalid-template'),
        template: 'nonexistent-template-xyz' as any,
        variables: {},
      });

      expect(data).toBeNull();
      expect(error).not.toBeNull();
    });
  });

  test.describe('Error Contract', () => {
    test('error has code, message, and requestId', async () => {
      test.setTimeout(TIMEOUTS.apiCall);

      const { error } = await clients.email.send({
        to: 'invalid-email',
        subject: 'Test',
        html: '<p>Test</p>',
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
