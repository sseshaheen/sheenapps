'use client';

/**
 * Build Feedback Integration Component
 *
 * Integrates feedback collection with build events.
 * Uses idle detection to show prompts at the right moment.
 *
 * Features:
 *   - Triggers feedback after build completion (success/failure)
 *   - First build detection for onboarding survey
 *   - Idle detection - waits for 2s of inactivity before prompting
 *   - Renders appropriate feedback UI based on orchestrator decision
 *
 * See FEEDBACK-INTEGRATION-PLAN.md
 */

import React, { useEffect, useRef, useCallback } from 'react';
import { useFeedbackOrchestrator } from '@/hooks/useFeedbackOrchestrator';
import { useFeedbackSafe } from './FeedbackProvider';
import { MicroSurvey } from './MicroSurvey';
import { CSATSurvey } from './CSATSurvey';
import { NPSSurvey } from './NPSSurvey';
import { X, AlertCircle, FileText, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

interface BuildFeedbackIntegrationProps {
  /** Current build ID */
  buildId: string | null;
  /** Project ID */
  projectId: string;
  /** Build status */
  buildStatus?: 'queued' | 'building' | 'deployed' | 'failed' | 'rollingBack' | 'rollbackFailed' | null;
  /** Whether this is the user's first build ever */
  isFirstBuild?: boolean;
  /** Callback when user clicks "Report issue" */
  onReportIssue?: () => void;
  /** Callback when user clicks "Show logs" */
  onShowLogs?: () => void;
  /** Idle threshold in ms before showing prompt */
  idleThresholdMs?: number;
  /** Disable feedback entirely */
  disabled?: boolean;
}

// ============================================================================
// Help Offer Component (for failures/frustration)
// ============================================================================

interface HelpOfferProps {
  title: string;
  actions: Array<{ label: string; action: 'report_issue' | 'show_logs' | 'dismiss' }>;
  onAction: (action: 'report_issue' | 'show_logs' | 'dismiss') => void;
  onDismiss: () => void;
}

function HelpOffer({ title, actions, onAction, onDismiss }: HelpOfferProps) {
  return (
    <div
      className={cn(
        'fixed z-50 bottom-4 right-4',
        'w-[340px] max-w-[calc(100vw-32px)]',
        'bg-background border border-border rounded-lg shadow-xl',
        'animate-in fade-in slide-in-from-bottom-4 duration-300'
      )}
      role="dialog"
      aria-label="Help offer"
    >
      <div className="flex items-center justify-between p-3 pb-0">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <AlertCircle className="h-3 w-3" />
          <span>Need help?</span>
        </div>
        <button
          onClick={onDismiss}
          className="p-1 rounded hover:bg-muted transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      <div className="p-4 pt-2">
        <p className="text-sm font-medium mb-4">{title}</p>

        <div className="flex flex-col gap-2">
          {actions.map((action) => (
            <button
              key={action.action}
              onClick={() => onAction(action.action)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors text-left',
                action.action === 'dismiss'
                  ? 'text-muted-foreground hover:bg-muted'
                  : 'border-border hover:bg-muted'
              )}
            >
              {action.action === 'report_issue' && <MessageSquare className="h-4 w-4" />}
              {action.action === 'show_logs' && <FileText className="h-4 w-4" />}
              <span className="text-sm">{action.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Onboarding Ease Survey Component
// ============================================================================

interface OnboardingEaseSurveyProps {
  onSubmit?: (score: number, comment?: string) => void;
  onDismiss?: () => void;
}

function OnboardingEaseSurvey({ onSubmit, onDismiss }: OnboardingEaseSurveyProps) {
  return (
    <MicroSurvey
      surveyId="onboarding_ease_v1"
      question="How easy was it to get your first build?"
      type="emoji"
      priority="success"
      promptType="onboarding_ease"
      featureId="first_build_ever"
      goal="onboarding"
      showFollowUp={true}
      followUpPlaceholder="What could we improve? (optional)"
      successMessage="Thank you! This helps us improve."
      onSubmit={(value, comment) => onSubmit?.(value as number, comment)}
      onDismiss={onDismiss}
      enabled={true}
    />
  );
}

// ============================================================================
// Export Satisfaction Survey Component
// ============================================================================

interface ExportSatisfactionSurveyProps {
  featureId: string;
  onSubmit?: (satisfied: boolean, comment?: string) => void;
  onDismiss?: () => void;
}

function ExportSatisfactionSurvey({ featureId, onSubmit, onDismiss }: ExportSatisfactionSurveyProps) {
  return (
    <MicroSurvey
      surveyId={`export_satisfaction_${featureId}`}
      question="Did your export work the way you expected?"
      type="binary"
      priority="success"
      promptType="feature_helpful"
      featureId={featureId}
      goal="satisfaction"
      showFollowUp={true}
      followUpPlaceholder="Any issues we should know about? (optional)"
      successMessage="Thank you for your feedback!"
      onSubmit={(value, comment) => onSubmit?.(value as boolean, comment)}
      onDismiss={onDismiss}
      enabled={true}
    />
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function BuildFeedbackIntegration({
  buildId,
  projectId,
  buildStatus,
  isFirstBuild = false,
  onReportIssue,
  onShowLogs,
  idleThresholdMs = 2000,
  disabled = false,
}: BuildFeedbackIntegrationProps) {
  const feedback = useFeedbackSafe();
  const {
    emitEvent,
    currentAction,
    dismissAction,
    hasSeenEvent,
  } = useFeedbackOrchestrator({ disabled });

  // Track previous build status for detecting transitions
  const prevBuildStatusRef = useRef<typeof buildStatus>(null);
  const prevBuildIdRef = useRef<string | null>(null);

  // Idle detection state
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pending event to emit after idle
  const pendingEventRef = useRef<Parameters<typeof emitEvent>[0] | null>(null);

  // Reset activity listeners
  const activityListeners = useRef<(() => void) | null>(null);

  /**
   * Start idle timer - resets on any activity
   * CRITICAL: Cleanup existing listeners BEFORE adding new ones to prevent stacking
   */
  const startIdleDetection = useCallback(
    (event: Parameters<typeof emitEvent>[0]) => {
      // CRITICAL: Cleanup any prior listeners before adding new ones
      // This prevents listener stacking if startIdleDetection is called multiple times
      if (activityListeners.current) {
        activityListeners.current();
        activityListeners.current = null;
      }

      // Store pending event
      pendingEventRef.current = event;

      // Clear existing timer
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }

      const startTimer = () => {
        idleTimerRef.current = setTimeout(() => {
          // User has been idle for threshold - emit event
          if (pendingEventRef.current) {
            emitEvent(pendingEventRef.current);
            pendingEventRef.current = null;
          }
          cleanup();
        }, idleThresholdMs);
      };

      const resetTimer = () => {
        if (idleTimerRef.current) {
          clearTimeout(idleTimerRef.current);
        }
        startTimer();
      };

      const cleanup = () => {
        if (idleTimerRef.current) {
          clearTimeout(idleTimerRef.current);
          idleTimerRef.current = null;
        }
        window.removeEventListener('pointerdown', resetTimer);
        window.removeEventListener('keydown', resetTimer);
        window.removeEventListener('scroll', resetTimer, true);
        activityListeners.current = null;
      };

      // Listen for ACTUAL user engagement (NOT mousemove - fires without interaction)
      // - pointerdown: clicks, taps, touch
      // - keydown: typing
      // - scroll (capture): active scrolling in any element
      window.addEventListener('pointerdown', resetTimer, { passive: true });
      window.addEventListener('keydown', resetTimer);
      window.addEventListener('scroll', resetTimer, { capture: true, passive: true });

      activityListeners.current = cleanup;
      startTimer();
    },
    [idleThresholdMs, emitEvent]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (activityListeners.current) {
        activityListeners.current();
      }
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
    };
  }, []);

  /**
   * Detect build completion and trigger feedback
   * CRITICAL: Refs must be updated AFTER processing to detect transitions correctly
   */
  useEffect(() => {
    if (disabled || !feedback) return;

    const currentStatus = buildStatus;
    const prevStatus = prevBuildStatusRef.current;
    const currentBuildId = buildId;
    const prevBuildId = prevBuildIdRef.current;

    // Detect build completion (queued/building -> deployed)
    const wasBuilding = prevStatus === 'queued' || prevStatus === 'building';
    const isNowDeployed = currentStatus === 'deployed';
    const buildJustCompleted = wasBuilding && isNowDeployed;

    // Detect build failure
    const isNowFailed = currentStatus === 'failed' || currentStatus === 'rollbackFailed';
    const buildJustFailed = wasBuilding && isNowFailed;

    // Only block if we've already processed this buildId transition
    const sameBuildAsLastRender = currentBuildId && currentBuildId === prevBuildId;

    if (!sameBuildAsLastRender && currentBuildId) {
      if (buildJustCompleted) {
        // Check if already seen
        if (hasSeenEvent('build_success', currentBuildId)) {
          // Update refs and return
          prevBuildStatusRef.current = currentStatus;
          prevBuildIdRef.current = currentBuildId;
          return;
        }

        // First build gets priority (global, not per-project)
        if (isFirstBuild && !hasSeenEvent('first_build_ever')) {
          startIdleDetection({
            type: 'first_build_ever',
            projectId,
            buildId: currentBuildId,
          });
        } else {
          // Regular build success
          startIdleDetection({
            type: 'build_success',
            projectId,
            buildId: currentBuildId,
          });
        }
      }

      if (buildJustFailed) {
        // Check if already seen
        if (hasSeenEvent('build_failure', currentBuildId)) {
          // Update refs and return
          prevBuildStatusRef.current = currentStatus;
          prevBuildIdRef.current = currentBuildId;
          return;
        }

        // No idle detection for failures - show help immediately
        emitEvent({
          type: 'build_failure',
          projectId,
          buildId: currentBuildId,
        });
      }
    }

    // CRITICAL: Update refs AFTER processing to detect transitions correctly
    prevBuildStatusRef.current = currentStatus;
    prevBuildIdRef.current = currentBuildId;
  }, [
    buildId,
    buildStatus,
    projectId,
    isFirstBuild,
    disabled,
    feedback,
    hasSeenEvent,
    startIdleDetection,
    emitEvent,
  ]);

  /**
   * Handle help offer actions
   */
  const handleHelpAction = useCallback(
    (action: 'report_issue' | 'show_logs' | 'dismiss') => {
      switch (action) {
        case 'report_issue':
          onReportIssue?.();
          dismissAction();
          break;
        case 'show_logs':
          onShowLogs?.();
          dismissAction();
          break;
        case 'dismiss':
          dismissAction();
          break;
      }
    },
    [onReportIssue, onShowLogs, dismissAction]
  );

  // Don't render if disabled or no feedback system
  if (disabled || !feedback) {
    return null;
  }

  // Render appropriate feedback UI based on current action
  if (!currentAction) {
    return null;
  }

  switch (currentAction.type) {
    case 'csat':
      return (
        <CSATSurvey
          interactionId={currentAction.featureId}
          interactionType="chat"
          question={currentAction.question}
          variant="card"
          onDismiss={dismissAction}
        />
      );

    case 'onboarding_ease':
      return (
        <OnboardingEaseSurvey
          onDismiss={dismissAction}
        />
      );

    case 'export_satisfaction':
      return (
        <ExportSatisfactionSurvey
          featureId={currentAction.featureId}
          onDismiss={dismissAction}
        />
      );

    case 'help_offer':
      return (
        <HelpOffer
          title={currentAction.title}
          actions={currentAction.actions}
          onAction={handleHelpAction}
          onDismiss={dismissAction}
        />
      );

    case 'nps':
      return (
        <NPSSurvey
          onDismiss={dismissAction}
        />
      );

    default:
      return null;
  }
}

export default BuildFeedbackIntegration;
