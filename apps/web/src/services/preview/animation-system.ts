// Animation System - Animation presets and keyframes

import type { AnimationPreset } from './types'

export class AnimationSystem {
  private static animations: { [key: string]: AnimationPreset } = {
    bounce: {
      id: 'bounce',
      keyframes: `
        @keyframes bounce {
          0%, 20%, 50%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-10px); }
          60% { transform: translateY(-5px); }
        }
      `,
      properties: {
        duration: '2s',
        timing: 'ease-in-out',
        iteration: 'infinite',
        fillMode: 'both'
      }
    },
    float: {
      id: 'float',
      keyframes: `
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-15px); }
        }
      `,
      properties: {
        duration: '6s',
        timing: 'ease-in-out',
        iteration: 'infinite',
        fillMode: 'both'
      }
    },
    shimmer: {
      id: 'shimmer',
      keyframes: `
        @keyframes shimmer {
          0% { transform: translateX(-100%) skewX(-15deg); }
          100% { transform: translateX(200%) skewX(-15deg); }
        }
      `,
      properties: {
        duration: '3s',
        timing: 'linear',
        iteration: 'infinite',
        fillMode: 'both'
      }
    },
    gradientShift: {
      id: 'gradientShift',
      keyframes: `
        @keyframes gradientShift {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
      `,
      properties: {
        duration: '4s',
        timing: 'ease-in-out',
        iteration: 'infinite',
        fillMode: 'both'
      }
    },
    fadeInUp: {
      id: 'fadeInUp',
      keyframes: `
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `,
      properties: {
        duration: '0.6s',
        timing: 'ease-out',
        iteration: '1',
        fillMode: 'both'
      }
    },
    wiggle: {
      id: 'wiggle',
      keyframes: `
        @keyframes wiggle {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(-5deg); }
          75% { transform: rotate(5deg); }
        }
      `,
      properties: {
        duration: '2s',
        timing: 'ease-in-out',
        iteration: 'infinite',
        fillMode: 'both'
      }
    },
    scaleOnHover: {
      id: 'scaleOnHover',
      keyframes: '',
      properties: {
        duration: '0.3s',
        timing: 'cubic-bezier(0.4, 0, 0.2, 1)',
        iteration: '1',
        fillMode: 'both'
      }
    },
    fadeIn: {
      id: 'fadeIn',
      keyframes: `
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `,
      properties: {
        duration: '0.5s',
        timing: 'ease-out',
        iteration: '1',
        fillMode: 'both'
      }
    }
  }

  static getAnimation(id: string): AnimationPreset | null {
    return this.animations[id] || null
  }

  static generateAnimationCSS(animationIds: string[]): string {
    return animationIds
      .map(id => this.animations[id]?.keyframes)
      .filter(Boolean)
      .join('\n')
  }

  static generateAnimationClasses(animationIds: string[]): string {
    return animationIds
      .map(id => {
        const animation = this.animations[id]
        if (!animation) return ''
        
        return `
          .animate-${id} {
            animation: ${id} ${animation.properties.duration} ${animation.properties.timing} ${animation.properties.iteration} ${animation.properties.fillMode};
          }
        `
      })
      .filter(Boolean)
      .join('\n')
  }

  static getAllAnimationIds(): string[] {
    return Object.keys(this.animations)
  }

  static addCustomAnimation(id: string, preset: AnimationPreset): void {
    this.animations[id] = preset
  }
}