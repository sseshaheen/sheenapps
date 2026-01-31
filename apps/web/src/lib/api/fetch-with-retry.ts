/**
 * Network Retry Logic with Exponential Backoff
 *
 * Milestone C - Day 1 Afternoon
 *
 * Purpose: Automatically retry failed network requests with exponential backoff.
 * Only retries transient errors (5xx, 429, network failures).
 * Does NOT retry client errors (4xx except 429).
 *
 * Usage:
 * ```typescript
 * const data = await fetchWithRetry('/api/projects/123', {
 *   method: 'GET',
 *   maxRetries: 3,
 *   onRetry: (attempt, delay) => console.log(`Retry ${attempt} after ${delay}ms`)
 * })
 * ```
 */

/**
 * Options for fetch with retry
 */
export interface FetchWithRetryOptions extends RequestInit {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number

  /** Base delay in milliseconds for exponential backoff (default: 1000) */
  baseDelay?: number

  /** Maximum delay in milliseconds (default: 10000) */
  maxDelay?: number

  /** Callback fired before each retry attempt */
  onRetry?: (attempt: number, delayMs: number, error: Error) => void

  /** Custom function to determine if error is retryable (overrides default logic) */
  shouldRetry?: (error: FetchError, attempt: number) => boolean
}

/**
 * Extended Error with HTTP status and retry information
 */
export class FetchError extends Error {
  constructor(
    message: string,
    public status?: number,
    public statusText?: string,
    public isNetworkError: boolean = false,
    public response?: Response
  ) {
    super(message)
    this.name = 'FetchError'
  }
}

/**
 * Default retry logic: retry on transient errors only
 *
 * Retryable:
 * - Network errors (no response)
 * - 5xx server errors
 * - 429 rate limiting
 *
 * Not retryable:
 * - 4xx client errors (except 429)
 * - 2xx/3xx successful responses
 */
function defaultShouldRetry(error: FetchError, attempt: number): boolean {
  // Network error (no response received)
  if (error.isNetworkError) {
    return true
  }

  // No status means unknown error - don't retry
  if (!error.status) {
    return false
  }

  // 5xx server errors - retry
  if (error.status >= 500) {
    return true
  }

  // 429 rate limiting - retry
  if (error.status === 429) {
    return true
  }

  // 4xx client errors (except 429) - don't retry
  if (error.status >= 400 && error.status < 500) {
    return false
  }

  // Other errors - don't retry
  return false
}

/**
 * Calculate exponential backoff delay
 *
 * Formula: min(baseDelay * 2^attempt, maxDelay)
 * Example with baseDelay=1000, maxDelay=10000:
 * - Attempt 0: 1000ms
 * - Attempt 1: 2000ms
 * - Attempt 2: 4000ms
 * - Attempt 3: 8000ms
 * - Attempt 4: 10000ms (capped)
 */
function calculateDelay(attempt: number, baseDelay: number, maxDelay: number): number {
  const exponentialDelay = baseDelay * Math.pow(2, attempt)
  return Math.min(exponentialDelay, maxDelay)
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Fetch with automatic retry and exponential backoff
 *
 * @param url - URL to fetch
 * @param options - Fetch options + retry configuration
 * @returns Response object
 * @throws FetchError if all retries fail
 *
 * @example
 * ```typescript
 * // Basic usage
 * const response = await fetchWithRetry('/api/data')
 * const data = await response.json()
 *
 * // With custom retry options
 * const response = await fetchWithRetry('/api/data', {
 *   method: 'POST',
 *   body: JSON.stringify({ foo: 'bar' }),
 *   maxRetries: 5,
 *   baseDelay: 500,
 *   onRetry: (attempt, delay) => {
 *     console.log(`Retrying attempt ${attempt} after ${delay}ms`)
 *   }
 * })
 *
 * // With custom retry logic
 * const response = await fetchWithRetry('/api/data', {
 *   shouldRetry: (error, attempt) => {
 *     return error.status === 503 && attempt < 3
 *   }
 * })
 * ```
 */
export async function fetchWithRetry(
  url: string,
  options: FetchWithRetryOptions = {}
): Promise<Response> {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 10000,
    onRetry,
    shouldRetry = defaultShouldRetry,
    ...fetchOptions
  } = options

  let lastError: FetchError | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, fetchOptions)

      // Success - return response
      if (response.ok) {
        return response
      }

      // Non-OK response - create error
      const errorMessage = `HTTP ${response.status}: ${response.statusText}`
      lastError = new FetchError(
        errorMessage,
        response.status,
        response.statusText,
        false,
        response.clone()
      )

      // Check if we should retry
      const isLastAttempt = attempt === maxRetries
      if (isLastAttempt || !shouldRetry(lastError, attempt)) {
        throw lastError
      }

      // Calculate delay and wait before retry
      const delay = calculateDelay(attempt, baseDelay, maxDelay)
      onRetry?.(attempt + 1, delay, lastError)
      await sleep(delay)

    } catch (error) {
      // Network error (fetch failed)
      if (error instanceof TypeError || (error as any).name === 'TypeError') {
        lastError = new FetchError(
          `Network error: ${(error as Error).message}`,
          undefined,
          undefined,
          true
        )
      } else if (error instanceof FetchError) {
        lastError = error
      } else {
        lastError = new FetchError(
          error instanceof Error ? error.message : 'Unknown error',
          undefined,
          undefined,
          false
        )
      }

      // Check if we should retry
      const isLastAttempt = attempt === maxRetries
      if (isLastAttempt || !shouldRetry(lastError, attempt)) {
        throw lastError
      }

      // Calculate delay and wait before retry
      const delay = calculateDelay(attempt, baseDelay, maxDelay)
      onRetry?.(attempt + 1, delay, lastError)
      await sleep(delay)
    }
  }

  // Should never reach here, but TypeScript requires it
  throw lastError || new FetchError('Request failed after all retries')
}

/**
 * Convenience wrapper for JSON requests with retry
 *
 * @param url - URL to fetch
 * @param options - Fetch options + retry configuration
 * @returns Parsed JSON data
 * @throws FetchError if request fails
 *
 * @example
 * ```typescript
 * const data = await fetchJsonWithRetry<MyDataType>('/api/data')
 * console.log(data.id)
 * ```
 */
export async function fetchJsonWithRetry<T = any>(
  url: string,
  options: FetchWithRetryOptions = {}
): Promise<T> {
  const response = await fetchWithRetry(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  return response.json()
}

/**
 * Check if an error is a FetchError
 */
export function isFetchError(error: unknown): error is FetchError {
  return error instanceof FetchError
}

/**
 * Extract user-friendly error message from FetchError
 */
export function getFetchErrorMessage(error: unknown): string {
  if (isFetchError(error)) {
    if (error.isNetworkError) {
      return 'Unable to connect to the server. Please check your internet connection.'
    }

    if (error.status === 429) {
      return 'Too many requests. Please wait a moment and try again.'
    }

    if (error.status && error.status >= 500) {
      return 'Server error. Please try again in a moment.'
    }

    return error.message
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'An unknown error occurred'
}
