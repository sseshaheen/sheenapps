'use client'

import React from 'react'

interface MobilePreviewPanelSimpleProps {
  projectId: string
  sessionStartTime: number
  onLayoutChange?: (layoutId: string) => void
  currentLayoutId?: string
  isLayoutReady?: boolean
  children?: React.ReactNode
}

export function MobilePreviewPanelSimple({
  children
}: MobilePreviewPanelSimpleProps) {
  return (
    <div className="h-full w-full">
      {children}
    </div>
  )
}