/**
 * Scoped Template Theme Loader
 * SAFE: Only affects containers with [data-template] attribute
 * NEVER touches global styles or documentElement
 */

export interface TemplateTheme {
  id: string
  name: string
  accent: string      // HSL format: "24 95% 53%"
  surface?: string    // Optional surface override
  description?: string
}

export const TEMPLATE_THEMES: Record<string, TemplateTheme> = {
  modern: {
    id: 'modern',
    name: 'Modern',
    accent: '24 95% 53%',  // Orange
    description: 'Bold and contemporary with vibrant accents'
  },
  classic: {
    id: 'classic', 
    name: 'Classic',
    accent: '202 88% 45%', // Blue
    description: 'Timeless and professional'
  },
  elegant: {
    id: 'elegant',
    name: 'Elegant', 
    accent: '271 81% 56%', // Purple
    description: 'Sophisticated and refined'
  },
  salon: {
    id: 'salon',
    name: 'Salon',
    accent: '30 25% 55%',     // Warm brown (#8B7355)
    surface: '42 27% 97%',    // Warm white (#FAF9F7)
    description: 'Warm and inviting for service businesses'
  },
  saas: {
    id: 'saas',
    name: 'SaaS',
    accent: '231 48% 48%',    // Indigo (#4f46e5)
    description: 'Clean and technical for software products'
  },
  default: {
    id: 'default',
    name: 'Default',
    accent: '222 47% 11%',    // Uses system accent
    description: 'Clean and minimal design'
  }
}

/**
 * Apply template theme to a specific container only
 * NEVER modifies global styles or documentElement
 * Idempotent and resilient to rapid switches
 */
export function applyTemplateTheme(
  container: HTMLElement, 
  themeId: string
): void {
  // Safety: Check if container still exists and is mounted
  if (!container || !container.isConnected) {
    console.warn('⚠️ Attempted to apply theme to unmounted container')
    return
  }
  
  // Idempotent: Skip if already applied
  if (container.getAttribute('data-template') === themeId) {
    return
  }
  
  // Remove any existing template attribute
  container.removeAttribute('data-template')
  
  // Apply new template scope
  if (themeId && TEMPLATE_THEMES[themeId]) {
    container.setAttribute('data-template', themeId)
    
    // Optional: Override specific variables dynamically
    const theme = TEMPLATE_THEMES[themeId]
    if (theme.surface) {
      container.style.setProperty('--tpl-surface', theme.surface)
    }
    
    console.log(`✅ Applied template theme: ${themeId}`, { container, theme })
  }
}

/**
 * Remove template theme from container
 */
export function clearTemplateTheme(container: HTMLElement): void {
  if (!container || !container.isConnected) {
    return
  }
  
  container.removeAttribute('data-template')
  // Clear any inline variable overrides
  container.style.removeProperty('--tpl-surface')
  container.style.removeProperty('--tpl-accent')
  
  console.log('🧹 Cleared template theme from container')
}

/**
 * Get current template theme applied to container
 */
export function getCurrentTemplateTheme(container: HTMLElement): string | null {
  if (!container || !container.isConnected) {
    return null
  }
  return container.getAttribute('data-template')
}

/**
 * Detect template family from template data
 * ALWAYS returns a valid key
 */
export function detectTemplateFamily(templateData: any): string {
  const slug = templateData?.slug || ''
  const tags = templateData?.metadata?.industry_tags || []
  
  // Check slug patterns
  if (slug.includes('salon') || tags.includes('services')) return 'salon'
  if (slug.includes('saas') || tags.includes('software')) return 'saas'
  if (slug.includes('ecommerce') || tags.includes('retail')) return 'modern'
  
  // ALWAYS return valid key
  return 'default'
}

/**
 * Font configurations
 */
const FONT_CONFIGS = {
  salon: {
    preconnect: ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'],
    href: 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Inter:wght@300;400;500;600&display=swap'
  },
  saas: {
    preconnect: ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'],
    href: 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap'
  }
}

/**
 * Load template fonts with idempotence
 */
export function loadTemplateFonts(family: string): void {
  const config = FONT_CONFIGS[family as keyof typeof FONT_CONFIGS]
  if (!config) return
  
  // Add preconnect links
  config.preconnect.forEach(url => {
    if (!document.querySelector(`link[rel="preconnect"][href="${url}"]`)) {
      const link = document.createElement('link')
      link.rel = 'preconnect'
      link.href = url
      if (url.includes('gstatic')) {
        link.crossOrigin = 'anonymous'
      }
      document.head.appendChild(link)
    }
  })
  
  // Add stylesheet (check by data attribute to handle hot reloads)
  if (!document.querySelector(`link[data-template-fonts="${family}"]`)) {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = config.href
    link.dataset.templateFonts = family
    document.head.appendChild(link)
  }
}

/**
 * Get all available template themes for UI selection
 */
export function getAllTemplateThemes(): TemplateTheme[] {
  return Object.values(TEMPLATE_THEMES)
}

/**
 * Theme telemetry
 */
export interface ThemeApplicationEvent {
  templateFamily: string
  detected: boolean
  themeApplied: boolean
  renderersUpdated: number
  timestamp: number
}

export function logThemeApplication(event: ThemeApplicationEvent): void {
  // Log to console in dev
  if (process.env.NODE_ENV === 'development') {
    console.log('🎨 Theme Application:', {
      ...event,
      success: event.detected && event.themeApplied
    })
  }
  
  // Send to analytics if available
  if (typeof window !== 'undefined' && (window as any).analytics?.track) {
    (window as any).analytics.track('theme_applied', event)
  }
}