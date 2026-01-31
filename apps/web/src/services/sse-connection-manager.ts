/**
 * SSE Connection Manager with Leader Election
 *
 * Production-ready after 5 rounds of expert review.
 *
 * Key features:
 * - Web Locks API with localStorage fallback
 * - Leader heartbeat + follower timeout for crash recovery
 * - Split-brain prevention via storage event listener
 * - Handles server_close named SSE events
 * - Stable tabId (stored once, handles duplicate tabs)
 *
 * Implementation of SSE_ARCHITECTURE_ANALYSIS.md Phase 1
 */

'use client'

// Debug logging control - enable via localStorage.setItem('DEBUG_SSE', 'true') or ?debug_sse URL param
const DEBUG_SSE = typeof window !== 'undefined' &&
  (localStorage.getItem('DEBUG_SSE') === 'true' || window.location.search.includes('debug_sse'))

const CHANNEL_PREFIX = 'sse-chat:'
const LOCK_PREFIX = 'sse-leader:'
const INSTANCE_KEY = 'sse-client-instance-id'
const LEADER_HEARTBEAT_MS = 3000
const LEADER_TIMEOUT_MS = 10000

// Browser instance ID (persists across sessions)
function getClientInstanceId(): string {
  if (typeof window === 'undefined') return 'ssr-placeholder'

  let id = localStorage.getItem(INSTANCE_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(INSTANCE_KEY, id)
  }
  return id
}

// FIXED: Stable per-tab ID with nonce (handles Chrome "Duplicate tab")
// Store the FULL tabId once - don't regenerate nonce on each call
function getTabId(): string {
  if (typeof window === 'undefined') return 'ssr-placeholder'

  let id = sessionStorage.getItem('sse-tab-id-full')
  if (!id) {
    const baseId = crypto.randomUUID()
    const nonce = Math.random().toString(36).slice(2, 8)
    id = `${baseId}-${nonce}`
    sessionStorage.setItem('sse-tab-id-full', id)
  }
  return id
}

type LeadershipMode = 'weblocks' | 'localstorage' | null

interface SSEMessage {
  type: 'event' | 'status' | 'leader-heartbeat' | 'leader-change'
  payload: any
  timestamp: number
}

interface LeaderHeartbeatPayload {
  leaderTabId: string
  leaderSince: number
  state: 'connected' | 'connecting' | 'error'
}

export interface EventPayload {
  data: any
  lastEventId: string | null
  parseError?: boolean
  raw?: string
}

interface ConnectionConfig {
  projectId: string
  userId: string
  onMessage: (event: EventPayload) => void
  onStatusChange: (status: ConnectionStatus) => void
}

export type ConnectionStatus =
  | { state: 'disconnected' }
  | { state: 'connecting' }
  | { state: 'connected'; isLeader: boolean }
  | { state: 'error'; error: string; retryIn?: number }

export class SSEConnectionManager {
  // CRITICAL FIX: Support multiple subscribers instead of single config
  private subscribers = new Map<string, ConnectionConfig>()
  private projectId: string | null = null
  private userId: string | null = null
  private lastKnownStatus: ConnectionStatus = { state: 'disconnected' }

  private broadcast: BroadcastChannel | null = null
  private eventSource: EventSource | null = null
  private lastEventId: string | null = null // EXPERT FIX: Store last event ID for deterministic resume
  private isLeader = false
  private leadershipMode: LeadershipMode = null
  private lockController: AbortController | null = null
  private retryCount = 0
  private retryTimeout: ReturnType<typeof setTimeout> | null = null
  private clientInstanceId: string
  private tabId: string
  private leaderSince = 0

  // Heartbeat tracking
  private leaderHeartbeatInterval: ReturnType<typeof setInterval> | null = null
  private leaderTimeoutTimer: ReturnType<typeof setTimeout> | null = null
  private receivedFirstHeartbeat = false

  // localStorage lease
  private leaseRenewalInterval: ReturnType<typeof setInterval> | null = null
  private storageEventHandler: ((e: StorageEvent) => void) | null = null
  private leaseGeneration = 0

  // Reference counting for React hooks
  private refCount = 0

  // Setup promise to ensure connectIfNeeded() is idempotent (concurrent-safe)
  private setupPromise: Promise<void> | null = null

  // Guard against concurrent acquireLeadership() calls
  private acquiringLeadership = false

  // Singleton per (projectId + userId)
  private static instances = new Map<string, SSEConnectionManager>()

  static getInstance(projectId: string, userId: string): SSEConnectionManager {
    const key = `${projectId}:${userId}`
    let instance = this.instances.get(key)
    if (!instance) {
      instance = new SSEConnectionManager(projectId, userId)
      this.instances.set(key, instance)
    }
    return instance
  }

  private constructor(projectId: string, userId: string) {
    this.projectId = projectId
    this.userId = userId
    this.clientInstanceId = getClientInstanceId()
    this.tabId = getTabId()
    if (DEBUG_SSE) console.log('[SSE] Created new manager instance', { projectId, userId })
  }

  /**
   * Emit status update to all subscribers
   */
  private emitStatus(status: ConnectionStatus) {
    this.lastKnownStatus = status
    if (DEBUG_SSE) console.log(`[SSE] Emitting status to ${this.subscribers.size} subscribers`, { status })
    for (const [subscriberId, sub] of this.subscribers.entries()) {
      try {
        if (DEBUG_SSE) console.log(`[SSE] Calling subscriber ${subscriberId}`)
        sub.onStatusChange(status)
      } catch (err) {
        console.error(`[SSE] Subscriber ${subscriberId} onStatusChange threw:`, err)
      }
    }
  }

  /**
   * Emit event to all subscribers
   */
  private emitEvent(payload: EventPayload) {
    for (const [subscriberId, sub] of this.subscribers.entries()) {
      try {
        sub.onMessage(payload)
      } catch (err) {
        console.error(`[SSE] Subscriber ${subscriberId} onMessage threw:`, err)
      }
    }
  }

  /**
   * Subscribe a React consumer to this manager instance
   */
  subscribe(config: ConnectionConfig, subscriberId: string) {
    if (DEBUG_SSE) console.log('[SSE] subscribe() called', { subscriberId, projectId: config.projectId })

    // Note: projectId/userId are set in constructor, not here
    this.subscribers.set(subscriberId, config)

    // Immediately replay last known status so new mounts sync instantly
    try {
      if (DEBUG_SSE) console.log('[SSE] Replaying last known status to new subscriber', { subscriberId, status: this.lastKnownStatus })
      config.onStatusChange(this.lastKnownStatus)
    } catch (err) {
      console.error('[SSE] Initial status replay threw:', err)
    }
  }

  /**
   * Unsubscribe a React consumer
   */
  unsubscribe(subscriberId: string) {
    if (DEBUG_SSE) console.log('[SSE] unsubscribe() called', { subscriberId })
    this.subscribers.delete(subscriberId)
  }

  /**
   * Connect if needed (replaces old connect logic)
   *
   * CRITICAL: This is idempotent and concurrent-safe.
   * Multiple calls will share the same setup promise and not race.
   */
  async connectIfNeeded(): Promise<void> {
    if (DEBUG_SSE) console.log('[SSE] connectIfNeeded() called', {
      hasSubscribers: this.subscribers.size > 0,
      isHealthy: !!(this.broadcast && (this.eventSource || this.leaderTimeoutTimer)),
      setupInProgress: !!this.setupPromise
    })

    // ✅ Don't do expensive setup if there are zero subscribers
    if (this.subscribers.size === 0) {
      if (DEBUG_SSE) console.log('[SSE] No subscribers, skipping connectIfNeeded')
      return
    }

    // If already healthy, skip
    const isHealthy = this.broadcast && (this.eventSource || this.leaderTimeoutTimer)
    if (isHealthy) {
      if (DEBUG_SSE) console.log('[SSE] Already healthy, skipping setup')
      return
    }

    // If setup is in progress, wait for it
    if (this.setupPromise) {
      if (DEBUG_SSE) console.log('[SSE] Setup already in progress, waiting...')
      await this.setupPromise
      return
    }

    // Start setup
    if (DEBUG_SSE) console.log('[SSE] Starting setup...')
    this.setupPromise = (async () => {
      try {
        this.setupBroadcastChannel()
        this.setupStorageListener()
        await this.acquireLeadership()
      } finally {
        // Clear promise so next call can setup again if needed
        this.setupPromise = null
      }
    })()

    await this.setupPromise
  }

  /**
   * @deprecated REMOVED - Use subscribe() + connectIfNeeded() instead
   *
   * Migration example:
   * ```typescript
   * // Old (DON'T USE):
   * manager.connect({ projectId, userId, onMessage, onStatusChange })
   *
   * // New (CORRECT):
   * const subscriberId = crypto.randomUUID()
   * manager.subscribe({ projectId, userId, onMessage, onStatusChange }, subscriberId)
   * manager.connectIfNeeded()
   * // Cleanup:
   * manager.unsubscribe(subscriberId)
   * ```
   */
  public connect(..._args: never[]): never {
    throw new Error(
      '[SSE] connect() is deprecated and removed. Use subscribe() + connectIfNeeded() instead. ' +
      'See SSEConnectionManager.subscribe() documentation for migration guide.'
    )
  }

  private setupBroadcastChannel(): void {
    if (!this.projectId || !this.userId) return
    const channelName = `${CHANNEL_PREFIX}${this.projectId}:${this.userId}`
    this.broadcast = new BroadcastChannel(channelName)

    this.broadcast.onmessage = (event: MessageEvent<SSEMessage>) => {
      const msg = event.data

      switch (msg.type) {
        case 'event':
          this.emitEvent(msg.payload as EventPayload)
          break

        case 'status':
          if (!this.isLeader) {
            this.emitStatus(msg.payload)
          }
          break

        case 'leader-heartbeat': {
          const hb = msg.payload as LeaderHeartbeatPayload

          // ✅ Leaders should NOT run follower timeout logic
          if (this.isLeader) return

          // ✅ Extra safety: ignore heartbeats from ourselves
          if (hb.leaderTabId === this.tabId) return

          this.resetLeaderTimeout()

          if (!this.receivedFirstHeartbeat) {
            this.receivedFirstHeartbeat = true
            if (hb.state === 'connected') {
              this.emitStatus({ state: 'connected', isLeader: false })
            }
          }
          break
        }

        case 'leader-change': {
          // ✅ Don't react to our own leader-change messages
          const payload = msg.payload as { fromTabId?: string }
          if (payload?.fromTabId === this.tabId) return

          if (!this.isLeader) {
            this.receivedFirstHeartbeat = false
            // Guard: only acquire if projectId/userId are set (avoids race if message arrives before subscribe)
            if (this.projectId && this.userId) {
              this.acquireLeadership()
            }
          }
          break
        }
      }
    }
  }

  private setupStorageListener(): void {
    if (!this.projectId || !this.userId) return
    const leaseKey = `${LOCK_PREFIX}${this.projectId}:${this.userId}`

    this.storageEventHandler = (e: StorageEvent) => {
      if (e.key !== leaseKey) return

      // FIXED: Only check if we're the leader AND using localStorage mode
      if (this.isLeader && this.leadershipMode === 'localstorage') {
        try {
          const newLease = e.newValue ? JSON.parse(e.newValue) : null
          if (!newLease || newLease.holder !== this.tabId) {
            console.warn('[SSE] Lost localStorage lease - stepping down')
            this.stepDownAsLeader()
          }
        } catch {
          this.stepDownAsLeader()
        }
      }
    }

    window.addEventListener('storage', this.storageEventHandler)
  }

  private removeStorageListener(): void {
    if (this.storageEventHandler) {
      window.removeEventListener('storage', this.storageEventHandler)
      this.storageEventHandler = null
    }
  }

  private stepDownAsLeader(): void {
    if (!this.isLeader) return

    this.eventSource?.close()
    this.eventSource = null
    this.stopLeaderHeartbeat()
    this.isLeader = false
    this.leadershipMode = null

    this.broadcastToFollowers({
      type: 'leader-change',
      payload: { fromTabId: this.tabId },
      timestamp: Date.now()
    })

    this.becomeFollower()
  }

  /**
   * Acquire leadership using Web Locks API or localStorage fallback
   * @param force If true, waits for lock instead of giving up immediately (for manual reconnection)
   */
  private async acquireLeadership(force: boolean = false): Promise<void> {
    // Guard against being called before connect() (e.g., from broadcast handler)
    if (!this.projectId || !this.userId) {
      console.warn('[SSE] acquireLeadership called before subscribe()')
      return
    }

    // ✅ CRITICAL FIX: Don't re-acquire if already leader or acquiring
    if (this.isLeader) {
      if (DEBUG_SSE) console.log('[SSE] Already leader, skipping acquireLeadership')
      return
    }

    // ✅ CRITICAL FIX: Prevent concurrent acquireLeadership() calls
    if (this.acquiringLeadership) {
      if (DEBUG_SSE) console.log('[SSE] Leadership acquisition already in progress, skipping')
      return
    }

    this.acquiringLeadership = true

    const lockName = `${LOCK_PREFIX}${this.projectId}:${this.userId}`

    if ('locks' in navigator) {
      try {
        // CRITICAL FIX: Cannot use ifAvailable + signal together per Web Locks spec
        // "WebLockOptions's steal and ifAvailable need to be false when a signal is provided"
        //
        // For automatic leadership: use ifAvailable to prevent hanging
        // For manual reconnect: wait for lock (no options) to force leadership
        const lockOptions = force ? {} : { ifAvailable: true }

        await navigator.locks.request(
          lockName,
          lockOptions,
          async (lock) => {
            if (!lock) {
              // ✅ CRITICAL: Safety net - don't demote if we already became leader
              if (this.isLeader) {
                if (DEBUG_SSE) console.log('[SSE] Lock not available, but already leader — ignoring')
                this.acquiringLeadership = false
                return
              }
              // Lock not available - become follower (only possible with ifAvailable: true)
              if (DEBUG_SSE) console.log('[SSE] Lock not available, becoming follower')
              this.becomeFollower()
              this.acquiringLeadership = false
              return
            }

            this.leadershipMode = 'weblocks'
            this.becomeLeader()
            this.acquiringLeadership = false

            // Hold the lock until we manually release it
            // Note: Without AbortController, we must call disconnect() to release
            return new Promise<void>((resolve) => {
              // Lock will be held until disconnect() is called
              // Store resolve function for manual release if needed
              this.lockController = { abort: () => resolve() } as AbortController
            })
          }
        )
      } catch (err: any) {
        console.error('[SSE] Lock acquisition failed, falling back to localStorage:', err)
        this.acquiringLeadership = false
        this.acquireLeadershipViaLocalStorage()
      }
    } else {
      this.acquireLeadershipViaLocalStorage()
      this.acquiringLeadership = false
    }
  }

  private acquireLeadershipViaLocalStorage(): void {
    // Guard against being called before connect()
    if (!this.projectId || !this.userId) {
      console.warn('[SSE] acquireLeadershipViaLocalStorage called before subscribe()')
      return
    }

    const leaseKey = `${LOCK_PREFIX}${this.projectId}:${this.userId}`
    const now = Date.now()
    const leaseData = localStorage.getItem(leaseKey)

    if (leaseData) {
      try {
        const { holder, expires, generation } = JSON.parse(leaseData)
        if (expires > now && holder !== this.tabId) {
          // Lease held by another tab
          this.becomeFollower()
          const checkDelay = (expires - now) + 100 + Math.random() * 200
          setTimeout(() => this.acquireLeadershipViaLocalStorage(), checkDelay)
          return
        }
        this.leaseGeneration = (generation || 0) + 1
      } catch {
        this.leaseGeneration = 1
      }
    } else {
      this.leaseGeneration = 1
    }

    // Try to acquire lease
    const newLease = {
      holder: this.tabId,
      expires: now + 30000,
      generation: this.leaseGeneration
    }
    localStorage.setItem(leaseKey, JSON.stringify(newLease))

    // Verify we got the lease (check for race conditions)
    setTimeout(() => {
      const check = localStorage.getItem(leaseKey)
      try {
        const parsed = check ? JSON.parse(check) : null
        if (parsed && parsed.holder === this.tabId && parsed.generation === this.leaseGeneration) {
          this.leadershipMode = 'localstorage'
          this.becomeLeader()
          this.startLeaseRenewal(leaseKey)
        } else {
          this.becomeFollower()
        }
      } catch {
        this.becomeFollower()
      }
    }, 50 + Math.random() * 100)
  }

  private startLeaseRenewal(leaseKey: string): void {
    this.stopLeaseRenewal()

    this.leaseRenewalInterval = setInterval(() => {
      if (!this.isLeader || this.leadershipMode !== 'localstorage') {
        this.stopLeaseRenewal()
        return
      }
      const newLease = {
        holder: this.tabId,
        expires: Date.now() + 30000,
        generation: this.leaseGeneration
      }
      localStorage.setItem(leaseKey, JSON.stringify(newLease))
    }, 15000)
  }

  private stopLeaseRenewal(): void {
    if (this.leaseRenewalInterval) {
      clearInterval(this.leaseRenewalInterval)
      this.leaseRenewalInterval = null
    }
  }

  private becomeLeader(): void {
    // ✅ Guard: If disconnected (no broadcast channel), abort
    if (!this.broadcast) {
      if (DEBUG_SSE) console.log('[SSE] Aborting becomeLeader - instance disconnected')
      return
    }

    this.stopLeaderTimeout()
    this.isLeader = true
    this.leaderSince = Date.now()
    console.log('[SSE] Became leader for project:', this.projectId)
    this.emitStatus({ state: 'connecting' })
    this.startLeaderHeartbeat()
    this.connectEventSource()
  }

  private becomeFollower(): void {
    // ✅ Guard: If disconnected (no broadcast channel), abort
    if (!this.broadcast) {
      if (DEBUG_SSE) console.log('[SSE] Aborting becomeFollower - instance disconnected')
      return
    }

    // ✅ CRITICAL: Followers must never hold EventSource
    if (this.eventSource) {
      if (DEBUG_SSE) console.log('[SSE] Closing EventSource during demotion to follower')
      this.eventSource.close()
      this.eventSource = null
    }

    this.isLeader = false
    this.leadershipMode = null
    this.receivedFirstHeartbeat = false
    this.stopLeaderHeartbeat()
    this.resetLeaderTimeout() // Start timeout to detect dead leader
    // FIXED: Followers start as 'connecting', transition on first heartbeat
    this.emitStatus({ state: 'connecting' })
    console.log('[SSE] Became follower for project:', this.projectId)
  }

  private startLeaderHeartbeat(): void {
    this.stopLeaderHeartbeat()
    this.sendHeartbeat()
    this.leaderHeartbeatInterval = setInterval(() => this.sendHeartbeat(), LEADER_HEARTBEAT_MS)
  }

  private sendHeartbeat(): void {
    const payload: LeaderHeartbeatPayload = {
      leaderTabId: this.tabId,
      leaderSince: this.leaderSince,
      state: this.eventSource?.readyState === EventSource.OPEN ? 'connected' : 'connecting'
    }
    this.broadcastToFollowers({
      type: 'leader-heartbeat',
      payload,
      timestamp: Date.now()
    })
  }

  private stopLeaderHeartbeat(): void {
    if (this.leaderHeartbeatInterval) {
      clearInterval(this.leaderHeartbeatInterval)
      this.leaderHeartbeatInterval = null
    }
  }

  private resetLeaderTimeout(): void {
    if (this.leaderTimeoutTimer) clearTimeout(this.leaderTimeoutTimer)
    this.leaderTimeoutTimer = setTimeout(() => {
      console.warn('[SSE] Leader heartbeat timeout - attempting to become leader', {
        isLeader: this.isLeader,
        subscribers: this.subscribers.size
      })
      this.receivedFirstHeartbeat = false
      this.acquireLeadership()
    }, LEADER_TIMEOUT_MS)
  }

  private stopLeaderTimeout(): void {
    if (this.leaderTimeoutTimer) {
      clearTimeout(this.leaderTimeoutTimer)
      this.leaderTimeoutTimer = null
    }
  }

  private connectEventSource(): void {
    if (!this.projectId) return

    const url = new URL('/api/persistent-chat/stream', window.location.origin)
    url.searchParams.set('project_id', this.projectId)
    url.searchParams.set('client_instance_id', this.clientInstanceId)

    // EXPERT FIX: Add lastEventId for deterministic resume across EventSource reconnects
    if (this.lastEventId) {
      url.searchParams.set('since', this.lastEventId)
    }

    console.log('[SSE] Connecting EventSource:', url.toString())
    this.eventSource = new EventSource(url.toString())

    this.eventSource.onopen = () => {
      console.log('[SSE] Connection opened')
      this.retryCount = 0
      const status: ConnectionStatus = { state: 'connected', isLeader: true }
      this.emitStatus(status)
      this.broadcastToFollowers({ type: 'status', payload: status, timestamp: Date.now() })
    }

    this.eventSource.onmessage = (event) => {
      // EXPERT FIX: Store lastEventId for deterministic resume
      this.lastEventId = event.lastEventId || this.lastEventId

      let eventPayload: EventPayload
      try {
        const data = JSON.parse(event.data)
        eventPayload = { data, lastEventId: event.lastEventId || null }
      } catch {
        eventPayload = { data: null, lastEventId: event.lastEventId || null, parseError: true, raw: event.data }
      }
      this.emitEvent(eventPayload)
      this.broadcastToFollowers({ type: 'event', payload: eventPayload, timestamp: Date.now() })
    }

    // Handle named server_close event
    this.eventSource.addEventListener('server_close', (event) => {
      const messageEvent = event as MessageEvent
      console.log('[SSE] Received server_close event:', messageEvent.data)
      try {
        const data = JSON.parse(messageEvent.data)
        if (data.reason === 'replaced' || data.reason === 'replaced_by_reconnect') {
          this.eventSource?.close()
          this.eventSource = null
          this.retryCount = 0

          // FIXED: Broadcast reconnecting status to followers
          const status: ConnectionStatus = { state: 'connecting' }
          this.emitStatus(status)
          this.broadcastToFollowers({ type: 'status', payload: status, timestamp: Date.now() })

          // FIXED: Add jitter to prevent sync across browser instances
          const delay = 100 + Math.random() * 300
          setTimeout(() => this.connectEventSource(), delay)
        }
      } catch (err) {
        console.error('[SSE] Failed to parse server_close event:', err)
      }
    })

    this.eventSource.onerror = () => {
      this.handleConnectionError()
    }
  }

  private handleConnectionError(): void {
    this.eventSource?.close()
    this.eventSource = null

    const isExhausted = this.retryCount >= 5
    const baseDelay = 1000 * Math.pow(2, Math.min(this.retryCount, 5))
    const jitter = Math.random() * 600
    const delay = baseDelay + jitter

    this.retryCount++

    const status: ConnectionStatus = {
      state: 'error',
      error: isExhausted ? 'Connection unstable - retrying...' : 'Connection lost',
      retryIn: delay
    }
    this.emitStatus(status)
    this.broadcastToFollowers({ type: 'status', payload: status, timestamp: Date.now() })

    if (DEBUG_SSE) console.log('[SSE] Connection error, retrying in', Math.round(delay), 'ms')

    this.retryTimeout = setTimeout(() => {
      this.emitStatus({ state: 'connecting' })
      this.connectEventSource()
    }, delay)
  }

  private broadcastToFollowers(message: SSEMessage): void {
    this.broadcast?.postMessage(message)
  }

  disconnect(): void {
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout)
      this.retryTimeout = null
    }
    this.stopLeaderHeartbeat()
    this.stopLeaderTimeout()
    this.stopLeaseRenewal()
    this.removeStorageListener()

    if (this.eventSource) {
      this.eventSource.close()
      this.eventSource = null
    }

    if (this.isLeader) {
      this.broadcastToFollowers({ type: 'leader-change', payload: { fromTabId: this.tabId }, timestamp: Date.now() })
      this.lockController?.abort()
      this.lockController = null
      if (this.projectId && this.userId) {
        const leaseKey = `${LOCK_PREFIX}${this.projectId}:${this.userId}`
        localStorage.removeItem(leaseKey)
      }
    }

    this.isLeader = false
    this.leadershipMode = null
    this.receivedFirstHeartbeat = false
    this.broadcast?.close()
    this.broadcast = null
    this.subscribers.clear()

    // ✅ CRITICAL: Clear setup promise and leadership acquisition flag
    this.setupPromise = null
    this.acquiringLeadership = false

    // NOTE: Don't clear projectId/userId - they're set once in constructor
  }

  addRef(): void {
    this.refCount++
  }

  releaseRef(): boolean {
    this.refCount--
    if (this.refCount <= 0) {
      if (DEBUG_SSE) console.log('[SSE] refCount reached 0, disconnecting but keeping singleton instance')
      this.disconnect()
      // ✅ CRITICAL FIX: Don't delete instance from singleton map!
      // Async acquireLeadership() may still be running. Deleting the instance
      // causes a "zombie leader" with 0 subscribers while new instance becomes follower.
      // Keep instance in map as dormant singleton that can be reused.
      return true
    }
    return false
  }

  /**
   * Force reconnection from any tab (leader or follower)
   *
   * If already leader: closes and reopens connection
   * If follower: forcefully takes over leadership with timeout
   */
  forceReconnect(): void {
    if (this.isLeader) {
      // Already leader: reset retry count and reconnect
      this.retryCount = 0
      this.eventSource?.close()
      this.eventSource = null
      this.connectEventSource()
    } else {
      // Follower: FORCE leadership takeover with timeout
      if (DEBUG_SSE) console.log('[SSE] Follower tab forcing leadership takeover for reconnection')

      // Try to acquire leadership with a 3-second timeout
      const timeoutPromise = new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error('Leadership acquisition timeout')), 3000)
      })

      Promise.race([
        this.acquireLeadership(true),
        timeoutPromise
      ]).catch(err => {
        console.warn('[SSE] Force leadership timed out, falling back to localStorage', err)
        // Timeout or failure: force leadership via localStorage (more aggressive)
        this.acquireLeadershipViaLocalStorage()
      })
    }
  }

  // Getters for status
  getIsLeader(): boolean {
    return this.isLeader
  }

  getIsConnected(): boolean {
    return this.eventSource?.readyState === EventSource.OPEN
  }
}
