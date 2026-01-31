# Quick Salon Theme Fix

## Problem
The live preview shows correct salon content but with generic blue/gray styling instead of the salon's warm brown/beige theme.

## Quick Solution

### 1. Add Theme Detection to workspace-core.tsx

```typescript
// After detecting salon template
if (isSalonTemplate) {
  // Apply salon design tokens to sections
  const salonStyles = {
    variables: {
      '--primary-color': '#8B7355',
      '--secondary-color': '#E8DFD3',
      '--accent-color': '#D4A574', 
      '--background-color': '#FAF9F7',
      '--text-color': '#2C2C2C',
      '--text-light': '#6B6B6B',
      '--font-heading': "'Playfair Display', serif",
      '--font-body': "'Inter', sans-serif"
    }
  }
  
  // Merge with each section's styles
  Object.values(sections).forEach(section => {
    section.styles.variables = {
      ...salonStyles.variables,
      ...section.styles.variables
    }
  })
}
```

### 2. Update HeroRenderer to Use Theme Variables

```typescript
// In hero-renderer.tsx
const primaryColor = vars['--primary-color'] || '#3b82f6'
const secondaryColor = vars['--secondary-color'] || '#e5e7eb'
const accentColor = vars['--accent-color'] || '#f59e0b'
const bgColor = vars['--background-color'] || '#ffffff'
const textColor = vars['--text-color'] || '#1f2937'
const fontHeading = vars['--font-heading'] || 'system-ui'
const fontBody = vars['--font-body'] || 'system-ui'

// Apply to styles
style={{
  background: `linear-gradient(135deg, ${primaryColor}20, ${accentColor}20)`,
  backgroundColor: bgColor,
  color: textColor,
  fontFamily: fontBody
}}

// For headings
<h1 style={{
  fontFamily: fontHeading,
  color: textColor
}}>
```

### 3. Load Google Fonts Dynamically

```typescript
// In workspace-core.tsx or preview-renderer.tsx
useEffect(() => {
  if (isSalonTemplate) {
    // Check if fonts already loaded
    if (!document.querySelector('link[href*="Playfair+Display"]')) {
      const link = document.createElement('link')
      link.href = 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Inter:wght@300;400;500;600&display=swap'
      link.rel = 'stylesheet'
      document.head.appendChild(link)
    }
  }
}, [isSalonTemplate])
```

### 4. Add Salon-Specific Layouts

For ServicesMenu (features section):
```typescript
// Detect if it's services and apply 3-column grid
if (props.features && section.id.includes('features')) {
  // Use 3-column grid like the template
  gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))'
}
```

## Expected Result

With these changes:
- ✅ Hero will have warm brown/gold gradient instead of blue
- ✅ Text will use Playfair Display for headings
- ✅ Background will be off-white (#FAF9F7) instead of pure white
- ✅ Buttons will be brown (#8B7355) instead of blue
- ✅ Overall warm, elegant salon aesthetic

## Next Steps

1. Implement these quick fixes for immediate visual improvement
2. Consider creating `SalonHeroRenderer`, `SalonServicesRenderer` etc. for better layout matching
3. Long-term: Use the pixel-perfect preview system to render actual template components