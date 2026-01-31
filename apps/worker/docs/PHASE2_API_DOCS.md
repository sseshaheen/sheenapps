# Phase 2 API Documentation

This document describes the Phase 2 features added to the Claude Builder system.

## Version Management Endpoints

### List Project Versions
```http
GET /versions/:userId/:projectId
```

Returns all versions for a project (up to 200).

**Response:**
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
```http
GET /versions/:versionId
```

Returns detailed information about a specific version.

### Rollback to Version
```http
POST /versions/rollback
```

Rollback to a previous version by redeploying its artifact.

**Request:**
```json
{
  "userId": "user123",
  "projectId": "my-app",
  "targetVersionId": "01HX..."
}
```

**Headers:**
- `x-sheen-signature`: HMAC signature

**Response:**
```json
{
  "success": true,
  "message": "Rollback successful",
  "rollbackVersionId": "01HY...",
  "targetVersionId": "01HX...",
  "previewUrl": "https://new.pages.dev"
}
```

### Version Diff
```http
GET /versions/:id1/diff/:id2?mode=patch|stats
```

Get the diff between two versions.

**Query Parameters:**
- `mode`: 
  - `patch` (default): Returns git diff patch
  - `stats`: Returns change statistics
  - `visual`: Not yet implemented

**Response (stats mode):**
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

**Response (patch mode):**
```diff
diff --git a/src/App.jsx b/src/App.jsx
index abc123..def456 100644
--- a/src/App.jsx
+++ b/src/App.jsx
@@ -10,7 +10,7 @@
-    <h1>Hello World</h1>
+    <h1>Hello Claude</h1>
```

### Rebuild Version
```http
POST /versions/:versionId/rebuild
```

Trigger a rebuild of a specific version.

**Headers:**
- `x-sheen-signature`: HMAC signature

## Build Cache

The system now uses a shared `.pnpm-store` for faster dependency installation:

- Location: `~/.pnpm-cache`
- Shared across all projects
- Automatically pruned by cleanup job
- Reduces install time by ~70%

## Git Integration

Each project is now a git repository with:

- Automatic commits for each version
- Tags for version IDs
- Sliding window: Full `dist/` kept for latest 3 versions
- Older versions store only source code
- Git GC runs after window management

## Cleanup Job

Runs daily at 3 AM UTC with these tasks:

1. **Database Cleanup**
   - Delete versions older than 365 days
   - Enforce 200 version limit per project

2. **Cloudflare Pages Cleanup**
   - Delete deployments beyond retention limit
   - Manage 500 deployment quota

3. **pnpm Cache Maintenance**
   - Prune packages older than 30 days

4. **Artifact Verification**
   - Check R2 artifacts exist
   - Re-upload missing artifacts if available

5. **KV Consistency**
   - Remove orphaned KV entries

## R2 Artifact Storage

All build artifacts are stored in R2:

- Bucket: `claude-builder-artifacts`
- Structure: `{userId}/{projectId}/snapshots/{versionId}.zip`
- Diff packs: `{userId}/{projectId}/packs/git_{from}_to_{to}.pack.zip`

## Monitoring Improvements

### Build Metrics
- Install duration tracked separately
- Build duration tracked separately  
- Deploy duration tracked separately
- Output size tracked

### Cleanup Metrics
- Versions deleted
- Deployments cleaned
- Artifacts verified
- Cache size

## Security Enhancements

### Dependency Scanning
```bash
pnpm audit --prod --audit-level critical
```
Fails build on critical vulnerabilities.

### Resource Limits
- 5 minute build timeout
- 100MB output size limit
- 1GB RAM limit per build

## Performance Optimizations

1. **Warm Cache**: Common packages pre-installed
2. **Parallel Operations**: R2 upload + deployment
3. **Git Sliding Window**: Reduces repo size
4. **Polling Fallback**: 2-minute deployment verification

## Error Handling

All operations include proper error handling:
- Rollback on failed deployments
- Artifact backup verification
- Graceful degradation without database
- Queue deduplication

## Usage Examples

### Rollback Workflow
```bash
# 1. List versions
GET /versions/user123/my-app

# 2. Find target version
# 3. Rollback
POST /versions/rollback
{
  "userId": "user123",
  "projectId": "my-app", 
  "targetVersionId": "01HXABC..."
}
```

### Diff Workflow
```bash
# 1. Get change statistics
GET /versions/01HX.../diff/01HY...?mode=stats

# 2. Get full patch
GET /versions/01HX.../diff/01HY...?mode=patch
```

## Remaining Phase 2 Tasks

1. **Static Analysis Hooks** (Low Priority)
   - Add `eslint --max-warnings=0` check
   - Add `tsc --noEmit` check
   - Fail builds on errors

2. **Visual Diff** (Future)
   - Playwright screenshots
   - Pixel comparison
   - Side-by-side view