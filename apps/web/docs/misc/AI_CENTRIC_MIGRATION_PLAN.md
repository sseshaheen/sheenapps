# AI-Centric Architecture Migration Plan

## Current System Analysis

### Strengths of Existing Architecture
1. **Well-Structured AI Foundation**: Services already exist (`orchestrator.ts`, `real-ai-service.ts`, `anthropic-service.ts`) but are underutilized
2. **Modular Component System**: `component-renderer.ts` has 25K+ lines of hand-coded HTML generators that can be AI-enhanced
3. **Sophisticated State Management**: Zustand stores with generation tracking, caching, and queue management
4. **Advanced Preview Engine**: `live-preview-engine.ts` with real-time iframe updates and smooth transitions
5. **Incremental Update System**: `enhanced-ideal-ai-response.ts` already designed for cumulative modifications
6. **Question Flow Integration**: Clear connection points between user input and preview generation

### Current Data Flow
```
User Business Idea → AI Question Generator → Question Flow Store
       ↓
Question Interface (UI) → Answer Selection → Preview Impact Processing
       ↓
Live Preview Engine → AI Generation Orchestrator → Component Renderer
       ↓
HTML/CSS Generation → iframe Update → Visual Preview
```

### Key Integration Points
1. **AI Service Layer**: `RealAIService` ready for external AI calls
2. **Preview Impact System**: `modularPreviewImpact` interface extensible for AI-generated components
3. **Component Boundaries**: Each component (header, hero, features) independently renderable
4. **Generation Orchestration**: Multi-stage AI simulation ready for real AI workflow

## Migration Strategy: 3-Phase Approach

### Phase 1: AI Infrastructure Foundation (Week 1-2)
**Goal**: Replace simulated AI with real external AI calls while maintaining current UX

#### 1.1 Enhance AI Service Layer
```typescript
// src/services/ai/enhanced-ai-client.ts
export class EnhancedAIClient {
  // Real external AI integration
  async generateComponent(prompt: ComponentPrompt): Promise<ComponentDefinition>
  async enhanceComponent(component: ComponentDefinition, intent: string): Promise<ComponentDefinition>
  async generateContent(prompt: ContentPrompt): Promise<ContentDefinition>
}
```

#### 1.2 Create AI Prompt Engine
```typescript
// src/services/ai/prompt-engine.ts
export class PromptEngine {
  buildComponentPrompt(type: string, intent: string, context: BusinessContext): ComponentPrompt
  buildModificationPrompt(current: ComponentDefinition, intent: string): ModificationPrompt
  buildContentPrompt(section: string, businessType: string): ContentPrompt
}
```

#### 1.3 AI Response Parser
```typescript
// src/services/ai/response-parser.ts
export class AIResponseParser {
  parseComponentResponse(aiResponse: string): ComponentDefinition
  parseStyleResponse(aiResponse: string): StyleDefinition
  parseContentResponse(aiResponse: string): ContentDefinition
}
```

#### Implementation Steps:
1. **Create AI service abstraction** that wraps existing `anthropic-service.ts`
2. **Design prompt templates** for component generation, modification, and enhancement
3. **Build response parsers** to convert AI HTML/CSS → ComponentDefinition structures
4. **Add AI caching layer** to store successful prompts and responses
5. **Create fallback system** to existing component renderer if AI fails

### Phase 2: Component-Level AI Integration (Week 3-4)
**Goal**: Enable AI-powered editing of individual components through user comments

#### 2.1 User Intent Processing
```typescript
// src/services/user-intent/intent-analyzer.ts
export class IntentAnalyzer {
  async analyzeIntent(comment: string, section: string): Promise<Intent>
  // "Make it more modern" → { style: 'modern', confidence: 0.8, actions: ['update-colors', 'simplify-layout'] }
}
```

#### 2.2 Section-Specific Editors
```typescript
// src/components/builder/section-editors/
- hero-editor.tsx        // AI-powered hero editing
- header-editor.tsx      // AI-powered header editing  
- features-editor.tsx    // AI-powered features editing
```

#### 2.3 Enhanced Preview Impact Interface
```typescript
interface AIEnhancedPreviewImpact extends ModularPreviewImpact {
  aiGenerated: {
    model: string
    prompt: string
    reasoning: string
    confidence: number
    timestamp: number
  }
  userIntent: {
    originalRequest: string
    processedPrompt: string
    targetSection: string
  }
}
```

#### Implementation Steps:
1. **Create section editing UI** with comment input for each component
2. **Build intent analysis** to convert natural language → specific AI prompts
3. **Implement AI component generation** replacing hand-coded generators
4. **Add AI confidence scoring** and alternative suggestions
5. **Create feedback loop** to improve prompts based on user acceptance

### Phase 3: Full AI-Driven Template System (Week 5-6)
**Goal**: Complete business template generation and optimization through AI

#### 3.1 Business Template AI Generator
```typescript
// src/templates/ai-templates/business-template-generator.ts
export class BusinessTemplateGenerator {
  async generateBusinessTemplate(businessType: string, personality: string[]): Promise<BusinessTemplate>
  async optimizeTemplate(template: BusinessTemplate, goals: string[]): Promise<BusinessTemplate>
}
```

#### 3.2 Content Generation System
```typescript
// src/services/ai/content-generator.ts
export class ContentGenerator {
  async generateBusinessContent(businessType: string, context: BusinessContext): Promise<ContentSet>
  async generateSEOContent(businessContext: BusinessContext): Promise<SEOContent>
  async generateCopyVariants(originalCopy: string, tone: string): Promise<string[]>
}
```

#### 3.3 Integration Recommendation Engine
```typescript
// src/services/ai/integration-recommender.ts
export class IntegrationRecommender {
  async recommendIntegrations(businessType: string, features: string[]): Promise<Integration[]>
  async generateIntegrationConfig(integration: string, businessContext: BusinessContext): Promise<IntegrationConfig>
}
```

#### Implementation Steps:
1. **Build complete business template generation** via AI
2. **Create dynamic integration suggestions** based on business needs
3. **Implement A/B testing system** for AI-generated variants
4. **Add conversion optimization** through AI-powered layout suggestions
5. **Create learning system** that improves based on user interactions

## Technical Implementation Details

### File Structure Migration
```
src/
├── services/
│   ├── ai/                          # Enhanced AI layer
│   │   ├── enhanced-ai-client.ts    # Main AI service
│   │   ├── prompt-engine.ts         # Prompt templates & building
│   │   ├── response-parser.ts       # AI response → components
│   │   ├── intent-analyzer.ts       # Natural language → AI prompts
│   │   └── ai-cache.ts             # Cache successful AI interactions
│   │
│   ├── templates/                   # AI-generated templates
│   │   ├── ai-template-generator.ts # Generate business templates via AI
│   │   ├── component-composer.ts    # Compose components from AI parts
│   │   └── template-optimizer.ts    # AI-powered template optimization
│   │
│   └── preview/ (existing)          # Keep existing preview system
│
├── components/
│   ├── builder/
│   │   ├── section-editors/         # AI-powered section editing
│   │   │   ├── hero-editor.tsx
│   │   │   ├── header-editor.tsx
│   │   │   └── features-editor.tsx
│   │   │
│   │   └── ai-feedback/             # AI interaction feedback
│   │       ├── ai-suggestion-panel.tsx
│   │       └── confidence-indicator.tsx
│   │
│   └── ui/ (existing)
│
└── types/
    ├── ai-types.ts                  # AI-specific type definitions
    └── enhanced-preview-types.ts    # Extended preview impact types
```

### Data Flow Changes
```
Current: User Selection → Static Template → Component Renderer → Preview
New:     User Comment → Intent Analysis → AI Prompt → AI Response → Component Parser → Preview
```

### Integration with Existing System
1. **Preserve Current UX**: All existing functionality continues working
2. **Progressive Enhancement**: Add AI features without breaking existing flows
3. **Fallback Strategy**: If AI fails, fall back to existing component renderer
4. **Cache Integration**: Use existing preview generation store for AI response caching
5. **State Management**: Extend existing Zustand stores with AI metadata

### Risk Mitigation
1. **Feature Flags**: Enable/disable AI features per user or globally
2. **A/B Testing**: Compare AI-generated vs hand-coded components
3. **Quality Gates**: AI confidence thresholds before showing results
4. **Rollback Strategy**: Quick rollback to existing system if issues arise
5. **Cost Management**: Rate limiting and budget controls for AI API calls

## Success Metrics
1. **User Engagement**: Time spent customizing, number of modifications made
2. **AI Quality**: User acceptance rate of AI suggestions, confidence scores
3. **Performance**: Response time for AI generation vs current system
4. **Business Value**: Conversion rates, user satisfaction scores
5. **Technical Health**: System reliability, cache hit rates, error rates

## Timeline Summary
- **Week 1-2**: AI infrastructure foundation
- **Week 3-4**: Component-level AI integration  
- **Week 5-6**: Full AI-driven template system
- **Week 7**: Testing, optimization, and rollout

This migration plan leverages the existing architecture's strengths while gradually introducing AI capabilities in a controlled, measurable way.