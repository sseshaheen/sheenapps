/**
 * Section Wrapper - Edit controls and styling for React preview sections
 * Expert requirement: Edit controls as React components (no DOM injection)
 * Updated: Modern eye-friendly design
 */

'use client'

import React, { useState, useEffect } from 'react'
import { useBuilderStore, selectors } from '@/store/builder-store'
import { FEATURE_FLAGS } from '@/config/feature-flags'
import type { SectionState } from '@/store/builder-store'
import { useResponsive } from '@/hooks/use-responsive'
import { Z_INDEX } from '@/config/ui-constants'

interface SectionWrapperProps {
  section: SectionState
  enableEditing?: boolean
  children: React.ReactNode
}

export function SectionWrapper({ 
  section, 
  enableEditing = true, 
  children 
}: SectionWrapperProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const { applyEdit, undo, redo } = useBuilderStore()
  const useNewStore = FEATURE_FLAGS.ENABLE_NEW_STORE
  const { showMobileUI } = useResponsive()
  
  // Triple-click detection state (desktop)
  const [clickCount, setClickCount] = useState(0)
  const [clickTimer, setClickTimer] = useState<NodeJS.Timeout | null>(null)
  
  // Mobile-specific state
  const [isActive, setIsActive] = useState(false) // For mobile, "active" replaces "hovered"
  const [longPressTimer, setLongPressTimer] = useState<NodeJS.Timeout | null>(null)
  const [touchStartTime, setTouchStartTime] = useState(0)
  
  // Get section-specific undo/redo state from unified store for React Preview
  const canUndo = useBuilderStore(state => selectors.canUndoSection(section.id)(state))
  const canRedo = useBuilderStore(state => selectors.canRedoSection(section.id)(state))
  
  const handleEdit = () => {
    setIsEditing(true)
    // Send message to workspace to open edit dialog
    window.postMessage({
      type: 'EDIT_SECTION_REQUEST',
      data: {
        sectionType: section.type,
        sectionId: section.id,
        sectionName: `${section.type} section`
      }
    }, '*')
  }
  
  // Handle triple-click to edit (desktop)
  const handleTripleClick = (e: React.MouseEvent) => {
    if (!enableEditing || showMobileUI) return
    
    e.preventDefault()
    e.stopPropagation()
    
    const newClickCount = clickCount + 1
    setClickCount(newClickCount)
    
    // Clear existing timer
    if (clickTimer) {
      clearTimeout(clickTimer)
    }
    
    if (newClickCount === 3) {
      // Triple click detected - trigger edit
      console.log(`🖱️ Triple-click detected on ${section.type} section - opening edit dialog`)
      handleEdit()
      setClickCount(0)
      setClickTimer(null)
    } else {
      // Set timer to reset click count
      const timer = setTimeout(() => {
        setClickCount(0)
        setClickTimer(null)
      }, 500) // 500ms window for triple-click
      
      setClickTimer(timer)
    }
  }
  
  // Handle touch interactions (mobile)
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!enableEditing || !showMobileUI) return
    
    setTouchStartTime(Date.now())
    setIsActive(true)
    
    // Start long press timer (800ms for long press to edit)
    const timer = setTimeout(() => {
      console.log(`📱 Long press detected on ${section.type} section - opening edit dialog`)
      handleEdit()
      // Haptic feedback if available
      if (navigator.vibrate) {
        navigator.vibrate(50)
      }
    }, 800)
    
    setLongPressTimer(timer)
  }
  
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!enableEditing || !showMobileUI) return
    
    const touchDuration = Date.now() - touchStartTime
    
    // Clear long press timer
    if (longPressTimer) {
      clearTimeout(longPressTimer)
      setLongPressTimer(null)
    }
    
    // If it's a quick tap (not a long press), show edit controls briefly
    if (touchDuration < 800) {
      setIsActive(true)
      // Show controls for 3 seconds on quick tap
      setTimeout(() => {
        setIsActive(false)
      }, 3000)
    } else {
      setIsActive(false)
    }
  }
  
  const handleTouchCancel = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer)
      setLongPressTimer(null)
    }
    setIsActive(false)
  }
  
  const handleUndo = () => {
    if (useNewStore && canUndo) {
      // Send message to workspace for consistency with iframe system
      window.postMessage({
        type: 'UNDO_SECTION_REQUEST',
        data: {
          sectionType: section.type,
          sectionId: section.id,
          sectionName: `${section.type} section`
        }
      }, '*')
    }
  }
  
  const handleRedo = () => {
    if (useNewStore && canRedo) {
      // Send message to workspace for consistency with iframe system  
      window.postMessage({
        type: 'REDO_SECTION_REQUEST',
        data: {
          sectionType: section.type,
          sectionId: section.id,
          sectionName: `${section.type} section`
        }
      }, '*')
    }
  }
  
  // Cleanup timers on unmount
  React.useEffect(() => {
    return () => {
      if (clickTimer) {
        clearTimeout(clickTimer)
      }
      if (longPressTimer) {
        clearTimeout(longPressTimer)
      }
    }
  }, [clickTimer, longPressTimer])
  
  if (!enableEditing) {
    return <>{children}</>
  }
  
  return (
    <div
      className="relative section-wrapper"
      data-section-id={section.id}
      data-section-type={section.type}
      // Desktop interactions
      onMouseEnter={!showMobileUI ? () => setIsHovered(true) : undefined}
      onMouseLeave={!showMobileUI ? () => setIsHovered(false) : undefined}
      onClick={!showMobileUI ? handleTripleClick : undefined}
      // Mobile interactions
      onTouchStart={showMobileUI ? handleTouchStart : undefined}
      onTouchEnd={showMobileUI ? handleTouchEnd : undefined}
      onTouchCancel={showMobileUI ? handleTouchCancel : undefined}
      style={{
        outline: (isHovered || isActive || clickCount > 0) ? '2px solid #3b82f6' : '2px solid transparent',
        outlineOffset: '-2px',
        transition: 'outline 0.3s ease',
        cursor: enableEditing ? (showMobileUI ? 'default' : 'pointer') : 'default',
        backgroundColor: (clickCount > 0 || isActive) ? 'rgba(59, 130, 246, 0.05)' : 'transparent',
        // Prevent text selection on mobile for better touch interaction
        userSelect: showMobileUI ? 'none' : 'auto',
        WebkitUserSelect: showMobileUI ? 'none' : 'auto',
        WebkitTouchCallout: showMobileUI ? ('none' as any) : ('auto' as any)
      }}
    >
      {/* Section content */}
      {children}
      
      {/* Edit controls overlay */}
      {(isHovered || isActive || isEditing) && (
        <div 
          className="absolute top-3 right-3 flex items-center gap-2"
          style={{ pointerEvents: 'auto', zIndex: Z_INDEX.SECTION_CONTROLS }}
        >
          <div 
            className="flex items-center rounded-xl shadow-lg border"
            style={{
              background: 'rgba(255, 255, 255, 0.98)',
              backdropFilter: 'blur(8px)',
              borderColor: 'rgba(226, 232, 240, 0.7)',
              padding: '8px'
            }}
          >
            {/* Edit button */}
            <button
              onClick={handleEdit}
              className="flex items-center gap-2 rounded-lg font-medium transition-all duration-200"
              style={{
                backgroundColor: '#475569',
                color: 'white',
                padding: '8px 16px',
                fontSize: '14px',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#334155'
                e.currentTarget.style.transform = 'scale(1.02)'
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#475569'
                e.currentTarget.style.transform = 'scale(1)'
                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)'
              }}
              title={`Edit ${section.type} section`}
            >
              <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Edit
            </button>
            
            {/* Divider */}
            <div style={{ width: '1px', height: '24px', backgroundColor: 'rgba(148, 163, 184, 0.6)', margin: '0 8px' }} />
            
            {/* Undo button */}
            <button
              onClick={handleUndo}
              disabled={!canUndo}
              className="flex items-center gap-1 rounded-lg font-medium transition-all duration-200"
              style={{
                backgroundColor: canUndo ? '#78716c' : '#f8fafc',
                color: canUndo ? 'white' : '#9ca3af',
                padding: '8px 12px',
                fontSize: '14px',
                border: canUndo ? 'none' : '1px solid #e5e7eb',
                cursor: canUndo ? 'pointer' : 'not-allowed',
                boxShadow: canUndo ? '0 1px 3px rgba(0, 0, 0, 0.1)' : 'none'
              }}
              onMouseEnter={(e) => {
                if (canUndo) {
                  e.currentTarget.style.backgroundColor = '#57534e'
                  e.currentTarget.style.transform = 'scale(1.02)'
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)'
                }
              }}
              onMouseLeave={(e) => {
                if (canUndo) {
                  e.currentTarget.style.backgroundColor = '#78716c'
                  e.currentTarget.style.transform = 'scale(1)'
                  e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)'
                }
              }}
              title={canUndo ? "Undo last change" : "No changes to undo"}
            >
              <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
            </button>
            
            {/* Redo button */}
            <button
              onClick={handleRedo}
              disabled={!canRedo}
              className="flex items-center gap-1 rounded-lg font-medium transition-all duration-200"
              style={{
                backgroundColor: canRedo ? '#78716c' : '#f8fafc',
                color: canRedo ? 'white' : '#9ca3af',
                padding: '8px 12px',
                fontSize: '14px',
                border: canRedo ? 'none' : '1px solid #e5e7eb',
                cursor: canRedo ? 'pointer' : 'not-allowed',
                boxShadow: canRedo ? '0 1px 3px rgba(0, 0, 0, 0.1)' : 'none'
              }}
              onMouseEnter={(e) => {
                if (canRedo) {
                  e.currentTarget.style.backgroundColor = '#57534e'
                  e.currentTarget.style.transform = 'scale(1.02)'
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)'
                }
              }}
              onMouseLeave={(e) => {
                if (canRedo) {
                  e.currentTarget.style.backgroundColor = '#78716c'
                  e.currentTarget.style.transform = 'scale(1)'
                  e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)'
                }
              }}
              title={canRedo ? "Redo last undone change" : "No changes to redo"}
            >
              <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2m18-10l-6 6m6-6l-6-6" />
              </svg>
            </button>
          </div>
        </div>
      )}
      
      {/* Section info tooltip */}
      {(isHovered || isActive) && (
        <div className="absolute top-3 left-3" style={{ zIndex: Z_INDEX.SECTION_TOOLTIP }}>
          <div className="
            px-2.5 py-1.5 bg-slate-800/90 backdrop-blur-sm text-white text-xs font-medium 
            rounded-md shadow-md border border-slate-700/40
            opacity-95
          ">
            <span className="capitalize text-slate-100">{section.type}</span>
            <span className="text-slate-400 mx-1">•</span>
            <span className="text-slate-300">{section.id}</span>
            {clickCount > 0 && !showMobileUI && (
              <>
                <span className="text-slate-400 mx-1">•</span>
                <span className="text-blue-300">
                  {clickCount === 1 ? 'Click again...' : clickCount === 2 ? 'Triple-click!' : 'Editing...'}
                </span>
              </>
            )}
            {isActive && showMobileUI && (
              <>
                <span className="text-slate-400 mx-1">•</span>
                <span className="text-blue-300">
                  Long press to edit
                </span>
              </>
            )}
          </div>
        </div>
      )}
      
      {/* Triple-click indicator */}
      {clickCount > 0 && !isHovered && (
        <div className="absolute top-3 left-3" style={{ zIndex: Z_INDEX.SECTION_TOOLTIP }}>
          <div className="
            px-2 py-1 bg-blue-500/90 backdrop-blur-sm text-white text-xs font-medium 
            rounded-md shadow-md
            opacity-90
          ">
            {clickCount === 1 ? '• •' : clickCount === 2 ? '• • •' : 'Opening...'}
          </div>
        </div>
      )}
    </div>
  )
}

// Lightweight wrapper for non-editable previews
export function ReadOnlySection({ children }: { children: React.ReactNode }) {
  return <div className="readonly-section">{children}</div>
}