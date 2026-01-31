'use client';

/**
 * CSAT Survey Component
 *
 * Customer Satisfaction survey for support interactions.
 * Uses 1-5 star scale with optional follow-up question.
 *
 * Best Practices Applied:
 *   - Short and focused (1 question + optional follow-up)
 *   - 1-5 scale (consistent, easy to understand)
 *   - Triggered after support resolution
 *   - Mobile-first design
 *   - Per-ticket frequency cap (via featureId)
 *
 * See FEEDBACK-COLLECTION-PLAN.md - Phase 4: Relationship Metrics
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useFeedbackSafe } from './FeedbackProvider';
import { Star, X, Send, Loader2, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

type CSATScore = 1 | 2 | 3 | 4 | 5;

interface CSATSurveyProps {
  /**
   * Unique identifier for the interaction (ticket ID, session ID)
   * Used for per-ticket frequency cap
   */
  interactionId: string;
  /**
   * Type of interaction for context
   * @default 'support'
   */
  interactionType?: 'support' | 'chat' | 'call' | 'email';
  /**
   * Custom question text
   * @default "How satisfied are you with the support you received?"
   */
  question?: string;
  /**
   * Show follow-up text input?
   * @default true
   */
  showFollowUp?: boolean;
  /**
   * Callback when survey is dismissed
   */
  onDismiss?: () => void;
  /**
   * Callback when survey is submitted
   */
  onSubmit?: (score: CSATScore, comment?: string) => void;
  /**
   * External control to show/hide
   * @default true
   */
  enabled?: boolean;
  /**
   * Presentation style
   * @default 'card'
   */
  variant?: 'card' | 'inline' | 'modal';
  /**
   * Custom class for the container
   */
  className?: string;
}

type SurveyState = 'checking' | 'rating' | 'follow_up' | 'submitting' | 'success' | 'hidden';

// ============================================================================
// Helpers
// ============================================================================

function getScoreLabel(score: CSATScore): string {
  switch (score) {
    case 1:
      return 'Very dissatisfied';
    case 2:
      return 'Dissatisfied';
    case 3:
      return 'Neutral';
    case 4:
      return 'Satisfied';
    case 5:
      return 'Very satisfied';
  }
}

function getFollowUpQuestion(score: CSATScore): string {
  if (score <= 2) {
    return "We're sorry to hear that. What could we have done better?";
  }
  if (score === 3) {
    return 'What could we improve?';
  }
  return 'What did you appreciate most?';
}

// ============================================================================
// Component
// ============================================================================

export function CSATSurvey({
  interactionId,
  interactionType = 'support',
  question = 'How satisfied are you with the support you received?',
  showFollowUp = true,
  onDismiss,
  onSubmit,
  enabled = true,
  variant = 'card',
  className,
}: CSATSurveyProps) {
  const feedback = useFeedbackSafe();

  const [state, setState] = useState<SurveyState>('checking');
  const [selectedScore, setSelectedScore] = useState<CSATScore | null>(null);
  const [hoveredScore, setHoveredScore] = useState<CSATScore | null>(null);
  const [comment, setComment] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const hasCheckedEligibility = useRef(false);
  const hasRecordedShown = useRef(false);

  // Build feature ID for per-ticket tracking
  const featureId = `csat_${interactionType}_${interactionId}`;

  // Check eligibility on mount
  useEffect(() => {
    if (!feedback || !enabled || hasCheckedEligibility.current) return;
    hasCheckedEligibility.current = true;

    const checkEligibility = async () => {
      // Check server-side eligibility (per-ticket cap)
      const result = await feedback.checkPromptEligibility('csat', featureId);
      if (!result.eligible) {
        setState('hidden');
        return;
      }

      setState('rating');
    };

    checkEligibility();
  }, [feedback, enabled, featureId]);

  // Record 'shown' when survey becomes visible
  useEffect(() => {
    if (state === 'rating' && feedback && !hasRecordedShown.current) {
      hasRecordedShown.current = true;
      feedback.recordPromptShown('csat', featureId);
    }
  }, [state, feedback, featureId]);

  // Handle dismiss
  const handleDismiss = useCallback(() => {
    setState('hidden');
    onDismiss?.();
  }, [onDismiss]);

  // Handle score selection
  const handleScoreSelect = useCallback((score: CSATScore) => {
    setSelectedScore(score);
  }, []);

  // Move to follow-up or submit directly
  const handleNext = useCallback(() => {
    if (selectedScore === null) return;

    if (showFollowUp) {
      setState('follow_up');
    } else {
      handleSubmitDirect();
    }
  }, [selectedScore, showFollowUp]);

  // Submit directly without follow-up
  const handleSubmitDirect = useCallback(async () => {
    if (!feedback || selectedScore === null) return;

    setState('submitting');
    setErrorMessage(null);

    const result = await feedback.submit({
      type: 'csat',
      value: selectedScore,
      pageUrl: typeof window !== 'undefined' ? window.location.href : '',
      featureId,
      triggerPoint: `csat_${interactionType}`,
      promptId: `csat_${interactionType}_v1`,
      placement: variant === 'inline' ? 'inline' : variant === 'modal' ? 'modal' : 'toast',
      goal: 'satisfaction',
    });

    if (result.success) {
      setState('success');
      feedback.recordPromptResponded('csat', featureId);
      onSubmit?.(selectedScore);

      // Auto-dismiss after 2 seconds
      setTimeout(handleDismiss, 2000);
    } else {
      setErrorMessage(result.error || 'Failed to submit');
      setState('rating');
    }
  }, [feedback, selectedScore, featureId, interactionType, variant, onSubmit, handleDismiss]);

  // Submit with follow-up
  const handleSubmit = useCallback(async () => {
    if (!feedback || selectedScore === null) return;

    setState('submitting');
    setErrorMessage(null);

    const result = await feedback.submit({
      type: 'csat',
      value: selectedScore,
      textComment: comment.trim() || undefined,
      pageUrl: typeof window !== 'undefined' ? window.location.href : '',
      featureId,
      triggerPoint: `csat_${interactionType}`,
      promptId: `csat_${interactionType}_v1`,
      placement: variant === 'inline' ? 'inline' : variant === 'modal' ? 'modal' : 'toast',
      goal: 'satisfaction',
    });

    if (result.success) {
      setState('success');
      feedback.recordPromptResponded('csat', featureId);
      onSubmit?.(selectedScore, comment.trim() || undefined);

      // Auto-dismiss after 2 seconds
      setTimeout(handleDismiss, 2000);
    } else {
      setErrorMessage(result.error || 'Failed to submit');
      setState('follow_up');
    }
  }, [feedback, selectedScore, comment, featureId, interactionType, variant, onSubmit, handleDismiss]);

  // Skip follow-up
  const handleSkipFollowUp = useCallback(() => {
    setComment('');
    handleSubmitDirect();
  }, [handleSubmitDirect]);

  // Don't render if hidden, checking, or no feedback
  if (!feedback || state === 'hidden' || state === 'checking') {
    return null;
  }

  // Variant classes
  // Note: relative is needed for absolute-positioned close button
  const containerClasses = cn(
    'relative rounded-lg border border-border bg-background shadow-lg',
    variant === 'card' && 'p-4 max-w-sm',
    variant === 'inline' && 'p-3',
    variant === 'modal' && 'p-6 max-w-md mx-auto',
    className
  );

  // Display score for stars
  const displayScore = hoveredScore ?? selectedScore;

  return (
    <div className={containerClasses} role="dialog" aria-label="Customer satisfaction survey">
      {/* Close button */}
      {variant !== 'inline' && (
        <button
          onClick={handleDismiss}
          className="absolute top-2 end-2 p-1 rounded hover:bg-muted transition-colors"
          aria-label="Close survey"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      )}

      {/* Success State */}
      {state === 'success' && (
        <div className="text-center py-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-center gap-2 text-green-600 dark:text-green-400">
            <CheckCircle className="h-5 w-5" />
            <span className="font-medium">Thank you for your feedback!</span>
          </div>
        </div>
      )}

      {/* Rating State */}
      {state === 'rating' && (
        <div className="space-y-4">
          <p className="text-sm font-medium pr-6">{question}</p>

          {/* Star rating */}
          <div className="flex justify-center gap-1">
            {([1, 2, 3, 4, 5] as CSATScore[]).map((score) => {
              const isFilled = displayScore !== null && score <= displayScore;

              return (
                <button
                  key={score}
                  onClick={() => handleScoreSelect(score)}
                  onMouseEnter={() => setHoveredScore(score)}
                  onMouseLeave={() => setHoveredScore(null)}
                  className={cn(
                    'p-1 rounded transition-transform',
                    'focus:outline-none focus:ring-2 focus:ring-primary/50',
                    'hover:scale-110'
                  )}
                  aria-label={`${score} star${score > 1 ? 's' : ''} - ${getScoreLabel(score)}`}
                  aria-pressed={selectedScore === score}
                >
                  <Star
                    className={cn(
                      'h-8 w-8 transition-colors',
                      isFilled
                        ? 'fill-yellow-400 text-yellow-400'
                        : 'text-muted-foreground'
                    )}
                  />
                </button>
              );
            })}
          </div>

          {/* Score label */}
          {displayScore && (
            <p className="text-center text-xs text-muted-foreground">
              {getScoreLabel(displayScore)}
            </p>
          )}

          {/* Submit button */}
          <div className="flex justify-center pt-2">
            <button
              onClick={handleNext}
              disabled={selectedScore === null}
              className={cn(
                'px-4 py-2 rounded-md text-sm font-medium transition-colors',
                'bg-primary text-primary-foreground',
                'hover:bg-primary/90',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {showFollowUp ? 'Next' : 'Submit'}
            </button>
          </div>
        </div>
      )}

      {/* Follow-up State */}
      {state === 'follow_up' && selectedScore !== null && (
        <div className="space-y-3 animate-in fade-in slide-in-from-right-2 duration-200">
          <p className="text-sm font-medium">{getFollowUpQuestion(selectedScore)}</p>

          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Share your thoughts... (optional)"
            className={cn(
              'w-full min-h-[70px] p-2 text-sm rounded-md resize-none',
              'bg-muted/50 border border-border',
              'focus:outline-none focus:ring-2 focus:ring-primary/50'
            )}
            maxLength={500}
            autoFocus
          />

          {errorMessage && (
            <p className="text-xs text-destructive">{errorMessage}</p>
          )}

          <div className="flex items-center justify-between">
            <button
              onClick={handleSkipFollowUp}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Skip
            </button>
            <button
              onClick={handleSubmit}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium',
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
        <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Submitting...</span>
        </div>
      )}
    </div>
  );
}
