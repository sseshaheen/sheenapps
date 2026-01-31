/**
 * Converts design tokens from AI-generated templates to CSS variables
 * for use in the builder preview system
 */

interface DesignTokens {
  colors?: {
    primary?: string
    secondary?: string
    accent?: string
    background?: string
    text?: string
    [key: string]: string | undefined
  }
  fonts?: {
    heading?: string
    body?: string
    [key: string]: string | undefined
  }
  spacing?: {
    section?: string
    component?: string
    [key: string]: string | undefined
  }
  [key: string]: any
}

interface CSSVariables {
  [key: string]: string
}

/**
 * Converts color values to hex format for consistency
 * @param color - Color value in any format
 * @returns Hex color or safe fallback
 */
function normalizeColor(color: string): string {
  // Skip if already hex
  if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
    return color
  }
  
  // Reject CSS variables and Tailwind tokens
  if (color.includes('var(--') || color.includes('${')) {
    console.warn(`Invalid color token: ${color}, using fallback`)
    return '#000000'
  }
  
  // For now, return the color as-is if it looks like a valid CSS color
  // In production, you'd want to use a proper color conversion library
  if (color.startsWith('rgb') || color.startsWith('hsl') || /^#[0-9A-Fa-f]{3,8}$/.test(color)) {
    return color
  }
  
  // Fallback for invalid colors
  console.warn(`Invalid color format: ${color}, using fallback`)
  return '#000000'
}

/**
 * Normalizes font family with quotes and fallback
 * @param font - Font family string
 * @returns Properly formatted font family
 */
function normalizeFontFamily(font: string): string {
  // Remove existing quotes and trim
  const cleaned = font.replace(/['"]/g, '').trim()
  
  // Add quotes and fallback
  return `"${cleaned}", sans-serif`
}

/**
 * Maps design tokens to CSS variables following builder conventions
 * @param designTokens - Design tokens from AI-generated template
 * @returns Object of CSS variable names and values
 */
export function tokensToCSSVars(designTokens?: DesignTokens): CSSVariables {
  if (!designTokens) {
    return {}
  }

  const cssVars: CSSVariables = {}

  // Map color tokens
  if (designTokens.colors) {
    // Primary colors
    if (designTokens.colors.primary) {
      const normalized = normalizeColor(designTokens.colors.primary)
      cssVars['--primary-color'] = normalized
      cssVars['--primary'] = normalized
    }
    if (designTokens.colors.secondary) {
      const normalized = normalizeColor(designTokens.colors.secondary)
      cssVars['--secondary-color'] = normalized
      cssVars['--secondary'] = normalized
    }
    if (designTokens.colors.accent) {
      const normalized = normalizeColor(designTokens.colors.accent)
      cssVars['--accent-color'] = normalized
      cssVars['--accent'] = normalized
    }
    
    // Background and text
    if (designTokens.colors.background) {
      const normalized = normalizeColor(designTokens.colors.background)
      cssVars['--background-color'] = normalized
      cssVars['--bg-color'] = normalized
    }
    if (designTokens.colors.text) {
      const normalized = normalizeColor(designTokens.colors.text)
      cssVars['--text-color'] = normalized
      cssVars['--foreground'] = normalized
    }

    // Map any additional color tokens
    Object.entries(designTokens.colors).forEach(([key, value]) => {
      if (value && !['primary', 'secondary', 'accent', 'background', 'text'].includes(key)) {
        cssVars[`--color-${key}`] = normalizeColor(value)
      }
    })
  }

  // Map font tokens
  if (designTokens.fonts) {
    if (designTokens.fonts.heading) {
      const normalized = normalizeFontFamily(designTokens.fonts.heading)
      cssVars['--font-heading'] = normalized
      cssVars['--heading-font'] = normalized
    }
    if (designTokens.fonts.body) {
      const normalized = normalizeFontFamily(designTokens.fonts.body)
      cssVars['--font-body'] = normalized
      cssVars['--body-font'] = normalized
    }

    // Map any additional font tokens
    Object.entries(designTokens.fonts).forEach(([key, value]) => {
      if (value && !['heading', 'body'].includes(key)) {
        cssVars[`--font-${key}`] = normalizeFontFamily(value)
      }
    })
  }

  // Map spacing tokens
  if (designTokens.spacing) {
    if (designTokens.spacing.section) {
      cssVars['--section-spacing'] = designTokens.spacing.section
      cssVars['--spacing-section'] = designTokens.spacing.section
    }
    if (designTokens.spacing.component) {
      cssVars['--component-spacing'] = designTokens.spacing.component
      cssVars['--spacing-component'] = designTokens.spacing.component
    }

    // Map any additional spacing tokens
    Object.entries(designTokens.spacing).forEach(([key, value]) => {
      if (value && !['section', 'component'].includes(key)) {
        cssVars[`--spacing-${key}`] = value
      }
    })
  }

  // Map any other token categories
  Object.entries(designTokens).forEach(([category, tokens]) => {
    if (tokens && typeof tokens === 'object' && !['colors', 'fonts', 'spacing'].includes(category)) {
      Object.entries(tokens).forEach(([key, value]) => {
        if (typeof value === 'string') {
          cssVars[`--${category}-${key}`] = value
        }
      })
    }
  })

  return cssVars
}

/**
 * Applies CSS variables to a style object
 * @param designTokens - Design tokens from AI-generated template
 * @returns React style object with CSS variables
 */
export function getStyleWithTokens(designTokens?: DesignTokens): React.CSSProperties {
  const cssVars = tokensToCSSVars(designTokens)
  return cssVars as React.CSSProperties
}

/**
 * Generates a CSS string with variables for injection
 * @param designTokens - Design tokens from AI-generated template
 * @returns CSS string with :root variables
 */
export function generateCSSVariables(designTokens?: DesignTokens): string {
  const cssVars = tokensToCSSVars(designTokens)
  
  if (Object.keys(cssVars).length === 0) {
    return ''
  }

  const cssLines = Object.entries(cssVars).map(([key, value]) => {
    return `  ${key}: ${value};`
  })

  return `:root {\n${cssLines.join('\n')}\n}`
}