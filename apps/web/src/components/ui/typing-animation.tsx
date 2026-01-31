"use client"

import { useEffect, useMemo, useState } from "react"
import { m, AnimatePresence } from '@/components/ui/motion-provider'

interface TypingAnimationProps {
  sequences: {
    text: string
    duration?: number
    pauseAfter?: number
  }[]
  className?: string
  cursor?: boolean
  dir?: 'rtl' | 'ltr'
}

function splitGraphemes(text: string) {
  // Avoid breaking Arabic ligatures/emoji
  if (typeof Intl !== 'undefined' && (Intl as any).Segmenter) {
    const seg = new (Intl as any).Segmenter(undefined, { granularity: 'grapheme' })
    return Array.from(seg.segment(text), (s: any) => s.segment)
  }
  return Array.from(text)
}

export function TypingAnimation({ sequences, className = "", cursor = true, dir = 'ltr' }: TypingAnimationProps) {
  const [currentSequence, setCurrentSequence] = useState(0)
  const [order, setOrder] = useState<number[]>([])
  const [count, setCount] = useState(0)

  useEffect(() => {
    const indices = sequences.map((_, index) => index)
    for (let i = indices.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[indices[i], indices[j]] = [indices[j], indices[i]]
    }
    setOrder(indices)
    setCurrentSequence(0)
  }, [sequences])

  const hasSequences = sequences.length > 0
  const effectiveOrder = order.length > 0 ? order : sequences.map((_, index) => index)
  const sequence = hasSequences
    ? sequences[effectiveOrder[currentSequence % effectiveOrder.length]]
    : { text: '', duration: 0, pauseAfter: 0 }

  const units = useMemo(
    () => splitGraphemes(sequence.text.replace(/^[\u200E\u200F\u202A-\u202E\s]+/, '')),
    [sequence.text]
  )

  // (Re)start on sequence change
  useEffect(() => {
    if (!hasSequences) return
    setCount(0)
    const total = sequence.duration ?? 2000
    const step = Math.max(1, Math.round(units.length / (total / 50)))
    
    
    const typingInterval = setInterval(() => {
      setCount((c) => {
        const next = Math.min(c + step, units.length)
        if (next === units.length) {
          clearInterval(typingInterval)
          setTimeout(() => {
            setCurrentSequence((prev) => {
              const next = prev + 1
              if (next >= effectiveOrder.length) {
                const indices = sequences.map((_, index) => index)
                for (let i = indices.length - 1; i > 0; i -= 1) {
                  const j = Math.floor(Math.random() * (i + 1))
                  ;[indices[i], indices[j]] = [indices[j], indices[i]]
                }
                setOrder(indices)
                return 0
              }
              return next
            })
          }, sequence.pauseAfter ?? 1000)
        }
        return next
      })
    }, 50)
    
    return () => clearInterval(typingInterval)
  }, [sequence, units.length, hasSequences, sequences, effectiveOrder.length])

  const currentText = useMemo(() => units.slice(0, count).join(''), [units, count])
  
  if (!hasSequences) {
    return null
  }

  return (
    <div
      className={`${className} w-full min-w-0 flex ${dir === 'rtl' ? 'justify-end' : 'justify-start'}`}
      dir={dir}
      style={{ direction: dir }}
    >
      <AnimatePresence mode="wait">
          <m.span
            key={currentSequence}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            dir={dir}
            style={{ direction: dir, textAlign: dir === 'rtl' ? 'right' : 'left' }}
            className={`relative inline-block whitespace-pre-wrap break-words [unicode-bidi:isolate] ${dir === 'rtl' ? 'text-right' : 'text-left'} max-w-full`}
          >
            <span
              dir={dir}
              style={{ direction: dir, unicodeBidi: 'plaintext' }}
              className="relative inline-block align-text-bottom"
            >
              <bdi dir={dir}>{currentText || '\u00A0'}</bdi>
              {cursor && (
                <m.span
                  animate={{ opacity: [1, 1, 0, 0] }}
                  transition={{
                    duration: 1.2,
                    repeat: Infinity,
                    ease: "linear",
                    times: [0, 0.5, 0.5, 1]
                  }}
                  aria-hidden
                  className="absolute top-0 h-[1em] w-[2px] bg-current"
                  style={{ insetInlineEnd: '-2px' }}
                />
              )}
            </span>
          </m.span>
      </AnimatePresence>
    </div>
  )
}
