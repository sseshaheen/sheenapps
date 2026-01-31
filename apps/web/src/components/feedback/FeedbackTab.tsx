'use client';

/**
 * Feedback Tab Component
 *
 * Persistent side tab for user-initiated feedback.
 * This is the highest-signal channel - user chooses when to engage.
 *
 * Features:
 *   - Collapsed by default (just "Feedback" text/icon)
 *   - Expands to reveal simple form
 *   - Options: Bug report, Feature idea, General feedback
 *   - Auto-captures page context
 *
 * See FEEDBACK-COLLECTION-PLAN.md - Strategy 2
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useFeedbackSafe } from './FeedbackProvider';
import { MessageSquare, Bug, Lightbulb, Send, X, ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

type FeedbackCategory = 'bug' | 'feature' | 'general';

interface FeedbackTabProps {
  /**
   * Position of the tab
   * @default 'right'
   */
  position?: 'right' | 'left';
  /**
   * Custom class for the container
   */
  className?: string;
  /**
   * Disable the tab entirely
   */
  disabled?: boolean;
}

// ============================================================================
// Component
// ============================================================================

export function FeedbackTab({
  position = 'right',
  className,
  disabled = false,
}: FeedbackTabProps) {
  const feedback = useFeedbackSafe();

  const [isOpen, setIsOpen] = useState(false);
  const [category, setCategory] = useState<FeedbackCategory | null>(null);
  const [text, setText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus textarea when category is selected
  useEffect(() => {
    if (category && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [category]);

  // Reset state when closing
  const handleClose = useCallback(() => {
    setIsOpen(false);
    // Delay reset to allow animation
    setTimeout(() => {
      setCategory(null);
      setText('');
      setError(null);
      setSubmitted(false);
    }, 300);
  }, []);

  // Submit feedback
  const handleSubmit = useCallback(async () => {
    if (!feedback || !category || !text.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await feedback.submit({
        type: category === 'bug' ? 'bug_report' : category === 'feature' ? 'feature_request' : 'text',
        value: text.trim(),
        textComment: text.trim(),
        pageUrl: typeof window !== 'undefined' ? window.location.href : '',
        triggerPoint: 'feedback_tab',
        promptId: 'feedback_tab_v1',
        placement: 'tab',
        goal: category === 'bug' ? 'bug' : category === 'feature' ? 'feature' : 'satisfaction',
      });

      if (result.success) {
        setSubmitted(true);
        // Auto-close after success message
        setTimeout(handleClose, 2000);
      } else {
        setError(result.error || 'Failed to submit feedback');
      }
    } catch (err) {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [feedback, category, text, handleClose]);

  // Don't render if disabled or feedback system not available
  if (disabled || !feedback) {
    return null;
  }

  const isLeft = position === 'left';

  return (
    <>
      {/* Collapsed Tab Button */}
      <button
        onClick={() => setIsOpen(true)}
        className={cn(
          'fixed z-50 flex items-center gap-2 px-3 py-2',
          'bg-primary text-primary-foreground',
          'rounded-s-lg shadow-lg',
          'transition-transform duration-200',
          'hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary/50',
          isLeft ? 'start-0 rounded-s-none rounded-e-lg' : 'end-0',
          isOpen ? 'ltr:translate-x-full rtl:-translate-x-full opacity-0' : 'translate-x-0 opacity-100',
          // Vertical centering
          'top-1/2 -translate-y-1/2',
          className
        )}
        aria-label="Open feedback form"
      >
        <MessageSquare className="h-4 w-4" />
        <span className="text-sm font-medium">Feedback</span>
      </button>

      {/* Expanded Panel */}
      <div
        className={cn(
          'fixed z-50 top-1/2 -translate-y-1/2',
          'w-80 max-h-[80vh]',
          'bg-background border border-border rounded-lg shadow-xl',
          'transition-all duration-300 ease-out',
          isLeft ? 'start-0 rounded-s-none' : 'end-0 rounded-e-none',
          isOpen
            ? 'translate-x-0 opacity-100'
            : isLeft
            ? 'ltr:-translate-x-full rtl:translate-x-full opacity-0 pointer-events-none'
            : 'ltr:translate-x-full rtl:-translate-x-full opacity-0 pointer-events-none'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="text-sm font-semibold">Send Feedback</h3>
          <button
            onClick={handleClose}
            className="p-1 rounded hover:bg-muted transition-colors"
            aria-label="Close feedback form"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {submitted ? (
            // Success state
            <div className="text-center py-8">
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <Send className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <p className="text-sm font-medium">Thank you!</p>
              <p className="text-xs text-muted-foreground mt-1">Your feedback helps us improve.</p>
            </div>
          ) : !category ? (
            // Category selection
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground mb-3">What would you like to share?</p>

              <button
                onClick={() => setCategory('bug')}
                className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted transition-colors text-left"
              >
                <Bug className="h-5 w-5 text-red-500" />
                <div>
                  <div className="text-sm font-medium">Report a bug</div>
                  <div className="text-xs text-muted-foreground">Something isn&apos;t working</div>
                </div>
              </button>

              <button
                onClick={() => setCategory('feature')}
                className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted transition-colors text-left"
              >
                <Lightbulb className="h-5 w-5 text-yellow-500" />
                <div>
                  <div className="text-sm font-medium">Suggest a feature</div>
                  <div className="text-xs text-muted-foreground">Share an idea</div>
                </div>
              </button>

              <button
                onClick={() => setCategory('general')}
                className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted transition-colors text-left"
              >
                <MessageSquare className="h-5 w-5 text-blue-500" />
                <div>
                  <div className="text-sm font-medium">General feedback</div>
                  <div className="text-xs text-muted-foreground">Anything else</div>
                </div>
              </button>
            </div>
          ) : (
            // Feedback form
            <div className="space-y-4">
              <button
                onClick={() => setCategory(null)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronLeft className="h-3 w-3" />
                Back
              </button>

              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  {category === 'bug'
                    ? 'Describe the bug'
                    : category === 'feature'
                    ? 'Describe your idea'
                    : 'Your feedback'}
                </label>
                <textarea
                  ref={textareaRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={
                    category === 'bug'
                      ? 'What happened? What did you expect?'
                      : category === 'feature'
                      ? 'What would you like to see?'
                      : 'Share your thoughts...'
                  }
                  className={cn(
                    'mt-2 w-full min-h-[120px] p-3 text-sm',
                    'bg-muted/50 border border-border rounded-lg',
                    'resize-none focus:outline-none focus:ring-2 focus:ring-primary/50'
                  )}
                  maxLength={5000}
                />
                <div className="flex justify-between mt-1">
                  <span className="text-xs text-muted-foreground">
                    {text.length}/5000
                  </span>
                </div>
              </div>

              {error && (
                <p className="text-xs text-red-500">{error}</p>
              )}

              <button
                onClick={handleSubmit}
                disabled={!text.trim() || isSubmitting}
                className={cn(
                  'w-full flex items-center justify-center gap-2 py-2 px-4',
                  'bg-primary text-primary-foreground rounded-lg',
                  'text-sm font-medium',
                  'transition-colors',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  'hover:bg-primary/90'
                )}
              >
                {isSubmitting ? (
                  <span className="animate-pulse">Sending...</span>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Send Feedback
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/20"
          onClick={handleClose}
          aria-hidden="true"
        />
      )}
    </>
  );
}
