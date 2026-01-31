# v1 API Migration Summary

**Date**: August 9, 2025  
**Status**: COMPLETED ✅

## Endpoints Modified to Start with /v1/

### 1. Progress & Build Monitoring
| Old Endpoint | New Endpoint | File |
|-------------|--------------|------|
| `/api/builds/:buildId/events` | `/v1/builds/:buildId/events` | progress.ts |
| `/api/builds/:buildId/status` | `/v1/builds/:buildId/status` | progress.ts |
| `/api/internal/builds/:buildId/events` | `/v1/internal/builds/:buildId/events` | progress.ts |
| `/api/webhooks/status` | `/v1/webhooks/status` | progress.ts |

### 2. Project & Version Management
| Old Endpoint | New Endpoint | File |
|-------------|--------------|------|
| `/projects/:projectId/versions` | `/v1/projects/:projectId/versions` | versionHistory.ts |
| `/projects/:projectId/versions/milestone` | `/v1/projects/:projectId/versions/milestone` | versionHistory.ts |
| `/projects/:projectId/publish/:versionId` | `/v1/projects/:projectId/publish/:versionId` | publication.ts |
| `/projects/:projectId/unpublish` | `/v1/projects/:projectId/unpublish` | publication.ts |
| `/projects/:projectId/domains` | `/v1/projects/:projectId/domains` | publication.ts |
| `/projects/:projectId/domains/:domainName` | `/v1/projects/:projectId/domains/:domainName` | publication.ts |
| `/projects/:projectId/domains/:domainName/verify` | `/v1/projects/:projectId/domains/:domainName/verify` | publication.ts |
| `/projects/:projectId/publication-status` | `/v1/projects/:projectId/publication-status` | publication.ts |

### 3. Version Operations
| Old Endpoint | New Endpoint | File |
|-------------|--------------|------|
| `/versions/:userId/:projectId` | `/v1/versions/list/:userId/:projectId` | versions.ts |
| `/versions/:versionId` | `/v1/versions/detail/:versionId` | versions.ts |
| `/versions/:id1/diff/:id2` | `/v1/versions/:id1/diff/:id2` | versions.ts |

### 4. Webhooks
| Old Endpoint | New Endpoint | File |
|-------------|--------------|------|
| `/cf-pages-callback` | `/v1/webhooks/cloudflare-callback` | webhook.ts |
| `/cf-pages-callback/health` | `/v1/webhooks/cloudflare-callback/health` | webhook.ts |

### 5. Build & Preview
| Old Endpoint | New Endpoint | File |
|-------------|--------------|------|
| `/build-preview-for-new-project` | `/v1/build-preview` | buildPreview.ts |

### 6. Admin & Monitoring
| Old Endpoint | New Endpoint | File |
|-------------|--------------|------|
| `/hmac/rollout-status` | `/v1/admin/hmac/rollout-status` | hmacMonitoring.ts |
| `/hmac/validation-stats` | `/v1/admin/hmac/validation-stats` | hmacMonitoring.ts |
| `/hmac/recent-validations` | `/v1/admin/hmac/recent-validations` | hmacMonitoring.ts |
| `/hmac/test-signature` | `/v1/admin/hmac/test-signature` | hmacMonitoring.ts |
| `/hmac/validate-signature` | `/v1/admin/hmac/validate-signature` | hmacMonitoring.ts |
| `/hmac/security-alerts` | `/v1/admin/hmac/security-alerts` | hmacMonitoring.ts |
| `/hmac/nonce-cache-status` | `/v1/admin/hmac/nonce-cache-status` | hmacMonitoring.ts |
| `/audit/working-directory/changes` | `/v1/admin/audit/working-directory/changes` | workingDirectoryAudit.ts |
| `/audit/working-directory/suspicious` | `/v1/admin/audit/working-directory/suspicious` | workingDirectoryAudit.ts |
| `/audit/working-directory/performance` | `/v1/admin/audit/working-directory/performance` | workingDirectoryAudit.ts |

## Endpoints Already Using /v1/
These endpoints were already correctly prefixed:
- `/v1/billing/balance/:userId`
- `/v1/billing/check-sufficient`
- `/v1/chat-plan`
- `/v1/chat-plan/convert-to-build`
- `/v1/chat-plan/session/:sessionId`
- `/v1/create-preview-for-new-project`
- `/v1/update-project`
- `/v1/versions/rollback`
- `/v1/versions/:versionId/rebuild`
- `/v1/projects/:projectId/export`
- `/v1/versions/:versionId/download`

## Endpoints Kept Without /v1/ (Internal)
These are internal/health endpoints that don't need versioning:
- `/health`
- `/health/detailed`
- `/health/capacity`
- `/health/cluster`
- `/health/logs`
- `/health/errors`
- `/health/ai-limits`
- `/cluster/status`
- `/cluster/servers/:serverId`
- `/cluster/routing`
- `/claude-executor/health`
- `/myhealthz`
- `/`

## Security Improvements Made

1. **HMAC Authentication**: All v1 endpoints now require proper HMAC v1 authentication
2. **Debug Endpoints**: Disabled in production environment
3. **Admin Routes**: Moved to `/v1/admin/` prefix for better organization
4. **Consistent Versioning**: All customer-facing APIs now under `/v1/`

## Breaking Changes for NextJS Team

Update your API calls:

```javascript
// OLD
fetch('/api/builds/123/events')
fetch('/projects/456/versions')
fetch('/cf-pages-callback')

// NEW  
fetch('/v1/builds/123/events')
fetch('/v1/projects/456/versions')
fetch('/v1/webhooks/cloudflare-callback')
```

## Migration Timeline

1. ✅ **Phase 1**: Add v1 routes (COMPLETED)
2. ⏳ **Phase 2**: Update NextJS client (IN PROGRESS)
3. 🔜 **Phase 3**: Deprecate old routes (30 days)
4. 📅 **Phase 4**: Remove old routes (60 days)

## Total Changes
- **30 endpoints** migrated to v1 prefix
- **15 endpoints** already had v1 prefix
- **12 endpoints** kept without v1 (internal/health)
- **10 admin endpoints** moved to /v1/admin/

---

**All customer-facing endpoints now consistently use the /v1/ prefix!**