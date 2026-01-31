/**
 * Worker API Authentication Utilities
 * Handles HMAC signature generation with path canonicalization for security
 */


import crypto from 'crypto';

/**
 * Generate HMAC SHA256 signature for Worker API requests (v1 format)
 * CORRECTED: v1 uses timestamp + body (NO path!)
 *
 * @param body Request body as string
 * @param timestamp Unix timestamp in seconds
 * @returns Hex-encoded HMAC signature
 * @throws Error if WORKER_SHARED_SECRET is not configured
 */
export function generateWorkerSignature(body: string, timestamp: number): string {
  // SECURITY FIX: Only use server-side environment variables
  // Allow in test environment
  if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'test') {
    throw new Error('Worker authentication cannot be used in browser context. Use server actions instead.');
  }

  const secret = process.env.WORKER_SHARED_SECRET;
  if (!secret) {
    throw new Error('WORKER_SHARED_SECRET environment variable not configured');
  }

  // CORRECTED v1 format: timestamp + body (NO path!)
  const canonical = timestamp.toString() + body;

  return crypto
    .createHmac('sha256', secret)
    .update(canonical, 'utf8')
    .digest('hex');
}

/**
 * Validate environment variables required for Worker API authentication
 * Should be called at application startup
 */
export function validateWorkerAuthEnvironment(): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // SECURITY FIX: Only check server-side environment variables
  // Allow in test environment
  if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'test') {
    errors.push('Worker auth validation cannot be used in browser context');
    return { valid: false, errors };
  }

  const baseUrl = process.env.WORKER_BASE_URL;
  const sharedSecret = process.env.WORKER_SHARED_SECRET;

  if (!baseUrl) {
    errors.push('WORKER_BASE_URL environment variable is required');
  }

  if (!sharedSecret) {
    errors.push('WORKER_SHARED_SECRET environment variable is required');
  }

  // Validate URL format if provided
  if (process.env.WORKER_BASE_URL) {
    try {
      new URL(process.env.WORKER_BASE_URL);
    } catch {
      errors.push('WORKER_BASE_URL must be a valid URL');
    }
  }

  // Validate secret length (should be at least 32 characters for security)
  if (process.env.WORKER_SHARED_SECRET && process.env.WORKER_SHARED_SECRET.length < 32) {
    errors.push('WORKER_SHARED_SECRET should be at least 32 characters long');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Parse rate limit headers from Worker API response
 * Supports multiple header formats for flexibility
 */
export function parseRateLimitHeaders(headers: Headers): {
  limit?: number;
  remaining?: number;
  resetAt?: Date;
  retryAfter?: number;
} {
  const result: ReturnType<typeof parseRateLimitHeaders> = {};

  // Parse limit
  const limit = headers.get('x-ratelimit-limit') || headers.get('ratelimit-limit');
  if (limit) {
    result.limit = parseInt(limit, 10);
  }

  // Parse remaining
  const remaining = headers.get('x-ratelimit-remaining') || headers.get('ratelimit-remaining');
  if (remaining) {
    result.remaining = parseInt(remaining, 10);
  }

  // Parse reset time
  const reset = headers.get('x-ratelimit-reset') || headers.get('ratelimit-reset');
  if (reset) {
    // Could be Unix timestamp or seconds from now
    const resetTime = parseInt(reset, 10);
    if (resetTime > 1000000000) {
      // Unix timestamp
      result.resetAt = new Date(resetTime * 1000);
    } else {
      // Seconds from now
      result.resetAt = new Date(Date.now() + resetTime * 1000);
    }
  }

  // Parse retry-after header
  const retryAfter = headers.get('retry-after');
  if (retryAfter) {
    result.retryAfter = parseInt(retryAfter, 10);
  }

  return result;
}

/**
 * Sort query parameters alphabetically for consistent signatures
 * @param pathWithQuery Path that may contain query parameters
 * @returns Path with sorted query parameters
 */
function sortQueryParams(pathWithQuery: string): string {
  if (!pathWithQuery.includes('?')) return pathWithQuery;

  const [base, queryString] = pathWithQuery.split('?');
  const params = new URLSearchParams(queryString);

  // Sort parameters alphabetically by key
  const sortedParams = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b));

  const sortedQuery = new URLSearchParams(sortedParams).toString();
  return sortedQuery ? `${base}?${sortedQuery}` : base;
}

/**
 * Generate HMAC v2 signature with proper format
 * @param method HTTP method (GET, POST, etc.)
 * @param pathWithQuery Full path including query parameters
 * @param timestamp Unix timestamp in seconds
 * @param nonce Random string for additional security
 * @param body Request body as string
 */
export function generateWorkerSignatureV2(
  method: string,
  pathWithQuery: string,
  timestamp: number,
  nonce: string,
  body: string
): string {
  // Allow in test environment
  if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'test') {
    throw new Error('Worker authentication cannot be used in browser context.');
  }

  const secret = process.env.WORKER_SHARED_SECRET;
  if (!secret) {
    throw new Error('WORKER_SHARED_SECRET environment variable not configured');
  }

  // CRITICAL: Sort query parameters alphabetically for v2 signature
  const sortedPath = sortQueryParams(pathWithQuery);

  // v2 format: METHOD\nPATH_WITH_SORTED_QUERY\nTIMESTAMP\nNONCE\nBODY
  const canonical = [
    method.toUpperCase(),
    sortedPath,
    timestamp.toString(),
    nonce,
    body
  ].join('\n');

  return crypto
    .createHmac('sha256', secret)
    .update(canonical, 'utf8')
    .digest('hex');
}

/**
 * Create authorization headers for Worker API requests
 */
export function createWorkerAuthHeaders(
  method: string,
  pathWithQuery: string,
  body: string,
  additionalHeaders: Record<string, string> = {}
): Record<string, string> {
  // Generate timestamp and nonce
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomBytes(16).toString('hex');

  // Generate CORRECTED v1 signature (timestamp + body)
  const signatureV1 = generateWorkerSignature(body, timestamp);

  // Generate CORRECTED v2 signature (METHOD\nPATH\nTIMESTAMP\nNONCE\nBODY)
  const signatureV2 = generateWorkerSignatureV2(method, pathWithQuery, timestamp, nonce, body);

  return {
    'Content-Type': 'application/json',
    'x-sheen-signature': signatureV1,
    'x-sheen-sig-v2': signatureV2,  // Plain hex string, not formatted
    'x-sheen-timestamp': timestamp.toString(),
    'x-sheen-nonce': nonce,
    ...additionalHeaders
  };
}
