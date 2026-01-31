# Webhook Retry System Setup

## Overview
The webhook retry system automatically retries failed webhooks with exponential backoff to ensure payment state consistency.

## Components

### 1. Webhook Retry Service
- **Location**: `/src/services/payment/webhook-retry-service.ts`
- **Purpose**: Core retry logic with exponential backoff
- **Features**:
  - Automatic retry with exponential backoff (2^n * 60 seconds)
  - Jitter to prevent thundering herd
  - Max retry limits (default: 3)
  - Admin alerts after max retries
  - Manual retry capability

### 2. Cron Job Endpoint
- **Location**: `/src/app/api/cron/webhook-retry/route.ts`
- **Endpoint**: `GET /api/cron/webhook-retry`
- **Auth**: Bearer token with `CRON_SECRET`
- **Max Duration**: 5 minutes

### 3. Admin API
- **Location**: `/src/app/api/admin/webhooks/retry/route.ts`
- **Endpoints**:
  - `POST /api/admin/webhooks/retry` - Manual retry
  - `GET /api/admin/webhooks/retry` - Get retry stats

## Setup Instructions

### 1. Environment Variables
Add to your `.env.local`:
```env
# Cron job authentication
CRON_SECRET=your-secure-random-string

# Admin email alerts
ADMIN_EMAILS=admin@example.com,billing@example.com
```

### 2. Database Migration
The webhook_dead_letter table should already exist from migration 0016. If not, create it:

```sql
CREATE TABLE webhook_dead_letter (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway VARCHAR(50) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  retry_history JSONB[] DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  last_retry_at TIMESTAMP
);

CREATE INDEX idx_webhook_dead_letter_retry ON webhook_dead_letter(retry_count, last_retry_at);
```

### 3. Cron Job Setup

#### Option A: Vercel Cron (Recommended for Vercel deployments)
Add to `vercel.json`:
```json
{
  "crons": [{
    "path": "/api/cron/webhook-retry",
    "schedule": "*/5 * * * *"
  }]
}
```

#### Option B: External Cron Service
Use a service like:
- **EasyCron**: https://www.easycron.com
- **Cron-job.org**: https://cron-job.org
- **Uptime Robot**: https://uptimerobot.com

Configure to call:
```
GET https://yourapp.com/api/cron/webhook-retry
Authorization: Bearer YOUR_CRON_SECRET
```

#### Option C: GitHub Actions
Create `.github/workflows/webhook-retry.yml`:
```yaml
name: Webhook Retry Job
on:
  schedule:
    - cron: '*/5 * * * *'
  workflow_dispatch:

jobs:
  retry:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger webhook retry
        run: |
          curl -X GET \
            https://yourapp.com/api/cron/webhook-retry \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}"
```

### 4. Monitoring

#### Logs
Monitor webhook retry activity in your logs:
```
Starting webhook retry job: { pending: 5, maxRetriesReached: 2 }
Successfully processed webhook abc123 on retry 2
Webhook xyz789 failed after 3 retries
```

#### Admin Dashboard
View webhook status at `/admin/webhooks`:
- Failed webhooks with retry counts
- Manual retry buttons
- Event type breakdown

#### Metrics to Track
- Webhook success rate after retries
- Average retry count before success
- Webhooks reaching max retries
- Time to successful retry

## Retry Logic

### Exponential Backoff Formula
```
backoff = 2^retryCount * 60 seconds + random(0-60) seconds

Retry 1: 2 minutes (± 1 minute jitter)
Retry 2: 4 minutes (± 1 minute jitter)  
Retry 3: 8 minutes (± 1 minute jitter)
```

### Retry Conditions
Webhooks are retried when:
1. `retry_count < max_retries`
2. Enough time has passed since `last_retry_at`
3. The webhook is not manually marked as resolved

### Failure Handling
After max retries:
1. Admin email alert sent
2. Webhook remains in dead letter queue
3. Manual intervention required

## Testing

### 1. Simulate Failed Webhook
```typescript
// Insert test webhook into dead letter queue
INSERT INTO webhook_dead_letter (
  gateway,
  event_type,
  payload,
  error_message
) VALUES (
  'stripe',
  'invoice.payment_failed',
  '{"id": "evt_test123", "type": "invoice.payment_failed"}',
  'Test error'
);
```

### 2. Trigger Manual Retry
```bash
curl -X POST https://yourapp.com/api/admin/webhooks/retry \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"webhookId": "webhook-id-here"}'
```

### 3. Test Cron Job
```bash
curl -X GET https://yourapp.com/api/cron/webhook-retry \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

## Troubleshooting

### Common Issues

1. **Webhooks not retrying**
   - Check cron job is running
   - Verify CRON_SECRET matches
   - Check webhook retry_count < max_retries

2. **Too many retries**
   - Adjust max_retries in database
   - Check backoff calculation
   - Verify error is transient

3. **Admin alerts not sending**
   - Verify ADMIN_EMAILS env var
   - Check email service configuration
   - Look for email logs

### Debug Queries
```sql
-- View pending retries
SELECT * FROM webhook_dead_letter 
WHERE retry_count < max_retries 
ORDER BY created_at DESC;

-- View failed webhooks by gateway
SELECT gateway, COUNT(*) 
FROM webhook_dead_letter 
GROUP BY gateway;

-- View retry history
SELECT id, retry_history 
FROM webhook_dead_letter 
WHERE retry_count > 0;
```

## Best Practices

1. **Set appropriate max_retries**
   - Payment webhooks: 3-5 retries
   - Non-critical webhooks: 1-2 retries

2. **Monitor retry patterns**
   - High retry rates may indicate integration issues
   - Consistent failures need investigation

3. **Clean up old webhooks**
   - Archive resolved webhooks after 30 days
   - Keep failed webhooks for audit trail

4. **Test webhook handlers**
   - Ensure idempotency
   - Handle duplicate events gracefully
   - Log all webhook processing