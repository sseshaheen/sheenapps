/**
 * Project Recommendations Types
 * Data structures for the post-deployment recommendations feature
 */

export interface ProjectRecommendation {
  id: number
  title: string
  description: string
  category: 'ui/ux' | 'performance' | 'security' | 'features' | 'seo' | 'accessibility' | 'deployment' | 'development' | 'functionality' | 'testing'
  priority: 'high' | 'medium' | 'low'
  complexity: 'low' | 'medium' | 'high'
  impact: 'high' | 'medium' | 'low'
  versionHint: 'patch' | 'minor' | 'major'
  prompt: string
}

export interface ProjectRecommendationsResponse {
  projectId: string
  recommendations: ProjectRecommendation[]
  success: boolean
  error?: string
}

export interface ProjectRecommendationsApiResponse extends ProjectRecommendationsResponse {
  lastUpdated?: string
}

// Category configuration for UI display
export const RECOMMENDATION_CATEGORIES = {
  'ui/ux': {
    icon: '🎨',
    name: 'UI/UX',
    color: 'purple',
    description: 'Visual design and user experience improvements'
  },
  'performance': {
    icon: '⚡',
    name: 'Performance',
    color: 'blue',
    description: 'Speed and optimization enhancements'
  },
  'security': {
    icon: '🔒',
    name: 'Security',
    color: 'red',
    description: 'Security and privacy improvements'
  },
  'features': {
    icon: '✨',
    name: 'Features',
    color: 'green',
    description: 'New functionality and capabilities'
  },
  'seo': {
    icon: '🔍',
    name: 'SEO',
    color: 'yellow',
    description: 'Search engine optimization'
  },
  'accessibility': {
    icon: '♿',
    name: 'Accessibility',
    color: 'indigo',
    description: 'Accessibility and inclusive design'
  },
  'deployment': {
    icon: '🚀',
    name: 'Deployment',
    color: 'orange',
    description: 'Deployment and hosting improvements'
  },
  'development': {
    icon: '🛠️',
    name: 'Development',
    color: 'gray',
    description: 'Development tools and workflow'
  },
  'functionality': {
    icon: '⚙️',
    name: 'Functionality',
    color: 'cyan',
    description: 'Core functionality and features'
  },
  'testing': {
    icon: '🧪',
    name: 'Testing',
    color: 'teal',
    description: 'Testing and quality assurance'
  }
} as const

// Priority configuration for UI display
export const RECOMMENDATION_PRIORITIES = {
  'high': {
    color: 'red',
    label: 'High Priority',
    description: 'Should be implemented soon'
  },
  'medium': {
    color: 'yellow', 
    label: 'Medium Priority',
    description: 'Can be planned for future iterations'
  },
  'low': {
    color: 'green',
    label: 'Low Priority', 
    description: 'Nice to have enhancement'
  }
} as const

// Complexity configuration for UI display
export const RECOMMENDATION_COMPLEXITY = {
  'low': {
    dots: 1,
    label: 'Easy',
    description: 'Quick implementation',
    estimatedTime: '1-2 hours'
  },
  'medium': {
    dots: 2,
    label: 'Moderate',
    description: 'Moderate effort required',
    estimatedTime: 'Half day'
  },
  'high': {
    dots: 3,
    label: 'Complex',
    description: 'Significant implementation',
    estimatedTime: '1-2 days'
  }
} as const

// Impact configuration for UI display
export const RECOMMENDATION_IMPACT = {
  'high': {
    color: 'purple',
    label: 'High Impact',
    description: 'Significant improvement to user experience'
  },
  'medium': {
    color: 'blue',
    label: 'Medium Impact',
    description: 'Noticeable improvement'
  },
  'low': {
    color: 'gray',
    label: 'Low Impact',
    description: 'Minor enhancement'
  }
} as const

export type RecommendationCategory = keyof typeof RECOMMENDATION_CATEGORIES
export type RecommendationPriority = keyof typeof RECOMMENDATION_PRIORITIES  
export type RecommendationComplexity = keyof typeof RECOMMENDATION_COMPLEXITY
export type RecommendationImpact = keyof typeof RECOMMENDATION_IMPACT