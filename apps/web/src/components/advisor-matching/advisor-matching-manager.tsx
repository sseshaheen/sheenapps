/**
 * Advisor Matching Manager
 *
 * Manages the complete advisor matching flow in workspace:
 * 1. Detects active match requests
 * 2. Shows match notification when advisor found
 * 3. Handles approve/decline with decline dialog
 * 4. Shows workspace ready banner when advisor joins
 * 5. Handles retry logic with advisor exclusion
 *
 * This component orchestrates all advisor matching UI elements.
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from '@/i18n/routing'
import { useAuthStore } from '@/store'
import { AdvisorMatchNotification } from './advisor-match-notification'
import { MatchDeclineDialog } from './match-decline-dialog'
import { useAdvisorWorkspaceEvents, type WorkspaceReadyEvent } from '@/hooks/use-advisor-workspace-events'
import {
  getActiveMatch,
  approveMatch,
  declineMatch,
  triggerAdvisorMatch
} from '@/services/advisor-matching-service'
import type { MatchRequest } from '@/types/advisor-matching'
import { logger } from '@/utils/logger'
import Icon from '@/components/ui/icon'
import { Button } from '@/components/ui/button'

export interface AdvisorMatchingManagerProps {
  projectId: string
  translations: {
    match: {
      matchedTitle: string
      matchedDescription: string
      advisorDetails: string
      matchScore: string
      yearsExperience: string
      rating: string
      reviews: string
      skills: string
      approve: string
      decline: string
      dismiss: string
    }
    decline: {
      title: string
      description: string
      retryLabel: string
      retryDescription: string
      browseLabel: string
      browseDescription: string
      laterLabel: string
      laterDescription: string
    }
    banner: {
      advisorJoined: string
      dismiss: string
    }
  }
}

export function AdvisorMatchingManager({
  projectId,
  translations
}: AdvisorMatchingManagerProps) {
  const router = useRouter()
  const { user } = useAuthStore()

  // State
  const [activeMatch, setActiveMatch] = useState<MatchRequest | null>(null)
  const [showDeclineDialog, setShowDeclineDialog] = useState(false)
  const [showWorkspaceBanner, setShowWorkspaceBanner] = useState(false)
  const [declinedAdvisorIds, setDeclinedAdvisorIds] = useState<string[]>([])

  // Check for active match on mount
  useEffect(() => {
    if (!projectId) return

    getActiveMatch(projectId).then(match => {
      if (match && match.status === 'matched') {
        setActiveMatch(match)
      }
    }).catch(error => {
      logger.error('Failed to get active match', { projectId, error })
    })
  }, [projectId])

  // Listen for workspace ready events
  useAdvisorWorkspaceEvents({
    projectId,
    userId: user?.id,
    onWorkspaceReady: handleWorkspaceReady,
    enabled: !!user
  })

  // Handle workspace ready event
  function handleWorkspaceReady(event: WorkspaceReadyEvent) {
    logger.info('Workspace ready - advisor joined', event)

    // Clear active match
    setActiveMatch(null)

    // Show banner
    setShowWorkspaceBanner(true)

    // Auto-hide banner after 10 seconds
    setTimeout(() => {
      setShowWorkspaceBanner(false)
    }, 10000)
  }

  // Handle approve
  const handleApprove = useCallback(async () => {
    if (!activeMatch || !user) return

    try {
      const result = await approveMatch(activeMatch.id, user.id)

      if (result.success) {
        if (result.workspaceProvisioning === 'queued') {
          logger.info('Workspace provisioning queued', {
            matchId: activeMatch.id,
            projectId
          })

          // Hide match notification - wait for workspace ready event
          setActiveMatch(null)

          // Could show a "Setting up workspace..." toast here
        } else {
          logger.info('Waiting for advisor to accept', {
            matchId: activeMatch.id,
            projectId
          })

          // Update match status (still waiting for advisor)
          // Could poll for updates or wait for SSE event
        }
      }
    } catch (error) {
      logger.error('Failed to approve match', { matchId: activeMatch.id, error })
    }
  }, [activeMatch, user, projectId])

  // Handle decline
  const handleDecline = useCallback(async () => {
    if (!activeMatch || !user) return

    try {
      const result = await declineMatch(activeMatch.id, user.id)

      if (result.success && result.advisorId) {
        // Track declined advisor
        setDeclinedAdvisorIds(prev => [...prev, result.advisorId!])

        // Clear active match
        setActiveMatch(null)

        // Show decline dialog
        setShowDeclineDialog(true)
      }
    } catch (error) {
      logger.error('Failed to decline match', { matchId: activeMatch.id, error })
    }
  }, [activeMatch, user])

  // Handle decline dialog options
  const handleDeclineOption = useCallback(async (option: 'retry' | 'browse' | 'later') => {
    switch (option) {
      case 'retry':
        // Trigger new match with exclusion
        logger.info('Retrying match with exclusions', {
          projectId,
          excludedAdvisors: declinedAdvisorIds
        })

        try {
          const result = await triggerAdvisorMatch({
            projectId,
            excludeAdvisors: declinedAdvisorIds
          })

          if (result.success && result.matchRequest) {
            setActiveMatch(result.matchRequest)
          }
        } catch (error) {
          logger.error('Failed to retry match', { projectId, error })
        }
        break

      case 'browse':
        // Navigate to advisors page
        router.push(`/advisors?project=${projectId}`)
        break

      case 'later':
        // Do nothing - user can manually request later
        break
    }
  }, [projectId, declinedAdvisorIds, router])

  return (
    <>
      {/* Advisor joined banner */}
      {showWorkspaceBanner && (
        <div className="bg-green-50 dark:bg-green-950 border-b border-green-200 dark:border-green-800 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Icon name="user-check" className="text-green-600 dark:text-green-400 w-5 h-5" />
            <span className="text-sm font-medium text-green-900 dark:text-green-100">
              {translations.banner.advisorJoined}
            </span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowWorkspaceBanner(false)}
            className="text-green-600 hover:text-green-700 dark:text-green-400"
          >
            <Icon name="x" className="w-4 h-4" />
            <span className="sr-only">{translations.banner.dismiss}</span>
          </Button>
        </div>
      )}

      {/* Match notification */}
      {activeMatch && (
        <AdvisorMatchNotification
          match={activeMatch}
          onApprove={handleApprove}
          onDecline={handleDecline}
          translations={translations.match}
        />
      )}

      {/* Decline dialog */}
      <MatchDeclineDialog
        isOpen={showDeclineDialog}
        onClose={() => setShowDeclineDialog(false)}
        onSelectOption={handleDeclineOption}
        translations={translations.decline}
      />
    </>
  )
}