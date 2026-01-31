# Easy Mode Email - Implementation Plan

> **Status:** Implementation Complete (Phases 1-4 backend done, frontend in separate plans)
> **Last Updated:** 2026-01-28
> **Approach:** Zero-config first, DNS authority as the key to custom domain UX

---

## The Strategic Shift

The original mailboxes plan focused on integrating Google/Zoho OAuth-connected mailboxes. This plan takes a different approach: **start with SheenApps-managed email that works instantly, then layer complexity as opt-in upgrades.**

### Key Insight: DNS Authority, Not Email API

> **"The email@customDomain UX is fundamentally a DNS authority problem, not an email API problem."**

To send as `support@their-domain.com` with good deliverability, you need DNS-based authentication (SPF/DKIM/DMARC). The only ways to make this "truly easy" are:

1. **We register the domain** → full autopilot (Phase 3)
2. **User switches nameservers to us** → we manage DNS (Level 1b)
3. **User delegates a subdomain** → we manage `mail.their-domain.com` (Level 1a)
4. **User adds records manually** → we can only verify (Level 1c, escape hatch)

Anything else becomes "fake easy" (looks easy, deliverability suffers).

### Why This Approach

| Original Plan | This Plan |
|--------------|-----------|
| Google/Zoho OAuth first | SheenApps-managed first |
| Requires OAuth scope review (4-6 weeks) | Works immediately |
| Users choose providers, regions | Zero choices needed |
| BYOD DNS required for send | No DNS for MVP |
| Complex: OAuth, tokens, quotas, provider quirks | Simple: one provider we control |

**Core Principle:** Easy Mode email should work even if the user has never heard the words SPF, DKIM, OAuth, MX, or DMARC.

---

## Architecture: Who Does What

This system is **not** a full email host (no SMTP server, no IMAP/POP, no mailbox storage). It's a **control-plane + inbox pipeline** that orchestrates managed providers:

| Role | Responsibility | Provider |
|------|---------------|----------|
| **Control plane** (SheenApps) | Orchestration, metering, quotas, templates, idempotency, spam filtering, auto-reply, forwarding, threading, inbox storage | Our app/workers |
| **Outbound transport** | SMTP delivery on the internet | Resend (SES as fallback) |
| **Inbound parsing** | Receive email at MX, parse, post webhook | Resend Inbound |
| **Domain registration** | Register domains, manage renewals, WHOIS | OpenSRS |
| **DNS management** | Programmatic DNS zone control (SPF/DKIM/MX) | Cloudflare API |
| **Hosted mailboxes** (Phase 4+, if demand) | IMAP/POP/Webmail for "real email" | OpenSRS Email or WorkMail |

**Message path end-to-end:**

```
Inbound:  Sender → MX (Resend) → Webhook → BullMQ worker → spam check → DB store → post-receive (auto-reply/forward)
Outbound: App → InhouseEmailService → Resend API → SMTP delivery → bounce/status webhooks back to us
```

**MX routing by level (no conflicts):**

| Level | MX target | Address format |
|-------|-----------|---------------|
| Level 0 | `inbox.sheenapps.com` → Resend | `p_xxx@inbox.sheenapps.com` |
| Level 1a (subdomain) | `mail.their-domain.com` → Resend | `support@mail.their-domain.com` |
| Level 1b/1c (full domain) | `their-domain.com` → Resend | `support@their-domain.com` |
| Level 1.75 (hosted mailbox) | `their-domain.com` → OpenSRS/WorkMail | Standard IMAP/POP |

Levels 0–1c are programmatic inboxes (our DB). Level 1.75 is real mailbox hosting (provider handles IMAP/storage). These don't conflict because a domain only has one MX config at a time, and Level 1.75 would replace (not coexist with) our inbound pipeline for that domain.

**Why OpenSRS is domains-only (for now):** OpenSRS provides domain registration and DNS lifecycle management. It is **not** our email host unless we explicitly enable Level 1.75 (hosted mailboxes). The current architecture doesn't need it — Resend handles both inbound parsing and outbound delivery. OpenSRS Email would only enter the picture if users demand IMAP/Webmail ("real email"), which is Phase 4+ and gated on validated demand.

---

## What Already Exists

We already have significant email infrastructure:

| Component | Status | Location |
|-----------|--------|----------|
| `@sheenapps/email` SDK | ✅ Done | `sheenapps-packages/email/` |
| `InhouseEmailService` | ✅ Done | `sheenapps-claude-worker/src/services/inhouse/InhouseEmailService.ts` |
| Resend integration | ✅ Done | Uses `RESEND_API_KEY` |
| Templates (6 built-in) | ✅ Done | welcome, magic-link, password-reset, email-verification, receipt, notification |
| Localization (5 languages) | ✅ Done | en, ar, fr, es, de |
| Idempotency | ✅ Done | Via `idempotencyKey` |
| Metering/Quotas | ✅ Done | Via `InhouseMeteringService` |
| Email records table | ✅ Done | `inhouse_emails` |
| Suppression list | ✅ Done | `inhouse_email_suppressions` |

**What's Missing:**
- Inbound email capture
- Per-project inbox addresses
- Custom domain verification (for branding)

---

## The Levels

**Naming clarity (for UI and support):**

| Internal Level | User-Facing Name | What It Is |
|----------------|------------------|------------|
| Level 0 | **SheenApps Inbox** | Ticket-ish inbound + basic reply, not a "mailbox" |
| Level 1 | **Custom Domain** | Branded email identity (same inbox, your domain) |
| Level 1.5 | **Buy a Domain** | Domain registration through SheenApps |
| Level 1.75 | **Business Email** | True mailbox product (IMAP/Webmail) |
| Level 2 | **Connect Email** | Link existing Gmail/Zoho account |

This naming prevents confusion: "Inbox" ≠ "Mailbox". Users understand they're getting different things.

### Level 0: Instant (MVP)

**What the user gets immediately, zero config:**

- **Outbound:** Send emails from `"Acme Store" <p_7h2k9x@inbox.sheenapps.com>` (per-project, non-guessable)
- **Inbound:** Receive emails at `p_7h2k9x@inbox.sheenapps.com` (same address)
- **UI shows:** Friendly display name configured by user, e.g., "Your Acme Store Inbox"
- **Aliases:** Users can create `support`, `hello`, etc. that map to the real address (with restrictions)

**Why per-project random ID (not shared `support@inbox.sheenapps.com`):**
- **Reputation isolation:** One bad project doesn't poison the shared address
- **Reply handling:** Some email clients ignore Reply-To and reply to From directly
- **Non-guessable:** `p_7h2k9x@inbox.sheenapps.com` prevents spam harvesting
- **Display name gives the "support@" feel** without exposing a guessable/shared address

**Inbox ID format:**
- Lowercase alphanumeric: `p_` prefix + 6-10 lowercase chars
- Example: `p_7h2k9x`, `p_abc123def`
- Lowercase-only makes email address handling simpler (email local-parts are case-insensitive in practice)

**Use cases unlocked:**
- Contact forms → inbox
- Support tickets
- "Email me when..." workflows
- Auto-responders

**No DNS. No OAuth. No choices.**

### Level 1: Custom Domain (Branding)

**The key insight:** Custom domain email is fundamentally a **DNS authority problem**, not an email API problem. The UX depends on how much DNS control the user is willing to give us.

**Three paths, one wizard:**

| Path | User Action | Result | Best For |
|------|-------------|--------|----------|
| **1a: Subdomain** | Add NS delegation set (2 records) | `support@mail.their-domain.com` | Cautious users, existing sites |
| **1b: Nameservers** | Switch to Cloudflare NS (powered by SheenApps) | `support@their-domain.com` | Users wanting full branding |
| **1c: Manual DNS** | Add 4-6 records (SPF, DKIM, DMARC, MX) | `support@their-domain.com` | IT teams, specific registrars |

**Guided funnel:**

```
"Do you already have a domain?"
├── No → "Buy a domain" (future: SheenApps reseller)
└── Yes → "How do you want to connect it?"
    ├── Fastest (recommended): Switch nameservers → we manage everything
    ├── Safest: Use a subdomain (mail.domain.com) → NS delegation, low risk
    └── Manual: I'll add records myself → escape hatch
```

**Why subdomain is "safest":**
- Doesn't touch existing website DNS
- User adds NS delegation for `mail.their-domain.com` (typically 2 NS records)
- We get full control under that subdomain
- Can set SPF/DKIM/MX for that subdomain
- Trade-off: `support@mail.their-domain.com` not `support@their-domain.com`

**Why nameserver switch is "best UX":**
- User switches NS to Cloudflare nameservers (we manage the zone via Cloudflare API)
- We auto-provision SPF, DKIM, DMARC, MX
- We can self-heal DNS drift
- We must import existing records safely (migration UX matters)
- Trade-off: Users fear "will my website break?"

**Important: We use Cloudflare DNS API, not custom nameservers.**
Running our own authoritative DNS (`ns1.sheenapps.com`) is operationally heavy. Instead:
- User switches to Cloudflare's nameservers
- We manage the zone via Cloudflare API
- This gives us full control without running DNS infrastructure

### Level 1.5: Domain Registration (Future)

**For truly non-technical founders starting from scratch:**

- "Pick a domain" → pay → done
- We register via registrar API
- Full autopilot: SPF/DKIM/DMARC/MX pre-configured
- Immediate: `hello@their-domain.com` works

**Recommended Vendor: OpenSRS (Tucows)**

After evaluating options (OpenSRS, Openprovider, Gandi, GoDaddy), OpenSRS is the best fit for Easy Mode because:
- Single vendor for domain + email (if we use OpenSRS Email too)
- Explicit API support for setting nameservers at registration
- DNS zone templates can be applied programmatically
- Sub-account support if we need tenant isolation later
- Event webhooks for domain lifecycle (expiry, transfers, NS changes)

**GoDaddy caveat:** Production DNS/management APIs may require 10+ domains and/or paid plans. This creates early-stage friction.

**Vendor Selection Checklist (must-haves for Easy Mode):**

| Requirement | Why It Matters |
|-------------|----------------|
| Set default nameservers at registration via API | New domains land on SheenApps DNS immediately |
| Change nameservers later via API | For "connected domain" flow |
| DNS zone templates (programmatic) | Auto-apply SPF/DKIM/DMARC/MX on domain setup |
| Transfer in/out via API | No manual tickets for user offboarding |
| Grace period + redemption handling via API | "Payment failed, renew now" flows |
| Event webhooks | Update domain state without polling |

**Multi-tenancy Model: Single Reseller Account**

SheenApps has one OpenSRS reseller account. Multi-tenancy is enforced in our DB:
- Every domain is tagged with `project_id`
- Our code ensures: "project can only operate on domains linked to that project"
- OpenSRS API calls are server-side only, from allowlisted IPs
- Use OpenSRS "profiles" to group domains if needed

This is simpler than sub-reseller accounts per tenant (which adds complexity without clear benefit for our user base).

**Domain Lifecycle Edge Cases:**

| Scenario | Handling |
|----------|----------|
| **Payment fails** | Grace period → retry → suspend → redemption |
| **User churns** | Offer transfer-out, clear auth code retrieval |
| **User requests transfer-out** | API-driven, no manual tickets |
| **Abuse detected** | Immediate suspension (DNS + email) |
| **Domain expires** | Multiple reminders → grace period → redemption fees → release |

**Why this is Phase 3+:**
- Significant operational burden (renewals, disputes, WHOIS, abuse)
- "My domain is down" becomes our emergency
- Worth doing eventually for "one-click business identity"
- Need strong abuse prevention first (see Security section)

### Level 1.75: Real Mailbox via Hosted Provider (Future)

**The product question:** Do users need "real mailboxes" (IMAP/SMTP/Webmail) or is SheenApps Inbox sufficient?

For most Easy Mode users, SheenApps Inbox handles support/contact use cases. But some users want:
- To use standard email clients (Outlook, Apple Mail, mobile apps)
- IMAP access for external integrations
- A "real" email address that feels like Gmail

**Solution: Hosted mailbox provider as backend**

Instead of running mail servers ourselves (operational nightmare), we consume a hosted mailbox API:

| Provider | Pros | Cons |
|----------|------|------|
| **OpenSRS Email** | Same vendor as domains, single integration | Less known |
| **Amazon WorkMail** | AWS-native, strong APIs, EWS access | More AWS setup |
| **Zoho Mail** | Cost-effective, SMB-friendly | Admin-level API (not end-user OAuth) |

**Recommended:** OpenSRS Email first (if we use OpenSRS for domains), WorkMail as AWS alternative.

**User Experience:**

```
"Create Business Email"
├── Step 1: Pick domain (buy new or use existing)
├── Step 2: Choose addresses (hello@, support@, no-reply@)
└── Step 3: Done!
    ├── "Open inbox" (webmail link)
    ├── "Reset password"
    └── "Connect to Outlook/Apple Mail" (IMAP settings, hidden under Advanced)
```

User never sees SPF/DKIM/DMARC unless something fails.

**What SheenApps stores (not passwords):**

```sql
-- Extends inhouse_email_domains
ALTER TABLE inhouse_email_domains ADD COLUMN IF NOT EXISTS
  mailbox_provider VARCHAR(20);  -- 'opensrs_email' | 'workmail' | null (SheenApps Inbox only)

-- New: Real mailboxes (when using hosted provider)
CREATE TABLE IF NOT EXISTS inhouse_mailboxes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  domain_id UUID NOT NULL REFERENCES inhouse_email_domains(id) ON DELETE CASCADE,

  local_part VARCHAR(64) NOT NULL,  -- "support", "hello"
  email_address VARCHAR(320) NOT NULL,  -- computed: local_part@domain

  -- Provider tracking
  provider VARCHAR(20) NOT NULL,  -- 'opensrs_email' | 'workmail'
  provider_mailbox_id VARCHAR(255),  -- ID from provider

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'provisioning',  -- 'provisioning' | 'active' | 'suspended' | 'error'
  last_error VARCHAR(255),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_domain_localpart UNIQUE (domain_id, local_part)
);

CREATE INDEX IF NOT EXISTS idx_mailboxes_project ON inhouse_mailboxes(project_id);
CREATE INDEX IF NOT EXISTS idx_mailboxes_email ON inhouse_mailboxes(email_address);
```

**MailboxEngineAdapter (for provider flexibility):**

```typescript
// Abstraction for swapping providers or future self-hosting
interface MailboxEngineAdapter {
  // Domain setup
  createDomain(domain: string): Promise<{ providerId: string }>
  getDnsTemplate(domain: string): Promise<DnsRecord[]>  // MX/SPF/DKIM/DMARC

  // Mailbox operations
  createMailbox(input: { domain: string; localPart: string }): Promise<{ providerId: string }>
  deleteMailbox(providerId: string): Promise<void>
  suspendMailbox(providerId: string): Promise<void>

  // Credentials (never store passwords)
  createPasswordResetLink(providerId: string): Promise<{ url: string; expiresAt: Date }>
  setPassword(providerId: string, password: string): Promise<void>

  // Webmail
  getWebmailUrl(providerId: string): Promise<string>

  // IMAP/SMTP settings (for "Connect to Outlook" UI)
  getClientSettings(domain: string): { imap: ServerSettings; smtp: ServerSettings }
}
```

This adapter allows:
- Starting with OpenSRS Email
- Adding WorkMail as alternative
- Future "eject" to self-hosted (if ever needed, but unlikely)

**Provisioning State Machine:**

```
1. Register domain (if purchased via SheenApps)
2. Set nameservers to SheenApps DNS (Cloudflare)
3. Create DNS zone (base records)
4. Provision mailboxes with provider API
5. Fetch provider-required DNS records (MX/SPF/DKIM)
6. Apply DNS records
7. Verify DNS until green
8. Mark domain + mailboxes active
```

**Why this is Phase 4+ (after domain registration):**
- Requires domain registration working first
- Adds another provider integration
- Higher support burden (password resets, "my email isn't working")
- Most Easy Mode users are happy with SheenApps Inbox

**The honest tradeoff:**

| Option | IMAP/Webmail | Complexity | Best For |
|--------|--------------|------------|----------|
| SheenApps Inbox | No | Low | Support tickets, contact forms |
| Real Mailbox (hosted) | Yes | Medium | "I want a real email address" |
| External Connect (Gmail) | Yes | High | Power users with existing email |

### Level 2: External Mailbox (Advanced)

**For power users who live in Gmail/Zoho:**

- OAuth connect to existing mailbox
- Send-as from their Gmail/Zoho
- Optional metadata sync

This becomes "Advanced / Existing mailbox" - not the default path.

---

## MVP Scope (Level 0)

### Outbound: Already Done

The existing `InhouseEmailService` + `@sheenapps/email` SDK handles this:

```typescript
import { createClient } from '@sheenapps/email'

const email = createClient({ apiKey: process.env.SHEEN_SK })

await email.send({
  to: 'customer@example.com',
  template: 'welcome',
  variables: { name: 'John' }
})
```

Sends from `noreply@sheenapps.com` via Resend.

### Inbound: New Implementation Required

**How it works:**

1. Configure Resend inbound routing (with SES as production fallback)
2. All emails to `*@inbox.sheenapps.com` → webhook endpoint
3. Webhook verifies signature → enqueues job → returns 200 fast
4. Job parses: from, to, subject, date, text, html
5. Extract project from recipient: `p_<inbox-id>@inbox.sheenapps.com`
6. Dedupe by `(provider_message_id, recipient)` to handle webhook retries
7. Store in `inhouse_inbox_messages` table
8. Expose via SDK + API

**Recipient address format:**
```
p_<inbox-id>@inbox.sheenapps.com          (primary, non-guessable)
p_<inbox-id>+tag@inbox.sheenapps.com      (for routing/categorization)
```

Example: `p_7H2K9x@inbox.sheenapps.com` or `p_7H2K9x+support@inbox.sheenapps.com`

**Aliases:** Users can create friendly aliases like `support` or `hello` that map to their real inbox address internally. Aliases are stored in `inhouse_inbox_aliases` and resolved on inbound.

---

## Data Model

### New Tables

```sql
-- Migration: XXX_inhouse_inbox.sql

-- =============================================================================
-- inhouse_inbox_messages: Received emails
-- =============================================================================
CREATE TABLE IF NOT EXISTS inhouse_inbox_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Envelope
  from_email VARCHAR(320) NOT NULL,
  from_name VARCHAR(200),
  to_email VARCHAR(320) NOT NULL,  -- The inbox address that received it
  reply_to VARCHAR(320),

  -- Message
  subject TEXT,
  text_body TEXT,
  html_body TEXT,
  snippet VARCHAR(500),  -- First ~200 chars of text, for list view

  -- Threading
  message_id VARCHAR(500),  -- Email Message-ID header
  in_reply_to VARCHAR(500),
  references TEXT[],
  thread_id UUID,  -- Our internal thread grouping

  -- Routing
  tag VARCHAR(100),  -- Extracted from +tag in recipient

  -- Metadata from provider
  provider_id VARCHAR(255),  -- Resend/SES message ID
  raw_headers JSONB,

  -- Attachments (metadata only; files stored separately or dropped)
  -- MVP: store metadata, drop files > 10MB, keep files in S3 if needed later
  attachments JSONB NOT NULL DEFAULT '[]',
  -- Format: [{ "filename": "doc.pdf", "mime_type": "application/pdf", "size_bytes": 12345, "content_id": "cid123", "storage_key": "s3://..." | null }]

  -- Status
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  is_spam BOOLEAN NOT NULL DEFAULT FALSE,

  -- Processing status (for debugging webhook/job issues)
  processing_status VARCHAR(20) NOT NULL DEFAULT 'processed',  -- 'pending' | 'processing' | 'processed' | 'failed'
  processed_at TIMESTAMPTZ,
  last_processing_error TEXT,

  -- Timestamps
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT valid_from_email CHECK (from_email ~* '^[^@]+@[^@]+$')
);

CREATE INDEX IF NOT EXISTS idx_inbox_project_received
  ON inhouse_inbox_messages(project_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbox_project_thread
  ON inhouse_inbox_messages(project_id, thread_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbox_project_unread
  ON inhouse_inbox_messages(project_id, is_read, received_at DESC)
  WHERE is_read = FALSE AND is_archived = FALSE;
CREATE INDEX IF NOT EXISTS idx_inbox_message_id
  ON inhouse_inbox_messages(message_id) WHERE message_id IS NOT NULL;

-- Dedupe constraint: prevent duplicate messages from webhook retries
CREATE UNIQUE INDEX IF NOT EXISTS idx_inbox_dedupe
  ON inhouse_inbox_messages(provider_id, to_email)
  WHERE provider_id IS NOT NULL;

-- =============================================================================
-- inhouse_inbox_threads: Thread grouping for conversations
-- =============================================================================
CREATE TABLE IF NOT EXISTS inhouse_inbox_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  subject TEXT,  -- Normalized subject (stripped Re:/Fwd:)
  participant_emails TEXT[] NOT NULL DEFAULT '{}',

  -- Counts
  message_count INTEGER NOT NULL DEFAULT 0,
  unread_count INTEGER NOT NULL DEFAULT 0,

  -- Latest message info (denormalized for list view)
  last_message_at TIMESTAMPTZ,
  last_message_snippet VARCHAR(500),
  last_message_from VARCHAR(320),

  -- Status
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_threads_project_updated
  ON inhouse_inbox_threads(project_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_threads_project_unread
  ON inhouse_inbox_threads(project_id, unread_count DESC, last_message_at DESC)
  WHERE is_archived = FALSE;

-- Thread counter update strategy (IMPORTANT for consistency):
-- 1. Primary: Update counters transactionally in the same job that inserts the message
--    UPDATE inhouse_inbox_threads SET message_count = message_count + 1, ... WHERE id = $thread_id
-- 2. Safety net: Periodic repair job runs hourly, recalculates counts from actual messages
--    This handles race conditions, retries, and any drift

-- =============================================================================
-- inhouse_inbox_config: Per-project inbox settings
-- =============================================================================
CREATE TABLE IF NOT EXISTS inhouse_inbox_config (
  project_id UUID PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,

  -- Non-guessable inbox ID (e.g., "p_7H2K9x")
  -- Real address: p_7H2K9x@inbox.sheenapps.com
  inbox_id VARCHAR(20) NOT NULL UNIQUE,

  -- Display name for UI (from project name)
  display_name VARCHAR(100),

  -- Settings
  auto_reply_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  auto_reply_message TEXT,
  forward_to_email VARCHAR(320),  -- Optional email forwarding

  -- Retention
  retention_days INTEGER NOT NULL DEFAULT 90,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Inbox ID format: p_ prefix + 6-10 lowercase alphanumeric chars
-- Lowercase-only for simpler email address handling
ALTER TABLE inhouse_inbox_config
  ADD CONSTRAINT valid_inbox_id
  CHECK (inbox_id ~ '^p_[a-z0-9]{6,10}$');

-- =============================================================================
-- inhouse_inbox_aliases: Friendly aliases that map to real inbox
-- =============================================================================
CREATE TABLE IF NOT EXISTS inhouse_inbox_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  alias VARCHAR(100) NOT NULL,  -- e.g., "support", "hello", "sales"
  -- Maps to: <alias>@inbox.sheenapps.com → p_<inbox_id>@inbox.sheenapps.com

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_project_alias UNIQUE (project_id, alias),
  CONSTRAINT valid_alias CHECK (alias ~* '^[a-z0-9][a-z0-9._-]*[a-z0-9]$' AND LENGTH(alias) >= 2)
);

-- Global uniqueness: aliases must be unique across all projects
CREATE UNIQUE INDEX IF NOT EXISTS idx_inbox_alias_global ON inhouse_inbox_aliases(alias);

-- Reserved aliases (enforced in application code, not DB constraint)
-- These cannot be claimed by any project:
--   support, hello, sales, admin, billing, postmaster, abuse, noreply,
--   info, contact, help, security, privacy, legal, team, no-reply

-- =============================================================================
-- inhouse_email_domains: Custom domain configuration (Level 1)
-- =============================================================================
CREATE TABLE IF NOT EXISTS inhouse_email_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  domain VARCHAR(255) NOT NULL,  -- e.g., "their-domain.com" or "mail.their-domain.com"
  is_subdomain BOOLEAN NOT NULL DEFAULT FALSE,  -- true for mail.domain.com style

  -- DNS authority level
  -- 'subdomain': We control mail.domain.com via NS delegation
  -- 'nameservers': User switched NS to Cloudflare, we manage via API
  -- 'manual': User added records manually, we can only verify
  authority_level VARCHAR(20) NOT NULL DEFAULT 'manual',

  -- Email provider for this domain (for future multi-provider support)
  provider VARCHAR(20) NOT NULL DEFAULT 'resend',  -- 'resend' | 'ses' | 'postmark'

  -- DNS verification status
  dns_status JSONB NOT NULL DEFAULT '{
    "spf": { "verified": false },
    "dkim": { "verified": false },
    "dmarc": { "verified": false },
    "mx": { "verified": false },
    "return_path": { "verified": false }
  }',

  -- For authority_level = 'nameservers': Cloudflare zone info
  cloudflare_zone_id VARCHAR(64),  -- If we manage via Cloudflare API
  imported_records JSONB,  -- Snapshot of records we imported when they switched NS

  -- Verification
  verification_token VARCHAR(64),  -- TXT record for domain ownership proof
  verified_at TIMESTAMPTZ,
  last_checked_at TIMESTAMPTZ,

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- 'pending' | 'verified' | 'error'
  last_error VARCHAR(255),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_project_domain UNIQUE (project_id, domain)
);

CREATE INDEX IF NOT EXISTS idx_email_domains_project
  ON inhouse_email_domains(project_id);
CREATE INDEX IF NOT EXISTS idx_email_domains_status
  ON inhouse_email_domains(project_id, status);
```

### Relationship to Existing Tables

```
projects
  └── inhouse_inbox_config (1:1)  -- Inbox settings
  └── inhouse_inbox_threads (1:N) -- Conversation threads
  └── inhouse_inbox_messages (1:N) -- Individual messages
  └── inhouse_inbox_aliases (1:N) -- Alias mappings
  └── inhouse_email_domains (1:N) -- Custom domain configs (Level 1)
  └── inhouse_emails (1:N) -- EXISTING: Outbound emails
```

### Alias Anti-Squatting Policy

Global aliases (`hello@inbox.sheenapps.com`) are valuable namespace. Without controls, they become a black market.

**Policy layers:**

| Rule | Implementation |
|------|----------------|
| **Reserved list** | `support`, `hello`, `sales`, `admin`, `billing`, `postmaster`, `abuse`, `noreply`, `info`, `contact`, `help`, `security`, `privacy`, `legal`, `team`, `no-reply` cannot be claimed |
| **Tier gating** | Global aliases only available on paid plans |
| **Reclamation** | Alias released if project inactive >90 days (no API calls, no logins) |
| **Rate limit** | Max 5 aliases per project (Free), 20 (Pro), unlimited (Enterprise) |
| **Premium aliases** | Short aliases (<5 chars) require verified business status |

**Enforcement:**
- Reserved list checked in `InhouseInboxService.createAlias()` before DB insert
- Tier gating checked against project's subscription status
- Reclamation job runs weekly, marks aliases for release after warning email

---

## API Surface

### Inbound Webhook (Internal)

```typescript
// POST /v1/inhouse/inbox/webhook
// Called by Resend/SES when email is received
// Authenticated via webhook signature, not API key

interface InboundWebhookPayload {
  from: string
  to: string
  subject: string
  text?: string
  html?: string
  headers: Record<string, string>
  messageId: string
  // ... provider-specific fields
}
```

### SDK Endpoints

```typescript
// =============================================================================
// INBOX MESSAGES
// =============================================================================

// List messages (paginated)
GET /v1/inhouse/inbox/messages
Query: { threadId?: string; unreadOnly?: boolean; limit?: number; cursor?: string }
Response: { ok: true, data: { messages: InboxMessage[]; nextCursor?: string } }

// Get single message
GET /v1/inhouse/inbox/messages/:messageId
Response: { ok: true, data: InboxMessage }

// Mark as read/unread
PATCH /v1/inhouse/inbox/messages/:messageId
Body: { isRead?: boolean; isArchived?: boolean }
Response: { ok: true }

// Archive/delete messages
DELETE /v1/inhouse/inbox/messages/:messageId
Response: { ok: true }

// =============================================================================
// THREADS
// =============================================================================

// List threads (conversations)
GET /v1/inhouse/inbox/threads
Query: { unreadOnly?: boolean; limit?: number; cursor?: string }
Response: { ok: true, data: { threads: InboxThread[]; nextCursor?: string } }

// Get thread with messages
GET /v1/inhouse/inbox/threads/:threadId
Response: { ok: true, data: { thread: InboxThread; messages: InboxMessage[] } }

// Archive thread
PATCH /v1/inhouse/inbox/threads/:threadId
Body: { isArchived?: boolean }
Response: { ok: true }

// =============================================================================
// INBOX CONFIG
// =============================================================================

// Get inbox address and settings
GET /v1/inhouse/inbox/config
Response: {
  ok: true,
  data: {
    inboxAddress: string;  // e.g., "acme-store@inbox.sheenapps.com"
    customDomain?: string;
    autoReplyEnabled: boolean;
    // ...
  }
}

// Update inbox settings
PATCH /v1/inhouse/inbox/config
Body: { autoReplyEnabled?: boolean; autoReplyMessage?: string; forwardToEmail?: string }
Response: { ok: true, data: InboxConfig }

// =============================================================================
// REPLY (uses existing send infrastructure)
// =============================================================================

// Reply to a message (convenience wrapper around email.send)
POST /v1/inhouse/inbox/messages/:messageId/reply
Body: { text?: string; html?: string }
Response: { ok: true, data: { emailId: string } }
```

---

## SDK Design (@sheenapps/inbox)

**New SDK for inbound operations.** Outbound stays in `@sheenapps/email`.

```typescript
// src/client.ts
import type {
  InboxConfig,
  InboxMessage,
  InboxThread,
  ListMessagesInput,
  ListMessagesResult,
  ListThreadsInput,
  ListThreadsResult,
} from './types'

export class SheenAppsInboxClient {
  // ... standard SDK boilerplate (apiKey validation, fetch wrapper)

  // ===========================================================================
  // Config
  // ===========================================================================

  async getConfig(): Promise<InboxResult<InboxConfig>> {
    return this.get('/config')
  }

  async updateConfig(input: Partial<InboxConfig>): Promise<InboxResult<InboxConfig>> {
    return this.patch('/config', input)
  }

  // ===========================================================================
  // Messages
  // ===========================================================================

  async listMessages(input?: ListMessagesInput): Promise<InboxResult<ListMessagesResult>> {
    const params = new URLSearchParams()
    if (input?.threadId) params.set('threadId', input.threadId)
    if (input?.unreadOnly) params.set('unreadOnly', 'true')
    if (input?.limit) params.set('limit', String(input.limit))
    if (input?.cursor) params.set('cursor', input.cursor)
    return this.get(`/messages?${params}`)
  }

  async getMessage(messageId: string): Promise<InboxResult<InboxMessage>> {
    return this.get(`/messages/${messageId}`)
  }

  async markRead(messageId: string, isRead: boolean = true): Promise<InboxResult<void>> {
    return this.patch(`/messages/${messageId}`, { isRead })
  }

  async archiveMessage(messageId: string): Promise<InboxResult<void>> {
    return this.patch(`/messages/${messageId}`, { isArchived: true })
  }

  async deleteMessage(messageId: string): Promise<InboxResult<void>> {
    return this.delete(`/messages/${messageId}`)
  }

  // ===========================================================================
  // Threads
  // ===========================================================================

  async listThreads(input?: ListThreadsInput): Promise<InboxResult<ListThreadsResult>> {
    const params = new URLSearchParams()
    if (input?.unreadOnly) params.set('unreadOnly', 'true')
    if (input?.limit) params.set('limit', String(input.limit))
    if (input?.cursor) params.set('cursor', input.cursor)
    return this.get(`/threads?${params}`)
  }

  async getThread(threadId: string): Promise<InboxResult<{ thread: InboxThread; messages: InboxMessage[] }>> {
    return this.get(`/threads/${threadId}`)
  }

  async archiveThread(threadId: string): Promise<InboxResult<void>> {
    return this.patch(`/threads/${threadId}`, { isArchived: true })
  }

  // ===========================================================================
  // Reply (convenience - wraps @sheenapps/email)
  // ===========================================================================

  async reply(messageId: string, input: { text?: string; html?: string }): Promise<InboxResult<{ emailId: string }>> {
    return this.post(`/messages/${messageId}/reply`, input)
  }
}

export function createClient(config: InboxClientConfig): SheenAppsInboxClient {
  return new SheenAppsInboxClient(config)
}
```

### Usage Example

```typescript
import { createClient as createInbox } from '@sheenapps/inbox'
import { createClient as createEmail } from '@sheenapps/email'

const inbox = createInbox({ apiKey: process.env.SHEEN_SK })
const email = createEmail({ apiKey: process.env.SHEEN_SK })

// Get inbox address to show users
const { data: config } = await inbox.getConfig()
console.log(`Send messages to: ${config.inboxAddress}`)
// → "Send messages to: acme-store@inbox.sheenapps.com"

// List unread messages
const { data } = await inbox.listMessages({ unreadOnly: true })
for (const msg of data.messages) {
  console.log(`From: ${msg.fromEmail}, Subject: ${msg.subject}`)
}

// Reply to a message
await inbox.reply(messageId, {
  text: 'Thanks for reaching out! We will get back to you shortly.'
})

// Or send new email (existing SDK)
await email.send({
  to: 'customer@example.com',
  template: 'notification',
  variables: { title: 'New message', message: '...' }
})
```

---

## Inbound Provider Integration

### Option A: Resend Inbound (Recommended)

Resend supports inbound email. Configure:

1. Add MX record for `inbox.sheenapps.com` pointing to Resend
2. Configure Resend webhook to `POST /v1/inhouse/inbox/webhook`
3. Parse incoming email, extract project from recipient

**Pros:** Single provider for send + receive, simpler billing
**Cons:** Resend inbound is newer, may have limitations

### Option B: AWS SES Inbound (Alternative)

1. Configure SES to receive for `inbox.sheenapps.com`
2. SES → Lambda → HTTP to our webhook
3. Same parsing logic

**Pros:** Battle-tested, high volume
**Cons:** More AWS setup, separate billing

### Webhook Handler

**Key principle:** Webhook handler should verify → enqueue → 200 fast. Parsing and storage happen in a background job. This handles retries gracefully.

```typescript
// src/routes/inhouseInboxWebhook.ts

import type { FastifyInstance } from 'fastify'
import { enqueueInboxJob } from '../queue/inboxQueue'

export async function registerInhouseInboxWebhookRoutes(fastify: FastifyInstance) {
  // Webhook from Resend/SES
  fastify.post('/v1/inhouse/inbox/webhook', {
    config: { rawBody: true },  // For signature verification
  }, async (request, reply) => {
    // 1. Verify webhook signature FIRST (fast fail)
    const signature = request.headers['x-resend-signature'] // or SES equivalent
    if (!verifyWebhookSignature(request.rawBody, signature)) {
      return reply.code(401).send({ error: 'Invalid signature' })
    }

    const payload = request.body as InboundWebhookPayload

    // 2. Quick validation - is this for us?
    const recipientMatch = payload.to.match(/^(p_[a-zA-Z0-9]+|[a-z0-9._-]+)(\+[^@]+)?@inbox\.sheenapps\.com$/i)
    if (!recipientMatch) {
      return reply.code(200).send({ status: 'ignored' })
    }

    // 3. Enqueue for processing (returns 200 immediately)
    // The job handles: project lookup, dedupe, storage, threading, auto-reply
    await enqueueInboxJob({
      providerId: payload.messageId,
      recipient: payload.to,
      payload,
    })

    return reply.code(200).send({ status: 'queued' })
  })
}

// src/jobs/processInboxMessage.ts
// This job is idempotent - dedupe by (provider_id, to_email)

async function processInboxMessage(job: InboxJob) {
  const { providerId, recipient, payload } = job.data

  // 1. Parse recipient to get inbox_id or alias
  const recipientMatch = recipient.match(/^(p_[a-zA-Z0-9]+|[a-z0-9._-]+)(\+[^@]+)?@inbox\.sheenapps\.com$/i)
  const inboxIdOrAlias = recipientMatch?.[1]
  const tag = recipientMatch?.[2]?.slice(1)

  // 2. Resolve to project (check inbox_id first, then aliases)
  const projectId = await resolveProjectFromRecipient(inboxIdOrAlias)
  if (!projectId) {
    return { status: 'no_project' }
  }

  // 3. Dedupe check (idempotent insert)
  const inboxService = getInhouseInboxService(projectId)
  const result = await inboxService.receiveMessage({
    from: payload.from,
    to: recipient,
    subject: payload.subject,
    textBody: payload.text,
    htmlBody: payload.html,
    messageId: payload.headers['message-id'],
    inReplyTo: payload.headers['in-reply-to'],
    references: parseReferences(payload.headers['references']),
    providerId,
    rawHeaders: payload.headers,
    tag,
  })

  if (result.duplicate) {
    return { status: 'duplicate' }
  }

  // 4. Handle auto-reply (only for new messages)
  const config = await inboxService.getConfig()
  if (config.autoReplyEnabled && config.autoReplyMessage) {
    await sendAutoReply(projectId, payload.from, config.autoReplyMessage)
  }

  return { status: 'processed', messageId: result.messageId }
}
```

---

## Threading Logic

Group messages into threads using standard email threading:

```typescript
async function assignThread(message: InboundMessage): Promise<string> {
  // 1. Check In-Reply-To header
  if (message.inReplyTo) {
    const parent = await findMessageByMessageId(message.inReplyTo)
    if (parent?.threadId) return parent.threadId
  }

  // 2. Check References header
  if (message.references?.length) {
    for (const ref of message.references) {
      const related = await findMessageByMessageId(ref)
      if (related?.threadId) return related.threadId
    }
  }

  // 3. Check outbound emails we sent (for replies to our sends)
  // Match by subject + from/to
  const normalizedSubject = normalizeSubject(message.subject)
  const existingThread = await findThreadBySubjectAndParticipant(
    normalizedSubject,
    message.from
  )
  if (existingThread) return existingThread.id

  // 4. Create new thread
  return createThread({
    subject: normalizedSubject,
    participants: [message.from],
  })
}

function normalizeSubject(subject: string): string {
  // Remove Re:, Fwd:, etc.
  return subject
    .replace(/^(re|fwd|fw):\s*/gi, '')
    .replace(/^(re|fwd|fw)\[\d+\]:\s*/gi, '')
    .trim()
}
```

---

## Phase Breakdown
  Actionable Backend Work
  ┌───────┬───────────────────────────────────────────────┬─────────────┐
  │ Phase │                     Item                      │   Status    │
  ├───────┼───────────────────────────────────────────────┼─────────────┤
  │ 2A    │ MX routing for inbound (when MX points to us) │ Complete    │
  ├───────┼───────────────────────────────────────────────┼─────────────┤
  │ 2B    │ Route inbound for *@mail.their-domain.com     │ Complete    │
  ├───────┼───────────────────────────────────────────────┼─────────────┤
  │ 2C    │ Cloudflare API Token integration              │ Complete    │
  ├───────┼───────────────────────────────────────────────┼─────────────┤
  │ 5     │ Google OAuth adapter                          │ Not started │
  ├───────┼───────────────────────────────────────────────┼─────────────┤
  │ 5     │ Zoho OAuth adapter                            │ Not started │
  ├───────┼───────────────────────────────────────────────┼─────────────┤
  │ 5     │ Metadata sync                                 │ Not started │
  └───────┴───────────────────────────────────────────────┴─────────────┘
  Frontend Work (no backend needed)
  ┌───────┬────────────────────────────────────────────────────┐
  │ Phase │                        Item                        │
  ├───────┼────────────────────────────────────────────────────┤
  │ 1     │ Admin panel inbox list view                        │
  ├───────┼────────────────────────────────────────────────────┤
  │ 2C    │ "Do you have a domain?" wizard UI                  │
  ├───────┼────────────────────────────────────────────────────┤
  │ 2D/3  │ Domain search/purchase UI                          │
  ├───────┼────────────────────────────────────────────────────┤
  │ 4     │ "Create Business Email" wizard + default addresses │
  ├───────┼────────────────────────────────────────────────────┤
  │ 5     │ Connection management UI                           │
  └───────┴────────────────────────────────────────────────────┘

  Optional / Low Priority

  - ~~Cloudflare OAuth for one-click DNS setup~~ → Implemented as API Token integration (Phase 2C) — CF has no OAuth
  - WorkMail adapter (Phase 4)


Not Yet Started Phases

- Phase 5: External Mailbox Integration — Google OAuth adapter, Zoho OAuth adapter, connection management UI


Future Enhancements

**See [easy-mode-email-enhancements-plan.md](./easy-mode-email-enhancements-plan.md) for detailed implementation plans.**

| Enhancement | Priority | Status |
|-------------|----------|--------|
| Rate limiting on domain search endpoints | High | Planned |
| Stripe webhook handling for payment disputes | High | Planned |
| Domain transfer-in flow | High | Planned |
| Domain pricing cache TTL with auto-refresh | Medium | Planned |
| Webhook retry handling for failed domain events | Medium | Planned |
| CIDR support for OpenSRS IP allowlist | Low | Planned |

Pre-Phase Checklists & Success Criteria

There are 24 planning checklist items and 35 success criteria test scenarios (unchecked - [ ] items) scattered across the doc. These are
verification/planning items rather than implementation tasks.



Phase 3 Gaps (All Resolved - items moved to main checklist above)



### Phase 1: MVP Inbound ✅

- [x] Database migration: inbox tables (`133_inhouse_inbox.sql`)
- [x] Service: `InhouseInboxService` (receive, list, get, archive, delete)
- [x] Routes: `inhouseInbox.ts` (SDK endpoints)
- [x] Webhook: `inhouseInboxWebhook.ts` (Resend/SES handler)
- [x] SDK: `@sheenapps/inbox` package
- [x] Threading logic (with transactional counter updates + repair job)
- [x] Auto-generate random `inbox_id` on project creation (not derived from name)
- [x] Activity log writes: webhook received, message stored, auto-reply sent
- [ ] Admin panel: inbox list view (messages, threads) — **Frontend, see admin-panel plan**

### Phase 1.5: Post-Receive Pipeline ✅

- [x] Auto-reply feature (`InboxPostReceiveActions.ts`: 24h dedup via Redis, threading headers, no-reply skip)
- [x] Email forwarding option (`InboxPostReceiveActions.ts`: circular prevention, original headers as metadata)
- [x] Metering integration (`inbound_messages` metric added to `InhouseMeteringService`, tracked in webhook worker)
- [x] Retention job (`inboxRetentionWorker.ts`: daily BullMQ repeatable, batch deletes, thread counter recalc)
- [x] Spam filtering (`InboxSpamFilter.ts`: Redis rate limiting per sender, domain blocklist, metadata JSONB)
- [x] Migration 138: `metadata` JSONB column + retention/spam indexes on `inhouse_inbox_messages`
- [x] `SendEmailOptions.headers` support for threading (In-Reply-To, References) in `InhouseEmailService`

### Phase 2A: Custom Domain - Manual DNS (Path 1c) ✅

**This phase proves domain verification + custom FROM with minimal infrastructure.**

**Core infrastructure:**
- [x] Domain table: `inhouse_email_domains` (authority levels, verification status)
- [x] DNS check service (query SPF, DKIM, DMARC, MX, Return-Path records)
- [x] Verification token generation + TXT record check
- [x] Resend domain API integration (add verified domains for sending)

**Sending requirements (strict):**
- [x] **SPF + DKIM must both be verified** before allowing custom-domain sending
- [x] DMARC is recommended but not blocking
- [x] Return-Path alignment checked for best deliverability

**Manual DNS workflow:**
- [x] Generate DNS record instructions (SPF include, DKIM key, DMARC recommendation, Return-Path)
- [x] Periodic verification job (check if records are correct)
- [x] Custom "from" address for outbound only when SPF+DKIM verified
- [x] MX routing for inbound (if MX points to us) — `resolveProjectFromRecipientDetailed()` checks MX verification
- [x] Activity log writes: DNS verified, domain activated, verification failed

### Phase 2B: Custom Domain - Cloudflare-Managed (Paths 1a, 1b) ✅

**Higher-risk, higher-reward UX. Requires Phase 2A infrastructure first.**

**Path 1a - Subdomain Delegation:**
- [x] Create Cloudflare zone for `mail.their-domain.com` in SheenApps' CF account
- [x] Generate NS delegation instructions (user adds 2 NS records for the subdomain)
- [x] Cloudflare provides the NS pair; no self-hosted DNS
- [x] Auto-provision SPF/DKIM/MX/Return-Path under the subdomain via Cloudflare API
- [x] Route inbound for `*@mail.their-domain.com` — `resolveProjectFromRecipientDetailed()` handles custom domains

**Path 1b - Nameserver Switch (full domain):**
- [x] Create Cloudflare zone for user's domain in SheenApps' Cloudflare account
- [x] Provide Cloudflare's assigned NS to user (e.g., `dave.ns.cloudflare.com`, `lucy.ns.cloudflare.com`)
- [x] DNS record import wizard (fetch existing records before switch, preview changes)
- [x] Manage zone via Cloudflare API (no self-hosted DNS infrastructure)
- [x] Auto-provision email records while preserving existing records
- [x] Health monitoring + self-healing for DNS drift

### Phase 2C: Guided Wizard UX ✅

- [ ] "Do you have a domain?" flow in admin panel — **Frontend, see admin-panel plan**
- [x] Registrar detection (show tailored instructions)
- [x] Progress indicator: "SPF ✓ / DKIM ✓ / DMARC ✗ / MX ✓"
- [x] ~~"We'll do this for you" Cloudflare OAuth integration~~ → Implemented as API Token integration (CF has no OAuth)

### Phase 3: Domain Registration (Level 1.5) ✅

**Vendor: OpenSRS (recommended)**

**Infrastructure:**
- [x] OpenSRS reseller account setup (API service created)
- [x] API integration: domain search, availability check
- [x] API integration: domain registration with default NS
- [x] API integration: nameserver changes
- [x] Webhook handler for domain lifecycle events — `payment_intent.succeeded/failed` in `StripeWebhookWorker`

**Domain Purchase Flow:**
- [x] Domain search API (check availability, show pricing)
- [ ] Domain search UI (admin panel) — **Frontend, see admin-panel plan**
- [x] Stripe integration for domain purchases — `DomainBillingService.ts`
- [x] Auto-set nameservers to Cloudflare (SheenApps-managed)
- [x] Auto-apply email DNS template via Cloudflare zone
- [x] Domain status tracking in `inhouse_registered_domains`

**Domain Lifecycle:**
- [x] Renewal reminders (30 days, 7 days, 1 day) — via `InhouseEmailService` with idempotency
- [x] Auto-renewal with Stripe — `DomainRenewalWorker`
- [x] Grace period handling (failed payment → retry → suspend) — `DomainRenewalWorker`
- [x] Transfer-out flow (auth code retrieval via API)
- [x] Redemption period handling — implemented in `DomainRenewalWorker`

**Multi-tenancy:**
- [x] Single reseller account model
- [x] Project-level domain ownership enforcement
- [x] OpenSRS API calls server-side only

### Phase 4: Real Mailbox via OpenSRS Hosted Email (Level 1.75) ✅ IMPLEMENTED

**Provider: OpenSRS Hosted Email (OMA API)**

**Implementation Notes:**
- Migration: `139_inhouse_mailboxes.sql` — adds `mailbox_mode`/`opensrs_email_cluster` to domains, new `inhouse_mailboxes` and `inhouse_mailbox_events` tables
- Migration: `140_mailbox_integrity_and_pending_mx.sql` — composite FK for cross-project safety, pending MX states, local_part format CHECK, redundant FK cleanup
- API Client: `OpenSrsEmailService.ts` — JSON-based OMA API client (distinct from XML-based domain registration API)
- Adapter: `MailboxEngineAdapter.ts` interface + `OpenSrsEmailAdapter.ts` implementation (includes `spfInclude` in `MailboxProviderInfo`)
- DNS: `emailDnsConstants.ts` updated with `OPENSRS_EMAIL_DNS` per-cluster config (includes `SPF_INCLUDE: 'include:_spf.hostedemail.com'`)
- MX Switching: `CloudflareService.switchMxRecords()` for Cloudflare-managed domains (with trailing-dot normalization fix)
- Orchestrator: `InhouseMailboxService.ts` — project-scoped service with TTL-cached factory
- Routes: `inhouseMailboxes.ts` — 15 endpoints for enable/disable, CRUD, password, SSO, quota, suspend, DNS readiness
- Metering: `mailboxes` metric added to `InhouseMeteringService` (free=1, starter=5, growth=25, scale=unlimited, pro=100)

**Domain `mailbox_mode` State Machine:**
```
resend (default)
  ↓ enableMailboxes() — provisions OpenSRS, attempts MX switch
  ├─→ hosted           (MX auto-switched via Cloudflare)
  └─→ hosted_pending_mx (MX not auto-switchable, user must update DNS manually)
        ↓ user updates MX, confirmed via checkDnsReadiness()
        → hosted

hosted
  ↓ disableMailboxes() — attempts MX switch back to Resend
  ├─→ resend             (MX auto-switched back, OpenSRS deprovisioned)
  └─→ resend_pending_mx  (MX not auto-switchable, user must update DNS manually)
        ↓ user updates MX, confirmed → OpenSRS deprovisioned
        → resend

hosted_pending_mx
  ↓ disableMailboxes() — MX never moved, just deprovision OpenSRS
  → resend
```

**DNS Readiness Check (Phase 4b):**
- Endpoint: `GET /v1/inhouse/projects/:projectId/email-domains/:domainId/mailbox-dns-readiness`
- Method: `InhouseMailboxService.checkDnsReadiness(domainId)` — runs MX, SPF, DMARC checks in parallel
- SPF: separate `verifySpfInclude()` helper (existing `verifySPF()` is Resend-specific)
- In-memory cache: 30s TTL per domain to prevent DNS hammering
- Returns: `{ status: 'ready' | 'needs_action', checks: { mx, spf, dmarc }, requiredRecords, lastCheckedAt }`
- MX + SPF are required for `ready`; DMARC is recommended only

| Check | Required? | Expected Value | Impact if Missing |
|-------|-----------|---------------|-------------------|
| MX | Yes | `mail.hostedemail.com` | Incoming email won't arrive |
| SPF | Yes | `include:_spf.hostedemail.com` | Outgoing email may land in spam |
| DMARC | No (recommended) | `v=DMARC1; p=...` | Reduced deliverability |

**Migration 140 — Integrity & Pending MX:**
- Composite unique on `inhouse_email_domains(id, project_id)` + composite FK from `inhouse_mailboxes(domain_id, project_id)` — prevents cross-project domain references
- Same composite FK for `inhouse_mailbox_events`
- Drops redundant single-column FKs (`inhouse_mailboxes_domain_id_fkey`, `inhouse_mailbox_events_domain_id_fkey`)
- Adds `hosted_pending_mx` and `resend_pending_mx` to `mailbox_mode` CHECK constraint
- Adds `local_part` format CHECK: `local_part = lower(local_part) AND local_part ~ '^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$'`

**CloudflareService Fix:**
- `switchMxRecords()` now normalizes MX targets with trailing-dot removal (`mail.hostedemail.com.` → `mail.hostedemail.com`) to prevent false `MX_NOT_AUTO_SWITCHABLE` errors

**Infrastructure:**
- [x] MailboxEngineAdapter interface
- [x] OpenSRS Email adapter implementation
- [ ] (Optional) WorkMail adapter implementation

**Mailbox Provisioning:**
- [x] Create mailbox via provider API
- [x] MX record switching (Resend ↔ OpenSRS hosted)
- [x] Provisioning state machine (pending_create → active → suspended / pending_delete → deleted / error)
- [x] `inhouse_mailboxes` table with soft deletes
- [x] Pending MX states for non-Cloudflare domains (`hosted_pending_mx`, `resend_pending_mx`)
- [x] Composite FK for cross-project data integrity

**DNS Readiness:**
- [x] `checkDnsReadiness()` — MX, SPF, DMARC checks with in-memory cache
- [x] `verifySpfInclude()` — OpenSRS-specific SPF verification
- [x] GET endpoint for frontend polling
- [x] `MailboxDnsReadinessResult` type exported

**User Experience:**
- [ ] "Create Business Email" wizard — **Frontend, see admin-panel plan**
- [ ] Default addresses: hello@, support@, no-reply@ — **Frontend, see admin-panel plan**
- [x] Webmail SSO URL generation (backend)
- [x] Password reset flow (via provider API, no password storage)
- [x] IMAP/SMTP/POP client config endpoint
- [x] MX instruction text with warning about impact on other email providers

**Operations:**
- [x] Mailbox suspension/deletion
- [x] Quota management + sync from provider
- [x] Password reset via API
- [x] Restore soft-deleted mailboxes
- [x] Audit log via `inhouse_mailbox_events`
- [x] Safe disable flow — only deprovisions OpenSRS after MX confirmed switched back

### Phase 5: External Mailbox Integration (Level 2)

- [ ] Google OAuth adapter (from original plan)
- [ ] Zoho OAuth adapter (from original plan)
- [ ] Connection management UI
- [ ] Metadata sync (if needed)

---

## Relation to Original Mailboxes Plan

The original `mailboxes-service-plan.md` remains valid for Phase 3. Key pieces to reuse:

| Component | Reuse? | Notes |
|-----------|--------|-------|
| OAuth state management (PKCE) | Yes | Phase 3 when adding Google/Zoho |
| Provider adapter interface | Yes | Clean abstraction |
| Token encryption pattern | Yes | For OAuth tokens |
| Token refresh with locking | Yes | For OAuth tokens |
| Daily send cap tracking | Maybe | SheenApps-managed has its own quotas |
| Domain verification tables | Yes | `inhouse_mail_domains` → Level 1 |
| Domain DNS check jobs | Yes | Level 1 |

**Recommendation:** Keep the original plan document for reference. Don't delete it - it's Phase 3.

---

## Inbox ID Generation

When a project is created, auto-generate a non-guessable inbox ID:

```typescript
import { randomBytes } from 'crypto'

function generateInboxId(): string {
  // Generate 6-8 lowercase alphanumeric chars
  // Using base36 (0-9, a-z) for URL-safe, lowercase-only IDs
  const bytes = randomBytes(6)
  const id = bytes.toString('base64url').toLowerCase().slice(0, 8)
  return `p_${id}`
}

async function createInboxConfig(projectId: string, displayName: string): Promise<InboxConfig> {
  // Retry loop for uniqueness (collisions are extremely rare)
  for (let attempt = 0; attempt < 5; attempt++) {
    const inboxId = generateInboxId()
    try {
      return await db.inhouse_inbox_config.create({
        project_id: projectId,
        inbox_id: inboxId,
        display_name: displayName,
      })
    } catch (e) {
      if (isUniqueViolation(e)) continue
      throw e
    }
  }
  throw new Error('Failed to generate unique inbox ID')
}
```

**Key differences from slug-based approach:**
- Inbox ID is random, not derived from project name (spam resistance)
- Project name becomes `display_name` (shown in From header, editable)
- No uniqueness checks against project names needed
- Lowercase-only for email address simplicity

Add to project creation flow. Run migration for existing projects.

---

## Security Considerations

### Inbound Spam Prevention

- Rate limit per sender email (e.g., 10 msgs/min per sender per project)
- Block known spam domains
- Optional: integrate with spam scoring service
- Size limits: 10MB per message, reject larger

### Webhook Security

- Verify Resend/SES webhook signatures
- IP allowlist for webhook endpoints (Resend/AWS IPs)
- Reject malformed payloads

### Data Retention

- Default 90 days, configurable per project
- Scheduled job deletes old messages
- Respect user deletion requests (archive vs hard delete)

### No Email Body Search

- MVP: No full-text search on email bodies (privacy)
- Phase 2: Optional FTS with explicit opt-in

### HTML Body Security

**`html_body` is untrusted user input.** When rendering in admin UI:

- **Default:** Show plain text preview only (from `snippet` or `text_body`)
- **On click "View HTML":** Render in sandboxed iframe with `sandbox` attribute
- **Never** inject `html_body` directly into React/DOM without sanitization
- Consider DOMPurify or similar for any HTML rendering
- Strip `<script>`, `onclick`, `javascript:` URLs, etc.

### Reply-From Behavior (Level 0)

**Problem:** If a user "replies" to a support email but the reply comes from a shared address, two issues arise:
1. Some email clients ignore Reply-To and reply to From directly
2. One bad project's abuse affects reputation of shared address

**Solution for Level 0 (before custom domain):**

| Field | Value |
|-------|-------|
| **From** | `"Acme Store" <p_7h2k9x@inbox.sheenapps.com>` (per-project, non-guessable) |
| **Reply-To** | Same inbox address (or alias if configured) |
| **In-Reply-To** | Original message's Message-ID (for threading) |
| **References** | Thread's reference chain (for threading) |

This ensures:
- **Reputation isolation:** Each project has its own sending identity
- **Reply handling:** Even if client ignores Reply-To, replies go to the right inbox
- **Display name gives the "support@" feel** without exposing a guessable/shared address
- Email threading works correctly in customer's email client

**After custom domain (Level 1):** From = `"Acme Store" <support@their-domain.com>`

### Abuse Prevention (Critical for Domain + Email)

**If we make domain + email one-click, spammers will try it.** This is especially important for Phase 3 (domain registration).

**Prevention layers:**

| Layer | Implementation |
|-------|----------------|
| **Account verification** | Phone verification required before custom domain |
| **Payment verification** | Credit card on file, not just free tier |
| **Send caps** | Per-day limits that increase over time (warm-up) |
| **Burst throttling** | Max 10 emails/minute for new accounts |
| **Content heuristics** | Flag suspicious patterns (all-BCC, link-heavy, etc.) |
| **Reputation scoring** | Track bounce/complaint rates per project |
| **Manual review** | High-volume senders require approval |

**Domain registration specific:**
- Verify billing before domain purchase
- Clear ownership terms: "domain is yours, managed by SheenApps"
- What happens on cancellation: grace period, then domain released
- Abuse = immediate suspension

### Domain Ownership Clarity

If we ever become a domain reseller, users must understand:
- The domain is **theirs** (we're the registrar, not the owner)
- They can transfer out if they leave SheenApps
- What happens if they stop paying (grace period, restore fees, expiry)
- We can suspend for abuse, but not seize ownership

---

## Metering & Quotas

Integrate with existing `InhouseMeteringService`:

| Metric | Quota Type | Default |
|--------|-----------|---------|
| `inbox_messages_received` | Monthly | 1000/month (Free), 10000/month (Pro) |
| `inbox_storage_mb` | Current | 100MB (Free), 1GB (Pro) |
| `email_sends` | Monthly | Already exists |

---

## Admin Panel Integration

Add to existing inhouse admin:

```
/admin/projects/:projectId/inbox
  ├── /messages       - List all messages
  ├── /threads        - List conversations
  ├── /settings       - Inbox config, auto-reply
  └── /domain         - Custom domain setup (Phase 2)
```

---

## Success Criteria

### MVP (Level 0)

- [ ] User creates project → gets inbox address immediately
- [ ] External email to `p_<inbox-id>@inbox.sheenapps.com` → appears in inbox
- [ ] SDK: `inbox.listMessages()`, `inbox.reply()` work
- [ ] Admin panel shows inbox
- [ ] Auto-reply works when enabled

### Level 1a (Subdomain - Safest Path)

- [ ] User adds one NS record for `mail.their-domain.com`
- [ ] We detect delegation and auto-provision DNS
- [ ] Outbound sends from `noreply@mail.their-domain.com`
- [ ] Inbound works at `support@mail.their-domain.com`

### Level 1b (Nameservers - Best UX)

- [ ] User switches NS to SheenApps
- [ ] We import existing DNS records safely
- [ ] Outbound sends from `noreply@their-domain.com`
- [ ] Inbound works at `support@their-domain.com`
- [ ] Existing website/services continue to work

### Level 1c (Manual DNS - Escape Hatch)

- [ ] User adds SPF, DKIM, DMARC, MX records manually
- [ ] We verify records are correct
- [ ] Outbound sends from `noreply@their-domain.com`
- [ ] Inbound works at `support@their-domain.com`

### Level 1.5 (Domain Registration)

- [ ] User can search and buy a domain in SheenApps
- [ ] Domain auto-configured with SheenApps nameservers
- [ ] Email DNS (SPF/DKIM/DMARC/MX) auto-provisioned
- [ ] Renewal reminders and auto-renewal work
- [ ] User can transfer domain out if they churn

### Level 1.75 (Real Mailbox)

- [ ] User can create mailboxes (hello@, support@) on their domain
- [ ] Webmail accessible via "Open inbox" button
- [ ] Password reset works without storing passwords
- [ ] IMAP/SMTP settings available for external clients
- [ ] Provisioning state machine handles edge cases gracefully

### Level 2 (External Mailbox)

- [ ] User can connect Gmail via OAuth
- [ ] Send-as from their Gmail
- [ ] (Optional) Inbox sync from Gmail

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Resend inbound limitations | Medium | Medium | Have SES as backup option |
| Spam floods inbox | High | Medium | Rate limiting, spam filtering, abuse detection |
| DNS propagation confusion | High | Low | Clear UI messaging, auto-retry checks, 48h patience |
| Thread detection fails | Medium | Low | Allow manual thread merging |
| Storage costs grow | Medium | Medium | Retention limits, storage quotas |
| NS switch breaks user's website | Medium | High | DNS record import wizard, preview before switch |
| Subdomain not "branded enough" | Medium | Low | Position as "safest", offer upgrade path to full domain |
| DNS hosting reliability | Medium | High | Use Cloudflare DNS API, not self-hosted |
| Abuse via easy domain+email | High | High | Phone/payment verification, send caps, reputation scoring |
| Domain renewal failures | Low | High | (Phase 3) Multiple payment retries, grace period, clear comms |
| OpenSRS API limitations | Medium | Medium | Have backup vendor evaluated, adapter pattern allows swap |
| Hosted mailbox provider outage | Medium | High | (Phase 4) Monitor provider status, clear comms, consider multi-provider |
| Password reset support burden | High | Medium | (Phase 4) Self-serve flow, clear UI, rate limiting |
| User confusion: Inbox vs Mailbox | Medium | Low | Clear naming: "SheenApps Inbox" vs "Business Email" |

---

## Questions Before Starting

### Q1: Resend vs SES for inbound?

**Recommendation:** Start with Resend (simplicity, already integrated for outbound). Add SES only if we hit limitations.

### Q2: Should we store email bodies?

**Recommendation:** Yes, but with retention limits. Users need to read messages. Default 90-day retention, configurable.

### Q3: Real-time notifications for new messages?

**Recommendation:** Phase 1.5. Use existing `@sheenapps/realtime` to push new message events.

### Q4: Which Level 1 path to build first?

**Recommendation:** 1c (Manual DNS) first - simplest to implement, establishes the verification infrastructure. Then 1a (Subdomain) as the "recommended easy path". 1b (Nameservers) last - requires DNS hosting infrastructure.

### Q5: DNS hosting: self-hosted vs Cloudflare DNS API?

**Recommendation:** Cloudflare DNS API. Self-hosting authoritative DNS is operationally heavy. Cloudflare's API lets us manage records programmatically without running nameservers.

### Q6: When to build domain registration (Phase 3)?

**Recommendation:** Only after Level 1 paths are proven and we have strong abuse prevention. This is a significant operational commitment. Validate demand first.

### Q7: Do we need "real mailboxes" (IMAP/Webmail)?

**Recommendation:** Not for MVP. SheenApps Inbox handles the core use case (support tickets, contact forms). Real mailboxes (Level 1.75) should be Phase 4+, after domain registration is stable. Most Easy Mode users don't need IMAP access.

**If demand emerges:** Start with OpenSRS Email (same vendor as domains). The MailboxEngineAdapter abstraction allows adding WorkMail or swapping providers later.

### Q8: Should we run our own mail servers eventually?

**Recommendation:** Almost certainly no. The "eject path" to self-hosted mail is technically possible (IMAP migration + MX switch) but operationally painful. Running mail servers means owning:
- IP reputation and deliverability
- Spam filtering (inbound and outbound)
- DKIM key rotation
- Bounce handling
- Abuse and account compromise (24/7 problem)

The MailboxEngineAdapter makes "eject" possible, but the right long-term answer is: keep mailbox storage on a hosted provider, keep outbound sending on a trusted relay (Resend/SES).

---

## Checklist Before Phase 1 Kickoff

- [ ] Confirm Resend supports inbound for our use case
- [ ] Verify MX record requirements for `inbox.sheenapps.com`
- [ ] Define storage quotas per plan tier
- [ ] Design admin UI mockups for inbox
- [ ] Decide on spam filtering approach

## Checklist Before Phase 2 Kickoff (Custom Domain)

- [ ] Decide on DNS hosting approach (Cloudflare API recommended)
- [ ] Define which Level 1 path to prioritize (recommend: 1c → 1a → 1b)
- [ ] Design domain wizard UX mockups
- [ ] Plan abuse prevention measures (especially for future domain registration)
- [ ] Verify Resend domain API capabilities

## Checklist Before Phase 3 Kickoff (Domain Registration)

- [ ] Validate demand: are users asking for domain purchase?
- [ ] OpenSRS reseller account setup + sandbox access
- [ ] Verify OpenSRS API supports: NS at registration, NS changes, zone templates, webhooks
- [ ] Define pricing strategy (pass-through vs markup)
- [ ] Stripe integration for domain billing (separate from subscription)
- [ ] Abuse prevention measures in place (phone/payment verification, send caps)
- [ ] Legal: domain ownership terms, transfer-out policy, cancellation policy
- [ ] Support playbook for domain issues (DNS propagation, renewals, transfers)

## Checklist Before Phase 4 Kickoff (Real Mailbox)

- [ ] Validate demand: are users asking for IMAP/Webmail?
- [ ] Domain registration (Phase 3) is stable
- [ ] Evaluate OpenSRS Email vs WorkMail for mailbox hosting
- [ ] MailboxEngineAdapter interface defined
- [ ] Password reset UX designed (self-serve, no password storage)
- [ ] Support playbook for mailbox issues (password resets, "can't receive email")

---

## Implementation Progress

### Phase 1: MVP Inbound

| Task | Status | Notes |
|------|--------|-------|
| Database migration | ✅ Done | `133_inhouse_inbox.sql` - tables, indexes, RLS policies |
| InhouseInboxService | ✅ Done | Full service with threading, aliases, activity logging |
| Inbox API routes | ✅ Done | `inhouseInbox.ts` - messages, threads, config, aliases |
| Webhook handler | ✅ Done | `inhouseInboxWebhook.ts` + `inboxWebhookWorker.ts` (hardened Round 6) |
| @sheenapps/inbox SDK | ✅ Done | Full SDK with types, client, README |
| Inbox ID generation | ✅ Done | Auto-generated in InhouseProjectService.createProject |
| Admin panel UI | ⏳ Pending | |

### Implementation Notes

**2026-01-27: Migration created**
- Created `133_inhouse_inbox.sql` with 4 tables:
  - `inhouse_inbox_messages` - received emails with attachments metadata, processing status
  - `inhouse_inbox_threads` - thread grouping with denormalized counts
  - `inhouse_inbox_config` - per-project settings, inbox_id
  - `inhouse_inbox_aliases` - friendly alias mappings
- Added RLS policies for all tables (owner_id based)
- Note: `references` column quoted because it's a reserved word in PostgreSQL

**2026-01-27: InhouseInboxService completed**
- Created `InhouseInboxService.ts` with full implementation:
  - `receiveMessage()` - store incoming email, handle threading, deduplication
  - `listMessages()`, `getMessage()`, `markRead()`, `archiveMessage()`, `deleteMessage()`
  - `listThreads()`, `getThread()` - thread operations with message aggregation
  - `getConfig()`, `updateConfig()` - inbox settings
  - `createAlias()`, `listAliases()`, `deleteAlias()` - alias management
  - `resolveProjectFromRecipient()` - static helper for webhook routing
- Added reserved alias list for anti-squatting (admin, support, postmaster, etc.)
- Singleton factory pattern with `getInhouseInboxService()`
- Activity logging integrated throughout

**2026-01-27: API Routes completed**
- Created `inhouseInbox.ts` with 10 endpoints:
  - Messages: GET list, GET single, PATCH update, DELETE
  - Threads: GET list, GET single
  - Config: GET, PATCH
  - Aliases: POST create, DELETE
- HMAC authentication on all routes
- Input validation with DoS protection limits
- Registered in server.ts

**2026-01-27: Webhook handler completed**
- Created `inhouseInboxWebhook.ts`:
  - POST `/webhooks/resend/inbound` - receives inbound emails from Resend
  - Svix signature verification (Resend uses Svix for webhooks)
  - Fast enqueue → 200 pattern
  - Health check endpoint
- Created `inboxWebhookWorker.ts`:
  - BullMQ worker for processing inbound email jobs
  - Calls InhouseInboxService.receiveMessage()
  - Activity logging for success/failure
  - Graceful startup/shutdown
- Added `InboxWebhookJobData` type and `inboxWebhookQueue` to modularQueues.ts
- Worker initialization in server.ts (both arch modes)

**2026-01-27: Inbox ID generation completed**
- Added `generateInboxId()` function to InhouseProjectService
- Format: `p_` + 8 hex characters (48 bits entropy)
- Auto-creates `inhouse_inbox_config` record on project creation
- Returns inbox info in project creation response
- Updated `EasyModeProject` interface to include inbox address

**2026-01-27: @sheenapps/inbox SDK completed**
- Created `sheenapps-packages/inbox/` with full SDK structure:
  - `package.json` - npm package config, keywords, scripts
  - `tsconfig.json` - TypeScript configuration
  - `tsup.config.ts` - Build configuration (CJS + ESM + types)
  - `src/types.ts` - All type definitions
  - `src/client.ts` - SheenAppsInboxClient with all operations
  - `src/index.ts` - Public exports
  - `README.md` - Documentation with examples
- SDK features:
  - Messages: list, get, update, markAsRead, archive, delete
  - Threads: list, get (with messages)
  - Config: get, update
  - Aliases: create, delete
- Server-only validation (requires sheen_sk_* keys)
- Result-based error handling (no exceptions)

### Phase 2A: Custom Domain - Manual DNS

| Task | Status | Notes |
|------|--------|-------|
| Database migration | ✅ Done | `134_inhouse_email_domains.sql` - domain table with DNS status |
| DNS verification service | ✅ Done | `DnsVerificationService.ts` - SPF/DKIM/DMARC/MX/Return-Path checks |
| InhouseDomainsService | ✅ Done | Full service with Resend API integration |
| Domain API routes | ✅ Done | `inhouseEmailDomains.ts` - add, list, get, verify, delete |
| @sheenapps/domains SDK | ✅ Done | Full SDK with types, client, README |
| Periodic verification job | ✅ Done | `domainVerificationWorker.ts` - runs every 6 hours |
| Custom FROM address | ✅ Done | `InhouseEmailService` updated to use verified domains |
| Activity logging | ✅ Done | Already integrated in InhouseDomainsService |

### Phase 2A Implementation Notes

**2026-01-27: Migration created**
- Created `134_inhouse_email_domains.sql` with:
  - `inhouse_email_domains` table with DNS status JSONB
  - Support for authority levels: manual, subdomain, nameservers
  - Verification token for domain ownership proof
  - Resend domain ID tracking for API integration
  - RLS policies for project-level access
  - Indexes for common queries

**2026-01-27: DNS Verification Service completed**
- Created `DnsVerificationService.ts` with:
  - `verifyOwnership()` - TXT record check for verification token
  - `verifySPF()` - SPF record validation (include:resend.com)
  - `verifyDKIM()` - CNAME record check for DKIM key
  - `verifyDMARC()` - DMARC policy record validation
  - `verifyMX()` - MX record pointing to Resend
  - `verifyReturnPath()` - Return-Path CNAME validation
  - `verifyAll()` - Run all verifications
  - `generateDnsInstructions()` - Generate user-friendly DNS setup instructions
  - `isReadyForSending()` - Check if domain can send emails
- Uses Node.js `dns/promises` for DNS queries
- Supports passing Resend API record values for accurate DKIM checking

**2026-01-27: InhouseDomainsService completed**
- Created `InhouseDomainsService.ts` with:
  - `addDomain()` - Add domain, create Resend domain, store verification token
  - `listDomains()` - List all project domains
  - `getDomain()` - Get domain by ID
  - `deleteDomain()` - Remove domain from Resend and database
  - `verifyDomain()` - Run DNS verification and update status
  - `getDnsInstructions()` - Get DNS setup instructions
- Full Resend Domain API integration:
  - Creates domain in Resend when added
  - Deletes from Resend when removed
  - Fetches Resend DNS requirements for accurate instructions
- Domain status management: pending → verifying → active/failed
- Quota enforcement before adding domains

**2026-01-27: API Routes completed**
- Created `inhouseEmailDomains.ts` with 5 endpoints:
  - POST `/v1/inhouse/projects/:projectId/email-domains` - Add domain
  - GET `/v1/inhouse/projects/:projectId/email-domains` - List domains
  - GET `/v1/inhouse/projects/:projectId/email-domains/:domainId` - Get domain
  - POST `/v1/inhouse/projects/:projectId/email-domains/:domainId/verify` - Verify
  - DELETE `/v1/inhouse/projects/:projectId/email-domains/:domainId` - Delete
- Note: Separate from `inhouseDomains.ts` which handles website hosting domains (CNAME verification)
- HMAC authentication on all routes
- Domain validation with blocked patterns (no localhost, internal IPs, *.sheenapps.com)

**2026-01-27: @sheenapps/domains SDK completed**
- Created `sheenapps-packages/domains/` with full SDK structure:
  - `package.json` - npm package config
  - `tsconfig.json` - TypeScript configuration
  - `tsup.config.ts` - Build configuration (CJS + ESM + types)
  - `src/types.ts` - DNS record types, domain types, API types
  - `src/client.ts` - DomainsClient with all operations
  - `src/index.ts` - Public exports
  - `README.md` - Documentation with examples
- SDK features:
  - `addDomain()` - Add custom email domain
  - `listDomains()` - List all domains
  - `getDomain()` - Get domain with DNS instructions
  - `verifyDomain()` - Trigger DNS verification
  - `deleteDomain()` - Remove domain
  - `isReadyForSending()` - Check if domain can send

### Discoveries & Notes

**Email domains vs Website domains:**
- `inhouseEmailDomains.ts` handles email domain verification (SPF/DKIM/DMARC for sending)
- `inhouseDomains.ts` handles website hosting domains (CNAME for routing)
- Different verification requirements, different use cases
- Both share the same project-scoped pattern

**Resend Domain API integration:**
- Resend provides the actual DKIM and Return-Path records when domain is added
- DNS verification uses these Resend-provided values for accurate checking
- Domain must be added to Resend first, then DNS records configured

### Phase 2B: Custom Domain - Cloudflare-Managed

| Task | Status | Notes |
|------|--------|-------|
| CloudflareService | ✅ Done | Full Cloudflare DNS API integration |
| Subdomain delegation flow | ✅ Done | `initiateSubdomainDelegation()`, `checkSubdomainDelegation()`, `provisionSubdomainEmailRecords()` |
| Nameserver switch flow | ✅ Done | `initiateNameserverSwitch()`, `checkNameserverSwitch()`, `provisionNameserverEmailRecords()` |
| Domain verification worker | ✅ Done | `domainVerificationWorker.ts` - scheduled job every 6 hours |
| Custom FROM address | ✅ Done | `InhouseEmailService` uses verified domains for sending |
| API routes | ✅ Done | 6 new endpoints in `inhouseEmailDomains.ts` |
| DNS record import wizard | ✅ Done | `previewNameserverSwitch()`, `scanExistingDnsRecords()` |
| Inbound routing for subdomains | ✅ Done | `resolveProjectFromRecipient()` updated for custom domains |

### Phase 2B Implementation Notes

**2026-01-27: CloudflareService created**
- Created `CloudflareService.ts` with full Cloudflare DNS API integration:
  - Zone management: `createZone()`, `getZone()`, `deleteZone()`, `listZones()`, `checkZoneStatus()`
  - DNS record management: `createDnsRecord()`, `getDnsRecord()`, `listDnsRecords()`, `updateDnsRecord()`, `deleteDnsRecord()`
  - Email provisioning: `generateEmailDnsRecords()`, `provisionEmailDnsRecords()`, `deprovisionEmailDnsRecords()`
- Singleton pattern with `getCloudflareService()` and `isCloudflareConfigured()`
- Uses `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` env vars
- Exported from `services/inhouse/index.ts`

**2026-01-27: Subdomain delegation flow (Path 1a) completed**
- Added methods to `InhouseDomainsService`:
  - `initiateSubdomainDelegation()` - Create CF zone for `mail.domain.com`
  - `checkSubdomainDelegation()` - Verify NS records are configured
  - `provisionSubdomainEmailRecords()` - Add SPF/DKIM/DMARC/MX/Return-Path to CF zone
- Generates user-friendly NS delegation instructions
- Supports common registrars (GoDaddy, Namecheap, Cloudflare, Google, Route 53)

**2026-01-27: Nameserver switch flow (Path 1b) completed**
- Added methods to `InhouseDomainsService`:
  - `initiateNameserverSwitch()` - Create CF zone for full domain
  - `checkNameserverSwitch()` - Verify NS are switched to Cloudflare
  - `provisionNameserverEmailRecords()` - Add email DNS records to CF zone
- Generates nameserver switch instructions
- Zone status tracking: pending → active

**2026-01-27: Domain verification worker created**
- Created `domainVerificationWorker.ts` with scheduled BullMQ job:
  - Runs every 6 hours to check stale domains
  - Batch verification of domains not checked in 24h
  - DNS drift detection with activity logging
  - Single domain verification for on-demand checks
- Added `domainVerificationQueue` to `modularQueues.ts`
- Worker initialization in `server.ts` (both arch modes)

**2026-01-27: Custom FROM address integration**
- Enhanced `InhouseEmailService` to support custom FROM addresses:
  - Added `fromName` and `fromLocalPart` to `SendEmailOptions`
  - `getProjectEmailConfig()` checks for verified custom domains
  - `buildFromAddress()` constructs proper from address
  - Falls back to SheenApps inbox address if no verified domain
- Outbound emails now use `support@their-domain.com` when domain is verified

**2026-01-27: API routes added**
- Added 6 new endpoints to `inhouseEmailDomains.ts`:
  - POST `/subdomain-delegation` - Initiate subdomain delegation
  - GET `/subdomain-delegation/status` - Check delegation status
  - POST `/subdomain-delegation/provision` - Provision email records
  - POST `/nameserver-switch` - Initiate nameserver switch
  - GET `/nameserver-switch/status` - Check switch status
  - POST `/nameserver-switch/provision` - Provision email records
- All routes use HMAC authentication

### Phase 2C: Guided Wizard UX

| Task | Status | Notes |
|------|--------|-------|
| DNS status progress indicator | ✅ Done | GET `/email-domains/:domainId/status` endpoint |
| Registrar detection | ✅ Done | GET `/email-domains/:domainId/registrar` endpoint |
| Tailored DNS instructions | ✅ Done | 15+ registrars detected with specific setup guides |
| Admin panel wizard UI | ⏳ Pending | Frontend implementation |

### Phase 2C Implementation Notes

**2026-01-27: DNS record import wizard completed**
- Added `scanExistingDnsRecords()` to DnsVerificationService:
  - Queries A, AAAA, CNAME, TXT, MX, NS, CAA records
  - Scans common subdomains (www, mail, api, app, cdn, blog, shop, admin, dev, staging)
  - Detects existing DKIM and SPF records
  - Returns warnings for critical records (website, email)
- Added `previewNameserverSwitch()` to InhouseDomainsService:
  - Shows what records will be imported before user commits
  - Generates formatted preview with warnings
  - Activity logging for preview actions
- Added API endpoint: GET `/email-domains/:domainId/nameserver-switch/preview`

**2026-01-27: Inbound email routing for custom domains completed**
- Updated `resolveProjectFromRecipient()` in InhouseInboxService:
  - First checks SheenApps inbox patterns (p_xxx@inbox.sheenapps.com)
  - Then checks SheenApps aliases
  - Finally looks up custom domains in `inhouse_email_domains` table
  - Only routes to verified domains with MX configured
- Added `extractEmailParts()` helper for parsing any email address
- Updated CloudflareService MX record to use `inbound-smtp.resend.io`

**2026-01-27: DNS status progress indicator completed**
- Added GET `/email-domains/:domainId/status` endpoint:
  - Returns structured verification progress
  - Each record type has: verified, status (verified/pending/error/optional), message, actual value
  - Summary with required vs optional counts and percentage complete
  - Used by wizard UI for progress display

**2026-01-27: Registrar detection completed**
- Added `detectRegistrar()` to DnsVerificationService:
  - Queries NS records and matches against 15+ registrar patterns
  - Supports: GoDaddy, Namecheap, Cloudflare, Google Domains, Route 53, Bluehost, HostGator, DreamHost, Hover, Name.com, Gandi, Porkbun, Dynadot, IONOS, OVH
  - Returns confidence level (high/medium/low)
  - Includes direct link to DNS settings page when known
- Added `generateRegistrarInstructions()` with step-by-step guides for each registrar
- Added GET `/email-domains/:domainId/registrar` endpoint

### Phase 3: Domain Registration ✅

| Task | Status | Notes |
|------|--------|-------|
| OpenSRS API service | ✅ Done | `OpenSrsService.ts` - full API integration |
| Database migration | ✅ Done | `135_inhouse_registered_domains.sql` |
| Domain registration service | ✅ Done | `InhouseDomainRegistrationService.ts` |
| API routes | ✅ Done | `inhouseDomainRegistration.ts` - 8 endpoints |
| Stripe billing integration | ✅ Done | `DomainBillingService.ts` - payment intents, saved methods |
| Domain billing migration | ✅ Done | `136_inhouse_domain_invoices.sql` |
| Idempotency migration | ✅ Done | `137_domain_events_idempotency.sql` (Round 6) |
| OpenSRS webhook handler | ✅ Done | `opensrsWebhook.ts` - lifecycle events (hardened Round 6) |
| Domain renewal worker | ✅ Done | `domainRenewalWorker.ts` - auto-renewals + reminders |
| Admin panel UI | ⏳ Pending | Domain search and purchase wizard |

### Phase 3 Implementation Notes

**2026-01-27: OpenSRS API service created**
- Created `OpenSrsService.ts` with full OpenSRS XML API integration:
  - XML request building with MD5 signature authentication
  - `searchDomains()` - Check availability of multiple domains at once
  - `checkAvailability()` - Single domain availability check
  - `getSuggestedDomains()` - Get domain suggestions based on keyword
  - `getDomainPricing()` - Get pricing for a TLD
  - `registerDomain()` - Full domain registration with contacts and nameservers
  - `renewDomain()` - Renew existing domain
  - `getDomainInfo()` - Get domain details and status
  - `getAuthCode()` - Retrieve transfer auth code
  - `updateNameservers()` - Change domain nameservers
  - `updateContacts()` - Update domain contact information
  - `setWhoisPrivacy()` - Enable/disable WHOIS privacy
  - `setAutoRenew()` - Enable/disable auto-renewal
  - `setLock()` - Enable/disable transfer lock
- Uses `OPENSRS_API_KEY`, `OPENSRS_RESELLER_USERNAME`, `OPENSRS_BASE_URL` env vars
- Singleton pattern with `getOpenSrsService()` and `isOpenSrsConfigured()`
- Exports types for domain contacts, search results, registration input/output

**2026-01-27: Database migration created**
- Created `135_inhouse_registered_domains.sql` with 3 tables:
  - `inhouse_registered_domains` - Domains purchased through SheenApps
    - Tracks OpenSRS order/domain IDs
    - Registration/expiry dates
    - Status (pending, active, expired, grace, redemption, suspended, transferred)
    - Auto-renew, WHOIS privacy, lock settings
    - Nameservers (JSONB array)
    - Contacts (JSONB with owner/admin/billing/tech)
    - Billing info (last payment ID, next renewal price)
    - Links to email domain and Cloudflare zone
  - `inhouse_domain_events` - Audit trail for domain lifecycle
    - Event types: registered, renewed, expired, transferred, nameservers_updated, etc.
    - Actor tracking (user, system, webhook)
  - `inhouse_domain_pricing` - Cached TLD pricing from OpenSRS
    - Registration, renewal, transfer prices
    - Markup percentage
    - Premium-only flags
- RLS policies for project-level access
- Indexes for common queries (by project, status, expiry, auto-renew)
- Default pricing for common TLDs (com, net, org, io, co, app, dev, ai)

**2026-01-27: InhouseDomainRegistrationService created**
- Created `InhouseDomainRegistrationService.ts` with high-level business logic:
  - `searchDomains()` - Search availability with pricing, returns structured results
  - `purchaseDomain()` - Full purchase flow:
    1. Check availability
    2. Get pricing
    3. Create Stripe payment intent (TODO)
    4. Register domain via OpenSRS
    5. Create Cloudflare zone
    6. Provision email DNS records
    7. Store in database
    8. Record event
  - `listDomains()`, `getDomain()` - Query registered domains
  - `renewDomain()` - Renewal flow with payment and OpenSRS API
  - `getAuthCode()` - Retrieve transfer auth code for user
  - `updateSettings()` - Update auto-renew, WHOIS privacy, lock
  - `updateNameservers()` - Change nameservers (with Cloudflare zone cleanup)
  - `getDomainEvents()` - Get audit trail for a domain
  - `getTldPricing()` - Get cached TLD pricing (syncs if stale)
- Coordinates OpenSRS, Cloudflare, and Stripe services
- Event recording for all domain lifecycle changes
- Singleton pattern with `getInhouseDomainRegistrationService()`

**2026-01-27: API routes created**
- Created `inhouseDomainRegistration.ts` with 8 endpoints:
  - POST `/domain-search` - Search domain availability (body: query, tlds, userId)
  - POST `/domain-register` - Register a domain (body: domain, contacts, userId, period, options)
  - GET `/registered-domains` - List all registered domains for user
  - GET `/registered-domains/:domainId` - Get single domain details
  - POST `/registered-domains/:domainId/renew` - Renew domain
  - GET `/registered-domains/:domainId/auth-code` - Get transfer auth code
  - PATCH `/registered-domains/:domainId/settings` - Update domain settings
  - GET `/registered-domains/:domainId/events` - Get domain event history
  - GET `/tld-pricing` - Get pricing for TLDs
- HMAC authentication on all routes
- Input validation with domain and contact validation
- Registered in `server.ts`

**Architecture notes:**
- OpenSRS uses XML-based API with MD5 signature authentication
- Domain contacts stored as JSONB to support all 4 contact types (owner, admin, billing, tech)
- Cloudflare zone created automatically on domain registration for DNS management
- Event-sourcing pattern for domain lifecycle audit trail
- Single reseller account model with project-level enforcement in application code

**2026-01-27: Stripe billing integration completed**
- Created `DomainBillingService.ts` for platform-level domain billing:
  - Uses SheenApps' Stripe account (not BYO)
  - `getOrCreateCustomer()` - Get/create Stripe customer
  - `createSetupIntent()` - Save payment methods for auto-renewal
  - `listPaymentMethods()` - List user's saved cards
  - `setDefaultPaymentMethod()` - Set default for auto-renewal
  - `createDomainPayment()` - Create payment intent for registration/renewal
  - `confirmPayment()` - Handle 3DS confirmation
  - `processAutoRenewal()` - Off-session charges for auto-renewal
  - `refundPayment()` - Refund on registration failure
  - `handleWebhookEvent()` - Handle payment_intent.succeeded/failed
- Created `136_inhouse_domain_invoices.sql` migration:
  - `inhouse_domain_invoices` - Billing records for domain purchases
  - `inhouse_domain_payment_methods` - Saved payment methods
  - Added `user_id` column to `inhouse_registered_domains`
  - RLS policies for user-level access
- Integrated billing into `InhouseDomainRegistrationService`:
  - `purchaseDomain()` now creates payment intent before registration
  - Returns `paymentIntentClientSecret` for 3DS handling
  - Automatic refund if OpenSRS registration fails
  - `renewDomain()` integrated with billing

**2026-01-27: OpenSRS webhook handler created**
- Created `opensrsWebhook.ts` for domain lifecycle webhooks:
  - POST `/webhooks/opensrs/domain` - Main webhook endpoint
  - GET `/webhooks/opensrs/health` - Health check
  - Signature verification with HMAC-SHA256
  - Optional IP allowlist via `OPENSRS_WEBHOOK_IPS`
- Handles domain lifecycle events:
  - `domain_expiry_warning` - Logs warning, prepares notification
  - `domain_expired` - Updates status to 'expired'
  - `domain_grace_period` - Updates status to 'grace'
  - `domain_redemption` - Updates status to 'redemption'
  - `domain_renewed` - Updates status and expiry date
  - `domain_transferred_out` - Updates status to 'transferred'
  - `domain_ns_changed` - Updates nameservers in database
  - `domain_lock_changed` / `domain_privacy_changed` - Updates settings
- Records all events in `inhouse_domain_events` table
- Activity logging for audit trail

**2026-01-27: Domain renewal worker created**
- Created `domainRenewalWorker.ts` for automated renewals:
  - BullMQ worker with scheduled jobs
  - Daily reminder job at 9 AM UTC
  - Daily auto-renewal job at 10 AM UTC
- Renewal reminders at 30/7/1 days before expiry:
  - Queries domains by expiry date
  - Records events for notification (TODO: send actual emails)
- Auto-renewal processing:
  - Processes domains with `auto_renew=true` 3 days before expiry
  - Gets user's default payment method
  - Processes off-session payment via `DomainBillingService`
  - Calls OpenSRS renewal API on payment success
  - Refunds if OpenSRS renewal fails
  - Records success/failure events
- Graceful error handling and logging

**2026-01-27: DomainBillingService refactored to use StripeProvider**
- Refactored `DomainBillingService.ts` to integrate with existing payment infrastructure:
  - Now uses `StripeProvider.getOrCreateCustomer()` for race-safe customer management with idempotency
  - Now uses `StripeProvider.createRefund()` for refunds with proper logging and idempotency keys
  - Uses shared Stripe config via `getStripeConfig()` for consistency
  - Domain-specific operations (SetupIntents, off-session payments) still use Stripe SDK directly
- Architecture pattern:
  - Common operations → delegate to StripeProvider (customer management, refunds)
  - Domain-specific operations → direct Stripe SDK (SetupIntents, PaymentIntents, PaymentMethods)
  - Reason: Domain billing requires one-time payments and off-session charges, not checkout sessions
- Added new activity types:
  - `'domain-billing'` and `'domain-registration'` to ActivityService union type
  - `'webhook'` to ActorType union type

**2026-01-27: DNS record consistency fixes (from code review)**

Critical fixes for DNS record mismatches between CloudflareService (provisioning) and DnsVerificationService (verification):

1. **Created centralized `emailDnsConstants.ts`** - Single source of truth for all email DNS configuration:
   - `EMAIL_DNS.SPF_INCLUDE` = `include:resend.com`
   - `EMAIL_DNS.OWNERSHIP_HOST(domain)` = `_sheenapps-verify.{domain}`
   - `EMAIL_DNS.OWNERSHIP_VALUE(token)` = `sheenapps-verify={token}`
   - `EMAIL_DNS.RETURN_PATH_HOST(domain)` = `bounces.{domain}` (plural)
   - `EMAIL_DNS.RETURN_PATH_TARGET` = `bounces.resend.com`

2. **Fixed SPF mismatch**:
   - Was: CloudflareService used `include:resend.com`, DnsVerificationService verified `include:amazonses.com`
   - Now: Both use `EMAIL_DNS.SPF_INCLUDE` = `include:resend.com`

3. **Fixed Return-Path hostname mismatch**:
   - Was: CloudflareService created `bounces.{domain}`, DnsVerificationService checked `bounce.{domain}` (singular vs plural)
   - Now: Both use `EMAIL_DNS.RETURN_PATH_HOST(domain)` = `bounces.{domain}`

4. **Fixed ownership TXT record mismatch**:
   - Was: CloudflareService created at `_sheenapps-verify.{domain}` with value `sheenapps-verify={token}`, DnsVerificationService checked root domain for raw token
   - Now: Both use `EMAIL_DNS.OWNERSHIP_HOST(domain)` and `EMAIL_DNS.OWNERSHIP_VALUE(token)`

5. **Fixed readyForSending inconsistency**:
   - Was: Route checked only `spf && dkim`, service checked `ownership && spf && dkim`
   - Now: Both require `ownership && spf && dkim`

6. **Added CloudflareService timeouts**:
   - Request methods now use AbortController with 15s timeout
   - Prevents hanging under network issues

**2026-01-27: Domain registration reliability fixes (from code review Round 5)**

Critical fixes for production reliability in domain registration and webhook handling:

1. **Fixed JSON parsing bug in `rowToRegisteredDomain()`**:
   - Was: `nameservers: (row.nameservers as string[])` treating JSON string as array
   - Now: Uses `parseJson<T>()` helper that safely handles both parsed objects and JSON strings
   - Same fix applied to `contacts` field
   - This would have caused runtime errors when reading domain records

2. **Fixed renewal without payment check**:
   - Was: `if (this.billing && input.paymentMethodId)` allowed renewal without payment if paymentMethodId missing
   - Now: Explicit check that returns error if billing is configured but no payment method provided
   - Prevents free renewals when billing is enabled

3. **Fixed nameservers storage after Cloudflare setup**:
   - Was: Stored `regResult.nameservers` (original OpenSRS NS) even after updating to Cloudflare
   - Now: Stores `finalNameservers` which reflects the actual Cloudflare NS after zone creation
   - Database now correctly reflects the nameservers users should see

4. **Added OpenSRS API timeout**:
   - Added 30s request timeout with AbortController to `OpenSrsService.request()`
   - Prevents hung worker connections on network issues
   - Proper timeout error message

5. **Fixed weak password generation**:
   - Was: `createHash('md5').update(input.domain + Date.now()).digest('hex').slice(0, 16)` (predictable)
   - Now: `randomBytes(12).toString('base64url')` (cryptographically secure ~16 chars)

6. **Added webhook idempotency and timestamp verification**:
   - Added `isFreshTimestamp()` check (5-minute skew) to prevent replay attacks
   - Added idempotency key generation from `domain + action + timestamp`
   - Duplicate detection via `metadata.idempotency_key` in domain_events table
   - Improved signature verification to support both hex and base64 encoded signatures
   - Note: Parser is route-scoped (Fastify encapsulation), not global

7. **Refactored renewal worker for proper retries**:
   - Was: Batch job caught errors per-domain, so BullMQ retries re-ran entire batch
   - Now: Batch job enqueues individual per-domain jobs with idempotency keys
   - `processSingleRenewal()` now contains full renewal logic
   - Failed domains throw errors to trigger BullMQ retry correctly
   - Idempotency key `renew:{domainId}:{date}` prevents duplicate jobs per day

8. **Added failed auto-renewal recording**:
   - `DomainBillingService.processAutoRenewal()` now records invoice even when Stripe throws before PaymentIntent
   - Provides audit trail of all renewal attempts, including early failures

**2026-01-27: TypeScript type fixes and migration hardening (from code review Round 5+)**

Fixed TypeScript compilation errors and hardened database migrations:

1. **TypeScript Type Fixes**:
   - Added `getPool` import to `inhouseDomainRegistration.ts`
   - Updated `ReceiveMessageInput` interface: renamed `from`→`fromEmail`, `to`→`toEmail`, added `replyTo` and `snippet`
   - Updated `ReceiveMessageResult` to include `status: 'created' | 'duplicate'`
   - Added `offset` to `ListMessagesOptions` and `ListThreadsOptions`
   - Changed `markRead`, `archiveMessage`, `deleteMessage`, `deleteAlias` to return `Promise<boolean>`
   - Fixed `archiveMessage` to accept optional `isArchived` parameter
   - Fixed `PoolClient` type for `assignThread` method
   - Fixed regex match handling with optional chaining (`match?.[1] ?? null`)
   - Fixed array element access patterns for TypeScript strictness
   - Added `ActivityService` types: `'inbox'`, `'domains'`
   - Added `ActivityStatus` type: `'warning'`
   - Fixed `OpenSrsService` export names in index.ts

2. **Migration Hardening (134, 135, 136)**:
   - **CRITICAL FIX**: Changed `pg_policy` → `pg_policies` (correct PostgreSQL catalog view)
   - Added `tablename` check to all policy existence queries
   - Added `WITH CHECK` clause to all `FOR ALL` RLS policies (required for insert/update)
   - Added `CHECK` constraints for enum string fields to prevent typos:
     - `inhouse_email_domains.provider` → `('resend', 'ses', 'postmark')`
     - `inhouse_registered_domains.status` → 7 valid values
     - `inhouse_domain_events.event_type` → 12 valid values
     - `inhouse_domain_events.actor_type` → `('user', 'system', 'webhook')`
     - `inhouse_domain_invoices.status` → `('pending', 'paid', 'failed', 'refunded')`
     - `inhouse_domain_invoices.type` → `('registration', 'renewal', 'transfer')`
     - `inhouse_domain_payment_methods.status` → `('active', 'expired', 'revoked')`
   - Added unique index on `verification_token` for email domains
   - Added unique partial index for single default payment method per user
   - Added user SELECT policy for registered domains (for billing access)

3. **Inbox Migration Hardening (133)**:
   - Added `processing_status` CHECK constraint
   - Added GIN index on `participant_emails` for containment queries
   - Added reserved aliases CHECK constraint

**2026-01-27: Security hardening (from code review Round 6)**

Comprehensive security improvements across webhook handlers and validation:

1. **Resend Signature Verification Fixes** (`inhouseInboxWebhook.ts`):
   - **Fixed signed payload order**: Now uses correct Svix format `<svix-id>.<svix-timestamp>.<body>`
   - **Moved timestamp check FIRST**: Now checks timestamp freshness before expensive crypto (cheap early reject)
   - **Added fail-closed in production**: Rejects when `RESEND_INBOUND_WEBHOOK_SECRET` not configured in prod
   - **Improved error messages**: Generic "verification failed" to prevent side-channel information leakage
   - **Better buffer handling**: Uses `digest()` for raw bytes instead of base64 intermediate

2. **Attachment Size Cap** (`inhouseInboxWebhook.ts`):
   - Added `MAX_ATTACHMENT_BYTES_FOR_QUEUE = 256KB` constant
   - Attachments larger than limit have metadata only (content stripped)
   - Prevents Redis memory bloat from large attachments in job payloads

3. **OpenSRS Webhook Security** (`opensrsWebhook.ts`):
   - **Fail closed in production**: Rejects when `OPENSRS_WEBHOOK_SECRET` not configured (was: allowing all)
   - Development mode still allows for local testing with warning

4. **OpenSRS Idempotency Improvement**:
   - Created migration `137_domain_events_idempotency.sql`:
     - Added `idempotency_key` column to `inhouse_domain_events`
     - Created unique partial index for atomic deduplication
   - Updated `recordDomainEvent()` to use `ON CONFLICT DO NOTHING` (race-safe)
   - Updated `isDuplicateWebhook()` to query proper indexed column (was: JSONB query)
   - Now single-statement atomic deduplication instead of check-then-insert

5. **Domain Validation Improvements** (`inhouseEmailDomains.ts`):
   - Added `.local`, `.internal`, `.lan` to blocked patterns (mDNS/internal domains)
   - Added `172.16-31.*` private IP range

6. **RequireUserId Helper** (`projectAuth.ts`):
   - Added `requireUserId()` helper for consistent userId validation
   - Returns validated trimmed string or throws with statusCode 400

### Remaining Work

**Phase 2A/2B/2C backend complete:**
- ✅ `resolveProjectFromRecipientDetailed()` with diagnostic failure reasons
- ✅ Webhook uses detailed resolution, logs `reason` on routing failure
- ✅ Auto-create inbox config on first custom-domain email
- ✅ Auto-verify after DNS provisioning (subdomain & nameserver paths)
- ✅ Cloudflare API Token integration (connect, provision, disconnect) — CF has no OAuth, uses scoped API tokens
- ✅ Shared credential encryption utility (`src/utils/credentialEncryption.ts`)
- ✅ `UserCloudflareService` for DNS operations on user's CF zone

**Phase 2C frontend pending:**
- Admin panel wizard UI ("Do you have a domain?" flow)
- CF token input UI for one-click DNS provisioning

**Phase 3 pending:**
- Domain purchase UI in admin panel
- ✅ Email notifications for renewal reminders — sends via InhouseEmailService with idempotency
- ✅ Email notifications for payment failures — sends via InhouseEmailService with idempotency
- ✅ TLD pricing sync from OpenSRS — daily batch_pricing_sync job, markup applied in getTldPricing()
- ✅ Stripe webhook wiring — payment_intent.succeeded/failed handled in StripeWebhookWorker

**Phase 4 (future):**
- Real mailbox via hosted provider (OpenSRS Email or WorkMail)

### Improvements to Consider

**Security improvements (completed in Round 6):**
- ✅ Webhook signature verification hardened (timestamp check first, fail-closed in prod)
- ✅ Attachment size cap to prevent Redis memory issues
- ✅ OpenSRS idempotency moved to indexed column with atomic deduplication
- ✅ Domain validation expanded to block internal TLDs

**Correctness fixes (completed in Round 7):**
- ✅ Fixed JSONB query paths in `InhouseDomainsService` - was using incorrect `(dns_status->>'spf')::jsonb->>'verified'` pattern, now uses proper `dns_status->'spf'->>'verified'`
- ✅ Fixed `returnPath` key mismatch - storage was using `return_path` but TypeScript interface expected `returnPath` (camelCase)
- ✅ Fixed `resolveProjectFromRecipient()` JSONB query for custom domain routing
- ✅ Cleaned up `participant_emails` update in `InhouseInboxService` - removed weird NULL append/remove pattern, now uses clean CASE expression
- ✅ Made email idempotency atomic - replaced SELECT-then-INSERT pattern with INSERT...ON CONFLICT reservation pattern to prevent race conditions

**DNS verification hardening (completed in Round 8):**
- ✅ Added DNS timeout wrapper - all DNS queries now timeout after 10s to prevent hangs
- ✅ Added `normDnsName()` helper - normalizes case and removes trailing dots for accurate comparisons
- ✅ Fixed DKIM TXT validation - now validates `v=DKIM1` and `p=` tags instead of blindly trusting any TXT record
- ✅ Added multiple SPF record detection - returns actionable error per RFC 7208
- ✅ Fixed DMARC validation - now validates `p=` policy tag exists, consistent expected string
- ✅ Updated "Google Domains" to "Squarespace Domains" - reflects 2023 acquisition

**SDK improvements (completed in Round 9):**
- ✅ Fixed `@sheenapps/inbox` query param bug - `offset=0` and `limit=0` were never sent due to falsy check (now uses `!== undefined`)
- ✅ Added timeout to `@sheenapps/domains` - requests now timeout after 10s (configurable) to prevent hangs
- ✅ Added safe JSON parsing to `@sheenapps/domains` - handles HTML errors, empty body, non-JSON responses gracefully
- ✅ Normalized baseUrl in `@sheenapps/domains` - removes trailing slashes to prevent double-slash URLs
- ✅ Added `X-SDK-Version` header to `@sheenapps/domains` - consistent with inbox SDK
- ✅ Added `x-request-id` passthrough in error objects for `@sheenapps/domains`

**SDK polish (completed in Round 10):**
- ✅ Fixed `@sheenapps/inbox` timeout default - changed `||` to `??` to respect explicit `timeout: 0`
- ✅ Simplified `@sheenapps/inbox` browser detection - cleaner check that works with Cloudflare Workers and edge runtimes
- ✅ Fixed `@sheenapps/domains` abort detection - use `controller.signal.aborted` (more reliable across Node/undici/edge)
- ✅ Cleaned up `@sheenapps/domains` timeout handling - removed duplicate `clearTimeout` in catch block

**From Phase 3 implementation:**
- Add rate limiting on domain search endpoints to prevent abuse
- Implement domain pricing cache TTL with automatic refresh from OpenSRS
- Add webhook retry handling for failed domain event processing
- Consider adding domain transfer-in flow (currently only transfer-out supported)
- Add Stripe webhook handling for payment disputes on domain purchases
- Consider CIDR support for OpenSRS IP allowlist (currently exact match only)
- Consider FlowProducer for BullMQ task dependencies (currently using delays)
- **Disable Mailboxes UI:** `disableMailboxes()` is fully specced (state machine above) but not exposed in either admin panel or user-facing UI. The user frontend hook (`useToggleDomainMailboxes`) supports it; the button is intentionally hidden until verified working end-to-end. Before enabling the UI: confirm the worker endpoint handles existing mailboxes gracefully (deprovisioning with data preserved vs deleted), and decide on UX for `resend_pending_mx` state (user needs to update DNS manually).
