/**
 * Eventually-consistent assertion helpers
 *
 * Use these for testing async pipelines where data may not be
 * immediately available (analytics ingestion, email delivery, etc.)
 */

import { expect } from '@playwright/test';

export interface ExpectEventuallyOptions {
  /** Maximum time to wait in ms (default: 10000) */
  timeoutMs?: number;
  /** Polling interval in ms (default: 500) */
  intervalMs?: number;
  /** Custom error message */
  message?: string;
}

/**
 * Poll until a predicate returns true
 *
 * @example
 * await expectEventually(
 *   async () => clients.analytics.listEvents({ limit: 50 }),
 *   (res) => res.data?.events?.some(e => e.event === 'my_event'),
 *   { timeoutMs: 15_000, message: 'event should appear in listEvents' }
 * );
 */
export async function expectEventually<T>(
  fn: () => Promise<T>,
  predicate: (val: T) => boolean,
  opts?: ExpectEventuallyOptions
): Promise<T> {
  const timeoutMs = opts?.timeoutMs ?? 10_000;
  const intervalMs = opts?.intervalMs ?? 500;

  let lastValue: T;

  await expect
    .poll(
      async () => {
        lastValue = await fn();
        return predicate(lastValue);
      },
      {
        timeout: timeoutMs,
        intervals: [intervalMs],
        message: opts?.message,
      }
    )
    .toBe(true);

  return lastValue!;
}

/**
 * Poll until data appears (non-null, non-empty)
 *
 * @example
 * const result = await expectDataEventually(
 *   async () => clients.email.get(emailId),
 *   { timeoutMs: 10_000, message: 'email should be retrievable' }
 * );
 */
export async function expectDataEventually<T extends { data?: unknown; error?: unknown }>(
  fn: () => Promise<T>,
  opts?: ExpectEventuallyOptions
): Promise<T> {
  return expectEventually(fn, (res) => res.data != null && res.error == null, opts);
}

/**
 * Poll until a specific status is reached
 *
 * @example
 * await expectStatusEventually(
 *   async () => clients.jobs.get(jobId),
 *   'completed',
 *   { timeoutMs: 30_000 }
 * );
 */
export async function expectStatusEventually<
  T extends { data?: { status?: string } | null; error?: unknown }
>(fn: () => Promise<T>, expectedStatus: string, opts?: ExpectEventuallyOptions): Promise<T> {
  return expectEventually(fn, (res) => res.data?.status === expectedStatus, {
    ...opts,
    message: opts?.message ?? `status should become '${expectedStatus}'`,
  });
}
