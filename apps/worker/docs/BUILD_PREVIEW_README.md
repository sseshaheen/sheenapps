# Claude Builder - Build Preview System

⚠️ **DEPRECATED as of August 3, 2025** ⚠️  
**Use `/v1/create-preview-for-new-project` instead.**  
**Migration guide: [API_REFERENCE_FOR_NEXTJS.md](./API_REFERENCE_FOR_NEXTJS.md)**

This document describes the **legacy** build preview functionality that has been superseded by the advanced create-preview system.

## Overview

The build preview system allows you to:
1. Generate code using Claude CLI
2. Build the generated project with pnpm
3. Deploy to Cloudflare Pages for live preview
4. Track versions for undo/redo and iterative development

## New API Endpoints

### 1. ~~POST /build-preview-for-new-project~~ (DEPRECATED)

⚠️ **DEPRECATED**: Use `POST /v1/create-preview-for-new-project` instead.

~~Creates a new project from scratch.~~ (Legacy functionality)

**Request:**
```json
{
  "userId": "user123",
  "projectId": "my-app",
  "prompt": "Create a React landing page for a salon booking app",
  "framework": "react"  // optional: react|nextjs|vue|svelte
}
```

**Headers:**
- `x-sheen-signature`: HMAC signature of request body

**Response:**
```json
{
  "success": true,
  "jobId": "build-01HX...",
  "versionId": "01HX...", 
  "status": "queued",
  "message": "Build job queued successfully"
}
```

### 2. POST /rebuild-preview

Updates an existing project.

**Request:**
```json
{
  "userId": "user123",
  "projectId": "my-app",
  "prompt": "Change the navbar color to red",
  "baseVersionId": "01HX..."  // optional, defaults to latest
}
```

**Response:** Same as above

### 3. GET /preview/:userId/:projectId/latest

Gets the latest preview URL for a project.

**Response:**
```json
{
  "success": true,
  "latestVersionId": "01HX...",
  "previewUrl": "https://abc123.pages.dev",
  "timestamp": 1737302930000
}
```

## Setup Instructions

### 1. Install Redis (for build queue)

```bash
sudo apt-get install redis-server
sudo systemctl start redis
```

### 2. Configure Environment

Copy `.env.example` to `.env` and update:
- `DATABASE_URL`: PostgreSQL connection string
- `CF_API_TOKEN_WORKERS`: Your Cloudflare API token
- `CF_WEBHOOK_SECRET`: Secret for webhook validation

### 3. Run Setup Script

```bash
npm install
npm run setup  # Creates DB tables, KV namespace, Pages project
```

### 4. Configure Cloudflare Pages Webhook

In your Cloudflare Pages project settings:
1. Go to Settings > Builds & deployments > Deploy hooks
2. Add webhook URL: `https://your-worker.com/cf-pages-callback`
3. Add header: `cf-webhook-auth: your-webhook-secret`

## Build Process Flow

1. **Request received** → Validated with HMAC signature
2. **Job queued** → BullMQ adds to Redis queue (with deduplication)
3. **Worker processes** → 
   - Calls Claude CLI to generate/modify code
   - Runs `pnpm install` and `pnpm audit`
   - Runs `pnpm build`
   - Zips output directory
   - Uploads to Cloudflare Pages
4. **Webhook received** → Updates status to deployed
5. **Version saved** → In PostgreSQL + Cloudflare KV

## Rate Limits

- **Per IP**: 100 requests/hour
- **New builds**: 5/hour per user
- **Rebuilds**: 20/hour per project

## Version Storage

- **Cloudflare KV**: Latest version for fast reads
- **PostgreSQL**: Full version history with metadata
- **R2/S3**: Zipped build artifacts (future)

## Security Features

- HMAC signature validation on all requests
- Dependency vulnerability scanning with `pnpm audit`
- Build sandboxing with resource limits
- Per-IP rate limiting for DDoS protection

## Monitoring

The build queue provides events:
- `waiting`: Job added to queue
- `active`: Job started processing
- `completed`: Job finished successfully
- `failed`: Job failed with error

Check build status in logs or implement a status endpoint.

## Troubleshooting

### Redis not running
```bash
sudo systemctl status redis
sudo systemctl start redis
```

### Database connection failed
Check `DATABASE_URL` in `.env` file

### Cloudflare API errors
Verify API tokens have correct permissions

### Build failures
Check worker logs for detailed error messages

## Next Steps (Phase 2)

- Git-based diff storage
- Build caching with shared `.pnpm-store`
- Rollback functionality
- Source diff endpoints
- Cleanup jobs for old deployments