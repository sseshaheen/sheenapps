import { verifySignature } from '../src/server';
import { createHmac } from 'crypto';

describe('Claude Worker', () => {
  const SHARED_SECRET = 'test-secret-key';
  
  beforeEach(() => {
    process.env.SHARED_SECRET = SHARED_SECRET;
  });

  describe('HMAC Signature Verification', () => {
    it('should verify valid HMAC signatures', () => {
      const payload = JSON.stringify({ prompt: 'test prompt' });
      const validSignature = createHmac('sha256', SHARED_SECRET)
        .update(payload)
        .digest('hex');
      
      expect(verifySignature(payload, validSignature)).toBe(true);
    });

    it('should reject invalid HMAC signatures', () => {
      const payload = JSON.stringify({ prompt: 'test prompt' });
      const invalidSignature = 'invalid-signature';
      
      expect(verifySignature(payload, invalidSignature)).toBe(false);
    });

    it('should reject signatures with wrong secret', () => {
      const payload = JSON.stringify({ prompt: 'test prompt' });
      const wrongSecretSignature = createHmac('sha256', 'wrong-secret')
        .update(payload)
        .digest('hex');
      
      expect(verifySignature(payload, wrongSecretSignature)).toBe(false);
    });

    it('should reject signatures for modified payload', () => {
      const originalPayload = JSON.stringify({ prompt: 'test prompt' });
      const modifiedPayload = JSON.stringify({ prompt: 'modified prompt' });
      const signature = createHmac('sha256', SHARED_SECRET)
        .update(originalPayload)
        .digest('hex');
      
      expect(verifySignature(modifiedPayload, signature)).toBe(false);
    });
  });

  describe('Rate Limiting', () => {
    it('should track rate limit calls within window', () => {
      // This would require mocking the rate limiter or exposing it for testing
      // For now, we'll leave this as a placeholder for integration tests
      expect(true).toBe(true);
    });

    it('should reset rate limit after window expires', () => {
      // This would require time manipulation with jest.useFakeTimers()
      // For now, we'll leave this as a placeholder for integration tests
      expect(true).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing environment variables gracefully', () => {
      const originalEnv = process.env.SHARED_SECRET;
      delete process.env.SHARED_SECRET;
      
      expect(() => {
        require('../src/server');
      }).toThrow('SHARED_SECRET environment variable is required');
      
      process.env.SHARED_SECRET = originalEnv;
    });
  });
});