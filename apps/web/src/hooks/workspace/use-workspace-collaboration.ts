/**
 * Workspace Collaboration Hook
 *
 * Provides real-time collaboration features for workspace
 * Part of Phase 3 client integration preparation
 */

'use client'

import { useEffect, useCallback, useRef } from 'react'
import {
  useWorkspaceCollaborationStore,
  UserPresence,
  CollaborativeCursor,
  WorkspaceActivity,
  WorkspaceNotification,
  selectConnectedUsers,
  selectActiveCursors,
  selectRecentActivities,
  selectActiveNotifications
} from '@/store/workspace-collaboration-store'
import { useWorkspacePermissionContext } from '@/components/workspace/shared/permission-gate'
import { logger } from '@/utils/logger'

interface UseWorkspaceCollaborationProps {
  projectId: string
  enabled?: boolean
  autoConnect?: boolean
}

interface UseWorkspaceCollaborationResult {
  // Connection state
  isConnected: boolean
  connectionId?: string
  reconnectAttempts: number

  // Current user
  currentUser?: UserPresence

  // Other users
  connectedUsers: UserPresence[]
  userCount: number

  // Collaborative features
  cursors: CollaborativeCursor[]
  recentActivities: WorkspaceActivity[]
  notifications: WorkspaceNotification[]

  // Actions
  connect: () => void
  disconnect: () => void
  updatePresence: (presence: Partial<UserPresence>) => void
  setUserActivity: (filePath?: string, cursorPosition?: { line: number; column: number }) => void
  updateCursor: (filePath: string, line: number, column: number) => void
  lockFile: (filePath: string, type: 'editing' | 'viewing') => void
  unlockFile: (filePath: string) => void
  isFileLocked: (filePath: string) => boolean
  addNotification: (notification: Omit<WorkspaceNotification, 'id' | 'timestamp'>) => void
  removeNotification: (id: string) => void

  // Settings
  settings: {
    showPresence: boolean
    showCursors: boolean
    showActivity: boolean
    enableLiveEditing: boolean
  }
  updateSettings: (settings: Partial<UseWorkspaceCollaborationResult['settings']>) => void
}

export function useWorkspaceCollaboration({
  projectId,
  enabled = true,
  autoConnect = true
}: UseWorkspaceCollaborationProps): UseWorkspaceCollaborationResult {
  const context = useWorkspacePermissionContext()
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Store selectors
  const isConnected = useWorkspaceCollaborationStore(state => state.isConnected)
  const connectionId = useWorkspaceCollaborationStore(state => state.connectionId)
  const reconnectAttempts = useWorkspaceCollaborationStore(state => state.reconnectAttempts)
  const currentUser = useWorkspaceCollaborationStore(state => state.currentUser)
  const connectedUsers = useWorkspaceCollaborationStore(selectConnectedUsers)
  const cursors = useWorkspaceCollaborationStore(state => selectActiveCursors(state))
  const recentActivities = useWorkspaceCollaborationStore(state => selectRecentActivities(state, 20))
  const notifications = useWorkspaceCollaborationStore(selectActiveNotifications)

  // Store actions
  const storeConnect = useWorkspaceCollaborationStore(state => state.connect)
  const storeDisconnect = useWorkspaceCollaborationStore(state => state.disconnect)
  const updateConnectionStatus = useWorkspaceCollaborationStore(state => state.updateConnectionStatus)
  const updateUserPresence = useWorkspaceCollaborationStore(state => state.updateUserPresence)
  const setUserActivity = useWorkspaceCollaborationStore(state => state.setUserActivity)
  const updateCursor = useWorkspaceCollaborationStore(state => state.updateCursor)
  const lockFile = useWorkspaceCollaborationStore(state => state.lockFile)
  const unlockFile = useWorkspaceCollaborationStore(state => state.unlockFile)
  const isFileLocked = useWorkspaceCollaborationStore(state => state.isFileLocked)
  const addNotification = useWorkspaceCollaborationStore(state => state.addNotification)
  const removeNotification = useWorkspaceCollaborationStore(state => state.removeNotification)
  const updateStoreSettings = useWorkspaceCollaborationStore(state => state.updateSettings)

  // Settings
  const settings = useWorkspaceCollaborationStore(state => ({
    showPresence: state.showPresence,
    showCursors: state.showCursors,
    showActivity: state.showActivity,
    enableLiveEditing: state.enableLiveEditing
  }))

  const connect = useCallback(() => {
    if (!enabled || isConnected) return

    logger.info('Initiating collaboration connection', {
      projectId,
      userId: context.userId,
      role: context.role
    }, 'workspace-collab')

    storeConnect(projectId, context.userId, {
      role: context.role,
      displayName: `${context.role === 'advisor' ? 'Advisor' : 'User'} ${context.userId.slice(-8)}`,
      // avatar: context.avatar // TODO: Get from user profile
    })

    // Start heartbeat
    startHeartbeat()

  }, [enabled, isConnected, projectId, context.userId, context.role, storeConnect])

  const disconnect = useCallback(() => {
    if (!isConnected) return

    logger.info('Disconnecting from collaboration', {
      projectId,
      userId: context.userId
    }, 'workspace-collab')

    // Stop heartbeat
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current)
      heartbeatRef.current = undefined
    }

    // Stop reconnect attempts
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = undefined
    }

    storeDisconnect()
  }, [isConnected, projectId, context.userId, storeDisconnect])

  const startHeartbeat = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current)
    }

    heartbeatRef.current = setInterval(() => {
      if (currentUser) {
        updateUserPresence({
          isActive: true,
          lastSeen: new Date()
        })

        // Simulate heartbeat API call
        // In a real implementation, this would ping a WebSocket or SSE endpoint
        logger.debug('workspace-collab', 'Heartbeat sent', {
          userId: currentUser.userId,
          projectId
        })
      }
    }, 30000) // 30 second heartbeat
  }, [currentUser, updateUserPresence, projectId])

  const attemptReconnect = useCallback(() => {
    if (reconnectAttempts >= 5) {
      logger.error('Max reconnect attempts reached', {
        projectId,
        attempts: reconnectAttempts
      }, 'workspace-collab')
      return
    }

    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000) // Exponential backoff, max 30s

    logger.info('Attempting reconnection', {
      projectId,
      attempt: reconnectAttempts + 1,
      delay
    }, 'workspace-collab')

    reconnectTimeoutRef.current = setTimeout(() => {
      updateConnectionStatus(false)
      connect()
    }, delay)
  }, [reconnectAttempts, projectId, connect, updateConnectionStatus])

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect && enabled && !isConnected) {
      connect()
    }

    return () => {
      disconnect()
    }
  }, [autoConnect, enabled, isConnected, connect, disconnect])

  // Handle connection loss
  useEffect(() => {
    if (enabled && !isConnected && reconnectAttempts > 0 && reconnectAttempts < 5) {
      attemptReconnect()
    }
  }, [enabled, isConnected, reconnectAttempts, attemptReconnect])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current)
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
    }
  }, [])

  // Collaboration action wrappers
  const handleUpdateCursor = useCallback((filePath: string, line: number, column: number) => {
    if (!isConnected || !currentUser || !settings.showCursors) return

    const cursor: CollaborativeCursor = {
      userId: currentUser.userId,
      filePath,
      line,
      column,
      color: getUserColor(currentUser.userId),
      label: currentUser.displayName,
      timestamp: new Date()
    }

    updateCursor(cursor)
  }, [isConnected, currentUser, settings.showCursors, updateCursor])

  const handleLockFile = useCallback((filePath: string, type: 'editing' | 'viewing') => {
    if (!isConnected || !currentUser) return

    lockFile(filePath, currentUser.userId, currentUser.displayName, type)
  }, [isConnected, currentUser, lockFile])

  const handleUnlockFile = useCallback((filePath: string) => {
    if (!isConnected || !currentUser) return

    unlockFile(filePath, currentUser.userId)
  }, [isConnected, currentUser, unlockFile])

  const checkFileLocked = useCallback((filePath: string): boolean => {
    const lock = isFileLocked(filePath)
    return !!lock && lock.userId !== currentUser?.userId
  }, [isFileLocked, currentUser?.userId])

  const updateSettings = useCallback((newSettings: Partial<UseWorkspaceCollaborationResult['settings']>) => {
    updateStoreSettings(newSettings)

    logger.info('Collaboration settings updated', {
      projectId,
      userId: context.userId,
      settings: newSettings
    }, 'workspace-collab')
  }, [updateStoreSettings, projectId, context.userId])

  return {
    // Connection state
    isConnected,
    connectionId,
    reconnectAttempts,

    // Current user
    currentUser,

    // Other users
    connectedUsers,
    userCount: connectedUsers.length + (currentUser ? 1 : 0),

    // Collaborative features
    cursors,
    recentActivities,
    notifications,

    // Actions
    connect,
    disconnect,
    updatePresence: updateUserPresence,
    setUserActivity,
    updateCursor: handleUpdateCursor,
    lockFile: handleLockFile,
    unlockFile: handleUnlockFile,
    isFileLocked: checkFileLocked,
    addNotification,
    removeNotification,

    // Settings
    settings,
    updateSettings
  }
}

// Helper function to generate consistent colors for users
function getUserColor(userId: string): string {
  const colors = [
    '#ef4444', // red
    '#f97316', // orange
    '#eab308', // yellow
    '#22c55e', // green
    '#06b6d4', // cyan
    '#3b82f6', // blue
    '#8b5cf6', // violet
    '#ec4899', // pink
  ]

  // Generate hash from userId
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }

  return colors[Math.abs(hash) % colors.length]
}