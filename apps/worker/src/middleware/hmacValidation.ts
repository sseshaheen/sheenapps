import { FastifyRequest, FastifyReply } from 'fastify';
import { HmacSignatureService, SignatureHeaders } from '../services/hmacSignatureService';
import { ServerLoggingService } from '../services/serverLoggingService';

/**
 * HMAC Signature Validation Middleware
 * Integrates dual signature validation into Fastify routes
 * Supports safe rollout from v1 to v2 signatures
 */

interface HmacValidationOptions {
  required?: boolean;                    // Whether HMAC validation is required
  skipPaths?: string[];                  // Paths to skip validation
  skipMethods?: string[];                // HTTP methods to skip
  allowTestSignatures?: boolean;         // Allow test signatures in development
  logFailures?: boolean;                // Log failed validations
  blockOnFailure?: boolean;             // Block requests on validation failure
}

export function createHmacValidationMiddleware(options: HmacValidationOptions = {}) {
  const {
    required = true,
    skipPaths = [],
    skipMethods = ['OPTIONS', 'HEAD'],
    allowTestSignatures = process.env.NODE_ENV === 'development',
    logFailures = true,
    blockOnFailure = true
  } = options;

  const hmacService = HmacSignatureService.getInstance();
  const loggingService = ServerLoggingService.getInstance();

  return async function hmacValidationMiddleware(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Skip validation for configured paths and methods
      if (skipPaths.includes(request.url) || skipMethods.includes(request.method)) {
        return;
      }
      
      // Extract signature headers
      const headers: SignatureHeaders = {
        'x-sheen-signature': request.headers['x-sheen-signature'] as string,
        'x-sheen-sig-v2': request.headers['x-sheen-sig-v2'] as string,
        'x-sheen-timestamp': request.headers['x-sheen-timestamp'] as string,
        'x-sheen-nonce': request.headers['x-sheen-nonce'] as string
      };
      
      // Check if any signature headers are present
      const hasSignatureHeaders = !!(headers['x-sheen-signature'] || headers['x-sheen-sig-v2']);
      
      if (!hasSignatureHeaders) {
        if (required) {
          if (logFailures) {
            await loggingService.logServerEvent(
              'error',
              'warn',
              'HMAC validation required but no signature headers found',
              {
                method: request.method,
                path: request.url,
                userAgent: request.headers['user-agent'],
                ip: request.ip
              }
            );
          }
          
          if (blockOnFailure) {
            return reply.code(401).send({
              error: 'Missing signature headers',
              code: 'MISSING_SIGNATURE',
              required_headers: ['x-sheen-timestamp', 'x-sheen-signature OR x-sheen-sig-v2'],
              timestamp: new Date().toISOString()
            });
          }
        }
        return; // Skip validation if not required
      }
      
      // Get request payload
      const payload = await getRequestPayload(request);
      
      // Validate signature
      const validationResult = await hmacService.validateSignature(
        payload,
        headers,
        request.method,
        request.url
      );
      
      // Handle test signatures in development
      if (!validationResult.valid && allowTestSignatures && isTestSignature(headers)) {
        validationResult.valid = true;
        validationResult.warnings = validationResult.warnings || [];
        validationResult.warnings.push('Test signature accepted in development mode');
      }
      
      // Log validation result
      if (logFailures || !validationResult.valid) {
        const level = validationResult.valid ? 'info' : 'error';
        const message = `HMAC validation ${validationResult.valid ? 'SUCCESS' : 'FAILURE'}`;
        
        await loggingService.logServerEvent(
          'capacity',
          level,
          message,
          {
            method: request.method,
            path: request.url,
            signatureVersion: validationResult.version,
            timestampSkew: validationResult.timestamp.skew,
            nonceValid: validationResult.nonce.valid,
            warnings: validationResult.warnings,
            durationMs: Date.now() - startTime,
            ip: request.ip,
            userAgent: request.headers['user-agent']
          }
        );
      }
      
      // Handle validation failure
      if (!validationResult.valid && blockOnFailure) {
        const errorDetails = {
          error: 'Signature validation failed',
          code: 'INVALID_SIGNATURE',
          details: {
            version_checked: validationResult.version,
            timestamp_valid: validationResult.timestamp.valid,
            timestamp_skew: validationResult.timestamp.skew,
            nonce_valid: validationResult.nonce.valid
          },
          warnings: validationResult.warnings,
          rollout_info: hmacService.getRolloutStatus(),
          timestamp: new Date().toISOString()
        };
        
        // Different status codes based on the type of failure
        if (!validationResult.timestamp.valid) {
          return reply.code(408).send({ ...errorDetails, code: 'TIMESTAMP_OUT_OF_RANGE' });
        }
        
        if (!validationResult.nonce.valid) {
          return reply.code(409).send({ ...errorDetails, code: 'REPLAY_ATTACK_DETECTED' });
        }
        
        return reply.code(403).send(errorDetails);
      }
      
      // Add validation info to request for downstream use
      (request as any).hmacValidation = {
        valid: validationResult.valid,
        version: validationResult.version,
        timestamp: validationResult.timestamp.value,
        nonce: validationResult.nonce.value,
        warnings: validationResult.warnings
      };
      
    } catch (error) {
      await loggingService.logCriticalError(
        'hmac_middleware_error',
        error as Error,
        {
          method: request.method,
          path: request.url,
          hasHeaders: !!(request.headers['x-sheen-signature'] || request.headers['x-sheen-sig-v2'])
        }
      );
      
      if (blockOnFailure) {
        return reply.code(500).send({
          error: 'Signature validation error',
          code: 'VALIDATION_ERROR',
          timestamp: new Date().toISOString()
        });
      }
    }
  };
}

/**
 * Extract request payload for signature validation
 */
async function getRequestPayload(request: FastifyRequest): Promise<string> {
  if (request.method === 'GET' || request.method === 'DELETE') {
    // For GET/DELETE, the body is always empty for HMAC signatures
    // The path and query params are handled separately in v2 signatures
    return '';
  }
  
  // For POST/PUT/PATCH, use request body
  if (request.body) {
    if (typeof request.body === 'string') {
      return request.body;
    }
    
    // CRITICAL FIX: Access raw body string to preserve exact JSON formatting
    // The frontend creates signatures using the original JSON string, 
    // but JSON.stringify() changes property order, causing signature mismatch
    if ((request as any).rawBody && typeof (request as any).rawBody === 'string') {
      return (request as any).rawBody;
    }
    
    // Fallback to serialization (but this might not match frontend exactly)
    return JSON.stringify(request.body);
  }
  
  return '';
}

/**
 * Check if signature appears to be a test signature
 */
function isTestSignature(headers: SignatureHeaders): boolean {
  const testPatterns = [
    'test_signature',
    'dev_signature',
    '0000000000000000000000000000000000000000000000000000000000000000' // 64 zeros
  ];
  
  return testPatterns.some(pattern => 
    headers['x-sheen-signature']?.includes(pattern) ||
    headers['x-sheen-sig-v2']?.includes(pattern)
  );
}

/**
 * Create route-specific HMAC validation with custom options
 */
export function requireHmacSignature(customOptions: Partial<HmacValidationOptions> = {}) {
  return createHmacValidationMiddleware({
    required: true,
    blockOnFailure: true,
    ...customOptions
  });
}

/**
 * Create optional HMAC validation (logs but doesn't block)
 */
export function optionalHmacSignature(customOptions: Partial<HmacValidationOptions> = {}) {
  return createHmacValidationMiddleware({
    required: false,
    blockOnFailure: false,
    ...customOptions
  });
}

/**
 * Create HMAC validation for webhooks
 */
export function webhookHmacValidation(customOptions: Partial<HmacValidationOptions> = {}) {
  return createHmacValidationMiddleware({
    required: true,
    blockOnFailure: true,
    skipMethods: [], // Validate all methods for webhooks
    allowTestSignatures: false, // Never allow test signatures for webhooks
    ...customOptions
  });
}