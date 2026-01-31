'use client'

import { useState, useEffect } from 'react'
import Icon from '@/components/ui/icon'
import { cn } from '@/lib/utils'
import { useTranslations } from 'next-intl'

interface CollapsedChatViewProps {
  unreadCount?: number
  isBuilding?: boolean
  onExpand?: () => void
  className?: string
}

/**
 * 2025 UX Pattern: Collapsed Chat Sidebar View
 * Shows only essential information when sidebar is collapsed:
 * - Chat icon with visual feedback
 * - Unread message count badge
 * - Building indicator
 * - Tooltip for accessibility
 * - Click to expand functionality
 */
export function CollapsedChatView({
  unreadCount = 0,
  isBuilding = false,
  onExpand,
  className
}: CollapsedChatViewProps) {
  const [isHovered, setIsHovered] = useState(false)
  const t = useTranslations('builder.workspace.chat')
  
  return (
    <div className={cn(
      "h-full flex flex-col items-center bg-gray-900 border-r border-gray-700",
      "transition-all duration-300 ease-in-out",
      className
    )}>
      {/* Collapse Header - matches expanded header height */}
      <div className="flex-shrink-0 w-full p-2 border-b border-gray-700/50 bg-gray-800">
        <div className="flex items-center justify-center">
          {/* Building indicator */}
          {isBuilding && (
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
          )}
        </div>
      </div>
      
      {/* Main Chat Icon Area - centered */}
      <div className="flex-1 flex flex-col items-center justify-center p-3">
        <button
          onClick={onExpand}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className={cn(
            "relative group p-3 rounded-lg transition-all duration-200",
            "hover:bg-gray-800 hover:scale-105 active:scale-95",
            "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900"
          )}
          title={t('expandChat')}
          aria-label={`${t('chat')} (${unreadCount > 0 ? t('unreadMessages', { count: unreadCount }) : t('noUnread')}). ${t('clickToExpand')}`}
        >
          {/* Chat Bubble Icon */}
          <Icon 
            name="message-circle" 
            className={cn(
              "w-6 h-6 transition-colors duration-200",
              isBuilding ? "text-blue-400" : "text-gray-400",
              "group-hover:text-white"
            )} 
          />
          
          {/* Unread Count Badge - 2025 design pattern */}
          {unreadCount > 0 && (
            <span className={cn(
              "absolute -top-1 -right-1 min-w-[18px] h-[18px]",
              "bg-red-500 text-white text-xs font-medium",
              "rounded-full flex items-center justify-center",
              "animate-pulse shadow-lg",
              "ring-2 ring-gray-900" // Creates contrast against dark background
            )}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
          
          {/* Building Progress Indicator */}
          {isBuilding && (
            <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2">
              <div className="w-6 h-0.5 bg-gray-700 rounded-full overflow-hidden">
                <div className="w-full h-full bg-blue-500 animate-pulse" />
              </div>
            </div>
          )}
        </button>
        
        {/* Tooltip Label - 2025 accessibility pattern */}
        <div className={cn(
          "mt-2 text-xs text-gray-500 text-center transition-opacity duration-200",
          isHovered ? "opacity-100" : "opacity-60"
        )}>
          {t('chat')}
        </div>

        {/* Building Status Text */}
        {isBuilding && (
          <div className="mt-1 text-xs text-blue-400 text-center animate-pulse">
            {t('building')}
          </div>
        )}
      </div>
      
      {/* Bottom Expand Hint - 2025 interaction pattern */}
      <div className="flex-shrink-0 w-full p-2 border-t border-gray-700/50">
        <div className="flex items-center justify-center">
          <Icon 
            name="chevron-right" 
            className={cn(
              "w-3 h-3 text-gray-600 transition-all duration-200",
              isHovered && "text-gray-400 scale-110"
            )} 
          />
        </div>
      </div>
    </div>
  )
}

// Export for testing
export type { CollapsedChatViewProps }