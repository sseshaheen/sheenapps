/**
 * Integration Status Bar Component
 *
 *
 *
 * Displays integration status for all 4 providers (GitHub, Vercel, Sanity, Supabase)
 * in the workspace header. Follows expert UI patterns with accessibility compliance.
 *
 * Layout: [🗃️ DB] [📦 Git] [🚀 Deploy] [📝 CMS]
 * Features: Color-coded status dots, tooltips, click for quick actions
 */

'use client'

import { ConnectSanity } from '@/components/integrations/connect-sanity'
import { ConnectSupabase } from '@/components/integrations/connect-supabase'
import { ConnectVercel } from '@/components/integrations/connect-vercel'
import { Button } from '@/components/ui/button'
import Icon from '@/components/ui/icon'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useFeatureFlags } from '@/config/feature-flags'
import { useIntegrationActions, useIntegrationStatus } from '@/hooks/use-integration-status'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store'
import type { IntegrationKey, IntegrationStatusItem } from '@/types/integrationStatus'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

interface IntegrationStatusBarProps {
  projectId: string
  compact?: boolean
  className?: string
}

// Integration configuration for UI display (icons and emojis only, labels are translated)
const INTEGRATION_ICONS = {
  supabase: { icon: 'database', emoji: '🗃️' },
  github: { icon: 'git-branch', emoji: '📦' },
  vercel: { icon: 'zap', emoji: '🚀' },
  sanity: { icon: 'file-text', emoji: '📝' }
} as const

// Label keys for translations
const INTEGRATION_LABEL_KEYS = {
  supabase: 'database',
  github: 'git',
  vercel: 'deploy',
  sanity: 'cms'
} as const

// Status color mapping following expert patterns
const STATUS_COLORS = {
  connected: 'bg-green-500',
  warning: 'bg-amber-500',
  error: 'bg-red-500',
  disconnected: 'bg-gray-400'
} as const

function IntegrationStatusDot({ status }: { status: keyof typeof STATUS_COLORS }) {
  return (
    <div
      className={cn(
        'w-2 h-2 rounded-full flex-shrink-0',
        STATUS_COLORS[status]
      )}
      aria-hidden="true"
    />
  )
}

// Integrations that always open modals regardless of status (expert review fix)
const MODAL_INTEGRATION_KEYS = new Set<IntegrationKey>(['supabase', 'vercel', 'sanity'])

function IntegrationStatusItemComponent({
  integration,
  iconConfig,
  label,
  onClick,
  compact = false,
  t
}: {
  integration: IntegrationStatusItem
  iconConfig: { icon: string; emoji: string }
  label: string
  onClick: () => void
  compact?: boolean
  t: (key: string, values?: Record<string, string>) => string
}) {
  const hasActions = integration.actions && integration.actions.length > 0
  const canPerformActions = integration.actions?.some(action => action.can) || false
  // Modal integrations should always be clickable so users can open settings (expert review fix)
  const isModalIntegration = MODAL_INTEGRATION_KEYS.has(integration.key)
  const isClickable = isModalIntegration || integration.status === 'disconnected' || hasActions || canPerformActions

  // Build tooltip content following expert verb-first patterns
  const getTooltipContent = () => {
    if (integration.status === 'disconnected') {
      return `${t('notConnected')} • ${t('connect')}`
    }

    if (integration.problem) {
      return `${integration.problem.hint || t('error')} • ${integration.problem.code === 'oauth_revoked' ? t('reconnect') : t('checkStatus')}`
    }

    if (integration.summary) {
      return integration.summary
    }

    // Fallback status messages
    switch (integration.status) {
      case 'connected':
        return `${label} ${t('connected')} • ${t('viewDetails')}`
      case 'warning':
        return `${label} ${t('needsAttention')} • ${t('viewDetails')}`
      case 'error':
        return `${label} ${t('error')} • ${t('viewDetails')}`
      default:
        return `${label}`
    }
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClick}
            disabled={!isClickable}
            aria-pressed={integration.status === 'connected'}
            aria-describedby={`${integration.key}-status-description`}
            className={cn(
              'flex items-center gap-1.5 h-8 px-2 hover:bg-gray-700/50 transition-colors',
              'focus:ring-2 focus:ring-blue-500 focus:outline-none',
              compact && 'px-1.5 gap-1'
            )}
          >
            <Icon
              name={iconConfig.icon as any}
              className={cn(
                'flex-shrink-0 text-gray-300',
                compact ? 'w-3.5 h-3.5' : 'w-4 h-4',
                integration.status === 'disconnected' && 'opacity-50'
              )}
            />
            <IntegrationStatusDot status={integration.status} />
            {!compact && (
              <span className="text-xs text-gray-300 font-medium">
                {label}
              </span>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          className="max-w-xs text-sm"
          id={`${integration.key}-status-description`}
        >
          <div className="space-y-1">
            <div className="font-medium">{getTooltipContent()}</div>
            {integration.stale && (
              <div className="text-xs text-amber-300">
                {t('statusMayBeOutdated')}
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export function IntegrationStatusBar({
  projectId,
  compact = false,
  className
}: IntegrationStatusBarProps) {
  const { user } = useAuthStore()
  const featureFlags = useFeatureFlags()
  const [activeIntegration, setActiveIntegration] = useState<IntegrationKey | null>(null)
  const [openModal, setOpenModal] = useState<IntegrationKey | null>(null)
  const t = useTranslations('builder.workspace.integrations')
  const userId = user?.id ?? ''

  const { data: statusData, isLoading, isError } = useIntegrationStatus(projectId, userId)
  const { executeAction, isExecuting } = useIntegrationActions(projectId, userId)

  // Feature flag check
  if (!featureFlags.ENABLE_INTEGRATION_STATUS_BAR || !userId) {
    return null
  }

  // Get translated label for an integration
  const getLabel = (key: IntegrationKey): string => {
    return t(INTEGRATION_LABEL_KEYS[key])
  }

  // Handle integration click for quick actions
  const handleIntegrationClick = (integration: IntegrationStatusItem) => {
    setActiveIntegration(integration.key)

    // Open modal for integrations with connection components
    if (['supabase', 'vercel', 'sanity'].includes(integration.key)) {
      setOpenModal(integration.key)
      return
    }

    // For GitHub and others, try to execute primary action
    const primaryAction = integration.actions?.find(action =>
      action.can && ['connect', 'deploy', 'push', 'sync'].includes(action.id)
    )

    if (primaryAction) {
      executeAction(integration.key, primaryAction.id)
    }
  }

  // Show loading state
  if (isLoading) {
    return (
      <div className={cn('flex items-center gap-2', className)} role="toolbar" aria-label="Integration status loading">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-1.5 h-8 px-2">
            <div className="w-4 h-4 bg-gray-600 rounded animate-pulse" />
            <div className="w-2 h-2 bg-gray-600 rounded-full animate-pulse" />
            {!compact && <div className="w-8 h-3 bg-gray-600 rounded animate-pulse" />}
          </div>
        ))}
      </div>
    )
  }

  // Show error state
  if (isError || !statusData) {
    return (
      <div className={cn('flex items-center gap-2', className)} role="toolbar" aria-label="Integration status error">
        <div className="text-xs text-red-400 px-2 py-1">
          {t('statusUnavailable')}
        </div>
      </div>
    )
  }

  // Ensure we always show all 4 integrations for stable UI layout
  const integrationOrder: IntegrationKey[] = ['supabase', 'github', 'vercel', 'sanity']
  const integrationMap = new Map(statusData.items.map(item => [item.key, item]))

  return (
    <div
      className={cn('flex items-center gap-1', className)}
      role="toolbar"
      aria-label="Integration status"
    >
      {integrationOrder.map(key => {
        const integration = integrationMap.get(key)
        const iconConfig = INTEGRATION_ICONS[key]
        const label = getLabel(key)

        // If integration data is missing, show disconnected state
        if (!integration || !integration.visible) {
          return (
            <IntegrationStatusItemComponent
              key={key}
              integration={{
                key,
                configured: false,
                visible: true,
                status: 'disconnected',
                updatedAt: new Date().toISOString()
              }}
              iconConfig={iconConfig}
              label={label}
              onClick={() => handleIntegrationClick({ key, configured: false, visible: true, status: 'disconnected', updatedAt: new Date().toISOString() })}
              compact={compact}
              t={t}
            />
          )
        }

        return (
          <IntegrationStatusItemComponent
            key={key}
            integration={integration}
            iconConfig={iconConfig}
            label={label}
            onClick={() => handleIntegrationClick(integration)}
            compact={compact}
            t={t}
          />
        )
      })}

      {/* Overall status indicator for accessibility */}
      <span className="sr-only">
        {t('overallStatus', { status: t(statusData.overall) })}
      </span>

      {/* Executing state indicator */}
      {isExecuting && (
        <div className="flex items-center gap-1 ml-2 text-xs text-amber-400">
          <div className="w-3 h-3 border border-amber-400 border-t-transparent rounded-full animate-spin" />
          <span className="sr-only">{t('executingAction')}</span>
        </div>
      )}

      {/* Supabase Database Modal */}
      <Sheet open={openModal === 'supabase'} onOpenChange={(open) => !open && setOpenModal(null)}>
        <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Icon name="database" className="h-5 w-5 text-green-600" />
              {t('databaseIntegration')}
            </SheetTitle>
            <SheetDescription>
              {t('configureDatabaseConnection')}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            <ConnectSupabase
              projectId={projectId}
              className="border-0 shadow-none bg-transparent p-0"
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Vercel Deploy Modal */}
      <Sheet open={openModal === 'vercel'} onOpenChange={(open) => !open && setOpenModal(null)}>
        <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Icon name="zap" className="h-5 w-5 text-black dark:text-white" />
              {t('deployIntegration')}
            </SheetTitle>
            <SheetDescription>
              {t('configureDeployConnection')}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            <ConnectVercel
              projectId={projectId}
              className="border-0 shadow-none bg-transparent p-0"
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Sanity CMS Modal */}
      <Sheet open={openModal === 'sanity'} onOpenChange={(open) => !open && setOpenModal(null)}>
        <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Icon name="file-text" className="h-5 w-5 text-red-500" />
              {t('cmsIntegration')}
            </SheetTitle>
            <SheetDescription>
              {t('configureCmsConnection')}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            <ConnectSanity
              projectId={projectId}
              className="border-0 shadow-none bg-transparent p-0"
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
