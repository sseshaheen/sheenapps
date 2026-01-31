'use client'

import React, { useState, useEffect } from 'react'
import { m } from '@/components/ui/motion-provider'
import Icon from '@/components/ui/icon'
import { logger } from '@/utils/logger';

interface CacheStatusProps {
  className?: string
}

export function CacheStatus({ className }: CacheStatusProps) {
  const [cacheStats, setCacheStats] = useState({ hits: 0, misses: 0, size: 0 })
  const [showDetails, setShowDetails] = useState(false)

  // Simulate cache stats for demo
  useEffect(() => {
    const interval = setInterval(() => {
      // In real implementation, this would fetch from the cache service
      setCacheStats(prev => ({
        hits: prev.hits + Math.random() > 0.7 ? 1 : 0,
        misses: prev.misses + Math.random() > 0.9 ? 1 : 0,
        size: Math.max(0, prev.size + (Math.random() > 0.8 ? 1 : 0))
      }))
    }, 2000)

    return () => clearInterval(interval)
  }, [])

  const hitRate = cacheStats.hits + cacheStats.misses > 0 
    ? (cacheStats.hits / (cacheStats.hits + cacheStats.misses) * 100).toFixed(1)
    : '0.0'

  return (
    <div className={className}>
      <button
        onClick={() => setShowDetails(!showDetails)}
        className="flex items-center gap-2 px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded-full text-xs transition-colors"
      >
        <Icon name="database" className="w-3 h-3 text-blue-400"  />
        <span className="text-gray-300">Cache</span>
        <span className="text-blue-300">{cacheStats.size}</span>
      </button>

      {showDetails && (
        <m.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="absolute top-10 right-0 bg-gray-800 border border-gray-700 rounded-lg p-4 text-xs z-50 min-w-48"
        >
          <div className="space-y-2">
            <h3 className="font-medium text-white">AI Cache Status</h3>
            
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-400">Cached Responses:</span>
                <span className="text-blue-300">{cacheStats.size}</span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-gray-400">Cache Hits:</span>
                <span className="text-green-300">{cacheStats.hits}</span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-gray-400">Cache Misses:</span>
                <span className="text-yellow-300">{cacheStats.misses}</span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-gray-400">Hit Rate:</span>
                <span className="text-purple-300">{hitRate}%</span>
              </div>
            </div>

            <div className="pt-2 border-t border-gray-700 space-y-1">
              <p className="text-gray-500 text-xs">
                Cache saves costs by reusing AI responses for similar prompts
              </p>
              
              <div className="flex gap-2">
                <button 
                  className="flex items-center gap-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs"
                  onClick={() => logger.info('Refresh cache stats')}
                >
                  <Icon name="refresh-cw" className="w-3 h-3"  />
                  Refresh
                </button>
                
                <button 
                  className="flex items-center gap-1 px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-xs"
                  onClick={() => setCacheStats({ hits: 0, misses: 0, size: 0 })}
                >
                  <Icon name="trash-2" className="w-3 h-3"  />
                  Clear
                </button>
              </div>
            </div>
          </div>
        </m.div>
      )}
    </div>
  )
}