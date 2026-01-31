/**
 * Capacity Manager Component
 *
 * Following CLAUDE.md patterns:
 * - Semantic theme classes for consistent theming
 * - Mobile-first responsive layout
 * - Accessibility with proper labels and ARIA attributes
 * - Form validation with user-friendly error messages
 */

'use client'

import { useState, useCallback, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Icon, type IconName } from '@/components/ui/icon'
import { toast } from '@/components/ui/toast'
import {
  useAdvisorAvailability,
  useUpdateAdvisorAvailability,
  useAvailabilityValidation
} from '@/hooks/use-advisor-availability'
import type { AdvisorCapacity } from '@/types/advisor-availability'
import { getCapacityUtilization } from '@/types/advisor-availability'

interface CapacityManagerProps {
  advisorId: string
  translations: {
    title: string
    maxProjects: string
    currentProjects: string
    maxWeeklyHours: string
    currentWeeklyHours: string
    acceptingNewProjects: string
    autoPauseThreshold: string
    autoPauseDescription: string
    capacity: string
    utilizationLabel: string
    projectCapacity: string
    hourCapacity: string
    overallUtilization: string
    save: string
    cancel: string
    reset: string
    available: string
    atCapacity: string
    paused: string
    validationErrors: {
      maxProjectsRequired: string
      maxHoursRequired: string
      thresholdRange: string
    }
    messages: {
      capacityUpdated: string
      errorUpdatingCapacity: string
      unsavedChanges: string
    }
    status: {
      available: string
      at_capacity: string
      unavailable_schedule: string
      manual_pause: string
    }
  }
}

export function CapacityManager({ advisorId, translations }: CapacityManagerProps) {
  // toast is imported directly
  const { validateCapacity } = useAvailabilityValidation()

  // Data fetching
  const { data: availabilityData, isLoading } = useAdvisorAvailability(advisorId)
  const updateAvailabilityMutation = useUpdateAdvisorAvailability(advisorId)

  // Form state
  const [formData, setFormData] = useState<Partial<AdvisorCapacity>>({})
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  // Initialize form data when availability data loads
  useEffect(() => {
    if (availabilityData?.capacity && !hasUnsavedChanges) {
      setFormData(availabilityData.capacity)
    }
  }, [availabilityData?.capacity, hasUnsavedChanges])

  const handleInputChange = useCallback((field: keyof AdvisorCapacity, value: string | number | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    setHasUnsavedChanges(true)
  }, [])

  const handleSave = useCallback(async () => {
    const validation = validateCapacity(formData)

    if (!validation.isValid) {
      toast.error(translations.validationErrors.maxProjectsRequired, { description: validation.errors.join(', ') })
      return
    }

    try {
      await updateAvailabilityMutation.mutateAsync({
        capacity: formData
      })

      toast.success(translations.messages.capacityUpdated)

      setHasUnsavedChanges(false)

    } catch (error) {
      toast.error(translations.messages.errorUpdatingCapacity, { description: error instanceof Error ? error.message : 'Unknown error' })
    }
  }, [formData, validateCapacity, updateAvailabilityMutation, toast, translations])

  const handleReset = useCallback(() => {
    if (availabilityData?.capacity) {
      setFormData(availabilityData.capacity)
      setHasUnsavedChanges(false)
    }
  }, [availabilityData?.capacity])

  if (isLoading) {
    return (
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <Icon name="activity" className="h-5 w-5" />
            {translations.title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Icon name="loader-2" className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    )
  }

  const capacity = availabilityData?.capacity
  const status = availabilityData?.status

  if (!capacity) {
    return (
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <Icon name="activity" className="h-5 w-5" />
            {translations.title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            No capacity data available
          </p>
        </CardContent>
      </Card>
    )
  }

  const utilization = getCapacityUtilization(capacity)
  const isAtCapacity = utilization.overall >= 100
  const isNearCapacity = utilization.overall >= (capacity.auto_pause_threshold || 80)

  // Get status badge variant and icon
  const getStatusDisplay = (statusReason: string): { variant: 'default' | 'destructive' | 'secondary' | 'outline', icon: IconName, text: string } => {
    switch (statusReason) {
      case 'available':
        return { variant: 'default' as const, icon: 'check-circle' as const, text: translations.status.available }
      case 'at_capacity':
        return { variant: 'destructive' as const, icon: 'alert-circle' as const, text: translations.status.at_capacity }
      case 'unavailable_schedule':
        return { variant: 'secondary' as const, icon: 'clock' as const, text: translations.status.unavailable_schedule }
      case 'manual_pause':
        return { variant: 'outline' as const, icon: 'pause-circle' as const, text: translations.status.manual_pause }
      default:
        return { variant: 'secondary' as const, icon: 'help-circle' as const, text: statusReason }
    }
  }

  const statusDisplay = status ? getStatusDisplay(status.status_reason) : null

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-foreground flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon name="activity" className="h-5 w-5" />
            {translations.title}
          </div>
          {statusDisplay && (
            <Badge variant={statusDisplay.variant} className="gap-1">
              <Icon name={statusDisplay.icon} className="h-3 w-3" />
              {statusDisplay.text}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Capacity Overview */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="bg-muted border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-medium">{translations.projectCapacity}</Label>
                <Badge variant={utilization.projects >= 100 ? 'destructive' : utilization.projects >= 80 ? 'secondary' : 'default'}>
                  {utilization.projects}%
                </Badge>
              </div>
              <Progress value={utilization.projects} className="mb-2" />
              <p className="text-xs text-muted-foreground">
                {capacity.current_active_projects} / {capacity.max_concurrent_projects} {translations.currentProjects.toLowerCase()}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-muted border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-medium">{translations.hourCapacity}</Label>
                <Badge variant={utilization.hours >= 100 ? 'destructive' : utilization.hours >= 80 ? 'secondary' : 'default'}>
                  {utilization.hours}%
                </Badge>
              </div>
              <Progress value={utilization.hours} className="mb-2" />
              <p className="text-xs text-muted-foreground">
                {capacity.current_weekly_hours} / {capacity.max_weekly_hours} hours
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Overall Utilization */}
        <Card className={`border-border ${isAtCapacity ? 'bg-destructive/10' : isNearCapacity ? 'bg-secondary/50' : 'bg-muted'}`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-medium">{translations.overallUtilization}</Label>
              <Badge variant={isAtCapacity ? 'destructive' : isNearCapacity ? 'secondary' : 'default'} className="gap-1">
                <Icon name={isAtCapacity ? 'alert-circle' : isNearCapacity ? 'alert-triangle' : 'check-circle'} className="h-3 w-3" />
                {utilization.overall}%
              </Badge>
            </div>
            <Progress value={utilization.overall} className="mb-2" />
          </CardContent>
        </Card>

        {/* Form Fields */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="max-projects">{translations.maxProjects}</Label>
            <Input
              id="max-projects"
              type="number"
              min="1"
              max="20"
              value={formData.max_concurrent_projects || ''}
              onChange={(e) => handleInputChange('max_concurrent_projects', parseInt(e.target.value) || 0)}
              className="bg-background"
            />
            <p className="text-xs text-muted-foreground">
              {translations.currentProjects}: {capacity.current_active_projects}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="max-hours">{translations.maxWeeklyHours}</Label>
            <Input
              id="max-hours"
              type="number"
              min="1"
              max="80"
              value={formData.max_weekly_hours || ''}
              onChange={(e) => handleInputChange('max_weekly_hours', parseInt(e.target.value) || 0)}
              className="bg-background"
            />
            <p className="text-xs text-muted-foreground">
              {translations.currentWeeklyHours}: {capacity.current_weekly_hours}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <Switch
              id="accepting-projects"
              checked={formData.is_accepting_new_projects ?? false}
              onCheckedChange={(checked) => handleInputChange('is_accepting_new_projects', checked)}
            />
            <Label htmlFor="accepting-projects">{translations.acceptingNewProjects}</Label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="auto-pause">{translations.autoPauseThreshold}</Label>
            <div className="flex items-center gap-2">
              <Input
                id="auto-pause"
                type="number"
                min="50"
                max="100"
                value={formData.auto_pause_threshold || ''}
                onChange={(e) => handleInputChange('auto_pause_threshold', parseInt(e.target.value) || undefined)}
                className="bg-background flex-1"
                placeholder="80"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {translations.autoPauseDescription}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        {hasUnsavedChanges && (
          <div className="flex gap-2 pt-4 border-t border-border">
            <Button
              onClick={handleSave}
              disabled={updateAvailabilityMutation.isPending}
              className="flex-1 gap-2"
            >
              {updateAvailabilityMutation.isPending ? (
                <Icon name="loader-2" className="h-4 w-4 animate-spin" />
              ) : (
                <Icon name="save" className="h-4 w-4" />
              )}
              {translations.save}
            </Button>
            <Button
              onClick={handleReset}
              variant="outline"
              disabled={updateAvailabilityMutation.isPending}
            >
              {translations.reset}
            </Button>
          </div>
        )}

        {hasUnsavedChanges && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Icon name="alert-circle" className="h-4 w-4" />
            {translations.messages.unsavedChanges}
          </div>
        )}
      </CardContent>
    </Card>
  )
}