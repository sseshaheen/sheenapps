/**
 * Shared HMAC helper functions for routes that haven't migrated to middleware yet
 * These use the CORRECT v1 format: timestamp + body (NOT body + path)
 */

import { createHmac } from 'crypto';

/**
 * Verify HMAC v1 signature using the correct format
 * @param body - Request body as string
 * @param timestamp - Request timestamp from x-sheen-timestamp header
 * @param signature - Signature from x-sheen-signature header
 * @param secret - Shared secret key
 * @returns true if signature is valid
 */
export function verifyHMACv1(
  body: string,
  timestamp: string,
  signature: string,
  secret: string
): boolean {
  // CORRECT v1 format: timestamp + body (NO path!)
  const canonical = timestamp + body;
  const expected = createHmac('sha256', secret).update(canonical).digest('hex');
  
  // Use timing-safe comparison
  if (signature.length !== expected.length) {
    return false;
  }
  
  let mismatch = 0;
  for (let i = 0; i < signature.length; i++) {
    mismatch |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  
  return mismatch === 0;
}

/**
 * Validate timestamp is within acceptable range (±2 minutes)
 * @param timestamp - Unix timestamp in seconds as string
 * @returns true if timestamp is valid
 */
export function validateTimestamp(timestamp: string): boolean {
  const now = Math.floor(Date.now() / 1000);
  const requestTime = parseInt(timestamp, 10);
  
  if (isNaN(requestTime)) {
    return false;
  }
  
  const skew = Math.abs(now - requestTime);
  return skew <= 120; // 2 minutes tolerance
}