'use client'

import React, { useState, useEffect, useRef } from 'react'
import { m, AnimatePresence } from '@/components/ui/motion-provider'
import Icon from '@/components/ui/icon'
import { cn } from '@/lib/utils'
import { baseStyles, templates, colorThemes, businessNames } from './preview-templates'
import { questionFlow, buildStepTemplates } from './question-flow'

interface BuilderInterfaceV2Props {
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
  type: 'ai' | 'user' | 'system'
  content: string
  chips?: string[]
  timestamp: Date
  isTyping?: boolean
}

interface BuildStep {
  id: string
  label: string
  status: 'pending' | 'active' | 'complete'
  detail?: string
}

interface BuilderState {
  businessType?: string
  colorTheme?: string
  brandName?: string
  features: string[]
  targetAudience?: string
}

export function BuilderInterface({ initialIdea, translations }: BuilderInterfaceV2Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [buildSteps, setBuildSteps] = useState<BuildStep[]>([])
  const [isThinking, setIsThinking] = useState(false)
  const [selectedChips, setSelectedChips] = useState<Set<string>>(new Set())
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [builderState, setBuilderState] = useState<BuilderState>({ features: [] })
  const [customInput, setCustomInput] = useState('')
  const [showCustomInput, setShowCustomInput] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLIFrameElement>(null)
  const customInputRef = useRef<HTMLInputElement>(null)

  // Initialize with the user's idea
  useEffect(() => {
    const initialMessage: ChatMessage = {
      id: '1',
      type: 'user',
      content: initialIdea,
      timestamp: new Date()
    }
    setMessages([initialMessage])
    
    // Start the building process
    startBuilding()
  }, [initialIdea]) // eslint-disable-line react-hooks/exhaustive-deps

  const startBuilding = async () => {
    // Add initial build steps
    const steps: BuildStep[] = [
      { id: '1', label: translations.buildLog.steps.analyzing, status: 'active' },
      { id: '2', label: translations.buildLog.steps.scaffolding, status: 'pending' },
      { id: '3', label: translations.buildLog.steps.generating, status: 'pending' },
      { id: '4', label: translations.buildLog.steps.styling, status: 'pending' },
    ]
    setBuildSteps(steps)

    // Initial preview
    updatePreview('initial')
    
    // Simulate initial analysis with dynamic messages
    await simulateStepWithMessages(0, steps, 'analyzing')
    
    // Ask first question
    askNextQuestion()
  }

  const simulateStepWithMessages = async (stepIndex: number, steps: BuildStep[], stepType: keyof typeof buildStepTemplates) => {
    const messages = buildStepTemplates[stepType]?.messages || []
    
    for (let i = 0; i < messages.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 500))
      const updatedSteps = [...steps]
      updatedSteps[stepIndex].detail = messages[i]
      setBuildSteps([...updatedSteps])
    }
    
    await new Promise(resolve => setTimeout(resolve, 500))
    
    const updatedSteps = [...steps]
    updatedSteps[stepIndex].status = 'complete'
    updatedSteps[stepIndex].detail = undefined
    if (stepIndex + 1 < updatedSteps.length) {
      updatedSteps[stepIndex + 1].status = 'active'
    }
    setBuildSteps(updatedSteps)
  }

  const updatePreview = (template: keyof typeof templates | 'custom', customHtml?: string) => {
    if (previewRef.current?.contentDocument) {
      const doc = previewRef.current.contentDocument
      const html = customHtml || (template === 'custom' ? templates.initial.html : templates[template]?.html) || templates.initial.html
      
      doc.open()
      doc.write(`
        ${baseStyles}
        <body>
          ${html}
        </body>
      `)
      doc.close()
      
      // Apply color theme if set
      if (builderState.colorTheme && colorThemes[builderState.colorTheme as keyof typeof colorThemes]) {
        const theme = colorThemes[builderState.colorTheme as keyof typeof colorThemes]
        const root = doc.documentElement
        root.style.setProperty('--primary', theme.primary)
        root.style.setProperty('--secondary', theme.secondary)
        root.style.setProperty('--accent', theme.accent)
      }
      
      // Apply brand name if set
      if (builderState.brandName) {
        const logos = doc.querySelectorAll('.logo')
        logos.forEach(logo => {
          if (logo) logo.textContent = builderState.brandName || 'Your Business'
        })
      }
    }
  }

  const askNextQuestion = () => {
    if (currentQuestionIndex >= questionFlow.length) {
      // All questions asked, finalize
      finalizeBuild()
      return
    }
    
    const question = questionFlow[currentQuestionIndex]
    const aiMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'ai',
      content: question.text,
      chips: question.chips,
      timestamp: new Date(),
      isTyping: true
    }
    
    // Simulate typing effect
    setMessages(prev => [...prev, { ...aiMessage, content: '' }])
    
    let charIndex = 0
    const typeInterval = setInterval(() => {
      if (charIndex < question.text.length) {
        setMessages(prev => {
          const newMessages = [...prev]
          const lastMessage = newMessages[newMessages.length - 1]
          lastMessage.content = question.text.slice(0, charIndex + 1)
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
    // Handle special chips
    if (chip === "I'll type my own") {
      setShowCustomInput(true)
      setTimeout(() => customInputRef.current?.focus(), 100)
      return
    }
    
    if (chip === 'Use AI suggestion') {
      const suggestions = businessNames[builderState.businessType as keyof typeof businessNames] || ['YourBusiness']
      chip = suggestions[Math.floor(Math.random() * suggestions.length)]
    }
    
    // Add visual feedback
    setSelectedChips(prev => new Set([...prev, chip]))
    
    // Add user response
    const userResponse: ChatMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: chip,
      timestamp: new Date()
    }
    setMessages(prev => [...prev, userResponse])
    
    // Update builder state
    const currentQuestion = questionFlow[currentQuestionIndex]
    updateBuilderState(currentQuestion.type, chip)
    
    // Start thinking animation
    setIsThinking(true)
    
    // Simulate processing
    await new Promise(resolve => setTimeout(resolve, 800))
    
    // Update preview based on selection
    applySelectionToPreview(currentQuestion.type, chip)
    
    // Continue build steps
    const currentStepIndex = buildSteps.findIndex(s => s.status === 'active')
    if (currentStepIndex >= 0 && currentStepIndex < buildSteps.length - 1) {
      const stepTypes: (keyof typeof buildStepTemplates)[] = ['scaffolding', 'generating', 'styling', 'features']
      await simulateStepWithMessages(currentStepIndex, buildSteps, stepTypes[currentStepIndex] || 'scaffolding')
    }
    
    setIsThinking(false)
    
    // Move to next question
    setCurrentQuestionIndex(prev => prev + 1)
    askNextQuestion()
  }

  const handleCustomSubmit = () => {
    if (!customInput.trim()) return
    
    setShowCustomInput(false)
    handleChipSelect(customInput)
    setCustomInput('')
  }

  const updateBuilderState = (type: string, value: string) => {
    setBuilderState(prev => {
      switch (type) {
        case 'business_type':
          return { ...prev, businessType: value }
        case 'color_theme':
          return { ...prev, colorTheme: value }
        case 'brand_name':
          return { ...prev, brandName: value }
        case 'features':
          return { ...prev, features: [...prev.features, value] }
        case 'target_audience':
          return { ...prev, targetAudience: value }
        default:
          return prev
      }
    })
  }

  const applySelectionToPreview = (type: string, value: string) => {
    switch (type) {
      case 'business_type':
        if (value === 'SaaS Platform') updatePreview('saas')
        else if (value === 'E-commerce Store') updatePreview('ecommerce')
        break
      case 'color_theme':
        updatePreview('custom')
        break
      case 'brand_name':
        updatePreview('custom')
        break
    }
  }

  const finalizeBuild = async () => {
    const finalMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'ai',
      content: "🎉 Incredible! Your app is ready. You've just built a fully functional business in minutes. Ready to go live?",
      chips: ['Deploy Now', 'Add More Features', 'Preview on Mobile'],
      timestamp: new Date()
    }
    setMessages(prev => [...prev, finalMessage])
  }

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="fixed inset-0 bg-gray-950 flex">
      {/* Left Panel - Chat */}
      <m.div
        initial={{ x: -300, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        className="w-80 border-r border-gray-800 flex flex-col bg-gray-900/50"
      >
        <div className="p-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Icon name="message-square" className="w-5 h-5 text-purple-400"  />
            {translations.chat.title}
          </h2>
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
                    : 'bg-gray-800/50 mr-8'
                )}
              >
                <div className="flex items-start gap-2">
                  {message.type === 'ai' && (
                    <Icon name="sparkles" className="w-4 h-4 text-purple-400 mt-1 flex-shrink-0"  />
                  )}
                  <div className="flex-1">
                    <p className="text-sm">
                      {message.content}
                      {message.isTyping && (
                        <span className="inline-block w-1 h-4 bg-purple-400 ml-1 animate-pulse" />
                      )}
                    </p>
                    
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
              {translations.chat.thinking}
            </m.div>
          )}
          
          <div ref={chatEndRef} />
        </div>
      </m.div>

      {/* Center - Preview */}
      <div className="flex-1 flex flex-col bg-gray-950">
        <m.div
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="p-4 border-b border-gray-800 flex items-center justify-between"
        >
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Icon name="globe" className="w-5 h-5 text-blue-400"  />
            {translations.preview.title}
          </h2>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 px-3 py-1 bg-gray-800 rounded-full text-xs">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              <span className="text-gray-400">Live Preview</span>
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
            className="w-full h-full rounded-lg overflow-hidden bg-gray-900 border border-gray-800 shadow-2xl"
          >
            <iframe
              ref={previewRef}
              className="w-full h-full"
              title="Preview"
              sandbox="allow-scripts allow-forms"
            />
          </m.div>
        </div>
      </div>

      {/* Right Panel - Build Log */}
      <m.div
        initial={{ x: 300, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        className="w-64 border-l border-gray-800 flex flex-col bg-gray-900/50"
      >
        <div className="p-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Icon name="code" className="w-5 h-5 text-green-400"  />
            {translations.buildLog.title}
          </h2>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-3">
            <AnimatePresence>
              {buildSteps.map((step, index) => (
                <m.div
                  key={step.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className={cn(
                    'flex items-start gap-3 text-sm',
                    step.status === 'pending' && 'opacity-40'
                  )}
                >
                  {step.status === 'complete' ? (
                    <Icon name="check-circle" className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0"  />
                  ) : step.status === 'active' ? (
                    <m.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                      className="flex-shrink-0"
                    >
                      <Icon name="zap" className="w-4 h-4 text-yellow-400 mt-0.5"  />
                    </m.div>
                  ) : (
                    <Icon name="circle" className="w-4 h-4 text-gray-600 mt-0.5 flex-shrink-0"  />
                  )}
                  <div className="flex-1">
                    <p className={cn(
                      step.status === 'active' && 'text-yellow-400',
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
                  </div>
                </m.div>
              ))}
            </AnimatePresence>
            
            {/* Progress indicator */}
            <div className="mt-6 pt-6 border-t border-gray-800">
              <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
                <span>Progress</span>
                <span>{Math.round((buildSteps.filter(s => s.status === 'complete').length / buildSteps.length) * 100)}%</span>
              </div>
              <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                <m.div
                  className="h-full bg-gradient-to-r from-purple-600 to-pink-600"
                  initial={{ width: 0 }}
                  animate={{ 
                    width: `${(buildSteps.filter(s => s.status === 'complete').length / buildSteps.length) * 100}%` 
                  }}
                  transition={{ duration: 0.5 }}
                />
              </div>
            </div>
          </div>
        </div>
      </m.div>
    </div>
  )
}

// Keep legacy export for backward compatibility during Phase 1
export { BuilderInterface as BuilderInterfaceV2 }