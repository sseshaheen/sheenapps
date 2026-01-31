# Preview System Data Flow Analysis

## Current State Analysis

### 1. Data Sources
- **Template Files** (`mock-service.ts`): Complete React components with hardcoded data
- **Section Props** (builder store): Extracted/generated content for sections
- **React Renderer Defaults**: Fallback data in renderer components
- **Component Source**: TSX code stored in sections for compilation

### 2. Preview Modes Data Sources

#### Edit Mode (70% Accuracy)
- Uses: React renderers (`section-renderers/*`)
- Data: Section props + React renderer defaults
- Issue: Shows default data when props are empty

#### Preview Mode (90% Accuracy)
- Uses: Iframe with static HTML generation
- Data: Section props ONLY
- Issue: Missing data if props don't contain everything (e.g., emoji icons)

#### Compiled Mode (100% Accuracy)
- Uses: Full template compilation with esbuild
- Data: Original template component files
- Issue: Only works if template files are available

### 3. Data Flow Problems

1. **Inconsistent Data Storage**
   - Template components have rich data (emojis, icons, etc.)
   - Section props may not capture all template data
   - No validation that props contain complete data

2. **Multiple Sources of Truth**
   - React renderers have defaults
   - Templates have component data
   - Section props have extracted data
   - No single authoritative source

3. **Conversion Issues**
   - Template → Section conversion may lose data
   - No standardized extraction process
   - Manual prop creation is error-prone

4. **Preview Inconsistency**
   - Different modes show different content
   - User confusion about what's "real" data
   - No clear accuracy guarantees

## Proposed Solution: Unified Data Model

### 1. Single Source of Truth
Create a comprehensive section data model that contains ALL rendering information:

```typescript
interface SectionData {
  // Core identity
  id: string
  type: 'hero' | 'features' | 'pricing' | 'testimonials' | 'cta' | 'footer'
  
  // Complete content data
  content: {
    props: Record<string, any>      // All data needed for rendering
    componentSource?: string        // Original TSX for compilation
    extractedData?: {              // Data extracted from component
      imports: string[]
      defaultProps: Record<string, any>
      dependencies: string[]
    }
  }
  
  // Styling
  styles: {
    css: string
    variables: Record<string, string>
    theme: {
      layoutVariant: 'default' | 'salon' | 'saas' | 'shop'
      fonts: string[]
      colors: Record<string, string>
    }
  }
  
  // Metadata
  metadata: {
    lastModified: number
    source: 'template' | 'ai' | 'user'
    accuracy: {
      hasCompleteData: boolean
      missingFields: string[]
      dataQuality: 'complete' | 'partial' | 'minimal'
    }
  }
}
```

### 2. Data Extraction Pipeline

1. **Template Import**: Extract ALL data from template components
2. **Prop Enrichment**: Ensure props contain complete rendering data
3. **Validation**: Check data completeness and quality
4. **Storage**: Save enriched data to store

### 3. Consistent Rendering

All preview modes should use the SAME data source:
- Edit Mode: Section props (no more renderer defaults)
- Preview Mode: Section props (complete data)
- Compiled Mode: Section props + component source

### 4. Implementation Plan

1. **Create Data Extractor Service**
   - Parse template components
   - Extract all hardcoded data
   - Merge with section props
   - Validate completeness

2. **Update Section Storage**
   - Enhance section model
   - Add data quality metadata
   - Store complete props

3. **Unify Renderers**
   - Remove hardcoded defaults
   - Use only section props
   - Add prop validation

4. **Add Data Migration**
   - Update existing sections
   - Enrich with missing data
   - Mark data quality

5. **Implement Validation**
   - Check prop completeness
   - Warn about missing data
   - Suggest enrichment

This approach ensures:
- ✅ Single source of truth
- ✅ Consistent rendering across modes
- ✅ Data quality visibility
- ✅ Backward compatibility
- ✅ Future extensibility