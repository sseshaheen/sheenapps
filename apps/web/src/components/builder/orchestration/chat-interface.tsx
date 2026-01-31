'use client'

import React, { useState, useEffect, useRef } from 'react'
import { m, AnimatePresence } from '@/components/ui/motion-provider'
import Icon from '@/components/ui/icon'


import { cn } from '@/lib/utils'
import { apiPost } from '@/lib/client/api-fetch'
import { logger } from '@/utils/logger'
import { useAuthStore } from '@/store'

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

interface ChatInterfaceProps {
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

export function ChatInterface({
  initialIdea,
  onAnalysisComplete,
  onProgressUpdate,
  translations
}: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isThinking, setIsThinking] = useState(false)
  const [selectedChips, setSelectedChips] = useState<Set<string>>(new Set())
  const [customInput, setCustomInput] = useState('')
  const [showCustomInput, setShowCustomInput] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const customInputRef = useRef<HTMLInputElement>(null)
  
  // AI processing now handled by Worker API
  const [isAIReady, setIsAIReady] = useState(true)

  // Simulate streaming response for UI feedback
  const simulateAnalysisStream = async (callback: (content: string) => void) => {
    const steps = [
      '🔍 Starting business analysis...',
      '💡 Analyzing your business concept...',
      '🎯 Identifying target market...',
      '✨ Generating feature recommendations...',
      '🎨 Designing user interface...',
      '🚀 Preparing project structure...',
      '🎉 Analysis complete! Your project is being built...'
    ]
    
    for (let i = 0; i < steps.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 800))
      callback(steps.slice(0, i + 1).join('\n\n'))
      if (onProgressUpdate) {
        onProgressUpdate(Math.floor((i + 1) / steps.length * 100))
      }
    }
  }

  // Initialize chat with AI analysis
  useEffect(() => {
    const initialMessage: ChatMessage = {
      id: '1',
      type: 'user',
      content: initialIdea,
      timestamp: new Date()
    }
    setMessages([initialMessage])
    
    // Start AI analysis simulation
    if (isAIReady) {
      startAIAnalysis()
    }
  }, [initialIdea, isAIReady])

  const startAIAnalysis = async () => {
    setIsGenerating(true)
    
    const analysisMessage: ChatMessage = {
      id: '2',
      type: 'system',
      content: 'Starting AI-powered business analysis...',
      timestamp: new Date(),
      isTyping: true
    }
    setMessages(prev => [...prev, analysisMessage])

    try {
      const aiMessageId = Date.now().toString()
      const aiStreamMessage: ChatMessage = {
        id: aiMessageId,
        type: 'ai',
        content: '',
        timestamp: new Date(),
        isTyping: true
      }
      setMessages(prev => [...prev.slice(0, -1), aiStreamMessage])

      // Simulate streaming AI analysis for UI feedback
      await simulateAnalysisStream((content) => {
        setMessages(prev => {
          const newMessages = [...prev]
          const messageIndex = newMessages.findIndex(m => m.id === aiMessageId)
          if (messageIndex >= 0) {
            newMessages[messageIndex] = {
              ...newMessages[messageIndex],
              content,
              isTyping: true
            }
          }
          return newMessages
        })
      })

      // Complete the typing animation
      setMessages(prev => {
        const newMessages = [...prev]
        const messageIndex = newMessages.findIndex(m => m.id === aiMessageId)
        if (messageIndex >= 0) {
          newMessages[messageIndex] = {
            ...newMessages[messageIndex],
            isTyping: false
          }
        }
        return newMessages
      })
      
      // Notify parent that analysis UI is complete
      // Note: Actual analysis happens in the Worker API during project creation
      const mockBusinessContent = {
        names: ['Business App', 'Smart Solution', 'Pro Platform'],
        taglines: ['Your business, simplified', 'Smart solutions for modern business'],
        features: ['User dashboard', 'Analytics', 'Mobile responsive'],
        analysis: { industry: 'Technology', businessType: 'SaaS' },
        metadata: { confidence: 0.85 }
      }
      onAnalysisComplete?.(mockBusinessContent)
      
      // Show completion message
      const confidenceMessage: ChatMessage = {
        id: Date.now().toString(),
        type: 'insight',
        content: 'Analysis complete! Your project is now being built using our advanced AI system. Real-time progress will be shown once the build begins.',
        confidence: 0.85,
        insight: 'Project ready for Worker API build system',
        timestamp: new Date()
      }
      setMessages(prev => [...prev, confidenceMessage])
      
    } catch (error) {
      logger.error('AI analysis simulation failed:', error)
      
      const errorMessage: ChatMessage = {
        id: Date.now().toString(),
        type: 'system',
        content: 'Analysis interface failed. The project build will continue normally.',
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsGenerating(false)
    }
  }

  const handleCustomInput = () => {
    if (!customInput.trim()) return
    
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: customInput,
      timestamp: new Date()
    }
    
    setMessages(prev => [...prev, userMessage])
    setCustomInput('')
    setShowCustomInput(false)
    
    // Process user input with AI
    processUserInput(customInput)
  }

  const processUserInput = async (input: string) => {
    setIsThinking(true)
    
    // Simulate AI thinking
    setTimeout(() => {
      const aiResponse: ChatMessage = {
        id: Date.now().toString(),
        type: 'ai',
        content: `I understand you'd like to ${input.toLowerCase()}. Let me help you with that!`,
        timestamp: new Date()
      }
      setMessages(prev => [...prev, aiResponse])
      setIsThinking(false)
    }, 2000)
  }

  // Auto-scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="w-80 border-r border-gray-800 flex flex-col bg-gray-900/50">
      {/* Header */}
      <div className="p-4 border-b border-gray-800">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Icon name="brain" className="w-5 h-5 text-purple-400"  />
          {translations.chat.title}
        </h2>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <AnimatePresence>
          {messages.map((message) => (
            <m.div
              key={message.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className={cn(
                "flex flex-col gap-2",
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
                      <div className="flex space-x-1">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                      </div>
                      <span className="text-xs text-gray-400">{translations.chat.thinking}</span>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  )}
                </div>
              )}
              
              <span className="text-xs text-gray-500">
                {message.timestamp.toLocaleTimeString()}
              </span>
            </m.div>
          ))}
        </AnimatePresence>
        
        {isThinking && (
          <m.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 text-gray-400 text-sm"
          >
            <Icon name="brain" className="w-4 h-4 animate-pulse"  />
            <span>AI is thinking...</span>
          </m.div>
        )}
        
        <div ref={chatEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-gray-800">
        {showCustomInput ? (
          <div className="flex gap-2">
            <input
              ref={customInputRef}
              type="text"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleCustomInput()}
              placeholder="Ask me anything..."
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:border-purple-500"
            />
            <button
              onClick={handleCustomInput}
              disabled={!customInput.trim()}
              className="px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Icon name="send" className="w-4 h-4"  />
            </button>
          </div>
        ) : (
          <button
            onClick={() => {
              setShowCustomInput(true)
              setTimeout(() => customInputRef.current?.focus(), 100)
            }}
            className="w-full p-3 bg-gray-800 border border-gray-700 rounded-lg text-gray-400 hover:bg-gray-700 hover:text-gray-300 transition-colors text-left"
          >
            Ask me anything about your business...
          </button>
        )}
      </div>
    </div>
  )
}