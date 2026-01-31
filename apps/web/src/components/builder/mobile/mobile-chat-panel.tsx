'use client'

import React from 'react'
import { MobilePanel } from '../workspace/mobile-workspace-layout'
import { UnifiedChatContainer } from '@/components/persistent-chat/unified-chat-container'
import { useTranslations } from 'next-intl'

interface MobileChatPanelProps {
  projectId?: string
}

export function MobileChatPanel({ projectId }: MobileChatPanelProps) {
  const t = useTranslations('builder.workspace.mobileChat')
  // Check if persistent chat is enabled via environment variable
  // eslint-disable-next-line no-restricted-globals
  const enablePersistentChat = process.env.NEXT_PUBLIC_ENABLE_PERSISTENT_CHAT === 'true'

  // If persistent chat is enabled and we have a projectId, use the unified chat
  if (enablePersistentChat && projectId) {
    return (
      <MobilePanel id="chat" className="bg-background">
        <UnifiedChatContainer
          projectId={projectId}
          className="h-full"
        />
      </MobilePanel>
    )
  }

  // Fallback to the legacy "coming soon" placeholder
  return (
    <MobilePanel id="chat" className="bg-gray-900">
      <div className="h-full flex flex-col">
        <div className="p-4 border-b border-gray-700">
          <h3 className="text-white font-medium">{t('aiAssistant')}</h3>
          <p className="text-gray-400 text-sm">{t('getHelp')}</p>
        </div>

        <div className="flex-1 flex items-center justify-center">
          <div className="text-center p-6">
            <div className="w-16 h-16 bg-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">🤖</span>
            </div>
            <h4 className="text-white font-medium mb-2">{t('comingSoon')}</h4>
            <p className="text-gray-400 text-sm">
              {t('premiumFeature')}
            </p>
          </div>
        </div>
      </div>
    </MobilePanel>
  )
}