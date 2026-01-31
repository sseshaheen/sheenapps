// Editable Preview Wrapper - Integrates section editors with existing preview system
// Maintains current UX while adding powerful AI editing capabilities

'use client'

import { useState, useEffect, useRef } from 'react'
import { m, AnimatePresence } from '@/components/ui/motion-provider'
import SectionEditSystem from './section-edit-system'
import { InlineSectionControls } from './inline-section-controls'
import { usePerSectionHistoryStore } from '@/stores/per-section-history-store'
import { logger } from '@/utils/logger';

export interface EditableSection {
  id: string                          // 'hero', 'header', 'features', etc.
  type: string                        // Component type for AI
  selector: string                    // CSS selector to find the section
  displayName: string                 // User-friendly name
  aiEnabled: boolean                  // Whether AI editing is available
  content?: any                       // Current component definition
}

export interface EditablePreviewProps {
  previewContainerRef: React.RefObject<HTMLDivElement>
  businessContext: any               // Business info for AI context
  currentContent: any               // Current preview content/state
  onContentUpdate: (sectionId: string, newContent: any) => void
  editingEnabled?: boolean          // Master switch for editing features
  userPreference?: 'simple' | 'advanced' // User's complexity preference
  layoutId?: string                 // Current layout ID for history tracking
}

export function EditablePreviewWrapper({
  previewContainerRef,
  businessContext,
  currentContent,
  onContentUpdate,
  editingEnabled = true,
  userPreference = 'simple',
  layoutId = 'current-layout'
}: EditablePreviewProps) {
  const [detectedSections, setDetectedSections] = useState<EditableSection[]>([])
  const [editingMode, setEditingMode] = useState<'off' | 'hints' | 'full'>('off')
  const [activeEdit, setActiveEdit] = useState<string | null>(null)
  const [showEditingGuide, setShowEditingGuide] = useState(false)
  
  // History store for undo/redo
  const { recordEdit } = usePerSectionHistoryStore()

  // TEMP: Debug logging
  useEffect(() => {
    console.log('🎨 EditablePreviewWrapper mounted', {
      editingEnabled,
      userPreference,
      editingMode,
      detectedSections: detectedSections.length,
      hasContainer: !!previewContainerRef.current
    })
  }, [])

  // Detect sections in the preview automatically
  useEffect(() => {
    if (!previewContainerRef.current || !editingEnabled) return

    const detectSections = () => {
      const container = previewContainerRef.current
      if (!container) return

      const sections: EditableSection[] = []
      
      // Try to access iframe content
      const iframe = container.querySelector('iframe') as HTMLIFrameElement
      let documentToSearch: Document | Element = container
      let iframeAccessible = false
      
      try {
        if (iframe && iframe.contentDocument && iframe.contentDocument.body) {
          documentToSearch = iframe.contentDocument
          iframeAccessible = true
          logger.info('🔍 Successfully accessing iframe content');
        } else {
          logger.info('🔍 Iframe content not accessible, using container');
        }
      } catch (error) {
        logger.info('🔍 Error accessing iframe:', error);
      }
      
      // If we can't access iframe, create sections based on what SHOULD be there
      if (!iframeAccessible) {
        logger.info('🔍 Creating expected sections since iframe not accessible');
        const expectedSections = [
          { id: 'header', type: 'header', name: 'Header', selector: 'nav.navigation' },
          { id: 'hero', type: 'hero', name: 'Hero Section', selector: '.hero-section' },
          { id: 'features', type: 'features', name: 'Features', selector: '.features-section' },
          { id: 'testimonials', type: 'testimonials', name: 'Testimonials', selector: '.testimonial-section' }
        ]
        
        expectedSections.forEach(section => {
          sections.push({
            id: section.id,
            type: section.type,
            selector: section.selector,
            displayName: section.name,
            aiEnabled: true,
            content: currentContent?.[section.id]
          })
        })
      } else {
        // Iframe accessible - search for actual sections
        const sectionMappings = [
          { selector: 'nav.navigation, header, .header', id: 'header', type: 'header', name: 'Header' },
          { selector: '.hero-section, .hero, section.hero-section', id: 'hero', type: 'hero', name: 'Hero Section' },
          { selector: '.features-section, .features, section.features-section', id: 'features', type: 'features', name: 'Features' },
          { selector: '.testimonial-section, .testimonials, section.testimonial-section', id: 'testimonials', type: 'testimonials', name: 'Testimonials' },
          { selector: '.pricing-section, .pricing, section.pricing-section', id: 'pricing', type: 'pricing', name: 'Pricing' },
          { selector: 'footer, .footer, .contact-section', id: 'contact', type: 'contact', name: 'Contact' }
        ]

        sectionMappings.forEach(mapping => {
          const element = documentToSearch.querySelector(mapping.selector)
          console.log(`🔍 Checking ${mapping.id}:`, {
            selector: mapping.selector,
            found: !!element,
            elementType: element?.tagName,
            elementClass: element?.className
          })
          
          if (element) {
            sections.push({
              id: mapping.id,
              type: mapping.type,
              selector: mapping.selector,
              displayName: mapping.name,
              aiEnabled: true,
              content: currentContent?.[mapping.id]
            })
          }
        })
      }

      setDetectedSections(sections)
      logger.info('🔍 Final detected sections:', sections.map(s => ({ id: s.id, type: s.type, found: true })))
      console.log('🔍 Section detection summary:', {
        totalSections: sections.length,
        sectionIds: sections.map(s => s.id),
        iframeAccessible,
        containerSize: container ? { w: container.offsetWidth, h: container.offsetHeight } : 'none'
      })
    }

    // Watch for iframe content changes
    const observer = new MutationObserver(() => {
      // Delay detection to allow iframe content to settle
      setTimeout(detectSections, 100)
    })
    
    observer.observe(previewContainerRef.current, { 
      childList: true, 
      subtree: true 
    })

    // Also watch for iframe load events
    const iframe = previewContainerRef.current.querySelector('iframe')
    if (iframe) {
      const onIframeLoad = () => {
        setTimeout(detectSections, 200)
        setTimeout(detectSections, 1000) // After content changes
      }
      iframe.addEventListener('load', onIframeLoad)
    }

    // Multiple detection attempts to catch different loading phases
    setTimeout(detectSections, 100)   // Quick check
    setTimeout(detectSections, 500)   // After initial load
    setTimeout(detectSections, 1500)  // After potential content changes
    setTimeout(detectSections, 3000)  // Final attempt after everything settles

    return () => observer.disconnect()
  }, [previewContainerRef, currentContent, editingEnabled])

  // Determine editing mode based on user preference
  useEffect(() => {
    if (!editingEnabled) {
      setEditingMode('off')
    } else if (userPreference === 'simple') {
      setEditingMode('hints') // Subtle hints only
    } else {
      setEditingMode('full') // Full editing capabilities
    }
  }, [editingEnabled, userPreference])

  // Handle section update from AI editing
  const handleSectionUpdate = (sectionId: string, newContent: any, userAction?: string) => {
    logger.info(`🎨 Section updated: ${sectionId}`, newContent);
    
    // Record the change in history store
    const section = detectedSections.find(s => s.id === sectionId)
    if (section && userAction) {
      recordEdit(layoutId, section.type, sectionId, newContent, userAction)
    }
    
    onContentUpdate(sectionId, newContent)
    setActiveEdit(null)
  }

  // Enhanced editing mode toggle (for power users)
  const toggleEditingMode = () => {
    const modes: Array<'off' | 'hints' | 'full'> = ['off', 'hints', 'full']
    const currentIndex = modes.indexOf(editingMode)
    const nextMode = modes[(currentIndex + 1) % modes.length]
    setEditingMode(nextMode)
    
    if (nextMode === 'full' && !showEditingGuide) {
      setShowEditingGuide(true)
    }
  }

  return (
    <div className="relative">
      {/* Editing Controls (Moved to avoid overlap) */}
      {editingEnabled && (
        <div className="absolute top-4 left-4 z-50 flex items-center gap-2">
          {/* Quick Guide Button */}
          {editingMode !== 'off' && (
            <m.button
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              onClick={() => setShowEditingGuide(true)}
              className="p-2 bg-white/90 hover:bg-white rounded-full shadow-lg backdrop-blur-sm transition-colors"
              title="How to edit sections"
            >
              <span className="text-sm">❓</span>
            </m.button>
          )}

          {/* Editing Mode Toggle */}
          <m.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={toggleEditingMode}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              editingMode === 'off' 
                ? 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                : editingMode === 'hints'
                ? 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                : 'bg-purple-600 text-white hover:bg-purple-700'
            }`}
          >
            {editingMode === 'off' && '✨ Enable Editing'}
            {editingMode === 'hints' && '👆 Click to Edit'}
            {editingMode === 'full' && '🎨 Full Edit Mode'}
          </m.button>
        </div>
      )}

      {/* Section Edit Buttons (Outside iframe, positioned over it) */}
      {editingMode !== 'off' && detectedSections.length > 0 && (
        <div className="absolute inset-0 pointer-events-none z-40">
          {/* Debug grid overlay - shows iframe area */}
          {/* eslint-disable-next-line no-restricted-globals */}
          {process.env.NODE_ENV === 'development' && (
            <IframeDebugOverlay previewContainer={previewContainerRef.current} />
          )}
          
          {detectedSections.map(section => (
            <SectionEditButton
              key={section.id}
              section={section}
              layoutId={layoutId}
              previewContainer={previewContainerRef.current}
              onEditClick={() => setActiveEdit(section.id)}
              onContentUpdate={onContentUpdate}
              isActive={activeEdit === section.id}
            />
          ))}
        </div>
      )}

      {/* Section Edit Dialog - Shows when a section is being edited */}
      {activeEdit && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-[2px] flex items-center justify-center z-[60]">
          <SectionEditDialog
            section={detectedSections.find(s => s.id === activeEdit)!}
            businessContext={businessContext}
            onSectionUpdate={(newContent) => handleSectionUpdate(activeEdit, newContent)}
            onClose={() => setActiveEdit(null)}
          />
        </div>
      )}

      {/* Quick Editing Guide */}
      <AnimatePresence>
        {showEditingGuide && (
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center"
            onClick={() => setShowEditingGuide(false)}
          >
            <m.div
              initial={{ scale: 0.8, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.8, y: 20 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-lg p-6 max-w-md mx-4 shadow-2xl"
            >
              <div className="flex items-center gap-2 mb-4">
                <span className="text-2xl">🎨</span>
                <h3 className="text-lg font-semibold">AI-Powered Editing</h3>
              </div>

              <div className="space-y-4 text-sm text-gray-600">
                <div>
                  <strong className="text-gray-800">How it works:</strong>
                  <ul className="list-disc list-inside mt-1 space-y-1">
                    <li>Hover over any section to see edit options</li>
                    <li>Click "Edit with AI" to modify that section</li>
                    <li>Use natural language: "make it more modern"</li>
                    <li>AI will understand and apply your changes</li>
                  </ul>
                </div>

                <div>
                  <strong className="text-gray-800">Examples:</strong>
                  <ul className="list-disc list-inside mt-1 space-y-1">
                    <li>"Add a booking button to the hero"</li>
                    <li>"Make the header more professional"</li>
                    <li>"Include more customer testimonials"</li>
                  </ul>
                </div>
              </div>

              <button
                onClick={() => setShowEditingGuide(false)}
                className="w-full mt-6 bg-purple-600 text-white py-2 rounded-lg font-medium hover:bg-purple-700 transition-colors"
              >
                Got it!
              </button>
            </m.div>
          </m.div>
        )}
      </AnimatePresence>

      {/* Preview Content (Original) */}
      <div className="preview-content">
        {/* Original preview content renders here */}
      </div>
    </div>
  )
}


// Section Edit Button - Positioned over detected sections
interface SectionEditButtonProps {
  section: EditableSection
  layoutId: string
  previewContainer: HTMLDivElement | null
  onEditClick: () => void
  onContentUpdate: (sectionId: string, newContent: any) => void
  isActive: boolean
}

// Section Edit Dialog - Modal for editing a specific section
interface SectionEditDialogProps {
  section: EditableSection
  businessContext: any
  onSectionUpdate: (newContent: any) => void
  onClose: () => void
}

function SectionEditDialog({ section, businessContext, onSectionUpdate, onClose }: SectionEditDialogProps) {
  const [userComment, setUserComment] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [suggestions] = useState([
    'Make it more modern',
    'Add more content',
    'Change the style',
    'Make it more professional',
    'Add a call-to-action'
  ])

  const handleModification = async () => {
    if (!userComment.trim()) return

    setIsGenerating(true)
    try {
      // Simulate AI modification (replace with real AI call)
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      const mockUpdate = {
        type: section.type,
        id: `${section.id}-modified-${Date.now()}`,
        props: {
          modification: userComment,
          timestamp: Date.now()
        }
      }
      
      onSectionUpdate(mockUpdate)
      onClose()
    } catch (error) {
      logger.error('Section modification error:', error);
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <m.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.8, opacity: 0 }}
      className="bg-gray-900 border border-gray-700 rounded-lg p-6 max-w-md w-full mx-4 shadow-2xl relative z-10"
      onClick={e => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">🎨</span>
        <h3 className="text-lg font-semibold text-white">
          Edit {section.displayName}
        </h3>
      </div>

      <p className="text-gray-300 text-sm mb-4">
        Tell us how you'd like to modify this section. Use natural language!
      </p>

      {/* Natural Language Input */}
      <div className="space-y-3">
        <textarea
          value={userComment}
          onChange={(e) => setUserComment(e.target.value)}
          placeholder={`e.g., "Make it more modern and professional" or "Add a booking button"`}
          className="w-full p-3 border border-gray-600 bg-gray-800 text-white rounded-lg resize-none h-20 text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 placeholder-gray-400"
          autoFocus
        />

        {/* Quick Suggestions */}
        <div className="space-y-2">
          <p className="text-xs text-gray-400">Quick suggestions:</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((suggestion, index) => (
              <button
                key={index}
                onClick={() => setUserComment(suggestion)}
                className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-xs text-gray-200 rounded transition-colors"
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
          className="flex-1 bg-purple-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors"
        >
          {isGenerating ? 'Generating...' : 'Apply Changes'}
        </button>
        <button
          onClick={onClose}
          className="px-4 py-2 text-gray-300 hover:text-white transition-colors font-medium"
        >
          Cancel
        </button>
      </div>
    </m.div>
  )
}

function SectionEditButton({ section, layoutId, previewContainer, onEditClick, onContentUpdate, isActive }: SectionEditButtonProps) {
  const [buttonPosition, setButtonPosition] = useState<{ top: number, left: number } | null>(null)

  // Robust positioning using a grid-based approach
  useEffect(() => {
    if (!previewContainer) return

    const calculatePosition = () => {
      const iframe = previewContainer.querySelector('iframe') as HTMLIFrameElement
      if (!iframe) return

      const iframeRect = iframe.getBoundingClientRect()
      const containerRect = previewContainer.getBoundingClientRect()

      // Calculate iframe content area relative to container
      const iframeContentArea = {
        left: iframeRect.left - containerRect.left,
        top: iframeRect.top - containerRect.top,
        width: iframeRect.width,
        height: iframeRect.height
      }

      // Fixed grid positioning - reliable and consistent
      const gridPositions: Record<string, { topPercent: number, rightOffset: number }> = {
        header: { topPercent: 2, rightOffset: 200 },      // Wider offset for inline controls
        hero: { topPercent: 15, rightOffset: 200 },       // 15% down
        features: { topPercent: 45, rightOffset: 200 },   // 45% down  
        testimonials: { topPercent: 75, rightOffset: 200 } // 75% down
      }

      const grid = gridPositions[section.id]
      if (grid) {
        const position = {
          left: iframeContentArea.left + iframeContentArea.width - grid.rightOffset,
          top: iframeContentArea.top + (iframeContentArea.height * grid.topPercent / 100)
        }

        console.log(`📍 Grid positioning for ${section.id}:`, {
          section: section.id,
          iframeArea: iframeContentArea,
          gridConfig: grid,
          finalPosition: position
        })

        setButtonPosition(position)
      }
    }

    // Calculate immediately and on resize
    calculatePosition()
    
    const resizeObserver = new ResizeObserver(calculatePosition)
    resizeObserver.observe(previewContainer)

    return () => resizeObserver.disconnect()
  }, [previewContainer, section.id])

  if (!buttonPosition) {
    logger.info(`❌ No position calculated for ${section.id} - button not rendered`);
    return null
  }

  // Undo/redo handlers - apply content changes to section
  const handleUndo = (content: any) => {
    logger.info(`↶ Undo ${section.displayName}:`, content);
    onContentUpdate(section.id, content)
  }

  const handleRedo = (content: any) => {
    logger.info(`↷ Redo ${section.displayName}:`, content);  
    onContentUpdate(section.id, content)
  }

  return (
    <div
      className="absolute pointer-events-auto z-50"
      style={{
        left: buttonPosition.left,
        top: buttonPosition.top,
      }}
    >
      {/* Inline undo/redo controls beside edit button */}
      <InlineSectionControls
        layoutId={layoutId}
        sectionType={section.type}
        sectionId={section.id}
        sectionName={section.displayName}
        onEdit={onEditClick}
        onUndo={handleUndo}
        onRedo={handleRedo}
        className="shadow-xl backdrop-blur-sm"
      />
    </div>
  )
}

// Debug overlay to visualize iframe area and grid positions
function IframeDebugOverlay({ previewContainer }: { previewContainer: HTMLDivElement | null }) {
  const [iframeArea, setIframeArea] = useState<{ left: number, top: number, width: number, height: number } | null>(null)

  useEffect(() => {
    if (!previewContainer) return

    const updateIframeArea = () => {
      const iframe = previewContainer.querySelector('iframe') as HTMLIFrameElement
      if (!iframe) return

      const iframeRect = iframe.getBoundingClientRect()
      const containerRect = previewContainer.getBoundingClientRect()

      setIframeArea({
        left: iframeRect.left - containerRect.left,
        top: iframeRect.top - containerRect.top,
        width: iframeRect.width,
        height: iframeRect.height
      })
    }

    updateIframeArea()
    const resizeObserver = new ResizeObserver(updateIframeArea)
    resizeObserver.observe(previewContainer)

    return () => resizeObserver.disconnect()
  }, [previewContainer])

  if (!iframeArea) return null

  const gridLines = [
    { percent: 2, label: 'Header' },
    { percent: 15, label: 'Hero' },
    { percent: 45, label: 'Features' },
    { percent: 75, label: 'Testimonials' }
  ]

  return (
    <div className="absolute pointer-events-none">
      {/* Iframe boundary */}
      <div 
        className="border-2 border-blue-400 bg-blue-400/10"
        style={{
          left: iframeArea.left,
          top: iframeArea.top,
          width: iframeArea.width,
          height: iframeArea.height,
          position: 'absolute'
        }}
      />
      
      {/* Grid lines */}
      {gridLines.map(line => (
        <div key={line.label}>
          <div
            className="border-t-2 border-red-400 bg-red-400/20"
            style={{
              left: iframeArea.left,
              top: iframeArea.top + (iframeArea.height * line.percent / 100),
              width: iframeArea.width,
              height: 2,
              position: 'absolute'
            }}
          />
          <div
            className="text-xs text-red-400 bg-black/50 px-1 rounded"
            style={{
              left: iframeArea.left + 10,
              top: iframeArea.top + (iframeArea.height * line.percent / 100) - 10,
              position: 'absolute'
            }}
          >
            {line.label} ({line.percent}%)
          </div>
        </div>
      ))}
    </div>
  )
}

export default EditablePreviewWrapper