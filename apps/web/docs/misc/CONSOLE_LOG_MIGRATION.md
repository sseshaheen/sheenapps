# Console.log Migration Plan

## **Priority Files for Migration** (High Impact)

### **1. Core State Management**
- ✅ `src/stores/simplified-section-history-store.ts` - Already migrated
- 🔄 `src/stores/section-history-store.ts` - In progress (partial)
- 🔄 `src/services/preview/live-preview-engine.ts` - In progress (partial)

### **2. Component Generation & Preview**
- ⏳ `src/services/preview/component-renderer.ts`
- ⏳ `src/services/preview/change-applicator.ts`
- ⏳ `src/components/builder/enhanced-workspace-page.tsx`

### **3. Low Priority (Replace Later)**
- `src/services/ai/*` - AI generation modules
- `src/components/preview/*` - Preview components
- `src/hooks/*` - Custom hooks

## **Migration Guidelines**

### **Console.log → Logger Mapping**
```typescript
// ERROR LEVEL
console.error('❌ Failed to...') → logger.error('Failed to...', error, 'category')

// WARNING LEVEL  
console.warn('⚠️ Something unexpected') → logger.warn('Something unexpected', data, 'category')
console.log('⚠️ Fallback mode') → logger.warn('Fallback mode', reason, 'category')

// INFO LEVEL
console.log('✅ Success message') → logger.success('Success message', 'category')
console.log('🔄 Important operation') → logger.info('Important operation', data, 'category')

// DEBUG LEVEL (Most Verbose)
console.log('🎯 Debug info') → logger.debug('category', 'Debug info', data)
console.log('🔍 Detailed trace') → logger.debug('category', 'Detailed trace', data)
```

### **Category Assignment**
- **layout**: Layout switching, theme changes
- **history**: Undo/redo, state management
- **preview**: Preview rendering, iframe operations
- **components**: Component generation, HTML/CSS
- **ai**: AI responses, generation
- **performance**: Timing, caching, optimization

## **Benefits After Migration**

### **Before (Current Problem)**
```
🚀 LivePreviewEngine initialized with modular architecture
🎯 CHOICE ID DEBUG - Processing choice: {...}
🛑 CANCELLING previous generation to prevent content mixing
  Current generating: luxury-premium New choice: modern-minimal
⚡ Choice already generated, checking for cached components: Modern & Minimal
🔍 CACHE CHECK: {...}
🔍 CACHE DEBUG - Applying cached components for choice: {...}
🧹 Clearing global styles tracking to prevent theme bleed between cached layouts
📨 Sent SWITCH_LAYOUT message to workspace: "modern-minimal" (Modern & Minimal)
⚡ Applying atomic impact with 3 components
🔧 Added cached header to atomic update (selector: header)
🔧 Added cached hero to atomic update (selector: #hero-section)
🔧 Added cached features to atomic update (selector: #features-section)
✅ Successfully applied all cached components atomically for choice modern-minimal
```
**Result: 10+ lines for a simple layout switch!**

### **After (Smart Logging)**
```javascript
// Normal mode (default)
🔄 INFO: Switching to layout: modern-minimal
⚡ INFO: Applying cached components (3 sections)
✅ INFO: Layout switch completed

// Debug mode (when needed)
debugPresets.layoutDebugging()
🔄 INFO: Switching to layout: modern-minimal  
🔄 DEBUG: Processing choice: modern-minimal
📚 DEBUG: Cache hit for modern-minimal (3 components)
⚡ DEBUG: Clearing global styles to prevent theme bleed
🔄 DEBUG: Applying cached header
🔄 DEBUG: Applying cached hero  
🔄 DEBUG: Applying cached features
✅ INFO: Layout switch completed
```
**Result: 3 lines normally, detailed logs only when debugging!**

## **Quick Commands for Testing**

```javascript
// In browser console:

// Normal development (clean logs)
debugPresets.normalMode()

// When layout switching breaks
debugPresets.layoutDebugging()

// When components fail to generate
debugPresets.componentDebugging()

// Performance debugging
debugPresets.performanceDebugging()

// See everything (careful!)
debugPresets.verboseDebugging()

// Quiet mode (errors only)
debugPresets.quietMode()
```