# Salon Mock Response Matrix Implementation Plan

## Overview
Generate 204 comprehensive mock AI responses for salon section editing:
- **4 sections**: header, hero, features, testimonials  
- **17 total suggestions**: 4+5+4+4 across sections
- **12 layouts**: luxury-premium through trendy-youth
- **Total responses**: 17 × 12 = 204

## File Structure Strategy

### Option A: Modular Files (Recommended)
```
src/services/ai/mock-responses/salon/
├── index.ts                    # Export aggregator
├── response-matrix.ts          # Central mapping logic
└── layouts/
    ├── luxury-premium/
    │   ├── header.ts          # 4 header responses
    │   ├── hero.ts            # 5 hero responses  
    │   ├── features.ts        # 4 features responses
    │   └── testimonials.ts    # 4 testimonials responses
    ├── warm-approachable/
    │   └── ... (same structure)
    └── ... (10 more layout folders)
```

### Option B: Single Matrix File
```
src/services/ai/mock-responses/salon/
├── index.ts
└── complete-matrix.ts         # All 204 responses
```

## Response Structure Template

Each response follows this pattern:
```typescript
interface SalonSectionResponse {
  id: string                    # "luxury-premium-hero-modern"
  layout: string               # "luxury-premium"  
  section: string              # "hero"
  suggestion: string           # "Make it more modern"
  component: ComponentDefinition
  metadata: {
    model: 'claude-3-sonnet'
    prompt: string             # Original suggestion
    reasoning: string          # Why this solution fits
    confidence: number
    processingTime: number
    tags: string[]
  }
}
```

## Implementation Strategy

### Phase 1: Foundation (Day 1-2)
1. **Create file structure** with placeholder responses
2. **Build response matrix logic** for intelligent lookup
3. **Integrate with existing mock-ai-service.ts**
4. **Test with 1-2 complete layouts** to validate approach

### Phase 2: Content Generation (Day 3-5)
1. **Generate responses systematically** by layout
2. **Ensure style consistency** within each layout
3. **Vary response complexity** (simple vs comprehensive changes)
4. **Add realistic metadata** and reasoning

### Phase 3: Integration & Polish (Day 6-7)  
1. **Update API client** to use new response matrix
2. **Add fallback mechanisms** for missing responses
3. **Test all combinations** in UI
4. **Document the system** for future expansion

## Sample Response Examples

### Luxury-Premium + Hero + "Make it more modern"
```typescript
{
  id: "luxury-premium-hero-make-modern",
  layout: "luxury-premium", 
  section: "hero",
  suggestion: "Make it more modern",
  component: {
    // Modern luxury hero with:
    // - Cleaner typography (Montserrat vs Playfair Display)
    // - Subtle animations instead of heavy effects
    // - Minimalist gold accents
    // - Contemporary layout patterns
  }
}
```

### Warm-Approachable + Features + "Include pricing information"  
```typescript
{
  id: "warm-approachable-features-include-pricing",
  layout: "warm-approachable",
  section: "features", 
  suggestion: "Include pricing information",
  component: {
    // Friendly features with:
    // - Clear pricing cards with warm colors
    // - "Starting at $X" messaging
    // - Playful icons and friendly copy
    // - Community-focused value props
  }
}
```

## Lookup Logic

```typescript
// In mock-ai-service.ts
async modifySection(request) {
  const { sectionType, userInput, businessContext } = request
  
  // Determine current layout from business context
  const currentLayout = detectCurrentLayout(businessContext)
  
  // Find matching response
  const responseKey = `${currentLayout}-${sectionType}-${normalizeInput(userInput)}`
  const response = SALON_MATRIX[responseKey] || generateFallbackResponse(request)
  
  return response
}
```

## Quality Assurance

### Content Variety Requirements:
- **Visual changes**: 40% of responses modify colors, typography, layouts
- **Content changes**: 35% of responses add/modify text, CTAs, copy
- **Functional changes**: 25% of responses add features, interactions, elements

### Consistency Requirements:
- Each layout maintains **distinctive style** across all sections
- **Gradual complexity** from simple suggestions to comprehensive changes
- **Realistic AI reasoning** explaining why each change was made

## Benefits of This Approach

1. **Rich Demo Experience**: 204 unique responses showcase AI capabilities
2. **Realistic Behavior**: Responses match business context and layout style  
3. **Scalable Architecture**: Easy to add new layouts, sections, suggestions
4. **Development Speed**: Parallel content creation across team members
5. **Quality Control**: Structured approach ensures consistency

## Timeline Estimate

- **Setup & Structure**: 1 day
- **Content Creation**: 3-4 days (50+ responses per day)
- **Integration & Testing**: 1-2 days
- **Polish & Documentation**: 1 day

**Total**: 6-8 days for complete 204-response matrix

## Next Steps

1. **Approve approach**: Modular files vs single matrix
2. **Create foundation files**: Structure and first layout
3. **Define content guidelines**: Style consistency rules
4. **Begin systematic generation**: Layout by layout
5. **Test incrementally**: Validate as we build

This creates a demo-ready system that showcases the full potential of AI-powered section editing with contextual, layout-appropriate responses.