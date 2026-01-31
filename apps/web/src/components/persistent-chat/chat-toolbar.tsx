/**
 * Chat Toolbar Component
 * Basic toolbar for persistent chat with filter toggles and connection status
 * 
 * CRITICAL: Created to resolve import error in UnifiedChatContainer
 */

'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { useTranslations } from 'next-intl'
import type { ConnectionStatus } from '@/hooks/use-persistent-live'
type FilterType = 'all' | 'team' | 'ai' | 'builds'

interface ChatToolbarProps {
  projectId: string
  connectionStatus: ConnectionStatus
  onReconnect: () => void
  isReconnecting?: boolean  // Changed: specific to reconnection, not general loading
  currentFilter?: FilterType
  onFilterChange?: (filter: FilterType) => void
  className?: string
}

/**
 * Basic chat toolbar with connection status and filter options
 */
export function ChatToolbar({
  projectId,
  connectionStatus,
  onReconnect,
  isReconnecting = false,
  currentFilter = 'all',
  onFilterChange,
  className
}: ChatToolbarProps) {
  const t = useTranslations('builder.workspace.connection')
  const tFilters = useTranslations('builder.workspace.composer.filters')

  const getConnectionStatusColor = () => {
    switch (connectionStatus.status) {
      case 'connected':
        return 'text-success'
      case 'connecting':
        return 'text-warning'
      case 'disconnected':
      case 'error':
        return 'text-destructive'
      default:
        return 'text-muted-foreground'
    }
  }

  const getConnectionStatusText = () => {
    switch (connectionStatus.status) {
      case 'connected':
        return t('connected')
      case 'connecting':
        return t('connecting')
      case 'disconnected':
        return t('disconnected')
      case 'error':
        // Translate known error messages
        if (connectionStatus.error === 'Max reconnection attempts reached') {
          return t('maxReconnectionAttempts')
        }
        return connectionStatus.error || t('error')
      default:
        return t('unknown')
    }
  }

  const filters = [
    { key: 'all' as FilterType, label: tFilters('all') },
    { key: 'team' as FilterType, label: tFilters('team') },
    { key: 'ai' as FilterType, label: tFilters('ai') },
    { key: 'builds' as FilterType, label: tFilters('builds') }
  ]

  return (
    <div className={cn(
      'flex items-center justify-between px-4 py-2 border-b border-border bg-background',
      className
    )}>
      {/* Connection Status */}
      <div className="flex items-center gap-2">
        <div className={cn(
          'h-2 w-2 rounded-full',
          connectionStatus.status === 'connected' ? 'bg-green-500' :
          connectionStatus.status === 'connecting' ? 'bg-yellow-500 animate-pulse' :
          'bg-red-500'
        )} />
        <span className={cn('text-sm font-medium', getConnectionStatusColor())}>
          {getConnectionStatusText()}
        </span>
        {(connectionStatus.status === 'disconnected' || connectionStatus.status === 'error') && (
          <button
            onClick={() => {
              console.log('[ChatToolbar] Reconnect button clicked', { isReconnecting, connectionStatus })
              onReconnect()
            }}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isReconnecting}
          >
            {isReconnecting ? t('connecting') : t('reconnect')}
          </button>
        )}
      </div>

      {/* Message Filters */}
      {onFilterChange && (
        <div className="flex items-center gap-1">
          {filters.map(filter => (
            <button
              key={filter.key}
              onClick={() => onFilterChange(filter.key)}
              className={cn(
                'px-3 py-1 text-sm rounded-md transition-colors',
                currentFilter === filter.key
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}