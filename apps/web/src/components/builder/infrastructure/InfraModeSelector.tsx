'use client'

import type { KeyboardEvent } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import Icon from '@/components/ui/icon'

export type InfraMode = 'easy' | 'pro'

interface InfraModeSelectorProps {
  value: InfraMode
  onChange: (mode: InfraMode) => void
  disabled?: boolean
  translations: {
    title: string
    subtitle: string
    easyMode: {
      title: string
      badge: string
      description: string
      features: string[]
      cta: string
    }
    proMode: {
      title: string
      description: string
      features: string[]
      cta: string
    }
  }
}

/**
 * Infrastructure Mode Selector
 *
 * Allows users to choose between Easy Mode (managed) and Pro Mode (self-hosted)
 * during project creation.
 *
 * Easy Mode: Managed database, hosting, and content management
 * Pro Mode: User's own Supabase, Vercel, Sanity, GitHub
 *
 * EXPERT FIX ROUND 4: Added keyboard accessibility (role=radio, aria-checked, onKeyDown)
 */
export function InfraModeSelector({
  value,
  onChange,
  disabled = false,
  translations
}: InfraModeSelectorProps) {
  // Keyboard handler for Enter/Space to select mode
  // EXPERT FIX ROUND 4: Proper KeyboardEvent type import
  const handleKeyDown = (mode: InfraMode) => (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onChange(mode)
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="text-center">
        <h3 id="infra-mode-title" className="text-lg font-semibold text-foreground mb-2">
          {translations.title}
        </h3>
        <p className="text-sm text-muted-foreground">
          {translations.subtitle}
        </p>
      </div>

      {/* Mode Cards - Radio Group */}
      <div
        className="grid grid-cols-1 md:grid-cols-2 gap-4"
        role="radiogroup"
        aria-labelledby="infra-mode-title"
      >
        {/* Easy Mode Card */}
        <Card
          className={`cursor-pointer transition-all border-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
            value === 'easy'
              ? 'border-primary bg-primary/5 shadow-md'
              : 'border-border hover:border-primary/50 hover:shadow-sm'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          onClick={() => !disabled && onChange('easy')}
          onKeyDown={handleKeyDown('easy')}
          role="radio"
          aria-checked={value === 'easy'}
          aria-label={translations.easyMode.title}
          tabIndex={disabled ? -1 : 0}
        >
          <CardContent className="p-6">
            {/* Header with Badge */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <Icon
                  name={value === 'easy' ? 'check-circle' : 'circle'}
                  className={`w-5 h-5 flex-shrink-0 ${
                    value === 'easy' ? 'text-primary' : 'text-muted-foreground'
                  }`}
                />
                <h4 className="font-semibold text-foreground">
                  {translations.easyMode.title}
                </h4>
              </div>
              <span className="px-2 py-1 text-xs font-medium bg-primary/10 text-primary rounded-full">
                {translations.easyMode.badge}
              </span>
            </div>

            {/* Description */}
            <p className="text-sm text-muted-foreground mb-4">
              {translations.easyMode.description}
            </p>

            {/* Features List */}
            <ul className="space-y-2 mb-4">
              {translations.easyMode.features.map((feature, index) => (
                <li key={index} className="flex items-start gap-2 text-sm">
                  <Icon name="check" className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                  <span className="text-foreground">{feature}</span>
                </li>
              ))}
            </ul>

            {/* CTA (visual only, card itself is clickable) */}
            <div
              className={`text-sm font-medium text-center py-2 rounded-md transition-colors ${
                value === 'easy'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {value === 'easy' ? '✓ ' + translations.easyMode.cta : translations.easyMode.cta}
            </div>
          </CardContent>
        </Card>

        {/* Pro Mode Card */}
        <Card
          className={`cursor-pointer transition-all border-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
            value === 'pro'
              ? 'border-primary bg-primary/5 shadow-md'
              : 'border-border hover:border-primary/50 hover:shadow-sm'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          onClick={() => !disabled && onChange('pro')}
          onKeyDown={handleKeyDown('pro')}
          role="radio"
          aria-checked={value === 'pro'}
          aria-label={translations.proMode.title}
          tabIndex={disabled ? -1 : 0}
        >
          <CardContent className="p-6">
            {/* Header */}
            <div className="flex items-center gap-2 mb-3">
              <Icon
                name={value === 'pro' ? 'check-circle' : 'circle'}
                className={`w-5 h-5 flex-shrink-0 ${
                  value === 'pro' ? 'text-primary' : 'text-muted-foreground'
                }`}
              />
              <h4 className="font-semibold text-foreground">
                {translations.proMode.title}
              </h4>
            </div>

            {/* Description */}
            <p className="text-sm text-muted-foreground mb-4">
              {translations.proMode.description}
            </p>

            {/* Features List */}
            <ul className="space-y-2 mb-4">
              {translations.proMode.features.map((feature, index) => (
                <li key={index} className="flex items-start gap-2 text-sm">
                  <Icon name="check" className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <span className="text-foreground">{feature}</span>
                </li>
              ))}
            </ul>

            {/* CTA (visual only, card itself is clickable) */}
            <div
              className={`text-sm font-medium text-center py-2 rounded-md transition-colors ${
                value === 'pro'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {value === 'pro' ? '✓ ' + translations.proMode.cta : translations.proMode.cta}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
