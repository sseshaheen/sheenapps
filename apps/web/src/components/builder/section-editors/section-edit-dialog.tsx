'use client'

import { useState, useEffect } from 'react'
import { m, AnimatePresence } from '@/components/ui/motion-provider'
import { aiApiClient } from '@/services/ai/api-client'
import { usePreviewGenerationStore } from '@/store/preview-generation-store'
// Temporarily disabled - import { useBuilderStore } from '@/store/builder-store'
import { FEATURE_FLAGS } from '@/config/feature-flags'
import { logger } from '@/utils/logger';

interface SectionEditDialogProps {
  sectionType: string
  businessContext: any
  onSectionUpdate: (newContent: any, userAction: string) => void
  onClose: () => void
}

export function SectionEditDialog({ 
  sectionType, 
  businessContext, 
  onSectionUpdate, 
  onClose 
}: SectionEditDialogProps) {
  const [userComment, setUserComment] = useState('')
  
  // Use the same store as the main AI generation overlay
  const { startGenerating, updateGenerationProgress } = usePreviewGenerationStore()
  
  // Quick suggestion templates based on section type
  const getSuggestions = (type: string) => {
    const suggestions: Record<string, string[]> = {
      header: [
        'Make it more professional',
        'Add contact information',
        'Include social media links',
        'Change the logo style'
      ],
      hero: [
        'Make it more modern',
        'Add a booking button',
        'Include customer testimonials',
        'Change the color scheme',
        'Add more compelling copy'
      ],
      features: [
        'Make it more visually appealing',
        'Add pricing information',
        'Include customer testimonials',
        'Change the layout'
      ],
      testimonials: [
        'Make them more compelling',
        'Add star ratings',
        'Include more reviews',
        'Change the style'
      ]
    }
    
    return suggestions[type] || [
      'Make it more modern',
      'Add more content',
      'Change the style',
      'Make it more professional'
    ]
  }

  const handleModification = async () => {
    if (!userComment.trim()) return

    // Create unique choice ID for section editing
    const sectionChoiceId = `section-edit-${sectionType}-${Date.now()}`
    
    // Start generation in the main store (triggers main AI overlay)
    startGenerating(sectionChoiceId)
    
    // Close this dialog immediately - progress will show in main overlay
    onClose()
    
    try {
      // Create section modification request
      const modificationRequest = {
        action: 'modify_section',
        sectionType,
        userInput: userComment.trim(),
        businessContext,
        currentContent: null
      }

      logger.info('🎨 Requesting section modification:', modificationRequest);

      // Use AI API client for realistic network behavior
      const response = await aiApiClient.modifySection(
        modificationRequest,
        (stage, progressValue) => {
          logger.info(`🎯 Section editing progress: ${stage} (${Math.round(progressValue)}%)`)
          // Update the main generation store (same as choice generation)
          updateGenerationProgress(sectionChoiceId, progressValue, {
            stage: 'generating',
            component: sectionType,
            loadingMessage: stage
          })
        }
      )

      if (response && response.component) {
        logger.info('✅ Section modification successful:', response.component);
        onSectionUpdate(response.component, userComment.trim())
        
        // Mark as completed in the store
        const store = usePreviewGenerationStore.getState()
        store.markAsGenerated(sectionChoiceId, response.component)
        store.finishGenerating(sectionChoiceId)
        
      } else {
        logger.error('❌ Section modification failed: No component returned');
        // Mark as failed in the store
        const store = usePreviewGenerationStore.getState()
        store.finishGenerating(sectionChoiceId)
      }

    } catch (error) {
      logger.error('❌ Section modification error:', error);
      // Mark as failed in the store
      const store = usePreviewGenerationStore.getState()
      store.finishGenerating(sectionChoiceId)
    }
  }

  const handleSuggestionClick = (suggestion: string) => {
    setUserComment(suggestion)
  }

  const suggestions = getSuggestions(sectionType)

  return (
    <m.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.8, opacity: 0 }}
      className="bg-gray-900 border border-gray-700 rounded-lg p-4 max-w-md w-full mx-4 shadow-2xl relative z-10 max-h-[calc(100vh-140px)] overflow-y-auto"
      style={{
        marginBottom: 'calc(64px + env(safe-area-inset-bottom))'
      }}
      onClick={e => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">🎨</span>
        <h3 className="text-base font-semibold text-white">
          Edit {sectionType.charAt(0).toUpperCase() + sectionType.slice(1)} Section
        </h3>
      </div>

      <p className="text-gray-300 text-sm mb-3">
        Tell us how you'd like to modify this section. Use natural language!
      </p>


      {/* Natural Language Input */}
      <div className="space-y-3">
        <textarea
          value={userComment}
          onChange={(e) => setUserComment(e.target.value)}
          placeholder={`e.g., "Make it more modern and professional" or "Add a booking button"`}
          className="w-full p-3 border border-gray-600 bg-gray-800 text-white rounded-lg resize-none h-16 text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 placeholder-gray-400"
          autoFocus
        />

        {/* Quick Suggestions */}
        <div className="space-y-2">
          <p className="text-xs text-gray-400">Quick suggestions:</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((suggestion, index) => (
              <button
                key={index}
                onClick={() => handleSuggestionClick(suggestion)}
                className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-xs text-gray-200 rounded transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Action Buttons - Mobile optimized */}
      <div className="flex gap-2 mt-4">
        <button
          onClick={handleModification}
          disabled={!userComment.trim()}
          className="flex-1 bg-purple-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors text-sm min-h-[44px] flex items-center justify-center"
        >
          Apply Changes
        </button>
        <button
          onClick={onClose}
          className="px-4 py-3 text-gray-300 hover:text-white transition-colors font-medium text-sm min-h-[44px] flex items-center justify-center"
        >
          Cancel
        </button>
      </div>
    </m.div>
  )
}