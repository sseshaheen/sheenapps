/**
 * UndoRedoButtonManager - Centralized management of undo/redo buttons
 * Handles both iframe communication and direct DOM manipulation fallbacks
 */

import { logger } from '@/utils/logger'
import { BUTTON_STYLES, BUTTON_ICONS, ANIMATIONS, TIMEOUTS } from '@/config/ui-constants'

interface ButtonState {
  canUndo: boolean
  canRedo: boolean
}

interface ButtonOptions {
  sectionType: string
  sectionId: string
  layoutId: string
  iframe: HTMLIFrameElement
}

export class UndoRedoButtonManager {
  private buttonStateCache = new Map<string, ButtonState>()
  private updateTimeouts = new Map<string, NodeJS.Timeout>()
  
  private static buildButtonStyle(type: 'undo' | 'redo'): string {
    const style = BUTTON_STYLES[type]
    return `
      background: ${style.background} !important; 
      color: ${style.color}; 
      border: none; 
      padding: ${style.padding}; 
      border-radius: ${style.borderRadius}; 
      font-size: ${style.fontSize}; 
      font-weight: ${style.fontWeight}; 
      cursor: pointer; 
      transition: all ${ANIMATIONS.TRANSITION_DURATION} ${ANIMATIONS.TRANSITION_EASE}; 
      backdrop-filter: blur(4px); 
      display: flex; 
      align-items: center; 
      gap: 4px;
    `.replace(/\s+/g, ' ').trim()
  }

  /**
   * Primary method to update buttons - tries iframe first, falls back to DOM manipulation
   */
  async updateButtons(options: ButtonOptions & ButtonState): Promise<void> {
    const { sectionType, sectionId, layoutId, iframe, canUndo, canRedo } = options
    const cacheKey = `${sectionType}:${sectionId}`
    
    // Check if state actually changed
    if (this.hasStateChanged(cacheKey, { canUndo, canRedo })) {
      this.clearTimeout(cacheKey)
      
      // Debounce updates
      this.updateTimeouts.set(cacheKey, setTimeout(() => {
        this.performUpdate(options)
      }, TIMEOUTS.BUTTON_DEBOUNCE))
    }
  }

  /**
   * Direct DOM manipulation for undo/redo operations (when iframe fails)
   */
  async updateButtonsDirectly(options: ButtonOptions & ButtonState): Promise<void> {
    const { sectionType, iframe, canUndo, canRedo } = options
    
    try {
      const doc = iframe.contentDocument
      if (!doc) throw new Error('Cannot access iframe document')
      
      const sectionControls = doc.querySelector(`[data-section-type="${sectionType}"] .section-controls`)
      if (!sectionControls) throw new Error('Section controls not found')
      
      // Clean up existing buttons
      this.cleanupExistingButtons(sectionControls)
      
      // Create new buttons in correct order
      this.createButtons(sectionControls, { canUndo, canRedo }, iframe, sectionType)
      
      logger.info(`✅ Direct DOM manipulation successful for ${sectionType}`)
    } catch (error) {
      logger.error(`❌ Direct DOM manipulation failed for ${sectionType}:`, error)
    }
  }

  /**
   * Clear all button state for a section (useful during cleanup)
   */
  clearSection(sectionType: string): void {
    const keysToDelete = Array.from(this.buttonStateCache.keys())
      .filter(key => key.startsWith(`${sectionType}:`))
    
    keysToDelete.forEach(key => {
      this.buttonStateCache.delete(key)
      this.clearTimeout(key)
    })
  }

  private hasStateChanged(cacheKey: string, newState: ButtonState): boolean {
    const cached = this.buttonStateCache.get(cacheKey)
    if (!cached) return true
    
    return cached.canUndo !== newState.canUndo || cached.canRedo !== newState.canRedo
  }

  private async performUpdate(options: ButtonOptions & ButtonState): Promise<void> {
    const { sectionType, sectionId, iframe, canUndo, canRedo } = options
    const cacheKey = `${sectionType}:${sectionId}`
    
    // Update cache
    this.buttonStateCache.set(cacheKey, { canUndo, canRedo })
    
    // Try iframe method first
    const iframeSuccess = await this.tryIframeUpdate(options)
    
    if (!iframeSuccess) {
      // Fallback to direct DOM manipulation
      await this.updateButtonsDirectly(options)
    }
  }

  private async tryIframeUpdate(options: ButtonOptions & ButtonState): Promise<boolean> {
    const { sectionType, sectionId, iframe, canUndo, canRedo } = options
    
    try {
      if (iframe.contentWindow?.updateUndoRedoButtons) {
        iframe.contentWindow.updateUndoRedoButtons(sectionType, sectionId, canUndo, canRedo)
        return true
      } else {
        // Try postMessage fallback
        iframe.contentWindow?.postMessage({
          type: 'UPDATE_UNDO_REDO_BUTTONS',
          sectionType,
          sectionId,
          canUndo,
          canRedo
        }, '*')
        return true
      }
    } catch (error) {
      logger.warn(`Iframe update failed for ${sectionType}:`, error)
      return false
    }
  }

  private cleanupExistingButtons(container: Element): void {
    // Remove by class
    container.querySelectorAll('.undo-button, .redo-button').forEach(btn => btn.remove())
    
    // Remove by ID pattern
    container.querySelectorAll('[id*="undo-"], [id*="redo-"]').forEach(btn => btn.remove())
    
    // Remove by text content
    Array.from(container.querySelectorAll('button')).forEach(btn => {
      if (btn.textContent && this.isUndoRedoButton(btn.textContent)) {
        btn.remove()
      }
    })
  }

  private isUndoRedoButton(text: string): boolean {
    return text.includes('↶') || text.includes('↷') || 
           text.toLowerCase().includes('undo') || text.toLowerCase().includes('redo')
  }

  private createButtons(
    container: Element, 
    state: ButtonState, 
    iframe: HTMLIFrameElement,
    sectionType: string
  ): void {
    const doc = container.ownerDocument!
    
    // Create undo button first (left position)
    if (state.canUndo) {
      const undoButton = this.createButton(doc, 'undo', 'Undo', iframe, sectionType)
      container.appendChild(undoButton)
    }
    
    // Create redo button second (right position)
    if (state.canRedo) {
      const redoButton = this.createButton(doc, 'redo', 'Redo', iframe, sectionType)
      container.appendChild(redoButton)
    }
  }

  private createButton(
    doc: Document, 
    type: 'undo' | 'redo', 
    text: string, 
    iframe: HTMLIFrameElement,
    sectionType: string
  ): HTMLButtonElement {
    const button = doc.createElement('button')
    button.className = `${type}-button`
    
    // Match the original design with icons
    const icon = BUTTON_ICONS[type]
    button.innerHTML = `<span style="font-size: 10px;">${icon}</span> ${text}`
    button.title = type === 'undo' ? 'Undo last change' : 'Redo next change'
    
    button.style.cssText = UndoRedoButtonManager.buildButtonStyle(type)
    
    // Add hover effects
    const hoverColor = BUTTON_STYLES[type].hoverBackground
    const normalColor = BUTTON_STYLES[type].background
      
    button.onmouseover = () => {
      button.style.transform = `scale(${ANIMATIONS.BUTTON_SCALE_HOVER})`
      button.style.background = hoverColor
    }
    
    button.onmouseout = () => {
      button.style.transform = `scale(${ANIMATIONS.BUTTON_SCALE_NORMAL})`
      button.style.background = normalColor
    }
    
    button.onclick = () => {
      iframe.contentWindow?.parent.postMessage({
        type: `${type.toUpperCase()}_SECTION_REQUEST`,
        data: { 
          sectionType: sectionType, 
          sectionId: sectionType, 
          sectionName: sectionType.charAt(0).toUpperCase() + sectionType.slice(1) 
        }
      }, '*')
    }
    
    return button
  }

  private clearTimeout(key: string): void {
    const timeout = this.updateTimeouts.get(key)
    if (timeout) {
      clearTimeout(timeout)
      this.updateTimeouts.delete(key)
    }
  }

  /**
   * Cleanup all timeouts and caches
   */
  destroy(): void {
    this.updateTimeouts.forEach(timeout => clearTimeout(timeout))
    this.updateTimeouts.clear()
    this.buttonStateCache.clear()
  }
}