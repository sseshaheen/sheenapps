'use client'

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';

interface AdvisorAvailabilityContentProps {
  translations: {
    advisor: {
      dashboard: {
        availability: {
          title: string;
          schedule: string;
          timezone: string;
          blackoutDates: string;
          preferences: string;
          calendarSync: string;
          days: {
            monday: string;
            tuesday: string;
            wednesday: string;
            thursday: string;
            friday: string;
            saturday: string;
            sunday: string;
          };
          fields: {
            minNoticeHours: string;
            maxAdvanceDays: string;
            bufferMinutes: string;
            addTimeSlot: string;
            removeTimeSlot: string;
            startTime: string;
            endTime: string;
            addBlackoutDate: string;
            selectTimezone: string;
          };
          sync: {
            lastSynced: string;
            status: string;
            success: string;
            failed: string;
            pending: string;
            syncNow: string;
          };
          validation: {
            invalidTime: string;
            overlappingSlots: string;
            startAfterEnd: string;
          };
        };
      };
    };
    common: {
      loading: string;
      save: string;
      cancel: string;
      saving: string;
      saved: string;
    };
  };
  locale: string;
}

export function AdvisorAvailabilityContent({ translations, locale }: AdvisorAvailabilityContentProps) {
  const [timezone, setTimezone] = useState('UTC');
  const [minNoticeHours, setMinNoticeHours] = useState('2');
  const [maxAdvanceDays, setMaxAdvanceDays] = useState('30');
  const [bufferMinutes, setBufferMinutes] = useState('15');
  const [isSaving, setIsSaving] = useState(false);

  const t = translations.advisor.dashboard.availability;
  const common = translations.common;

  // Mock schedule data
  const weekDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  
  const [schedule, setSchedule] = useState<Record<string, Array<{start: string, end: string}>>>({
    monday: [{ start: '09:00', end: '17:00' }],
    tuesday: [{ start: '09:00', end: '17:00' }],
    wednesday: [{ start: '09:00', end: '17:00' }],
    thursday: [{ start: '09:00', end: '17:00' }],
    friday: [{ start: '09:00', end: '17:00' }],
    saturday: [],
    sunday: []
  });

  const [blackoutDates, setBlackoutDates] = useState<string[]>(['2024-12-25', '2024-01-01']);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      console.log('Saving availability:', { timezone, schedule, blackoutDates });
    } catch (error) {
      console.error('Failed to save availability:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const addTimeSlot = (day: string) => {
    setSchedule(prev => ({
      ...prev,
      [day]: [...prev[day], { start: '09:00', end: '17:00' }]
    }));
  };

  const removeTimeSlot = (day: string, index: number) => {
    setSchedule(prev => ({
      ...prev,
      [day]: prev[day].filter((_, i) => i !== index)
    }));
  };

  const updateTimeSlot = (day: string, index: number, field: 'start' | 'end', value: string) => {
    setSchedule(prev => ({
      ...prev,
      [day]: prev[day].map((slot, i) => 
        i === index ? { ...slot, [field]: value } : slot
      )
    }));
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">{t.title}</h1>
        <p className="text-muted-foreground mt-1">
          Configure your availability and booking preferences
        </p>
      </div>

      {/* Timezone Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Icon name="globe" className="h-5 w-5" />
            {t.timezone}
          </CardTitle>
          <CardDescription>
            Set your timezone for accurate scheduling
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="timezone">{t.fields.selectTimezone}</Label>
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger>
                  <SelectValue placeholder="Select timezone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="UTC">UTC (GMT+0)</SelectItem>
                  <SelectItem value="America/New_York">Eastern Time (EST)</SelectItem>
                  <SelectItem value="America/Los_Angeles">Pacific Time (PST)</SelectItem>
                  <SelectItem value="Europe/London">London (GMT)</SelectItem>
                  <SelectItem value="Europe/Paris">Paris (CET)</SelectItem>
                  <SelectItem value="Asia/Tokyo">Tokyo (JST)</SelectItem>
                  <SelectItem value="Australia/Sydney">Sydney (AEDT)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Weekly Schedule */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Icon name="calendar" className="h-5 w-5" />
            {t.schedule}
          </CardTitle>
          <CardDescription>
            Set your available hours for each day of the week
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {weekDays.map((day) => (
              <div key={day} className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-medium">{t.days[day as keyof typeof t.days]}</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => addTimeSlot(day)}
                  >
                    <Icon name="plus" className="h-4 w-4 mr-1" />
                    {t.fields.addTimeSlot}
                  </Button>
                </div>
                
                <div className="space-y-2">
                  {schedule[day].length === 0 ? (
                    <div className="text-sm text-muted-foreground italic py-2">
                      No availability set for this day
                    </div>
                  ) : (
                    schedule[day].map((slot, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <div className="grid grid-cols-2 gap-2 flex-1">
                          <div>
                            <Label className="text-xs">{t.fields.startTime}</Label>
                            <Input
                              type="time"
                              value={slot.start}
                              onChange={(e) => updateTimeSlot(day, index, 'start', e.target.value)}
                              className="h-8"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">{t.fields.endTime}</Label>
                            <Input
                              type="time"
                              value={slot.end}
                              onChange={(e) => updateTimeSlot(day, index, 'end', e.target.value)}
                              className="h-8"
                            />
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeTimeSlot(day, index)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Icon name="trash-2" className="h-4 w-4" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Booking Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Icon name="settings" className="h-5 w-5" />
            {t.preferences}
          </CardTitle>
          <CardDescription>
            Configure your booking requirements and preferences
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="min-notice">{t.fields.minNoticeHours}</Label>
              <Input
                id="min-notice"
                type="number"
                value={minNoticeHours}
                onChange={(e) => setMinNoticeHours(e.target.value)}
                min="1"
                max="72"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="max-advance">{t.fields.maxAdvanceDays}</Label>
              <Input
                id="max-advance"
                type="number"
                value={maxAdvanceDays}
                onChange={(e) => setMaxAdvanceDays(e.target.value)}
                min="1"
                max="365"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="buffer">{t.fields.bufferMinutes}</Label>
              <Input
                id="buffer"
                type="number"
                value={bufferMinutes}
                onChange={(e) => setBufferMinutes(e.target.value)}
                min="0"
                max="60"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Blackout Dates */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Icon name="calendar-x" className="h-5 w-5" />
            {t.blackoutDates}
          </CardTitle>
          <CardDescription>
            Dates when you're unavailable for consultations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {blackoutDates.map((date, index) => (
                <Badge key={index} variant="secondary" className="px-3 py-1">
                  {date}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-auto p-0 ml-2"
                    onClick={() => setBlackoutDates(prev => prev.filter((_, i) => i !== index))}
                  >
                    <Icon name="x" className="h-3 w-3" />
                  </Button>
                </Badge>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                className="w-auto"
                onChange={(e) => {
                  if (e.target.value && !blackoutDates.includes(e.target.value)) {
                    setBlackoutDates(prev => [...prev, e.target.value]);
                    e.target.value = '';
                  }
                }}
              />
              <span className="text-sm text-muted-foreground">{t.fields.addBlackoutDate}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Calendar Sync Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Icon name="refresh-cw" className="h-5 w-5" />
            {t.calendarSync}
          </CardTitle>
          <CardDescription>
            Sync your availability with external calendars
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="text-green-600 border-green-600">
                <Icon name="check" className="h-3 w-3 mr-1" />
                {t.sync.success}
              </Badge>
              <span className="text-sm">{t.sync.lastSynced}: 2 hours ago</span>
            </div>
            <Button variant="outline" size="sm">
              <Icon name="refresh-cw" className="h-4 w-4 mr-2" />
              {t.sync.syncNow}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* Save Button */}
      <div className="flex justify-end gap-4">
        <Button variant="outline">
          {common.cancel}
        </Button>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <>
              <Icon name="loader-2" className="h-4 w-4 mr-2 animate-spin" />
              {common.saving}
            </>
          ) : (
            <>
              <Icon name="save" className="h-4 w-4 mr-2" />
              {common.save}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}