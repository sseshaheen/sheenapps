# Implementation Plan V2: Prompt-to-First-Iteration Optimization

**Created:** January 8, 2026
**Version:** 2.0 (incorporates expert reliability feedback)
**Philosophy:** Measure first, ship incremental wins, fail gracefully under stress

---

## Changes from V1

| V1 Approach | V2 Change | Why |
|-------------|-----------|-----|
| Timestamp-only HMAC replay protection | Add `x-request-id` + Redis TTL dedupe | Timestamp within 5min TTL still allows replay attacks on expensive AI calls |
| Streaming-only recommendations | SSE triggers fetch; DB is source of truth | Stream drop / tab background = user misses recs permanently |
| `pending→ready→failed` (3-state) | Add `readySource: 'quick' \| 'ai'` field | Handles edge case of AI recs arriving after quick suggestions shown |
| Quick suggestions keyed on businessType only | Use full `extractedInfo` + `missingInformation` | businessType confidence can be low; richer suggestions possible |
| Backend locale at P2 (Week 3-4) | Move to P1 (Week 2) | Low risk, prevents subtle regional bugs now |
| No event sequencing | Add `eventSeq` to SSE events | Prevents out-of-order updates on reconnect |
| Implicit TTFI definition | Precise: "first assistant token rendered" | Prevents metric drift between engineers |
| No E2E tests specified | Add testing gates for new behavior | Flow-critical changes need safety net |

---

## Core Principles (Updated)

1. **DB is source of truth; streams are notifications**
   - Never rely solely on SSE for critical data delivery
   - SSE says "something happened" → client fetches from API
   - Survives: tab background, stream drops, reconnects

2. **Idempotency everywhere**
   - `buildSessionId` generated once, survives retries
   - `requestId` per API call for replay protection
   - `eventSeq` prevents duplicate/out-of-order processing

3. **Fail gracefully, not silently**
   - Recommendations timeout → show quick suggestions (not blank)
   - Stream drop → reconnect with sequence validation
   - AI failure → user sees clear error with retry option

---

## Phase 0: Observability Foundation (Week 1)

### Task 0.1: Build Session & Request ID System

**Files to create/modify:**
- `/sheenappsai/src/lib/ids.ts` (new)
- `/sheenappsai/src/store/build-session-store.ts` (new)

**Implementation:**

```typescript
// /src/lib/ids.ts
export function generateBuildSessionId(projectId: string): string {
  return `bs_${projectId}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`
}

export function generateRequestId(): string {
  return `req_${crypto.randomUUID()}`
}
```

```typescript
// /src/store/build-session-store.ts
interface BuildSessionState {
  buildSessionId: string | null
  projectId: string | null
  phase: BuildPhase
  lastEventSeq: number  // Track last processed sequence
  // ...
}

const useBuildSessionStore = create<BuildSessionState>((set, get) => ({
  buildSessionId: null,
  lastEventSeq: 0,

  // Generate ONCE at submit, never regenerate until reset
  startSession: (projectId: string) => {
    const current = get()
    // Idempotent: don't regenerate if already have session for this project
    if (current.buildSessionId && current.projectId === projectId && current.phase !== 'idle') {
      return current.buildSessionId
    }
    const buildSessionId = generateBuildSessionId(projectId)
    set({ buildSessionId, projectId, phase: 'submitting', lastEventSeq: 0 })
    return buildSessionId
  },

  // Process event only if sequence is newer
  processEvent: (event: SSEEvent) => {
    const { lastEventSeq, buildSessionId } = get()

    // Ignore stale sessions
    if (event.buildSessionId !== buildSessionId) {
      console.warn('Ignoring event from stale session', {
        expected: buildSessionId,
        received: event.buildSessionId
      })
      return false
    }

    // Ignore out-of-order events
    if (event.seq <= lastEventSeq) {
      console.warn('Ignoring out-of-order event', {
        lastSeq: lastEventSeq,
        eventSeq: event.seq
      })
      return false
    }

    set({ lastEventSeq: event.seq })
    return true  // Event should be processed
  },

  reset: () => set({
    buildSessionId: null,
    projectId: null,
    phase: 'idle',
    lastEventSeq: 0
  }),
}))
```

**Key rules:**
- `buildSessionId` survives client retries, page re-renders, mutation retries
- Client ignores any event where `event.buildSessionId !== current.buildSessionId`
- `requestId` is separate (per API call) for replay protection tracing

**Effort:** 4-6 hours
**Risk:** Low

---

### Task 0.2: Instrument Key Metrics (Precise Definitions)

**Metric Definitions (frozen, no drift allowed):**

| Metric | Precise Definition | Measurement Point |
|--------|-------------------|-------------------|
| `ttfb_chat` | Time from `fetch()` call to first byte of response | `use-persistent-chat.ts` fetch wrapper |
| `sse_connect` | Time from SSE request to `connection` event received | `stream-controller.ts` |
| `ttft` | Time from build submit to **first assistant token rendered in DOM** | `builder-chat-interface.tsx` useEffect on first token |
| `ttfi` | Same as `ttft` (we're choosing token-based, not message-based) | Same |
| `tt_preview` | Time from build submit to `previewUrl` non-null in state | `build-session-store.ts` |
| `tt_recs` | Time from build submit to first recommendation card visible | `builder-chat-interface.tsx` |
| `build_duration` | Worker: `job.finishedOn - job.processedOn` | BullMQ job events |
| `queue_wait` | Worker: `job.processedOn - job.timestamp` | BullMQ job events |

**Implementation with proper cleanup:**

```typescript
// /src/lib/metrics.ts
class BuildMetrics {
  private buildSessionId: string | null = null

  start(buildSessionId: string) {
    // Clear any stale marks from previous builds
    performance.clearMarks()
    performance.clearMeasures()

    this.buildSessionId = buildSessionId
    performance.mark('build_submit')
  }

  markFirstToken() {
    if (!this.buildSessionId) return
    performance.mark('first_token')
    performance.measure('ttft', 'build_submit', 'first_token')
    this.capture('ttft')
  }

  markPreviewReady() {
    if (!this.buildSessionId) return
    performance.mark('preview_ready')
    performance.measure('tt_preview', 'build_submit', 'preview_ready')
    this.capture('tt_preview')
  }

  markRecommendationsVisible() {
    if (!this.buildSessionId) return
    performance.mark('recs_visible')
    performance.measure('tt_recs', 'build_submit', 'recs_visible')
    this.capture('tt_recs')
  }

  private capture(metricName: string) {
    const entries = performance.getEntriesByName(metricName)
    const duration = entries[entries.length - 1]?.duration
    if (duration) {
      posthog.capture('build_metric', {
        metric: metricName,
        duration_ms: Math.round(duration),
        buildSessionId: this.buildSessionId,
        locale: getCurrentLocale(),
        p_timestamp: Date.now(),  // For percentile bucketing
      })
    }
  }

  reset() {
    performance.clearMarks()
    performance.clearMeasures()
    this.buildSessionId = null
  }
}

export const buildMetrics = new BuildMetrics()
```

**Effort:** 6-8 hours
**Risk:** Low

---

### Task 0.3: Add Server-Timing Headers

**Files to modify:**
- `/sheenappsai/src/app/api/persistent-chat/messages/route.ts`
- `/sheenapps-claude-worker/src/routes/chatMessages.ts`

**Implementation:**

```typescript
// Next.js API route
export async function POST(request: Request) {
  const timings: string[] = []
  const start = performance.now()

  // Auth timing
  const authStart = performance.now()
  const user = await authenticate(request)
  timings.push(`auth;dur=${Math.round(performance.now() - authStart)}`)

  // Worker call timing
  const workerStart = performance.now()
  const response = await forwardToWorker(payload)
  timings.push(`worker;dur=${Math.round(performance.now() - workerStart)}`)

  timings.push(`total;dur=${Math.round(performance.now() - start)}`)

  return NextResponse.json(response, {
    headers: {
      'Server-Timing': timings.join(', '),
    },
  })
}
```

```typescript
// Worker route (Fastify)
fastify.addHook('onSend', (request, reply, payload, done) => {
  const timings = request.timings || []
  if (timings.length > 0) {
    reply.header('Server-Timing', timings.join(', '))
  }
  done()
})
```

**Effort:** 2-3 hours
**Risk:** Low

---

## Phase 1: State-Driven Recommendations (Week 1-2)

### Task 1.1: Recommendations Store with Ready Source

**File:** `/sheenappsai/src/store/recommendations-store.ts` (new)

```typescript
type RecommendationsStatus = 'idle' | 'pending' | 'ready' | 'failed'
type ReadySource = 'quick' | 'ai'

interface RecommendationsState {
  status: RecommendationsStatus
  readySource: ReadySource | null

  // Quick suggestions (instant, from prompt analysis)
  quickSuggestions: QuickSuggestion[] | null

  // AI recommendations (from worker, persisted in DB)
  recommendations: ProjectRecommendation[] | null

  // Metadata
  buildSessionId: string | null
  error: string | null
  aiGenerationStarted: boolean  // Track if AI gen is in progress
}

interface RecommendationsActions {
  // Called when build starts - show quick suggestions immediately
  startWithQuickSuggestions: (
    buildSessionId: string,
    suggestions: QuickSuggestion[]
  ) => void

  // Called when SSE notifies AI recs are ready - triggers fetch
  notifyAiRecsReady: () => void

  // Called after fetching from DB
  setAiRecommendations: (recs: ProjectRecommendation[]) => void

  setFailed: (error: string) => void
  reset: () => void
}

const useRecommendationsStore = create<RecommendationsState & RecommendationsActions>(
  (set, get) => ({
    status: 'idle',
    readySource: null,
    quickSuggestions: null,
    recommendations: null,
    buildSessionId: null,
    error: null,
    aiGenerationStarted: false,

    startWithQuickSuggestions: (buildSessionId, suggestions) => {
      set({
        status: 'pending',
        readySource: 'quick',
        quickSuggestions: suggestions,
        recommendations: null,
        buildSessionId,
        error: null,
        aiGenerationStarted: true,
      })
    },

    notifyAiRecsReady: () => {
      // SSE notification received - UI should now fetch from DB
      // This just marks that we know they're ready
      const current = get()
      if (current.status === 'pending' || current.readySource === 'quick') {
        set({ aiGenerationStarted: false })  // Generation complete
      }
    },

    setAiRecommendations: (recs) => {
      set({
        status: 'ready',
        readySource: 'ai',
        recommendations: recs,
        error: null,
      })
    },

    setFailed: (error) => {
      const current = get()
      // If we have quick suggestions, keep showing them with error note
      set({
        status: current.quickSuggestions ? 'ready' : 'failed',
        readySource: current.quickSuggestions ? 'quick' : null,
        error,
        aiGenerationStarted: false,
      })
    },

    reset: () => set({
      status: 'idle',
      readySource: null,
      quickSuggestions: null,
      recommendations: null,
      buildSessionId: null,
      error: null,
      aiGenerationStarted: false,
    }),
  })
)
```

**Effort:** 3-4 hours
**Risk:** Low

---

### Task 1.2: Smart Quick Suggestions Generator

**File:** `/sheenappsai/src/services/quick-suggestions.ts` (new)

**Key insight from expert:** Don't key only on businessType. Use the full analysis.

```typescript
interface QuickSuggestion {
  id: string
  title: string
  titleAr?: string  // Localized
  description: string
  descriptionAr?: string
  category: 'feature' | 'ui' | 'seo' | 'performance' | 'accessibility'
  prompt: string
  confidence: number  // How relevant this suggestion is
}

// Suggestion generators based on analysis fields
const SUGGESTION_GENERATORS = {
  // Based on missing information
  missingInfo: (missing: string[]): QuickSuggestion[] => {
    const suggestions: QuickSuggestion[] = []

    if (missing.includes('pricing') || missing.includes('cost')) {
      suggestions.push({
        id: 'qs-pricing',
        title: 'Add pricing section',
        titleAr: 'إضافة قسم الأسعار',
        description: 'Display your services and their costs clearly',
        descriptionAr: 'عرض خدماتك وتكاليفها بوضوح',
        category: 'feature',
        prompt: 'Add a pricing section with service tiers',
        confidence: 0.9,
      })
    }

    if (missing.includes('contact') || missing.includes('location')) {
      suggestions.push({
        id: 'qs-contact',
        title: 'Add contact information',
        titleAr: 'إضافة معلومات الاتصال',
        description: 'Help customers reach you easily',
        descriptionAr: 'ساعد العملاء على الوصول إليك بسهولة',
        category: 'feature',
        prompt: 'Add a contact section with form, phone, email, and map',
        confidence: 0.9,
      })
    }

    if (missing.includes('hours') || missing.includes('schedule')) {
      suggestions.push({
        id: 'qs-hours',
        title: 'Add business hours',
        titleAr: 'إضافة ساعات العمل',
        description: 'Show when you are open',
        descriptionAr: 'اعرض متى تكون متاحاً',
        category: 'ui',
        prompt: 'Add business hours display with timezone support',
        confidence: 0.85,
      })
    }

    return suggestions
  },

  // Based on functional requirements NOT already mentioned
  functionalGaps: (
    requirements: string[],
    services: string[]
  ): QuickSuggestion[] => {
    const suggestions: QuickSuggestion[] = []
    const hasBooking = services.some(s =>
      s.includes('booking') || s.includes('appointment') || s.includes('reservation')
    )
    const hasPayment = services.some(s =>
      s.includes('payment') || s.includes('checkout') || s.includes('cart')
    )

    if (!hasBooking) {
      suggestions.push({
        id: 'qs-booking',
        title: 'Add online booking',
        titleAr: 'إضافة الحجز عبر الإنترنت',
        description: 'Let customers book appointments online',
        descriptionAr: 'اسمح للعملاء بحجز المواعيد عبر الإنترنت',
        category: 'feature',
        prompt: 'Add an online appointment booking system with calendar',
        confidence: 0.8,
      })
    }

    if (!hasPayment && requirements.some(r => r.includes('sell') || r.includes('product'))) {
      suggestions.push({
        id: 'qs-payment',
        title: 'Add payment processing',
        titleAr: 'إضافة معالجة الدفع',
        description: 'Accept payments online securely',
        descriptionAr: 'قبول المدفوعات عبر الإنترنت بشكل آمن',
        category: 'feature',
        prompt: 'Add secure payment processing with Stripe',
        confidence: 0.8,
      })
    }

    return suggestions
  },

  // Universal suggestions (always somewhat relevant)
  universal: (): QuickSuggestion[] => [
    {
      id: 'qs-seo',
      title: 'Optimize for search engines',
      titleAr: 'تحسين لمحركات البحث',
      description: 'Help customers find you on Google',
      descriptionAr: 'ساعد العملاء في العثور عليك على جوجل',
      category: 'seo',
      prompt: 'Add SEO meta tags, structured data, and sitemap',
      confidence: 0.7,
    },
    {
      id: 'qs-analytics',
      title: 'Add visitor analytics',
      titleAr: 'إضافة تحليلات الزوار',
      description: 'Understand how visitors use your site',
      descriptionAr: 'افهم كيف يستخدم الزوار موقعك',
      category: 'performance',
      prompt: 'Add Google Analytics tracking',
      confidence: 0.6,
    },
    {
      id: 'qs-accessibility',
      title: 'Improve accessibility',
      titleAr: 'تحسين إمكانية الوصول',
      description: 'Make your site usable by everyone',
      descriptionAr: 'اجعل موقعك قابلاً للاستخدام من قبل الجميع',
      category: 'accessibility',
      prompt: 'Add ARIA labels, keyboard navigation, and screen reader support',
      confidence: 0.6,
    },
  ],
}

export function generateQuickSuggestions(
  analysis: PromptAnalysis,
  locale: string = 'en'
): QuickSuggestion[] {
  const suggestions: QuickSuggestion[] = []

  // Priority 1: Missing information (high confidence)
  if (analysis.missingInformation?.length) {
    suggestions.push(...SUGGESTION_GENERATORS.missingInfo(analysis.missingInformation))
  }

  // Priority 2: Functional gaps
  suggestions.push(
    ...SUGGESTION_GENERATORS.functionalGaps(
      analysis.functionalRequirements || [],
      analysis.services || []
    )
  )

  // Priority 3: Universal (lower confidence, always added)
  suggestions.push(...SUGGESTION_GENERATORS.universal())

  // Sort by confidence, take top 3-4
  const sorted = suggestions
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 4)

  // Localize if Arabic
  if (locale.startsWith('ar')) {
    return sorted.map(s => ({
      ...s,
      title: s.titleAr || s.title,
      description: s.descriptionAr || s.description,
    }))
  }

  return sorted
}
```

**Effort:** 4-5 hours
**Risk:** Low

---

### Task 1.3: SSE as Notification, DB as Source of Truth

**Pattern:**
1. Worker generates recs → stores in DB → emits SSE `recommendations_ready`
2. Client receives event → calls `queryClient.invalidateQueries(['recommendations', projectId])`
3. React Query fetches from normal endpoint
4. UI updates from query result

**File:** `/sheenappsai/src/hooks/use-recommendations-listener.ts` (new)

```typescript
export function useRecommendationsListener(
  projectId: string | null,
  buildSessionId: string | null
) {
  const queryClient = useQueryClient()
  const { notifyAiRecsReady, setFailed } = useRecommendationsStore()

  // Listen for SSE notification
  useEffect(() => {
    if (!projectId || !buildSessionId) return

    const handleRecommendationsReady = (event: SSEEvent) => {
      // Validate this is for current session
      if (event.buildSessionId !== buildSessionId) {
        console.warn('Ignoring stale recommendations_ready event')
        return
      }

      // Mark that AI recs are ready
      notifyAiRecsReady()

      // Invalidate query to trigger fetch from DB
      queryClient.invalidateQueries({
        queryKey: ['recommendations', projectId],
      })
    }

    const handleRecommendationsFailed = (event: SSEEvent) => {
      if (event.buildSessionId !== buildSessionId) return
      setFailed(event.error || 'Failed to generate recommendations')
    }

    // Subscribe to SSE events
    streamController.on('recommendations_ready', handleRecommendationsReady)
    streamController.on('recommendations_failed', handleRecommendationsFailed)

    return () => {
      streamController.off('recommendations_ready', handleRecommendationsReady)
      streamController.off('recommendations_failed', handleRecommendationsFailed)
    }
  }, [projectId, buildSessionId, queryClient, notifyAiRecsReady, setFailed])
}
```

**Worker side:**

```typescript
// /sheenapps-claude-worker/src/services/recommendationsService.ts

async function generateAndStoreRecommendations(params: {
  projectId: string
  userId: string
  buildSessionId: string
  prompt: string
}) {
  const { projectId, userId, buildSessionId, prompt } = params

  try {
    // Generate recommendations (with timeout)
    const recommendations = await Promise.race([
      generateRecommendations(prompt, projectId),
      timeout(20000).then(() => { throw new Error('Recommendations timeout') }),
    ])

    // Store in DB (source of truth)
    await db.recommendations.upsert({
      projectId,
      buildSessionId,
      recommendations,
      createdAt: new Date(),
    })

    // Emit SSE notification (not the data itself)
    emitSSE(projectId, {
      type: 'recommendations_ready',
      buildSessionId,
      seq: nextSeq(buildSessionId),
      // Optionally include recommendations here too for eager clients
      // recommendations,
    })

  } catch (error) {
    logger.error('Recommendations generation failed', { error, buildSessionId })

    emitSSE(projectId, {
      type: 'recommendations_failed',
      buildSessionId,
      seq: nextSeq(buildSessionId),
      error: error.message,
    })
  }
}
```

**Effort:** 6-8 hours
**Risk:** Medium

---

### Task 1.4: Parallel Recommendations with Safeguards

**Expert concerns addressed:**
- Lower priority queue
- Deduplication
- Timeout (doesn't block build)
- Cost control

**File:** `/sheenapps-claude-worker/src/queue/recommendationsQueue.ts` (new or modify)

```typescript
// Separate queue with lower concurrency
export const recommendationsQueue = new Queue('recommendations', {
  connection: redis,
  defaultJobOptions: {
    attempts: 1,  // Don't retry expensive AI calls
    timeout: 20000,  // 20 second hard timeout
    removeOnComplete: 100,
    removeOnFail: 50,
  },
})

// Worker with lower concurrency than build queue
const worker = new Worker('recommendations', processRecommendations, {
  connection: redis,
  concurrency: 2,  // Lower than build queue (which might be 5-10)
  limiter: {
    max: 10,
    duration: 60000,  // Max 10 per minute
  },
})

// Deduplication key
function getDedupeKey(projectId: string, buildSessionId: string): string {
  return `recs:${projectId}:${buildSessionId}`
}

export async function queueRecommendationsGeneration(params: {
  projectId: string
  userId: string
  buildSessionId: string
  prompt: string
}) {
  const dedupeKey = getDedupeKey(params.projectId, params.buildSessionId)

  // Check if already queued/processing
  const existing = await redis.get(dedupeKey)
  if (existing) {
    logger.info('Recommendations already queued, skipping', {
      buildSessionId: params.buildSessionId
    })
    return
  }

  // Mark as queued (TTL 5 minutes)
  await redis.set(dedupeKey, 'queued', 'EX', 300)

  await recommendationsQueue.add('generate', params, {
    jobId: dedupeKey,  // Prevents duplicate jobs
    priority: 10,  // Lower priority than builds (which might be 1-5)
  })
}
```

**In buildWorker:**

```typescript
async function processBuild(job: Job<BuildJobData>) {
  const { projectId, userId, prompt, buildSessionId } = job.data

  // Queue recommendations generation (non-blocking, lower priority)
  // Fire and forget - build doesn't wait for this
  queueRecommendationsGeneration({
    projectId,
    userId,
    buildSessionId,
    prompt,
  }).catch(err => {
    logger.warn('Failed to queue recommendations', { err, buildSessionId })
    // Non-fatal
  })

  // Continue with main build...
  const buildResult = await runBuild(job.data)
  return buildResult
}
```

**Effort:** 5-6 hours
**Risk:** Medium

---

## Phase 2: Stream Controller with Sequencing (Week 2)

### Task 2.1: Event Sequencing in Worker

**File:** `/sheenapps-claude-worker/src/services/sseSequence.ts` (new)

```typescript
// Per-session sequence counter (in Redis for distributed workers)
const SEQ_PREFIX = 'sse:seq:'
const SEQ_TTL = 3600  // 1 hour

export async function nextSeq(buildSessionId: string): Promise<number> {
  const key = `${SEQ_PREFIX}${buildSessionId}`
  const seq = await redis.incr(key)

  // Set TTL on first increment
  if (seq === 1) {
    await redis.expire(key, SEQ_TTL)
  }

  return seq
}

export async function getCurrentSeq(buildSessionId: string): Promise<number> {
  const key = `${SEQ_PREFIX}${buildSessionId}`
  const seq = await redis.get(key)
  return seq ? parseInt(seq, 10) : 0
}
```

**All SSE events now include seq:**

```typescript
function emitSSE(projectId: string, event: Omit<SSEEvent, 'seq'>) {
  const seq = await nextSeq(event.buildSessionId)
  const fullEvent = { ...event, seq }

  // ... emit to clients
}
```

**Effort:** 2-3 hours
**Risk:** Low

---

### Task 2.2: Stream Controller with Sequence Validation

**File:** `/sheenappsai/src/services/stream-controller.ts` (new)

```typescript
interface StreamOptions {
  projectId: string
  buildSessionId: string
  onEvent: (event: SSEEvent) => void
  onError: (error: Error) => void
  onReconnect: (attempt: number) => void
}

class StreamInstance {
  private abortController: AbortController
  private lastSeq: number = 0
  private reconnectAttempt: number = 0
  private maxReconnectAttempts: number = 5

  constructor(private options: StreamOptions) {
    this.abortController = new AbortController()
    this.connect()
  }

  private async connect() {
    const { projectId, buildSessionId } = this.options

    try {
      const response = await fetch(`/api/chat-plan/stream?projectId=${projectId}`, {
        headers: {
          'x-build-session-id': buildSessionId,
          'x-last-event-seq': String(this.lastSeq),  // For resumption
        },
        signal: this.abortController.signal,
      })

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      this.reconnectAttempt = 0  // Reset on successful connect

      await this.processStream(reader)

    } catch (error) {
      if (this.abortController.signal.aborted) return  // Intentional abort

      this.options.onError(error as Error)
      this.attemptReconnect()
    }
  }

  private async processStream(reader: ReadableStreamDefaultReader<Uint8Array>) {
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''  // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const event = JSON.parse(line.slice(6)) as SSEEvent

          // Validate session
          if (event.buildSessionId !== this.options.buildSessionId) {
            console.warn('Ignoring event from different session')
            continue
          }

          // Validate sequence (ignore out-of-order/duplicate)
          if (event.seq <= this.lastSeq) {
            console.warn('Ignoring out-of-order event', {
              lastSeq: this.lastSeq,
              eventSeq: event.seq
            })
            continue
          }

          this.lastSeq = event.seq
          this.options.onEvent(event)
        }
      }
    }
  }

  private attemptReconnect() {
    if (this.reconnectAttempt >= this.maxReconnectAttempts) {
      this.options.onError(new Error('Max reconnection attempts reached'))
      return
    }

    this.reconnectAttempt++
    this.options.onReconnect(this.reconnectAttempt)

    // Jittered exponential backoff
    const baseDelay = Math.min(1000 * Math.pow(2, this.reconnectAttempt - 1), 30000)
    const jitter = Math.random() * 1000
    const delay = baseDelay + jitter

    setTimeout(() => this.connect(), delay)
  }

  abort() {
    this.abortController.abort()
  }
}

class BuildStreamController {
  private activeStream: StreamInstance | null = null
  private currentBuildSessionId: string | null = null
  private eventHandlers: Map<string, Set<(event: SSEEvent) => void>> = new Map()

  connect(projectId: string, buildSessionId: string): void {
    // Close existing stream if different session
    if (this.currentBuildSessionId && this.currentBuildSessionId !== buildSessionId) {
      this.disconnect()
    }

    // Don't reconnect if already connected to same session
    if (this.activeStream && this.currentBuildSessionId === buildSessionId) {
      return
    }

    this.currentBuildSessionId = buildSessionId
    this.activeStream = new StreamInstance({
      projectId,
      buildSessionId,
      onEvent: (event) => this.dispatchEvent(event),
      onError: (error) => this.handleError(error),
      onReconnect: (attempt) => console.log(`Reconnecting... attempt ${attempt}`),
    })
  }

  disconnect(): void {
    this.activeStream?.abort()
    this.activeStream = null
    this.currentBuildSessionId = null
  }

  on(eventType: string, handler: (event: SSEEvent) => void): void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Set())
    }
    this.eventHandlers.get(eventType)!.add(handler)
  }

  off(eventType: string, handler: (event: SSEEvent) => void): void {
    this.eventHandlers.get(eventType)?.delete(handler)
  }

  private dispatchEvent(event: SSEEvent): void {
    const handlers = this.eventHandlers.get(event.type)
    handlers?.forEach(handler => handler(event))
  }

  private handleError(error: Error): void {
    console.error('Stream error:', error)
    // Could emit to error handlers here
  }
}

export const streamController = new BuildStreamController()
```

**Effort:** 6-8 hours
**Risk:** Medium

---

## Phase 3: Backend Security & Reliability (Week 2)

### Task 3.1: Request ID + Redis Dedupe for Replay Protection

**Expert insight:** Timestamp-only allows replay within TTL window. Add request-id dedupe.

**Files:**
- `/sheenappsai/src/lib/api/worker-auth.ts`
- `/sheenapps-claude-worker/src/middleware/hmacValidation.ts`

**Frontend (add request-id to headers):**

```typescript
// /src/lib/api/worker-auth.ts
export function createWorkerAuthHeaders(payload: object): HeadersInit {
  const timestamp = Date.now().toString()
  const requestId = `req_${crypto.randomUUID()}`

  const signaturePayload = `${timestamp}:${requestId}:${JSON.stringify(payload)}`
  const signature = computeHmac(signaturePayload)

  return {
    'x-sheen-timestamp': timestamp,
    'x-sheen-request-id': requestId,
    'x-sheen-signature': signature,
    'x-sheen-signature-v2': computeHmacV2(signaturePayload),  // Rollout compat
  }
}
```

**Worker (validate + dedupe):**

```typescript
// /sheenapps-claude-worker/src/middleware/hmacValidation.ts
const MAX_REQUEST_AGE_MS = 5 * 60 * 1000  // 5 minutes
const REQUEST_ID_TTL = 300  // 5 minutes in Redis
const REQUEST_ID_PREFIX = 'reqid:'

export async function validateHmacWithReplayProtection(
  request: FastifyRequest
): Promise<boolean> {
  const timestamp = request.headers['x-sheen-timestamp'] as string
  const requestId = request.headers['x-sheen-request-id'] as string
  const signature = request.headers['x-sheen-signature'] as string

  // 1. Validate timestamp freshness
  const requestTime = parseInt(timestamp, 10)
  const now = Date.now()
  if (isNaN(requestTime) || Math.abs(now - requestTime) > MAX_REQUEST_AGE_MS) {
    throw new Error('Request timestamp expired or invalid')
  }

  // 2. Check request-id hasn't been seen (replay protection)
  const redisKey = `${REQUEST_ID_PREFIX}${requestId}`
  const seen = await redis.get(redisKey)
  if (seen) {
    throw new Error('Duplicate request detected (replay)')
  }

  // 3. Validate HMAC signature
  const body = JSON.stringify(request.body)  // Or use raw body
  const expectedPayload = `${timestamp}:${requestId}:${body}`
  const expectedSignature = computeHmac(expectedPayload)

  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    throw new Error('Invalid HMAC signature')
  }

  // 4. Mark request-id as seen (with TTL)
  await redis.set(redisKey, '1', 'EX', REQUEST_ID_TTL)

  return true
}
```

**Effort:** 4-5 hours
**Risk:** Low-Medium (requires coordinated deploy)

---

### Task 3.2: Backend Locale Fallback Chain (Moved to P1)

**File:** `/sheenapps-claude-worker/src/i18n/localeUtils.ts`

```typescript
const LOCALE_FALLBACK_CHAINS: Record<string, string[]> = {
  'ar-eg': ['ar-eg', 'ar', 'en'],
  'ar-sa': ['ar-sa', 'ar', 'en'],
  'ar-ae': ['ar-ae', 'ar', 'en'],
  'ar': ['ar', 'en'],
  'fr-ma': ['fr-ma', 'fr', 'en'],
  'fr': ['fr', 'en'],
  'es': ['es', 'en'],
  'de': ['de', 'en'],
  'en': ['en'],
}

export function resolveLocaleWithFallback(requestedLocale: string): string {
  const chain = LOCALE_FALLBACK_CHAINS[requestedLocale] || ['en']

  for (const locale of chain) {
    if (hasTranslationsFor(locale)) {
      return locale
    }
  }

  return 'en'
}

// Use in message formatting
export function formatMessage(
  key: string,
  requestedLocale: string,
  params?: Record<string, unknown>
): string {
  const locale = resolveLocaleWithFallback(requestedLocale)
  const messages = loadMessages(locale)

  return new IntlMessageFormat(messages[key], locale).format(params)
}
```

**Effort:** 3-4 hours
**Risk:** Low

---

## Phase 4: Testing Gates (Week 2-3)

### Task 4.1: E2E Tests for New Behavior

**File:** `/sheenappsai/tests/e2e/build-flow.spec.ts` (new or extend)

```typescript
import { test, expect } from '@playwright/test'

test.describe('Build Flow - Recommendations', () => {
  test('shows quick suggestions immediately on build start', async ({ page }) => {
    await page.goto('/builder/new')

    // Submit a prompt
    await page.fill('[data-testid="chat-input"]', 'Create a salon website')
    await page.click('[data-testid="submit-button"]')

    // Quick suggestions should appear within 2 seconds (not waiting for build)
    await expect(page.locator('[data-testid="quick-suggestions"]')).toBeVisible({
      timeout: 2000,
    })

    // Should show relevant suggestions based on "salon"
    await expect(page.locator('text=booking')).toBeVisible()
  })

  test('swaps to AI recommendations when ready', async ({ page }) => {
    // ... setup build

    // Initially shows quick suggestions
    await expect(page.locator('[data-testid="quick-suggestions"]')).toBeVisible()

    // Wait for AI recommendations (longer timeout)
    await expect(page.locator('[data-testid="ai-recommendations"]')).toBeVisible({
      timeout: 60000,
    })

    // Quick suggestions should be replaced
    await expect(page.locator('[data-testid="quick-suggestions"]')).not.toBeVisible()
  })

  test('ignores stale recommendations from prior session', async ({ page }) => {
    // Start first build
    await page.fill('[data-testid="chat-input"]', 'Create a restaurant website')
    await page.click('[data-testid="submit-button"]')

    const firstSessionId = await page.evaluate(() =>
      window.__BUILD_SESSION_ID__
    )

    // Immediately start second build (before first completes)
    await page.fill('[data-testid="chat-input"]', 'Actually make it a salon')
    await page.click('[data-testid="submit-button"]')

    const secondSessionId = await page.evaluate(() =>
      window.__BUILD_SESSION_ID__
    )

    expect(secondSessionId).not.toBe(firstSessionId)

    // Wait for recommendations
    await expect(page.locator('[data-testid="ai-recommendations"]')).toBeVisible({
      timeout: 60000,
    })

    // Should show salon recommendations, not restaurant
    await expect(page.locator('text=booking')).toBeVisible()
    await expect(page.locator('text=reservation')).not.toBeVisible()
  })
})

test.describe('Stream Reliability', () => {
  test('reconnects on stream drop without duplicate messages', async ({ page }) => {
    await page.goto('/builder/new')
    await page.fill('[data-testid="chat-input"]', 'Create a website')
    await page.click('[data-testid="submit-button"]')

    // Wait for streaming to start
    await expect(page.locator('[data-testid="streaming-indicator"]')).toBeVisible()

    // Simulate network drop by disabling network
    await page.context().setOffline(true)
    await page.waitForTimeout(2000)
    await page.context().setOffline(false)

    // Should reconnect
    await expect(page.locator('[data-testid="streaming-indicator"]')).toBeVisible({
      timeout: 10000,
    })

    // Count messages - should not have duplicates
    const messageCount = await page.locator('[data-testid="chat-message"]').count()
    // Store count, continue build, verify no duplicates appeared
  })
})

test.describe('Locale Fallback', () => {
  test('ar-eg falls back to ar for missing translations', async ({ page }) => {
    await page.goto('/ar-eg/builder/new')

    // Submit prompt
    await page.fill('[data-testid="chat-input"]', 'Create a website')
    await page.click('[data-testid="submit-button"]')

    // Should show Arabic UI elements
    await expect(page.locator('[dir="rtl"]')).toBeVisible()

    // Error messages should be in Arabic (even if ar-eg specific not available)
    // Simulate an error state...
    await expect(page.locator('text=/[\\u0600-\\u06FF]/')).toBeVisible()  // Arabic characters
  })
})
```

**Effort:** 6-8 hours
**Risk:** Low

---

## Updated Priority Summary

### This Week (P0) - Must Do

| Task | Effort | Impact | Risk |
|------|--------|--------|------|
| 0.1 Build session + request ID system | 4-6h | High | Low |
| 0.2 Instrument metrics (precise definitions) | 6-8h | High | Low |
| 1.1 Recommendations store with readySource | 3-4h | High | Low |

**Total: ~16 hours**

### Week 2 (P1) - Should Do

| Task | Effort | Impact | Risk |
|------|--------|--------|------|
| 0.3 Server-Timing headers | 2-3h | Medium | Low |
| 1.2 Smart quick suggestions | 4-5h | Medium | Low |
| 1.3 SSE as notification, DB source of truth | 6-8h | High | Medium |
| 2.1 Event sequencing in worker | 2-3h | Medium | Low |
| 3.1 Request ID + Redis replay protection | 4-5h | High | Low-Med |
| 3.2 Backend locale fallback chain | 3-4h | Low | Low |

**Total: ~26 hours**

### Week 3 (P1/P2)

| Task | Effort | Impact | Risk |
|------|--------|--------|------|
| 1.4 Parallel recs with safeguards | 5-6h | High | Medium |
| 2.2 Stream controller with sequencing | 6-8h | Medium | Medium |
| 4.1 E2E tests for new behavior | 6-8h | High | Low |

**Total: ~20 hours**

---

## Success Metrics (Updated)

| Metric | Current (Est.) | Target | How We'll Know |
|--------|----------------|--------|----------------|
| TTFT (p50) | ~2s | <1.5s | Grafana dashboard |
| TT Recommendations (p50) | ~40s after build | <5s after build | Grafana dashboard |
| Recommendations visibility rate | Unknown | >90% | PostHog funnel |
| Stream reconnect success rate | Unknown | >95% | Error tracking |
| Duplicate event rate | Unknown | <0.1% | Logging |
| Replay attack blocks | 0 | Track count | Redis metrics |

---

## Files Summary

### New Files

| File | Purpose |
|------|---------|
| `/sheenappsai/src/lib/ids.ts` | ID generation utilities |
| `/sheenappsai/src/lib/metrics.ts` | Build metrics tracking |
| `/sheenappsai/src/store/build-session-store.ts` | Session state + sequence tracking |
| `/sheenappsai/src/store/recommendations-store.ts` | Recommendations lifecycle |
| `/sheenappsai/src/services/quick-suggestions.ts` | Smart suggestion generator |
| `/sheenappsai/src/services/stream-controller.ts` | Single stream manager |
| `/sheenappsai/src/hooks/use-recommendations-listener.ts` | SSE → fetch bridge |
| `/sheenapps-claude-worker/src/services/sseSequence.ts` | Event sequencing |
| `/sheenapps-claude-worker/src/queue/recommendationsQueue.ts` | Separate queue |
| `/sheenappsai/tests/e2e/build-flow.spec.ts` | New E2E tests |

### Modified Files

| File | Changes |
|------|---------|
| `/sheenappsai/src/lib/api/worker-auth.ts` | Add request-id |
| `/sheenapps-claude-worker/src/middleware/hmacValidation.ts` | Replay protection |
| `/sheenapps-claude-worker/src/workers/buildWorker.ts` | Queue parallel recs |
| `/sheenapps-claude-worker/src/i18n/localeUtils.ts` | Fallback chain |
| `/sheenappsai/src/app/api/persistent-chat/messages/route.ts` | Server-Timing |
| `/sheenappsai/src/components/builder/builder-chat-interface.tsx` | Use new stores |

---

*Plan Version: 2.0*
*Total Estimated Effort: ~62 hours across 3 weeks*
*Key Changes from V1: Reliability > Speed, DB is truth, sequence everything*
