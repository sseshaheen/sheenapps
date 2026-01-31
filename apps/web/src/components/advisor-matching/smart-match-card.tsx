/**
 * Smart Match Card Component
 *
 * Following CLAUDE.md patterns:
 * - Semantic theme classes (bg-background, text-foreground, etc.)
 * - Feature flag integration for graceful degradation
 * - Auth store integration
 * - Locale-aware navigation
 */

'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Icon } from '@/components/ui/icon'
import { useAuthStore } from '@/store' // ✅ CLAUDE.md: Always import from /store
import { useRouter } from '@/i18n/routing' // ✅ CLAUDE.md: Locale-aware navigation
import { useMatchRequestGuard } from '@/hooks/use-advisor-matching'
import { cn } from '@/lib/utils'

interface SmartMatchCardProps {
  projectId: string
  onSelectSmartMatch: () => void
  onSelectManualBrowse: () => void
  className?: string
  disabled?: boolean
  translations: {
    smartMatchTitle: string
    smartMatchDescription: string
    manualBrowseTitle: string
    manualBrowseDescription: string
    recommended: string
    findPerfectAdvisor: string
    browseExperts: string
    anotherMatchInProgress: string
  }
}

export function SmartMatchCard({
  projectId,
  onSelectSmartMatch,
  onSelectManualBrowse,
  className,
  disabled = false,
  translations
}: SmartMatchCardProps) {
  const { user } = useAuthStore()
  const router = useRouter()
  const [isProcessing, setIsProcessing] = useState(false)

  const { canRequestMatch, blockingReason } = useMatchRequestGuard(projectId)

  // Handle smart match selection
  const handleSmartMatch = async () => {
    if (!user || isProcessing || !canRequestMatch) return

    setIsProcessing(true)
    try {
      await onSelectSmartMatch()
    } catch (error) {
      console.error('Smart match error:', error)
    } finally {
      setIsProcessing(false)
    }
  }

  // Handle manual browse selection
  const handleManualBrowse = () => {
    if (isProcessing) return
    onSelectManualBrowse()
  }

  // Show blocking reason if match is in progress
  if (!canRequestMatch && blockingReason) {
    return (
      <Card className={cn(
        "border-2 border-muted bg-muted/10", // ✅ CLAUDE.md: Semantic theme classes
        className
      )}>
        <CardContent className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/20 flex items-center justify-center">
              <Icon name="clock" className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">
                {translations.anotherMatchInProgress}
              </h3>
              <p className="text-sm text-muted-foreground">
                {blockingReason}
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            onClick={handleManualBrowse}
            className="w-full"
          >
            {translations.browseExperts}
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className={cn("grid gap-4 md:grid-cols-2", className)}>
      {/* Smart Match Option */}
      <Card className={cn(
        "group relative overflow-hidden transition-all duration-200 hover:shadow-lg hover:-translate-y-1",
        "border-2 cursor-pointer bg-card", // ✅ CLAUDE.md: Semantic theme classes
        disabled && "opacity-50 cursor-not-allowed"
      )}
      onClick={disabled ? undefined : handleSmartMatch}
      >
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between">
            <CardTitle className="text-lg text-foreground">
              {translations.smartMatchTitle}
            </CardTitle>
            <Badge variant="secondary" className="ml-2">
              {translations.recommended}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="pt-0">
          <p className="text-sm text-muted-foreground mb-6">
            {translations.smartMatchDescription}
          </p>

          <div className="space-y-3 mb-6">
            <div className="flex items-center gap-2 text-sm">
              <Icon name="check" className="h-4 w-4 text-emerald-500" />
              <span className="text-muted-foreground">AI-powered matching</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Icon name="clock" className="h-4 w-4 text-emerald-500" />
              <span className="text-muted-foreground">Average match in 2 minutes</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Icon name="shield-check" className="h-4 w-4 text-emerald-500" />
              <span className="text-muted-foreground">Dual approval process</span>
            </div>
          </div>

          <Button
            className="w-full"
            disabled={disabled || isProcessing || !canRequestMatch}
          >
            {isProcessing ? (
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Processing...
              </div>
            ) : (
              translations.findPerfectAdvisor
            )}
          </Button>
        </CardContent>

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-background/0 to-background/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
      </Card>

      {/* Manual Browse Option */}
      <Card className={cn(
        "group relative overflow-hidden transition-all duration-200 hover:shadow-lg hover:-translate-y-1",
        "border-2 cursor-pointer bg-card", // ✅ CLAUDE.md: Semantic theme classes
        disabled && "opacity-50 cursor-not-allowed"
      )}
      onClick={disabled ? undefined : handleManualBrowse}
      >
        <CardHeader className="pb-4">
          <CardTitle className="text-lg text-foreground">
            {translations.manualBrowseTitle}
          </CardTitle>
        </CardHeader>

        <CardContent className="pt-0">
          <p className="text-sm text-muted-foreground mb-6">
            {translations.manualBrowseDescription}
          </p>

          <div className="space-y-3 mb-6">
            <div className="flex items-center gap-2 text-sm">
              <Icon name="users" className="h-4 w-4 text-blue-500" />
              <span className="text-muted-foreground">Browse all advisors</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Icon name="filter" className="h-4 w-4 text-blue-500" />
              <span className="text-muted-foreground">Filter by skills & experience</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Icon name="eye" className="h-4 w-4 text-blue-500" />
              <span className="text-muted-foreground">View detailed profiles</span>
            </div>
          </div>

          <Button
            variant="outline"
            className="w-full"
            disabled={disabled || isProcessing}
          >
            {translations.browseExperts}
          </Button>
        </CardContent>

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-background/0 to-background/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
      </Card>
    </div>
  )
}