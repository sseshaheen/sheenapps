'use client';

/**
 * Micro Survey Component
 *
 * Short, non-blocking survey that appears as a toast/banner.
 * Integrates with queue priority system - only one prompt per session.
 *
 * Best Practices Applied:
 *   - 1-3 questions max (we use 1)
 *   - Toast/banner style, not modal
 *   - Queue priority: respects frustration > success > NPS > exit_intent
 *   - Records 'shown' immediately (cooldown starts on view, not response)
 *   - Auto-dismiss option after submission
 *   - Accessible and mobile-friendly
 *
 * See FEEDBACK-COLLECTION-PLAN.md - Strategy 3
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useFeedbackSafe } from './FeedbackProvider';
import { EmojiScale, type EmojiValue } from './EmojiScale';
import { ThumbsUp, ThumbsDown, X, Send, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FeedbackGoal, PromptType, PromptPriority } from '@/lib/feedback';

// ============================================================================
// Types
// ============================================================================

type SurveyType = 'emoji' | 'binary';

interface MicroSurveyProps {
  /**
   * Unique identifier for this survey
   */
  surveyId: string;
  /**
   * The question to ask
   */
  question: string;
  /**
   * Type of response input
   * @default 'emoji'
   */
  type?: SurveyType;
  /**
   * Queue priority for this survey
   * @default 'success'
   */
  priority?: PromptPriority;
  /**
   * Prompt type for eligibility checking
   * @default 'micro_survey'
   */
  promptType?: PromptType;
  /**
   * Feature ID for per-feature eligibility
   */
  featureId?: string;
  /**
   * Goal category for analytics
   * @default 'satisfaction'
   */
  goal?: FeedbackGoal;
  /**
   * Show optional follow-up text input?
   * @default true
   */
  showFollowUp?: boolean;
  /**
   * Follow-up placeholder text
   * @default "Any additional thoughts? (optional)"
   */
  followUpPlaceholder?: string;
  /**
   * Celebration message on success
   * @default "Thank you!"
   */
  successMessage?: string;
  /**
   * Auto-dismiss after submission (in ms)
   * Set to 0 to disable
   * @default 2000
   */
  autoDismissDelay?: number;
  /**
   * Position of the survey
   * @default 'bottom-right'
   */
  position?: 'bottom-right' | 'bottom-left' | 'bottom-center' | 'top-center';
  /**
   * Callback when survey is dismissed (user closed or auto-dismissed)
   */
  onDismiss?: () => void;
  /**
   * Callback when survey is submitted
   */
  onSubmit?: (value: number | boolean, comment?: string) => void;
  /**
   * External control to show/hide the survey
   * When true, component will check eligibility and potentially show
   * When false, component will not render
   * @default true
   */
  enabled?: boolean;
  /**
   * Custom class for the container
   */
  className?: string;
}

type SurveyState = 'checking' | 'visible' | 'follow_up' | 'submitting' | 'success' | 'hidden';

// ============================================================================
// Component
// ============================================================================

export function MicroSurvey({
  surveyId,
  question,
  type = 'emoji',
  priority = 'success',
  promptType = 'micro_survey',
  featureId,
  goal = 'satisfaction',
  showFollowUp = true,
  followUpPlaceholder = 'Any additional thoughts? (optional)',
  successMessage = 'Thank you!',
  autoDismissDelay = 2000,
  position = 'bottom-right',
  onDismiss,
  onSubmit,
  enabled = true,
  className,
}: MicroSurveyProps) {
  const feedback = useFeedbackSafe();

  const [state, setState] = useState<SurveyState>('checking');
  const [selectedValue, setSelectedValue] = useState<EmojiValue | boolean | null>(null);
  const [followUpText, setFollowUpText] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const hasCheckedEligibility = useRef(false);
  const hasRecordedShown = useRef(false);

  // Check eligibility and queue priority on mount
  useEffect(() => {
    if (!feedback || !enabled || hasCheckedEligibility.current) return;
    hasCheckedEligibility.current = true;

    const checkEligibility = async () => {
      // First check queue priority (client-side)
      if (!feedback.canShowPrompt(priority)) {
        setState('hidden');
        return;
      }

      // Then check server-side eligibility
      const result = await feedback.checkPromptEligibility(promptType, featureId);
      if (!result.eligible) {
        setState('hidden');
        return;
      }

      // Eligible - show the survey
      setState('visible');
    };

    checkEligibility();
  }, [feedback, enabled, priority, promptType, featureId]);

  // Record 'shown' when survey becomes visible
  useEffect(() => {
    if (state === 'visible' && feedback && !hasRecordedShown.current) {
      hasRecordedShown.current = true;
      feedback.recordPromptShown(promptType, featureId);
    }
  }, [state, feedback, promptType, featureId]);

  // Auto-dismiss after success
  useEffect(() => {
    if (state === 'success' && autoDismissDelay > 0) {
      const timer = setTimeout(() => {
        handleDismiss();
      }, autoDismissDelay);
      return () => clearTimeout(timer);
    }
  }, [state, autoDismissDelay]);

  // Handle dismiss
  const handleDismiss = useCallback(() => {
    setState('hidden');
    onDismiss?.();
  }, [onDismiss]);

  // Handle emoji selection
  const handleEmojiSelect = useCallback((value: EmojiValue) => {
    setSelectedValue(value);
  }, []);

  // Handle binary selection
  const handleBinarySelect = useCallback((value: boolean) => {
    setSelectedValue(value);
  }, []);

  // Submit the survey
  const handleSubmit = useCallback(async () => {
    if (!feedback || selectedValue === null) return;

    setState('submitting');
    setErrorMessage(null);

    const feedbackValue = typeof selectedValue === 'boolean' ? selectedValue : selectedValue;
    const feedbackType = type === 'binary' ? 'binary' : 'emoji';

    const result = await feedback.submit({
      type: feedbackType,
      value: feedbackValue,
      textComment: followUpText.trim() || undefined,
      pageUrl: typeof window !== 'undefined' ? window.location.href : '',
      featureId,
      triggerPoint: 'micro_survey',
      promptId: surveyId,
      placement: 'toast',
      goal,
    });

    if (result.success) {
      setState('success');
      feedback.recordPromptResponded(promptType, featureId);
      onSubmit?.(feedbackValue, followUpText.trim() || undefined);
    } else {
      setErrorMessage(result.error || 'Failed to submit');
      setState('visible');
    }
  }, [feedback, selectedValue, type, followUpText, featureId, surveyId, goal, promptType, onSubmit]);

  // Handle "Next" after rating (to show follow-up)
  const handleNext = useCallback(() => {
    if (showFollowUp) {
      setState('follow_up');
    } else {
      handleSubmit();
    }
  }, [showFollowUp, handleSubmit]);

  // Don't render if hidden, checking, or no feedback system
  if (!feedback || state === 'hidden' || state === 'checking') {
    return null;
  }

  // Position classes - using logical properties for RTL support
  const positionClasses = {
    'bottom-right': 'bottom-4 end-4',
    'bottom-left': 'bottom-4 start-4',
    'bottom-center': 'bottom-4 start-1/2 ltr:-translate-x-1/2 rtl:translate-x-1/2',
    'top-center': 'top-4 start-1/2 ltr:-translate-x-1/2 rtl:translate-x-1/2',
  };

  return (
    <div
      className={cn(
        'fixed z-50',
        'w-[340px] max-w-[calc(100vw-32px)]',
        'bg-background border border-border rounded-lg shadow-xl',
        'animate-in fade-in slide-in-from-bottom-4 duration-300',
        positionClasses[position],
        className
      )}
      role="dialog"
      aria-label="Quick survey"
    >
      {/* Header with close button */}
      <div className="flex items-center justify-between p-3 pb-0">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Sparkles className="h-3 w-3" />
          <span>Quick feedback</span>
        </div>
        <button
          onClick={handleDismiss}
          className="p-1 rounded hover:bg-muted transition-colors"
          aria-label="Close survey"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {/* Content */}
      <div className="p-4 pt-2">
        {/* Success State */}
        {state === 'success' && (
          <div className="text-center py-4 animate-in fade-in duration-200">
            <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <ThumbsUp className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <p className="text-sm font-medium">{successMessage}</p>
          </div>
        )}

        {/* Visible State - Show question and input */}
        {state === 'visible' && (
          <>
            <p className="text-sm font-medium mb-4">{question}</p>

            {type === 'emoji' && (
              <EmojiScale
                value={selectedValue as EmojiValue | null}
                onChange={handleEmojiSelect}
                showLabels
                className="mb-4"
              />
            )}

            {type === 'binary' && (
              <div className="flex justify-center gap-4 mb-4">
                <button
                  onClick={() => handleBinarySelect(true)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-lg border transition-all',
                    selectedValue === true
                      ? 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                      : 'border-border hover:bg-muted'
                  )}
                >
                  <ThumbsUp className="h-4 w-4" />
                  <span className="text-sm">Yes</span>
                </button>
                <button
                  onClick={() => handleBinarySelect(false)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-lg border transition-all',
                    selectedValue === false
                      ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                      : 'border-border hover:bg-muted'
                  )}
                >
                  <ThumbsDown className="h-4 w-4" />
                  <span className="text-sm">No</span>
                </button>
              </div>
            )}

            {errorMessage && (
              <p className="text-xs text-destructive mb-2">{errorMessage}</p>
            )}

            <button
              onClick={handleNext}
              disabled={selectedValue === null}
              className={cn(
                'w-full py-2 px-4 rounded-md text-sm font-medium transition-colors',
                'bg-primary text-primary-foreground',
                'hover:bg-primary/90',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {showFollowUp ? 'Next' : 'Submit'}
            </button>
          </>
        )}

        {/* Follow-up State - Show text input */}
        {state === 'follow_up' && (
          <div className="animate-in fade-in slide-in-from-right-2 duration-200">
            <p className="text-sm font-medium mb-3">{followUpPlaceholder}</p>
            <textarea
              value={followUpText}
              onChange={(e) => setFollowUpText(e.target.value)}
              placeholder="Share your thoughts..."
              className={cn(
                'w-full min-h-[80px] p-3 text-sm rounded-md resize-none',
                'bg-muted/50 border border-border',
                'focus:outline-none focus:ring-2 focus:ring-primary/50'
              )}
              maxLength={500}
            />
            <div className="flex items-center justify-between mt-3">
              <button
                onClick={() => handleSubmit()}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Skip
              </button>
              <button
                onClick={handleSubmit}
                className={cn(
                  'flex items-center gap-2 py-2 px-4 rounded-md text-sm font-medium',
                  'bg-primary text-primary-foreground',
                  'hover:bg-primary/90 transition-colors'
                )}
              >
                <Send className="h-3.5 w-3.5" />
                Submit
              </button>
            </div>
          </div>
        )}

        {/* Submitting State */}
        {state === 'submitting' && (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Submitting...</span>
          </div>
        )}
      </div>
    </div>
  );
}
