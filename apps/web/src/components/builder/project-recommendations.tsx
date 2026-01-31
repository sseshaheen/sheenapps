'use client'

import React from 'react'
import { m } from '@/components/ui/motion-provider'
import { ChevronRight, Sparkles, Clock, Zap, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import Icon, { type IconName } from '@/components/ui/icon'
import type { ProjectRecommendation } from '@/types/project-recommendations'
import {
  RECOMMENDATION_CATEGORIES,
  RECOMMENDATION_PRIORITIES,
  RECOMMENDATION_COMPLEXITY,
  RECOMMENDATION_IMPACT
} from '@/types/project-recommendations'
import { useApplyRecommendation, type SendMessageFunction } from '@/hooks/use-apply-recommendation'
import { useChatActionsStore } from '@/store/chat-actions-store'
import { useAuthStore } from '@/store'

interface ProjectRecommendationsProps {
  recommendations: ProjectRecommendation[]
  projectId: string  // Required for Zustand orchestration
  sendMessage: SendMessageFunction  // EXPERT FIX ROUND 6: Required (prevents duplicate chat stacks)
  onSelectRecommendation?: (recommendation: ProjectRecommendation) => void  // Deprecated - kept for backward compat (analytics only)
  className?: string
}

export function ProjectRecommendations({
  recommendations,
  projectId,
  sendMessage,
  onSelectRecommendation,
  className
}: ProjectRecommendationsProps) {
  const { user } = useAuthStore()
  const userId = user?.id ?? ''

  // EXPERT FIX: Pass sendMessage if available (prevents duplicate usePersistentChat)
  // If not provided, useApplyRecommendation will fallback to usePersistentChat (legacy components)
  const { applyRecommendation, retryRecommendation, isApplying, getError } = useApplyRecommendation({
    projectId,
    userId,
    sendMessage,  // Prefer passed function, fallback to internal initialization
    onSuccess: () => {
      // Future: could show toast notification
    },
    onError: (error) => {
      console.error('[ProjectRecommendations] Error applying recommendation:', error)
    }
  })

  // EXPERT FIX ROUND 11 (v3): Early return if not authenticated
  if (!userId) {
    return (
      <div className={cn("rounded-lg border border-gray-700 bg-gray-900/50 p-4 text-sm text-gray-300", className)}>
        Sign in to apply recommendations automatically.
      </div>
    )
  }

  if (recommendations.length === 0) {
    return null
  }

  return (
    <m.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.5 }}
      className={cn("w-full max-w-2xl mt-6", className)}
    >
      {/* Header */}
      <div className="mb-6">
        <m.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.6 }}
          className="flex items-center gap-3 mb-2"
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <h3 className="text-xl font-semibold text-white">
            ✨ What's next for your app?
          </h3>
        </m.div>
        <p className="text-gray-400 text-sm ml-11">
          Here are some ways to enhance your project and take it to the next level:
        </p>
      </div>

      {/* Recommendations Grid */}
      <div className="space-y-3">
        {recommendations.map((recommendation, index) => (
          <RecommendationCard
            key={recommendation.id}
            recommendation={recommendation}
            projectId={projectId}
            index={index}
            isApplying={isApplying(String(recommendation.id))}
            error={getError(String(recommendation.id))}
            onSelect={async () => {
              // Apply via Zustand orchestration
              await applyRecommendation(recommendation)

              // Analytics only (if needed later)
              // onSelectRecommendation is intentionally removed to prevent duplicate message sends
            }}
            onRetry={async () => {
              // EXPERT FIX ROUND 4: Retry with same client_msg_id for true idempotency
              await retryRecommendation(String(recommendation.id))
            }}
          />
        ))}
      </div>

      {/* Footer hint */}
      <m.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 1 + recommendations.length * 0.1 }}
        className="mt-4 flex items-center gap-2 text-xs text-gray-500 justify-center"
      >
        <Icon name="lightbulb" className="w-3 h-3" />
        <span>Click any recommendation to implement it automatically</span>
      </m.div>
    </m.div>
  )
}

interface RecommendationCardProps {
  recommendation: ProjectRecommendation
  projectId: string
  index: number
  isApplying: boolean  // Derived from Zustand store
  error?: string       // Derived from Zustand store
  onSelect: () => Promise<void>
  onRetry: () => Promise<void>  // EXPERT FIX ROUND 4: Separate retry handler with same client_msg_id
}

function RecommendationCard({
  recommendation,
  projectId,
  index,
  isApplying,
  error,
  onSelect,
  onRetry
}: RecommendationCardProps) {
  const [isHovered, setIsHovered] = React.useState(false)

  // EXPERT FIX: Derive proper UI states from action.state (don't conflate error with success)
  const action = useChatActionsStore(state =>
    state.getActionByRecommendation(projectId, String(recommendation.id))
  )

  // isSelected should only be true for successful completion
  const isSelected = action?.state === 'done'

  // isApplying passed as prop covers: sending, sent, confirmed, assistant_received, build_tracking
  // error passed as prop covers: error state
  
  const categoryConfig = RECOMMENDATION_CATEGORIES[recommendation.category] || {
    icon: '📦',
    name: 'Other',
    color: 'gray',
    description: 'General recommendation'
  }
  
  const priorityConfig = RECOMMENDATION_PRIORITIES[recommendation.priority] || {
    color: 'gray',
    label: 'Unknown Priority',
    description: 'Priority not specified'
  }
  
  const complexityConfig = RECOMMENDATION_COMPLEXITY[recommendation.complexity] || {
    dots: 2,
    label: 'Unknown',
    description: 'Complexity not specified',
    estimatedTime: 'Unknown'
  }
  
  const impactConfig = RECOMMENDATION_IMPACT[recommendation.impact] || {
    color: 'gray',
    label: 'Unknown Impact',
    description: 'Impact not specified'
  }

  const getPriorityColorClasses = () => {
    switch (recommendation.priority) {
      case 'high':
        return {
          bg: 'bg-red-500/20',
          text: 'text-red-400',
          border: 'border-red-500/30'
        }
      case 'medium':
        return {
          bg: 'bg-yellow-500/20',
          text: 'text-yellow-400',
          border: 'border-yellow-500/30'
        }
      case 'low':
        return {
          bg: 'bg-green-500/20',
          text: 'text-green-400',
          border: 'border-green-500/30'
        }
      default:
        return {
          bg: 'bg-gray-500/20',
          text: 'text-gray-400',
          border: 'border-gray-500/30'
        }
    }
  }

  const getImpactColorClasses = () => {
    switch (recommendation.impact) {
      case 'high':
        return {
          bg: 'bg-purple-500/20',
          text: 'text-purple-400',
          border: 'border-purple-500/30'
        }
      case 'medium':
        return {
          bg: 'bg-blue-500/20',
          text: 'text-blue-400',
          border: 'border-blue-500/30'
        }
      case 'low':
        return {
          bg: 'bg-gray-500/20',
          text: 'text-gray-400',
          border: 'border-gray-500/30'
        }
      default:
        return {
          bg: 'bg-gray-500/20',
          text: 'text-gray-400',
          border: 'border-gray-500/30'
        }
    }
  }

  const priorityColors = getPriorityColorClasses()
  const impactColors = getImpactColorClasses()

  return (
    <m.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        duration: 0.4,
        delay: 0.7 + index * 0.1,
        ease: "easeOut"
      }}
      className={cn(
        "group transition-all duration-300",
        "bg-gray-900/50 hover:bg-gray-900/70",
        "border border-gray-700 hover:border-gray-600",
        "rounded-lg p-4",
        "transform hover:scale-[1.02] hover:shadow-lg hover:shadow-black/20",
        isSelected && "ring-2 ring-purple-500/50 bg-gray-900/80"
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      whileHover={{ y: -2 }}
    >
      <div className="flex items-start gap-4">
        {/* Category Icon */}
        <div className={cn(
          "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0",
          "bg-gradient-to-br transition-all duration-300",
          recommendation.category === 'ui/ux' && "from-purple-500 to-pink-500",
          recommendation.category === 'performance' && "from-blue-500 to-cyan-500", 
          recommendation.category === 'security' && "from-red-500 to-orange-500",
          recommendation.category === 'features' && "from-green-500 to-emerald-500",
          recommendation.category === 'seo' && "from-yellow-500 to-orange-500",
          recommendation.category === 'accessibility' && "from-indigo-500 to-purple-500",
          recommendation.category === 'deployment' && "from-orange-500 to-red-500",
          recommendation.category === 'development' && "from-gray-500 to-slate-500",
          recommendation.category === 'functionality' && "from-cyan-500 to-blue-500",
          recommendation.category === 'testing' && "from-teal-500 to-green-500",
          isHovered && "scale-110 shadow-lg"
        )}>
          <span className="text-lg">{categoryConfig.icon}</span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Title and Category */}
          <div className="flex items-start justify-between mb-2">
            <div className="flex-1">
              <h4 className="font-semibold text-white text-sm group-hover:text-purple-200 transition-colors">
                {recommendation.title}
              </h4>
              <span className="text-xs text-gray-500 uppercase tracking-wide">
                {categoryConfig.name}
              </span>
            </div>
            
            {/* Selection indicator */}
            <m.div
              animate={{ 
                opacity: isSelected ? 1 : (isHovered ? 0.7 : 0),
                x: isSelected ? 0 : 10
              }}
              className="text-purple-400"
            >
              <ChevronRight className="w-4 h-4" />
            </m.div>
          </div>

          {/* Description */}
          <p className="text-sm text-gray-400 mb-3 group-hover:text-gray-300 transition-colors">
            {recommendation.description}
          </p>

          {/* Badges Row */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {/* Priority Badge */}
            <div className={cn(
              "inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border",
              priorityColors.bg,
              priorityColors.text,
              priorityColors.border
            )}>
              <div className={cn("w-2 h-2 rounded-full", priorityColors.text.replace('text-', 'bg-'))} />
              {priorityConfig.label}
            </div>

            {/* Impact Badge */}
            <div className={cn(
              "inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border",
              impactColors.bg,
              impactColors.text,
              impactColors.border
            )}>
              <Zap className="w-3 h-3" />
              {impactConfig.label}
            </div>

            {/* Complexity Indicator */}
            <div className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-gray-700/50 text-gray-300 border border-gray-600">
              <div className="flex items-center gap-0.5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      i < complexityConfig.dots ? "bg-gray-300" : "bg-gray-600"
                    )}
                  />
                ))}
              </div>
              {complexityConfig.label}
            </div>

            {/* Estimated Time */}
            <div className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-gray-400 bg-gray-800/50">
              <Clock className="w-3 h-3" />
              {complexityConfig.estimatedTime}
            </div>
          </div>

          {/* Action Button */}
          <m.button
            whileHover={!isApplying && !isSelected ? { scale: 1.02 } : undefined}
            whileTap={!isApplying && !isSelected ? { scale: 0.98 } : undefined}
            onClick={error ? onRetry : onSelect}  // EXPERT FIX ROUND 4: Call onRetry when in error state
            disabled={isApplying || isSelected}  // EXPERT FIX ROUND 7: Prevent double-click and re-apply
            className={cn(
              "w-full py-2.5 px-4 rounded-lg text-sm font-medium",
              "bg-gradient-to-r transition-all duration-300",
              "flex items-center justify-center gap-2",
              (isApplying || isSelected) && "cursor-not-allowed opacity-75",
              !isApplying && isSelected
                ? "from-purple-600 to-pink-600 text-white shadow-lg"
                : "from-purple-600/80 to-pink-600/80 text-white/90 hover:from-purple-600 hover:to-pink-600 hover:text-white",
              "group-hover:shadow-lg group-hover:shadow-purple-500/20"
            )}
          >
            {/* EXPERT FIX: Proper state-driven button text */}
            {isApplying ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Applying...
              </>
            ) : error ? (
              <>
                <Sparkles className="w-4 h-4" />
                Retry
              </>
            ) : isSelected ? (
              <>
                <Sparkles className="w-4 h-4" />
                Selected!
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Add This Feature
              </>
            )}
          </m.button>

          {/* Error Message */}
          {error && (
            <m.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-2 flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-2 py-1.5"
            >
              <AlertCircle className="w-3 h-3 flex-shrink-0" />
              <span>{error}</span>
            </m.div>
          )}
        </div>
      </div>
    </m.div>
  )
}
