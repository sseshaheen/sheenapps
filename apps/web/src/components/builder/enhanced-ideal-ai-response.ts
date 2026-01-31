// Enhanced ideal_ai_response structure for cumulative preview updates

export interface CurrentIdealAIResponse {
  type: 'modular-transformation',
  modules: {
    colorScheme: string;
    typography: string;
    header: { component: string; props: any };
    hero: { component: string; props: any };
    animations: string[];
    customCSS: string;
  }
}

// NEW: Enhanced structure supporting incremental updates
export interface EnhancedIdealAIResponse {
  type: 'incremental-update',
  
  // Unique identifier for this response
  responseId: string,
  questionId: string,
  answerId: string,
  
  // Context from previous answers
  context: {
    previousAnswers: Array<{
      questionId: string;
      answerId: string;
      label: string;
    }>;
    accumulatedProfile: {
      businessType: string;
      brandPersonality: string[];
      targetAudience: string[];
      keyFeatures: string[];
    };
  },
  
  // Incremental modifications (not replacements)
  modifications: {
    // Color modifications (partial, merges with existing)
    colors?: {
      primary?: string;
      secondary?: string;
      accent?: string;
      background?: {
        light?: string;
        dark?: string;
      };
      text?: {
        primary?: string;
        secondary?: string;
        accent?: string;
      };
      // Special color effects
      gradients?: {
        [key: string]: string;
      };
    };
    
    // Typography modifications (partial)
    typography?: {
      headingFont?: string;
      bodyFont?: string;
      scale?: number; // Multiplier for existing sizes
      weights?: {
        light?: number;
        regular?: number;
        bold?: number;
      };
      // Specific overrides
      overrides?: {
        h1?: { size?: string; weight?: number; lineHeight?: number };
        h2?: { size?: string; weight?: number; lineHeight?: number };
        body?: { size?: string; lineHeight?: number };
      };
    };
    
    // Component modifications (enhance, not replace)
    components?: {
      header?: {
        // What to modify
        modifications: {
          layout?: 'centered' | 'split' | 'minimal' | 'expanded';
          height?: string;
          transparency?: number;
          blur?: boolean;
        };
        // Elements to add/remove
        addElements?: Array<{
          type: 'cta' | 'menu-item' | 'badge' | 'search';
          properties: Record<string, any>;
          position: 'start' | 'center' | 'end';
        }>;
        removeElements?: string[];
        // Style overrides for existing elements
        elementStyles?: {
          [selector: string]: Record<string, string>;
        };
      };
      
      hero?: {
        modifications: {
          layout?: 'center' | 'split' | 'full' | 'minimal';
          height?: string;
          emphasis?: 'content' | 'visual' | 'balanced';
        };
        // Content modifications
        content?: {
          headline?: {
            prepend?: string;
            append?: string;
            replace?: string;
            style?: Record<string, string>;
          };
          subheadline?: {
            prepend?: string;
            append?: string;
            replace?: string;
            tone?: 'professional' | 'friendly' | 'bold' | 'technical';
          };
        };
        // Add new sections
        addSections?: Array<{
          type: 'trust-bar' | 'feature-list' | 'testimonial' | 'stats';
          data: Record<string, any>;
          position: 'before-cta' | 'after-cta' | 'bottom';
        }>;
        // Visual enhancements
        visualEffects?: {
          backgroundType?: 'gradient' | 'pattern' | 'image' | 'video';
          overlayOpacity?: number;
          particles?: boolean;
          parallax?: boolean;
        };
      };
      
      // Add new components
      newComponents?: Array<{
        type: string;
        position: string;
        props: Record<string, any>;
        animations?: string[];
      }>;
    };
    
    // Animation modifications
    animations?: {
      // Add new animations
      add?: Array<{
        name: string;
        target: string; // CSS selector
        trigger: 'onLoad' | 'onScroll' | 'onHover';
        properties: Record<string, any>;
      }>;
      // Remove animations
      remove?: string[];
      // Modify existing animations
      modify?: {
        [animationName: string]: {
          duration?: number;
          delay?: number;
          easing?: string;
        };
      };
    };
    
    // Content replacements and additions
    content?: {
      // Dynamic replacements based on context
      replacements?: {
        [placeholder: string]: string | (() => string);
      };
      // New content sections
      additions?: {
        [sectionId: string]: {
          type: 'text' | 'list' | 'card' | 'stat';
          content: any;
          position: string;
        };
      };
    };
    
    // Global style modifications
    globalStyles?: {
      // CSS custom properties
      cssVariables?: {
        [variable: string]: string;
      };
      // Utility classes
      utilities?: {
        [className: string]: Record<string, string>;
      };
    };
  };
  
  // How this modification relates to others
  relationships: {
    // Which previous answers this enhances
    enhances?: Array<{
      answerId: string;
      effect: string; // Description of the enhancement
      strength: 'subtle' | 'moderate' | 'strong';
    }>;
    
    // Potential conflicts (for warning purposes)
    conflicts?: Array<{
      answerId: string;
      reason: string;
      severity: 'minor' | 'major';
    }>;
    
    // Synergistic combinations
    synergies?: Array<{
      withAnswers: string[]; // Multiple answers that work together
      effect: string;
      bonusModifications?: any; // Partial modifications structure
    }>;
  };
  
  // Transition configuration
  transition: {
    // How to apply these modifications
    style: 'instant' | 'fade' | 'morph' | 'slide' | 'grow';
    duration: number; // milliseconds
    stagger?: number; // Delay between elements
    
    // What to emphasize during transition
    emphasis?: {
      elements: string[]; // CSS selectors
      effect: 'glow' | 'scale' | 'shake' | 'pulse';
    };
    
    // Smooth state interpolation
    interpolation?: {
      colorBlending: 'rgb' | 'hsl' | 'lab';
      layoutShift: 'smooth' | 'stepped';
    };
  };
  
  // Preview behavior
  preview: {
    // On hover behavior
    hover: {
      instant: boolean; // Apply immediately on hover
      previewDepth: 'shallow' | 'deep'; // How much to show
    };
    
    // Revert behavior
    revert: {
      // What state to revert to
      target: 'previous' | 'accumulated' | 'base';
      transition: 'instant' | 'smooth';
    };
  };
  
  // Metadata for AI learning
  metadata: {
    // Why these modifications were chosen
    reasoning: string;
    // Expected user perception
    expectedImpact: {
      professionalism: number; // -5 to +5
      modernity: number;
      trustworthiness: number;
      uniqueness: number;
    };
    // Tags for categorization
    tags: string[];
  };
}

// Example transformation for Question 1: Brand Personality - "Luxury"
export const luxuryPersonalityResponse: EnhancedIdealAIResponse = {
  type: 'incremental-update',
  responseId: 'q1-luxury-v1',
  questionId: 'brand-personality',
  answerId: 'luxury',
  
  context: {
    previousAnswers: [],
    accumulatedProfile: {
      businessType: 'unknown',
      brandPersonality: ['luxury', 'premium', 'sophisticated'],
      targetAudience: [],
      keyFeatures: []
    }
  },
  
  modifications: {
    colors: {
      primary: '#1a1a1a',
      secondary: '#c9a961',
      accent: '#f4f4f4',
      background: {
        light: '#fafafa',
        dark: '#0a0a0a'
      },
      text: {
        primary: '#1a1a1a',
        secondary: '#666666',
        accent: '#c9a961'
      },
      gradients: {
        'luxury-gold': 'linear-gradient(135deg, #c9a961 0%, #d4af37 50%, #b8960f 100%)',
        'subtle-dark': 'linear-gradient(180deg, #0a0a0a 0%, #1a1a1a 100%)'
      }
    },
    
    typography: {
      headingFont: 'Playfair Display',
      bodyFont: 'Inter',
      weights: {
        light: 300,
        regular: 400,
        bold: 700
      },
      overrides: {
        h1: { size: '3.5rem', weight: 300, lineHeight: 1.2 },
        h2: { size: '2.5rem', weight: 300, lineHeight: 1.3 },
        body: { size: '1.125rem', lineHeight: 1.7 }
      }
    },
    
    components: {
      header: {
        modifications: {
          layout: 'minimal',
          height: '80px',
          transparency: 0.95,
          blur: true
        },
        elementStyles: {
          '.logo': { fontWeight: '300', letterSpacing: '0.05em' },
          '.nav-link': { textTransform: 'uppercase', fontSize: '0.875rem' }
        }
      },
      
      hero: {
        modifications: {
          layout: 'center',
          height: '100vh',
          emphasis: 'balanced'
        },
        content: {
          headline: {
            style: { letterSpacing: '0.02em', fontWeight: '300' }
          },
          subheadline: {
            tone: 'professional'
          }
        },
        visualEffects: {
          backgroundType: 'gradient',
          overlayOpacity: 0.3,
          particles: false,
          parallax: true
        }
      }
    },
    
    animations: {
      add: [
        {
          name: 'luxury-fade-in',
          target: '.hero-content',
          trigger: 'onLoad',
          properties: {
            duration: 2000,
            delay: 500,
            easing: 'cubic-bezier(0.4, 0, 0.2, 1)'
          }
        },
        {
          name: 'gold-shimmer',
          target: '.accent-text',
          trigger: 'onScroll',
          properties: {
            duration: 3000,
            iterationCount: 'infinite'
          }
        }
      ]
    },
    
    globalStyles: {
      cssVariables: {
        '--transition-base': '400ms cubic-bezier(0.4, 0, 0.2, 1)',
        '--shadow-luxury': '0 10px 30px rgba(0, 0, 0, 0.1)',
        '--border-radius-elegant': '2px'
      }
    }
  },
  
  relationships: {
    enhances: [],
    conflicts: [],
    synergies: []
  },
  
  transition: {
    style: 'morph',
    duration: 800,
    emphasis: {
      elements: ['.hero-content', '.header'],
      effect: 'glow'
    },
    interpolation: {
      colorBlending: 'hsl',
      layoutShift: 'smooth'
    }
  },
  
  preview: {
    hover: {
      instant: false,
      previewDepth: 'deep'
    },
    revert: {
      target: 'base',
      transition: 'smooth'
    }
  },
  
  metadata: {
    reasoning: 'Luxury positioning requires sophisticated color palette, elegant typography, and refined animations',
    expectedImpact: {
      professionalism: 5,
      modernity: 3,
      trustworthiness: 4,
      uniqueness: 4
    },
    tags: ['luxury', 'premium', 'sophisticated', 'elegant']
  }
};

// Example for Question 2: Target Audience - "Young Professionals" 
// (building on top of Luxury personality)
export const youngProfessionalsAfterLuxury: EnhancedIdealAIResponse = {
  type: 'incremental-update',
  responseId: 'q2-young-professionals-after-luxury',
  questionId: 'target-audience',
  answerId: 'young-professionals',
  
  context: {
    previousAnswers: [
      { questionId: 'brand-personality', answerId: 'luxury', label: 'Luxury & Premium' }
    ],
    accumulatedProfile: {
      businessType: 'unknown',
      brandPersonality: ['luxury', 'premium', 'sophisticated'],
      targetAudience: ['millennials', 'gen-z', 'urban', 'ambitious'],
      keyFeatures: []
    }
  },
  
  modifications: {
    // Add modern touches while keeping luxury feel
    colors: {
      accent: '#4A90E2', // Add tech-savvy blue accent
      gradients: {
        'modern-luxury': 'linear-gradient(135deg, #1a1a1a 0%, #4A90E2 100%)'
      }
    },
    
    // Make typography slightly more modern
    typography: {
      overrides: {
        h1: { size: '3.25rem', weight: 400 }, // Slightly bolder than pure luxury
        body: { size: '1rem' } // Slightly smaller for mobile-first
      }
    },
    
    components: {
      header: {
        modifications: {
          layout: 'expanded'
        },
        addElements: [
          {
            type: 'cta',
            properties: {
              text: 'Get Started',
              style: 'outline',
              size: 'small'
            },
            position: 'end'
          }
        ]
      },
      
      hero: {
        modifications: {
          layout: 'center',
          emphasis: 'balanced'
        },
        content: {
          headline: {
            append: ' for Tomorrow\'s Leaders'
          },
          subheadline: {
            replace: 'Elevate your {{business_type}} with sophisticated solutions designed for ambitious professionals',
            tone: 'bold'
          }
        },
        addSections: [
          {
            type: 'trust-bar',
            data: {
              items: ['500+ Professionals', 'Featured in Forbes', '4.9★ Rating']
            },
            position: 'after-cta'
          }
        ]
      },
      
      newComponents: [
        {
          type: 'social-proof-strip',
          position: 'after-hero',
          props: {
            title: 'Trusted by Industry Leaders',
            logos: ['tech-startup-1', 'finance-firm-2', 'consulting-3']
          },
          animations: ['fade-in-up']
        }
      ]
    },
    
    animations: {
      add: [
        {
          name: 'dynamic-counter',
          target: '.stat-number',
          trigger: 'onScroll',
          properties: {
            duration: 2000,
            countUp: true
          }
        }
      ],
      modify: {
        'luxury-fade-in': {
          duration: 1200 // Faster for younger audience
        }
      }
    },
    
    content: {
      replacements: {
        '{{business_type}}': 'career',
        '{{audience_name}}': 'ambitious professionals'
      }
    }
  },
  
  relationships: {
    enhances: [
      {
        answerId: 'luxury',
        effect: 'Modernizes luxury appeal for younger demographic',
        strength: 'moderate'
      }
    ],
    synergies: [
      {
        withAnswers: ['luxury'],
        effect: 'Creates aspirational premium brand for young achievers',
        bonusModifications: {
          components: {
            hero: {
              modifications: {
                layout: 'center'
              },
              addSections: [
                {
                  type: 'testimonial',
                  data: {
                    quote: 'The premium experience that matches my ambition',
                    author: 'Sarah Chen, 28, Tech Executive'
                  },
                  position: 'bottom'
                }
              ]
            }
          }
        }
      }
    ]
  },
  
  transition: {
    style: 'morph',
    duration: 600,
    stagger: 100,
    emphasis: {
      elements: ['.trust-bar', '.cta-button'],
      effect: 'pulse'
    }
  },
  
  preview: {
    hover: {
      instant: false,
      previewDepth: 'deep'
    },
    revert: {
      target: 'accumulated',
      transition: 'smooth'
    }
  },
  
  metadata: {
    reasoning: 'Young professionals appreciate luxury but need modern, achievement-focused messaging',
    expectedImpact: {
      professionalism: 4,
      modernity: 5,
      trustworthiness: 4,
      uniqueness: 4
    },
    tags: ['young-professionals', 'modern-luxury', 'aspirational']
  }
};