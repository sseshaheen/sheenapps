# SheenApps — Dev Guide (Concise)

## Project snapshot
- Next.js 16 (App Router, Turbopack default) marketing site + AI builder
- 9 locales: `en, ar-eg, ar-sa, ar-ae, ar, fr, fr-ma, es, de`
- SSR translations + next-intl routing
- Supabase Auth + **RLS-first** database access (no service role key required in prod)

---

## Golden rules (read these before touching anything)
1. **i18n is structural**: all 9 locale message files must share the same shape.
2. **Navigation must be locale-aware**: use `@/i18n/routing` for navigation hooks/components.
3. **RLS-first DB**: web/user paths use `makeUserCtx()` (authenticated client). Don't re-introduce service key dependency.
4. **No manual Supabase cookie hacks**: do not touch `sb-*-auth-token` cookies yourself.
5. **Cache bugs are real**: if data must be fresh, use the triple-layer no-cache pattern (route + headers + client busting).
6. **Worker calls must use dual-signature headers**: always use `createWorkerAuthHeaders()`.
7. **Never import server-only modules into client code** (or anything client-reachable).
8. **Projects table uses `owner_id`, not `user_id`**: Always use `.eq('owner_id', user.id)` when querying projects. This is the #1 cause of "Project not found" 404 errors.

---

## Commands
```bash
npm run dev:safe   # recommended (clears/cache + reduces HMR weirdness)
npm run dev
npm run check      # lint + type-check + build (run before PR)
npm run test       # vitest


⸻

Internationalization (Next.js 15+)

Server page params (Next.js 15+ pattern)

params is a Promise and must be awaited:

export default async function Page({
  params,
}: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  // load messages by locale; notFound() on missing
}

Adding translations
	•	Add keys to all 9 locale files
	•	Update component prop/types
	•	Map required strings in the server page and pass down

next-intl hooks: client-only

Any file using useTranslations, useLocale, etc. must start with:

'use client'

Symptoms of getting this wrong: “No intl context found”, and sometimes static assets returning 500 due to runtime crashes.

⸻

Navigation imports (critical)

✅ Use i18n-aware navigation for routing

import { useRouter, usePathname, Link, redirect } from '@/i18n/routing'
import { ROUTES } from '@/i18n/routes'
import { useNavigationHelpers } from '@/utils/navigation'

✅ Use next/navigation only for data hooks (no i18n equivalent)

import { useParams, useSearchParams } from 'next/navigation'

✅ Server functions in server components/routes

import { notFound, redirect } from 'next/navigation'

❌ Avoid

import Link from 'next/link'
import { useRouter } from 'next/navigation'

Those bypass locale handling and spawn brittle "parse pathname" hacks.

**Double-locale bug (critical)**: When using `@/i18n/routing`, do NOT include locale prefix - the router adds it automatically.

```typescript
// ❌ Results in /en/en/dashboard
router.push(`/${locale}/dashboard`)

// ✅ Correct - router auto-prefixes locale
router.push('/dashboard')
```

Same applies to `<Link href>` from `@/i18n/routing`. Native `<a>` tags and `next/link` DO need the full path.

⸻

Supabase architecture (RLS-first, expert-validated Aug 2025)

What this means
	•	App runs without SUPABASE_SERVICE_ROLE_KEY in production (by design)
	•	Database security is enforced by RLS + FORCE RLS
	•	Web/user flows: authenticated client + RLS visibility = authorization

Context factories

import { makeUserCtx, makeAdminCtx } from '@/lib/db'

// default for user-facing operations
const userCtx = await makeUserCtx()

// admin ctx: system/worker/migrations only (bypasses RLS)
const adminCtx = makeAdminCtx()

Rule: never use makeAdminCtx() in user-facing web routes.

Module boundaries (don’t mix these up)
	•	src/lib/supabase-mw.ts → Edge middleware client (pure getAll/setAll)
	•	src/lib/supabase-server.ts → Node/server auth operations
	•	src/lib/supabase-client.ts → browser-safe client

Repository pattern

All DB access should go through repositories (src/lib/server/repositories/*) using the DbCtx pattern. New code should prefer explicit ctx; existing calls may rely on the dual-signature compatibility shim.

RLS do / don’t

DO
	•	Fetch data; if it returns null due to RLS, treat as “not found/forbidden”
	•	Use makeUserCtx() for user web paths
	•	Keep authorization logic centralized in repos/services

DON’T
	•	Add manual owner checks on top of RLS (it drifts and breaks over time)
	•	Reintroduce service client in normal web routes
	•	Manually manage auth cookies

⸻

Middleware cookie trap (critical)

Do not copy cookies between multiple responses via getAll() → set() loops: it drops cookie attributes and causes "logout after refresh".
Preferred: run i18n middleware first, then keep a single NextResponse object through the pipeline.

⸻

Proxy & config hygiene (Jan 2026 learnings)

**One source of truth for redirects**: Don't put the same redirect in `next.config.ts` AND `proxy.ts`. Config-level runs first and shadows smarter logic.

**Matcher defines what runs**: If proxy matcher excludes `/api/`, don't write API handling code in proxy—it's dead code that looks like protection but isn't.

**Environment-aware security**: CSP, CORS, and debug settings must check `NODE_ENV`. Never ship `localhost` or `unsafe-*` directives to production.

**Static imports for bundlers**: Template-literal dynamic imports (`import(\`./\${var}\`)`) break Turbopack. Use generated static import maps.

**Verify expert advice against actual code**: External reviewers may be unaware of framework-specific changes (e.g., Next.js 16 renamed `middleware.ts` → `proxy.ts`; Next.js 15 made `params` a Promise). Always verify claims against docs and your codebase.

⸻

API caching: the triple-layer “no stale data” pattern

Use this for endpoints where freshness matters (dashboard, build status, etc.)

1) Route config

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

2) Response headers
Use helpers:

import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers'
return noCacheResponse(data)

3) Client cache-busting
Add a timestamp param and use React Query (not ad-hoc useEffect fetches):

queryKey: ['workspace-project', projectId]
queryFn: () => fetch(`/api/projects/${projectId}?_t=${Date.now()}`, { cache: 'no-store' })
staleTime: 0
gcTime: 0


⸻

Worker API auth (Aug 2025 critical learnings)

Dual signature rollout

Always use:

import { createWorkerAuthHeaders } from '@/utils/worker-auth'
const headers = {
  ...createWorkerAuthHeaders('GET', pathWithQuery, body),
  'x-sheen-locale': locale,
}

Never generate a single signature manually (causes 403 INVALID_SIGNATURE during dual mode).

Claims vs query params

User context belongs in claims headers, not URL params.
	•	✅ clean path + x-sheen-claims header
	•	❌ ?user_id=... + redundant headers

⸻

Admin API routes (Jan 2026 learnings)

**Pages ≠ API security**: Checking permissions in page components doesn't protect API routes. Always enforce permissions at the API layer.

```typescript
// Use requireAdmin() helper - enforces auth + permission
import { requireAdmin } from '@/lib/admin/require-admin'

export async function POST(request: NextRequest) {
  const { session, error } = await requireAdmin('feature_flags.write')
  if (error) return error
  // ... proceed with authorized request
}
```

**Centralize worker proxy**: Use `workerFetch()` helpers instead of repeating fetch logic.

```typescript
import { proxyGet, proxyPost, proxyPut, proxyDelete } from '@/lib/admin/worker-proxy'

// Instead of 30 lines of fetch + error handling:
return proxyGet('/v1/admin/feature-flags')
return proxyPost('/v1/admin/feature-flags', body, 201)
```

**No NEXT_PUBLIC_* on server**: Server routes must not fall back to public env vars.

```typescript
// ❌ Wrong - blurs client/server config
const URL = process.env.WORKER_BASE_URL || process.env.NEXT_PUBLIC_WORKER_BASE_URL

// ✅ Correct
const URL = process.env.WORKER_BASE_URL ?? 'http://localhost:8081'
```

**Cookie auth = no client headers**: Browser sends httpOnly cookies automatically. Don't manually attach auth headers in client components when fetching Next.js API routes.

**Permissions already in session**: `AdminAuthService.getAdminSession()` returns `permissions[]`. Check locally instead of multiple async calls.

⸻

API route security patterns (Jan 2026 learnings)

**Validate route params everywhere**: When adding validation (e.g., `parseUuid(id, 'projectId')`), audit ALL similar routes. Gaps create inconsistent behavior and harder debugging.

**Single source of truth for identity**: Don't pass userId in both HMAC headers AND request body. Pick one (HMAC signature via `requireSignedActor` middleware). Redundant identity = confusion + bugs.

**Allowlist file types carefully**: SVG = images with script execution. Remove from upload allowlists unless you sanitize server-side.

**Normalize before validating**: Base64 with whitespace breaks size calculations. Always `input.replace(/\s+/g, '')` before measuring or decoding.

**Decode to verify, don't just regex**: `Buffer.from(b64, 'base64')` catches invalid base64 that regex patterns miss. Use real decoded size, not estimates.

**Defense in depth ≠ redundant data**: Multiple validation layers (Next.js + worker both check ownership) = good. Passing the same data multiple ways (userId in headers + body) = bad.

**Reject empty mutations**: PATCH/PUT with `{}` body = confusing no-op. Use Zod `.refine()` to require at least one field.

**`instanceof Error` is brittle**: Custom errors or plain objects with `status` won't match. Use a type guard: `typeof (err as any)?.status === 'number'`.

**Filename allowlist prevents path traversal**: Regex like `/^[a-zA-Z0-9._-]+$/` blocks `../`, `/`, and other dangerous patterns.

**Normalize user input before validation**: Domain names need lowercase + protocol stripping before format check. Base64 needs whitespace removal before size calculation.

**Every proxy route with a userId param is an IDOR until proven otherwise**: If a Next.js API route accepts `userId` (URL segment, query param, or body) and forwards it to the worker, it MUST verify the session user matches. No exceptions. The pattern:
```typescript
const supabase = await createServerSupabaseClientNew()
const { data: { user }, error: authError } = await supabase.auth.getUser()
if (authError || !user) return noCacheErrorResponse('Authentication required', 401)
if (user.id !== userId) {
  const { error } = await requireAdmin('billing.read')
  if (error) return error
}
```
Without this, any authenticated user can fetch/mutate data for any other user by changing the userId in the URL. This applies to billing, integrations, and any user-scoped proxy route. When adding a new proxy route, add session auth FIRST.

⸻

Build & SSG optimization (Jan 2026 learnings)

**Locale multiplication is the killer**: 9 locales × 500 slugs = 4500 SSG pages. Always limit `generateStaticParams` and use ISR.

```typescript
// Limit pre-rendered pages, let ISR handle the rest
export const revalidate = 3600  // regenerate hourly

export async function generateStaticParams() {
  const slugs = await client.fetch(`*[_type == "page"][0...20] { "slug": slug.current }`)
  return slugs.map(item => ({ slug: item.slug }))
}
```

**`force-dynamic` in layout propagates**: One layout file prevents SSG for all child routes.

```typescript
// src/app/[locale]/admin/layout.tsx - prevents 45 SSG pages
export const dynamic = 'force-dynamic'
export const revalidate = 0
```

**`ssr: false` only works in Client Components**: Server Components (async functions) cannot use this option with `next/dynamic`. Remove it; code splitting still works.

```typescript
// ❌ Fails in Server Component
const Component = dynamic(() => import('./Component'), { ssr: false })

// ✅ Works in Server Component
const Component = dynamic(() => import('./Component'))
```

**Canonical URLs need encoding**: Arabic slugs must stay URI-encoded. Use the raw param, not decoded.

```typescript
const { slug: rawSlug } = await params
const slug = decodeURIComponent(rawSlug)  // for display/query
// canonical uses rawSlug (encoded), not slug (decoded)
alternates: { canonical: `/${locale}/solutions/${rawSlug}` }
```

**`.vercelignore` has limits**: Only reduces upload size, doesn't shrink `.next` cache. Useful for docs/, tests/, but don't expect major build time wins.

**Check build, not just types**: `tsc --noEmit` passes but `next build` can fail on runtime constraints (like `ssr: false` in Server Components).

**Sentry overrides your config**: `withSentryConfig` forces `productionBrowserSourceMaps: true` and `devtool: 'hidden-source-map'` even when you disable them. Use `sourcemaps.disable: true` in Sentry options + post-composition webpack override.

**`npm ci` is slower than `npm install` on Vercel**: Vercel's build cache includes `node_modules`. `npm install` reuses it; `npm ci` deletes and reinstalls from scratch.

**Route count compounds build costs**: Every API route = separate serverless function = separate compilation, tracing, and deploy step. Consolidate thin proxy routes into catch-alls (see `api/admin/[...path]` pattern).

**Converge on `requireAdmin()` + `workerFetch()`**: Three auth patterns exist for admin routes. Pattern A (`requireAdmin` + `workerFetch`) is cleanest — single-call auth, correlation IDs, consistent errors. Retire `adminApiClient` over time.

⸻

Builder + product concepts that must not drift

Build status vs Version (CRITICAL)
	•	Build Status (buildStatus, currentBuildId) = latest build attempt (can fail)
	•	Version (currentVersionId, currentVersionName) = last successful build only
	•	Failed builds do not create versions
	•	UI must show version + build attempt as separate indicators (never “version failed”)

Clean build events & recommendations

Key pieces:
	•	Events API: /api/builds/[buildId]/events
	•	Hook: src/hooks/use-clean-build-events.ts
	•	Recommendations: /api/projects/[id]/recommendations
	•	Trigger worker update on recommendation selection

Build UI architecture (Jan 2026 learnings)
	•	**One card per build, updated in place** - NOT 200 micro-messages flooding the timeline
	•	**BuildRun is derived state** - virtual UI concept computed from events, NOT stored in chat DB
	•	**Single source of truth** - `useCleanBuildEvents` is the singleton; consumers don't re-dedup
	•	**Events ordered only inside the card** - timeline shows card at anchor point, events sorted within

⸻

UI & performance guardrails

Motion
	•	Never import from framer-motion directly
	•	Only use @/components/ui/motion-provider (LazyMotion setup)

Theme consistency

Use semantic tokens, not literal colors:
	•	✅ bg-background, text-foreground, text-muted-foreground, bg-card, border-border
	•	❌ hardcoded grays/hex

Dark mode

next-themes + CSS variables fallback for components where Tailwind dark: isn't compiling reliably.
Hardcoded Tailwind color utilities (`bg-green-100 text-green-800`) are invisible in dark mode — always pair with `dark:` variants or use semantic badge variants.

Mobile preview panels

Mount panels always; toggle visibility only:
	•	✅ visibility: hidden/visible
	•	❌ conditional rendering that breaks refs: {isActive && <Panel />}

Large content / code viewer (Jan 2025 learnings)

Architecture
	•	Rendering must scale with viewport, not file size → virtualize (react-window)
	•	Never syntax-highlight during streaming → plain text, then idle callback
	•	Pre-compute line indexes (`lineStarts` array) → O(log n) offset→line, not O(n) splits

React effect patterns
	•	Trailing debounce: clear timeout on reschedule, not on every effect cleanup (cleanup runs before each effect, canceling timers prematurely)
	•	Prefer `useDeferredValue` over custom debounce for expensive computations

Accessibility
	•	Nested interactives are bugs: no `<button>` inside `<button>` or `<span role="button">` inside `<button>`
	•	Use `role="tab"` + `aria-selected` for tab-like UI, not nested buttons
	•	Tab rows must be scrollable for i18n: `overflow-x-auto` + `whitespace-nowrap` + `w-max min-w-full` — Arabic translations are longer and 5+ tabs will wrap/break layout

Code hygiene
	•	Dead state is a UX trap: if a button/feature does nothing, remove it or implement it
	•	Magic number math drifts: `sizes[0] * 4` breaks when viewport changes; measure actual dimensions
	•	Clearing content breaks downstream features: closed tabs can't be zipped; filter or cache instead

Performance
	•	**Don't scatter context subscriptions**: Calling translation hooks or heavy contexts in every row/item multiplies rerenders. Pull once at the parent, pass down as props.
	•	**Debug logs inside hot paths are performance bugs**: Console logging inside render/useMemo/useEffect during rapid streaming creates noise, slows UI, and can explode under React Strict Mode. Use gated debug logging or remove entirely.

Interactive elements (Jan 2026 learnings)
	•	**Disabled without feedback = "broken"**: Buttons that are `disabled` without clear visual indication (grayed out, tooltip) feel broken to users. If an action isn't available, explain why.
	•	**`console.log` is not UX**: Click handlers that only log to console ship invisible features. If a button exists, it needs visible behavior (modal, toast, navigation).
	•	**Test clicks, not just hover**: Visual hover feedback (`:hover` styles) doesn't guarantee `onClick` works. Always verify the full interaction.
	•	**Apply fixes to all similar components**: When fixing one integration/feature (e.g., Supabase modal), immediately apply the same pattern to siblings (Vercel, Sanity). Don't leave TODOs.
	•	**Feature flags can ship incomplete UX**: A flag-protected component replacing another must have feature parity. `IntegrationStatusBar` replaced `SupabaseDatabaseButton` but lacked its modal—users saw buttons that did nothing.
	•	**Modal integrations must always be clickable**: Connected integrations that open modals should never be `disabled` just because they have no "actions" array.

UI stability (Jan 2026 learnings)
	•	**Cache timestamps that determine position**: If a card's position depends on `createdAt`, cache the first-seen value per ID—prevents "jumping" when real data arrives later.
	•	**Scroll restoration needs both values**: Store `previousScrollHeight` AND `previousScrollTop` before loading older content, then restore `scrollTop = previousScrollTop + scrollDiff`.

Mobile infinite scroll (Jan 2026 learnings)
	•	**IntersectionObserver root must be scroll container**: Default root is viewport. For `overflow-y-auto` containers, set `root: scrollContainerRef.current` or observer won't fire reliably on mobile.
	•	**Avoid double-smoothing**: CSS `scroll-smooth` + JS `behavior: 'smooth'` = laggy on iOS. Use `behavior: 'auto'` for instant jump (`'instant'` is not in spec).
	•	**Scroll UX needs user intent detection**: Auto-scroll only when user is near-bottom (or during streaming). Otherwise you fight the user and create jank. Never force-scroll when user has deliberately scrolled up.
	•	**Near-bottom threshold ~200px**: 100px can mis-detect with tall bubbles. 200-300px is safer for chat UIs.
	•	**Responsive padding**: `p-2 sm:p-4` saves precious mobile space when headers are visible.
	•	**One layer owns safe-area**: Don't apply `safe-area-inset-bottom` to both outer container AND composer wrapper—pick one (usually composer).

Resizable panels (Jan 2026 learnings)
	•	**Percentage-based panel libraries are fragile**: Libraries like `react-resizable-panels` can't reliably enforce pixel minimums. A simple flexbox + custom drag handler (50 lines) often gives more control with less code.
	•	**`min-w-0` on flex children allows shrinking below content**: This class is often the culprit when panels collapse to slivers. Remove it or use `flex-shrink-0` for fixed-width panels.
	•	**Inner wrapper `minWidth` doesn't help if parent clips**: Setting `minWidth` on a child inside a flex item with `min-w-0` causes overflow/clipping, not expansion.
	•	**`dir="ltr"` doesn't fix mouse deltas in RTL**: Mouse coordinates are absolute. Detect `document.documentElement.dir === 'rtl'` and invert drag deltas for natural resize behavior in RTL.
	•	**When fighting a library, consider replacing it**: After 3+ failed attempts to make a library respect constraints, a custom implementation usually wins.

⸻

React hooks patterns (Jan 2026 learnings)

**Never pass undefined to `useCallback`**: It's not type-safe. Use ref + useEffect pattern instead:
```typescript
// ❌ useCallback can't handle undefined
const memoized = useCallback(callback, deps) // callback might be undefined

// ✅ Ref pattern for optional callbacks
const callbackRef = useRef(callback)
useEffect(() => { callbackRef.current = callback })
useEffect(() => {
  if (!callback) return
  const throttled = throttle((...args) => callbackRef.current?.(...args), delay)
  // ...
}, [callback !== undefined, delay])
```

**Browser-safe timeout typing**: Use `ReturnType<typeof setTimeout>` not `NodeJS.Timeout` in client code.

**Per-item state beats global booleans**: For delete/loading spinners on lists:
```typescript
// ❌ All items show spinner
const [isDeleting, setIsDeleting] = useState(false)

// ✅ Only affected item shows spinner
const [deletingId, setDeletingId] = useState<string | null>(null)
```

**Ref pattern for callbacks in effects**: Prevents stale closures:
```typescript
const markAllAsReadRef = useRef(markAllAsRead)
useEffect(() => { markAllAsReadRef.current = markAllAsRead }, [markAllAsRead])
useEffect(() => {
  if (shouldMark) markAllAsReadRef.current() // Always latest function
}, [shouldMark])
```

**Gate hooks on auth**: Don't call data-fetching hooks with empty userId before auth resolves:
```typescript
const canFetch = !!user?.id && !!projectId && enabled
const { data } = useSomeHook(canFetch ? id : null, user?.id ?? '', projectId)
```

**Memoization is a contract, not a vibe**: Stabilize callbacks with refs when wiring event managers to prevent re-subscribe loops:
```typescript
// ✅ Stable ref prevents dependency churn
const handleEvent = useRef((payload) => {
  handleEventImplRef.current(payload)
}).current

manager.subscribe({ onEvent: handleEvent })  // Never changes identity
```

**Derive boolean flags from source data**: Don't use global booleans that can lie when states overlap
```typescript
// ❌ Global boolean lies when multiple messages typing
const [isTyping, setIsTyping] = useState(false)

// ✅ Derive from source—always truthful
const isTyping = useMemo(() => messages.some(m => m.isTyping), [messages])
```

**sessionStorage > refs for "shown once" guards**: Survives unmount/tab sleep
```typescript
// ❌ Resets on unmount, shows again after tab sleep
const shownRef = useRef(false)

// ✅ Persists across remounts
const hasShown = () => sessionStorage.getItem('shown:id') === '1'
```

**Don't fetch the same data twice**: Parent + child both polling = double bandwidth
- Pick one owner (usually child component that displays it)
- Parent derives lightweight state from status props

**Only poll when status indicates activity**: Stop polling completed/failed states
```typescript
const shouldPoll = status === 'queued' || status === 'building'
useDataHook(id, { autoPolling: shouldPoll })
```

**Upsert pattern for single-item display**: Filter old, append new
```typescript
setItems(prev => [...prev.filter(i => i.type !== 'progress'), newProgress])
```

**Early return with friendly message beats silent failure**: Guard components at entry
```typescript
if (!user?.id) return <div>Sign in to continue</div>
// Now user.id is guaranteed non-null below
```

⸻

SSE & Real-Time Patterns (Jan 2026 learnings)

**One live stream per tab (or browser), period**: Mounting SSE twice—even indirectly via "helpful" hooks—creates reconnect storms, duplicate events, and phantom UI states. Enforce single SSE source of truth.

**Correlation IDs are sacred**: `client_msg_id` isn't a nice-to-have—it's the spine that lets POST, optimistic UI, SSE confirmations, and retries reconcile into one coherent reality. Always generate on client, preserve through entire lifecycle.

**UI IDs ≠ Idempotency keys**: These are different species with different requirements
```typescript
// ✅ UI message IDs: deterministic, monotonic, project-scoped (for React rendering)
const uiId = `${prefix}:${projectId}:${Date.now()}:${seq++}`

// ✅ Idempotency keys: unique per operation, stable across retries (for API correlation)
const clientMsgId = crypto.randomUUID() // Generate once, reuse on retry

// ❌ Don't conflate: using crypto.randomUUID() for UI IDs causes duplicate renders
// ❌ Don't conflate: using deterministic IDs for idempotency breaks retry logic
```

**Adapters must forward idempotency keys**: If you accept `clientMsgId` in a signature, you MUST forward it through the call chain
```typescript
// ❌ Drops clientMsgId - breaks POST↔SSE correlation
async function adapter(text, target, msgType, buildNow, clientMsgId) {
  await parent(text, 'build') // Lost clientMsgId!
}

// ✅ Forwards clientMsgId - enables proper idempotency
async function adapter(text, target, msgType, buildNow, clientMsgId) {
  await parent(text, 'build', { clientMsgId }) // Preserved
}
```

**Deterministic IDs need collision prevention**: Content hashing alone isn't enough when timestamps might be missing
```typescript
// ❌ Collides when ts=0 and content identical
const id = `${role}:${ts}:${hash(content)}`

// ✅ Include sequence/index to guarantee uniqueness
const id = `${role}:${ts}:${hash(content)}:${index}`
```

**E2E-gated deterministic selection**: Random selection causes flaky tests
```typescript
// ✅ Deterministic in E2E, varied in production
function pickDeterministic<T>(arr: T[]): T {
  if (process.env.NEXT_PUBLIC_TEST_E2E === '1') return arr[0]
  return arr[Math.floor(Math.random() * arr.length)]
}
```

**Backend owns ordering; frontend dedupes**: Treat `seq` as server-authoritative. Never invent client seqs. Handle out-of-order SSE with a reorder window (10-seq buffer) + dedupe store (lastSeq + LRU for safety).

**Avoid "fallbacks" that secretly spin up infrastructure**: Any fallback that internally calls `usePersistentChat` / `usePersistentLive` is a trap. Require dependencies like `sendMessage` explicitly so you can't accidentally create parallel stacks.

**Idempotent leadership is critical**: Never allow re-entrant state transitions
```typescript
// ✅ Hard guard prevents self-demotion
private async acquireLeadership() {
  if (this.isLeader) return // Already leader, skip
  // ... acquisition logic
  if (!lock) {
    if (this.isLeader) return // Safety net: became leader in meantime
    this.becomeFollower()
  }
}
```

**BroadcastChannel delivers to sender**: Always filter self-messages
```typescript
case 'leader-heartbeat':
  if (this.isLeader) return // Leaders don't process their own heartbeats
  if (hb.leaderTabId === this.tabId) return // Extra safety
  this.resetLeaderTimeout()
```

**Close resources on state change**: Followers must close EventSource immediately
```typescript
private becomeFollower() {
  if (this.eventSource) {
    this.eventSource.close() // Close before demotion
    this.eventSource = null
  }
  this.isLeader = false
}
```

**Singleton + async + deletion = zombies**: Never delete singleton instances while async ops run
- Disconnect clears state, but instance stays in map for reuse
- Prevents "zombie leader with 0 subscribers" while new instance becomes follower

**Web Locks API quirk**: Calling `navigator.locks.request(name, {ifAvailable: true})` while you already hold the lock returns `null` (looks like "unavailable" but means "you have it")

⸻

Optimistic UI & State Management (Jan 2026 learnings)

**Optimistic UI must be removable and idempotent**: Add optimistic messages immediately, but always remove them on success/failure. Dedupe by both `id` and `client_msg_id`. Never let optimistic state linger indefinitely.

**State machines beat booleans**: `isApplying / isSelected / hasError` gets ambiguous fast. A small explicit lifecycle (`sending → sent → confirmed → assistant_received → build_tracking → done/error`) prevents UI lies and makes debugging trivial.

**Persist only what's truly durable**: Persist build/action state with TTL cleanup. Rebuild derived indexes (like `recommendationIndex`) on rehydrate—don't persist computed state. Persisting everything = stale ghosts that haunt you in production.

⸻

RTL (expert-validated)

Prefer CSS logical properties + rtl:/ltr: variants over JS RTL utilities.
	•	Use start/end, ms/me, ps/pe
	•	For mixed-direction text, prefer <bdi> / unicode-bidi: plaintext patterns
	•	Test RTL in Safari + Chromium

⸻

Layout & scrolling (don’t summon the height demons)
	•	One layout system per height chain (prefer flex for vertical fill)
	•	No fragments in height chains
	•	One scroller pattern:

<div className="h-full flex flex-col">
  <Header className="flex-shrink-0" />
  <Main className="flex-1 overflow-y-auto" />
  <Footer className="flex-shrink-0" />
</div>

	•	Avoid nested overflow-y-auto stacks unless you enjoy debugging.

⸻

Common pitfalls checklist
	•	Missing translations in any locale
	•	next-intl hooks without 'use client'
	•	Importing server-only modules into client-reachable code (including "debug" files that pull fs)
	•	Using next/link or next/navigation router hooks for locale navigation
	•	Hardcoded locale paths like `/ar/contact` instead of `/${locale}/contact`
	•	Double-locale in `router.push()` or `<Link>` from `@/i18n/routing` (see Navigation section)
	•	API responses cached by browser disk cache (use triple-layer pattern)
	•	Worker calls missing dual-signature headers or misusing claims
	•	Unlimited `generateStaticParams` causing SSG explosion (limit + ISR)
	•	Using `{ ssr: false }` with `next/dynamic` in Server Components
	•	`btoa()` with Arabic/Unicode text - use `btoa(unescape(encodeURIComponent(str)))` instead
	•	Multiple lockfiles causing wrong workspace root - set `outputFileTracingRoot: __dirname` in next.config.ts
	•	Accessing `.filter()` on potentially undefined arrays - use `(arr ?? []).filter()` defensively
	•	`window.open()` without `noopener,noreferrer` - security risk
	•	Icon-only buttons missing `aria-label` - accessibility violation
	•	`<Label htmlFor="x">` without matching `id="x"` on input/trigger - label not linked
	•	Hardcoded English in UI (phase labels, status text) - breaks RTL users
	•	Unused imports left in code - signals drifting architecture
	•	`console.log` left in production code - remove before shipping
	•	Deduplicating at consumers instead of source - dedup once in singleton hook
	•	`window.confirm()` in production UI - use a reusable `ConfirmDialog` component instead
	•	Mutation payloads typed as `Record<string, string>` or `{}` - type them to match what the backend validates, or broken flows stay hidden
	•	Multiple API calls for a single view when an aggregate endpoint would do - but verify actual network requests first; React Query deduplicates hooks sharing the same query key, and localStorage hooks aren't API calls
	•	Aggregate endpoints still need targeted fetchers alongside them - mutations and filter changes should refresh only what changed, not re-fetch everything
	•	Lifting a hook to a parent component often beats creating a new aggregate endpoint - if the "duplicate" is just unclear data flow, fix the architecture not the API
	•	Not everything can move to the worker - JS module imports (e.g. threshold functions) and Supabase RLS queries must stay in the proxy
	•	Implementing code review suggestions without verifying claims against actual code - reviewers can reference code that doesn't exist
	•	Proxy routes with userId params missing session auth check - every such route is an IDOR vulnerability; verify `user.id === userId` or admin permission before forwarding
	•	Duplicate redirects in `next.config.ts` and `proxy.ts` - config runs first, proxy version is dead code
	•	Code in proxy.ts that handles paths excluded by matcher - check matcher regex before writing handlers
	•	CSP with `'unsafe-eval'`, `'unsafe-inline'`, or `localhost` in production - use `process.env.NODE_ENV` to vary

⸻

Easy Mode SDK Rules

For Easy Mode (in-house) projects, generated code must use @sheenapps/* SDKs for all platform features.

Authentication (@sheenapps/auth)
- ALWAYS use @sheenapps/auth for auth operations, NEVER roll custom
- Use sheen_sk_* keys in server actions/API routes only
- Store session token in httpOnly cookie (use next/headers)
- Pattern: auth.signIn() → set cookie → redirect to dashboard

Database (@sheenapps/db)
- ALWAYS use @sheenapps/db for data operations
- Use server components or server actions for DB calls
- Never expose sheen_sk_* to client components
- Pattern: 'use server' → db.from().select() → return data

Storage (@sheenapps/storage)
- ALWAYS use @sheenapps/storage for file uploads
- Server generates signed URL, client uploads directly to storage
- Never pass sheen_sk_* to browser
- Pattern: server action → createSignedUploadUrl → return URL → client fetch PUT

Jobs (@sheenapps/jobs)
- Use for background tasks, email sending, scheduled operations
- Jobs are at-least-once delivery - handlers must be idempotent
- Reserved prefix: sys:* is for system jobs only

Secrets (@sheenapps/secrets)
- Use for third-party API keys (Stripe, OpenAI, etc.)
- Server-only - never call from client components
- Always check error before using value

Email (@sheenapps/email)
- Use for transactional emails (magic links, welcome, receipts, notifications)
- Built-in templates: welcome, magic-link, password-reset, email-verification, receipt, notification
- Server-only - never call from client components
- Pattern: email.send({ to, template, variables }) → check error

Payments (@sheenapps/payments)
- Use for Stripe integration (checkout, subscriptions, billing portal)
- Requires Stripe keys stored in secrets: stripe_secret_key, stripe_webhook_secret
- Server-only - never call from client components
- Pattern: payments.createCheckoutSession({ priceId, successUrl, cancelUrl }) → redirect to session.url
- Webhook handling: payments.verifyWebhook({ payload, signature }) → process event
- Customer management: createCustomer, getCustomer
- Subscriptions: getSubscription, listSubscriptions, cancelSubscription

Analytics (@sheenapps/analytics)
- Use for event tracking, page views, and user identification
- Works with both public keys (tracking) and server keys (querying)
- Browser-side: auto-generates anonymous ID, persisted in localStorage
- Tracking methods (work with public key): track(), page(), identify()
- Query methods (require server key): listEvents(), getCounts(), getUser()
- Pattern: analytics.track('event_name', { properties }) → fire-and-forget
- Pattern: analytics.identify(userId, { traits }) → links anonymous ID to user
- Pattern: analytics.page('/path') → track page views
- Server-side querying: listEvents({ eventType: 'track', limit: 50 })

Key Management
- `sheen_pk_*` (public key) - Safe for browser/client code
- `sheen_sk_*` (server key) - Server-side only, never expose
- Environment variables: SHEEN_PK, SHEEN_SK

Error Handling
- All SDK methods return `{ data, error, status }` - they never throw
- Always check `error` before using `data`
- Error codes: UNAUTHORIZED, FORBIDDEN, RATE_LIMITED, QUOTA_EXCEEDED, VALIDATION_ERROR

⸻

Tests

Vitest + React Testing Library:

npm run test
npm run test:watch

Prioritize coverage for:
	•	i18n structure completeness
	•	cache-busting behavior for fresh data
	•	undo/redo state
	•	mobile viewport behaviors

⸻

Git operations policy (hard rule)

The agent must not run:
	•	git add, git commit, git push (or staging equivalents)

It may:
	•	inspect status/diffs, suggest changes, implement code fixes, analyze staged changes when asked.
