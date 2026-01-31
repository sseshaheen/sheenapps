/**
 * Route Normalization Utility
 *
 * Normalizes API routes to prevent cardinality explosion in metrics.
 * Replaces dynamic path segments (UUIDs, numeric IDs, emails) with placeholders.
 *
 * Without normalization, metrics would create separate entries for:
 * - /api/users/abc-123-def
 * - /api/users/xyz-456-ghi
 * - /api/users/123
 *
 * With normalization, they all become: /api/users/:id
 */

// UUID pattern: 8-4-4-4-12 hex characters with dashes
const UUID_PATTERN = /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

// Numeric ID pattern: path segment that is all digits
const NUMERIC_ID_PATTERN = /\/\d+(?=\/|$)/g;

// Email pattern in path (rare but possible)
const EMAIL_IN_PATH_PATTERN = /\/[^\/]+@[^\/]+\.[^\/]+/g;

// MongoDB ObjectId pattern: 24 hex characters
const MONGO_ID_PATTERN = /\/[0-9a-f]{24}(?=\/|$)/gi;

// Short hash pattern: 6-12 hex characters (common for short IDs)
const SHORT_HASH_PATTERN = /\/[0-9a-f]{6,12}(?=\/|$)/gi;

/**
 * Normalizes a route path by replacing dynamic segments with placeholders.
 *
 * @param path - The raw URL path (e.g., "/api/users/abc-123-def/projects/456")
 * @returns Normalized path (e.g., "/api/users/:id/projects/:id")
 *
 * @example
 * normalizeRoute('/api/users/550e8400-e29b-41d4-a716-446655440000')
 * // Returns: '/api/users/:id'
 *
 * normalizeRoute('/api/projects/123/builds/456')
 * // Returns: '/api/projects/:id/builds/:id'
 */
export function normalizeRoute(path: string): string {
  if (!path) return '/';

  let normalized = path;

  // Remove query string if present
  const queryIndex = normalized.indexOf('?');
  if (queryIndex !== -1) {
    normalized = normalized.substring(0, queryIndex);
  }

  // Order matters: more specific patterns first
  normalized = normalized
    .replace(UUID_PATTERN, '/:id')
    .replace(MONGO_ID_PATTERN, '/:id')
    .replace(EMAIL_IN_PATH_PATTERN, '/:email')
    .replace(NUMERIC_ID_PATTERN, '/:id');

  // Don't apply short hash pattern by default as it can be too aggressive
  // Uncomment if needed: .replace(SHORT_HASH_PATTERN, '/:id')

  // Normalize trailing slashes
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }

  return normalized || '/';
}

/**
 * Extracts the base route template from a Fastify route path.
 * Fastify already uses :param syntax, so this mainly handles edge cases.
 *
 * @param routePath - Fastify route template (e.g., "/api/users/:userId")
 * @returns Normalized route for metrics (e.g., "/api/users/:id")
 */
export function normalizeRouteTemplate(routePath: string): string {
  if (!routePath) return '/';

  // Standardize parameter names to :id for consistent metrics grouping
  // e.g., :userId, :projectId, :buildId all become :id
  return routePath.replace(/:[\w]+/g, ':id');
}

/**
 * Validates that a set of dimension keys are in the allowlist.
 * Used for runtime validation before inserting metrics.
 *
 * @param dimensions - Object with dimension keys
 * @returns Object with validation result
 */
export function validateDimensionKeys(
  dimensions: Record<string, string | number>
): { valid: boolean; invalidKeys?: string[] } {
  const ALLOWED_KEYS = new Set([
    'route',
    'status_code',
    'provider',
    'queue',
    'plan',
    'status',
    'type',
    'service',
  ]);

  const invalidKeys = Object.keys(dimensions).filter((key) => !ALLOWED_KEYS.has(key));

  if (invalidKeys.length > 0) {
    return { valid: false, invalidKeys };
  }

  return { valid: true };
}

/**
 * Sanitizes dimension values to prevent cardinality explosion from high-cardinality values.
 *
 * @param value - The dimension value to sanitize
 * @param maxLength - Maximum length (default 100)
 * @returns Sanitized value
 */
export function sanitizeDimensionValue(value: string, maxLength: number = 100): string {
  if (!value) return 'unknown';

  // Truncate if too long
  if (value.length > maxLength) {
    return value.substring(0, maxLength) + '...';
  }

  return value;
}

/**
 * Groups status codes into categories for metrics.
 *
 * @param statusCode - HTTP status code
 * @returns Status code category (2xx, 3xx, 4xx, 5xx)
 */
export function categorizeStatusCode(statusCode: number): string {
  if (statusCode >= 200 && statusCode < 300) return '2xx';
  if (statusCode >= 300 && statusCode < 400) return '3xx';
  if (statusCode >= 400 && statusCode < 500) return '4xx';
  if (statusCode >= 500) return '5xx';
  return 'unknown';
}
