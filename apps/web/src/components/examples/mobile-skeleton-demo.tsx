'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { 
  MobileSkeletonLoader, 
  MobileWorkspaceSkeleton,
  MobileSheetSkeleton 
} from '@/components/ui/mobile-skeleton-loader'
import { 
  MobileWorkspaceLoading,
  MobileLoadingOverlay,
  MobileProgressiveLoader 
} from '@/components/builder/workspace/mobile-workspace-loading'

/**
 * Demo component showcasing different mobile skeleton loaders
 * This demonstrates the various loading states available in the mobile builder
 */
export function MobileSkeletonDemo() {
  const [activeDemo, setActiveDemo] = useState<string>('question')
  const [showOverlay, setShowOverlay] = useState(false)
  const [isDataLoading, setIsDataLoading] = useState(true)

  const mockData = isDataLoading ? null : {
    title: 'Sample Question',
    options: ['Option A', 'Option B', 'Option C']
  }

  const demoTypes = [
    { id: 'question', label: 'Question Interface', type: 'question' as const },
    { id: 'preview', label: 'Preview Container', type: 'preview' as const },
    { id: 'chat', label: 'AI Chat Interface', type: 'chat' as const },
    { id: 'header', label: 'Mobile Header', type: 'header' as const },
    { id: 'tabs', label: 'Bottom Tabs', type: 'tabs' as const },
    { id: 'panel', label: 'Side Panel', type: 'panel' as const },
    { id: 'workspace', label: 'Full Workspace', type: 'workspace' as const },
    { id: 'sheet', label: 'Mobile Sheet', type: 'sheet' as const }
  ]

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-md mx-auto bg-white rounded-lg shadow-lg overflow-hidden">
        {/* Demo Header */}
        <div className="bg-gray-900 text-white p-4">
          <h1 className="text-lg font-semibold mb-4">Mobile Skeleton Loader Demo</h1>
          
          {/* Demo Type Selector */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            {demoTypes.map((demo) => (
              <Button
                key={demo.id}
                variant={activeDemo === demo.id ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveDemo(demo.id)}
                className="text-xs"
              >
                {demo.label}
              </Button>
            ))}
          </div>

          {/* Controls */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowOverlay(!showOverlay)}
              className="text-xs"
            >
              {showOverlay ? 'Hide' : 'Show'} Overlay
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsDataLoading(!isDataLoading)}
              className="text-xs"
            >
              {isDataLoading ? 'Load' : 'Reset'} Data
            </Button>
          </div>
        </div>

        {/* Demo Content */}
        <div className="relative h-96 bg-gray-900 overflow-hidden">
          {/* Individual Skeleton Demos */}
          {activeDemo !== 'workspace' && activeDemo !== 'sheet' && activeDemo !== 'progressive' && (
            <MobileSkeletonLoader 
              type={demoTypes.find(d => d.id === activeDemo)?.type as any}
              count={activeDemo === 'chat' ? 4 : 3}
            />
          )}

          {/* Full Workspace Demo */}
          {activeDemo === 'workspace' && (
            <MobileWorkspaceSkeleton />
          )}

          {/* Mobile Sheet Demo */}
          {activeDemo === 'sheet' && (
            <div className="p-4">
              <MobileSheetSkeleton title="Loading Sheet Content" />
            </div>
          )}

          {/* Progressive Loading Demo */}
          {activeDemo === 'progressive' && (
            <MobileProgressiveLoader
              data={mockData}
              isLoading={isDataLoading}
              skeletonType="question"
              fallback={<div className="text-center p-8 text-gray-400">No data found</div>}
            >
              {(data) => (
                <div className="p-4 text-white">
                  <h2 className="text-lg font-semibold mb-4">{data.title}</h2>
                  <ul className="space-y-2">
                    {data.options.map((option, index) => (
                      <li key={index} className="p-2 bg-gray-800 rounded">
                        {option}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </MobileProgressiveLoader>
          )}

          {/* Loading Overlay Demo */}
          <MobileLoadingOverlay 
            isVisible={showOverlay}
            message="Processing your request..."
          >
            <p className="text-sm text-gray-300 mt-2">This may take a few moments</p>
          </MobileLoadingOverlay>
        </div>

        {/* Demo Info */}
        <div className="p-4 bg-gray-50 border-t">
          <div className="text-sm text-gray-600">
            <p className="font-medium mb-2">Current Demo: {demoTypes.find(d => d.id === activeDemo)?.label}</p>
            <p className="text-xs">
              This skeleton loader provides smooth loading states while content is being fetched,
              improving perceived performance and user experience on mobile devices.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}