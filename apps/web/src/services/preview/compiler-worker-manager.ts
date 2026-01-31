/**
 * Compiler Worker Manager
 * 
 * Manages the Web Worker for component compilation, providing a clean
 * async interface and handling worker lifecycle.
 */

export interface CompileRequest {
  source: string
  componentName: string
  dependencies?: Record<string, string>
}

export interface CompileResult {
  success: boolean
  code?: string
  error?: string
  hash?: string
  compilationTime?: number
}

export class CompilerWorkerManager {
  private worker: Worker | null = null
  private pendingRequests = new Map<string, {
    resolve: (result: CompileResult) => void
    reject: (error: Error) => void
  }>()
  private requestIdCounter = 0
  private initPromise: Promise<void> | null = null

  /**
   * Initialize the worker
   */
  private async initWorker(): Promise<void> {
    if (this.worker) return
    
    if (this.initPromise) {
      return this.initPromise
    }
    
    this.initPromise = new Promise((resolve, reject) => {
      try {
        // Create worker with proper typing
        this.worker = new Worker(
          new URL('../../workers/component-compiler.worker.ts', import.meta.url),
          { type: 'module' }
        )
        
        this.worker.addEventListener('message', this.handleWorkerMessage.bind(this))
        
        this.worker.addEventListener('error', (error) => {
          console.error('Worker error:', error)
          reject(error)
        })
        
        // Give worker time to initialize
        setTimeout(() => resolve(), 100)
        
      } catch (error) {
        console.error('Failed to create worker:', error)
        reject(error)
      }
    })
    
    return this.initPromise
  }

  /**
   * Handle messages from the worker
   */
  private handleWorkerMessage(event: MessageEvent) {
    const { data } = event
    
    if (data.type === 'compile-result') {
      const pending = this.pendingRequests.get(data.id)
      if (pending) {
        this.pendingRequests.delete(data.id)
        
        pending.resolve({
          success: data.success,
          code: data.code,
          error: data.error,
          hash: data.hash,
          compilationTime: data.compilationTime
        })
      }
    }
  }

  /**
   * Compile a component source
   */
  async compile(request: CompileRequest): Promise<CompileResult> {
    // Ensure worker is initialized
    await this.initWorker()
    
    return new Promise((resolve, reject) => {
      const id = `compile-${this.requestIdCounter++}`
      
      this.pendingRequests.set(id, { resolve, reject })
      
      if (!this.worker) {
        reject(new Error('Worker not initialized'))
        return
      }
      
      // Send compilation request
      this.worker.postMessage({
        type: 'compile',
        id,
        source: request.source,
        componentName: request.componentName,
        dependencies: request.dependencies
      })
      
      // Timeout after 10 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id)
          reject(new Error('Compilation timeout'))
        }
      }, 10000)
    })
  }

  /**
   * Clear the compilation cache
   */
  async clearCache(): Promise<void> {
    if (!this.worker) return
    
    this.worker.postMessage({ type: 'clear-cache' })
  }

  /**
   * Terminate the worker
   */
  terminate() {
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }
    
    // Reject any pending requests
    this.pendingRequests.forEach(({ reject }) => {
      reject(new Error('Worker terminated'))
    })
    this.pendingRequests.clear()
  }
}

// Export singleton instance
export const compilerWorkerManager = new CompilerWorkerManager()