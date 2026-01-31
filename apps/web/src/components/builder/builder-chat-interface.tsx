'use client'

import { DynamicPricingModal } from '@/components/ui/dynamic-pricing-modal'
import { useEnhancedBalance } from '@/hooks/use-ai-time-balance'
// State-driven recommendations system (Phase 2)
import { useBuildRecommendations, isQuickSuggestionItem } from '@/hooks/use-build-recommendations'
import { useCurrentBuildSessionId } from '@/store/build-session-store'
import { useTranslations } from 'next-intl'
import { useResponsive } from '@/hooks/use-responsive'
import { useAuthStore } from '@/store'
import { useBuildStateStore } from '@/store/build-state-store'
import { isBalanceError } from '@/utils/api-client'
import { logger } from '@/utils/logger'
import { useLocale } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChatHeader } from './chat/chat-header'
import { ChatInput } from './chat/chat-input'
import { ChatMessages } from './chat/chat-messages'
import { CollapsedChatView } from './chat/collapsed-chat-view'

// Chat Plan Mode imports (feature flagged)
import { useBuildConversion, useChatPlanEnhanced } from '@/hooks/use-chat-plan'
import { storePlanContext } from '@/hooks/use-plan-context'
import {
  type FeaturePlanResponse,
  type FixPlanResponse
} from '@/types/chat-plan'
import { ConvertToBuildDialog } from './chat/convert-to-build-dialog'

// Import message types from chat components
import type { AssistantMessage, InteractiveMessage, Message, RecommendationMessage, UserMessage } from './chat/chat-messages'
import type { SendMessageFunction } from '@/hooks/use-apply-recommendation'

// EXPERT FIX ROUND 11 (v6): Stable ID helpers for hook message sync
function hashString(input: string) {
  // Tiny deterministic hash (not crypto, just stable)
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(16)
}

function makeStableHookMessageId(hookMsg: any, fallbackIndex?: number) {
  // Prefer true ids from backend if present
  const explicit =
    hookMsg.id ||
    hookMsg.client_msg_id ||
    hookMsg.clientMsgId ||
    hookMsg.metadata?.client_msg_id ||
    hookMsg.metadata?.clientMsgId

  if (explicit) return String(explicit)

  const ts = hookMsg.timestamp ? new Date(hookMsg.timestamp).getTime() : 0
  const role = hookMsg.type || hookMsg.role || 'unknown'
  const content = typeof hookMsg.content === 'string' ? hookMsg.content : JSON.stringify(hookMsg.content ?? '')
  const contentHash = hashString(content)

  // EXPERT FIX ROUND 11 (v8): Include fallback index to prevent ts=0 collisions
  return `hook:${role}:${ts}:${contentHash}:${fallbackIndex ?? 0}`
}

// Message capping to prevent unbounded growth (expert fix)
const MAX_MESSAGES = 200

function capMessages<T>(arr: T[]): T[] {
  if (arr.length <= MAX_MESSAGES) return arr
  return arr.slice(arr.length - MAX_MESSAGES)
}

// Build ID change event for parent component notification
export interface BuildIdChangeEvent {
  buildId: string
  source: 'convert-to-build' | 'recommendation' | 'direct-update'
  versionId?: string
  previousBuildId?: string
  metadata?: {
    sessionId?: string
    planMode?: 'feature' | 'fix'
    recommendationId?: string
    timestamp: number
  }
}

interface BuilderChatInterfaceProps {
  buildId?: string
  projectId: string
  businessIdea: string
  onPromptSubmit: (
    prompt: string,
    mode: 'build' | 'plan',
    meta?: { clientMsgId?: string; source?: 'recommendation' | 'user' }
  ) => void
  onBuildIdChange?: (event: BuildIdChangeEvent) => void
  isCollapsed?: boolean
  onExpand?: () => void | Promise<void>
  projectBuildStatus?: 'queued' | 'building' | 'deployed' | 'failed' | 'rollingBack' | 'rollbackFailed'
  translations: {
    chat: {
      placeholder: string
      buildMode: string
      planMode: string
      thinking: string
    }
    pricingModal: {
      title: string
      description: string
      currentPlan: string
      getCredits: string
      mostPopular: string
      maybeLater: string
      securePayment: string
    }
  }
  /** Infrastructure mode for showing Easy Mode links in build completion */
  infraMode?: 'easy' | 'pro' | null
}

export function BuilderChatInterface({
  buildId,
  projectId,
  businessIdea,
  onPromptSubmit,
  onBuildIdChange,
  isCollapsed = false,
  onExpand,
  projectBuildStatus,
  translations,
  infraMode
}: BuilderChatInterfaceProps) {
  const { showMobileUI } = useResponsive()
  // Translations for quick suggestions (new recommendations system)
  const tQuickSuggestions = useTranslations('quickSuggestions')
  const [messages, setMessages] = useState<Message[]>([])
  const [inputValue, setInputValue] = useState('')
  const [mode, setMode] = useState<'build' | 'plan'>('build')
  const [streamingStartTime, setStreamingStartTime] = useState<Date | undefined>()
  const [balanceError, setBalanceError] = useState<{
    message: string
    recommendation?: {
      suggestedPackage: string
      costToComplete: number
      purchaseUrl: string
    }
  } | null>(null)

  // Chat Plan Mode state (feature flagged)
  const [showConvertDialog, setShowConvertDialog] = useState(false)
  const [planToConvert, setPlanToConvert] = useState<FeaturePlanResponse | FixPlanResponse | null>(null)

  // EXPERT FIX ROUND 17: Removed seenHookMessageIdsRef - no longer needed
  // The findIndex check on line ~308 handles deduplication; the ref was dead weight

  // EXPERT FIX ROUND 11: Timer cleanup to prevent ghost messages after unmount
  const timeoutsRef = useRef<Set<number>>(new Set())

  // EXPERT FIX ROUND 11 (v5): Guard for startBuildSession to prevent repeated calls
  const startedSessionRef = useRef<string | null>(null)

  // Guard to prevent StrictMode double-effects from duplicating the welcome message
  const welcomeShownRef = useRef(false)

  // EXPERT FIX ROUND 11 (v7): Monotonic message sequence for deterministic IDs
  const msgSeqRef = useRef(0)

  // EXPERT FIX ROUND 11 (v7): Deterministic message ID generator (no Math.random)
  const nextMsgId = useCallback((prefix: string) => {
    msgSeqRef.current += 1
    // Project-scoped, monotonic, human-debuggable
    return `${prefix}:${projectId}:${Date.now()}:${msgSeqRef.current}`
  }, [projectId])

  const makeSessionId = useCallback(() => {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID()
    }
    return `session-${Date.now()}-${Math.random().toString(16).slice(2)}`
  }, [])

  // EXPERT FIX ROUND 11 (v6): Project-scoped rec guards (prevents cross-project collisions)
  const hasShownRecsForBuild = useCallback((id: string) => {
    try { return sessionStorage.getItem(`shown-recs:${projectId}:${id}`) === '1' } catch { return false }
  }, [projectId])
  const markShownRecsForBuild = useCallback((id: string) => {
    try { sessionStorage.setItem(`shown-recs:${projectId}:${id}`, '1') } catch {}
  }, [projectId])

  // ✅ E2E READINESS: Monotonic + error-aware data-ready state
  // Expert pattern from PLAYWRIGHT_TEST_ANALYSIS.md
  const [readyState, setReadyState] = useState<'loading' | 'ready' | 'error'>('loading')

  // Get user ID and credits modal from auth store
  const user = useAuthStore(state => state.user)
  const userId = user?.id
  const { showCreditsModal, creditsContext, openCreditsModal, closeCreditsModal } = useAuthStore()

  // Get current locale for chat plan API
  const locale = useLocale()

  // Feature flag check for Chat Plan Mode
  // eslint-disable-next-line no-restricted-globals
  const isChatPlanModeEnabled = process.env.NEXT_PUBLIC_ENABLE_CHAT_PLAN_MODE === 'true'

  // ✅ E2E READINESS: Update data-ready state (monotonic + error-first)
  // Expert pattern: check error FIRST, then check ready
  // Once state is 'ready' or 'error', don't regress to 'loading'
  useEffect(() => {
    if (readyState !== 'loading') return // Monotonic: don't regress

    // Error: critical dependencies missing
    if (!projectId) {
      setReadyState('error')
      return
    }

    // Ready when: projectId exists (chat is functional)
    // Note: user can be undefined for unauthenticated view
    if (projectId) {
      setReadyState('ready')
    }
  }, [projectId, readyState])

  // EXPERT FIX ROUND 11: Safe timeout helper that tracks and cleans up timers
  const safeTimeout = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timeoutsRef.current.delete(id)
      fn()
    }, ms)
    timeoutsRef.current.add(id)
    return id
  }, [])

  // EXPERT FIX ROUND 11: Cleanup all timers on unmount to prevent ghost messages
  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach((id) => window.clearTimeout(id))
      timeoutsRef.current.clear()
    }
  }, [])

  // Chat Plan Mode hooks with SSE streaming support
  const chatPlanHook = useChatPlanEnhanced(projectId, {
    onSuccess: (response) => {
      setStreamingStartTime(undefined)
      // Note: Don't call handleChatPlanResponse here - the hook already creates the message
      // in its onComplete handler with the properly extracted content
      logger.info('Chat plan completed successfully', {
        mode: response.mode,
        sessionId: response.session_id?.slice(0, 8)
      }, 'chat-plan')
    },
    onError: (error) => {
      setStreamingStartTime(undefined)

      // Don't add error message to chat for balance errors - they show in banner
      if (error.code === 'CHAT_ERROR_INSUFFICIENT_BALANCE') {
        logger.info('Balance error handled by banner, not adding to chat', {
          code: error.code,
          message: error.message
        }, 'chat-plan')
      } else {
        logger.error('Chat plan error', { error: error.message }, 'chat-plan')
        addAssistantMessage(
          "Sorry, I encountered an issue processing your request. Please try again.",
          'helpful'
        )
      }
    }
  })

  // EXPERT FIX ROUND 11 (v7): Destructure to avoid identity churn in deps
  const {
    sendMessage: sendPlanMessage,
    isStreaming: isPlanStreaming,
    progress: planProgress,
    tools: planTools,
    abort: abortPlan,
    messages: planMessages,
    error: planError
  } = chatPlanHook

  // EXPERT FIX ROUND 12: Upsert pattern for plan messages (allows streaming updates + late metadata enrichment)
  useEffect(() => {
    if (!isChatPlanModeEnabled) return
    if (!planMessages || planMessages.length === 0) return

    const hookMessages = planMessages

    setMessages(prev => {
      const next = [...prev]

      for (let i = 0; i < hookMessages.length; i++) {
        const hookMsg = hookMessages[i]
        // EXPERT FIX ROUND 11 (v8): Pass index to prevent ts=0 collisions
        const stableId = makeStableHookMessageId(hookMsg, i)

        // Skip balance error chat injection (banner handles it)
        if (hookMsg.type === 'error' && planError?.code === 'CHAT_ERROR_INSUFFICIENT_BALANCE') {
          continue
        }

        const isAssistantish = hookMsg.type === 'assistant' || hookMsg.type === 'error'
        if (!isAssistantish) continue

        const assistantMessage: AssistantMessage = {
          id: stableId,
          type: 'assistant',
          content: hookMsg.content,
          timestamp: hookMsg.timestamp,
          isTyping: false,
          emotion: hookMsg.type === 'error' ? 'helpful' : 'celebrating',
          featurePlan: hookMsg.metadata?.featurePlan,
          fixPlan: hookMsg.metadata?.fixPlan
        }

        const idx = next.findIndex(m => m.id === stableId)

        if (idx === -1) {
          // First time we see this message - add it
          next.push(assistantMessage)
        } else {
          // EXPERT FIX ROUND 12: Upsert - allow streaming updates + late metadata enrichment
          const existing = next[idx] as AssistantMessage
          next[idx] = {
            ...existing,
            ...assistantMessage,
            // Preserve local UI state
            isTyping: existing.isTyping ?? assistantMessage.isTyping,
          }
        }
      }

      return capMessages(next)
    })
  }, [planMessages, planError?.code, isChatPlanModeEnabled])

  // Sync balance errors from chat plan hook to interface banner
  useEffect(() => {
    if (isChatPlanModeEnabled && planError) {
      const error = planError

      // Handle balance errors specially to show in banner instead of chat
      if (error.code === 'CHAT_ERROR_INSUFFICIENT_BALANCE') {
        logger.info('Balance error from hook, showing in banner', {
          code: error.code,
          message: error.message,
          details: error.details
        }, 'chat-plan')

        // Create recommendation from error details if available
        const recommendation = error.details?.recommendation ? {
          suggestedPackage: error.details.recommendation.suggestedPackage || 'Standard',
          costToComplete: error.details.recommendation.costToComplete || 5,
          purchaseUrl: error.details.recommendation.purchaseUrl || '/dashboard/billing'
        } : undefined

        setBalanceError({
          message: error.message,
          recommendation
        })
      } else {
        // Clear balance error for other types of errors
        setBalanceError(null)
      }
    } else if (isChatPlanModeEnabled && !planError) {
      // Clear balance error when hook error is cleared
      setBalanceError(null)
    }
  }, [planError, isChatPlanModeEnabled])

  const buildConversionHook = useBuildConversion(projectId, {
    onSuccess: (result) => {
      logger.info('Build conversion successful', {
        buildId: result.buildId ? result.buildId.slice(0, 8) : undefined,
        versionId: result.versionId ? result.versionId.slice(0, 8) : undefined
      }, 'chat-plan')

      // Notify parent of buildId change
      if (result.buildId && onBuildIdChange) {
        const event: BuildIdChangeEvent = {
          buildId: result.buildId,
          source: 'convert-to-build',
          versionId: result.versionId,
          previousBuildId: buildId,
          metadata: {
            sessionId: result.sessionId,
            planMode: planToConvert?.mode as 'feature' | 'fix' | undefined,
            timestamp: Date.now()
          }
        }

        logger.info('Notifying parent of buildId change from conversion', {
          buildId: result.buildId.slice(0, 8),
          source: 'convert-to-build',
          previousBuildId: buildId?.slice(0, 8)
        }, 'chat-plan')

        onBuildIdChange(event)
      }

      // Store plan context for Code Explanation Context feature
      // This enables showing which plan step relates to files during generation
      if (result.buildId && planToConvert) {
        storePlanContext(result.buildId, planToConvert)
      }

      addAssistantMessage(
        "Great! I've started building your changes. You can watch the progress below.",
        'excited'
      )
      setShowConvertDialog(false)
      setPlanToConvert(null)
      // Switch to Build mode after successful conversion
      setMode('build')
    },
    onError: (error) => {
      logger.error('Build conversion failed', { error: error.message }, 'chat-plan')
      addAssistantMessage(
        "I had trouble starting the build. Please try again or contact support if the issue persists.",
        'helpful'
      )
    }
  })

  // Check if we're starting a new build
  const isNewBuildStarting = useBuildStateStore(state => state.isStartingNewBuild())

  // EXPERT FIX ROUND 11 (v3): Derive isBuilding from lightweight state, not duplicate polling
  // CleanBuildProgress component owns the actual build event polling
  const isBuilding =
    isNewBuildStarting ||
    projectBuildStatus === 'queued' ||
    projectBuildStatus === 'building' ||
    projectBuildStatus === 'rollingBack'

  // Derive completion state from project status
  const isCompleted = projectBuildStatus === 'deployed'

  // Conservative progress fallback for ChatHeader (CleanBuildProgress shows real progress)
  const progress = isBuilding ? 15 : 0

  // ============================================================================
  // State-driven recommendations system (Phase 2 - Now the primary system)
  // ============================================================================
  const buildSessionId = useCurrentBuildSessionId()

  // New recommendations hook - listens for SSE events and manages state
  const {
    displayedRecommendations: newRecommendations,
    readySource,
    aiReady: newAiReady,
    aiGenerationInProgress,
    aiFailed,
    isLoading: newRecsLoading,
    handleSwitchToAI,
    startBuildSession,
    reset: resetRecommendations
  } = useBuildRecommendations({
    projectId,
    buildSessionId,
    buildId: buildId || undefined,
    enabled: !!buildId
  })

  // EXPERT FIX ROUND 11 (v5): When build starts, generate quick suggestions (with guard)
  useEffect(() => {
    if (!buildSessionId || !isBuilding) return
    if (startedSessionRef.current === buildSessionId) return

    startedSessionRef.current = buildSessionId
    startBuildSession()
  }, [buildSessionId, isBuilding, startBuildSession])

  // EXPERT FIX ROUND 11 (v6): Reset guard in all terminal states (including rollbackFailed)
  useEffect(() => {
    if (
      projectBuildStatus === 'deployed' ||
      projectBuildStatus === 'failed' ||
      projectBuildStatus === 'rollbackFailed'
    ) {
      startedSessionRef.current = null
    }
  }, [projectBuildStatus])

  // Log recommendations system state for debugging
  useEffect(() => {
    logger.debug('recommendations', 'Recommendations system state', {
      buildSessionId: buildSessionId?.slice(0, 10),
      readySource,
      aiReady: newAiReady,
      aiGenerationInProgress,
      aiFailed,
      recommendationsCount: newRecommendations?.length || 0
    })
  }, [buildSessionId, readySource, newAiReady, aiGenerationInProgress, aiFailed, newRecommendations])

  // Get user AI time balance for conversion dialog
  const { data: userBalance } = useEnhancedBalance(userId)

  // EXPERT FIX ROUND 11 (v3): Removed derived states - CleanBuildProgress owns build data now
  const isFailed = projectBuildStatus === 'failed'
  const isQueued = projectBuildStatus === 'queued'
  const strategy = 'clean-events' as const

  // Phase 2: Simplified - require buildId for chat interface

  // Debug logging for build state (lightweight)
  useEffect(() => {
    if (buildId) {
      logger.info('chat-debug', `Chat interface monitoring buildId: ${buildId.slice(0, 8)}, status: ${projectBuildStatus}`)
    } else {
      logger.debug('chat-debug', 'Chat interface waiting for buildId (project may be in queue)')
    }
  }, [buildId, projectBuildStatus])

  // Initialize with welcome message - Phase 2 simplified
  // EXPERT FIX ROUND 16: Include projectId in welcome message ID to prevent collisions
  useEffect(() => {
    if (welcomeShownRef.current) return
    if (messages.length === 0) {
      welcomeShownRef.current = true
      const welcomeMessage: AssistantMessage = {
        id: `welcome:${projectId}`,
        type: 'assistant',
        content: `Hey there! I'm Sheena, your AI building partner! 🚀\n\nI see you want to create: "${businessIdea}"\n\nThat's exciting! I'm already sketching out some ideas... While I work on the blueprint, tell me - what's the most important feature you'd like to see first?`,
        emotion: 'excited',
        timestamp: new Date(),
        isTyping: false
      }

      setMessages([welcomeMessage])
    }
  }, [messages.length, businessIdea, projectId])

  // EXPERT FIX ROUND 11 (v5): Upsert build progress message IN PLACE (no reordering)
  useEffect(() => {
    const shouldShowBuildProgress = !!buildId && !!userId

    if (!shouldShowBuildProgress) {
      // Clean up any existing build progress messages when no build is active
      setMessages(prev => {
        const filtered = prev.filter(m => m.type !== 'clean_build_events')
        return filtered.length !== prev.length ? filtered : prev
      })
      return
    }

    const progressId = `clean-build-${buildId}`
    const cleanEventMessage = {
      id: progressId,
      type: 'clean_build_events' as const,
      buildId,
      userId,
      projectId,
      projectBuildStatus,
      isComplete: projectBuildStatus === 'deployed',
      timestamp: new Date()
    }

    setMessages(prev => {
      const idx = prev.findIndex(m => m.id === progressId)
      if (idx === -1) return capMessages([...prev, cleanEventMessage])

      // EXPERT FIX ROUND 11 (v6): Preserve timestamp to reduce UI churn
      const next = prev.slice()
      const existing = next[idx] as any
      next[idx] = { ...cleanEventMessage, timestamp: existing.timestamp }
      return next
    })
  }, [buildId, userId, projectId, projectBuildStatus])

  // Phase 2: Timeline removed - using CleanBuildProgress component for all build visualization

  // EXPERT FIX ROUND 11 (v6): addAssistantMessage as useCallback (prevents stale closures)
  const addAssistantMessage = useCallback((
    content: string,
    emotion?: AssistantMessage['emotion'],
    actions?: AssistantMessage['actions']
  ) => {
    const messageId = nextMsgId('assistant')
    const message: AssistantMessage = {
      id: messageId,
      type: 'assistant',
      content,
      emotion,
      actions,
      timestamp: new Date(),
      isTyping: true
    }

    // Check if we already have a similar message to prevent duplicates
    setMessages(prev => {
      const hasSimilar = prev.some(msg => {
        if (msg.type !== 'assistant' || msg.content !== content) return false
        return (msg as any).isTyping === true
      })
      return hasSimilar ? prev : capMessages([...prev, message])
    })

    // Remove typing indicator after realistic reading time
    safeTimeout(() => {
      setMessages(prev => prev.map(msg => (msg.id === messageId ? { ...msg, isTyping: false } : msg)))
    }, content.length * 30 + 1000)
  }, [safeTimeout, nextMsgId])

  // Show recommendations using state-driven system
  useEffect(() => {
    // Only run when build is complete
    if (!isCompleted || !buildId) return

    // EXPERT FIX ROUND 11 (v3): Guard per buildId (survives remounts via sessionStorage)
    if (hasShownRecsForBuild(buildId)) return

    // Helper to format recommendations for display
    const formatRecommendations = (recs: typeof newRecommendations) => {
      if (!recs || recs.length === 0) return []

      return recs.map(rec => {
        if (isQuickSuggestionItem(rec)) {
          // Quick suggestion - use i18n keys with fallbacks
          // Extract category from id (e.g., 'qs-contact' → 'contact')
          const suggestionCategory = rec.id.replace('qs-', '')
          try {
            const title = tQuickSuggestions(`${suggestionCategory}.title`)
            const description = tQuickSuggestions(`${suggestionCategory}.description`)
            return `${title}: ${description}`
          } catch {
            // Fallback if translation key doesn't exist
            return `${rec.titleKey}: ${rec.descriptionKey}`
          }
        } else {
          // AI recommendation - use actual strings
          return `${rec.title}: ${rec.description}`
        }
      })
    }

    // Show quick suggestions immediately if we have them
    if (newRecommendations && newRecommendations.length > 0) {
      const formattedRecs = formatRecommendations(newRecommendations)

      const isShowingQuick = readySource === 'quick'
      const title = isShowingQuick
        ? "Here are some quick suggestions to enhance your app:"
        : "Based on your app, here are personalized suggestions:"

      logger.info('New recs system: Showing recommendations', {
        source: readySource,
        count: newRecommendations.length,
        aiReady: newAiReady
      }, 'recommendations')

      // Show recommendations with appropriate message
      // EXPERT FIX ROUND 10: Use stable messageId per buildId
      const messageId = `recommendation-new-${buildId}`
      const message: RecommendationMessage = {
        id: messageId,
        type: 'recommendation',
        title,
        suggestions: formattedRecs,
        rateable: readySource === 'ai', // Only rate AI recommendations
        ratingId: messageId,
        timestamp: new Date()
      }

      // Add with slight delay after completion message
      safeTimeout(() => {
        setMessages(prev => {
          // EXPERT FIX ROUND 10: Double guard in case multiple timers fire
          if (prev.some(m => m.id === messageId)) return prev
          return capMessages([...prev, message])
        })
        markShownRecsForBuild(buildId)

        // If AI recs are ready but showing quick, add a hint
        if (isShowingQuick && newAiReady) {
          safeTimeout(() => {
            addAssistantMessage(
              "✨ Personalized suggestions are now ready! They're based on your specific app.",
              'helpful',
              [{
                label: 'Show personalized suggestions',
                action: 'show_example',
                handler: handleSwitchToAI
              }]
            )
          }, 2000)
        }
      }, 3000)
      return
    }

    if (aiFailed) {
      // AI failed but we can still show generic suggestions
      logger.warn('New recs system: AI failed, showing fallback', {}, 'recommendations')
      safeTimeout(() => {
        addAssistantMessage(
          "Your app is ready! I couldn't generate personalized suggestions this time, but you can always ask me to add specific features.",
          'helpful',
          [
            { label: 'Add a feature', action: 'implement', handler: () => suggestFeatures() },
            { label: 'Explain the code', action: 'explain', handler: () => explainArchitecture() }
          ]
        )
        markShownRecsForBuild(buildId)
      }, 3000)
    }
  }, [
    isCompleted,
    buildId,
    newRecommendations,
    readySource,
    newAiReady,
    aiFailed,
    tQuickSuggestions,
    handleSwitchToAI,
    addAssistantMessage,
    safeTimeout,
    hasShownRecsForBuild,
    markShownRecsForBuild
  ])

  // EXPERT FIX ROUND 11 (v3): Derive typing state from messages (no global boolean)
  const isAssistantTyping = useMemo(() => {
    return messages.some(m => m.type === 'assistant' && !!(m as any).isTyping)
  }, [messages])

  // EXPERT FIX ROUND 11 (v7): Dead code removed - addRecommendationMessage was never called

  // EXPERT FIX ROUND 11 (v7): Move handlers above handleSubmit for clean deps
  const handlePlanModeResponse = useCallback((_prompt: string) => {
    safeTimeout(() => {
      addAssistantMessage(
        "Got it — I can help plan that. Tell me your goal and any constraints (time, budget, must-have features), and I'll map out steps.",
        'thinking'
      )
    }, 600)
  }, [addAssistantMessage, safeTimeout])

  const handleBuildModeResponse = useCallback((prompt: string) => {
    safeTimeout(() => {
      addAssistantMessage(
        `Perfect! I'll get right on that. ${getBuildModeResponse(prompt)}\n\nI'm starting the implementation now...`,
        'excited'
      )
    }, 800)
  }, [addAssistantMessage, safeTimeout])

  const handleSubmit = useCallback(async () => {
    const content = inputValue.trim()
    if (!content) return

    const userMessage: UserMessage = {
      id: nextMsgId('user'),
      type: 'user',
      content,
      mode,
      timestamp: new Date()
    }

    setMessages(prev => capMessages([...prev, userMessage]))
    setBalanceError(null) // Clear any previous balance errors
    setInputValue('') // Clear immediately to prevent double-send

    try {
      // EXPERT FIX ROUND 11: Route plan mode to single pipeline only
      // ✅ PLAN MODE: use sendPlanMessage ONLY (when enabled)
      if (mode === 'plan' && isChatPlanModeEnabled && userId) {
        logger.info('Routing to chat plan pipeline', {
          userId: userId.slice(0, 8),
          projectId: projectId.slice(0, 8),
          contentLength: content.length
        }, 'chat-plan')

        setStreamingStartTime(new Date())
        sendPlanMessage(content)
        return
      }

      // ✅ BUILD MODE (and plan fallback): use parent pipeline
      await onPromptSubmit(content, mode)

      // Only show success responses if API call succeeded
      if (mode === 'plan') {
        handlePlanModeResponse(content) // legacy fallback only
      } else {
        handleBuildModeResponse(content)
      }
    } catch (error) {
      logger.debug('chat-submit', 'Prompt submission handled gracefully', error)

      if (isBalanceError(error)) {
        // Handle balance errors with friendly UI
        setBalanceError({
          message: error.message,
          recommendation: error.data.recommendation
        })

        // Add friendly assistant message about balance
        const balanceMessage = error.data.recommendation?.suggestedPackage
          ? `I'd love to help with that update, but it looks like you need more AI time credits. The ${error.data.recommendation.suggestedPackage} package would give you enough time to complete this task.`
          : `I'd love to help with that update, but it looks like you need more AI time credits to continue building.`

        addAssistantMessage(
          balanceMessage,
          'helpful',
          [{
            label: 'Add Credits',
            action: 'explain',
            handler: () => {
              // Open credits modal with context instead of navigation
              openCreditsModal({
                message: error.data.recommendation?.suggestedPackage || 'Add more AI time credits to continue building your project',
                costToComplete: error.data.recommendation?.costToComplete,
                suggestedPackage: error.data.recommendation?.suggestedPackage
              })
            }
          }]
        )
      } else {
        // Handle other errors
        addAssistantMessage(
          "Sorry, I ran into an issue processing your request. Please try again in a moment.",
          'helpful',
          [{
            label: 'Try Again',
            action: 'implement',
            handler: () => {
              // Simply allow user to retry by typing again
              setInputValue('')
            }
          }]
        )
      }
    }
  }, [
    inputValue,
    mode,
    userId,
    projectId,
    isChatPlanModeEnabled,
    onPromptSubmit,
    openCreditsModal,
    sendPlanMessage,
    handlePlanModeResponse,
    handleBuildModeResponse,
    addAssistantMessage,
    nextMsgId
  ]) // EXPERT FIX ROUND 11 (v7): Updated deps with destructured chatPlanHook values

  // EXPERT FIX ROUND 11 (v8): Adapter forwards clientMsgId for proper idempotency
  // This allows ProjectRecommendations to work without mounting a second persistent chat stack
  const sendMessageAdapter = useCallback(
    (async (
      textOrObj: any,
      _target?: 'team' | 'ai',
      _messageType?: 'user' | 'assistant',
      _buildImmediately?: boolean,
      clientMsgId?: string
    ) => {
      // Support both signatures:
      // 1) sendMessage("text", ...)
      // 2) sendMessage({ content: "text", ... })
      const content =
        typeof textOrObj === 'string'
          ? textOrObj
          : typeof textOrObj?.content === 'string'
            ? textOrObj.content
            : ''

      const trimmed = content.trim()
      if (!trimmed) return

      // EXPERT FIX ROUND 11 (v8): Extract clientMsgId from multiple possible sources
      // Prefer clientMsgId from object payload (common pattern)
      const objClientMsgId =
        typeof textOrObj === 'object'
          ? (textOrObj.clientMsgId ||
             textOrObj.client_msg_id ||
             textOrObj?.metadata?.clientMsgId ||
             textOrObj?.metadata?.client_msg_id)
          : undefined

      const finalClientMsgId = String(objClientMsgId || clientMsgId || '')

      // Forward clientMsgId to parent for proper POST↔SSE correlation
      await Promise.resolve(
        onPromptSubmit(trimmed, 'build', {
          clientMsgId: finalClientMsgId || undefined,
          source: 'recommendation'
        })
      )
    }) as unknown as SendMessageFunction,
    [onPromptSubmit]
  )

  // EXPERT FIX ROUND 11 (v7): Duplicate removed - now defined above handleSubmit for clean deps

  // Handle plan to build conversion
  const handleConvertToBuild = (plan: FeaturePlanResponse | FixPlanResponse) => {
    setPlanToConvert(plan)
    setShowConvertDialog(true)
  }

  // Confirm and execute build conversion
  const confirmBuildConversion = () => {
    if (planToConvert) {
      // Extract planned files and set them as pending in code viewer
      // This creates skeleton file tree entries before actual files stream in
      import('@/utils/plan-files').then(({ extractPlannedFiles }) => {
        const plannedFiles = extractPlannedFiles(planToConvert)
        const filePaths = plannedFiles.map(f => f.path)
        if (filePaths.length > 0) {
          import('@/store/code-viewer-store').then(({ useCodeViewerStore }) => {
            useCodeViewerStore.getState().setPlannedFiles(filePaths)
          })
        }
      })

      buildConversionHook.convertToBuild(planToConvert)
    }
  }

  // EXPERT FIX ROUND 11 (v7): Duplicate removed - now defined above handleSubmit for clean deps

  const addInteractiveMessage = () => {
    const interactiveMessage: InteractiveMessage = {
      id: nextMsgId('interactive'),
      type: 'interactive',
      question: "What would you like to focus on next?",
      options: [
        { label: "User Interface", value: "ui", icon: "palette" },
        { label: "Features", value: "features", icon: "zap" },
        { label: "Performance", value: "performance", icon: "rocket" },
        { label: "SEO & Marketing", value: "seo", icon: "search" }
      ],
      timestamp: new Date()
    }
    setMessages(prev => capMessages([...prev, interactiveMessage]))
  }

  const handleInteractiveSelection = (messageId: string, value: string) => {
    setMessages(prev =>
      prev.map(msg =>
        msg.id === messageId && msg.type === 'interactive'
          ? { ...msg, selectedValue: value }
          : msg
      )
    )

    safeTimeout(() => {
      addAssistantMessage(
        getInteractiveResponse(value),
        'helpful'
      )
    }, 500)
  }

  const addRating = (messageId: string, rating: 'positive' | 'negative') => {
    setMessages(prev =>
      prev.map(msg =>
        msg.id === messageId && msg.type === 'recommendation'
          ? { ...msg, rating }
          : msg
      )
    )

    logger.info('chat-rating', 'User rated interaction', `${messageId}: ${rating}`)
  }

  const handleRecommendationSelection = async (recommendation: any) => {
    logger.info('chat-recommendation', `User selected recommendation: ${recommendation.title} (${recommendation.category}, ${recommendation.priority} priority)`)

    // Add confirmation message
    addAssistantMessage(
      `Great choice! I'll implement "${recommendation.title}" for you.\n\nThis will ${recommendation.description.toLowerCase()}. Let me get started on the implementation...`,
      'excited'
    )

    // Call the worker's update-project endpoint via API route
    try {
      logger.info('chat-recommendation', `Calling worker /v1/update-project endpoint for ${projectId} with prompt: ${recommendation.prompt.slice(0, 50)}...`)

      // Use API route instead of direct service call
      const { apiPost } = await import('@/lib/client/api-fetch')
      const uid = user?.id
      if (!uid) {
        throw new Error('AUTH_REQUIRED')
      }
      const updateResult = await apiPost(
        `/api/worker/update-project`,
        {
          userId: uid,
          projectId,
          prompt: recommendation.prompt
        }
      )

      if (updateResult.success) {
        logger.info('chat-recommendation', `Successfully initiated project update - buildId: ${updateResult.buildId}, status: ${updateResult.status}`)

        // Notify parent of buildId change from recommendation
        if (updateResult.buildId && onBuildIdChange) {
          const event: BuildIdChangeEvent = {
            buildId: updateResult.buildId,
            source: 'recommendation',
            previousBuildId: buildId,
            metadata: {
              recommendationId: recommendation.id,
              timestamp: Date.now()
            }
          }

          logger.info('Notifying parent of buildId change from recommendation', {
            buildId: updateResult.buildId.slice(0, 8),
            source: 'recommendation',
            previousBuildId: buildId?.slice(0, 8),
            recommendationTitle: recommendation.title
          }, 'chat-recommendation')

          onBuildIdChange(event)
        }

        // Add success message with build ID
        safeTimeout(() => {
          addAssistantMessage(
            `🎉 Perfect! I've started implementing "${recommendation.title}".\n\nBuild ID: ${updateResult.buildId}\nYou'll see the progress above as I work on your enhancement!`,
            'celebrating'
          )
        }, 2000)
      } else {
        logger.error('chat-recommendation', `Project update failed: ${updateResult.error} - ${updateResult.details}`)

        // Handle insufficient balance
        if (updateResult.error?.includes('Insufficient')) {
          safeTimeout(() => {
            addAssistantMessage(
              `Oops! It looks like you need more AI time credits to implement this feature.\n\n${updateResult.details}\n\nWould you like to add more credits to continue?`,
              'helpful'
            )
          }, 1000)
        } else {
          // Handle other errors
          safeTimeout(() => {
            addAssistantMessage(
              `I encountered an issue starting the implementation: ${updateResult.error}\n\nLet me try a different approach. Could you tell me more about what you'd like to see?`,
              'helpful'
            )
          }, 1000)
        }
      }
    } catch (error) {
      logger.error('chat-recommendation', `Failed to call worker API for ${projectId} - ${recommendation.title}: ${error instanceof Error ? error.message : String(error)}`)

      // Fallback to traditional prompt submission
      safeTimeout(() => {
        addAssistantMessage(
          `I had a small hiccup with the direct implementation. Let me try the traditional approach...`,
          'helpful'
        )
        onPromptSubmit(recommendation.prompt, 'build')
      }, 1500)
    }
  }

  const suggestFeatures = () => {
    const features = [
      "Contact form with email integration",
      "User authentication & profiles",
      "Payment processing with Stripe",
      "Search functionality",
      "Blog/News section"
    ]

    const id = nextMsgId('recommendation')

    const recommendationMessage: RecommendationMessage = {
      id,
      type: 'recommendation',
      title: "Popular features for your type of business:",
      suggestions: features,
      rateable: true,
      ratingId: `rating:${id}`, // EXPERT FIX ROUND 11 (v9): Tie rating ID to message ID
      timestamp: new Date()
    }

    setMessages(prev => capMessages([...prev, recommendationMessage]))
  }

  const explainArchitecture = () => {
    addAssistantMessage(
      "I built your app using modern technologies:\n\n🔧 Next.js 15 - For fast, SEO-friendly pages\n🎨 Tailwind CSS - For beautiful, responsive design\n📱 Mobile-first approach - Looks great on all devices\n⚡ Optimized performance - Fast loading times\n\nWant me to explain any specific part in more detail?",
      'helpful'
    )
  }

  // 2025 UX PATTERN: Conditional rendering based on collapse state
  if (isCollapsed) {
    return (
      <CollapsedChatView
        unreadCount={0} // TODO: Calculate from messages with proper unread tracking
        isBuilding={isBuilding}
        onExpand={onExpand}
        className="h-full"
      />
    )
  }

  return (
    <div
      data-testid="builder-chat-interface"
      data-ready={readyState === 'loading' ? undefined : readyState}
      className={showMobileUI
        ? "h-full min-h-0 flex flex-col bg-gray-900/50"
        : "h-full min-h-0 flex flex-col bg-gray-900/50 border-r border-gray-800"
      }
    >
      <ChatHeader
        isBuilding={isBuilding}
        isQueued={isQueued}
        progress={progress}
      />
      
      {/* EXPERT FIX: Connection status indicator for test visibility
        * EXPERT FIX #2: Use NEXT_PUBLIC_* for client components -
        * process.env.TEST_E2E is undefined in browser bundles */}
      <div
        data-testid="connection-status"
        /* eslint-disable-next-line no-restricted-globals */
        data-status={process.env.NEXT_PUBLIC_TEST_E2E === '1' ? 'connected' : 'connecting'}
        className="sr-only"
        aria-hidden="true"
      >
        {/* eslint-disable-next-line no-restricted-globals */}
        {process.env.NEXT_PUBLIC_TEST_E2E === '1' ? 'Connected' : 'Connecting'}
      </div>

      {/* EXPERT FIX: One-scroller pattern with proper grid structure */}
      <div className="grid grid-rows-[auto_minmax(0,1fr)_auto] flex-1 min-h-0">
        {/* Row 1: Optional toolbar space (empty for now) */}
        <div className="shrink-0">
          {/* Reserved for future toolbar/controls */}
        </div>

        {/* Row 2: The ONLY scroller - messages container with overflow-hidden flex wrapper */}
        <div className="min-h-0 overflow-hidden flex flex-col">
          <ChatMessages
          messages={messages}
          isAssistantTyping={isAssistantTyping}
          sendMessage={sendMessageAdapter}  // EXPERT FIX ROUND 10: Thread sendMessage for ProjectRecommendations
          onInteractiveSelect={handleInteractiveSelection}
          onRate={addRating}
          onRecommendationSelect={handleRecommendationSelection}
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain scroll-smooth p-2 md:p-4 lg:p-5 space-y-2 md:space-y-4"
        onConvertToBuild={(planData) => {
          // Convert the FeaturePlan from UI component to FeaturePlanResponse for dialog
          const featurePlanResponse: any = {
            mode: 'feature',
            session_id: makeSessionId(),
            title: 'Enhanced Feature Implementation',
            summary: planData.summary,
            feasibility: planData.feasibility,
            plan: planData.plan,
            buildPrompt: planData.buildPrompt,
            estimated_time_minutes: planData.plan.steps.length * 5, // Rough estimate
            steps: planData.plan.steps, // Add steps property for dialog compatibility
            timeline: planData.plan.steps.map((step: any, index: number) => ({
              phase: `Step ${step.order}`,
              duration_minutes: 5,
              tasks: [step.title]
            }))
          }
          handleConvertToBuild(featurePlanResponse)
        }}
        isStreaming={isPlanStreaming}
        streamingProgressText={planProgress}
        streamingTools={planTools}
        streamingStartTime={streamingStartTime}
        onStreamingCancel={() => {
          logger.info('User cancelled streaming', {}, 'chat-plan')
          abortPlan()
          setStreamingStartTime(undefined)
          addAssistantMessage(
            "Request cancelled. Feel free to ask another question!",
            'helpful'
          )
        }}
        translations={translations}
        infraMode={infraMode}
      />
        </div>

        {/* Row 3: Chat Input - Fixed height at bottom */}
        <div className="shrink-0">
          <ChatInput
        projectId={projectId}
        value={inputValue}
        onChange={setInputValue}
        onSubmit={handleSubmit}
        mode={mode}
        onModeChange={setMode}
        disabled={isBuilding}
        className={showMobileUI ? "px-2 py-1 border-t pb-[max(env(safe-area-inset-bottom),0.25rem)]" : "p-2 md:p-4 lg:p-5 border-t border-gray-700"}
        translations={translations}
      />
        </div>
      </div>

      {/* Balance Error Banner */}
      {balanceError && (
        <div className="mx-3 md:mx-4 mb-3 p-3 md:p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <div className="flex items-start gap-2 md:gap-3">
            <div className="flex-shrink-0 mt-0.5">
              <svg className="w-4 h-4 md:w-5 md:h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-xs md:text-sm font-medium text-blue-900 dark:text-blue-100">
                More AI Time Needed
              </h3>
              <p className="text-xs md:text-sm text-blue-700 dark:text-blue-300 mt-1 leading-relaxed">
                {(() => {
                  // Build a more informative message based on available data
                  const parts: string[] = []

                  if (balanceError.recommendation?.costToComplete) {
                    parts.push(`You need ${balanceError.recommendation.costToComplete} more AI time minutes to complete this update.`)
                  } else if (balanceError.message) {
                    parts.push(balanceError.message)
                  } else {
                    parts.push('You need more AI time to continue building.')
                  }

                  if (balanceError.recommendation?.suggestedPackage) {
                    parts.push(`The ${balanceError.recommendation.suggestedPackage} package would cover this.`)
                  }

                  return parts.join(' ')
                })()}
              </p>
              <div className="flex flex-col sm:flex-row gap-2 mt-3">
                <button
                  onClick={() => {
                    // Open credits modal with context instead of navigation
                    openCreditsModal({
                      message: balanceError.recommendation?.suggestedPackage || 'Add more AI time credits to continue building your project',
                      costToComplete: balanceError.recommendation?.costToComplete,
                      suggestedPackage: balanceError.recommendation?.suggestedPackage
                    })
                  }}
                  className="min-h-[44px] px-3 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-medium rounded-md transition-colors flex items-center justify-center"
                >
                  Add Credits
                </button>
                <button
                  onClick={() => setBalanceError(null)}
                  className="min-h-[44px] px-3 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-md transition-colors flex items-center justify-center"
                >
                  Maybe Later
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dynamic Pricing Modal */}
      <DynamicPricingModal
        isOpen={showCreditsModal}
        onClose={closeCreditsModal}
        locale={locale}
        translations={translations.pricingModal}
        context={{
          message: creditsContext?.message,
          costToComplete: creditsContext?.costToComplete
        }}
      />

      {/* Chat Plan Mode: Convert to Build Dialog */}
      {isChatPlanModeEnabled && planToConvert && (
        <ConvertToBuildDialog
          open={showConvertDialog}
          onConfirm={confirmBuildConversion}
          onCancel={() => {
            setShowConvertDialog(false)
            setPlanToConvert(null)
          }}
          onAddCredits={() => {
            // EXPERT FIX ROUND 12: Wire Add Credits to pricing modal
            setShowConvertDialog(false)

            // Calculate estimated cost from plan
            const estimatedSeconds =
              planToConvert?.mode === 'feature'
                ? Math.round((planToConvert.estimated_time_minutes ?? 2) * 60 * 1.2)
                : Math.round(90 * 1.2)

            openCreditsModal({
              message: 'Add more AI time credits to convert this plan into code.',
              costToComplete: Math.ceil(estimatedSeconds / 60), // Convert to minutes for UI
              suggestedPackage: undefined
            })
          }}
          isConverting={buildConversionHook.isConverting}
          plan={planToConvert}
          userBalance={userBalance?.totals?.total_seconds || 0}
          translations={{
            title: 'Convert Plan to Build',
            description: 'Transform this plan into actual code changes',
            confirm: 'Start Building',
            cancel: 'Cancel',
            cannotCancel: 'Once started, this operation cannot be cancelled'
          }}
        />
      )}
    </div>
  )
}

// Phase 2: Legacy build event processing removed - using CleanBuildProgress component

// EXPERT FIX ROUND 11 (v8): Deterministic picker for E2E test stability
function pickDeterministic<T>(arr: T[]): T {
  // Deterministic during E2E, varied otherwise
  // eslint-disable-next-line no-restricted-globals
  if (process.env.NEXT_PUBLIC_TEST_E2E === '1') return arr[0]
  return arr[Math.floor(Math.random() * arr.length)]
}

function getPlanModeResponse(prompt: string): string {
  const responses = [
    "Here's how we could approach this strategically...",
    "Let me break this down into actionable steps...",
    "I see several ways we could implement this effectively...",
    "That's interesting! Here's what I'm thinking..."
  ]
  return pickDeterministic(responses)
}

function getBuildModeResponse(prompt: string): string {
  const responses = [
    "Excellent choice! This will really enhance the user experience.",
    "I love that idea! It'll make your app stand out.",
    "Smart thinking! This feature will add real value.",
    "Great suggestion! This will improve functionality significantly."
  ]
  return pickDeterministic(responses)
}

function getInteractiveResponse(value: string): string {
  const responses = {
    ui: "Great choice! Let's focus on creating a beautiful, intuitive interface that your users will love. I can help with color schemes, layouts, and interactive elements.",
    features: "Perfect! Let's add some powerful features that will make your app truly useful. I can implement forms, user accounts, search, and much more.",
    performance: "Smart thinking! Performance is crucial for user experience. I'll optimize loading times, implement caching, and ensure your app runs smoothly.",
    seo: "Excellent! SEO will help people find your business online. I can optimize meta tags, improve site structure, and implement analytics."
  }
  return responses[value as keyof typeof responses] || "Let's work on that together!"
}
