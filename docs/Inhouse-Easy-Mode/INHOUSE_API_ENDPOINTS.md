# In-House Mode API Endpoints

## Status: ✅ Registered in Worker (Phase 1 Complete)

These endpoints are now accessible via the sheenapps-claude-worker.

---

## Database Gateway API

**Base Path**: `/v1/inhouse/db`

### POST `/v1/inhouse/db/query`
Execute database queries via structured query contract.

**Headers**:
- `Authorization: Bearer {api_key}` OR `x-api-key: {api_key}`

**Body**:
```json
{
  "query": {
    "operation": "select",
    "table": "users",
    "columns": ["id", "email", "created_at"],
    "filters": [
      { "column": "email", "op": "eq", "value": "user@example.com" }
    ],
    "limit": 10
  }
}
```

**Response**:
```json
{
  "data": [...],
  "error": null,
  "status": 200
}
```

---

### GET `/v1/inhouse/db/schema`
Get table schema metadata for a project.

**Headers**:
- `Authorization: Bearer {api_key}` OR `x-api-key: {api_key}`

**Response**:
```json
{
  "project_id": "...",
  "schema_name": "project_abc123",
  "tables": [
    {
      "name": "users",
      "columns": [
        {
          "name": "id",
          "type": "uuid",
          "nullable": false,
          "isPrimaryKey": true
        }
      ]
    }
  ],
  "table_count": 3
}
```

---

### GET `/v1/inhouse/db/health`
Health check for gateway service.

**Response**:
```json
{
  "status": "healthy",
  "service": "inhouse-gateway",
  "timestamp": "2026-01-14T...",
  "features": {
    "query": true,
    "schema": true,
    "rateLimit": true,
    "quotas": true
  }
}
```

---

## Project Management API

**Base Path**: `/v1/inhouse/projects`

### POST `/v1/inhouse/projects`
Create a new Easy Mode project.

**Headers**:
- `x-sheen-signature`: HMAC signature
- `x-sheen-timestamp`: Request timestamp
- `Content-Type: application/json`

**Body**:
```json
{
  "userId": "...",
  "projectName": "My Blog",
  "subdomain": "myblog" // optional, auto-generated if not provided
}
```

**Response**:
```json
{
  "ok": true,
  "data": {
    "projectId": "...",
    "subdomain": "myblog",
    "schemaName": "project_abc123",
    "publicApiKey": "sheen_pk_...",
    "serverApiKey": "sheen_sk_..." // Only returned once!
  }
}
```

---

### POST `/v1/inhouse/projects/{projectId}/tables`
Create a table in project's database schema.

**Headers**:
- `x-sheen-signature`: HMAC signature
- `x-sheen-timestamp`: Request timestamp

**Body**:
```json
{
  "userId": "...",
  "tableName": "posts",
  "columns": [
    {
      "name": "id",
      "type": "uuid",
      "nullable": false,
      "isPrimaryKey": true,
      "defaultValue": "gen_random_uuid()"
    },
    {
      "name": "title",
      "type": "text",
      "nullable": false
    },
    {
      "name": "created_at",
      "type": "timestamptz",
      "nullable": false,
      "defaultValue": "NOW()"
    }
  ]
}
```

---

### GET `/v1/inhouse/projects/{projectId}/api-keys`
List all API keys for a project.

---

### POST `/v1/inhouse/projects/{projectId}/api-keys`
Generate a new API key (public or server).

---

### DELETE `/v1/inhouse/projects/{projectId}/api-keys/{prefix}`
Revoke an API key by its prefix.

---

## Phase 3 Placeholder API

**Base Path**: `/v1/inhouse/projects/{projectId}`

These endpoints are stubbed and return placeholder responses until Phase 3 is implemented.
Feature flags in `INHOUSE_INFRA_SETUP.md` control when they return real data.

### POST `/v1/inhouse/projects/{projectId}/domains`
Request a custom domain.

**Body**:
```json
{
  "domain": "app.example.com"
}
```

---

### GET `/v1/inhouse/projects/{projectId}/domains`
List current domains for the project.

---

### POST `/v1/inhouse/projects/{projectId}/domains/{domain}/verify`
Placeholder DNS + SSL verification check.

---

### POST `/v1/inhouse/projects/{projectId}/exports`
Request a data export snapshot.

---

### POST `/v1/inhouse/projects/{projectId}/eject`
Start the Pro Mode eject flow.

---

## Admin API (Internal)

### GET `/v1/admin/inhouse/eject-requests`
List Easy Mode eject requests (admin visibility).

---

## Deployment API

**Base Path**: `/v1/inhouse/deploy`

### POST `/v1/inhouse/deploy`
Deploy a build to Easy Mode hosting.

**Headers**:
- `x-sheen-signature`: HMAC signature
- `x-sheen-timestamp`: Request timestamp

**Body**:
```json
{
  "userId": "...",
  "projectId": "...",
  "buildId": "bld_...",
  "staticAssets": [
    {
      "path": "/index.html",
      "content": "base64...",
      "contentType": "text/html"
    }
  ],
  "serverBundle": {
    "code": "export default { async fetch(req) { ... } }",
    "entryPoint": "index.js"
  },
  "envVars": {
    "API_URL": "https://api.example.com"
  }
}
```

---

## Auth API (Easy Mode User Apps)

**Base Path**: `/v1/inhouse/auth`

**Authentication**:
- `x-api-key: {project_public_key}` for all endpoints
- `Authorization: Bearer {session_token}` for session-protected endpoints

### POST `/v1/inhouse/auth/sign-up`
Create a user with email/password.

**Body**:
```json
{
  "email": "user@example.com",
  "password": "securepassword",
  "metadata": { "name": "Jane" }
}
```

**Response**:
```json
{
  "ok": true,
  "data": {
    "user": {
      "id": "...",
      "email": "user@example.com",
      "emailVerified": false
    }
  }
}
```

### POST `/v1/inhouse/auth/sign-in`
Sign in with email/password.

**Body**:
```json
{
  "email": "user@example.com",
  "password": "securepassword"
}
```

**Response**:
```json
{
  "ok": true,
  "data": {
    "user": { "id": "...", "email": "user@example.com" },
    "session": { "token": "...", "expiresAt": "2026-01-15T..." }
  }
}
```

### POST `/v1/inhouse/auth/magic-link`
Create a magic link token (delivery is handled by the app).

**Body**:
```json
{ "email": "user@example.com" }
```

**Response**:
```json
{
  "ok": true,
  "data": { "token": "...", "expiresAt": "2026-01-15T..." }
}
```

### POST `/v1/inhouse/auth/magic-link/verify`
Verify token and create session.

**Body**:
```json
{ "token": "..." }
```

**Response**:
```json
{
  "ok": true,
  "data": {
    "user": { "id": "...", "email": "user@example.com" },
    "session": { "token": "...", "expiresAt": "2026-01-15T..." }
  }
}
```

### GET `/v1/inhouse/auth/user`
Get current user (requires session token).

### POST `/v1/inhouse/auth/sign-out`
Revoke the current session (requires session token).

---

## CMS API (Easy Mode User Apps)

**Base Path**: `/v1/inhouse/cms`

**Authentication**:
- `x-api-key: {project_public_key}` for read endpoints
- `x-api-key: {project_server_key}` for write endpoints

### GET `/v1/inhouse/cms/types`
List content types.

### POST `/v1/inhouse/cms/types`
Create a content type.

**Body**:
```json
{
  "name": "Blog Posts",
  "slug": "blog-posts",
  "schema": { "fields": [{ "name": "title", "type": "text" }] }
}
```

### GET `/v1/inhouse/cms/entries`
List content entries.

**Query Params**:
- `contentType` (slug) or `contentTypeId`
- `status` (draft|published|archived)
- `locale` (e.g. en)
- `limit`, `offset`

### POST `/v1/inhouse/cms/entries`
Create a content entry.

**Body**:
```json
{
  "contentTypeId": "...",
  "slug": "hello-world",
  "status": "draft",
  "locale": "en",
  "data": { "title": "Hello", "body": "..." }
}
```

### GET `/v1/inhouse/cms/entries/{id}`
Fetch a single entry.

### PATCH `/v1/inhouse/cms/entries/{id}`
Update an entry (data/status/slug/locale).

### GET `/v1/inhouse/cms/media`
List media items.

**Query Params**:
- `limit`, `offset`

**Response**:
```json
{
  "ok": true,
  "data": {
    "entry": {
      "id": "ent_...",
      "contentTypeId": "ct_...",
      "status": "published",
      "data": { "title": "Hello" }
    }
  }
}
```

---

## CMS Admin API (Dashboard)

**Base Path**: `/v1/inhouse/cms/admin`

**Authentication**:
- HMAC signatures (same scheme as `/v1/inhouse/projects/*`)

### GET `/v1/inhouse/cms/admin/types`
List content types for a project.

**Query Params**:
- `projectId`

### POST `/v1/inhouse/cms/admin/types`
Create a content type.

**Body**:
```json
{
  "projectId": "...",
  "name": "Blog",
  "slug": "blog",
  "schema": { "fields": [{ "name": "title", "type": "text" }] }
}
```

### GET `/v1/inhouse/cms/admin/entries`
List entries for a project.

**Query Params**:
- `projectId`
- `contentTypeId` or `contentType` (slug)
- `status` (draft|published|archived)
- `locale` (e.g. en)
- `limit`, `offset`

### POST `/v1/inhouse/cms/admin/entries`
Create a content entry.

**Body**:
```json
{
  "projectId": "...",
  "contentTypeId": "...",
  "slug": "hello-world",
  "status": "draft",
  "locale": "en",
  "data": { "title": "Hello" }
}
```

### PATCH `/v1/inhouse/cms/admin/entries/{id}`
Update an entry.

**Body**:
```json
{
  "projectId": "...",
  "status": "published",
  "data": { "title": "Updated" }
}
```

### GET `/v1/inhouse/cms/admin/media`
List media items.

**Query Params**:
- `projectId`
- `limit`, `offset`

### POST `/v1/inhouse/cms/admin/media`
Upload media (base64 payload).

**Body**:
```json
{
  "projectId": "...",
  "filename": "hero.png",
  "contentBase64": "iVBORw0KGgoAAA...",
  "contentType": "image/png",
  "altText": "Hero image"
}
```

---

### POST `/v1/inhouse/deploy/rollback`
Rollback to a previous deployment.

**Body**:
```json
{
  "userId": "...",
  "projectId": "...",
  "deploymentId": "dpl_previous"
}
```

---

## Security Notes

1. **Gateway Routes** (`/v1/inhouse/db/*`): Use project API keys (public or server)
2. **Project/Deploy Routes**: Use HMAC dual-signature authentication
3. **Rate Limiting**: 100 requests/minute per project (default)
4. **Quotas**: Enforced per-tier (see `TIER_LIMITS` in plan document)
5. **CMS Admin Routes**: HMAC auth only; user CMS routes require API keys

---

## Testing

### Health Check (No Auth)
```bash
curl http://localhost:8081/v1/inhouse/db/health
```

### With API Key
```bash
curl -X POST http://localhost:8081/v1/inhouse/db/query \
  -H "x-api-key: sheen_pk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "query": {
      "operation": "select",
      "table": "users",
      "columns": ["*"],
      "limit": 10
    }
  }'
```

### With HMAC Signature
```bash
# Use createWorkerAuthHeaders() from utils/worker-auth.ts
# See Postman collection for examples
```

---

## Next Steps (Phase 1 Wiring)

- [x] Register routes in server.ts
- [ ] Create UI for Easy Mode project creation
- [ ] Create workspace integration panel
- [ ] Integrate with build pipeline
