'use client'

import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { TemplateId, TemplateTier } from '@sheenapps/templates'

export interface TemplateCardProps {
  id: TemplateId
  name: string
  description: string
  emoji: string
  tier: TemplateTier
  category?: string
  onSelect: (templateId: TemplateId) => void
  disabled?: boolean
}

export function TemplateCard({
  id,
  name,
  description,
  emoji,
  tier,
  category,
  onSelect,
  disabled = false
}: TemplateCardProps) {
  const isPro = tier === 'pro'

  const handleClick = () => {
    if (!disabled) {
      onSelect(id)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault()
      onSelect(id)
    }
  }

  return (
    <Card
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={`${name}${isPro ? ' (PRO template)' : ''}`}
      aria-disabled={disabled}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cn(
        'relative cursor-pointer transition-all duration-200',
        'hover:shadow-lg hover:scale-[1.02] hover:border-primary/50',
        'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
        disabled && 'opacity-50 cursor-not-allowed hover:shadow-sm hover:scale-100'
      )}
    >
      {/* PRO Badge */}
      {isPro && (
        <div className="absolute top-3 end-3 z-10">
          <Badge
            variant="default"
            className="bg-gradient-to-r from-purple-500 to-pink-500 text-white border-0 shadow-md"
          >
            PRO
          </Badge>
        </div>
      )}

      <CardHeader className="space-y-3">
        {/* Emoji + Title Row */}
        <div className="flex items-start gap-3">
          {/* Emoji */}
          <div
            className="text-4xl flex-shrink-0"
            role="img"
            aria-label={`${name} icon`}
          >
            {emoji}
          </div>

          {/* Title + Category */}
          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg font-semibold leading-tight text-card-foreground mb-1">
              {name}
            </CardTitle>
            {category && (
              <p className="text-xs text-muted-foreground uppercase tracking-wide">
                {category}
              </p>
            )}
          </div>
        </div>

        {/* Description */}
        <CardDescription className="text-sm leading-relaxed text-muted-foreground">
          {description}
        </CardDescription>
      </CardHeader>
    </Card>
  )
}
