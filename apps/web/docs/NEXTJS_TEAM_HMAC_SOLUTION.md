# 🎯 Solution for NextJS Team - HMAC v2 & Chat Plan Endpoint

## 🚨 CRITICAL: Your v1 Signature is WRONG!

### Your Current v1 (WRONG):
```javascript
const canonical = body + pathWithQuery;  // ❌ WRONG!
```

### Correct v1 Format:
```javascript
const canonical = timestamp + body;  // ✅ CORRECT!
// NO PATH IN v1!
```

This is why `/v1/chat-plan` returns 403 - your signature is invalid!

## Quick Answers

### 1. HMAC v2 Canonical String Format

The **correct** v2 canonical string format is:

```
METHOD\n
PATH\n
TIMESTAMP\n
NONCE\n
BODY
```

Where:
- `METHOD`: HTTP method in UPPERCASE (e.g., "POST")
- `PATH`: Full path including sorted query params (e.g., "/v1/chat-plan")
- `TIMESTAMP`: Unix timestamp in seconds as string
- `NONCE`: Random string for replay protection
- `BODY`: Raw JSON body string
- **Separator**: Newline character (`\n`) between each component

### Example v2 Canonical String:
```javascript
const canonicalString = [
  "POST",
  "/v1/chat-plan",
  "1735689600",
  "abc123def456",
  '{"userId":"123","projectId":"456","message":"test"}'
].join('\n');
```

### 2. Why /v1/chat-plan Returns 403

The endpoint IS deployed, but there are two issues:

**Issue 1**: HMAC v1 format is wrong in your test
- v1 format is: `${timestamp}${payload}` (NOT `${payload}${path}`)
- You're using: `body + path` ❌
- Should be: `timestamp + body` ✅

**Issue 2**: Missing SHARED_SECRET environment variable
- Your test uses: `9Q6WWhZP3AlrhpdDwy3tC0bPtZSYAeJMAkdPzXFl9xs=`
- Worker expects: Environment variable `SHARED_SECRET` or `HMAC_SECRET`

## Corrected Test Script

```javascript
const crypto = require('crypto');

// Configuration
const WORKER_SHARED_SECRET = process.env.SHARED_SECRET || 'your-actual-secret-here';

// CORRECT v1 signature
function generateHMACv1(body, timestamp) {
  // v1 format: timestamp + body (NO path!)
  const canonical = timestamp + body;
  return crypto.createHmac('sha256', WORKER_SHARED_SECRET)
    .update(canonical)
    .digest('hex');
}

// CORRECT v2 signature  
function generateHMACv2(body, method, path, timestamp, nonce) {
  // v2 format: METHOD\nPATH\nTIMESTAMP\nNONCE\nBODY
  const canonical = [
    method.toUpperCase(),
    path,
    timestamp,
    nonce || '',
    body
  ].join('\n');
  
  return crypto.createHmac('sha256', WORKER_SHARED_SECRET)
    .update(canonical)
    .digest('hex');
}

// Test chat-plan endpoint
async function testChatPlan() {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomBytes(16).toString('hex');
  const body = JSON.stringify({
    userId: "test-user",
    projectId: "test-project", 
    message: "How do I add dark mode?",
    locale: "en-US"
  });

  // Use v1 for now (v2 rollout in progress)
  const signature = generateHMACv1(body, timestamp);
  
  const response = await fetch('http://localhost:3000/v1/chat-plan', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-sheen-signature': signature,
      'x-sheen-timestamp': timestamp,
      'x-sheen-nonce': nonce
    },
    body: body
  });
  
  console.log('Status:', response.status);
  const result = await response.json();
  console.log('Response:', result);
}
```

## Current Worker Implementation Status

### ✅ What's Working:
- `/v1/chat-plan` endpoint is deployed and functional
- HMAC v1 validation is active
- v2 is supported but in rollout phase

### ⚠️ Important Notes:
1. **Use v1 for now**: v2 is in rollout, v1 is stable
2. **Timestamp in seconds**: Not milliseconds!
3. **No path in v1**: Just `timestamp + body`
4. **GET requests**: Use empty string for body in v1

## Migration Path

1. **Now**: Use v1 with correct format
2. **Optional**: Add v2 header (`x-sheen-sig-v2`) for dual signature
3. **Future**: Switch to v2 only after rollout complete

## Response to Your Specific Questions

1. **"What is the correct canonical format for v2?"**
   - `METHOD\nPATH\nTIMESTAMP\nNONCE\nBODY`

2. **"Is /v1/chat-plan deployed?"**
   - Yes, it's deployed and working

3. **"Why 403?"**
   - Wrong v1 signature format (using `body+path` instead of `timestamp+body`)
   - Possibly wrong shared secret

## Next Steps

1. Fix your v1 signature generation: `timestamp + body`
2. Ensure correct SHARED_SECRET value
3. Test with corrected script above
4. You should get 200 OK (or 402 for insufficient balance, not 403)

## Contact for Issues

If still having problems after these fixes:
- Check server logs for specific validation errors
- The 403 response includes `rollout_info` with debugging details
- Response body has specific error codes (INVALID_SIGNATURE, TIMESTAMP_OUT_OF_RANGE, etc.)