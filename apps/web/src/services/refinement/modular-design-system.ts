// Modular Design System for AI-Generated Previews
// This system breaks down visual elements into reusable, composable modules

export interface ColorScheme {
  id: string
  name: string
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
  name: string
  headingFont: string
  bodyFont: string
  weights: {
    light: number
    normal: number
    medium: number
    bold: number
    black: number
  }
  sizes: {
    xs: string
    sm: string
    base: string
    lg: string
    xl: string
    '2xl': string
    '3xl': string
    '4xl': string
    '5xl': string
  }
  lineHeights: {
    tight: number
    normal: number
    relaxed: number
  }
}

export interface ComponentModule {
  id: string
  name: string
  html: string
  css: string
  animations?: string[]
  colorSchemeId: string
  typographyId: string
  variants?: { [key: string]: Partial<ComponentModule> }
}

export interface AnimationPreset {
  id: string
  name: string
  keyframes: string
  properties: {
    duration: string
    timing: string
    iteration: string
    fillMode: string
  }
}

// =============================================================================
// COLOR SCHEMES
// =============================================================================

export const COLOR_SCHEMES: { [key: string]: ColorScheme } = {
  luxury: {
    id: 'luxury',
    name: 'Luxury Gold',
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
    name: 'Warm & Friendly',
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
    name: 'Clean Minimal',
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
    name: 'Bold & Vibrant',
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

// =============================================================================
// TYPOGRAPHY SYSTEMS
// =============================================================================

export const TYPOGRAPHY_SYSTEMS: { [key: string]: TypographySystem } = {
  elegant: {
    id: 'elegant',
    name: 'Elegant Serif',
    headingFont: "'Playfair Display', serif",
    bodyFont: "'Inter', sans-serif",
    weights: { light: 300, normal: 400, medium: 500, bold: 700, black: 900 },
    sizes: {
      xs: '0.75rem',
      sm: '0.875rem',
      base: '1rem',
      lg: '1.125rem',
      xl: '1.25rem',
      '2xl': '1.5rem',
      '3xl': '1.875rem',
      '4xl': '2.25rem',
      '5xl': '3rem'
    },
    lineHeights: { tight: 1.25, normal: 1.5, relaxed: 1.75 }
  },
  modern: {
    id: 'modern',
    name: 'Modern Sans',
    headingFont: "'Inter', sans-serif",
    bodyFont: "'Inter', sans-serif",
    weights: { light: 300, normal: 400, medium: 500, bold: 600, black: 800 },
    sizes: {
      xs: '0.75rem',
      sm: '0.875rem',
      base: '1rem',
      lg: '1.125rem',
      xl: '1.25rem',
      '2xl': '1.5rem',
      '3xl': '1.875rem',
      '4xl': '2.25rem',
      '5xl': '3rem'
    },
    lineHeights: { tight: 1.2, normal: 1.4, relaxed: 1.6 }
  },
  playful: {
    id: 'playful',
    name: 'Playful & Fun',
    headingFont: "'Nunito', sans-serif",
    bodyFont: "'Nunito', sans-serif",
    weights: { light: 300, normal: 400, medium: 600, bold: 700, black: 900 },
    sizes: {
      xs: '0.75rem',
      sm: '0.875rem',
      base: '1rem',
      lg: '1.125rem',
      xl: '1.25rem',
      '2xl': '1.5rem',
      '3xl': '1.875rem',
      '4xl': '2.25rem',
      '5xl': '3rem'
    },
    lineHeights: { tight: 1.3, normal: 1.6, relaxed: 1.8 }
  }
}

// =============================================================================
// ANIMATION PRESETS
// =============================================================================

export const ANIMATION_PRESETS: { [key: string]: AnimationPreset } = {
  fadeInUp: {
    id: 'fadeInUp',
    name: 'Fade In Up',
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
  bounce: {
    id: 'bounce',
    name: 'Bounce',
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
    name: 'Float',
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
    name: 'Shimmer',
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
    name: 'Gradient Shift',
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
  scaleOnHover: {
    id: 'scaleOnHover',
    name: 'Scale on Hover',
    keyframes: '',
    properties: {
      duration: '0.3s',
      timing: 'cubic-bezier(0.4, 0, 0.2, 1)',
      iteration: '1',
      fillMode: 'both'
    }
  }
}

// =============================================================================
// COMPONENT MODULES
// =============================================================================

export const COMPONENT_MODULES = {
  headers: {
    minimal: {
      id: 'minimal',
      name: 'Minimal Header',
      colorSchemeId: 'minimal',
      typographyId: 'modern',
      html: `
        <header class="header-minimal">
          <div class="header-container">
            <div class="logo-section">
              <div class="logo-icon">{{logoIcon}}</div>
              <div class="logo-text">{{businessName}}</div>
            </div>
            <nav class="nav-minimal">
              {{#navItems}}
              <a href="{{url}}" class="nav-link">{{label}}</a>
              {{/navItems}}
              <button class="cta-button">{{ctaText}}</button>
            </nav>
          </div>
        </header>
      `,
      css: `
        .header-minimal {
          background: {{surface}};
          border-bottom: 1px solid {{primary}}20;
          padding: 1rem 0;
          position: sticky;
          top: 0;
          z-index: 1000;
          backdrop-filter: blur(10px);
        }
        .header-container {
          max-width: 1200px;
          margin: 0 auto;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0 2rem;
        }
        .logo-section {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }
        .logo-icon {
          width: 40px;
          height: 40px;
          background: {{gradients.primary}};
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.25rem;
        }
        .logo-text {
          font-family: {{headingFont}};
          font-size: {{sizes.xl}};
          font-weight: {{weights.bold}};
          color: {{text.primary}};
        }
        .nav-minimal {
          display: flex;
          gap: 2rem;
          align-items: center;
        }
        .nav-link {
          color: {{text.secondary}};
          text-decoration: none;
          font-weight: {{weights.medium}};
          transition: color 0.3s;
        }
        .nav-link:hover {
          color: {{text.accent}};
        }
        .cta-button {
          background: {{gradients.primary}};
          color: {{text.primary}};
          border: none;
          padding: 0.75rem 1.5rem;
          border-radius: 8px;
          font-weight: {{weights.medium}};
          cursor: pointer;
          transition: transform 0.3s;
        }
        .cta-button:hover {
          transform: translateY(-2px);
        }
      `
    },
    luxury: {
      id: 'luxury',
      name: 'Luxury Header',
      colorSchemeId: 'luxury',
      typographyId: 'elegant',
      html: `
        <header class="header-luxury">
          <div class="header-container">
            <div class="logo-section">
              <div class="logo-crown">{{logoIcon}}</div>
              <div class="logo-content">
                <div class="logo-text">{{businessName}}</div>
                <div class="logo-tagline">{{tagline}}</div>
              </div>
            </div>
            <nav class="nav-luxury">
              {{#navItems}}
              <a href="{{url}}" class="nav-link">{{label}}</a>
              {{/navItems}}
              <button class="cta-luxury">{{ctaText}}</button>
            </nav>
          </div>
        </header>
      `,
      css: `
        .header-luxury {
          background: linear-gradient(180deg, rgba(0,0,0,0.95) 0%, rgba(20,20,20,0.9) 100%);
          backdrop-filter: blur(20px);
          border-bottom: 2px solid transparent;
          border-image: linear-gradient(90deg, transparent, {{primary}}, transparent) 1;
          padding: 1.5rem 0;
          position: sticky;
          top: 0;
          z-index: 1000;
          box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        }
        .header-container {
          max-width: 1400px;
          margin: 0 auto;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0 3rem;
        }
        .logo-section {
          display: flex;
          align-items: center;
          gap: 1.5rem;
        }
        .logo-crown {
          width: 50px;
          height: 50px;
          background: {{gradients.primary}};
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 20px {{primary}}66;
          font-size: 1.5rem;
          color: {{accent}};
        }
        .logo-text {
          font-size: 1.8rem;
          font-weight: {{weights.bold}};
          letter-spacing: 2px;
          color: {{primary}};
          font-family: {{headingFont}};
          line-height: 1;
        }
        .logo-tagline {
          font-size: 0.75rem;
          color: {{text.secondary}};
          letter-spacing: 3px;
          margin-top: 2px;
        }
        .nav-luxury {
          display: flex;
          gap: 2.5rem;
          align-items: center;
        }
        .nav-link {
          color: {{text.secondary}};
          text-decoration: none;
          font-weight: {{weights.normal}};
          letter-spacing: 0.5px;
          transition: all 0.3s;
          position: relative;
          padding: 0.5rem 0;
        }
        .nav-link:hover {
          color: {{primary}};
        }
        .cta-luxury {
          background: {{gradients.primary}};
          color: {{accent}};
          border: none;
          padding: 0.875rem 2.5rem;
          border-radius: 50px;
          font-weight: {{weights.bold}};
          letter-spacing: 0.5px;
          cursor: pointer;
          transition: all 0.3s;
          box-shadow: 0 6px 20px {{primary}}66;
          border: 1px solid rgba(255,255,255,0.1);
        }
        .cta-luxury:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 25px {{primary}}99;
        }
      `
    },
    playful: {
      id: 'playful',
      name: 'Playful Header',
      colorSchemeId: 'warm',
      typographyId: 'playful',
      html: `
        <header class="header-playful">
          <div class="header-container">
            <div class="logo-section">
              <div class="logo-fun">
                <div class="logo-icon-animated">{{logoIcon}}</div>
                <div class="logo-shine"></div>
              </div>
              <div class="logo-content">
                <div class="logo-text">{{businessName}}</div>
                <div class="logo-subtitle">{{subtitle}}</div>
              </div>
            </div>
            <nav class="nav-playful">
              {{#navItems}}
              <a href="{{url}}" class="nav-item">
                <span class="nav-emoji">{{emoji}}</span>{{label}}
              </a>
              {{/navItems}}
              <button class="cta-playful">
                <span class="cta-emoji">{{ctaEmoji}}</span>{{ctaText}}
              </button>
            </nav>
          </div>
        </header>
      `,
      css: `
        .header-playful {
          background: {{gradients.secondary}};
          backdrop-filter: blur(20px);
          box-shadow: 0 8px 32px {{primary}}19;
          padding: 1.5rem 0;
          position: sticky;
          top: 0;
          z-index: 1000;
          border-bottom: 3px solid transparent;
          border-image: linear-gradient(90deg, {{primary}}, {{secondary}}, {{accent}}) 1;
        }
        .header-container {
          max-width: 1400px;
          margin: 0 auto;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0 3rem;
        }
        .logo-section {
          display: flex;
          align-items: center;
          gap: 1.5rem;
        }
        .logo-fun {
          position: relative;
          width: 55px;
          height: 55px;
          background: {{gradients.primary}};
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 8px 25px {{primary}}4D;
          overflow: hidden;
        }
        .logo-icon-animated {
          font-size: 1.8rem;
          animation: bounce 2s infinite;
        }
        .logo-shine {
          position: absolute;
          inset: 0;
          background: linear-gradient(45deg, transparent, rgba(255, 255, 255, 0.2), transparent);
          animation: shimmer 3s linear infinite;
        }
        .logo-text {
          font-size: 2rem;
          font-weight: {{weights.black}};
          color: {{primary}};
          font-family: {{headingFont}};
          line-height: 1;
          letter-spacing: -0.5px;
        }
        .logo-subtitle {
          font-size: 0.8rem;
          color: {{secondary}};
          font-weight: {{weights.bold}};
          letter-spacing: 2px;
          margin-top: 2px;
        }
        .nav-playful {
          display: flex;
          gap: 2.5rem;
          align-items: center;
        }
        .nav-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: {{text.primary}};
          text-decoration: none;
          font-weight: {{weights.bold}};
          transition: all 0.3s;
          padding: 0.5rem 1rem;
          border-radius: 12px;
        }
        .nav-item:hover {
          background: {{primary}}19;
          transform: translateY(-2px);
        }
        .nav-emoji {
          font-size: 1.1rem;
        }
        .cta-playful {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: {{gradients.primary}};
          color: white;
          border: none;
          padding: 0.875rem 2rem;
          border-radius: 25px;
          font-weight: {{weights.bold}};
          cursor: pointer;
          transition: all 0.3s;
          box-shadow: 0 6px 20px {{primary}}66;
          border: 2px solid rgba(255, 255, 255, 0.2);
        }
        .cta-playful:hover {
          transform: translateY(-3px) scale(1.05);
          box-shadow: 0 10px 30px {{primary}}80;
        }
        .cta-emoji {
          font-size: 1.2rem;
        }
      `
    }
  },
  heroes: {
    splitLayout: {
      id: 'splitLayout',
      name: 'Split Layout Hero',
      colorSchemeId: 'minimal',
      typographyId: 'modern',
      html: `
        <section class="hero-split">
          <div class="hero-container">
            <div class="hero-content">
              <div class="hero-badge">{{badge}}</div>
              <h1 class="hero-title">{{title}}</h1>
              <p class="hero-subtitle">{{subtitle}}</p>
              <div class="hero-actions">
                <button class="btn-primary">{{primaryCTA}}</button>
                <button class="btn-secondary">{{secondaryCTA}}</button>
              </div>
              <div class="hero-stats">
                {{#stats}}
                <div class="stat-item">
                  <div class="stat-number">{{number}}</div>
                  <div class="stat-label">{{label}}</div>
                </div>
                {{/stats}}
              </div>
            </div>
            <div class="hero-visual">
              {{visualContent}}
            </div>
          </div>
        </section>
      `,
      css: `
        .hero-split {
          min-height: 90vh;
          background: {{gradients.accent}};
          display: flex;
          align-items: center;
          position: relative;
          overflow: hidden;
        }
        .hero-container {
          max-width: 1400px;
          margin: 0 auto;
          padding: 0 3rem;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 5rem;
          align-items: center;
        }
        .hero-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          background: {{surface}};
          border: 1px solid {{primary}}33;
          border-radius: 50px;
          padding: 0.75rem 1.5rem;
          margin-bottom: 2rem;
          font-weight: {{weights.medium}};
          color: {{text.accent}};
        }
        .hero-title {
          font-size: {{sizes.5xl}};
          font-weight: {{weights.black}};
          line-height: {{lineHeights.tight}};
          color: {{text.primary}};
          margin-bottom: 1.5rem;
          font-family: {{headingFont}};
        }
        .hero-subtitle {
          font-size: {{sizes.xl}};
          color: {{text.secondary}};
          margin-bottom: 2.5rem;
          line-height: {{lineHeights.relaxed}};
        }
        .hero-actions {
          display: flex;
          gap: 1rem;
          margin-bottom: 3rem;
        }
        .btn-primary {
          background: {{gradients.primary}};
          color: white;
          border: none;
          padding: 1rem 2rem;
          border-radius: 8px;
          font-weight: {{weights.medium}};
          cursor: pointer;
          transition: transform 0.3s;
        }
        .btn-secondary {
          background: transparent;
          color: {{text.accent}};
          border: 2px solid {{primary}};
          padding: 1rem 2rem;
          border-radius: 8px;
          font-weight: {{weights.medium}};
          cursor: pointer;
          transition: all 0.3s;
        }
        .hero-stats {
          display: flex;
          gap: 2rem;
        }
        .stat-item {
          text-align: center;
        }
        .stat-number {
          font-size: {{sizes.2xl}};
          font-weight: {{weights.bold}};
          color: {{text.accent}};
        }
        .stat-label {
          color: {{text.secondary}};
          font-size: {{sizes.sm}};
        }
      `
    }
  }
}