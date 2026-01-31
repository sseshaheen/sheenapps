import { 
  AIResponse, 
  StreamingAIResponse, 
  BusinessAnalysis, 
  BusinessName, 
  BusinessTagline, 
  FeatureRecommendation, 
  PricingStrategy 
} from './types'
import { SpecBlock } from '@/types/spec-block'
import { fetchApi } from '@/lib/api-utils'

export class ClientAIService {
  async analyzeBusinessIdea(
    idea: string, 
    serviceKey = 'auto'
  ): Promise<AIResponse<BusinessAnalysis>> {
    const response = await fetchApi('/api/ai/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ idea, serviceKey }),
    })

    if (!response.ok) {
      throw new Error('Analysis failed')
    }

    return response.json()
  }

  async *analyzeBusinessIdeaStream(
    idea: string,
    serviceKey = 'auto'
  ): AsyncGenerator<StreamingAIResponse> {
    const response = await fetchApi('/api/ai/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ idea, serviceKey }),
    })

    if (!response.ok) {
      yield { type: 'error', content: 'Stream failed to start' }
      return
    }

    const reader = response.body?.getReader()
    const decoder = new TextDecoder()

    if (!reader) {
      yield { type: 'error', content: 'No reader available' }
      return
    }

    try {
      while (true) {
        const { done, value } = await reader.read()
        
        if (done) break
        
        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              yield data as StreamingAIResponse
            } catch (e) {
              // Skip invalid JSON lines
            }
          }
        }
      }
    } catch (error) {
      yield { type: 'error', content: 'Stream reading failed' }
    } finally {
      reader.releaseLock()
    }
  }

  async generateBusinessNames(
    analysis: BusinessAnalysis,
    serviceKey = 'auto'
  ): Promise<AIResponse<BusinessName[]>> {
    const response = await fetchApi('/api/ai/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type: 'names', analysis, serviceKey }),
    })

    if (!response.ok) {
      throw new Error('Name generation failed')
    }

    return response.json()
  }

  async generateTaglines(
    analysis: BusinessAnalysis,
    selectedName: string,
    serviceKey = 'auto'
  ): Promise<AIResponse<BusinessTagline[]>> {
    const response = await fetchApi('/api/ai/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type: 'taglines', analysis, selectedName, serviceKey }),
    })

    if (!response.ok) {
      throw new Error('Tagline generation failed')
    }

    return response.json()
  }

  async recommendFeatures(
    analysis: BusinessAnalysis,
    serviceKey = 'auto'
  ): Promise<AIResponse<FeatureRecommendation[]>> {
    const response = await fetchApi('/api/ai/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type: 'features', analysis, serviceKey }),
    })

    if (!response.ok) {
      throw new Error('Feature recommendation failed')
    }

    return response.json()
  }

  async generatePricingStrategy(
    analysis: BusinessAnalysis,
    serviceKey = 'auto'
  ): Promise<AIResponse<PricingStrategy>> {
    const response = await fetchApi('/api/ai/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type: 'pricing', analysis, serviceKey }),
    })

    if (!response.ok) {
      throw new Error('Pricing generation failed')
    }

    return response.json()
  }

  async generateSpecBlock(
    userIdea: string,
    serviceKey = 'auto'
  ): Promise<AIResponse<SpecBlock>> {
    const response = await fetchApi('/api/ai/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type: 'spec_block', userIdea, serviceKey }),
    })

    if (!response.ok) {
      throw new Error('Spec block generation failed')
    }

    return response.json()
  }

  async generateCompletion(
    prompt: string,
    serviceKey = 'auto'
  ): Promise<string> {
    const response = await fetchApi('/api/ai/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type: 'completion', prompt, serviceKey }),
    })

    if (!response.ok) {
      throw new Error('Completion generation failed')
    }

    const result = await response.json()
    return result.data || result.completion || ''
  }

  async generateProjectFromSpec(
    specBlock: SpecBlock,
    serviceKey = 'auto'
  ): Promise<AIResponse<any>> {
    const response = await fetchApi('/api/ai/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type: 'template', specBlock, serviceKey }),
    })

    if (!response.ok) {
      throw new Error('Template generation failed')
    }

    return response.json()
  }
}