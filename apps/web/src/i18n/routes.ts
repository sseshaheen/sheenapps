// Centralized route definitions for easy maintenance
// Future renames become one-liner changes

export const ROUTES = {
  // Auth routes
  AUTH_LOGIN: '/auth/login',
  AUTH_SIGNUP: '/auth/signup',
  
  // Dashboard routes
  BILLING: '/dashboard/billing',
  DASHBOARD: '/dashboard',
  
  // Builder routes
  BUILDER_NEW: '/builder/new',
  BUILDER_WORKSPACE: (projectId: string) => `/builder/workspace/${projectId}`,

  // Project routes
  PROJECT_RUN: (projectId: string) => `/project/${projectId}/run`,
  
  // Footer routes
  ADVISOR: '/advisor',
  ADVISOR_BROWSE: '/advisor/browse',
  BLOG: '/blog',
  CAREERS: '/careers',
  CONSULTATIONS: '/consultations',
  INTEGRATIONS: '/integrations',
  ABOUT: '/about',
  PRIVACY: '/privacy',
  TERMS: '/terms',
  HELP: '/help',
  
  // Anchor links
  HOW_IT_WORKS: '/#how-it-works',
  FEATURES: '/#features',
  PRICING: '/#pricing',
  
  // Dedicated pages
  PRICING_PAGE: '/pricing',
} as const

export type RouteKey = keyof typeof ROUTES
export type RoutePath = typeof ROUTES[RouteKey]