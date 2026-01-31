/**
 * Lazy-loaded SyntaxHighlighter wrapper
 *
 * Performance optimization: react-syntax-highlighter + styles are ~100KB.
 * This wrapper enables dynamic import so the bundle is loaded only when needed.
 *
 * @see PERFORMANCE_ANALYSIS.md - Bottleneck 1: react-syntax-highlighter Not Lazy-Loaded
 */

'use client'

import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'

export interface SyntaxHighlighterProps {
  children: string
  language: string
  isDark: boolean
  showLineNumbers: boolean
  wrapLines: boolean
  lineProps?: (lineNumber: number) => { style: React.CSSProperties }
}

export function LazySyntaxHighlighter({
  children,
  language,
  isDark,
  showLineNumbers,
  wrapLines,
  lineProps,
}: SyntaxHighlighterProps) {
  return (
    <SyntaxHighlighter
      language={language}
      style={isDark ? oneDark : oneLight}
      showLineNumbers={showLineNumbers}
      wrapLines={wrapLines}
      lineProps={lineProps}
      customStyle={{
        margin: 0,
        padding: '1rem',
        background: 'transparent',
        fontSize: '0.875rem',
        lineHeight: '1.5',
      }}
      codeTagProps={{
        style: {
          fontFamily:
            'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace',
        },
      }}
      lineNumberStyle={{
        minWidth: '3em',
        paddingRight: '1em',
        textAlign: 'right',
        userSelect: 'none',
        opacity: 0.5,
      }}
    >
      {children}
    </SyntaxHighlighter>
  )
}

// Export styles for cases where direct access is needed
export { oneDark, oneLight }
