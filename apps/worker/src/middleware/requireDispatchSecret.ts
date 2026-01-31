import type { FastifyReply, FastifyRequest } from 'fastify';
import { timingSafeEqual } from 'crypto';

export function requireDispatchSecret() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const hasDispatchContext =
      typeof request.headers['x-sheenapps-project-id'] === 'string' ||
      typeof request.headers['x-sheenapps-original-host'] === 'string' ||
      request.headers['x-sheenapps-dispatch-mode'] === 'fallback';

    if (!hasDispatchContext) return;

    const headerKey = (process.env.DISPATCH_SHARED_HEADER || 'x-sheenapps-dispatch-secret').toLowerCase();
    const provided = request.headers[headerKey];
    const expected = process.env.DISPATCH_SHARED_SECRET || process.env.SHARED_SECRET;

    if (!expected) {
      request.log.error('Dispatch secret not configured');
      reply.code(503).send({ error: 'Dispatch authentication not configured' });
      return;
    }

    if (typeof provided !== 'string') {
      reply.code(401).send({ error: 'Dispatch authentication failed' });
      return;
    }

    const expectedBuf = Buffer.from(expected);
    const providedBuf = Buffer.from(provided);
    if (expectedBuf.length !== providedBuf.length || !timingSafeEqual(expectedBuf, providedBuf)) {
      reply.code(401).send({ error: 'Dispatch authentication failed' });
      return;
    }
  };
}
