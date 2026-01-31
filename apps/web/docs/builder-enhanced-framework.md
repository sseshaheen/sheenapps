# Enhanced Builder Framework: Cumulative State Management

## Core Problem
The current Builder framework treats each question as an isolated interaction, resulting in a scattered experience where preview changes don't compound. Each selection overwrites previous choices instead of building upon them.

## Solution: Progressive Enhancement Architecture

### 1. Cumulative State Model

Instead of complete replacements, implement a layered state system:

```typescript
interface BuilderState {
  // Base foundation that never changes
  baseLayer: {
    structure: 'default-layout',
    theme: 'neutral'
  },
  
  // Accumulated layers from user choices
  layers: {
    personality: LayerState,      // Q1: Brand personality
    audience: LayerState,         // Q2: Target audience
    features: LayerState,         // Q3: Key features
    differentiator: LayerState,   // Q4: Unique value
    growth: LayerState           // Q5: Growth stage
  },
  
  // Computed final state (merged layers)
  computed: ComputedState
}

interface LayerState {
  modifications: {
    colors?: Partial<ColorScheme>,
    typography?: Partial<Typography>,
    components?: ComponentModifications,
    animations?: AnimationAdditions,
    content?: ContentUpdates
  },
  metadata: {
    questionId: string,
    answerId: string,
    timestamp: number
  }
}
```

### 2. Enhanced ideal_ai_response Structure

Transform from complete replacements to incremental modifications:

```typescript
interface EnhancedIdealAIResponse {
  type: 'incremental-update',
  
  // Context-aware modifications based on previous answers
  modifications: {
    // Partial updates that merge with existing state
    colors: {
      // Only override specific colors
      primary?: string,
      accent?: string,
      // Keep others from previous layers
    },
    
    // Component modifications, not replacements
    components: {
      header: {
        // Modify specific properties
        modifications: {
          layout?: 'centered' | 'split' | 'minimal',
          addElements?: ['cta-button', 'trust-badge'],
          removeElements?: ['search'],
          styleOverrides?: {
            backgroundColor?: string,
            padding?: string
          }
        }
      },
      hero: {
        modifications: {
          emphasis?: 'visual' | 'content' | 'balanced',
          addSections?: ['testimonial-strip', 'feature-bullets'],
          contentUpdates?: {
            headline?: { prefix?: string, suffix?: string },
            subheadline?: { tone?: string }
          }
        }
      }
    },
    
    // Additive animations
    animations: {
      add: ['subtle-fade', 'number-counter'],
      remove: ['aggressive-bounce'],
      modify: {
        'hero-entrance': { duration: 800 }
      }
    },
    
    // Content enhancements
    content: {
      // Dynamic content based on accumulated context
      replacements: {
        '{{business_type}}': context.businessType,
        '{{audience_name}}': context.audienceName,
        '{{value_prop}}': generateValueProp(context)
      },
      additions: {
        'trust-signals': generateTrustSignals(context),
        'social-proof': generateSocialProof(context)
      }
    }
  },
  
  // Visual progression hints
  transitions: {
    // How to transition from previous state
    style: 'morph' | 'layer' | 'enhance',
    duration: 600,
    // Highlight what changed
    focusAreas: ['header-cta', 'hero-content', 'color-scheme']
  },
  
  // Relationship to previous choices
  relationships: {
    // How this choice relates to previous answers
    enhances: ['personality-luxury', 'audience-premium'],
    conflicts: [],
    synergies: [
      {
        withAnswer: 'personality-luxury',
        effect: 'amplify-premium-feel'
      }
    ]
  }
}
```

### 3. Answer History Context

Maintain full context of user journey:

```typescript
interface AnswerContext {
  history: Answer[],
  
  // Derived insights
  profile: {
    businessType: 'b2c' | 'b2b' | 'mixed',
    marketPosition: 'premium' | 'value' | 'innovative',
    customerJourney: 'simple' | 'complex' | 'educational',
    brandArchetype: string
  },
  
  // Visual state accumulation
  visualProfile: {
    dominantColors: string[],
    typographyStyle: 'modern' | 'classic' | 'playful',
    layoutComplexity: 'minimal' | 'balanced' | 'rich',
    interactionLevel: 'static' | 'subtle' | 'dynamic'
  }
}
```

### 4. Dynamic Preview Impact Generation

Instead of static preview impacts, generate them dynamically:

```typescript
function generatePreviewImpact(
  answer: Answer,
  context: AnswerContext
): EnhancedIdealAIResponse {
  // Base modifications for this answer
  let modifications = answer.baseModifications;
  
  // Enhance based on previous answers
  context.history.forEach(prevAnswer => {
    const synergy = findSynergy(answer, prevAnswer);
    if (synergy) {
      modifications = applySynergy(modifications, synergy);
    }
  });
  
  // Adjust for visual continuity
  modifications = ensureVisualContinuity(
    modifications,
    context.visualProfile
  );
  
  return {
    type: 'incremental-update',
    modifications,
    transitions: determineTransition(context),
    relationships: analyzeRelationships(answer, context)
  };
}
```

### 5. Preview Engine Enhancement

Update the preview engine to handle cumulative state:

```typescript
class EnhancedPreviewEngine {
  private baseState: BaseState;
  private layers: Map<string, LayerState>;
  private computedState: ComputedState;
  
  applyIncremental(impact: EnhancedIdealAIResponse) {
    // Add to layers, don't replace
    this.layers.set(impact.questionId, impact.modifications);
    
    // Recompute final state
    this.computedState = this.computeState();
    
    // Apply with transition
    this.transitionToState(this.computedState, impact.transitions);
  }
  
  private computeState(): ComputedState {
    // Start with base
    let state = { ...this.baseState };
    
    // Apply each layer in order
    this.layers.forEach(layer => {
      state = this.mergeLayers(state, layer);
    });
    
    return state;
  }
  
  revertToQuestion(questionId: string) {
    // Remove this and subsequent layers
    this.removeLayersAfter(questionId);
    
    // Recompute and transition
    this.computedState = this.computeState();
    this.transitionToState(this.computedState);
  }
}
```

### 6. Visual Progression System

Implement visual storytelling through the question flow:

```typescript
interface ProgressionStage {
  stage: 1 | 2 | 3 | 4 | 5,
  
  visualTheme: {
    // Stage 1: Foundation
    1: { focus: 'structure', complexity: 'minimal' },
    // Stage 2: Personality
    2: { focus: 'color-typography', complexity: 'emerging' },
    // Stage 3: Audience
    3: { focus: 'content-layout', complexity: 'targeted' },
    // Stage 4: Features
    4: { focus: 'interactions', complexity: 'rich' },
    // Stage 5: Polish
    5: { focus: 'refinement', complexity: 'complete' }
  },
  
  allowedModifications: string[],
  transitionStyle: 'subtle' | 'noticeable' | 'dramatic'
}
```

### 7. Implementation Strategy

1. **State Persistence**: Maintain BuilderState throughout the flow
2. **Layer Management**: Each answer adds a layer, never replaces
3. **Smart Merging**: Intelligently combine modifications
4. **Visual Continuity**: Ensure smooth transitions between states
5. **Contextual Adaptation**: Adjust impacts based on journey
6. **Revert Capability**: Clean layer removal for navigation

## Benefits

1. **Progressive Building**: Each choice visibly builds on previous ones
2. **Coherent Journey**: Visual changes tell a story of business evolution
3. **Preserved Choices**: Earlier selections remain visible and enhanced
4. **Smart Combinations**: Synergistic effects between related choices
5. **Clear Progression**: Users see their business identity emerging
6. **Flexible Navigation**: Can go back without losing everything

## Example Flow

**Question 1 (Personality): "Luxury"**
- Adds: Premium colors, elegant typography
- Preview: Clean, sophisticated base

**Question 2 (Audience): "Young Professionals"**
- Keeps: Premium feel from Q1
- Adds: Modern elements, dynamic touches
- Preview: Luxury meets contemporary

**Question 3 (Features): "AI-Powered"**
- Keeps: Premium + modern from Q1&Q2
- Adds: Tech elements, data visualizations
- Preview: Sophisticated tech solution

Result: A coherent premium tech brand for young professionals, where each choice compounds rather than replaces.