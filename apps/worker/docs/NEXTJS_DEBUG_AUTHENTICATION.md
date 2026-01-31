# 🔍 Authentication Debug Guide for NextJS Team

**Date**: August 9, 2025  
**Issue**: `/v1/projects/.../versions` endpoint returning 403

## 🚨 Critical Finding: Query Parameter Ordering

The worker's v2 signature **SORTS query parameters alphabetically**! This might be causing the mismatch.

### For v2 with Query Parameters:

The path `/v1/projects/.../versions?state=all&limit=1&offset=0&includePatches=true&showDeleted=false` becomes:

**Canonical path in v2**: `/v1/projects/.../versions?includePatches=true&limit=1&offset=0&showDeleted=false&state=all`

Note how the parameters are alphabetically sorted!

## 🧪 Debug Endpoints Created

### 1. Check What Headers Worker Receives

```bash
curl -X GET "http://localhost:8081/v1/debug/headers" \
  -H "x-sheen-signature: test" \
  -H "x-sheen-sig-v2: test" \
  -H "x-sheen-timestamp: $(date +%s)" \
  -H "x-sheen-nonce: test123"
```

This will show:
- All headers received by the worker
- Expected signatures
- Secret being used

### 2. Get Working Example for Versions Endpoint

```bash
curl -X GET "http://localhost:8081/v1/debug/test-versions-auth"
```

This returns a complete working curl command with valid signatures.

## ✅ Correct Implementation for Query Parameters

```javascript
const crypto = require('crypto');

// CRITICAL: Use this exact secret AS-IS
const SECRET = '9Q6WWhZP3AlrhpdDwy3tC0bPtZSYAeJMAkdPzXFl9xs=';

function signRequest(method, path, body = '') {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomBytes(16).toString('hex');
  
  // v1: Simple, doesn't care about query params
  const v1Signature = crypto.createHmac('sha256', SECRET)
    .update(timestamp + body)
    .digest('hex');
  
  // v2: MUST sort query parameters!
  let canonicalPath = path;
  if (path.includes('?')) {
    const [basePath, queryString] = path.split('?');
    const params = new URLSearchParams(queryString);
    const sortedParams = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b));
    canonicalPath = basePath + '?' + new URLSearchParams(sortedParams).toString();
  }
  
  const v2Canonical = [
    method,
    canonicalPath,  // Path with SORTED query params
    timestamp,
    nonce,
    body
  ].join('\n');
  
  const v2Signature = crypto.createHmac('sha256', SECRET)
    .update(v2Canonical)
    .digest('hex');
  
  return {
    headers: {
      'x-sheen-signature': v1Signature,
      'x-sheen-sig-v2': v2Signature,
      'x-sheen-timestamp': timestamp,
      'x-sheen-nonce': nonce
    },
    debug: {
      v1_canonical: timestamp + body,
      v2_canonical: v2Canonical,
      sorted_path: canonicalPath
    }
  };
}

// Test the problematic endpoint
const result = signRequest(
  'GET',
  '/v1/projects/34095156-1ffb-471e-b941-47207fa7448f/versions?state=all&limit=1&offset=0&includePatches=true&showDeleted=false'
);

console.log('Headers to send:', result.headers);
console.log('Debug info:', result.debug);
```

## 🔴 Common Issues

### 1. Query Parameter Order (v2 only)
- ❌ WRONG: `?state=all&limit=1&offset=0`
- ✅ CORRECT: `?limit=1&offset=0&state=all` (alphabetically sorted)

### 2. Header Names
- ❌ WRONG: `x-sheen-signature-v2`
- ✅ CORRECT: `x-sheen-sig-v2`

### 3. Secret Format
- ❌ WRONG: Base64 decode the secret
- ✅ CORRECT: Use AS-IS: `9Q6WWhZP3AlrhpdDwy3tC0bPtZSYAeJMAkdPzXFl9xs=`

## 🎯 Quick Test

Try using ONLY v1 signature first (it's simpler and doesn't care about query params):

```javascript
const SECRET = '9Q6WWhZP3AlrhpdDwy3tC0bPtZSYAeJMAkdPzXFl9xs=';
const timestamp = Math.floor(Date.now() / 1000).toString();
const v1Sig = crypto.createHmac('sha256', SECRET)
  .update(timestamp + '')  // Empty body for GET
  .digest('hex');

fetch('http://localhost:8081/v1/projects/34095156-1ffb-471e-b941-47207fa7448f/versions?state=all', {
  headers: {
    'x-sheen-signature': v1Sig,
    'x-sheen-timestamp': timestamp,
    'x-sheen-nonce': 'any-random-string'
  }
})
```

## 📊 What the Worker Expects

For GET `/v1/projects/34095156-1ffb-471e-b941-47207fa7448f/versions?state=all&limit=1&offset=0&includePatches=true&showDeleted=false`:

### v1 Canonical:
```
1754739455
```
(Just timestamp, since body is empty)

### v2 Canonical (WITH SORTED PARAMS):
```
GET
/v1/projects/34095156-1ffb-471e-b941-47207fa7448f/versions?includePatches=true&limit=1&offset=0&showDeleted=false&state=all
1754739455
abc123def456

```
(Note the empty line at the end for empty body)

## 🚀 Next Steps

1. **Run the debug endpoint** to see what headers the worker receives:
   ```bash
   curl http://localhost:8081/v1/debug/headers
   ```

2. **Get a working example**:
   ```bash
   curl http://localhost:8081/v1/debug/test-versions-auth
   ```

3. **Try with ONLY v1** (simpler, no query param sorting needed)

4. **If using v2**, make sure to sort query parameters alphabetically

The debug endpoints will tell us:
- If headers are being stripped
- What secret is actually being used
- The exact canonical strings expected

This should resolve the authentication issue!