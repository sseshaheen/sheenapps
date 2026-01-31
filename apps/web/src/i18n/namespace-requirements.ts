/**
 * Namespace requirements for each page/route
 * This ensures we only load the translations each page actually needs
 */

export const NAMESPACE_REQUIREMENTS = {
  // Marketing pages
  home: ['navigation', 'hero', 'features', 'pricing', 'footer', 'workflow', 'success', 'techTeam'],
  
  // Dashboard pages
  dashboard: {
    index: ['dashboard', 'projects', 'common', 'toasts'],
    billing: ['pricing', 'dashboard', 'common', 'toasts'],
    layout: ['dashboard', 'navigation', 'userMenu', 'common']
  },
  
  // Auth pages
  auth: {
    login: ['auth', 'common', 'errors', 'toasts'],
    signup: ['auth', 'common', 'errors', 'toasts'],
    resendConfirmation: ['auth', 'common', 'toasts'],
    resetPassword: ['auth', 'common', 'errors', 'toasts']
  },
  
  // Builder pages
  builder: ['builder', 'projects', 'errors', 'common', 'toasts'],
  
  // Workspace pages
  workspace: ['workspace', 'projects', 'common', 'toasts', 'errors']
} as const

/**
 * Get required namespaces for a specific route
 */
export function getRequiredNamespaces(route: string): string[] {
  // Parse the route to determine which namespaces are needed
  if (route === '/' || route.includes('/home')) {
    return [...NAMESPACE_REQUIREMENTS.home]
  }
  
  if (route.includes('/dashboard/billing')) {
    return [...NAMESPACE_REQUIREMENTS.dashboard.billing]
  }
  
  if (route.includes('/dashboard')) {
    // Check if it's the layout or a specific page
    if (route.endsWith('layout')) {
      return [...NAMESPACE_REQUIREMENTS.dashboard.layout]
    }
    return [...NAMESPACE_REQUIREMENTS.dashboard.index]
  }
  
  if (route.includes('/auth/login')) {
    return [...NAMESPACE_REQUIREMENTS.auth.login]
  }
  
  if (route.includes('/auth/signup')) {
    return [...NAMESPACE_REQUIREMENTS.auth.signup]
  }
  
  if (route.includes('/auth/resend-confirmation')) {
    return [...NAMESPACE_REQUIREMENTS.auth.resendConfirmation]
  }
  
  if (route.includes('/auth/reset-password')) {
    return [...NAMESPACE_REQUIREMENTS.auth.resetPassword]
  }
  
  if (route.includes('/builder')) {
    return [...NAMESPACE_REQUIREMENTS.builder]
  }
  
  if (route.includes('/workspace')) {
    return [...NAMESPACE_REQUIREMENTS.workspace]
  }
  
  // Default fallback - load common namespaces
  return ['common', 'navigation', 'errors']
}

/**
 * Type-safe namespace keys
 */
export type NamespaceKey = 
  | 'auth'
  | 'builder' 
  | 'common'
  | 'dashboard'
  | 'errors'
  | 'features'
  | 'footer'
  | 'hero'
  | 'navigation'
  | 'pricing'
  | 'projects'
  | 'success'
  | 'techTeam'
  | 'toasts'
  | 'userMenu'
  | 'workflow'
  | 'workspace'