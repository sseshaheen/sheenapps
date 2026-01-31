// Design System Manager - Color schemes, typography, and design tokens

import type { ColorScheme, TypographySystem } from './types'

export class DesignSystemManager {
  private static colorSchemes: { [key: string]: ColorScheme } = {
    luxury: {
      id: 'luxury',
      primary: '#d4af37',
      secondary: '#f6e19c', 
      accent: '#1a1a1a',
      background: '#000000',
      surface: 'rgba(212, 175, 55, 0.1)',
      text: {
        primary: '#ffffff',
        secondary: 'rgba(255, 255, 255, 0.8)',
        accent: '#d4af37'
      },
      gradients: {
        primary: 'linear-gradient(135deg, #d4af37 0%, #f6e19c 50%, #d4af37 100%)',
        secondary: 'linear-gradient(135deg, rgba(212, 175, 55, 0.1), rgba(246, 225, 156, 0.05))',
        accent: 'radial-gradient(ellipse at center, #0a0a0a 0%, #000000 100%)'
      }
    },
    warm: {
      id: 'warm',
      primary: '#ff6b6b',
      secondary: '#74b9ff',
      accent: '#00b894',
      background: '#fff9f0',
      surface: 'rgba(255, 255, 255, 0.9)',
      text: {
        primary: '#2d3436',
        secondary: '#636e72', 
        accent: '#ff6b6b'
      },
      gradients: {
        primary: 'linear-gradient(135deg, #ff6b6b, #ff8787)',
        secondary: 'linear-gradient(135deg, #74b9ff, #81c784)',
        accent: 'linear-gradient(135deg, #fff9f0 0%, #ffe4cc 50%, #ffd6b8 100%)'
      }
    },
    minimal: {
      id: 'minimal',
      primary: '#2563eb',
      secondary: '#64748b',
      accent: '#0f172a', 
      background: '#ffffff',
      surface: '#f8fafc',
      text: {
        primary: '#0f172a',
        secondary: '#64748b',
        accent: '#2563eb'
      },
      gradients: {
        primary: 'linear-gradient(135deg, #2563eb, #3b82f6)',
        secondary: 'linear-gradient(135deg, #f8fafc, #e2e8f0)',
        accent: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)'
      }
    },
    vibrant: {
      id: 'vibrant',
      primary: '#8b5cf6',
      secondary: '#06b6d4',
      accent: '#f59e0b',
      background: '#0c0a09',
      surface: 'rgba(139, 92, 246, 0.1)',
      text: {
        primary: '#ffffff',
        secondary: 'rgba(255, 255, 255, 0.7)',
        accent: '#8b5cf6'
      },
      gradients: {
        primary: 'linear-gradient(135deg, #8b5cf6, #a78bfa)',
        secondary: 'linear-gradient(135deg, #06b6d4, #0891b2)', 
        accent: 'linear-gradient(135deg, #0c0a09 0%, #1c1917 100%)'
      }
    }
  }

  private static typographySystems: { [key: string]: TypographySystem } = {
    elegant: {
      id: 'elegant',
      headingFont: "'Playfair Display', serif",
      bodyFont: "'Inter', sans-serif",
      weights: { light: 300, normal: 400, medium: 500, bold: 700, black: 900 }
    },
    modern: {
      id: 'modern', 
      headingFont: "'Inter', sans-serif",
      bodyFont: "'Inter', sans-serif",
      weights: { light: 300, normal: 400, medium: 500, bold: 600, black: 800 }
    },
    playful: {
      id: 'playful',
      headingFont: "'Nunito', sans-serif", 
      bodyFont: "'Nunito', sans-serif",
      weights: { light: 300, normal: 400, medium: 600, bold: 700, black: 900 }
    }
  }

  static getColorScheme(id: string): ColorScheme | null {
    return this.colorSchemes[id] || null
  }

  static getTypographySystem(id: string): TypographySystem | null {
    return this.typographySystems[id] || null
  }

  static generateColorSchemeCSS(colorSchemeId: string): string {
    const scheme = this.getColorScheme(colorSchemeId)
    if (!scheme) return ''
    
    return `
      :root {
        --color-primary: ${scheme.primary};
        --color-secondary: ${scheme.secondary};
        --color-accent: ${scheme.accent};
        --color-background: ${scheme.background};
        --color-surface: ${scheme.surface};
        --color-text-primary: ${scheme.text.primary};
        --color-text-secondary: ${scheme.text.secondary}; 
        --color-text-accent: ${scheme.text.accent};
        --gradient-primary: ${scheme.gradients.primary};
        --gradient-secondary: ${scheme.gradients.secondary};
        --gradient-accent: ${scheme.gradients.accent};
      }
      
      html, body {
        background: var(--color-background) !important;
        color: var(--color-text-primary) !important;
      }
    `
  }
  
  static generateTypographyCSS(typographyId: string): string {
    const typography = this.getTypographySystem(typographyId)
    if (!typography) return ''
    
    return `
      body, p, span, div {
        font-family: ${typography.bodyFont} !important;
      }
      
      h1, h2, h3, h4, h5, h6 {
        font-family: ${typography.headingFont} !important;
      }
      
      .font-light { font-weight: ${typography.weights.light} !important; }
      .font-normal { font-weight: ${typography.weights.normal} !important; }
      .font-medium { font-weight: ${typography.weights.medium} !important; }
      .font-bold { font-weight: ${typography.weights.bold} !important; }
      .font-black { font-weight: ${typography.weights.black} !important; }
    `
  }

  static getBackgroundStyle(colorSchemeId: string): string {
    const backgroundStyles: { [key: string]: string } = {
      luxury: 'background: radial-gradient(ellipse at center, #0a0a0a 0%, #000000 100%) !important;',
      warm: 'background: linear-gradient(135deg, #fff9f0 0%, #ffe4cc 50%, #ffd6b8 100%) !important;',
      minimal: 'background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%) !important;',
      vibrant: 'background: linear-gradient(135deg, #0c0a09 0%, #1c1917 50%, #292524 100%) !important;'
    }
    
    return backgroundStyles[colorSchemeId] || ''
  }

  static getAllColorSchemeIds(): string[] {
    return Object.keys(this.colorSchemes)
  }

  static getAllTypographyIds(): string[] {
    return Object.keys(this.typographySystems)
  }
}