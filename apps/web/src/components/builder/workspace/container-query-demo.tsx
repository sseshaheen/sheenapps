'use client'

import React from 'react'
import { ContainerQueryWorkspace } from './container-query-workspace'

/**
 * Demo component showing container query implementation
 * This replaces the complex JavaScript responsive logic with pure CSS
 */
export function ContainerQueryDemo() {
  const demoSidebar = (
    <div className="p-4 space-y-4">
      <h3 className="text-white font-semibold">Sidebar Content</h3>
      <div className="space-y-2">
        <div className="p-2 bg-gray-800 rounded text-sm text-gray-300">
          🎯 Auto-collapses via CSS container queries
        </div>
        <div className="p-2 bg-gray-800 rounded text-sm text-gray-300">
          📱 Hidden on mobile containers
        </div>
        <div className="p-2 bg-gray-800 rounded text-sm text-gray-300">
          🖥️ Full width on desktop
        </div>
      </div>
    </div>
  )

  const demoHeader = (
    <div className="p-4 bg-gray-800">
      <h2 className="text-white font-semibold">Container Query Workspace Demo</h2>
      <p className="text-gray-400 text-sm mt-1">
        Resize the container to see responsive behavior without JavaScript
      </p>
    </div>
  )

  return (
    <div className="h-96 border-2 border-dashed border-gray-300 rounded-lg overflow-hidden">
      <ContainerQueryWorkspace
        header={demoHeader}
        sidebar={demoSidebar}
      >
        <div className="p-6 space-y-4">
          <h1 className="text-2xl font-bold text-white">Main Content Area</h1>
          
          <div className="space-y-3">
            <div className="p-4 bg-gray-800 rounded">
              <h3 className="text-white font-semibold mb-2">✅ No JavaScript Required</h3>
              <p className="text-gray-300 text-sm">
                This layout responds to container size using pure CSS container queries.
                No useResponsive() hook needed!
              </p>
            </div>
            
            <div className="p-4 bg-gray-800 rounded">
              <h3 className="text-white font-semibold mb-2">📊 Performance Benefit</h3>
              <p className="text-gray-300 text-sm">
                Eliminated 240+ lines of JavaScript viewport detection logic.
                Sidebar auto-collapse handled by CSS.
              </p>
            </div>
            
            <div className="p-4 bg-gray-800 rounded">
              <h3 className="text-white font-semibold mb-2">🎯 Expert Pattern Applied</h3>
              <p className="text-gray-300 text-sm">
                Named containers prevent query leakage. Container breakpoints 
                match design system. Standards-based and maintainable.
              </p>
            </div>
          </div>
        </div>
      </ContainerQueryWorkspace>
    </div>
  )
}