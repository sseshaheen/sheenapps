// Dynamic Preview Impact Generator - Creates context-aware impacts based on answer history

import { EnhancedIdealAIResponse } from './enhanced-ideal-ai-response';
import { logger } from '@/utils/logger';

// Types for answer history and context
export interface AnswerHistoryItem {
  questionId: string;
  answerId: string;
  label: string;
  timestamp: number;
  category: string;
}

export interface UserProfile {
  businessType: 'b2c' | 'b2b' | 'mixed' | 'unknown';
  marketPosition: 'premium' | 'value' | 'innovative' | 'established';
  customerJourney: 'simple' | 'complex' | 'educational' | 'consultative';
  brandArchetype: string;
  industryVertical?: string;
}

export interface VisualProfile {
  dominantColors: string[];
  colorMood: 'vibrant' | 'muted' | 'monochrome' | 'balanced';
  typographyStyle: 'modern' | 'classic' | 'playful' | 'technical';
  layoutComplexity: 'minimal' | 'balanced' | 'rich' | 'dense';
  interactionLevel: 'static' | 'subtle' | 'moderate' | 'dynamic';
  visualWeight: 'light' | 'medium' | 'heavy';
}

export interface GenerationContext {
  currentQuestion: {
    id: string;
    category: string;
  };
  selectedAnswer: {
    id: string;
    label: string;
    implications: string[];
  };
  answerHistory: AnswerHistoryItem[];
  userProfile: UserProfile;
  visualProfile: VisualProfile;
  stage: number; // 1-5 representing question progress
}

// Synergy definitions
interface SynergyRule {
  answers: string[]; // Answer IDs that create synergy
  effect: string;
  strength: 'subtle' | 'moderate' | 'strong';
  modifications: Partial<EnhancedIdealAIResponse['modifications']>;
}

// Conflict definitions
interface ConflictRule {
  answers: string[]; // Answer IDs that conflict
  reason: string;
  severity: 'minor' | 'major';
  resolution: 'blend' | 'prioritize-latest' | 'neutralize';
}

// Main Dynamic Impact Generator Class
export class DynamicImpactGenerator {
  private synergyRules: SynergyRule[] = [];
  private conflictRules: ConflictRule[] = [];
  
  constructor() {
    this.initializeRules();
  }
  
  // Initialize synergy and conflict rules
  private initializeRules(): void {
    // Synergy Rules
    this.synergyRules = [
      // Luxury + Young Professionals
      {
        answers: ['luxury', 'young-professionals'],
        effect: 'Aspirational Premium - Creates sophisticated yet accessible brand',
        strength: 'strong',
        modifications: {
          content: {
            additions: {
              'aspirational-messaging': {
                type: 'text',
                content: 'Where ambition meets elegance',
                position: 'hero-subheadline'
              }
            }
          },
          components: {
            hero: {
              modifications: {
                layout: 'center'
              },
              visualEffects: {
                backgroundType: 'gradient',
                overlayOpacity: 0.2
              }
            }
          }
        }
      },
      
      // Tech-Savvy + AI-Powered
      {
        answers: ['tech-savvy', 'ai-powered'],
        effect: 'Innovation Leader - Positions as cutting-edge technology pioneer',
        strength: 'strong',
        modifications: {
          animations: {
            add: [
              {
                name: 'data-flow',
                target: '.feature-graphics',
                trigger: 'onScroll',
                properties: { duration: 3000 }
              }
            ]
          },
          colors: {
            accent: '#00D4FF',
            gradients: {
              'tech-gradient': 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
            }
          }
        }
      },
      
      // Family-Oriented + Trust-Focused
      {
        answers: ['families', 'trust-security'],
        effect: 'Safe Haven - Emphasizes reliability and protection',
        strength: 'moderate',
        modifications: {
          components: {
            hero: {
              modifications: {
                layout: 'center'
              },
              addSections: [
                {
                  type: 'trust-bar',
                  data: {
                    items: ['Family-Owned', 'Licensed & Insured', '24/7 Support']
                  },
                  position: 'after-cta'
                }
              ]
            }
          }
        }
      }
    ];
    
    // Conflict Rules
    this.conflictRules = [
      // Luxury vs Budget-Conscious
      {
        answers: ['luxury', 'budget-conscious'],
        reason: 'Premium positioning conflicts with value messaging',
        severity: 'major',
        resolution: 'blend'
      },
      
      // Playful vs Corporate
      {
        answers: ['playful', 'corporate'],
        reason: 'Tone mismatch between fun and professional',
        severity: 'minor',
        resolution: 'prioritize-latest'
      }
    ];
  }
  
  // Main generation method
  public generateImpact(context: GenerationContext): EnhancedIdealAIResponse {
    // Start with base modifications for the answer
    let modifications = this.getBaseModifications(context);
    
    // Apply stage-based enhancements
    modifications = this.applyStageEnhancements(modifications, context.stage);
    
    // Apply profile-based adjustments
    modifications = this.applyProfileAdjustments(modifications, context);
    
    // Check and apply synergies
    const synergies = this.findSynergies(context);
    modifications = this.applySynergies(modifications, synergies);
    
    // Check and resolve conflicts
    const conflicts = this.findConflicts(context);
    modifications = this.resolveConflicts(modifications, conflicts, context);
    
    // Ensure visual continuity
    modifications = this.ensureVisualContinuity(modifications, context.visualProfile);
    
    // Generate relationships
    const relationships = this.generateRelationships(context, synergies, conflicts);
    
    // Determine transition style
    const transition = this.determineTransition(context);
    
    return {
      type: 'incremental-update',
      responseId: `${context.currentQuestion.id}-${context.selectedAnswer.id}-${Date.now()}`,
      questionId: context.currentQuestion.id,
      answerId: context.selectedAnswer.id,
      
      context: {
        previousAnswers: context.answerHistory.map(a => ({
          questionId: a.questionId,
          answerId: a.answerId,
          label: a.label
        })),
        accumulatedProfile: {
          businessType: context.userProfile.businessType,
          brandPersonality: this.extractPersonalityTraits(context),
          targetAudience: this.extractAudienceTraits(context),
          keyFeatures: this.extractFeatures(context)
        }
      },
      
      modifications,
      relationships,
      transition,
      
      preview: {
        hover: {
          instant: false,
          previewDepth: 'deep'
        },
        revert: {
          target: context.stage > 1 ? 'accumulated' : 'base',
          transition: 'smooth'
        }
      },
      
      metadata: {
        reasoning: this.generateReasoning(context),
        expectedImpact: this.calculateExpectedImpact(context),
        tags: this.generateTags(context)
      }
    };
  }
  
  // Get base modifications for an answer
  private getBaseModifications(context: GenerationContext): EnhancedIdealAIResponse['modifications'] {
    // This would typically come from a database or configuration
    // For now, we'll generate based on answer type
    const { selectedAnswer, currentQuestion } = context;
    
    const baseModMap: Record<string, () => EnhancedIdealAIResponse['modifications']> = {
      // Brand Personality answers
      'luxury': () => ({
        colors: {
          primary: '#1a1a1a',
          secondary: '#c9a961',
          accent: '#f4f4f4',
          gradients: {
            'luxury': 'linear-gradient(135deg, #c9a961 0%, #d4af37 100%)'
          }
        },
        typography: {
          headingFont: 'Playfair Display',
          bodyFont: 'Inter',
          overrides: {
            h1: { weight: 300, size: '3.5rem' }
          }
        }
      }),
      
      'playful': () => ({
        colors: {
          primary: '#FF6B6B',
          secondary: '#4ECDC4',
          accent: '#FFE66D',
          gradients: {
            'playful': 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
          }
        },
        typography: {
          headingFont: 'Poppins',
          bodyFont: 'Open Sans',
          overrides: {
            h1: { weight: 700, size: '3rem' }
          }
        },
        animations: {
          add: [
            {
              name: 'bounce-in',
              target: '.hero-content',
              trigger: 'onLoad',
              properties: { duration: 800 }
            }
          ]
        }
      }),
      
      'tech-savvy': () => ({
        colors: {
          primary: '#0A0E27',
          secondary: '#4A90E2',
          accent: '#00D9FF',
          gradients: {
            'tech': 'linear-gradient(180deg, #0A0E27 0%, #1a237e 100%)'
          }
        },
        typography: {
          headingFont: 'Space Grotesk',
          bodyFont: 'Inter',
          overrides: {
            h1: { weight: 600, size: '3.25rem' }
          }
        },
        components: {
          hero: {
            modifications: {
              layout: 'center'
            },
            visualEffects: {
              particles: true,
              backgroundType: 'gradient'
            }
          }
        }
      }),
      
      // Target Audience answers
      'young-professionals': () => ({
        content: {
          replacements: {
            '{{audience_descriptor}}': 'ambitious professionals',
            '{{audience_need}}': 'efficiency and growth'
          }
        },
        components: {
          hero: {
            modifications: {
              layout: 'center'
            },
            content: {
              subheadline: {
                tone: 'bold'
              }
            },
            addSections: [
              {
                type: 'stats',
                data: {
                  stats: ['10K+ Users', '5-Min Setup', '2X Productivity']
                },
                position: 'after-cta'
              }
            ]
          }
        }
      }),
      
      'families': () => ({
        colors: {
          primary: '#2E7D32',
          accent: '#FF6F00'
        },
        content: {
          replacements: {
            '{{audience_descriptor}}': 'families',
            '{{audience_need}}': 'safety and simplicity'
          }
        },
        typography: {
          overrides: {
            body: { size: '1.125rem', lineHeight: 1.7 }
          }
        }
      }),
      
      'small-business-owners': () => ({
        components: {
          hero: {
            modifications: {
              layout: 'center',
              emphasis: 'content'
            },
            addSections: [
              {
                type: 'stats',
                data: {
                  stats: ['500+ Businesses Served', 'ROI Guaranteed', 'Expert Support']
                },
                position: 'after-cta'
              }
            ]
          }
        },
        colors: {
          accent: '#1976D2' // Business blue accent
        }
      }),
      
      // Question 3: Key Features (enhance existing)
      'booking-system': () => ({
        components: {
          newComponents: [
            {
              type: 'feature-highlight',
              position: 'after-hero',
              props: {
                title: 'Smart Booking System',
                features: ['Real-time availability', 'Automated reminders', 'Payment processing']
              }
            }
          ]
        },
        animations: {
          add: [
            {
              name: 'booking-flow',
              target: '.booking-demo',
              trigger: 'onScroll',
              properties: { duration: 2000 }
            }
          ]
        }
      }),
      
      'online-payments': () => ({
        components: {
          newComponents: [
            {
              type: 'payment-trust',
              position: 'after-hero',
              props: {
                title: 'Secure Payments',
                badges: ['SSL Encrypted', 'PCI Compliant', 'Instant Processing']
              }
            }
          ]
        },
        colors: {
          accent: '#4CAF50' // Trust green for payments
        }
      })
    };
    
    const generator = baseModMap[selectedAnswer.id];
    if (generator) {
      return generator();
    }
    
    // Fallback: generate basic modifications based on question category
    logger.info('🔄 No specific modification found for:', selectedAnswer.id, 'generating fallback for category:', currentQuestion.category);
    
    switch (currentQuestion.category) {
      case 'audience':
      case 'target-audience':
        return {
          components: {
            hero: {
              modifications: {
                layout: 'split'
              },
              addSections: [
                {
                  type: 'trust-bar',
                  data: {
                    items: [`Trusted by ${selectedAnswer.label}`, 'Proven Results', '5-Star Rated']
                  },
                  position: 'after-cta'
                }
              ]
            }
          },
          content: {
            replacements: {
              '{{audience_name}}': selectedAnswer.label.toLowerCase(),
              '{{business_focus}}': `solutions for ${selectedAnswer.label.toLowerCase()}`
            }
          }
        };
        
      case 'features':
      case 'key-features':
        return {
          components: {
            newComponents: [
              {
                type: 'feature-showcase',
                position: 'after-hero',
                props: {
                  title: selectedAnswer.label,
                  description: `Advanced ${selectedAnswer.label.toLowerCase()} capabilities`,
                  icon: '⚡'
                }
              }
            ]
          },
          animations: {
            add: [
              {
                name: 'feature-reveal',
                target: '.feature-showcase',
                trigger: 'onScroll',
                properties: { duration: 1000 }
              }
            ]
          }
        };
        
      case 'unique-value':
      case 'differentiator':
        return {
          components: {
            hero: {
              modifications: {
                layout: 'center'
              },
              content: {
                headline: {
                  append: ` - ${selectedAnswer.label}`
                }
              }
            },
            newComponents: [
              {
                type: 'value-proposition',
                position: 'after-hero',
                props: {
                  title: selectedAnswer.label,
                  highlight: true
                }
              }
            ]
          }
        };
        
      default:
        logger.info('⚠️ No fallback available for category:', currentQuestion.category);
        return {};
    }
  }
  
  // Apply enhancements based on progress stage
  private applyStageEnhancements(
    modifications: EnhancedIdealAIResponse['modifications'],
    stage: number
  ): EnhancedIdealAIResponse['modifications'] {
    const stageEnhancements: Record<number, Partial<EnhancedIdealAIResponse['modifications']>> = {
      1: {
        // Stage 1: Foundation - Focus on basic structure and colors
        globalStyles: {
          cssVariables: {
            '--complexity': '0.2',
            '--interaction-level': '0.1'
          }
        }
      },
      2: {
        // Stage 2: Personality emerging - Add character
        globalStyles: {
          cssVariables: {
            '--complexity': '0.4',
            '--interaction-level': '0.3'
          }
        }
      },
      3: {
        // Stage 3: Targeting - Add specific audience elements
        globalStyles: {
          cssVariables: {
            '--complexity': '0.6',
            '--interaction-level': '0.5'
          }
        }
      },
      4: {
        // Stage 4: Features - Rich interactions
        globalStyles: {
          cssVariables: {
            '--complexity': '0.8',
            '--interaction-level': '0.7'
          }
        },
        animations: {
          modify: {
            '*': { duration: 600 } // Speed up animations
          }
        }
      },
      5: {
        // Stage 5: Polish - Final refinements
        globalStyles: {
          cssVariables: {
            '--complexity': '1.0',
            '--interaction-level': '0.9'
          }
        }
      }
    };
    
    const enhancement = stageEnhancements[stage] || {};
    return this.deepMerge(modifications, enhancement);
  }
  
  // Apply adjustments based on accumulated profile
  private applyProfileAdjustments(
    modifications: EnhancedIdealAIResponse['modifications'],
    context: GenerationContext
  ): EnhancedIdealAIResponse['modifications'] {
    const { userProfile, visualProfile } = context;
    
    // Adjust based on market position
    if (userProfile.marketPosition === 'premium') {
      modifications.globalStyles = modifications.globalStyles || {};
      modifications.globalStyles.cssVariables = {
        ...modifications.globalStyles.cssVariables,
        '--spacing-multiplier': '1.5',
        '--shadow-intensity': '0.8'
      };
    }
    
    // Adjust based on visual complexity
    if (visualProfile.layoutComplexity === 'minimal') {
      modifications.components = modifications.components || {};
      // Remove complex sections
      if (modifications.components.hero?.addSections) {
        modifications.components.hero.addSections = 
          modifications.components.hero.addSections.filter(s => 
            !['testimonial', 'feature-list'].includes(s.type)
          );
      }
    }
    
    return modifications;
  }
  
  // Find applicable synergies
  private findSynergies(context: GenerationContext): SynergyRule[] {
    const allAnswerIds = [
      ...context.answerHistory.map(a => a.answerId),
      context.selectedAnswer.id
    ];
    
    return this.synergyRules.filter(rule =>
      rule.answers.every(answerId => allAnswerIds.includes(answerId))
    );
  }
  
  // Apply synergistic modifications
  private applySynergies(
    modifications: EnhancedIdealAIResponse['modifications'],
    synergies: SynergyRule[]
  ): EnhancedIdealAIResponse['modifications'] {
    let result = modifications;
    
    synergies.forEach(synergy => {
      result = this.deepMerge(result, synergy.modifications);
    });
    
    return result;
  }
  
  // Find conflicts
  private findConflicts(context: GenerationContext): ConflictRule[] {
    const allAnswerIds = [
      ...context.answerHistory.map(a => a.answerId),
      context.selectedAnswer.id
    ];
    
    return this.conflictRules.filter(rule =>
      rule.answers.every(answerId => allAnswerIds.includes(answerId))
    );
  }
  
  // Resolve conflicts
  private resolveConflicts(
    modifications: EnhancedIdealAIResponse['modifications'],
    conflicts: ConflictRule[],
    context: GenerationContext
  ): EnhancedIdealAIResponse['modifications'] {
    if (conflicts.length === 0) return modifications;
    
    let result = modifications;
    
    conflicts.forEach(conflict => {
      switch (conflict.resolution) {
        case 'blend':
          // Blend conflicting styles
          if (result.colors) {
            result.colors = this.blendColors(result.colors);
          }
          break;
          
        case 'prioritize-latest':
          // Latest answer takes precedence
          // Already handled by default behavior
          break;
          
        case 'neutralize':
          // Remove conflicting elements
          result = this.neutralizeConflicts(result, conflict);
          break;
      }
    });
    
    return result;
  }
  
  // Ensure visual continuity
  private ensureVisualContinuity(
    modifications: EnhancedIdealAIResponse['modifications'],
    visualProfile: VisualProfile
  ): EnhancedIdealAIResponse['modifications'] {
    // Ensure color harmony
    if (modifications.colors && visualProfile.colorMood === 'muted') {
      modifications.colors = this.muteColors(modifications.colors);
    }
    
    // Ensure typography consistency
    if (modifications.typography && visualProfile.typographyStyle === 'classic') {
      modifications.typography.overrides = modifications.typography.overrides || {};
      // Ensure classic proportions
      if (modifications.typography.overrides.h1) {
        modifications.typography.overrides.h1.lineHeight = 1.2;
      }
    }
    
    return modifications;
  }
  
  // Generate relationships
  private generateRelationships(
    context: GenerationContext,
    synergies: SynergyRule[],
    conflicts: ConflictRule[]
  ): EnhancedIdealAIResponse['relationships'] {
    return {
      enhances: context.answerHistory
        .filter(a => this.isEnhancing(a, context.selectedAnswer))
        .map(a => ({
          answerId: a.answerId,
          effect: `Builds upon ${a.label} foundation`,
          strength: this.calculateEnhancementStrength(a, context.selectedAnswer)
        })),
      
      conflicts: conflicts.map(c => ({
        answerId: c.answers.find(a => a !== context.selectedAnswer.id) || '',
        reason: c.reason,
        severity: c.severity
      })),
      
      synergies: synergies.map(s => ({
        withAnswers: s.answers.filter(a => a !== context.selectedAnswer.id),
        effect: s.effect,
        bonusModifications: s.modifications
      }))
    };
  }
  
  // Determine transition style
  private determineTransition(context: GenerationContext): EnhancedIdealAIResponse['transition'] {
    const { stage, visualProfile } = context;
    
    // More dramatic transitions as we progress
    const styles = ['fade', 'morph', 'slide', 'grow'];
    const style = styles[Math.min(stage - 1, styles.length - 1)] as any;
    
    // Faster transitions for dynamic profiles
    const baseDuration = visualProfile.interactionLevel === 'dynamic' ? 400 : 600;
    
    return {
      style,
      duration: baseDuration + (stage * 100),
      stagger: stage > 2 ? 50 : 0,
      emphasis: stage > 3 ? {
        elements: ['.hero-content', '.new-section'],
        effect: 'pulse'
      } : undefined,
      interpolation: {
        colorBlending: 'hsl',
        layoutShift: 'smooth'
      }
    };
  }
  
  // Helper methods
  private deepMerge(target: any, source: any): any {
    const output = { ...target };
    if (isObject(target) && isObject(source)) {
      Object.keys(source).forEach(key => {
        if (isObject(source[key])) {
          if (!(key in target)) {
            Object.assign(output, { [key]: source[key] });
          } else {
            output[key] = this.deepMerge(target[key], source[key]);
          }
        } else {
          Object.assign(output, { [key]: source[key] });
        }
      });
    }
    return output;
  }
  
  private blendColors(colors: any): any {
    // Simple color blending logic
    return colors;
  }
  
  private muteColors(colors: any): any {
    // Reduce saturation of colors
    return colors;
  }
  
  private neutralizeConflicts(
    modifications: EnhancedIdealAIResponse['modifications'],
    conflict: ConflictRule
  ): EnhancedIdealAIResponse['modifications'] {
    // Remove conflicting elements
    return modifications;
  }
  
  private isEnhancing(previous: AnswerHistoryItem, current: any): boolean {
    // Logic to determine if answers enhance each other
    return true;
  }
  
  private calculateEnhancementStrength(
    previous: AnswerHistoryItem,
    current: any
  ): 'subtle' | 'moderate' | 'strong' {
    return 'moderate';
  }
  
  private extractPersonalityTraits(context: GenerationContext): string[] {
    return context.answerHistory
      .filter(a => a.category === 'personality')
      .map(a => a.label);
  }
  
  private extractAudienceTraits(context: GenerationContext): string[] {
    return context.answerHistory
      .filter(a => a.category === 'audience')
      .map(a => a.label);
  }
  
  private extractFeatures(context: GenerationContext): string[] {
    return context.answerHistory
      .filter(a => a.category === 'features')
      .map(a => a.label);
  }
  
  private generateReasoning(context: GenerationContext): string {
    return `Applied ${context.selectedAnswer.label} modifications considering ${context.answerHistory.length} previous choices`;
  }
  
  private calculateExpectedImpact(context: GenerationContext): any {
    return {
      professionalism: 3,
      modernity: 4,
      trustworthiness: 4,
      uniqueness: 3
    };
  }
  
  private generateTags(context: GenerationContext): string[] {
    return [
      context.selectedAnswer.id,
      context.currentQuestion.category,
      `stage-${context.stage}`
    ];
  }
}

// Utility function
function isObject(item: any): boolean {
  return item && typeof item === 'object' && !Array.isArray(item);
}