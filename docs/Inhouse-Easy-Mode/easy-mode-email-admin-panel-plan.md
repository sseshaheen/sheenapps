# Easy Mode Email - Frontend Implementation Plan

> **Status:** Implementation Complete (All Steps Done)
> **Last Updated:** 2026-01-27
> **Depends On:** `easy-mode-email-plan.md` (backend/worker + SDK/packages are done)
> **Scope:** All admin panel UI for Phases 1-4 of the Easy Mode Email system

---

## Context

The backend/worker and SDK/packages work for Easy Mode Email is complete across all phases (1 through 4). What remains is the **frontend/admin panel UI** in the Next.js app at `sheenappsai/`. This plan covers all pending frontend items referenced in the parent plan.

### What Already Exists (Frontend)

| Component | Location | Notes |
|-----------|----------|-------|
| `InhouseEmailsAdmin` | `components/admin/InhouseEmailsAdmin.tsx` | Outbound email monitoring only |
| Emails page | `app/admin/inhouse/emails/page.tsx` | Uses `createInhouseAdminPage` factory |
| Admin nav model | `components/admin/nav/admin-nav-model.ts` | In-House section with existing items |
| Worker proxy | `lib/admin/worker-proxy.ts` | `workerFetch`, `proxyGet`, `proxyPost`, etc. |
| Page factory | `app/admin/inhouse/_lib/create-inhouse-admin-page.tsx` | Reduces boilerplate |
| Shared components | `components/admin/shared/` | `AdminPageShell`, `AdminLoading`, `StatusBadge`, `CopyButton`, `ReasonDialog`, pagination |
| Project detail page | `components/admin/InhouseProjectDetails.tsx` | Tabs pattern reference (1479 lines) |

### What Needs to Be Built

| Feature | Phase | Parent Plan Reference |
|---------|-------|-----------------------|
| Custom domain wizard ("Do you have a domain?" flow) | Phase 2C | "Admin panel wizard UI" |
| Domain search and purchase UI | Phase 3 | "Domain search and purchase wizard" |
| "Create Business Email" wizard | Phase 4 | "Create Business Email wizard" |
| Inbox list view (messages, threads) | Phase 1 | "Admin panel: inbox list view" |

### Backend Prerequisite: Admin Worker Endpoints

The worker backend currently has **no admin-specific endpoints** for inbox, email-domains, registered-domains, or mailboxes. The existing endpoints use **HMAC signature auth** tied to a project's secret key — the admin panel uses **JWT Bearer token auth** instead (via `workerFetch()` + `AdminAuthService.getAuthHeaders()`). These are completely different auth systems, so the admin panel **cannot** call the project-scoped endpoints directly.

This is consistent with how every other admin feature works: `adminInhouseEmails.ts` uses `requireAdminAuth()` and queries the DB directly — it does not proxy to project-scoped email endpoints.

**Required before frontend work begins:** Create admin worker route files that follow the existing admin pattern (`requireAdminAuth` + `parseLimitOffset` + direct DB queries):

| File to Create | Purpose | Scope |
|----------------|---------|-------|
| `adminInhouseInbox.ts` | Inbox messages, threads, config | Required `projectId` param |
| `adminInhouseEmailDomains.ts` | Email domain verification, DNS status | Required `projectId` param |
| `adminInhouseRegisteredDomains.ts` | Registered domains, search, events | Required `projectId` param |
| `adminInhouseMailboxes.ts` | Mailbox CRUD, DNS readiness | Required `projectId` param |

Each file is mostly boilerplate — auth middleware + SQL query + response formatting — matching the 20+ existing `adminInhouse*.ts` files. The queries are the same ones already in the project-scoped services (`InhouseInboxService`, `InhouseDomainsService`, etc.), just called through admin auth instead of HMAC auth.

**v1:** All endpoints require `projectId` as a query parameter (admin must select a project first).
**v2 (future):** Make `projectId` optional to enable cross-project views ("show all failing domains").

---

## Conventions

### Pagination

All admin list views use **limit + offset** pagination, matching the existing `parseLimitOffset()` utility in the worker (default limit: 50, max: 100).

Query parameters on GET requests:
- `?limit=50&offset=0` — pagination
- `?projectId=xxx` — required project filter
- `?status=active` — optional status filter
- `?sort=received_at&dir=desc` — sorting (default: most recent first)

All tables show: current count, total (when available), and loading skeletons during fetch.

### Mutation Payloads

Inbox message mutations (confirmed from worker source):

| Action | Method | Endpoint | Payload |
|--------|--------|----------|---------|
| Mark read/unread | PATCH | `/inbox/messages/:id` | `{ isRead: boolean }` |
| Archive/unarchive | PATCH | `/inbox/messages/:id` | `{ isArchived: boolean }` |
| Delete | DELETE | `/inbox/messages/:id` | No body (returns 204) |

At least one of `isRead` or `isArchived` is required for PATCH.

### Attachments

The webhook worker (`inboxWebhookWorker.ts`) currently stores attachment metadata (filename, MIME type, size, content ID) in a JSONB column but does **not** persist file contents — there's a TODO where the actual R2 upload should happen. However, all the infrastructure for R2 uploads already exists:

- `InhouseStorageService` has `upload()` (base64 → Buffer → R2) and `createSignedDownloadUrl()`
- `R2_STORAGE_BUCKET` (`sheenapps-user-storage`) is already configured
- Project-scoped paths and path traversal validation are built in

**Backend prerequisite (small):** Replace the TODO in `inboxWebhookWorker.ts` with an actual R2 upload via `getInhouseStorageService(projectId).upload()`. Storage path: `inbox/attachments/{messageId}/{filename}`. Store the resulting key in the `storageKey` field of the attachments JSONB. This is a few lines of code, not a new system. Note: `InhouseStorageService.validateAndNormalizePath()` already blocks path traversal and control characters, but the original filename should also be sanitized before use as the R2 key (strip path separators, normalize unicode) since email attachment filenames are untrusted input.

**Frontend behavior:**
- Show attachment list with filename, size (formatted), and MIME type badge
- For attachments with a `storageKey`: show a "Download" button that fetches a signed R2 URL via the API and opens it
- For attachments where `storageKey` is null (oversized/dropped): show filename + size only with a "File not stored" note
- Attachment download API route: `GET .../messages/:messageId/attachments/:index` → calls `storageService.createSignedDownloadUrl()` and returns the URL

### HTML Body Rendering

Per the parent plan's security section:

1. Default view shows `snippet` or `text_body` (plain text)
2. "View HTML" button renders in a sandboxed iframe:
   ```html
   <iframe
     sandbox
     referrerPolicy="no-referrer"
     loading="lazy"
     srcdoc={htmlBody}
     style={{ maxHeight: '600px' }}
   />
   ```
3. The bare `sandbox` attribute already blocks `allow-same-origin` and `allow-scripts` by default
4. **Size guard:** If `html_body` exceeds 500KB, show "HTML too large to preview" fallback instead of rendering
5. Never inject `html_body` directly into React DOM
6. This matches the existing pattern in `InhouseEmailsAdmin` which already uses sandboxed iframes for HTML preview

---

## Patterns to Follow

All new frontend work follows the established admin panel patterns:

1. **Page files**: Use `createInhouseAdminPage()` factory
2. **Components**: Client components (`'use client'`) in `components/admin/`
3. **Data fetching**: `useCallback` + `useEffect` with `AbortController` refs (matching `InhouseEmailsAdmin` and `InhouseProjectDetails` patterns)
4. **API routes**: Thin proxies using `workerFetch()` with `requireAdmin()` permission checks
5. **UI components**: Radix UI primitives (Card, Table, Badge, Dialog, Tabs, etc.) with Tailwind
6. **Notifications**: `toast` from `sonner`
7. **Date formatting**: `date-fns` (`format`, `formatDistanceToNow`)
8. **Icons**: `lucide-react`
9. **Cache busting**: Triple-layer pattern on all API routes
10. **Filter state**: Persist active tab + filters in URL query string via `useSearchParams` so bookmarks/back-button work
11. **Untrusted text**: DNS values, email headers, and other backend-sourced strings must always render as **text nodes**, never via `dangerouslySetInnerHTML` or similar. Tooltips showing "actual vs expected" DNS values use plain text. Registrar links come from the backend's hardcoded registrar detection (known URLs only).

---

## Step 1: Admin Navigation + Project Picker

### Nav Updates

**File:** `src/components/admin/nav/admin-nav-model.ts`

Add two new nav items to the In-House section, placed after "Emails" so email-related items group together:

```typescript
{ label: 'Inbox', href: '/admin/inhouse/inbox', icon: 'Inbox', permission: 'inhouse.read' },
{ label: 'Domains', href: '/admin/inhouse/domains', icon: 'Globe', permission: 'inhouse.read' },
```

### Project Picker Component

**File:** `src/components/admin/shared/ProjectPicker.tsx`

Currently every admin page uses a plain `<Input>` for typing project IDs manually. Build a reusable `ProjectPicker` that upgrades this across all pages:

- Searchable input that queries `GET /api/admin/inhouse/projects?search=...` (endpoint already exists, returns `id` + `name` + `owner_email`)
- Debounced search (300ms) with dropdown results showing project name + truncated ID
- Selecting a result sets `projectId` in URL query string and triggers data load
- When navigating from `InhouseProjectDetails` (e.g., "Manage domains" link), `projectId` is pre-filled from the URL param and auto-loads
- Falls back to manual ID paste (some admins will still want to paste from logs)

Props:
```typescript
interface ProjectPickerProps {
  value: string                    // current projectId
  onChange: (projectId: string) => void
  className?: string
}
```

This component benefits all existing admin pages too (emails, auth, storage, etc.) but is only required for the new Inbox and Domains pages initially.

---

## Step 2: Domains Admin Page (Phase 2C + 3 + 4)

**Build this first.** Domains and mailboxes are the higher-value features — custom domains are what users ask about. The inbox is secondary admin visibility.

A unified domains page with tabs covering all domain-related features.

### Files to Create

```
# Page + components
src/app/admin/inhouse/domains/page.tsx                    # Page (factory)
src/components/admin/InhouseDomainsAdmin.tsx               # Main component
src/components/admin/DnsStatusIndicator.tsx                 # Reusable DNS status dots

# Next.js API routes (proxy to admin worker endpoints via workerFetch)
src/app/api/admin/inhouse/email-domains/route.ts                        # GET list, POST add
src/app/api/admin/inhouse/email-domains/[domainId]/route.ts             # GET detail, DELETE
src/app/api/admin/inhouse/email-domains/[domainId]/verify/route.ts      # POST verify
src/app/api/admin/inhouse/email-domains/[domainId]/status/route.ts      # GET DNS status
src/app/api/admin/inhouse/email-domains/[domainId]/registrar/route.ts   # GET registrar
src/app/api/admin/inhouse/registered-domains/route.ts                   # GET list
src/app/api/admin/inhouse/registered-domains/search/route.ts            # POST search
src/app/api/admin/inhouse/registered-domains/[domainId]/route.ts        # GET detail
src/app/api/admin/inhouse/registered-domains/[domainId]/events/route.ts # GET events
src/app/api/admin/inhouse/mailboxes/route.ts                            # GET list, POST create
src/app/api/admin/inhouse/mailboxes/[mailboxId]/route.ts                # GET, PATCH, DELETE

# Worker admin endpoints (backend prerequisite)
sheenapps-claude-worker/src/routes/adminInhouseEmailDomains.ts
sheenapps-claude-worker/src/routes/adminInhouseRegisteredDomains.ts
sheenapps-claude-worker/src/routes/adminInhouseMailboxes.ts
```

### Component Structure: `InhouseDomainsAdmin`

**Top-level:** `ProjectPicker` (required) + Refresh button. All tabs are gated on a valid project being selected.

**Health summary strip** (shown once project is loaded, above tabs):
- Compact row of badges summarizing issues at a glance: "2 domains failing SPF", "1 mailbox in error", "1 domain expiring in 5 days"
- Derived from the data already fetched for each tab — no extra API call
- Clicking a badge switches to the relevant tab with the appropriate filter pre-set

**Tabs layout** (consistent filter bar layout across all tabs):

#### Tab 1: Email Domains (Phase 2C)

Custom domain verification status for the selected project.

- Filter bar: status select (all/pending/verified/failed), authority level select (all/manual/subdomain/nameservers)
- Table columns: Domain, Authority Level, Status, DNS Progress (`DnsStatusIndicator`), Verified At, Last Checked
- Click row to open detail dialog showing:
  - Full DNS status with check/cross indicators per record type
  - DNS instructions (the records the user needs to add) with `CopyButton` per record
  - Detected registrar with direct link to DNS settings
  - Cloudflare zone info (zone ID, nameservers — if applicable)
  - "Verify Now" action button
  - Failure reasons displayed prominently (not hidden in tooltips)
  - Links to activity log entries for this domain

**DNS Status Component** (`DnsStatusIndicator.tsx`):

Reusable component that renders status dots for each DNS record type:

```
SPF ● DKIM ● DMARC ○ MX ● Return-Path ●
```

Where: green `●` = verified, gray `○` = pending/optional, red `✕` = error. Each dot has a tooltip showing the actual vs expected value.

Props: `dnsStatus: { spf: DnsCheck, dkim: DnsCheck, dmarc: DnsCheck, mx: DnsCheck, returnPath: DnsCheck }`

#### Tab 2: Registered Domains (Phase 3)

Domains purchased through SheenApps via OpenSRS for the selected project.

- Filter bar: status select (all/active/expired/grace/redemption/suspended/transferred)
- Table columns: Domain, Status, Expires At, Auto-Renew, WHOIS Privacy, Created At
- Expiry color coding: green (>30d), yellow (7-30d), red (<7d), dark red (expired)
- Click row to open detail dialog showing:
  - Domain info (OpenSRS order/domain IDs, nameservers, contacts)
  - Event history timeline (from `inhouse_domain_events`) — scrollable list, newest first
  - Settings section: auto-renew toggle, WHOIS privacy toggle, lock toggle
  - Actions: Renew (with confirmation), Get Auth Code (shows in copyable field)

**Domain Search** (collapsible card above table):
- Text input for search query
- TLD checkboxes (.com, .net, .org, .io, .co, .app, .dev, .ai)
- "Search" button
- Results: availability badge, registration price, renewal price
- "Register" button per available domain (opens registration dialog)
- This is admin support tooling (verify search works, help users)

**Domain Registration Dialog:**
1. Domain name (pre-filled, read-only)
2. Contact details form (owner name, email, org, address, city, country, phone)
3. Registration period (1/2/3 years radio)
4. Options: auto-renew, WHOIS privacy, registrar lock (checkboxes)
5. "Register" button

#### Tab 3: Mailboxes (Phase 4)

Real mailboxes provisioned via OpenSRS Hosted Email for the selected project.

- Filter bar: status select (all/provisioning/active/suspended/error/pending_delete/deleted), domain select (populated from project's domains)
- Table columns: Email Address, Domain, Status, Provider, Created At
- "Enable Mailboxes" button (visible when project has domains with `mailbox_mode: 'resend'`) — triggers domain-level mailbox enablement
- Click row to open detail dialog showing:
  - Mailbox status, provider mailbox ID
  - Domain mailbox mode badge (resend/hosted/hosted_pending_mx/resend_pending_mx)
  - DNS readiness result (MX, SPF, DMARC checks — from `checkDnsReadiness` endpoint)
  - Actions: Suspend/Unsuspend, Delete (with confirmation), Reset Password, Open Webmail (SSO URL in new tab)
  - IMAP/SMTP/POP settings (collapsible section showing server, port, SSL/TLS, auth method in a compact block with a "Copy all" button for pasting into support docs or client setup guides)
  - Quota info if available

**"Create Mailbox" dialog:**
- Domain select (from project's hosted domains)
- Local part input (e.g., "support", "hello")
- Preview: `support@domain.com`
- "Create" button

---

## Step 3: Domain Wizard (Phase 2C)

Embedded in the Email Domains tab as a "Connect Domain" button that opens a multi-step dialog.

### Files to Create

```
src/components/admin/InhouseDomainWizard.tsx    # Multi-step wizard dialog
```

### Wizard Flow

```
Step 1: "Does this project have a domain?"
  ├── "No" → Shows message: "Domain registration available in Registered Domains tab"
  └── "Yes" → Step 2

Step 2: "How should we connect it?"
  ├── "Switch nameservers (recommended)" → Step 3a
  ├── "Use a subdomain (safest)" → Step 3b
  └── "Add records manually" → Step 3c

Step 3a: Nameserver Switch
  - Input: domain name
  - Action: POST to create domain (authority_level: 'nameservers')
  - Shows: preview of existing DNS records (from scanExistingDnsRecords)
  - Shows: Cloudflare nameservers to switch to (with CopyButton)
  - Shows: registrar-specific step-by-step instructions
  - DNS polling with "Check Now" button + last checked timestamp
  - On verified: auto-provisions email DNS records

Step 3b: Subdomain Delegation
  - Input: parent domain name
  - Action: POST to create domain (authority_level: 'subdomain')
  - Shows: NS records to add for mail.domain.com (with CopyButton)
  - Shows: registrar-specific instructions
  - DNS polling with "Check Now" button + last checked timestamp
  - On verified: auto-provisions email DNS records

Step 3c: Manual DNS
  - Input: domain name
  - Action: POST to create domain (authority_level: 'manual')
  - Shows: all DNS records to add (ownership TXT, SPF, DKIM, DMARC, MX, Return-Path)
  - Each record row: Type, Host, Value (with CopyButton), Status dot
  - "Copy all records" button (copies all records as formatted text for pasting into support docs or registrar bulk import)
  - "Verify" button to trigger DNS check
  - DnsStatusIndicator showing live progress

Step 4: Complete
  - Green checkmarks for all verified records
  - The custom email address that's now active
  - "Done" button closes dialog
```

### DNS Polling UX

- **"Check Now" button** always visible during polling steps
- **Last checked timestamp** shown below the button (e.g., "Last checked: 2 minutes ago")
- **Polling backoff:** 10s → 20s → 30s intervals (resets to 10s on manual "Check Now")
- **Copy:** "Most changes appear within minutes. Full propagation can take up to 48 hours."
- **Admin-specific additions:** Show raw DNS query results in a collapsible "Debug" section, link to domain activity log

### Admin vs User Mode

The wizard component accepts a `mode` prop:

- `mode: 'admin'` — shows debug info, raw DNS responses, links to logs/events, uses admin proxy routes
- `mode: 'user'` (future) — simplified copy, no debug section, uses user-facing SDK routes

For v1, only `mode: 'admin'` is implemented.

---

## Step 4: Inbox Admin Page (Phase 1)

The inbox page gives admins visibility into inbound emails received by a project.

### Files to Create

```
# Page + component
src/app/admin/inhouse/inbox/page.tsx                    # Page (factory)
src/components/admin/InhouseInboxAdmin.tsx               # Main component

# Next.js API routes (proxy to admin worker endpoints via workerFetch)
src/app/api/admin/inhouse/inbox/config/route.ts                             # GET config
src/app/api/admin/inhouse/inbox/messages/route.ts                           # GET list messages
src/app/api/admin/inhouse/inbox/messages/[messageId]/route.ts               # GET, PATCH, DELETE
src/app/api/admin/inhouse/inbox/messages/[messageId]/attachments/[index]/route.ts  # GET attachment download
src/app/api/admin/inhouse/inbox/threads/route.ts                            # GET list threads
src/app/api/admin/inhouse/inbox/threads/[threadId]/route.ts                 # GET thread + messages

# Worker admin endpoint (backend prerequisite)
sheenapps-claude-worker/src/routes/adminInhouseInbox.ts
```

### Component Structure: `InhouseInboxAdmin`

**Top-level:** `ProjectPicker` (required) + Refresh button. Shows inbox address + config summary once project is loaded.

**Below project header:** Inbox config card showing:
- Inbox address (`p_xxx@inbox.sheenapps.com`) with `CopyButton`
- Display name
- Auto-reply status (on/off + message preview)
- Forward-to email
- Retention days

**Messages tab** (default):
- Filter bar: read/unread/all select, from email search, date range
- Table columns: From, Subject/Snippet, Attachments (count badge), Read/Unread (dot), Received At
- Click row to open message detail dialog:
  - From, To, Reply-To, Subject, Date
  - Thread ID link (if threaded)
  - Text body (default view)
  - "View HTML" button (sandboxed iframe with size guard per conventions above)
  - Attachments list: filename, size, MIME type badge, "Download" button (signed R2 URL) for stored attachments
  - Raw headers (collapsible JSON view)
  - Actions: Mark read/unread, Archive, Delete
- Pagination: limit+offset, default 50

**Threads tab:**
- Filter bar: archived toggle
- Table columns: Subject, Participants (truncated), Messages, Unread, Last Message At
- Click row to show thread detail dialog with all messages listed chronologically
- Pagination: limit+offset, default 50

---

## Step 5: Project Detail - Inbox & Domain Tabs

Extend the existing `InhouseProjectDetails` component with lightweight summaries.

### Changes to `InhouseProjectDetails.tsx`

Add two new tabs to the existing Tabs component:

1. **"Inbox" tab**
   - Inbox address with `CopyButton`
   - Auto-reply on/off badge
   - Forward-to email (if set)
   - Recent messages table (last 10, condensed — from, subject, date)
   - "View all messages" link → `/admin/inhouse/inbox?projectId=xxx`

2. **"Domains" tab**
   - Email domains list with `DnsStatusIndicator` (compact)
   - Registered domains with expiry badges
   - Mailbox count summary
   - "Manage domains" link → `/admin/inhouse/domains?projectId=xxx`

### API Routes

No new API routes needed — reuses routes from Steps 2 and 4, passing `projectId` as a query parameter:
- Inbox config: `GET /api/admin/inhouse/inbox/config?projectId=xxx`
- Email domains: `GET /api/admin/inhouse/email-domains?projectId=xxx`
- Mailboxes: `GET /api/admin/inhouse/mailboxes?projectId=xxx`

---

## Implementation Order

Reordered for fastest value delivery:

1. **Backend: Admin worker endpoints** — Create `adminInhouseEmailDomains.ts`, `adminInhouseRegisteredDomains.ts`, `adminInhouseMailboxes.ts`, `adminInhouseInbox.ts` in the worker. Also wire up the R2 attachment upload TODO in `inboxWebhookWorker.ts`. This unblocks all frontend work.
2. **Step 1: Nav updates** — Add Inbox and Domains to admin nav (trivial)
3. **Step 2: Domains admin page** — Core value: domain verification, registered domains, mailboxes
4. **Step 3: Domain wizard** — Embedded in domains page, guided domain setup
5. **Step 4: Inbox admin page** — Messages and threads viewer
6. **Step 5: Project detail tabs** — Lightweight summaries linking to full pages

The backend step is a prerequisite. Steps 2-4 deliver the core domain/email management. Steps 5-6 add inbox visibility and project-level summaries.

---

## File Summary

### New Files (Pages)

| File | Purpose |
|------|---------|
| `src/app/admin/inhouse/inbox/page.tsx` | Inbox admin page |
| `src/app/admin/inhouse/domains/page.tsx` | Domains admin page |

### New Files (Components)

| File | Purpose |
|------|---------|
| `src/components/admin/shared/ProjectPicker.tsx` | Reusable searchable project selector (replaces plain ID text inputs) |
| `src/components/admin/InhouseDomainsAdmin.tsx` | Email domains + registered domains + mailboxes (3 tabs) |
| `src/components/admin/InhouseDomainWizard.tsx` | Guided domain setup wizard dialog |
| `src/components/admin/DnsStatusIndicator.tsx` | Reusable DNS status dots (SPF/DKIM/DMARC/MX/Return-Path) |
| `src/components/admin/InhouseInboxAdmin.tsx` | Inbox messages + threads viewer |

### New Files (API Routes)

All Next.js API routes proxy to **admin worker endpoints** (JWT auth) via `workerFetch()`, not to the project-scoped HMAC endpoints:

**Domain routes** (proxy to `adminInhouseEmailDomains.ts`, `adminInhouseRegisteredDomains.ts`, `adminInhouseMailboxes.ts`):

| Next.js Route | Worker Endpoint |
|------|----------------|
| `/api/admin/inhouse/email-domains?projectId=x` | `GET /v1/admin/inhouse/email-domains?projectId=x` |
| `/api/admin/inhouse/email-domains` (POST) | `POST /v1/admin/inhouse/email-domains` |
| `/api/admin/inhouse/email-domains/[domainId]` | `GET/DELETE /v1/admin/inhouse/email-domains/:domainId` |
| `/api/admin/inhouse/email-domains/[domainId]/verify` | `POST .../verify` |
| `/api/admin/inhouse/email-domains/[domainId]/status` | `GET .../status` |
| `/api/admin/inhouse/email-domains/[domainId]/registrar` | `GET .../registrar` |
| `/api/admin/inhouse/registered-domains?projectId=x` | `GET /v1/admin/inhouse/registered-domains?projectId=x` |
| `/api/admin/inhouse/registered-domains/search` | `POST /v1/admin/inhouse/registered-domains/search` |
| `/api/admin/inhouse/registered-domains/[domainId]` | `GET /v1/admin/inhouse/registered-domains/:domainId` |
| `/api/admin/inhouse/registered-domains/[domainId]/events` | `GET .../events` |
| `/api/admin/inhouse/mailboxes?projectId=x` | `GET /v1/admin/inhouse/mailboxes?projectId=x` |
| `/api/admin/inhouse/mailboxes` (POST) | `POST /v1/admin/inhouse/mailboxes` |
| `/api/admin/inhouse/mailboxes/[mailboxId]` | `GET/PATCH/DELETE /v1/admin/inhouse/mailboxes/:mailboxId` |

**Inbox routes** (proxy to `adminInhouseInbox.ts`):

| Next.js Route | Worker Endpoint |
|------|----------------|
| `/api/admin/inhouse/inbox/config?projectId=x` | `GET /v1/admin/inhouse/inbox/config?projectId=x` |
| `/api/admin/inhouse/inbox/messages?projectId=x` | `GET /v1/admin/inhouse/inbox/messages?projectId=x` |
| `/api/admin/inhouse/inbox/messages/[messageId]` | `GET/PATCH/DELETE /v1/admin/inhouse/inbox/messages/:messageId` |
| `/api/admin/inhouse/inbox/threads?projectId=x` | `GET /v1/admin/inhouse/inbox/threads?projectId=x` |
| `/api/admin/inhouse/inbox/threads/[threadId]` | `GET /v1/admin/inhouse/inbox/threads/:threadId` |
| `/api/admin/inhouse/inbox/messages/[messageId]/attachments/[index]` | `GET` → signed R2 download URL via `InhouseStorageService` |

### Modified Files

| File | Change |
|------|--------|
| `src/components/admin/nav/admin-nav-model.ts` | Add Inbox and Domains nav items after Emails |
| `src/components/admin/InhouseProjectDetails.tsx` | Add Inbox and Domains tabs (lightweight summaries) |

---

## Implementation Progress

### Completed

| Step | Status | Notes |
|------|--------|-------|
| Backend: Admin worker endpoints | Done | Created 4 route files in worker, registered in server.ts |
| Step 1: Nav + ProjectPicker | Done | Nav items added, ProjectPicker with debounced search created |
| Step 2: Domains admin page | Done | InhouseDomainsAdmin.tsx with 3 tabs, DnsStatusIndicator, detail dialogs |
| Step 3: Domain wizard | Done | InhouseDomainWizard.tsx with multi-step flow, DNS polling, debug section |
| Step 4: Inbox admin page | Done | InhouseInboxAdmin.tsx with messages/threads tabs, HTML sandbox, attachments |
| Step 5: Project detail tabs | Done | Inbox + Domains tabs added to InhouseProjectDetails.tsx |
| Next.js API proxy routes | Done | ~25+ route files proxying to admin worker endpoints |
| Registered Domain Detail Dialog | Done | Clickable rows, info grid, nameservers, contacts, settings toggles (auto-renew/WHOIS/lock), event history timeline, Renew + Get Auth Code actions |
| Domain Search UI | Done | Collapsible card with text input, TLD checkboxes, search results with availability badges, pricing display, "Register (Coming Soon)" disabled button |
| Create Mailbox Dialog | Done | Domain select, local part input, email preview, password, display name (optional), quota (optional) |
| Enable Mailboxes Button | Done | Dropdown in Email Domains tab header for resend-mode domains |
| Mailbox Detail Enhancements | Done | DNS readiness section, Suspend/Unsuspend, Reset Password, Open Webmail (SSO), Delete with confirmation |
| Health Summary Filter Pre-setting | Done | Badge clicks set status filter (error/verifying) when switching tabs |

### Implementation Notes

- **ProjectPicker**: Built with plain Input + dropdown div (no Command/Popover components available). Debounced 300ms search, blur-to-commit.
- **DnsStatusIndicator**: Supports compact mode (`X/Y verified` count) and full mode (color dots with tooltips per record type).
- **Domain Wizard**: 5-step flow (has-domain → connection-method → nameserver/subdomain/manual → complete). DNS polling with 10s→20s→30s backoff. Admin debug section shows raw API response JSON. Provisioning triggers happen after verification.
- **Inbox Admin**: Sandboxed iframe for HTML preview with 500KB size guard. Attachment download via signed R2 URLs. Pagination (limit+offset, 50 per page). Raw headers collapsible via `<details>`.
- **No Command/Popover UI components**: ProjectPicker uses a simple input + absolute-positioned div dropdown pattern instead.
- **CopyButton**: Existing shared component used throughout for DNS records, inbox address, client config.
- **All API proxy routes** use the triple-layer cache busting pattern (dynamic, revalidate, fetchCache) + requireAdmin permission checks.
- **Registered Domain Detail Dialog**: Fetches full domain data + events in parallel on open. Settings toggles call PATCH `.../settings`. Event history is scrollable, newest first. Auth code copies to clipboard automatically.
- **Domain Search**: Collapsible card above registered domains table. Fetches pricing data on first expand. Register button disabled with "Coming Soon" (no register endpoint yet).
- **Create Mailbox Dialog**: Shows email preview (`localpart@domain`) as user types. Validates password min 8 chars. Optional display name and quota fields.
- **Enable Mailboxes**: Uses a Select dropdown to pick which resend-mode domain to enable (supports multiple domains).
- **Mailbox Detail**: DNS readiness shows status dots per record type. All action buttons show loading spinners and disable during operations. Delete requires window.confirm. Webmail opens in new tab with noopener/noreferrer.
- **Health Badges**: Clicking "X domains in error" sets emailDomainStatus to 'error'. Clicking "X pending verification" sets to 'verifying'. Clicking "X mailboxes in error" sets mailboxStatus to 'error'.

### Potential Improvements (Future)

- **Domain registration UI**: The "Register" button in domain search is disabled with "Coming Soon" — no register endpoint exists yet. When the endpoint is added, enable the button and add a registration dialog (contact details, period, options).
- **Cross-project views**: Currently all endpoints require projectId. Making it optional would enable "show all failing domains across all projects" views.
- **ProjectPicker upgrade**: Could benefit from Command/Popover components if they're added to the UI library later.
