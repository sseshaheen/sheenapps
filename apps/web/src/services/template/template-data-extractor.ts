/**
 * Template Data Extractor Service
 * 
 * Extracts complete data from template components to ensure
 * consistent rendering across all preview modes.
 */

// Simplified version without AST parsing for now
// TODO: Add proper AST parsing with @babel/parser when available

export interface ExtractedData {
  props: Record<string, any>
  imports: string[]
  componentName: string
  dependencies: string[]
  hasCompleteData: boolean
  missingFields: string[]
}

export interface TemplateSection {
  type: string
  componentPath: string
  componentSource: string
  extractedData?: ExtractedData
}

export class TemplateDataExtractor {
  /**
   * Extract data from a template component file using regex
   */
  extractFromComponent(componentSource: string, componentType: string): ExtractedData {
    try {
      const result: ExtractedData = {
        props: {},
        imports: [],
        componentName: '',
        dependencies: [],
        hasCompleteData: false,
        missingFields: [],
      }

      // Extract imports using regex
      const importRegex = /import\s+(?:.*?\s+from\s+)?['"]([^'"]+)['"]/g
      let match
      while ((match = importRegex.exec(componentSource)) !== null) {
        result.imports.push(match[1])
      }

      // Extract component name
      const componentNameMatch = componentSource.match(/export\s+default\s+function\s+(\w+)/)
      if (componentNameMatch) {
        result.componentName = componentNameMatch[1]
      }

      // Extract hardcoded data arrays using regex
      const dataArrayRegex = /const\s+(\w+)\s*=\s*\[([\s\S]*?)\];/g
      while ((match = dataArrayRegex.exec(componentSource)) !== null) {
        const varName = match[1]
        const arrayContent = match[2]
        
        // Parse array content for objects
        const arrayData = this.parseArrayContent(arrayContent)
        
        // Map common variable names to prop names
        const propMapping: Record<string, string> = {
          'services': 'features',
          'features': 'features',
          'plans': 'plans',
          'testimonials': 'testimonials',
          'items': this.inferPropNameFromType(componentType),
        }
        
        const propName = propMapping[varName] || varName
        if (arrayData.length > 0) {
          result.props[propName] = arrayData
        }
      }

      // Extract section-specific default data
      const sectionDefaults = this.getSectionDefaults(componentType)
      result.props = { ...sectionDefaults, ...result.props }

      // Validate data completeness
      const validation = this.validateSectionData(componentType, result.props)
      result.hasCompleteData = validation.isComplete
      result.missingFields = validation.missingFields

      return result
    } catch (error) {
      console.error('Failed to extract component data:', error)
      return {
        props: this.getSectionDefaults(componentType),
        imports: [],
        componentName: '',
        dependencies: [],
        hasCompleteData: false,
        missingFields: ['Failed to parse component'],
      }
    }
  }

  /**
   * Parse array content from regex match
   */
  private parseArrayContent(arrayContent: string): any[] {
    const objects: any[] = []
    
    // Simple regex-based parsing for objects in array
    const objectRegex = /\{([^}]+)\}/g
    let match
    
    while ((match = objectRegex.exec(arrayContent)) !== null) {
      const objContent = match[1]
      const obj: Record<string, any> = {}
      
      // Extract key-value pairs
      const kvRegex = /(\w+):\s*['"]([^'"]*)['"]/g
      let kvMatch
      
      while ((kvMatch = kvRegex.exec(objContent)) !== null) {
        const key = kvMatch[1]
        const value = kvMatch[2]
        obj[key] = value
      }
      
      // Extract emoji icons (unquoted)
      const emojiRegex = /icon:\s*'([^']+)'/g
      const emojiMatch = emojiRegex.exec(objContent)
      if (emojiMatch) {
        obj.icon = emojiMatch[1]
      }
      
      if (Object.keys(obj).length > 0) {
        objects.push(obj)
      }
    }
    
    return objects
  }

  /**
   * Get default data for each section type
   */
  private getSectionDefaults(sectionType: string): Record<string, any> {
    const defaults: Record<string, Record<string, any>> = {
      hero: {
        title: '',
        subtitle: '',
        description: '',
        ctaText: 'Get Started',
      },
      features: {
        title: 'Features',
        subtitle: '',
        features: [],
      },
      pricing: {
        title: 'Pricing',
        subtitle: 'Choose your plan',
        plans: [],
      },
      testimonials: {
        title: 'Testimonials',
        subtitle: 'What our customers say',
        testimonials: [],
      },
      cta: {
        title: 'Ready to get started?',
        subtitle: '',
        ctaText: 'Get Started',
      },
      footer: {
        title: '',
        subtitle: '',
        copyright: `© ${new Date().getFullYear()} All rights reserved`,
        links: [],
      },
    }
    
    return defaults[sectionType] || {}
  }

  /**
   * Infer prop name from component type
   */
  private inferPropNameFromType(componentType: string): string {
    const mapping: Record<string, string> = {
      'features': 'features',
      'pricing': 'plans',
      'testimonials': 'testimonials',
      'services': 'features',
    }
    return mapping[componentType.toLowerCase()] || 'items'
  }

  /**
   * Validate section data completeness
   */
  private validateSectionData(
    sectionType: string,
    props: Record<string, any>
  ): { isComplete: boolean; missingFields: string[] } {
    const requiredFields: Record<string, string[]> = {
      hero: ['title'],
      features: ['features'],
      pricing: ['plans'],
      testimonials: ['testimonials'],
      cta: ['title', 'ctaText'],
      footer: ['title'],
    }
    
    const required = requiredFields[sectionType] || []
    const missingFields: string[] = []
    
    required.forEach(field => {
      if (!props[field] || (Array.isArray(props[field]) && props[field].length === 0)) {
        missingFields.push(field)
      }
    })
    
    // Additional validation for array items
    if (sectionType === 'features' && props.features?.length > 0) {
      const hasIcons = props.features.every((f: any) => f.icon)
      if (!hasIcons) {
        missingFields.push('feature.icon')
      }
    }
    
    return {
      isComplete: missingFields.length === 0,
      missingFields,
    }
  }

  /**
   * Merge template data with existing section props
   */
  mergeWithSectionProps(
    extractedData: ExtractedData,
    existingProps: Record<string, any>
  ): Record<string, any> {
    // Deep merge, preferring extracted data for arrays
    const merged: Record<string, any> = { ...existingProps }
    
    Object.entries(extractedData.props).forEach(([key, value]) => {
      if (Array.isArray(value) && value.length > 0) {
        // For arrays, prefer extracted data if it has content
        merged[key] = value
      } else if (value && typeof value === 'object') {
        // For objects, deep merge
        merged[key] = { ...(existingProps[key] || {}), ...value }
      } else if (value !== undefined && value !== '') {
        // For primitives, use extracted value if not empty
        merged[key] = value
      }
    })
    
    return merged
  }

  /**
   * Extract all section data from a template
   */
  async extractTemplateData(
    templateFiles: Array<{ path: string; content: string }>
  ): Promise<Map<string, ExtractedData>> {
    const sectionData = new Map<string, ExtractedData>()
    
    // Component file patterns
    const componentPatterns = [
      /components\/(\w+)\.(tsx|jsx)$/,
      /sections\/(\w+)\.(tsx|jsx)$/,
    ]
    
    for (const file of templateFiles) {
      for (const pattern of componentPatterns) {
        const match = file.path.match(pattern)
        if (match) {
          const componentName = match[1].toLowerCase()
          const sectionType = this.mapComponentToSectionType(componentName)
          
          if (sectionType) {
            const extracted = this.extractFromComponent(file.content, sectionType)
            sectionData.set(sectionType, extracted)
          }
        }
      }
    }
    
    return sectionData
  }

  /**
   * Map component names to section types
   */
  private mapComponentToSectionType(componentName: string): string | null {
    const mapping: Record<string, string> = {
      'hero': 'hero',
      'features': 'features',
      'servicesmenu': 'features',
      'services': 'features',
      'pricing': 'pricing',
      'pricingsection': 'pricing',
      'testimonials': 'testimonials',
      'cta': 'cta',
      'calltoaction': 'cta',
      'footer': 'footer',
    }
    
    return mapping[componentName.toLowerCase()] || null
  }
}

// Export singleton instance
export const templateDataExtractor = new TemplateDataExtractor()