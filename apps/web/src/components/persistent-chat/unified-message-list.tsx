/**
 * Unified Message List
 * Displays all messages in chronological order (seq-based)
 * Supports infinite scroll for pagination
 *
 * Phase 1 Integration (UNIFIED_CHAT_BUILD_EVENTS_INTEGRATION_PLAN.md):
 * - Supports virtual BuildRunCard injection
 * - Card is rendered at the appropriate position based on build start time
 */

'use client'

import React, { useCallback, useRef, useEffect, useMemo } from 'react'
import { PersistentChatMessage } from '@/services/persistent-chat-client'
import { MessageBubble } from './message-bubble'
import { BuildRunCard } from './build-run-card'
import { cn } from '@/lib/utils'
import { logger } from '@/utils/logger'
import { useTranslations } from 'next-intl'
import type { BuildRun } from '@/hooks/use-build-run'
import { findBuildCardInsertionPoint } from '@/hooks/use-build-run'
import type { ProjectRecommendation } from '@/types/project-recommendations'

interface UnifiedMessageListProps {
  projectId: string
  messages: PersistentChatMessage[]
  currentUserId: string
  isLoading?: boolean
  isFetching?: boolean
  hasNextPage?: boolean
  fetchNextPage?: () => void
  isFetchingNextPage?: boolean
  className?: string
  /** Phase 1: Virtual build run card to inject into message list */
  buildRun?: BuildRun | null
  /** Callback when user selects a recommendation */
  onRecommendationSelect?: (recommendation: ProjectRecommendation) => void
  /** Infrastructure mode - 'easy' shows deploy button in build card */
  infraMode?: 'easy' | 'custom' | null
  /** Subdomain for Easy Mode deployment */
  subdomain?: string
  /** Deploy state from useDeploy hook */
  deployState?: {
    isFirstDeploy: boolean
    isDeploying: boolean
    deployPhase: 'idle' | 'uploading' | 'deploying' | 'routing' | 'complete' | 'error'
    deployError: string | null
    deployedUrl: string | null
  }
  /** Callback to open deploy dialog (for first deploy) */
  onOpenDeployDialog?: () => void
  /** Callback for quick deploy (for subsequent deploys) */
  onQuickDeploy?: (buildId: string) => void
  /** Deploy button translations */
  deployTranslations?: {
    deploy: string
    deploying: string
    deployed: string
    deployFailed: string
    viewSite: string
  }
}

/**
 * Unified message list with infinite scroll and proper chronology
 */
export function UnifiedMessageList({
  projectId,
  messages,
  currentUserId,
  isLoading = false,
  isFetching = false,
  hasNextPage = false,
  fetchNextPage,
  isFetchingNextPage = false,
  className,
  buildRun,
  onRecommendationSelect,
  infraMode,
  subdomain,
  deployState,
  onOpenDeployDialog,
  onQuickDeploy,
  deployTranslations
}: UnifiedMessageListProps) {
  const t = useTranslations('builder.workspace.chat')

  // Phase 1: Calculate where to insert build run card (Section 7.8 anchoring rules)
  const buildCardInsertIndex = useMemo(() => {
    if (!buildRun) return -1
    return findBuildCardInsertionPoint(messages, buildRun.createdAt)
  }, [buildRun, messages])
  const listRef = useRef<HTMLDivElement>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const previousScrollHeight = useRef<number>(0)
  const previousScrollTop = useRef<number>(0)
  const isLoadingMore = useRef<boolean>(false)
  const previousMessageCount = useRef<number>(messages.length)

  // Auto-scroll to bottom when new messages arrive (moved from container per expert review)
  // Only scrolls if user is near the bottom to avoid interrupting reading older messages
  useEffect(() => {
    const list = listRef.current
    if (!list || messages.length === 0) return

    // Only auto-scroll if new messages were added (not when loading older messages)
    if (messages.length > previousMessageCount.current && !isLoadingMore.current) {
      // 200px threshold handles tall message bubbles better (expert review fix)
      const isNearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 200

      if (isNearBottom) {
        // Use 'auto' (instant jump) - 'instant' is not in spec, 'smooth' double-smooths with CSS
        list.scrollTo({
          top: list.scrollHeight,
          behavior: 'auto'
        })
      }
    }

    previousMessageCount.current = messages.length
  }, [messages.length])

  // Intersection Observer for infinite scroll
  // CRITICAL: Must use listRef as root, not viewport, for scrollable container (mobile fix)
  useEffect(() => {
    const scrollContainer = listRef.current
    const loadMoreElement = loadMoreRef.current

    // Need both elements to set up observer properly
    if (!scrollContainer || !loadMoreElement) return

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (
          entry.isIntersecting &&
          hasNextPage &&
          !isFetchingNextPage &&
          !isLoading &&
          fetchNextPage
        ) {
          logger.debug('Loading more messages for project:', projectId)
          isLoadingMore.current = true
          // Store both scroll height and scroll top for accurate restoration (expert review fix)
          previousScrollHeight.current = scrollContainer.scrollHeight
          previousScrollTop.current = scrollContainer.scrollTop
          fetchNextPage()
        }
      },
      {
        // Use scroll container as root, not viewport (expert review fix - mobile infinite scroll)
        root: scrollContainer,
        threshold: 0.1
      }
    )

    observer.observe(loadMoreElement)

    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, isLoading, fetchNextPage, projectId])

  // Maintain scroll position when loading older messages
  // Uses both previousScrollTop and scrollDiff for accurate restoration (expert review fix)
  useEffect(() => {
    if (isLoadingMore.current && listRef.current && !isFetchingNextPage) {
      const currentScrollHeight = listRef.current.scrollHeight
      const scrollDiff = currentScrollHeight - previousScrollHeight.current

      if (scrollDiff > 0) {
        // Restore to previous scroll position + new content height
        listRef.current.scrollTop = previousScrollTop.current + scrollDiff
      }

      isLoadingMore.current = false
    }
  }, [isFetchingNextPage])

  // Group messages by date for better organization
  const groupMessagesByDate = useCallback((messages: PersistentChatMessage[]) => {
    const groups: { date: string; messages: PersistentChatMessage[] }[] = []
    
    messages.forEach((message) => {
      const messageDate = new Date(message.created_at).toDateString()
      const existingGroup = groups.find(group => group.date === messageDate)
      
      if (existingGroup) {
        existingGroup.messages.push(message)
      } else {
        groups.push({ date: messageDate, messages: [message] })
      }
    })
    
    return groups
  }, [])

  const messageGroups = groupMessagesByDate(messages)

  if (isLoading && messages.length === 0) {
    return (
      <div className={cn(
        'flex h-full items-center justify-center',
        className
      )}>
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <span className="text-sm">{t('loadingConversation')}</span>
        </div>
      </div>
    )
  }

  // Empty state: no messages but may have a build run to show
  if (!isLoading && messages.length === 0) {
    // If there's a build run, show it in the empty state
    if (buildRun) {
      return (
        <div
          ref={listRef}
          className={cn(
            'h-full overflow-y-auto scroll-smooth',
            'scrollbar-thin scrollbar-track-transparent scrollbar-thumb-border',
            className
          )}
        >
          <div className="flex flex-col gap-1 p-2 sm:p-4">
            {/* Build Run Card for projects with builds but no chat messages */}
            <BuildRunCard
              buildRun={buildRun}
              onRecommendationSelect={onRecommendationSelect}
              infraMode={infraMode}
              subdomain={subdomain}
              deployState={deployState}
              onOpenDeployDialog={onOpenDeployDialog}
              onQuickDeploy={onQuickDeploy}
              deployTranslations={deployTranslations}
            />

            {/* Empty state prompt below build card */}
            <div className="mt-4 text-center text-muted-foreground">
              <p className="text-sm">{t('emptyStateHelp')}</p>
            </div>
          </div>
        </div>
      )
    }

    // No build run and no messages - show full empty state
    return (
      <div className={cn(
        'flex h-full items-center justify-center',
        className
      )}>
        <div className="text-center text-muted-foreground">
          <h3 className="mb-2 text-lg font-medium">{t('startConversation')}</h3>
          <p className="text-sm">{t('emptyStateHelp')}</p>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={listRef}
      className={cn(
        'h-full overflow-y-auto scroll-smooth',
        'scrollbar-thin scrollbar-track-transparent scrollbar-thumb-border',
        className
      )}
    >
      {/* Mobile: tighter padding to maximize space; desktop: comfortable spacing */}
      <div className="flex flex-col gap-1 p-2 sm:p-4">
        {/* Load More Trigger (at top for older messages) */}
        {hasNextPage && (
          <div
            ref={loadMoreRef}
            className="flex justify-center py-4"
          >
            {isFetchingNextPage ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="h-4 w-4 animate-spin rounded-full border border-current border-t-transparent" />
                <span>{t('loadingOlderMessages')}</span>
              </div>
            ) : (
              <button
                onClick={fetchNextPage}
                className="rounded-md bg-surface px-3 py-1 text-sm font-medium text-foreground hover:bg-surface/80"
              >
                {t('loadOlderMessages')}
              </button>
            )}
          </div>
        )}

        {/* Message Groups by Date - with Build Run Card anchoring (Section 7.8) */}
        {messageGroups.map((group, groupIndex) => {
          // Calculate cumulative message count up to this group for anchoring
          const messagesBeforeThisGroup = messageGroups
            .slice(0, groupIndex)
            .reduce((acc, g) => acc + g.messages.length, 0)

          return (
            <div key={group.date} className="flex flex-col gap-1">
              {/* Date Divider */}
              <div className="flex items-center gap-4 py-2">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs font-medium text-muted-foreground">
                  {formatDateLabel(group.date, { today: t('today'), yesterday: t('yesterday') })}
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>

              {/* Messages for this date - with Build Card injection at anchor point */}
              {group.messages.map((message, messageIndex) => {
                const globalIndex = messagesBeforeThisGroup + messageIndex
                const shouldShowBuildCardAfter = buildRun && buildCardInsertIndex === globalIndex + 1

                return (
                  <React.Fragment key={message.id}>
                    <MessageBubble
                      message={message}
                      isCurrentUser={message.user_id === currentUserId && message.message_type !== 'assistant'}
                      showTimestamp={shouldShowTimestamp(
                        message,
                        group.messages[messageIndex - 1]
                      )}
                      showAvatar={shouldShowAvatar(
                        message,
                        group.messages[messageIndex - 1],
                        group.messages[messageIndex + 1]
                      )}
                    />
                    {/* Build Run Card anchored after triggering message (Section 7.8) */}
                    {shouldShowBuildCardAfter && (
                      <BuildRunCard
                        buildRun={buildRun}
                        onRecommendationSelect={onRecommendationSelect}
                        infraMode={infraMode}
                        subdomain={subdomain}
                        deployState={deployState}
                        onOpenDeployDialog={onOpenDeployDialog}
                        onQuickDeploy={onQuickDeploy}
                        deployTranslations={deployTranslations}
                      />
                    )}
                  </React.Fragment>
                )
              })}
            </div>
          )
        })}

        {/* Fallback: Show Build Run Card at end if anchor point not found (Section 7.8 fallback) */}
        {buildRun && buildCardInsertIndex >= messages.length && (
          <BuildRunCard
            buildRun={buildRun}
            onRecommendationSelect={onRecommendationSelect}
            infraMode={infraMode}
            subdomain={subdomain}
            deployState={deployState}
            onOpenDeployDialog={onOpenDeployDialog}
            onQuickDeploy={onQuickDeploy}
            deployTranslations={deployTranslations}
          />
        )}

        {/* Typing Indicator Placeholder */}
        {/* This would be connected to live presence data in Phase 2 */}
        
        {/* Fetching Indicator */}
        {isFetching && !isFetchingNextPage && (
          <div className="flex justify-center py-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
              <span>{t('syncing')}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Format date label for message groups
 */
function formatDateLabel(
  dateString: string,
  translations: { today: string; yesterday: string }
): string {
  const date = new Date(dateString)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  if (date.toDateString() === today.toDateString()) {
    return translations.today
  } else if (date.toDateString() === yesterday.toDateString()) {
    return translations.yesterday
  } else {
    return date.toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }
}

/**
 * Determine if timestamp should be shown
 */
function shouldShowTimestamp(
  currentMessage: PersistentChatMessage,
  previousMessage?: PersistentChatMessage
): boolean {
  if (!previousMessage) return true

  const currentTime = new Date(currentMessage.created_at)
  const previousTime = new Date(previousMessage.created_at)
  const timeDiff = currentTime.getTime() - previousTime.getTime()

  // Show timestamp if more than 5 minutes apart or different user
  return timeDiff > 5 * 60 * 1000 || currentMessage.user_id !== previousMessage.user_id
}

/**
 * Determine if avatar should be shown
 */
function shouldShowAvatar(
  currentMessage: PersistentChatMessage,
  previousMessage?: PersistentChatMessage,
  nextMessage?: PersistentChatMessage
): boolean {
  // Always show for first message or different user than previous
  if (!previousMessage || currentMessage.user_id !== previousMessage.user_id) {
    return true
  }

  // Show if next message is from different user (end of group)
  if (!nextMessage || currentMessage.user_id !== nextMessage.user_id) {
    return true
  }

  return false
}