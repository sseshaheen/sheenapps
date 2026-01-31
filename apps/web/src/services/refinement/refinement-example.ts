import { logger } from '@/utils/logger';

// App Refinement Framework - Practical Implementation Example
// Demonstrates how the framework processes real user prompts

import type { 
  PromptAnalysisResult, 
  BusinessContext, 
  RefinementDecision,
  DecisionOption,
  PreviewImpact 
} from '@/types/app-refinement'

// ===== EXAMPLE USER PROMPTS =====

const EXAMPLE_PROMPTS = {
  simple: "I want to build a booking app for my hair salon",
  
  detailed: `I run a premium hair salon in downtown LA. I need an app where clients can:
  - Book appointments online
  - See our services and prices
  - View stylist profiles
  - Get appointment reminders
  - Leave reviews
  I want it to feel luxurious but easy to use. Most of my clients are busy professionals who use their phones for everything.`,
  
  complex: `I'm launching a fitness coaching business that combines in-person training, online courses, and nutrition consulting. I need a platform where:
  - Clients can book 1-on-1 sessions
  - Access my workout video library  
  - Track their progress
  - Get meal plans
  - Connect with other clients
  - Make payments for different services
  The target audience is health-conscious professionals aged 25-45 who value premium experiences and are willing to pay for quality.`
}

// ===== PROMPT ANALYSIS EXAMPLES =====

export class ExamplePromptAnalyzer {
  
  static analyzeSimplePrompt(prompt: string): PromptAnalysisResult {
    // Example: "I want to build a booking app for my hair salon"
    return {
      explicit: {
        businessType: 'hair salon',
        mentionedFeatures: ['booking', 'appointments'],
        statedGoals: ['online booking system'],
        constraints: [],
      },
      
      implicit: {
        industryBestPractices: [
          'appointment scheduling',
          'service catalog', 
          'stylist profiles',
          'pricing display',
          'customer reviews'
        ],
        likelyTargetAudience: {
          demographics: 'mixed',
          techSavviness: 'medium', 
          devicePreference: 'mobile-first'
        },
        complexityIndicators: ['appointment management'],
        urgencySignals: 'planning'
      },
      
      missing: {
        criticalQuestions: [
          'What services do you offer?',
          'How many stylists work there?',
          'Do you want online payments?',
          'What makes your salon special?'
        ],
        assumptions: [
          {
            assumption: 'Single location salon',
            confidence: 0.8,
            impact: 'medium'
          },
          {
            assumption: 'Local customer base',
            confidence: 0.9,
            impact: 'high'
          }
        ],
        uncertainties: [
          'Business size and scale',
          'Target customer demographics',
          'Competitive positioning'
        ]
      },
      
      recommendedFlow: {
        startingPoint: 'app-architecture',
        priorityOrder: [
          'app-architecture',
          'visual-foundation', 
          'business-features',
          'user-access',
          'mobile-experience',
          'personality-details'
        ],
        skipReasons: {
          'content-strategy': 'Simple business model with clear content needs',
          'interaction-model': 'Standard booking flow applies'
        },
        focusAreas: ['business-features', 'mobile-experience']
      }
    }
  }

  static analyzeDetailedPrompt(prompt: string): PromptAnalysisResult {
    // Analysis of the detailed salon prompt
    return {
      explicit: {
        businessType: 'premium hair salon',
        mentionedFeatures: [
          'booking system',
          'services and pricing',
          'stylist profiles', 
          'appointment reminders',
          'review system'
        ],
        statedGoals: [
          'online appointment booking',
          'showcase premium services',
          'mobile-first experience'
        ],
        constraints: ['busy professional clients', 'mobile-focused'],
        budget: 'high', // Inferred from "premium"
        timeline: 'flexible'
      },
      
      implicit: {
        industryBestPractices: [
          'luxury brand presentation',
          'streamlined booking flow',
          'professional photography',
          'social proof integration',
          'reminder automation'
        ],
        likelyTargetAudience: {
          demographics: 'professionals',
          techSavviness: 'high',
          devicePreference: 'mobile-first',
          pricesensitivity: 'premium'
        },
        complexityIndicators: [
          'multi-stylist management',
          'service categorization',
          'review management',
          'notification system'
        ],
        urgencySignals: 'planning'
      },
      
      missing: {
        criticalQuestions: [
          'How many stylists?',
          'Service pricing strategy?',
          'Booking policies?',
          'Brand personality details?'
        ],
        assumptions: [
          {
            assumption: 'High-end market positioning',
            confidence: 0.95,
            impact: 'high'
          },
          {
            assumption: 'Local business with premium clientele',
            confidence: 0.85,
            impact: 'high'
          }
        ],
        uncertainties: [
          'Specific luxury brand personality',
          'Integration requirements',
          'Competitive landscape'
        ]
      },
      
      recommendedFlow: {
        startingPoint: 'visual-foundation', // Start with brand for premium businesses
        priorityOrder: [
          'visual-foundation',
          'app-architecture',
          'business-features',
          'mobile-experience',
          'communication-style',
          'personality-details'
        ],
        skipReasons: {},
        focusAreas: ['visual-foundation', 'business-features', 'mobile-experience']
      }
    }
  }
}

// ===== DECISION GENERATION EXAMPLES =====

export class ExampleDecisionGenerator {
  
  static generateAppArchitectureDecision(context: Partial<BusinessContext>): RefinementDecision {
    return {
      categoryId: 'app-architecture',
      category: {
        id: 'app-architecture',
        name: 'App Architecture',
        description: 'How should your app be structured?',
        impact: 'foundation',
        priority: 1
      },
      options: [
        {
          id: 'single-page',
          title: 'Single Page Experience',
          description: 'Everything accessible from one scrollable interface',
          shortDescription: 'All-in-one page with sections',
          bestFor: ['Simple businesses', 'Quick interactions', 'Mobile users'],
          pros: [
            'Fast navigation',
            'Mobile-friendly',
            'Easy to understand'
          ],
          cons: [
            'Can feel crowded with lots of content',
            'Less suitable for complex workflows'
          ],
          previewImpact: {
            type: 'layout_update',
            priority: 'high',
            affects: ['main-layout', 'navigation', 'content-structure'],
            changes: {
              layout: {
                structure: 'single-page',
                navigation: 'header',
                spacing: 'comfortable'
              }
            }
          },
          estimatedComplexity: 'low'
        },
        
        {
          id: 'multi-page',
          title: 'Multi-Page Journey',
          description: 'Traditional navigation between different pages',
          shortDescription: 'Separate pages for different functions',
          bestFor: ['Complex businesses', 'Detailed content', 'Desktop users'],
          pros: [
            'Organized content structure', 
            'Familiar user experience',
            'SEO advantages'
          ],
          cons: [
            'More navigation required',
            'Potentially slower on mobile'
          ],
          previewImpact: {
            type: 'layout_update',
            priority: 'high', 
            affects: ['main-layout', 'navigation', 'routing'],
            changes: {
              layout: {
                structure: 'multi-page',
                navigation: 'header',
                spacing: 'spacious'
              }
            }
          },
          estimatedComplexity: 'medium'
        },
        
        {
          id: 'dashboard',
          title: 'Dashboard Interface',
          description: 'Central hub with quick access to all tools',
          shortDescription: 'Control center with widgets and shortcuts',
          bestFor: ['Business tools', 'Power users', 'Data-heavy apps'],
          pros: [
            'Efficient for frequent users',
            'Great for business applications',
            'Customizable layouts'
          ],
          cons: [
            'Learning curve for new users',
            'Can be overwhelming initially'
          ],
          previewImpact: {
            type: 'layout_update',
            priority: 'high',
            affects: ['main-layout', 'navigation', 'widgets'],
            changes: {
              layout: {
                structure: 'dashboard',
                navigation: 'sidebar',
                grid: 'custom',
                spacing: 'compact'
              }
            }
          },
          estimatedComplexity: 'high'
        },
        
        {
          id: 'wizard-flow',
          title: 'Wizard Flow',
          description: 'Step-by-step guided process',
          shortDescription: 'Guided steps with clear progression',
          bestFor: ['Complex processes', 'First-time users', 'Onboarding'],
          pros: [
            'Prevents user confusion',
            'Ensures completion',
            'Great for complex workflows'
          ],
          cons: [
            'Less flexible navigation',
            'Can feel restrictive to experienced users'
          ],
          previewImpact: {
            type: 'layout_update',
            priority: 'high',
            affects: ['main-layout', 'navigation', 'progress-indicators'],
            changes: {
              layout: {
                structure: 'wizard',
                navigation: 'footer',
                spacing: 'spacious'
              }
            }
          },
          estimatedComplexity: 'medium'
        }
      ],
      reasoning: context.businessModel === 'b2b' 
        ? "Business applications often benefit from organized, efficient interfaces"
        : "Consumer apps typically prioritize simplicity and ease of use",
      context: "This choice affects how users navigate your app and sets the foundation for all other decisions."
    }
  }

  static generateVisualFoundationDecision(context: Partial<BusinessContext>): RefinementDecision {
    const isPremium = context.industry === 'salon' && context.scale === 'local'
    
    return {
      categoryId: 'visual-foundation',
      category: {
        id: 'visual-foundation',
        name: 'Visual Foundation',
        description: 'What personality should your app convey?',
        impact: 'foundation',
        priority: 3
      },
      options: [
        {
          id: 'clean-professional',
          title: 'Clean & Professional',
          description: 'Corporate, trustworthy, efficient aesthetic',
          shortDescription: 'Business-focused with clean lines',
          bestFor: ['B2B services', 'Healthcare', 'Finance', 'Consulting'],
          pros: [
            'Builds immediate trust',
            'Appeals to business users', 
            'Timeless design approach'
          ],
          previewImpact: {
            type: 'theme_change',
            priority: 'high',
            affects: ['color-scheme', 'typography', 'components'],
            changes: {
              styling: {
                colorScheme: {
                  primary: '#2563eb', // Professional blue
                  secondary: '#64748b', // Neutral gray
                  accent: '#059669', // Success green
                  background: '#ffffff',
                  text: '#1e293b'
                },
                typography: {
                  headingFont: 'Inter',
                  bodyFont: 'Inter', 
                  scale: 'medium'
                },
                components: {
                  buttons: 'sharp',
                  cards: 'border',
                  inputs: 'outlined'
                }
              }
            }
          },
          estimatedComplexity: 'low'
        },
        
        {
          id: 'warm-approachable',
          title: 'Warm & Approachable',
          description: 'Friendly, personal, community-focused feel',
          shortDescription: 'Welcoming with soft, friendly elements',
          bestFor: ['Local businesses', 'Healthcare', 'Education', 'Community'],
          pros: [
            'Creates emotional connection',
            'Approachable to all users',
            'Great for service businesses'
          ],
          previewImpact: {
            type: 'theme_change',
            priority: 'high',
            affects: ['color-scheme', 'typography', 'components'],
            changes: {
              styling: {
                colorScheme: {
                  primary: '#f59e0b', // Warm orange
                  secondary: '#8b5cf6', // Friendly purple
                  accent: '#10b981', // Fresh green
                  background: '#fefefe',
                  text: '#374151'
                },
                typography: {
                  headingFont: 'Poppins',
                  bodyFont: 'Source Sans Pro',
                  scale: 'medium'
                },
                components: {
                  buttons: 'rounded',
                  cards: 'shadow',
                  inputs: 'filled'
                }
              }
            }
          },
          estimatedComplexity: 'low'
        },
        
        {
          id: 'modern-bold',
          title: 'Modern & Bold',
          description: 'Cutting-edge, innovative, tech-forward design',
          shortDescription: 'Contemporary with striking visual elements',
          bestFor: ['Tech startups', 'Creative agencies', 'Modern brands'],
          pros: [
            'Stands out from competition',
            'Appeals to younger demographics',
            'Shows innovation'
          ],
          previewImpact: {
            type: 'theme_change',
            priority: 'high',
            affects: ['color-scheme', 'typography', 'components'],
            changes: {
              styling: {
                colorScheme: {
                  primary: '#8b5cf6', // Bold purple
                  secondary: '#06b6d4', // Electric cyan
                  accent: '#f43f5e', // Vibrant pink
                  background: '#0f172a',
                  text: '#f8fafc'
                },
                typography: {
                  headingFont: 'Outfit',
                  bodyFont: 'DM Sans',
                  scale: 'large'
                },
                components: {
                  buttons: 'pill',
                  cards: 'elevated',
                  inputs: 'underlined'
                }
              }
            }
          },
          estimatedComplexity: 'medium'
        },
        
        {
          id: 'luxury-premium',
          title: 'Luxury & Premium',
          description: 'Sophisticated, elegant, high-end aesthetic',
          shortDescription: 'Upscale with refined, elegant details',
          bestFor: ['Premium services', 'Luxury brands', 'High-end retail'],
          pros: [
            'Justifies premium pricing',
            'Appeals to affluent customers',
            'Creates aspirational brand'
          ],
          previewImpact: {
            type: 'theme_change',
            priority: 'high',
            affects: ['color-scheme', 'typography', 'components'],
            changes: {
              styling: {
                colorScheme: {
                  primary: '#1f2937', // Sophisticated dark
                  secondary: '#d4af37', // Luxury gold
                  accent: '#dc2626', // Rich red
                  background: '#ffffff',
                  text: '#111827'
                },
                typography: {
                  headingFont: 'Playfair Display',
                  bodyFont: 'Source Serif Pro',
                  scale: 'large'
                },
                components: {
                  buttons: 'minimal',
                  cards: 'border',
                  inputs: 'minimal'
                }
              }
            }
          },
          estimatedComplexity: 'medium'
        }
      ],
      reasoning: isPremium 
        ? "Premium salons benefit from sophisticated, luxury-focused design that matches client expectations"
        : "Your visual foundation should align with your target customers and business positioning",
      context: "This sets the overall look and feel of your app. You can refine details later, but this establishes the core aesthetic."
    }
  }
}

// ===== PREVIEW IMPACT EXAMPLES =====

export class ExamplePreviewEffects {
  
  static applyAppArchitectureChange(choice: string): PreviewImpact {
    const impacts: Record<string, PreviewImpact> = {
      'single-page': {
        type: 'layout_update',
        priority: 'high',
        affects: ['layout', 'navigation', 'scrolling'],
        changes: {
          layout: {
            structure: 'single-page',
            navigation: 'header',
            spacing: 'comfortable'
          },
          content: {
            density: 'moderate',
            messaging: {
              'nav-menu': 'Sections',
              'page-title': 'Your Salon',
              'main-cta': 'Book Now'
            }
          }
        }
      },
      
      'dashboard': {
        type: 'layout_update', 
        priority: 'high',
        affects: ['layout', 'navigation', 'widgets'],
        changes: {
          layout: {
            structure: 'dashboard',
            navigation: 'sidebar',
            grid: 'custom',
            spacing: 'compact'
          },
          features: {
            add: ['dashboard-widgets', 'quick-actions', 'stats-panel']
          },
          content: {
            density: 'detailed',
            messaging: {
              'nav-menu': 'Dashboard',
              'page-title': 'Business Center',
              'main-cta': 'View Analytics'
            }
          }
        }
      }
    }
    
    return impacts[choice] || impacts['single-page']
  }

  static applyVisualStyleChange(choice: string): PreviewImpact {
    const impacts: Record<string, PreviewImpact> = {
      'luxury-premium': {
        type: 'theme_change',
        priority: 'high',
        affects: ['colors', 'fonts', 'spacing', 'components'],
        changes: {
          styling: {
            colorScheme: {
              primary: '#1f2937',
              secondary: '#d4af37', 
              accent: '#dc2626',
              background: '#ffffff',
              text: '#111827'
            },
            typography: {
              headingFont: 'Playfair Display',
              bodyFont: 'Source Serif Pro',
              scale: 'large'
            },
            components: {
              buttons: 'minimal',
              cards: 'border', 
              inputs: 'minimal'
            }
          },
          content: {
            tone: 'professional',
            messaging: {
              'hero-title': 'Premium Beauty Experience',
              'hero-subtitle': 'Discover the art of exceptional hair care',
              'booking-cta': 'Reserve Your Appointment',
              'services-title': 'Our Signature Services'
            }
          }
        }
      },
      
      'warm-approachable': {
        type: 'theme_change',
        priority: 'high',
        affects: ['colors', 'fonts', 'spacing', 'components'],
        changes: {
          styling: {
            colorScheme: {
              primary: '#f59e0b',
              secondary: '#8b5cf6',
              accent: '#10b981',
              background: '#fefefe', 
              text: '#374151'
            },
            typography: {
              headingFont: 'Poppins',
              bodyFont: 'Source Sans Pro',
              scale: 'medium'
            },
            components: {
              buttons: 'rounded',
              cards: 'shadow',
              inputs: 'filled'
            }
          },
          content: {
            tone: 'friendly',
            messaging: {
              'hero-title': 'Welcome to Our Salon Family',
              'hero-subtitle': 'Where every visit feels like coming home',
              'booking-cta': 'Book Your Visit',
              'services-title': 'What We Do Best'
            }
          }
        }
      }
    }
    
    return impacts[choice] || impacts['warm-approachable']
  }
}

// ===== COMPOUND EFFECTS EXAMPLE =====

export class ExampleCompoundEffects {
  
  static calculateCompoundImpact(
    decisions: Record<string, string>,
    newDecision: { category: string, choice: string }
  ): PreviewImpact {
    
    // Example: Luxury salon with dashboard = luxury business control center
    if (decisions['visual-foundation'] === 'luxury-premium' && 
        newDecision.category === 'app-architecture' && 
        newDecision.choice === 'dashboard') {
      
      return {
        type: 'layout_update',
        priority: 'high',
        affects: ['layout', 'styling', 'features'],
        changes: {
          layout: {
            structure: 'dashboard',
            navigation: 'sidebar',
            spacing: 'spacious' // More space for luxury feel
          },
          styling: {
            components: {
              cards: 'elevated', // Premium elevated cards
              buttons: 'minimal', // Maintain luxury minimalism
              inputs: 'minimal' // Clean minimalist inputs
            }
          },
          features: {
            add: [
              'premium-analytics',
              'client-insights', 
              'revenue-tracking',
              'appointment-calendar'
            ]
          },
          content: {
            messaging: {
              'dashboard-title': 'Business Intelligence Center',
              'welcome-message': 'Manage your premium salon experience'
            }
          }
        },
        dependencies: ['visual-foundation']
      }
    }
    
    // Simple salon with single-page = streamlined booking focus
    if (decisions['visual-foundation'] === 'warm-approachable' &&
        newDecision.category === 'app-architecture' &&
        newDecision.choice === 'single-page') {
      
      return {
        type: 'layout_update',
        priority: 'high', 
        affects: ['layout', 'flow', 'focus'],
        changes: {
          layout: {
            structure: 'single-page',
            navigation: 'header',
            spacing: 'comfortable'
          },
          content: {
            density: 'minimal', // Focus on key actions
            messaging: {
              'main-focus': 'Book Your Appointment',
              'secondary-actions': 'View Services • Meet Our Team • Contact Us'
            }
          },
          features: {
            add: ['quick-booking', 'service-preview', 'team-showcase'],
            modify: {
              'booking-flow': 'simplified'
            }
          }
        },
        dependencies: ['visual-foundation']
      }
    }
    
    // Default single impact if no compound effect applies
    return ExamplePreviewEffects.applyAppArchitectureChange(newDecision.choice)
  }
}

// ===== USAGE EXAMPLE =====

export class RefinementFrameworkDemo {
  
  static async demonstrateFlow() {
    logger.info('=== App Refinement Framework Demo ===\n');
    
    // 1. Analyze user prompt
    const prompt = EXAMPLE_PROMPTS.detailed
    logger.info('User Prompt:', prompt);
    logger.info('\n');
    
    const analysis = ExamplePromptAnalyzer.analyzeDetailedPrompt(prompt)
    console.log('Analysis Result:', {
      businessType: analysis.explicit.businessType,
      keyFeatures: analysis.explicit.mentionedFeatures,
      targetAudience: analysis.implicit.likelyTargetAudience,
      recommendedStart: analysis.recommendedFlow.startingPoint
    })
    logger.info('\n');
    
    // 2. Generate first decision
    const firstDecision = ExampleDecisionGenerator.generateVisualFoundationDecision({
      industry: 'salon',
      businessModel: 'b2c'
    })
    
    logger.info('First Question:', firstDecision.category.description);
    logger.info('Options:', firstDecision.options.map(opt => opt.title))
    logger.info('\n');
    
    // 3. Apply user choice and show preview impact  
    const userChoice = 'luxury-premium'
    const previewImpact = ExamplePreviewEffects.applyVisualStyleChange(userChoice)
    
    logger.info('User Selected:', userChoice);
    console.log('Preview Changes:', {
      type: previewImpact.type,
      colorScheme: previewImpact.changes.styling?.colorScheme,
      messaging: previewImpact.changes.content?.messaging
    })
    logger.info('\n');
    
    // 4. Generate next decision with compound effects
    const decisions = { 'visual-foundation': userChoice }
    const architectureDecision = ExampleDecisionGenerator.generateAppArchitectureDecision({
      industry: 'salon',
      businessModel: 'b2c'
    })
    
    logger.info('Next Question:', architectureDecision.category.description);
    console.log('Context-Aware Options:', architectureDecision.options.map(opt => ({
      title: opt.title,
      bestFor: opt.bestFor
    })))
    
    // 5. Show compound effect
    const compoundImpact = ExampleCompoundEffects.calculateCompoundImpact(
      decisions, 
      { category: 'app-architecture', choice: 'dashboard' }
    )
    
    logger.info('\nCompound Effect (Luxury + Dashboard);:')
    logger.info('Enhanced Features:', compoundImpact.changes.features?.add);
    logger.info('Adjusted Messaging:', compoundImpact.changes.content?.messaging);
  }
}

// Run the demo
// RefinementFrameworkDemo.demonstrateFlow()