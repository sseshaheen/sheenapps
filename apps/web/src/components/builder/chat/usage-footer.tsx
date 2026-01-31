/**
 * Usage Footer Component
 * Displays AI usage metrics (seconds, tokens) in a non-intrusive way
 * Shows below chat messages to track consumption
 */

'use client'

import { Clock, Coins, Zap, TrendingUp } from 'lucide-react'
import { type ChatPlanMetadata } from '@/types/chat-plan'

interface UsageFooterProps {
  metadata?: ChatPlanMetadata
  showDetails?: boolean
  className?: string
  translations?: {
    seconds?: string
    tokens?: string
    cached?: string
    session?: string
    duration?: string
  }
}

const defaultTranslations = {
  seconds: 'AI seconds',
  tokens: 'tokens',
  cached: 'cached',
  session: 'session',
  duration: 'duration'
}

export function UsageFooter({ 
  metadata, 
  showDetails = false, 
  className = '',
  translations = defaultTranslations 
}: UsageFooterProps) {
  if (!metadata) return null

  const t = { ...defaultTranslations, ...translations }
  
  const seconds = metadata.billed_seconds ?? 
    (metadata.duration_ms ? Math.ceil(metadata.duration_ms / 1000) : undefined)
  
  const hasUsageData = seconds != null || metadata.tokens_used != null
  
  if (!hasUsageData) return null

  return (
    <div className={`flex items-center gap-3 text-xs text-muted-foreground mt-2 px-2 ${className}`}>
      {/* AI Seconds */}
      {seconds != null && (
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          <span className="font-medium">{seconds}</span>
          <span>{t.seconds}</span>
        </span>
      )}
      
      {/* Token Usage */}
      {metadata.tokens_used != null && (
        <span className="flex items-center gap-1">
          <Coins className="w-3 h-3" />
          <span className="font-medium">{metadata.tokens_used.toLocaleString()}</span>
          <span>{t.tokens}</span>
        </span>
      )}
      
      {/* Cache Hit Indicator */}
      {metadata.cache_hits != null && metadata.cache_hits > 0 && (
        <span className="flex items-center gap-1 text-green-600">
          <Zap className="w-3 h-3" />
          <span className="text-xs">{t.cached}</span>
        </span>
      )}
      
      {/* Additional Details */}
      {showDetails && (
        <>
          {/* Response Duration */}
          {metadata.duration_ms && (
            <span className="flex items-center gap-1 opacity-75">
              <TrendingUp className="w-3 h-3" />
              <span>{(metadata.duration_ms / 1000).toFixed(1)}s {t.duration}</span>
            </span>
          )}
          
          {/* Session ID (short) */}
          {metadata.session_id && (
            <span className="flex items-center gap-1 opacity-75">
              <span className="text-xs bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
                {t.session}: {metadata.session_id.slice(0, 8)}
              </span>
            </span>
          )}
        </>
      )}
    </div>
  )
}

/**
 * Compact version for inline usage
 */
export function CompactUsageFooter({ metadata, className = '' }: Pick<UsageFooterProps, 'metadata' | 'className'>) {
  if (!metadata) return null

  const seconds = metadata.billed_seconds ?? 
    (metadata.duration_ms ? Math.ceil(metadata.duration_ms / 1000) : undefined)

  return (
    <div className={`inline-flex items-center gap-2 text-xs text-muted-foreground ${className}`}>
      {seconds != null && (
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {seconds}s
        </span>
      )}
      {metadata.tokens_used != null && (
        <span className="flex items-center gap-1">
          <Coins className="w-3 h-3" />
          {metadata.tokens_used > 1000 ? `${(metadata.tokens_used / 1000).toFixed(1)}k` : metadata.tokens_used}
        </span>
      )}
      {metadata.cache_hits && metadata.cache_hits > 0 && (
        <Zap className="w-3 h-3 text-green-600" />
      )}
    </div>
  )
}

/**
 * Usage summary component for aggregated metrics
 */
interface UsageSummaryProps {
  totalSeconds: number
  totalTokens: number
  sessionCount: number
  averageResponseTime?: number
  className?: string
}

export function UsageSummary({ 
  totalSeconds, 
  totalTokens, 
  sessionCount, 
  averageResponseTime,
  className = '' 
}: UsageSummaryProps) {
  return (
    <div className={`bg-gray-50 dark:bg-gray-900 rounded-lg p-4 ${className}`}>
      <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
        Session Usage Summary
      </h4>
      
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 text-sm font-semibold text-blue-600">
            <Clock className="w-4 h-4" />
            {totalSeconds}
          </div>
          <div className="text-xs text-muted-foreground">AI seconds</div>
        </div>
        
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 text-sm font-semibold text-green-600">
            <Coins className="w-4 h-4" />
            {totalTokens.toLocaleString()}
          </div>
          <div className="text-xs text-muted-foreground">Tokens</div>
        </div>
        
        <div className="text-center">
          <div className="flex items-center justify-center gap-1 text-sm font-semibold text-purple-600">
            <Zap className="w-4 h-4" />
            {sessionCount}
          </div>
          <div className="text-xs text-muted-foreground">Messages</div>
        </div>
        
        {averageResponseTime && (
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-sm font-semibold text-orange-600">
              <TrendingUp className="w-4 h-4" />
              {averageResponseTime.toFixed(1)}s
            </div>
            <div className="text-xs text-muted-foreground">Avg time</div>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Real-time usage tracker component
 * Updates as messages are being processed
 */
interface LiveUsageTrackerProps {
  currentSeconds?: number
  estimatedSeconds?: number
  isActive?: boolean
  className?: string
}

export function LiveUsageTracker({ 
  currentSeconds = 0, 
  estimatedSeconds,
  isActive = false,
  className = '' 
}: LiveUsageTrackerProps) {
  return (
    <div className={`flex items-center gap-3 text-xs ${className}`}>
      <div className="flex items-center gap-1">
        <Clock className={`w-3 h-3 ${isActive ? 'text-blue-500 animate-pulse' : 'text-muted-foreground'}`} />
        <span className={isActive ? 'text-blue-600 font-medium' : 'text-muted-foreground'}>
          {currentSeconds}s
        </span>
      </div>
      
      {estimatedSeconds && estimatedSeconds > currentSeconds && (
        <div className="flex items-center gap-1 text-muted-foreground">
          <span>·</span>
          <span>est. {estimatedSeconds}s</span>
        </div>
      )}
      
      {isActive && (
        <div className="flex items-center gap-1 text-blue-600">
          <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
          <span className="text-xs">Processing...</span>
        </div>
      )}
    </div>
  )
}