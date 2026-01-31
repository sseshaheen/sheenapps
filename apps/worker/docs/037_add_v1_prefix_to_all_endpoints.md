# Migration: Add v1/ Prefix to All Endpoints

**Date**: 2025-08-09  
**Priority**: HIGH - Breaking Change

## Endpoints to Migrate

### 🔴 High Priority - Customer Facing
These endpoints are used by NextJS frontend and need careful migration:

1. **Build & Preview**
   - `/build-preview-for-new-project` → `/v1/build-preview` (already have `/v1/create-preview-for-new-project`)
   - `/api/builds/:buildId/events` → `/v1/builds/:buildId/events`
   - `/api/builds/:buildId/status` → `/v1/builds/:buildId/status`

2. **Project Management**
   - `/projects/:projectId/versions` → `/v1/projects/:projectId/versions` ✅ DONE
   - `/projects/:projectId/versions/milestone` → `/v1/projects/:projectId/versions/milestone` ✅ DONE
   - `/projects/:projectId/publish/:versionId` → `/v1/projects/:projectId/publish`
   - `/projects/:projectId/unpublish` → `/v1/projects/:projectId/unpublish`
   - `/projects/:projectId/domains` → `/v1/projects/:projectId/domains`
   - `/projects/:projectId/publication-status` → `/v1/projects/:projectId/publication-status`

3. **Version Management**
   - `/versions/:userId/:projectId` → `/v1/versions/list/:userId/:projectId`
   - `/versions/:versionId` → `/v1/versions/:versionId`
   - `/versions/:id1/diff/:id2` → `/v1/versions/:id1/diff/:id2`

### 🟡 Medium Priority - Internal/Webhook
4. **Webhooks**
   - `/cf-pages-callback` → `/v1/webhooks/cloudflare-callback`
   - `/api/webhooks/status` → `/v1/webhooks/status`

### 🟢 Low Priority - Admin/Debug
5. **Monitoring & Debug** (Keep without v1/ as they're internal)
   - `/health/*` - Keep as is (health checks)
   - `/cluster/*` - Keep as is (internal cluster management)
   - `/hmac/*` → `/v1/admin/hmac/*` (admin endpoints)
   - `/audit/*` → `/v1/admin/audit/*`
   - `/claude-executor/health` → Keep as is (internal health)

## Migration Strategy

### Phase 1: Add New Routes (Parallel Support)
1. Add new `/v1/` routes alongside existing routes
2. Both routes work during transition period
3. Update documentation to use `/v1/` routes

### Phase 2: Update Clients
1. Update NextJS to use `/v1/` routes
2. Update Postman collection
3. Update any webhooks/callbacks

### Phase 3: Deprecate Old Routes
1. Add deprecation warnings to old routes
2. Monitor usage of old routes
3. Remove old routes after transition period

## Breaking Changes

### For NextJS Team:
```javascript
// OLD
fetch('/projects/123/versions')
fetch('/api/builds/456/events')

// NEW
fetch('/v1/projects/123/versions')
fetch('/v1/builds/456/events')
```

### For Webhooks:
```javascript
// OLD
webhookUrl: 'https://worker.sheenapps.com/cf-pages-callback'

// NEW
webhookUrl: 'https://worker.sheenapps.com/v1/webhooks/cloudflare-callback'
```

## Implementation Plan

1. **Create route mapping utility** to support both old and new routes
2. **Add v1/ routes** without removing old ones
3. **Update HMAC validation** for all new routes
4. **Update documentation**
5. **Coordinate with NextJS team** for client updates
6. **Set deprecation timeline** (suggest 30 days)
7. **Remove old routes** after deprecation period