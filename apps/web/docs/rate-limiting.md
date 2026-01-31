# Rate Limiting Documentation

## Overview
SheenApps uses IP-based rate limiting to protect internal APIs from abuse. Since our APIs are only accessible through the platform UI (not public), this provides protection against malicious users and automated attacks.

## Architecture

### Rate Limiter Utility
- **Location**: `/src/lib/rate-limiter.ts`
- **Storage**: In-memory (suitable for single instance)
- **Production**: Consider Redis for distributed deployments

### Middleware Integration
- **Location**: `/src/middleware/rate-limit.ts`
- **Applied**: Automatically to configured API routes
- **Headers**: Standard RateLimit headers included

## Protected Endpoints

### Generation Endpoints (10 req/min)
- `/api/ai/chat` - AI chat interactions
- `/api/ai/generate` - AI content generation
- `/api/export` - Export functionality

### Authentication (5 req/15min)
- `/api/auth/login` - Login attempts
- `/api/auth/signup` - Account creation
- `/api/auth/reset-password` - Password reset

### Webhooks (100 req/min)
- `/api/stripe-webhook` - Stripe webhook
- `/api/cashier-webhook` - Cashier webhook

## Rate Limit Headers

Successful responses include:
```
RateLimit-Limit: 10
RateLimit-Remaining: 7
RateLimit-Reset: 2025-06-27T12:34:56.789Z
```

Rate limited responses (429):
```
Retry-After: 45
RateLimit-Limit: 10
RateLimit-Remaining: 0
RateLimit-Reset: 2025-06-27T12:34:56.789Z
```

## Usage Quota vs Rate Limiting

### Usage Quotas (Plan-Based)
- Enforced via `checkUserQuota()` 
- Controls feature access (AI generations, exports)
- Returns 403 Forbidden when exceeded
- User sees upgrade prompt

### Rate Limiting (IP-Based)
- Prevents API abuse
- Returns 429 Too Many Requests
- Temporary block with retry time
- Protects all users

## Implementation Example

```typescript
// In your API route
import { rateLimiters } from '@/lib/rate-limiter'

export async function POST(request: NextRequest) {
  // Apply rate limiting
  const rateLimitResult = await rateLimiters.generation.check(request)
  if (rateLimitResult) {
    return rateLimitResult // 429 response
  }

  // Check usage quota
  const quota = await checkUserQuota(userId, 'ai_generations')
  if (!quota.allowed) {
    return NextResponse.json(
      { error: 'Quota exceeded', upgradeUrl: '/pricing' },
      { status: 403 }
    )
  }

  // Process request...
}
```

## Configuration

### Adding New Rate Limits
1. Define in `/src/lib/rate-limiter.ts`:
```typescript
export const rateLimiters = {
  myNewLimit: new RateLimiter({
    windowMs: 60 * 1000, // 1 minute
    max: 20, // 20 requests
    message: 'Custom error message',
  }),
}
```

2. Add to middleware config in `/src/middleware/rate-limit.ts`:
```typescript
const rateLimitConfig: Record<string, keyof typeof rateLimiters> = {
  '/api/my-endpoint': 'myNewLimit',
}
```

### Custom Key Generation
For user-based rate limiting (future):
```typescript
new RateLimiter({
  windowMs: 60 * 1000,
  max: 50,
  keyGenerator: (req) => {
    const userId = getUserIdFromRequest(req)
    return `user:${userId}`
  }
})
```

## Monitoring

### Logs
Rate limit hits are logged:
```
Too many requests from IP: 192.168.1.1
Rate limit exceeded: /api/ai/chat
```

### Metrics to Track
- Rate limit hit frequency by endpoint
- Unique IPs hitting limits
- Geographic distribution of limited IPs
- Correlation with actual abuse attempts

## Testing

### Simulate Rate Limit
```bash
# Hit endpoint rapidly
for i in {1..15}; do
  curl -X POST http://localhost:3000/api/ai/chat \
    -H "Content-Type: application/json" \
    -d '{"message":"test"}'
done
```

### Check Headers
```bash
curl -I -X POST http://localhost:3000/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"test"}'
```

## Best Practices

1. **Set Appropriate Limits**
   - Generation endpoints: Conservative (10/min)
   - Auth endpoints: Very conservative (5/15min)
   - Webhooks: Generous (100/min)

2. **Monitor False Positives**
   - Track legitimate users hitting limits
   - Adjust limits based on usage patterns

3. **User Experience**
   - Show clear error messages
   - Include retry time in UI
   - Consider user-based limits for power users

4. **Security**
   - Log all rate limit hits
   - Alert on suspicious patterns
   - Consider IP blocking for persistent abuse

## Production Considerations

### Redis Integration
For multi-instance deployments:
```typescript
import Redis from 'ioredis'

const redis = new Redis(process.env.REDIS_URL)

// Replace in-memory store with Redis
async function checkRateLimit(key: string): Promise<boolean> {
  const count = await redis.incr(key)
  if (count === 1) {
    await redis.expire(key, windowSeconds)
  }
  return count <= maxRequests
}
```

### CDN/Proxy Considerations
- Trust X-Forwarded-For header
- Configure real IP detection
- Account for shared IPs (offices, VPNs)

### Bypass for Testing
```typescript
// Allow bypass for testing
if (process.env.NODE_ENV === 'test') {
  return NextResponse.next()
}
```