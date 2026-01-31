/**
 * Template Renderer Service
 * Manages Web Worker for secure template rendering with timeout protection
 */

interface TemplateRenderResult {
  success: boolean
  data?: any
  error?: {
    message: string
    stack?: string
  }
}

interface WorkerMessage {
  type: string
  id: string
  result?: any
  error?: any
}

class TemplateRendererService {
  private worker: Worker | null = null
  private messageId = 0
  private pendingMessages = new Map<string, {
    resolve: (value: any) => void
    reject: (error: any) => void
    timeout: NodeJS.Timeout
  }>()

  /**
   * Initialize the worker
   */
  private initWorker(): Worker {
    if (this.worker) {
      return this.worker
    }

    // Create worker from secure API endpoint
    this.worker = new Worker('/api/workers/template-renderer')

    // Handle messages
    this.worker.addEventListener('message', (event: MessageEvent<WorkerMessage>) => {
      const { id, type, result, error } = event.data
      const pending = this.pendingMessages.get(id)

      if (!pending) {
        console.warn('[TemplateRenderer] Received message for unknown ID:', id)
        return
      }

      // Clear timeout
      clearTimeout(pending.timeout)
      this.pendingMessages.delete(id)

      // Handle response
      if (type === 'RENDER_ERROR' || error) {
        pending.reject(new Error(error?.message || 'Worker error'))
      } else {
        pending.resolve(result)
      }
    })

    // Handle errors
    this.worker.addEventListener('error', (error) => {
      console.error('[TemplateRenderer] Worker error:', error)
      
      // Reject all pending messages
      for (const [id, pending] of this.pendingMessages) {
        clearTimeout(pending.timeout)
        pending.reject(new Error('Worker crashed'))
      }
      this.pendingMessages.clear()
      
      // Reset worker
      this.worker = null
    })

    return this.worker
  }

  /**
   * Send message to worker with timeout
   */
  private async sendMessage(type: string, payload: any, timeoutMs = 2000): Promise<any> {
    const worker = this.initWorker()
    const id = `msg-${++this.messageId}`

    return new Promise((resolve, reject) => {
      // Set timeout (2s default as per security requirements)
      const timeout = setTimeout(() => {
        this.pendingMessages.delete(id)
        
        // Terminate worker on timeout
        console.error('[TemplateRenderer] Worker timeout, terminating...')
        this.terminate()
        
        reject(new Error('Template rendering timeout'))
      }, timeoutMs)

      // Store pending message
      this.pendingMessages.set(id, { resolve, reject, timeout })

      // Send message
      worker.postMessage({ type, payload, id })
    })
  }

  /**
   * Render template with security sandbox
   */
  async renderTemplate(templateData: any): Promise<TemplateRenderResult> {
    try {
      const result = await this.sendMessage('RENDER_TEMPLATE', templateData)
      return {
        success: true,
        data: result
      }
    } catch (error) {
      console.error('[TemplateRenderer] Render failed:', error)
      return {
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined
        }
      }
    }
  }

  /**
   * Validate props against schema
   */
  async validateProps(props: any, schema: any): Promise<{
    valid: boolean
    errors: Array<{ field: string; error: string }>
  }> {
    try {
      const result = await this.sendMessage('VALIDATE_PROPS', { props, schema })
      return result
    } catch (error) {
      console.error('[TemplateRenderer] Validation failed:', error)
      return {
        valid: false,
        errors: [{
          field: 'general',
          error: error instanceof Error ? error.message : 'Validation failed'
        }]
      }
    }
  }

  /**
   * Terminate worker
   */
  terminate(): void {
    if (this.worker) {
      // Reject all pending messages
      for (const [id, pending] of this.pendingMessages) {
        clearTimeout(pending.timeout)
        pending.reject(new Error('Worker terminated'))
      }
      this.pendingMessages.clear()

      // Terminate worker
      this.worker.terminate()
      this.worker = null
    }
  }

  /**
   * Get worker status
   */
  isReady(): boolean {
    return this.worker !== null
  }
}

// Export singleton instance
export const templateRenderer = new TemplateRendererService()

// Export types
export type { TemplateRenderResult }