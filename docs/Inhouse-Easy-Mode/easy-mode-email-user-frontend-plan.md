# Easy Mode Email - End-User Frontend Plan

> **Status:** Implementation Complete — TypeScript check passes (0 errors). Two rounds of code review fixes applied. Overview endpoint, contact form, a11y, scrollable tabs, dark mode badges, ConfirmDialog, Client Config display, and Enable/Disable Mailboxes all shipped.
> **Last Updated:** 2026-01-29
> **Depends On:** `easy-mode-email-plan.md` (backend complete), `easy-mode-email-frontend-plan.md` (admin panel complete)
> **Scope:** All end-user (non-admin) frontend UI for Easy Mode Email

---

## Context

The Easy Mode Email system has a **complete backend** and a **complete admin panel**, but **zero end-user frontend**. End-users currently have no way to:

- View their project's inbox address or received messages
- Configure email settings (auto-reply, forwarding, display name)
- Connect custom domains to their project
- Search/purchase domains
- Create business email mailboxes
- Manage email aliases

### What Already Exists

| Layer | Status | Details |
|-------|--------|---------|
| **Worker routes (user-facing)** | Done | 6 route files, ~4000 lines. HMAC auth, `assertProjectAccess()`. Endpoints under `/v1/inhouse/projects/:projectId/*` |
| **Worker routes (admin)** | Done | 5 route files, ~2500 lines. JWT admin auth. |
| **Services** | Done | `InhouseInboxService`, `InhouseDomainsService`, `InhouseEmailService`, `InhouseMailboxService`, `InhouseDomainRegistrationService`, etc. |
| **SDKs** | Done | `@sheenapps/inbox`, `@sheenapps/email`, `@sheenapps/domains` |
| **Database** | Done | All tables migrated: `inhouse_inbox_messages`, `inhouse_inbox_threads`, `inhouse_inbox_config`, `inhouse_inbox_aliases`, `inhouse_email_domains`, `inhouse_registered_domains`, `inhouse_mailboxes` |
| **Admin frontend** | Done | `InhouseInboxAdmin`, `InhouseDomainsAdmin`, `InhouseDomainWizard`, `DnsStatusIndicator`, `ProjectPicker`, ~25 API proxy routes |
| **User-facing Next.js proxy routes** | Partial | Only `/api/inhouse/projects/[id]/email/` (send + list outbound). No inbox, domains, mailboxes, or domain registration routes |
| **User-facing pages/components** | None | Zero implementation |

### What the User-Facing Worker Endpoints Support

The worker already exposes these user-facing endpoints (HMAC auth via `callWorker()`):

**Inbox:**
- `GET/PATCH/DELETE /v1/inhouse/projects/:projectId/inbox/messages[/:messageId]`
- `GET /v1/inhouse/projects/:projectId/inbox/threads[/:threadId]`
- `GET/PATCH /v1/inhouse/projects/:projectId/inbox/config`
- `POST/DELETE /v1/inhouse/projects/:projectId/inbox/aliases[/:alias]`

**Email Domains:**
- `POST/GET /v1/inhouse/projects/:projectId/email-domains`
- `GET/DELETE /v1/inhouse/projects/:projectId/email-domains/:domainId`
- `POST /v1/inhouse/projects/:projectId/email-domains/:domainId/verify`
- `POST/DELETE /v1/inhouse/projects/:projectId/email-domains/:domainId/cloudflare-token`
- `POST /v1/inhouse/projects/:projectId/email-domains/:domainId/cloudflare-token/provision`

**Mailboxes:**
- `POST /v1/inhouse/projects/:projectId/email-domains/:domainId/mailboxes/enable`
- `POST/GET /v1/inhouse/projects/:projectId/email-domains/:domainId/mailboxes[/:mailboxId]`
- `PATCH/DELETE /v1/inhouse/projects/:projectId/email-domains/:domainId/mailboxes/:mailboxId`

**Domain Registration:**
- `POST /v1/inhouse/projects/:projectId/domain-search`
- `POST /v1/inhouse/projects/:projectId/domain-register`
- `GET /v1/inhouse/projects/:projectId/registered-domains[/:domainId]`
- `POST /v1/inhouse/projects/:projectId/registered-domains/:domainId/renew`
- `GET /v1/inhouse/projects/:projectId/registered-domains/:domainId/auth-code`
- `PATCH /v1/inhouse/projects/:projectId/registered-domains/:domainId/settings`
- `GET /v1/inhouse/projects/:projectId/registered-domains/:domainId/events`
- `GET /v1/inhouse/domain-pricing`

All of these are functional and tested via the admin panel (which calls the admin equivalents). The user-facing versions use HMAC signature auth from `callWorker()` + `requireProjectOwner()`.

---

## Patterns to Follow

All new user-facing pages follow the established patterns from the existing app:

### Page Structure

```typescript
// Server component page
// File: src/app/[locale]/project/[projectId]/email/page.tsx

import { getServerAuthState } from '@/lib/auth-server'
import { redirect } from '@/i18n/routing'
import type { Locale } from '@/i18n/config'

export default async function EmailPage({
  params,
}: { params: Promise<{ locale: string; projectId: string }> }) {
  const { locale, projectId } = await params
  const authState = await getServerAuthState()

  if (!authState.isAuthenticated) {
    redirect({
      href: `/auth/login?returnTo=${encodeURIComponent(`/${locale}/project/${projectId}/email`)}`,
      locale: locale as Locale,
    })
  }

  return <EmailDashboard projectId={projectId} />
}
```

### API Route Pattern

```typescript
// File: src/app/api/inhouse/projects/[id]/inbox/messages/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { requireProjectOwner } from '@/lib/auth/require-project-owner'
import { callWorker, intParam } from '@/lib/api/worker-helpers'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params
  const supabase = await createServerSupabaseClientNew()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ ok: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 })
  }
  const ownerCheck = await requireProjectOwner(supabase, projectId, user.id)
  if (!ownerCheck.ok) return ownerCheck.response

  const result = await callWorker({
    method: 'GET',
    path: `/v1/inhouse/projects/${projectId}/inbox/messages`,
    queryParams: { /* parsed from searchParams */ },
    claims: { userId: user.id },
  })

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status })
  }
  return NextResponse.json({ ok: true, data: result.data }, {
    status: 200,
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
  })
}
```

### UI Conventions

1. **Client components** (`'use client'`) for interactive UI
2. **React Query** for data fetching (`staleTime: 30_000`, cache-busted with `_t` param)
3. **Radix UI** primitives (Tabs, Dialog, Card, Badge) + Tailwind
4. **Notifications**: `toast` from `sonner`
5. **Dates**: `date-fns` (`format`, `formatDistanceToNow`)
6. **Icons**: `lucide-react`
7. **Navigation**: `@/i18n/routing` (never `next/link` or `next/navigation` router)
8. **i18n**: Keys in all 9 locale files, `useTranslations()` in client components
9. **HTML email rendering**: Sandboxed iframe with `sandbox` attribute, 500KB size guard
10. **Untrusted text**: Always render as text nodes, never `dangerouslySetInnerHTML`

### Key Differences from Admin Panel

| Aspect | Admin Panel | User Frontend |
|--------|-------------|---------------|
| Auth | JWT via `requireAdmin()` + `workerFetch()` | HMAC via `requireProjectOwner()` + `callWorker()` |
| Routes | `/api/admin/inhouse/*` | `/api/inhouse/projects/[id]/*` |
| Worker endpoints | `/v1/admin/inhouse/*` | `/v1/inhouse/projects/:projectId/*` |
| Scope | Cross-project (projectId optional) | Single project (projectId required, owner-gated) |
| UX tone | Debug info, raw JSON, log links | Simplified, guided, non-technical copy |
| Components | `components/admin/*` | `components/project/email/*` |
| Pages | `/admin/inhouse/*` | `/[locale]/project/[projectId]/email/*` |

---

## Step 1: Next.js API Proxy Routes

Create proxy routes that call the worker's user-facing endpoints. These follow the existing pattern of `/api/inhouse/projects/[id]/email/route.ts`, but use a shared `withProjectOwner` wrapper to eliminate boilerplate.

### Boilerplate Reduction: `withProjectOwner` Helper

**File to create:** `src/lib/api/with-project-owner.ts`

Every user-facing email route repeats the same auth + ownership + error handling pattern (~40 lines). Extract it into a reusable wrapper:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { requireProjectOwner } from '@/lib/auth/require-project-owner'
import { callWorker } from '@/lib/api/worker-helpers'

export const projectRouteConfig = {
  dynamic: 'force-dynamic' as const,
  revalidate: 0,
  fetchCache: 'force-no-store' as const,
}

type RouteHandler = (
  request: NextRequest,
  context: {
    projectId: string
    userId: string
    params: Record<string, string>
    searchParams: URLSearchParams
  }
) => Promise<NextResponse>

export function withProjectOwner(handler: RouteHandler) {
  return async (request: NextRequest, { params }: { params: Promise<Record<string, string>> }) => {
    try {
      const resolved = await params
      const projectId = resolved.id
      const supabase = await createServerSupabaseClientNew()
      const { data: { user }, error: authError } = await supabase.auth.getUser()

      if (authError || !user) {
        return NextResponse.json(
          { ok: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
          { status: 401 }
        )
      }

      const ownerCheck = await requireProjectOwner(supabase, projectId, user.id)
      if (!ownerCheck.ok) return ownerCheck.response

      return handler(request, {
        projectId,
        userId: user.id,
        params: resolved,
        searchParams: new URL(request.url).searchParams,
      })
    } catch (error) {
      console.error('[API] Route error:', error)
      return NextResponse.json(
        { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Internal error' } },
        { status: 500 }
      )
    }
  }
}
```

This reduces each route file from ~60 lines to ~15 lines:

```typescript
// Example: src/app/api/inhouse/projects/[id]/inbox/messages/route.ts
import { withProjectOwner, projectRouteConfig } from '@/lib/api/with-project-owner'
import { callWorker, intParam } from '@/lib/api/worker-helpers'

export const { dynamic, revalidate, fetchCache } = projectRouteConfig

export const GET = withProjectOwner(async (req, { projectId, userId, searchParams }) => {
  const result = await callWorker({
    method: 'GET',
    path: `/v1/inhouse/projects/${projectId}/inbox/messages`,
    queryParams: {
      limit: intParam(searchParams.get('limit'), { min: 1, max: 100, defaultValue: 50 }),
      offset: intParam(searchParams.get('offset'), { min: 0, max: 1_000_000 }),
      unreadOnly: searchParams.get('unreadOnly') || undefined,
    },
    claims: { userId },
  })
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, data: result.data }, {
    status: 200,
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
  })
})
```

### Files to Create

```
src/lib/api/with-project-owner.ts                 # Shared wrapper (new)

src/app/api/inhouse/projects/[id]/
  inbox/
    config/route.ts                              # GET, PATCH inbox config
    messages/route.ts                            # GET list messages
    messages/[messageId]/route.ts                # GET, PATCH, DELETE message
    messages/[messageId]/attachments/[index]/route.ts  # GET attachment download URL
    threads/route.ts                             # GET list threads
    threads/[threadId]/route.ts                  # GET thread with messages
    aliases/route.ts                             # POST create alias
    aliases/[alias]/route.ts                     # DELETE alias
  email-domains/
    route.ts                                     # GET list, POST add domain
    [domainId]/route.ts                          # GET detail, DELETE
    [domainId]/verify/route.ts                   # POST trigger verification
    [domainId]/cloudflare-token/route.ts         # POST connect, DELETE disconnect
    [domainId]/cloudflare-token/provision/route.ts  # POST provision via CF
    [domainId]/mailboxes/route.ts                # GET list, POST create
    [domainId]/mailboxes/enable/route.ts         # POST enable mailboxes
    [domainId]/mailboxes/disable/route.ts        # POST disable mailboxes
    [domainId]/mailboxes/[mailboxId]/route.ts    # GET, PATCH, DELETE
  registered-domains/
    route.ts                                     # GET list
    [domainId]/route.ts                          # GET detail
    [domainId]/renew/route.ts                    # POST renew
    [domainId]/auth-code/route.ts                # GET transfer auth code
    [domainId]/settings/route.ts                 # PATCH settings
    [domainId]/events/route.ts                   # GET events
  domain-search/route.ts                         # POST search available domains
  domain-register/route.ts                       # POST purchase domain
  domain-pricing/route.ts                        # GET TLD pricing (no projectId needed)
```

Each route uses `withProjectOwner` wrapper. Auth, ownership, error handling, and cache headers are impossible to forget.

**Count:** ~20 route files + 1 helper. Each route file is ~15-25 lines.

---

## Step 2: Email Dashboard Page

The main entry point for end-user email management. Accessed from the builder workspace or project settings.

### Files to Create

```
src/app/[locale]/project/[projectId]/email/
  page.tsx                    # Server component, auth gate, loads EmailDashboard
  layout.tsx                  # Optional layout with project context

src/components/project/email/
  EmailDashboard.tsx          # Main client component with tabs
```

### `EmailDashboard` Component

**Top-level:** Project name + inbox address with copy button + email quota usage bar.

**Tabs:**

#### Tab 1: Overview (Default)
Summary cards showing at-a-glance status:
- **Inbox card**: Inbox address, unread count, total messages, link to "View all"
- **Domains card**: Connected domains count, verification status summary, link to "Manage"
- **Mailboxes card**: Active mailboxes count, link to "Manage"
- **Outbound card**: Emails sent this month, quota remaining, link to "View history"
- **Quick actions**: "Set up custom domain", "Configure auto-reply", "Create alias"

#### Tab 2: Settings
- Display name (editable)
- Auto-reply toggle + message editor
- Forward-to email input
- Retention days selector
- Aliases list with add/remove

#### Tab 3: Inbox
- See Step 3

#### Tab 4: Domains
- See Step 4

#### Tab 5: Outbound History
- Table of sent emails: To, Subject, Status (delivered/bounced/pending), Sent At
- Reuses existing `/api/inhouse/projects/[id]/email` GET endpoint (already exists)
- Pagination: limit+offset, 50 per page

---

## Step 3: Inbox Tab

User-facing inbox for viewing received messages. Simplified version of `InhouseInboxAdmin` - no debug info, friendlier copy.

### Files to Create

```
src/components/project/email/
  EmailInbox.tsx              # Messages + threads sub-tabs
  EmailMessageDetail.tsx      # Message detail dialog/panel
  EmailThreadView.tsx         # Thread conversation view
```

### `EmailInbox` Component

**Sub-tabs:** Messages | Threads

**Messages view:**
- Filter bar: read/unread/all, search by sender
- Table: From, Subject/Snippet, Attachments (paperclip icon + count), Read status (dot), Received
- Click row opens `EmailMessageDetail` dialog:
  - From, To, Subject, Date
  - Text body (default)
  - "View HTML" button (sandboxed iframe, 500KB size guard)
  - Attachments list with download buttons (signed R2 URLs)
  - Actions: Mark read/unread, **Archive** (primary action button), **Delete permanently** (secondary, behind "..." overflow menu, with typed confirmation showing subject/sender — deletion is hard-delete in the backend, no undo)
- Pagination: limit+offset, 50 per page

**Threads view:**
- Table: Subject, Participants, Messages count, Unread count, Last Activity
- Click row shows thread detail with messages listed chronologically
- Pagination: limit+offset, 50 per page

**Key differences from admin inbox:**
- No raw headers section
- No processing status indicators
- No projectId picker (implicit from URL)
- Friendlier empty states ("No messages yet. Share your inbox address to start receiving emails.")
- "Your inbox address" callout at the top with copy button

---

## Step 4: Domains Tab

User-facing domain management. Core value: guides non-technical users through custom domain setup.

### Files to Create

```
src/components/project/email/
  EmailDomains.tsx            # Domain list + management
  DomainSetupWizard.tsx       # Guided domain connection wizard (user-facing)
  DnsStatusDots.tsx           # Compact DNS status indicator (reusable)
  MailboxManager.tsx          # Mailbox list + create dialog
  DomainRegistration.tsx      # Domain search + purchase flow
```

### `EmailDomains` Sub-tabs

#### Sub-tab: Custom Domains

- "Connect Domain" button opens `DomainSetupWizard`
- Table: Domain, Status badge (pending/verified/error), DNS Progress (`DnsStatusDots`), **Sending** badge (shows "Ready to send" if domain is verified with SPF+DKIM and registered with Resend — this is the user's verified sending identity), Connected At
- Click row opens detail panel:
  - DNS records to add (with copy buttons per record)
  - Verification status per record type (SPF, DKIM, DMARC, MX, Return-Path)
  - "Verify Now" button with last-checked timestamp
  - If Cloudflare-managed: zone info and provisioning status
  - Delete domain (with confirmation dialog)

#### Sub-tab: Registered Domains

- "Buy a Domain" button opens `DomainRegistration` flow
- Table: Domain, Status, Expires At (color-coded), Auto-Renew badge
- Click row opens detail panel:
  - Domain info, nameservers
  - Settings: auto-renew toggle, WHOIS privacy toggle
  - Renewal action (with confirmation)
  - Transfer out (get auth code)
- Expiry color coding: green (>30d), yellow (7-30d), red (<7d)

#### Sub-tab: Mailboxes

- Table: Email Address, Domain, Status, Created At
- "Create Mailbox" button opens creation dialog:
  - Domain select (from verified hosted domains)
  - Local part input (e.g., "support")
  - Preview: `support@domain.com`
  - "Create" button
- Click row opens detail:
  - Status, provider info
  - Actions: Open Webmail (SSO link), Reset Password
  - IMAP/SMTP settings (collapsible, with "Copy all" button)
  - Suspend/Delete (with confirmation)

### `DomainSetupWizard`

Adapted from `InhouseDomainWizard` (admin version) but with user-friendly copy and no debug sections.

**Resumable & switchable:** The wizard must handle real-world DNS setup, which isn't linear:

- **Resume:** If a domain already exists in `pending` state for this project, opening the wizard should skip to the relevant step with current progress shown (DNS records already added, partial verification, etc.). Query existing domains on wizard open.
- **Switch approach:** If a user starts with nameserver switch but decides they can't change nameservers, they should be able to go back to Step 2 and pick subdomain/manual. Since the backend has a unique constraint on `(project_id, domain)` and authority_level can't be changed after creation (except manual<->cf_token), switching approach requires: delete existing pending domain record, then create a new one with the chosen authority_level. The wizard should handle this transparently ("We'll reconfigure your domain for this approach").
- **One domain record per domain name:** The wizard must never create duplicate entries. Always check if the domain already exists before POST, and reuse/update the existing record.

```
Step 1: "Do you have a domain?"
  ├── "No, I need one" → Switches to Registered Domains tab, opens domain search
  └── "Yes, I have a domain" → Step 2

Step 2: "How do you want to connect it?"
  ├── "Let SheenApps manage my DNS (recommended)"
  │     → Explanation: "We'll handle all the technical setup. You just switch
  │       your domain's nameservers to ours."
  │     → Step 3a
  ├── "Use a subdomain (safest)"
  │     → Explanation: "Your existing website stays untouched. Email will work
  │       on mail.yourdomain.com."
  │     → Step 3b
  └── "I'll add DNS records myself"
      → Explanation: "Best if you're comfortable with DNS settings."
      → Step 3c

Step 3a: Nameserver Switch
  - Input: domain name
  - Shows: "Your current DNS records will be preserved"
  - Shows: Nameservers to switch to (with copy buttons)
  - Step-by-step instructions for common registrars
  - Polling indicator with "Check Now" button
  - Progress: "Waiting for nameserver change..." → "Setting up email records..." → "Done!"

Step 3b: Subdomain Delegation
  - Input: parent domain
  - Shows: NS records to add (with copy buttons)
  - Step-by-step instructions
  - Polling with "Check Now" button

Step 3c: Manual DNS
  - Input: domain name
  - Shows: All DNS records (Type, Host, Value) with copy buttons per row
  - "Copy all records" button
  - DnsStatusDots showing live progress
  - "Verify" button

Step 4: Complete
  - Green checkmarks
  - "Your custom email is ready! You can now send from hello@yourdomain.com"
  - "Done" button
```

**DNS Polling UX (same as admin):**
- Backoff: 10s → 20s → 30s intervals
- "Check Now" resets to 10s
- Copy: "Most changes appear within minutes. Full propagation can take up to 48 hours."

**No admin-specific features:**
- No debug section / raw DNS responses
- No activity log links
- No raw API response JSON
- Simplified error messages (not raw error codes)

### `DomainRegistration`

Domain search and purchase flow:

```
Step 1: Search
  - Text input for desired domain name
  - TLD checkboxes (.com, .net, .org, .io, .co, .app, .dev, .ai)
  - "Search" button
  - Results grid: domain name, availability badge, price/year
  - "Register" button on available domains

Step 2: Registration Details
  - Domain name (read-only)
  - Contact form (name, email, organization, address, country, phone)
  - Registration period (1/2/3 years)
  - Options: auto-renew (default on), WHOIS privacy (default on)
  - Price summary

Step 3: Confirm & Register
  - Summary of all selections
  - "Register Domain" button
  - Status progress after clicking (handles partial success gracefully):
    ✓ Payment confirmed
    ◌ Registering domain...
    ○ Configuring nameservers
    ○ Provisioning email DNS
  - If any step fails, show clear status with retry option
  - Even if registration is synchronous today, the UI should be ready for partial success

Step 4: Success
  - "Your domain has been registered!"
  - Auto-configured with SheenApps nameservers
  - Email DNS pre-provisioned
  - "Set up email" link → opens domain wizard
```

### `DnsStatusDots`

Compact reusable component showing DNS verification status:

```
SPF ● DKIM ● DMARC ○ MX ● Return-Path ●
```

- Green `●` = verified
- Gray `○` = pending
- Red `●` = error
- Each dot has a tooltip showing status detail
- Compact mode: "3/5 verified" text

Props: `{ dnsStatus: DnsStatusMap; compact?: boolean }`

---

## Step 5: Builder/Workspace Integration

Add email entry points to existing project management surfaces.

### Integration Command Center

Add an "Email" section to the existing `IntegrationCommandCenter` component.

**File to modify:** `src/components/workspace/integration-command-center.tsx`

Add a card in the Overview tab:
- **Email card**: Shows inbox address, connected domains count, sending identity status
- Status indicator: green (all good), yellow (domains pending verification), red (errors)
- "Manage Email" button → navigates to `/project/[projectId]/email`
- **No unread count here** — fetching per-project unread counts from the dashboard would cause N+1 API calls. Unread counts are only shown on the email page itself.

### Dashboard Project Card — Unread Badge

Show unread email count on project cards in the dashboard grid. Requires a new **batch endpoint** to avoid N+1 API calls (one call per project card).

**Backend work (worker):**

Add a new route to the worker that returns unread counts across all projects for a user in a single query:

**File to create:** `sheenapps-claude-worker/src/routes/inhouseInboxSummary.ts`

```typescript
// GET /v1/inhouse/inbox/unread-summary
// Auth: HMAC + userId in claims
// Returns: { [projectId]: number } — unread count per project

// SQL (single query, no N+1):
SELECT m.project_id, COUNT(*) as unread_count
FROM inhouse_inbox_messages m
JOIN projects p ON p.id = m.project_id
WHERE p.owner_id = $1
  AND m.is_read = FALSE
  AND m.is_archived = FALSE
GROUP BY m.project_id
```

This is a simple endpoint: one query, one response. Register in `server.ts` alongside other inbox routes.

**Next.js proxy route:**

**File to create:** `src/app/api/inhouse/inbox/unread-summary/route.ts`

Uses standard auth check (no `projectId` needed — scoped by user via `owner_id`). Returns `{ ok: true, data: { [projectId]: number } }`.

**Frontend hook:**

**File to create:** `src/hooks/use-inbox-unread-summary.ts`

```typescript
export function useInboxUnreadSummary(userId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['inbox-unread-summary', userId],
    queryFn: () =>
      fetch(`/api/inhouse/inbox/unread-summary?_t=${Date.now()}`, { cache: 'no-store' })
        .then(r => r.json()),
    enabled: !!userId && enabled,
    staleTime: 60_000, // 1 minute — dashboard doesn't need instant updates
  })
}
```

**Dashboard integration:**

In `project-grid.tsx` (or equivalent project card), show a small mail icon with unread count badge when count > 0. The hook fetches once for all projects, then each card reads its count from the map.

**Note:** This endpoint does NOT use `requireProjectOwner` since it spans multiple projects. Instead it filters by `owner_id` in SQL (same as the projects list endpoint). The HMAC middleware still validates the request is from the Next.js app with a valid user.

### Navigation

Add link to email page from builder workspace sidebar/menu:
- Icon: `Mail` from lucide-react
- Label: "Email"
- Badge: unread count (if > 0)

---

## Step 6: Hooks & Data Fetching

React Query hooks for fetching email data across components.

### Files to Create

```
src/hooks/
  use-inbox-config.ts         # Fetch inbox config (address, settings)
  use-inbox-messages.ts       # Fetch paginated messages
  use-inbox-threads.ts        # Fetch paginated threads
  use-email-domains.ts        # Fetch custom domains
  use-registered-domains.ts   # Fetch registered domains
  use-mailboxes.ts            # Fetch mailboxes
  use-email-history.ts        # Fetch sent emails
```

Each hook follows the integration-status pattern:

```typescript
export function useInboxConfig(projectId: string, enabled = true) {
  return useQuery({
    queryKey: ['inbox-config', projectId],
    queryFn: () =>
      fetch(`/api/inhouse/projects/${projectId}/inbox/config?_t=${Date.now()}`, {
        cache: 'no-store',
      }).then(r => r.json()),
    enabled: !!projectId && enabled,
    staleTime: 30_000,
  })
}
```

---

## Step 7: i18n

All user-visible strings go through next-intl. Add keys to all 9 locale files.

### Namespace: `project-email`

```json
{
  "project-email": {
    "title": "Email",
    "inbox": {
      "title": "Inbox",
      "address": "Your inbox address",
      "empty": "No messages yet. Share your inbox address to start receiving emails.",
      "unread": "{count} unread",
      "markRead": "Mark as read",
      "markUnread": "Mark as unread",
      "archive": "Archive",
      "delete": "Delete",
      "deleteConfirm": "Are you sure you want to delete this message?",
      "viewHtml": "View HTML",
      "htmlTooLarge": "HTML content too large to preview",
      "attachments": "Attachments",
      "download": "Download",
      "fileNotStored": "File not stored"
    },
    "threads": {
      "title": "Threads",
      "empty": "No conversations yet.",
      "participants": "Participants",
      "messages": "Messages",
      "lastActivity": "Last activity"
    },
    "settings": {
      "title": "Settings",
      "displayName": "Display name",
      "autoReply": "Auto-reply",
      "autoReplyMessage": "Auto-reply message",
      "forwardTo": "Forward emails to",
      "retentionDays": "Keep messages for",
      "aliases": "Email aliases",
      "addAlias": "Add alias",
      "saved": "Settings saved"
    },
    "domains": {
      "title": "Custom Domains",
      "connectDomain": "Connect Domain",
      "verified": "Verified",
      "pending": "Pending",
      "error": "Error",
      "verifyNow": "Verify Now",
      "lastChecked": "Last checked",
      "dnsRecords": "DNS Records",
      "copyAll": "Copy all records",
      "deleteDomain": "Remove domain",
      "deleteConfirm": "Are you sure you want to remove this domain?"
    },
    "wizard": {
      "haveDomain": "Do you have a domain?",
      "noDomain": "No, I need one",
      "yesDomain": "Yes, I have a domain",
      "howConnect": "How do you want to connect it?",
      "nameservers": "Let SheenApps manage my DNS",
      "nameserversDesc": "We'll handle all the technical setup. You just switch your domain's nameservers to ours.",
      "subdomain": "Use a subdomain",
      "subdomainDesc": "Your existing website stays untouched. Email will work on mail.yourdomain.com.",
      "manual": "I'll add DNS records myself",
      "manualDesc": "Best if you're comfortable with DNS settings.",
      "enterDomain": "Enter your domain name",
      "switchNameservers": "Switch your nameservers",
      "addNsRecords": "Add these NS records",
      "addDnsRecords": "Add these DNS records",
      "checkNow": "Check Now",
      "propagationNote": "Most changes appear within minutes. Full propagation can take up to 48 hours.",
      "complete": "Your custom email is ready!",
      "done": "Done"
    },
    "registration": {
      "title": "Buy a Domain",
      "searchPlaceholder": "Enter a domain name to search",
      "search": "Search",
      "available": "Available",
      "unavailable": "Taken",
      "register": "Register",
      "perYear": "/year",
      "contactDetails": "Contact details",
      "period": "Registration period",
      "years": "{count} year(s)",
      "autoRenew": "Auto-renew",
      "whoisPrivacy": "WHOIS privacy",
      "registerDomain": "Register Domain",
      "success": "Your domain has been registered!"
    },
    "mailboxes": {
      "title": "Mailboxes",
      "create": "Create Mailbox",
      "domain": "Domain",
      "localPart": "Address",
      "preview": "Preview",
      "openWebmail": "Open Webmail",
      "resetPassword": "Reset Password",
      "suspend": "Suspend",
      "unsuspend": "Unsuspend",
      "delete": "Delete",
      "deleteConfirm": "Are you sure you want to delete this mailbox?",
      "imapSettings": "IMAP/SMTP Settings",
      "copyAll": "Copy all settings"
    },
    "outbound": {
      "title": "Sent Emails",
      "empty": "No emails sent yet.",
      "delivered": "Delivered",
      "bounced": "Bounced",
      "pending": "Pending",
      "failed": "Failed"
    },
    "overview": {
      "title": "Overview",
      "inboxCard": "Inbox",
      "domainsCard": "Domains",
      "mailboxesCard": "Mailboxes",
      "outboundCard": "Sent Emails",
      "unreadMessages": "{count} unread",
      "totalMessages": "{count} total",
      "connectedDomains": "{count} connected",
      "activeMailboxes": "{count} active",
      "sentThisMonth": "{count} sent this month",
      "setupDomain": "Set up custom domain",
      "configureAutoReply": "Configure auto-reply",
      "createAlias": "Create alias"
    }
  }
}
```

These keys must be added to all 9 locale files: `en`, `ar-eg`, `ar-sa`, `ar-ae`, `ar`, `fr`, `fr-ma`, `es`, `de`.

---

## Implementation Order

1. **Backend: Unread summary endpoint** (worker) - New route `inhouseInboxSummary.ts` + register in `server.ts`. Single SQL query, ~50 lines. Unblocks dashboard badges.
2. **Step 1: `withProjectOwner` helper + API proxy routes** (~20 route files + 1 helper + 1 unread-summary route) - Unblocks all frontend work. Helper eliminates boilerplate, each route is ~15 lines.
3. **Step 6: Hooks** (~8 files including unread summary) - Data layer that components consume. Build alongside or right after routes.
4. **Step 7: i18n keys** - Add the `project-email` namespace to all 9 locale files. Must happen before any component renders user-facing text.
5. **Step 2: EmailDashboard + Overview tab** - Entry point page with overview cards. Validates the data pipeline end-to-end.
6. **Step 3: Inbox tab** - Message list + detail + thread views. High-value: users can see their received emails.
7. **Step 4a: Domains tab + DnsStatusDots** - Domain list and verification status. Shows connected domains with sending-ready badges.
8. **Step 4b: DomainSetupWizard** - Guided domain connection (resumable + switchable). The most complex component but highest user value.
9. **Step 4c: DomainRegistration** - Domain search and purchase flow with status progress.
10. **Step 4d: MailboxManager** - Mailbox CRUD and management.
11. **Step 2 (Settings tab)** - Inbox settings, aliases, auto-reply configuration.
12. **Step 5: Integration points** - IntegrationCommandCenter card, dashboard unread badges, navigation links.

Steps 1-3 are the critical path. Steps 4a-4d can be built incrementally.

---

## File Summary

### New Files (Pages)

| File | Purpose |
|------|---------|
| `src/app/[locale]/project/[projectId]/email/page.tsx` | Email dashboard page (server component, auth gate) |
| `src/app/[locale]/project/[projectId]/email/layout.tsx` | Optional layout for project email section |

### New Files (Components)

| File | Purpose |
|------|---------|
| `src/components/project/email/EmailDashboard.tsx` | Main email dashboard with tabs (Overview, Settings, Inbox, Domains, Outbound) |
| `src/components/project/email/EmailInbox.tsx` | Inbox messages + threads viewer |
| `src/components/project/email/EmailMessageDetail.tsx` | Message detail dialog with HTML sandbox, attachments |
| `src/components/project/email/EmailThreadView.tsx` | Thread conversation view |
| `src/components/project/email/EmailDomains.tsx` | Domain list + management (custom domains, registered, mailboxes) |
| `src/components/project/email/DomainSetupWizard.tsx` | Guided domain connection wizard (user-friendly version) |
| `src/components/project/email/DnsStatusDots.tsx` | Compact DNS verification status indicator |
| `src/components/project/email/MailboxManager.tsx` | Mailbox list + create/manage dialogs |
| `src/components/project/email/DomainRegistration.tsx` | Domain search + purchase flow |
| `src/components/project/email/EmailSettings.tsx` | Inbox config form (display name, auto-reply, forwarding, aliases) |
| `src/components/project/email/EmailOutboundHistory.tsx` | Sent email history table |
| `src/components/ui/confirm-dialog.tsx` | Reusable confirmation dialog (replaces window.confirm across email module) |

### New Files (Worker — Backend)

| File | Purpose |
|------|---------|
| `sheenapps-claude-worker/src/routes/inhouseInboxSummary.ts` | `GET /v1/inhouse/inbox/unread-summary` — cross-project unread counts for dashboard badges |
| `sheenapps-claude-worker/src/routes/inhouseEmailOverview.ts` | `GET /v1/inhouse/projects/:projectId/email/overview` — aggregated email stats (5 parallel SQL queries) |

Both registered in `server.ts`.

### New Files (API Routes & Helpers)

| File | Purpose |
|------|---------|
| `src/lib/api/with-project-owner.ts` | Shared wrapper: auth + ownership + error handling + cache headers |
| `src/app/api/inhouse/inbox/unread-summary/route.ts` | Cross-project unread summary proxy (no projectId, user-scoped) |
| `src/app/api/inhouse/projects/[id]/email/overview/route.ts` | Email overview proxy (aggregated stats) |

~20 route files under `src/app/api/inhouse/projects/[id]/` — see Step 1 for full list. Each uses `withProjectOwner` wrapper (~15-25 lines per file).

### New Files (Hooks)

| File | Purpose |
|------|---------|
| `src/hooks/use-inbox-config.ts` | React Query hook for inbox config |
| `src/hooks/use-inbox-messages.ts` | React Query hook for paginated inbox messages |
| `src/hooks/use-inbox-threads.ts` | React Query hook for paginated threads |
| `src/hooks/use-email-domains.ts` | React Query hook for custom email domains |
| `src/hooks/use-registered-domains.ts` | React Query hook for registered domains |
| `src/hooks/use-mailboxes.ts` | React Query hook for mailboxes |
| `src/hooks/use-email-history.ts` | React Query hook for sent email history |
| `src/hooks/use-inbox-unread-summary.ts` | React Query hook for cross-project unread counts (dashboard badges) |
| `src/hooks/use-email-overview.ts` | React Query hook for aggregated email stats (replaces 4 hooks in EmailOverview) |

### Modified Files

| File | Change |
|------|--------|
| `src/components/workspace/integration-command-center.tsx` | Add Email status card to Overview tab |
| `src/components/dashboard/project-grid.tsx` (or project card) | Add unread email badge using `useInboxUnreadSummary` hook |
| `sheenapps-claude-worker/src/server.ts` | Register `inhouseInboxSummary` routes |
| `messages/en.json` (+ 8 locale files) | Add `project-email` namespace |
| `middleware.ts` | Ensure `/project/*/email` routes are in `PROTECTED_ROUTES` (may already be covered by `/project/*` pattern) |

---

## Mobile Responsiveness

All email pages must work on mobile. Key rules:

- **Tables on desktop, cards on mobile**: Inbox message list, domain list, and mailbox list switch to a card-based layout below `sm` breakpoint. Use `hidden sm:table` for tables and `sm:hidden` for card views.
- **Wizard dialogs**: Use full-screen sheet on mobile (`Dialog` on desktop, `Sheet` on mobile, or a responsive dialog that goes full-width below `sm`).
- **Copy buttons**: Must be tap-friendly (min 44px touch target).
- **DNS record tables**: On mobile, stack Type/Host/Value vertically per record instead of horizontal columns.
- **RTL support**: Use CSS logical properties (`ms-`, `me-`, `ps-`, `pe-`, `start`/`end`) throughout. Test Arabic locales. Use `<bdi>` for mixed-direction content (email addresses, domain names in Arabic context).

---

## Security Considerations

1. **All API routes enforce ownership**: `requireProjectOwner()` + HMAC headers on every endpoint
2. **HTML email rendering**: Sandboxed iframe with bare `sandbox` attribute (blocks scripts + same-origin). 500KB size guard.
3. **Attachment downloads**: Via signed R2 URLs (time-limited, not direct file access)
4. **DNS values displayed as text nodes**: Never `dangerouslySetInnerHTML` for DNS records, email headers, or any backend-sourced strings
5. **Alias validation**: Server-side reserved word list + rate limits. Client shows validation feedback.
6. **Domain registration**: Server-side validation of contact details, rate-limited to prevent abuse
7. **No `sheen_sk_*` keys on client**: All worker calls go through Next.js API routes

---

## Resolved Decisions

1. **Email page placement**: Dedicated page at `/project/[projectId]/email` with entry point card in IntegrationCommandCenter. Email needs depth (wizard, inbox, domains) — a builder tab would get cramped.

2. **Mobile responsiveness**: Cards on mobile, tables on desktop. See Mobile Responsiveness section.

3. **Real-time updates**: Start with polling (30-60s interval + manual refresh button). Add realtime via `@sheenapps/realtime` later. The inbox is not Slack — correctness > instant.

4. **Quota display**: Show as a small "Usage" card in Overview tab with a progress bar. Not the hero element.

5. **Sending identity**: Backend already supports sending from verified custom domains (via `fromLocalPart` + verified domain). The Domains tab shows a "Ready to send" badge on verified domains. No separate "Sending identities" management page needed for v1 — the domain IS the identity.

## Future Enhancements (Out of Scope)

- **Real-time inbox**: SSE-based live message push via `@sheenapps/realtime`
- **Multi-domain sending UI**: Select which verified domain to send from (currently uses first verified domain)
- **Domain search & registration UI in admin wizard** (noted as missing in admin frontend plan too)

---

## Implementation Progress

### Step 0: Backend — Unread Summary Endpoint ✅
- Created `sheenapps-claude-worker/src/routes/inhouseInboxSummary.ts`
- Registered in `server.ts`

### Step 1: `withProjectOwner` Helper + API Proxy Routes ✅
- Created `src/lib/api/with-project-owner.ts` (withProjectOwner + withAuth wrappers)
- Exported `WorkerCallResult` from `worker-helpers.ts`
- Created **44 route files** covering all user-facing worker endpoints:
  - 8 inbox routes (messages, threads, config, aliases, attachments)
  - 18 email-domains routes (CRUD, verify, status, registrar, cloudflare-token, subdomain-delegation, nameserver-switch — each with sub-routes)
  - 4 domain mailbox routes (list/create, enable, disable, DNS readiness)
  - 9 project-scoped mailbox routes (CRUD, restore, reset-password, suspend/unsuspend, webmail-sso, client-config, sync-quota)
  - 6 registered-domains routes (list, detail, renew, auth-code, settings, events)
  - 1 domain-search, 1 domain-register
  - 1 domain-pricing (cross-project, uses withAuth)
  - 1 unread-summary (cross-project, uses withAuth)
- **Discovery:** Plan estimated ~20 routes but worker has 42 user-facing endpoints. We proxied all of them. The plan underestimated because it didn't list subdomain-delegation paths (3 endpoints), nameserver-switch paths (4 endpoints), mailbox management actions (restore, suspend/unsuspend, webmail-sso, client-config, sync-quota), domain status/registrar endpoints.

### Step 2: React Query Hooks ✅
- Created 9 hook files:
  - `use-inbox-config.ts` (fetch + update mutation)
  - `use-inbox-messages.ts` (fetch + update + delete mutations)
  - `use-inbox-threads.ts` (list + detail)
  - `use-email-domains.ts` (list, detail, status, add, delete, verify mutations)
  - `use-registered-domains.ts` (list, detail, renew, settings, search, register mutations)
  - `use-mailboxes.ts` (domain mailboxes, detail, create, delete, action mutations)
  - `use-email-history.ts` (sent email history)
  - `use-inbox-unread-summary.ts` (cross-project unread counts)
  - `use-domain-pricing.ts` (TLD pricing)
- Added `emailKeys` to `src/lib/query-keys.ts`

### Step 3: i18n ✅
- Created `project-email.json` in all 9 locales (`en`, `ar`, `ar-ae`, `ar-eg`, `ar-sa`, `fr`, `fr-ma`, `es`, `de`)
- Added `project-email` namespace to `src/i18n/request.ts` loader
- Keys cover: inbox, threads, settings, domains, wizard, registration, mailboxes, outbound, overview, registeredDomains, common

### Step 4: EmailDashboard + Overview ✅
- Created `src/app/[locale]/project/[projectId]/email/page.tsx` (server component with auth gate)
- Created `src/components/project/email/EmailDashboard.tsx` (main tabbed dashboard)
- Created `src/components/project/email/EmailOverview.tsx` (summary cards + quick actions)

### Step 5: Inbox Tab ✅
- Created `src/components/project/email/EmailInbox.tsx` with:
  - Messages sub-tab with pagination, unread filter, detail dialog
  - Threads sub-tab with list + detail dialog
  - Message detail: headers, text/HTML body (sandboxed iframe), attachments, mark read/unread, archive, delete
  - Inbox address callout with copy button

### Step 6: Domains Tab + Wizard + Registration + Mailboxes ✅
- Created `src/components/project/email/EmailDomains.tsx` (3 sub-tabs: Custom, Registered, Mailboxes)
- Created `src/components/project/email/DnsStatusDots.tsx` (reusable DNS status indicator)
- Created `src/components/project/email/DomainSetupWizard.tsx` (4-step resumable wizard with approach switching)
- Created `src/components/project/email/DomainRegistration.tsx` (search + register flow)
- Created `src/components/project/email/MailboxManager.tsx` (list, create dialog, actions)

### Step 7: Settings + Outbound History ✅
- Created `src/components/project/email/EmailSettings.tsx` (display name, auto-reply, forwarding, retention, aliases CRUD)
- Created `src/components/project/email/EmailOutboundHistory.tsx` (sent emails table with status badges, pagination)

### Step 8: Integration Points ✅
- Modified `src/components/workspace/integration-command-center.tsx`:
  - Added EmailIntegrationCard with inbox address, domain count, sending-ready badges, "Manage Email" link
- Modified `src/components/dashboard/project-grid.tsx`:
  - Added `useInboxUnreadSummary` hook at grid level
  - Added unread email badge (mail icon + count) to both grid and list views
  - Badge shows on project cards when unreadEmailCount > 0

---

## Improvements & Discoveries

- **Route count was underestimated**: The plan said ~20 route files but the worker exposes 42 user-facing endpoints. All are now proxied. The `withProjectOwner` wrapper kept each file to ~15-25 lines despite the higher count.
- **`withAuth` wrapper added**: For cross-project endpoints (domain-pricing, unread-summary) that don't need project ownership checks but still need Supabase auth. Not in original plan but necessary for the architecture.

### Code Review Fixes Applied

1. **Removed `window.location.reload()`** in EmailSettings alias management. Created `use-inbox-aliases.ts` with `useAddInboxAlias` / `useRemoveInboxAlias` hooks that use proper TanStack Query invalidation of inbox config.
2. **Webmail SSO & reset-password now handle responses**: SSO opens the returned URL in a new tab with `noopener,noreferrer`. Reset password shows a dialog with the temporary password or confirmation message.
3. **Cloudflare token flow completed**: Added token input field, connect button, and `useSetCloudflareToken` mutation to the wizard. Previously a dead-end.
4. **Replaced `JSON.stringify` in wizard**: Built `DnsRecordsPanel` component showing typed DNS records (type badge, name, value with copy buttons, priority, status).
5. **Iframe security**: Added `referrerPolicy="no-referrer"` to email HTML iframe. Kept bare `sandbox=""` (more restrictive than the suggested `allow-popups`).
6. **Removed unused import**: `useDomainPricing` was imported but unused in `DomainRegistration.tsx`.
7. **Added 5 new i18n keys** across all 9 locales: `wizard.cloudflareTokenHint`, `wizard.cfTokenConnected`, `wizard.connect`, `mailboxes.tempPassword`, `mailboxes.passwordResetInitiated`.

### Code Review Items — Rejected

- **Promise params**: Reviewer claimed Next.js params is not a Promise. Wrong — Next.js 15 App Router params IS a Promise (confirmed by `advisor/workspace/[projectId]/page.tsx` and CLAUDE.md). Our pattern is correct.
- **Loosen iframe sandbox**: Reviewer suggested `sandbox="allow-popups allow-top-navigation-by-user-activation"`. Our bare `sandbox=""` is MORE restrictive. No reason to loosen it.
- **Attachment IDs over indexes**: Would require backend schema changes. The worker uses index-based attachment addressing.

### Overview Endpoint + Contact Form + A11y Fixes ✅

Implemented all three previously-deferred items:

**1. Email Overview Endpoint** — Reduces 4 API calls to 1:
- Created `sheenapps-claude-worker/src/routes/inhouseEmailOverview.ts` (`GET /v1/inhouse/projects/:projectId/email/overview`)
  - HMAC auth + `assertProjectAccess` authorization
  - 5 parallel SQL queries via `Promise.all()`: inbox (total/unread), domains (total/verified), mailboxes (active), outbound (sent this month), inbox config (address)
- Created `src/app/api/inhouse/projects/[id]/email/overview/route.ts` (proxy using `withProjectOwner`)
- Created `src/hooks/use-email-overview.ts` (`useEmailOverview` hook, `staleTime: 30_000`)
- Added `emailOverview` key to `src/lib/query-keys.ts`
- Registered route in `sheenapps-claude-worker/src/server.ts`
- Updated `EmailOverview.tsx` to use single `useEmailOverview` hook instead of 4 hooks (`useInboxConfig`, `useInboxMessages` x2, `useEmailDomains`, `useEmailHistory`)
- Mailboxes card now shows real count instead of hardcoded "—"

**2. Domain Registration Contact Form** — Fixes broken registration flow:
- Updated `DomainRegistration.tsx`: new 3-step flow (search → contact details → register)
  - Two-column responsive form with 11 fields (9 required: firstName, lastName, email, phone, address1, city, state, postalCode, country; 2 optional: orgName, address2)
  - Client-side validation for required fields, email format, ISO country code
  - Country selector with ISO 2-letter codes
- Updated `use-registered-domains.ts`: changed `contact: Record<string, string>` → `contacts: { owner: DomainContact; admin?; billing?; tech? }` to match backend `validateContact()` expectations
- Exported `DomainContact` interface
- Added `registration.contact.*` i18n keys (17 keys) to all 9 locale files

**3. Keyboard Accessibility** — Clickable rows/cards now keyboard accessible:
- `EmailDomains.tsx`: desktop table rows and mobile cards — added `tabIndex={0}`, `role="button"`, `onKeyDown` (Enter/Space)
- `EmailOverview.tsx`: all 4 summary cards — same treatment

### Second Code Review Fixes ✅

**1. Scrollable tab rows** — Mobile + RTL safety:
- `EmailDashboard.tsx`: wrapped `TabsList` with `overflow-x-auto` container, added `whitespace-nowrap` + `w-max min-w-full`
- `EmailDomains.tsx`: same pattern for 3 sub-tabs
- `EmailInbox.tsx`: same pattern for 2 sub-tabs

**2. Dark mode badge colors** — Fixed hardcoded light-only colors:
- `DomainRegistration.tsx` and `EmailOutboundHistory.tsx`: added `dark:bg-green-900/30 dark:text-green-400` to green badges

**3. ConfirmDialog replacing window.confirm** — Consistent, app-native confirmations:
- Created `src/components/ui/confirm-dialog.tsx` — reusable component using Radix Dialog primitives, supports destructive variant
- `EmailDomains.tsx`: domain delete now uses ConfirmDialog
- `MailboxManager.tsx`: mailbox delete now uses ConfirmDialog
- `EmailInbox.tsx`: message delete now uses ConfirmDialog
- Zero `window.confirm` calls remaining in email module

### Second Code Review Items — Rejected

- **`window.location.reload()` removal**: Doesn't exist. `EmailSettings` already uses proper mutation hooks with query invalidation.
- **DNS JSON display fix**: Doesn't exist. `DomainSetupWizard` already uses `DnsRecordsPanel` component with typed records.
- **Touch targets**: Generic advice. Standard shadcn button sizes are adequate.
- **HTML toggle labels**: Already using correct i18n keys.
- **Generate password / domain input validation**: Nice-to-have features, not bugs. Deferred.

---

## Open: Disable Mailboxes (backend needed)

**Status:** Frontend hook ready, UI intentionally hidden until verified end-to-end.

The user-facing UI only exposes "Enable Mailboxes". No disable button is shown — the admin panel also lacks one. Users currently cannot revert from hosted mailbox mode back to Resend.

### What exists

- **Backend:** `disableMailboxes()` is fully specced in the backend plan with a state machine (`hosted → resend` or `hosted → resend_pending_mx` if MX can't auto-switch). The worker endpoint likely exists already — it was just never wired into any UI.
- **Frontend hook:** `useToggleDomainMailboxes` already supports `enable: false`
- **Translations:** `disableMailboxes` and `disableConfirm` keys exist in all 9 locales

### Before enabling the UI

1. **Verify the worker endpoint** — confirm `POST /email-domains/:domainId/mailboxes/disable` works and what it does to existing mailbox data (deprovisioned from OpenSRS, but are DB records/emails preserved or deleted?)
2. **Handle `resend_pending_mx` state** — if MX can't auto-switch back, the user needs guidance to update DNS manually (similar to `hosted_pending_mx` on enable)
3. **Decide on UX for existing mailboxes** — does the endpoint refuse if mailboxes exist, or does it deprovision them? The confirmation message should be honest about the outcome.
