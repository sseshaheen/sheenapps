import { FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';

/**
 * Correlation ID Middleware
 * 
 * Ensures every request has a correlation ID for tracing and audit purposes:
 * - Validates incoming X-Correlation-Id header (must be valid UUID)
 * - Generates new UUID if missing or invalid
 * - Attaches to request object for downstream use
 * - Always echoes back in response header and JSON body
 */

declare module 'fastify' {
  interface FastifyRequest {
    correlationId: string;
  }
}

/**
 * Validates if a string is a valid UUID v4
 */
function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Correlation ID middleware for Fastify
 * Sets correlationId on request object and ensures response header is set
 */
export async function correlationIdMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Get correlation ID from header (case-insensitive)
  const incomingCorrelationId = (
    request.headers['X-Correlation-Id'] || 
    request.headers['x-correlation-id']
  ) as string;
  
  // Validate and use existing ID or generate new one
  const correlationId = (incomingCorrelationId && isValidUUID(incomingCorrelationId))
    ? incomingCorrelationId
    : randomUUID();
  
  // Attach to request for downstream handlers
  request.correlationId = correlationId;
  
  // Always echo back in response header
  reply.header('X-Correlation-Id', correlationId);
}

/**
 * Helper function to ensure correlation ID is included in JSON responses
 * Use this in your route handlers to include correlation_id in response body
 */
export function withCorrelationId(
  data: Record<string, any>, 
  request: FastifyRequest
): Record<string, any> {
  return {
    ...data,
    correlation_id: request.correlationId
  };
}

/**
 * Helper function for standardized admin error responses
 */
export function adminErrorResponse(
  request: FastifyRequest,
  error: string,
  details?: string
): {
  success: false;
  error: string;
  correlation_id: string;
  details?: string;
} {
  const response: any = {
    success: false,
    error,
    correlation_id: request.correlationId
  };
  
  if (details) {
    response.details = details;
  }
  
  return response;
}