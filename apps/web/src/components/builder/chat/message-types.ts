/**
 * Shared Message Type Definitions
 * Single source of truth for all chat message types
 * Used by: chat-messages.tsx, message-component.tsx, and other chat components
 */

import type { IconName } from '@/components/ui/icon'

export interface BaseMessage {
  id: string
  timestamp: string | Date  // EXPERT FIX ROUND 8: Safe for hydration/persistence (server sends ISO strings)
}

export interface UserMessage extends BaseMessage {
  type: 'user'
  content: string
  mode: 'build' | 'plan'
}

export interface AssistantMessage extends BaseMessage {
  type: 'assistant'
  content: string
  emotion?: 'excited' | 'thinking' | 'celebrating' | 'helpful'
  actions?: Array<{
    label: string
    action: 'implement' | 'explain' | 'show_example'
    handler: () => void
  }>
  isTyping?: boolean
  chatPlanResponse?: any // Chat Plan Mode response data
  featurePlan?: any // Structured feature plan data for interactive UI
  fixPlan?: any // Structured fix plan data for interactive UI
}

export interface BuildEventMessage extends BaseMessage {
  type: 'build_event'
  eventType: 'started' | 'progress' | 'completed' | 'failed' | 'queued'
  title: string
  description: string
  progress?: number
  details?: {
    filesCreated?: number
    componentsBuilt?: number
    estimatedTime?: string
  }
}

export interface RecommendationMessage extends BaseMessage {
  type: 'recommendation'
  title: string
  suggestions: string[]
  rateable: boolean
  ratingId: string
  rating?: 'positive' | 'negative'
}

export interface InteractiveMessage extends BaseMessage {
  type: 'interactive'
  question: string
  options: Array<{
    label: string
    value: string
    icon?: IconName
  }>
  selectedValue?: string
}

export interface BuildEventTimelineMessage extends BaseMessage {
  type: 'build_event_timeline'
  events: any[] // Will be processed by timeline component
  overallProgress: {
    completed: number
    total: number
    percentage: number
    activeStep?: string
  }
}

export interface CleanEventMessage extends BaseMessage {
  type: 'clean_build_events'
  buildId: string
  userId: string
  projectId: string
  projectBuildStatus?: 'queued' | 'building' | 'deployed' | 'failed' | 'rollingBack' | 'rollbackFailed' | null
  isComplete: boolean
  previewUrl?: string
}

export interface SystemMessage extends BaseMessage {
  type: 'system'
  eventCode: string
  content: string
  icon?: IconName
}

/**
 * Union of all message types
 * This is the comprehensive Message type used throughout the chat system
 */
export type Message =
  | UserMessage
  | AssistantMessage
  | BuildEventMessage
  | RecommendationMessage
  | InteractiveMessage
  | BuildEventTimelineMessage
  | CleanEventMessage
  | SystemMessage
