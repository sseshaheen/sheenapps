/**
 * Auto-scroll Hook with Proper UX
 * Fixes common bugs:
 * 1. Auto-scroll failing when user was near-bottom before scrollHeight grows
 * 2. Force-scrolling when user intentionally scrolled up to read earlier messages
 * 3. Content growing without message count changing (streaming tokens appending)
 * 4. rAF not canceled on unmount (memory leak)
 *
 * Expert validation: Jan 2026 (Round 9)
 */

'use client'

import { useCallback, useEffect, useRef } from 'react'

type ScrollBehaviorMode = 'smooth' | 'instant'

export function useAutoScroll(opts?: { thresholdPx?: number }) {
  const thresholdPx = opts?.thresholdPx ?? 120

  const containerRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)

  const isNearBottomRef = useRef(true)
  const rafRef = useRef<number | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)

  const computeIsNearBottom = useCallback(() => {
    const el = containerRef.current
    if (!el) return true
    return el.scrollTop + el.clientHeight >= el.scrollHeight - thresholdPx
  }, [thresholdPx])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onScroll = () => {
      isNearBottomRef.current = computeIsNearBottom()
    }

    // init
    isNearBottomRef.current = computeIsNearBottom()

    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [computeIsNearBottom])

  const scrollToBottom = useCallback((behavior: ScrollBehaviorMode = 'smooth') => {
    const endEl = endRef.current
    if (!endEl) return

    if (rafRef.current) cancelAnimationFrame(rafRef.current)

    rafRef.current = requestAnimationFrame(() => {
      const scrollBehavior: ScrollBehavior = behavior === 'instant' ? 'auto' : 'smooth'
      endEl.scrollIntoView({ behavior: scrollBehavior, block: 'end' })
      rafRef.current = null
    })
  }, [])

  const shouldAutoScroll = useCallback(() => isNearBottomRef.current, [])

  // EXPERT FIX ROUND 9: Observe content size changes (streaming edits, image loads, code blocks expanding)
  // Without this, streaming messages that grow don't trigger auto-scroll (messages.length doesn't change)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    // Guard: ResizeObserver not available in some test runners
    if (typeof ResizeObserver === 'undefined') return

    resizeObserverRef.current?.disconnect()
    resizeObserverRef.current = new ResizeObserver(() => {
      if (shouldAutoScroll()) {
        // instant to avoid "rubber band" feel during streaming
        scrollToBottom('instant')
      }
    })

    resizeObserverRef.current.observe(el)

    return () => {
      resizeObserverRef.current?.disconnect()
      resizeObserverRef.current = null
    }
  }, [scrollToBottom, shouldAutoScroll])

  // EXPERT FIX ROUND 9: Cleanup rAF to avoid calling scrollIntoView after unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [])

  return {
    containerRef,
    endRef,
    scrollToBottom,
    shouldAutoScroll
  }
}
