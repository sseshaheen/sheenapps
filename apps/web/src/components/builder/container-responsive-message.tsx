'use client'

import React from 'react'
import { m } from '@/components/ui/motion-provider'
import { cn } from '@/lib/utils'
import { useContainerQueries, containerPatterns } from '@/hooks/use-container-queries'

interface ContainerResponsiveMessageProps {
  type: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  actions?: Array<{
    label: string
    handler: () => void
  }>
  className?: string
}

/**
 * Container-query responsive message component
 * Adapts styling based on available container width rather than viewport
 */
export function ContainerResponsiveMessage({
  type,
  content, 
  timestamp,
  actions = [],
  className
}: ContainerResponsiveMessageProps) {
  const { containerRef, containerType, width } = useContainerQueries()

  const messageClasses = containerPatterns.chatMessage[containerType]
  const buttonClasses = containerPatterns.button[containerType]

  const isUser = type === 'user'
  const isSystem = type === 'system'

  return (
    <div ref={containerRef} className={cn('@container', className)}>
      <m.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          "flex mb-4",
          isUser ? "justify-end" : "justify-start"
        )}
      >
        {/* Avatar */}
        {!isUser && (
          <div className={cn(
            "rounded-full flex items-center justify-center flex-shrink-0 mr-2",
            containerType === 'xs' ? 'w-6 h-6' : 
            containerType === 'sm' ? 'w-7 h-7' :
            'w-8 h-8',
            isSystem 
              ? 'bg-blue-500' 
              : 'bg-gradient-to-br from-purple-400 to-pink-400'
          )}>
            <span className={cn(
              "text-white font-medium",
              containerType === 'xs' ? 'text-xs' : 
              containerType === 'sm' ? 'text-sm' : 'text-base'
            )}>
              {isSystem ? '⚡' : '🤖'}
            </span>
          </div>
        )}

        {/* Message Bubble */}
        <div className={cn(
          "rounded-lg shadow-sm",
          messageClasses,
          isUser 
            ? 'bg-purple-600 text-white' 
            : isSystem
            ? 'bg-blue-900/50 border border-blue-400/30 text-blue-100'
            : 'bg-gray-800 text-gray-100'
        )}>
          <p className="whitespace-pre-wrap leading-relaxed">{content}</p>
          
          {/* Actions */}
          {actions.length > 0 && (
            <div className={cn(
              "flex flex-wrap gap-2 mt-3",
              containerType === 'xs' ? 'flex-col' : 'flex-row'
            )}>
              {actions.map((action, index) => (
                <button
                  key={index}
                  onClick={action.handler}
                  className={cn(
                    "bg-white/10 hover:bg-white/20 active:bg-white/30 text-current rounded-md transition-colors font-medium flex items-center justify-center",
                    buttonClasses
                  )}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}

          {/* Timestamp */}
          <div className={cn(
            "text-current/70 mt-2",
            containerType === 'xs' ? 'text-[10px]' :
            containerType === 'sm' ? 'text-xs' : 'text-xs'
          )}>
            {timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>

        {/* User avatar */}
        {isUser && (
          <div className={cn(
            "rounded-full bg-purple-600 flex items-center justify-center flex-shrink-0 ml-2",
            containerType === 'xs' ? 'w-6 h-6' : 
            containerType === 'sm' ? 'w-7 h-7' :
            'w-8 h-8'
          )}>
            <span className={cn(
              "text-white font-medium",
              containerType === 'xs' ? 'text-xs' : 
              containerType === 'sm' ? 'text-sm' : 'text-base'
            )}>
              👤
            </span>
          </div>
        )}
      </m.div>

      {/* Debug info in development */}
      {/* eslint-disable-next-line no-restricted-globals */}
      {process.env.NODE_ENV === 'development' && (
        <div className="text-xs text-gray-500 mb-2">
          Container: {containerType} ({width}px)
        </div>
      )}
    </div>
  )
}