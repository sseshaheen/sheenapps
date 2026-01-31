/**
 * Presence Indicator Component
 *
 * Shows connected users and their activity status
 * Part of Phase 3 client integration preparation
 */

'use client'

import { useState } from 'react'
import { UserPresence } from '@/store/workspace-collaboration-store'
import { useWorkspaceCollaboration } from '@/hooks/workspace/use-workspace-collaboration'
import { Icon } from '@/components/ui/icon'

interface PresenceIndicatorProps {
  projectId: string
  className?: string
  showDetails?: boolean
  maxVisible?: number
}

export function PresenceIndicator({
  projectId,
  className = '',
  showDetails = true,
  maxVisible = 5
}: PresenceIndicatorProps) {
  const [showDropdown, setShowDropdown] = useState(false)
  const {
    isConnected,
    currentUser,
    connectedUsers,
    userCount,
    settings
  } = useWorkspaceCollaboration({ projectId })

  if (!isConnected || !settings.showPresence) {
    return null
  }

  const allUsers = currentUser ? [currentUser, ...connectedUsers] : connectedUsers
  const visibleUsers = allUsers.slice(0, maxVisible)
  const hiddenCount = Math.max(0, allUsers.length - maxVisible)

  const formatTimeAgo = (date: Date) => {
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffSeconds = Math.floor(diffMs / 1000)
    const diffMinutes = Math.floor(diffSeconds / 60)
    const diffHours = Math.floor(diffMinutes / 60)

    if (diffSeconds < 60) return 'Just now'
    if (diffMinutes < 60) return `${diffMinutes}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return date.toLocaleDateString()
  }

  const getUserStatusIcon = (user: UserPresence) => {
    if (!user.isActive) {
      return <Icon name="clock" className="w-3 h-3 text-gray-400"  />
    }

    if (user.currentFile) {
      // Check if user has edit permissions
      const canEdit = user.role === 'client' || user.role === 'project_owner'
      return canEdit ? (
        <Icon name="pencil" className="w-3 h-3 text-blue-500"  />
      ) : (
        <Icon name="eye" className="w-3 h-3 text-green-500"  />
      )
    }

    return null
  }

  const getUserInitials = (displayName: string) => {
    return displayName
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const getUserColor = (userId: string) => {
    const colors = [
      'bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-green-500',
      'bg-cyan-500', 'bg-blue-500', 'bg-violet-500', 'bg-pink-500'
    ]

    let hash = 0
    for (let i = 0; i < userId.length; i++) {
      const char = userId.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash
    }

    return colors[Math.abs(hash) % colors.length]
  }

  return (
    <div className={`relative ${className}`}>
      {/* Avatar stack */}
      <div className="flex items-center">
        {/* Connected users count */}
        <div className="flex items-center gap-1 mr-2">
          <Icon name="users" className="w-4 h-4 text-muted-foreground"  />
          <span className="text-sm text-muted-foreground">{userCount}</span>
        </div>

        {/* User avatars */}
        <div className="flex -space-x-2">
          {visibleUsers.map((user, index) => (
            <div
              key={user.userId}
              className="relative group"
              style={{ zIndex: visibleUsers.length - index }}
            >
              {/* Avatar */}
              <div
                className={`
                  w-8 h-8 rounded-full border-2 border-background flex items-center justify-center text-xs font-medium text-white
                  ${getUserColor(user.userId)}
                  ${user.isActive ? 'ring-2 ring-green-400 ring-offset-1 ring-offset-background' : 'opacity-60'}
                  ${user.userId === currentUser?.userId ? 'ring-blue-400' : ''}
                `}
                title={`${user.displayName} (${user.role})`}
              >
                {user.avatar ? (
                  <img
                    src={user.avatar}
                    alt={user.displayName}
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  getUserInitials(user.displayName)
                )}
              </div>

              {/* Status indicator */}
              <div className="absolute -bottom-1 -right-1 bg-background rounded-full p-0.5">
                {getUserStatusIcon(user)}
              </div>

              {/* Hover tooltip */}
              {showDetails && (
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                  <div className="font-medium">{user.displayName}</div>
                  <div className="text-gray-300 capitalize">{user.role}</div>
                  {user.currentFile && (
                    <div className="text-gray-400 truncate max-w-40">
                      {user.currentFile.split('/').pop()}
                    </div>
                  )}
                  <div className="text-gray-400">
                    {formatTimeAgo(user.lastSeen)}
                  </div>
                  {/* Tooltip arrow */}
                  <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                </div>
              )}
            </div>
          ))}

          {/* Hidden users indicator */}
          {hiddenCount > 0 && (
            <div
              className="w-8 h-8 rounded-full border-2 border-background bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground cursor-pointer hover:bg-muted/80"
              onClick={() => setShowDropdown(!showDropdown)}
              title={`${hiddenCount} more user${hiddenCount === 1 ? '' : 's'}`}
            >
              +{hiddenCount}
            </div>
          )}
        </div>
      </div>

      {/* Detailed dropdown */}
      {showDropdown && allUsers.length > maxVisible && (
        <div className="absolute top-full right-0 mt-2 w-64 bg-background border border-border rounded-lg shadow-lg z-50">
          <div className="p-3">
            <h4 className="text-sm font-medium text-foreground mb-2">
              Connected Users ({userCount})
            </h4>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {allUsers.map((user) => (
                <div
                  key={user.userId}
                  className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50"
                >
                  {/* Avatar */}
                  <div
                    className={`
                      w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium text-white flex-shrink-0
                      ${getUserColor(user.userId)}
                      ${user.isActive ? 'ring-1 ring-green-400' : 'opacity-60'}
                      ${user.userId === currentUser?.userId ? 'ring-blue-400' : ''}
                    `}
                  >
                    {user.avatar ? (
                      <img
                        src={user.avatar}
                        alt={user.displayName}
                        className="w-full h-full rounded-full object-cover"
                      />
                    ) : (
                      getUserInitials(user.displayName)
                    )}
                  </div>

                  {/* User info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground truncate">
                        {user.displayName}
                        {user.userId === currentUser?.userId && ' (You)'}
                      </span>
                      {getUserStatusIcon(user)}
                    </div>
                    <div className="text-xs text-muted-foreground capitalize">
                      {user.role}
                    </div>
                    {user.currentFile && (
                      <div className="text-xs text-muted-foreground truncate">
                        Viewing: {user.currentFile.split('/').pop()}
                      </div>
                    )}
                  </div>

                  {/* Last seen */}
                  <div className="text-xs text-muted-foreground flex-shrink-0">
                    {formatTimeAgo(user.lastSeen)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Close button */}
          <div className="border-t border-border p-2">
            <button
              onClick={() => setShowDropdown(false)}
              className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Click outside to close */}
      {showDropdown && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowDropdown(false)}
        />
      )}
    </div>
  )
}