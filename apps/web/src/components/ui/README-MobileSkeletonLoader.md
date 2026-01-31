# MobileSkeletonLoader

A comprehensive skeleton loading system specifically designed for mobile interfaces. Part of the Phase 6 mobile responsiveness strategy implementation.

## Overview

The `MobileSkeletonLoader` provides smooth loading states that match the actual content structure of different mobile UI components. This improves perceived performance and provides a native-like loading experience.

## Components

### 1. MobileSkeletonLoader

Main skeleton component supporting multiple UI patterns:

```typescript
interface MobileSkeletonLoaderProps {
  type: 'question' | 'preview' | 'chat' | 'header' | 'tabs' | 'panel'
  className?: string
  count?: number
}
```

**Supported Types:**

- **`question`**: Question interface with progress bar, question text, and option cards
- **`preview`**: Preview container with controls and preview area
- **`chat`**: Chat interface with header, messages, and input area
- **`header`**: Mobile workspace header with navigation and actions
- **`tabs`**: Bottom tab navigation bar
- **`panel`**: Generic panel with header and content items

### 2. MobileWorkspaceSkeleton

Full workspace skeleton for initial app loading:

```tsx
<MobileWorkspaceSkeleton />
```

Includes header, content area, and bottom navigation skeletons.

### 3. MobileSheetSkeleton

Specialized skeleton for mobile sheets/modals:

```tsx
<MobileSheetSkeleton title="Loading..." />
```

## Usage Examples

### Basic Skeleton Loading

```tsx
import { MobileSkeletonLoader } from '@/components/ui/mobile-skeleton-loader'

// Question interface loading
<MobileSkeletonLoader type="question" count={4} />

// Chat interface loading
<MobileSkeletonLoader type="chat" count={5} />

// Preview container loading
<MobileSkeletonLoader type="preview" />
```

### Progressive Loading Pattern

```tsx
import { MobileProgressiveLoader } from '@/components/builder/workspace/mobile-workspace-loading'

<MobileProgressiveLoader
  data={questionData}
  isLoading={isQuestionLoading}
  skeletonType="question"
  fallback={<div>No questions available</div>}
>
  {(data) => <QuestionInterface question={data} />}
</MobileProgressiveLoader>
```

### Loading Overlay

```tsx
import { MobileLoadingOverlay } from '@/components/builder/workspace/mobile-workspace-loading'

<div className="relative">
  <YourContent />
  <MobileLoadingOverlay 
    isVisible={isProcessing}
    message="Processing your request..."
  />
</div>
```

### Conditional Loading in Components

```tsx
export function MobileQuestionInterface({ currentQuestion, isLoading }) {
  if (!currentQuestion || isLoading) {
    return <MobileSkeletonLoader type="question" count={4} />
  }
  
  return (
    <div>
      {/* Your question interface */}
    </div>
  )
}
```

## Animation Features

### Smooth Pulsing Animation

The skeleton uses a custom `animate-pulse-slow` animation:

```css
.animate-pulse-slow {
  animation: pulse-slow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
```

### Shimmer Effect

Optional shimmer animation for enhanced visual feedback:

```css
.skeleton-shimmer::after {
  animation: shimmer-mobile 2s infinite;
}
```

## Best Practices

### 1. Match Content Structure

Always choose the skeleton type that most closely matches your actual content:

```tsx
// ✅ Good - matches actual chat interface
<MobileSkeletonLoader type="chat" count={3} />

// ❌ Bad - generic loading for specific interface
<div className="animate-pulse">Loading...</div>
```

### 2. Appropriate Count Values

Use realistic counts that match typical content:

```tsx
// ✅ Good - realistic question count
<MobileSkeletonLoader type="question" count={4} />

// ❌ Bad - unrealistic count
<MobileSkeletonLoader type="question" count={20} />
```

### 3. Loading State Transitions

Ensure smooth transitions between loading and loaded states:

```tsx
<AnimatePresence mode="wait">
  {isLoading ? (
    <motion.div key="skeleton" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <MobileSkeletonLoader type="question" />
    </motion.div>
  ) : (
    <motion.div key="content" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <ActualContent />
    </motion.div>
  )}
</AnimatePresence>
```

### 4. Accessibility Considerations

Include proper ARIA labels for screen readers:

```tsx
<div aria-label="Loading content" role="status">
  <MobileSkeletonLoader type="question" />
</div>
```

## Integration with Mobile Strategy

This component implements Phase 6 requirements from `BUILDER_MOBILE_STRATEGY.md`:

1. **Mobile Loading States**: ✅ Implemented
2. **Performance Optimization**: ✅ Lightweight animations
3. **Progressive Enhancement**: ✅ Works without JavaScript
4. **Touch-Friendly**: ✅ Respects mobile design patterns

## CSS Classes

The skeleton loader includes these utility classes:

- `.animate-pulse-slow`: Slower, more subtle pulsing
- `.skeleton-shimmer`: Adds shimmer effect overlay
- `.mobile-touch-target`: Maintains touch target sizing

## Performance Notes

- Uses CSS animations instead of JavaScript for better performance
- Minimal DOM structure to reduce layout calculations
- Optimized for 60fps animations on mobile devices
- Small bundle size impact (~2KB gzipped)

## Component Relationships

```
MobileSkeletonLoader
├── Used in: MobileQuestionInterface
├── Used in: MobileWorkspaceLayout
├── Used in: MobileSheet components
└── Wrapped by: MobileWorkspaceLoading utilities
```

## Future Enhancements

Potential improvements for future versions:

1. **Auto-detection**: Automatically determine skeleton type from parent component
2. **Custom shapes**: Support for custom skeleton shapes and layouts
3. **Theme integration**: Better integration with design system colors
4. **Reduced motion**: Enhanced support for `prefers-reduced-motion`

## Related Components

- `MobileSheet`: Uses `MobileSheetSkeleton`
- `MobileQuestionInterface`: Uses question-type skeleton
- `AdaptiveWorkspaceLayout`: Passes loading state to mobile layout
- `MobileWorkspaceLoading`: Higher-level loading utilities