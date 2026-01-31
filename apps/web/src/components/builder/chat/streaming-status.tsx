/**
 * Streaming Status Component
 * Shows engaging progress indicators during long SSE streaming waits
 */

'use client'

import { useEffect, useState, useRef } from 'react'
import { m as motion, AnimatePresence } from '@/components/ui/motion-provider'
import { 
  Sparkles, 
  Brain, 
  Code2, 
  Zap, 
  Search, 
  FileSearch,
  PenTool,
  Package,
  CheckCircle,
  XCircle,
  Clock,
  Loader2
} from 'lucide-react'

interface StreamingStatusProps {
  isStreaming: boolean
  progress?: number
  phase?: string
  startTime?: Date
  onCancel?: () => void
}

// Contextual messages that rotate while waiting
const WAITING_MESSAGES = {
  understanding: [
    "Reading your question carefully...",
    "Understanding what you need...",
    "Processing your request...",
    "Analyzing the context..."
  ],
  analyzing: [
    "Examining your project structure...",
    "Looking at your tech stack...",
    "Reviewing your codebase...",
    "Checking dependencies and frameworks..."
  ],
  searching: [
    "Searching through documentation...",
    "Finding the best answer...",
    "Gathering relevant information...",
    "Consulting knowledge base..."
  ],
  generating: [
    "Crafting the perfect response...",
    "Organizing the information...",
    "Preparing detailed answer...",
    "Almost there..."
  ]
}

const TIPS = [
  "💡 Tip: You can ask follow-up questions to dive deeper",
  "🚀 Fun fact: I analyze your entire project context for accurate answers",
  "📚 Did you know? I can help with debugging, features, and architecture",
  "⚡ Pro tip: Be specific in your questions for better results",
  "🎯 Hint: I can generate code, explain concepts, and fix bugs",
  "🔍 Note: The more context you provide, the better my answers",
  "🌟 Tip: You can ask me to implement features step by step",
  "🛠️ Fact: I understand multiple programming languages and frameworks"
]

// Phase icons
const PHASE_ICONS = {
  understanding: Brain,
  analyzing: FileSearch,
  searching: Search,
  generating: PenTool,
  processing: Package,
  complete: CheckCircle,
  error: XCircle
}

export function StreamingStatus({ 
  isStreaming, 
  progress = 0, 
  phase = 'processing',
  startTime,
  onCancel 
}: StreamingStatusProps) {
  const [messageIndex, setMessageIndex] = useState(0)
  const [tipIndex, setTipIndex] = useState(0)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  // Rotate messages every 3 seconds
  useEffect(() => {
    if (!isStreaming) {
      setMessageIndex(0)
      return
    }

    const messageInterval = setInterval(() => {
      setMessageIndex(prev => (prev + 1) % 4)
    }, 3000)

    return () => clearInterval(messageInterval)
  }, [isStreaming, phase])

  // Rotate tips every 5 seconds
  useEffect(() => {
    if (!isStreaming) {
      setTipIndex(0)
      return
    }

    const tipInterval = setInterval(() => {
      setTipIndex(prev => (prev + 1) % TIPS.length)
    }, 5000)

    return () => clearInterval(tipInterval)
  }, [isStreaming])

  // Track elapsed time
  useEffect(() => {
    if (!isStreaming || !startTime) {
      setElapsedSeconds(0)
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
      return
    }

    intervalRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime.getTime()) / 1000)
      setElapsedSeconds(elapsed)
    }, 1000)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [isStreaming, startTime])

  if (!isStreaming) return null

  const messages = WAITING_MESSAGES[phase as keyof typeof WAITING_MESSAGES] || WAITING_MESSAGES.understanding
  const currentMessage = messages[messageIndex % messages.length]
  const currentTip = TIPS[tipIndex % TIPS.length]
  const Icon = PHASE_ICONS[phase as keyof typeof PHASE_ICONS] || PHASE_ICONS.processing

  // Determine progress based on phase if not provided
  const displayProgress = progress || (
    phase === 'understanding' ? 20 :
    phase === 'analyzing' ? 40 :
    phase === 'searching' ? 60 :
    phase === 'generating' ? 80 :
    50
  )

  // Format elapsed time
  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}m ${secs}s`
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className="streaming-status-box rounded-lg p-4 mb-4 border"
      >
        {/* Header with phase icon and cancel button */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              className="text-blue-600 dark:text-blue-400"
            >
              <Icon className="w-5 h-5" />
            </motion.div>
            
            <div className="flex-1">
              <motion.p
                key={currentMessage}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-sm font-medium text-primary"
              >
                {currentMessage}
              </motion.p>
            </div>
          </div>

          {onCancel && elapsedSeconds > 5 && (
            <button
              onClick={onCancel}
              className="text-xs text-gray-500 hover:text-red-600 dark:text-gray-400 
                       dark:hover:text-red-400 transition-colors flex items-center gap-1"
            >
              <XCircle className="w-3 h-3" />
              Cancel
            </button>
          )}
        </div>

        {/* Progress bar */}
        <div className="relative mb-3">
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
              initial={{ width: 0 }}
              animate={{ width: `${displayProgress}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          </div>
          
          {/* Animated sparkle on progress bar */}
          <motion.div
            className="absolute top-0 h-2"
            style={{ left: `${displayProgress}%` }}
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 1, repeat: Infinity }}
          >
            <Sparkles className="w-4 h-4 text-yellow-500 -mt-1 -ml-2" />
          </motion.div>
        </div>

        {/* Bottom info row */}
        <div className="flex items-center justify-between text-xs">
          {/* Tip */}
          <motion.p
            key={currentTip}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-secondary flex-1 mr-2"
          >
            {currentTip}
          </motion.p>

          {/* Elapsed time */}
          {elapsedSeconds > 0 && (
            <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
              <Clock className="w-3 h-3" />
              <span>{formatTime(elapsedSeconds)}</span>
            </div>
          )}
        </div>

        {/* Long wait warning */}
        {elapsedSeconds > 20 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mt-3 pt-3 border-t border-blue-200 dark:border-gray-600"
          >
            <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" />
              This is taking longer than usual. Complex questions may take up to 45 seconds.
            </p>
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  )
}

/**
 * Inline streaming indicator for chat messages
 */
export function StreamingIndicator({ 
  phase = 'processing' 
}: { 
  phase?: string 
}) {
  const Icon = PHASE_ICONS[phase as keyof typeof PHASE_ICONS] || PHASE_ICONS.processing
  
  return (
    <div className="inline-flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
      >
        <Icon className="w-4 h-4" />
      </motion.div>
      <span className="capitalize">{phase}...</span>
    </div>
  )
}