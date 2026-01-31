# Debugging Guide - Smart Logging System

## Quick Start

### 1. **Browser Console Commands**
```javascript
// Focus on layout switching issues
debugPresets.layoutDebugging()

// Focus on component generation  
debugPresets.componentDebugging()

// Show everything (careful - lots of logs!)
debugPresets.verboseDebugging()

// Quiet mode (errors only)
debugPresets.quietMode()

// Reset to normal
debugPresets.normalMode()
```

### 2. **Common Debugging Scenarios**

#### **Layout Switching Issues**
```javascript
// In console:
debugPresets.layoutDebugging()
// Now switch layouts - you'll only see layout and history logs
```

#### **Component Generation Errors**
```javascript
// In console:
debugPresets.componentDebugging()
// Now test component generation - focused logs only
```

#### **Performance Issues**
```javascript
// In console:
debugPresets.performanceDebugging()
// Monitor timing logs only
```

### 3. **Log Categories**

| Category | Purpose | When to Use |
|----------|---------|-------------|
| `layout` | Layout switching, theme changes | Layout bugs |
| `history` | Undo/redo, state management | History issues |
| `preview` | Preview rendering, iframe | Preview bugs |
| `components` | Component generation, HTML | Component errors |
| `ai` | AI responses, generation | AI integration |
| `performance` | Timing, optimization | Performance issues |
| `general` | Everything else | General debugging |

### 4. **Log Levels**

| Level | Purpose | Example |
|-------|---------|---------|
| `ERROR` | Critical failures | API errors, crashes |
| `WARN` | Recoverable issues | Missing data, fallbacks |
| `INFO` | Important events | Layout switches, completions |
| `DEBUG` | Detailed tracing | Step-by-step operations |

## **Migration from Old Logging**

### ❌ **Before (Problematic)**
```typescript
console.log('🔄 Smart layout switch to: ${layoutId}')
console.log('📸 Capturing current state for ${sectionId}')
console.log('✅ Layout switched to ${layoutId} with smart state management')
console.log('🎨 Using direct HTML from edited component')
console.error('❌ Component format not supported for ${sectionId}')
```

### ✅ **After (Clean)**
```typescript
import { logger } from '@/utils/logger'

logger.info('Switching to layout', { layoutId }, 'layout')
logger.debug('history', 'Capturing current state', { sectionId })
logger.success('Layout switched successfully', 'layout')
logger.debug('components', 'Using direct HTML from edited component')
logger.error('Component format not supported', { sectionId, availableKeys }, 'components')
```

## **Benefits**

1. **🎯 Focused Debugging**: Filter by category to see only relevant logs
2. **📊 Manageable Volume**: Automatic limits prevent console flooding  
3. **🚦 Proper Levels**: Errors stand out, debug info stays quiet
4. **⚡ Performance**: Less logging overhead in production
5. **🔧 Configurable**: Easy to adjust for different debugging needs

## **Best Practices**

### **Use Appropriate Levels**
```typescript
// ✅ Good
logger.error('Failed to load component', error, 'components')
logger.warn('Fallback to default theme', { reason }, 'layout')  
logger.info('Layout switch completed', { layoutId }, 'layout')
logger.debug('components', 'Generated HTML', { html })

// ❌ Avoid
console.log('ERROR: Something failed') // Use logger.error()
console.log('Step 1 of 47 completed')   // Too verbose, use logger.debug()
```

### **Group Related Operations**
```typescript
logger.group('Component Generation', 'components')
logger.debug('components', 'Generating header')
logger.debug('components', 'Applying styles')
logger.success('Component generated', 'components')
logger.groupEnd()
```

### **Include Useful Context**
```typescript
// ✅ Helpful context
logger.error('Component format not supported', {
  sectionId,
  availableKeys: Object.keys(newContent),
  expectedFormat: 'html or config.component'
}, 'components')

// ❌ Not helpful  
logger.error('Component format not supported')
```

## **Real-World Usage**

### **Daily Development**
```javascript
// Start with normal mode
debugPresets.normalMode()

// When layout switching breaks:
debugPresets.layoutDebugging()

// When component generation fails:
debugPresets.componentDebugging()

// Back to normal when fixed:
debugPresets.normalMode()
```

### **Providing Debug Info**
Instead of copy-pasting thousands of lines:
```javascript
// Focus on the specific issue
debugPresets.layoutDebugging()
// Reproduce the bug
// Copy only the relevant focused logs (much smaller!)
```