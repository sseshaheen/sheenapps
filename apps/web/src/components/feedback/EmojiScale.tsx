'use client';

/**
 * Emoji Scale Component
 *
 * 5-point emoji satisfaction scale for quick emotional feedback.
 * Used by MicroSurvey and can be used standalone.
 *
 * Best Practices Applied:
 *   - Single tap selection
 *   - Clear visual feedback on selection
 *   - Accessible: keyboard navigation, aria-labels
 *   - Mobile-friendly: large touch targets
 *
 * See FEEDBACK-COLLECTION-PLAN.md - Strategy 3
 */

import React, { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

export type EmojiValue = 1 | 2 | 3 | 4 | 5;

interface EmojiOption {
  value: EmojiValue;
  emoji: string;
  label: string;
}

const DEFAULT_EMOJIS: EmojiOption[] = [
  { value: 1, emoji: '😞', label: 'Very dissatisfied' },
  { value: 2, emoji: '😐', label: 'Dissatisfied' },
  { value: 3, emoji: '🙂', label: 'Neutral' },
  { value: 4, emoji: '😊', label: 'Satisfied' },
  { value: 5, emoji: '🤩', label: 'Very satisfied' },
];

interface EmojiScaleProps {
  /**
   * Currently selected value (controlled)
   */
  value?: EmojiValue | null;
  /**
   * Callback when emoji is selected
   */
  onChange?: (value: EmojiValue) => void;
  /**
   * Custom emojis (must have 5 items)
   */
  emojis?: EmojiOption[];
  /**
   * Show labels below emojis
   * @default false
   */
  showLabels?: boolean;
  /**
   * Disabled state
   */
  disabled?: boolean;
  /**
   * Size variant
   * @default 'default'
   */
  size?: 'sm' | 'default' | 'lg';
  /**
   * Custom class for the container
   */
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

export function EmojiScale({
  value,
  onChange,
  emojis = DEFAULT_EMOJIS,
  showLabels = false,
  disabled = false,
  size = 'default',
  className,
}: EmojiScaleProps) {
  const [hoveredValue, setHoveredValue] = useState<EmojiValue | null>(null);

  const handleSelect = useCallback(
    (emojiValue: EmojiValue) => {
      if (disabled) return;
      onChange?.(emojiValue);
    },
    [disabled, onChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, emojiValue: EmojiValue) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleSelect(emojiValue);
      }
    },
    [handleSelect]
  );

  const sizeClasses = {
    sm: 'text-xl p-1.5 min-w-[36px]',
    default: 'text-2xl p-2 min-w-[44px]',
    lg: 'text-3xl p-3 min-w-[56px]',
  };

  return (
    <div
      className={cn('flex flex-col items-center gap-2', className)}
      role="radiogroup"
      aria-label="Satisfaction rating"
    >
      <div className="flex items-center gap-1">
        {emojis.map((emoji) => {
          const isSelected = value === emoji.value;
          const isHovered = hoveredValue === emoji.value;

          return (
            <button
              key={emoji.value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={emoji.label}
              disabled={disabled}
              onClick={() => handleSelect(emoji.value)}
              onKeyDown={(e) => handleKeyDown(e, emoji.value)}
              onMouseEnter={() => setHoveredValue(emoji.value)}
              onMouseLeave={() => setHoveredValue(null)}
              className={cn(
                'rounded-lg transition-all duration-150',
                'focus:outline-none focus:ring-2 focus:ring-primary/50',
                sizeClasses[size],
                isSelected
                  ? 'bg-primary/10 scale-110 ring-2 ring-primary/30'
                  : isHovered
                  ? 'bg-muted scale-105'
                  : 'hover:bg-muted',
                disabled && 'opacity-50 cursor-not-allowed'
              )}
            >
              <span className={cn(!isSelected && !isHovered && 'grayscale-[30%]')}>
                {emoji.emoji}
              </span>
            </button>
          );
        })}
      </div>

      {showLabels && (
        <div className="flex justify-between w-full text-xs text-muted-foreground px-1">
          <span>{emojis[0]?.label}</span>
          <span>{emojis[emojis.length - 1]?.label}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Default emoji options export for customization
 */
export { DEFAULT_EMOJIS };
