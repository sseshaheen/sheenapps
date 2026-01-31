export type PlanName = 'free' | 'lite'

export const PLAN_NAMES: PlanName[] = ['free', 'lite']

// Simplified plan limits for configuration (without database fields)
export interface PlanLimitsConfig {
  max_projects: number
  max_ai_operations_per_month: number
  max_exports_per_month: number
  max_storage_mb: number
  features: Record<string, boolean>
}

export interface PlanFeature {
  key: string
  value: string | number | boolean
  display?: string // Optional display override
}

export interface PricingPlan {
  id: PlanName
  name: string
  description: string
  popular?: boolean
  features: string[]
  limits: PlanLimitsConfig
  cta: {
    default: string
    upgrade: string
  }
}

// Plan limits and features configuration
export const PLAN_LIMITS: Record<PlanName, PlanLimitsConfig> = {
  free: {
    max_projects: 3,
    max_ai_operations_per_month: 450, // 15 minutes daily * 30 days
    max_exports_per_month: 5,
    max_storage_mb: 1024, // 1GB
    features: {
      basic_templates: true,
      email_support: false,
      community_access: true,
      basic_analytics: true,
      watermark: true,
      daily_bonus: true,
      welcome_gift: true,
      advisor_sessions: false,
    }
  },
  lite: {
    max_projects: 10,
    max_ai_operations_per_month: 110 + 450, // 110 base + 15 daily bonus * 30 days
    max_exports_per_month: 25,
    max_storage_mb: 5120, // 5GB
    features: {
      basic_templates: true,
      premium_templates: true,
      email_support: true,
      priority_email_support: true,
      community_access: true,
      basic_analytics: true,
      advanced_analytics: true,
      watermark: false,
      daily_bonus: true,
      advisor_sessions: true,
      rollover_minutes: true,
    }
  }
}

// Display features for each plan (used in pricing cards)
export const PLAN_FEATURES: Record<PlanName, string[]> = {
  free: [
    '15 minutes daily + welcome gift',
    '3 Projects',
    '5 Exports/month',
    '1GB Storage',
    'Basic Templates',
    'Community Support'
  ],
  lite: [
    '110 AI minutes/month',
    '15 bonus minutes daily',
    '10 Projects',
    '25 Exports/month',
    '5GB Storage',
    'Premium Templates',
    '2 Advisor Sessions',
    'Up to 220 minutes rollover',
    'Priority Email Support'
  ]
}

// Plan metadata for UI display
export const PLAN_METADATA: Record<PlanName, {
  name: string
  description: string
  popular?: boolean
  icon: string
  color: string
  badge?: string
}> = {
  free: {
    name: 'Free',
    description: 'Perfect for trying out SheenApps',
    icon: 'sparkles',
    color: 'from-gray-600 to-gray-700'
  },
  lite: {
    name: 'Lite',
    description: 'Best for individuals and small projects',
    popular: true,
    icon: 'zap',
    color: 'from-purple-600 to-pink-600',
    badge: 'Most Popular'
  }
}

// Helper functions
export function getPlanLimits(plan: PlanName): PlanLimitsConfig {
  return PLAN_LIMITS[plan]
}

export function getPlanFeatures(plan: PlanName): string[] {
  return PLAN_FEATURES[plan]
}

export function getPlanMetadata(plan: PlanName) {
  return PLAN_METADATA[plan]
}

export function formatLimit(value: number): string {
  if (value === -1) return 'Unlimited'
  return value.toString()
}

export function isPlanFeatureEnabled(plan: PlanName, feature: string): boolean {
  return PLAN_LIMITS[plan].features[feature] === true
}

export function getUpgradePath(currentPlan: PlanName): PlanName[] {
  const currentIndex = PLAN_NAMES.indexOf(currentPlan)
  return PLAN_NAMES.slice(currentIndex + 1)
}

// Comparison helper for pricing tables
export function comparePlans(plans: PlanName[]): {
  feature: string
  availability: Record<PlanName, boolean | string>
}[] {
  const allFeatures = new Set<string>()
  
  // Collect all unique features
  plans.forEach(plan => {
    Object.keys(PLAN_LIMITS[plan].features).forEach(feature => {
      allFeatures.add(feature)
    })
  })

  // Build comparison matrix
  return Array.from(allFeatures).map(feature => {
    const availability: Record<string, boolean | string> = {}
    plans.forEach(plan => {
      availability[plan] = PLAN_LIMITS[plan].features[feature as keyof typeof PLAN_LIMITS.free.features] || false
    })
    
    return {
      feature: feature.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      availability: availability as Record<PlanName, boolean | string>
    }
  })
}

// Usage tracking helper
export function getUsagePercentage(current: number, limit: number): number {
  if (limit === -1) return 0 // Unlimited
  return Math.min((current / limit) * 100, 100)
}

export function getRemainingUsage(current: number, limit: number): number {
  if (limit === -1) return -1 // Unlimited
  return Math.max(limit - current, 0)
}

export function isUsageLimitReached(current: number, limit: number): boolean {
  if (limit === -1) return false // Unlimited
  return current >= limit
}

// Plan upgrade messages
export const UPGRADE_MESSAGES = {
  projects: {
    title: 'Project Limit Reached',
    message: 'Upgrade your plan to create more projects.'
  },
  ai_generations: {
    title: 'AI Generation Limit Reached',
    message: 'You\'ve used all your AI generations for this month. Upgrade for more.'
  },
  exports: {
    title: 'Export Limit Reached',
    message: 'You\'ve reached your export limit. Upgrade for unlimited exports.'
  },
  storage: {
    title: 'Storage Limit Reached',
    message: 'You\'re out of storage space. Upgrade for more storage.'
  }
}