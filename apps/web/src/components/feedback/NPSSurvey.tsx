'use client';

/**
 * NPS Survey Component
 *
 * Net Promoter Score survey with standard 0-10 scale.
 * Uses touch-friendly buttons (not sliders) for better mobile UX.
 *
 * Best Practices Applied:
 *   - Standard 0-10 scale (no modifications for benchmarking)
 *   - Touch-friendly discrete buttons (not sliders)
 *   - Conditional follow-up based on score category
 *   - Bottom banner presentation (non-intrusive)
 *   - Server-enforced 90-day cooldown
 *   - Queue priority integration
 *
 * See FEEDBACK-COLLECTION-PLAN.md - Phase 4: Relationship Metrics
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useFeedbackSafe } from './FeedbackProvider';
import { X, Send, Loader2, Heart } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

type NPSScore = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
type NPSCategory = 'detractor' | 'passive' | 'promoter';

interface NPSSurveyProps {
  /**
   * Callback when survey is dismissed
   */
  onDismiss?: () => void;
  /**
   * Callback when survey is submitted
   */
  onSubmit?: (score: NPSScore, category: NPSCategory, comment?: string) => void;
  /**
   * External control to show/hide
   * @default true
   */
  enabled?: boolean;
  /**
   * Custom class for the container
   */
  className?: string;
  /**
   * Position of the survey banner
   * @default 'bottom'
   */
  position?: 'bottom' | 'top';
}

type SurveyState = 'checking' | 'score' | 'follow_up' | 'submitting' | 'success' | 'hidden';

// ============================================================================
// Helpers
// ============================================================================

function getCategory(score: NPSScore): NPSCategory {
  if (score >= 9) return 'promoter';
  if (score >= 7) return 'passive';
  return 'detractor';
}

function getFollowUpQuestion(category: NPSCategory): string {
  switch (category) {
    case 'promoter':
      return 'What do you love most about our product?';
    case 'passive':
      return 'What could we improve to make your experience even better?';
    case 'detractor':
      return 'What issue led to your rating? We want to make it right.';
  }
}

function getScoreColor(score: NPSScore, isSelected: boolean): string {
  if (!isSelected) return 'bg-muted hover:bg-muted/80';

  if (score >= 9) return 'bg-green-500 text-white';
  if (score >= 7) return 'bg-yellow-500 text-white';
  return 'bg-red-500 text-white';
}

// ============================================================================
// Component
// ============================================================================

export function NPSSurvey({
  onDismiss,
  onSubmit,
  enabled = true,
  className,
  position = 'bottom',
}: NPSSurveyProps) {
  const feedback = useFeedbackSafe();

  const [state, setState] = useState<SurveyState>('checking');
  const [selectedScore, setSelectedScore] = useState<NPSScore | null>(null);
  const [comment, setComment] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const hasCheckedEligibility = useRef(false);
  const hasRecordedShown = useRef(false);

  // Check eligibility on mount
  useEffect(() => {
    if (!feedback || !enabled || hasCheckedEligibility.current) return;
    hasCheckedEligibility.current = true;

    const checkEligibility = async () => {
      // Check queue priority first (client-side)
      if (!feedback.canShowPrompt('nps')) {
        setState('hidden');
        return;
      }

      // Check server-side eligibility (90-day cooldown)
      const result = await feedback.checkPromptEligibility('nps');
      if (!result.eligible) {
        setState('hidden');
        return;
      }

      setState('score');
    };

    checkEligibility();
  }, [feedback, enabled]);

  // Record 'shown' when survey becomes visible
  useEffect(() => {
    if (state === 'score' && feedback && !hasRecordedShown.current) {
      hasRecordedShown.current = true;
      feedback.recordPromptShown('nps');
    }
  }, [state, feedback]);

  // Handle dismiss
  const handleDismiss = useCallback(() => {
    setState('hidden');
    onDismiss?.();
  }, [onDismiss]);

  // Handle score selection
  const handleScoreSelect = useCallback((score: NPSScore) => {
    setSelectedScore(score);
  }, []);

  // Move to follow-up
  const handleNext = useCallback(() => {
    if (selectedScore !== null) {
      setState('follow_up');
    }
  }, [selectedScore]);

  // Submit the survey
  const handleSubmit = useCallback(async () => {
    if (!feedback || selectedScore === null) return;

    setState('submitting');
    setErrorMessage(null);

    const category = getCategory(selectedScore);

    const result = await feedback.submit({
      type: 'nps',
      value: selectedScore,
      textComment: comment.trim() || undefined,
      pageUrl: typeof window !== 'undefined' ? window.location.href : '',
      triggerPoint: 'nps_survey',
      promptId: 'nps_survey_v1',
      placement: 'banner',
      goal: 'nps',
    });

    if (result.success) {
      setState('success');
      feedback.recordPromptResponded('nps');
      onSubmit?.(selectedScore, category, comment.trim() || undefined);

      // Auto-dismiss after 2 seconds
      setTimeout(handleDismiss, 2000);
    } else {
      setErrorMessage(result.error || 'Failed to submit');
      setState('follow_up');
    }
  }, [feedback, selectedScore, comment, onSubmit, handleDismiss]);

  // Skip follow-up and submit just the score
  const handleSkipFollowUp = useCallback(async () => {
    setComment('');
    await handleSubmit();
  }, [handleSubmit]);

  // Don't render if hidden, checking, or no feedback
  if (!feedback || state === 'hidden' || state === 'checking') {
    return null;
  }

  const category = selectedScore !== null ? getCategory(selectedScore) : null;

  return (
    <div
      className={cn(
        'fixed left-0 right-0 z-50',
        'bg-background border-t border-border shadow-lg',
        'animate-in slide-in-from-bottom-4 duration-300',
        position === 'bottom' ? 'bottom-0' : 'top-0 border-t-0 border-b',
        className
      )}
      role="dialog"
      aria-label="NPS Survey"
    >
      <div className="max-w-3xl mx-auto p-4">
        {/* Close button */}
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 p-1.5 rounded-md hover:bg-muted transition-colors"
          aria-label="Close survey"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>

        {/* Success State */}
        {state === 'success' && (
          <div className="text-center py-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-center gap-2 text-green-600 dark:text-green-400">
              <Heart className="h-5 w-5 fill-current" />
              <span className="font-medium">Thank you for your feedback!</span>
            </div>
          </div>
        )}

        {/* Score Selection State */}
        {state === 'score' && (
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-sm font-medium">
                How likely are you to recommend us to a friend or colleague?
              </p>
            </div>

            {/* Score buttons */}
            <div className="flex justify-center gap-1 sm:gap-2">
              {([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as NPSScore[]).map((score) => (
                <button
                  key={score}
                  onClick={() => handleScoreSelect(score)}
                  className={cn(
                    'w-8 h-10 sm:w-10 sm:h-12 rounded-md text-sm font-medium transition-all',
                    'focus:outline-none focus:ring-2 focus:ring-primary/50',
                    getScoreColor(score, selectedScore === score),
                    selectedScore === score && 'scale-110 shadow-md'
                  )}
                  aria-label={`Score ${score}`}
                  aria-pressed={selectedScore === score}
                >
                  {score}
                </button>
              ))}
            </div>

            {/* Scale labels */}
            <div className="flex justify-between text-xs text-muted-foreground px-1">
              <span>Not at all likely</span>
              <span>Extremely likely</span>
            </div>

            {/* Next button */}
            <div className="flex justify-center pt-2">
              <button
                onClick={handleNext}
                disabled={selectedScore === null}
                className={cn(
                  'px-6 py-2 rounded-md text-sm font-medium transition-colors',
                  'bg-primary text-primary-foreground',
                  'hover:bg-primary/90',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                Next
              </button>
            </div>
          </div>
        )}

        {/* Follow-up State */}
        {state === 'follow_up' && category && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-200">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center text-white font-medium',
                  category === 'promoter' && 'bg-green-500',
                  category === 'passive' && 'bg-yellow-500',
                  category === 'detractor' && 'bg-red-500'
                )}
              >
                {selectedScore}
              </div>
              <p className="text-sm font-medium flex-1">
                {getFollowUpQuestion(category)}
              </p>
            </div>

            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Share your thoughts... (optional)"
              className={cn(
                'w-full min-h-[80px] p-3 text-sm rounded-md resize-none',
                'bg-muted/50 border border-border',
                'focus:outline-none focus:ring-2 focus:ring-primary/50'
              )}
              maxLength={1000}
              autoFocus
            />

            {errorMessage && (
              <p className="text-xs text-destructive">{errorMessage}</p>
            )}

            <div className="flex items-center justify-between">
              <button
                onClick={handleSkipFollowUp}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Skip
              </button>
              <button
                onClick={handleSubmit}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium',
                  'bg-primary text-primary-foreground',
                  'hover:bg-primary/90 transition-colors'
                )}
              >
                <Send className="h-4 w-4" />
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
