'use client'

import React from 'react'
import { cn } from '@/lib/utils'

interface WorkspaceLayoutProps {
  children: React.ReactNode
  isFullscreen?: boolean
}

export function WorkspaceLayout({ children, isFullscreen = false }: WorkspaceLayoutProps) {
  return (
    <div className={cn(
      "flex flex-col bg-gray-900 text-white",
      isFullscreen ? "fixed inset-0 z-50" : "h-screen"
    )}>
      {children}
    </div>
  )
}