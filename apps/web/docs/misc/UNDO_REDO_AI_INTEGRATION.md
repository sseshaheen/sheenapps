# Undo/Redo System - External AI Integration Guide

## Current State (Mock System)
The undo/redo system is currently designed for mock responses but has been refactored to be AI-ready.

## Integration with External AI

### 1. **Initial Layout Generation**
When external AI generates the initial website layout:

```typescript
// After AI generates the complete layout
const aiGeneratedSections = {
  "header": headerComponent,
  "hero": heroComponent, 
  "features": featuresComponent,
  "testimonials": testimonialsComponent,
  // ... any other sections AI generates
}

// Capture all initial states at once
const { bulkInitializeFromRenderedSections } = useSectionHistoryStore()
bulkInitializeFromRenderedSections(aiGeneratedSections)
```

### 2. **Section Editing with Free Text**
The system already supports free-text user input:

```typescript
// User types: "Make the header more professional and add our phone number"
const userInput = "Make the header more professional and add our phone number"

// Send to external AI
const aiResponse = await externalAI.modifySection({
  sectionType: "header",
  currentComponent: currentHeaderComponent,
  userInstruction: userInput,
  businessContext: businessContext
})

// Record the change (userInput can be any string)
recordChange("header", aiResponse.component, userInput)
```

### 3. **Dynamic Section Types**
The system works with any section IDs that AI generates:

```typescript
// AI might generate sections like:
const dynamicSections = {
  "custom-pricing-table": pricingComponent,
  "testimonials-carousel": testimonialsComponent,
  "booking-widget": bookingComponent,
  "ai-generated-gallery": galleryComponent
}

bulkInitializeFromRenderedSections(dynamicSections)
```

### 4. **Live State Capture**
For real-time capture of current rendered state:

```typescript
// When AI re-generates a section, capture the new state
const { captureCurrentState } = useSectionHistoryStore()

// This replaces the current "initial" state with what's actually rendered
captureCurrentState("header", currentlyRenderedHeaderComponent)
```

## Migration Steps

### Phase 1: Replace Mock Response Generation
1. Replace `getSalonResponse()` calls with external AI API calls
2. Use the same `recordChange()` function - it already accepts any user text
3. Remove hardcoded suggestion arrays in favor of AI-powered suggestions

### Phase 2: Dynamic Initial State Capture
1. After AI generates initial layout, call `bulkInitializeFromRenderedSections()`
2. Remove the mock `initializeLayoutSections()` function
3. Ensure undo/redo UI shows up correctly

### Phase 3: Real-Time State Synchronization
1. Use `captureCurrentState()` when sections are updated outside of user edits
2. Handle cases where AI regenerates entire layouts

## Key Benefits of Current Architecture

✅ **User Input Agnostic**: Accepts any free-text user instructions  
✅ **Component Agnostic**: Works with any component structure AI generates  
✅ **Section Type Agnostic**: Works with any section IDs/types  
✅ **Layout Agnostic**: Not tied to "luxury-premium" or any specific layout  
✅ **AI Provider Agnostic**: Works with any external AI service  

## Example External AI Integration

```typescript
// Enhanced section editing for external AI
const handleSectionEdit = async (sectionId: string, userInstruction: string) => {
  const currentComponent = getCurrentSectionComponent(sectionId)
  
  try {
    // Call external AI service
    const aiResponse = await fetch('/api/ai/modify-section', {
      method: 'POST',
      body: JSON.stringify({
        sectionId,
        currentComponent,
        userInstruction,
        businessContext: getBusinessContext()
      })
    })
    
    const modifiedComponent = await aiResponse.json()
    
    // Record change in history (supports any user text)
    recordChange(sectionId, modifiedComponent, userInstruction)
    
    // Update the rendered section
    updateSectionInPreview(sectionId, modifiedComponent)
    
  } catch (error) {
    console.error('AI section modification failed:', error)
  }
}

// Usage with free text:
handleSectionEdit("header", "Make it more modern and add our social media links")
handleSectionEdit("hero", "Change the background to a gradient and make the text more compelling")
handleSectionEdit("custom-section-123", "Add a photo gallery with lightbox functionality")
```

## Summary

The refactored system is now **fully prepared for external AI integration** with:
- Dynamic section type support
- Free-text user input handling  
- Real component state capture
- No hardcoded layout dependencies
- Proper separation between mock and production code paths