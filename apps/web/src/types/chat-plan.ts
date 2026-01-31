/**
 * Chat Plan Mode TypeScript Interfaces
 * Comprehensive types for Worker API Chat Plan Mode integration
 */

// Base interfaces
export interface ChatPlanRequest {
  userId: string
  projectId: string
  message: string
  // locale moved to x-sheen-locale header
  context?: {
    sessionId?: string
    previousMessages?: number
    [key: string]: any
  }
}

// Worker's actual response structure
export interface WorkerChatResponse {
  type: 'chat_response'
  subtype: 'success' | 'error'
  sessionId: string
  messageId: string
  timestamp: string
  mode: ChatMode
  data: {
    message: string
    // Additional fields based on mode
    [key: string]: any
  }
  metadata: {
    duration_ms?: number
    tokens_used?: number
    projectContext?: {
      versionId?: string | null
      buildId?: string
      lastModified?: string
    }
  }
  availableActions?: any[]
}

export interface ChatPlanMetadata {
  duration_ms?: number
  tokens_used?: number
  billed_seconds?: number
  cache_hits?: number
  session_id?: string
  intent_classification?: string
}

// AI Mode Types
export type ChatMode = 'question' | 'feature' | 'fix' | 'analysis' | 'general' | 'build'

// Response type discriminated union
export interface BaseChatPlanResponse {
  mode: ChatMode
  session_id?: string  // Optional - may not be present in all responses
  metadata: ChatPlanMetadata
  timestamp: string
}

// Question mode response (per CHAT_API_REFERENCE.md)
export interface QuestionResponse extends BaseChatPlanResponse {
  mode: 'question' | 'general'  // general mode uses same structure
  answer: string
  references?: Array<{
    file: string
    line: number
    snippet: string
  }>
  relatedTopics?: string[]
  // Additional fields that UI components expect (legacy)
  code_references?: Array<{
    file: string
    line: number
    line_start?: number
    line_end?: number
    snippet: string
  }>
  related_questions?: string[]
}

// Feature mode response (per CHAT_API_REFERENCE.md)
export interface FeaturePlanResponse extends BaseChatPlanResponse {
  mode: 'feature'
  summary: string
  feasibility: 'simple' | 'moderate' | 'complex'
  plan: {
    overview: string
    steps: Array<{
      order: number
      title: string
      description: string
      files: string[]
      estimatedEffort: 'low' | 'medium' | 'high'
    }>
    dependencies: Array<{
      name: string
      version?: string
      reason: string
    }>
    risks: string[]
    alternatives?: string[]
  }
  buildPrompt?: string  // Pre-generated prompt for conversion to build
  // Additional fields that UI components expect
  title?: string
  description?: string
  steps?: Array<{
    id: string
    title: string
    description: string
    files_affected: string[]
    dependencies?: Array<{
      name: string
      version?: string
    }>
  }>
  estimated_time_minutes?: number
  acceptance_criteria?: string[]
  technical_notes?: string | string[]
}

// Fix mode response (per CHAT_API_REFERENCE.md)
export interface FixPlanResponse extends BaseChatPlanResponse {
  mode: 'fix'
  issue: {
    description: string
    severity: 'low' | 'medium' | 'high' | 'critical'
    category: string
  }
  rootCause: string
  solution: {
    approach: string
    changes: Array<{
      file: string
      changeType: 'modify' | 'create' | 'delete'
      description: string
    }>
    testingStrategy: string
  }
  preventionTips?: string[]
  buildPrompt?: string
  // Additional fields that UI components expect (legacy)
  issue_analysis?: string
  root_cause?: string
  solutions?: Array<{
    id: string
    title: string
    description: string
    confidence: 'low' | 'medium' | 'high'
    implementation: string
    risks: string[]
    risk_level?: 'low' | 'medium' | 'high'
    steps?: Array<{
      order: number
      description: string
    }>
    files_affected?: string[]
    testing_notes?: string
  }>
  confidence?: 'low' | 'medium' | 'high'
  prevention_tips?: string[]
}

// Analysis mode response
export interface AnalysisResponse extends BaseChatPlanResponse {
  mode: 'analysis'
  summary: string
  findings: {
    category: 'security' | 'performance' | 'maintainability' | 'bugs' | 'best_practices'
    severity: 'info' | 'warning' | 'error'
    title: string
    description: string
    file?: string
    line?: number
    recommendation?: string
  }[]
  metrics?: {
    lines_of_code?: number
    complexity_score?: number
    test_coverage?: number
    dependencies?: number
  }
  recommendations: string[]
}

// General mode response (per spec, uses same structure as question)
export interface GeneralResponse extends Omit<QuestionResponse, 'mode'> {
  mode: 'general'
  response?: string  // Some components expect this field
}

// Union type for all response types
export type ChatPlanResponse = 
  | QuestionResponse 
  | FeaturePlanResponse 
  | FixPlanResponse 
  | AnalysisResponse 
  | GeneralResponse

// Worker API Streaming Event Types (v2 - Real-time streaming)
export interface ConnectionEvent {
  sessionId: string
  timestamp: string
}

export interface AssistantTextEvent {
  text: string
  index: number         // Chunk index
  isPartial: boolean    // Whether more text is coming
  messageId?: string    // Optional message ID
  structuredResponse?: any // Optional structured response for interactive UI
  featurePlan?: any     // Optional feature plan data for interactive UI
  fixPlan?: any         // Optional fix plan data for interactive UI
}

export interface ToolUseEvent {
  toolName: string
  toolId: string
  input: {
    file_path?: string
    pattern?: string
    [key: string]: any
  }
  description: string   // Template key for i18n (e.g., "CHAT_TOOL_READ_FILE")
}

export interface ToolResultEvent {
  toolUseId: string
  preview?: string      // Truncated preview of results
  size?: number         // Size in bytes
}

export interface ProgressUpdateEvent {
  stage: 'analyzing' | 'processing' | 'finalizing'
  message: string       // Template key for i18n
}

export interface CompleteEvent {
  fullResponse: {
    mode: ChatMode
    data: any           // Mode-specific data (varies by mode)
  }
  duration: number      // milliseconds
  sessionId: string
}

export interface ErrorEvent {
  code: string          // Template key for i18n (e.g., "CHAT_ERROR_INSUFFICIENT_BALANCE")
  params?: {            // Parameters for template substitution
    required?: number
    available?: number
    message?: string
    [key: string]: any
  }
  recoverable: boolean
}

// Union type for all streaming events
export type StreamEvent = 
  | { type: 'connection'; data: ConnectionEvent }
  | { type: 'assistant_text'; data: AssistantTextEvent }
  | { type: 'tool_use'; data: ToolUseEvent }
  | { type: 'tool_result'; data: ToolResultEvent }
  | { type: 'progress_update'; data: ProgressUpdateEvent }
  | { type: 'complete'; data: CompleteEvent }
  | { type: 'error'; data: ErrorEvent }

// Handler types for streaming events
export interface StreamEventHandlers {
  onConnection?: (data: ConnectionEvent) => void
  onAssistantText?: (data: AssistantTextEvent) => void
  onToolUse?: (data: ToolUseEvent) => void
  onToolResult?: (data: ToolResultEvent) => void
  onProgressUpdate?: (data: ProgressUpdateEvent) => void
  onComplete?: (data: CompleteEvent) => void
  onError?: (data: ErrorEvent) => void
}

// Build conversion types
export interface BuildConversionRequest {
  sessionId: string
  userId: string
  projectId: string
  planData: FeaturePlanResponse | FixPlanResponse
}

export interface BuildConversionResponse {
  type?: 'build_conversion'
  subtype?: 'success' | 'error'
  success: boolean
  buildId?: string
  versionId?: string
  jobId?: string
  status?: 'queued' | 'building' | 'deployed' | 'failed'
  sessionId?: string
  message: string
  estimated_minutes?: number
}

// Timeline types
export interface TimelineItem {
  id: string
  project_id: string
  timeline_seq: number
  item_type: 'chat_message' | 'build_event' | 'deployment'
  content: any
  metadata?: ChatPlanMetadata
  created_at: string
  is_visible: boolean
}

export interface TimelineQuery {
  projectId: string
  mode?: 'all' | 'plan' | 'build'
  offset?: number
  limit?: number
  before?: string
  after?: string
}

export interface TimelineResponse {
  items: TimelineItem[]
  total: number
  offset: number
  limit: number
  hasMore: boolean
}

// Type guards for response types (removed - duplicates exist below)

// Error types for Chat Plan Mode
export interface ChatPlanError {
  code: string
  message: string
  status?: number
  details?: any
}

// React Hook state types
export interface ChatStreamingState {
  messages: ChatMessage[]
  isStreaming: boolean
  currentText: string
  tools: string[]
  progress: string
  sessionId: string
  error: ChatPlanError | null
}

// Chat message types for UI display
export interface ChatMessage {
  id?: string
  type: 'user' | 'assistant' | 'error' | 'tool' | 'system'
  content: string
  timestamp: Date
  metadata?: {
    mode?: ChatMode
    duration?: number
    tools?: string[]
    [key: string]: any
  }
}

export interface ChatPlanHookOptions {
  onSuccess?: (response: ChatPlanResponse) => void
  onError?: (error: ChatPlanError) => void
  autoRetry?: boolean
  retryDelay?: number
}

// Local cost estimation types
export interface CostEstimate {
  estimatedSeconds: number
  detectedIntent?: ChatMode
  confidence: number
}

// Usage tracking types
export interface UsageMetrics {
  totalSeconds: number
  totalTokens: number
  sessionCount: number
  averageResponseTime: number
  cacheHitRate?: number
}

// Component prop types
export interface ChatPlanDisplayProps {
  response: ChatPlanResponse
  onConvertToBuild?: (plan: FeaturePlanResponse | FixPlanResponse) => void
  onModifyPlan?: (modification: string) => void
  translations: Record<string, string>
}

export interface ModeBadgeProps {
  mode: ChatMode
  className?: string
}

export interface UsageFooterProps {
  metadata?: ChatPlanMetadata
  showDetails?: boolean
}

// Export all response types as a type guard helper
export function isChatPlanResponse(obj: any): obj is ChatPlanResponse {
  return obj && typeof obj === 'object' && 'mode' in obj && 'session_id' in obj
}

export function isFeaturePlanResponse(response: ChatPlanResponse): response is FeaturePlanResponse {
  return response.mode === 'feature'
}

export function isFixPlanResponse(response: ChatPlanResponse): response is FixPlanResponse {
  return response.mode === 'fix'
}

export function isQuestionResponse(response: ChatPlanResponse): response is QuestionResponse {
  return response.mode === 'question' || response.mode === 'general'
}

export function isAnalysisResponse(response: ChatPlanResponse): response is AnalysisResponse {
  return response.mode === 'analysis'
}

export function isGeneralResponse(response: ChatPlanResponse): response is GeneralResponse {
  return response.mode === 'general'
}

export function canConvertToBuild(response: ChatPlanResponse): response is FeaturePlanResponse | FixPlanResponse {
  return response.mode === 'feature' || response.mode === 'fix'
}