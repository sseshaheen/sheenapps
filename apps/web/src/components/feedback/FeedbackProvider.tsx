'use client';

/**
 * Feedback Provider Context
 *
 * Provides feedback system state and methods to the component tree.
 * Handles:
 *   - Session/anonymous ID management
 *   - Eligibility checking with caching
 *   - Queue priority (only one prompt per session)
 *   - Implicit signal batching
 *
 * See FEEDBACK-COLLECTION-PLAN.md
 */

import React, {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  type FeedbackSubmission,
  type PromptType,
  type EligibilityAction,
  type EligibilityCheckResponse,
  type ImplicitSignal,
  type FeedbackSessionState,
  type PromptPriority,
  PROMPT_PRIORITY,
  PROMPT_TYPE_TO_PRIORITY,
  submitFeedback,
  checkEligibility,
  recordEligibility,
  submitImplicitSignals,
  generateFeedbackId,
  getAnonymousId,
  getSessionId,
  getDeviceType,
  getViewport,
} from '@/lib/feedback';

// ============================================================================
// Types
// ============================================================================

interface FeedbackContextValue {
  // Session state
  sessionId: string;
  anonymousId: string;
  isReady: boolean;

  // Eligibility
  checkPromptEligibility: (
    promptType: PromptType,
    featureId?: string
  ) => Promise<EligibilityCheckResponse>;
  recordPromptShown: (promptType: PromptType, featureId?: string) => Promise<void>;
  recordPromptResponded: (promptType: PromptType, featureId?: string) => Promise<void>;

  // Queue management
  canShowPrompt: (priority: PromptPriority) => boolean;
  markFrustrationPromptShown: () => void;

  // Feedback submission
  submit: (
    feedback: Omit<
      FeedbackSubmission,
      'id' | 'userId' | 'anonymousId' | 'sessionId' | 'userAgent' | 'viewport' | 'deviceType'
    >
  ) => Promise<{ success: boolean; id?: string; error?: string }>;

  // Implicit signals
  recordImplicitSignal: (signal: Omit<ImplicitSignal, 'sessionId'>) => void;
  flushImplicitSignals: () => Promise<void>;
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

// ============================================================================
// Provider Component
// ============================================================================

interface FeedbackProviderProps {
  children: React.ReactNode;
  /**
   * Build version for correlating feedback to deployments
   */
  buildVersion?: string;
  /**
   * Locale for i18n
   */
  locale?: string;
  /**
   * Disable feedback system (for admin routes, etc.)
   */
  disabled?: boolean;
}

export function FeedbackProvider({
  children,
  buildVersion,
  locale,
  disabled = false,
}: FeedbackProviderProps) {
  // Session state
  const [sessionId, setSessionId] = useState('');
  const [anonymousId, setAnonymousId] = useState('');
  const [isReady, setIsReady] = useState(false);

  // Queue state - only one prompt per session (except user-initiated tab)
  const [promptShownThisSession, setPromptShownThisSession] = useState(false);
  const [sawFrustrationPrompt, setSawFrustrationPrompt] = useState(false);
  const highestPriorityShownRef = useRef<number>(0);

  // Implicit signal batching
  const signalBufferRef = useRef<ImplicitSignal[]>([]);
  const flushTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Eligibility cache (short TTL)
  const eligibilityCacheRef = useRef<
    Map<string, { response: EligibilityCheckResponse; expiresAt: number }>
  >(new Map());
  const CACHE_TTL_MS = 60 * 1000; // 1 minute

  // Initialize session IDs on client
  useEffect(() => {
    if (disabled) return;

    const sid = getSessionId();
    const aid = getAnonymousId();

    setSessionId(sid);
    setAnonymousId(aid);
    setIsReady(true);
  }, [disabled]);

  // Flush signals periodically and on unmount
  useEffect(() => {
    if (disabled || !isReady) return;

    // Flush every 30 seconds per performance budget
    const interval = setInterval(() => {
      flushSignals();
    }, 30_000);

    // Flush on page unload using sendBeacon (async fetch won't complete reliably)
    const handleUnload = () => {
      flushSignalsBeacon();
    };
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', handleUnload);
      flushSignals();
    };
  }, [disabled, isReady]);

  // ============================================================================
  // Eligibility Methods
  // ============================================================================

  const checkPromptEligibility = useCallback(
    async (promptType: PromptType, featureId?: string): Promise<EligibilityCheckResponse> => {
      if (disabled || !isReady) {
        return { eligible: false, reason: 'not_ready' };
      }

      // Check cache first
      const cacheKey = `${promptType}:${featureId ?? ''}`;
      const cached = eligibilityCacheRef.current.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.response;
      }

      // Check server
      const response = await checkEligibility({
        promptType,
        anonymousId,
        featureId,
      });

      // Cache result
      eligibilityCacheRef.current.set(cacheKey, {
        response,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });

      return response;
    },
    [disabled, isReady, anonymousId]
  );

  const recordPromptShown = useCallback(
    async (promptType: PromptType, featureId?: string): Promise<void> => {
      if (disabled || !isReady) return;

      await recordEligibility({
        promptType,
        anonymousId,
        action: 'shown',
        featureId,
      });

      // Invalidate cache
      const cacheKey = `${promptType}:${featureId ?? ''}`;
      eligibilityCacheRef.current.delete(cacheKey);

      // Update priority tracking - enforce "only one prompt per session" via priority
      const promptPriority = PROMPT_TYPE_TO_PRIORITY[promptType] ?? 'exit_intent';
      const priorityValue = PROMPT_PRIORITY[promptPriority];
      highestPriorityShownRef.current = Math.max(
        highestPriorityShownRef.current,
        priorityValue
      );

      // If this was a frustration prompt, lock out all other prompts
      if (promptPriority === 'frustration') {
        setSawFrustrationPrompt(true);
      }

      // Mark session as having shown a prompt
      setPromptShownThisSession(true);
    },
    [disabled, isReady, anonymousId]
  );

  const recordPromptResponded = useCallback(
    async (promptType: PromptType, featureId?: string): Promise<void> => {
      if (disabled || !isReady) return;

      await recordEligibility({
        promptType,
        anonymousId,
        action: 'responded',
        featureId,
      });
    },
    [disabled, isReady, anonymousId]
  );

  // ============================================================================
  // Queue Management
  // ============================================================================

  const canShowPrompt = useCallback(
    (priority: PromptPriority): boolean => {
      if (disabled || !isReady) return false;

      // If user saw frustration prompt, skip ALL other prompts this session
      if (sawFrustrationPrompt && priority !== 'frustration') {
        return false;
      }

      // "Only one prompt per session" rule (per FEEDBACK-COLLECTION-PLAN.md)
      // Exception: frustration prompts can always show if not already shown
      if (promptShownThisSession && priority !== 'frustration') {
        return false;
      }

      // Also check priority level to prevent showing lower/equal priority prompts
      // This handles edge cases where promptShownThisSession might not be set yet
      const priorityValue = PROMPT_PRIORITY[priority];
      if (priorityValue <= highestPriorityShownRef.current) {
        return false;
      }

      return true;
    },
    [disabled, isReady, sawFrustrationPrompt, promptShownThisSession]
  );

  const markFrustrationPromptShown = useCallback(() => {
    setSawFrustrationPrompt(true);
    highestPriorityShownRef.current = PROMPT_PRIORITY.frustration;
  }, []);

  // ============================================================================
  // Feedback Submission
  // ============================================================================

  const submit = useCallback(
    async (
      feedback: Omit<
        FeedbackSubmission,
        'id' | 'userId' | 'anonymousId' | 'sessionId' | 'userAgent' | 'viewport' | 'deviceType'
      >
    ) => {
      if (disabled || !isReady) {
        return { success: false, error: 'not_ready' };
      }

      const submission: Omit<FeedbackSubmission, 'userId'> = {
        ...feedback,
        id: generateFeedbackId(),
        anonymousId,
        sessionId,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
        viewport: getViewport(),
        deviceType: getDeviceType(),
        locale,
        buildVersion,
      };

      return submitFeedback(submission);
    },
    [disabled, isReady, anonymousId, sessionId, locale, buildVersion]
  );

  // ============================================================================
  // Implicit Signals
  // ============================================================================

  const flushSignals = useCallback(async () => {
    if (signalBufferRef.current.length === 0) return;

    // Take all signals from buffer
    const signals = [...signalBufferRef.current];
    signalBufferRef.current = [];

    // Clear any pending flush timeout
    if (flushTimeoutRef.current) {
      clearTimeout(flushTimeoutRef.current);
      flushTimeoutRef.current = null;
    }

    // Submit batch
    await submitImplicitSignals(signals);
  }, []);

  // Beacon version for beforeunload - sync, fire-and-forget
  const flushSignalsBeacon = useCallback(() => {
    if (signalBufferRef.current.length === 0) return;

    // Take all signals from buffer
    const signals = [...signalBufferRef.current];
    signalBufferRef.current = [];

    // Clear any pending flush timeout
    if (flushTimeoutRef.current) {
      clearTimeout(flushTimeoutRef.current);
      flushTimeoutRef.current = null;
    }

    // Submit using sendBeacon (sync, best-effort)
    submitImplicitSignals(signals, { useBeacon: true });
  }, []);

  const recordImplicitSignal = useCallback(
    (signal: Omit<ImplicitSignal, 'sessionId'>) => {
      if (disabled || !isReady) return;

      // Add to buffer with sessionId
      const fullSignal: ImplicitSignal = {
        ...signal,
        sessionId,
        buildVersion,
      };

      signalBufferRef.current.push(fullSignal);

      // Enforce max events per batch (performance budget)
      if (signalBufferRef.current.length >= 20) {
        flushSignals();
        return;
      }

      // Schedule flush if not already scheduled
      if (!flushTimeoutRef.current) {
        flushTimeoutRef.current = setTimeout(flushSignals, 30_000);
      }
    },
    [disabled, isReady, sessionId, buildVersion, flushSignals]
  );

  // ============================================================================
  // Context Value
  // ============================================================================

  const contextValue = useMemo<FeedbackContextValue>(
    () => ({
      sessionId,
      anonymousId,
      isReady,
      checkPromptEligibility,
      recordPromptShown,
      recordPromptResponded,
      canShowPrompt,
      markFrustrationPromptShown,
      submit,
      recordImplicitSignal,
      flushImplicitSignals: flushSignals,
    }),
    [
      sessionId,
      anonymousId,
      isReady,
      checkPromptEligibility,
      recordPromptShown,
      recordPromptResponded,
      canShowPrompt,
      markFrustrationPromptShown,
      submit,
      recordImplicitSignal,
      flushSignals,
    ]
  );

  if (disabled) {
    return <>{children}</>;
  }

  return <FeedbackContext.Provider value={contextValue}>{children}</FeedbackContext.Provider>;
}

// ============================================================================
// Hook
// ============================================================================

export function useFeedback(): FeedbackContextValue {
  const context = useContext(FeedbackContext);

  if (!context) {
    throw new Error('useFeedback must be used within a FeedbackProvider');
  }

  return context;
}

/**
 * Safe hook that returns null if not in FeedbackProvider
 * Use this for components that may or may not be within the provider
 */
export function useFeedbackSafe(): FeedbackContextValue | null {
  return useContext(FeedbackContext);
}
