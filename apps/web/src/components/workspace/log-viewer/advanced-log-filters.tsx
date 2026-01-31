/**
 * Advanced Log Filters Component
 *
 * Time range selection and advanced filtering for historical logs
 * Part of Phase 2 enhanced log features
 */

'use client'

import { useState } from 'react'
import { Icon } from '@/components/ui/icon'

interface Filters {
  start_time?: string
  end_time?: string
  levels: string[]
  tiers: string[]
  search?: string
}

interface AdvancedLogFiltersProps {
  filters: Filters
  onFiltersChange: (filters: Partial<Filters>) => void
  translations: {
    timeRange: string
    levels: string
    tiers: string
    startTime: string
    endTime: string
    clearFilters: string
  }
}

const LOG_LEVELS = [
  { key: 'debug', label: 'Debug', color: 'text-gray-500' },
  { key: 'info', label: 'Info', color: 'text-blue-500' },
  { key: 'warn', label: 'Warn', color: 'text-yellow-500' },
  { key: 'error', label: 'Error', color: 'text-red-500' }
]

const LOG_TIERS = [
  { key: 'system', label: 'System', color: 'text-purple-500' },
  { key: 'application', label: 'App', color: 'text-green-500' },
  { key: 'build', label: 'Build', color: 'text-orange-500' },
  { key: 'deploy', label: 'Deploy', color: 'text-cyan-500' }
]

const TIME_PRESETS = [
  { label: 'Last Hour', hours: 1 },
  { label: 'Last 6 Hours', hours: 6 },
  { label: 'Last 24 Hours', hours: 24 },
  { label: 'Last 7 Days', hours: 24 * 7 },
  { label: 'Last 30 Days', hours: 24 * 30 }
]

export function AdvancedLogFilters({
  filters,
  onFiltersChange,
  translations
}: AdvancedLogFiltersProps) {
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Handle level toggle
  const handleLevelToggle = (level: string) => {
    const newLevels = filters.levels.includes(level)
      ? filters.levels.filter(l => l !== level)
      : [...filters.levels, level]
    onFiltersChange({ levels: newLevels })
  }

  // Handle tier toggle
  const handleTierToggle = (tier: string) => {
    const newTiers = filters.tiers.includes(tier)
      ? filters.tiers.filter(t => t !== tier)
      : [...filters.tiers, tier]
    onFiltersChange({ tiers: newTiers })
  }

  // Handle time preset
  const handleTimePreset = (hours: number) => {
    const endTime = new Date()
    const startTime = new Date(endTime.getTime() - (hours * 60 * 60 * 1000))

    onFiltersChange({
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString()
    })
  }

  // Handle custom time range
  const handleStartTimeChange = (value: string) => {
    onFiltersChange({ start_time: value || undefined })
  }

  const handleEndTimeChange = (value: string) => {
    onFiltersChange({ end_time: value || undefined })
  }

  // Clear all filters
  const clearFilters = () => {
    onFiltersChange({
      start_time: undefined,
      end_time: undefined,
      levels: ['debug', 'info', 'warn', 'error'],
      tiers: ['system', 'application', 'build', 'deploy'],
      search: undefined
    })
  }

  // Format datetime for input
  const formatDateTimeLocal = (isoString?: string) => {
    if (!isoString) return ''
    return new Date(isoString).toISOString().slice(0, 16)
  }

  // Check if any filters are active
  const hasActiveFilters = !!(
    filters.start_time ||
    filters.end_time ||
    filters.levels.length < 4 ||
    filters.tiers.length < 4 ||
    filters.search
  )

  return (
    <div className="space-y-3">
      {/* Filter toggle and clear */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Icon name="filter" className="w-4 h-4"  />
          Advanced Filters
          {hasActiveFilters && (
            <span className="w-2 h-2 bg-primary rounded-full" />
          )}
        </button>

        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Icon name="x" className="w-3 h-3"  />
            {translations.clearFilters}
          </button>
        )}
      </div>

      {showAdvanced && (
        <div className="space-y-4 p-3 bg-muted/20 rounded-md border border-border">
          {/* Time Range */}
          <div>
            <div className="text-xs font-medium text-foreground mb-2 flex items-center gap-1">
              <Icon name="calendar" className="w-3 h-3" />
              {translations.timeRange}
            </div>

            {/* Time presets */}
            <div className="flex flex-wrap gap-1 mb-2">
              {TIME_PRESETS.map(preset => (
                <button
                  key={preset.label}
                  onClick={() => handleTimePreset(preset.hours)}
                  className="px-2 py-1 text-xs bg-background border border-border rounded hover:bg-muted transition-colors"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Custom time range */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  {translations.startTime}
                </label>
                <input
                  type="datetime-local"
                  value={formatDateTimeLocal(filters.start_time)}
                  onChange={(e) => handleStartTimeChange(e.target.value)}
                  className="w-full px-2 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  {translations.endTime}
                </label>
                <input
                  type="datetime-local"
                  value={formatDateTimeLocal(filters.end_time)}
                  onChange={(e) => handleEndTimeChange(e.target.value)}
                  className="w-full px-2 py-1 text-xs bg-background border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
          </div>

          {/* Levels */}
          <div>
            <div className="text-xs font-medium text-foreground mb-2">
              {translations.levels}
            </div>
            <div className="flex flex-wrap gap-1">
              {LOG_LEVELS.map(level => {
                const isSelected = filters.levels.includes(level.key)
                return (
                  <button
                    key={level.key}
                    onClick={() => handleLevelToggle(level.key)}
                    className={`px-2 py-1 text-xs rounded border transition-colors ${
                      isSelected
                        ? `${level.color} border-current bg-current/10`
                        : 'text-muted-foreground border-border hover:text-foreground hover:border-foreground/20'
                    }`}
                  >
                    {level.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Tiers */}
          <div>
            <div className="text-xs font-medium text-foreground mb-2">
              {translations.tiers}
            </div>
            <div className="flex flex-wrap gap-1">
              {LOG_TIERS.map(tier => {
                const isSelected = filters.tiers.includes(tier.key)
                return (
                  <button
                    key={tier.key}
                    onClick={() => handleTierToggle(tier.key)}
                    className={`px-2 py-1 text-xs rounded border transition-colors ${
                      isSelected
                        ? `${tier.color} border-current bg-current/10`
                        : 'text-muted-foreground border-border hover:text-foreground hover:border-foreground/20'
                    }`}
                  >
                    {tier.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}