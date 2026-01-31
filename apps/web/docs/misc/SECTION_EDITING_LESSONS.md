# Section Editing Implementation Lessons

## Key Issues Solved

### 1. CSS Specificity Problem
**Issue**: Inline styles weren't visible despite being injected correctly
**Root Cause**: Additional CSS was being injected after inline styles, overriding them
**Solution**: Skip CSS injection when using inline styles for color changes

### 2. Element Selector Failure
**Issue**: `querySelector` couldn't find `.hero-section` elements in iframe
**Root Cause**: DOM structure differed from expectations - sections had empty class names
**Solution**: Use data attributes + resilient selectors: `[data-section-type="hero"], .hero-section`

### 3. Multi-Section Impact
**Issue**: Changes applied to multiple sections instead of target section
**Solution**: More precise selectors with negation and data attributes

### 4. Wrong Section Type Generation ⚠️ CRITICAL
**Issue**: Features section edit generated header HTML instead of features
**Root Cause**: `getBaseComponentForSection` missing features component, defaulted to header
**Solution**: Add all section types + dynamic fallback that preserves section type

## Technical Implementation

### CSS Override Strategy
- Use inline styles for color changes (highest specificity)
- Detect color modifications and skip CSS injection
- Inline styles: `style="property: value !important;"`

### Robust Selectors
```typescript
// Primary: data attributes, Fallback: class names
hero: '[data-section-type="hero"], .hero-section'
features: '[data-section-type="features"], .features-section, .features, .services-section'
```

### Section Component Completeness
```typescript
// CRITICAL: Always provide base components for ALL section types
const baseComponents = { header, hero, features, testimonials, pricing, ... }
// Fallback that preserves section type instead of defaulting to header
return baseComponents[sectionType] || dynamicFallback(sectionType)
```

### Debug Strategy
- Add extensive logging in iframe JavaScript
- Track element counts found by selectors
- Monitor CSS injection vs inline style conflicts

## Key Learnings

1. **CSS Specificity**: Inline styles > CSS classes, but additional CSS can still override
2. **Iframe DOM**: Don't assume class names persist - use structural selectors
3. **Debug Early**: Add logging to both parent and iframe contexts
4. **Selector Resilience**: Use multiple fallback selectors with exclusions