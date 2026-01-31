'use client'

import { useState, useEffect, ReactNode } from 'react'

interface ClientOnlyProps {
  children: ReactNode
  fallback?: ReactNode
}

/**
 * ClientOnly Component - Hydration Mismatch Prevention
 * 
 * Renders children only after client-side hydration is complete.
 * Use sparingly - only for truly client-specific content.
 * 
 * @param children - Content to render client-side only
 * @param fallback - Placeholder during SSR (default: null)
 */
export function ClientOnly({ children, fallback = null }: ClientOnlyProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return mounted ? <>{children}</> : <>{fallback}</>
}