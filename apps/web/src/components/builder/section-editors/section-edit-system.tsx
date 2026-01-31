// Section Edit System - Progressive enhancement for AI-powered section editing
// Allows users to refine individual sections without overwhelming quick users

'use client'

import { useState, useRef, useEffect } from 'react'
import { m, AnimatePresence } from '@/components/ui/motion-provider'
import { aiClient } from '@/services/ai/enhanced-ai-client'
import { intentAnalyzer } from '@/services/user-intent/intent-analyzer'
// Temporarily disabled - import { useBuilderStore } from '@/store/builder-store'
import { FEATURE_FLAGS } from '@/config/feature-flags'
import { logger } from '@/utils/logger';

export interface SectionEditProps {
  sectionId: string                    // 'hero', 'header', 'features', etc.
  sectionType: string                  // Component type for AI
  currentContent: any                  // Current component definition
  businessContext: any                 // Business info for AI context
  onSectionUpdate: (newContent: any) => void
  onEditStart?: () => void
  onEditComplete?: () => void
}

export interface EditMode {
  mode: 'viewing' | 'hinting' | 'editing' | 'generating'
  trigger: 'hover' | 'click' | 'intent'
}

export function SectionEditSystem({
  sectionId,
  sectionType, 
  currentContent,
  businessContext,
  onSectionUpdate,
  onEditStart,
  onEditComplete
}: SectionEditProps) {
  const [editMode, setEditMode] = useState<EditMode>({ mode: 'viewing', trigger: 'hover' })
  const [isGenerating, setIsGenerating] = useState(false)
  const [userComment, setUserComment] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [confidence, setConfidence] = useState(0)
  const sectionRef = useRef<HTMLDivElement>(null)
  
  // Unified store integration - temporarily disabled
  const useNewStore = false // FEATURE_FLAGS.ENABLE_NEW_STORE
  // const { applyEdit } = useBuilderStore()

  // Show subtle hints on hover (for power users)
  const handleSectionHover = () => {
    if (editMode.mode === 'viewing') {
      setEditMode({ mode: 'hinting', trigger: 'hover' })
    }
  }

  const handleSectionLeave = () => {
    if (editMode.mode === 'hinting' && editMode.trigger === 'hover') {
      setEditMode({ mode: 'viewing', trigger: 'hover' })
    }
  }

  // Enter edit mode on click (progressive disclosure)
  const handleEditClick = () => {
    setEditMode({ mode: 'editing', trigger: 'click' })
    onEditStart?.()
  }

  // Process user's natural language modification
  const handleModification = async () => {
    if (!userComment.trim()) return

    setIsGenerating(true)
    setEditMode({ mode: 'generating', trigger: 'intent' })

    try {
      // Analyze user intent
      const intent = await intentAnalyzer.analyzeIntent(userComment, sectionType)
      setConfidence(intent.confidence)

      // Generate AI modification request
      const modificationResult = await aiClient.modifyComponent(
        currentContent,
        userComment,
        businessContext
      )

      if (modificationResult.success) {
        // Update the section with AI-generated content
        if (useNewStore) {
          // Use unified store for section updates - temporarily disabled
          // applyEdit(sectionId, modificationResult.component, userComment.trim() || 'AI Modification')
          onSectionUpdate(modificationResult.component)
        } else {
          // Fallback to callback method
          onSectionUpdate(modificationResult.component)
        }
        
        // Show completion state briefly
        setTimeout(() => {
          setEditMode({ mode: 'viewing', trigger: 'hover' })
          setUserComment('')
          onEditComplete?.()
        }, 1000)
      } else {
        // Handle error - stay in edit mode
        logger.error('AI modification failed:', modificationResult.error);
        setEditMode({ mode: 'editing', trigger: 'click' })
      }
    } catch (error) {
      logger.error('Section modification error:', error);
      setEditMode({ mode: 'editing', trigger: 'click' })
    } finally {
      setIsGenerating(false)
    }
  }

  // Generate quick suggestions based on section type
  useEffect(() => {
    if (editMode.mode === 'editing') {
      const sectionSuggestions = getSuggestionsForSection(sectionType, businessContext)
      setSuggestions(sectionSuggestions)
    }
  }, [editMode.mode, sectionType, businessContext])

  return (
    <div
      ref={sectionRef}
      className="relative group"
      onMouseEnter={handleSectionHover}
      onMouseLeave={handleSectionLeave}
    >
      {/* Original Section Content */}
      <div className="relative">
        {/* Section content goes here - this will be the actual rendered component */}
        <div id={`section-${sectionId}`} className="section-content">
          {/* This will be replaced by the actual component content */}
        </div>

        {/* Edit Hints Overlay (Subtle - Only on Hover) */}
        <AnimatePresence>
          {editMode.mode === 'hinting' && (
            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 pointer-events-none"
            >
              {/* Subtle corner indicator */}
              <div className="absolute top-2 right-2 pointer-events-auto">
                <m.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleEditClick}
                  className="flex items-center gap-1 px-2 py-1 bg-black/70 text-white text-xs rounded-md backdrop-blur-sm hover:bg-black/80 transition-colors"
                >
                  <span>✨</span>
                  <span>Edit with AI</span>
                </m.button>
              </div>

              {/* Subtle border highlight */}
              <div className="absolute inset-0 border-2 border-purple-400/30 rounded-lg pointer-events-none" />
            </m.div>
          )}
        </AnimatePresence>

        {/* Edit Interface (Full - When User Chooses to Edit) */}
        <AnimatePresence>
          {editMode.mode === 'editing' && (
            <m.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-10"
            >
              <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-2xl">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-2xl">🎨</span>
                  <h3 className="text-lg font-semibold">
                    Edit {sectionType.charAt(0).toUpperCase() + sectionType.slice(1)}
                  </h3>
                </div>

                <p className="text-gray-600 text-sm mb-4">
                  Tell us how you'd like to modify this section. Use natural language!
                </p>

                {/* Natural Language Input */}
                <div className="space-y-3">
                  <textarea
                    value={userComment}
                    onChange={(e) => setUserComment(e.target.value)}
                    placeholder={`e.g., "Make it more modern and professional" or "Add a booking button"`}
                    className="w-full p-3 border border-gray-300 rounded-lg resize-none h-20 text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    autoFocus
                  />

                  {/* Quick Suggestions */}
                  <div className="space-y-2">
                    <p className="text-xs text-gray-500">Quick suggestions:</p>
                    <div className="flex flex-wrap gap-2">
                      {suggestions.map((suggestion, index) => (
                        <button
                          key={index}
                          onClick={() => setUserComment(suggestion)}
                          className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-xs rounded transition-colors"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 mt-6">
                  <button
                    onClick={handleModification}
                    disabled={!userComment.trim() || isGenerating}
                    className="flex-1 bg-purple-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                  >
                    {isGenerating ? 'Generating...' : 'Apply Changes'}
                  </button>
                  <button
                    onClick={() => {
                      setEditMode({ mode: 'viewing', trigger: 'hover' })
                      setUserComment('')
                    }}
                    className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </m.div>
          )}
        </AnimatePresence>

        {/* Generation Loading State */}
        <AnimatePresence>
          {editMode.mode === 'generating' && (
            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-purple-600/20 backdrop-blur-sm flex items-center justify-center z-20"
            >
              <div className="bg-white rounded-lg p-6 text-center shadow-2xl">
                <m.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  className="text-4xl mb-4"
                >
                  🧠
                </m.div>
                <h3 className="text-lg font-semibold mb-2">AI is working...</h3>
                <p className="text-gray-600 text-sm">
                  Applying: "{userComment.substring(0, 50)}{userComment.length > 50 ? '...' : ''}"
                </p>
                {confidence > 0 && (
                  <div className="mt-3">
                    <div className="text-xs text-gray-500 mb-1">Confidence: {confidence}%</div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <m.div
                        className="bg-purple-600 h-2 rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${confidence}%` }}
                        transition={{ duration: 0.5 }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// Helper function to generate contextual suggestions
function getSuggestionsForSection(sectionType: string, businessContext: any): string[] {
  const suggestions: Record<string, string[]> = {
    hero: [
      'Make it more modern',
      'Add a booking button',
      'Make it feel more luxurious',
      'Add customer testimonials',
      'Make the text more compelling'
    ],
    header: [
      'Make navigation more prominent',
      'Add a phone number',
      'Make it more professional',
      'Add a booking button',
      'Simplify the design'
    ],
    features: [
      'Add more services',
      'Make it more visual',
      'Add pricing information',
      'Include customer benefits',
      'Make it more organized'
    ],
    testimonials: [
      'Add more reviews',
      'Make them more prominent',
      'Add star ratings',
      'Include customer photos',
      'Make them more believable'
    ],
    pricing: [
      'Make it clearer',
      'Add more packages',
      'Highlight the best value',
      'Add comparison table',
      'Make prices more prominent'
    ],
    contact: [
      'Add more contact methods',
      'Include a map',
      'Add business hours',
      'Make the form simpler',
      'Add social media links'
    ]
  }

  const businessSuggestions: Record<string, string[]> = {
    salon: ['Add booking widget', 'Show before/after photos', 'Include service menu'],
    restaurant: ['Add online ordering', 'Show menu highlights', 'Include delivery options'],
    ecommerce: ['Add product showcase', 'Include shopping features', 'Add customer reviews'],
    medical: ['Add appointment booking', 'Include credentials', 'Add insurance information']
  }

  const baseSuggestions = suggestions[sectionType] || ['Make it better', 'Change the style', 'Add more content']
  const contextSuggestions = businessSuggestions[businessContext?.type] || []

  return [...baseSuggestions.slice(0, 3), ...contextSuggestions.slice(0, 2)]
}

// Export component for use in preview system
export default SectionEditSystem