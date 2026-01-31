/**
 * Persistent Chat Client
 * Client-side service for persistent chat API calls (no HMAC - server handles authentication)
 * 
 * CRITICAL: This is client-safe - no HMAC secrets, all auth handled by API routes
 */

'use client'

import { logger } from '@/utils/logger'

export type MessageType = 'user' | 'assistant' | 'system'
export type MessageTarget = 'team' | 'ai'
export type PresenceStatus = 'online' | 'typing' | 'away' | 'offline'

export interface PersistentChatMessage {
  id: string
  seq: number
  project_id: string
  user_id: string
  message_type: MessageType
  text: string
  target: MessageTarget
  response_data?: any
  created_at: string
  updated_at: string
  client_msg_id?: string
}

export interface PersistentChatMessageHistory {
  messages: PersistentChatMessage[]
  has_more: boolean
  next_before?: string
  total_count?: number
}

export interface PresenceInfo {
  user_id: string
  status: PresenceStatus
  activity?: string
  last_seen: string
}

export interface ReadStatus {
  user_id: string
  read_up_to_seq: number
  last_read_at: string
}

export interface SearchResult {
  messages: PersistentChatMessage[]
  total_count: number
  query: string
}

export interface SendMessageRequest {
  project_id: string
  text: string
  message_type?: MessageType
  target?: MessageTarget
  client_msg_id?: string
  // ENHANCED: Support for legacy mode field
  mode?: 'plan' | 'build' | 'unified'
  buildImmediately?: boolean
}

// NEW: Unified chat request interface (backend implemented)
export interface UnifiedChatRequest {
  buildImmediately: boolean
  message: string
  userId: string
  projectId: string
  // Backend supports client_msg_id for idempotency
  client_msg_id?: string
}

// NEW: Chat preferences interfaces (for future backend implementation)
export interface ChatPreferences {
  buildImmediately: boolean
}

export interface ChatPreferencesResponse {
  preferences: ChatPreferences
}

export interface UpdatePresenceRequest {
  project_id: string
  status: PresenceStatus
  activity?: string
}

export interface MarkReadRequest {
  project_id: string
  read_up_to_seq: number
}

export interface SearchMessagesRequest {
  project_id: string
  q: string
  message_type?: MessageType
  limit?: number
  offset?: number
}

/**
 * Client-side persistent chat service
 * All authentication handled by Next.js API routes with server-side HMAC
 */
export class PersistentChatClient {
  private static instance: PersistentChatClient

  static getInstance(): PersistentChatClient {
    if (!PersistentChatClient.instance) {
      PersistentChatClient.instance = new PersistentChatClient()
    }
    return PersistentChatClient.instance
  }

  /**
   * Fetch message history with pagination
   */
  async getMessages(projectId: string, before?: string, limit = 50): Promise<PersistentChatMessageHistory> {
    try {
      const params = new URLSearchParams({
        project_id: projectId,
        limit: limit.toString()
      })
      if (before) params.set('before', before)

      const response = await fetch(`/api/persistent-chat/messages?${params}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Failed to fetch messages: ${response.status} ${errorText}`)
      }

      return await response.json()
    } catch (error) {
      logger.error('PersistentChatClient.getMessages error:', error)
      throw error
    }
  }

  /**
   * Send a message (team or AI)
   */
  async sendMessage(request: SendMessageRequest): Promise<PersistentChatMessage> {
    try {
      const response = await fetch('/api/persistent-chat/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          project_id: request.project_id,
          text: request.text,
          message_type: request.message_type || 'user',
          target: request.target || 'team',
          client_msg_id: request.client_msg_id || `client_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          mode: request.mode || 'unified',
          buildImmediately: request.buildImmediately
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Failed to send message: ${response.status} ${errorText}`)
      }

      return await response.json()
    } catch (error) {
      logger.error('PersistentChatClient.sendMessage error:', error)
      throw error
    }
  }

  /**
   * Update user presence status
   */
  async updatePresence(request: UpdatePresenceRequest): Promise<{ success: boolean }> {
    try {
      const response = await fetch('/api/persistent-chat/presence', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          project_id: request.project_id,
          status: request.status,
          activity: request.activity
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Failed to update presence: ${response.status} ${errorText}`)
      }

      return await response.json()
    } catch (error) {
      logger.error('PersistentChatClient.updatePresence error:', error)
      throw error
    }
  }

  /**
   * Get presence information for project participants
   */
  async getPresence(projectId: string): Promise<PresenceInfo[]> {
    try {
      const params = new URLSearchParams({
        project_id: projectId
      })

      const response = await fetch(`/api/persistent-chat/presence?${params}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Failed to get presence: ${response.status} ${errorText}`)
      }

      const data = await response.json()
      return data.participants || []
    } catch (error) {
      logger.error('PersistentChatClient.getPresence error:', error)
      throw error
    }
  }

  /**
   * Mark messages as read up to specific sequence number
   * UPDATED: Backend uses PUT method, not POST
   */
  async markAsRead(request: MarkReadRequest): Promise<{ success: boolean }> {
    try {
      const response = await fetch('/api/persistent-chat/read', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          project_id: request.project_id,
          read_up_to_seq: request.read_up_to_seq
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Failed to mark as read: ${response.status} ${errorText}`)
      }

      return await response.json()
    } catch (error) {
      logger.error('PersistentChatClient.markAsRead error:', error)
      throw error
    }
  }

  /**
   * Get read status for project participants
   */
  async getReadStatus(projectId: string): Promise<ReadStatus[]> {
    try {
      const params = new URLSearchParams({
        project_id: projectId
      })

      const response = await fetch(`/api/persistent-chat/read?${params}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Failed to get read status: ${response.status} ${errorText}`)
      }

      const data = await response.json()
      return data.read_statuses || []
    } catch (error) {
      logger.error('PersistentChatClient.getReadStatus error:', error)
      throw error
    }
  }

  /**
   * Search messages in a project
   */
  async searchMessages(request: SearchMessagesRequest): Promise<SearchResult> {
    try {
      const params = new URLSearchParams({
        project_id: request.project_id,
        q: request.q,
        limit: (request.limit || 20).toString(),
        offset: (request.offset || 0).toString()
      })
      if (request.message_type) params.set('message_type', request.message_type)

      const response = await fetch(`/api/persistent-chat/search?${params}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Failed to search messages: ${response.status} ${errorText}`)
      }

      return await response.json()
    } catch (error) {
      logger.error('PersistentChatClient.searchMessages error:', error)
      throw error
    }
  }

  /**
   * BACKEND IMPLEMENTED: Send message via unified chat endpoint (PREFERRED)
   * Uses buildImmediately flag for plan vs build mode
   */
  async sendUnifiedMessage(request: UnifiedChatRequest): Promise<PersistentChatMessage> {
    try {
      const response = await fetch('/api/persistent-chat/unified', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          // Pass client locale to server for proper backend forwarding
          'x-sheen-locale': document.documentElement.lang || 'en'
        },
        body: JSON.stringify({
          buildImmediately: request.buildImmediately,
          message: request.message,
          projectId: request.projectId,
          client_msg_id: request.client_msg_id || `unified_${Date.now()}_${crypto.randomUUID()}`
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.error('PersistentChatClient.sendUnifiedMessage error:', {
          status: response.status,
          error: errorText,
          request
        })
        throw new Error(`Failed to send unified message: ${response.status} ${errorText}`)
      }

      const data = await response.json()
      
      // Log idempotency status for debugging
      if (response.status === 200) {
        logger.debug('api', 'Unified message was duplicate (idempotency)', {
          clientMsgId: request.client_msg_id,
          messageSeq: data.message_seq
        })
      }

      return data
    } catch (error) {
      logger.error('PersistentChatClient.sendUnifiedMessage error:', error)
      throw error
    }
  }

  /**
   * CLIENT-SIDE: Get chat preferences (localStorage until backend implements)
   */
  async getPreferences(projectId: string): Promise<ChatPreferences> {
    try {
      // IMPROVEMENT: Use localStorage until backend preferences API is ready
      const key = `chat-preferences-${projectId}`
      const stored = localStorage.getItem(key)
      
      if (stored) {
        const preferences = JSON.parse(stored)
        return { buildImmediately: preferences.buildImmediately ?? true }
      }
      
      // Default: build immediately
      return { buildImmediately: true }
    } catch (error) {
      logger.warn('Failed to get chat preferences from localStorage:', error)
      return { buildImmediately: true } // Safe default
    }
  }

  /**
   * CLIENT-SIDE: Save chat preferences (localStorage until backend implements)
   */
  async savePreferences(projectId: string, preferences: ChatPreferences): Promise<{ success: boolean }> {
    try {
      // IMPROVEMENT: Use localStorage until backend preferences API is ready
      const key = `chat-preferences-${projectId}`
      localStorage.setItem(key, JSON.stringify(preferences))
      
      logger.debug('store', 'Saved chat preferences to localStorage', {
        projectId,
        preferences
      })
      
      return { success: true }
    } catch (error) {
      logger.error('Failed to save chat preferences to localStorage:', error)
      return { success: false }
    }
  }

  /**
   * @deprecated DEAD CODE - Use SSEConnectionManager singleton instead
   *
   * This method created raw EventSource connections bypassing the singleton pattern,
   * leading to connection thrashing and 429 errors during rapid view switching.
   *
   * Migration path:
   * ```typescript
   * // OLD (bypasses singleton):
   * const eventSource = persistentChatClient.createSSEConnection(projectId)
   *
   * // NEW (uses singleton with ref counting):
   * import { SSEConnectionManager } from '@/services/sse-connection-manager'
   * const manager = SSEConnectionManager.getInstance(projectId, userId)
   * manager.addRef()
   * manager.connect({ projectId, userId, onMessage, onStatusChange })
   * // cleanup: manager.releaseRef()
   * ```
   *
   * Commented out 2026-01-13 after connection thrashing fix.
   * Safe to delete after confirming no usage (grep confirmed unused).
   */
  // createSSEConnection(projectId: string, since?: string): EventSource {
  //   const params = new URLSearchParams({
  //     project_id: projectId
  //   })
  //   if (since) params.set('since', since)

  //   const eventSource = new EventSource(`/api/persistent-chat/stream?${params}`)
  //
  //   eventSource.onerror = (error) => {
  //     logger.error('PersistentChatClient SSE connection error:', error)
  //   }

  //   return eventSource
  // }
}

// Export singleton instance
export const persistentChatClient = PersistentChatClient.getInstance()