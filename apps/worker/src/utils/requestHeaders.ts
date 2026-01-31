/**
 * Request header utilities for consistent header extraction across the codebase
 */

import { FastifyRequest } from 'fastify';

/**
 * Extracts idempotency key from request headers
 *
 * Fastify automatically normalizes all HTTP headers to lowercase,
 * so we only need to check the lowercase variants.
 *
 * Checks in order:
 * 1. idempotency-key (standard header)
 * 2. x-idempotency-key (legacy Stripe-style header)
 * 3. Falls back to provided default or undefined
 *
 * @param request - Fastify request object
 * @param fallback - Optional fallback value if no idempotency key found
 * @returns The idempotency key string or fallback value
 */
export function getIdempotencyKey(request: FastifyRequest, fallback?: string): string | undefined {
  // Fastify normalizes headers to lowercase, so we only check lowercase variants
  const key = request.headers['idempotency-key'] || request.headers['x-idempotency-key'];

  if (typeof key === 'string' && key.length > 0) {
    return key;
  }

  return fallback;
}
