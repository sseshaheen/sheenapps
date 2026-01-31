'use client'

import React, { useState, useEffect } from 'react'
import { m, AnimatePresence } from '@/components/ui/motion-provider'
import Icon from '@/components/ui/icon'








import { cn } from '@/lib/utils'
import type { EngagementMetrics, Achievement } from '@/services/engagement/engagement-engine'

interface ProgressTrackerProps {
  metrics: EngagementMetrics
  onAchievementClick?: (achievement: Achievement) => void
  compact?: boolean
}

export function ProgressTracker({ 
  metrics, 
  onAchievementClick,
  compact = false 
}: ProgressTrackerProps) {
  const [showDetails, setShowDetails] = useState(!compact)
  const [animatingScore, setAnimatingScore] = useState(metrics.totalScore)

  // Animate score changes
  useEffect(() => {
    if (animatingScore !== metrics.totalScore) {
      const duration = 1000
      const steps = 30
      const stepValue = (metrics.totalScore - animatingScore) / steps
      let currentStep = 0

      const timer = setInterval(() => {
        currentStep++
        setAnimatingScore(prev => {
          const newValue = prev + stepValue
          if (currentStep >= steps) {
            clearInterval(timer)
            return metrics.totalScore
          }
          return newValue
        })
      }, duration / steps)
    }
  }, [metrics.totalScore, animatingScore])

  const formatTime = (ms: number): string => {
    const minutes = Math.floor(ms / 60000)
    const hours = Math.floor(minutes / 60)
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`
    }
    return `${minutes}m`
  }

  const getRarityColor = (rarity: string): string => {
    const colors = {
      'common': 'text-gray-400 border-gray-600',
      'rare': 'text-blue-400 border-blue-600',
      'epic': 'text-purple-400 border-purple-600',
      'legendary': 'text-yellow-400 border-yellow-600'
    }
    return colors[rarity as keyof typeof colors] || colors.common
  }

  const getLevelColor = (level: number): string => {
    if (level >= 10) return 'from-yellow-500 to-orange-500'
    if (level >= 7) return 'from-purple-500 to-pink-500'
    if (level >= 4) return 'from-blue-500 to-cyan-500'
    return 'from-green-500 to-emerald-500'
  }

  if (compact) {
    return (
      <m.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative z-0 bg-gray-800 border border-gray-700 rounded-lg p-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Level Badge */}
            <div className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center text-white font-bold",
              `bg-gradient-to-br ${getLevelColor(metrics.level)}`
            )}>
              {metrics.level}
            </div>
            
            <div>
              <div className="flex items-center gap-2">
                <Icon name="star" className="w-4 h-4 text-yellow-400"  />
                <span className="text-yellow-400 font-medium">
                  {Math.round(animatingScore)}
                </span>
              </div>
              <div className="text-xs text-gray-400">
                Level {metrics.level} Builder
              </div>
            </div>
          </div>
          
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <Icon name="chevron-right" className={cn(
              "w-4 h-4 transition-transform",
              showDetails && "rotate-90"
            )}  />
          </button>
        </div>
        
        <AnimatePresence>
          {showDetails && (
            <m.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 space-y-3"
            >
              {/* Progress Bar */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-400">Progress to Level {metrics.level + 1}</span>
                  <span className="text-xs text-purple-400">
                    {Math.round(metrics.currentLevelProgress)}%
                  </span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <m.div
                    className="bg-gradient-to-r from-purple-500 to-pink-500 h-2 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${metrics.currentLevelProgress}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
              </div>
              
              {/* Quick Stats */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-2 bg-gray-700/50 rounded">
                  <div className="text-sm font-medium text-white">{metrics.streak}</div>
                  <div className="text-xs text-gray-400">Streak</div>
                </div>
                <div className="p-2 bg-gray-700/50 rounded">
                  <div className="text-sm font-medium text-white">{metrics.questionsAnswered}</div>
                  <div className="text-xs text-gray-400">Questions</div>
                </div>
                <div className="p-2 bg-gray-700/50 rounded">
                  <div className="text-sm font-medium text-white">{metrics.achievements.length}</div>
                  <div className="text-xs text-gray-400">Badges</div>
                </div>
              </div>
            </m.div>
          )}
        </AnimatePresence>
      </m.div>
    )
  }

  return (
    <m.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-white flex items-center gap-2">
          <Icon name="trophy" className="w-5 h-5 text-yellow-400"  />
          Your Progress
        </h4>
        <div className="flex items-center gap-2">
          <Icon name="star" className="w-4 h-4 text-yellow-400"  />
          <m.span 
            className="text-yellow-400 font-medium"
            key={Math.round(animatingScore)}
            initial={{ scale: 1.2 }}
            animate={{ scale: 1 }}
          >
            {Math.round(animatingScore)}
          </m.span>
        </div>
      </div>
      
      {/* Level and Progress */}
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          {/* Level Badge */}
          <m.div 
            className={cn(
              "w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-xl",
              `bg-gradient-to-br ${getLevelColor(metrics.level)}`
            )}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {metrics.level}
          </m.div>
          
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <span className="text-white font-medium">Level {metrics.level} Builder</span>
              <span className="text-sm text-purple-400">
                {Math.round(metrics.currentLevelProgress)}% to Level {metrics.level + 1}
              </span>
            </div>
            
            <div className="w-full bg-gray-700 rounded-full h-3">
              <m.div
                className="bg-gradient-to-r from-purple-500 to-pink-500 h-3 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(metrics.currentLevelProgress, 100)}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              />
            </div>
            
            <div className="text-xs text-gray-400 mt-1">
              {metrics.totalScore} / {metrics.nextLevelThreshold} points
            </div>
          </div>
        </div>
        
        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <m.div 
            className="p-3 bg-gray-700/50 rounded-lg text-center"
            whileHover={{ scale: 1.02 }}
          >
            <div className="flex items-center justify-center mb-1">
              <Icon name="flame" className="w-5 h-5 text-orange-400"  />
            </div>
            <div className="text-lg font-bold text-white">{metrics.streak}</div>
            <div className="text-xs text-gray-400">Day Streak</div>
          </m.div>
          
          <m.div 
            className="p-3 bg-gray-700/50 rounded-lg text-center"
            whileHover={{ scale: 1.02 }}
          >
            <div className="flex items-center justify-center mb-1">
              <Icon name="target" className="w-5 h-5 text-blue-400"  />
            </div>
            <div className="text-lg font-bold text-white">{metrics.questionsAnswered}</div>
            <div className="text-xs text-gray-400">Questions</div>
          </m.div>
          
          <m.div 
            className="p-3 bg-gray-700/50 rounded-lg text-center"
            whileHover={{ scale: 1.02 }}
          >
            <div className="flex items-center justify-center mb-1">
              <Icon name="zap" className="w-5 h-5 text-yellow-400"  />
            </div>
            <div className="text-lg font-bold text-white">{metrics.featuresDiscovered}</div>
            <div className="text-xs text-gray-400">Features</div>
          </m.div>
          
          <m.div 
            className="p-3 bg-gray-700/50 rounded-lg text-center"
            whileHover={{ scale: 1.02 }}
          >
            <div className="flex items-center justify-center mb-1">
              <Icon name="calendar" className="w-5 h-5 text-green-400"  />
            </div>
            <div className="text-lg font-bold text-white">{formatTime(metrics.totalTime)}</div>
            <div className="text-xs text-gray-400">Time Spent</div>
          </m.div>
        </div>
      </div>
      
      {/* Recent Achievements */}
      {metrics.achievements.length > 0 && (
        <div className="space-y-3">
          <h5 className="text-sm font-medium text-gray-300 flex items-center gap-2">
            <Icon name="trophy" className="w-4 h-4"  />
            Recent Achievements
          </h5>
          <div className="space-y-2">
            {metrics.achievements.slice(-3).map((achievement) => (
              <m.button
                key={achievement.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onAchievementClick?.(achievement)}
                className={cn(
                  "w-full p-3 rounded-lg border text-left transition-colors",
                  getRarityColor(achievement.rarity),
                  "hover:bg-gray-700/50"
                )}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{achievement.icon}</span>
                  <div className="flex-1">
                    <div className="font-medium text-white">{achievement.title}</div>
                    <div className="text-sm text-gray-400">{achievement.description}</div>
                  </div>
                  <div className={cn(
                    "text-xs px-2 py-1 rounded-full border",
                    getRarityColor(achievement.rarity)
                  )}>
                    {achievement.rarity}
                  </div>
                </div>
              </m.button>
            ))}
          </div>
        </div>
      )}
      
      {/* Milestones Progress */}
      <div className="space-y-3">
        <h5 className="text-sm font-medium text-gray-300 flex items-center gap-2">
          <Icon name="trending-up" className="w-4 h-4"  />
          Milestones ({metrics.milestonesCompleted}/5)
        </h5>
        
        <div className="space-y-2">
          {/* This would be populated with actual milestones data */}
          <div className="text-sm text-gray-400">
            Complete more actions to unlock milestones!
          </div>
        </div>
      </div>
    </m.div>
  )
}