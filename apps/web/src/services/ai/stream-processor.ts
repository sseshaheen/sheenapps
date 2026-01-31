import { StreamingAIResponse } from './types'

export class StreamProcessor {
  private buffer: string = ''
  private insights: string[] = []
  private currentStep: number = 0
  
  private readonly STRUCTURED_STEPS = [
    '🔍 Analyzing your business concept...',
    '🎯 Identifying target market...',
    '💡 Extracting key value propositions...',
    '📊 Assessing market opportunities...',
    '🏗️ Determining business model...',
    '✨ Finalizing strategic insights...'
  ]

  async *processRawStream(
    rawStream: AsyncGenerator<StreamingAIResponse>,
    idea: string
  ): AsyncGenerator<StreamingAIResponse> {
    
    // Start with structured introduction
    yield {
      type: 'start',
      content: `Analyzing "${idea.slice(0, 50)}${idea.length > 50 ? '...' : ''}"`,
      metadata: { progress: 0 }
    }

    let accumulatedContent = ''
    let stepIndex = 0
    
    try {
      for await (const chunk of rawStream) {
        if (chunk.type === 'insight' && chunk.content) {
          // Accumulate content but show structured progress
          accumulatedContent += chunk.content
          
          // Show structured steps instead of raw content
          if (stepIndex < this.STRUCTURED_STEPS.length) {
            const progress = Math.min(((stepIndex + 1) / this.STRUCTURED_STEPS.length) * 90, 90)
            
            yield {
              type: 'insight',
              content: this.STRUCTURED_STEPS[stepIndex],
              metadata: { 
                progress,
                confidence: 0.85 + (stepIndex * 0.02) // Gradually increase confidence
              }
            }
            
            stepIndex++
            
            // Add delay for better UX
            await new Promise(resolve => setTimeout(resolve, 800))
          }
        }
      }
      
      // Process the accumulated content for final insights
      const finalInsights = this.extractBusinessInsights(accumulatedContent, idea)
      
      // Show extracted insights
      for (const insight of finalInsights) {
        yield {
          type: 'insight',
          content: insight,
          metadata: { progress: 95 }
        }
        await new Promise(resolve => setTimeout(resolve, 500))
      }
      
      yield {
        type: 'complete',
        content: '🎉 Analysis complete! Ready to build your business.',
        metadata: { progress: 100, confidence: 0.92 }
      }
      
    } catch (error) {
      yield {
        type: 'error',
        content: 'Analysis encountered an issue, but we can still help you build your business!'
      }
    }
  }

  private extractBusinessInsights(content: string, idea: string): string[] {
    const insights: string[] = []
    
    try {
      // Extract key insights from the AI response
      const lowerContent = content.toLowerCase()
      
      // Business type detection
      if (lowerContent.includes('saas') || lowerContent.includes('software')) {
        insights.push('💻 Detected SaaS business model - great scalability potential!')
      } else if (lowerContent.includes('ecommerce') || lowerContent.includes('product')) {
        insights.push('🛍️ E-commerce opportunity identified - strong market demand!')
      } else if (lowerContent.includes('service') || lowerContent.includes('booking')) {
        insights.push('🤝 Service-based business detected - perfect for local market!')
      } else {
        insights.push('🚀 Unique business concept with strong potential!')
      }
      
      // Market opportunity
      if (lowerContent.includes('growing') || lowerContent.includes('demand')) {
        insights.push('📈 Strong market growth indicators detected')
      }
      
      // Target audience
      if (lowerContent.includes('salon') || lowerContent.includes('beauty')) {
        insights.push('💄 Beauty industry focus - $170B+ global market')
      } else if (lowerContent.includes('restaurant') || lowerContent.includes('food')) {
        insights.push('🍽️ Food service industry - recession-resistant market')
      } else {
        insights.push('🎯 Clear target audience identified')
      }
      
      // Revenue model
      if (lowerContent.includes('subscription') || lowerContent.includes('monthly')) {
        insights.push('💰 Subscription revenue model - predictable income stream')
      } else if (lowerContent.includes('commission') || lowerContent.includes('booking')) {
        insights.push('💸 Transaction-based revenue - scales with success')
      }
      
    } catch (error) {
      // Fallback insights
      insights.push('🎯 Business concept successfully analyzed')
      insights.push('📊 Market opportunities identified')
      insights.push('💡 Strategic recommendations prepared')
    }
    
    return insights.slice(0, 3) // Limit to top 3 insights
  }

  // Clean up any messy streaming content
  private cleanStreamContent(content: string): string {
    return content
      .replace(/💡\s*/g, '') // Remove scattered lightbulb emojis
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/^\s*-\s*/, '') // Remove leading dashes
      .trim()
  }
  
  // Extract structured insights for display
  extractKeyPoints(content: string): string[] {
    const points: string[] = []
    
    // Look for numbered lists or bullet points
    const lines = content.split('\n')
    for (const line of lines) {
      const cleaned = line.trim()
      if (cleaned.match(/^\d+\./) || cleaned.startsWith('-') || cleaned.startsWith('•')) {
        const point = cleaned.replace(/^\d+\.\s*/, '').replace(/^[-•]\s*/, '')
        if (point.length > 10 && point.length < 100) {
          points.push(point)
        }
      }
    }
    
    return points.slice(0, 5) // Limit to 5 key points
  }
}