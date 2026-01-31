'use client'

import React from 'react'

interface WorkspaceCanvasProps {
  children?: React.ReactNode
  currentBuildId?: string
  translations?: {
    common: {
      loading: string
      error: string
      retry: string
      save: string
      cancel: string
    }
  }
}

export function WorkspaceCanvas({
  children,
  currentBuildId
}: WorkspaceCanvasProps) {
  return (
    <div className="workspace-canvas relative w-full h-full">
      {React.Children.map(children, child => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child, { currentBuildId } as any)
        }
        return child
      })}
    </div>
  )
}