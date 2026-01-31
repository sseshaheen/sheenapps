'use client'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { AnimatePresence, m } from '@/components/ui/motion-provider'
import Icon from '@/components/ui/icon'
import { useEffect, useRef, useState } from 'react'
// import { QuestionOption } from './question-option'
// import { TypewriterText } from '@/components/ui/typing-animation'
import { usePreviewGenerationStore } from '@/store/preview-generation-store'
import { useCurrentQuestion, useFlowProgress, useQuestionFlowActions, useQuestionFlowStore } from '@/store/question-flow-store'
import { useBuilderStore, type SectionState } from '@/store/builder-store'
import { FEATURE_FLAGS } from '@/config/feature-flags'
import type { Answer, QuestionOption as QuestionOptionType } from '@/types/question-flow'

import type { PreviewImpact } from '@/types/question-flow'
import { logger } from '@/utils/logger';

interface QuestionInterfaceProps {
  projectId?: string
  previewEngine?: {
    applyPreviewImpact: (impact: PreviewImpact) => Promise<void>
    applyPreviewImpactWithAI?: (impact: PreviewImpact, choiceName: string, choiceId?: string, projectId?: string) => Promise<void>
    applyAnswerImpact: (answer: Answer, questionCategory: string) => Promise<void>
    suspendMonitoringFor: (ms: number) => void
    generatePreviewInBackground?: (choiceId: string, choiceName: string, impact: PreviewImpact, onComplete?: (success: boolean) => void) => Promise<void>
    isChoiceGenerated?: (choiceId: string) => boolean
    getGeneratedChoiceIds?: () => Set<string>
  } | null
}

export function QuestionInterface({ projectId, previewEngine }: QuestionInterfaceProps = {}) {
  const currentQuestion = useCurrentQuestion()
  const { completionPercentage, flowPhase } = useFlowProgress()
  const { answerQuestion, skipQuestion, requestExplanation, regenerateQuestion, trackEngagement } = useQuestionFlowActions()
  const isQuestionLoading = useQuestionFlowStore(state => state.isLoading)
  const { addSection } = useBuilderStore()

  // Function to apply preview impacts to React Preview
  const applyReactPreviewImpact = async (impact: PreviewImpact, optionText: string) => {
    try {
      console.log('🎨 Applying React Preview impact for:', optionText)
      
      if (impact.type === 'modular-transformation' && impact.modules) {
        console.log('📦 Processing modular transformation with modules:', Object.keys(impact.modules))
        
        // Convert each module to a SectionState and add to store
        Object.entries(impact.modules).forEach(([moduleKey, moduleData]: [string, any]) => {
          console.log(`🔍 Processing module: ${moduleKey}`, moduleData)
          
          // Skip non-section modules (colorScheme, typography, animations, customCSS)
          const sectionTypes = ['hero', 'features', 'pricing', 'testimonials', 'cta', 'footer']
          if (!sectionTypes.includes(moduleKey) || !moduleData.component || !moduleData.props) {
            console.log(`⏭️ Skipping non-section module: ${moduleKey}`)
            return
          }
          
          const sectionId = `${moduleKey}-1`
          const section: SectionState = {
            id: sectionId,
            type: moduleKey as SectionState['type'],
            content: {
              html: '', // Will be rendered by React
              props: moduleData.props
            },
            styles: {
              css: '',
              variables: {
                '--primary-color': '#3b82f6',
                '--text-color': '#1f2937',
                '--bg-color': '#ffffff'
              }
            },
            metadata: {
              lastModified: Date.now(),
              userAction: `Option Selection: ${optionText}`,
              aiGenerated: true
            }
          }
          
          console.log(`🏗️ About to call addSection for ${moduleKey}:`, section)
          addSection(section)
          console.log(`✅ Added ${moduleKey} section to store:`, section)
        })
        
        console.log('✅ React Preview: Applied modular impact to unified store')
      } else if (impact.type === 'theme_change' || impact.type === 'layout_update' || impact.type?.includes('theme') || impact.type?.includes('change')) {
        console.log('🎨 Processing theme_change/layout_update - creating default sections')
        console.log('🔍 DEBUG: impact.type check:', {
          impactType: impact.type,
          isThemeChange: impact.type === 'theme_change',
          isLayoutUpdate: impact.type === 'layout_update',
          typeofType: typeof impact.type
        })
        
        // For theme_change impacts, create a basic set of sections
        const defaultSections = [
          {
            id: 'hero-1',
            type: 'hero' as const,
            content: {
              html: '',
              props: {
                title: `Welcome to ${optionText}`,
                subtitle: 'Professional Services',
                description: 'Discover excellence in every detail with our premium offerings.',
                ctaText: 'Get Started',
                ctaSecondaryText: 'Learn More'
              }
            }
          },
          {
            id: 'features-1', 
            type: 'features' as const,
            content: {
              html: '',
              props: {
                title: 'Our Features',
                features: [
                  { icon: 'star', title: 'Premium Quality', description: 'Top-tier service quality' },
                  { icon: 'shield', title: 'Trusted Service', description: 'Reliable and secure' },
                  { icon: 'heart', title: 'Customer Focus', description: 'Your satisfaction matters' }
                ]
              }
            }
          }
        ]
        
        defaultSections.forEach(sectionData => {
          const section: SectionState = {
            ...sectionData,
            styles: {
              css: '',
              variables: {
                '--primary-color': impact.type === 'theme_change' ? '#8b5cf6' : '#3b82f6',
                '--text-color': '#1f2937',
                '--bg-color': '#ffffff'
              }
            },
            metadata: {
              lastModified: Date.now(),
              userAction: `Option Selection: ${optionText}`,
              aiGenerated: true
            }
          }
          
          console.log(`🏗️ About to call addSection for ${sectionData.type}:`, section)
          addSection(section)
          console.log(`✅ Added ${sectionData.type} section to store:`, section)
        })
        
        console.log('✅ React Preview: Applied theme_change impact with default sections')
      } else {
        console.log('⚠️ Unsupported impact type for React Preview:', impact.type)
        console.log('🔍 Full impact object:', impact)
      }
    } catch (error) {
      console.error('❌ Failed to apply React Preview impact:', error)
    }
  }

  const [selectedOption, setSelectedOption] = useState<string | null>(null)
  const [hoveredOption, setHoveredOption] = useState<string | null>(null)
  const [showExplanation, setShowExplanation] = useState(false)
  const [isAnswering, setIsAnswering] = useState(false)
  const [questionStartTime] = useState(Date.now())
  const [timeOnQuestion, setTimeOnQuestion] = useState(0)
  const [explanation, setExplanation] = useState('')
  const [isPreviewingChoice, setIsPreviewingChoice] = useState(false)
  const [currentPage, setCurrentPage] = useState(0)
  const [isAutoSelecting, setIsAutoSelecting] = useState(false)
  const [hasAutoSelected, setHasAutoSelected] = useState(false)
  const autoSelectionInProgress = useRef(false)

  // Use centralized store for generation state
  const {
    generatedChoices,
    currentlyGenerating,
    generationQueue,
    markAsGenerated,
    startGenerating,
    finishGenerating,
    addToQueue,
    prioritizeInQueue,
    addToGenerationQueue,
    updateGenerationProgress,
    setCurrentPreview,
    isGenerated,
    isInQueue,
    isGenerating,
    getGenerationProgress,
    getGenerationStage,
    reset: resetGenerationState
  } = usePreviewGenerationStore()

  // Track time spent on question
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeOnQuestion(Date.now() - questionStartTime)
    }, 1000)

    return () => clearInterval(interval)
  }, [questionStartTime])

  // Calculate expandable options
  const isExpandable = currentQuestion?.paginationEnabled && currentQuestion?.optionsPerPage
  const optionsPerPage = currentQuestion?.optionsPerPage || 4
  const totalOptions = currentQuestion?.options?.length || 0
  const maxOptionsToShow = isExpandable ? (currentPage + 1) * optionsPerPage : totalOptions
  const visibleOptions = isExpandable
    ? currentQuestion.options.slice(0, maxOptionsToShow)
    : currentQuestion?.options || []
  const hasMoreOptions = maxOptionsToShow < totalOptions
  const remainingOptionsCount = totalOptions - maxOptionsToShow

  // Handle show more button
  const handleShowMore = () => {
    if (hasMoreOptions) {
      setCurrentPage(prev => prev + 1)
    }
  }

  // Reset expansion and auto-selection state when question changes
  useEffect(() => {
    setCurrentPage(0)
    setHasAutoSelected(false)
    autoSelectionInProgress.current = false // Reset auto-selection ref
    resetGenerationState() // Reset centralized state

    // Initialize generation queue with visible choices - all choices start as "Queued"
    if (currentQuestion?.options) {
      // Generation queue initialization

      const choiceIds = currentQuestion.options
        .filter(opt => {
          const hasModular = opt.previewImpact?.type === 'modular-transformation' ||
            (opt as any).modularPreviewImpact?.type === 'modular-transformation'
          return hasModular
        })
        .map(opt => opt.id)

      logger.info('📋 Pre-queuing all modular choices:', choiceIds);
      // Pre-queue all choices so they show "Queue" status initially
      addToQueue(choiceIds)
    }
  }, [currentQuestion?.id, currentQuestion?.options, resetGenerationState, addToQueue])

  // Removed background generation - generation happens on-demand when choices are selected

  // Auto-select first option for the first question to demonstrate preview
  useEffect(() => {
    // Real auto-selection logic with proper impact processing
    if (currentQuestion && !hasAutoSelected && visibleOptions.length > 0) {
      const firstOption = visibleOptions[0]
      const impact = firstOption.previewImpact
      
      console.log('🎯 Auto-selecting first option:', firstOption.text)
      setSelectedOption(firstOption.id)
      setHasAutoSelected(true)
      
      // Apply the preview impact to create sections
      if (impact) {
        applyReactPreviewImpact(impact, firstOption.text)
      } else {
        console.log('⚠️ No preview impact on first option, creating default sections')
        // Create default sections if no impact available
        const defaultSection: SectionState = {
          id: 'default-hero-1',
          type: 'hero',
          content: {
            html: '',
            props: {
              title: `Welcome to ${firstOption.text}`,
              subtitle: 'Professional Services',
              description: 'Discover excellence in every detail with our premium offerings.',
              ctaText: 'Get Started',
              ctaSecondaryText: 'Learn More'
            }
          },
          styles: {
            css: '',
            variables: {
              '--primary-color': '#8b5cf6',
              '--text-color': '#1f2937',
              '--bg-color': '#ffffff'
            }
          },
          metadata: {
            lastModified: Date.now(),
            userAction: `Auto-selection: ${firstOption.text}`,
            aiGenerated: true
          }
        }
        addSection(defaultSection)
      }
    }
  }, [currentQuestion?.id, visibleOptions.length, hasAutoSelected, selectedOption, isAnswering]) // Removed previewEngine dependency for React Preview compatibility

  // Removed auto-apply - all preview applications go through explicit user actions

  // Handle option hover for UI feedback only (no preview)
  const handleOptionHover = (option: QuestionOptionType | null) => {
    if (isAnswering || selectedOption) {
      return
    }
    setHoveredOption(option?.id || null)
  }

  // Handle option selection (visual selection + preview application)
  const handleOptionSelect = async (option: QuestionOptionType) => {
    if (isAnswering) return

    // Do nothing if the option is already selected
    if (selectedOption === option.id) {
      logger.info('🔄 Option already selected, ignoring:', option.text);
      return
    }

    logger.info('🎯 Option selected:', option.text);

    // DEBUG: Log the exact option data being processed
    // Option selection debug removed for performance

    const impact = option.previewImpact
    const isModularImpact = impact?.type === 'modular-transformation' ||
      option.modularPreviewImpact?.type === 'modular-transformation'

    // Check if this choice is already generated, currently generating, or in queue
    const isOptionGenerated = isGenerated(option.id)
    const isOptionGenerating = currentlyGenerating === option.id
    const isOptionInQueue = isInQueue(option.id)

    // Only reset iframe if switching to a non-cached layout (to prevent jarring transitions)
    if (previewEngine && !isOptionGenerated) {
      try {
        logger.info('🔄 Resetting iframe before applying new selection');
        await previewEngine.applyPreviewImpact({
          type: 'revert',
          priority: 'high' as const,
          affects: [],
          changes: {}
        })
      } catch (error) {
        logger.error('Failed to reset iframe:', error);
      }
    } else if (isOptionGenerated) {
      logger.info('⚡ Skipping iframe reset for cached layout to prevent jarring transition');
    }

    console.log('✅ Option selected:', {
      optionId: option.id,
      optionText: option.text,
      hasPreviewImpact: !!option.previewImpact,
      impactType: option.previewImpact?.type,
      hasModules: !!(option.previewImpact as any)?.modules
    })
    
    setSelectedOption(option.id)

    // Set current preview for the overlay system
    setCurrentPreview(option.id)

    if (impact) {
      setIsPreviewingChoice(true)
      
      // Check if React Preview is enabled
      const useReactPreview = FEATURE_FLAGS.ENABLE_REACT_PREVIEW
      
      if (useReactPreview) {
        // React Preview: Apply impact directly to store
        console.log('🎨 Manual selection: Applying React Preview impact')
        await applyReactPreviewImpact(impact, option.text)
      } else if (previewEngine) {
        // Legacy iframe preview
        // Handle modular impacts with AI generation
        if (isModularImpact && previewEngine.applyPreviewImpactWithAI) {
        logger.info('🤖 Using AI generation simulation for user selection:', option.text);
        logger.info('📞 CALLING applyPreviewImpactWithAI for manual selection:', option.id);

        if (isOptionGenerated) {
          logger.info('⚡ Already generated, applying instantly');
        } else if (isOptionGenerating) {
          logger.info('⏳ Currently generating, waiting for completion');
        } else if (isOptionInQueue) {
          logger.info('📋 Already in queue, prioritizing for immediate generation');
          // Move this choice to the front of the queue - this will trigger generation
          prioritizeInQueue(option.id)
        } else {
          logger.info('🆕 Adding to generation queue');
          // This shouldn't happen since all choices should be pre-queued
          addToGenerationQueue(option.id)
        }

        // Note: Do NOT call startGenerating here - that happens in the orchestrator

        try {
          // DEBUG: Log the impact being sent to preview engine
          const modularImpact = option.modularPreviewImpact
          console.log('🚀 IMPACT DEBUG - Sending to preview engine:', {
            choiceId: option.id,
            choiceName: option.text,
            impactType: impact?.type,
            hasModules: !!(modularImpact as any)?.modules,
            moduleKeys: (modularImpact as any)?.modules ? Object.keys((modularImpact as any).modules) : 'none',
            heroTitle: (modularImpact as any)?.modules?.hero?.props?.title || 'no hero title',
            businessName: (modularImpact as any)?.modules?.header?.props?.businessName || 'no business name'
          })

          await previewEngine.applyPreviewImpactWithAI(impact, option.text, option.id, projectId)
          logger.info('✅ AI generation simulation complete');
        } catch (error) {
          if (error.message === 'AbortError' || error.name === 'AbortError') {
            logger.info('⏹️ Generation cancelled for:', option.text);
            // Don't fallback to regular preview if cancelled
          } else {
            logger.error('Failed to apply AI-simulated preview:', error);
            // Fallback to regular preview for real errors
            await previewEngine.applyPreviewImpact(impact)
          }
        }
        } else {
          // For non-modular impacts, use regular preview
          logger.info('📦 Using regular preview for:', option.text);
          try {
            await previewEngine.applyPreviewImpact(impact)
            logger.info('✅ Applied preview');
          } catch (error) {
            logger.error('Failed to apply preview:', error);
          }
        }
      }
    }
  }

  // Handle final answer submission
  const handleSubmitAnswer = async () => {
    if (!selectedOption || !currentQuestion || isAnswering) return

    const option = currentQuestion.options.find(opt => opt.id === selectedOption)
    if (!option) return

    console.log('🎯 Submitting answer to update questionHistory:', {
      questionId: currentQuestion.id,
      selectedOption,
      optionText: option.text,
      hasPreviewImpact: !!option.previewImpact
    })

    setIsAnswering(true)

    try {
      // Track preview interaction if enabled
      const impact = option.previewImpact
      if (impact) {
        trackEngagement({
          type: 'preview_interaction',
          questionId: currentQuestion.id,
          duration: timeOnQuestion
        })
      }

      // Submit answer - this is the primary action that should update questionHistory
      const answer: Answer = {
        questionId: currentQuestion.id,
        optionId: option.id,
        answer: option.text,
        metadata: {
          timeSpent: timeOnQuestion,
          confidence: 0.8, // Could be dynamic based on user behavior
          skipped: false
        }
      }

      console.log('🎯 Submitting answer to update questionHistory:', {
        questionId: answer.questionId,
        optionId: answer.optionId,
        answer: answer.answer
      })

      // Submit answer to store - this should trigger questionHistory update
      await answerQuestion(answer)
      
      console.log('✅ Answer submitted successfully - questionHistory should be updated')

      // Note: Preview was already updated during option selection
      // The workspace-preview.tsx useEffect will handle final preview updates based on questionHistory
      
    } catch (error) {
      logger.error('❌ Failed to submit answer:', error);
      console.error('Answer submission failed:', error)
      
      // Show user-friendly error
      // TODO: Add toast notification for error
      
    } finally {
      setIsAnswering(false)
      setSelectedOption(null)
      setHoveredOption(null)
      setIsPreviewingChoice(false)
    }
  }

  const handleSkip = () => {
    skipQuestion('user_choice')
    setSelectedOption(null)
  }

  const handleExplanationRequest = async () => {
    if (!currentQuestion) return

    if (!showExplanation) {
      const explanationText = await requestExplanation(currentQuestion.id)
      setExplanation(explanationText)
    }

    setShowExplanation(!showExplanation)
  }

  const handleRegenerate = async () => {
    setSelectedOption(null)
    await regenerateQuestion()
  }

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60

    if (minutes > 0) {
      return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
    }
    return `${seconds}s`
  }

  if (!currentQuestion) {
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-8 text-center">
        <div className="w-16 h-16 bg-purple-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
          {isQuestionLoading ? (
            <Icon name="loader-2" className="w-8 h-8 text-purple-400 animate-spin"  />
          ) : (
            <Icon name="target" className="w-8 h-8 text-purple-400"  />
          )}
        </div>
        <h3 className="text-lg font-semibold text-white mb-2">
          {isQuestionLoading
            ? 'Loading Questions...'
            : (flowPhase === 'building' ? 'Building Your Business...' : 'Getting Ready...')
          }
        </h3>
        <p className="text-gray-400">
          {isQuestionLoading
            ? 'Generating personalized questions based on your business idea...'
            : (flowPhase === 'building'
              ? 'Your responses are being processed to create your perfect business solution.'
              : 'Preparing personalized questions based on your business idea.'
            )
          }
        </p>
      </div>
    )
  }

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-6">
      {/* Progress Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400">
              {currentQuestion.category.charAt(0).toUpperCase() + currentQuestion.category.slice(1)} Question
            </span>
            {/* <div className="flex items-center gap-1 text-xs text-gray-500">
              <Clock className="w-3 h-3" />
              {formatTime(timeOnQuestion)}
            </div> */}
          </div>
          <span className="text-sm text-purple-400">
            {Math.round(completionPercentage)}% Complete
          </span>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-gray-700 rounded-full h-2">
          <m.div
            className="bg-gradient-to-r from-purple-500 to-pink-500 h-2 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${completionPercentage}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        </div>
      </div>

      {/* Question Section */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-white mb-3">
            {currentQuestion.question}
          </h3>

          {currentQuestion.context && (
            <m.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1 }}
              className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg"
            >
              <p className="text-sm text-blue-300">
                💡 {currentQuestion.context}
              </p>
            </m.div>
          )}
        </div>
      </div>

      {/* Auto-selection indicator */}
      {isAutoSelecting && (
        <m.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="flex items-center gap-2 p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg mb-4"
        >
          <m.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            className="text-purple-400"
          >
            ✨
          </m.div>
          <span className="text-purple-300 text-sm">
            Demonstrating preview with the first option...
          </span>
        </m.div>
      )}

      {/* Answer Options */}
      <div className="space-y-3">
        {visibleOptions.map((option, index) => {
          // Calculate if this is a newly revealed option for animation
          const isNewlyRevealed = index >= (currentPage * optionsPerPage)
          const animationDelay = isNewlyRevealed ? (index - currentPage * optionsPerPage) * 0.1 + 0.3 : index * 0.1 + 1.5
          const isFirstOption = index === 0 && currentQuestion?.id === 'visual-foundation-1'

          // Generation status indicators from centralized store - using proper methods
          const isOptionGenerated = isGenerated(option.id)
          const isOptionGenerating = isGenerating(option.id) // Use the new isGenerating method
          const isOptionInQueue = isInQueue(option.id)
          const hasModularImpact = option.previewImpact?.type === 'modular-transformation' ||
            option.modularPreviewImpact?.type === 'modular-transformation'

          return (
            <m.div
              key={option.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{
                opacity: 1,
                x: 0,
                // Add pulsing animation for first option during auto-selection
                scale: isFirstOption && isAutoSelecting ? [1, 1.02, 1] : 1,
                boxShadow: isFirstOption && isAutoSelecting
                  ? ["0 0 0 0 rgba(147, 51, 234, 0.4)", "0 0 0 4px rgba(147, 51, 234, 0.1)", "0 0 0 0 rgba(147, 51, 234, 0)"]
                  : "0 0 0 0 rgba(147, 51, 234, 0)"
              }}
              transition={{
                delay: animationDelay,
                scale: { duration: 0.8, repeat: isFirstOption && isAutoSelecting ? Infinity : 0 },
                boxShadow: { duration: 0.8, repeat: isFirstOption && isAutoSelecting ? Infinity : 0 }
              }}
              onMouseEnter={() => handleOptionHover(option)}
              onMouseLeave={() => handleOptionHover(null)}
              className="relative"
            >
              <div
                className={cn(
                  "border-2 rounded-lg p-4 cursor-pointer transition-all duration-200",
                  "hover:border-purple-400 hover:bg-gray-700/50",
                  selectedOption === option.id
                    ? "border-purple-500 bg-purple-500/10"
                    : "border-gray-600 bg-gray-800/50",
                  hoveredOption === option.id && "ring-2 ring-purple-400/50",
                  isAnswering && "opacity-50 cursor-not-allowed"
                )}
                onClick={() => !isAnswering && handleOptionSelect(option)}
              >
                <div className="flex items-start gap-3">
                  <div className={cn(
                    "w-5 h-5 rounded-full border-2 flex-shrink-0 mt-0.5 transition-colors",
                    selectedOption === option.id
                      ? "border-purple-500 bg-purple-500"
                      : "border-gray-500"
                  )}>
                    {selectedOption === option.id && (
                      <div className="w-full h-full rounded-full bg-white scale-50"></div>
                    )}
                  </div>
                  <div className="flex-1">
                    <h4 className="text-white font-medium mb-1">{option.text}</h4>
                    {option.description && (
                      <p className="text-gray-400 text-sm">{option.description}</p>
                    )}
                  </div>
                  <div className="flex-shrink-0 flex items-center gap-2">
                    {/* AI Generation Status Indicator */}
                    {hasModularImpact && (
                      <div className="flex items-center">
                        {isOptionGenerated ? (
                          <div className="flex items-center gap-1 px-2 py-1 bg-green-500/20 rounded-full">
                            <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                            <span className="text-xs text-green-400 font-medium">Ready</span>
                          </div>
                        ) : isOptionGenerating ? (
                          <div className="flex items-center gap-1 px-2 py-1 bg-purple-500/20 rounded-full">
                            <m.div
                              animate={{ rotate: 360 }}
                              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                              className="text-xs"
                            >
                              🧠
                            </m.div>
                            <span className="text-xs text-purple-400 font-medium">Gen...</span>
                          </div>
                        ) : isOptionInQueue ? (
                          <div className="flex items-center gap-1 px-2 py-1 bg-yellow-500/20 rounded-full">
                            <m.div
                              animate={{ scale: [1, 1.2, 1] }}
                              transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                              className="w-2 h-2 bg-yellow-400 rounded-full"
                            />
                            <span className="text-xs text-yellow-400 font-medium">Queue</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 px-2 py-1 bg-gray-500/20 rounded-full">
                            <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                            <span className="text-xs text-gray-400 font-medium">Ready</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Preview Eye Icon */}
                    {option.previewImpact && (
                      <Icon name="eye" className={cn(
                        "w-4 h-4 transition-colors",
                        selectedOption
                          ? "text-gray-600" // Dimmed when selection is made
                          : hoveredOption === option.id
                            ? "text-purple-400"
                            : "text-gray-500"
                      )}  />
                    )}
                  </div>
                </div>
              </div>
            </m.div>
          )
        })}

        {/* Show More Section */}
        {isExpandable && hasMoreOptions && (
          <m.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex flex-col items-center pt-6 pb-2"
          >
            {/* Compact show more button */}
            <button
              onClick={handleShowMore}
              disabled={isAnswering}
              className={cn(
                "group relative overflow-hidden rounded-lg px-4 py-2",
                "bg-gray-700/50 border border-gray-600",
                "hover:bg-gray-600/50 hover:border-gray-500",
                "transition-all duration-200",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              <div className="relative flex items-center gap-2 text-gray-300 group-hover:text-gray-200">
                <div className="flex items-center gap-1">
                  <div className="w-1 h-1 rounded-full bg-gray-400" />
                  <div className="w-1 h-1 rounded-full bg-gray-400" />
                  <div className="w-1 h-1 rounded-full bg-gray-400" />
                </div>
                <span className="text-sm">
                  Show {Math.min(optionsPerPage, remainingOptionsCount)} more
                </span>
                <svg
                  className="w-3 h-3 transform transition-transform duration-200 group-hover:translate-y-0.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </div>
            </button>

            {/* Progress indicator */}
            <div className="flex items-center gap-1.5 mt-3">
              <span className="text-xs text-gray-400">
                Showing {maxOptionsToShow} of {totalOptions} choices
              </span>
            </div>
          </m.div>
        )}
      </div>

      {/* Question Metadata - Moved below choices */}
      {/* <div className="flex items-center gap-4 text-xs border-t border-gray-700 pt-4">
        <div className="flex items-center gap-1">
          <span className="text-gray-500">Difficulty:</span>
          <span className={cn(
            "px-2 py-1 rounded-full",
            currentQuestion.metadata.difficultyLevel === 'beginner' && "bg-green-500/20 text-green-400",
            currentQuestion.metadata.difficultyLevel === 'intermediate' && "bg-yellow-500/20 text-yellow-400",
            currentQuestion.metadata.difficultyLevel === 'advanced' && "bg-red-500/20 text-red-400"
          )}>
            {currentQuestion.metadata.difficultyLevel}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-gray-500">Impact:</span>
          <span className={cn(
            "px-2 py-1 rounded-full",
            currentQuestion.metadata.businessImpact === 'high' && "bg-red-500/20 text-red-400",
            currentQuestion.metadata.businessImpact === 'medium' && "bg-yellow-500/20 text-yellow-400",
            currentQuestion.metadata.businessImpact === 'low' && "bg-green-500/20 text-green-400"
          )}>
            {currentQuestion.metadata.businessImpact}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-gray-500">Est. time:</span>
          <span className="text-gray-300">{currentQuestion.metadata.estimatedTime}s</span>
        </div>
      </div> */}

      {/* Submit Button - Show when option is selected */}
      {selectedOption && (
        <m.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex justify-center"
        >
          <Button
            onClick={handleSubmitAnswer}
            disabled={isAnswering}
            className="bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white px-8 py-4 rounded-full flex items-center gap-3 text-lg font-semibold shadow-lg hover:shadow-xl transform hover:scale-102 transition-all duration-300 ease-out"
          >
            {isAnswering ? (
              <Icon name="loader-2" className="w-5 h-5 animate-spin"  />
            ) : (
              <Icon name="arrow-right" className="w-5 h-5"  />
            )}
            {isAnswering ? 'Processing...' : 'Continue'}
          </Button>
        </m.div>
      )}

      {/* Action Buttons - Icon only with tooltips */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-700">
        <div className="flex gap-2">
          <button
            onClick={handleExplanationRequest}
            disabled={isAnswering}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors group relative"
            title="Why this question?"
          >
            <Icon name="alert-circle" className="w-4 h-4"  />
            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-gray-900 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
              Why this question?
            </div>
          </button>

          <button
            onClick={handleSkip}
            disabled={isAnswering}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors group relative"
            title="Skip question"
          >
            <Icon name="arrow-right" className="w-4 h-4"  />
            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-gray-900 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
              Skip question
            </div>
          </button>
        </div>

        <button
          onClick={handleRegenerate}
          disabled={isAnswering}
          className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors group relative"
          title="Different question"
        >
          <Icon name="refresh-cw" className="w-4 h-4"  />
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-gray-900 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
            Different question
          </div>
        </button>
      </div>

      {/* Explanation Panel */}
      <AnimatePresence>
        {showExplanation && (
          <m.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="p-4 bg-gray-700/50 rounded-lg border border-gray-600"
          >
            <h4 className="font-medium text-white mb-2">Why this question matters:</h4>
            <p className="text-sm text-gray-300">
              {explanation || currentQuestion.metadata.aiReasoning}
            </p>
          </m.div>
        )}
      </AnimatePresence>

      {/* Preview Status Indicator - Hide when AI overlay is active */}
      <AnimatePresence>
        {selectedOption && currentQuestion && !currentlyGenerating && (
          <m.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-4 right-4 bg-purple-600 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 z-50 max-w-xs"
          >
            <Icon name="eye" className="w-4 h-4 flex-shrink-0"  />
            <div className="text-sm">
              <div className="font-medium">Previewing:</div>
              <div className="text-purple-200 truncate">
                {currentQuestion.options.find(opt => opt.id === selectedOption)?.text}
              </div>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
}
