/**
 * Availability Scheduler Component
 *
 * Following CLAUDE.md patterns:
 * - Semantic theme classes for dark mode compatibility
 * - Mobile-first responsive design
 * - Accessibility with ARIA labels and keyboard navigation
 * - RTL support with logical properties
 */

'use client'

import { useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Icon } from '@/components/ui/icon'
import { toast } from '@/components/ui/toast'
import {
  useAdvisorAvailability,
  useAddAvailabilityWindow,
  useRemoveAvailabilityWindow,
  useAvailabilityValidation
} from '@/hooks/use-advisor-availability'
import type {
  AvailabilityWindow,
  AvailabilityFormData
} from '@/types/advisor-availability'
import { DAYS_OF_WEEK, DEFAULT_TIMEZONES } from '@/types/advisor-availability'

interface AvailabilitySchedulerProps {
  advisorId: string
  translations: {
    title: string
    addTimeSlot: string
    dayOfWeek: string
    startTime: string
    endTime: string
    timezone: string
    active: string
    remove: string
    save: string
    cancel: string
    noTimeSlots: string
    addFirstTimeSlot: string
    days: Record<string, string>
    validationErrors: {
      invalidTimeRange: string
      timezoneRequired: string
      dayRequired: string
    }
    messages: {
      timeSlotAdded: string
      timeSlotRemoved: string
      scheduleUpdated: string
      errorAddingTimeSlot: string
      errorRemovingTimeSlot: string
    }
  }
}

export function AvailabilityScheduler({ advisorId, translations }: AvailabilitySchedulerProps) {
  // toast is imported directly
  const { validateWindow, validateTimeRange } = useAvailabilityValidation()

  // Data fetching
  const { data: availabilityData, isLoading } = useAdvisorAvailability(advisorId)
  const addWindowMutation = useAddAvailabilityWindow(advisorId)
  const removeWindowMutation = useRemoveAvailabilityWindow(advisorId)

  // Form state
  const [showAddForm, setShowAddForm] = useState(false)
  const [newWindow, setNewWindow] = useState<Partial<AvailabilityWindow>>({
    day_of_week: 1, // Monday
    start_time: '09:00',
    end_time: '17:00',
    timezone: 'America/New_York',
    is_active: true
  })

  const handleAddWindow = useCallback(async () => {
    const validation = validateWindow(newWindow)

    if (!validation.isValid) {
      toast.error(translations.validationErrors.invalidTimeRange, { description: validation.errors.join(', ') })
      return
    }

    try {
      await addWindowMutation.mutateAsync(newWindow as Omit<AvailabilityWindow, 'id' | 'advisor_id' | 'created_at' | 'updated_at'>)

      toast.success(translations.messages.timeSlotAdded)

      // Reset form
      setNewWindow({
        day_of_week: 1,
        start_time: '09:00',
        end_time: '17:00',
        timezone: 'America/New_York',
        is_active: true
      })
      setShowAddForm(false)

    } catch (error) {
      toast.error(translations.messages.errorAddingTimeSlot, { description: error instanceof Error ? error.message : 'Unknown error' })
    }
  }, [newWindow, validateWindow, addWindowMutation, toast, translations])

  const handleRemoveWindow = useCallback(async (windowId: string) => {
    try {
      await removeWindowMutation.mutateAsync(windowId)

      toast.success(translations.messages.timeSlotRemoved)

    } catch (error) {
      toast.error(translations.messages.errorRemovingTimeSlot, { description: error instanceof Error ? error.message : 'Unknown error' })
    }
  }, [removeWindowMutation, toast, translations])

  const handleTimeChange = useCallback((field: 'start_time' | 'end_time', value: string) => {
    setNewWindow(prev => {
      const updated = { ...prev, [field]: value }

      // Validate time range if both times are set
      if (updated.start_time && updated.end_time) {
        const isValid = validateTimeRange(updated.start_time, updated.end_time)
        if (!isValid && field === 'end_time') {
          // Auto-adjust end time if invalid
          const [startHour, startMin] = updated.start_time.split(':').map(Number)
          const endHour = startHour + 1
          updated.end_time = `${endHour.toString().padStart(2, '0')}:${startMin.toString().padStart(2, '0')}`
        }
      }

      return updated
    })
  }, [validateTimeRange])

  if (isLoading) {
    return (
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <Icon name="clock" className="h-5 w-5" />
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

  const windows = availabilityData?.windows || []
  const sortedWindows = windows.sort((a, b) => {
    if (a.day_of_week !== b.day_of_week) {
      return a.day_of_week - b.day_of_week
    }
    return a.start_time.localeCompare(b.start_time)
  })

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-foreground flex items-center gap-2">
          <Icon name="clock" className="h-5 w-5" />
          {translations.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Existing time slots */}
        <div className="space-y-3">
          {sortedWindows.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Icon name="calendar-x" className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="mb-4">{translations.noTimeSlots}</p>
              <Button
                onClick={() => setShowAddForm(true)}
                variant="outline"
                className="gap-2"
              >
                <Icon name="plus" className="h-4 w-4" />
                {translations.addFirstTimeSlot}
              </Button>
            </div>
          ) : (
            <>
              {sortedWindows.map((window) => {
                const dayLabel = DAYS_OF_WEEK.find(d => d.value === window.day_of_week)?.label || 'unknown'

                return (
                  <div
                    key={window.id}
                    className="flex items-center justify-between p-4 rounded-lg bg-muted border border-border"
                  >
                    <div className="flex items-center gap-4">
                      <Badge variant={window.is_active ? 'default' : 'secondary'}>
                        {translations.days[dayLabel]}
                      </Badge>
                      <div className="flex items-center gap-2 text-sm text-foreground">
                        <Icon name="clock" className="h-4 w-4" />
                        <span>{window.start_time} - {window.end_time}</span>
                        <span className="text-muted-foreground">({window.timezone})</span>
                      </div>
                    </div>
                    <Button
                      onClick={() => handleRemoveWindow(window.id)}
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      disabled={removeWindowMutation.isPending}
                    >
                      <Icon name="trash-2" className="h-4 w-4" />
                      <span className="sr-only">{translations.remove}</span>
                    </Button>
                  </div>
                )
              })}

              {!showAddForm && (
                <Button
                  onClick={() => setShowAddForm(true)}
                  variant="outline"
                  className="w-full gap-2"
                >
                  <Icon name="plus" className="h-4 w-4" />
                  {translations.addTimeSlot}
                </Button>
              )}
            </>
          )}
        </div>

        {/* Add new time slot form */}
        {showAddForm && (
          <Card className="bg-background border-border">
            <CardContent className="p-6 space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="day-select">{translations.dayOfWeek}</Label>
                  <Select
                    value={newWindow.day_of_week?.toString()}
                    onValueChange={(value) => setNewWindow(prev => ({
                      ...prev,
                      day_of_week: parseInt(value) as 0 | 1 | 2 | 3 | 4 | 5 | 6
                    }))}
                  >
                    <SelectTrigger id="day-select">
                      <SelectValue placeholder={translations.dayOfWeek} />
                    </SelectTrigger>
                    <SelectContent>
                      {DAYS_OF_WEEK.map((day) => (
                        <SelectItem key={day.value} value={day.value.toString()}>
                          {translations.days[day.label]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="timezone-select">{translations.timezone}</Label>
                  <Select
                    value={newWindow.timezone}
                    onValueChange={(value) => setNewWindow(prev => ({ ...prev, timezone: value }))}
                  >
                    <SelectTrigger id="timezone-select">
                      <SelectValue placeholder={translations.timezone} />
                    </SelectTrigger>
                    <SelectContent>
                      {DEFAULT_TIMEZONES.map((tz) => (
                        <SelectItem key={tz} value={tz}>
                          {tz.replace('_', ' ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="start-time">{translations.startTime}</Label>
                  <Input
                    id="start-time"
                    type="time"
                    value={newWindow.start_time}
                    onChange={(e) => handleTimeChange('start_time', e.target.value)}
                    className="bg-background"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="end-time">{translations.endTime}</Label>
                  <Input
                    id="end-time"
                    type="time"
                    value={newWindow.end_time}
                    onChange={(e) => handleTimeChange('end_time', e.target.value)}
                    className="bg-background"
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="active-switch"
                  checked={newWindow.is_active}
                  onCheckedChange={(checked) => setNewWindow(prev => ({ ...prev, is_active: checked }))}
                />
                <Label htmlFor="active-switch">{translations.active}</Label>
              </div>

              <div className="flex gap-2 pt-4">
                <Button
                  onClick={handleAddWindow}
                  disabled={addWindowMutation.isPending}
                  className="flex-1 gap-2"
                >
                  {addWindowMutation.isPending ? (
                    <Icon name="loader-2" className="h-4 w-4 animate-spin" />
                  ) : (
                    <Icon name="check" className="h-4 w-4" />
                  )}
                  {translations.save}
                </Button>
                <Button
                  onClick={() => setShowAddForm(false)}
                  variant="outline"
                  disabled={addWindowMutation.isPending}
                  className="flex-1"
                >
                  {translations.cancel}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </CardContent>
    </Card>
  )
}