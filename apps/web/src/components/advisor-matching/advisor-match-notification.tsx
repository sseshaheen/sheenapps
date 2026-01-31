/**
 * Advisor Match Notification Component
 *
 * Shows a floating notification when an advisor is matched with the project.
 * Displays advisor profile with approve/decline actions.
 *
 * Following CLAUDE.md patterns:
 * - Semantic theme classes (bg-card, text-foreground)
 * - i18n support via translations prop
 * - Accessible with ARIA labels
 */

'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Icon from '@/components/ui/icon'
import { cn } from '@/lib/utils'
import type { MatchRequest } from '@/types/advisor-matching'
import { logger } from '@/utils/logger'

export interface AdvisorMatchNotificationProps {
  match: MatchRequest
  onApprove: () => void
  onDecline: () => void
  onDismiss?: () => void
  className?: string
  translations: {
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
}

export function AdvisorMatchNotification({
  match,
  onApprove,
  onDecline,
  onDismiss,
  className,
  translations
}: AdvisorMatchNotificationProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  // Animate in
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 100)
    return () => clearTimeout(timer)
  }, [])

  const handleApprove = async () => {
    setIsLoading(true)
    try {
      await onApprove()
    } finally {
      setIsLoading(false)
    }
  }

  const handleDecline = async () => {
    setIsLoading(true)
    try {
      await onDecline()
    } finally {
      setIsLoading(false)
    }
  }

  const handleDismiss = () => {
    setIsVisible(false)
    setTimeout(() => onDismiss?.(), 300)
  }

  // For now, show a simplified version until we have full advisor profile data
  // The backend returns matched_advisor_id but we need to fetch full profile
  const advisorId = match.suggested_advisor_id
  const matchScore = match.match_score

  return (
    <div
      className={cn(
        'fixed bottom-4 end-4 z-50 w-96 max-w-[calc(100vw-2rem)]',
        'transition-all duration-300 ease-out',
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0',
        className
      )}
      role="alert"
      aria-live="polite"
      aria-atomic="true"
    >
      <Card className="border-2 border-blue-500 shadow-xl bg-card">
        <CardContent className="p-6">
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
                <Icon name="user-check" className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">{translations.matchedTitle}</h3>
                <p className="text-sm text-muted-foreground">
                  {translations.matchedDescription}
                </p>
              </div>
            </div>
            {onDismiss && (
              <button
                onClick={handleDismiss}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label={translations.dismiss}
              >
                <Icon name="x" className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Advisor Profile Preview */}
          <div className="bg-muted/50 rounded-lg p-4 mb-4">
            <div className="flex items-start gap-3">
              {/* Avatar placeholder - will be populated when we fetch full profile */}
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-semibold">
                {advisorId ? advisorId.slice(0, 2).toUpperCase() : '??'}
              </div>
              <div className="flex-1">
                <h4 className="font-medium text-foreground mb-1">
                  Expert Advisor Found
                </h4>
                <p className="text-sm text-muted-foreground mb-2">
                  {translations.advisorDetails}
                </p>

                {/* Match Score */}
                {matchScore && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{translations.matchScore}</span>
                      <Badge variant="secondary" className="font-semibold">
                        {Math.round(matchScore)}% Match
                      </Badge>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Info Message */}
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mb-4">
            <p className="text-sm text-blue-900 dark:text-blue-100">
              <Icon name="info" className="w-4 h-4 inline me-2" />
              The advisor will be notified after you approve. You can chat once both parties accept.
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              onClick={handleApprove}
              disabled={isLoading}
              className="flex-1"
            >
              {isLoading ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent me-2" />
                  Approving...
                </>
              ) : (
                <>
                  <Icon name="check" className="w-4 h-4 me-2" />
                  {translations.approve}
                </>
              )}
            </Button>
            <Button
              onClick={handleDecline}
              disabled={isLoading}
              variant="outline"
              className="flex-1"
            >
              {translations.decline}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}