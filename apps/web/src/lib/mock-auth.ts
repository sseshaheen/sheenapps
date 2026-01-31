/**
 * Mock Authentication System
 * Hardcoded credentials for testing the authenticated experience
 */

import type { User, SessionLimits } from '@/types/auth'

// Mock user data that extends the unified User type
interface MockUserData {
  password: string
  plan: 'free' | 'starter' | 'growth' | 'scale'
  usage: {
    builderGenerations: number
    maxGenerations: number
    advisorMinutes: number
    maxAdvisorMinutes: number
    features: number
    maxFeatures: number
  }
}

// Mock user credentials and data
const MOCK_USER_DATA: Record<string, MockUserData> = {
  'demo@sheenapps.com': {
    password: 'demo123',
    plan: 'free',
    usage: {
      builderGenerations: 1,
      maxGenerations: 10,
      advisorMinutes: 15,
      maxAdvisorMinutes: 60,
      features: 1,
      maxFeatures: 2
    }
  },
  'pro@sheenapps.com': {
    password: 'pro123',
    plan: 'starter',
    usage: {
      builderGenerations: 5,
      maxGenerations: 100,
      advisorMinutes: 45,
      maxAdvisorMinutes: 300,
      features: 3,
      maxFeatures: 10
    }
  }
}

// Create User objects for authenticated users
function createMockUser(email: string, data: MockUserData): User {
  const baseUser = {
    id: `user_${data.plan}_${Date.now()}`,
    email,
    name: email.split('@')[0],
    plan: data.plan as User['plan'],
    avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${email}`,
    usage: {
      generationsUsed: data.usage.builderGenerations,
      chatMessagesUsed: data.usage.advisorMinutes,
      projectsCreated: data.usage.features
    },
    projects: [`project_${data.plan}_001`] as string[],
    
    // Required Supabase User fields (mock values)
    aud: 'authenticated',
    role: 'authenticated',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    email_confirmed_at: new Date().toISOString(),
    phone_confirmed_at: null,
    confirmation_sent_at: null,
    confirmed_at: new Date().toISOString(),
    recovery_sent_at: null,
    new_email: null,
    new_phone: null,
    invited_at: null,
    action_link: null,
    email_change_sent_at: null,
    phone_change_sent_at: null,
    phone_change_token: null,
    email_change_token_new: null,
    email_change_token_current: null,
    phone_change_token_new: null,
    phone_change_token_current: null,
    email_change_confirm_status: 0,
    phone_change_confirm_status: 0,
    banned_until: null,
    deleted_at: null,
    is_sso_user: false,
    app_metadata: {},
    user_metadata: {},
    identities: [],
    factors: []
  }
  
  return baseUser as unknown as User
}

// Default guest session limits
export const GUEST_LIMITS: SessionLimits = {
  maxGenerations: 3,
  maxChatMessages: 10,
  maxProjects: 1,
  canExport: false,
  canShare: false,
  canSaveProjects: false
}

// Re-export from unified auth types
export { getSessionLimits } from '@/types/auth'

// Mock authentication functions
export class MockAuth {
  private static STORAGE_KEY = 'sheenapps_mock_user'
  
  static async login(email: string, password: string): Promise<User | null> {
    const userData = MOCK_USER_DATA[email]
    
    if (userData && userData.password === password) {
      const user = createMockUser(email, userData)
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(user))
      return user
    }
    
    return null
  }
  
  static async logout(): Promise<void> {
    localStorage.removeItem(this.STORAGE_KEY)
  }
  
  static getCurrentUser(): User | null {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY)
      return stored ? JSON.parse(stored) : null
    } catch {
      return null
    }
  }
  
  static updateUserUsage(user: User, updates: Partial<{ generationsUsed: number; chatMessagesUsed: number; projectsCreated: number }>): User {
    const updatedUser = {
      ...user,
      usage: { ...user.usage, ...updates }
    }
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(updatedUser))
    return updatedUser
  }
  
  // Check if user can perform action based on usage
  static canPerformAction(user: User | null, action: 'generate' | 'chat' | 'export' | 'share'): boolean {
    // const { getSessionLimits } = require('@/types/auth')
    
    if (!user) {
      // Guest limits
      return action === 'generate' || action === 'chat'
    }
    
    // const limits = getSessionLimits(user)
    const limits = { maxGenerations: -1, maxChats: -1, maxExports: -1, maxShares: -1, maxChatMessages: -1, canExport: true, canShare: true }
    
    switch (action) {
      case 'generate':
        return limits.maxGenerations === -1 || limits.maxGenerations > 0
      case 'chat':
        return limits.maxChatMessages === -1 || limits.maxChatMessages > 0
      case 'export':
        return limits.canExport
      case 'share':
        return limits.canShare
      default:
        return false
    }
  }
  
  // Get upgrade message for blocked action
  static getUpgradeMessage(user: User | null, action: string): string {
    if (!user) {
      return `Sign up to unlock ${action} and save your projects!`
    }
    
    switch (user.plan) {
      case 'free':
        return `Upgrade to Starter ($9/month) to ${action} and more features!`
      case 'starter':
        return `Upgrade to Growth ($29/month) for unlimited ${action} and advanced features!`
      default:
        return `You've reached your monthly limit. Upgrade for unlimited access!`
    }
  }
}

// Plan configuration matching the homepage pricing
export const PLAN_CONFIG = {
  free: {
    name: 'Free',
    price: 0,
    features: [
      '60-second business builder',
      '1 advisor hour/month', 
      '2 feature additions',
      'Community support',
      'Basic analytics',
      'sheenapps.com subdomain'
    ],
    limits: {
      generations: 10,
      advisorMinutes: 60,
      features: 2,
      projects: 3
    }
  },
  starter: {
    name: 'Starter',
    price: 19,
    features: [
      'Everything in Free',
      '3 advisor hours/month',
      '5 feature additions', 
      'Email support',
      'SSL certificate',
      'Basic templates'
    ],
    limits: {
      generations: 50,
      advisorMinutes: 180,
      features: 5,
      projects: 10
    }
  },
  growth: {
    name: 'Growth',
    price: 49,
    popular: true,
    features: [
      'Everything in Starter',
      '10 advisor hours/month',
      '50 features/month',
      'Priority support',
      'Custom domain included',
      'Advanced analytics',
      'A/B testing',
      'API access'
    ],
    limits: {
      generations: 200,
      advisorMinutes: 600,
      features: 50,
      projects: 50
    }
  },
  scale: {
    name: 'Scale',
    price: 149,
    features: [
      'Everything in Growth',
      'Dedicated advisor',
      'Unlimited features',
      'Same-day deployment',
      'White-glove onboarding',
      'Custom integrations',
      'SLA guarantee',
      'Weekly strategy calls'
    ],
    limits: {
      generations: -1,
      advisorMinutes: -1,
      features: -1,
      projects: -1
    }
  }
} as const