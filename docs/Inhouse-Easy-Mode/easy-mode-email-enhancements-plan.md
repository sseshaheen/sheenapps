# Easy Mode Email - Future Enhancements Plan

> **Status:** In Progress
> **Last Updated:** 2026-01-28
> **Implementation Started:** 2026-01-28
> **Parent Plan:** [easy-mode-email-plan.md](./easy-mode-email-plan.md)
> **Scope:** Rate limiting, Stripe disputes, domain transfer-in, and infrastructure improvements

---

## Overview

This plan covers enhancements to the Easy Mode email/domain infrastructure that were identified during Phase 1-4 implementation but deferred for later. Items are prioritized based on business impact and user value.

---
Completed Frontend Items:

1. Webhook Events Viewer (src/components/admin/InhouseWebhookEventsAdmin.tsx)
  - Stats cards (total, completed, processing, retrying, failed)
  - Health status cards (webhooks, pricing, transfers)
  - Events table with filtering by source/status
  - Event detail dialog with raw headers/body view
  - Reprocess failed events functionality
2. Dispute Status Badges (added to InhouseDomainsAdmin.tsx)
  - "Dispute" column in registered domains table
  - Status badges (open, won, lost, withdrawn)
  - Dispute details section in domain detail dialog
  - Health alert for disputed/at_risk domains
3. Domain Transfer UI (added to InhouseDomainsAdmin.tsx)
  - "Transfers" tab with status filtering
  - Transfers table (domain, status, source registrar, price, dates)
  - Health alert for active transfers
4. Health Dashboard (integrated into webhook events viewer)
  - Pricing cache health
  - Webhook processing health
  - Transfer status health

Remaining Items (Non-Frontend - Require External Action):
┌─────────────────────────┬────────────────────────────────────────────────────┐
│          Item           │                       Reason                       │
├─────────────────────────┼────────────────────────────────────────────────────┤
│ Redis unavailable test  │ Manual testing required                            │
├─────────────────────────┼────────────────────────────────────────────────────┤
│ Stripe CLI testing      │ Requires stripe trigger charge.dispute.created     │
├─────────────────────────┼────────────────────────────────────────────────────┤
│ OpenSRS sandbox testing │ Requires API credentials and actual transfer tests │
├─────────────────────────┼────────────────────────────────────────────────────┤
│ Documentation           │ Needs writing for users/support                    │
└─────────────────────────┴────────────────────────────────────────────────────┘

---

## Priority Matrix

| # | Enhancement | Priority | Effort | Impact |
|---|-------------|----------|--------|--------|
| 1 | Rate limiting on domain search | **High** | Medium | Prevents abuse, controls OpenSRS API costs |
| 2 | Stripe dispute handling | **High** | Medium | Revenue protection, legal compliance |
| 3 | Webhook persistence + retry | **High** | Medium | Reliability, debugging, data consistency |
| 4 | Domain transfer-in flow | **High** | Large | New revenue stream, user retention |
| 5 | Domain pricing cache (Redis/DB) | Medium | Small | Performance, cost reduction |
| 6 | CIDR support for IP allowlist | Low | Small | Security hardening (defer if not needed) |

---

## 1. Rate Limiting on Domain Search Endpoints

### Problem

The `/v1/inhouse/projects/:projectId/domain-search` endpoint calls OpenSRS API for each search. Without rate limiting:
- Malicious/buggy clients can exhaust OpenSRS API quotas
- Cost exposure (OpenSRS may charge per lookup)
- Potential for abuse (competitors scraping availability)

### Solution: Redis-Based Fixed-Window Rate Limiter

**Pattern:** Reuse the proven pattern from `InboxSpamFilter.ts` (lines 70-97).

> **Note:** This is a fixed-window counter (INCR + EXPIRE), not a true sliding window. Fixed-window is simpler and sufficient for this use case.

**Key design decisions:**
- **Fail-closed with in-memory fallback** — Unlike general APIs, domain search has real cost. Don't fail-open.
- **Proper IP parsing** — When `trustProxy` is configured, prefer `request.ip`; only parse `x-forwarded-for` as fallback.
- **Standard headers** — Use `Retry-After` header per RFC 6585.

> **Degraded mode note:** The in-memory fallback is per-process and does not share state across instances. Under multi-instance deployment, rate limiting becomes approximate during Redis outages. This is acceptable for degraded mode but should be monitored.

### Implementation

#### 1.1 Create Rate Limiter Service

```typescript
// src/services/inhouse/DomainSearchRateLimiter.ts

import type Redis from 'ioredis'
import { getBestEffortRedis } from '../redisBestEffort'

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetInSeconds: number
  reason?: string
}

export interface DomainSearchRateLimitConfig {
  /** Max searches per project per hour */
  projectLimitPerHour: number
  /** Max searches per IP per minute (burst protection) */
  ipLimitPerMinute: number
}

const DEFAULT_CONFIG: DomainSearchRateLimitConfig = {
  projectLimitPerHour: 100,    // 100 searches/project/hour
  ipLimitPerMinute: 10,        // 10 searches/IP/minute (burst)
}

// In-memory fallback when Redis is down (best-effort, not "anything goes")
const inMemoryCounters = new Map<string, { count: number; resetAt: number }>()
const IN_MEMORY_LIMIT = 5 // Very conservative when Redis is down
const IN_MEMORY_WINDOW_MS = 60_000 // 1 minute

function checkInMemoryFallback(key: string): RateLimitResult {
  const now = Date.now()
  const entry = inMemoryCounters.get(key)

  // Cleanup expired entries periodically
  if (inMemoryCounters.size > 1000) {
    for (const [k, v] of inMemoryCounters) {
      if (v.resetAt < now) inMemoryCounters.delete(k)
    }
  }

  if (!entry || entry.resetAt < now) {
    inMemoryCounters.set(key, { count: 1, resetAt: now + IN_MEMORY_WINDOW_MS })
    return { allowed: true, remaining: IN_MEMORY_LIMIT - 1, resetInSeconds: 60 }
  }

  entry.count++
  if (entry.count > IN_MEMORY_LIMIT) {
    return {
      allowed: false,
      remaining: 0,
      resetInSeconds: Math.ceil((entry.resetAt - now) / 1000),
      reason: `Rate limit exceeded (degraded mode): ${entry.count}/${IN_MEMORY_LIMIT} per minute`,
    }
  }

  return {
    allowed: true,
    remaining: IN_MEMORY_LIMIT - entry.count,
    resetInSeconds: Math.ceil((entry.resetAt - now) / 1000),
  }
}

/**
 * Parse client IP from request.
 *
 * When trustProxy is configured in Fastify, request.ip is already the correct
 * client IP (Fastify parses x-forwarded-for for you). Only fall back to manual
 * XFF parsing if request.ip is missing or is the proxy IP.
 *
 * x-forwarded-for format: "client, proxy1, proxy2" — we want the leftmost (client).
 */
export function parseClientIp(
  request: { ip?: string; headers: Record<string, string | string[] | undefined> },
  trustProxyConfigured: boolean = true
): string {
  // When trustProxy is configured, Fastify's request.ip is authoritative
  if (trustProxyConfigured && request.ip && request.ip !== '127.0.0.1') {
    return request.ip
  }

  // Fallback: manually parse x-forwarded-for
  const xff = request.headers['x-forwarded-for']
  if (xff) {
    const headerValue = Array.isArray(xff) ? xff[0] : xff
    const clientIp = headerValue.split(',')[0]?.trim()
    if (clientIp) return clientIp
  }

  return request.ip || 'unknown'
}

export async function checkDomainSearchRateLimit(
  projectId: string,
  clientIp: string,
  config: Partial<DomainSearchRateLimitConfig> = {}
): Promise<RateLimitResult> {
  const redis = getBestEffortRedis()
  const cfg = { ...DEFAULT_CONFIG, ...config }

  // Fail-closed with in-memory fallback when Redis unavailable
  if (!redis) {
    console.warn('[DomainSearchRateLimiter] Redis unavailable, using in-memory fallback')
    return checkInMemoryFallback(`fallback:${projectId}:${clientIp}`)
  }

  try {
    // Check IP burst limit first (stricter, shorter window)
    const ipKey = `domain-search-ip:${clientIp}`
    const ipCount = await redis.incr(ipKey)
    if (ipCount === 1) {
      await redis.expire(ipKey, 60) // 1 minute window
    }
    if (ipCount > cfg.ipLimitPerMinute) {
      const ttl = await redis.ttl(ipKey)
      return {
        allowed: false,
        remaining: 0,
        resetInSeconds: ttl > 0 ? ttl : 60,
        reason: `IP rate limit exceeded: ${ipCount}/${cfg.ipLimitPerMinute} per minute`,
      }
    }

    // Check project hourly limit
    const projectKey = `domain-search-project:${projectId}`
    const projectCount = await redis.incr(projectKey)
    if (projectCount === 1) {
      await redis.expire(projectKey, 3600) // 1 hour window
    }
    if (projectCount > cfg.projectLimitPerHour) {
      const ttl = await redis.ttl(projectKey)
      return {
        allowed: false,
        remaining: 0,
        resetInSeconds: ttl > 0 ? ttl : 3600,
        reason: `Project rate limit exceeded: ${projectCount}/${cfg.projectLimitPerHour} per hour`,
      }
    }

    return {
      allowed: true,
      remaining: cfg.projectLimitPerHour - projectCount,
      resetInSeconds: await redis.ttl(projectKey),
    }
  } catch (error) {
    console.error('[DomainSearchRateLimiter] Redis error, using in-memory fallback:', error)
    return checkInMemoryFallback(`fallback:${projectId}:${clientIp}`)
  }
}
```

#### 1.2 Apply to Domain Search Route

```typescript
// src/routes/inhouseDomainRegistration.ts - Update domain-search endpoint

import { checkDomainSearchRateLimit, parseClientIp } from '../services/inhouse/DomainSearchRateLimiter'

// Inside the route handler, before calling service.searchDomains():
const clientIp = parseClientIp(request)
const rateLimit = await checkDomainSearchRateLimit(projectId, clientIp)

if (!rateLimit.allowed) {
  // Standard Retry-After header (RFC 6585)
  reply.header('Retry-After', rateLimit.resetInSeconds)
  reply.header('X-RateLimit-Remaining', 0)
  reply.header('X-RateLimit-Reset', rateLimit.resetInSeconds)

  return reply.code(429).send({
    ok: false,
    error: {
      code: 'RATE_LIMITED',
      message: rateLimit.reason,
      retryAfter: rateLimit.resetInSeconds,
    },
  })
}

// Add rate limit headers to successful response
reply.header('X-RateLimit-Remaining', rateLimit.remaining)
reply.header('X-RateLimit-Reset', rateLimit.resetInSeconds)
```

#### 1.3 Fastify Trust Proxy Configuration

```typescript
// Ensure Fastify trusts proxy headers (important for Cloudflare/load balancers)
// In server setup:
fastify.register(require('@fastify/sensible'))
// Or set trustProxy option when creating fastify instance
```

#### 1.4 Configuration via Environment

```bash
# .env
DOMAIN_SEARCH_PROJECT_LIMIT_PER_HOUR=100
DOMAIN_SEARCH_IP_LIMIT_PER_MINUTE=10
```

### Checklist

- [x] Create `DomainSearchRateLimiter.ts` service with in-memory fallback ✅ 2026-01-28
- [x] Add `parseClientIp()` helper with x-forwarded-for parsing ✅ 2026-01-28
- [x] Add rate limit check to `/domain-search` endpoint ✅ 2026-01-28
- [x] Add `Retry-After` header (RFC 6585) to 429 responses ✅ 2026-01-28
- [x] Add `X-RateLimit-*` headers to all responses ✅ 2026-01-28
- [x] Verify Fastify trustProxy settings for Cloudflare ✅ 2026-01-28 - Added `trustProxy: true` to server.ts
- [x] Add environment variable configuration ✅ 2026-01-28 - `DOMAIN_SEARCH_PROJECT_LIMIT_PER_HOUR`, `DOMAIN_SEARCH_IP_LIMIT_PER_MINUTE`
- [x] Add metrics logging for rate limit hits ✅ 2026-01-28 - Using `createLogger` for structured logging
- [ ] Test with Redis unavailable (should use in-memory fallback, not fail-open)
- [ ] Document rate limits in SDK/API docs

---

## 2. Stripe Dispute Handling

### Problem

When a customer disputes a domain charge with their bank:
- We receive no notification (event not handled)
- Domain stays active during dispute
- No audit trail for compliance
- Risk of chargebacks without response

### Solution: Handle Stripe Dispute Webhooks

**Events to handle:**
- `charge.dispute.created` - Dispute opened
- `charge.dispute.updated` - Status changed
- `charge.dispute.closed` - Dispute resolved (won/lost)

**Key design decisions:**
- **Intermediate status (`at_risk`)** — Don't immediately suspend; gives better UX and reduces support load.
- **Idempotency** — Webhooks retry; guard with `stripe_event_id` to prevent duplicate processing.
- **Charge linkage prerequisite** — Must store `stripe_charge_id` on payment to match disputes.

### Prerequisites

**CRITICAL:** Before implementing dispute handling, ensure `stripe_charge_id` is stored when payments succeed:

```typescript
// In payment_intent.succeeded handler:
case 'payment_intent.succeeded':
  const paymentIntent = event.data.object as Stripe.PaymentIntent

  // latest_charge can be: string | Stripe.Charge | null (depends on expansion)
  // Handle all cases defensively
  let chargeId: string | null = null
  if (typeof paymentIntent.latest_charge === 'string') {
    chargeId = paymentIntent.latest_charge
  } else if (paymentIntent.latest_charge && typeof paymentIntent.latest_charge === 'object') {
    chargeId = paymentIntent.latest_charge.id
  }

  // If still null, fetch with expansion (rare, but handles edge cases)
  if (!chargeId) {
    const expanded = await stripe.paymentIntents.retrieve(paymentIntent.id, {
      expand: ['latest_charge'],
    })
    if (expanded.latest_charge && typeof expanded.latest_charge === 'object') {
      chargeId = expanded.latest_charge.id
    }
  }

  // Store charge_id alongside payment_intent_id
  if (chargeId) {
    await client.query(`
      UPDATE inhouse_domain_invoices
      SET stripe_charge_id = $1, updated_at = NOW()
      WHERE stripe_payment_intent_id = $2
    `, [chargeId, paymentIntent.id])
  }
```

Without this, dispute handlers will silently fail to match domains.

### Implementation

#### 2.1 Add Dispute Event Handlers to StripeWebhookWorker

```typescript
// src/workers/stripeWebhookWorker.ts - Add to switch statement

case 'charge.dispute.created':
  await this.handleDisputeCreated(client, event, correlationId);
  break;

case 'charge.dispute.updated':
  await this.handleDisputeUpdated(client, event, correlationId);
  break;

case 'charge.dispute.closed':
  await this.handleDisputeClosed(client, event, correlationId);
  break;
```

#### 2.2 Dispute Handler Implementation

```typescript
// Add to StripeWebhookWorker class

/**
 * Check if we've already processed this Stripe event (idempotency guard)
 */
private async isEventProcessed(client: any, eventId: string): Promise<boolean> {
  const { rows } = await client.query(`
    SELECT 1 FROM stripe_processed_events WHERE event_id = $1
  `, [eventId])
  return rows.length > 0
}

private async markEventProcessed(client: any, eventId: string, eventType: string): Promise<void> {
  await client.query(`
    INSERT INTO stripe_processed_events (event_id, event_type, processed_at)
    VALUES ($1, $2, NOW())
    ON CONFLICT (event_id) DO NOTHING
  `, [eventId, eventType])
}

private async handleDisputeCreated(
  client: any,
  event: Stripe.Event,
  correlationId: string
): Promise<void> {
  // Idempotency check (outside transaction - read-only)
  if (await this.isEventProcessed(client, event.id)) {
    console.log(`ℹ️ Dispute event ${event.id} already processed, skipping`)
    return
  }

  const dispute = event.data.object as Stripe.Dispute
  const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id

  console.log(`⚠️ Dispute created: ${dispute.id} for charge ${chargeId}`)

  // Find the domain associated with this charge (outside transaction - read-only)
  const domainResult = await client.query(`
    SELECT rd.id, rd.domain, rd.project_id, rd.status
    FROM inhouse_registered_domains rd
    JOIN inhouse_domain_invoices di ON di.domain_id = rd.id
    WHERE di.stripe_charge_id = $1
  `, [chargeId])

  if (domainResult.rows.length === 0) {
    console.log(`ℹ️ Dispute ${dispute.id} not for a domain charge (charge_id: ${chargeId})`)
    // Still mark as processed to avoid retries
    await this.markEventProcessed(client, event.id, event.type)
    return
  }

  const domain = domainResult.rows[0]

  // === BEGIN TRANSACTION ===
  // All state changes + idempotency mark must be atomic
  await client.query('BEGIN')

  try {
    // 1. Mark as processed FIRST (claim the event)
    // Uses INSERT ... ON CONFLICT to ensure we "win" the event
    const claimed = await client.query(`
      INSERT INTO stripe_processed_events (event_id, event_type, processed_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (event_id) DO NOTHING
      RETURNING event_id
    `, [event.id, event.type])

    if (claimed.rows.length === 0) {
      // Another worker already claimed this event
      await client.query('ROLLBACK')
      console.log(`ℹ️ Dispute event ${event.id} claimed by another worker`)
      return
    }

    // 2. Record dispute event
    await client.query(`
      INSERT INTO inhouse_domain_events
      (domain_id, project_id, event_type, metadata)
      VALUES ($1, $2, 'dispute_created', $3)
    `, [
      domain.id,
      domain.project_id,
      JSON.stringify({
        disputeId: dispute.id,
        stripeEventId: event.id,
        chargeId,
        amount: dispute.amount,
        reason: dispute.reason,
        status: dispute.status,
      }),
    ])

    // 3. Update invoice with dispute info
    await client.query(`
      UPDATE inhouse_domain_invoices
      SET dispute_id = $1, dispute_status = $2, updated_at = NOW()
      WHERE stripe_charge_id = $3
    `, [dispute.id, dispute.status, chargeId])

    // 4. Move to intermediate "at_risk" status
    if (domain.status === 'active') {
      await client.query(`
        UPDATE inhouse_registered_domains
        SET status = 'at_risk', updated_at = NOW()
        WHERE id = $1
      `, [domain.id])

      console.log(`⚠️ Domain ${domain.domain} marked at_risk due to dispute`)
    }

    await client.query('COMMIT')
    // === END TRANSACTION ===

  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  }

  // Notifications are outside transaction (non-critical, can retry)
  await this.notifyAdminOfDispute(domain, dispute, 'created')
  await this.notifyUserOfDispute(domain, dispute)
}

private async handleDisputeUpdated(
  client: any,
  event: Stripe.Event,
  correlationId: string
): Promise<void> {
  if (await this.isEventProcessed(client, event.id)) return

  const dispute = event.data.object as Stripe.Dispute
  const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id

  // Read-only query: find domain if we need to escalate (outside transaction)
  let domainToSuspend: { id: string; domain: string } | null = null
  if (dispute.status === 'needs_response' || dispute.status === 'warning_needs_response') {
    const domainResult = await client.query(`
      SELECT rd.id, rd.domain, rd.status
      FROM inhouse_registered_domains rd
      JOIN inhouse_domain_invoices di ON di.domain_id = rd.id
      WHERE di.stripe_charge_id = $1 AND rd.status = 'at_risk'
    `, [chargeId])

    if (domainResult.rows.length > 0) {
      domainToSuspend = domainResult.rows[0]
    }
  }

  // === BEGIN TRANSACTION ===
  await client.query('BEGIN')

  try {
    // 1. Claim the event first
    const claimed = await client.query(`
      INSERT INTO stripe_processed_events (event_id, event_type, processed_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (event_id) DO NOTHING
      RETURNING event_id
    `, [event.id, event.type])

    if (claimed.rows.length === 0) {
      await client.query('ROLLBACK')
      return
    }

    // 2. Update dispute status on invoice
    await client.query(`
      UPDATE inhouse_domain_invoices
      SET dispute_status = $1, updated_at = NOW()
      WHERE stripe_charge_id = $2
    `, [dispute.status, chargeId])

    // 3. Suspend domain if dispute escalated
    if (domainToSuspend) {
      await client.query(`
        UPDATE inhouse_registered_domains
        SET status = 'suspended', updated_at = NOW()
        WHERE id = $1
      `, [domainToSuspend.id])

      console.log(`🚫 Domain ${domainToSuspend.domain} suspended - dispute escalated to ${dispute.status}`)
    }

    await client.query('COMMIT')
    // === END TRANSACTION ===

  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
}

private async handleDisputeClosed(
  client: any,
  event: Stripe.Event,
  correlationId: string
): Promise<void> {
  if (await this.isEventProcessed(client, event.id)) return

  const dispute = event.data.object as Stripe.Dispute
  const chargeId = typeof dispute.charge === 'string' ? dispute.charge : dispute.charge?.id

  // Find the domain (outside transaction - read-only)
  const domainResult = await client.query(`
    SELECT rd.id, rd.domain, rd.project_id, rd.status
    FROM inhouse_registered_domains rd
    JOIN inhouse_domain_invoices di ON di.domain_id = rd.id
    WHERE di.stripe_charge_id = $1
  `, [chargeId])

  if (domainResult.rows.length === 0) {
    await this.markEventProcessed(client, event.id, event.type)
    return
  }

  const domain = domainResult.rows[0]
  const won = dispute.status === 'won'

  // === BEGIN TRANSACTION ===
  await client.query('BEGIN')

  try {
    // 1. Claim the event first
    const claimed = await client.query(`
      INSERT INTO stripe_processed_events (event_id, event_type, processed_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (event_id) DO NOTHING
      RETURNING event_id
    `, [event.id, event.type])

    if (claimed.rows.length === 0) {
      await client.query('ROLLBACK')
      return
    }

    // 2. Update invoice
    await client.query(`
      UPDATE inhouse_domain_invoices
      SET dispute_status = $1, updated_at = NOW()
      WHERE stripe_charge_id = $2
    `, [dispute.status, chargeId])

    // 3. Record closure event
    await client.query(`
      INSERT INTO inhouse_domain_events
      (domain_id, project_id, event_type, metadata)
      VALUES ($1, $2, $3, $4)
    `, [
      domain.id,
      domain.project_id,
      won ? 'dispute_won' : 'dispute_lost',
      JSON.stringify({
        disputeId: dispute.id,
        stripeEventId: event.id,
        status: dispute.status,
        amount: dispute.amount,
      }),
    ])

    // 4. Update domain status
    if (won) {
      if (domain.status === 'at_risk' || domain.status === 'suspended') {
        await client.query(`
          UPDATE inhouse_registered_domains
          SET status = 'active', updated_at = NOW()
          WHERE id = $1
        `, [domain.id])

        console.log(`✅ Domain ${domain.domain} reactivated - dispute won`)
      }
    } else {
      if (domain.status !== 'suspended') {
        await client.query(`
          UPDATE inhouse_registered_domains
          SET status = 'suspended', updated_at = NOW()
          WHERE id = $1
        `, [domain.id])
      }

      console.log(`❌ Dispute lost for ${domain.domain} - domain suspended`)
    }

    await client.query('COMMIT')
    // === END TRANSACTION ===

  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  }

  // Notification outside transaction (non-critical)
  await this.notifyAdminOfDispute(domain, dispute, 'closed')
}
```

#### 2.3 Database Migrations

```sql
-- Migration: XXX_domain_dispute_tracking.sql

-- Add charge_id and dispute columns to invoices
ALTER TABLE inhouse_domain_invoices
ADD COLUMN IF NOT EXISTS stripe_charge_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS dispute_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS dispute_status VARCHAR(30);

CREATE INDEX IF NOT EXISTS idx_domain_invoices_charge
  ON inhouse_domain_invoices(stripe_charge_id);

-- Add at_risk status to domains (intermediate state before suspension)
-- No migration needed if status is VARCHAR, just start using 'at_risk'

-- Idempotency table for Stripe events
CREATE TABLE IF NOT EXISTS stripe_processed_events (
  event_id VARCHAR(100) PRIMARY KEY,
  event_type VARCHAR(100) NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-cleanup old entries (keep 30 days for debugging)
CREATE INDEX IF NOT EXISTS idx_stripe_events_processed_at
  ON stripe_processed_events(processed_at);
```

### Checklist

- [x] **Prerequisite:** Store `stripe_charge_id` in `payment_intent.succeeded` handler (handle string|Charge|null) ✅ 2026-01-28
- [x] Add `stripe_processed_events` table for idempotency ✅ 2026-01-28 - Migration 142
- [x] Add dispute columns to `inhouse_domain_invoices` ✅ 2026-01-28 - Migration 142
- [x] Add dispute event handlers to `StripeWebhookWorker` ✅ 2026-01-28
- [x] Implement intermediate `at_risk` status (not immediate suspension) ✅ 2026-01-28
- [x] **Verify:** domain.status column accepts `at_risk` (check for CHECK constraints, enums, or UI badge assumptions) ✅ 2026-01-28 - Updated constraint in migration 142
- [x] Implement idempotency guard using `stripe_event_id` ✅ 2026-01-28 - Using transactional claim pattern
- [x] **Important:** Mark event as processed in the same DB transaction as domain update + event insert (prevents "processed but didn't apply changes" on crash) ✅ 2026-01-28
- [x] Implement `notifyAdminOfDispute()` helper (email/Slack) ✅ 2026-01-28 - Logs to ServerLoggingService
- [x] Implement `notifyUserOfDispute()` helper ✅ 2026-01-28 - Placeholder, needs email implementation
- [x] Add dispute status to admin panel domain view (including `at_risk` badge) ✅ 2026-01-28 - Added Dispute column + detail section in InhouseDomainsAdmin
- [ ] Test with Stripe CLI: `stripe trigger charge.dispute.created`
- [ ] Document dispute handling process for support team

---

## 3. Webhook Persistence + Retry Handling

### Problem

If OpenSRS webhook processing fails, the event is lost. We return 200 to prevent infinite retries, but have no way to reprocess or debug.

### Solution: Persist First, Process Async

**Key insight:** Store raw webhook payload + headers immediately, then process asynchronously. This gives you:
- Reprocessing capability
- Audit trail
- Debugging without log archaeology

### Implementation

#### 3.1 Raw Webhook Storage Table

```sql
-- Migration: XXX_webhook_event_log.sql

CREATE TABLE IF NOT EXISTS inhouse_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source identification
  source VARCHAR(50) NOT NULL,  -- 'opensrs', 'stripe', 'resend'
  endpoint VARCHAR(200) NOT NULL,

  -- Raw data (immutable)
  raw_headers JSONB NOT NULL,
  raw_body TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Sender info
  sender_ip VARCHAR(50),
  idempotency_key VARCHAR(200),

  -- Processing status
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  -- 'pending', 'processing', 'completed', 'failed', 'retrying'
  processed_at TIMESTAMPTZ,
  last_error TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ,

  -- Parsed data (after successful processing)
  parsed_event_type VARCHAR(100),
  parsed_data JSONB,

  -- Timestamps
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_webhook_idempotency UNIQUE (source, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_status ON inhouse_webhook_events(status);
CREATE INDEX IF NOT EXISTS idx_webhook_events_source ON inhouse_webhook_events(source, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_events_retry ON inhouse_webhook_events(next_retry_at)
  WHERE status = 'retrying';
```

#### 3.2 Update Webhook Handler Pattern

> **Critical:** Use a "claim" pattern to prevent double-processing. The DB is the source of truth about whether an event is being worked on.

```typescript
// src/routes/opensrsWebhook.ts - Updated pattern with claim

fastify.post('/webhooks/opensrs', async (request, reply) => {
  const startTime = Date.now()
  const rawBody = JSON.stringify(request.body)
  const idempotencyKey = generateIdempotencyKey(request.body)

  // Step 1: Insert-or-get the webhook event
  let webhookEventId: string
  let existingStatus: string | null = null
  try {
    // Try to insert new event
    const insertResult = await pool.query(`
      INSERT INTO inhouse_webhook_events
      (source, endpoint, raw_headers, raw_body, sender_ip, idempotency_key, status)
      VALUES ('opensrs', '/webhooks/opensrs', $1, $2, $3, $4, 'pending')
      ON CONFLICT (source, idempotency_key) DO NOTHING
      RETURNING id
    `, [
      JSON.stringify(request.headers),
      rawBody,
      request.ip,
      idempotencyKey,
    ])

    if (insertResult.rows.length > 0) {
      // New event inserted
      webhookEventId = insertResult.rows[0].id
    } else {
      // Event already exists - get its current status
      const existing = await pool.query(`
        SELECT id, status FROM inhouse_webhook_events
        WHERE source = 'opensrs' AND idempotency_key = $1
      `, [idempotencyKey])

      if (existing.rows.length === 0) {
        // Shouldn't happen, but handle gracefully
        return reply.code(200).send({ status: 'conflict_error' })
      }

      webhookEventId = existing.rows[0].id
      existingStatus = existing.rows[0].status
    }
  } catch (error) {
    console.error('[OpenSRS Webhook] Failed to persist event:', error)
    return reply.code(200).send({ status: 'persist_error' })
  }

  // Step 2: If already completed or processing, skip (idempotency)
  if (existingStatus === 'completed') {
    console.log(`[OpenSRS Webhook] Event ${idempotencyKey} already completed, skipping`)
    return reply.code(200).send({ status: 'duplicate' })
  }

  if (existingStatus === 'processing') {
    console.log(`[OpenSRS Webhook] Event ${idempotencyKey} already processing, skipping`)
    return reply.code(200).send({ status: 'already_processing' })
  }

  // Step 3: Atomically "claim" the event for processing
  // Only succeeds if status is 'pending', 'retrying', or 'failed'
  const claimResult = await pool.query(`
    UPDATE inhouse_webhook_events
    SET status = 'processing', updated_at = NOW()
    WHERE id = $1 AND status IN ('pending', 'retrying', 'failed')
    RETURNING id
  `, [webhookEventId])

  if (claimResult.rows.length === 0) {
    // Another worker already claimed it
    console.log(`[OpenSRS Webhook] Event ${idempotencyKey} claimed by another worker`)
    return reply.code(200).send({ status: 'claimed_by_other' })
  }

  // Step 4: Queue for async processing (we successfully claimed it)
  try {
    await webhookProcessingQueue.add('process-opensrs-webhook', {
      webhookEventId,
      idempotencyKey,
    }, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 60000 },
    })

    return reply.code(200).send({ status: 'queued' })
  } catch (error) {
    // Queue failed - mark for retry (release claim)
    await pool.query(`
      UPDATE inhouse_webhook_events
      SET status = 'retrying', next_retry_at = NOW() + INTERVAL '1 minute'
      WHERE id = $1
    `, [webhookEventId])

    return reply.code(200).send({ status: 'queued_fallback' })
  }
})
```

#### 3.3 Webhook Processing Worker

```typescript
// src/workers/webhookProcessingWorker.ts

export class WebhookProcessingWorker {
  async processOpenSrsWebhook(webhookEventId: string): Promise<void> {
    const pool = getPool()

    // Fetch the persisted event
    const { rows } = await pool.query(`
      SELECT * FROM inhouse_webhook_events WHERE id = $1
    `, [webhookEventId])

    if (rows.length === 0) {
      throw new Error(`Webhook event ${webhookEventId} not found`)
    }

    const event = rows[0]

    // Mark as processing
    await pool.query(`
      UPDATE inhouse_webhook_events
      SET status = 'processing'
      WHERE id = $1
    `, [webhookEventId])

    try {
      const payload = JSON.parse(event.raw_body)

      // ... existing processing logic ...
      await handleDomainEvent(eventType, domain, payload.data, event.idempotency_key)

      // Mark as completed
      await pool.query(`
        UPDATE inhouse_webhook_events
        SET status = 'completed', processed_at = NOW(),
            parsed_event_type = $2, parsed_data = $3
        WHERE id = $1
      `, [webhookEventId, eventType, JSON.stringify(payload.data)])

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      await pool.query(`
        UPDATE inhouse_webhook_events
        SET status = 'failed', last_error = $2, retry_count = retry_count + 1
        WHERE id = $1
      `, [webhookEventId, errorMessage])

      throw error // Let BullMQ handle retry
    }
  }
}
```

### Checklist

- [x] Create `inhouse_webhook_events` table ✅ 2026-01-28 - Migration 143
- [x] Update `opensrsWebhook.ts` to persist-first pattern ✅ 2026-01-28 - Atomic claim pattern implemented
- [ ] Create `WebhookProcessingWorker` with BullMQ (optional - currently processing inline)
- [x] Add retry status tracking and exponential backoff ✅ 2026-01-28 - `next_retry_at` set on failure
- [x] Add admin panel view for webhook events (status, errors, reprocessing) ✅ 2026-01-28 - `/v1/admin/inhouse/webhook-events/*` endpoints
- [x] Add alerting for events stuck in 'failed' status ✅ 2026-01-28 - `/v1/admin/inhouse/webhook-events/failed` endpoint
- [x] Add cleanup job for old completed events (keep 30 days) ✅ 2026-01-28 - Added to scheduledJobs.ts

---

## 4. Domain Transfer-In Flow

### Problem

Users with existing domains at other registrars cannot bring them to SheenApps. This means:
- Lost revenue opportunity
- Users must manage domains in multiple places
- Can't offer unified domain+email experience

### Solution: Full Transfer-In Flow

**User journey:**
1. Enter domain to transfer
2. We check eligibility (unlocked, not recently registered, etc.)
3. User enters auth code (EPP code from current registrar)
4. We initiate transfer via OpenSRS
5. Track status until complete
6. Auto-configure DNS for email

### Important Caveats

> **Before building UI flows, run 3–5 transfers in OpenSRS sandbox across different TLDs and log the exact status fields you actually get back. Then lock your status machine to reality.**

**Known issues:**
- `CHECK_TRANSFER` returns `transferrable` reliably, but `current_registrar` and `expiration_date` vary by TLD/registry. Treat as "nice to have."
- `GET_ORDER_INFO` returns order status, but transfer-specific status may be in different fields. Verify with sandbox.
- Auth code should only be sent to backend **after** payment is confirmed (security best practice).

### Implementation

#### 4.1 OpenSRS Transfer-In API Method

```typescript
// src/services/inhouse/OpenSrsService.ts - Add method

export interface TransferInInput {
  domain: string
  authCode: string
  contacts: {
    owner: DomainContact
    admin?: DomainContact
    billing?: DomainContact
    tech?: DomainContact
  }
  nameservers?: string[]
  whoisPrivacy?: boolean
}

export interface TransferInResult {
  success: boolean
  domain: string
  orderId?: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  rawStatus?: string  // Preserve original for debugging
  error?: string
}

export interface TransferEligibility {
  eligible: boolean
  domain: string
  reason?: string
  // These fields are TLD-dependent, may not always be present
  currentRegistrar?: string
  expiresAt?: string
  daysUntilExpiry?: number
}

/**
 * Check if a domain is eligible for transfer-in
 *
 * Note: Fields like currentRegistrar and expiresAt vary by TLD/registry.
 * Only `transferrable` is reliably returned.
 */
async checkTransferEligibility(domain: string): Promise<TransferEligibility> {
  try {
    const response = await this.request('CHECK_TRANSFER', 'DOMAIN', {
      domain,
    })

    const attrs = response.attributes || {}
    const transferrable = attrs.transferrable === '1'

    return {
      eligible: transferrable,
      domain,
      reason: transferrable ? undefined : String(attrs.reason || attrs.status || 'Domain cannot be transferred'),
      // Optional fields - may not exist for all TLDs
      currentRegistrar: attrs.current_registrar as string | undefined,
      expiresAt: attrs.expiration_date as string | undefined,
    }
  } catch (error) {
    return {
      eligible: false,
      domain,
      reason: error instanceof Error ? error.message : 'Failed to check eligibility',
    }
  }
}

/**
 * Initiate domain transfer-in
 *
 * IMPORTANT: Only call this after payment is confirmed.
 * Auth code should not be sent until payment succeeds.
 */
async initiateTransferIn(input: TransferInInput): Promise<TransferInResult> {
  try {
    const contactAttrs = this.buildContactAttributes(input.contacts)

    const response = await this.request('SW_REGISTER', 'DOMAIN', {
      domain: input.domain,
      reg_type: 'transfer',
      auth_info: input.authCode,
      period: 1, // Transfer extends by 1 year
      ...contactAttrs,
      custom_nameservers: input.nameservers ? 1 : 0,
      ...(input.nameservers && {
        nameserver_list: input.nameservers.map((ns, i) => ({
          [`ns${i + 1}`]: ns,
        })).reduce((a, b) => ({ ...a, ...b }), {}),
      }),
      f_whois_privacy: input.whoisPrivacy ? 1 : 0,
    })

    return {
      success: true,
      domain: input.domain,
      orderId: String(response.attributes?.id || ''),
      status: 'pending',
    }
  } catch (error) {
    return {
      success: false,
      domain: input.domain,
      status: 'failed',
      error: error instanceof Error ? error.message : 'Transfer initiation failed',
    }
  }
}

/**
 * Check transfer status
 *
 * Note: Status field mappings should be validated against actual OpenSRS
 * sandbox responses before going to production.
 */
async getTransferStatus(orderId: string): Promise<TransferInResult> {
  try {
    const response = await this.request('GET_ORDER_INFO', 'DOMAIN', {
      order_id: orderId,
    })

    const attrs = response.attributes || {}
    const rawStatus = attrs.status as string || 'unknown'

    // Normalize status: lowercase, trim, collapse whitespace, replace underscores
    // Handles variations like "in progress", "in_progress", "IN PROGRESS", etc.
    const normalizeStatus = (s: string) =>
      s.toLowerCase().trim().replace(/[_\s]+/g, ' ')

    // TODO: Validate these mappings against actual sandbox responses
    // OpenSRS may use different fields for transfer-specific status
    const statusMap: Record<string, TransferInResult['status']> = {
      'pending': 'pending',
      'in progress': 'processing',
      'completed': 'completed',
      'failed': 'failed',
      'cancelled': 'failed',
    }

    const normalizedStatus = normalizeStatus(rawStatus)

    return {
      success: normalizedStatus === 'completed',
      domain: attrs.domain as string || '',
      orderId,
      status: statusMap[normalizedStatus] || 'processing',
      rawStatus, // Preserve original for debugging
      error: normalizedStatus === 'failed' ? attrs.status_info as string : undefined,
    }
  } catch (error) {
    return {
      success: false,
      domain: '',
      orderId,
      status: 'failed',
      error: error instanceof Error ? error.message : 'Failed to get status',
    }
  }
}
```

#### 4.2 Database Schema for Transfer Tracking

```sql
-- Migration: XXX_domain_transfers.sql

CREATE TABLE IF NOT EXISTS inhouse_domain_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Domain info
  domain VARCHAR(255) NOT NULL,
  tld VARCHAR(50) NOT NULL,

  -- Transfer tracking
  opensrs_order_id VARCHAR(100),
  auth_code_hash VARCHAR(64),  -- SHA-256 hash for audit, never store plaintext

  -- Status (validate against actual OpenSRS responses before production)
  status VARCHAR(20) NOT NULL DEFAULT 'pending_payment',
  -- 'pending_payment' - Awaiting payment confirmation
  -- 'pending'         - Payment confirmed, transfer initiated
  -- 'processing'      - Transfer in progress with registry
  -- 'completed'       - Transfer successful
  -- 'failed'          - Transfer failed
  -- 'cancelled'       - User cancelled

  status_message TEXT,
  raw_provider_status VARCHAR(100),  -- Preserve actual OpenSRS status for debugging

  -- Source registrar (if known - TLD dependent)
  source_registrar VARCHAR(100),

  -- Contacts
  contacts JSONB NOT NULL,

  -- Billing
  stripe_payment_intent_id VARCHAR(100),
  price_cents INTEGER NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',

  -- Timestamps
  initiated_at TIMESTAMPTZ,  -- When transfer actually started (after payment)
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Link to registered domain once complete
  registered_domain_id UUID REFERENCES inhouse_registered_domains(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_transfers_project ON inhouse_domain_transfers(project_id);
CREATE INDEX IF NOT EXISTS idx_transfers_status ON inhouse_domain_transfers(status);
CREATE INDEX IF NOT EXISTS idx_transfers_domain ON inhouse_domain_transfers(domain);
```

#### 4.3 Service Layer (Auth Code Timing)

```typescript
// src/services/inhouse/InhouseDomainTransferService.ts

/**
 * Step 1: Create transfer intent (before payment)
 * Does NOT require auth code yet
 */
async createTransferIntent(input: {
  domain: string
  contacts: DomainContact
}): Promise<{ transferId: string; clientSecret: string; eligible: boolean; reason?: string }> {
  // Check eligibility first
  const eligibility = await this.checkEligibility(input.domain)
  if (!eligibility.eligible) {
    return {
      transferId: '',
      clientSecret: '',
      eligible: false,
      reason: eligibility.reason,
    }
  }

  // Create payment intent
  const payment = await billing.createPaymentIntent({
    projectId: this.projectId,
    amountCents: pricing.transferPriceCents,
    description: `Domain transfer: ${input.domain}`,
    metadata: { type: 'domain_transfer', domain: input.domain },
  })

  // Create transfer record (pending_payment status, no auth code yet)
  const { rows } = await pool.query(`
    INSERT INTO inhouse_domain_transfers
    (project_id, domain, tld, contacts, stripe_payment_intent_id, price_cents, status)
    VALUES ($1, $2, $3, $4, $5, $6, 'pending_payment')
    RETURNING id
  `, [this.projectId, input.domain, tld, JSON.stringify({ owner: input.contacts }), payment.id, pricing.transferPriceCents])

  return {
    transferId: rows[0].id,
    clientSecret: payment.clientSecret,
    eligible: true,
  }
}

/**
 * Step 2: Confirm transfer with auth code (after payment succeeds)
 * Only now do we accept the auth code
 */
async confirmTransferWithAuthCode(transferId: string, authCode: string): Promise<void> {
  // Verify payment succeeded
  const { rows } = await pool.query(`
    SELECT * FROM inhouse_domain_transfers
    WHERE id = $1 AND project_id = $2 AND status = 'pending_payment'
  `, [transferId, this.projectId])

  if (rows.length === 0) {
    throw new Error('Transfer not found or not in pending_payment status')
  }

  const transfer = rows[0]

  // Verify payment intent is paid
  const paymentIntent = await stripe.paymentIntents.retrieve(transfer.stripe_payment_intent_id)
  if (paymentIntent.status !== 'succeeded') {
    throw new Error('Payment not yet confirmed')
  }

  // NOW we can accept auth code and initiate transfer
  const result = await openSrs.initiateTransferIn({
    domain: transfer.domain,
    authCode,
    contacts: transfer.contacts,
  })

  await pool.query(`
    UPDATE inhouse_domain_transfers
    SET opensrs_order_id = $1, status = $2, auth_code_hash = $3,
        initiated_at = NOW(), updated_at = NOW()
    WHERE id = $4
  `, [result.orderId, result.status, createHash('sha256').update(authCode).digest('hex'), transferId])
}
```

### Checklist

- [ ] **FIRST:** Run 3-5 transfers in OpenSRS sandbox, log actual status fields
- [ ] Validate status mappings against real OpenSRS responses
- [x] Add `checkTransferEligibility()` to OpenSrsService ✅ 2026-01-28
- [x] Add `initiateTransferIn()` to OpenSrsService ✅ 2026-01-28
- [x] Add `getTransferStatus()` to OpenSrsService ✅ 2026-01-28
- [x] Create `inhouse_domain_transfers` migration ✅ 2026-01-28 - Migration 144
- [x] Create `InhouseDomainTransferService` with payment-then-auth-code flow ✅ 2026-01-28
- [x] Create API routes in `inhouseDomainTransfer.ts` ✅ 2026-01-28
- [x] Handle `transfer_in_complete` webhook from OpenSRS ✅ 2026-01-28 - via pollTransferStatus()
- [x] Link completed transfer to `inhouse_registered_domains` ✅ 2026-01-28 - in finalizeTransfer()
- [x] Auto-configure Cloudflare DNS on transfer complete ✅ 2026-01-28 - Creates zone, updates NS, provisions email records
- [ ] Add transfer UI to admin panel (see admin-panel plan)
- [ ] Document transfer process for users

---

## 5. Domain Pricing Cache (Redis/DB-Backed)

### Problem

`getTldPricing()` queries OpenSRS for each TLD on every call. This is slow and wasteful when prices rarely change.

### Solution: Use Existing Infrastructure

We already have:
- `batch_pricing_sync` job in `DomainRenewalWorker` that syncs pricing daily
- Pricing should be stored in a `inhouse_tld_pricing` table

> **Schema note:** Verify if `inhouse_tld_pricing` table exists. If not, create it with columns matching the query below. If it exists with different column names, align the query accordingly.

**Why not in-memory cache:**
- Doesn't share across instances
- Resets on deploy/restart
- Behaves differently under autoscaling

**Better approach:** Read from DB (synced daily by existing job), with optional Redis cache for hot path.

### Implementation

```typescript
// src/services/inhouse/OpenSrsService.ts

/**
 * Get TLD pricing from database (synced daily by batch_pricing_sync job)
 * Falls back to OpenSRS API if DB is empty
 */
async getTldPricing(): Promise<DomainPricing[]> {
  const pool = getPool()
  const redis = getBestEffortRedis()

  // Try Redis cache first (5 minute TTL for hot path)
  if (redis) {
    const cached = await redis.get('tld-pricing-cache')
    if (cached) {
      return JSON.parse(cached)
    }
  }

  // Read from database (synced by batch_pricing_sync job)
  const { rows } = await pool.query(`
    SELECT tld, registration_price_cents, renewal_price_cents, transfer_price_cents, currency
    FROM inhouse_tld_pricing
    WHERE active = true
    ORDER BY tld
  `)

  if (rows.length > 0) {
    const pricing = rows.map(row => ({
      tld: row.tld,
      registration: row.registration_price_cents / 100,
      renewal: row.renewal_price_cents / 100,
      transfer: row.transfer_price_cents / 100,
      currency: row.currency,
    }))

    // Cache in Redis for 5 minutes
    if (redis) {
      await redis.setex('tld-pricing-cache', 300, JSON.stringify(pricing))
    }

    return pricing
  }

  // Fallback to API (should rarely happen after first sync)
  return this.fetchTldPricingFromApi()
}
```

### Checklist

- [x] **Schema:** Create `inhouse_tld_pricing` table if not exists, or verify existing table has: `tld`, `registration_price_cents`, `renewal_price_cents`, `transfer_price_cents`, `currency`, `active` ✅ Already exists in migration 135
- [x] Update `batch_pricing_sync` job to populate table ✅ Already exists in domainRenewalWorker.ts
- [x] Update `getTldPricing()` to read from DB with Redis cache ✅ 2026-01-28 - Added DB read with 5min Redis cache
- [x] Add cache invalidation when sync job runs ✅ 2026-01-28 - Added `redis.del('tld-pricing-cache')` to processPricingSync()
- [x] Add health endpoint to check pricing freshness ✅ 2026-01-28 - `/v1/admin/inhouse/health/pricing`

---

## 6. CIDR Support for OpenSRS IP Allowlist (Low Priority)

### Problem

`OPENSRS_WEBHOOK_IPS` only supports individual IPs, not CIDR ranges like `192.168.1.0/24`.

### Caveat: JS Bitwise Trap

> **WARNING:** JavaScript bitwise operations are 32-bit signed. This means:
> - `1 << 32` wraps to `1` (not `4294967296`)
> - IPv6 is not handled at all
> - Edge cases around `/0` and `/32` need careful handling

### Recommendation

**Option A (Recommended):** Use `ipaddr.js` library — battle-tested, handles IPv6, no bitwise footguns.

**Option B:** Defer until actually needed. If OpenSRS only sends from a few fixed IPs, individual IPs may be sufficient.

### Implementation (if using library)

```typescript
// src/utils/ipAllowlist.ts

import ipaddr from 'ipaddr.js'

export function isIpInAllowlist(ip: string, allowlist: string[]): boolean {
  let parsedIp: ipaddr.IPv4 | ipaddr.IPv6
  try {
    parsedIp = ipaddr.parse(ip)
  } catch {
    return false // Invalid IP
  }

  for (const entry of allowlist) {
    try {
      if (entry.includes('/')) {
        // CIDR range
        const [network, prefix] = ipaddr.parseCIDR(entry)
        if (parsedIp.match(network, prefix)) {
          return true
        }
      } else {
        // Single IP
        if (parsedIp.toString() === ipaddr.parse(entry).toString()) {
          return true
        }
      }
    } catch {
      // Invalid allowlist entry, skip
      continue
    }
  }

  return false
}
```

### Checklist

- [x] **Decide:** Is CIDR support actually needed, or are individual IPs sufficient? ✅ Implemented for flexibility
- [x] If needed: Add `ipaddr.js` dependency ✅ 2026-01-28
- [x] Create `isIpInAllowlist()` helper ✅ 2026-01-28 - `src/utils/ipAllowlist.ts`
- [x] Update `opensrsWebhook.ts` to use new helper ✅ 2026-01-28
- [x] Add tests including edge cases (IPv6, /0, /32, invalid IPs) ✅ 2026-01-28 - `src/utils/__tests__/ipAllowlist.test.ts`
- [x] Document CIDR format in env example ✅ 2026-01-28 - Added to `.env.example`

---

## Testing Strategy

### Unit Tests
- Rate limiter with mock Redis + fallback behavior
- IP parsing from x-forwarded-for (comma-separated, edge cases)
- Dispute handler idempotency
- CIDR parsing (if implemented) with ipaddr.js

### Integration Tests
- Stripe CLI for dispute events
- OpenSRS sandbox for transfers (multiple TLDs)
- Webhook persistence + retry flow

### Manual Testing
- Rate limit response headers + Retry-After
- Dispute email notifications
- Transfer wizard flow end-to-end
- Redis unavailable scenarios

---

## Rollout Plan

1. **Week 1:** Rate limiting (with fail-closed + fallback)
2. **Week 2:** Stripe dispute handling (with idempotency + charge linkage)
3. **Week 3:** Webhook persistence + retry (enables debugging for all webhooks)
4. **Week 4-5:** Domain transfer-in (after sandbox validation)
5. **Week 6:** Pricing cache (Redis/DB-backed)
6. **Later:** CIDR support (only if needed)

---

## Implementation Progress

### 2026-01-28 Implementation Session

**Files Modified:**
- `src/services/inhouse/DomainSearchRateLimiter.ts` (NEW) - Rate limiting service
- `src/services/inhouse/index.ts` - Added rate limiter exports
- `src/routes/inhouseDomainRegistration.ts` - Added rate limiting to domain search
- `src/server.ts` - Added `trustProxy: true` for proper IP detection, registered new routes
- `src/workers/stripeWebhookWorker.ts` - Added dispute handlers + charge_id storage
- `src/routes/opensrsWebhook.ts` - Updated to persist-first pattern, added CIDR-aware IP validation
- `src/services/inhouse/OpenSrsService.ts` - Added DB + Redis caching for pricing, added transfer-in methods
- `src/services/inhouse/InhouseDomainTransferService.ts` (NEW) - Domain transfer-in business logic + Cloudflare DNS setup
- `src/routes/inhouseDomainTransfer.ts` (NEW) - Transfer API routes
- `src/routes/adminInhouseWebhookEvents.ts` (NEW) - Admin webhook events viewer
- `src/routes/adminInhouseHealth.ts` (NEW) - Health check endpoints (pricing, webhooks, transfers)
- `src/jobs/scheduledJobs.ts` - Added webhook events cleanup job (30 day retention)
- `src/workers/domainRenewalWorker.ts` - Added Redis cache invalidation to pricing sync
- `src/utils/ipAllowlist.ts` (NEW) - CIDR-aware IP allowlist utility
- `src/utils/__tests__/ipAllowlist.test.ts` (NEW) - CIDR tests including edge cases
- `.env.example` - Added OpenSRS, rate limiting, and CIDR documentation

**Migrations Created:**
- `142_domain_dispute_tracking.sql` - Dispute columns, idempotency table, status constraints
- `143_webhook_event_persistence.sql` - Webhook event storage table
- `144_domain_transfers.sql` - Domain transfer-in tracking table
- `145_domain_events_null_domain_id.sql` - Allow NULL domain_id for transfer events

**Dependencies Added:**
- `ipaddr.js` - For CIDR support in IP allowlist validation

**Status Summary:**
| Enhancement | Status | Notes |
|-------------|--------|-------|
| 1. Rate Limiting | ✅ Complete | Ready for testing |
| 2. Stripe Disputes | ✅ Core Complete | Need admin UI frontend, Stripe CLI testing |
| 3. Webhook Persistence | ✅ Complete | Admin UI endpoints, cleanup job, health endpoint |
| 4. Domain Transfer-In | ✅ Core Complete | API + service + Cloudflare DNS setup, needs OpenSRS sandbox testing |
| 5. Pricing Cache | ✅ Complete | DB + Redis cache + invalidation on sync + health endpoint |
| 6. CIDR Support | ✅ Complete | Using ipaddr.js library + tests + documentation |

---

## Discoveries & Improvements

### Found During Implementation

1. **trustProxy was not configured** - Added to server.ts; critical for correct IP detection behind Cloudflare/load balancers.

2. **Domain status constraint needed update** - Original migration 135 didn't include `at_risk` status; fixed in migration 142.

3. **Domain event types constraint needed update** - Added `dispute_created`, `dispute_won`, `dispute_lost` event types.

4. **inhouse_domain_pricing table already exists** - Migration 135 already created it with correct structure; just needed to update the service to use it.

### Expert Feedback Applied (2026-01-28)

1. **TTL edge cases in rate limiter** - Added `normalizeTtl()` helper to handle Redis TTL returning -1 (no expiry) or -2 (key missing).

2. **Claim logic respecting next_retry_at** - Fixed claim query to only process retrying/failed events when their scheduled retry time has passed.

3. **Removed duplicate JSON parser** - opensrsWebhook.ts now relies on global parser in server.ts with defensive rawBody check.

4. **Exponential backoff for retries** - Changed from fixed 5-minute retry to exponential backoff capped at ~1 hour.

5. **Webhook idempotency constraint** - Changed to partial unique index + CHECK constraint requiring idempotency_key for known sources.

6. **Dispute status CHECK constraint** - Added validation for dispute_status values in domain invoices.

7. **Transfer webhook handling** - Added `handleTransferWebhook()` to properly update `inhouse_domain_transfers` during transfer-in. Previously webhooks only looked up `inhouse_registered_domains`, missing events for domains being transferred.

8. **Payment verification for transfers** - Added Stripe PaymentIntent verification (status, amount, currency, metadata binding) in `confirmTransferWithAuthCode()` before accepting auth codes.

9. **SQL injection fix in cleanup jobs** - Changed from string interpolation (`INTERVAL '${days} days'`) to parameterized queries using `make_interval(days => $1)`.

10. **Stuck event reaper** - Added scheduled job (every 15 minutes) to recover webhook events stuck in 'processing' for >60 minutes by resetting to 'retrying' with exponential backoff.

11. **Project access checks for transfer routes** - Added `assertProjectAccess(projectId, userId)` to all 7 transfer endpoints. Previously missing authorization allowed potential IDOR attacks via guessed project IDs.

12. **Domain events NULL domain_id** - Created migration 145 to drop NOT NULL constraint on `domain_id` in `inhouse_domain_events`. Needed for transfer lifecycle events that occur before the domain record exists.

13. **Mandatory PaymentIntent metadata binding** - Strengthened `confirmTransferWithAuthCode()` to require `kind: 'domain_transfer_in'` and `transferId` metadata. Also validates `projectId` and `userId` if present. Prevents replay attacks with PaymentIntent IDs from unrelated payments.

14. **IP allowlist production warning** - Added warning log in production when `OPENSRS_WEBHOOK_IPS` is not configured (empty allowlist allows all IPs). Helps catch missing configuration.

15. **Webhook retry cap (max 12 retries)** - Added `MAX_WEBHOOK_RETRIES = 12` constant. Events exceeding this are transitioned to `status='failed'` with `next_retry_at=NULL`. Prevents infinite zombie retries and makes health endpoints meaningful.

16. **Reaper pool check** - Added explicit pool check in webhook stuck reaper job. Logs error if pool unavailable instead of silently doing nothing.

17. **Removed unused `isDuplicateWebhook()`** - Function was unused after switching to persist-first pattern with `ON CONFLICT`. Removed to reduce confusion.

### Frontend Implementation (2026-01-28)

**API Routes Created (sheenappsai):**
- `src/app/api/admin/inhouse/webhook-events/route.ts` - List events
- `src/app/api/admin/inhouse/webhook-events/[eventId]/route.ts` - Get event details
- `src/app/api/admin/inhouse/webhook-events/[eventId]/reprocess/route.ts` - Reprocess event
- `src/app/api/admin/inhouse/webhook-events/failed/route.ts` - Get failed events
- `src/app/api/admin/inhouse/webhook-events/stats/route.ts` - Get event stats
- `src/app/api/admin/inhouse/health/pricing/route.ts` - Pricing cache health
- `src/app/api/admin/inhouse/health/webhooks/route.ts` - Webhook processing health
- `src/app/api/admin/inhouse/health/transfers/route.ts` - Transfer health
- `src/app/api/admin/inhouse/transfers/route.ts` - List transfers
- `src/app/api/admin/inhouse/transfers/[transferId]/route.ts` - Get transfer details

**Components Created:**
- `src/components/admin/InhouseWebhookEventsAdmin.tsx` - Full webhook events viewer with:
  - Stats cards (total, completed, processing, retrying, failed)
  - Health status cards (webhooks, pricing, transfers)
  - Events table with status filtering and pagination
  - Event detail dialog with raw headers/body view
  - Reprocess failed events functionality

**Pages Created:**
- `src/app/admin/inhouse/webhook-events/page.tsx` - Webhook events admin page

**Components Updated:**
- `src/components/admin/InhouseDomainsAdmin.tsx`:
  - Added `dispute_status`, `dispute_opened_at`, `dispute_resolved_at`, `dispute_reason` to RegisteredDomain interface
  - Added "Dispute" column to registered domains table with status badges
  - Added dispute info section to domain detail dialog (shows when dispute_status is open)
  - Added health alert for domains with active disputes or at_risk status
  - Added "Transfers" tab with:
    - DomainTransfer interface
    - Status filtering (pending_payment, pending, initiated, processing, completed, failed, cancelled)
    - Transfers table with domain, status, source registrar, price, dates
    - Health alert for active transfers

### Expert Feedback Deferred (Intentional)

1. **Two idempotency systems** - `stripe_processed_events` and `inhouse_webhook_events` serve different patterns (transactional vs persist-first). Keeping separate is intentional.

2. **Extra dispute columns** - Full event data already stored in `inhouse_domain_events.metadata`. Denormalizing to invoice table is over-engineering.

3. **OpenSRS XML parsing** - Current regex-based parser works for our use cases. Will migrate to proper XML parser when we hit limitations.

4. **Webhook retry worker** - Currently processing inline. Will add BullMQ worker when scale requires it.

### Testing Recommendations (Expert Feedback)

Add webhook signature verification tests to catch parser/body pipeline changes:
- Correct signature passes
- Altered body fails
- Truncated body fails
- Content-type variations (`text/xml; charset=UTF-8`) still pass

### Architecture Documentation Needed

Document the two webhook processing patterns:

1. **Persist-first (OpenSRS, Resend)** - Best for messy payloads, needed retries, audit trail
   - Save raw event → claim → process → update status
   - Idempotency via `inhouse_webhook_events` table

2. **Transactional claim (Stripe disputes)** - Best for quick in-request processing, strict concurrency
   - Check processed → claim in transaction → apply effects atomically
   - Idempotency via `stripe_processed_events` table

Both satisfy: **At-least-once delivery from provider → exactly-once effects in our system**

### Future Improvements Identified

1. **Webhook retry worker** - Currently using inline processing; could add BullMQ worker for large-scale async processing.

2. **User notification for disputes** - `notifyUserOfDispute()` is a placeholder; needs actual email/in-app notification integration.

3. **Admin panel views needed:**
   - ~~Webhook events browser (status, errors, reprocessing)~~ ✅ API endpoints added
   - Domain dispute status badges (`at_risk` state) - needs frontend implementation
   - ~~Pricing sync health monitoring~~ ✅ `/v1/admin/inhouse/health/pricing` endpoint added

4. **Unified webhook primitives** - Consider extracting shared retry/backoff rules and dead-letter handling across both patterns.

5. **Transfer monitoring** - Add scheduled job to poll pending transfers and update status automatically.

6. **Admin health dashboard** - Added `/v1/admin/inhouse/health/*` endpoints for pricing, webhooks, and transfers. Frontend implementation needed.

---

## Related Documents

- [easy-mode-email-plan.md](./easy-mode-email-plan.md) - Parent plan
- [easy-mode-email-admin-panel-plan.md](./easy-mode-email-admin-panel-plan.md) - Frontend for transfer wizard
- [easy-mode-email-user-frontend-plan.md](./easy-mode-email-user-frontend-plan.md) - User-facing email UI
