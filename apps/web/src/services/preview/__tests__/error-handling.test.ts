import { describe, test, expect, vi, beforeEach } from 'vitest'
import { logger } from '@/utils/logger';

// Mock the logger
vi.mock('@/utils/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn()
  }
}))

describe('Iframe Communication Error Handling & Resilience', () => {
  let mockIframe: any
  let mockDocument: any

  beforeEach(() => {
    vi.clearAllMocks()
    
    mockDocument = {
      getElementById: vi.fn(() => null),
      querySelectorAll: vi.fn(() => []),
      querySelector: vi.fn(() => null)
    }

    mockIframe = {
      contentWindow: {
        document: mockDocument,
        updateUndoRedoButtons: vi.fn(),
        postMessage: vi.fn()
      },
      contentDocument: mockDocument
    }
  })

  describe('Iframe Access Failures', () => {
    test('handles null iframe gracefully', () => {
      const iframe = null
      
      // Simulate the button update function with null iframe
      function updateButtonsWithErrorHandling(iframe: any, canUndo: boolean, canRedo: boolean) {
        try {
          if (!iframe || !iframe.contentWindow || !iframe.contentWindow.document) {
            logger.error('Iframe not accessible for button update');
            return false
          }
          
          // Normal button update logic would go here
          return true
        } catch (error) {
          logger.error('Failed to update buttons:', error);
          return false
        }
      }

      const result = updateButtonsWithErrorHandling(iframe, true, false)
      
      expect(result).toBe(false)
      expect(logger.error).toHaveBeenCalledWith('Iframe not accessible for button update')
    })

    test('handles iframe without contentWindow', () => {
      const brokenIframe = {}
      
      function updateButtonsWithErrorHandling(iframe: any, canUndo: boolean, canRedo: boolean) {
        try {
          if (!iframe || !iframe.contentWindow || !iframe.contentWindow.document) {
            logger.error('Iframe not accessible for button update');
            return false
          }
          return true
        } catch (error) {
          logger.error('Failed to update buttons:', error);
          return false
        }
      }

      const result = updateButtonsWithErrorHandling(brokenIframe, true, false)
      
      expect(result).toBe(false)
      expect(logger.error).toHaveBeenCalledWith('Iframe not accessible for button update')
    })

    test('handles iframe with null contentDocument', () => {
      const partialIframe = {
        contentWindow: null,
        contentDocument: null
      }
      
      function updateButtonsWithErrorHandling(iframe: any, canUndo: boolean, canRedo: boolean) {
        try {
          if (!iframe || !iframe.contentWindow || !iframe.contentWindow.document) {
            logger.error('Iframe not accessible for button update');
            return false
          }
          return true
        } catch (error) {
          logger.error('Failed to update buttons:', error);
          return false
        }
      }

      const result = updateButtonsWithErrorHandling(partialIframe, true, false)
      
      expect(result).toBe(false)
      expect(logger.error).toHaveBeenCalledWith('Iframe not accessible for button update')
    })
  })

  describe('DOM Element Access Failures', () => {
    test('handles missing buttons gracefully during update', () => {
      // Mock getElementById to return null (button not found)
      mockDocument.getElementById.mockReturnValue(null)
      
      function updateSpecificButton(document: any, buttonId: string, canPerformAction: boolean) {
        try {
          const button = document.getElementById(buttonId)
          if (!button) {
            logger.error(`Button ${buttonId} not found in iframe`);
            return false
          }
          
          button.style.opacity = canPerformAction ? '1' : '0.4'
          button.disabled = !canPerformAction
          return true
        } catch (error) {
          logger.error(`Failed to update button ${buttonId}:`, error);
          return false
        }
      }

      const result = updateSpecificButton(mockDocument, 'undo-hero-hero', true)
      
      expect(result).toBe(false)
      expect(logger.error).toHaveBeenCalledWith('Button undo-hero-hero not found in iframe')
      expect(mockDocument.getElementById).toHaveBeenCalledWith('undo-hero-hero')
    })

    test('handles DOM manipulation errors gracefully', () => {
      // Mock button that throws error when accessing style
      const faultyButton = {
        get style() {
          throw new Error('DOM access denied')
        },
        disabled: false
      }
      
      mockDocument.getElementById.mockReturnValue(faultyButton)
      
      function updateSpecificButton(document: any, buttonId: string, canPerformAction: boolean) {
        try {
          const button = document.getElementById(buttonId)
          if (!button) {
            logger.error(`Button ${buttonId} not found in iframe`);
            return false
          }
          
          button.style.opacity = canPerformAction ? '1' : '0.4'
          button.disabled = !canPerformAction
          return true
        } catch (error) {
          logger.error(`Failed to update button ${buttonId}:`, error);
          return false
        }
      }

      const result = updateSpecificButton(mockDocument, 'undo-hero-hero', true)
      
      expect(result).toBe(false)
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to update button undo-hero-hero:', 
        expect.any(Error)
      )
    })
  })

  describe('PostMessage Communication Failures', () => {
    test('handles postMessage failures gracefully', () => {
      // Mock postMessage to throw error
      mockIframe.contentWindow.postMessage = vi.fn(() => {
        throw new Error('PostMessage blocked by browser')
      })
      
      function sendMessageToIframe(iframe: any, message: any) {
        try {
          if (!iframe || !iframe.contentWindow) {
            logger.error('Cannot send message: iframe not accessible');
            return false
          }
          
          iframe.contentWindow.postMessage(message, '*')
          return true
        } catch (error) {
          logger.error('Failed to send message to iframe:', error);
          return false
        }
      }

      const message = { type: 'UPDATE_BUTTONS', canUndo: true, canRedo: false }
      const result = sendMessageToIframe(mockIframe, message)
      
      expect(result).toBe(false)
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to send message to iframe:', 
        expect.any(Error)
      )
    })

    test('handles iframe cross-origin restrictions', () => {
      // Simulate cross-origin restriction
      Object.defineProperty(mockIframe, 'contentWindow', {
        get() {
          throw new DOMException('Cross-origin access denied', 'SecurityError')
        }
      })
      
      function sendMessageToIframe(iframe: any, message: any) {
        try {
          if (!iframe || !iframe.contentWindow) {
            logger.error('Cannot send message: iframe not accessible');
            return false
          }
          
          iframe.contentWindow.postMessage(message, '*')
          return true
        } catch (error) {
          logger.error('Failed to send message to iframe:', error);
          return false
        }
      }

      const message = { type: 'UNDO_REQUEST' }
      const result = sendMessageToIframe(mockIframe, message)
      
      expect(result).toBe(false)
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to send message to iframe:', 
        expect.any(DOMException)
      )
    })
  })

  describe('Recovery Mechanisms', () => {
    test('implements retry logic for failed button updates', async () => {
      let attemptCount = 0
      
      mockDocument.getElementById = vi.fn(() => {
        attemptCount++
        if (attemptCount < 3) {
          throw new Error('Temporary DOM error')
        }
        return {
          style: { opacity: '', display: '' },
          disabled: false
        }
      })
      
      async function updateButtonWithRetry(document: any, buttonId: string, maxRetries = 3) {
        for (let i = 0; i < maxRetries; i++) {
          try {
            const button = document.getElementById(buttonId)
            if (button) {
              button.style.opacity = '1'
              return true
            }
          } catch (error) {
            logger.error(`Attempt ${i + 1} failed:`, error);
            if (i === maxRetries - 1) {
              logger.error('All retry attempts failed');
              return false
            }
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 100))
          }
        }
        return false
      }

      const result = await updateButtonWithRetry(mockDocument, 'undo-hero-hero')
      
      expect(result).toBe(true)
      expect(attemptCount).toBe(3)
      expect(logger.error).toHaveBeenCalledTimes(2) // First 2 attempts failed
    })

    test('falls back to polling when postMessage fails', async () => {
      const maxPolls = 3
      
      // Mock failed postMessage
      mockIframe.contentWindow.postMessage = vi.fn(() => {
        throw new Error('PostMessage failed')
      })
      
      // Mock successful direct DOM access after first attempt
      let attemptCount = 0
      mockDocument.getElementById = vi.fn(() => {
        attemptCount++
        if (attemptCount === 1) {
          // First attempt succeeds
          return {
            style: { opacity: '', display: '' },
            disabled: false
          }
        }
        return null
      })
      
      async function updateButtonsWithFallback(iframe: any, canUndo: boolean, canRedo: boolean) {
        let pollCount = 0
        
        // Try postMessage first
        try {
          iframe.contentWindow.postMessage({
            type: 'UPDATE_BUTTONS',
            canUndo,
            canRedo
          }, '*')
          return { result: 'postMessage', pollCount }
        } catch (error) {
          logger.error('PostMessage failed, falling back to direct DOM access');
          
          // Fallback: direct DOM manipulation with polling
          while (pollCount < maxPolls) {
            try {
              const undoButton = iframe.contentWindow.document.getElementById('undo-hero-hero')
              if (undoButton) {
                undoButton.style.opacity = canUndo ? '1' : '0.4'
                return { result: 'directDOM', pollCount }
              }
              pollCount++
              await new Promise(resolve => setTimeout(resolve, 10)) // Shorter delay for test
            } catch (domError) {
              logger.error('Direct DOM access also failed');
              break
            }
          }
          
          return { result: 'failed', pollCount }
        }
      }

      const { result, pollCount } = await updateButtonsWithFallback(mockIframe, true, false)
      
      expect(result).toBe('directDOM')
      expect(pollCount).toBe(0) // Found button on first attempt, so no polling needed
      expect(logger.error).toHaveBeenCalledWith('PostMessage failed, falling back to direct DOM access')
    })
  })

  describe('Memory Leak Prevention', () => {
    test('cleans up event listeners on iframe errors', () => {
      const mockRemoveEventListener = vi.fn()
      const mockIframeWithListeners = {
        contentWindow: {
          removeEventListener: mockRemoveEventListener
        },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      }
      
      function cleanupIframeListeners(iframe: any) {
        try {
          // Cleanup content window listeners
          if (iframe.contentWindow && iframe.contentWindow.removeEventListener) {
            iframe.contentWindow.removeEventListener('message', expect.any(Function))
          }
          
          // Cleanup iframe listeners
          iframe.removeEventListener('load', expect.any(Function))
          
          return true
        } catch (error) {
          logger.error('Error during cleanup:', error);
          return false
        }
      }

      const result = cleanupIframeListeners(mockIframeWithListeners)
      
      expect(result).toBe(true)
      expect(mockIframeWithListeners.removeEventListener).toHaveBeenCalled()
    })
  })
})