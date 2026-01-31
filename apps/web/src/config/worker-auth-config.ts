/**
 * Centralized Worker API Authentication Configuration
 * 
 * This file defines the single source of truth for all Worker API authentication.
 * All worker endpoints MUST use these standards.
 * 
 * HMAC Standard: v1 (stable)
 * Format: timestamp + body (NO path in canonical string)
 * 
 * @since August 2025
 */

export const WORKER_AUTH_CONFIG = {
  /**
   * HMAC Version to use
   * v1: Stable, uses timestamp + body
   * v2: Future, uses METHOD\nPATH\nTIMESTAMP\nNONCE\nBODY
   */
  hmacVersion: 'v1' as const,

  /**
   * Environment variable names
   */
  env: {
    baseUrl: 'WORKER_BASE_URL',
    sharedSecret: 'WORKER_SHARED_SECRET',
  },

  /**
   * HTTP Headers used for authentication
   */
  headers: {
    signature: 'x-sheen-signature',
    signatureV2: 'x-sheen-sig-v2',
    timestamp: 'x-sheen-timestamp',
    nonce: 'x-sheen-nonce',
    locale: 'x-sheen-locale',
    correlationId: 'x-correlation-id',
  },

  /**
   * Validation rules
   */
  validation: {
    secretMinLength: 32,
    timestampToleranceSeconds: 60, // Accept timestamps within 60 seconds
    nonceLength: 32, // 16 bytes hex = 32 chars
  },

  /**
   * Rate limiting configuration
   */
  rateLimit: {
    defaultRetryAfterSeconds: 60,
    maxRetryAttempts: 3,
    exponentialBackoffBase: 2,
    maxBackoffMs: 300000, // 5 minutes
    jitterFactor: 0.1, // 10% jitter
  },

  /**
   * Error handling
   */
  errors: {
    retryableCodes: [429, 502, 503, 504],
    authErrorCodes: [401, 403],
    balanceErrorCode: 402,
  },

  /**
   * Default headers for all requests
   */
  defaultHeaders: {
    'Content-Type': 'application/json',
    'User-Agent': 'SheenApps-NextJS/2.0',
  },

  /**
   * Endpoint-specific configurations
   */
  endpoints: {
    '/v1/chat-plan': {
      streaming: true,
      acceptHeader: 'text/event-stream',
    },
    '/v1/billing/check-sufficient': {
      cacheable: true,
      ttlSeconds: 60,
    },
  },

  /**
   * Health and monitoring endpoints that don't require versioning
   * These are internal/operational endpoints that remain stable across API versions
   */
  unversionedEndpoints: [
    '/health',
    '/health/detailed',
    '/health/capacity',
    '/health/cluster',
    '/health/logs',
    '/health/errors',
    '/health/ai-limits',
    '/cluster/status',
    '/cluster/servers/:serverId',
    '/cluster/routing',
    '/claude-executor/health',
    '/myhealthz',
    '/',
  ],
} as const;

/**
 * HMAC Canonical String Formats
 * 
 * CRITICAL: These formats MUST match the Worker's expectations
 */
export const HMAC_FORMATS = {
  /**
   * v1 Format (CURRENT STANDARD)
   * Canonical: timestamp + body
   * Example: "1754736000{"test":"data"}"
   */
  v1: (timestamp: number, body: string): string => {
    return timestamp.toString() + body;
  },

  /**
   * v2 Format (FUTURE)
   * Canonical: METHOD\nPATH\nTIMESTAMP\nNONCE\nBODY
   * Example: "POST\n/v1/chat-plan\n1754736000\nabc123\n{"test":"data"}"
   */
  v2: (method: string, path: string, timestamp: number, nonce: string, body: string): string => {
    return [
      method.toUpperCase(),
      path,
      timestamp.toString(),
      nonce,
      body,
    ].join('\n');
  },
} as const;

/**
 * Type definitions for strict typing
 */
export type WorkerAuthVersion = 'v1' | 'v2';
export type WorkerEndpoint = keyof typeof WORKER_AUTH_CONFIG.endpoints;
export type WorkerErrorCode = 
  | typeof WORKER_AUTH_CONFIG.errors.retryableCodes[number]
  | typeof WORKER_AUTH_CONFIG.errors.authErrorCodes[number]
  | typeof WORKER_AUTH_CONFIG.errors.balanceErrorCode;

/**
 * Helper function to check if an error is retryable
 */
export function isRetryableError(statusCode: number): boolean {
  return WORKER_AUTH_CONFIG.errors.retryableCodes.includes(statusCode as any);
}

/**
 * Helper function to check if an error is an auth error
 */
export function isAuthError(statusCode: number): boolean {
  return WORKER_AUTH_CONFIG.errors.authErrorCodes.includes(statusCode as any);
}

/**
 * Helper function to get endpoint-specific config
 */
export function getEndpointConfig(path: string): typeof WORKER_AUTH_CONFIG.endpoints[WorkerEndpoint] | undefined {
  return WORKER_AUTH_CONFIG.endpoints[path as WorkerEndpoint];
}

/**
 * Helper function to check if an endpoint requires versioning
 * Health and monitoring endpoints don't need /v1/ prefix
 */
export function requiresVersioning(path: string): boolean {
  // Check if it's an unversioned endpoint
  const isUnversioned = WORKER_AUTH_CONFIG.unversionedEndpoints.some(endpoint => {
    // Handle parameterized paths like /cluster/servers/:serverId
    const pattern = endpoint.replace(/:[\w]+/g, '[^/]+');
    const regex = new RegExp(`^${pattern}$`);
    return regex.test(path);
  });
  
  return !isUnversioned;
}

/**
 * Validation helper to ensure consistency
 */
export function validateHMACConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check environment variables
  const baseUrl = process.env[WORKER_AUTH_CONFIG.env.baseUrl];
  const secret = process.env[WORKER_AUTH_CONFIG.env.sharedSecret];

  if (!baseUrl) {
    errors.push(`${WORKER_AUTH_CONFIG.env.baseUrl} environment variable is required`);
  }

  if (!secret) {
    errors.push(`${WORKER_AUTH_CONFIG.env.sharedSecret} environment variable is required`);
  } else if (secret.length < WORKER_AUTH_CONFIG.validation.secretMinLength) {
    errors.push(
      `${WORKER_AUTH_CONFIG.env.sharedSecret} should be at least ${WORKER_AUTH_CONFIG.validation.secretMinLength} characters`
    );
  }

  // Validate URL format
  if (baseUrl) {
    try {
      new URL(baseUrl);
    } catch {
      errors.push(`${WORKER_AUTH_CONFIG.env.baseUrl} must be a valid URL`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}