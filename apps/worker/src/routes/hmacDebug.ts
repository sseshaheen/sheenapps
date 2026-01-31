import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { HmacSignatureService } from '../services/hmacSignatureService';

export function registerHmacDebugRoutes(fastify: FastifyInstance) {
  const hmacService = HmacSignatureService.getInstance();

  // Debug endpoint to show what headers are received
  fastify.get('/v1/debug/headers', async (request: FastifyRequest, reply: FastifyReply) => {
    // Block this endpoint in production
    if (process.env.NODE_ENV === 'production') {
      return reply.code(404).send({ error: 'Not found' });
    }

    // This endpoint intentionally bypasses HMAC to debug
    const headers: any = {};
    
    // Get all headers
    for (const [key, value] of Object.entries(request.headers)) {
      headers[key] = value;
    }
    
    // Get the expected signatures
    const timestamp = request.headers['x-sheen-timestamp'] as string || '';
    const nonce = request.headers['x-sheen-nonce'] as string || '';
    const body = '';  // GET request
    
    // Generate what we expect
    const expectedV1 = hmacService.generateV1Signature(body, timestamp);
    const expectedV2 = hmacService.generateV2Signature(
      body,
      timestamp,
      request.method,
      request.url,
      nonce
    );
    
    return reply.send({
      received_headers: headers,
      hmac_headers: {
        'x-sheen-signature': request.headers['x-sheen-signature'] || 'NOT FOUND',
        'x-sheen-sig-v2': request.headers['x-sheen-sig-v2'] || 'NOT FOUND',
        'x-sheen-timestamp': timestamp || 'NOT FOUND',
        'x-sheen-nonce': nonce || 'NOT FOUND'
      },
      request_info: {
        method: request.method,
        url: request.url,
        path: request.url.split('?')[0],
        query: request.url.includes('?') ? request.url.split('?')[1] : null
      },
      expected_signatures: {
        v1: expectedV1,
        v2: expectedV2.signature,
        v2_canonical: expectedV2.canonicalPayload.split('\n').map((line, i) => {
          const labels = ['METHOD', 'PATH', 'TIMESTAMP', 'NONCE', 'BODY'];
          return `${labels[i]}: "${line}"`;
        })
      },
      secret_info: {
        using_shared_secret: !!process.env.SHARED_SECRET,
        using_hmac_secret: !!process.env.HMAC_SECRET,
        secret_length: (process.env.SHARED_SECRET || process.env.HMAC_SECRET || '').length
      }
    });
  });

  // Test endpoint for /v1/projects/:projectId/versions
  fastify.get('/v1/debug/test-versions-auth', async (request: FastifyRequest, reply: FastifyReply) => {
    // Block this endpoint in production
    if (process.env.NODE_ENV === 'production') {
      return reply.code(404).send({ error: 'Not found' });
    }

    const projectId = '34095156-1ffb-471e-b941-47207fa7448f';
    const path = `/v1/projects/${projectId}/versions?state=all&limit=1&offset=0&includePatches=true&showDeleted=false`;
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = 'test-nonce-123';
    const body = '';
    
    const v1Sig = hmacService.generateV1Signature(body, timestamp);
    const v2Result = hmacService.generateV2Signature(body, timestamp, 'GET', path, nonce);
    
    return reply.send({
      test_case: 'GET /v1/projects/:projectId/versions with query params',
      curl_command: `curl -X GET "http://localhost:8081${path}" \\
  -H "x-sheen-signature: ${v1Sig}" \\
  -H "x-sheen-sig-v2: ${v2Result.signature}" \\
  -H "x-sheen-timestamp: ${timestamp}" \\
  -H "x-sheen-nonce: ${nonce}"`,
      signatures: {
        v1: {
          canonical: `"${timestamp}${body}"`,
          signature: v1Sig
        },
        v2: {
          canonical_parts: v2Result.canonicalPayload.split('\n'),
          canonical_full: v2Result.canonicalPayload,
          signature: v2Result.signature
        }
      },
      secret_used: process.env.SHARED_SECRET || process.env.HMAC_SECRET || 'NO SECRET FOUND'
    });
  });

  // Debug endpoint for presence POST signature validation
  fastify.post('/v1/debug/presence-signatures', async (request: FastifyRequest, reply: FastifyReply) => {
    // Block this endpoint in production
    if (process.env.NODE_ENV === 'production') {
      return reply.code(404).send({ error: 'Not found' });
    }

    try {
      const body = JSON.stringify(request.body || {});
      const timestamp = request.headers['x-sheen-timestamp'] as string || '';
      const nonce = request.headers['x-sheen-nonce'] as string || '';
      const receivedV1 = request.headers['x-sheen-signature'] as string || '';
      const receivedV2 = request.headers['x-sheen-sig-v2'] as string || '';
      
      // Simulate the presence endpoint path
      const testProjectId = 'e422411e-2057-4a2b-8613-9bdb75cc9e91';
      const presencePath = `/v1/projects/${testProjectId}/chat/presence`;
      
      // Generate expected signatures
      const expectedV1 = hmacService.generateV1Signature(body, timestamp);
      const expectedV2 = hmacService.generateV2Signature(
        body,
        timestamp,
        'POST',
        presencePath,
        nonce
      );

      // Manual validation to show step-by-step
      const v1Valid = receivedV1 === expectedV1;
      const v2Valid = receivedV2 === expectedV2.signature;

      return reply.send({
        debug_info: 'POST presence signature validation debug',
        request_details: {
          method: 'POST',
          path: presencePath,
          body_length: body.length,
          body: body,
          timestamp,
          nonce
        },
        received_signatures: {
          v1: receivedV1 || 'MISSING',
          v2: receivedV2 || 'MISSING'
        },
        expected_signatures: {
          v1: {
            canonical_input: `"${timestamp}${body}"`,
            signature: expectedV1,
            matches: v1Valid
          },
          v2: {
            canonical_parts: expectedV2.canonicalPayload.split('\n').map((line, i) => {
              const labels = ['METHOD', 'PATH', 'TIMESTAMP', 'NONCE', 'BODY'];
              return `${labels[i]}: "${line}"`;
            }),
            canonical_full: expectedV2.canonicalPayload,
            signature: expectedV2.signature,
            matches: v2Valid
          }
        },
        validation_results: {
          v1_valid: v1Valid,
          v2_valid: v2Valid,
          overall_valid: v1Valid || v2Valid
        },
        secret_info: {
          v1_secret_source: process.env.SHARED_SECRET ? 'SHARED_SECRET' : (process.env.HMAC_SECRET ? 'HMAC_SECRET' : 'DEFAULT'),
          v1_secret_length: (process.env.SHARED_SECRET || process.env.HMAC_SECRET || 'default-secret-change-me').length,
          v2_secret_source: process.env.HMAC_SECRET_V2 ? 'HMAC_SECRET_V2' : 'FALLBACK_TO_V1',
          using_same_secret_for_both: !process.env.HMAC_SECRET_V2
        }
      });
    } catch (error) {
      return reply.code(500).send({
        error: 'Debug endpoint failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
    }
  });
}