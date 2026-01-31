'use client'

import { useState, useEffect } from 'react'

interface ClientOnlyProps {
  children: React.ReactNode
  fallback?: React.ReactNode
}

export function ClientOnly({ children, fallback = null }: ClientOnlyProps) {
  const [ready, setReady] = useState(false)
  
  useEffect(() => {
    setReady(true)
  }, [])
  
  if (!ready) return <>{fallback}</>
  return <>{children}</>
}