The foundations look solid, but for an MVP you’re spreading focus across too many “nice-to-haves.” I’d tighten scope around: reliability of builds, correctness of state, cost control, and observability. Everything else can wait.

What I’d change now (MVP-first, in priority order)
	1.	Events > polling (but keep it simple): use SSE first, not WebSockets.
	•	One /events?buildId=... SSE endpoint from the Worker; reconnect with Last-Event-ID.
	•	Push only canonical events from the Worker; the UI should not infer state.
	•	Keep polling as a fallback for 48h behind a flag.

	2.	Make builds idempotent and transactional.
	•	Every mutating call carries an Idempotency-Key and projectId.
	•	Worker holds a state machine for build_status (Postgres CHECK or trigger) to prevent illegal transitions.
	•	Reserve user credits before starting the build; commit or release on success/failure.

	3.	Collapse preview paths to one approach.
	•	Kill “React Preview (experimental)” for MVP; it invites style leakage and debug time.
	•	Keep the iframe preview on a separate origin (preview.*) with tight sandbox + CSP.
	•	Add TTL/garbage collection for stale previews.

	4.	Fix Hook violations and state ownership, then freeze the pattern.
	•	Replace the global “build state store” with:
	•	Server state = React Query (SSE source hydrates cache).
	•	UI state = a tiny Zustand store (panel open, selected section).
	•	Ban conditional hooks with ESLint rule + codemod the offenders.

	5.	Harden the Worker client & backpressure.
	•	Timeouts + jittered retries + circuit breaker per provider (half-open after backoff).
	•	Surface 429 and 5xx distinctly; show “we’ll notify you” once queue depth > threshold.

	6.	Observability before performance “polish.”
	•	Structured logs (Pino) with requestId, buildId, userId, projectId.
	•	Minimal metrics: build_latency, queue_depth, build_success_rate, provider_error_rate, token_cost.
	•	Error tracking (Sentry or similar) wired to the same IDs. Dashboards later.

	7.	Tighten security around preview + secrets.
	•	Iframe sandbox="allow-scripts allow-same-origin" only on a cookieless subdomain; no auth cookies there.
	•	Strict CSP (script-src only your preview host + nonce); COOP/COEP on app, not preview.
	•	Move secrets to a managed store + rotation plan (even if manual for now).

	8.	Data model trims.
	•	Partition project_build_events by month and add retention (e.g., 30–60 days “verbose,” then aggregate).
	•	Convert build_id to uuid v7 or keep ULID but index it btree + created_at DESC for feed queries.
	•	Add a unique constraint on (project_id, build_seq) to make replays safe.

	9.	Tests that matter (keep it thin, but real).
	•	Contract tests: Next ↔ Worker for create/update/stream events.
	•	Golden event sequence test: simulate build → assert UI states via Playwright.
	•	AI debit test: reserve, run, finalize, rollback on failure (and idempotency replay).

	10.	De-scope AI routing complexity.

	•	MVP policy: two tiers only (Premium, Standard) + a hard fallback.
	•	Route by explicit “importance” flag from the caller, not runtime “complexity analysis.”
	•	Log token usage & cost per provider; add a daily cost cap.

Things I’d postpone (save calendar time + cognitive load)
	•	API gateway, service mesh, multi-region, sharding.
	•	Collaborative editing, version branching, A/B.
	•	Service worker perf tricks, aggressive prefetching, and deep translation splitting (nice later; not needed now).

Concrete acceptance checks (MVP “done” line)
	•	Sign-up → credit check → build → preview → update → publish all green both on happy path and under a forced Worker 500.
	•	UI receives no state from polling when SSE is available; switching tabs doesn’t duplicate streams.
	•	At most one active build per project unless explicitly allowed; duplicate clicks are idempotent no-ops.
	•	Costs recorded within ±2% of provider invoices.
	•	Preview is fully isolated (cannot read app cookies / localStorage).
	•	Hook violation ESLint rule: 0 warnings.

Targeted nitpicks on the doc
	•	“Dual Preview Architecture” — pick one.
	•	“TierRouter with Domain Classification” — premature for MVP; use call-site level labels.
	•	“Monitoring & Observability” is listed medium-term; move it to immediate (lightweight, but essential).
	•	“WebSockets” in Immediate — prefer SSE first for lower infra & auth complexity.
	•	“Performance Optimization” (service worker, prefetch) — only after we have traces that show where it helps.
	•	“Event Storage” — add retention + partitions now to avoid runaway disk + slow queries later.

Quick wins (1–2 days)
	•	Add Idempotency-Key support in Worker and client.
	•	Ship a minimal SSE stream; keep existing polling as a fallback flag.
	•	Introduce x-request-id and propagate it everywhere (logs, errors, UI).
	•	Enforce ESLint react-hooks/rules-of-hooks and fix top 5 offenders.
	•	Add CSP + iframe sandbox on preview domain.
















Useful files I have reviewed below:
	1.	src/services/worker-api-client.ts
	2.	src/store/build-state-store.ts and useCleanBuildEvents hook
	3.	Event producer code in the Worker (the part that emits progress)
	4.	DB migrations for projects and project_build_events (and any triggers)
	5.	Preview deployment path (the endpoint + any domain config)
	6.	Your current SSE/WebSocket experiment if any (even a WIP branch)
	7.	The “credits”/AI time accounting code (reserve/commit/release)
	8.  src/utils/worker-auth.ts
	9.  /src/app/api/builds/[buildId]/events/route.ts


You’ve got good bones, but there are a few “must fix”s for MVP stability + security, and a couple of simplifications that will kill a lot of the polling/registry complexity you’ve built.

Below are tight, actionable recommendations grouped by area, with small code snippets you can paste in.

⸻

1) Worker API client — server-only, safer retries, consistent IDs

🔥 Must-fix
	•	Do not sign requests in the browser. Today WorkerAPIClient can run client-side (it imports env, and generateWorkerSignature will necessarily require a secret). Make this module server-only.
	•	Always send a request/correlation ID, even for GETs, and reuse it across retries.
	•	Retry-After logic: if the server sends Retry-After seconds, don’t exponentiate it. Use it as-is. Only exponentiate when you’re guessing.
	•	Add timeouts to fetch and abort on exponential backoff ceiling.

Patch sketch

// src/services/worker-api-client.ts
import 'server-only'

const isServer = typeof window === 'undefined';
if (!isServer) {
  throw new Error('WorkerAPIClient must only be imported on the server');
}

export class WorkerAPIClient {
  // ...

  private buildHeaders(base: Record<string,string>, pathWithQuery: string, body: string, requestId: string) {
    const signature = generateWorkerSignature(body, pathWithQuery);
    return {
      'Content-Type': 'application/json',
      'x-sheen-signature': signature,
      'x-request-id': requestId,          // <— include for ALL methods
      ...base,
    };
  }

  async request<T>(pathWithQuery: string, options: WorkerRequestOptions = {}): Promise<T> {
    this.validateEnvironment();

    const requestId = options.__requestId ?? `next_${crypto.randomUUID()}`; // reuse on retries
    const body = options.body ?? '';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15000);

    const res = await fetch(`${this.baseUrl}${pathWithQuery}`, {
      ...options,
      headers: this.buildHeaders(options.headers ?? {}, pathWithQuery, body.toString(), requestId),
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    if (res.status === 429) {
      const rl = parseRateLimitHeaders(res.headers);
      // If server gave an authoritative wait, use that exactly
      const wait = rl.retryAfter ?? (rl.resetAt ? Math.max(0, Math.ceil((rl.resetAt.getTime() - Date.now())/1000)) : undefined);
      await this.exponentialBackoff(wait ?? 1, options.__retryAttempt ?? 0, /*authoritative=*/Boolean(wait));
      return this.request(pathWithQuery, { ...options, __retryAttempt: (options.__retryAttempt ?? 0) + 1, __requestId: requestId });
    }

    if (!res.ok) {
      await this.handleError(res, pathWithQuery);
    }

    const ct = res.headers.get('content-type') || '';
    return ct.includes('application/json') ? res.json() : (res as unknown as T);
  }

  private async exponentialBackoff(baseSeconds: number, attempt = 0, authoritative = false) {
    // If server told us how long, don’t exponentiate
    const seconds = authoritative ? baseSeconds : Math.min(baseSeconds * Math.pow(2, attempt), 60);
    const jitter = 0.1 * Math.random();
    const ms = Math.min((seconds * (1 + jitter)) * 1000, 300000);
    logger.info(`⏳ Retrying in ${Math.round(ms/1000)}s (attempt ${attempt+1})`);
    await new Promise(r => setTimeout(r, ms));
  }
}

Also:
	•	Consider a responseType option (json | binary) so you don’t cast Response to T.
	•	Add timestamp/nonce to the signature (x-sheen-timestamp, x-sheen-nonce) to prevent replays. (Server must verify within skew.)

⸻

2) Events: stop fighting React with registries — ship SSE and delete 70% of this hook

Your use-clean-build-events is doing Olympic gymnastics to prevent duplicate polling. SSE makes all of that unnecessary.

Server (Worker) — add SSE route (uses your existing bus)

// worker: sseRoutes.ts
import { getCleanEventsSince } from './eventService';

app.get('/v1/builds/:buildId/events/stream', async (req, reply) => {
  const { buildId } = req.params as { buildId: string };
  const userId = req.headers['x-user-id'] as string | undefined;
  const lastId = Number(req.headers['last-event-id'] ?? 0);

  reply.raw.setHeader('Content-Type', 'text/event-stream');
  reply.raw.setHeader('Cache-Control', 'no-cache');
  reply.raw.setHeader('Connection', 'keep-alive');

  // 1) Catch-up
  const past = await getCleanEventsSince(buildId, lastId, userId);
  for (const ev of past) reply.raw.write(`id: ${ev.id}\nevent: message\ndata: ${JSON.stringify(ev)}\n\n`);

  // 2) Live
  const unsub = subscribeToEvents(buildId, (ev) => {
    // Optionally filter by userId if needed
    reply.raw.write(`id: ${ev.id}\nevent: message\ndata: ${JSON.stringify(ev)}\n\n`);
  });

  // 3) Keepalive
  const ka = setInterval(() => reply.raw.write(`event: ping\ndata: {}\n\n`), 15000);

  req.raw.on('close', () => { clearInterval(ka); unsub(); });
});

Client — a tiny hook (no registry, no buildQueryManager)

// src/hooks/useBuildEventsSSE.ts
'use client'
import { useEffect, useRef, useState } from 'react';

export function useBuildEventsSSE(buildId: string | null, userId: string) {
  const [events, setEvents] = useState<any[]>([]);
  const [done, setDone] = useState(false);
  const lastIdRef = useRef<number>(0);

  useEffect(() => {
    if (!buildId || !userId) return;
    const es = new EventSource(`/api/proxy/worker/v1/builds/${buildId}/events/stream`, { withCredentials: false });

    es.onmessage = (msg) => {
      const ev = JSON.parse(msg.data);
      lastIdRef.current = Number(msg.lastEventId || ev.id || lastIdRef.current);
      setEvents(prev => [...prev, ev]);
      if (ev.finished) setDone(true);
    };
    es.onerror = () => { /* optional backoff + reconnect with Last-Event-ID */ };

    return () => es.close();
  }, [buildId, userId]);

  const latest = events[events.length-1];
  return {
    events,
    isComplete: Boolean(latest?.finished),
    currentProgress: latest?.overall_progress ?? 0,
    previewUrl: events.slice().reverse().find(e => e.preview_url)?.preview_url ?? null,
    phase: latest?.phase,
  };
}

You can keep React Query if you love it, but you won’t need the registry/singleton/cancellation maze. The “one-stream-per-build” SSE connection is the singleton.

⸻

3) Preview isolation — use src, drop allow-same-origin

For real previews use a URL (your Pages preview) and make it cookieless.
	•	Set src={previewUrl} not doc.write.
	•	Sandbox should not include allow-same-origin; you want a unique opaque origin to prevent any cookie/localStorage bleed.

<iframe
  src={previewUrl ?? 'about:blank'}
  sandbox="allow-scripts allow-forms"  // 👈 drop allow-same-origin
  referrerPolicy="no-referrer"
  className="w-full h-full"
/>

On the preview origin, set a tight CSP and don’t set parent-domain cookies.

⸻

4) Event table — indexes + retention now

Your common queries:
	•	getCleanEventsSince(buildId, lastId[, userId])

Add these:

CREATE INDEX IF NOT EXISTS idx_pbe_build_id_id
  ON public.project_build_events (build_id, id);

CREATE INDEX IF NOT EXISTS idx_pbe_build_user_id
  ON public.project_build_events (build_id, user_id, id);

-- If you keep "clean only" path
CREATE INDEX IF NOT EXISTS idx_pbe_clean
  ON public.project_build_events (build_id, id)
  WHERE user_visible = true AND event_phase IS NOT NULL;

-- 30–60d retention job (cheap for now)
CREATE OR REPLACE FUNCTION purge_old_events() RETURNS void AS $$
BEGIN
  DELETE FROM public.project_build_events
  WHERE created_at < NOW() - INTERVAL '45 days';
END$$ LANGUAGE plpgsql;
-- run nightly via cron/pg_cron

(If you expect volume, consider monthly partitions later; not necessary for MVP.)

⸻

5) Billing service — reservation + safer UPDATE math

Good start. Two things:
	1.	Reservation: startTracking should reserve estimated seconds (write a row and decrement “available” now), and endTracking should settle the delta (+/-) to avoid races when multiple builds start in parallel.
	2.	Update expression safety: Don’t rely on evaluation order inside UPDATE. Compute deltas in a CTE.

WITH bal AS (
  SELECT welcome_bonus_seconds AS welcome,
         GREATEST(0, 900 - daily_gift_used_today) AS daily,
         paid_seconds_remaining AS paid,
         subscription_seconds_remaining AS sub
  FROM user_ai_time_balance
  WHERE user_id = $1
  FOR UPDATE
),
deduct AS (
  SELECT
    LEAST($billable, welcome) AS use_welcome,
    LEAST(GREATEST($billable - LEAST($billable, welcome),0), daily) AS use_daily,
    GREATEST($billable - LEAST($billable, welcome) - LEAST(GREATEST($billable - LEAST($billable, welcome),0), daily), 0) AS need_paid_total
  FROM bal
),
paid_split AS (
  SELECT
    LEAST(need_paid_total, paid) AS use_paid_col,
    GREATEST(need_paid_total - paid, 0) AS use_sub_col
  FROM bal, deduct
)
UPDATE user_ai_time_balance u
SET welcome_bonus_seconds = u.welcome_bonus_seconds - (SELECT use_welcome FROM deduct),
    daily_gift_used_today = u.daily_gift_used_today + (SELECT use_daily FROM deduct),
    paid_seconds_remaining = GREATEST(0, u.paid_seconds_remaining - (SELECT use_paid_col FROM paid_split)),
    subscription_seconds_remaining = GREATEST(0, u.subscription_seconds_remaining - (SELECT use_sub_col FROM paid_split)),
    ...
WHERE user_id = $1;

Also, make the idempotency key include sessionId (or a monotonic counter) so rebuilds of the same buildId don’t collide:

const idempotencyKey = `${params.buildId}_${params.operationType}_${params.sessionId ?? 'v1'}`;


⸻

6) Auth & signing — add anti-replay and pin the client path
	•	Add headers: x-sheen-timestamp, x-sheen-nonce, and include them in your HMAC canonical string (method\npath\nsha256(body)\nnonce\ntimestamp).
	•	Have the Worker reject signatures older than, say, 2 minutes and seen nonces (store in a small TTL cache).
	•	Ensure no NEXT_PUBLIC_* secret exists. Validate that in validateWorkerAuthEnvironment().

⸻

7) Builder UI component

Looks fine for demoing, but it’s not the real pipeline. Two tweaks for MVP:
	•	Gate it behind a feature flag or move it to a /demo route so it doesn’t get confused with the production builder.
	•	If you keep it, don’t set allow-same-origin on the iframe (same reason as above).

⸻

8) Observability (small, immediate)
	•	Emit x-request-id from Next → Worker, and have Worker echo it back in responses and include in logs/events.
	•	Minimal metrics (Prometheus or even just counters in logs): build_latency, queue_depth, provider_error_rate, rate_limit_retries.
	•	Add Sentry (server + client) with buildId, projectId, userId, x-request-id tagged.

⸻

9) What you can delete after SSE lands
	•	HookInstanceRegistry, SharedBuildEventsStore, most of buildQueryManager logic, and the many “isGloballyCurrent” guards.
	•	The polling intervals/adaptive logic, and a ton of the defensive logs.

This will dramatically reduce moving parts and hook violations.

⸻

Short “next PRs” plan
	1.	Lock down WorkerAPIClient (server-only, request id, retry-after fix, timeout).
	2.	Add Worker SSE endpoint + minimal Next API proxy (to avoid CORS headaches).
	3.	Replace use-clean-build-events with useBuildEventsSSE (keep old behind a flag for a week).
	4.	Preview iframe: swap to src=previewUrl, remove allow-same-origin.
	5.	DB: add event indexes + nightly retention function.
	6.	Billing: idempotency key tweak; optional reservation path.
	7.	Signature: add nonce + timestamp headers and verification.

















Awesome, thanks for the real files. Here’s a focused, “change-this-now” pass with drop-in patches.

⸻

1) worker-auth.ts — never expose secrets + real anti-replay

Problems
	•	You allow NEXT_PUBLIC_WORKER_SHARED_SECRET 😬 (that means the secret can ship to the browser).
	•	Signature = body + pathWithQuery only. No method, no timestamp, no nonce, no body hash → easy replay/rehash.
	•	Query order differences break signatures (you don’t canonicalize/sort).

Fix (server-only, canonical, timestamped, nonce’d)
	•	Remove all NEXT_PUBLIC_* secret support.
	•	Canonicalize as:
method\npath\nsortedQuery\nsha256(body)\nnonce\ntimestamp
	•	Add/verify x-sheen-timestamp (±120s skew), x-sheen-nonce (reject replays; 5–10 min TTL set on the Worker).

// src/utils/worker-auth.ts
import 'server-only'
import crypto from 'crypto';

function sha256Hex(input: string) {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

function sortQuery(qs: string) {
  if (!qs) return '';
  const params = new URLSearchParams(qs.startsWith('?') ? qs.slice(1) : qs);
  const pairs = Array.from(params.entries()).sort(([a],[b]) => a.localeCompare(b));
  return pairs.map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
}

export function generateWorkerSignature({
  method,
  path,           // "/v1/projects/123/export"
  query,          // "?a=1&b=2" or ""
  body,           // raw string, '' for GET
  timestamp,      // string seconds since epoch
  nonce,          // random uuid
}: {
  method: string; path: string; query: string; body: string; timestamp: string; nonce: string;
}): string {
  const secret = process.env.WORKER_SHARED_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('WORKER_SHARED_SECRET missing/too short');
  }
  const canonical =
    `${method.toUpperCase()}\n${path}\n${sortQuery(query)}\n${sha256Hex(body || '')}\n${nonce}\n${timestamp}`;
  return crypto.createHmac('sha256', secret).update(canonical, 'utf8').digest('hex');
}

export function createWorkerAuthHeaders(
  url: string, method: string, body: string, extra: Record<string,string>={}
) {
  const u = new URL(url, 'http://placeholder');
  const timestamp = Math.floor(Date.now()/1000).toString();
  const nonce = crypto.randomUUID();
  const sig = generateWorkerSignature({ method, path: u.pathname, query: u.search, body, timestamp, nonce });
  return {
    'Content-Type': 'application/json',
    'x-sheen-signature': sig,
    'x-sheen-timestamp': timestamp,
    'x-sheen-nonce': nonce,
    ...extra
  };
}

Worker-side verify sketch (Fastify on the Worker)

// check within ±120s, and nonce not seen before
// canonicalize exactly the same way; store nonce in a TTL cache (e.g., LRU with 10 min TTL)

Rate-limit header parser tweak (support HTTP-date Retry-After)

export function parseRateLimitHeaders(headers: Headers) {
  const out: {limit?:number;remaining?:number;resetAt?:Date;retryAfter?:number} = {};
  const parseIntSafe = (v: string | null) => (v ? parseInt(v, 10) : undefined);

  out.limit = parseIntSafe(headers.get('x-ratelimit-limit') || headers.get('ratelimit-limit'));
  out.remaining = parseIntSafe(headers.get('x-ratelimit-remaining') || headers.get('ratelimit-remaining'));

  const reset = headers.get('x-ratelimit-reset') || headers.get('ratelimit-reset');
  if (reset) {
    const n = parseInt(reset, 10);
    out.resetAt = new Date((n > 1e9 ? n*1000 : Date.now() + n*1000));
  }

  const ra = headers.get('retry-after');
  if (ra) {
    const n = parseInt(ra, 10);
    out.retryAfter = Number.isFinite(n) ? n : Math.max(0, Math.ceil((new Date(ra).getTime() - Date.now())/1000));
  }

  return out;
}


⸻

2) WorkerAPIClient follow-up (ties into the auth changes)
	•	Mark it server-only and remove any NEXT_PUBLIC_* usage.
	•	Include x-sheen-timestamp, x-sheen-nonce, x-request-id on every request.
	•	If Retry-After is present, use it verbatim (don’t exponentiate). Exponentiate only when you’re guessing.

(If you want, I’ll send a compact diff once you paste your createWorkerAuthHeaders call sites.)

⸻

3) /api/builds/[buildId]/events/route.ts — use session, not userId param, or move to SSE

Problems
	•	You trust userId from the querystring. A user can ask for someone else’s events.
	•	You use an admin Supabase client (bypasses RLS) then try to “filter” manually.

Quick fix (keep polling for now)
	•	Derive userId from the session, not from the URL.
	•	Call your SECURITY DEFINER function (get_user_build_events) or query with the non-admin client + RLS, filtering by both build_id and user_id = auth.uid().

// src/app/api/builds/[buildId]/events/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server' // your server-side helper
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { buildId: string } }) {
  const supabase = createServerSupabaseClient();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json({ success:false, error:'Unauthorized', events:[], lastEventId:0 }, { status: 401 });
  }

  const { buildId } = params;
  const lastEventId = Number(new URL(req.url).searchParams.get('lastEventId') ?? '0');

  // Use RLS-enforced table or your SECURITY DEFINER function
  const { data, error } = await supabase
    .from('project_build_events')
    .select('id, build_id, event_type, event_data, created_at, user_id, event_phase, event_title, event_description, overall_progress, finished, preview_url, error_message, duration_seconds')
    .eq('build_id', buildId)
    .eq('user_id', user.id)
    .eq('user_visible', true)
    .gt('id', lastEventId)
    .order('id', { ascending: true })
    .limit(100);

  if (error) return NextResponse.json({ success:false, error:'DB error', events:[], lastEventId:0 }, { status: 500 });

  // …transform to CleanBuildEvent exactly as you do now…
  // compute newLastEventId from returned rows
  return NextResponse.json({ buildId, events, lastEventId: newLastEventId });
}

Better fix (what I recommend): switch this endpoint to SSE and proxy to the Worker**
	•	Next route: /api/builds/[buildId]/events/stream
	•	Authenticates the user (session)
	•	Opens a streaming connection to the Worker’s SSE (or hits the DB and emits SSE itself), filtering by the session user server-side
	•	Returns text/event-stream
	•	Client: replace the poller with a tiny EventSource hook.

If you want, I’ll drop a minimal Next SSE proxy that bridges the Worker’s SSE (it’s ~30 lines).

⸻

4) Worker event bus → make per-user filtering explicit for SSE

Your bus.emit(buildId, userEvent) is good, but the bus listener has no built-in user filtering. When you build SSE:
	•	Either emit on a composite channel: bus.emit(${buildId}:${userId}, …) and subscribe to that exact channel, or
	•	Subscribe to buildId and filter in the SSE route by userId === sessionUser.

(Do not trust a userId from the client.)

⸻

5) DB: add the indexes you’ll need (cheap, high win)

CREATE INDEX IF NOT EXISTS idx_pbe_build_id_id
  ON public.project_build_events (build_id, id);

CREATE INDEX IF NOT EXISTS idx_pbe_build_user_id
  ON public.project_build_events (build_id, user_id, id);

CREATE INDEX IF NOT EXISTS idx_pbe_clean_only
  ON public.project_build_events (build_id, id)
  WHERE user_visible = true AND event_phase IS NOT NULL;

-- Optional retention (run nightly)
DELETE FROM public.project_build_events WHERE created_at < NOW() - INTERVAL '45 days';


⸻

6) Preview iframe: lock it down

In your builder component, change:

<iframe
  src={previewUrl ?? 'about:blank'}
  sandbox="allow-scripts allow-forms"   // drop allow-same-origin
  referrerPolicy="no-referrer"
  className="w-full h-full"
/>

And keep the preview on a cookieless subdomain.

⸻

7) Billing: idempotency key & reservation (small tweaks)
	•	Make the idempotency key include session/run granularity:

const idempotencyKey = `${params.buildId}_${params.operationType}_${params.sessionId ?? 'v1'}`;

	•	(Next step) add a simple reservation at startTracking (write a row + provisional decrement), and reconcile at endTracking. That prevents double-spend under concurrent starts.

⸻

What I can do next for you
	•	Send a PR-ready patch for: server-only Worker client + new HMAC headers + Next SSE route.
	•	A tiny Fastify verify middleware for the Worker (x-sheen-timestamp/nonce validation + TTL cache).
	•	The EventSource React hook to replace your polling/registry code.

If you paste:
	•	your Worker Fastify auth/verify middleware (or where you want it),
	•	your Next server Supabase helper (createServerSupabaseClient),
I’ll tailor exact diffs.
















Question to the expert: Currently any messages sent over the builder chat are not saved anywhere (as far as i know). Given your understanding now of our platform and how the users and our app use the chat, what do you recommend?

Answer:
Short version: you should treat chat as a first-class, auditable interface to the builder—not just UX chrome. Save it. Tie it to projects/builds. Make it stream. Keep costs + privacy in mind.

Here’s the lean plan that pays off immediately and won’t bog the MVP.

Why save chat (in this product)
	•	Repro + support: “Why did my site look like this?” → load the thread and the exact build it triggered.
	•	Context carryover: Keep state across sessions; let users resume.
	•	Product signals: Which prompts/features are used, cost per convo, where users get stuck.
	•	Safety: Abuse reports / GDPR export & delete.

Minimal data model (Postgres / Supabase)

Keep it boring and future-proof. Three tables + one view:

-- A conversation anchored to a project/version
create table chat_threads (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  user_id uuid not null,
  title text,
  locale text default 'en',
  last_message_at timestamptz default now(),
  created_at timestamptz default now(),
  archived boolean default false
);

-- Messages with rich payloads, tool calls & links to builds
create type chat_role as enum ('user','assistant','system','tool');
create table chat_messages (
  id bigserial primary key,
  thread_id uuid not null references chat_threads(id) on delete cascade,
  role chat_role not null,
  content jsonb not null,        -- {text, parts, chips, attachments, …}
  model text,                    -- e.g. gpt-4o, claude-3.5
  provider text,
  tokens_input int,
  tokens_output int,
  cost_usd numeric(10,5),
  build_id text,                 -- if this message triggered a build
  build_event_id int,            -- optional pointer to first event
  created_at timestamptz default now()
);

-- One row per model call (ties into your billing)
create table chat_runs (
  id bigserial primary key,
  thread_id uuid not null references chat_threads(id) on delete cascade,
  user_id uuid not null,
  request jsonb not null,        -- prompt+tools (redacted)
  response jsonb not null,       -- completion+tool_calls (redacted)
  latency_ms int,
  tokens_input int,
  tokens_output int,
  cost_usd numeric(10,5),
  success boolean default true,
  created_at timestamptz default now()
);

Indexes & RLS

create index on chat_messages (thread_id, id);
create index on chat_threads (user_id, project_id, last_message_at desc);
-- RLS: user can only see own threads/messages; service role full access.

Write/stream path (simple & robust)
	1.	Client → Next (server action/API): POST /api/projects/:projectId/chat/:threadId/messages
	•	Create chat_messages(role='user')
	•	Optionally enqueue a Worker task (or call Worker sync) to process with AI.
	2.	Worker processes AI call
	•	Record chat_runs (prompt/response/tokens/latency/cost).
	•	Emit assistant message rows incrementally (stream tokens via SSE/WebSocket if you want live typing), then a final chat_messages(role='assistant').
	•	If it triggers a build, set build_id on the assistant message and start your existing build event flow.
	3.	Frontend subscribes
	•	Use SSE channel per thread (/v1/chat/threads/:threadId/stream) → minimal code, matches your planned build SSE.

Message shape (JSON you can evolve)

{
  "text": "Add a pricing page with 3 tiers",
  "chips": ["3 tiers","Add FAQ"],            // for your current UI
  "attachments": [{"type":"image","url":"..."}],
  "metadata": {
    "locale": "en",
    "ui_origin": "builder_left_panel",
    "versionId": "v_123",
    "previewUrl": "https://…"
  }
}

Assistant messages can include:

{
  "text": "Done. Deployed preview here:",
  "actions": [{"type":"open_preview","url":"https://…"}],
  "diff_summary": {"files_changed": 7},
  "triggeredBuild": {"buildId":"01HV…","phase":"deploy"}
}

Tie-ins with your existing systems
	•	Builds: store build_id on the assistant message that initiated it; link from the build completion event back to chat_messages.id (handy in the UI).
	•	Billing: add a new operationType = 'chat' path to your aiTimeBillingService so chat usage is accounted separately from main_build/update. Use the same idempotency approach.
	•	Internationalization: save locale per thread; you can train routing (e.g., Arabic copy generation) later.
	•	Search: later, add an embeddings table for semantic search across a user’s threads. Not needed for MVP.

Privacy, safety, retention (don’t skip)
	•	PII redaction on server before writing request/response into chat_runs (keep the full chat_messages for product value, but consider a “Do not save content” toggle per thread for enterprise).
	•	Retention: keep raw chat_runs.request/response for 30–60 days; keep chat_messages indefinitely (or until project is deleted). Add a nightly job to trim runs.
	•	Export & delete: one endpoint can dump a thread (messages + builds) for GDPR requests. Easy because it’s all relational.

Small UI changes
	•	In builder-interface.tsx, persist on every send:
	•	POST /api/projects/:projectId/chat/{threadId}/messages with {role:'user', content:{text, chips…}}
	•	Show assistant replies from the stream (don’t wait for full completion).
	•	When a chip is clicked, save it as a user message too (not just UI state).

Quick implementation steps (1 week-ish)
	1.	Create the 3 tables + RLS + indexes.
	2.	Add POST /api/chat and GET /api/chat/:threadId/messages?after=… (or straight SSE).
	3.	Worker: on reply, write chat_runs and a final chat_messages(role='assistant'); stream via SSE.
	4.	Frontend: switch to thread-driven state (threadId in URL), and render history from DB rather than in-memory arrays.
	5.	Add operationType='chat' to billing; show token/cost in a collapsible message footer (optional but nice).

If you want, send me your current server route that calls the AI (or where that logic lives), and I’ll wire in the DB writes + a tiny SSE stream so the chat feels live and everything’s stored correctly.


Question to the expert:
Ok but remember that our ui promises two modes of chat: build and plan. The build mode takes the user input and sends it to the worker (where is gets processed and augmented) to be treated as a prompt for action and instructions. The plan mode is simply to ask questions, talk over ideas, make plans before executing them in the build mode,... etc. I think it would also be smart to plan a smart, decent and user friendly way for our users to move between either modes. What do you think?


Answer:
Totally. Treat Plan and Build as two modes of the same conversation—not two separate features. Users should brainstorm, then promote ideas into actions with one click. Here’s a tight plan you can ship without derailing the MVP.

Product shape (how it should feel)
	•	One thread per project, two modes in the composer: a segmented control: Plan | Build.
	•	Plan (default): free Q&A, ideation, content help, “what if…”. Zero side effects. Cheaper models.
	•	Build: executes changes; kicks the Worker; shows progress and preview.
	•	Inline “Make it”: every Plan message the model flags as actionable gets a small CTA (and keyboard shortcut) to convert it into a draft build instruction. Users can edit → confirm → run.
	•	Review drawer: when you switch from Plan → Build, open a drawer that proposes a concise Build Instruction computed from the recent plan discussion. One big “Run build” button.
	•	Safety affordances:
	•	Plan mode never performs actions.
	•	Build always shows a confirmation card: credits estimate, diff summary (if available), and preview target.
	•	Destructive actions (delete/reset) = explicit warning.

Data model (minimal, future-proof)

Add three columns + one new table.

-- 1) Threads already exist (see earlier), add defaults
alter table chat_threads add column if not exists default_mode text check (default_mode in ('plan','build')) default 'plan';
alter table chat_threads add column if not exists project_id uuid not null; -- (if not already)

-- 2) Messages: mark which mode produced the message + detected intent
alter table chat_messages add column if not exists mode text check (mode in ('plan','build')) default 'plan';
alter table chat_messages add column if not exists assistant_intent jsonb; -- {actionable:boolean, actions:[...], confidence:0.0-1.0}

-- 3) Draft/build instructions created from plan
create table if not exists chat_actions (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references chat_threads(id) on delete cascade,
  user_id uuid not null,
  source_message_id bigint,                  -- plan message that generated this (nullable)
  status text check (status in ('draft','reviewed','queued','running','completed','failed')) default 'draft',
  instruction jsonb not null,                -- normalized BuildInstruction
  build_id text,                             -- filled once queued
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_chat_actions_thread on chat_actions(thread_id, created_at desc);
create index if not exists idx_chat_messages_thread on chat_messages(thread_id, id);

BuildInstruction (normalized payload handed to the Worker)

Keep this stable so both Plan→Build and direct Build use the same contract.

{
  "projectId": "uuid",
  "userId": "uuid",
  "goals": ["Add pricing page with 3 tiers"],
  "changes": [
    {"type":"add_page","slug":"pricing","sections":["hero","tiers","faq"]},
    {"type":"update_copy","path":"/home","selector":"h1","text":"Acme — fast billing"}
  ],
  "constraints": {"brand":"Acme", "palette":"indigo", "locale":"en"},
  "notes": "Prefer minimal layout; keep CLS low"
}

API flow (simple endpoints)
	•	Plan message
POST /api/projects/:projectId/threads/:threadId/messages
Body: {role:'user', mode:'plan', content:{text}}
→ Server calls Plan model (cheap), stores assistant reply (mode:'plan').
→ Also runs intent detection to set assistant_intent and (optionally) create a chat_actions row with status='draft'.
	•	Convert to Build
POST /api/threads/:threadId/actions → create/update chat_actions with status='reviewed'.
UI shows drawer with the BuildInstruction (editable JSON → form).
Confirm → POST /api/actions/:id/queue → calls Worker; sets status='queued', writes build_id, adds a build-mode assistant message (e.g., “Starting build 01AB…”) and kicks your SSE build stream.
	•	Direct Build
If the composer is in Build mode, the server creates the same chat_actions row from the message and immediately queues it.
	•	Streaming
	•	Chat threads stream via SSE: /api/chat/threads/:threadId/stream (user-scoped).
	•	Build events stream via SSE you’re adding for builds.
Both streams attach to the same conversation view.

Mode switching UX (friendly + explicit)
	•	Composer segmented control Plan | Build with short tooltips:
	•	Plan: “Ask, explore ideas, no changes happen.”
	•	Build: “Apply changes to your site (will consume credits).”
	•	Keyboard: ⌘/Ctrl + B toggles mode; Enter sends; ⌘/Ctrl + Enter → “Convert last plan draft to build”.
	•	On first switch Plan→Build in a thread, show a one-time explainer and remember “don’t show again”.
	•	In Plan messages flagged actionable, show a subtle inline Make it button (primary action colored).
Clicking opens the review drawer pre-filled from the intent.

Intent detection (tiny, reliable, cheap)
	•	Don’t overfit an ML classifier. Use a few-shot prompt on your Standard tier model:
	•	Input: latest user message + last 5 messages.
	•	Output JSON: {actionable:boolean, actions:[…], confidence:0.0-1.0, instruction:BuildInstruction}.
	•	Save this JSON in assistant_intent; if actionable && confidence>=0.6, auto-create a chat_actions draft (but never auto-run).

Billing rules (keep it simple)
	•	Plan: operationType='chat' (your billing service). Use cheapest viable model.
	•	Build: your existing main_build/update.
	•	Show a pre-flight estimate in the confirmation drawer using aiTimeBillingService.estimateDuration(); if insufficient balance, surface the same structured 402 path you already have.

Safety rails
	•	Plan cannot mutate state. Even if the user says “deploy now” in Plan, it only produces a draft action.
	•	Build always requires an explicit confirmation (the drawer).
	•	For destructive inferred actions (e.g., “delete blog”), set instruction.requiresConfirmation=true and show an extra confirmation.

Minimal UI changes you can ship next
	1.	Add the Plan | Build segmented control to your builder chat composer.
	2.	When sending in Plan, persist messages and run the intent detector; render inline “Make it”.
	3.	Implement the review drawer (title: “Review build instruction”), with basic fields: goals, pages, constraints → “Run build”.
	4.	On “Run build”, create chat_actions and queue the Worker job; start listening to build SSE; show progress on the right panel you already have.

Example quick endpoint (Plan send → detect intent)

// POST /api/projects/:projectId/threads/:threadId/messages
export async function POST(req) {
  const { user } = await auth(); if (!user) return unauthorized();
  const { projectId, threadId } = req.params;
  const { text, mode } = await req.json();

  // 1) save user message
  const msgId = await db.insertMessage({ threadId, role:'user', mode, content:{text}, userId:user.id });

  if (mode === 'plan') {
    // 2) get assistant reply (cheap model)
    const reply = await planModel(text, /*context*/);
    const aiMsgId = await db.insertMessage({ threadId, role:'assistant', mode:'plan', content:{text: reply.text} });

    // 3) detect intent
    const intent = await detectIntent(text, /*history*/);
    await db.updateMessage(aiMsgId, { assistant_intent: intent });
    if (intent.actionable && intent.confidence >= 0.6) {
      await db.insertAction({ threadId, userId:user.id, source_message_id: aiMsgId, instruction: intent.instruction });
    }

    return json({ ok:true });
  }

  // mode === 'build'
  const instruction = await instructionFromSingleMessage(text, /*history*/);
  const actionId = await db.insertAction({ threadId, userId:user.id, instruction, status:'reviewed' });
  return json({ actionId }); // client will open the review drawer
}

Analytics you’ll actually use
	•	% of plan messages flagged actionable, % converted to build, plan→build time, first build success rate, avg cost per plan Q, and drop-off points (drawer opened but not run).

Acceptance checks
	•	In Plan, nothing mutates server state.
	•	Any build is traceable to: thread → message → chat_action → build_id.
	•	Users can convert a plan idea to a build in ≤ 2 clicks.
	•	If balance is insufficient, they see a friendly upsell with exact needed seconds.

⸻

If you want, share your current chat send route (or where you intend to put it), and I’ll wire in:
	•	the intent detector prompt,
	•	the chat_actions insert,
	•	the review drawer payload shape,
	•	and the small front-end changes to the composer (toggle + Make it).
