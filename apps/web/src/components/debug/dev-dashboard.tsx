/**
 * Development Dashboard - Real-time builder state visibility
 * Expert requirement: Development debugging aids
 */

'use client'

import { useBuilderStore, selectors, SectionState } from '@/store/builder-store'
import { eventStats } from '@/utils/event-logger'
import { memoryMonitor } from '@/utils/memory-monitor'
import { useState, useEffect } from 'react'

export function DevDashboard() {
  const state = useBuilderStore()
  const [isExpanded, setIsExpanded] = useState(false)
  const [stats, setStats] = useState<any>({})
  
  // Update stats periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setStats({
        memory: memoryMonitor.getStats(),
        events: (eventStats as any).getStats?.() || { totalEvents: 0 }
      })
    }, 1000)
    
    return () => clearInterval(interval)
  }, [])
  
  // eslint-disable-next-line no-restricted-globals
  if (process.env.NODE_ENV !== 'development') return null
  
  const currentSections = selectors.currentSections(state) as Record<string, SectionState>
  const canUndo = selectors.canUndo(state)
  const canRedo = selectors.canRedo(state)
  
  return (
    <div className="fixed bottom-4 right-4 z-50">
      {/* Collapsed view */}
      {!isExpanded && (
        <button
          onClick={() => setIsExpanded(true)}
          className="bg-black text-white p-3 rounded-lg shadow-lg hover:bg-gray-800 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span>🛠️</span>
            <div className="text-xs">
              <div>H: {state.history.index + 1}/{state.history.stack.length}</div>
              <div className="flex gap-1">
                <span className={canUndo ? 'text-green-400' : 'text-red-400'}>↶</span>
                <span className={canRedo ? 'text-green-400' : 'text-red-400'}>↷</span>
              </div>
            </div>
          </div>
        </button>
      )}
      
      {/* Expanded view */}
      {isExpanded && (
        <div className="bg-black text-white p-4 rounded-lg shadow-lg text-sm max-w-sm">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-bold text-lg">🛠️ Builder Debug</h3>
            <button
              onClick={() => setIsExpanded(false)}
              className="text-gray-400 hover:text-white"
            >
              ✕
            </button>
          </div>
          
          {/* Store State */}
          <div className="space-y-2 mb-4">
            <div className="text-yellow-400 font-semibold">📊 Store State</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>Project: {state.projectId || 'None'}</div>
              <div>Layout: {state.ui.currentLayoutId || 'None'}</div>
              <div>Modal: {state.ui.modal || 'None'}</div>
              <div>Editing: {state.ui.activeEditSection || 'None'}</div>
            </div>
          </div>
          
          {/* History State */}
          <div className="space-y-2 mb-4">
            <div className="text-blue-400 font-semibold">📚 History</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>Index: {state.history.index}</div>
              <div>Length: {state.history.stack.length}</div>
              <div className="flex items-center gap-1">
                <span>Undo:</span>
                <span className={canUndo ? 'text-green-400' : 'text-red-400'}>
                  {canUndo ? '✅' : '❌'}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <span>Redo:</span>
                <span className={canRedo ? 'text-green-400' : 'text-red-400'}>
                  {canRedo ? '✅' : '❌'}
                </span>
              </div>
            </div>
            
            {/* Recent history */}
            {state.history.stack.length > 0 && (
              <div className="mt-2">
                <div className="text-xs text-gray-400">Recent Actions:</div>
                <div className="max-h-20 overflow-y-auto text-xs">
                  {state.history.stack
                    .slice(-3)
                    .reverse()
                    .map((snapshot, index) => (
                      <div key={snapshot.id} className="truncate">
                        {index === 0 && state.history.index >= 0 ? '→ ' : '  '}
                        {snapshot.userAction}
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
          
          {/* Sections */}
          <div className="space-y-2 mb-4">
            <div className="text-green-400 font-semibold">🧩 Sections</div>
            <div className="text-xs">
              <div>Count: {Object.keys(currentSections).length}</div>
              {Object.keys(currentSections).length > 0 && (
                <div className="max-h-16 overflow-y-auto">
                  {Object.entries(currentSections).map(([id, section]) => (
                    <div key={id} className="flex justify-between">
                      <span className="truncate">{section.type}</span>
                      <span className="text-gray-400">{id.slice(-4)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          {/* Performance */}
          <div className="space-y-2 mb-4">
            <div className="text-purple-400 font-semibold">⚡ Performance</div>
            <div className="text-xs">
              <div>Memory: {(stats.memory?.growthMB || 0).toFixed(1)}MB</div>
              <div>Events: {stats.events?.totalEvents || 0}</div>
              {stats.events?.raceConditions > 0 && (
                <div className="text-red-400">
                  ⚠️ Races: {stats.events.raceConditions}
                </div>
              )}
            </div>
          </div>
          
          {/* Quick Actions */}
          <div className="space-y-2">
            <div className="text-orange-400 font-semibold">🎮 Actions</div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  console.log('🏪 Store State:', useBuilderStore.getState())
                }}
                className="px-2 py-1 bg-blue-600 text-xs rounded hover:bg-blue-500"
              >
                Log State
              </button>
              <button
                onClick={() => {
                  console.table(stats.events)
                }}
                className="px-2 py-1 bg-purple-600 text-xs rounded hover:bg-purple-500"
              >
                Log Events
              </button>
              <button
                onClick={() => {
                  memoryMonitor.report()
                }}
                className="px-2 py-1 bg-green-600 text-xs rounded hover:bg-green-500"
              >
                Memory Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
