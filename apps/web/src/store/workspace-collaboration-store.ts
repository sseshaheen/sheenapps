/**
 * Workspace Collaboration Store
 *
 * Manages collaborative state for workspace sessions
 * Part of Phase 3 client integration preparation
 */

'use client'

import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { logger } from '@/utils/logger'

// User presence information
export interface UserPresence {
  userId: string
  role: 'advisor' | 'client' | 'project_owner'
  displayName: string
  avatar?: string
  isActive: boolean
  lastSeen: Date
  currentFile?: string
  cursorPosition?: {
    line: number
    column: number
  }
  activeSession?: string
}

// Collaborative cursor information
export interface CollaborativeCursor {
  userId: string
  filePath: string
  line: number
  column: number
  color: string
  label: string
  timestamp: Date
}

// File lock information
export interface FileLock {
  filePath: string
  userId: string
  userDisplayName: string
  lockedAt: Date
  expiresAt: Date
  type: 'editing' | 'viewing'
}

// Workspace activity event
export interface WorkspaceActivity {
  id: string
  userId: string
  userDisplayName: string
  type: 'file_opened' | 'file_edited' | 'file_saved' | 'session_started' | 'session_ended'
  filePath?: string
  timestamp: Date
  metadata?: Record<string, any>
}

// Real-time notification
export interface WorkspaceNotification {
  id: string
  type: 'info' | 'warning' | 'error' | 'success'
  title: string
  message: string
  userId?: string // If targeted to specific user
  timestamp: Date
  expiresAt?: Date
  actions?: {
    label: string
    action: () => void
  }[]
}

interface WorkspaceCollaborationState {
  // Connection state
  isConnected: boolean
  connectionId?: string
  reconnectAttempts: number

  // Current user presence
  currentUser?: UserPresence

  // Other users in workspace
  connectedUsers: Map<string, UserPresence>

  // Collaborative features
  cursors: Map<string, CollaborativeCursor>
  fileLocks: Map<string, FileLock>

  // Activity feed
  activities: WorkspaceActivity[]
  maxActivities: number

  // Notifications
  notifications: WorkspaceNotification[]

  // Settings
  showPresence: boolean
  showCursors: boolean
  showActivity: boolean
  enableLiveEditing: boolean
}

interface WorkspaceCollaborationActions {
  // Connection management
  connect: (projectId: string, userId: string, userInfo: Omit<UserPresence, 'userId' | 'isActive' | 'lastSeen'>) => void
  disconnect: () => void
  updateConnectionStatus: (connected: boolean) => void

  // User presence
  updateUserPresence: (presence: Partial<UserPresence>) => void
  setUserActivity: (filePath?: string, cursorPosition?: { line: number; column: number }) => void
  addConnectedUser: (user: UserPresence) => void
  removeConnectedUser: (userId: string) => void
  updateConnectedUser: (userId: string, updates: Partial<UserPresence>) => void

  // Collaborative cursors
  updateCursor: (cursor: CollaborativeCursor) => void
  removeCursor: (userId: string, filePath?: string) => void
  clearCursors: (filePath?: string) => void

  // File locking
  lockFile: (filePath: string, userId: string, userDisplayName: string, type: 'editing' | 'viewing', duration?: number) => void
  unlockFile: (filePath: string, userId?: string) => void
  isFileLocked: (filePath: string) => FileLock | null

  // Activity tracking
  addActivity: (activity: Omit<WorkspaceActivity, 'id' | 'timestamp'>) => void
  clearActivities: () => void

  // Notifications
  addNotification: (notification: Omit<WorkspaceNotification, 'id' | 'timestamp'>) => void
  removeNotification: (id: string) => void
  clearExpiredNotifications: () => void
  clearAllNotifications: () => void

  // Settings
  updateSettings: (settings: Partial<Pick<WorkspaceCollaborationState, 'showPresence' | 'showCursors' | 'showActivity' | 'enableLiveEditing'>>) => void

  // Utilities
  reset: () => void
}

type WorkspaceCollaborationStore = WorkspaceCollaborationState & WorkspaceCollaborationActions

const initialState: WorkspaceCollaborationState = {
  isConnected: false,
  reconnectAttempts: 0,
  connectedUsers: new Map(),
  cursors: new Map(),
  fileLocks: new Map(),
  activities: [],
  maxActivities: 100,
  notifications: [],
  showPresence: true,
  showCursors: true,
  showActivity: true,
  enableLiveEditing: false // Disabled by default for advisors
}

export const useWorkspaceCollaborationStore = create<WorkspaceCollaborationStore>()(
  subscribeWithSelector((set, get) => ({
    ...initialState,

    // Connection management
    connect: (projectId, userId, userInfo) => {
      logger.info('Connecting to collaborative workspace', {
        projectId,
        userId,
        role: userInfo.role
      }, 'workspace-collab')

      const currentUser: UserPresence = {
        ...userInfo,
        userId,
        isActive: true,
        lastSeen: new Date()
      }

      set({
        isConnected: true,
        currentUser,
        reconnectAttempts: 0,
        connectionId: `${projectId}-${userId}-${Date.now()}`
      })

      // Add connection activity
      get().addActivity({
        userId,
        userDisplayName: userInfo.displayName,
        type: 'session_started'
      })
    },

    disconnect: () => {
      const { currentUser } = get()

      if (currentUser) {
        logger.info('Disconnecting from collaborative workspace', {
          userId: currentUser.userId
        }, 'workspace-collab')

        // Add disconnection activity
        get().addActivity({
          userId: currentUser.userId,
          userDisplayName: currentUser.displayName,
          type: 'session_ended'
        })
      }

      set({
        isConnected: false,
        currentUser: undefined,
        connectionId: undefined,
        connectedUsers: new Map(),
        cursors: new Map(),
        fileLocks: new Map()
      })
    },

    updateConnectionStatus: (connected) => {
      set(state => ({
        isConnected: connected,
        reconnectAttempts: connected ? 0 : state.reconnectAttempts + 1
      }))
    },

    // User presence
    updateUserPresence: (presence) => {
      set(state => ({
        currentUser: state.currentUser ? {
          ...state.currentUser,
          ...presence,
          lastSeen: new Date()
        } : undefined
      }))
    },

    setUserActivity: (filePath, cursorPosition) => {
      const { currentUser } = get()
      if (!currentUser) return

      set(state => ({
        currentUser: {
          ...currentUser,
          currentFile: filePath,
          cursorPosition,
          isActive: true,
          lastSeen: new Date()
        }
      }))

      // Add file activity if switching files
      if (filePath && filePath !== currentUser.currentFile) {
        get().addActivity({
          userId: currentUser.userId,
          userDisplayName: currentUser.displayName,
          type: 'file_opened',
          filePath
        })
      }
    },

    addConnectedUser: (user) => {
      set(state => {
        const newUsers = new Map(state.connectedUsers)
        newUsers.set(user.userId, user)
        return { connectedUsers: newUsers }
      })
    },

    removeConnectedUser: (userId) => {
      set(state => {
        const newUsers = new Map(state.connectedUsers)
        newUsers.delete(userId)

        // Remove cursors for this user
        const newCursors = new Map(state.cursors)
        for (const [key, cursor] of newCursors.entries()) {
          if (cursor.userId === userId) {
            newCursors.delete(key)
          }
        }

        // Remove file locks for this user
        const newLocks = new Map(state.fileLocks)
        for (const [key, lock] of newLocks.entries()) {
          if (lock.userId === userId) {
            newLocks.delete(key)
          }
        }

        return {
          connectedUsers: newUsers,
          cursors: newCursors,
          fileLocks: newLocks
        }
      })
    },

    updateConnectedUser: (userId, updates) => {
      set(state => {
        const newUsers = new Map(state.connectedUsers)
        const existingUser = newUsers.get(userId)
        if (existingUser) {
          newUsers.set(userId, { ...existingUser, ...updates })
        }
        return { connectedUsers: newUsers }
      })
    },

    // Collaborative cursors
    updateCursor: (cursor) => {
      if (!get().showCursors) return

      set(state => {
        const newCursors = new Map(state.cursors)
        const key = `${cursor.userId}-${cursor.filePath}`
        newCursors.set(key, cursor)
        return { cursors: newCursors }
      })
    },

    removeCursor: (userId, filePath) => {
      set(state => {
        const newCursors = new Map(state.cursors)

        if (filePath) {
          // Remove cursor for specific file
          newCursors.delete(`${userId}-${filePath}`)
        } else {
          // Remove all cursors for user
          for (const key of newCursors.keys()) {
            if (key.startsWith(`${userId}-`)) {
              newCursors.delete(key)
            }
          }
        }

        return { cursors: newCursors }
      })
    },

    clearCursors: (filePath) => {
      set(state => {
        if (!filePath) {
          return { cursors: new Map() }
        }

        const newCursors = new Map(state.cursors)
        for (const [key, cursor] of newCursors.entries()) {
          if (cursor.filePath === filePath) {
            newCursors.delete(key)
          }
        }

        return { cursors: newCursors }
      })
    },

    // File locking
    lockFile: (filePath, userId, userDisplayName, type, duration = 300000) => { // 5 minutes default
      const expiresAt = new Date(Date.now() + duration)

      set(state => {
        const newLocks = new Map(state.fileLocks)
        newLocks.set(filePath, {
          filePath,
          userId,
          userDisplayName,
          lockedAt: new Date(),
          expiresAt,
          type
        })
        return { fileLocks: newLocks }
      })

      // Auto-unlock after expiration
      setTimeout(() => {
        get().unlockFile(filePath, userId)
      }, duration)
    },

    unlockFile: (filePath, userId) => {
      set(state => {
        const newLocks = new Map(state.fileLocks)
        const lock = newLocks.get(filePath)

        // Only unlock if no userId specified or if userId matches lock owner
        if (!lock || (userId && lock.userId !== userId)) {
          return state
        }

        newLocks.delete(filePath)
        return { fileLocks: newLocks }
      })
    },

    isFileLocked: (filePath) => {
      const lock = get().fileLocks.get(filePath)

      if (!lock) return null

      // Check if lock has expired
      if (new Date() > lock.expiresAt) {
        get().unlockFile(filePath)
        return null
      }

      return lock
    },

    // Activity tracking
    addActivity: (activity) => {
      if (!get().showActivity) return

      const newActivity: WorkspaceActivity = {
        ...activity,
        id: `${activity.userId}-${activity.type}-${Date.now()}`,
        timestamp: new Date()
      }

      set(state => {
        const newActivities = [newActivity, ...state.activities]

        // Trim to max activities
        if (newActivities.length > state.maxActivities) {
          newActivities.splice(state.maxActivities)
        }

        return { activities: newActivities }
      })

      logger.info('Activity added', {
        type: activity.type,
        userId: activity.userId,
        filePath: activity.filePath
      }, 'workspace-collab')
    },

    clearActivities: () => {
      set({ activities: [] })
    },

    // Notifications
    addNotification: (notification) => {
      const newNotification: WorkspaceNotification = {
        ...notification,
        id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date()
      }

      set(state => ({
        notifications: [newNotification, ...state.notifications]
      }))

      // Auto-remove expired notifications
      if (newNotification.expiresAt) {
        const timeout = newNotification.expiresAt.getTime() - Date.now()
        setTimeout(() => {
          get().removeNotification(newNotification.id)
        }, timeout)
      }
    },

    removeNotification: (id) => {
      set(state => ({
        notifications: state.notifications.filter(n => n.id !== id)
      }))
    },

    clearExpiredNotifications: () => {
      const now = new Date()
      set(state => ({
        notifications: state.notifications.filter(n => !n.expiresAt || n.expiresAt > now)
      }))
    },

    clearAllNotifications: () => {
      set({ notifications: [] })
    },

    // Settings
    updateSettings: (settings) => {
      set(settings)
      logger.info('Settings updated', settings, 'workspace-collab')
    },

    // Utilities
    reset: () => {
      set(initialState)
      logger.info('workspace-collab', 'Store reset')
    }
  }))
)

// Selectors for common use cases
export const selectConnectedUsers = (state: WorkspaceCollaborationStore) =>
  Array.from(state.connectedUsers.values())

export const selectActiveCursors = (state: WorkspaceCollaborationStore, filePath?: string) =>
  Array.from(state.cursors.values()).filter(cursor =>
    !filePath || cursor.filePath === filePath
  )

export const selectRecentActivities = (state: WorkspaceCollaborationStore, limit = 10) =>
  state.activities.slice(0, limit)

export const selectActiveNotifications = (state: WorkspaceCollaborationStore) =>
  state.notifications.filter(n => !n.expiresAt || n.expiresAt > new Date())

export const selectUserPresence = (state: WorkspaceCollaborationStore, userId: string) =>
  userId === state.currentUser?.userId ? state.currentUser : state.connectedUsers.get(userId)

// Auto-cleanup expired items
setInterval(() => {
  const store = useWorkspaceCollaborationStore.getState()
  store.clearExpiredNotifications()
}, 60000) // Check every minute