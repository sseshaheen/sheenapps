// Engagement Engine for gamification and user motivation

import type { EngagementAction, UserBehavior } from '@/types/question-flow'

export interface Milestone {
  id: string
  title: string
  description: string
  requiredScore: number
  icon: string
  unlocks?: string[]
  celebration: CelebrationConfig
  category: 'progress' | 'exploration' | 'mastery' | 'social'
  rarity: 'common' | 'rare' | 'epic' | 'legendary'
}

export interface Achievement {
  id: string
  title: string
  description: string
  icon: string
  unlockedAt: Date
  rarity: 'common' | 'rare' | 'epic' | 'legendary'
  category: string
}

export interface CelebrationConfig {
  type: 'confetti' | 'pulse_glow' | 'feature_showcase' | 'badge_unlock' | 'level_up'
  duration: number
  message: string
  sound?: string
  particles?: {
    count: number
    colors: string[]
    shapes: string[]
  }
}

export interface EngagementMetrics {
  totalScore: number
  level: number
  currentLevelProgress: number
  nextLevelThreshold: number
  streak: number
  totalTime: number
  questionsAnswered: number
  featuresDiscovered: number
  milestonesCompleted: number
  achievements: Achievement[]
}

export class EngagementEngine {
  private score: number = 0
  private level: number = 1
  private streak: number = 0
  private milestones: Milestone[] = []
  private achievements: Achievement[] = []
  private sessionStartTime: number = Date.now()
  private lastActionTime: number = Date.now()
  private callbacks: Map<string, (data: unknown) => void> = new Map()

  constructor() {
    this.initializeMilestones()
  }

  // Track user engagement actions
  trackAction(action: EngagementAction): EngagementMetrics {
    const points = this.calculatePoints(action)
    const previousLevel = this.level
    
    this.score += points
    this.updateLevel()
    this.updateStreak(action)
    
    // Check for milestone completion
    const newMilestones = this.checkMilestones()
    
    // Check for achievements
    const newAchievements = this.checkAchievements(action)
    
    // Trigger celebrations
    if (points > 0) {
      this.triggerMicroCelebration(action, points)
    }
    
    // Level up celebration
    if (this.level > previousLevel) {
      this.triggerLevelUpCelebration(this.level)
    }
    
    // Milestone celebrations
    newMilestones.forEach(milestone => {
      this.triggerMilestoneCelebration(milestone)
    })
    
    // Achievement celebrations
    newAchievements.forEach(achievement => {
      this.triggerAchievementCelebration(achievement)
    })
    
    this.lastActionTime = Date.now()
    
    return this.getMetrics()
  }

  private calculatePoints(action: EngagementAction): number {
    const basePoints: Record<string, number> = {
      'answer_question': 10,
      'preview_interaction': 5,
      'feature_discovery': 15,
      'template_selection': 8,
      'design_customization': 12,
      'export_attempt': 25,
      'share_project': 20,
      'return_session': 30
    }
    
    let points = basePoints[action.type] || 0
    
    // Bonus multipliers
    points *= this.getMultiplier(action)
    
    // Streak bonus
    if (this.streak > 5) {
      points *= 1.2
    }
    
    // Speed bonus (for quick answers)
    if (action.duration && action.duration < 30000) { // Under 30 seconds
      points *= 1.1
    }
    
    return Math.round(points)
  }

  private getMultiplier(action: EngagementAction): number {
    // First-time bonuses
    if (action.type === 'answer_question' && this.score === 0) {
      return 2.0 // Double points for first question
    }
    
    // Combo multipliers
    if (action.type === 'preview_interaction' && this.hasRecentAction('answer_question', 5000)) {
      return 1.5 // Bonus for engaging with preview after answering
    }
    
    // Discovery bonuses
    if (action.type === 'feature_discovery') {
      return 1.3
    }
    
    return 1.0
  }

  private hasRecentAction(actionType: string, timeWindow: number): boolean {
    // In a real implementation, you'd track recent actions
    // For now, return false
    return false
  }

  private updateLevel(): void {
    const newLevel = this.calculateLevel(this.score)
    if (newLevel > this.level) {
      this.level = newLevel
    }
  }

  private calculateLevel(score: number): number {
    // Progressive level requirements: 100, 250, 500, 1000, 2000, etc.
    const levels = [0, 100, 250, 500, 1000, 2000, 3500, 5500, 8000, 12000, 17000]
    
    for (let i = levels.length - 1; i >= 0; i--) {
      if (score >= levels[i]) {
        return i + 1
      }
    }
    
    return 1
  }

  private updateStreak(action: EngagementAction): void {
    const timeSinceLastAction = Date.now() - this.lastActionTime
    
    // Break streak if more than 5 minutes between actions
    if (timeSinceLastAction > 300000) {
      this.streak = 0
    }
    
    // Only certain actions contribute to streak
    if (['answer_question', 'preview_interaction', 'design_customization'].includes(action.type)) {
      this.streak++
    }
  }

  // Milestone system
  private checkMilestones(): Milestone[] {
    const newMilestones = ENGAGEMENT_MILESTONES.filter(milestone => 
      !this.milestones.find(m => m.id === milestone.id) && 
      this.score >= milestone.requiredScore
    )
    
    newMilestones.forEach(milestone => {
      this.unlockMilestone(milestone)
    })
    
    return newMilestones
  }

  private unlockMilestone(milestone: Milestone): void {
    this.milestones.push(milestone)
    
    // Unlock new features/content
    if (milestone.unlocks) {
      this.unlockFeatures(milestone.unlocks)
    }
    
    this.triggerCallback('milestone_unlocked', milestone)
  }

  private checkAchievements(action: EngagementAction): Achievement[] {
    const newAchievements: Achievement[] = []
    
    // Dynamic achievement checking
    const potentialAchievements = this.generateContextualAchievements(action)
    
    potentialAchievements.forEach(achievement => {
      if (!this.achievements.find(a => a.id === achievement.id)) {
        this.achievements.push({
          ...achievement,
          unlockedAt: new Date()
        })
        newAchievements.push(achievement)
      }
    })
    
    return newAchievements
  }

  private generateContextualAchievements(action: EngagementAction): Achievement[] {
    const achievements: Achievement[] = []
    
    // Streak achievements
    if (this.streak === 5) {
      achievements.push({
        id: 'streak_5',
        title: 'On a Roll',
        description: 'Complete 5 actions in a row',
        icon: '🔥',
        unlockedAt: new Date(),
        rarity: 'common',
        category: 'engagement'
      })
    }
    
    if (this.streak === 10) {
      achievements.push({
        id: 'streak_10',
        title: 'Unstoppable',
        description: 'Complete 10 actions in a row',
        icon: '⚡',
        unlockedAt: new Date(),
        rarity: 'rare',
        category: 'engagement'
      })
    }
    
    // Speed achievements
    if (action.duration && action.duration < 15000) {
      achievements.push({
        id: 'speed_demon',
        title: 'Speed Demon',
        description: 'Answer a question in under 15 seconds',
        icon: '💨',
        unlockedAt: new Date(),
        rarity: 'rare',
        category: 'speed'
      })
    }
    
    // Exploration achievements
    if (action.type === 'preview_interaction') {
      achievements.push({
        id: 'preview_explorer',
        title: 'Preview Explorer',
        description: 'Interact with the live preview',
        icon: '👁️',
        unlockedAt: new Date(),
        rarity: 'common',
        category: 'exploration'
      })
    }
    
    return achievements
  }

  // Celebration triggers
  private triggerMicroCelebration(action: EngagementAction, points: number): void {
    this.triggerCallback('micro_celebration', {
      type: 'points',
      points,
      action: action.type,
      message: `+${points} points!`
    })
  }

  private triggerLevelUpCelebration(newLevel: number): void {
    this.triggerCallback('level_up', {
      level: newLevel,
      celebration: {
        type: 'level_up',
        duration: 3000,
        message: `Level ${newLevel} Unlocked!`,
        particles: {
          count: 50,
          colors: ['#6366f1', '#8b5cf6', '#ec4899'],
          shapes: ['star', 'circle']
        }
      }
    })
  }

  private triggerMilestoneCelebration(milestone: Milestone): void {
    this.triggerCallback('milestone_celebration', {
      milestone,
      celebration: milestone.celebration
    })
  }

  private triggerAchievementCelebration(achievement: Achievement): void {
    this.triggerCallback('achievement_unlocked', {
      achievement,
      celebration: {
        type: 'badge_unlock',
        duration: 2000,
        message: `Achievement Unlocked: ${achievement.title}!`
      }
    })
  }

  private unlockFeatures(features: string[]): void {
    this.triggerCallback('features_unlocked', { features })
  }

  private triggerCallback(event: string, data: unknown): void {
    const callback = this.callbacks.get(event)
    if (callback) {
      callback(data)
    }
  }

  // Public methods
  getMetrics(): EngagementMetrics {
    const nextLevelThreshold = this.getNextLevelThreshold()
    const currentLevelStart = this.getCurrentLevelStart()
    
    return {
      totalScore: this.score,
      level: this.level,
      currentLevelProgress: ((this.score - currentLevelStart) / (nextLevelThreshold - currentLevelStart)) * 100,
      nextLevelThreshold,
      streak: this.streak,
      totalTime: Date.now() - this.sessionStartTime,
      questionsAnswered: this.achievements.filter(a => a.category === 'questions').length,
      featuresDiscovered: this.achievements.filter(a => a.category === 'exploration').length,
      milestonesCompleted: this.milestones.length,
      achievements: this.achievements
    }
  }

  private getNextLevelThreshold(): number {
    const levels = [0, 100, 250, 500, 1000, 2000, 3500, 5500, 8000, 12000, 17000]
    return levels[this.level] || levels[levels.length - 1] * 2
  }

  private getCurrentLevelStart(): number {
    const levels = [0, 100, 250, 500, 1000, 2000, 3500, 5500, 8000, 12000, 17000]
    return levels[this.level - 1] || 0
  }

  addEventListener(event: string, callback: (data: unknown) => void): void {
    this.callbacks.set(event, callback)
  }

  removeEventListener(event: string): void {
    this.callbacks.delete(event)
  }

  private initializeMilestones(): void {
    // Milestones are defined separately for better maintainability
  }

  // Analytics and insights
  getEngagementInsights(): {
    engagementLevel: 'low' | 'medium' | 'high'
    recommendations: string[]
    strongPoints: string[]
    improvementAreas: string[]
  } {
    const metrics = this.getMetrics()
    const sessionDuration = metrics.totalTime / 1000 / 60 // minutes
    
    let engagementLevel: 'low' | 'medium' | 'high' = 'medium'
    
    if (metrics.totalScore > 200 && sessionDuration > 10) {
      engagementLevel = 'high'
    } else if (metrics.totalScore < 50 || sessionDuration < 3) {
      engagementLevel = 'low'
    }
    
    const recommendations: string[] = []
    const strongPoints: string[] = []
    const improvementAreas: string[] = []
    
    // Analyze patterns
    if (metrics.streak > 5) {
      strongPoints.push('Consistent engagement pattern')
    } else {
      improvementAreas.push('Building consistent engagement')
      recommendations.push('Try to maintain momentum between questions')
    }
    
    if (metrics.featuresDiscovered > 3) {
      strongPoints.push('Active feature exploration')
    } else {
      recommendations.push('Explore preview interactions for bonus points')
    }
    
    return {
      engagementLevel,
      recommendations,
      strongPoints,
      improvementAreas
    }
  }
}

// Milestone definitions
export const ENGAGEMENT_MILESTONES: Milestone[] = [
  {
    id: 'first_steps',
    title: 'Getting Started',
    description: 'Answer your first 3 questions',
    requiredScore: 30,
    icon: '🎯',
    unlocks: ['design_customization'],
    category: 'progress',
    rarity: 'common',
    celebration: {
      type: 'confetti',
      duration: 2000,
      message: 'Great start! Your business is taking shape.',
      particles: {
        count: 30,
        colors: ['#6366f1', '#8b5cf6'],
        shapes: ['circle', 'square']
      }
    }
  },
  {
    id: 'design_explorer',
    title: 'Design Explorer',
    description: 'Customize visual elements',
    requiredScore: 75,
    icon: '🎨',
    unlocks: ['advanced_templates', 'color_customization'],
    category: 'exploration',
    rarity: 'rare',
    celebration: {
      type: 'pulse_glow',
      duration: 1500,
      message: 'You have great design sense!'
    }
  },
  {
    id: 'feature_architect',
    title: 'Feature Architect',
    description: 'Add 5 core features',
    requiredScore: 150,
    icon: '⚡',
    unlocks: ['integration_options', 'advanced_features'],
    category: 'mastery',
    rarity: 'epic',
    celebration: {
      type: 'feature_showcase',
      duration: 3000,
      message: 'Your business is becoming powerful!'
    }
  },
  {
    id: 'master_builder',
    title: 'Master Builder',
    description: 'Complete the full builder experience',
    requiredScore: 300,
    icon: '👑',
    unlocks: ['export_all_formats', 'priority_support'],
    category: 'mastery',
    rarity: 'legendary',
    celebration: {
      type: 'level_up',
      duration: 4000,
      message: 'You are now a Master Builder!',
      particles: {
        count: 100,
        colors: ['#ffd700', '#ff6b6b', '#4ecdc4'],
        shapes: ['star', 'diamond']
      }
    }
  },
  {
    id: 'social_sharer',
    title: 'Social Connector',
    description: 'Share your project',
    requiredScore: 100,
    icon: '🌟',
    unlocks: ['collaboration_features'],
    category: 'social',
    rarity: 'rare',
    celebration: {
      type: 'badge_unlock',
      duration: 2500,
      message: 'Spreading the word about great businesses!'
    }
  }
]