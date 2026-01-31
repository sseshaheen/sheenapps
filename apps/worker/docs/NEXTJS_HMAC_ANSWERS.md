# 🔍 HMAC Signature Investigation - Answers from Worker Team

**Date**: August 9, 2025  
**Status**: CRITICAL ISSUES FOUND

## 🚨 Issues Found

### 1. **WRONG Header Name for v2**
- ❌ You're sending: `x-sheen-signature-v2`
- ✅ Worker expects: `x-sheen-sig-v2` (without the "ature" part)

### 2. **Secret Format - Use RAW String**
- The secret is: `9Q6WWhZP3AlrhpdDwy3tC0bPtZSYAeJMAkdPzXFl9xs=`
- ✅ **Use it AS-IS** - it's already a raw string, NOT base64 encoded
- The trailing `=` is part of the actual secret, not base64 padding
- **DO NOT** base64 decode it

### 3. **v2 Signature Format**
- Worker expects the v2 signature as a **raw hex string**, NOT formatted with `t=,n=,s=`
- Just send the hex signature directly

## ✅ Correct Implementation

### Headers Required:
```javascript
{
  'x-sheen-signature': v1SignatureHex,     // v1 signature (hex string)
  'x-sheen-sig-v2': v2SignatureHex,        // v2 signature (hex string) - NOTE: NOT "signature-v2"!
  'x-sheen-timestamp': timestamp,          // Unix seconds as string
  'x-sheen-nonce': nonce                   // Random string
}
```

### For GET Request to `/v1/projects/.../versions`:

```javascript
const crypto = require('crypto');

// Configuration
const WORKER_SHARED_SECRET = '9Q6WWhZP3AlrhpdDwy3tC0bPtZSYAeJMAkdPzXFl9xs='; // Use AS-IS!

// For GET request
const body = '';  // Empty string for GET
const timestamp = Math.floor(Date.now() / 1000).toString();
const nonce = crypto.randomBytes(16).toString('hex');
const method = 'GET';
const path = '/v1/projects/34095156-1ffb-471e-b941-47207fa7448f/versions';

// v1 Signature: timestamp + body
const v1Canonical = timestamp + body;  // For GET: timestamp + '' = just timestamp
const v1Signature = crypto.createHmac('sha256', WORKER_SHARED_SECRET)
  .update(v1Canonical)
  .digest('hex');

// v2 Signature: METHOD\nPATH\nTIMESTAMP\nNONCE\nBODY
const v2Canonical = [
  method,      // 'GET'
  path,        // '/v1/projects/.../versions'
  timestamp,   // '1735689600'
  nonce,       // 'abc123...'
  body         // '' (empty for GET)
].join('\n');  // Join with newline characters

const v2Signature = crypto.createHmac('sha256', WORKER_SHARED_SECRET)
  .update(v2Canonical)
  .digest('hex');

// Send request
const response = await fetch(`${WORKER_BASE_URL}${path}`, {
  method: 'GET',
  headers: {
    'x-sheen-signature': v1Signature,      // Just the hex string
    'x-sheen-sig-v2': v2Signature,         // Just the hex string (NOT x-sheen-signature-v2!)
    'x-sheen-timestamp': timestamp,
    'x-sheen-nonce': nonce
  }
});
```

## Canonical Strings for Your Test Case

For GET `/v1/projects/34095156-1ffb-471e-b941-47207fa7448f/versions`:

### v1 Canonical:
```
1735689600
```
(Just the timestamp since body is empty)

### v2 Canonical:
```
GET
/v1/projects/34095156-1ffb-471e-b941-47207fa7448f/versions
1735689600
abc123def456
```
(Each line separated by `\n`, last line is empty body)

## Why You're Getting "version_checked": "none"

The worker isn't recognizing your signatures because:
1. **Wrong header name** - It's looking for `x-sheen-sig-v2` but you're sending `x-sheen-signature-v2`
2. **Wrong v2 format** - You're sending `t=...,n=...,s=...` but worker expects just the hex signature

## Complete Working Example

```javascript
async function makeAuthenticatedRequest(path, method = 'GET', body = '') {
  const crypto = require('crypto');
  
  // CRITICAL: Use the secret AS-IS
  const SECRET = '9Q6WWhZP3AlrhpdDwy3tC0bPtZSYAeJMAkdPzXFl9xs=';
  
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomBytes(16).toString('hex');
  
  // v1: timestamp + body
  const v1Signature = crypto.createHmac('sha256', SECRET)
    .update(timestamp + body)
    .digest('hex');
  
  // v2: METHOD\nPATH\nTIMESTAMP\nNONCE\nBODY
  const v2Canonical = [method, path, timestamp, nonce, body].join('\n');
  const v2Signature = crypto.createHmac('sha256', SECRET)
    .update(v2Canonical)
    .digest('hex');
  
  return fetch(`http://localhost:8081${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-sheen-signature': v1Signature,     // ✅ Correct header
      'x-sheen-sig-v2': v2Signature,        // ✅ Correct header (NOT signature-v2!)
      'x-sheen-timestamp': timestamp,
      'x-sheen-nonce': nonce
    },
    body: body || undefined
  });
}

// Test it
makeAuthenticatedRequest('/v1/projects/34095156-1ffb-471e-b941-47207fa7448f/versions')
  .then(res => res.json())
  .then(console.log)
  .catch(console.error);
```

## Summary of Fixes

1. ✅ Change header from `x-sheen-signature-v2` to `x-sheen-sig-v2`
2. ✅ Use the secret AS-IS (don't base64 decode)
3. ✅ Send v2 signature as plain hex string (not formatted)
4. ✅ For GET requests, use empty string for body in canonical strings

## Testing Your Fix

After making these changes, you should see:
- Status: 200 OK (not 403)
- Valid response data
- In logs: `"version_checked": "v1"` or `"version_checked": "v2"` or `"version_checked": "both"`

The worker is currently in dual-signature mode, so either v1 OR v2 working will authenticate successfully.