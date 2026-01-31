'use client';

/**
 * Inline Rating Component
 *
 * Contextual thumbs up/down feedback widget for inline placement.
 * Follows the two-step pattern: quick binary rating → optional follow-up text.
 *
 * Best Practices Applied:
 *   - Non-intrusive: inline, not overlay
 *   - Two-step: preserves speed while capturing context on negative
 *   - Per-feature eligibility: respects server-side cooldowns
 *   - Accessible: keyboard navigation, aria-labels
 *   - Mobile-friendly: touch-optimized targets
 *
 * See FEEDBACK-COLLECTION-PLAN.md - Strategy 1 & 4
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useFeedbackSafe } from './FeedbackProvider';
import { ThumbsUp, ThumbsDown, Send, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FeedbackGoal } from '@/lib/feedback';

// ============================================================================
// Types
// ============================================================================

interface InlineRatingProps {
  /**
   * Unique identifier for this feature/content
   * Used for per-feature eligibility and analytics
   */
  featureId: string;
  /**
   * Question text shown to user
   * @default "Was this helpful?"
   */
  question?: string;
  /**
   * Placeholder text for follow-up input
   * @default "What could be better?"
   */
  followUpPlaceholder?: string;
  /**
   * Show follow-up text input on negative rating?
   * @default true
   */
  showFollowUp?: boolean;
  /**
   * Goal category for analytics
   * @default 'helpfulness'
   */
  goal?: FeedbackGoal;
  /**
   * Callback when rating is submitted
   */
  onSubmit?: (rating: 'positive' | 'negative', comment?: string) => void;
  /**
   * Custom class for the container
   */
  className?: string;
  /**
   * Compact mode (smaller, icon-only buttons)
   * @default false
   */
  compact?: boolean;
}

type RatingState = 'idle' | 'follow_up' | 'submitting' | 'success' | 'error';

// ============================================================================
// Component
// ============================================================================

export function InlineRating({
  featureId,
  question = 'Was this helpful?',
  followUpPlaceholder = 'What could be better?',
  showFollowUp = true,
  goal = 'helpfulness',
  onSubmit,
  className,
  compact = false,
}: InlineRatingProps) {
  const feedback = useFeedbackSafe();

  const [state, setState] = useState<RatingState>('idle');
  const [rating, setRating] = useState<'positive' | 'negative' | null>(null);
  const [followUpText, setFollowUpText] = useState('');
  const [isEligible, setIsEligible] = useState<boolean | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const hasCheckedEligibility = useRef(false);

  // Check eligibility on mount
  useEffect(() => {
    if (!feedback || hasCheckedEligibility.current) return;
    hasCheckedEligibility.current = true;

    feedback.checkPromptEligibility('feature_helpful', featureId).then((result) => {
      setIsEligible(result.eligible);
    });
  }, [feedback, featureId]);

  // Focus input when entering follow-up state
  useEffect(() => {
    if (state === 'follow_up' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [state]);

  // Handle rating selection
  const handleRate = useCallback(
    async (value: 'positive' | 'negative') => {
      if (!feedback) return;

      setRating(value);

      // Positive: submit immediately
      if (value === 'positive') {
        setState('submitting');

        const result = await feedback.submit({
          type: 'binary',
          value: true,
          pageUrl: typeof window !== 'undefined' ? window.location.href : '',
          featureId,
          triggerPoint: 'inline_rating',
          promptId: `inline_rating_${featureId}`,
          placement: 'inline',
          goal,
        });

        if (result.success) {
          setState('success');
          // Record responded for metrics
          feedback.recordPromptResponded('feature_helpful', featureId);
          onSubmit?.('positive');
        } else {
          setState('error');
          setErrorMessage(result.error || 'Failed to submit');
        }
        return;
      }

      // Negative: show follow-up if enabled, otherwise submit
      if (showFollowUp) {
        setState('follow_up');
      } else {
        await submitNegative();
      }
    },
    [feedback, featureId, goal, showFollowUp, onSubmit]
  );

  // Submit negative rating with optional comment
  const submitNegative = useCallback(
    async (comment?: string) => {
      if (!feedback) return;

      setState('submitting');

      const result = await feedback.submit({
        type: 'binary',
        value: false,
        textComment: comment?.trim() || undefined,
        pageUrl: typeof window !== 'undefined' ? window.location.href : '',
        featureId,
        triggerPoint: 'inline_rating',
        promptId: `inline_rating_${featureId}`,
        placement: 'inline',
        goal,
      });

      if (result.success) {
        setState('success');
        feedback.recordPromptResponded('feature_helpful', featureId);
        onSubmit?.('negative', comment?.trim());
      } else {
        setState('error');
        setErrorMessage(result.error || 'Failed to submit');
      }
    },
    [feedback, featureId, goal, onSubmit]
  );

  // Handle follow-up form submission
  const handleFollowUpSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      submitNegative(followUpText);
    },
    [submitNegative, followUpText]
  );

  // Skip follow-up
  const handleSkipFollowUp = useCallback(() => {
    submitNegative();
  }, [submitNegative]);

  // Record shown when eligible (before any early returns)
  // This ensures cooldowns apply even if user doesn't respond
  const hasRecordedShown = useRef(false);
  useEffect(() => {
    if (isEligible && feedback && !hasRecordedShown.current) {
      hasRecordedShown.current = true;
      feedback.recordPromptShown('feature_helpful', featureId);
    }
  }, [isEligible, feedback, featureId]);

  // Don't render if not eligible or feedback system unavailable
  if (!feedback || isEligible === false) {
    return null;
  }

  // Still checking eligibility
  if (isEligible === null) {
    return null;
  }

  return (
    <div
      className={cn(
        'flex flex-col gap-2 py-3',
        compact ? 'items-center' : 'items-start',
        className
      )}
      role="region"
      aria-label="Feedback"
    >
      {/* Success State */}
      {state === 'success' && (
        <p className="text-sm text-muted-foreground">
          Thanks for your feedback!
        </p>
      )}

      {/* Error State */}
      {state === 'error' && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <span>{errorMessage}</span>
          <button
            onClick={() => {
              setState('idle');
              setRating(null);
              setErrorMessage(null);
            }}
            className="underline hover:no-underline"
          >
            Try again
          </button>
        </div>
      )}

      {/* Idle State - Show rating buttons */}
      {state === 'idle' && (
        <div className={cn('flex items-center gap-3', compact && 'flex-col gap-1')}>
          {!compact && (
            <span className="text-sm text-muted-foreground">{question}</span>
          )}
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleRate('positive')}
              className={cn(
                'p-2 rounded-md transition-colors',
                'hover:bg-green-100 dark:hover:bg-green-900/30',
                'focus:outline-none focus:ring-2 focus:ring-green-500/50',
                compact ? 'p-1.5' : 'p-2'
              )}
              aria-label="Helpful"
              title="Helpful"
            >
              <ThumbsUp
                className={cn(
                  'text-muted-foreground hover:text-green-600 dark:hover:text-green-400',
                  compact ? 'h-4 w-4' : 'h-5 w-5'
                )}
              />
            </button>
            <button
              onClick={() => handleRate('negative')}
              className={cn(
                'p-2 rounded-md transition-colors',
                'hover:bg-red-100 dark:hover:bg-red-900/30',
                'focus:outline-none focus:ring-2 focus:ring-red-500/50',
                compact ? 'p-1.5' : 'p-2'
              )}
              aria-label="Not helpful"
              title="Not helpful"
            >
              <ThumbsDown
                className={cn(
                  'text-muted-foreground hover:text-red-600 dark:hover:text-red-400',
                  compact ? 'h-4 w-4' : 'h-5 w-5'
                )}
              />
            </button>
          </div>
        </div>
      )}

      {/* Follow-up State - Show text input */}
      {state === 'follow_up' && (
        <form
          onSubmit={handleFollowUpSubmit}
          className="w-full max-w-md animate-in fade-in slide-in-from-top-1 duration-200"
        >
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={followUpText}
              onChange={(e) => setFollowUpText(e.target.value)}
              placeholder={followUpPlaceholder}
              className={cn(
                'flex-1 px-3 py-2 text-sm rounded-md',
                'bg-muted/50 border border-border',
                'focus:outline-none focus:ring-2 focus:ring-primary/50'
              )}
              maxLength={500}
              aria-label={followUpPlaceholder}
            />
            <button
              type="submit"
              className={cn(
                'p-2 rounded-md',
                'bg-primary text-primary-foreground',
                'hover:bg-primary/90',
                'focus:outline-none focus:ring-2 focus:ring-primary/50',
                'transition-colors'
              )}
              aria-label="Submit feedback"
            >
              <Send className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleSkipFollowUp}
              className={cn(
                'p-2 rounded-md',
                'hover:bg-muted',
                'focus:outline-none focus:ring-2 focus:ring-muted/50',
                'transition-colors'
              )}
              aria-label="Skip and submit"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Optional - press Enter to submit or X to skip
          </p>
        </form>
      )}

      {/* Submitting State */}
      {state === 'submitting' && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Submitting...</span>
        </div>
      )}
    </div>
  );
}
