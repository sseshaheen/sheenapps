/**
 * Match Request Flow Component
 *
 * Main orchestrator component that manages the entire intelligent matching workflow.
 * Following CLAUDE.md patterns:
 * - Feature flag integration with graceful degradation
 * - Auth store integration for user context
 * - Locale-aware navigation and translations
 * - Real-time status updates with React Query
 */

'use client'

import { useState, useEffect } from 'react'
import { useAuthStore } from '@/store' // ✅ CLAUDE.md: Always import from /store
import { useRouter } from '@/i18n/routing' // ✅ CLAUDE.md: Locale-aware navigation
import {
  useCreateMatchRequest,
  useMatchRequest,
  useMatchDecisions,
  useMatchRequestGuard
} from '@/hooks/use-advisor-matching'
import { advisorMatchingApi } from '@/services/advisor-matching-api'
import { SmartMatchCard } from './smart-match-card'
import { MatchStatusTracker } from './match-status-tracker'
import { MatchApprovalDialog } from './match-approval-dialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/utils'
import type { MatchCriteria, AdvisorProfile, MaskedProjectData } from '@/types/advisor-matching'
import { logger } from '@/utils/logger'

interface MatchRequestFlowProps {
  projectId: string
  initialCriteria?: Partial<MatchCriteria>
  onMatchFinalized?: (matchId: string, advisorId: string) => void
  onFallbackToBrowse?: () => void
  className?: string
  translations: {
    intelligentMatching: string
    smartMatchTitle: string
    smartMatchDescription: string
    manualBrowseTitle: string
    manualBrowseDescription: string
    recommended: string
    findPerfectAdvisor: string
    browseExperts: string
    anotherMatchInProgress: string
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
    approveMatchTitle: string
    approveMatchDescription: string
    advisorDetails: string
    projectDetails: string
    yearsExperience: string
    rating: string
    reviews: string
    skills: string
    declineReason: string
    declineReasonPlaceholder: string
    approve: string
    decline: string
    cancel: string
    keyboardShortcuts: string
    authenticationRequired: string
    pleaseSignIn: string
    matchingUnavailable: string
    tryManualBrowse: string
    errorOccurred: string
    tryAgain: string
  }
}

export function MatchRequestFlow({
  projectId,
  initialCriteria = {},
  onMatchFinalized,
  onFallbackToBrowse,
  className,
  translations
}: MatchRequestFlowProps) {
  const { user } = useAuthStore()
  const router = useRouter()

  // State
  const [currentStep, setCurrentStep] = useState<'selection' | 'matching' | 'approval'>('selection')
  const [matchCriteria, setMatchCriteria] = useState<MatchCriteria>({
    framework: 'React',
    complexity_level: 'intermediate',
    ...initialCriteria
  })
  const [showApprovalDialog, setShowApprovalDialog] = useState(false)
  const [suggestedAdvisor, setSuggestedAdvisor] = useState<AdvisorProfile | null>(null)
  const [maskedProject, setMaskedProject] = useState<MaskedProjectData | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Hooks
  const { canRequestMatch, blockingReason } = useMatchRequestGuard(projectId)
  const createMatchMutation = useCreateMatchRequest()
  const { match, isLoading: isMatchLoading, error: matchError } = useMatchRequest(projectId)
  const { submitClientDecision, isSubmittingClient } = useMatchDecisions(match?.id || '')

  // Handle match status changes
  useEffect(() => {
    if (!match) return

    switch (match.status) {
      case 'pending':
        setCurrentStep('matching')
        break

      case 'matched':
      case 'advisor_accepted':
        setCurrentStep('approval')
        loadMatchDetails()
        break

      case 'finalized':
        handleMatchFinalized()
        break

      case 'expired':
      case 'client_declined':
      case 'advisor_declined':
        setCurrentStep('selection')
        break
    }
  }, [match?.status])

  // Load advisor and project details for approval
  const loadMatchDetails = async () => {
    if (!match?.suggested_advisor_id) return

    try {
      // In a real implementation, these would be API calls
      // For now, we'll simulate the data
      const mockAdvisor: AdvisorProfile = {
        id: match.suggested_advisor_id,
        display_name: 'Sarah Chen',
        avatar_url: 'https://images.unsplash.com/photo-1494790108755-2616b612b786?w=400',
        bio: 'Full-stack developer with 8 years of experience in React and Node.js. Passionate about building scalable applications and mentoring developers.',
        skills: ['React', 'TypeScript', 'Node.js', 'Next.js', 'PostgreSQL', 'AWS'],
        specialties: ['Frontend Architecture', 'API Design', 'Database Optimization'],
        years_experience: 8,
        rating: 4.9,
        review_count: 47,
        availability_status: 'available',
        available_capacity: 2,
        max_concurrent: 3,
        active_projects: 1
      }

      const projectData = await advisorMatchingApi.getMaskedProjectData(
        projectId,
        match.status
      )

      setSuggestedAdvisor(mockAdvisor)
      setMaskedProject(projectData)
      setShowApprovalDialog(true)
    } catch (error) {
      logger.error('Failed to load match details', { error, matchId: match.id })
      setError('Failed to load match details. Please try again.')
    }
  }

  // Handle smart match selection
  const handleSmartMatch = async () => {
    if (!user || !canRequestMatch) return

    setError(null)

    try {
      const result = await createMatchMutation.mutateAsync({
        projectId,
        criteria: matchCriteria
      })

      logger.info('Smart match initiated', {
        projectId,
        matchId: result.matchId,
        correlationId: result.correlationId
      })

      setCurrentStep('matching')
    } catch (error: any) {
      logger.error('Smart match failed', { error, projectId })

      // Handle specific error cases
      if (error.message?.includes('NO_ELIGIBLE_ADVISORS')) {
        setError('No advisors available right now. Try browsing manually.')
        setTimeout(() => handleFallbackToBrowse(), 2000)
      } else if (error.message?.includes('MATCH_CONFLICT')) {
        setError('Another match is in progress. Please wait.')
      } else {
        setError('Failed to start matching. Please try again.')
      }
    }
  }

  // Handle manual browse selection
  const handleManualBrowse = () => {
    if (onFallbackToBrowse) {
      onFallbackToBrowse()
    } else {
      router.push(`/advisors?project=${projectId}`)
    }
  }

  // Handle fallback to browse
  const handleFallbackToBrowse = () => {
    logger.info('Falling back to manual browse', { projectId, reason: 'no_advisors' })
    handleManualBrowse()
  }

  // Handle match approval/decline
  const handleMatchDecision = async (approved: boolean, reason?: string) => {
    if (!match) return

    try {
      await submitClientDecision({ approved, reason })
      setShowApprovalDialog(false)

      if (approved) {
        logger.info('Match approved by client', {
          matchId: match.id,
          advisorId: match.suggested_advisor_id
        })
      } else {
        logger.info('Match declined by client', {
          matchId: match.id,
          reason
        })
        setCurrentStep('selection')
      }
    } catch (error) {
      logger.error('Match decision failed', { error, matchId: match.id })
    }
  }

  // Handle successful match finalization
  const handleMatchFinalized = () => {
    if (match?.suggested_advisor_id && onMatchFinalized) {
      onMatchFinalized(match.id, match.suggested_advisor_id)
    }

    logger.info('Match finalized successfully', {
      matchId: match?.id,
      advisorId: match?.suggested_advisor_id,
      projectId
    })
  }

  // Handle match expiration or failure
  const handleMatchExpired = () => {
    setCurrentStep('selection')
    setError('Match expired. You can start a new match or browse advisors manually.')
  }

  // Authentication check
  if (!user) {
    return (
      <Card className={cn("bg-card border-border", className)}>
        <CardContent className="p-6 text-center">
          <Icon name="lock" className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="font-semibold text-foreground mb-2">
            {translations.authenticationRequired}
          </h3>
          <p className="text-muted-foreground mb-4">
            {translations.pleaseSignIn}
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-2">
          {translations.intelligentMatching}
        </h2>
        <p className="text-muted-foreground">
          Choose how you'd like to find your perfect advisor
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <Icon name="alert-circle" className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Match Error Alert */}
      {matchError && (
        <Alert variant="destructive">
          <Icon name="wifi" className="h-4 w-4" />
          <AlertDescription>
            {translations.errorOccurred} {translations.tryAgain}
          </AlertDescription>
        </Alert>
      )}

      {/* Main Content */}
      {currentStep === 'selection' && (
        <SmartMatchCard
          projectId={projectId}
          onSelectSmartMatch={handleSmartMatch}
          onSelectManualBrowse={handleManualBrowse}
          disabled={createMatchMutation.isPending || !canRequestMatch}
          translations={translations}
        />
      )}

      {(currentStep === 'matching' || currentStep === 'approval') && match && (
        <MatchStatusTracker
          projectId={projectId}
          onMatchFinalized={handleMatchFinalized}
          onMatchExpired={handleMatchExpired}
          translations={translations}
        />
      )}

      {/* Approval Dialog */}
      {showApprovalDialog && match && suggestedAdvisor && maskedProject && (
        <MatchApprovalDialog
          isOpen={showApprovalDialog}
          onClose={() => setShowApprovalDialog(false)}
          match={match}
          advisor={suggestedAdvisor}
          project={maskedProject}
          onDecision={handleMatchDecision}
          isSubmitting={isSubmittingClient}
          translations={translations}
        />
      )}

      {/* Loading States */}
      {(createMatchMutation.isPending || isMatchLoading) && currentStep === 'selection' && (
        <Card className="bg-card border-border">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent text-muted-foreground" />
              <span className="text-muted-foreground">
                {createMatchMutation.isPending ? 'Starting smart match...' : 'Loading...'}
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}