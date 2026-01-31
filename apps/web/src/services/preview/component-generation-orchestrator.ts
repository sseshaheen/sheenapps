// Real Component Generation Orchestrator - No fake sequences
import { usePreviewGenerationStore } from '@/store/preview-generation-store'
import { fetchApi } from '@/lib/api-utils'
import { logger } from '@/utils/logger';

export type ComponentName = 'header' | 'hero' | 'features' // Only components available in mock data

export interface ComponentResult {
  component: ComponentName
  status: 'pending' | 'generating' | 'completed' | 'failed'
  data?: any
  generationTime?: number
  error?: string
  timestamp: number
}

export interface GenerationProgress {
  totalComponents: number
  completedComponents: number
  failedComponents: number
  currentlyGenerating: ComponentName[]
  results: Map<ComponentName, ComponentResult>
  overallProgress: number
}

export class ComponentGenerationOrchestrator {
  private projectId: string
  private choiceId: string
  private choiceName: string
  private components: ComponentName[] = ['header', 'hero', 'features'] // Only components that exist in mock data
  private results = new Map<ComponentName, ComponentResult>()
  private onProgressUpdate?: (progress: GenerationProgress) => void
  private onComponentComplete?: (component: ComponentName, result: ComponentResult) => void
  private onAllComplete?: (results: Map<ComponentName, ComponentResult>) => void
  private abortController?: AbortController

  constructor(
    projectId: string,
    choiceId: string,
    choiceName: string,
    options?: {
      onProgressUpdate?: (progress: GenerationProgress) => void
      onComponentComplete?: (component: ComponentName, result: ComponentResult) => void
      onAllComplete?: (results: Map<ComponentName, ComponentResult>) => void
      components?: ComponentName[]
    }
  ) {
    this.projectId = projectId
    this.choiceId = choiceId
    this.choiceName = choiceName
    this.onProgressUpdate = options?.onProgressUpdate
    this.onComponentComplete = options?.onComponentComplete
    this.onAllComplete = options?.onAllComplete
    
    if (options?.components) {
      this.components = options.components
    }

    // Initialize results
    this.components.forEach(component => {
      this.results.set(component, {
        component,
        status: 'pending',
        timestamp: Date.now()
      })
    })
  }

  async generateAll(): Promise<Map<ComponentName, ComponentResult>> {
    logger.info(`🚀 Starting real component generation for ${this.choiceName}:`, this.components);
    
    // Create abort controller for cancellation
    this.abortController = new AbortController()
    
    try {
      // Start all component generations in parallel
      const promises = this.components.map(component => this.generateComponent(component))
      
      // Wait for all to complete
      await Promise.allSettled(promises)
      
      logger.info(`✅ All components generation complete for ${this.choiceName}`);
      
      // Notify completion
      if (this.onAllComplete) {
        this.onAllComplete(this.results)
      }
      
      return this.results
      
    } catch (error) {
      logger.error('❌ Component generation error:', error);
      throw error
    }
  }

  private async generateComponent(component: ComponentName): Promise<void> {
    // Update status to generating
    this.updateComponentStatus(component, 'generating')
    
    try {
      logger.info(`🔄 Generating ${component} component...`);
      
      const response = await fetchApi(
        `/api/preview/${this.projectId}/${this.choiceId}/${component}`,
        { signal: this.abortController?.signal }
      )
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const result = await response.json()
      
      if (!result.success) {
        throw new Error(result.error || 'API returned error')
      }
      
      // Update with success
      this.updateComponentStatus(component, 'completed', {
        data: result.component,
        generationTime: result.metadata.generationTime
      })
      
      logger.info(`✅ ${component} generated in ${result.metadata.generationTime}ms`);
      
    } catch (error) {
      if (error.name === 'AbortError') {
        logger.info(`⏹️ ${component} generation cancelled`);
        return
      }
      
      logger.error(`❌ Failed to generate ${component}:`, error);
      
      // Update with failure
      this.updateComponentStatus(component, 'failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }

  private updateComponentStatus(
    component: ComponentName, 
    status: ComponentResult['status'], 
    updates?: Partial<ComponentResult>
  ) {
    const existing = this.results.get(component)!
    const updated: ComponentResult = {
      ...existing,
      status,
      timestamp: Date.now(),
      ...updates
    }
    
    this.results.set(component, updated)
    
    // Calculate overall progress
    const progress = this.calculateProgress()
    
    // Notify progress update
    if (this.onProgressUpdate) {
      this.onProgressUpdate(progress)
    }
    
    // Notify component completion
    if (status === 'completed' && this.onComponentComplete) {
      this.onComponentComplete(component, updated)
    }
  }

  private calculateProgress(): GenerationProgress {
    const total = this.components.length
    let completed = 0
    let failed = 0
    const currentlyGenerating: ComponentName[] = []
    
    for (const [component, result] of this.results) {
      switch (result.status) {
        case 'completed':
          completed++
          break
        case 'failed':
          failed++
          break
        case 'generating':
          currentlyGenerating.push(component)
          break
      }
    }
    
    const overallProgress = Math.round((completed / total) * 100)
    
    return {
      totalComponents: total,
      completedComponents: completed,
      failedComponents: failed,
      currentlyGenerating,
      results: new Map(this.results),
      overallProgress
    }
  }

  cancel(): void {
    logger.info(`⏹️ Cancelling component generation for ${this.choiceName}`);
    if (this.abortController) {
      this.abortController.abort()
    }
  }

  getProgress(): GenerationProgress {
    return this.calculateProgress()
  }

  isComplete(): boolean {
    const progress = this.calculateProgress()
    return progress.completedComponents + progress.failedComponents === progress.totalComponents
  }

  getCompletedComponents(): ComponentResult[] {
    return Array.from(this.results.values()).filter(r => r.status === 'completed')
  }

  getFailedComponents(): ComponentResult[] {
    return Array.from(this.results.values()).filter(r => r.status === 'failed')
  }
}