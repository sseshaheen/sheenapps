/**
 * Fastify TypeScript Declarations for Raw Body Access
 *
 * Extends Fastify types to support raw body access for webhook signature verification
 */

import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: string | Buffer;
  }

  interface FastifyContextConfig {
    rawBody?: boolean;
  }
}
