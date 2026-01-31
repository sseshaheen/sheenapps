/**
 * Bounded Wait Conventions
 *
 * Every async operation must have a bounded timeout.
 * This prevents 'why did CI hang for 30 minutes' scenarios.
 *
 * All timeouts are in milliseconds.
 */

export const TIMEOUTS = {
  // Page navigation
  navigation: 10_000,

  // AI responses in E2E mode (fast paths)
  aiResponse: 15_000,

  // Build operations
  buildFast: 10_000, // E2E deterministic builds
  buildReal: 120_000, // Real builds (P0-B only)

  // SSE connections
  sseConnection: 5_000,
  sseMessage: 30_000,

  // API calls
  apiCall: 10_000,

  // UI animations and transitions
  animation: 1_000,

  // Auth operations
  login: 15_000,

  // File uploads
  upload: 30_000,

  // Cleanup operations
  cleanup: 10_000,

  // P0-B specific (nightly, longer timeouts for real backends)
  p0b: {
    realStorage: 30_000, // Real R2 operations
    realStripe: 20_000, // Real Stripe API
    realEmail: 15_000, // Real Resend
    realQueue: 30_000, // Real BullMQ queue
    backupCreate: 60_000, // Backup creation
    backupRestore: 120_000, // Full restore
    quotaTest: 20_000, // Quota exceeded tests
  },
} as const;

/**
 * Wait for a condition with a bounded timeout
 * Throws a descriptive error if timeout is exceeded
 */
export async function waitFor<T>(
  condition: () => Promise<T> | T,
  options: {
    timeout: number;
    interval?: number;
    message?: string;
  }
): Promise<T> {
  const { timeout, interval = 100, message = 'Condition not met' } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      const result = await condition();
      if (result) {
        return result;
      }
    } catch {
      // Condition threw, keep trying
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(`Timeout after ${timeout}ms: ${message}`);
}

/**
 * Wrapper for expect with timeout context
 * Adds timeout information to assertion errors
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  context: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Timeout after ${timeoutMs}ms: ${context}`)),
        timeoutMs
      )
    ),
  ]);
}

/**
 * Sleep helper with max duration guard
 */
export function sleep(ms: number): Promise<void> {
  const safeDuration = Math.min(ms, 60_000); // Max 1 minute
  return new Promise((resolve) => setTimeout(resolve, safeDuration));
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    initialDelay?: number;
    maxDelay?: number;
    timeout?: number;
  } = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelay = 100,
    maxDelay = 5000,
    timeout = 30_000,
  } = options;

  const startTime = Date.now();
  let lastError: Error | undefined;
  let delay = initialDelay;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (Date.now() - startTime > timeout) {
      throw new Error(
        `Retry timeout after ${timeout}ms. Last error: ${lastError?.message || 'Unknown'}`
      );
    }

    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxAttempts) {
        await sleep(delay);
        delay = Math.min(delay * 2, maxDelay);
      }
    }
  }

  throw lastError || new Error('Retry failed');
}
