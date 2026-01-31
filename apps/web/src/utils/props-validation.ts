/**
 * Props Validation Utility
 * Validates component props against their schema definitions
 */

import type { 
  PropSchemaDefinition, 
  ComponentPropsSchema, 
  ValidationResult, 
  ValidationError,
  ComponentProps 
} from '@/types/props-schema'

/**
 * Validate props against schema
 * @param props - The props to validate
 * @param schema - The schema definition
 * @returns Validation result with any errors
 */
export function validateProps(
  props: ComponentProps,
  schema: ComponentPropsSchema
): ValidationResult {
  const errors: ValidationError[] = []

  // Check each schema field
  for (const [fieldName, fieldSchema] of Object.entries(schema)) {
    const value = props[fieldName]
    const fieldErrors = validateField(fieldName, value, fieldSchema)
    errors.push(...fieldErrors)
  }

  // Check for extra fields not in schema
  for (const propName of Object.keys(props)) {
    if (!schema[propName]) {
      console.warn(`[Props Validation] Extra field not in schema: ${propName}`)
    }
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

/**
 * Validate a single field
 */
function validateField(
  fieldName: string,
  value: any,
  schema: PropSchemaDefinition
): ValidationError[] {
  const errors: ValidationError[] = []

  // Check required
  if (schema.required && (value === undefined || value === null)) {
    errors.push({
      field: fieldName,
      error: 'Required field is missing',
      value
    })
    return errors // Skip further validation
  }

  // Skip validation for optional empty fields
  if (!schema.required && (value === undefined || value === null)) {
    return errors
  }

  // Type validation
  const actualType = getActualType(value)
  if (actualType !== schema.type) {
    errors.push({
      field: fieldName,
      error: `Expected type '${schema.type}', got '${actualType}'`,
      value
    })
    return errors // Skip further validation on type mismatch
  }

  // Enum validation
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push({
      field: fieldName,
      error: `Value must be one of: ${schema.enum.join(', ')}`,
      value
    })
  }

  // Type-specific validation
  if (schema.validation) {
    const typeErrors = validateByType(fieldName, value, schema)
    errors.push(...typeErrors)
  }

  // Array items validation
  if (schema.type === 'array' && schema.items && Array.isArray(value)) {
    value.forEach((item, index) => {
      const itemErrors = validateField(
        `${fieldName}[${index}]`,
        item,
        schema.items
      )
      errors.push(...itemErrors)
    })
  }

  // Object properties validation
  if (schema.type === 'object' && schema.properties && typeof value === 'object') {
    const propErrors = validateProps(value, schema.properties)
    errors.push(...propErrors.errors.map(err => ({
      ...err,
      field: `${fieldName}.${err.field}`
    })))
  }

  return errors
}

/**
 * Get the actual type of a value
 */
function getActualType(value: any): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

/**
 * Type-specific validation
 */
function validateByType(
  fieldName: string,
  value: any,
  schema: PropSchemaDefinition
): ValidationError[] {
  const errors: ValidationError[] = []
  const validation = schema.validation

  if (!validation) return errors

  switch (schema.type) {
    case 'string':
      if (validation.minLength !== undefined && value.length < validation.minLength) {
        errors.push({
          field: fieldName,
          error: `Minimum length is ${validation.minLength}`,
          value
        })
      }
      if (validation.maxLength !== undefined && value.length > validation.maxLength) {
        errors.push({
          field: fieldName,
          error: `Maximum length is ${validation.maxLength}`,
          value
        })
      }
      if (validation.pattern) {
        try {
          const regex = new RegExp(validation.pattern)
          if (!regex.test(value)) {
            errors.push({
              field: fieldName,
              error: `Value does not match required pattern: ${validation.pattern}`,
              value
            })
          }
        } catch (e) {
          console.error(`Invalid regex pattern for field ${fieldName}:`, validation.pattern)
        }
      }
      break

    case 'number':
      if (validation.min !== undefined && value < validation.min) {
        errors.push({
          field: fieldName,
          error: `Minimum value is ${validation.min}`,
          value
        })
      }
      if (validation.max !== undefined && value > validation.max) {
        errors.push({
          field: fieldName,
          error: `Maximum value is ${validation.max}`,
          value
        })
      }
      break

    case 'array':
      if (validation.minLength !== undefined && value.length < validation.minLength) {
        errors.push({
          field: fieldName,
          error: `Minimum ${validation.minLength} items required`,
          value
        })
      }
      if (validation.maxLength !== undefined && value.length > validation.maxLength) {
        errors.push({
          field: fieldName,
          error: `Maximum ${validation.maxLength} items allowed`,
          value
        })
      }
      break
  }

  return errors
}

/**
 * Apply default values from schema to props
 */
export function applyDefaults(
  props: ComponentProps,
  schema: ComponentPropsSchema
): ComponentProps {
  const result = { ...props }

  for (const [fieldName, fieldSchema] of Object.entries(schema)) {
    if (
      fieldSchema.default !== undefined &&
      (result[fieldName] === undefined || result[fieldName] === null)
    ) {
      result[fieldName] = fieldSchema.default
    }
  }

  return result
}

/**
 * Generate a sample props object from schema
 * Useful for testing and documentation
 */
export function generateSampleProps(schema: ComponentPropsSchema): ComponentProps {
  const sample: ComponentProps = {}

  for (const [fieldName, fieldSchema] of Object.entries(schema)) {
    if (fieldSchema.default !== undefined) {
      sample[fieldName] = fieldSchema.default
    } else if (fieldSchema.enum && fieldSchema.enum.length > 0) {
      sample[fieldName] = fieldSchema.enum[0]
    } else {
      // Generate sample based on type
      switch (fieldSchema.type) {
        case 'string':
          sample[fieldName] = `Sample ${fieldName}`
          break
        case 'number':
          sample[fieldName] = fieldSchema.validation?.min || 0
          break
        case 'boolean':
          sample[fieldName] = false
          break
        case 'array':
          sample[fieldName] = []
          break
        case 'object':
          sample[fieldName] = fieldSchema.properties 
            ? generateSampleProps(fieldSchema.properties)
            : {}
          break
      }
    }
  }

  return sample
}

/**
 * Check if a value matches a schema type
 */
export function isValidType(value: any, type: string): boolean {
  const actualType = getActualType(value)
  return actualType === type
}