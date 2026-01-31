'use client'

import { Button } from '@/components/ui/button'
import { MobileSheet } from '@/components/ui/mobile-sheet'
import { MobileSkeletonLoader } from '@/components/ui/mobile-skeleton-loader'
import { useGestures } from '@/hooks/use-gestures'
import { cn } from '@/lib/utils'
import { usePreviewGenerationStore } from '@/store/preview-generation-store'
import {
  useCurrentQuestion,
  useFlowProgress,
  useQuestionFlowActions,
  useQuestionFlowStore
} from '@/store/question-flow-store'
import type { Answer, PreviewImpact, QuestionOption as QuestionOptionType } from '@/types/question-flow'
import { AnimatePresence, m } from '@/components/ui/motion-provider'
import Icon from '@/components/ui/icon'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useMobileNavigation } from '../workspace/mobile-workspace-layout'
import { logger } from '@/utils/logger';
import { FEATURE_FLAGS } from '@/config/feature-flags'
import { useBuilderStore, type SectionState } from '@/store/builder-store'

interface MobileQuestionInterfaceProps {
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
  previewContainerRef?: React.RefObject<HTMLDivElement>
}

/**
 * Mobile-optimized question interface with touch-friendly interactions
 * Features card-based selection, auto-switch to Preview tab, and gesture support
 */
export function MobileQuestionInterface({
  projectId,
  previewEngine,
  previewContainerRef
}: MobileQuestionInterfaceProps) {
  const currentQuestion = useCurrentQuestion()
  const { completionPercentage, engagementScore } = useFlowProgress()
  const { answerQuestion, skipQuestion, requestExplanation } = useQuestionFlowActions()
  const isQuestionLoading = useQuestionFlowStore(state => state.isLoading)
  const { setActivePanel } = useMobileNavigation()
  const { setCurrentPreview } = usePreviewGenerationStore()
  const { addSection, clearSections } = useBuilderStore()
  const currentSections = useBuilderStore(state => state.layouts[state.ui.currentLayoutId]?.sections || {})
  
  // Track last applied impact to prevent duplicates
  const lastAppliedImpactRef = useRef<{ optionText: string; impactType: string; timestamp: number } | null>(null)

  // Function to apply preview impacts to React Preview (mobile version)
  const applyReactPreviewImpact = async (impact: PreviewImpact, optionText: string) => {
    console.log('📱🎨 Mobile applyReactPreviewImpact CALLED for:', optionText)
    console.log('📱🔍 Mobile Impact data:', impact)
    
    // Check for duplicate calls - more strict duplicate prevention
    const currentTimestamp = Date.now()
    const lastApplied = lastAppliedImpactRef.current
    
    if (lastApplied && 
        lastApplied.optionText === optionText && 
        lastApplied.impactType === impact.type &&
        (currentTimestamp - lastApplied.timestamp) < 2000) { // Increased window to 2 seconds
      console.log('📱⏭️ Mobile: Skipping duplicate impact application for:', optionText)
      return
    }
    
    // Update the last applied impact tracker
    lastAppliedImpactRef.current = {
      optionText,
      impactType: impact.type,
      timestamp: currentTimestamp
    }
    
    try {
      console.log('📱🎨 Mobile: Applying React Preview impact for:', optionText, impact)
      
      if (impact.type === 'modular-transformation' && impact.modules) {
        console.log('📱📦 Mobile: Processing modular transformation with modules:', Object.keys(impact.modules))
        
        // Clear existing sections first
        clearSections()
        
        // Convert each module to a SectionState and add to store
        Object.entries(impact.modules).forEach(([moduleKey, moduleData]: [string, any]) => {
          console.log(`📱🔍 Mobile: Processing module: ${moduleKey}`, moduleData)
          
          // Skip non-section modules (colorScheme, typography, animations, customCSS)
          const sectionTypes = ['hero', 'features', 'pricing', 'testimonials', 'cta', 'footer']
          if (!sectionTypes.includes(moduleKey) || !moduleData.component || !moduleData.props) {
            console.log(`📱⏭️ Mobile: Skipping non-section module: ${moduleKey}`)
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
              userAction: `Mobile Option Selection: ${optionText}`,
              aiGenerated: true
            }
          }
          
          console.log(`📱🏗️ Mobile: About to call addSection for ${moduleKey}:`, section)
          console.log(`📱🔍 Mobile: Section props:`, section.content.props)
          addSection(section)
          console.log(`📱✅ Mobile: Added ${moduleKey} section to store:`, section)
        })
        
        console.log('📱✅ Mobile React Preview: Applied modular impact to unified store')
      } else if (impact.type === 'theme_change' || impact.type === 'layout_update' || impact.type?.includes('theme') || impact.type?.includes('change')) {
        console.log('📱🎨 Mobile: Processing theme_change/layout_update - creating default sections')
        
        // For theme_change impacts, create sections with option-specific content
        const defaultSections: SectionState[] = [
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
            },
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
              userAction: `Mobile Option Selection: ${optionText}`,
              aiGenerated: true
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
            },
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
              userAction: `Mobile Option Selection: ${optionText}`,
              aiGenerated: true
            }
          }
        ]
        
        console.log('📱🏗️ Mobile: About to clear and add sections with option-specific content')
        console.log('📱🔍 Mobile: Hero section title:', defaultSections[0].content.props.title)
        
        // Clear existing sections first
        clearSections()
        
        // Add new sections with option-specific content
        defaultSections.forEach(section => {
          console.log(`📱🔧 Mobile: Adding section ${section.type} with title:`, section.content.props.title)
          addSection(section)
        })
        
        console.log('📱✅ Mobile React Preview: Applied theme_change impact with default sections')
      } else {
        console.log('📱⚠️ Mobile: Unsupported impact type for React Preview:', impact.type)
        console.log('📱🔍 Mobile: Full impact object:', impact)
      }
    } catch (error) {
      console.error('📱❌ Mobile: Failed to apply React Preview impact:', error)
    }
  }

  const [selectedOption, setSelectedOption] = useState<string | null>(null)
  const [showExplanationSheet, setShowExplanationSheet] = useState(false)
  const [isAnswering, setIsAnswering] = useState(false)
  const [questionStartTime] = useState(Date.now())
  const [showAllOptions, setShowAllOptions] = useState(false)
  const [explanation, setExplanation] = useState('')
  const [pendingSelection, setPendingSelection] = useState<{ optionId: string, option: QuestionOptionType } | null>(null)
  const [hasAutoSelected, setHasAutoSelected] = useState(false)
  const [isAutoSelecting, setIsAutoSelecting] = useState(false)
  const autoSelectionInProgress = useRef(false)

  // Debug: Log props when component mounts or updates
  useEffect(() => {
    console.log('📱 MobileQuestionInterface mounted/updated:', {
      hasPreviewEngine: !!previewEngine,
      hasProjectId: !!projectId,
      hasPreviewContainer: !!previewContainerRef?.current,
      hasCurrentQuestion: !!currentQuestion,
      previewEngineType: previewEngine?.constructor?.name,
      projectId,
      previewContainerRefExists: !!previewContainerRef,
      previewContainerElement: previewContainerRef?.current?.tagName
    })

    // If we have a question but no preview engine, log a warning
    if (currentQuestion && !previewEngine) {
      logger.warn('📱 Mobile: Question available but preview engine not ready yet. Waiting for engine initialization...');

      // Debug: Check why preview engine isn't ready
      if (!previewContainerRef?.current) {
        logger.warn('📱 Mobile: Preview container ref not available yet. This prevents engine initialization.');
      }
    }
  }, [previewEngine, projectId, previewContainerRef, currentQuestion])

  // Monitor for preview container availability
  useEffect(() => {
    if (!previewContainerRef) return

    const checkContainer = () => {
      if (previewContainerRef.current) {
        // logger.info('📱 Mobile: Preview container is now available!', previewContainerRef.current.tagName);
      }
    }

    checkContainer()
    const interval = setInterval(checkContainer, 1000)

    return () => clearInterval(interval)
  }, [previewContainerRef])

  // Effect to process pending selection when preview engine becomes available
  useEffect(() => {
    if (previewEngine && pendingSelection && projectId) {
      logger.info('🚀 Mobile: Preview engine now available! Processing pending selection:', pendingSelection.option.text);

      const { optionId, option } = pendingSelection
      const impact = option.previewImpact
      const isModularImpact = impact?.type === 'modular-transformation' ||
        option.modularPreviewImpact?.type === 'modular-transformation'

      if (impact) {
        (async () => {
          try {
            if (isModularImpact && previewEngine.applyPreviewImpactWithAI) {
              logger.info('🤖 Mobile: Applying delayed AI generation for:', option.text);
              await previewEngine.applyPreviewImpactWithAI(impact, option.text, optionId, projectId)
              logger.info('✅ Mobile: Delayed AI generation complete');
            } else {
              logger.info('🔄 Mobile: Applying delayed preview impact');
              await previewEngine.applyPreviewImpact(impact)
            }
            setPendingSelection(null) // Clear pending selection

            // No need to auto-switch again - user is already on Preview tab
          } catch (error) {
            logger.error('Mobile: Delayed preview generation failed:', error);
            setPendingSelection(null)
          }
        })()
      }
    }
  }, [previewEngine, pendingSelection, projectId])

  // Reset auto-selection state when question changes  
  useEffect(() => {
    setHasAutoSelected(false)
    autoSelectionInProgress.current = false
    // Reset impact tracker for new question
    lastAppliedImpactRef.current = null
  }, [currentQuestion?.id])

  // Auto-select first option for the first question to demonstrate preview
  useEffect(() => {
    // Mobile auto-selection check

    // Check if we can do auto-selection (React Preview doesn't need preview engine)
    const useReactPreview = FEATURE_FLAGS.ENABLE_REACT_PREVIEW
    const canAutoSelect = useReactPreview || previewEngine
    
    if (
      currentQuestion &&
      !hasAutoSelected &&
      !selectedOption &&
      !isAnswering &&
      currentQuestion.options && currentQuestion.options.length > 0 &&
      !autoSelectionInProgress.current &&
      canAutoSelect
    ) {
      logger.info('📱 Question available, starting mobile auto-selection for:', currentQuestion.question);

      setHasAutoSelected(true)
      autoSelectionInProgress.current = true

      const firstOption = currentQuestion.options[0]
      logger.info('📱 Auto-selecting first option:', firstOption.text);
      setIsAutoSelecting(true)

      setTimeout(() => {
        setSelectedOption(firstOption.id)
        setIsAutoSelecting(false)
        setCurrentPreview(firstOption.id)

        const impact = firstOption.previewImpact
        const useReactPreview = FEATURE_FLAGS.ENABLE_REACT_PREVIEW
        
        if (impact) {
          if (useReactPreview) {
            // React Preview: Apply impact directly to store
            logger.info('📱 Auto-selecting with React Preview for:', firstOption.text);
            applyReactPreviewImpact(impact, firstOption.text).then(() => {
              autoSelectionInProgress.current = false
              logger.info('📱 Mobile React Preview auto-selection complete');
            }).catch((error) => {
              logger.error('📱 Failed to apply React Preview impact:', error);
              autoSelectionInProgress.current = false
            })
          } else if (previewEngine && previewEngine.applyPreviewImpactWithAI) {
            logger.info('📱 Auto-selecting with AI generation simulation:', firstOption.text);
            previewEngine.applyPreviewImpactWithAI(impact, firstOption.text, firstOption.id, projectId).catch((error: Error) => {
              if (error.message === 'AbortError' || error.name === 'AbortError') {
                logger.info('📱 Auto-selection generation cancelled for:', firstOption.text);
              } else {
                logger.error('📱 Failed to apply AI-simulated preview:', error);
                if (previewEngine && impact) {
                  previewEngine.applyPreviewImpact(impact).catch(console.error)
                }
              }
            }).finally(() => {
              autoSelectionInProgress.current = false
              logger.info('📱 Mobile auto-selection process complete');
            })
          } else if (previewEngine && impact) {
            logger.info('📱 Auto-selecting with regular preview impact:', firstOption.text);
            previewEngine.applyPreviewImpact(impact).finally(() => {
              autoSelectionInProgress.current = false
            })
          } else {
            logger.info('📱 Mobile: No preview engine available, auto-selection complete');
            autoSelectionInProgress.current = false
          }
        } else {
          logger.info('📱 Mobile: No preview impact on first option');
          autoSelectionInProgress.current = false
        }
      }, 100)
    }
  }, [currentQuestion, hasAutoSelected, selectedOption, isAnswering, previewEngine, setCurrentPreview, projectId, applyReactPreviewImpact, clearSections])

  const containerRef = useRef<HTMLDivElement>(null)

  // Use gesture support for enhanced mobile interaction
  useGestures(containerRef, {
    onSwipeLeft: () => {
      if (selectedOption) {
        handleContinue()
      }
    },
    onSwipeRight: () => {
      if (currentQuestion?.followUpLogic?.nextQuestionId !== null) {
        handleSkip()
      }
    },
    onSwipeUp: () => {
      // Swipe up removed - users auto-switch to Preview tab after option selection
    },
    enabled: !!currentQuestion && !isAnswering
  })

  const handleOptionSelect = useCallback(async (optionId: string) => {
    // If option is already selected, just switch to Preview tab (don't ignore)
    if (selectedOption === optionId) {
      logger.info('🔄 Mobile: Option already selected, switching to Preview tab:', optionId);
      setActivePanel('preview')
      return
    }

    setSelectedOption(optionId)

    // Set current preview for the overlay system
    setCurrentPreview(optionId)

    // Haptic feedback
    if (navigator.vibrate) {
      navigator.vibrate(10)
    }

    // Find the selected option
    const option = currentQuestion?.options?.find(opt => opt.id === optionId)
    if (!option) {
      logger.error('Mobile: Selected option not found:', optionId);
      return
    }

    logger.info('🎯 Mobile: Option selected:', option.text);
    console.log('🔍 Mobile Debug:', {
      hasPreviewEngine: !!previewEngine,
      hasProjectId: !!projectId,
      hasPreviewImpact: !!option.previewImpact,
      hasModularPreviewImpact: !!option.modularPreviewImpact,
      previewImpactType: option.previewImpact?.type,
      modularPreviewImpactType: option.modularPreviewImpact?.type,
      optionKeys: Object.keys(option),
      useReactPreview: FEATURE_FLAGS.ENABLE_REACT_PREVIEW,
      currentSectionsCount: Object.keys(currentSections).length
    })

    // ALWAYS switch to Preview tab immediately - let preview show loading/generation
    logger.info('📱 Mobile: Auto-switching to Preview tab immediately');
    setActivePanel('preview')

    const impact = option.previewImpact
    const isModularImpact = impact?.type === 'modular-transformation' ||
      option.modularPreviewImpact?.type === 'modular-transformation'
    const useReactPreview = FEATURE_FLAGS.ENABLE_REACT_PREVIEW

    // Start generation in background after switching
    if (impact) {
      if (useReactPreview) {
        // React Preview: Apply impact directly to store
        logger.info('📱 Using React Preview for option:', option.text);
        
        // Clear sections before applying new impact to prevent conflicts
        logger.info('📱 Clearing sections before applying new option impact');
        
        try {
          await applyReactPreviewImpact(impact, option.text)
          logger.info('✅ Mobile: React Preview application complete');
        } catch (error) {
          logger.error('📱 Failed to apply React Preview impact:', error);
        }
      } else if (previewEngine) {
        try {
          // Handle modular impacts with AI generation (same as desktop)
          if (isModularImpact && previewEngine.applyPreviewImpactWithAI && projectId) {
            logger.info('🤖 Mobile: Using AI generation for:', option.text);
            await previewEngine.applyPreviewImpactWithAI(impact, option.text, option.id, projectId)
            logger.info('✅ Mobile: AI generation complete');
          } else {
            // Fallback to regular preview impact
            logger.info('🔄 Mobile: Applying regular preview impact');
            await previewEngine.applyPreviewImpact(impact)
          }
        } catch (error) {
          logger.error('Mobile: Preview generation failed:', error);
        }
      } else {
        logger.info('Mobile: Preview engine not ready yet. Engine will be initialized shortly...');
        // Store the selection for when engine becomes available
        setPendingSelection({ optionId, option })
        logger.info('📱 Mobile: Storing selection for later processing when engine is ready');
      }
    } else {
      logger.info('Mobile: No preview impact available on option');
    }

  }, [currentQuestion, previewEngine, selectedOption, projectId, setActivePanel, currentSections, applyReactPreviewImpact, clearSections, setCurrentPreview])

  const handleContinue = useCallback(async () => {
    if (!selectedOption || !currentQuestion) return

    setIsAnswering(true)

    try {
      const timeToAnswer = Date.now() - questionStartTime
      const answer: Answer = {
        questionId: currentQuestion.id,
        optionId: selectedOption,
        answer: selectedOption,
        metadata: {
          timeSpent: timeToAnswer,
          confidence: 1,
          skipped: false
        }
      }

      console.log('📱 Mobile: Submitting answer to update questionHistory:', {
        questionId: answer.questionId,
        optionId: answer.optionId,
        answer: answer.answer
      })

      await answerQuestion(answer)
      
      console.log('✅ Mobile: Answer submitted successfully - questionHistory should be updated')

      // Success haptic feedback
      if (navigator.vibrate) {
        navigator.vibrate([20, 10, 20])
      }
    } catch (error) {
      logger.error('Failed to answer question:', error);
      // Error haptic feedback
      if (navigator.vibrate) {
        navigator.vibrate([100, 50, 100])
      }
    } finally {
      setIsAnswering(false)
      setSelectedOption(null)
    }
  }, [selectedOption, currentQuestion, questionStartTime, answerQuestion])

  const handleSkip = useCallback(async () => {
    if (currentQuestion?.followUpLogic?.nextQuestionId === null) return

    try {
      await skipQuestion(currentQuestion.id)
      if (navigator.vibrate) {
        navigator.vibrate(15)
      }
    } catch (error) {
      logger.error('Failed to skip question:', error);
    }
  }, [currentQuestion, skipQuestion])

  const handleShowExplanation = useCallback(async () => {
    if (!currentQuestion) return

    try {
      const explanationText = await requestExplanation(currentQuestion.id)
      setExplanation(explanationText)
      setShowExplanationSheet(true)
    } catch (error) {
      logger.error('Failed to get explanation:', error);
    }
  }, [currentQuestion, requestExplanation])


  if (!currentQuestion || isQuestionLoading) {
    return <MobileSkeletonLoader type="question" count={4} />
  }

  const visibleOptions = showAllOptions
    ? currentQuestion.options
    : currentQuestion.options.slice(0, 4)
  const hasMoreOptions = currentQuestion.options.length > 4

  return (
    <div ref={containerRef} className="relative z-0 h-full flex flex-col bg-gray-900">
      {/* Progress Section */}
      <div className="px-4 py-4 border-b border-gray-700 bg-gray-800/50">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center">
              <Icon name="sparkles" className="w-4 h-4 text-white"  />
            </div>
            <div>
              <span className="text-sm font-medium text-white">Building Progress</span>
              <div className="text-xs text-gray-400">
                Score: {engagementScore} • {Math.round(completionPercentage)}% complete
              </div>
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleShowExplanation}
            className="text-gray-400 hover:text-white hover:bg-gray-700 p-2"
          >
            <Icon name="alert-circle" className="w-4 h-4"  />
          </Button>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-gray-700 rounded-full h-2">
          <m.div
            className="bg-gradient-to-r from-purple-500 to-pink-500 h-2 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${completionPercentage}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>
      </div>

      {/* Question Content - Single scroll context */}
      <div className="flex-1 flex flex-col">
        <div className="relative z-10 flex-1 overflow-y-auto mobile-scroll p-4 space-y-6">
          {/* Question Header */}
          <m.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="space-y-3"
          >
            <h2 className="text-xl font-semibold text-white leading-tight">
              {currentQuestion.question}
            </h2>
            {currentQuestion.context && (
              <p className="text-gray-400 leading-relaxed">
                {currentQuestion.context}
              </p>
            )}
          </m.div>

          {/* Options Grid */}
          <div className="space-y-3">
            {visibleOptions.map((option, index) => {
              const isSelected = selectedOption === option.id
              const hasPreview = !!option.previewImpact

              return (
                <m.button
                  key={option.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 * index, duration: 0.3 }}
                  onClick={() => handleOptionSelect(option.id)}
                  className={cn(
                    "w-full p-4 rounded-xl border-2 transition-all duration-200",
                    "mobile-touch-target text-left group relative overflow-hidden",
                    isSelected
                      ? "border-purple-500 bg-purple-500/10 shadow-lg shadow-purple-500/20"
                      : "border-gray-600 bg-gray-800 hover:border-gray-500 hover:bg-gray-750 active:scale-[0.98]"
                  )}
                >
                  <div className="flex items-start gap-3 relative z-10">
                    {/* Selection Indicator */}
                    <div className={cn(
                      "w-5 h-5 rounded-full border-2 flex-shrink-0 mt-0.5 transition-all duration-200",
                      isSelected
                        ? "border-purple-500 bg-purple-500 shadow-md"
                        : "border-gray-500 group-hover:border-gray-400"
                    )}>
                      {isSelected && (
                        <m.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="w-full h-full rounded-full bg-white scale-50"
                        />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-white mb-1 group-hover:text-gray-100">
                        {option.text}
                      </h3>
                      {option.description && (
                        <p className="text-sm text-gray-400 leading-relaxed group-hover:text-gray-300">
                          {option.description}
                        </p>
                      )}
                    </div>

                    {/* Preview Indicator */}
                    {hasPreview && (
                      <div className="flex-shrink-0 self-start mt-0.5">
                        <m.div
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center transition-colors duration-200",
                            isSelected
                              ? "bg-purple-500 text-white"
                              : "bg-gray-700 text-gray-400 group-hover:bg-gray-600 group-hover:text-gray-300"
                          )}
                        >
                          <Icon name="eye" className="w-4 h-4"  />
                        </m.div>
                      </div>
                    )}
                  </div>

                  {/* Selection Animation Background */}
                  {isSelected && (
                    <m.div
                      layoutId="selectedOptionBackground"
                      className="absolute inset-0 bg-gradient-to-r from-purple-500/5 to-pink-500/5 rounded-xl"
                      initial={false}
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}

                  {/* Preview hint */}
                  {hasPreview && isSelected && (
                    <m.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="absolute bottom-2 right-2 text-xs text-purple-400 font-medium"
                    >
                      Tap again for Preview →
                    </m.div>
                  )}
                </m.button>
              )
            })}

            {/* Show More Button */}
            {hasMoreOptions && !showAllOptions && (
              <m.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                onClick={() => setShowAllOptions(true)}
                className="w-full p-3 border-2 border-dashed border-gray-600 rounded-xl text-gray-400 hover:text-gray-300 hover:border-gray-500 transition-colors mobile-touch-target"
              >
                <div className="flex items-center justify-center gap-2">
                  <Icon name="chevron-down" className="w-4 h-4"  />
                  <span className="text-sm font-medium">
                    Show {currentQuestion.options.length - 4} more options
                  </span>
                </div>
              </m.button>
            )}
          </div>

          {/* Question Tips */}
          {currentQuestion.visualHints?.relatedFeatures && currentQuestion.visualHints.relatedFeatures.length > 0 && (
            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="mt-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl"
            >
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Icon name="sparkles" className="w-3 h-3 text-blue-400"  />
                </div>
                <div>
                  <h4 className="text-sm font-medium text-blue-300 mb-1">Tip</h4>
                  <p className="text-sm text-blue-200 leading-relaxed">
                    This affects: {currentQuestion.visualHints.relatedFeatures.join(', ')}
                  </p>
                </div>
              </div>
            </m.div>
          )}
        </div>
      </div>

      {/* Action Bar */}
      <AnimatePresence>
        {selectedOption && (
          <m.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="relative z-30 p-4 border-t border-gray-700 bg-gray-800/95 backdrop-blur-sm"
          >
            <div className="flex gap-3">
              {/* Continue Button - Full width since preview button removed */}
              <Button
                size="lg"
                onClick={handleContinue}
                disabled={isAnswering}
                className="flex-1 h-12 bg-purple-600 hover:bg-purple-700 text-white border-0"
              >
                {isAnswering ? (
                  <Icon name="loader-2" className="w-4 h-4 mr-2 animate-spin"  />
                ) : (
                  <Icon name="arrow-right" className="w-4 h-4 mr-2"  />
                )}
                {isAnswering ? 'Processing...' : 'Continue'}
              </Button>
            </div>

            {/* Skip Option */}
            {currentQuestion.followUpLogic?.nextQuestionId !== null && (
              <div className="mt-3 text-center">
                <button
                  onClick={handleSkip}
                  className="text-sm text-gray-400 hover:text-gray-300 transition-colors"
                >
                  Skip this question
                </button>
              </div>
            )}

            {/* Gesture Hints */}
            <div className="mt-2 flex items-center justify-center gap-4 text-xs text-gray-500">
              <span>← Swipe to skip</span>
              <span>Swipe to continue →</span>
            </div>
          </m.div>
        )}
      </AnimatePresence>


      {/* Explanation Sheet - Fixed height, no internal scroll */}
      <MobileSheet
        isOpen={showExplanationSheet}
        onClose={() => setShowExplanationSheet(false)}
        title="Question Explanation"
        snapPoints={[0.4, 0.7]}
        initialSnap={0}
        enableInternalScroll={false}
      >
        <div className="p-4 h-full flex flex-col">
          {explanation ? (
            <div className="flex-1 flex items-start">
              <p className="text-gray-300 leading-relaxed text-sm">
                {explanation}
              </p>
            </div>
          ) : (
            <div className="flex-1 space-y-3">
              <div className="h-3 bg-gray-700 rounded animate-pulse" />
              <div className="h-3 bg-gray-700 rounded w-5/6 animate-pulse" />
              <div className="h-3 bg-gray-700 rounded w-4/6 animate-pulse" />
              <div className="h-3 bg-gray-700 rounded w-3/6 animate-pulse" />
            </div>
          )}
        </div>
      </MobileSheet>
    </div>
  )
}

