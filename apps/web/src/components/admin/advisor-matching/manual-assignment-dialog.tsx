/**
 * Manual Assignment Dialog Component
 *
 * Following CLAUDE.md patterns:
 * - Expert-enhanced emergency assignment with safety guards
 * - Comprehensive validation and rule checking
 * - Mobile-first responsive modal design
 * - Idempotent submission with correlation tracking
 */

'use client'

import { useState, useCallback, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Icon } from '@/components/ui/icon'
import { toast } from '@/components/ui/toast'
import { useEmergencyAssignment, useAdvisorEligibilityValidation } from '@/hooks/use-admin-matching'
import { v4 as uuidv4 } from 'uuid'

interface ManualAssignmentDialogProps {
  trigger?: React.ReactNode
  projects: Array<{
    id: string
    name: string
    description?: string
    client_name?: string
    created_at: string
  }>
  advisors: Array<{
    id: string
    name: string
    email: string
    specializations: string[]
    is_available: boolean
    active_projects: number
    max_concurrent_projects: number
    last_project_end?: string
    cooldown_hours?: number
    admin_preferences?: {
      never_assign?: boolean
      preferred?: boolean
    }
  }>
  translations: {
    title: string
    selectProject: string
    selectAdvisor: string
    assignmentReason: string
    reasonPlaceholder: string
    bypassAvailability: string
    bypassDescription: string
    warnings: string
    violations: string
    assign: string
    cancel: string
    assignmentSuccess: string
    assignmentFailed: string
    validationErrors: {
      projectRequired: string
      advisorRequired: string
      reasonTooShort: string
      hasViolations: string
    }
    eligibility: {
      available: string
      atCapacity: string
      unavailable: string
      cooldown: string
      neverAssign: string
      preferred: string
    }
  }
}

export function ManualAssignmentDialog({
  trigger,
  projects = [],
  advisors = [],
  translations
}: ManualAssignmentDialogProps) {
  // toast is imported directly
  const { validateAdvisorEligibility } = useAdvisorEligibilityValidation()
  const emergencyAssignment = useEmergencyAssignment()

  // Form state
  const [open, setOpen] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [selectedAdvisorId, setSelectedAdvisorId] = useState<string>('')
  const [assignmentReason, setAssignmentReason] = useState<string>('')
  const [bypassAvailability, setBypassAvailability] = useState<boolean>(false)

  // Validation state
  const [eligibilityResult, setEligibilityResult] = useState<{
    warnings: string[]
    violations: string[]
    hasViolations: boolean
    canAssign: boolean
  } | null>(null)

  // Get selected entities
  const selectedProject = projects.find(p => p.id === selectedProjectId)
  const selectedAdvisor = advisors.find(a => a.id === selectedAdvisorId)

  // Validate advisor when selection changes
  useEffect(() => {
    if (selectedAdvisor) {
      const result = validateAdvisorEligibility(selectedAdvisor, bypassAvailability)
      setEligibilityResult(result)
    } else {
      setEligibilityResult(null)
    }
  }, [selectedAdvisor, bypassAvailability, validateAdvisorEligibility])

  // Form validation
  const validateForm = useCallback(() => {
    const errors: string[] = []

    if (!selectedProjectId) {
      errors.push(translations.validationErrors.projectRequired)
    }

    if (!selectedAdvisorId) {
      errors.push(translations.validationErrors.advisorRequired)
    }

    if (assignmentReason.length < 20) {
      errors.push(translations.validationErrors.reasonTooShort)
    }

    if (eligibilityResult?.hasViolations && !bypassAvailability) {
      errors.push(translations.validationErrors.hasViolations)
    }

    return errors
  }, [selectedProjectId, selectedAdvisorId, assignmentReason, eligibilityResult, bypassAvailability, translations])

  // Handle form submission
  const handleSubmit = useCallback(async () => {
    const validationErrors = validateForm()

    if (validationErrors.length > 0) {
      toast.error('Validation Error', { description: validationErrors.join(', ') })
      return
    }

    if (!selectedProject || !selectedAdvisor) {
      return
    }

    try {
      const result = await emergencyAssignment.mutateAsync({
        projectId: selectedProjectId,
        advisorId: selectedAdvisorId,
        reason: assignmentReason,
        bypassAvailability,
        idempotencyKey: uuidv4()
      })

      toast.success(translations.assignmentSuccess, { description: `Match ID: ${result.matchId}` })

      // Reset form and close dialog
      setSelectedProjectId('')
      setSelectedAdvisorId('')
      setAssignmentReason('')
      setBypassAvailability(false)
      setOpen(false)

    } catch (error) {
      toast.error(translations.assignmentFailed, { description: error instanceof Error ? error.message : 'Unknown error' })
    }
  }, [
    validateForm,
    selectedProject,
    selectedAdvisor,
    selectedProjectId,
    selectedAdvisorId,
    assignmentReason,
    bypassAvailability,
    emergencyAssignment,
    toast,
    translations
  ])

  const formErrors = validateForm()
  const canSubmit = formErrors.length === 0 && !emergencyAssignment.isPending

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button className="gap-2">
            <Icon name="user-plus" className="h-4 w-4" />
            Emergency Assignment
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="alert-triangle" className="h-5 w-5 text-yellow-500" />
            {translations.title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 pt-4">
          {/* Project Selection */}
          <div className="space-y-2">
            <Label htmlFor="project-select">{translations.selectProject}</Label>
            <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
              <SelectTrigger id="project-select">
                <SelectValue placeholder={translations.selectProject} />
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    <div className="flex flex-col">
                      <span className="font-medium">{project.name}</span>
                      {project.client_name && (
                        <span className="text-sm text-muted-foreground">
                          Client: {project.client_name}
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Advisor Selection */}
          <div className="space-y-2">
            <Label htmlFor="advisor-select">{translations.selectAdvisor}</Label>
            <Select value={selectedAdvisorId} onValueChange={setSelectedAdvisorId}>
              <SelectTrigger id="advisor-select">
                <SelectValue placeholder={translations.selectAdvisor} />
              </SelectTrigger>
              <SelectContent>
                {advisors.map((advisor) => (
                  <SelectItem key={advisor.id} value={advisor.id}>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{advisor.name}</span>
                        <Badge
                          variant={advisor.is_available ? 'default' : 'secondary'}
                        >
                          {advisor.is_available ? translations.eligibility.available : translations.eligibility.unavailable}
                        </Badge>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {advisor.specializations.join(', ')} • {advisor.active_projects}/{advisor.max_concurrent_projects} projects
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Advisor Eligibility Card */}
          {selectedAdvisor && eligibilityResult && (
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-sm font-medium">Advisor Eligibility</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Violations */}
                {eligibilityResult.violations.length > 0 && (
                  <Alert variant="destructive">
                    <Icon name="x-circle" className="h-4 w-4" />
                    <AlertDescription>
                      <strong>{translations.violations}:</strong>
                      <ul className="list-disc list-inside mt-1">
                        {eligibilityResult.violations.map((violation, index) => (
                          <li key={index} className="text-sm">{violation}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}

                {/* Warnings */}
                {eligibilityResult.warnings.length > 0 && (
                  <Alert variant="default" className="border-yellow-500">
                    <Icon name="alert-triangle" className="h-4 w-4" />
                    <AlertDescription>
                      <strong>{translations.warnings}:</strong>
                      <ul className="list-disc list-inside mt-1">
                        {eligibilityResult.warnings.map((warning, index) => (
                          <li key={index} className="text-sm">{warning}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}

                {/* Assignment Status */}
                <div className="flex items-center justify-between p-2 rounded-lg bg-muted">
                  <span className="text-sm font-medium">Can Assign:</span>
                  <Badge variant={eligibilityResult.canAssign ? 'default' : 'destructive'}>
                    {eligibilityResult.canAssign ? 'Yes' : 'No'}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Assignment Reason */}
          <div className="space-y-2">
            <Label htmlFor="reason">{translations.assignmentReason} *</Label>
            <Textarea
              id="reason"
              value={assignmentReason}
              onChange={(e) => setAssignmentReason(e.target.value)}
              placeholder={translations.reasonPlaceholder}
              className="min-h-[100px]"
              maxLength={500}
            />
            <div className="text-xs text-muted-foreground text-right">
              {assignmentReason.length}/500 characters • Minimum 20 required
            </div>
          </div>

          {/* Bypass Availability Toggle */}
          <div className="flex items-center space-x-2">
            <Switch
              id="bypass-availability"
              checked={bypassAvailability}
              onCheckedChange={setBypassAvailability}
              disabled={!eligibilityResult?.hasViolations}
            />
            <div>
              <Label htmlFor="bypass-availability" className="cursor-pointer">
                {translations.bypassAvailability}
              </Label>
              <p className="text-xs text-muted-foreground">
                {translations.bypassDescription}
              </p>
            </div>
          </div>

          {/* Form Errors */}
          {formErrors.length > 0 && (
            <Alert variant="destructive">
              <Icon name="alert-circle" className="h-4 w-4" />
              <AlertDescription>
                <ul className="list-disc list-inside">
                  {formErrors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4 border-t border-border">
            <Button
              onClick={() => setOpen(false)}
              variant="outline"
              disabled={emergencyAssignment.isPending}
              className="flex-1"
            >
              {translations.cancel}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="flex-1 gap-2"
            >
              {emergencyAssignment.isPending ? (
                <Icon name="loader-2" className="h-4 w-4 animate-spin" />
              ) : (
                <Icon name="user-plus" className="h-4 w-4" />
              )}
              {translations.assign}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}