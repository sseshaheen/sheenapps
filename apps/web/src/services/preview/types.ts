// Shared types for the Preview System

export interface ColorScheme {
  id: string
  primary: string
  secondary: string
  accent: string
  background: string
  surface: string
  text: {
    primary: string
    secondary: string
    accent: string
  }
  gradients: {
    primary: string
    secondary: string
    accent: string
  }
}

export interface TypographySystem {
  id: string
  headingFont: string
  bodyFont: string
  weights: {
    light: number
    normal: number
    medium: number
    bold: number
    black: number
  }
}

export interface ComponentProps {
  [key: string]: any
}

export interface ModularImpact {
  type: 'modular-transformation'
  modules: {
    colorScheme?: string
    typography?: string
    header?: {
      component: string
      props: ComponentProps
    }
    hero?: {
      component: string
      props: ComponentProps
    }
    features?: {
      component: string
      props: ComponentProps
    }
    animations?: string[]
    customCSS?: string
  }
}

export interface AnimationPreset {
  id: string
  keyframes: string
  properties: {
    duration: string
    timing: string
    iteration: string
    fillMode: string
  }
}

export interface PreviewChange {
  selector: string
  property?: string
  value?: string
  action?: 'appendChild' | 'removeChild' | 'replaceChild'
  element?: HTMLElement
  animation?: 'typewriter' | 'fadeIn' | 'slideInFromRight' | 'morphIcon' | 'pulse' | 'slideDown' | 'slideUp'
}

export interface LivePreviewConfig {
  previewContainer: HTMLElement | null
  enableAnimations: boolean
  updateDelay: number
  debugMode: boolean
}