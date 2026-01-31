/**
 * Match Status Tracker Component
 *
 * Following CLAUDE.md patterns:
 * - Semantic theme classes for dark mode compatibility
 * - RTL support with logical properties
 * - ARIA live announcements for status changes
 * - Real-time polling with React Query
 */

'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Icon, type IconName } from '@/components/ui/icon'
import { useMatchRequest, useMatchDecisions } from '@/hooks/use-advisor-matching'
import { useRouter } from '@/i18n/routing' // ✅ CLAUDE.md: Locale-aware navigation
import { cn } from '@/lib/utils'
import type { MatchStatus } from '@/types/advisor-matching'

interface MatchStatusTrackerProps {
  projectId: string
  onMatchFinalized?: (matchId: string) => void
  onMatchExpired?: () => void
  className?: string
  translations: {
    matchProgress: string
    searching: string
    matched: string
    awaitingYourApproval: string
    awaitingAdvisorAcceptance: string
    matchCompleted: string
    matchExpired: string
    approveMatch: string
    declineMatch: string
    browseOtherAdvisors: string
    startNewMatch: string
    estimatedTime: string
    matchFound: string
    advisorSuggested: string
  }
}

// Status progression mapping
const STATUS_PROGRESS: Record<MatchStatus, { step: number; progress: number }> = {
  pending: { step: 1, progress: 20 },
  matched: { step: 2, progress: 50 },
  client_approved: { step: 3, progress: 75 },
  advisor_accepted: { step: 3, progress: 75 },
  client_declined: { step: 2, progress: 40 },
  advisor_declined: { step: 2, progress: 40 },
  finalized: { step: 4, progress: 100 },
  expired: { step: 0, progress: 0 }
}

// Status colors and icons
const STATUS_CONFIG: Record<MatchStatus, {
  color: string
  icon: IconName
  bgColor: string
}> = {
  pending: { color: 'text-blue-600', icon: 'search', bgColor: 'bg-blue-100 dark:bg-blue-900/20' },
  matched: { color: 'text-amber-600', icon: 'user-check', bgColor: 'bg-amber-100 dark:bg-amber-900/20' },
  client_approved: { color: 'text-purple-600', icon: 'clock', bgColor: 'bg-purple-100 dark:bg-purple-900/20' },
  advisor_accepted: { color: 'text-purple-600', icon: 'clock', bgColor: 'bg-purple-100 dark:bg-purple-900/20' },
  client_declined: { color: 'text-red-600', icon: 'x-circle', bgColor: 'bg-red-100 dark:bg-red-900/20' },
  advisor_declined: { color: 'text-red-600', icon: 'x-circle', bgColor: 'bg-red-100 dark:bg-red-900/20' },
  finalized: { color: 'text-emerald-600', icon: 'check-circle', bgColor: 'bg-emerald-100 dark:bg-emerald-900/20' },
  expired: { color: 'text-gray-600', icon: 'clock', bgColor: 'bg-gray-100 dark:bg-gray-900/20' }
}

export function MatchStatusTracker({
  projectId,
  onMatchFinalized,
  onMatchExpired,
  className,
  translations
}: MatchStatusTrackerProps) {
  const router = useRouter()
  const [lastStatus, setLastStatus] = useState<MatchStatus | null>(null)

  // Real-time match data with adaptive polling
  const { match, isLoading, error, shouldStopPolling } = useMatchRequest(projectId)

  // Decision actions
  const {
    submitClientDecision,
    isSubmittingClient,
    clientError
  } = useMatchDecisions(match?.id || '')

  // Handle status changes and callbacks
  useEffect(() => {
    if (!match) return

    if (lastStatus !== match.status) {
      setLastStatus(match.status)

      // Handle terminal states
      if (match.status === 'finalized' && onMatchFinalized) {
        onMatchFinalized(match.id)
      } else if (match.status === 'expired' && onMatchExpired) {
        onMatchExpired()
      }
    }
  }, [match, lastStatus, onMatchFinalized, onMatchExpired])

  // Handle client approval
  const handleClientApproval = (approved: boolean, reason?: string) => {
    submitClientDecision({ approved, reason })
  }

  // Handle fallback to manual browsing
  const handleBrowseAdvisors = () => {
    router.push(`/advisors?project=${projectId}`)
  }

  // Handle new match creation
  const handleStartNewMatch = () => {
    // Would trigger new match creation flow
    window.location.reload() // Simple approach for now
  }

  // Loading state
  if (isLoading || !match) {
    return (
      <Card className={cn("bg-card", className)}>
        <CardContent className="p-6">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent text-muted-foreground" />
            <span className="text-muted-foreground">Loading match status...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  const statusConfig = STATUS_CONFIG[match.status]
  const progressConfig = STATUS_PROGRESS[match.status]

  return (
    <Card className={cn("bg-card border-border", className)}>
      {/* ARIA live region for status announcements */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        role="status"
      >
        {getStatusAnnouncement(match.status, translations)}
      </div>

      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-foreground">
            {translations.matchProgress}
          </CardTitle>
          <Badge
            variant="outline"
            className={cn("capitalize", statusConfig.color)}
          >
            {getStatusLabel(match.status, translations)}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Status indicator */}
        <div className="flex items-center gap-3">
          <div className={cn(
            "h-10 w-10 rounded-full flex items-center justify-center",
            statusConfig.bgColor
          )}>
            <Icon name={statusConfig.icon} className={cn("h-5 w-5", statusConfig.color)} />
          </div>
          <div>
            <p className="font-medium text-foreground">
              {getStatusMessage(match.status, translations)}
            </p>
            {match.status === 'pending' && (
              <p className="text-sm text-muted-foreground">
                {translations.estimatedTime}: 2-5 minutes
              </p>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="space-y-2">
          <Progress
            value={progressConfig.progress}
            className="h-2"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Step {progressConfig.step} of 4</span>
            <span>{progressConfig.progress}%</span>
          </div>
        </div>

        {/* Status-specific content */}
        {renderStatusContent(match, {
          handleClientApproval,
          handleBrowseAdvisors,
          handleStartNewMatch,
          isSubmittingClient,
          translations
        })}

        {/* Error display */}
        {clientError && (
          <div className="p-3 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-600 dark:text-red-400">
              {clientError.message}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Helper functions
function getStatusLabel(status: MatchStatus, translations: any): string {
  switch (status) {
    case 'pending':
      return translations.searching
    case 'matched':
      return translations.matched
    case 'client_approved':
    case 'advisor_accepted':
      return 'In Progress'
    case 'finalized':
      return translations.matchCompleted
    case 'expired':
      return translations.matchExpired
    default:
      return status.replace('_', ' ')
  }
}

function getStatusMessage(status: MatchStatus, translations: any): string {
  switch (status) {
    case 'pending':
      return translations.searching
    case 'matched':
      return translations.advisorSuggested
    case 'client_approved':
      return translations.awaitingAdvisorAcceptance
    case 'advisor_accepted':
      return translations.awaitingYourApproval
    case 'finalized':
      return translations.matchCompleted
    case 'expired':
      return translations.matchExpired
    case 'client_declined':
    case 'advisor_declined':
      return 'Match declined - you can try again'
    default:
      return 'Processing...'
  }
}

function getStatusAnnouncement(status: MatchStatus, translations: any): string {
  switch (status) {
    case 'pending':
      return 'Finding the perfect advisor for you'
    case 'matched':
      return translations.advisorSuggested + ' - please review'
    case 'client_approved':
      return translations.awaitingAdvisorAcceptance
    case 'advisor_accepted':
      return translations.awaitingYourApproval
    case 'finalized':
      return translations.matchCompleted + '! Starting workspace'
    default:
      return 'Match status updated'
  }
}

function renderStatusContent(
  match: any,
  {
    handleClientApproval,
    handleBrowseAdvisors,
    handleStartNewMatch,
    isSubmittingClient,
    translations
  }: any
) {
  switch (match.status) {
    case 'matched':
    case 'advisor_accepted':
      return (
        <div className="space-y-4">
          <div className="p-4 bg-muted/50 rounded-lg">
            <p className="text-sm text-foreground mb-2">
              {translations.matchFound}
            </p>
            <p className="text-xs text-muted-foreground">
              Review the suggested advisor and approve to start collaboration.
            </p>
          </div>

          <div className="flex gap-3">
            <Button
              onClick={() => handleClientApproval(true)}
              disabled={isSubmittingClient}
              className="flex-1"
            >
              {isSubmittingClient ? 'Processing...' : translations.approveMatch}
            </Button>
            <Button
              variant="outline"
              onClick={() => handleClientApproval(false)}
              disabled={isSubmittingClient}
              className="flex-1"
            >
              {translations.declineMatch}
            </Button>
          </div>
        </div>
      )

    case 'client_declined':
    case 'advisor_declined':
    case 'expired':
      return (
        <div className="space-y-4">
          <div className="p-4 bg-muted/50 rounded-lg">
            <p className="text-sm text-foreground">
              {match.status === 'expired'
                ? 'This match request has expired'
                : 'Match was declined'}
            </p>
          </div>

          <div className="flex gap-3">
            <Button
              onClick={handleStartNewMatch}
              className="flex-1"
            >
              {translations.startNewMatch}
            </Button>
            <Button
              variant="outline"
              onClick={handleBrowseAdvisors}
              className="flex-1"
            >
              {translations.browseOtherAdvisors}
            </Button>
          </div>
        </div>
      )

    case 'finalized':
      return (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800 rounded-lg">
          <div className="flex items-center gap-2">
            <Icon name="check-circle" className="h-5 w-5 text-emerald-600" />
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
              {translations.matchCompleted}! Your workspace is being prepared.
            </p>
          </div>
        </div>
      )

    default:
      return null
  }
}