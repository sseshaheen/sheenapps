/**
 * Project Timeline Component
 * Displays chat messages, build events, and deployments in chronological order
 * Implements infinite scroll for performance with large timelines
 */

'use client'

import React, { useRef, useCallback, useEffect } from 'react'
import { m, AnimatePresence } from '@/components/ui/motion-provider'
import Icon, { type IconName } from '@/components/ui/icon'
import { cn } from '@/lib/utils'
import { useProjectTimeline } from '@/hooks/use-project-timeline'
import { type TimelineItem } from '@/types/chat-plan'
import { Badge } from '@/components/ui/badge'
import { useFormatters } from '@/hooks/use-formatters'

interface ProjectTimelineProps {
  projectId: string
  className?: string
  mode?: 'all' | 'plan' | 'build'
  onItemClick?: (item: TimelineItem) => void
}

export function ProjectTimeline({ 
  projectId, 
  className,
  mode = 'all',
  onItemClick 
}: ProjectTimelineProps) {
  const { formatRelativeTime } = useFormatters()
  const observerRef = useRef<HTMLDivElement>(null)
  
  // Fetch timeline data with infinite scroll
  const {
    items,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
    refetch
  } = useProjectTimeline(projectId, { mode })

  // Set up intersection observer for infinite scroll
  useEffect(() => {
    if (!observerRef.current) return
    
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage()
        }
      },
      { threshold: 0.1 }
    )
    
    observer.observe(observerRef.current)
    
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  // Get icon based on item type
  const getItemIcon = (item: TimelineItem): IconName => {
    switch (item.item_type) {
      case 'chat_message':
        const mode = item.content?.response?.mode
        switch (mode) {
          case 'question': return 'help-circle'
          case 'feature': return 'zap'
          case 'fix': return 'settings'
          case 'analysis': return 'search'
          default: return 'message-circle'
        }
      case 'build_event':
        const eventType = item.content?.event_type
        switch (eventType) {
          case 'started': return 'activity'
          case 'completed': return 'check-circle'
          case 'failed': return 'alert-circle'
          default: return 'activity'
        }
      case 'deployment':
        return 'rocket'
      default:
        return 'circle'
    }
  }

  // Get color scheme based on item type
  const getItemColor = (item: TimelineItem) => {
    switch (item.item_type) {
      case 'chat_message':
        const mode = item.content?.response?.mode
        switch (mode) {
          case 'question': return 'text-blue-500 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
          case 'feature': return 'text-purple-500 bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800'
          case 'fix': return 'text-red-500 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
          case 'analysis': return 'text-green-500 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
          default: return 'text-gray-500 bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-800'
        }
      case 'build_event':
        const eventType = item.content?.event_type
        switch (eventType) {
          case 'completed': return 'text-green-500 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
          case 'failed': return 'text-red-500 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
          default: return 'text-blue-500 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
        }
      case 'deployment':
        return 'text-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800'
      default:
        return 'text-gray-500 bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-800'
    }
  }

  // Format timeline item content
  const formatContent = (item: TimelineItem) => {
    switch (item.item_type) {
      case 'chat_message':
        const message = item.content?.message || ''
        const response = item.content?.response
        return (
          <div className="space-y-2">
            {message && (
              <div className="text-sm text-gray-600 dark:text-gray-400">
                <span className="font-medium">User:</span> {message}
              </div>
            )}
            {response && (
              <div className="text-sm text-gray-900 dark:text-gray-100">
                {response.mode === 'question' && response.answer && (
                  <div>{response.answer}</div>
                )}
                {response.mode === 'feature' && response.title && (
                  <div>
                    <span className="font-medium">Feature Plan:</span> {response.title}
                    {response.estimated_time_minutes && (
                      <span className="ml-2 text-xs text-gray-500">
                        ({response.estimated_time_minutes} min)
                      </span>
                    )}
                  </div>
                )}
                {response.mode === 'fix' && (
                  <div>
                    <span className="font-medium">Bug Fix:</span> {response.issue_analysis?.slice(0, 100)}...
                  </div>
                )}
                {response.mode === 'analysis' && response.findings && (
                  <div>
                    <span className="font-medium">Analysis:</span> Found {response.findings.length} items
                  </div>
                )}
              </div>
            )}
            {response?.metadata?.billed_seconds && (
              <div className="text-xs text-gray-500">
                AI Time: {response.metadata.billed_seconds}s
              </div>
            )}
          </div>
        )
      
      case 'build_event':
        return (
          <div className="space-y-1">
            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {item.content?.message || item.content?.title || 'Build Event'}
            </div>
            {item.content?.description && (
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {item.content.description}
              </div>
            )}
            {item.content?.progress !== undefined && (
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-500 transition-all duration-300"
                    style={{ width: `${item.content.progress}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500">{item.content.progress}%</span>
              </div>
            )}
          </div>
        )
      
      case 'deployment':
        return (
          <div className="space-y-1">
            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
              Deployment {item.content?.status || 'Event'}
            </div>
            {item.content?.url && (
              <a 
                href={item.content.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-500 hover:text-blue-600 underline"
              >
                View Deployment →
              </a>
            )}
          </div>
        )
      
      default:
        return (
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {JSON.stringify(item.content, null, 2).slice(0, 200)}...
          </div>
        )
    }
  }

  // Loading state
  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center py-8", className)}>
        <div className="flex items-center gap-3 text-gray-500">
          <div className="animate-spin">
            <Icon name="loader-2" className="w-5 h-5" />
          </div>
          <span>Loading timeline...</span>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className={cn("flex flex-col items-center justify-center py-8 gap-3", className)}>
        <Icon name="alert-circle" className="w-8 h-8 text-red-500" />
        <p className="text-sm text-gray-600 dark:text-gray-400">Failed to load timeline</p>
        <button
          onClick={() => refetch()}
          className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-800 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        >
          Try Again
        </button>
      </div>
    )
  }

  // Empty state
  if (items.length === 0) {
    return (
      <div className={cn("flex flex-col items-center justify-center py-12 gap-3", className)}>
        <Icon name="message-circle" className="w-12 h-12 text-gray-400" />
        <p className="text-gray-600 dark:text-gray-400">No timeline items yet</p>
        <p className="text-sm text-gray-500">Start a conversation to see activity here</p>
      </div>
    )
  }

  return (
    <div className={cn("relative", className)}>
      {/* Timeline line */}
      <div className="absolute left-6 top-0 bottom-0 w-px bg-gray-200 dark:bg-gray-700" />
      
      {/* Timeline items */}
      <div className="space-y-4">
        <AnimatePresence>
          {items.map((item, index) => (
            <m.div
              key={item.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ delay: index * 0.05 }}
              className="relative flex gap-4 group"
            >
              {/* Icon */}
              <div className={cn(
                "relative z-10 w-12 h-12 rounded-full border-2 flex items-center justify-center transition-transform group-hover:scale-110",
                getItemColor(item)
              )}>
                <Icon name={getItemIcon(item)} className="w-5 h-5" />
              </div>
              
              {/* Content */}
              <div 
                className={cn(
                  "flex-1 p-4 rounded-lg border cursor-pointer transition-all",
                  getItemColor(item),
                  "hover:shadow-md"
                )}
                onClick={() => onItemClick?.(item)}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2">
                    {item.item_type === 'chat_message' && item.content?.response?.mode && (
                      <Badge className="text-xs">
                        {item.content.response.mode}
                      </Badge>
                    )}
                    {item.item_type === 'build_event' && item.content?.event_type && (
                      <Badge className="text-xs">
                        {item.content.event_type}
                      </Badge>
                    )}
                  </div>
                  <span className="text-xs text-gray-500 whitespace-nowrap">
                    {formatRelativeTime(new Date(item.created_at))}
                  </span>
                </div>
                
                {/* Body */}
                {formatContent(item)}
              </div>
            </m.div>
          ))}
        </AnimatePresence>
      </div>
      
      {/* Infinite scroll trigger */}
      <div ref={observerRef} className="h-10" />
      
      {/* Loading more indicator */}
      {isFetchingNextPage && (
        <div className="flex items-center justify-center py-4">
          <div className="flex items-center gap-2 text-gray-500">
            <div className="animate-spin">
              <Icon name="loader-2" className="w-4 h-4" />
            </div>
            <span className="text-sm">Loading more...</span>
          </div>
        </div>
      )}
      
      {/* End of timeline */}
      {!hasNextPage && items.length > 0 && (
        <div className="text-center py-4 text-sm text-gray-500">
          End of timeline
        </div>
      )}
    </div>
  )
}