/**
 * Log Message Syntax Highlighter - Calm and readable approach
 * Uses a minimal color palette focused on high-signal patterns only
 */

import React from 'react'
import './log-theme.css'

interface LogMessageHighlighterProps {
  message: string
  className?: string
  variant?: 'calm' | 'balanced' // new
}

export function LogMessageHighlighter({ message, className = '', variant = 'balanced' }: LogMessageHighlighterProps) {
  const highlightMessage = (text: string): React.ReactNode[] => {
    if (!text) return []

    const calm: Array<{ regex: RegExp; className: string }> = [
      { regex: /(https?:\/\/[^\s]+|\/api\/[^\s]*)/g, className: 'log__link' },
      { regex: /(\/[^\s]+(?:\.[a-z0-9]+)?|[a-zA-Z]:\\[^\s]+(?:\.[a-z0-9]+)?)/gi, className: 'log__path' },
      { regex: /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z?\b/g, className: 'log__muted' },
      { regex: /\b(\d+(?:\.\d+)?)\s?(MB|KB|GB|TB|ms|s|sec|min|%|px|rem|em)\b/gi, className: 'log__num' },
      { regex: /\b(200|201|204|400|401|403|404|500|502|503)\b/g, className: 'log__num' },
      { regex: /\b(ERROR|FAILED|FATAL)\b/gi, className: 'log-badge log-badge--error' },
      { regex: /\b(WARN|WARNING)\b/gi, className: 'log-badge log-badge--warn' },
      { regex: /\b(SUCCESS|SUCCESSFUL|COMPLETED|DEPLOYED|PASSED)\b/gi, className: 'log-badge log-badge--success' },
    ]

    // 👇 adds gentle JSON-centric cues
    const balanced: Array<{ regex: RegExp; className: string }> = [
      ...calm,
      // JSON keys: "key":
      { regex: /"[\w-]+"\s*:/g, className: 'log__key' },
      // UUIDs
      { regex: /\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/gi, className: 'log__id' },
      // ULIDs (case-insensitive)
      { regex: /\b[0-9A-HJKMNP-TV-Z]{26}\b/gi, className: 'log__id' },
      // booleans/null
      { regex: /\b(true|false|null)\b/g, className: 'log__muted' },
      // big plain numbers (token counts, sizes) – 3+ digits, not part of an id token
      { regex: /(?<![A-Za-z0-9])\d{3,}(?![A-Za-z0-9])/g, className: 'log__num' },
    ]

    const patterns = variant === 'calm' ? calm : balanced

    const matches: Array<{ start: number; end: number; node: React.ReactNode }> = []

    patterns.forEach((p, i) => {
      let m: RegExpExecArray | null
      while ((m = p.regex.exec(text)) !== null) {
        matches.push({
          start: m.index,
          end: m.index + m[0].length,
          node: <span key={`m-${i}-${m.index}`} className={p.className}>{m[0]}</span>
        })
      }
      p.regex.lastIndex = 0
    })

    matches.sort((a, b) => a.start - b.start)
    const out: React.ReactNode[] = []
    let cur = 0
    for (const { start, end, node } of matches) {
      if (start < cur) continue
      if (cur < start) out.push(text.slice(cur, start))
      out.push(node)
      cur = end
    }
    if (cur < text.length) out.push(text.slice(cur))
    return out.length ? out : [text]
  }

  return <span className={`log ${className}`}>{highlightMessage(message)}</span>
}