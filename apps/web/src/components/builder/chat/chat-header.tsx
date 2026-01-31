'use client'

/**
 * Chat Header Component
 * Shows Sheena's avatar, name, and build progress indicator
 * Phase 2.3: Extracted from BuilderChatInterface
 */

import React from 'react'
import Icon from '@/components/ui/icon'
import { useTranslations } from 'next-intl'

interface ChatHeaderProps {
  /** Whether a build is currently in progress */
  isBuilding?: boolean
  /** Whether build is queued */
  isQueued?: boolean
  /** Current build progress percentage */
  progress?: number
}

export function ChatHeader({
  isBuilding = false,
  isQueued = false,
  progress = 0
}: ChatHeaderProps) {
  const t = useTranslations('builder.workspace.chatHeader')

  return (
    <div className="p-4 border-b border-gray-800">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center">
            <Icon name="sparkles" className="w-4 h-4 text-white" />
          </div>
          <div>
            <h2 className="font-semibold text-white">{t('name')}</h2>
            <p className="text-xs text-gray-400">{t('subtitle')}</p>
          </div>
        </div>
        
        {/* Build Progress Indicator */}
        {(isBuilding || isQueued) && (
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 relative">
              <svg className="w-4 h-4 -rotate-90" viewBox="0 0 32 32">
                <circle
                  cx="16"
                  cy="16"
                  r="14"
                  stroke="currentColor"
                  strokeWidth="2"
                  fill="none"
                  className="text-gray-700"
                />
                <circle
                  cx="16"
                  cy="16"
                  r="14"
                  stroke="currentColor"
                  strokeWidth="2"
                  fill="none"
                  strokeDasharray={`${2 * Math.PI * 14}`}
                  strokeDashoffset={`${2 * Math.PI * 14 * (1 - progress / 100)}`}
                  className="text-purple-400 transition-all duration-300"
                />
              </svg>
            </div>
            <span className="text-xs text-gray-400">{progress}%</span>
          </div>
        )}
      </div>
    </div>
  )
}