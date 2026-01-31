/**
 * Log Filters Component
 *
 * Tier and level filtering controls for log viewer
 * Part of shared workspace log viewer
 */

'use client'

interface LogFiltersProps {
  selectedLevels: Set<string>
  selectedTiers: Set<string>
  onLevelToggle: (level: string) => void
  onTierToggle: (tier: string) => void
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

export function LogFilters({
  selectedLevels,
  selectedTiers,
  onLevelToggle,
  onTierToggle
}: LogFiltersProps) {
  return (
    <div className="space-y-2">
      {/* Levels */}
      <div>
        <div className="text-xs font-medium text-muted-foreground mb-1">Levels</div>
        <div className="flex flex-wrap gap-1">
          {LOG_LEVELS.map(level => {
            const isSelected = selectedLevels.has(level.key)
            return (
              <button
                key={level.key}
                onClick={() => onLevelToggle(level.key)}
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
        <div className="text-xs font-medium text-muted-foreground mb-1">Sources</div>
        <div className="flex flex-wrap gap-1">
          {LOG_TIERS.map(tier => {
            const isSelected = selectedTiers.has(tier.key)
            return (
              <button
                key={tier.key}
                onClick={() => onTierToggle(tier.key)}
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
  )
}