# Claude Worker Deployment Guide

## Quick Start

### 1. Create Worker Repository
```bash
# Create new repo: sheenapps-claude-worker
git init sheenapps-claude-worker
cd sheenapps-claude-worker
```

### 2. Copy Worker Code
Create the following structure:
```
sheenapps-claude-worker/
├── src/
│   └── server.ts        # From implementation plan
├── Dockerfile           # From implementation plan
├── package.json
├── tsconfig.json
└── railway.toml
```

### 3. Deploy to Railway
1. Push to GitHub
2. Connect Railway to the repo
3. Add environment variables:
   - `SHARED_SECRET` - Same as `NEXT_PUBLIC_CLAUDE_SHARED_SECRET` in Vercel
   - `NODE_ENV` - `production`

### 4. Update Next.js Environment
Add to Vercel environment variables:
- `NEXT_PUBLIC_CLAUDE_WORKER_URL` - Your Railway URL + `/generate`
- `NEXT_PUBLIC_CLAUDE_SHARED_SECRET` - Secure random string (use `openssl rand -hex 32`)

### 5. Run Supabase Migration
```bash
# In your Next.js project
npx supabase db push
```

### 6. Test the Integration
```typescript
// Test in your app
import { runClaude } from '@/lib/ai/claudeRunner';

const result = await runClaude(
  "Create a simple landing page", 
  userId
);
```

## Monitoring Setup

### Grafana (Railway Dashboard)
1. Enable Railway metrics
2. Set up alerts for:
   - Error rate > 10%
   - Response time > 5s
   - Health check failures

### Sentry Alerts
Automatically configured to alert when:
- More than 3 429 errors in 5 minutes
- Worker connection failures
- Quota system errors

## Troubleshooting

### Common Issues
1. **429 Errors**: Check global rate limit in worker
2. **Auth Failures**: Verify HMAC secret matches
3. **Quota Exceeded**: Check user's subscription tier
4. **Worker Down**: Check Railway logs and health endpoint

### Health Check
```bash
curl https://your-worker.railway.app/healthz
```

## Security Checklist
- [ ] HMAC secret is strong (32+ characters)
- [ ] Environment variables are set in production only
- [ ] RLS policies are enabled on quota table
- [ ] Worker URL uses HTTPS
- [ ] No sensitive data in logs