# SheenApps Mailboxes Service - Implementation Plan

> **Status:** Draft for Review (Updated with Expert Feedback + Architecture Analysis)
> **Last Updated:** 2026-01-26
> **Authors:** Team + Claude Review + External Expert Review

---

## Context / Preface

We're building SheenApps, an AI-powered website/app builder with an In-House Mode: instead of telling users to stitch together third-party services, we provide first-party, built-in equivalents (Supabase-like experience), exposed via SDKs.

### Where We Are Today

- **Platform goal:** Make it dead-simple for non-technical founders (often Arabic-first) to launch products with built-in infrastructure.
- **Architecture:** Multi-tenant backend (Fastify services + Postgres), with "In-House Mode" services exposed through first-party SDK packages (e.g., `@sheenapps/forms`, `@sheenapps/search`, `@sheenapps/db`, etc.).
- **SDK pattern:** Each package has a consistent API style (`createClient({ apiKey })`), standardized results (`{ ok, data, error, status, requestId }`), and enforced key context (public vs server keys).
- **Admin visibility:** We're implementing a canonical activity stream (`inhouse_activity_log`) and an `InhouseActivityLogger` that services use for auditing, monitoring, and admin panel "what happened" views.

### Why We're Proposing "Mailboxes"

Many of our users want email capabilities that go beyond "send transactional emails":

- Send/reply from their real business mailbox (e.g., `support@their-domain.com`)
- Optionally read inbox metadata for workflows (support tickets, CRM, lead routing)
- Handle Bring-Your-Own Domain (BYOD) and email authentication correctly (MX/SPF/DKIM/DMARC), since deliverability and trust matter

Instead of forcing users to integrate providers manually, we want a first-party "mail layer" that normalizes multiple mailbox providers behind one API, starting with:

- **Google Workspace (Gmail API)**
- **Zoho Mail**

### What We Are NOT Building

We are **not** building "a Gmail clone." The intent is:

- A reliable integration layer + SDK
- A domain connect / DNS verifier experience
- A foundation that can later support provisioning (creating mailboxes) if demand proves it's worth the complexity

---

## Questions Requiring Answers Before Starting

> **These 3 questions must be answered to unblock Phase 1:**

### Q1: Is inbox metadata sync required for MVP, or nice-to-have?

**Options:**
- **(A) Required** — Users need to list/get message headers for workflows (support tickets, CRM)
- **(B) Nice-to-have** — Start with send-only, add metadata sync if time permits

**Recommendation:** Start with **(B) nice-to-have** to reduce scope and OAuth complexity. Send is the highest-value feature; metadata sync can follow quickly.

### Q2: Should metadata retention default to OFF or ON?

**Options:**
- **(A) OFF by default** — User explicitly enables per connection
- **(B) ON with short retention** — 30-day default, configurable

**Recommendation:** **(A) OFF by default**. This is safer for compliance/privacy (GDPR, user trust), and explicit opt-in prevents surprise storage costs.

### Q3: Is the primary use case support/tickets/CRM or "mini Gmail"?

**Options:**
- **(A) Support/Tickets/CRM** — Workflows that act on email metadata (routing, auto-response, logging)
- **(B) Mini Gmail** — Users reading/composing emails in our UI

**Recommendation:** **(A) Support/Tickets/CRM** is the right fit. Mini Gmail is scope explosion and competes with Google/Zoho directly.

---

## Expert Review Notes & Concerns

### OAuth & Provider Integration Risks

| Concern | Mitigation |
|---------|------------|
| **Gmail OAuth scope approval** | Request only `gmail.send` + `gmail.readonly` (if metadata sync). Avoid `gmail.modify` until needed. Google's OAuth review can take 4-6 weeks for sensitive scopes. |
| **Zoho OAuth complexity** | Zoho has region-specific OAuth endpoints (`.com`, `.eu`, `.in`). Require region as explicit parameter in `connectStart` (not auto-detection). |
| **OAuth state hijacking** | Use PKCE even for server flows. Store state server-side with TTL, mark single-use. See [OAuth Security](#oauth-security-pkce--state-management) section. |
| **Token refresh races** | Use distributed lock (Redis) when refreshing tokens. Treat tokens as expired if `expiresAt < now + 2 min` to avoid thundering herd at exact expiry boundary. |
| **Rate limits** | Gmail: quota units per minute (not per second), plus daily sending limits (~500/day for Workspace, varies by plan). Implement per-connection rate limiting + daily send caps + burst smoothing. |

### Deliverability & DNS Concerns

| Concern | Mitigation |
|---------|------------|
| **SPF record limits** | SPF allows max 10 DNS lookups. Users with existing SPF may hit limits. DNS wizard should check and warn. |
| **DKIM key rotation** | Google/Zoho manage DKIM keys. We verify presence, not rotation. Document this limitation. |
| **DMARC policy conflicts** | Don't auto-generate DMARC if one exists. Show existing policy and recommendations only. |
| **Propagation delays** | DNS changes take up to 48h. Implement exponential backoff in verification jobs. |

### Security Boundaries

| Concern | Mitigation |
|---------|------------|
| **OAuth token storage** | Use existing `@sheenapps/secrets` pattern with pgcrypto. Tokens encrypted at rest. |
| **Cross-project isolation** | All queries scoped by `project_id`. Consider RLS policy on mail tables. |
| **Token exposure in logs** | Never log tokens. Activity logger metadata should exclude `auth` field. |
| **Connection hijacking** | Validate that `connection.project_id` matches request `projectId` on every operation. |
| **"From" address spoofing** | **Do NOT accept `from` from client.** Server derives `from` from `connection.email_address`. Prevents "send as ceo@..." abuse within a project. Alias support deferred to Phase 2 with verified alias table. |

### Future-Proofing for Phase 2/3

| Future Feature | Design Now |
|----------------|------------|
| **Admin provisioning** | `mail_connections.provider_admin_token` nullable column (Phase 2). |
| **Gmail push (Pub/Sub)** | `mail_connections.push_webhook_url` + `push_expiry` columns (Phase 3). |
| **Thread tracking** | Store `thread_id` in `mail_message_meta` from day 1. |
| **Attachment storage** | Don't store attachments in MVP. Add `mail_attachments` table later. |
| **Encryption key rotation** | Phase 2: Add `encryption_key_id` column to `mail_connections` + maintenance job to re-encrypt with new keys. For MVP, re-encrypt all tokens manually if key compromise occurs. |

### URL Pattern Decision (Critical Architecture Choice)

After analyzing the codebase, there are **two URL patterns** used by in-house services:

| Pattern | Example | Project Resolution | Used By |
|---------|---------|-------------------|---------|
| **Pattern 1** | `/v1/inhouse/db/query` | From API key via HMAC headers | db, auth, forms, notifications, search, storage, secrets, email |
| **Pattern 2** | `/v1/inhouse/projects/:projectId/analytics` | Extracted from API key, included in URL | analytics, payments |

**Decision: Mailboxes will use Pattern 1** (the majority pattern).

**Rationale:**
- Matches 8 of 10 existing services
- Simpler SDK (no `extractProjectId` needed)
- Project isolation enforced server-side via HMAC signature validation
- URL doesn't leak project IDs

**Implementation:**
- Backend routes: `/v1/inhouse/mailboxes/...`
- SDK paths: `/v1/inhouse/mailboxes/...`
- SDK extracts `projectId` from API key (`sheen_sk_<projectId>_<random>`)
- SDK sends `x-project-id` header with every request
- Server reads `projectId` from `x-project-id` header (same as forms, notifications)

> **Note:** There's a bug in `@sheenapps/jobs` - SDK uses Pattern 1 paths but backend expects Pattern 2. This should be fixed separately (recommend migrating jobs backend to Pattern 1 for consistency).

### OAuth Security: PKCE + State Management

**Critical for MVP — do not ship without this.**

OAuth flows must use PKCE and single-use state to prevent CSRF and authorization code injection attacks.

**State Storage Table:**

```sql
CREATE TABLE IF NOT EXISTS inhouse_mail_oauth_state (
  state VARCHAR(64) PRIMARY KEY,  -- Cryptographically random
  project_id UUID NOT NULL,
  provider VARCHAR(20) NOT NULL,
  redirect_uri TEXT NOT NULL,
  code_verifier VARCHAR(128),  -- PKCE: stored server-side, never sent to client
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '15 minutes'),
  consumed_at TIMESTAMPTZ  -- NULL until used, set on callback
);

-- Auto-cleanup expired/consumed states
CREATE INDEX IF NOT EXISTS idx_oauth_state_expires ON inhouse_mail_oauth_state(expires_at);
```

**Flow:**

1. **`connectStart`**: Generate cryptographically random `state` (32 bytes hex) and `code_verifier` (43-128 chars). Store in DB with 15-min TTL. Return `authUrl` with `state` and `code_challenge` (SHA256 of verifier).

2. **`connectCallback`**: Look up `state` in DB. If not found, expired, or already consumed → reject. Mark as consumed. Use stored `code_verifier` to exchange code for tokens.

```typescript
// connectStart implementation
async connectStart(projectId: string, provider: MailProvider, input: ConnectStartInput) {
  const state = crypto.randomBytes(32).toString('hex')
  const codeVerifier = crypto.randomBytes(64).toString('base64url').slice(0, 128)
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url')

  await this.pool.query(
    `INSERT INTO inhouse_mail_oauth_state (state, project_id, provider, redirect_uri, code_verifier)
     VALUES ($1, $2, $3, $4, $5)`,
    [state, projectId, provider, input.redirectUri, codeVerifier]
  )

  const authUrl = this.adapter.getAuthUrl({
    redirectUri: input.redirectUri,
    state,
    codeChallenge,
    codeChallengeMethod: 'S256',
    scopes: input.scopes,
    region: input.region,  // Required for Zoho
  })

  return { authUrl, state }
}

// connectCallback implementation
async connectCallback(projectId: string, provider: MailProvider, input: ConnectCallbackInput) {
  const stateRow = await this.pool.query(
    `SELECT * FROM inhouse_mail_oauth_state
     WHERE state = $1 AND project_id = $2 AND provider = $3
       AND expires_at > NOW() AND consumed_at IS NULL`,
    [input.state, projectId, provider]
  )

  if (stateRow.rows.length === 0) {
    throw new MailboxError('INVALID_OAUTH_STATE', 'OAuth state invalid, expired, or already used')
  }

  // Mark consumed immediately (single-use)
  await this.pool.query(
    `UPDATE inhouse_mail_oauth_state SET consumed_at = NOW() WHERE state = $1`,
    [input.state]
  )

  const { code_verifier, redirect_uri } = stateRow.rows[0]

  // Exchange code with PKCE verifier
  const tokens = await this.adapter.exchangeCode({
    code: input.code,
    redirectUri: redirect_uri,
    codeVerifier: code_verifier,
  })

  // ... create connection with tokens
}
```

---

## MVP Scope Definition

### Supported Providers (MVP)

| Provider | Connect | Send | Metadata Sync |
|----------|---------|------|---------------|
| Google Workspace (Gmail API) | Yes | Yes | Yes (if Q1=A) |
| Zoho Mail | Yes | Yes | Later (API stability concerns) |

### Capabilities (MVP)

- Connect provider mailbox via OAuth
- Send email through provider API (from connected mailbox)
- Read inbox message metadata: subject, from, to, date, thread_id, snippet (if Q1=A)
- Domain BYOD wizard + DNS verifier (MX/SPF/DKIM/DMARC) - Phase 1.5, parallel

### Explicit Non-Goals (MVP)

- Provision mailboxes (admin creation) — Phase 2
- Full email client UI — never (we're an integration layer)
- Attachment storage, body storage, full-text search — Phase 3
- Real-time inbound events — Phase 3 (polling first, Gmail watch later)

---

## Architecture

### New Components

```
┌─────────────────────────────────────────────────────────────────┐
│                     @sheenapps/mailboxes                        │
│                     (Server-only SDK)                           │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTPS + HMAC
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│              src/routes/inhouseMailboxes.ts                     │
│              (Fastify HTTP endpoints)                           │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│         src/services/inhouse/InhouseMailboxesService.ts         │
│         (Business logic, provider routing)                      │
└──────────────────────────┬──────────────────────────────────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────────┐
        │  Google  │ │   Zoho   │ │   Future     │
        │  Adapter │ │  Adapter │ │   Adapters   │
        └──────────┘ └──────────┘ └──────────────┘
```

### Provider Adapter Interface

```typescript
// src/services/inhouse/mailboxes/types.ts

export type MailProvider = 'google' | 'zoho'

export interface MailConnectionContext {
  projectId: string
  connectionId: string
  provider: MailProvider
  emailAddress: string
  // Decrypted auth tokens - NEVER log this
  auth: {
    accessToken: string
    refreshToken: string
    expiresAt: string
    region?: string  // Zoho-specific
  }
}

// NOTE: No `from` field - server derives from connection.email_address
// This prevents "send as ceo@..." spoofing abuse within a project
export interface SendEmailInput {
  connectionId: string    // Which mailbox to send from
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  text?: string
  html?: string
  replyTo?: string
  inReplyTo?: string      // For threading
  references?: string[]   // For threading
  headers?: Record<string, string>
  idempotencyKey?: string
}

// Internal: passed to adapter after resolving connection
export interface AdapterSendInput {
  from: string            // Derived from connection.email_address
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  text?: string
  html?: string
  replyTo?: string
  inReplyTo?: string
  references?: string[]
  headers?: Record<string, string>
}

export interface SendEmailResult {
  providerMessageId: string
  threadId?: string
}

export interface ListMessagesInput {
  folder?: 'inbox' | 'sent' | 'all'
  limit?: number           // Default 50, max 100
  cursor?: string          // Provider-specific pagination token
  query?: string           // Provider-specific search query
}

export interface MessageMeta {
  providerMessageId: string
  threadId?: string
  from: string
  to: string[]
  cc?: string[]
  subject: string
  date: string             // ISO 8601
  snippet?: string
  labels?: string[]
  isRead?: boolean
}

export interface ListMessagesResult {
  messages: MessageMeta[]
  nextCursor?: string
}

export interface MailProviderAdapter {
  provider: MailProvider

  // OAuth
  getAuthUrl(input: { redirectUri: string; state: string; scopes?: string[] }): string
  exchangeCode(input: { code: string; redirectUri: string }): Promise<{
    accessToken: string
    refreshToken: string
    expiresAt: string
    emailAddress: string
    region?: string
  }>
  refreshToken(auth: MailConnectionContext['auth']): Promise<{
    accessToken: string
    expiresAt: string
  }>

  // Send (receives AdapterSendInput with `from` derived from connection)
  send(ctx: MailConnectionContext, input: AdapterSendInput): Promise<SendEmailResult>

  // Read metadata (optional for some providers in MVP)
  listMessages?(ctx: MailConnectionContext, input: ListMessagesInput): Promise<ListMessagesResult>
  getMessage?(ctx: MailConnectionContext, providerMessageId: string): Promise<MessageMeta>
}
```

---

## Data Model

### Tables

```sql
-- Migration: 0XX_create_mail_tables.sql

-- =============================================================================
-- mail_connections: OAuth-connected mailboxes
-- =============================================================================
CREATE TABLE IF NOT EXISTS inhouse_mail_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  provider VARCHAR(20) NOT NULL,  -- 'google' | 'zoho'
  email_address VARCHAR(320) NOT NULL,
  display_name VARCHAR(200),

  -- Encrypted via pgcrypto (same pattern as inhouse_secrets)
  encrypted_auth BYTEA NOT NULL,

  -- OAuth metadata
  scopes TEXT[] NOT NULL DEFAULT '{}',
  token_expires_at TIMESTAMPTZ,
  region VARCHAR(20),  -- Zoho: 'com' | 'eu' | 'in' | 'com.au' | 'com.cn'

  -- Sync settings
  metadata_sync_enabled BOOLEAN NOT NULL DEFAULT FALSE,

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'active',  -- 'active' | 'expired' | 'revoked' | 'error'
  last_error_code VARCHAR(50),
  last_error_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Include provider in unique constraint: same email could theoretically
  -- be connected via different providers (rare but possible)
  CONSTRAINT uq_project_provider_email UNIQUE (project_id, provider, email_address)
);

CREATE INDEX IF NOT EXISTS idx_mail_connections_project
  ON inhouse_mail_connections(project_id);
CREATE INDEX IF NOT EXISTS idx_mail_connections_status
  ON inhouse_mail_connections(project_id, status);

-- =============================================================================
-- mail_domains: BYOD domain verification status
-- =============================================================================
CREATE TABLE IF NOT EXISTS inhouse_mail_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  domain VARCHAR(255) NOT NULL,
  provider_target VARCHAR(20) NOT NULL,  -- Which provider this domain routes to

  -- DNS plan (what records to add)
  dns_plan JSONB NOT NULL DEFAULT '{}',
  /*
    {
      "mx": [{ "host": "@", "value": "...", "priority": 10 }],
      "spf": { "host": "@", "value": "v=spf1 include:... ~all" },
      "dkim": { "host": "google._domainkey", "value": "..." },
      "dmarc": { "host": "_dmarc", "value": "v=DMARC1; p=none; ..." }
    }
  */

  -- Verification status
  dns_status JSONB NOT NULL DEFAULT '{}',
  /*
    {
      "mx": { "verified": true, "checkedAt": "..." },
      "spf": { "verified": true, "checkedAt": "..." },
      "dkim": { "verified": false, "error": "Record not found", "checkedAt": "..." },
      "dmarc": { "verified": false, "error": "Policy too weak", "checkedAt": "..." }
    }
  */

  verified_at TIMESTAMPTZ,  -- All critical records verified
  last_checked_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_project_domain UNIQUE (project_id, domain)
);

CREATE INDEX IF NOT EXISTS idx_mail_domains_project
  ON inhouse_mail_domains(project_id);

-- =============================================================================
-- mail_message_meta: Synced inbox metadata (optional feature)
-- =============================================================================
CREATE TABLE IF NOT EXISTS inhouse_mail_message_meta (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES inhouse_mail_connections(id) ON DELETE CASCADE,

  provider_message_id VARCHAR(255) NOT NULL,
  thread_id VARCHAR(255),

  folder VARCHAR(20) NOT NULL DEFAULT 'inbox',  -- 'inbox' | 'sent'
  from_email VARCHAR(320),
  to_emails TEXT[] NOT NULL DEFAULT '{}',
  cc_emails TEXT[] DEFAULT '{}',
  subject TEXT,
  date TIMESTAMPTZ,
  snippet TEXT,  -- First ~200 chars
  labels TEXT[] DEFAULT '{}',
  is_read BOOLEAN DEFAULT FALSE,

  -- For future expansion
  raw_headers JSONB,

  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_connection_message UNIQUE (connection_id, provider_message_id)
);

CREATE INDEX IF NOT EXISTS idx_mail_meta_connection
  ON inhouse_mail_message_meta(connection_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_mail_meta_project
  ON inhouse_mail_message_meta(project_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_mail_meta_thread
  ON inhouse_mail_message_meta(connection_id, thread_id);

-- =============================================================================
-- mail_sync_state: Cursor tracking for incremental sync
-- =============================================================================
CREATE TABLE IF NOT EXISTS inhouse_mail_sync_state (
  connection_id UUID PRIMARY KEY REFERENCES inhouse_mail_connections(id) ON DELETE CASCADE,

  -- Provider-specific cursor (e.g., Gmail historyId, Zoho modifiedSince)
  cursor VARCHAR(255),

  last_synced_at TIMESTAMPTZ,
  last_sync_error VARCHAR(100),
  consecutive_errors INTEGER NOT NULL DEFAULT 0,

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- mail_send_log: Idempotency + audit trail for sends
-- =============================================================================
CREATE TABLE IF NOT EXISTS inhouse_mail_send_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  connection_id UUID NOT NULL REFERENCES inhouse_mail_connections(id) ON DELETE CASCADE,

  idempotency_key VARCHAR(255),

  -- Send details
  from_email VARCHAR(320) NOT NULL,
  to_emails TEXT[] NOT NULL,
  cc_emails TEXT[] DEFAULT '{}',
  bcc_emails TEXT[] DEFAULT '{}',
  subject TEXT,

  -- Provider response
  provider_message_id VARCHAR(255),
  thread_id VARCHAR(255),

  status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- 'pending' | 'sent' | 'failed'
  error_code VARCHAR(50),
  error_message TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,

  CONSTRAINT uq_project_idempotency UNIQUE (project_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_mail_send_project
  ON inhouse_mail_send_log(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mail_send_connection
  ON inhouse_mail_send_log(connection_id, created_at DESC);

-- =============================================================================
-- mail_oauth_state: PKCE + single-use state for OAuth security
-- =============================================================================
CREATE TABLE IF NOT EXISTS inhouse_mail_oauth_state (
  state VARCHAR(64) PRIMARY KEY,  -- Cryptographically random (32 bytes hex)
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  provider VARCHAR(20) NOT NULL,
  redirect_uri TEXT NOT NULL,
  code_verifier VARCHAR(128) NOT NULL,  -- PKCE: stored server-side, never sent to client
  region VARCHAR(20),  -- Zoho only
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '15 minutes'),
  consumed_at TIMESTAMPTZ  -- NULL until used, set on callback
);

-- Cleanup job deletes expired/consumed states
CREATE INDEX IF NOT EXISTS idx_oauth_state_expires
  ON inhouse_mail_oauth_state(expires_at);
CREATE INDEX IF NOT EXISTS idx_oauth_state_project
  ON inhouse_mail_oauth_state(project_id);

-- =============================================================================
-- mail_daily_send_count: Track daily sends per connection for provider limits
-- =============================================================================
CREATE TABLE IF NOT EXISTS inhouse_mail_daily_send_count (
  connection_id UUID NOT NULL REFERENCES inhouse_mail_connections(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  send_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (connection_id, date)
);

-- Cleanup: delete rows older than 7 days
CREATE INDEX IF NOT EXISTS idx_daily_send_date
  ON inhouse_mail_daily_send_count(date);
```

### Encryption Pattern

Following existing `@sheenapps/secrets` pattern:

```typescript
// Use pgcrypto for encryption at rest
const ENCRYPTION_KEY = process.env.INHOUSE_SECRETS_ENCRYPTION_KEY

// Encrypt before insert
const encryptedAuth = await pool.query(
  `SELECT pgp_sym_encrypt($1::text, $2) as encrypted`,
  [JSON.stringify(authTokens), ENCRYPTION_KEY]
)

// Decrypt when reading
const decrypted = await pool.query(
  `SELECT pgp_sym_decrypt(encrypted_auth, $1) as auth FROM inhouse_mail_connections WHERE id = $2`,
  [ENCRYPTION_KEY, connectionId]
)
```

---

## API Surface

### Routes (src/routes/inhouseMailboxes.ts)

> **Pattern 1 (Majority Pattern):** No projectId in URL.
> Project resolved from `x-api-key` header server-side via HMAC validation.
> Matches: db, auth, forms, notifications, search, storage, secrets, email.

```typescript
// =============================================================================
// OAUTH CONNECT FLOW
// =============================================================================

// Start OAuth flow - returns URL to redirect user
POST /v1/inhouse/mailboxes/connect/:provider/start
Body: {
  redirectUri: string;
  scopes?: string[];
  region?: string;  // Required for Zoho: 'com' | 'eu' | 'in' | 'com.au' | 'com.cn'
}
Response: { ok: true, data: { authUrl: string; state: string } }

// Handle OAuth callback - exchanges code for tokens
POST /v1/inhouse/mailboxes/connect/:provider/callback
Body: { code: string; state: string; redirectUri: string }
Response: { ok: true, data: { connectionId: string; emailAddress: string } }

// =============================================================================
// CONNECTION MANAGEMENT
// =============================================================================

// List connections
GET /v1/inhouse/mailboxes/connections
Response: { ok: true, data: { connections: Connection[] } }

// Get connection
GET /v1/inhouse/mailboxes/connections/:connectionId
Response: { ok: true, data: Connection }

// Update connection settings
PATCH /v1/inhouse/mailboxes/connections/:connectionId
Body: { metadataSyncEnabled?: boolean; displayName?: string }
Response: { ok: true, data: Connection }

// Disconnect (revoke + delete)
DELETE /v1/inhouse/mailboxes/connections/:connectionId
Response: { ok: true }

// =============================================================================
// SEND EMAIL
// =============================================================================

// NOTE: No `from` field - derived from connection.email_address server-side
POST /v1/inhouse/mailboxes/send
Body: {
  connectionId: string;  // Which mailbox to send from (from = connection.email_address)
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
  inReplyTo?: string;
  references?: string[];
  idempotencyKey?: string;
}
Response: { ok: true, data: { providerMessageId: string; threadId?: string; from: string } }

// =============================================================================
// MESSAGE METADATA (if metadata sync enabled)
// =============================================================================

// Trigger sync job
POST /v1/inhouse/mailboxes/connections/:connectionId/sync
Response: { ok: true, data: { jobId: string } }

// List messages
GET /v1/inhouse/mailboxes/messages
Query: { connectionId: string; folder?: string; limit?: number; cursor?: string }
Response: { ok: true, data: { messages: MessageMeta[]; nextCursor?: string } }

// Get message
GET /v1/inhouse/mailboxes/messages/:messageId
Response: { ok: true, data: MessageMeta }

// =============================================================================
// DOMAIN VERIFICATION (BYOD)
// =============================================================================

// Add domain + generate DNS plan
POST /v1/inhouse/mailboxes/domains
Body: { domain: string; providerTarget: 'google' | 'zoho' }
Response: { ok: true, data: { domainId: string; dnsPlan: DnsPlan } }

// Check DNS status
POST /v1/inhouse/mailboxes/domains/:domainId/check
Response: { ok: true, data: { dnsStatus: DnsStatus; allVerified: boolean } }

// List domains
GET /v1/inhouse/mailboxes/domains
Response: { ok: true, data: { domains: Domain[] } }

// Remove domain
DELETE /v1/inhouse/mailboxes/domains/:domainId
Response: { ok: true }
```

---

## SDK Design (@sheenapps/mailboxes)

### Package Structure

```
sheenapps-packages/mailboxes/
├── src/
│   ├── index.ts        # Exports
│   ├── client.ts       # SheenAppsMailboxesClient
│   └── types.ts        # TypeScript interfaces
├── package.json
├── tsconfig.json
└── README.md
```

### Client Implementation

```typescript
// src/client.ts
import type {
  ClientConfig,
  FetchResult,
  Connection,
  SendEmailInput,
  SendEmailResult,
  MessageMeta,
  ListMessagesInput,
  ListMessagesResult,
  Domain,
  DnsPlan,
  DnsStatus,
} from './types'

const SDK_VERSION = '0.1.0'
const DEFAULT_TIMEOUT = 30_000

// Extract projectId from API key (format: sheen_sk_<projectId>_<random>)
function extractProjectId(apiKey: string): string | null {
  const parts = apiKey.split('_')
  if (parts.length >= 3) {
    return parts[2]
  }
  return null
}

export class SheenAppsMailboxesClient {
  private config: Required<ClientConfig>
  private projectId: string | null
  private contextError: { code: string; message: string } | null = null

  constructor(config: ClientConfig) {
    // Validate API key format
    if (!config.apiKey?.startsWith('sheen_sk_')) {
      throw new Error('apiKey must be a server key (sheen_sk_*)')
    }

    // Extract projectId from API key
    this.projectId = extractProjectId(config.apiKey)
    if (!this.projectId) {
      throw new Error('Could not extract projectId from API key')
    }

    // Block browser usage
    if (typeof window !== 'undefined') {
      this.contextError = {
        code: 'INVALID_KEY_CONTEXT',
        message: 'Mailboxes SDK must only be used server-side',
      }
    }

    this.config = {
      apiKey: config.apiKey,
      apiUrl: config.apiUrl || 'https://api.sheenapps.com',
      timeout: config.timeout || DEFAULT_TIMEOUT,
      headers: config.headers || {},
      fetch: config.fetch || globalThis.fetch,
    }
  }

  // ===========================================================================
  // OAuth Connect
  // ===========================================================================

  async connectStart(
    provider: 'google' | 'zoho',
    input: {
      redirectUri: string;
      scopes?: string[];
      region?: 'com' | 'eu' | 'in' | 'com.au' | 'com.cn';  // Required for Zoho
    }
  ): Promise<FetchResult<{ authUrl: string; state: string }>> {
    return this.post(`/connect/${provider}/start`, input)
  }

  async connectCallback(
    provider: 'google' | 'zoho',
    input: { code: string; state: string; redirectUri: string }
  ): Promise<FetchResult<{ connectionId: string; emailAddress: string }>> {
    return this.post(`/connect/${provider}/callback`, input)
  }

  // ===========================================================================
  // Connection Management
  // ===========================================================================

  async listConnections(): Promise<FetchResult<{ connections: Connection[] }>> {
    return this.get('/connections')
  }

  async getConnection(connectionId: string): Promise<FetchResult<Connection>> {
    return this.get(`/connections/${connectionId}`)
  }

  async updateConnection(
    connectionId: string,
    input: { metadataSyncEnabled?: boolean; displayName?: string }
  ): Promise<FetchResult<Connection>> {
    return this.patch(`/connections/${connectionId}`, input)
  }

  async disconnect(connectionId: string): Promise<FetchResult<void>> {
    return this.delete(`/connections/${connectionId}`)
  }

  // ===========================================================================
  // Send Email
  // ===========================================================================

  // NOTE: No `from` field - server derives from connection.email_address
  async send(input: Omit<SendEmailInput, 'from'>): Promise<FetchResult<SendEmailResult & { from: string }>> {
    return this.post('/send', input)
  }

  // ===========================================================================
  // Message Metadata
  // ===========================================================================

  async triggerSync(connectionId: string): Promise<FetchResult<{ jobId: string }>> {
    return this.post(`/connections/${connectionId}/sync`, {})
  }

  async listMessages(input: ListMessagesInput): Promise<FetchResult<ListMessagesResult>> {
    const params = new URLSearchParams()
    params.set('connectionId', input.connectionId)
    if (input.folder) params.set('folder', input.folder)
    if (input.limit) params.set('limit', String(input.limit))
    if (input.cursor) params.set('cursor', input.cursor)
    return this.get(`/messages?${params}`)
  }

  async getMessage(messageId: string): Promise<FetchResult<MessageMeta>> {
    return this.get(`/messages/${messageId}`)
  }

  // ===========================================================================
  // Domain Verification
  // ===========================================================================

  async addDomain(input: {
    domain: string
    providerTarget: 'google' | 'zoho'
  }): Promise<FetchResult<{ domainId: string; dnsPlan: DnsPlan }>> {
    return this.post('/domains', input)
  }

  async checkDomain(domainId: string): Promise<FetchResult<{ dnsStatus: DnsStatus; allVerified: boolean }>> {
    return this.post(`/domains/${domainId}/check`, {})
  }

  async listDomains(): Promise<FetchResult<{ domains: Domain[] }>> {
    return this.get('/domains')
  }

  async removeDomain(domainId: string): Promise<FetchResult<void>> {
    return this.delete(`/domains/${domainId}`)
  }

  // ===========================================================================
  // HTTP Layer (matches other SDK patterns)
  // ===========================================================================

  private async fetch<T>(path: string, options: RequestInit): Promise<FetchResult<T>> {
    if (this.contextError) {
      return {
        ok: false,
        status: 0,
        statusText: 'Context Error',
        data: null,
        error: this.contextError,
      }
    }

    // Pattern 1: No projectId in URL
    // Project resolved from x-api-key header server-side via HMAC validation
    // Matches: db, auth, forms, notifications, search, storage, secrets, email
    const url = `${this.config.apiUrl}/v1/inhouse/mailboxes${path}`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout)

    try {
      const response = await this.config.fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'x-api-key': this.config.apiKey,
          'x-project-id': this.projectId!,  // Send projectId in header (Pattern 1)
          'X-SheenApps-SDK': `mailboxes/${SDK_VERSION}`,
          ...this.config.headers,
          ...options.headers,
        },
      })

      const requestId = response.headers.get('x-request-id') || undefined
      const body = await response.json()

      if (!response.ok || body.ok === false) {
        return {
          ok: false,
          status: response.status,
          statusText: response.statusText,
          data: null,
          error: body.error || { code: 'UNKNOWN_ERROR', message: 'Request failed' },
          requestId,
        }
      }

      return {
        ok: true,
        status: response.status,
        statusText: response.statusText,
        data: body.data,
        error: null,
        requestId,
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        return {
          ok: false,
          status: 0,
          statusText: 'Timeout',
          data: null,
          error: { code: 'TIMEOUT', message: 'Request timed out', retryable: true },
        }
      }
      return {
        ok: false,
        status: 0,
        statusText: 'Network Error',
        data: null,
        error: { code: 'NETWORK_ERROR', message: error.message, retryable: true },
      }
    } finally {
      clearTimeout(timeoutId)
    }
  }

  private get<T>(path: string): Promise<FetchResult<T>> {
    return this.fetch(path, { method: 'GET' })
  }

  private post<T>(path: string, body: unknown): Promise<FetchResult<T>> {
    return this.fetch(path, { method: 'POST', body: JSON.stringify(body) })
  }

  private patch<T>(path: string, body: unknown): Promise<FetchResult<T>> {
    return this.fetch(path, { method: 'PATCH', body: JSON.stringify(body) })
  }

  private delete<T>(path: string): Promise<FetchResult<T>> {
    return this.fetch(path, { method: 'DELETE' })
  }
}

export function createClient(config: ClientConfig): SheenAppsMailboxesClient {
  return new SheenAppsMailboxesClient(config)
}
```

---

## Jobs & Background Processing

### Job Definitions (using existing @sheenapps/jobs infrastructure)

```typescript
// Job: mail_sync
// Purpose: Incrementally sync message metadata from provider
// Trigger: Manual via API, or scheduled (e.g., every 15 min for active connections)

interface MailSyncJobPayload {
  connectionId: string
  projectId: string
  full?: boolean  // Force full sync instead of incremental
}

// Job: mail_domain_check
// Purpose: Verify DNS records for a domain
// Trigger: Manual via API, or scheduled (hourly for unverified domains)

interface MailDomainCheckJobPayload {
  domainId: string
  projectId: string
}

// Job: mail_token_refresh
// Purpose: Proactively refresh tokens before expiry
// Trigger: Scheduled (check all tokens expiring in < 1 hour)

interface MailTokenRefreshJobPayload {
  connectionId: string
  projectId: string
}
```

### Idempotency for Send

```typescript
// In InhouseMailboxesService.send()

async send(projectId: string, input: SendEmailInput): Promise<SendEmailResult> {
  // Check idempotency
  if (input.idempotencyKey) {
    const existing = await this.pool.query(
      `SELECT provider_message_id, thread_id, status, error_code
       FROM inhouse_mail_send_log
       WHERE project_id = $1 AND idempotency_key = $2`,
      [projectId, input.idempotencyKey]
    )

    if (existing.rows.length > 0) {
      const row = existing.rows[0]
      if (row.status === 'sent') {
        return { providerMessageId: row.provider_message_id, threadId: row.thread_id }
      }
      if (row.status === 'failed') {
        throw new MailboxError(row.error_code, 'Previous send attempt failed')
      }
      // status === 'pending' means in-flight, return conflict
      throw new MailboxError('SEND_IN_PROGRESS', 'Send already in progress')
    }
  }

  // Insert pending record
  const logId = await this.insertSendLog(projectId, input, 'pending')

  try {
    const result = await this.adapter.send(ctx, input)
    await this.updateSendLog(logId, 'sent', result)
    return result
  } catch (error) {
    await this.updateSendLog(logId, 'failed', null, error)
    throw error
  }
}
```

---

## Observability

### Activity Logger Integration

```typescript
// Service types to add: 'mailboxes'
// Actions: connect_start, connect_callback, disconnect, send, sync_start, sync_complete,
//          sync_error, domain_add, domain_check, token_refresh, token_refresh_error

// Example usage in service
import { startActivityTimer, logActivity } from '../InhouseActivityLogger'

async send(projectId: string, userId: string | null, input: SendEmailInput) {
  const timer = startActivityTimer({
    projectId,
    service: 'mailboxes',
    action: 'send',
    actorType: userId ? 'user' : 'system',
    actorId: userId,
    resourceType: 'connection',
    resourceId: input.connectionId,
    metadata: {
      provider: connection.provider,
      toCount: input.to.length,
      hasHtml: !!input.html,
      hasIdempotencyKey: !!input.idempotencyKey,
    },
  })

  try {
    const result = await this.doSend(input)
    timer.success({
      resourceId: result.providerMessageId,
      metadata: { threadId: result.threadId },
    })
    return result
  } catch (error: any) {
    timer.error(error.code || 'SEND_FAILED', {
      metadata: { message: error.message },
    })
    throw error
  }
}
```

### Metering Integration

```typescript
// New metrics to add:
// - mail_connections_created
// - mail_sends
// - mail_syncs
// - mail_domains_added

// In route handler
const metering = getInhouseMeteringService()
const quota = await metering.checkQuota(projectId, 'mail_sends', 1)
if (!quota.allowed) {
  return reply.code(429).send({
    ok: false,
    error: { code: 'QUOTA_EXCEEDED', message: 'Monthly email send limit reached' },
  })
}

// After successful send
await metering.recordUsage(projectId, 'mail_sends', 1)
```

---

## Phase Breakdown

### Phase 0: Decisions + Setup (1-2 days)

- [ ] **Answer the 3 blocking questions** (Q1, Q2, Q3 above)
- [ ] Define OAuth scopes:
  - Google: `https://www.googleapis.com/auth/gmail.send` (required), `https://www.googleapis.com/auth/gmail.readonly` (if metadata sync)
  - Zoho: `ZohoMail.messages.CREATE`, `ZohoMail.messages.READ` (if metadata sync)
- [ ] Create Google Cloud project + OAuth consent screen (sensitive scope review takes time)
- [ ] Create Zoho developer app
- [ ] Define metadata retention policy (if enabled): default 30 days, configurable 7-90 days
- [ ] Confirm plan quotas: X connections, Y sends/month per tier

### Phase 1: MVP Core (2-4 weeks)

#### Week 1-2: Foundation
- [ ] Database migration: `0XX_create_mail_tables.sql` (includes `oauth_state`, `daily_send_count`)
- [ ] Service scaffolding: `InhouseMailboxesService.ts`
- [ ] Provider adapter interface + Google adapter skeleton
- [ ] Routes scaffolding: `inhouseMailboxes.ts`
- [ ] SDK package: `@sheenapps/mailboxes` with types and client
- [ ] PKCE + state management implementation (see OAuth Security section)

#### Week 2-3: Google Integration
- [ ] Google OAuth flow with PKCE (start → callback → token storage)
- [ ] Token refresh with distributed locking (treat as expired if `expiresAt < now + 2min`)
- [ ] Google send implementation (Gmail API messages.send)
- [ ] Daily send cap tracking per connection (`mail_daily_send_count` table)
- [ ] Google metadata sync (if Q1=A): messages.list + incremental via historyId
- [ ] Error handling: token expiry, rate limits, daily limit errors, history expiration

#### Week 3-4: Polish + Zoho
- [ ] Zoho OAuth flow (region as explicit parameter, not detection)
- [ ] Zoho send implementation
- [ ] Activity logging integration
- [ ] Metering integration
- [ ] Admin panel: connections list, send log, connection health
- [ ] Retention jobs:
  - [ ] `mail_message_meta` cleanup: delete rows older than connection's retention setting (default 30 days if enabled)
  - [ ] `mail_send_log` cleanup: keep for audit (90 days default), then archive/delete
  - [ ] `inhouse_mail_oauth_state` cleanup: delete expired/consumed states (automatic via TTL check)

### Phase 1.5: BYOD Domain Connect (1-2 weeks, parallel with Week 3-4)

- [ ] DNS plan generator per provider (MX, SPF include, DKIM selector, DMARC recommendation)
- [ ] DNS lookup service (MX, TXT queries via `dns` module or DoH)
- [ ] Domain check job with exponential backoff
- [ ] UI: domain wizard showing required records + verification status
- [ ] Periodic health check job (detect DNS drift)

### Phase 2: Admin Provisioning (Future, 4-8 weeks)

> **Not MVP** — requires elevated API access, more complex compliance

- [ ] Google Workspace Admin SDK integration
- [ ] Create/delete users, manage aliases
- [ ] Zoho admin API integration (if available)
- [ ] Org-level consent flows
- [ ] Stricter audit logging

### Phase 3: Real-time + Rich Features (Future)

- [ ] Gmail push notifications (Pub/Sub watch)
- [ ] Thread/conversation grouping
- [ ] Attachment metadata (not storage)
- [ ] Integration with `@sheenapps/search` for message search
- [ ] Webhooks for inbound email events

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Google OAuth scope review delays | High | High | Start consent screen submission in Phase 0, use "testing" mode initially |
| Zoho API instability/undocumented behavior | Medium | Medium | Start with Google only, add Zoho as stable secondary |
| Token refresh race conditions | Medium | High | Distributed lock with Redis, treat as expired if `expiresAt < now + 2min` |
| User connects mailbox then revokes externally | High | Low | Handle 401 errors gracefully, mark connection as `revoked` |
| DNS propagation causes user confusion | High | Low | Clear UI messaging about 24-48h propagation, auto-retry checks |
| Email deliverability issues (SPF/DKIM) | Medium | High | BYOD wizard verifies all records before showing "verified" |
| Gmail History API cursor expiration | Medium | Medium | If `historyId` is too old (>7 days), Gmail rejects. Detect and trigger full re-sync. |
| Provider daily send limit reached | Medium | Low | Track daily sends per connection, warn before limit, clear error when hit |

---

## Appendix: Provider-Specific Notes

### Google Workspace / Gmail API

**OAuth Scopes:**
- `gmail.send` — Send emails only (sufficient for MVP send)
- `gmail.readonly` — Read messages (required for metadata sync)
- `gmail.modify` — Modify labels/read status (Phase 3)

**Rate Limits & Quotas:**
- API quota: measured in quota units per minute (not per second), varies by endpoint
- `messages.send`: 100 quota units per call
- Daily sending limits: ~500 emails/day for trial Workspace, 2000/day for paid, varies by plan
- Separate limits: recipients per message, messages per day, per minute burst
- Implement: per-connection rate limiter + daily send counter + burst smoothing
- Display clear error when provider returns `rateLimitExceeded` or daily limit reached

**Incremental Sync:**
- Use `history.list` with `startHistoryId` for incremental
- `historyId` changes on any mailbox modification
- Initial sync: `messages.list` with `maxResults=100`
- **History expiration:** If `historyId` is too old (~7 days), Gmail returns 404. Detect and trigger full re-sync.
- Store last successful `historyId` in `mail_sync_state.cursor`

**Message ID Format:**
- Provider message ID: long numeric string (e.g., `18e23f4a5b6c7d8e`)
- Thread ID: same format, groups related messages

### Zoho Mail API

**Regions (explicit parameter in `connectStart`, not auto-detected):**
| Region Code | OAuth URL | API URL |
|-------------|-----------|---------|
| `com` | accounts.zoho.com | mail.zoho.com |
| `eu` | accounts.zoho.eu | mail.zoho.eu |
| `in` | accounts.zoho.in | mail.zoho.in |
| `com.au` | accounts.zoho.com.au | mail.zoho.com.au |
| `com.cn` | accounts.zoho.com.cn | mail.zoho.com.cn |

> **Important:** Region must be passed as explicit parameter when calling `connectStart` for Zoho.
> Auto-detection is unreliable. Store in `mail_connections.region` and use for all subsequent API calls.

**OAuth Scopes:**
- `ZohoMail.messages.CREATE` — Send emails
- `ZohoMail.messages.READ` — Read messages
- `ZohoMail.accounts.READ` — Get account info

**Rate Limits:**
- Varies by Zoho plan
- Generally more restrictive than Gmail
- Implement exponential backoff + daily send caps

**API Quirks:**
- Must specify `accountId` in most requests (retrieve via accounts API after OAuth)
- Different endpoint structure than Gmail
- Less comprehensive documentation
- Token refresh returns different response format than Google

---

## Checklist Before Phase 1 Kickoff

- [ ] Q1-Q3 answered and documented
- [ ] Google OAuth consent screen submitted (even if in review)
- [ ] Zoho developer app created
- [ ] Environment variables defined: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`
- [ ] Metering quotas defined per plan tier
- [ ] Activity logger service type `mailboxes` added to enum
- [ ] Team aligned on MVP = send + optional metadata (not full email client)
- [ ] Team understands OAuth security requirements: PKCE + single-use state (see OAuth Security section)
- [ ] Team understands From enforcement: no client-provided `from`, derived from connection
