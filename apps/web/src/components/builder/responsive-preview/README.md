# Responsive Preview Controls

Professional responsive preview controls for the workspace that allow users to see their website in mobile, tablet, and desktop views with smooth transitions.

## 🎯 Features

- **Device Viewports**: Mobile (375×667), Tablet (768×1024), Desktop (1200×800)
- **Orientation Toggle**: Portrait/landscape support with dimension swapping
- **Display Modes**: Pixel-accurate vs Fit-to-container with auto-scaling
- **Crisp Zoom**: Steps at 50%, 67%, 75%, 100%, 125% to prevent text blur
- **URL Shareability**: `?vp=mobile&z=100&fit=1&o=landscape` for collaborative preview
- **Accessibility**: Full keyboard navigation + screen reader support
- **State Preservation**: Iframe app state survives viewport switches (no reloads!)

## 🚀 Quick Start

### Basic Usage

```tsx
import { useResponsivePreview } from '@/hooks/use-responsive-preview'
import { ResponsivePreviewContainer } from '@/components/builder/responsive-preview/responsive-preview-container'
import { DeviceSelectorToolbar } from '@/components/builder/responsive-preview/device-selector-toolbar'

function MyPreview({ projectId, previewUrl }: { projectId: string; previewUrl: string }) {
  const previewState = useResponsivePreview(projectId)

  return (
    <div className="h-screen flex flex-col">
      <DeviceSelectorToolbar previewState={previewState} />
      <ResponsivePreviewContainer
        url={previewUrl}
        projectId={projectId}
        previewState={previewState}
        className="flex-1"
      />
    </div>
  )
}
```

### Feature Flag Integration

```tsx
// Enable/disable responsive controls
const ENABLE_RESPONSIVE_PREVIEW = process.env.NEXT_PUBLIC_ENABLE_RESPONSIVE_PREVIEW !== 'false'

// Workspace integration with fallback
if (ENABLE_RESPONSIVE_PREVIEW) {
  return <EnhancedWorkspacePreview />
} else {
  return <SimpleIframePreview /> // Fallback
}
```

## ⌨️ Keyboard Shortcuts

- **`1`** - Switch to mobile viewport
- **`2`** - Switch to tablet viewport
- **`3`** - Switch to desktop viewport
- **`[`** - Zoom out (previous step)
- **`]`** - Zoom in (next step)
- **`R`** - Toggle orientation (portrait/landscape)

## 🎨 Styling

Import the CSS file in your layout:

```tsx
import '@/styles/responsive-preview.css'
```

Or use the Tailwind classes directly with the components.

## 🧪 State Management

### Hook Options

```tsx
const previewState = useResponsivePreview(projectId, {
  defaultViewport: 'desktop',     // 'mobile' | 'tablet' | 'desktop'
  defaultZoom: 100,               // 25-200
  defaultFit: true,               // true = fit, false = pixel-accurate
  defaultOrientation: 'portrait'  // 'portrait' | 'landscape'
})
```

### State Persistence

- **URL Parameters**: Automatically synced for shareability
- **localStorage**: Per-project settings remembered
- **Load Order**: URL → localStorage → defaults

### Utility Functions

```tsx
const {
  reset,               // Reset to default settings
  snapToNearestZoom    // Snap zoom to crisp steps
} = previewState
```

## 🔒 Security

### Sandbox Attributes

The iframe uses smart sandbox detection:

```tsx
// Same-origin URLs (development/staging)
sandbox="allow-same-origin allow-scripts allow-forms allow-popups..."

// Cross-origin URLs (production)
sandbox="allow-scripts allow-forms allow-popups..." // no allow-same-origin
```

## ♿ Accessibility

- **Radiogroup Pattern**: Device buttons use proper ARIA roles
- **Live Announcements**: `aria-live="polite"` for dimension changes
- **Keyboard Navigation**: Full keyboard control without mouse
- **Screen Reader**: Descriptive labels and state announcements
- **Focus Management**: Visible focus during transitions

## 🚀 Performance

- **Transform-only animations**: No layout reflow (60fps)
- **GPU acceleration**: `will-change: transform`
- **Debounced persistence**: 150ms delay for localStorage/URL updates
- **ResizeObserver**: Efficient container size detection
- **Mouse-wheel flow**: Container doesn't hijack scroll when zoomed

## 🧪 Testing

### Manual Testing Checklist

- [ ] Smooth transitions between viewports (no iframe reloads)
- [ ] Keyboard shortcuts work without conflicts
- [ ] URL state persists on page refresh
- [ ] Accessibility with screen reader
- [ ] Touch-friendly on mobile devices
- [ ] Performance at 60fps during scaling

### Key Assertions

```tsx
// Test iframe stability (no reloads)
expect(iframe.src).toBe(previewUrl) // URL unchanged
expect(loadEventCount).toBe(1)      // Only one load event

// Test computed styles (not raw pixels)
expect(getComputedStyle(frame).transform).toContain('scale(')
expect(dimensionChip.textContent).toBe('375 × 667 @ 100%')
```

## 📚 Architecture

### Component Structure

```
responsive-preview/
├── responsive-preview-container.tsx  # Main iframe wrapper with scaling
├── device-selector-toolbar.tsx      # Controls toolbar with accessibility
└── README.md                        # This file

hooks/
└── use-responsive-preview.ts         # State management hook

styles/
└── responsive-preview.css           # Styling and animations
```

### State Flow

1. **User action** (click device button, keyboard shortcut)
2. **Hook updates** state (viewport, zoom, fit, orientation)
3. **ResizeObserver** calculates new scale
4. **CSS transform** animates to new size
5. **Persistence** saves to URL + localStorage
6. **Accessibility** announces change to screen readers

## 🔍 Troubleshooting

### Common Issues

**Iframe reloads on viewport switch**:
- Ensure iframe key is stable: `key={preview-${projectId}}`
- Don't change key based on viewport or URL

**Blurry text at scaled sizes**:
- Use crisp zoom steps: 50%, 67%, 75%, 100%, 125%
- Round scale to 2 decimals: `+((scale).toFixed(2))`

**Layout jumps during transitions**:
- Use `will-change: transform` on scaled element
- Animate only transform, not width/height

**URL conflicts with routing**:
- Use shallow routing: `window.history.replaceState()`
- Don't trigger navigation events

### Debug Mode

Set `localStorage.debug = 'responsive-preview'` to enable detailed logging.

## 🎯 Next Steps

- [ ] Device frame styling (optional chrome/notch)
- [ ] Custom breakpoint support
- [ ] Multiple device preview (side-by-side)
- [ ] Screenshot capture functionality
- [ ] Performance metrics overlay