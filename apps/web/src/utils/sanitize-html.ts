/**
 * HTML Sanitization Utility
 * Uses DOMPurify to sanitize HTML content from AI-generated templates
 */

import DOMPurify from 'dompurify'

// Configure DOMPurify for our use case
const configureDOMPurify = () => {
  // Only run in browser environment
  if (typeof window === 'undefined') {
    return null
  }

  // Add hooks to handle special cases
  DOMPurify.addHook('uponSanitizeElement', (node, data) => {
    // Log potentially dangerous elements
    if (data.tagName === 'script' || data.tagName === 'style') {
      console.warn('[Sanitizer] Removed dangerous element:', data.tagName)
    }
  })

  // Add allowed attributes for our components
  DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
    // Allow data attributes for component props
    if (data.attrName && data.attrName.startsWith('data-')) {
      data.forceKeepAttr = true
    }
  })

  return DOMPurify
}

// Singleton instance
let purifier: typeof DOMPurify | null = null

/**
 * Sanitize HTML string
 * @param dirty - Potentially unsafe HTML
 * @param options - Additional options
 * @returns Sanitized HTML string
 */
export function sanitizeHTML(
  dirty: string,
  options?: {
    allowedTags?: string[]
    allowedAttributes?: string[]
    allowDataAttributes?: boolean
  }
): string {
  // Server-side: return empty string (no DOM)
  if (typeof window === 'undefined') {
    console.warn('[Sanitizer] Cannot sanitize on server, returning empty string')
    return ''
  }

  // Initialize purifier if needed
  if (!purifier) {
    purifier = configureDOMPurify()
  }

  if (!purifier) {
    console.error('[Sanitizer] DOMPurify not available')
    return ''
  }

  // Configure sanitization options
  const config: any = {
    ALLOWED_TAGS: options?.allowedTags || [
      // Text content
      'p', 'span', 'div', 'section', 'article', 'header', 'footer', 'main', 'aside',
      // Headings
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      // Lists
      'ul', 'ol', 'li',
      // Links and emphasis
      'a', 'strong', 'em', 'b', 'i', 'u',
      // Images and media
      'img', 'picture', 'source',
      // Forms (limited)
      'button', 'label',
      // Layout
      'br', 'hr',
      // Tables
      'table', 'thead', 'tbody', 'tr', 'th', 'td'
    ],
    ALLOWED_ATTR: options?.allowedAttributes || [
      // Global attributes
      'class', 'id', 'title', 'role', 'aria-label', 'aria-describedby',
      // Link attributes
      'href', 'target', 'rel',
      // Image attributes
      'src', 'alt', 'width', 'height', 'loading',
      // Button attributes
      'type', 'disabled',
      // Data attributes (if allowed)
      ...(options?.allowDataAttributes !== false ? ['data-*'] : [])
    ],
    // Security settings
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
    KEEP_CONTENT: true,
    FORCE_BODY: true,
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
    RETURN_DOM_IMPORT: false
  }

  try {
    const result = purifier.sanitize(dirty, config)
    // Handle TrustedHTML type (browser may return this)
    return typeof result === 'string' ? result : result.toString()
  } catch (error) {
    console.error('[Sanitizer] Sanitization failed:', error)
    return ''
  }
}

/**
 * Sanitize props object
 * Recursively sanitizes string values in props
 */
export function sanitizeProps(props: Record<string, any>): Record<string, any> {
  const sanitized: Record<string, any> = {}

  for (const [key, value] of Object.entries(props)) {
    // Skip dangerous prop names
    if (key.startsWith('on') || key === 'dangerouslySetInnerHTML') {
      console.warn(`[Sanitizer] Skipping dangerous prop: ${key}`)
      continue
    }

    // Sanitize based on type
    if (typeof value === 'string') {
      // Only sanitize if it looks like HTML
      if (value.includes('<') && value.includes('>')) {
        sanitized[key] = sanitizeHTML(value)
      } else {
        sanitized[key] = value
      }
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map(item => 
        typeof item === 'object' && item !== null ? sanitizeProps(item) : item
      )
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeProps(value)
    } else {
      sanitized[key] = value
    }
  }

  return sanitized
}

/**
 * Check if content needs sanitization
 */
export function needsSanitization(content: string): boolean {
  // Check for HTML-like content
  if (!content.includes('<') || !content.includes('>')) {
    return false
  }

  // Check for dangerous patterns
  const dangerousPatterns = [
    /<script/i,
    /<style/i,
    /<iframe/i,
    /javascript:/i,
    /on\w+\s*=/i, // Event handlers
    /<object/i,
    /<embed/i
  ]

  return dangerousPatterns.some(pattern => pattern.test(content))
}

/**
 * Strip all HTML tags
 * Useful for plain text extraction
 */
export function stripHTML(html: string): string {
  if (typeof window === 'undefined') {
    // Basic server-side stripping
    return html.replace(/<[^>]*>/g, '')
  }

  if (!purifier) {
    purifier = configureDOMPurify()
  }

  if (!purifier) {
    return html.replace(/<[^>]*>/g, '')
  }

  return purifier.sanitize(html, { ALLOWED_TAGS: [] })
}