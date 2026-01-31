/**
 * Props Schema Type Definitions
 * Provides type safety and validation for AI-generated component props
 */

export type PropType = 'string' | 'number' | 'boolean' | 'array' | 'object'

export interface PropValidation {
  min?: number              // For numbers
  max?: number              // For numbers
  pattern?: string          // Regex for strings
  minLength?: number        // For strings/arrays
  maxLength?: number        // For strings/arrays
  customValidator?: string  // Zod schema string
}

export interface PropSchemaDefinition {
  type: PropType
  required: boolean
  default?: any
  enum?: any[]
  description?: string
  validation?: PropValidation
  
  // For arrays
  items?: PropSchemaDefinition
  
  // For objects
  properties?: Record<string, PropSchemaDefinition>
}

export interface ComponentPropsSchema {
  [propName: string]: PropSchemaDefinition
}

export interface ComponentWithSchema {
  propsSchema: Record<string, any>  // Actual props data
  schemaDefinition?: ComponentPropsSchema  // Schema definition (future)
}

export interface TemplateMetadata {
  components: Record<string, ComponentWithSchema>
  design_tokens?: {
    colors?: Record<string, string>
    fonts?: Record<string, string>
    spacing?: Record<string, string>
  }
  industry_tags?: string[]
  [key: string]: any
}

export interface GeneratedTemplate {
  name: string
  slug: string
  description: string
  version: string
  metadata: TemplateMetadata
  templateFiles?: Array<{
    path: string
    content: string
  }>
}

/**
 * Validation error structure
 */
export interface ValidationError {
  field: string
  error: string
  value?: any
}

export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
}

/**
 * Helper type for component prop values
 */
export type ComponentProps = Record<string, any>

/**
 * Section types supported by builder
 */
export type BuilderSectionType = 'hero' | 'features' | 'pricing' | 'testimonials' | 'cta' | 'footer'

/**
 * Mapping of AI component to builder section
 */
export interface ComponentMapping {
  aiComponentName: string
  builderSectionType: BuilderSectionType
  industry?: string
  priority?: number
}