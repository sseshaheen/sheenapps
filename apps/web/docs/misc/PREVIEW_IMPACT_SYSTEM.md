# Preview Impact System
## Mapping AI-Generated Choices to Real-Time Visual Effects

### Core Problem
External AI generates contextual questions and choices based on user prompts + our framework. We need to **reliably translate any choice into specific preview changes** that users can see immediately.

---

## 1. Impact Mapping Architecture

### 1.1 Choice-to-Effect Translation
```typescript
interface ChoiceImpactMapping {
  // The choice identifier from AI
  choiceId: string
  choiceText: string
  
  // What this choice affects in the preview
  previewEffects: {
    immediate: PreviewChange[]    // Instant visual changes
    cascading: PreviewChange[]    // Changes that affect other elements
    enabling: string[]            // New choice categories this unlocks
    constraining: string[]        // Choice categories this limits
  }
  
  // How this choice interacts with previous choices
  dependencies: {
    requires?: string[]           // Previous choices needed for this to work
    enhances?: string[]           // Previous choices this makes better
    conflicts?: string[]          // Previous choices this contradicts
  }
}
```

### 1.2 Preview Change Types
```typescript
interface PreviewChange {
  target: string                  // What component/area changes
  type: 'replace' | 'modify' | 'add' | 'remove' | 'style'
  priority: number               // Order of application (1-10)
  
  change: {
    // Style changes
    css?: Record<string, string>
    classes?: string[]
    
    // Content changes  
    text?: string
    html?: string
    attributes?: Record<string, string>
    
    // Structure changes
    component?: string           // Component to add/replace with
    position?: 'before' | 'after' | 'inside' | 'replace'
    
    // Behavioral changes
    interactions?: InteractionChange[]
    animations?: AnimationChange[]
  }
}
```

---

## 2. AI Communication Protocol

### 2.1 Framework-to-AI Message
```typescript
interface AIQuestionRequest {
  // User context
  userPrompt: string
  businessContext: Partial<BusinessContext>
  
  // Framework guidance
  framework: {
    decisionCategories: DecisionCategory[]
    priorityMatrix: string[][]
    industryGuidelines: IndustryGuide
  }
  
  // Previous choices for context
  previousChoices: Array<{
    question: string
    chosenOption: string
    reasoning: string
  }>
  
  // What we need back
  requirements: {
    questionCount: number         // How many questions to generate
    choicesPerQuestion: number    // Options per question
    includeReasoningContext: boolean
    targetComplexity: 'simple' | 'moderate' | 'complex'
  }
}
```

### 2.2 AI Response Format
```typescript
interface AIQuestionResponse {
  questions: Array<{
    id: string
    category: string              // Maps to our framework categories
    question: string
    context?: string              // Why this question matters
    
    options: Array<{
      id: string
      title: string
      description: string
      shortDescription: string
      
      // CRITICAL: Impact indicators for our mapping system
      impactIndicators: {
        primary: string[]         // Main effects: ['layout', 'colors', 'navigation']
        secondary: string[]       // Side effects: ['mobile-optimization', 'loading-speed']
        businessValue: string[]   // Business outcomes: ['user-engagement', 'conversion']
      }
      
      // Semantic tags for our mapping system
      semanticTags: {
        visualStyle?: string[]    // ['modern', 'minimalist', 'professional']
        functionality?: string[]  // ['booking', 'payments', 'analytics'] 
        userExperience?: string[] // ['simple', 'guided', 'self-service']
        deviceOptimization?: string[] // ['mobile-first', 'desktop-optimized']
      }
      
      // Business context
      bestFor: string[]
      pros: string[]
      cons?: string[]
    }>
  }>
  
  // Metadata for our processing
  metadata: {
    difficulty: number            // 1-10 complexity scale
    estimatedTimeToComplete: number
    dependsOnPreviousChoices: boolean
    opensNewDecisionPaths: string[]
  }
}
```

---

## 3. Impact Mapping Engine

### 3.1 Semantic Tag Mapping
```typescript
class ImpactMappingEngine {
  
  // Maps semantic tags to actual preview changes
  private static SEMANTIC_MAPPINGS: Record<string, PreviewChange[]> = {
    // Visual Style Mappings
    'modern': [
      {
        target: 'root',
        type: 'style',
        priority: 1,
        change: {
          css: {
            '--primary-color': '#6366f1',
            '--border-radius': '0.75rem',
            '--font-family': 'Inter, system-ui'
          }
        }
      }
    ],
    
    'minimalist': [
      {
        target: 'layout',
        type: 'style', 
        priority: 1,
        change: {
          css: {
            '--spacing': '2rem',
            '--content-max-width': '800px',
            '--background': '#ffffff'
          },
          classes: ['minimal-layout']
        }
      }
    ],
    
    'professional': [
      {
        target: 'typography',
        type: 'style',
        priority: 1, 
        change: {
          css: {
            '--heading-font': 'Source Sans Pro',
            '--body-font': 'system-ui',
            '--text-color': '#1f2937'
          }
        }
      }
    ],
    
    // Functionality Mappings
    'booking': [
      {
        target: 'main-content',
        type: 'add',
        priority: 5,
        change: {
          component: 'BookingWidget',
          position: 'inside'
        }
      },
      {
        target: 'navigation',
        type: 'modify',
        priority: 3,
        change: {
          html: '<nav-item href="/book">Book Now</nav-item>'
        }
      }
    ],
    
    'payments': [
      {
        target: 'booking-widget',
        type: 'modify',
        priority: 6,
        change: {
          attributes: { 'data-payments': 'enabled' },
          component: 'BookingWithPayments'
        }
      }
    ],
    
    // UX Mappings
    'mobile-first': [
      {
        target: 'viewport',
        type: 'style',
        priority: 1,
        change: {
          css: {
            '--mobile-breakpoint': '768px',
            '--touch-target-size': '44px'
          },
          classes: ['mobile-optimized']
        }
      }
    ]
  }
  
  // Main mapping function
  static mapChoiceToPreview(
    choice: AIQuestionOption, 
    context: MappingContext
  ): PreviewChange[] {
    
    const changes: PreviewChange[] = []
    
    // 1. Apply semantic tag mappings
    const allTags = [
      ...choice.semanticTags.visualStyle || [],
      ...choice.semanticTags.functionality || [],
      ...choice.semanticTags.userExperience || [],
      ...choice.semanticTags.deviceOptimization || []
    ]
    
    allTags.forEach(tag => {
      const tagChanges = this.SEMANTIC_MAPPINGS[tag] || []
      changes.push(...tagChanges)
    })
    
    // 2. Apply impact indicator mappings
    choice.impactIndicators.primary.forEach(impact => {
      const impactChanges = this.getImpactChanges(impact, choice, context)
      changes.push(...impactChanges)
    })
    
    // 3. Apply compound effects based on previous choices
    const compoundChanges = this.calculateCompoundEffects(choice, context.previousChoices)
    changes.push(...compoundChanges)
    
    // 4. Sort by priority and return
    return changes.sort((a, b) => a.priority - b.priority)
  }
  
  private static getImpactChanges(
    impact: string, 
    choice: AIQuestionOption, 
    context: MappingContext
  ): PreviewChange[] {
    
    const impactMappings: Record<string, PreviewChange[]> = {
      'layout': [
        {
          target: 'main-layout',
          type: 'style',
          priority: 2,
          change: {
            classes: [`layout-${choice.id}`],
            css: this.getLayoutStyles(choice)
          }
        }
      ],
      
      'colors': [
        {
          target: 'color-scheme',
          type: 'style', 
          priority: 1,
          change: {
            css: this.getColorScheme(choice, context)
          }
        }
      ],
      
      'navigation': [
        {
          target: 'main-nav',
          type: 'replace',
          priority: 3,
          change: {
            component: this.getNavigationComponent(choice),
            html: this.getNavigationHTML(choice)
          }
        }
      ]
    }
    
    return impactMappings[impact] || []
  }
}
```

### 3.2 Context-Aware Mapping
```typescript
interface MappingContext {
  userPrompt: string
  businessType: string
  previousChoices: Array<{
    category: string
    choice: string
    semanticTags: string[]
  }>
  targetDevice: 'mobile' | 'desktop' | 'both'
  complexityLevel: 'simple' | 'moderate' | 'complex'
}

class ContextualMapper {
  
  // Adjusts mappings based on business context
  static adjustForBusinessType(
    changes: PreviewChange[], 
    businessType: string
  ): PreviewChange[] {
    
    const businessAdjustments: Record<string, (changes: PreviewChange[]) => PreviewChange[]> = {
      'restaurant': (changes) => {
        // Restaurants need prominent menu and booking
        return changes.map(change => {
          if (change.target === 'main-content') {
            return {
              ...change,
              change: {
                ...change.change,
                component: 'RestaurantLayout'
              }
            }
          }
          return change
        })
      },
      
      'salon': (changes) => {
        // Salons need service showcase and appointment booking
        return changes.map(change => {
          if (change.target === 'booking-widget') {
            return {
              ...change,
              change: {
                ...change.change,
                attributes: { 
                  ...change.change.attributes,
                  'data-service-selection': 'true'
                }
              }
            }
          }
          return change
        })
      }
    }
    
    const adjuster = businessAdjustments[businessType]
    return adjuster ? adjuster(changes) : changes
  }
  
  // Handles compound effects from multiple choices
  static calculateCompoundEffects(
    newChoice: AIQuestionOption,
    previousChoices: Array<{ choice: string, semanticTags: string[] }>
  ): PreviewChange[] {
    
    const compounds: PreviewChange[] = []
    
    // Example: Professional + Booking = Business-focused booking interface
    if (this.hasTags(previousChoices, ['professional']) && 
        this.hasTags([newChoice], ['booking'])) {
      
      compounds.push({
        target: 'booking-interface',
        type: 'style',
        priority: 7,
        change: {
          css: {
            '--booking-style': 'professional',
            '--form-spacing': '1.5rem'
          },
          classes: ['professional-booking']
        }
      })
    }
    
    // Example: Mobile-first + E-commerce = Mobile shopping experience
    if (this.hasTags(previousChoices, ['mobile-first']) && 
        this.hasTags([newChoice], ['ecommerce'])) {
      
      compounds.push({
        target: 'product-grid',
        type: 'style',
        priority: 8,
        change: {
          css: {
            '--grid-columns': '1',
            '--product-card-height': '400px'
          },
          classes: ['mobile-commerce']
        }
      })
    }
    
    return compounds
  }
  
  private static hasTags(
    choices: Array<{ semanticTags?: any }>, 
    tags: string[]
  ): boolean {
    return choices.some(choice => {
      const allTags = Object.values(choice.semanticTags || {}).flat()
      return tags.some(tag => allTags.includes(tag))
    })
  }
}
```

---

## 4. Preview Application System

### 4.1 Preview Engine Integration
```typescript
class LivePreviewUpdater {
  
  constructor(private previewEngine: LivePreviewEngine) {}
  
  async applyChoiceEffects(
    choice: AIQuestionOption,
    context: MappingContext
  ): Promise<void> {
    
    // 1. Map choice to preview changes
    const changes = ImpactMappingEngine.mapChoiceToPreview(choice, context)
    
    // 2. Apply business context adjustments
    const adjustedChanges = ContextualMapper.adjustForBusinessType(
      changes, 
      context.businessType
    )
    
    // 3. Apply changes in priority order with timing
    for (const change of adjustedChanges) {
      await this.applyPreviewChange(change)
      
      // Small delay between changes for smooth visual progression
      if (change.priority < 5) {
        await this.delay(150)
      }
    }
    
    // 4. Trigger completion animation
    await this.previewEngine.triggerUpdateComplete()
  }
  
  private async applyPreviewChange(change: PreviewChange): Promise<void> {
    const target = this.previewEngine.findElement(change.target)
    if (!target) return
    
    switch (change.type) {
      case 'style':
        this.applyStyleChange(target, change.change)
        break
        
      case 'replace':
        await this.replaceElement(target, change.change)
        break
        
      case 'add':
        await this.addElement(target, change.change)
        break
        
      case 'modify':
        this.modifyElement(target, change.change)
        break
        
      case 'remove':
        this.removeElement(target)
        break
    }
  }
  
  private applyStyleChange(target: HTMLElement, change: any): void {
    // Apply CSS variables
    if (change.css) {
      Object.entries(change.css).forEach(([property, value]) => {
        if (property.startsWith('--')) {
          target.style.setProperty(property, value as string)
        } else {
          target.style[property as any] = value
        }
      })
    }
    
    // Apply CSS classes
    if (change.classes) {
      target.classList.add(...change.classes)
    }
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
```

### 4.2 Fallback and Validation
```typescript
class PreviewValidation {
  
  // Validates that AI choices can be mapped to preview effects
  static validateChoiceMapping(choice: AIQuestionOption): ValidationResult {
    const issues: string[] = []
    
    // Check for required semantic tags
    if (!choice.semanticTags || Object.keys(choice.semanticTags).length === 0) {
      issues.push('Missing semantic tags for preview mapping')
    }
    
    // Check for impact indicators
    if (!choice.impactIndicators?.primary?.length) {
      issues.push('Missing primary impact indicators')
    }
    
    // Validate mappings exist
    const allTags = Object.values(choice.semanticTags || {}).flat()
    const unmappedTags = allTags.filter(tag => 
      !ImpactMappingEngine.hasMapping(tag)
    )
    
    if (unmappedTags.length > 0) {
      issues.push(`Unmapped semantic tags: ${unmappedTags.join(', ')}`)
    }
    
    return {
      isValid: issues.length === 0,
      warnings: issues,
      errors: [],
      suggestions: this.generateMappingSuggestions(choice)
    }
  }
  
  // Provides fallback mappings for unmapped choices
  static generateFallbackMapping(choice: AIQuestionOption): PreviewChange[] {
    // Generic visual feedback for unmapped choices
    return [
      {
        target: 'status-indicator',
        type: 'style',
        priority: 1,
        change: {
          css: {
            '--status-color': '#10b981',
            '--status-message': `"Applied: ${choice.title}"`
          },
          classes: ['choice-applied']
        }
      }
    ]
  }
}
```

---

## 5. Implementation Strategy

### 5.1 Phase 1: Core Mapping System
- Implement semantic tag → preview change mappings
- Build basic choice application pipeline
- Create validation and fallback systems

### 5.2 Phase 2: AI Integration
- Design AI communication protocol
- Build choice impact analysis
- Implement context-aware mapping

### 5.3 Phase 3: Advanced Effects
- Add compound effect calculations
- Implement smooth transition animations
- Build preview state management

### 5.4 Phase 4: Intelligence Layer
- Add mapping confidence scoring
- Implement choice impact prediction
- Build mapping quality optimization

---

## 6. Success Metrics

### 6.1 Mapping Reliability
- **Coverage**: % of AI choices that map to preview effects
- **Accuracy**: How well preview matches user expectations
- **Performance**: Time from choice to visible change

### 6.2 User Experience
- **Feedback Speed**: Time to see preview changes
- **Visual Coherence**: How well choices work together visually
- **Confidence**: User confidence in their choices

This system ensures that regardless of what the external AI generates, we can reliably translate it into meaningful, real-time visual feedback for users!