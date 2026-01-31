'use client'

import React, { useState, useEffect, useRef } from 'react'
import { m, AnimatePresence } from '@/components/ui/motion-provider'
import Icon from '@/components/ui/icon'
import { cn } from '@/lib/utils'
import { AIOrchestrator } from '@/services/ai/orchestrator'
import { GeneratedBusinessContent, StreamingAIResponse, BusinessAnalysis } from '@/services/ai/types'
import { parseBusinessIdea, BusinessIntelligence } from './idea-parser'
import { generateContent, GeneratedContent } from './content-orchestra'
import { generateCinematicTemplate, industryThemes } from './cinematic-templates'
import { questionFlow, buildStepTemplates } from './question-flow'
import { EnhancedPreview } from './enhanced-preview'
import { CacheStatus } from './cache-status'
import { logger } from '@/utils/logger';

interface OrchestrationInterfaceProps {
  initialIdea: string
  translations: {
    chat: {
      title: string
      thinking: string
    }
    preview: {
      title: string
      loading: string
    }
    buildLog: {
      title: string
      steps: {
        analyzing: string
        scaffolding: string
        generating: string
        styling: string
        deploying: string
      }
    }
  }
}

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

interface BuildStep {
  id: string
  label: string
  status: 'pending' | 'active' | 'complete'
  detail?: string
  progress?: number
}

interface OrchestrationState {
  intelligence: BusinessIntelligence | null
  generatedContent: GeneratedContent | null
  aiGeneratedContent: GeneratedBusinessContent | null
  aiAnalysis: BusinessAnalysis | null
  currentQuestionIndex: number
  buildProgress: number
  userChoices: Record<string, string>
  isStreamingAnalysis: boolean
  aiOrchestrator: AIOrchestrator
}

export function OrchestrationInterface({ initialIdea }: OrchestrationInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [buildSteps, setBuildSteps] = useState<BuildStep[]>([])
  const [isThinking, setIsThinking] = useState(false)
  const [selectedChips, setSelectedChips] = useState<Set<string>>(new Set())
  const [orchestrationState, setOrchestrationState] = useState<OrchestrationState>({
    intelligence: null,
    generatedContent: null,
    aiGeneratedContent: null,
    aiAnalysis: null,
    currentQuestionIndex: 0,
    buildProgress: 0,
    userChoices: {},
    isStreamingAnalysis: false,
    aiOrchestrator: new AIOrchestrator({
      prefersConciseResponses: false,
      previousInteractions: 0,
      preferredCommunicationStyle: 'detailed',
      riskTolerance: 'balanced'
    })
  })
  const [customInput, setCustomInput] = useState('')
  const [showCustomInput, setShowCustomInput] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLIFrameElement>(null)
  const customInputRef = useRef<HTMLInputElement>(null)

  // Helper function to handle streaming AI responses
  const handleStreamingChunk = (chunk: StreamingAIResponse): string => {
    switch (chunk.type) {
      case 'start':
        return '🔍 Starting business analysis...\n'
      case 'insight':
        return `💡 ${chunk.content}\n`
      case 'recommendation':
        return `✨ ${chunk.content}\n`
      case 'complete':
        return `🎉 ${chunk.content}\n`
      case 'error':
        return `⚠️ ${chunk.content}\n`
      default:
        return chunk.content ? `${chunk.content}\n` : ''
    }
  }

  // Initialize the orchestration with AI-powered analysis
  useEffect(() => {
    const initialMessage: ChatMessage = {
      id: '1',
      type: 'user',
      content: initialIdea,
      timestamp: new Date()
    }
    setMessages([initialMessage])
    
    // Start the AI-powered orchestration
    startOrchestration()
  }, [initialIdea]) // eslint-disable-line react-hooks/exhaustive-deps

  const startOrchestration = async () => {
    setIsGenerating(true)
    
    // Phase 1: Start AI-powered business analysis
    const analysisMessage: ChatMessage = {
      id: '2',
      type: 'system',
      content: 'Starting AI-powered business analysis...',
      timestamp: new Date(),
      isTyping: true
    }
    setMessages(prev => [...prev, analysisMessage])

    try {
      // Start streaming analysis with the AI orchestrator
      setOrchestrationState(prev => ({ ...prev, isStreamingAnalysis: true }))
      
      const aiMessageId = Date.now().toString()
      const aiStreamMessage: ChatMessage = {
        id: aiMessageId,
        type: 'ai',
        content: '',
        timestamp: new Date(),
        isTyping: true
      }
      setMessages(prev => [...prev.slice(0, -1), aiStreamMessage])

      // Stream the AI analysis
      const stream = orchestrationState.aiOrchestrator.analyzeBusinessIdeaStream(initialIdea)
      let streamContent = ''
      
      for await (const chunk of stream) {
        streamContent += handleStreamingChunk(chunk)
        
        setMessages(prev => {
          const newMessages = [...prev]
          const messageIndex = newMessages.findIndex(m => m.id === aiMessageId)
          if (messageIndex >= 0) {
            newMessages[messageIndex] = {
              ...newMessages[messageIndex],
              content: streamContent,
              isTyping: chunk.type !== 'complete'
            }
          }
          return newMessages
        })

        // Update build progress based on streaming updates
        if (chunk.metadata?.progress) {
          const progress = Math.floor(chunk.metadata.progress * 0.4) // Analysis is first 40%
          setOrchestrationState(prev => ({ ...prev, buildProgress: progress }))
        }
      }

      // Complete analysis and generate full business content
      const businessContent = await orchestrationState.aiOrchestrator.generateBusinessContent(initialIdea)
      
      // Parse the business idea intelligently (fallback)
      const intelligence = parseBusinessIdea(initialIdea)
      
      // Generate preview content
      const content = generateContent(intelligence)
      
      // Update orchestration state with AI results
      setOrchestrationState(prev => ({
        ...prev,
        intelligence,
        generatedContent: content,
        aiGeneratedContent: businessContent,
        aiAnalysis: businessContent.analysis,
        buildProgress: 50,
        isStreamingAnalysis: false
      }))

      // Initialize build steps
      const steps: BuildStep[] = [
        { id: '1', label: 'AI Business Analysis', status: 'complete', progress: 100 },
        { id: '2', label: 'Generating Names & Taglines', status: 'active', progress: 80 },
        { id: '3', label: 'Creating Features & Pricing', status: 'pending', progress: 0 },
        { id: '4', label: 'Building Content Strategy', status: 'pending', progress: 0 },
        { id: '5', label: 'Finalizing Experience', status: 'pending', progress: 0 },
      ]
      setBuildSteps(steps)

      // Generate and display initial preview with AI content
      await generatePreview(content)
      
      // Show AI insights
      const confidenceMessage: ChatMessage = {
        id: Date.now().toString(),
        type: 'insight',
        content: `Analysis complete! I've generated a comprehensive business plan with ${businessContent.names.length} name options, ${businessContent.taglines.length} taglines, and ${businessContent.features.length} recommended features.`,
        confidence: businessContent.metadata.confidence,
        insight: `Industry: ${businessContent.analysis.industry} • Type: ${businessContent.analysis.businessType} • Confidence: ${Math.round(businessContent.metadata.confidence * 100)}%`,
        timestamp: new Date()
      }
      setMessages(prev => [...prev, confidenceMessage])
      
      // Continue with build steps
      await simulateOrchestrationStep(1, steps, 'generating')
      
    } catch (error) {
      logger.error('AI orchestration failed:', error);
      
      // Fallback to basic analysis
      const intelligence = parseBusinessIdea(initialIdea)
      const content = generateContent(intelligence)
      
      setOrchestrationState(prev => ({
        ...prev,
        intelligence,
        generatedContent: content,
        buildProgress: 30,
        isStreamingAnalysis: false
      }))

      const errorMessage: ChatMessage = {
        id: Date.now().toString(),
        type: 'ai',
        content: 'I\'ve created a business foundation for you! Let\'s refine it together with some questions.',
        timestamp: new Date()
      }
      setMessages(prev => [...prev.slice(0, -1), errorMessage])
      
      // Generate basic preview
      await generatePreview(content)
    }
    
    setIsGenerating(false)
    
    // Ask the first contextual question
    askContextualQuestion()
  }

  const generatePreview = async (content: GeneratedContent) => {
    if (previewRef.current?.contentDocument) {
      const html = generateCinematicTemplate(content)
      const doc = previewRef.current.contentDocument
      
      doc.open()
      doc.write(html)
      doc.close()

      // Apply industry-specific theme
      const theme = industryThemes[orchestrationState.intelligence?.industry as keyof typeof industryThemes]
      if (theme) {
        const root = doc.documentElement
        Object.entries(theme).forEach(([property, value]) => {
          root.style.setProperty(`--${property}`, value)
        })
      }
    }
  }

  const simulateOrchestrationStep = async (stepIndex: number, steps: BuildStep[], stepType: keyof typeof buildStepTemplates) => {
    const messages = buildStepTemplates[stepType]?.messages || []
    
    // Animate progress for current step
    for (let progress = 0; progress <= 100; progress += 20) {
      await new Promise(resolve => setTimeout(resolve, 200))
      setBuildSteps(prev => {
        const updated = [...prev]
        if (updated[stepIndex]) {
          updated[stepIndex].progress = progress
          if (progress < 100 && messages.length > 0) {
            const messageIndex = Math.floor((progress / 100) * messages.length)
            updated[stepIndex].detail = messages[messageIndex]
          }
        }
        return updated
      })
    }
    
    // Complete current step and start next
    setBuildSteps(prev => {
      const updated = [...prev]
      if (updated[stepIndex]) {
        updated[stepIndex].status = 'complete'
        updated[stepIndex].detail = undefined
        updated[stepIndex].progress = 100
      }
      if (updated[stepIndex + 1]) {
        updated[stepIndex + 1].status = 'active'
      }
      return updated
    })

    // Update overall progress
    setOrchestrationState(prev => ({
      ...prev,
      buildProgress: Math.min(prev.buildProgress + 20, 100)
    }))
  }

  const askContextualQuestion = () => {
    const { intelligence, aiGeneratedContent, aiAnalysis, currentQuestionIndex } = orchestrationState
    
    if (!intelligence || currentQuestionIndex >= questionFlow.length) {
      finalizeOrchestration()
      return
    }
    
    const question = questionFlow[currentQuestionIndex]
    
    // Customize question based on AI analysis and generated content
    let customizedQuestion = question.text
    let customizedChips = [...question.chips]
    
    if (question.type === 'business_type' && intelligence.confidence > 0.7) {
      customizedQuestion = `Perfect! I can see this is ${intelligence.industry}. Let's make it even better - what's your main focus?`
      customizedChips = getIndustrySpecificOptions(intelligence.industry)
    }
    
    if (question.type === 'brand_name' && aiGeneratedContent?.names.length) {
      customizedQuestion = `I've generated ${aiGeneratedContent.names.length} unique business names for you! Which direction feels right?`
      // Use top 4 AI-generated names as options
      const topNames = aiGeneratedContent.names.slice(0, 4).map(n => n.name)
      customizedChips = [...topNames, 'Use AI suggestion', "I'll type my own"]
    }
    
    if (question.type === 'color_theme' && aiAnalysis) {
      customizedQuestion = `Based on your ${aiAnalysis.brandPersonality.join(' & ').toLowerCase()} brand personality, what color palette captures your vision?`
      customizedChips = getIndustryColors(aiAnalysis.industry)
    }

    // Add features question if we have AI recommendations
    if (question.type === 'features' && aiGeneratedContent?.features.length) {
      const mustHaveFeatures = aiGeneratedContent.features.filter(f => f.priority === 'must_have')
      customizedQuestion = `I've identified ${mustHaveFeatures.length} essential features for your business. Which would you like to prioritize first?`
      customizedChips = mustHaveFeatures.slice(0, 4).map(f => f.name)
      customizedChips.push('Show all features', 'Let AI decide')
    }

    const aiMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'ai',
      content: customizedQuestion,
      chips: customizedChips,
      timestamp: new Date(),
      isTyping: true
    }
    
    // Animate typing effect
    setMessages(prev => [...prev, { ...aiMessage, content: '' }])
    
    let charIndex = 0
    const typeInterval = setInterval(() => {
      if (charIndex < customizedQuestion.length) {
        setMessages(prev => {
          const newMessages = [...prev]
          const lastMessage = newMessages[newMessages.length - 1]
          lastMessage.content = customizedQuestion.slice(0, charIndex + 1)
          return newMessages
        })
        charIndex++
      } else {
        clearInterval(typeInterval)
        setMessages(prev => {
          const newMessages = [...prev]
          const lastMessage = newMessages[newMessages.length - 1]
          lastMessage.isTyping = false
          return newMessages
        })
      }
    }, 20)
  }

  const handleChipSelect = async (chip: string) => {
    // Handle special interactions
    if (chip === "I'll type my own") {
      setShowCustomInput(true)
      setTimeout(() => customInputRef.current?.focus(), 100)
      return
    }
    
    // Use AI-generated suggestions when available
    if (chip === 'Use AI suggestion' && orchestrationState.aiGeneratedContent) {
      const currentQuestion = questionFlow[orchestrationState.currentQuestionIndex]
      if (currentQuestion.type === 'brand_name' && orchestrationState.aiGeneratedContent.names.length > 0) {
        // Use the top-rated AI-generated name
        const topName = orchestrationState.aiGeneratedContent.names[0]
        chip = topName.name
      } else if (orchestrationState.intelligence) {
        const suggestions = generateSmartSuggestions(orchestrationState.intelligence)
        chip = suggestions[Math.floor(Math.random() * suggestions.length)]
      }
    }
    
    // Visual feedback with orchestration flair
    setSelectedChips(prev => new Set([...prev, chip]))
    
    // Add user response with confidence indicator
    const userResponse: ChatMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: chip,
      timestamp: new Date()
    }
    setMessages(prev => [...prev, userResponse])
    
    // Store user choice
    const currentQuestion = questionFlow[orchestrationState.currentQuestionIndex]
    setOrchestrationState(prev => ({
      ...prev,
      userChoices: { ...prev.userChoices, [currentQuestion.type]: chip },
      currentQuestionIndex: prev.currentQuestionIndex + 1
    }))
    
    // Orchestrated thinking phase with AI context
    setIsThinking(true)
    
    // Show AI insights about the selection
    if (orchestrationState.aiGeneratedContent) {
      const thinkingMessage: ChatMessage = {
        id: Date.now().toString(),
        type: 'ai',
        content: generateAIInsightForSelection(currentQuestion.type, chip),
        timestamp: new Date(),
        isTyping: true
      }
      setMessages(prev => [...prev, thinkingMessage])
      
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      setMessages(prev => {
        const updated = [...prev]
        updated[updated.length - 1].isTyping = false
        return updated
      })
    }
    
    // Show dramatic preview transformation
    await applyOrchestrationEffect(currentQuestion.type, chip)
    
    // Continue build process
    const activeStepIndex = buildSteps.findIndex(s => s.status === 'active')
    if (activeStepIndex >= 0 && activeStepIndex < buildSteps.length - 1) {
      const stepTypes: (keyof typeof buildStepTemplates)[] = ['generating', 'styling', 'features']
      await simulateOrchestrationStep(activeStepIndex, buildSteps, stepTypes[activeStepIndex - 1] || 'generating')
    }
    
    setIsThinking(false)
    
    // Continue orchestration
    askContextualQuestion()
  }

  const applyOrchestrationEffect = async (questionType: string, selection: string) => {
    const { intelligence, generatedContent } = orchestrationState
    
    if (!intelligence || !generatedContent || !previewRef.current?.contentDocument) return

    const doc = previewRef.current.contentDocument
    
    // Create dramatic visual changes based on selection
    switch (questionType) {
      case 'business_type':
        // Transform entire layout
        const updatedIntelligence = { ...intelligence, type: selection.toLowerCase().replace(' ', '') as BusinessIntelligence['type'] }
        const newContent = generateContent(updatedIntelligence)
        await generatePreview(newContent)
        setOrchestrationState(prev => ({ ...prev, intelligence: updatedIntelligence, generatedContent: newContent }))
        break
        
      case 'color_theme':
        // Apply color transformation with animation
        const themeColors = getColorTheme(selection)
        const root = doc.documentElement
        
        // Animate color transition
        Object.entries(themeColors).forEach(([property, value]) => {
          root.style.setProperty(`--${property}`, value)
        })
        break
        
      case 'brand_name':
        // Update brand name across preview
        const updatedIntelligenceWithName = { ...intelligence, businessName: selection }
        const updatedContent = generateContent(updatedIntelligenceWithName)
        await generatePreview(updatedContent)
        setOrchestrationState(prev => ({ ...prev, intelligence: updatedIntelligenceWithName, generatedContent: updatedContent }))
        break
    }
    
    // Add subtle satisfaction animations
    const elements = doc.querySelectorAll('.morphing-element')
    elements.forEach((el, index) => {
      setTimeout(() => {
        el.classList.add('content-update')
        setTimeout(() => el.classList.remove('content-update'), 600)
      }, index * 100)
    })
  }

  const finalizeOrchestration = async () => {
    const { aiGeneratedContent } = orchestrationState
    
    let finalContent = "🎉 Magnificent! Your business is ready to launch. You've orchestrated something truly special."
    
    // Add AI-generated content summary if available
    if (aiGeneratedContent) {
      const totalGeneratedItems = aiGeneratedContent.names.length + 
                                   aiGeneratedContent.taglines.length + 
                                   aiGeneratedContent.features.length + 
                                   aiGeneratedContent.pricing.tiers.length
      
      const generationTime = Math.round(aiGeneratedContent.metadata.generationTime / 1000)
      const confidence = Math.round(aiGeneratedContent.metadata.confidence * 100)
      
      finalContent = `🎉 Outstanding! I've generated ${totalGeneratedItems} pieces of content in ${generationTime}s with ${confidence}% confidence. Your AI-powered business is ready to captivate the world!`
    }
    
    const finalMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'ai',
      content: finalContent,
      chips: ['Deploy Now', 'Add More Features', 'Preview on Mobile', 'Share Preview', 'Download Business Plan'],
      timestamp: new Date()
    }
    setMessages(prev => [...prev, finalMessage])
    
    // Complete all remaining steps
    setBuildSteps(prev => prev.map(step => ({ ...step, status: 'complete', progress: 100 })))
    setOrchestrationState(prev => ({ ...prev, buildProgress: 100 }))
  }

  // Helper functions
  const getIndustrySpecificOptions = (industry: string): string[] => {
    const options: Record<string, string[]> = {
      'Food & Beverage': ['Restaurant', 'Food Delivery', 'Catering', 'Food Truck', 'Bakery'],
      'Fashion & Accessories': ['Boutique', 'Online Store', 'Custom Design', 'Marketplace', 'Subscription Box'],
      'Technology': ['SaaS Platform', 'Mobile App', 'Web Service', 'API Business', 'Tech Consulting']
    }
    return options[industry] || ['Service Business', 'Online Store', 'Consulting', 'Marketplace', 'Other']
  }

  const getIndustryColors = (industry: string): string[] => {
    const colors: Record<string, string[]> = {
      'Food & Beverage': ['Warm Orange', 'Fresh Green', 'Rich Red', 'Golden Yellow'],
      'Fashion & Accessories': ['Elegant Pink', 'Luxury Purple', 'Classic Black', 'Rose Gold'],
      'Technology': ['Tech Blue', 'Innovation Purple', 'Modern Cyan', 'Professional Gray']
    }
    return colors[industry] || ['Purple Passion', 'Ocean Blue', 'Forest Green', 'Sunset Orange']
  }

  const getColorTheme = (themeName: string): Record<string, string> => {
    const themes: Record<string, Record<string, string>> = {
      'Purple Passion': { primary: '#8b5cf6', secondary: '#ec4899', accent: '#06b6d4' },
      'Ocean Blue': { primary: '#3b82f6', secondary: '#06b6d4', accent: '#10b981' },
      'Warm Orange': { primary: '#f97316', secondary: '#ef4444', accent: '#84cc16' },
      'Elegant Pink': { primary: '#ec4899', secondary: '#8b5cf6', accent: '#06b6d4' }
    }
    return themes[themeName] || themes['Purple Passion']
  }

  const generateSmartSuggestions = (intelligence: BusinessIntelligence): string[] => {
    const industry = intelligence.industry
    const suggestions: Record<string, string[]> = {
      'Food & Beverage': ['Savory Kitchen', 'Fresh Bites', 'Flavor House', 'Taste Hub'],
      'Fashion & Accessories': ['Bella Studio', 'Luxe Collection', 'Style Haven', 'Chic Boutique'],
      'Technology': ['Smart Solutions', 'Tech Flow', 'Data Works', 'Cloud Hub']
    }
    return suggestions[industry] || ['Smart Business', 'Pro Solutions', 'Elite Services']
  }

  const generateAIInsightForSelection = (questionType: string, selection: string): string => {
    const { aiGeneratedContent, aiAnalysis } = orchestrationState
    
    if (!aiGeneratedContent || !aiAnalysis) {
      return `Great choice! "${selection}" aligns well with your business vision.`
    }

    switch (questionType) {
      case 'brand_name':
        const matchingName = aiGeneratedContent.names.find(n => n.name === selection)
        if (matchingName) {
          return `Excellent! "${selection}" scores ${matchingName.brandFit.toFixed(1)}/1.0 for brand fit. ${matchingName.reasoning}`
        }
        return `"${selection}" is a strong choice that reflects your ${aiAnalysis.brandPersonality.join(', ').toLowerCase()} brand personality.`
      
      case 'color_theme':
        return `Perfect! This color palette complements your ${aiAnalysis.industry.toLowerCase()} business and will resonate with ${aiAnalysis.targetAudience.toLowerCase()}.`
      
      case 'business_type':
        const features = aiGeneratedContent.features.filter(f => f.priority === 'must_have')
        return `Smart choice! Based on this direction, I recommend focusing on ${features.length} core features including ${features[0]?.name || 'essential functionality'}.`
      
      default:
        return `Great selection! This aligns perfectly with your ${aiAnalysis.communicationStyle} communication style and ${aiAnalysis.businessModel} business model.`
    }
  }

  const handleCustomSubmit = () => {
    if (!customInput.trim()) return
    
    setShowCustomInput(false)
    handleChipSelect(customInput)
    setCustomInput('')
  }

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="fixed inset-0 bg-gray-950 flex">
      {/* Left Panel - Orchestration Chat */}
      <m.div
        initial={{ x: -300, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        className="w-80 border-r border-gray-800 flex flex-col bg-gray-900/50"
      >
        <div className="p-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Icon name="brain" className="w-5 h-5 text-purple-400"  />
            AI Orchestrator
          </h2>
          <div className="mt-2 flex items-center gap-2">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <span className="text-xs text-gray-400">Orchestrating your vision</span>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <AnimatePresence>
            {messages.map((message, index) => (
              <m.div
                key={message.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ delay: index * 0.05 }}
                className={cn(
                  'rounded-lg p-3',
                  message.type === 'user' 
                    ? 'bg-purple-600/20 ml-8' 
                    : message.type === 'insight'
                    ? 'bg-blue-600/20 mr-8 border border-blue-500/30'
                    : message.type === 'system'
                    ? 'bg-gray-700/30 mr-8'
                    : 'bg-gray-800/50 mr-8'
                )}
              >
                <div className="flex items-start gap-2">
                  {message.type === 'ai' && (
                    <Icon name="sparkles" className="w-4 h-4 text-purple-400 mt-1 flex-shrink-0"  />
                  )}
                  {message.type === 'insight' && (
                    <Icon name="brain" className="w-4 h-4 text-blue-400 mt-1 flex-shrink-0"  />
                  )}
                  {message.type === 'system' && (
                    <Icon name="zap" className="w-4 h-4 text-yellow-400 mt-1 flex-shrink-0"  />
                  )}
                  <div className="flex-1">
                    <p className="text-sm">
                      {message.content}
                      {message.isTyping && (
                        <span className="inline-block w-1 h-4 bg-purple-400 ml-1 animate-pulse" />
                      )}
                    </p>
                    
                    {message.insight && (
                      <p className="text-xs text-blue-300 mt-1 opacity-80">
                        {message.insight}
                      </p>
                    )}
                    
                    {message.confidence && (
                      <div className="mt-2 flex items-center gap-2">
                        <div className="flex-1 h-1 bg-gray-700 rounded-full overflow-hidden">
                          <m.div
                            className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
                            initial={{ width: 0 }}
                            animate={{ width: `${message.confidence * 100}%` }}
                            transition={{ duration: 1 }}
                          />
                        </div>
                        <span className="text-xs text-gray-400">
                          {Math.round(message.confidence * 100)}% confident
                        </span>
                      </div>
                    )}
                    
                    {message.chips && !message.isTyping && (
                      <div className="mt-3 space-y-2">
                        <AnimatePresence>
                          {message.chips.map((chip, chipIndex) => (
                            <m.button
                              key={chip}
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: chipIndex * 0.1 }}
                              onClick={() => handleChipSelect(chip)}
                              disabled={selectedChips.has(chip)}
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              className={cn(
                                'w-full text-left px-3 py-2 rounded-md text-sm transition-all',
                                'bg-gray-700/50 hover:bg-gray-700 border border-gray-600/50',
                                'hover:border-purple-500/50 hover:shadow-lg hover:shadow-purple-500/10',
                                'flex items-center justify-between group',
                                selectedChips.has(chip) && 'opacity-50 cursor-not-allowed'
                              )}
                            >
                              <span>{chip}</span>
                              <Icon name="chevron-right" className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity"  />
                            </m.button>
                          ))}
                        </AnimatePresence>
                        
                        {showCustomInput && (
                          <m.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            className="flex gap-2"
                          >
                            <input
                              ref={customInputRef}
                              type="text"
                              value={customInput}
                              onChange={(e) => setCustomInput(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && handleCustomSubmit()}
                              placeholder="Type your answer..."
                              className="flex-1 px-3 py-2 rounded-md text-sm bg-gray-800 border border-gray-700 focus:border-purple-500 focus:outline-none"
                            />
                            <button
                              onClick={handleCustomSubmit}
                              className="p-2 rounded-md bg-purple-600 hover:bg-purple-700 transition-colors"
                            >
                              <Icon name="send" className="w-4 h-4"  />
                            </button>
                          </m.div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </m.div>
            ))}
          </AnimatePresence>
          
          {isThinking && (
            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-2 text-gray-400 text-sm ml-8"
            >
              <Icon name="sparkles" className="w-4 h-4 animate-pulse"  />
              Orchestrating changes...
            </m.div>
          )}
          
          <div ref={chatEndRef} />
        </div>
      </m.div>

      {/* Center - Cinematic Preview */}
      <div className="flex-1 flex flex-col bg-gray-950">
        <m.div
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="p-4 border-b border-gray-800 flex items-center justify-between"
        >
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Icon name="globe" className="w-5 h-5 text-blue-400"  />
            Live Preview
          </h2>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1 bg-gray-800 rounded-full text-xs">
              <Icon name="rocket" className="w-3 h-3 text-green-400"  />
              <span className="text-gray-400">Building</span>
              <div className="w-12 h-1 bg-gray-700 rounded-full overflow-hidden">
                <m.div
                  className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${orchestrationState.buildProgress}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
            </div>
            
            {/* AI Service Status */}
            <div className="flex items-center gap-2 px-3 py-1 bg-green-900/50 rounded-full text-xs">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              <span className="text-green-300">Real AI</span>
            </div>
            
            {/* Cache Status */}
            <div className="relative">
              <CacheStatus />
            </div>
            
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full bg-red-500" />
              <div className="w-3 h-3 rounded-full bg-yellow-500" />
              <div className="w-3 h-3 rounded-full bg-green-500" />
            </div>
          </div>
        </m.div>
        
        <div className="flex-1 p-4">
          <m.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="w-full h-full"
          >
            <EnhancedPreview
              content={orchestrationState.aiGeneratedContent}
              analysis={orchestrationState.aiAnalysis}
              isGenerating={isGenerating}
              onEdit={(section) => logger.info('Edit section:', section)}
              onRegenerate={(section) => logger.info('Regenerate section:', section)}
            />
          </m.div>
        </div>
      </div>

      {/* Right Panel - Orchestration Progress */}
      <m.div
        initial={{ x: 300, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        className="w-72 border-l border-gray-800 flex flex-col bg-gray-900/50"
      >
        <div className="p-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Icon name="code" className="w-5 h-5 text-green-400"  />
            Build Orchestra
          </h2>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-4">
            {/* Overall Progress */}
            <div className="bg-gray-800/50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Overall Progress</span>
                <span className="text-sm text-purple-400">{orchestrationState.buildProgress}%</span>
              </div>
              <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                <m.div
                  className="h-full bg-gradient-to-r from-purple-600 to-pink-600"
                  initial={{ width: 0 }}
                  animate={{ width: `${orchestrationState.buildProgress}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
            </div>

            {/* Build Steps */}
            <div className="space-y-3">
              <AnimatePresence>
                {buildSteps.map((step, index) => (
                  <m.div
                    key={step.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className={cn(
                      'bg-gray-800/30 rounded-lg p-3 border',
                      step.status === 'complete' ? 'border-green-500/30 bg-green-500/5' :
                      step.status === 'active' ? 'border-purple-500/30 bg-purple-500/5' :
                      'border-gray-700/30'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      {step.status === 'complete' ? (
                        <Icon name="check-circle" className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0"  />
                      ) : step.status === 'active' ? (
                        <m.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                          className="flex-shrink-0"
                        >
                          <Icon name="zap" className="w-5 h-5 text-purple-400 mt-0.5"  />
                        </m.div>
                      ) : (
                        <Icon name="circle" className="w-5 h-5 text-gray-600 mt-0.5 flex-shrink-0"  />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          'text-sm font-medium',
                          step.status === 'active' && 'text-purple-400',
                          step.status === 'complete' && 'text-green-400'
                        )}>
                          {step.label}
                        </p>
                        <AnimatePresence>
                          {step.detail && (
                            <m.p
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              className="text-xs text-gray-500 mt-1"
                            >
                              {step.detail}
                            </m.p>
                          )}
                        </AnimatePresence>
                        {step.status === 'active' && step.progress !== undefined && (
                          <div className="mt-2 w-full h-1 bg-gray-700 rounded-full overflow-hidden">
                            <m.div
                              className="h-full bg-purple-500"
                              initial={{ width: 0 }}
                              animate={{ width: `${step.progress}%` }}
                              transition={{ duration: 0.3 }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </m.div>
                ))}
              </AnimatePresence>
            </div>

            {/* AI Intelligence Insights */}
            {orchestrationState.aiAnalysis && (
              <m.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-gray-800/30 rounded-lg p-4 border border-blue-500/30"
              >
                <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <Icon name="brain" className="w-4 h-4 text-blue-400"  />
                  AI Analysis
                </h3>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Business Type:</span>
                    <span className="text-blue-300 capitalize">{orchestrationState.aiAnalysis.businessType}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Industry:</span>
                    <span className="text-blue-300">{orchestrationState.aiAnalysis.industry}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Revenue Model:</span>
                    <span className="text-blue-300">{orchestrationState.aiAnalysis.revenueModel.replace('_', ' ')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Confidence:</span>
                    <span className="text-blue-300">
                      {Math.round(orchestrationState.aiAnalysis.confidence * 100)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Target Audience:</span>
                    <span className="text-blue-300 truncate" title={orchestrationState.aiAnalysis.targetAudience}>
                      {orchestrationState.aiAnalysis.targetAudience.slice(0, 20)}...
                    </span>
                  </div>
                </div>
              </m.div>
            )}

            {/* AI Generated Content Summary */}
            {orchestrationState.aiGeneratedContent && (
              <m.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-gray-800/30 rounded-lg p-4 border border-purple-500/30"
              >
                <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <Icon name="sparkles" className="w-4 h-4 text-purple-400"  />
                  Generated Content
                </h3>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Business Names:</span>
                    <span className="text-purple-300">{orchestrationState.aiGeneratedContent.names.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Taglines:</span>
                    <span className="text-purple-300">{orchestrationState.aiGeneratedContent.taglines.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Features:</span>
                    <span className="text-purple-300">{orchestrationState.aiGeneratedContent.features.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Pricing Tiers:</span>
                    <span className="text-purple-300">{orchestrationState.aiGeneratedContent.pricing.tiers.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Generation Time:</span>
                    <span className="text-purple-300">{Math.round(orchestrationState.aiGeneratedContent.metadata.generationTime / 1000)}s</span>
                  </div>
                </div>
              </m.div>
            )}
          </div>
        </div>
      </m.div>
    </div>
  )
}