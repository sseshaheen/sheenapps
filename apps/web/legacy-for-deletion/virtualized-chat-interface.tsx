/**
 * Virtualized Chat Interface
 * 
 * High-performance chat component using virtual scrolling
 * Optimized for handling thousands of messages without performance degradation
 */

'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { m, AnimatePresence } from '@/components/ui/motion-provider'
import Icon from '@/components/ui/icon'


import { cn } from '@/lib/utils'
import { VirtualChatList, VirtualListPerformance } from '@/components/ui/virtual-list'
import { AIOrchestrator } from '@/services/ai/orchestrator'
import { StreamingAIResponse } from '@/services/ai/types'
import { logger } from '@/utils/logger'

interface ChatMessage {
  id: string
  type: 'ai' | 'user' | 'system' | 'insight'
  content: string
  chips?: string[]
  timestamp: Date
  isTyping?: boolean
  confidence?: number
  insight?: string
}

interface VirtualizedChatInterfaceProps {
  initialIdea: string
  onAnalysisComplete?: (data: any) => void
  onProgressUpdate?: (progress: number) => void
  translations: {
    chat: {
      title: string
      thinking: string
    }
  }
}

/**
 * Chat message component optimized for virtual rendering
 */
const ChatMessageItem = React.memo<{
  message: ChatMessage
  index: number
}>(({ message, index }) => {
  return (
    <m.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "flex flex-col gap-2 p-2",
        message.type === 'user' && "items-end",
        message.type === 'insight' && "items-center"
      )}
    >
      {message.type === 'insight' ? (
        <div className="bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30 rounded-lg p-3 max-w-full">
          <div className="flex items-center gap-2 mb-2">
            <Icon name="sparkles" className="w-4 h-4 text-purple-400"  />
            <span className="text-xs font-medium text-purple-300">AI Insight</span>
            {message.confidence && (
              <span className="text-xs text-gray-400">
                {Math.round(message.confidence * 100)}% confidence
              </span>
            )}
          </div>
          <p className="text-sm text-white">{message.content}</p>
          {message.insight && (
            <p className="text-xs text-gray-400 mt-2">{message.insight}</p>
          )}
        </div>
      ) : (
        <div
          className={cn(
            "max-w-[85%] rounded-lg p-3 text-sm",
            message.type === 'user'
              ? "bg-purple-600 text-white"
              : message.type === 'ai'
              ? "bg-gray-800 text-gray-100"
              : "bg-gray-700 text-gray-300"
          )}
        >
          {message.isTyping ? (
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" 
                     style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" 
                     style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" 
                     style={{ animationDelay: '300ms' }} />
              </div>
              <span className="text-xs text-gray-400">AI is thinking...</span>
            </div>
          ) : (
            <>
              <p className="text-sm">{message.content}</p>
              {message.chips && message.chips.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {message.chips.map((chip, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-1 bg-purple-500/20 text-purple-300 text-xs rounded-full border border-purple-500/30"
                    >
                      {chip}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
          <div className="text-xs text-gray-500 mt-1">
            {message.timestamp.toLocaleTimeString()}
          </div>
        </div>
      )}
    </m.div>
  )
})

ChatMessageItem.displayName = 'ChatMessageItem'

export function VirtualizedChatInterface({
  initialIdea,
  onAnalysisComplete,
  onProgressUpdate,
  translations
}: VirtualizedChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isThinking, setIsThinking] = useState(false)
  const [selectedChips, setSelectedChips] = useState<Set<string>>(new Set())
  const [customInput, setCustomInput] = useState('')
  const [showCustomInput, setShowCustomInput] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [unreadCount, setUnreadCount] = useState(0)

  const customInputRef = useRef<HTMLInputElement>(null)
  const orchestrator = useRef<AIOrchestrator | null>(null)

  // Performance monitoring
  const performanceMonitor = useRef(
    VirtualListPerformance.createPerformanceMonitor('chat-interface')
  )

  // Estimate message height based on content
  const estimateMessageHeight = useCallback((index: number): number => {
    const message = messages[index]
    if (!message) return 80

    // Base height for message container
    let height = 60

    // Add height for content (rough estimation)
    const contentLines = Math.ceil(message.content.length / 40)
    height += contentLines * 20

    // Add height for chips
    if (message.chips && message.chips.length > 0) {
      const chipRows = Math.ceil(message.chips.length / 4)
      height += chipRows * 28
    }

    // Add height for insight metadata
    if (message.type === 'insight') {
      height += 40
    }

    return Math.max(height, 80) // Minimum height
  }, [messages])

  // Handle scroll with unread message counting
  const handleScroll = useCallback((scrollTop: number, atBottom: boolean) => {
    setIsAtBottom(atBottom)
    
    if (atBottom) {
      setUnreadCount(0)
    }

    performanceMonitor.current.onRender()
  }, [])

  // Initialize AI orchestrator
  useEffect(() => {
    if (!orchestrator.current) {
      orchestrator.current = new AIOrchestrator({
        prefersConciseResponses: false,
        previousInteractions: 0,
        preferredCommunicationStyle: 'detailed',
        riskTolerance: 'balanced'
      })
    }
  }, [])

  // Add initial message
  useEffect(() => {
    if (initialIdea && messages.length === 0) {
      addMessage({
        type: 'user',
        content: initialIdea,
        timestamp: new Date()
      })
    }
  }, [initialIdea, messages.length])

  // Track unread messages when not at bottom
  useEffect(() => {
    if (!isAtBottom && messages.length > 0) {
      const lastMessage = messages[messages.length - 1]
      if (lastMessage.type === 'ai') {
        setUnreadCount(prev => prev + 1)
      }
    }
  }, [messages.length, isAtBottom])

  const addMessage = (messageData: Partial<ChatMessage>) => {
    const message: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random()}`,
      type: 'system',
      content: '',
      timestamp: new Date(),
      ...messageData
    }
    
    setMessages(prev => [...prev, message])
  }

  const updateLastMessage = (updates: Partial<ChatMessage>) => {
    setMessages(prev => 
      prev.map((msg, index) => 
        index === prev.length - 1 ? { ...msg, ...updates } : msg
      )
    )
  }

  const handleSendMessage = async () => {
    if (!customInput.trim() || !orchestrator.current) return

    // Add user message
    addMessage({
      type: 'user',
      content: customInput.trim()
    })

    const userInput = customInput.trim()
    setCustomInput('')
    setShowCustomInput(false)
    setIsThinking(true)

    // Add typing indicator
    addMessage({
      type: 'ai',
      content: '',
      isTyping: true
    })

    try {
      // Stream AI response using analyzeBusinessIdeaStream
      updateLastMessage({ isTyping: false, content: '' })
      
      const stream = orchestrator.current.analyzeBusinessIdeaStream(userInput)
      let accumulatedContent = ''
      
      for await (const chunk of stream) {
        if (chunk.type === 'chunk' || chunk.type === 'start') {
          accumulatedContent += chunk.content
          updateLastMessage({
            content: accumulatedContent
          })
        } else if (chunk.type === 'complete') {
          updateLastMessage({
            isTyping: false,
            chips: [] // Could add suggestions based on analysis
          })
          
          // Call progress/complete callbacks if needed
          if (onProgressUpdate) onProgressUpdate(100)
          if (onAnalysisComplete) onAnalysisComplete(chunk)
        } else if (chunk.type === 'insight') {
          // Handle insights or progress updates
          if (chunk.metadata?.progress && onProgressUpdate) {
            onProgressUpdate(chunk.metadata.progress)
          }
        }
      }
    } catch (error) {
      logger.error('Failed to process message:', error)
      updateLastMessage({
        isTyping: false,
        content: 'Sorry, I encountered an error processing your message.',
        type: 'system'
      })
    } finally {
      setIsThinking(false)
    }
  }

  const handleChipClick = (chip: string) => {
    if (selectedChips.has(chip)) {
      setSelectedChips(prev => {
        const next = new Set(prev)
        next.delete(chip)
        return next
      })
    } else {
      setSelectedChips(prev => new Set([...prev, chip]))
    }
  }

  const scrollToBottom = () => {
    setUnreadCount(0)
    // The VirtualChatList will handle scrolling to bottom automatically
  }

  return (
    <div className="flex flex-col h-full bg-gray-900 border-l border-gray-700">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Icon name="brain" className="w-5 h-5 text-purple-400"  />
            {translations.chat.title}
          </h2>
          
          {/* Unread indicator */}
          {unreadCount > 0 && (
            <button
              onClick={scrollToBottom}
              className="bg-purple-600 text-white text-xs px-2 py-1 rounded-full hover:bg-purple-700 transition-colors"
            >
              {unreadCount} new message{unreadCount !== 1 ? 's' : ''}
            </button>
          )}
        </div>
      </div>

      {/* Virtualized Messages */}
      <div className="flex-1 min-h-0">
        <VirtualChatList
          messages={messages}
          height={400} // Will be overridden by parent flex
          renderMessage={(message, index) => (
            <ChatMessageItem 
              key={message.id} 
              message={message} 
              index={index} 
            />
          )}
          autoScrollToBottom={isAtBottom}
          estimateMessageHeight={estimateMessageHeight}
          onScroll={handleScroll}
          className="h-full"
        />
      </div>

      {/* Message Input */}
      <div className="flex-shrink-0 p-4 border-t border-gray-700">
        {/* Selected chips display */}
        {selectedChips.size > 0 && (
          <div className="mb-3 flex flex-wrap gap-1">
            {Array.from(selectedChips).map(chip => (
              <span
                key={chip}
                className="px-2 py-1 bg-purple-600 text-white text-xs rounded-full cursor-pointer hover:bg-purple-700"
                onClick={() => handleChipClick(chip)}
              >
                {chip} ×
              </span>
            ))}
          </div>
        )}

        {/* Custom input */}
        <AnimatePresence>
          {showCustomInput && (
            <m.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-3"
            >
              <div className="flex gap-2">
                <input
                  ref={customInputRef}
                  type="text"
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Type your message..."
                  className="flex-1 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-white placeholder-gray-400"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!customInput.trim() || isThinking}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Icon name="send" className="w-4 h-4"  />
                </button>
              </div>
            </m.div>
          )}
        </AnimatePresence>

        {/* Input toggle */}
        {!showCustomInput && (
          <button
            onClick={() => {
              setShowCustomInput(true)
              setTimeout(() => customInputRef.current?.focus(), 100)
            }}
            className="w-full py-2 bg-gray-800 text-gray-400 rounded-lg hover:bg-gray-700 transition-colors text-sm"
          >
            Type a custom message...
          </button>
        )}

        {/* Status indicator */}
        {isThinking && (
          <div className="mt-2 text-xs text-gray-500 flex items-center gap-2">
            <div className="flex gap-1">
              <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-pulse" />
              <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
              <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
            </div>
            {translations.chat.thinking}
          </div>
        )}

        {/* Performance stats (dev mode only) */}
        {process.env.NODE_ENV === 'development' && (
          <div className="mt-2 text-xs text-gray-600">
            Messages: {messages.length} | 
            Performance: {performanceMonitor.current.getRenderStats().totalRenders} renders
          </div>
        )}
      </div>
    </div>
  )
}

export default VirtualizedChatInterface