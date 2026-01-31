/**
 * Match Approval Dialog Components
 *
 * Following CLAUDE.md patterns:
 * - Semantic theme classes for dark mode
 * - Accessibility patterns with ARIA labels and keyboard shortcuts
 * - Focus management and restoration
 * - Mobile-first design with responsive layouts
 */

'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Textarea } from '@/components/ui/textarea'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/utils'
import type { MatchRequest, AdvisorProfile, MaskedProjectData } from '@/types/advisor-matching'

interface MatchApprovalDialogProps {
  isOpen: boolean
  onClose: () => void
  match: MatchRequest
  advisor: AdvisorProfile
  project: MaskedProjectData
  onDecision: (approved: boolean, reason?: string) => void
  isSubmitting?: boolean
  translations: {
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
  }
}

// Hook for focus management
function useDecisionDialogFocus() {
  const previousFocus = useRef<HTMLElement | null>(null)

  const storeFocus = useCallback(() => {
    previousFocus.current = document.activeElement as HTMLElement
  }, [])

  const restoreFocus = useCallback(() => {
    if (previousFocus.current && typeof previousFocus.current.focus === 'function') {
      // Small delay to ensure dialog is fully closed
      setTimeout(() => {
        previousFocus.current?.focus()
      }, 100)
    }
  }, [])

  return { storeFocus, restoreFocus }
}

// Desktop dialog component
export function MatchApprovalDialog(props: MatchApprovalDialogProps) {
  const isMobile = window.innerWidth < 768

  if (isMobile) {
    return <MobileMatchApprovalSheet {...props} />
  }

  return <DesktopMatchApprovalDialog {...props} />
}

// Desktop implementation
function DesktopMatchApprovalDialog({
  isOpen,
  onClose,
  match,
  advisor,
  project,
  onDecision,
  isSubmitting = false,
  translations
}: MatchApprovalDialogProps) {
  const [reason, setReason] = useState('')
  const [isDeclinePending, setIsDeclinePending] = useState(false)
  const { storeFocus, restoreFocus } = useDecisionDialogFocus()

  // Store focus when dialog opens
  useEffect(() => {
    if (isOpen) {
      storeFocus()
    } else {
      restoreFocus()
    }
  }, [isOpen, storeFocus, restoreFocus])

  // Handler functions must be declared before the useEffect that uses them
  const handleApprove = () => {
    if (isSubmitting) return
    onDecision(true)
  }

  const handleDecline = () => {
    if (isSubmitting) return
    setIsDeclinePending(true)
  }

  const handleConfirmDecline = () => {
    onDecision(false, reason.trim() || undefined)
    setIsDeclinePending(false)
    setReason('')
  }

  const handleClose = () => {
    if (isSubmitting) return
    setIsDeclinePending(false)
    setReason('')
    onClose()
  }

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return

    const handleKeyPress = (event: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return
      }

      if (event.key === 'y' || event.key === 'Y') {
        event.preventDefault()
        handleApprove()
      } else if (event.key === 'n' || event.key === 'N') {
        event.preventDefault()
        handleDecline()
      } else if (event.key === 'Escape') {
        event.preventDefault()
        handleClose()
      }
    }

    document.addEventListener('keydown', handleKeyPress)
    return () => document.removeEventListener('keydown', handleKeyPress)
  }, [isOpen, onDecision, onClose, reason, handleApprove, handleDecline, handleClose])

  // Generate avatar fallback
  const avatarFallback = advisor.display_name
    .split(' ')
    .map(name => name[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent
        className="sm:max-w-2xl bg-background border-border"
        role="alertdialog"
        aria-labelledby="approval-title"
      >
        <DialogHeader>
          <DialogTitle id="approval-title" className="text-foreground">
            {translations.approveMatchTitle}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {translations.approveMatchDescription}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4" aria-describedby="match-details">
          {/* Advisor Preview */}
          <div className="space-y-4">
            <h3 className="font-semibold text-foreground">
              {translations.advisorDetails}
            </h3>

            <div className="flex items-start gap-4 p-4 bg-muted/50 rounded-lg">
              <Avatar className="h-12 w-12">
                <AvatarImage src={advisor.avatar_url} alt={advisor.display_name} />
                <AvatarFallback className="bg-gradient-to-br from-blue-400 to-purple-600 text-white font-semibold">
                  {avatarFallback}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold text-foreground">
                    {advisor.display_name}
                  </h4>
                  <Badge variant="secondary" className="text-xs">
                    {advisor.years_experience} {translations.yearsExperience}
                  </Badge>
                </div>

                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Icon name="star" className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    <span>{advisor.rating.toFixed(1)} {translations.rating}</span>
                  </div>
                  <span>•</span>
                  <span>{advisor.review_count} {translations.reviews}</span>
                </div>

                {advisor.bio && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {advisor.bio}
                  </p>
                )}

                {advisor.skills.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">
                      {translations.skills}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {advisor.skills.slice(0, 6).map((skill) => (
                        <Badge key={skill} variant="outline" className="text-xs">
                          {skill}
                        </Badge>
                      ))}
                      {advisor.skills.length > 6 && (
                        <Badge variant="outline" className="text-xs">
                          +{advisor.skills.length - 6}
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Project Preview */}
          <div className="space-y-4">
            <h3 className="font-semibold text-foreground">
              {translations.projectDetails}
            </h3>

            <div className="p-4 bg-muted/50 rounded-lg space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{project.framework}</Badge>
                <Badge variant="outline" className="capitalize">
                  {project.complexity_level}
                </Badge>
              </div>

              {project.estimated_hours && (
                <p className="text-sm text-muted-foreground">
                  Estimated: {project.estimated_hours} hours
                </p>
              )}

              {!project.title && (
                <p className="text-xs text-muted-foreground italic">
                  Full project details will be shared after approval
                </p>
              )}
            </div>
          </div>

          {/* Decline reason form */}
          {isDeclinePending && (
            <div className="space-y-4">
              <h3 className="font-semibold text-foreground">
                {translations.declineReason}
              </h3>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={translations.declineReasonPlaceholder}
                rows={3}
                className="bg-background border-border text-foreground"
              />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span role="note">
              {translations.keyboardShortcuts}: <u>Y</u> approve, <u>N</u> decline, <u>Esc</u> cancel
            </span>
          </div>

          <div className="flex gap-2 ms-auto">
            {isDeclinePending ? (
              <>
                <Button variant="outline" onClick={() => setIsDeclinePending(false)}>
                  {translations.cancel}
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleConfirmDecline}
                  disabled={isSubmitting}
                >
                  {translations.decline}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={handleDecline}
                  disabled={isSubmitting}
                  accessKey="n"
                >
                  <u>N</u>o, pass
                </Button>
                <Button
                  onClick={handleApprove}
                  disabled={isSubmitting}
                  accessKey="y"
                >
                  {isSubmitting ? 'Processing...' : (
                    <><u>Y</u>es, {translations.approve}</>
                  )}
                </Button>
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Mobile sheet implementation
function MobileMatchApprovalSheet({
  isOpen,
  onClose,
  match,
  advisor,
  project,
  onDecision,
  isSubmitting = false,
  translations
}: MatchApprovalDialogProps) {
  const [reason, setReason] = useState('')
  const [isDeclinePending, setIsDeclinePending] = useState(false)

  const handleApprove = () => {
    if (isSubmitting) return
    onDecision(true)
  }

  const handleDecline = () => {
    if (isSubmitting) return
    onDecision(false, reason.trim() || undefined)
  }

  const handleClose = () => {
    if (isSubmitting) return
    setIsDeclinePending(false)
    setReason('')
    onClose()
  }

  // Generate avatar fallback
  const avatarFallback = advisor.display_name
    .split(' ')
    .map(name => name[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <Sheet open={isOpen} onOpenChange={handleClose}>
      <SheetContent side="bottom" className="h-[90vh] bg-background">
        <div className="flex flex-col h-full">
          <SheetHeader className="pb-4">
            <SheetTitle className="text-foreground">
              {translations.approveMatchTitle}
            </SheetTitle>
            <SheetDescription className="text-muted-foreground">
              {translations.approveMatchDescription}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto space-y-6">
            {/* Advisor Preview - Mobile optimized */}
            <div className="space-y-4">
              <h3 className="font-semibold text-foreground">
                {translations.advisorDetails}
              </h3>

              <div className="p-4 bg-muted/50 rounded-lg space-y-4">
                <div className="flex items-center gap-3">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={advisor.avatar_url} alt={advisor.display_name} />
                    <AvatarFallback className="bg-gradient-to-br from-blue-400 to-purple-600 text-white font-semibold">
                      {avatarFallback}
                    </AvatarFallback>
                  </Avatar>

                  <div>
                    <h4 className="font-semibold text-foreground">
                      {advisor.display_name}
                    </h4>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Icon name="star" className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                      <span>{advisor.rating.toFixed(1)}</span>
                      <span>•</span>
                      <span>{advisor.review_count} reviews</span>
                    </div>
                  </div>
                </div>

                {advisor.bio && (
                  <p className="text-sm text-muted-foreground">
                    {advisor.bio}
                  </p>
                )}

                <div className="flex flex-wrap gap-1">
                  {advisor.skills.slice(0, 4).map((skill) => (
                    <Badge key={skill} variant="outline" className="text-xs">
                      {skill}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            {/* Project Preview */}
            <div className="space-y-4">
              <h3 className="font-semibold text-foreground">
                {translations.projectDetails}
              </h3>

              <div className="p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="secondary">{project.framework}</Badge>
                  <Badge variant="outline" className="capitalize">
                    {project.complexity_level}
                  </Badge>
                </div>

                {project.estimated_hours && (
                  <p className="text-sm text-muted-foreground">
                    Estimated: {project.estimated_hours} hours
                  </p>
                )}
              </div>
            </div>

            {/* Decline reason - Mobile */}
            {isDeclinePending && (
              <div className="space-y-4">
                <h3 className="font-semibold text-foreground">
                  Why are you declining this match?
                </h3>
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Optional reason..."
                  rows={3}
                  className="bg-background border-border text-foreground"
                />
              </div>
            )}
          </div>

          {/* Sticky action buttons for mobile */}
          <div className="sticky bottom-0 bg-background border-t border-border p-4 flex gap-3">
            {isDeclinePending ? (
              <>
                <Button
                  variant="outline"
                  size="lg"
                  className="flex-1"
                  onClick={() => setIsDeclinePending(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="lg"
                  className="flex-1"
                  onClick={handleDecline}
                  disabled={isSubmitting}
                >
                  Decline Match
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="lg"
                  className="flex-1"
                  onClick={() => setIsDeclinePending(true)}
                  disabled={isSubmitting}
                >
                  Pass
                </Button>
                <Button
                  size="lg"
                  className="flex-1"
                  onClick={handleApprove}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Processing...' : 'Accept Match'}
                </Button>
              </>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}