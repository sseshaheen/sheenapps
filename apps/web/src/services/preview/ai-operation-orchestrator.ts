// AI Operation Orchestrator - Simulates progressive AI component assembly
import type { PreviewImpact } from '@/types/question-flow'
import { usePreviewGenerationStore } from '@/store/preview-generation-store'
import { logger } from '@/utils/logger';

export interface AIOperationStage {
  stage: string
  component: string
  duration: number
  loadingMessage: string
  impact: PreviewImpact // Will contain the modular impact data for this stage
  delay?: number // Optional delay before starting this stage
}

export interface AIOperationSequence {
  choiceId: string
  choiceName: string
  totalDuration: number
  stages: AIOperationStage[]
}

export interface AIOperationRequest {
  choiceId: string
  choiceName: string
  originalImpact: any
}

export class AIOperationOrchestrator {
  private currentSequence: AIOperationSequence | null = null
  private isProcessing = false
  private onStageUpdate?: (stage: AIOperationStage, progress: number) => void
  private onComplete?: () => void
  private onStageComplete?: (stage: AIOperationStage) => Promise<void>
  private abortController: AbortController | null = null
  private operationQueue: AIOperationRequest[] = []
  private isProcessingQueue = false

  constructor(
    onStageUpdate?: (stage: AIOperationStage, progress: number) => void,
    onComplete?: () => void,
    onStageComplete?: (stage: AIOperationStage) => Promise<void>
  ) {
    this.onStageUpdate = onStageUpdate
    this.onComplete = onComplete
    this.onStageComplete = onStageComplete
  }

  /**
   * Convert a full modular impact into a staged operation sequence
   */
  createOperationSequence(choiceId: string, choiceName: string, originalImpact: any): AIOperationSequence {
    const modules = originalImpact.modules || {}
    
    // Stage 1: Foundation (colors, typography, background)
    const foundationStage: AIOperationStage = {
      stage: "foundation",
      component: "styling",
      duration: 1800,
      loadingMessage: `Analyzing ${choiceName.toLowerCase()} personality...`,
      impact: {
        type: "modular-transformation",
        changes: {},
        modules: {
          colorScheme: modules.colorScheme,
          typography: modules.typography,
          customCSS: modules.customCSS
        }
      } as any
    }

    // Stage 2: Branding (header/navigation)  
    const brandingStage: AIOperationStage = {
      stage: "branding",
      component: "header", 
      duration: 2200,
      loadingMessage: "Crafting premium branding elements...",
      impact: {
        type: "modular-transformation",
        changes: {},
        modules: {
          header: modules.header
        }
      } as any,
      delay: 500
    }

    // Stage 3: Messaging (hero section)
    const messagingStage: AIOperationStage = {
      stage: "messaging", 
      component: "hero",
      duration: 2800,
      loadingMessage: "Generating compelling hero messaging...",
      impact: {
        type: "modular-transformation", 
        changes: {},
        modules: {
          hero: modules.hero
        }
      } as any,
      delay: 400
    }

    // Stage 4: Features (service showcase)
    const featuresStage: AIOperationStage = {
      stage: "features",
      component: "services",
      duration: 2000,
      loadingMessage: "Showcasing specialized services...",
      impact: {
        type: "modular-transformation",
        changes: {},
        modules: {
          features: modules.features
        }
      } as any,
      delay: 400
    }

    // Stage 5: Polish (animations and final touches)
    const polishStage: AIOperationStage = {
      stage: "polish",
      component: "animations",
      duration: 1500,
      loadingMessage: "Adding final touches and animations...",
      impact: {
        type: "modular-transformation",
        changes: {},
        modules: {
          animations: modules.animations
        }
      } as any,
      delay: 300
    }

    const sequence: AIOperationSequence = {
      choiceId,
      choiceName,
      totalDuration: foundationStage.duration + brandingStage.duration + messagingStage.duration + featuresStage.duration + polishStage.duration,
      stages: [foundationStage, brandingStage, messagingStage, featuresStage, polishStage]
    }

    return sequence
  }

  /**
   * Execute operation with original impact - handles queueing automatically
   */
  async executeOperationWithImpact(choiceId: string, choiceName: string, originalImpact: any): Promise<void> {
    // If currently processing, add to queue instead of cancelling
    if (this.isProcessing) {
      logger.info('⏳ Adding to operation queue:', choiceName);
      const request: AIOperationRequest = {
        choiceId,
        choiceName,
        originalImpact
      }
      this.addToQueue(request)
      return
    }
    
    // Create sequence dynamically for immediate execution
    const sequence = this.createOperationSequence(choiceId, choiceName, originalImpact)
    console.log('✨ Created immediate sequence for:', choiceName, 'with modules:', 
      Object.keys(originalImpact?.modules || {}))
    
    await this.executeOperation(sequence)
  }

  /**
   * Execute an operation sequence with progressive component delivery
   */
  async executeOperation(sequence: AIOperationSequence): Promise<void> {
    logger.info('🤖 Starting AI operation simulation for:', sequence.choiceName);
    
    // Update state management - NOW actually starting operation
    const store = usePreviewGenerationStore.getState()
    store.startGenerating(sequence.choiceId)
    
    this.isProcessing = true
    this.currentSequence = sequence
    this.abortController = new AbortController()
    
    // Start processing the queue if not already processing
    if (!this.isProcessingQueue) {
      this.processOperationQueue()
    }

    try {
      let cumulativeTime = 0
      const totalTime = sequence.totalDuration

      for (let i = 0; i < sequence.stages.length; i++) {
        // Check if operation was cancelled
        if (this.abortController && this.abortController.signal && this.abortController.signal.aborted) {
          logger.info('⏹️ Operation cancelled during stage', i + 1);
          return
        }

        const stage = sequence.stages[i]
        
        logger.info(`🎯 AI Operation Stage ${i + 1}/4: ${stage.stage} - ${stage.loadingMessage}`);
        
        // Optional delay before stage
        if (stage.delay) {
          await this.delay(stage.delay)
          if (this.abortController && this.abortController.signal && this.abortController.signal.aborted) return
        }

        // Update progress in store and callback
        const progress = (cumulativeTime / totalTime) * 100
        const store = usePreviewGenerationStore.getState()
        store.updateGenerationProgress(sequence.choiceId, progress, {
          stage: stage.stage,
          component: stage.component,
          loadingMessage: stage.loadingMessage
        })
        
        this.onStageUpdate?.(stage, progress)

        // Simulate AI processing time for this stage
        await this.delay(stage.duration)
        if (this.abortController && this.abortController.signal && this.abortController.signal.aborted) return

        // Apply the component with the stage-specific impact
        if (this.onStageComplete && stage.impact) {
          // Check again before applying to prevent late applications
          if (this.abortController && this.abortController.signal && this.abortController.signal.aborted) {
            logger.info('⏹️ Aborting before stage application:', stage.stage);
            return
          }
          await this.onStageComplete(stage)
        }

        cumulativeTime += stage.duration
        logger.info(`✅ Stage ${stage.stage} completed`);
      }

      // Operation complete - mark as generated in store
      logger.info('🎉 AI operation simulation completed!');
      const store = usePreviewGenerationStore.getState()
      store.finishGenerating(sequence.choiceId)
      this.onComplete?.()

    } catch (error) {
      if (error.message === 'AbortError' || error.name === 'AbortError') {
        logger.info('⏹️ Operation cancelled for:', sequence.choiceName);
      } else {
        logger.error('❌ AI operation simulation failed:', error);
      }
      // Make sure to clean up state even on error
      const store = usePreviewGenerationStore.getState()
      store.finishGenerating(sequence.choiceId)
    } finally {
      this.isProcessing = false
      this.currentSequence = null
      this.abortController = null
      
      // Process next item in queue
      this.processNextInQueue()
    }
  }

  /**
   * Get operation sequence for a specific choice ID
   */
  getSequenceForChoice(choiceId: string, choiceName: string, originalImpact: any): AIOperationSequence {
    return this.createOperationSequence(choiceId, choiceName, originalImpact)
  }

  /**
   * Check if operation is currently in progress
   */
  isCurrentlyGenerating(): boolean {
    return this.isProcessing
  }

  /**
   * Get current operation progress (0-100)
   */
  getCurrentProgress(): number {
    if (!this.currentSequence || !this.isProcessing) return 0
    // This would be calculated based on current stage progress
    // For now, return a simple estimate
    return 0
  }

  /**
   * Add request to operation queue
   */
  private addToQueue(request: AIOperationRequest): void {
    // Remove any existing instance of this choice from queue
    this.operationQueue = this.operationQueue.filter(r => r.choiceId !== request.choiceId)
    // Add to end of queue
    this.operationQueue.push(request)
    logger.info('📋 Queue updated. Current queue:', this.operationQueue.map(r => r.choiceName))
  }

  /**
   * Process the operation queue sequentially
   */
  private async processOperationQueue(): Promise<void> {
    this.isProcessingQueue = true
    
    while (this.operationQueue.length > 0 && !this.isProcessing) {
      const nextRequest = this.operationQueue.shift()!
      logger.info('🔄 Processing queued operation:', nextRequest.choiceName);
      
      // Create sequence dynamically with the correct content for this choice
      const sequence = this.createOperationSequence(
        nextRequest.choiceId, 
        nextRequest.choiceName, 
        nextRequest.originalImpact
      )
      
      console.log('✨ Created fresh sequence for:', nextRequest.choiceName, 'with impact modules:', 
        Object.keys(nextRequest.originalImpact?.modules || {}), 
        '- Hero title:', nextRequest.originalImpact?.modules?.hero?.props?.title || 'none')
      
      await this.executeOperation(sequence)
    }
    
    this.isProcessingQueue = false
  }

  /**
   * Process next item in queue after current operation completes
   */
  private async processNextInQueue(): Promise<void> {
    if (this.operationQueue.length > 0) {
      logger.info('▶️ Processing next in queue...');
      // Small delay before processing next
      setTimeout(() => {
        this.processOperationQueue()
      }, 100)
    }
  }

  /**
   * Get current queue status
   */
  getQueueStatus(): { currentlyGenerating: string | null; queued: string[] } {
    return {
      currentlyGenerating: this.currentSequence?.choiceName || null,
      queued: this.operationQueue.map(r => r.choiceName)
    }
  }

  /**
   * Cancel current operation and clear queue
   */
  cancelAllOperation(): void {
    logger.info('🛑 CANCEL ALL GENERATION called');
    
    if (this.isProcessing && this.abortController) {
      logger.info('🛑 Aborting current operation:', this.currentSequence?.choiceName);
      this.abortController.abort()
    }
    
    // Force reset all state
    this.isProcessing = false
    this.currentSequence = null
    this.abortController = null
    this.isProcessingQueue = false
    
    // Clear the queue
    logger.info('🗑️ Clearing operation queue:', this.operationQueue.map(r => r.choiceName))
    this.operationQueue = []
    
    // Reset store state
    const store = usePreviewGenerationStore.getState()
    logger.info('🗑️ Force finishing all operation states in store');
    store.forceFinishAll()
    
    logger.info('✅ All operation cancelled and reset');
  }

  /**
   * Utility: Async delay with abort support
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(resolve, ms)
      
      // Listen for abort signal - check if controller exists
      if (this.abortController && this.abortController.signal) {
        this.abortController.signal.addEventListener('abort', () => {
          clearTimeout(timeout)
          // Create a proper AbortError
          const abortError = new Error('AbortError')
          abortError.name = 'AbortError'
          reject(abortError)
        })
      }
    })
  }
}

// Predefined sequences for different personality types
export const GENERATION_SEQUENCES = {
  'luxury-premium': {
    foundationMessage: "Analyzing luxury & premium personality...",
    brandingMessage: "Crafting sophisticated brand identity...", 
    messagingMessage: "Generating exclusive messaging...",
    polishMessage: "Adding premium touches and golden accents..."
  },
  'warm-community': {
    foundationMessage: "Analyzing warm & welcoming personality...",
    brandingMessage: "Creating friendly community branding...",
    messagingMessage: "Generating heartfelt messaging...", 
    polishMessage: "Adding warm touches and gentle animations..."
  },
  'vibrant-bold': {
    foundationMessage: "Analyzing vibrant & bold personality...",
    brandingMessage: "Creating energetic brand identity...",
    messagingMessage: "Generating dynamic messaging...",
    polishMessage: "Adding vibrant effects and bold animations..."
  }
  // Add more as needed
}