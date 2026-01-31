/**
 * Presence Indicator Component
 * Shows online users and their activity status
 */

'use client'

import React from 'react'
import { PresenceInfo } from '@/services/persistent-chat-client'
import { ConnectionStatus } from '@/hooks/use-persistent-live'
import { cn } from '@/lib/utils'

interface PresenceIndicatorProps {
  presenceInfo: PresenceInfo[]
  connectionStatus: ConnectionStatus
  className?: string
}

/**
 * Display user presence information and connection status
 */
export function PresenceIndicator({
  presenceInfo,
  connectionStatus,
  className
}: PresenceIndicatorProps) {
  // Filter active users (not offline)
  const activeUsers = presenceInfo.filter(user => user.status !== 'offline')
  const typingUsers = presenceInfo.filter(user => user.status === 'typing')

  if (activeUsers.length === 0 && typingUsers.length === 0) {
    return null
  }

  const getStatusColor = (status: PresenceInfo['status']) => {
    switch (status) {
      case 'online':
        return 'bg-success'
      case 'typing':
        return 'bg-primary animate-pulse'
      case 'away':
        return 'bg-warning'
      case 'offline':
        return 'bg-muted'
      default:
        return 'bg-muted'
    }
  }

  const getStatusLabel = (status: PresenceInfo['status']) => {
    switch (status) {
      case 'online':
        return 'Online'
      case 'typing':
        return 'Typing...'
      case 'away':
        return 'Away'
      case 'offline':
        return 'Offline'
      default:
        return 'Unknown'
    }
  }

  const formatUserName = (userId: string) => {
    // In real implementation, this would resolve user ID to actual name
    // For now, return abbreviated user ID
    return `User ${userId.slice(0, 8)}`
  }

  return (
    <div className={cn(
      'flex items-center justify-between border-b border-border px-4 py-2 text-sm',
      className
    )}>
      {/* Active Users */}
      <div className="flex items-center gap-3">
        {activeUsers.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Active:</span>
            <div className="flex items-center gap-1">
              {activeUsers.slice(0, 5).map((user) => (
                <div
                  key={user.user_id}
                  className="flex items-center gap-1 rounded-full bg-muted px-2 py-1"
                  title={`${formatUserName(user.user_id)} - ${getStatusLabel(user.status)}`}
                >
                  <div
                    className={cn(
                      'h-2 w-2 rounded-full',
                      getStatusColor(user.status)
                    )}
                  />
                  <span className="text-xs font-medium">
                    {formatUserName(user.user_id)}
                  </span>
                </div>
              ))}
              
              {activeUsers.length > 5 && (
                <span className="text-xs text-muted-foreground">
                  +{activeUsers.length - 5} more
                </span>
              )}
            </div>
          </div>
        )}

        {/* Typing Indicator */}
        {typingUsers.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <div className="flex gap-1">
                <div className="h-1 w-1 animate-bounce rounded-full bg-blue-500 [animation-delay:-0.3s]" />
                <div className="h-1 w-1 animate-bounce rounded-full bg-blue-500 [animation-delay:-0.15s]" />
                <div className="h-1 w-1 animate-bounce rounded-full bg-blue-500" />
              </div>
              <span className="text-xs text-blue-600 dark:text-blue-400">
                {typingUsers.length === 1
                  ? `${formatUserName(typingUsers[0].user_id)} is typing...`
                  : `${typingUsers.length} people are typing...`}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Connection Leader Badge */}
      {connectionStatus.isLeader && (
        <div className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
          <div className="h-2 w-2 rounded-full bg-primary" />
          <span>Leader</span>
        </div>
      )}

      {/* Connection Count */}
      {connectionStatus.activeConnections && connectionStatus.activeConnections > 1 && (
        <div className="text-xs text-muted-foreground">
          {connectionStatus.activeConnections} connections
        </div>
      )}
    </div>
  )
}