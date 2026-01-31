'use client'

import React, { useEffect, useState } from 'react'
import { m } from '@/components/ui/motion-provider'
import { createPortal } from 'react-dom'
// import { cn } from '@/lib/utils'
import type { CelebrationConfig } from '@/services/engagement/engagement-engine'

interface CelebrationEffectsProps {
  celebration: CelebrationConfig | null
  onComplete?: () => void
}

interface Particle {
  id: string
  x: number
  y: number
  vx: number
  vy: number
  color: string
  shape: string
  size: number
  life: number
  maxLife: number
}

export function CelebrationEffects({ celebration, onComplete }: CelebrationEffectsProps) {
  const [particles, setParticles] = useState<Particle[]>([])
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    if (celebration) {
      setIsVisible(true)
      
      if (celebration.type === 'confetti') {
        createConfetti(celebration)
      }
      
      // Auto-hide after duration
      const timer = setTimeout(() => {
        setIsVisible(false)
        onComplete?.()
      }, celebration.duration)
      
      return () => clearTimeout(timer)
    }
  }, [celebration, onComplete])

  const createConfetti = (config: CelebrationConfig) => {
    if (!config.particles) return
    
    const newParticles: Particle[] = []
    const centerX = window.innerWidth / 2
    const centerY = window.innerHeight / 2
    
    for (let i = 0; i < config.particles.count; i++) {
      newParticles.push({
        id: `particle-${i}`,
        x: centerX + (Math.random() - 0.5) * 200,
        y: centerY + (Math.random() - 0.5) * 200,
        vx: (Math.random() - 0.5) * 10,
        vy: (Math.random() - 0.5) * 10 - 5,
        color: config.particles.colors[Math.floor(Math.random() * config.particles.colors.length)],
        shape: config.particles.shapes[Math.floor(Math.random() * config.particles.shapes.length)],
        size: Math.random() * 10 + 5,
        life: 0,
        maxLife: Math.random() * 100 + 50
      })
    }
    
    setParticles(newParticles)
    
    // Animate particles
    const animateParticles = () => {
      setParticles(prevParticles => {
        return prevParticles
          .map(particle => ({
            ...particle,
            x: particle.x + particle.vx,
            y: particle.y + particle.vy,
            vy: particle.vy + 0.5, // gravity
            life: particle.life + 1
          }))
          .filter(particle => particle.life < particle.maxLife)
      })
    }
    
    const interval = setInterval(animateParticles, 16) // ~60fps
    
    setTimeout(() => {
      clearInterval(interval)
      setParticles([])
    }, config.duration)
  }

  if (!celebration || !isVisible) return null

  // EXPERT FIX: Use portal container inside provider scope instead of document.body
  const portalRoot = typeof document !== 'undefined' ? document.getElementById('portal-root') : null
  if (!portalRoot) {
    // Fallback to document.body if portal-root not found (shouldn't happen)
    console.warn('⚠️ Portal root not found, falling back to document.body. This may cause intl context errors.')
  }

  return createPortal(
    <div className="fixed inset-0 pointer-events-none z-[9999]">
      {/* Background overlay for certain celebration types */}
      {(celebration.type === 'level_up' || celebration.type === 'badge_unlock') && (
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.8 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        />
      )}
      
      {/* Celebration content */}
      <div className="relative w-full h-full flex items-center justify-center">
        {celebration.type === 'confetti' && <ConfettiCelebration config={celebration} particles={particles} />}
        {celebration.type === 'pulse_glow' && <PulseGlowCelebration config={celebration} />}
        {celebration.type === 'level_up' && <LevelUpCelebration />}
        {celebration.type === 'badge_unlock' && <BadgeUnlockCelebration />}
        {celebration.type === 'feature_showcase' && <FeatureShowcaseCelebration />}
      </div>
      
      {/* Message overlay */}
      <m.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"
      >
        <div className="bg-gray-900/90 backdrop-blur-lg border border-gray-700 rounded-lg p-6 text-center max-w-md">
          <m.h3 
            className="text-xl font-bold text-white mb-2"
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2 }}
          >
            {celebration.message}
          </m.h3>
        </div>
      </m.div>
    </div>,
    portalRoot || document.body
  )
}

function ConfettiCelebration({ particles }: { config: CelebrationConfig; particles: Particle[] }) {
  return (
    <>
      {particles.map(particle => (
        <m.div
          key={particle.id}
          className="absolute"
          style={{
            left: particle.x,
            top: particle.y,
            width: particle.size,
            height: particle.size,
            backgroundColor: particle.color,
            borderRadius: particle.shape === 'circle' ? '50%' : '0%'
          }}
          initial={{ opacity: 1 }}
          animate={{ 
            opacity: 1 - (particle.life / particle.maxLife),
            rotate: particle.life * 5
          }}
        />
      ))}
    </>
  )
}

function PulseGlowCelebration({ config }: { config: CelebrationConfig }) {
  return (
    <m.div
      className="absolute inset-0"
      initial={{ opacity: 0 }}
      animate={{ 
        opacity: [0, 0.5, 0],
        scale: [1, 1.2, 1]
      }}
      transition={{
        duration: config.duration / 1000,
        repeat: 3,
        ease: "easeInOut"
      }}
    >
      <div className="w-full h-full bg-gradient-to-r from-purple-500/20 to-pink-500/20 blur-3xl" />
    </m.div>
  )
}

function LevelUpCelebration() {
  return (
    <m.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      className="relative"
    >
      {/* Radial burst effect */}
      <m.div
        className="absolute inset-0 w-96 h-96 rounded-full border-4 border-yellow-400"
        animate={{
          scale: [0, 1.5],
          opacity: [1, 0]
        }}
        transition={{
          duration: 1,
          repeat: 2,
          ease: "easeOut"
        }}
      />
      
      {/* Central star */}
      <m.div
        className="w-24 h-24 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full flex items-center justify-center"
        animate={{
          rotate: [0, 360],
          scale: [1, 1.2, 1]
        }}
        transition={{
          rotate: { duration: 2, repeat: Infinity, ease: "linear" },
          scale: { duration: 0.5, repeat: Infinity, repeatType: "reverse" }
        }}
      >
        <span className="text-3xl">⭐</span>
      </m.div>
      
      {/* Floating sparkles */}
      {Array.from({ length: 8 }).map((_, i) => (
        <m.div
          key={i}
          className="absolute w-4 h-4 bg-yellow-300 rounded-full"
          style={{
            top: '50%',
            left: '50%',
            transformOrigin: '50% 100px'
          }}
          animate={{
            rotate: [0, 360],
            y: [-20, -40, -20]
          }}
          transition={{
            rotate: { duration: 3, repeat: Infinity, ease: "linear" },
            y: { duration: 1, repeat: Infinity, repeatType: "reverse", delay: i * 0.1 }
          }}
        />
      ))}
    </m.div>
  )
}

function BadgeUnlockCelebration() {
  return (
    <m.div
      initial={{ scale: 0, rotateY: 180 }}
      animate={{ scale: 1, rotateY: 0 }}
      exit={{ scale: 0, rotateY: -180 }}
      transition={{ type: "spring", stiffness: 200, damping: 20 }}
      className="relative"
    >
      {/* Badge container */}
      <m.div
        className="w-32 h-32 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center shadow-2xl"
        animate={{
          boxShadow: [
            "0 0 0 0 rgba(139, 92, 246, 0.7)",
            "0 0 0 20px rgba(139, 92, 246, 0)",
            "0 0 0 0 rgba(139, 92, 246, 0)"
          ]
        }}
        transition={{
          duration: 1.5,
          repeat: 2,
          ease: "easeOut"
        }}
      >
        <span className="text-4xl">🏆</span>
      </m.div>
      
      {/* Shine effect */}
      <m.div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
        animate={{
          x: [-100, 100]
        }}
        transition={{
          duration: 1,
          repeat: 2,
          ease: "easeInOut"
        }}
        style={{
          transform: "skewX(-20deg)"
        }}
      />
    </m.div>
  )
}

function FeatureShowcaseCelebration() {
  return (
    <m.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      className="relative"
    >
      {/* Feature showcase container */}
      <m.div
        className="bg-gray-800/95 backdrop-blur-lg border border-gray-600 rounded-xl p-8 max-w-lg"
        animate={{
          y: [0, -10, 0]
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut"
        }}
      >
        <div className="text-center">
          <m.div
            className="w-16 h-16 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full flex items-center justify-center mx-auto mb-4"
            animate={{
              rotate: [0, 360]
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: "linear"
            }}
          >
            <span className="text-2xl">⚡</span>
          </m.div>
          
          <h3 className="text-xl font-bold text-white mb-2">Feature Unlocked!</h3>
          <p className="text-gray-300">New capabilities have been added to your workspace</p>
          
          {/* Feature icons */}
          <div className="flex justify-center gap-4 mt-6">
            {['🎨', '📊', '🔧'].map((icon, i) => (
              <m.div
                key={i}
                className="w-10 h-10 bg-gray-700 rounded-lg flex items-center justify-center"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 + i * 0.1 }}
              >
                <span>{icon}</span>
              </m.div>
            ))}
          </div>
        </div>
      </m.div>
      
      {/* Floating particles */}
      {Array.from({ length: 12 }).map((_, i) => (
        <m.div
          key={i}
          className="absolute w-2 h-2 bg-blue-400 rounded-full"
          style={{
            left: `${50 + (Math.random() - 0.5) * 200}%`,
            top: `${50 + (Math.random() - 0.5) * 200}%`
          }}
          animate={{
            y: [0, -100, 0],
            opacity: [0, 1, 0],
            scale: [0, 1, 0]
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            delay: i * 0.1,
            ease: "easeOut"
          }}
        />
      ))}
    </m.div>
  )
}

// Hook for triggering celebrations
export function useCelebration() {
  const [currentCelebration, setCurrentCelebration] = useState<CelebrationConfig | null>(null)

  const triggerCelebration = (config: CelebrationConfig) => {
    setCurrentCelebration(config)
  }

  const clearCelebration = () => {
    setCurrentCelebration(null)
  }

  return {
    currentCelebration,
    triggerCelebration,
    clearCelebration
  }
}