'use client'

import React from 'react'
import { MobilePanel } from '../workspace/mobile-workspace-layout'
import { MobilePanel as MobilePanelType } from '../workspace/mobile-workspace-layout'

interface MobilePanelSkeletonProps {
  panelId: MobilePanelType
}

export function MobilePanelSkeleton({ panelId }: MobilePanelSkeletonProps) {
  const getSkeletonContent = () => {
    switch (panelId) {
      case 'build':
        return (
          <div className="h-full flex flex-col">
            {/* Header skeleton */}
            <div className="p-4 border-b border-gray-700">
              <div className="h-6 bg-gray-700 rounded w-1/2 mb-2"></div>
              <div className="h-4 bg-gray-800 rounded w-3/4"></div>
            </div>
            
            {/* Question content skeleton */}
            <div className="flex-1 p-4 space-y-4">
              <div className="h-8 bg-gray-700 rounded w-full"></div>
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-12 bg-gray-800 rounded-lg"></div>
                ))}
              </div>
            </div>
            
            {/* Progress skeleton */}
            <div className="p-4 border-t border-gray-700">
              <div className="h-4 bg-gray-700 rounded w-1/3 mb-2"></div>
              <div className="h-2 bg-gray-800 rounded w-full"></div>
            </div>
          </div>
        )
        
      case 'preview':
        return (
          <div className="h-full flex flex-col">
            {/* Header skeleton */}
            <div className="bg-gray-800 border-b border-gray-700 px-4 py-3">
              <div className="h-4 bg-gray-700 rounded w-1/3"></div>
            </div>
            
            {/* Preview content skeleton */}
            <div className="flex-1 bg-gray-100 flex items-center justify-center">
              <div className="text-center">
                <div className="w-16 h-16 bg-gray-300 rounded mx-auto mb-4 animate-pulse"></div>
                <div className="h-4 bg-gray-300 rounded w-24 mx-auto"></div>
              </div>
            </div>
          </div>
        )
        
      case 'chat':
        return (
          <div className="h-full flex flex-col">
            {/* Header skeleton */}
            <div className="p-4 border-b border-gray-700">
              <div className="h-5 bg-gray-700 rounded w-1/2 mb-2"></div>
              <div className="h-3 bg-gray-800 rounded w-2/3"></div>
            </div>
            
            {/* Chat content skeleton */}
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center p-6">
                <div className="w-16 h-16 bg-gray-700 rounded-full mx-auto mb-4 animate-pulse"></div>
                <div className="h-4 bg-gray-700 rounded w-32 mx-auto mb-2"></div>
                <div className="h-3 bg-gray-800 rounded w-40 mx-auto"></div>
              </div>
            </div>
          </div>
        )
        
      case 'settings':
        return (
          <div className="h-full flex flex-col">
            {/* Header skeleton */}
            <div className="p-4 border-b border-gray-700">
              <div className="h-5 bg-gray-700 rounded w-1/2"></div>
            </div>
            
            {/* Settings content skeleton */}
            <div className="flex-1 p-4">
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="p-4 bg-gray-800 rounded-lg">
                    <div className="h-4 bg-gray-700 rounded w-1/2 mb-2"></div>
                    <div className="h-3 bg-gray-700 rounded w-3/4"></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )
        
      default:
        return (
          <div className="h-full flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-gray-600 border-t-purple-500 rounded-full animate-spin"></div>
          </div>
        )
    }
  }

  return (
    <MobilePanel id={panelId} className="bg-gray-900">
      {getSkeletonContent()}
    </MobilePanel>
  )
}