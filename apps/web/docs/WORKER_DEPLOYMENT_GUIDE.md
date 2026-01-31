# Worker Deployment Guide: Real-Time Transcription

**Part of**: OPENAI_TRANSCRIPTION_FALLBACK_PLAN.md
**Date**: 2026-01-17
**Estimated Setup Time**: 5-10 minutes

---

## Quick Start

This guide walks you through deploying the real-time transcription endpoint to your Fastify worker service.

### Prerequisites

- Access to worker service codebase
- OpenAI API key
- Worker shared secret (must match Next.js `WORKER_SHARED_SECRET`)
- Node.js 18+ (for Fastify)

---

## Step 1: Copy Implementation File

Copy the worker implementation file to your worker codebase:

```bash
# From this repo root
cp WORKER_REALTIME_TRANSCRIBE_IMPLEMENTATION.ts ../worker/src/routes/realtimeTranscription.ts

# Or if your worker uses a different structure:
cp WORKER_REALTIME_TRANSCRIBE_IMPLEMENTATION.ts /path/to/worker/routes/realtimeTranscription.ts
```

---

## Step 2: Install Dependencies

The endpoint requires these npm packages:

```bash
cd /path/to/worker
npm install @fastify/multipart form-data
```

**Dependencies**:
- `fastify` (already installed)
- `@fastify/multipart@^8.x` - For handling audio file uploads
- `form-data@^4.x` - For proxying to OpenAI

---

## Step 3: Register Route in Fastify App

Add the route registration to your main Fastify app file (usually `index.ts` or `app.ts`):

```typescript
// In worker/src/index.ts (or wherever you register routes)

import realtimeTranscriptionRoutes from './routes/realtimeTranscription';

// ... other route registrations

// Register real-time transcription endpoint
await app.register(realtimeTranscriptionRoutes);

console.log('✅ Real-time transcription endpoint registered at /v1/realtime/transcribe');
```

---

## Step 4: Add Environment Variables

Add these environment variables to your worker deployment:

### Required

```bash
# OpenAI API key for transcription
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxx

# Shared secret for HMAC validation
# Note: Worker uses SHARED_SECRET, which matches Next.js WORKER_SHARED_SECRET
SHARED_SECRET=your-32-char-random-secret-here
```

**Important**: The worker codebase uses `SHARED_SECRET` as the environment variable name. This should have the same value as `WORKER_SHARED_SECRET` in your Next.js deployment.

### Optional

```bash
# Model selection (defaults to gpt-4o-mini-transcribe)
OPENAI_TRANSCRIBE_MODEL=gpt-4o-mini-transcribe

# Redis URL for production rate limiting (recommended)
REDIS_URL=redis://localhost:6379
```

### How to Generate the Shared Secret

```bash
# Generate a secure 32-character secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**CRITICAL**: This secret must be the **exact same** in both environments:
- Next.js: Set as `WORKER_SHARED_SECRET`
- Worker: Set as `SHARED_SECRET`

---

## Step 5: Verify Deployment

### 5.1 Check Worker Logs

Start your worker and check for the registration log:

```
✅ Real-time transcription endpoint registered at /v1/realtime/transcribe
```

### 5.2 Test Health Check

If your worker has a health endpoint:

```bash
curl http://localhost:8081/health
# Should return 200 OK
```

### 5.3 Test Transcription Endpoint (Manual)

**Note**: This requires generating a valid HMAC signature. For easier testing, use the Next.js API route instead (see Step 6).

```bash
# Generate HMAC signature (Node.js)
node -e "
const crypto = require('crypto');
const secret = 'your-32-char-secret';
const timestamp = Math.floor(Date.now() / 1000);
const body = ''; // Empty for multipart
const signature = crypto.createHmac('sha256', secret).update(timestamp + body).digest('hex');
console.log('Timestamp:', timestamp);
console.log('Signature:', signature);
"

# Use output to test endpoint
curl -X POST http://localhost:8081/v1/realtime/transcribe \
  -H "x-sheen-signature: <signature-from-above>" \
  -H "x-sheen-timestamp: <timestamp-from-above>" \
  -F "audio=@test.webm" \
  -F "userId=test-user-123" \
  -F "language=ar"
```

Expected response: SSE stream with transcription events

```
data: {"type":"transcription","text":"مرحبا","isFinal":false,"requestId":"..."}

data: {"type":"transcription","text":"مرحبا بك","isFinal":true,"requestId":"..."}
```

---

## Step 6: Test End-to-End (Recommended)

The easiest way to test is through the Next.js app:

1. **Start both services**:
   ```bash
   # Terminal 1: Worker
   cd /path/to/worker
   npm run dev

   # Terminal 2: Next.js
   cd /path/to/nextjs
   npm run dev
   ```

2. **Verify environment variables**:
   ```bash
   # In Next.js .env.local
   WORKER_BASE_URL=http://localhost:8081
   WORKER_SHARED_SECRET=your-32-char-secret  # Next.js uses WORKER_SHARED_SECRET
   NEXT_PUBLIC_VOICE_PROVIDER_SYSTEM=true  # or omit (defaults to true)
   NEXT_PUBLIC_VOICE_REALTIME_TRANSCRIPTION=true

   # In Worker .env
   SHARED_SECRET=your-32-char-secret  # Worker uses SHARED_SECRET (same value)
   OPENAI_API_KEY=sk-proj-...
   ```

3. **Test in browser**:
   - Open Next.js app (http://localhost:3000)
   - Open voice recording modal
   - Click "Start Recording"
   - **Chrome/Edge**: Should see instant text (Web Speech)
   - **Safari/Firefox**: Should see text after ~1.5-2s delay (OpenAI via worker)

4. **Check logs**:
   - Next.js: Should see API requests to `/api/v1/realtime/transcribe`
   - Worker: Should see transcription requests with success logs

---

## Troubleshooting

### Problem: "SHARED_SECRET not configured"

**Solution**: Add `SHARED_SECRET` to worker environment variables.

```bash
# In worker .env
SHARED_SECRET=your-32-char-secret
```

**Note**: The worker uses `SHARED_SECRET`, while Next.js uses `WORKER_SHARED_SECRET`. Both must have the same value.

### Problem: "Invalid HMAC signature" (403 error)

**Causes**:
1. Secrets don't match between Next.js and Worker
2. Timestamp too old (>60 seconds clock drift)
3. Signature format mismatch

**Solutions**:
```bash
# Verify secrets match
echo "Next.js: $WORKER_SHARED_SECRET"  # In Next.js env
echo "Worker: $SHARED_SECRET"          # In Worker env (different name, same value)

# Check system clocks
date +%s  # On both Next.js and Worker servers (should be within 60s)

# Test HMAC generation
node test-hmac.js  # Use script below
```

**test-hmac.js**:
```javascript
const crypto = require('crypto');

const secret = 'your-32-char-secret';
const timestamp = Math.floor(Date.now() / 1000);
const body = '';  // Empty for multipart

const signature = crypto
  .createHmac('sha256', secret)
  .update(timestamp.toString() + body, 'utf8')
  .digest('hex');

console.log('Timestamp:', timestamp);
console.log('Signature:', signature);
console.log('\nTest with:');
console.log(`curl -H "x-sheen-timestamp: ${timestamp}" -H "x-sheen-signature: ${signature}" ...`);
```

### Problem: "OpenAI API error: 401"

**Solution**: Invalid or missing OpenAI API key.

```bash
# Verify API key is set
echo $OPENAI_API_KEY

# Test API key directly
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"
# Should return list of models
```

### Problem: "Daily transcription limit exceeded" (429)

**Solution**: User hit 10 minutes/day limit (configurable).

To increase limit:
```typescript
// In realtimeTranscription.ts
const RATE_LIMIT_MINUTES_PER_DAY = 20; // Increase from 10 to 20
```

### Problem: "Dropped chunk" (202 status)

**This is normal** - backpressure handling. User is speaking faster than API can process.

- Not an error
- Client continues sending next chunk
- Text still appears (just slightly delayed)

### Problem: No text appearing on Safari/Firefox

**Checklist**:
1. ✅ Worker is running
2. ✅ `WORKER_BASE_URL` is set in Next.js
3. ✅ HMAC secrets match
4. ✅ OpenAI API key is valid
5. ✅ Browser console shows SSE connection to `/api/v1/realtime/transcribe`

**Debug**:
```bash
# Check Next.js logs for proxy errors
npm run dev  # Watch for errors when modal opens

# Check worker logs for incoming requests
# Should see: "Transcription completed" with userId, chunkId, etc.
```

### Problem: High latency (>5 seconds)

**Expected latency**:
- Web Speech: <100ms (instant)
- OpenAI: 1.5-2.5s (chunk recording + network + model)

**If slower than 5s**:
1. Check network latency: Next.js ↔ Worker ↔ OpenAI
2. Check OpenAI API status: https://status.openai.com
3. Check worker CPU/memory usage
4. Check chunk size (should be 1.25s, not larger)

---

## Production Hardening

Before production deployment, implement these improvements:

### 1. Redis for Rate Limiting

Replace in-memory Map with Redis:

```typescript
import { createClient } from 'redis';

const redis = createClient({ url: process.env.REDIS_URL });
await redis.connect();

async function getTodayUsage(userId: string): Promise<number> {
  const today = new Date().toISOString().split('T')[0];
  const key = `transcription:usage:${userId}:${today}`;
  const minutes = await redis.get(key);
  return minutes ? parseFloat(minutes) : 0;
}

async function trackUsage(userId: string, durationSeconds: number) {
  const today = new Date().toISOString().split('T')[0];
  const key = `transcription:usage:${userId}:${today}`;
  const minutes = durationSeconds / 60;

  await redis.incrByFloat(key, minutes);
  await redis.expire(key, 86400); // 24 hour TTL
}
```

### 2. Add Metrics

```typescript
import { Counter, Histogram } from 'prom-client';

const transcriptionCount = new Counter({
  name: 'transcription_requests_total',
  help: 'Total transcription requests',
  labelNames: ['userId', 'language', 'status']
});

const transcriptionDuration = new Histogram({
  name: 'transcription_duration_seconds',
  help: 'Transcription duration',
  buckets: [0.5, 1, 2, 5, 10]
});

// In handler
transcriptionCount.inc({ userId, language, status: 'success' });
transcriptionDuration.observe(durationSeconds);
```

### 3. Add Error Alerts

```typescript
import { sendAlert } from './alerting';

// Alert on high error rate
if (errorCount > 10) {
  await sendAlert('High transcription error rate', {
    errors: errorCount,
    endpoint: '/v1/realtime/transcribe'
  });
}

// Alert on rate limit breaches
if (usageMinutes >= RATE_LIMIT_MINUTES_PER_DAY) {
  await sendAlert('User hit transcription limit', {
    userId,
    limit: RATE_LIMIT_MINUTES_PER_DAY
  });
}
```

### 4. Cost Monitoring

Track OpenAI API usage:

```typescript
async function trackCost(userId: string, durationSeconds: number) {
  const costPerMinute = 0.003; // gpt-4o-mini-transcribe
  const minutes = durationSeconds / 60;
  const cost = minutes * costPerMinute;

  await db.query(`
    INSERT INTO transcription_costs (user_id, duration_seconds, cost_usd, created_at)
    VALUES ($1, $2, $3, NOW())
  `, [userId, durationSeconds, cost]);
}
```

### 5. Horizontal Scaling

The endpoint is stateless except for rate limiting:

- ✅ Can scale horizontally behind load balancer
- ✅ No session affinity required
- ⚠️ Rate limiting needs Redis (not in-memory Map)
- ⚠️ Consider sticky sessions if using in-memory rate limiting temporarily

---

## Monitoring Dashboard

Track these metrics:

1. **Requests/min**: Transcription requests per minute
2. **Success rate**: % of successful transcriptions
3. **Latency p50/p95/p99**: Response times
4. **Error rate**: 4xx/5xx errors per minute
5. **Cost/day**: Daily OpenAI API costs
6. **Rate limit hits**: Users hitting daily limits
7. **Backpressure events**: 202 responses per minute

---

## Support

If you encounter issues:

1. Check worker logs for errors
2. Check Next.js logs for proxy errors
3. Test HMAC signature generation
4. Verify OpenAI API key is valid
5. Check environment variables match
6. Review this guide's troubleshooting section

---

## Summary

**What you deployed**:
- ✅ Real-time transcription endpoint at `/v1/realtime/transcribe`
- ✅ HMAC authentication
- ✅ OpenAI API integration with streaming
- ✅ Rate limiting (10 min/day per user)
- ✅ Backpressure handling
- ✅ Usage tracking

**Next steps**:
1. Test on Chrome/Edge (Web Speech path)
2. Test on Safari/Firefox (OpenAI path via worker)
3. Monitor costs and usage
4. Upgrade to Redis for production
5. Add metrics and alerts

**Estimated Cost**: $15/month for 5,000 users (50% savings vs Realtime API)
