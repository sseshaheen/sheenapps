'use client'

import { Button } from '@/components/ui/button'
import Icon, { type IconName } from '@/components/ui/icon'
import { useRouter, usePathname } from '@/i18n/routing'
import { useSearchParams } from 'next/navigation'

/**
 * Empty State CTA System
 *
 * Config-driven empty states that answer:
 * 1. What is this? (title + description)
 * 2. What should I do next? (1-3 ranked CTAs)
 *
 * CTAs route to the Infrastructure drawer with panel context,
 * so empty states feel like guidance, not dead-ends.
 */

// Panel types that exist in the Infrastructure drawer
export type InfraPanel =
  | 'database'
  | 'hosting'
  | 'cms'
  | 'auth'
  | 'api-keys'
  | 'phase3'

export type EmptyStateCtaKind =
  | 'open_infra'   // Opens infra drawer with specific panel
  | 'navigate'     // Navigates to a URL
  | 'external'     // Opens external URL in new tab

export interface EmptyStateCta {
  id: string
  label: string
  kind: EmptyStateCtaKind
  icon?: IconName
  tone?: 'primary' | 'secondary' | 'ghost'
  // Action data:
  infraPanel?: InfraPanel
  href?: string
  disabled?: boolean
  disabledReason?: string
}

export type EmptyStateKey =
  | 'no_leads'
  | 'no_orders'
  | 'no_analytics'
  | 'not_deployed'

interface EmptyStateConfig {
  title: string
  description: string
  icon: IconName
  ctas: EmptyStateCta[]
}

/**
 * Get CTAs for a given empty state
 * This is the "product decision layer" - edit this to change what actions appear
 */
export function getEmptyStateCtas(
  key: EmptyStateKey,
  context?: {
    hasStripe?: boolean
    hasForm?: boolean
    isDeployed?: boolean
  }
): EmptyStateCta[] {
  switch (key) {
    case 'no_leads':
      return [
        {
          id: 'add-form',
          label: 'Add a lead form',
          kind: 'open_infra',
          icon: 'file-text',
          tone: 'primary',
          infraPanel: 'cms'
        },
        {
          id: 'connect-email',
          label: 'Set up email notifications',
          kind: 'navigate',
          icon: 'mail',
          tone: 'secondary',
          href: '?tab=notifications'
        }
      ]

    case 'no_orders':
      return [
        {
          id: 'connect-payments',
          label: context?.hasStripe ? 'Review payments setup' : 'Connect payments',
          kind: 'open_infra',
          icon: 'credit-card',
          tone: 'primary',
          infraPanel: 'phase3'
        },
        {
          id: 'add-checkout',
          label: 'Add checkout to your site',
          kind: 'open_infra',
          icon: 'package',
          tone: 'secondary',
          infraPanel: 'cms'
        }
      ]

    case 'no_analytics':
      return [
        {
          id: 'enable-analytics',
          label: 'Enable analytics',
          kind: 'open_infra',
          icon: 'bar-chart',
          tone: 'primary',
          infraPanel: 'phase3'
        }
      ]

    case 'not_deployed':
      return [
        {
          id: 'go-to-builder',
          label: 'Go to Builder',
          kind: 'navigate',
          icon: 'code',
          tone: 'primary',
          href: '/builder'
        }
      ]

    default:
      return []
  }
}

/**
 * Hook to open the infrastructure drawer with a specific panel
 */
export function useOpenInfraDrawer() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  return (panel?: InfraPanel) => {
    const current = new URLSearchParams(Array.from(searchParams.entries()))
    current.set('infra', panel || 'open')
    const search = current.toString()
    router.push(`${pathname}?${search}`, { scroll: false })
  }
}

interface EmptyStateProps {
  stateKey: EmptyStateKey
  title: string
  description: string
  icon?: IconName
  context?: {
    hasStripe?: boolean
    hasForm?: boolean
    isDeployed?: boolean
  }
  className?: string
}

/**
 * Reusable EmptyState component with CTAs
 *
 * Usage:
 * <EmptyState
 *   stateKey="no_leads"
 *   title={t('leads.empty')}
 *   description={t('leads.emptyHint')}
 *   icon="users"
 * />
 */
export function EmptyState({
  stateKey,
  title,
  description,
  icon = 'archive',
  context,
  className = ''
}: EmptyStateProps) {
  const router = useRouter()
  const openInfra = useOpenInfraDrawer()
  const ctas = getEmptyStateCtas(stateKey, context)

  const handleCtaClick = (cta: EmptyStateCta) => {
    if (cta.disabled) return

    switch (cta.kind) {
      case 'open_infra':
        openInfra(cta.infraPanel)
        break
      case 'navigate':
        if (cta.href) router.push(cta.href)
        break
      case 'external':
        if (cta.href) window.open(cta.href, '_blank', 'noopener,noreferrer')
        break
    }
  }

  return (
    <div className={`rounded-xl border border-dashed p-6 text-center ${className}`}>
      <div className="flex flex-col items-center space-y-4">
        {/* Icon */}
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
          <Icon name={icon} className="w-6 h-6 text-muted-foreground" />
        </div>

        {/* Text */}
        <div className="space-y-1">
          <h3 className="font-semibold text-foreground">{title}</h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            {description}
          </p>
        </div>

        {/* CTAs */}
        {ctas.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
            {ctas.map((cta) => (
              <Button
                key={cta.id}
                variant={cta.tone === 'primary' ? 'default' : cta.tone === 'ghost' ? 'ghost' : 'outline'}
                size="sm"
                onClick={() => handleCtaClick(cta)}
                disabled={cta.disabled}
                title={cta.disabledReason}
                className="gap-2 min-h-[44px] sm:min-h-[32px]"
              >
                {cta.icon && <Icon name={cta.icon} className="w-4 h-4" />}
                {cta.label}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
