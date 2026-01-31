import { createHmac } from 'crypto';

/**
 * Request Hash Utility
 * 
 * Creates canonical request hashes for idempotency checks using HMAC-SHA256
 * Follows expert recommendations for admin audit system
 */

/**
 * Canonicalizes an object by sorting keys to avoid whitespace/order issues
 */
function canonicalize(obj: unknown): string {
  if (obj === null || obj === undefined) {
    return '{}';
  }
  
  if (typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  
  return JSON.stringify(obj, Object.keys(obj as Record<string, any>).sort());
}

/**
 * Creates a canonical request hash for idempotency
 * 
 * @param method - HTTP method (uppercase)
 * @param path - Request path
 * @param body - Request body (will be canonicalized)
 * @param secret - HMAC secret (use process.env.ADMIN_JWT_SECRET or similar)
 * @returns Hex-encoded HMAC-SHA256 hash
 */
export function makeRequestHash(
  method: string,
  path: string,
  body: unknown,
  secret: string
): string {
  const hmac = createHmac('sha256', secret);
  
  // Canonical format: METHOD|PATH|CANONICAL_JSON_BODY
  hmac.update(method.toUpperCase());
  hmac.update('|');
  hmac.update(path);
  hmac.update('|');
  hmac.update(canonicalize(body));
  
  return hmac.digest('hex');
}

/**
 * Helper to generate request hash from Fastify request
 */
export function makeRequestHashFromRequest(
  request: { method: string; url: string; body: unknown },
  secret: string = process.env.ADMIN_JWT_SECRET || 'fallback-secret'
): string {
  // Extract path without query parameters
  const url = new URL(request.url, 'http://localhost');
  const path = url.pathname;
  
  return makeRequestHash(request.method, path, request.body, secret);
}