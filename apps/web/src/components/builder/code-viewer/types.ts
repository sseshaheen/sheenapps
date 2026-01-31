/**
 * Shared types for code viewer components
 *
 * Centralizes type definitions to avoid duplication and drift.
 */

/**
 * Represents a search match in code content.
 */
export interface SearchMatch {
  /** 1-indexed line number */
  line: number
  /** 1-indexed column within the line (consistent with line for human-readability) */
  column: number
  /** Start offset in the full content string (0-indexed) */
  start: number
  /** End offset in the full content string (0-indexed, exclusive) */
  end: number
}

/**
 * Token from syntax highlighting (Prism tokenization).
 */
export interface Token {
  content: string
  type: string // e.g., 'keyword', 'string', 'comment', etc.
}

/**
 * Line height constant (px) - 14px font * 1.5 line-height = 21px
 * Used by both virtualized and non-virtualized code views.
 */
export const LINE_HEIGHT = 21
