# Claude Worker API Reference

This document provides a comprehensive guide to all available API endpoints in the Claude Worker microservice.

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Core Endpoints](#core-endpoints)
4. [Progress Tracking](#progress-tracking)
5. [Version Management](#version-management)
6. [Build System](#build-system)
7. [Health & Monitoring](#health--monitoring)
8. [Webhooks](#webhooks)
9. [Rate Limiting](#rate-limiting)
10. [Error Handling](#error-handling)

## Overview

The Claude Worker is a microservice that:
- Generates code using Claude AI
- Builds and deploys projects to Cloudflare Pages
- Manages project versions and history
- Provides build preview functionality
- **NEW**: Real-time progress tracking and webhooks

**Base URL**: `https://worker.sheenapps.com`

## Authentication

All write operations require HMAC signature authentication using a shared secret.

### Signature Generation

```javascript
const crypto = require('crypto');

function generateSignature(payload, secret) {
  return crypto.createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
}

// Usage
const signature = generateSignature(requestBody, process.env.SHARED_SECRET);
```

### Headers

```http
x-sheen-signature: <hmac-signature>
```

## Core Endpoints

### Design Intent

The API provides two main workflows:

1. **Quick Code Generation** (`/generate`) - Direct Claude CLI access without building/deploying
2. **Full Build Workflow** (`/build-preview-for-new-project`, `/rebuild-preview`) - Complete generation, build, and deployment with progress tracking

### Generate Code with Claude

**Endpoint**: `POST /generate`

Streams Claude's response for code generation.

**Request**:
```json
{
  "userId": "user123",
  "projectId": "my-app",
  "prompt": "Create a React todo list app"
}
```

**Headers**:
- `x-sheen-signature`: Required HMAC signature

**Response** (Streaming JSON):
```json
{
  "success": true,
  "output": "Generated code content..."
}
```

**Error Response**:
```json
{
  "success": false,
  "error": "Error message"
}
```

**Status Codes**:
- `200`: Success
- `400`: Bad request (missing parameters)
- `401`: Invalid signature
- `403`: Invalid project path
- `404`: Project directory not found
- `429`: Rate limit exceeded

### Build New Project

**Endpoint**: `POST /build-preview-for-new-project`

Creates a new project with code generation, build, and deployment to Cloudflare Pages.

**Request**:
```json
{
  "userId": "user123",
  "projectId": "my-app",
  "prompt": "Create a React todo list app",
  "framework": "react" // Optional, auto-detected if not provided
}
```

**Headers**:
- `x-sheen-signature`: Required

**Response**:
```json
{
  "success": true,
  "jobId": "27",
  "versionId": "01HY...",
  "status": "queued",
  "message": "Build job queued successfully"
}
```

### Rebuild Existing Project

**Endpoint**: `POST /rebuild-preview`

Updates an existing project with new features or modifications.

**Request**:
```json
{
  "userId": "user123",
  "projectId": "my-app",
  "prompt": "Add a dark mode toggle",
  "baseVersionId": "01HX..." // Optional, uses latest if not provided
}
```

**Headers**:
- `x-sheen-signature`: Required

**Response**:
```json
{
  "success": true,
  "jobId": "28",
  "versionId": "01HY...",
  "baseVersionId": "01HX...",
  "status": "queued",
  "message": "Rebuild job queued successfully"
}
```

**Direct Mode Response** (when `SKIP_QUEUE=true`):
```json
{
  "success": true,
  "versionId": "01HY...",
  "previewUrl": "https://abc123.pages.dev",
  "message": "Build completed successfully",
  "buildTime": 45.2,
  "framework": "react"
}
```

**⭐ Key Integration Point**: 

The `jobId` returned by build endpoints is used as the `buildId` in the Progress Tracking API. This allows you to:

1. **Start a build** using `/build-preview-for-new-project` or `/rebuild-preview`
2. **Track progress** using `/api/builds/{jobId}/events` and `/api/builds/{jobId}/status`
3. **Receive webhooks** (if configured) for all build events

**Example Integration**:
```javascript
// 1. Start build
const buildResponse = await fetch('/build-preview-for-new-project', {
  method: 'POST',
  headers: { 'x-sheen-signature': signature },
  body: JSON.stringify({ userId, projectId, prompt })
});
const { jobId } = await buildResponse.json();

// 2. Monitor progress
const statusResponse = await fetch(`/api/builds/${jobId}/status`);
const { status, progress, previewUrl } = await statusResponse.json();

// 3. Or poll for events
const eventsResponse = await fetch(`/api/builds/${jobId}/events?lastEventId=0`);
const { events } = await eventsResponse.json();
```

### Get Latest Project Version

**Endpoint**: `GET /preview/:userId/:projectId/latest`

Retrieves the latest version information for a project.

**Response**:
```json
{
  "success": true,
  "version": {
    "versionId": "01HX...",
    "prompt": "Create a React app",
    "previewUrl": "https://abc.pages.dev",
    "status": "deployed",
    "createdAt": "2025-01-19T...",
    "framework": "react"
  }
}
```

## Progress Tracking

**NEW**: Real-time build progress tracking with polling and webhook support.

### Get Build Events

**Endpoint**: `GET /api/builds/:buildId/events`

Get build progress events with incremental polling support.

**Parameters**:
- `buildId` (path): The job ID returned from build endpoints
- `lastEventId` (query): Optional. Only return events after this ID

**Example Request**:
```http
GET /api/builds/27/events?lastEventId=5
```

**Response**:
```json
{
  "buildId": "27",
  "events": [
    {
      "id": 6,
      "type": "task_completed",
      "data": {
        "taskName": "Create HTML Test Page",
        "filesCreated": 1
      },
      "timestamp": "2025-07-22T07:14:36.224Z"
    }
  ],
  "lastEventId": 6
}
```

**Event Types**:
- `plan_started`: Build planning has begun
- `plan_generated`: Plan created with task breakdown
- `task_started`: Individual task execution started
- `task_completed`: Task finished successfully
- `task_failed`: Task failed with error details
- `deploy_started`: Deployment process initiated
- `build_started`: Building application assets
- `deploy_progress`: Uploading to Cloudflare Pages
- `deploy_completed`: Deployment successful with preview URL
- `deploy_failed`: Deployment failed with error details

### Get Build Status

**Endpoint**: `GET /api/builds/:buildId/status`

Get aggregated build status and progress percentage.

**Parameters**:
- `buildId` (path): The job ID returned from build endpoints

**Example Request**:
```http
GET /api/builds/27/status
```

**Response**:
```json
{
  "buildId": "27",
  "status": "completed",
  "progress": 100,
  "previewUrl": "https://e05f45e2.sheenapps-preview.pages.dev",
  "error": null,
  "eventCount": 12,
  "lastUpdate": "2025-07-22T07:15:20.107Z"
}
```

**Status Values**:
- `unknown`: No events yet (shouldn't happen)
- `planning`: Generating implementation plan
- `executing`: Running tasks to create files
- `deploying`: Building and deploying to Cloudflare Pages
- `completed`: Build successful with preview URL
- `failed`: Build failed at any stage

**Progress Calculation**:
- 0-10%: Initial planning
- 10-70%: Task execution (incremental per task)
- 70-80%: Deployment preparation
- 80-100%: Cloudflare deployment
- 100%: Complete with preview URL

### Get Webhook Status

**Endpoint**: `GET /api/webhooks/status`

Get webhook delivery statistics and configuration status.

**Response**:
```json
{
  "enabled": true,
  "webhookUrl": "https://app.example.com/api/webhooks/claude-worker",
  "stats": {
    "totalFailures": 2,
    "pendingRetries": 1,
    "maxRetriesReached": 0,
    "latestFailure": "2025-07-22T07:10:30.000Z",
    "eventsLast24h": 45
  }
}
```

## Version Management

### List Project Versions

**Endpoint**: `GET /versions/:userId/:projectId`

Returns all versions for a project (up to 200).

**Response**:
```json
{
  "success": true,
  "versions": [
    {
      "versionId": "01HX...",
      "prompt": "Create a React app",
      "previewUrl": "https://abc.pages.dev",
      "status": "deployed",
      "createdAt": "2025-01-19T...",
      "parentVersionId": null,
      "framework": "react"
    }
  ],
  "total": 15
}
```

### Get Version Details

**Endpoint**: `GET /versions/:versionId`

Returns detailed information about a specific version.

**Response**:
```json
{
  "success": true,
  "version": {
    "versionId": "01HX...",
    "userId": "user123",
    "projectId": "my-app",
    "prompt": "Create a React app",
    "previewUrl": "https://abc.pages.dev",
    "status": "deployed",
    "createdAt": "2025-01-19T...",
    "deploymentId": "deploy-123",
    "gitHash": "abc123def",
    "outputSize": 2457600,
    "framework": "react"
  }
}
```

### Version Diff

**Endpoint**: `GET /versions/:id1/diff/:id2`

Get the diff between two versions.

**Query Parameters**:
- `mode`: `patch` (default) | `stats`

**Response (stats mode)**:
```json
{
  "success": true,
  "fromVersion": "01HX...",
  "toVersion": "01HY...",
  "stats": {
    "filesChanged": 5,
    "insertions": 120,
    "deletions": 45
  }
}
```

**Response (patch mode)**:
```diff
diff --git a/src/App.jsx b/src/App.jsx
index abc123..def456 100644
--- a/src/App.jsx
+++ b/src/App.jsx
@@ -10,7 +10,7 @@
-    <h1>Hello World</h1>
+    <h1>Hello Claude</h1>
```

### Rollback Version

**Endpoint**: `POST /versions/rollback`

Rollback to a previous version by redeploying its artifact.

**Request**:
```json
{
  "userId": "user123",
  "projectId": "my-app",
  "targetVersionId": "01HX..."
}
```

**Headers**:
- `x-sheen-signature`: Required

**Response**:
```json
{
  "success": true,
  "message": "Rollback successful",
  "rollbackVersionId": "01HY...",
  "targetVersionId": "01HX...",
  "previewUrl": "https://new.pages.dev"
}
```

### Rebuild Version

**Endpoint**: `POST /versions/:versionId/rebuild`

Trigger a rebuild of a specific version.

**Headers**:
- `x-sheen-signature`: Required

**Response**:
```json
{
  "success": true,
  "message": "Rebuild queued",
  "jobId": "job-456"
}
```

## Build System

### Build Job Structure

When a build is queued, it creates a job with this structure:

```typescript
interface BuildJobData {
  userId: string;
  projectId: string;
  prompt: string;
  versionId: string;
  parentVersionId?: string;
  mode?: 'test' | 'preview' | 'deploy';
  framework?: string;
}
```

### Build Process

1. **Code Generation**: Uses Claude AI to generate/modify code
2. **Dependency Installation**: Uses pnpm with shared cache
3. **Build**: Runs framework-specific build commands
4. **Artifact Creation**: Zips build output
5. **Deployment**: Uploads to Cloudflare Pages
6. **Version Storage**: Stores in database and R2

## Health & Monitoring

### Main Health Check

**Endpoint**: `GET /myhealthz`

**Response**:
```json
{
  "status": "healthy",
  "timestamp": "2025-01-21T...",
  "uptime": 3600.5,
  "rateLimit": {
    "calls": 250,
    "limit": 800
  }
}
```

### Claude Executor Health

**Endpoint**: `GET /claude-executor/health`

**Response**:
```json
{
  "status": "healthy",
  "redis": "connected",
  "claudeCLI": "accessible",
  "circuitBreaker": "closed",
  "activeRequests": 2,
  "metrics": {
    "totalRequests": 150,
    "successRate": "0.98",
    "failedRequests": 3,
    "averageExecutionTime": 4567,
    "lastError": null,
    "lastErrorTime": null
  }
}
```

## Webhooks

### Build Progress Webhooks ✨ NEW

**Automatic webhook delivery** for all build events when `MAIN_APP_WEBHOOK_URL` is configured.

**Configuration Environment Variables**:
```bash
MAIN_APP_WEBHOOK_URL=https://your-app.com/api/webhooks/claude-worker
WEBHOOK_SECRET=your-webhook-secret-123
```

**Webhook Payload**:
```json
{
  "buildId": "27",
  "type": "deploy_completed",
  "data": {
    "previewUrl": "https://e05f45e2.sheenapps-preview.pages.dev",
    "deploymentId": "deploy-abc123",
    "message": "Deployment successful! Preview: https://..."
  },
  "timestamp": "2025-07-22T07:15:20.107Z"
}
```

**Headers**:
- `x-webhook-signature`: HMAC-SHA256 signature (Stripe-style)
- `content-type`: `application/json`
- `user-agent`: `Claude-Worker-Webhook/1.0`

**Signature Verification**:
```javascript
const crypto = require('crypto');

function verifySignature(payload, signature, secret) {
  const expected = crypto.createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return signature === expected;
}
```

**Event Types**: Same as [Progress Tracking events](#progress-tracking)

**Retry Logic**:
- Failed webhooks are retried with exponential backoff
- Retry intervals: 1min, 2min, 4min, 8min, 16min
- Max 5 attempts before marking as permanently failed
- Check delivery status with `/api/webhooks/status`

### Cloudflare Pages Webhook

**Endpoint**: `POST /cf-pages-callback`

Receives deployment status updates from Cloudflare Pages (legacy).

**Headers**:
- `cf-webhook-auth`: Webhook secret

**Request**:
```json
{
  "deployment": {
    "id": "deploy-123",
    "environment": "production",
    "url": "https://abc.pages.dev",
    "aliases": [],
    "created_on": "2025-01-21T...",
    "latest_stage": {
      "name": "deploy",
      "status": "success",
      "ended_on": "2025-01-21T..."
    }
  },
  "project": {
    "id": "proj-123",
    "name": "my-app"
  }
}
```

## Rate Limiting

The service implements multiple rate limiting strategies:

### Global Rate Limit
- **Limit**: 800 requests/hour (configurable via `MAX_GLOBAL_CALLS_PER_HR`)
- **Scope**: All endpoints

### IP Rate Limit
- **Limit**: 100 requests/hour per IP (configurable via `IP_RATE_LIMIT`)
- **Scope**: Build endpoints

### User Build Limit
- **Limit**: 100 new builds/hour per user
- **Scope**: New build requests

### Project Rebuild Limit
- **Limit**: 100 rebuilds/hour per project
- **Scope**: Rebuild requests

## Error Handling

### Standard Error Response

```json
{
  "success": false,
  "error": "Error message",
  "details": {} // Optional additional context
}
```

### Common Error Codes

| Status Code | Description |
|------------|-------------|
| 400 | Bad Request - Missing or invalid parameters |
| 401 | Unauthorized - Invalid signature |
| 403 | Forbidden - Invalid project path |
| 404 | Not Found - Resource doesn't exist |
| 429 | Too Many Requests - Rate limit exceeded |
| 500 | Internal Server Error |
| 503 | Service Unavailable - Dependencies down |

## Architecture Notes

### Modular vs Monolith Mode

The service can run in two modes (controlled by `ARCH_MODE` env var):

- **`modular`**: Uses separate workers for planning and task execution
- **`monolith`**: Single worker handles all operations

### Direct Mode

When `SKIP_QUEUE=true`, builds execute synchronously without queueing.

### Storage

- **Database**: PostgreSQL for version metadata
- **R2**: Cloudflare R2 for build artifacts
- **KV**: Cloudflare KV for latest version caching
- **Redis**: For job queuing and inter-process communication

## Example Usage

### Complete Build Flow

```bash
# 1. Generate code
curl -X POST https://api.example.com/generate \
  -H "Content-Type: application/json" \
  -H "x-sheen-signature: <signature>" \
  -d '{
    "userId": "user123",
    "projectId": "my-app",
    "prompt": "Create a React todo app"
  }'

# 2. Trigger build
curl -X POST https://api.example.com/build-preview \
  -H "Content-Type: application/json" \
  -H "x-sheen-signature: <signature>" \
  -d '{
    "userId": "user123",
    "projectId": "my-app",
    "prompt": "Add dark mode"
  }'

# 3. Check latest version
curl https://api.example.com/build-preview/user123/my-app/latest

# 4. List all versions
curl https://api.example.com/versions/user123/my-app

# 5. View diff
curl https://api.example.com/versions/01HX.../diff/01HY...?mode=stats
```

## Environment Variables

Key configuration options:

```bash
# Authentication
SHARED_SECRET=your-secret-key
CF_WEBHOOK_SECRET=cloudflare-webhook-secret

# Architecture
ARCH_MODE=modular|monolith
SKIP_QUEUE=true|false

# Rate Limiting
MAX_GLOBAL_CALLS_PER_HR=800
IP_RATE_LIMIT=100

# Claude Executor
CLAUDE_EXECUTOR_MODE=redis|http|direct
CLAUDE_MAX_CONCURRENT=5
CLAUDE_TIMEOUT=60000

# Storage
DATABASE_URL=postgres://...
CF_ACCOUNT_ID=...
CF_PROJECT_NAME=...

# Admin Interface (optional)
ADMIN_PASSWORD=your-secure-password
```

## Queue Monitoring & Administration

### Bull Board Web UI

Access the real-time queue monitoring dashboard:

**URL**: `GET /admin/queues`

The Bull Board provides:
- Real-time queue statistics and job counts
- Visual representation of job states (waiting, active, completed, failed)
- Job details inspection including data, logs, and stack traces
- Ability to retry failed jobs
- Clean/remove completed or failed jobs
- Pause and resume queue processing
- Search and filter capabilities

**Queue Types** (Modular Architecture):
- `plans` - Plan generation jobs
- `ai-tasks` - Individual task execution
- `deployments` - Cloudflare Pages deployments
- `webhooks` - Webhook delivery queue

**Queue Types** (Monolith Architecture):
- `build` - All-in-one build jobs

### Authentication (Production)

In production, protect the admin interface by setting:
```bash
ADMIN_PASSWORD=your-secure-password
```

Then access with:
- Username: `admin`
- Password: `your-secure-password`

### Queue Management CLI

For command-line queue management:

```bash
# View all queue statistics
npm run queues stats

# Clear specific queue
npm run queues clear plans
npm run queues clear tasks

# Clear only failed jobs
npm run queues clear tasks failed

# View failed job details
npm run queues failed tasks

# Retry all failed jobs
npm run queues retry tasks

# Clear ALL queues (use with caution!)
npm run queues clear-all
```

### Direct Redis Access

For advanced debugging:

```bash
# Connect to Redis
redis-cli

# List all BullMQ keys
KEYS bull:*

# Get queue lengths
LLEN bull:plans:wait
LLEN bull:plans:active
LLEN bull:plans:failed

# Clear specific queue data
DEL bull:plans:wait
```
