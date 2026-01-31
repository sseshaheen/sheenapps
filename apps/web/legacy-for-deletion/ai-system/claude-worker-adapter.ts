import { getClaudeUsageStats, runClaude } from '@/lib/ai/claudeRunner'
import { logger } from '@/utils/logger'
import { AIRequest, AIResponse, AIServiceMethods, StreamingAIResponse } from './types'

/**
 * Claude Worker Service Adapter
 * Implements the AIServiceMethods interface to integrate with the unified AI system
 */
export class ClaudeWorkerAdapter implements AIServiceMethods {
  private userId: string | null = null

  constructor(options?: { userId?: string }) {
    this.userId = options?.userId || null
  }

  async processRequest(request: AIRequest): Promise<AIResponse> {
    const startTime = Date.now()

    try {
      // Transform request to claude worker format
      const prompt = this.buildPrompt(request)

      // Get user ID from request context or use default
      const userId = request.userContext?.userId || this.userId || 'anonymous'

      logger.info(`🤖 Claude Worker processing ${request.type} request`)

      // Call the claude runner with appropriate options
      const result = await runClaude(prompt, userId, {
        maxRetries: 3,
        fallbackToGPT: true
      })

      // Transform response to unified format
      return {
        success: true,
        data: this.parseResponse(result, request.type),
        metadata: {
          model: 'claude-worker',
          tokensUsed: this.estimateTokens(prompt + result),
          responseTime: Date.now() - startTime,
          cost: 0.02 // Base cost from registry
        }
      }
    } catch (error) {
      logger.error('Claude Worker adapter error:', error)

      // Handle specific error types
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      let errorCode = 'CLAUDE_WORKER_ERROR'
      let retryable = true

      if (errorMessage === 'RATE_LIMITED') {
        errorCode = 'RATE_LIMITED'
        retryable = true
      }

      return {
        success: false,
        data: null,
        metadata: {
          model: 'claude-worker',
          tokensUsed: 0,
          responseTime: Date.now() - startTime,
          cost: 0
        },
        error: {
          code: errorCode,
          message: errorMessage,
          retryable
        }
      }
    }
  }

  async *processRequestStream(request: AIRequest): AsyncGenerator<StreamingAIResponse> {
    // Claude worker doesn't support streaming yet, simulate it
    yield {
      type: 'start',
      content: '',
      metadata: { progress: 0 }
    }

    try {
      const response = await this.processRequest(request)

      if (response.success && response.data) {
        // Simulate streaming by chunking the response
        const content = JSON.stringify(response.data)
        const chunks = this.chunkText(content, 100)

        for (let i = 0; i < chunks.length; i++) {
          yield {
            type: 'chunk',
            content: chunks[i],
            metadata: {
              progress: Math.round((i + 1) / chunks.length * 100)
            }
          }

          // Small delay to simulate streaming
          await new Promise(resolve => setTimeout(resolve, 50))
        }
      }

      yield {
        type: 'complete',
        content: '',
        metadata: { progress: 100 }
      }
    } catch (error) {
      yield {
        type: 'error',
        content: error instanceof Error ? error.message : 'Stream processing failed'
      }
    }
  }

  async getUsageStats(userId?: string): Promise<{
    callsThisHour: number
    windowStart?: string
    windowEnd?: string
  } | null> {
    try {
      const statsUserId = userId || this.userId || 'anonymous'
      const stats = await getClaudeUsageStats(statsUserId)
      return stats
    } catch (error) {
      logger.error('Failed to get Claude usage stats:', error)
      return null
    }
  }

  private buildPrompt(request: AIRequest): string {
    const { type, content, context, domain } = request

    // Build specialized prompts based on request type
    switch (type) {
      case 'component_generation':
        return this.buildComponentPrompt(content, context)

      case 'design_modification':
        return this.buildDesignModificationPrompt(content, context)

      case 'webpage_design':
        return this.buildWebPagePrompt(content, context)

      case 'content_generation':
        return this.buildContentPrompt(content, context, domain)

      case 'business_analysis':
        return `Analyze this business idea and provide insights: ${content}`

      case 'tagline_generation':
        const taglineData = JSON.parse(content)
        return `Generate taglines for ${taglineData.selectedName} based on: ${JSON.stringify(taglineData.analysis)}`

      case 'feature_recommendation':
        return `Recommend features for this business: ${content}`

      case 'pricing_strategy':
        return `Generate a pricing strategy for: ${content}`

      case 'template_generation':
        return this.buildTemplateGenerationPrompt(content, context)

      default:
        // Generic prompt for unknown types
        return `Process this ${type} request: ${content}`
    }
  }

  private buildComponentPrompt(content: string, context?: any): string {
    const { componentType, style, requirements } = context || {}

    return `Create a ${componentType || 'web component'} with the following requirements:
${content}

Style preferences: ${style || 'modern and clean'}
Additional requirements: ${requirements || 'responsive, accessible'}

Generate complete HTML/React component code with proper styling.`
  }

  private buildDesignModificationPrompt(content: string, context?: any): string {
    const { currentDesign, modifications } = context || {}

    return `Modify the following web design:

Current Design:
${currentDesign || content}

Requested Modifications:
${modifications || content}

Provide the updated design code maintaining the existing structure while implementing the requested changes.`
  }

  private buildWebPagePrompt(content: string, context?: any): string {
    const { pageType, brand, targetAudience } = context || {}

    return `Design a ${pageType || 'landing page'} with the following specifications:
${content}

Brand: ${brand || 'professional and modern'}
Target Audience: ${targetAudience || 'general'}

Create a complete, responsive webpage design with HTML structure and CSS styling.`
  }

  private buildContentPrompt(content: string, context?: any, domain?: string): string {
    const { contentType, tone, length } = context || {}

    return `Generate ${contentType || 'web content'} for ${domain || 'general'} domain:
${content}

Tone: ${tone || 'professional'}
Length: ${length || 'appropriate to context'}

Create engaging, SEO-friendly content.`
  }

  private buildTemplateGenerationPrompt(content: string, context?: any): string {
    const specBlock = JSON.parse(content)

    // Include the seed boilerplate that TemplateGen-Vite-Seed expects
    const seedBoilerplate = JSON.stringify({
      "name": "{project-name}",
      "slug": "{project-slug}",
      "description": "description",
      "version": "0.1.0",
      "author": "TemplateSeed",
      "repository": "",
      "license": "MIT",
      "tech_stack": [],
      "metadata": {
        "tags": [],
        "industry_tags": [],
        "style_tags": [],
        "core_pages": {},
        "components": [],
        "design_tokens": {},
        "rsc_path": ""
      },
      "templateFiles": [],
      "files": []
    }, null, 2)

    // Check if tech stack includes Tailwind and React
    const includesTailwind = specBlock.tech_stack.toLowerCase().includes('tailwind')
    const includesReact = specBlock.tech_stack.toLowerCase().includes('react')
    
    const tailwindRules = includesTailwind ? `

TAILWIND v4 RULES:
- No tailwind.config.js – use @theme inside src/index.css.
- Always \`@import "tailwindcss";\`

TAILWIND v4 STRICT CHECKLIST (generation MUST satisfy all items):
1. devDependencies include exactly "tailwindcss": "4.1.11" and "@tailwindcss/vite": "4.1.11" (no other Tailwind packages).
2. vite.config.ts registers @tailwindcss/vite in its plugins array.
3. NO tailwind.config.js (or *.cjs, *.mjs) is created.
4. src/index.css begins with @import "tailwindcss"; before anything else.
5. src/index.css contains :root { ... } for CSS variables (NOT @theme - that's for extending Tailwind). @theme { ... } should only define Tailwind-specific extensions if needed
6. All class usage assumes Tailwind's default content scanning – you do not reference a content array anywhere.
7. All React components are properly exported and importable
8. src/App.tsx has a default export that matches the import in src/main.tsx
9. The generated page(s) should be mobile responsive
10. When you insert images, make sure their src is not broken (not 404)
11. All color values in Tailwind classes use hex codes directly: bg-[#1e3a5f]
12. Never use CSS custom properties in arbitrary value syntax: NOT bg-[var(--color)]
13. Verify standard utilities work: p-8 should create 2rem/32px padding
14. For complex SVG backgrounds, use external files or gradient alternatives` : ''

    const reactRules = includesReact ? `

REACT COMPONENT RULES:
1. Every React component file MUST export the component:
   - Use \`export default ComponentName\` for the main component
   - Or use named exports: \`export function ComponentName() { ... }\`
2. Ensure all imports match the export style used
3. The main App component in src/App.tsx MUST have a default export
4. Verify all component imports in the generated files resolve correctly
5. Never place <style> tags in TSX/JSX files
6. Remember that TSX files can only contain valid TypeScript/JavaScript code
7. Component functions must return valid JSX only
8. Ensure all string literals with quotes are properly escaped or use template literals.
9. For background SVGs in Tailwind, prefer CSS gradients or external files
10. Test that all Tailwind spacing utilities render with expected pixel values
11. Escape special HTML characters in JSX text content` : ''

    const svgRules = `

SVG HANDLING RULES:
1. Avoid inline SVG data-URI in CSS—use external SVG files or CSS-based patterns when you can.
2. Choose one URL-wrapper and stick to it:
   /* Either: */
   background: url("data:image/svg+xml;utf8,…");
   /* Or: */
   background: url('data:image/svg+xml;utf8,…');
   Never mix single- and double-quotes between the url(...) wrapper and the SVG content.
3. Encode all quotes inside the SVG:
   • " → %22
   • ' → %27
4. Encode other special characters:
   • < → %3C
   • > → %3E
   • # → %23
   • space → %20`

    const cssRules = `

CSS TIPS:
1. CSS @import Rule Order:
   - Always place @import statements at the very beginning of CSS files
   - Only @charset declarations can precede @import
   - This is a CSS specification requirement, not a preference

2. When Working with CSS Frameworks:
   - Font imports should come BEFORE framework imports (like Tailwind)
   - Order: External resources → Framework → Custom styles

3. Better Alternatives:
   - Consider loading fonts in HTML <head> instead of CSS
   - Use <link> tags for Google Fonts - they're more performant
   - Modern bundlers handle font loading better through HTML

4. AI-Specific Tips:
   - When generating CSS, always check existing imports first
   - Follow this mental checklist:
     a. Are there existing @import statements?
     b. Where are they located?
     c. Am I adding new imports in the correct position?
   - Never append @import statements - always place at the top`

    return `SYSTEM:
You are TemplateGen-Vite-Seed. You have the seed boilerplate shown below.
Read that JSON as your starting point and **modify** its \`templateFiles\`
and \`files\` entries in-place to implement the user's spec.
**Output only** the final valid JSON object.

SEED BOILERPLATE:
${seedBoilerplate}

USER SPECIFICATION:
Goal: ${specBlock.goal}
Sections: ${specBlock.section_list}
Style: ${specBlock.style_tags}
Industry: ${specBlock.industry_tag}
Tech Stack: ${specBlock.tech_stack}
Extra Requirements: ${specBlock.extra}${tailwindRules}${reactRules}${svgRules}${cssRules}

CRITICAL METADATA REQUIREMENT:
Also emit propsSchema for every component you generate.
The propsSchema should contain the actual data/content that will be displayed in that component.

Example structure:
{
  "metadata": {
    "components": {
      "Hero": {
        "propsSchema": {
          "title": "Welcome to Bella Vista Salon",
          "subtitle": "Your Beauty Destination",
          "description": "Experience luxury beauty treatments",
          "ctaText": "Book Now",
          "imageUrl": "/images/salon-hero.jpg"
        }
      },
      "ServicesMenu": {
        "propsSchema": {
          "title": "Our Services",
          "subtitle": "Professional Beauty Treatments",
          "features": [
            {"name": "Hair Styling", "description": "Expert cuts and colors", "icon": "scissors", "price": "$50+"},
            {"name": "Manicure", "description": "Beautiful nail treatments", "icon": "hand", "price": "$30+"}
          ]
        }
      }
    }
  }
}

The propsSchema will be used directly by the builder without parsing, so ensure:
- Property names match standard section props (title, subtitle, description, ctaText, imageUrl, features, etc.)
- Content is realistic and relevant to the business
- Arrays contain proper objects with consistent structure
- All text content is properly formatted

INSTRUCTIONS:
1. Update the project metadata (name, description, tags, etc.) to match the specification
2. Generate complete ${specBlock.tech_stack} code for each section: ${specBlock.section_list}
3. Create appropriate design tokens using the style tags: ${specBlock.style_tags}
4. Include all necessary files (package.json, components, styles, etc.)
5. For EVERY component, add its propsSchema to metadata.components
6. Output ONLY the final JSON object with no additional text`
  }

  private parseResponse(response: string, requestType: string): any {
    try {
      // Try to parse as JSON first
      return JSON.parse(response)
    } catch {
      // If not JSON, structure the response based on request type
      switch (requestType) {
        case 'component_generation':
        case 'webpage_design':
        case 'design_modification':
          return {
            code: response,
            type: 'html',
            preview: true
          }

        case 'content_generation':
          return {
            content: response,
            type: 'text'
          }

        case 'business_analysis':
          return {
            analysis: response,
            insights: []
          }

        case 'tagline_generation':
          // Try to extract taglines from response
          const lines = response.split('\n').filter(line => line.trim())
          return {
            taglines: lines.slice(0, 5) // First 5 lines as taglines
          }

        case 'feature_recommendation':
          return {
            features: response.split('\n').filter(line => line.trim())
          }

        case 'pricing_strategy':
          return {
            strategy: response,
            tiers: []
          }

        case 'template_generation':
          // For template generation, try to parse as JSON, fallback to error object
          try {
            return JSON.parse(response)
          } catch {
            return {
              error: 'Failed to parse template JSON',
              rawResponse: response
            }
          }

        default:
          return { result: response }
      }
    }
  }

  private estimateTokens(text: string): number {
    // Rough estimation: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4)
  }

  private chunkText(text: string, chunkSize: number): string[] {
    const chunks: string[] = []
    for (let i = 0; i < text.length; i += chunkSize) {
      chunks.push(text.slice(i, i + chunkSize))
    }
    return chunks
  }
}

export default ClaudeWorkerAdapter
