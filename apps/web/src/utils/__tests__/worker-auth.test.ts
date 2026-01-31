/**
 * Comprehensive test suite for Worker API HMAC authentication
 * Ensures all endpoints use consistent, correct signature format
 */

import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import {
  generateWorkerSignature,
  generateWorkerSignatureV2,
  createWorkerAuthHeaders,
  validateWorkerAuthEnvironment
} from '../worker-auth';

// Mock environment variables
const MOCK_SECRET = '9Q6WWhZP3AlrhpdDwy3tC0bPtZSYAeJMAkdPzXFl9xs=';

describe('Worker HMAC Authentication', () => {
  beforeEach(() => {
    process.env.WORKER_SHARED_SECRET = MOCK_SECRET;
    process.env.WORKER_BASE_URL = 'http://localhost:8081';
  });

  describe('generateWorkerSignature (v1)', () => {
    it('should use timestamp + body format (NO path)', () => {
      const timestamp = 1754736000;
      const body = '{"test":"data"}';
      
      // Generate signature using our function
      const signature = generateWorkerSignature(body, timestamp);
      
      // Manually verify the canonical string format
      const expectedCanonical = timestamp.toString() + body;
      const expectedSignature = crypto
        .createHmac('sha256', MOCK_SECRET)
        .update(expectedCanonical, 'utf8')
        .digest('hex');
      
      expect(signature).toBe(expectedSignature);
    });

    it('should handle empty body', () => {
      const timestamp = 1754736000;
      const body = '';
      
      const signature = generateWorkerSignature(body, timestamp);
      
      const expectedCanonical = timestamp.toString() + body;
      const expectedSignature = crypto
        .createHmac('sha256', MOCK_SECRET)
        .update(expectedCanonical, 'utf8')
        .digest('hex');
      
      expect(signature).toBe(expectedSignature);
    });

    it('should handle complex JSON body', () => {
      const timestamp = 1754736000;
      const body = JSON.stringify({
        userId: '123e4567-e89b-12d3-a456-426614174000',
        projectId: '456e7890-e89b-12d3-a456-426614174001',
        message: 'Test message with "quotes" and special chars: éñ',
        nested: {
          array: [1, 2, 3],
          bool: true
        }
      });
      
      const signature = generateWorkerSignature(body, timestamp);
      
      // Should not throw and should produce consistent output
      expect(signature).toHaveLength(64); // SHA256 hex is always 64 chars
    });
  });

  describe('generateWorkerSignatureV2', () => {
    it('should use METHOD\\nPATH\\nTIMESTAMP\\nNONCE\\nBODY format', () => {
      const method = 'POST';
      const path = '/v1/chat-plan';
      const timestamp = 1754736000;
      const nonce = 'test-nonce-123';
      const body = '{"test":"data"}';
      
      const signature = generateWorkerSignatureV2(method, path, timestamp, nonce, body);
      
      // Manually verify the canonical string format
      const expectedCanonical = [
        method.toUpperCase(),
        path,
        timestamp.toString(),
        nonce,
        body
      ].join('\n');
      
      const expectedSignature = crypto
        .createHmac('sha256', MOCK_SECRET)
        .update(expectedCanonical, 'utf8')
        .digest('hex');
      
      expect(signature).toBe(expectedSignature);
    });

    it('should uppercase the HTTP method', () => {
      const signature1 = generateWorkerSignatureV2('post', '/test', 123, 'nonce', '{}');
      const signature2 = generateWorkerSignatureV2('POST', '/test', 123, 'nonce', '{}');
      
      expect(signature1).toBe(signature2);
    });
  });

  describe('createWorkerAuthHeaders', () => {
    it('should generate all required headers', () => {
      const headers = createWorkerAuthHeaders('POST', '/v1/test', '{"test":true}');
      
      expect(headers).toHaveProperty('Content-Type', 'application/json');
      expect(headers).toHaveProperty('x-sheen-signature');
      expect(headers).toHaveProperty('x-sheen-sig-v2');
      expect(headers).toHaveProperty('x-sheen-timestamp');
      expect(headers).toHaveProperty('x-sheen-nonce');
    });

    it('should include v1 signature using timestamp+body format', () => {
      const body = '{"test":true}';
      const headers = createWorkerAuthHeaders('POST', '/v1/test', body);
      
      const timestamp = parseInt(headers['x-sheen-timestamp']);
      const expectedV1 = generateWorkerSignature(body, timestamp);
      
      expect(headers['x-sheen-signature']).toBe(expectedV1);
    });

    it('should include v2 signature as plain hex string', () => {
      const method = 'POST';
      const path = '/v1/test';
      const body = '{"test":true}';
      const headers = createWorkerAuthHeaders(method, path, body);
      
      // v2 header should be plain hex string
      const v2Header = headers['x-sheen-sig-v2'];
      const timestamp = parseInt(headers['x-sheen-timestamp']);
      const nonce = headers['x-sheen-nonce'];
      
      // Verify it's a hex string
      expect(v2Header).toMatch(/^[a-f0-9]{64}$/);
      
      // Verify it matches expected signature
      const expectedV2 = generateWorkerSignatureV2(
        method,
        path,
        timestamp,
        nonce,
        body
      );
      
      expect(v2Header).toBe(expectedV2);
    });

    it('should merge additional headers', () => {
      const headers = createWorkerAuthHeaders('GET', '/v1/test', '', {
        'X-Custom-Header': 'custom-value',
        'Accept': 'application/json'
      });
      
      expect(headers).toHaveProperty('X-Custom-Header', 'custom-value');
      expect(headers).toHaveProperty('Accept', 'application/json');
      expect(headers).toHaveProperty('x-sheen-signature');
    });
  });

  describe('validateWorkerAuthEnvironment', () => {
    it('should validate required environment variables', () => {
      process.env.WORKER_SHARED_SECRET = MOCK_SECRET;
      process.env.WORKER_BASE_URL = 'http://localhost:8081';
      
      const result = validateWorkerAuthEnvironment();
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should report missing WORKER_SHARED_SECRET', () => {
      delete process.env.WORKER_SHARED_SECRET;
      
      const result = validateWorkerAuthEnvironment();
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('WORKER_SHARED_SECRET environment variable is required');
    });

    it('should validate secret length', () => {
      process.env.WORKER_SHARED_SECRET = 'too-short';
      
      const result = validateWorkerAuthEnvironment();
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('WORKER_SHARED_SECRET should be at least 32 characters long');
    });

    it('should validate URL format', () => {
      process.env.WORKER_BASE_URL = 'not-a-valid-url';
      
      const result = validateWorkerAuthEnvironment();
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('WORKER_BASE_URL must be a valid URL');
    });
  });

  describe('Consistency Tests', () => {
    it('should generate different signatures for different timestamps', () => {
      const body = '{"test":"data"}';
      const sig1 = generateWorkerSignature(body, 1754736000);
      const sig2 = generateWorkerSignature(body, 1754736001);
      
      expect(sig1).not.toBe(sig2);
    });

    it('should generate different signatures for different bodies', () => {
      const timestamp = 1754736000;
      const sig1 = generateWorkerSignature('{"a":1}', timestamp);
      const sig2 = generateWorkerSignature('{"a":2}', timestamp);
      
      expect(sig1).not.toBe(sig2);
    });

    it('should generate consistent signatures for same inputs', () => {
      const body = '{"test":"data"}';
      const timestamp = 1754736000;
      
      const sig1 = generateWorkerSignature(body, timestamp);
      const sig2 = generateWorkerSignature(body, timestamp);
      
      expect(sig1).toBe(sig2);
    });
  });

  describe('Real-world Scenarios', () => {
    it('should handle billing check-sufficient request', () => {
      const body = JSON.stringify({
        userId: '123e4567-e89b-12d3-a456-426614174000',
        projectId: '456e7890-e89b-12d3-a456-426614174001',
        estimatedCost: 10,
        operationType: 'update'
      });
      
      const headers = createWorkerAuthHeaders('POST', '/v1/billing/check-sufficient', body);
      
      expect(headers['x-sheen-signature']).toBeTruthy();
      expect(headers['x-sheen-timestamp']).toBeTruthy();
      expect(headers['x-sheen-nonce']).toBeTruthy();
    });

    it('should handle chat-plan request', () => {
      const body = JSON.stringify({
        userId: '123e4567-e89b-12d3-a456-426614174000',
        projectId: '456e7890-e89b-12d3-a456-426614174001',
        message: 'How do I add dark mode?',
        locale: 'en',
        context: {}
      });
      
      const headers = createWorkerAuthHeaders('POST', '/v1/chat-plan', body);
      
      expect(headers['x-sheen-signature']).toBeTruthy();
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('should handle GET request with empty body', () => {
      const headers = createWorkerAuthHeaders('GET', '/v1/health', '');
      
      expect(headers['x-sheen-signature']).toBeTruthy();
      expect(headers['x-sheen-timestamp']).toBeTruthy();
    });

    it('should handle DELETE request', () => {
      const headers = createWorkerAuthHeaders('DELETE', '/v1/projects/123', '');
      
      expect(headers['x-sheen-signature']).toBeTruthy();
      expect(headers['x-sheen-signature-v2']).toBeTruthy();
    });
  });
});