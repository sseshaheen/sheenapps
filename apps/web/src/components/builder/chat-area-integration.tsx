/**
 * Chat Area Integration Component
 * Provides feature flag-controlled switching between legacy and persistent chat
 * 
 * CRITICAL: Single timeline replaces existing chat when feature flag is enabled
 */

'use client'

import { UnifiedChatContainer } from '@/components/persistent-chat/unified-chat-container'
import { BuilderChatInterface } from '@/components/builder/builder-chat-interface'

interface ChatAreaProps {
  projectId: string
  buildId?: string
  businessIdea: string
  onPromptSubmit: (prompt: string, mode: 'build' | 'plan') => void
  onBuildIdChange?: (event: any) => void
  isCollapsed?: boolean
  onExpand?: () => void | Promise<void>
  projectBuildStatus?: 'queued' | 'building' | 'deployed' | 'failed' | 'rollingBack' | 'rollbackFailed'
  translations: {
    chat: {
      placeholder: string
      buildMode: string
      planMode: string
      thinking: string
    }
    pricingModal: {
      title: string
      description: string
      currentPlan: string
      getCredits: string
      mostPopular: string
      maybeLater: string
      securePayment: string
    }
  }
  className?: string
  /** Infrastructure mode for showing Easy Mode links in build completion */
  infraMode?: 'easy' | 'pro' | null
}

/**
 * Main chat area that switches between persistent and legacy chat based on feature flag
 */
export function ChatArea({
  projectId,
  buildId,
  businessIdea,
  onPromptSubmit,
  onBuildIdChange,
  isCollapsed = false,
  onExpand,
  projectBuildStatus,
  translations,
  className,
  infraMode
}: ChatAreaProps) {
  // eslint-disable-next-line no-restricted-globals
  const enablePersistentChat = process.env.NEXT_PUBLIC_ENABLE_PERSISTENT_CHAT === 'true'

  if (enablePersistentChat) {
    // New unified timeline (replaces existing chat)
    // Phase 0: Pass buildId and projectBuildStatus for build progress header
    return (
      <UnifiedChatContainer
        projectId={projectId}
        buildId={buildId}
        projectBuildStatus={projectBuildStatus}
        className={className}
        enabled={true}
      />
    )
  } else {
    // Existing chat system (fallback)
    return (
      <BuilderChatInterface
        buildId={buildId}
        projectId={projectId}
        businessIdea={businessIdea}
        onPromptSubmit={onPromptSubmit}
        onBuildIdChange={onBuildIdChange}
        isCollapsed={isCollapsed}
        onExpand={onExpand}
        projectBuildStatus={projectBuildStatus}
        translations={translations}
        infraMode={infraMode}
      />
    )
  }
}