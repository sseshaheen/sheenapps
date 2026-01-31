import { logger } from '@/utils/logger';

// AI API Client - Makes HTTP requests to mock AI endpoints

export interface SectionModificationRequest {
  action: string
  sectionType: string
  userInput: string
  businessContext: any
  currentContent?: any
}

export interface SectionModificationResponse {
  success: boolean
  data?: any
  error?: {
    code: string
    message: string
    details?: any
  }
}

export class AIApiClient {
  private baseUrl: string

  constructor() {
    // Use absolute URLs to avoid locale prefix issues
    if (typeof window !== 'undefined') {
      this.baseUrl = `${window.location.origin}/api/ai`
    } else {
      // Server-side fallback
      this.baseUrl = '/api/ai'
    }
  }

  async modifySection(
    request: SectionModificationRequest,
    onProgress?: (stage: string, progress: number) => void
  ): Promise<any> {
    logger.info('🌐 Client: Sending section modification request');
    
    // Simulate progress updates during the request
    const progressInterval = setInterval(() => {
      const stages = [
        'Understanding your request',
        'Analyzing current section', 
        'Generating modifications',
        'Applying design changes',
        'Finalizing component'
      ]
      
      const randomStage = stages[Math.floor(Math.random() * stages.length)]
      const randomProgress = Math.random() * 100
      onProgress?.(randomStage, randomProgress)
    }, 800)

    try {
      const response = await fetch(`${this.baseUrl}/modify-section`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request)
      })

      clearInterval(progressInterval)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const result: SectionModificationResponse = await response.json()
      
      if (!result.success) {
        throw new Error(result.error?.message || 'Section modification failed')
      }

      logger.info('🌐 Client: Section modification successful');
      return result.data

    } catch (error) {
      clearInterval(progressInterval)
      logger.error('🌐 Client: Section modification failed:', error);
      throw error
    }
  }

  async generateComponent(type: string, props: any): Promise<any> {
    logger.info('🌐 Client: Generating component:', type);
    
    // TODO: Implement when needed
    // For now, fallback to direct mock service usage
    throw new Error('Component generation API not yet implemented')
  }

  async enhanceComponent(component: any, intent: string): Promise<any> {
    logger.info('🌐 Client: Enhancing component with intent:', intent);
    
    // TODO: Implement when needed
    throw new Error('Component enhancement API not yet implemented')
  }
}

// Export singleton instance
export const aiApiClient = new AIApiClient()