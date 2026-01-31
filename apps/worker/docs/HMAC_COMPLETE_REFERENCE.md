# 🔐 HMAC Authentication - Complete Reference

**Last Updated**: August 9, 2025  
**Status**: PRODUCTION READY

## ✅ Quick Start

### Correct Implementation (Copy This!)

```javascript
const crypto = require('crypto');

// CRITICAL: Use this exact secret AS-IS (do NOT base64 decode)
const WORKER_SHARED_SECRET = '9Q6WWhZP3AlrhpdDwy3tC0bPtZSYAeJMAkdPzXFl9xs=';

async function callWorkerAPI(path, method = 'GET', body = null) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomBytes(16).toString('hex');
  const bodyStr = body ? JSON.stringify(body) : '';
  
  // v1 Signature (REQUIRED)
  const v1Signature = crypto.createHmac('sha256', WORKER_SHARED_SECRET)
    .update(timestamp + bodyStr)
    .digest('hex');
  
  // v2 Signature (OPTIONAL but recommended)
  const v2Canonical = [method, path, timestamp, nonce, bodyStr].join('\n');
  const v2Signature = crypto.createHmac('sha256', WORKER_SHARED_SECRET)
    .update(v2Canonical)
    .digest('hex');
  
  const response = await fetch(`http://localhost:8081${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-sheen-signature': v1Signature,     // ✅ CORRECT header name
      'x-sheen-sig-v2': v2Signature,        // ✅ CORRECT (NOT signature-v2!)
      'x-sheen-timestamp': timestamp,
      'x-sheen-nonce': nonce
    },
    body: bodyStr || undefined
  });
  
  return response;
}

// Examples
await callWorkerAPI('/v1/projects/123/versions', 'GET');
await callWorkerAPI('/v1/chat-plan', 'POST', { userId: 'u123', message: 'Help' });
```

## 📋 Header Reference

| Header | Required | Format | Example |
|--------|----------|--------|---------|
| `x-sheen-signature` | Yes (v1) | Hex string | `a1b2c3d4...` |
| `x-sheen-sig-v2` | Optional | Hex string | `e5f6g7h8...` |
| `x-sheen-timestamp` | Yes | Unix seconds string | `"1735689600"` |
| `x-sheen-nonce` | Recommended | Random string | `"abc123def456"` |

## 🔴 Common Mistakes to Avoid

### ❌ WRONG Header Names
```javascript
// ❌ WRONG
'x-sheen-signature-v2': v2Signature  // This won't work!

// ✅ CORRECT
'x-sheen-sig-v2': v2Signature        // Note: sig-v2, not signature-v2
```

### ❌ WRONG Secret Handling
```javascript
// ❌ WRONG - Don't decode!
const secret = Buffer.from(WORKER_SHARED_SECRET, 'base64').toString();

// ✅ CORRECT - Use AS-IS
const secret = WORKER_SHARED_SECRET;  // The trailing = is part of the secret!
```

### ❌ WRONG Canonical Format
```javascript
// ❌ WRONG v1 formats
const canonical = body + path;           // Old incorrect format
const canonical = body + timestamp;      // Wrong order

// ✅ CORRECT v1 format
const canonical = timestamp + body;      // Always timestamp first!
```

### ❌ WRONG v2 Format
```javascript
// ❌ WRONG - Don't use formatted string
headers['x-sheen-sig-v2'] = `t=${timestamp},n=${nonce},s=${signature}`;

// ✅ CORRECT - Just the hex signature
headers['x-sheen-sig-v2'] = signature;  // Plain hex string
```

## 📊 Signature Format Details

### v1 Signature (Simple, Fast)
```
Canonical String: timestamp + body
Example GET:      "1735689600" + ""  = "1735689600"
Example POST:     "1735689600" + '{"user":"123"}'
```

### v2 Signature (Secure, Recommended)
```
Canonical String: METHOD\nPATH\nTIMESTAMP\nNONCE\nBODY
Example GET:      "GET\n/v1/projects/123\n1735689600\nabc123\n"
Example POST:     "POST\n/v1/chat-plan\n1735689600\nabc123\n{\"user\":\"123\"}"
```

## 🧪 Testing Your Implementation

### 1. Test with Postman
- Import the updated collection: `POSTMAN_SheenApps-Claude_Worker_API.postman_collection-2-Aug-2025.json`
- Set the `sharedSecret` variable to: `9Q6WWhZP3AlrhpdDwy3tC0bPtZSYAeJMAkdPzXFl9xs=`
- Run the "Test HMAC Signatures" request

### 2. Test with cURL
```bash
# Generate test values
TIMESTAMP=$(date +%s)
NONCE=$(openssl rand -hex 16)
BODY='{"test":"data"}'

# Calculate v1 signature
V1_CANONICAL="${TIMESTAMP}${BODY}"
V1_SIG=$(echo -n "$V1_CANONICAL" | openssl dgst -sha256 -hmac '9Q6WWhZP3AlrhpdDwy3tC0bPtZSYAeJMAkdPzXFl9xs=' -hex | cut -d' ' -f2)

# Make request
curl -X POST http://localhost:8081/v1/admin/hmac/test-signature \
  -H "Content-Type: application/json" \
  -H "x-sheen-signature: $V1_SIG" \
  -H "x-sheen-timestamp: $TIMESTAMP" \
  -H "x-sheen-nonce: $NONCE" \
  -d "$BODY"
```

### 3. Expected Success Response
```json
{
  "valid": true,
  "version": "v1",  // or "v2" or "both"
  "message": "Signature validation successful"
}
```

## 🚨 Error Codes

| Status | Error | Solution |
|--------|-------|----------|
| 401 | Missing signature headers | Add required headers |
| 403 | Invalid signature | Check canonical format and secret |
| 408 | Timestamp out of range | Use current Unix timestamp in seconds |
| 409 | Replay attack detected | Use unique nonce for each request |

## 📚 Resources

- **API Reference**: `/docs/API_REFERENCE_FOR_NEXTJS.md`
- **Postman Collection**: `/docs/POSTMAN_SheenApps-Claude_Worker_API.postman_collection-2-Aug-2025.json`
- **NextJS Migration Guide**: `/docs/NEXTJS_V1_MIGRATION_GUIDE.md`
- **Security Audit**: `/SECURITY_AUDIT.md`

## ✅ Checklist for NextJS Team

- [ ] Use header `x-sheen-sig-v2` (NOT `x-sheen-signature-v2`)
- [ ] Use secret AS-IS: `9Q6WWhZP3AlrhpdDwy3tC0bPtZSYAeJMAkdPzXFl9xs=`
- [ ] v1 canonical: `timestamp + body`
- [ ] v2 canonical: `METHOD\nPATH\nTIMESTAMP\nNONCE\nBODY`
- [ ] Send signatures as plain hex strings
- [ ] Use Unix timestamp in seconds (not milliseconds)
- [ ] Generate unique nonce for each request

---

**Support**: If still having issues after following this guide, check the server logs for specific validation errors. The response body includes debugging information in development mode.