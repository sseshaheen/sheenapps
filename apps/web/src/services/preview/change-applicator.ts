// Change Applicator - Handles applying changes to the iframe

import type { PreviewChange, PreviewUpdate } from '@/types/question-flow'
import { logger } from '@/utils/logger';

export class ChangeApplicator {
  
  static async applyChangesToIframe(iframe: HTMLIFrameElement, update: PreviewUpdate): Promise<void> {
    if (!iframe?.contentWindow) {
      logger.error('❌ No iframe content window available');
      return
    }

    try {
      // Send update to iframe
      iframe.contentWindow.postMessage({
        type: 'PREVIEW_UPDATE',
        update: this.createSerializableUpdate(update)
      }, '*')

      logger.info('✅ Changes sent to iframe:', update.changes.length, 'changes');
    } catch (error) {
      logger.error('❌ Error applying changes to iframe:', error);
    }
  }

  static applyChangeDirectly(element: Element, change: PreviewChange): void {
    logger.info('🔧 Applying change:', change.selector, change.property, change.value?.substring(0, 100))
    
    try {
      switch (change.property) {
        case 'appendChild':
          this.handleAppendChild(element, change.value)
          break
          
        case 'outerHTML':
          this.handleOuterHTML(element, change.value)
          break
          
        case 'textContent':
          this.handleTextContent(element, change.value, change.animation)
          break
          
        case 'src':
          this.handleSrc(element, change.value)
          break
          
        case 'appendStyle':
          this.handleAppendStyle(change.value)
          break
          
        case 'display':
          this.handleDisplay(element, change.value, change.animation)
          break
          
        case 'remove':
          this.handleRemove(element)
          break
          
        default:
          if (change.property.startsWith('style.')) {
            this.handleStyleProperty(element, change.property, change.value)
          } else {
            this.handleGenericProperty(element, change.property, change.value)
          }
      }

      // Apply animation if specified
      if (change.animation) {
        this.applyAnimation(element, change.animation)
      }

    } catch (error) {
      logger.error('❌ Error applying change:', { error, change }, 'preview');
    }
  }

  private static handleAppendChild(element: Element, value: string): void {
    if (value) {
      const newElement = document.createElement('div')
      newElement.innerHTML = value
      const childToAppend = newElement.firstElementChild
      if (childToAppend) {
        element.appendChild(childToAppend)
      }
    }
  }

  private static handleOuterHTML(element: Element, value: string): void {
    const tempDiv = document.createElement('div')
    tempDiv.innerHTML = value
    const newElement = tempDiv.firstElementChild
    if (newElement && element.parentNode) {
      element.parentNode.replaceChild(newElement, element)
    }
  }

  private static handleTextContent(element: Element, value: string, animation?: string): void {
    if (animation === 'typewriter') {
      this.typewriterEffect(element, value)
    } else {
      element.textContent = value
    }
  }

  private static handleSrc(element: Element, value: string): void {
    if (element instanceof HTMLImageElement || element instanceof HTMLIFrameElement) {
      element.src = value
    }
  }

  private static handleAppendStyle(css: string): void {
    const styleElement = document.createElement('style')
    styleElement.textContent = css
    styleElement.id = 'preview-styles-' + Date.now()
    document.head.appendChild(styleElement)
  }

  private static handleDisplay(element: Element, value: string, animation?: string): void {
    if (element instanceof HTMLElement) {
      element.style.display = value
      if (animation) {
        element.classList.add('animate-' + animation)
      }
    }
  }

  private static handleStyleProperty(element: Element, property: string, value: string): void {
    if (element instanceof HTMLElement) {
      const styleProp = property.substring(6) // Remove 'style.' prefix
      element.style.setProperty(styleProp, value)
    }
  }

  private static handleGenericProperty(element: Element, property: string, value: string): void {
    if (element instanceof HTMLElement) {
      (element.style as any)[property] = value
    }
  }

  private static applyAnimation(element: Element, animation: string): void {
    if (element instanceof HTMLElement) {
      element.classList.add('animate-' + animation)
      
      // Remove animation class after it completes
      setTimeout(() => {
        element.classList.remove('animate-' + animation)
      }, 1000)
    }
  }

  private static typewriterEffect(element: Element, text: string, speed: number = 50): void {
    element.textContent = ''
    let i = 0

    function type() {
      if (i < text.length) {
        element.textContent += text.charAt(i)
        i++
        setTimeout(type, speed)
      }
    }

    type()
  }

  private static createSerializableUpdate(update: PreviewUpdate): any {
    // Create a clean, serializable copy
    return {
      id: update.id,
      type: update.type,
      changes: update.changes.map(change => ({
        selector: change.selector,
        property: change.property,
        value: change.value,
        animation: change.animation
      })),
      duration: update.duration,
      explanation: update.explanation,
      delay: update.delay
    }
  }

  static findElementsBySelector(container: Document | Element, selector: string): Element[] {
    try {
      return Array.from(container.querySelectorAll(selector))
    } catch (error) {
      logger.warn('❌ Invalid selector:', selector, error);
      return []
    }
  }

  static waitForElement(container: Document | Element, selector: string, timeout: number = 5000): Promise<Element | null> {
    return new Promise((resolve) => {
      const element = container.querySelector(selector)
      if (element) {
        resolve(element)
        return
      }

      const observer = new MutationObserver(() => {
        const element = container.querySelector(selector)
        if (element) {
          observer.disconnect()
          resolve(element)
        }
      })

      observer.observe(container, {
        childList: true,
        subtree: true
      })

      setTimeout(() => {
        observer.disconnect()
        resolve(null)
      }, timeout)
    })
  }

  private static handleRemove(element: Element): void {
    if (element && element.parentNode) {
      element.parentNode.removeChild(element)
      logger.info(`🗑️ Removed element: ${element.tagName}${element.id ? '#' + element.id : ''}`);
    }
  }
}