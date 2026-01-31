// Transition System for Progressive Enhancement
// Handles smooth visual transitions that show how choices build upon each other

import { ComputedState } from './state-accumulator';
import { EnhancedIdealAIResponse } from './enhanced-ideal-ai-response';
import { logger } from '@/utils/logger';

// Types for transitions
export interface TransitionConfig {
  style: 'instant' | 'fade' | 'morph' | 'slide' | 'grow' | 'layer' | 'ripple';
  duration: number;
  stagger?: number;
  emphasis?: {
    elements: string[];
    effect: 'glow' | 'scale' | 'shake' | 'pulse' | 'highlight';
  };
  interpolation?: {
    colorBlending: 'rgb' | 'hsl' | 'lab';
    layoutShift: 'smooth' | 'stepped';
  };
}

export interface TransitionStep {
  property: string;
  from: any;
  to: any;
  duration: number;
  delay: number;
  easing: string;
}

export interface TransitionPlan {
  steps: TransitionStep[];
  totalDuration: number;
  focusAreas: string[];
  narrative: string;
}

// Visual diff for identifying changes
interface VisualDiff {
  colors: { property: string; from: string; to: string }[];
  typography: { property: string; from: any; to: any }[];
  layout: { element: string; changes: string[] }[];
  additions: { element: string; type: string }[];
  removals: { element: string }[];
  animations: { name: string; action: 'add' | 'remove' | 'modify' }[];
}

// Main Transition System Class
export class TransitionSystem {
  private currentState: ComputedState | null = null;
  private transitionQueue: TransitionPlan[] = [];
  private isTransitioning: boolean = false;
  
  // Transition style definitions
  private transitionStyles = {
    instant: {
      duration: 0,
      easing: 'linear',
      narrative: 'Immediate update'
    },
    fade: {
      duration: 500,
      easing: 'ease-in-out',
      narrative: 'Gentle crossfade between states'
    },
    morph: {
      duration: 800,
      easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
      narrative: 'Smooth transformation of elements'
    },
    slide: {
      duration: 600,
      easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      narrative: 'Elements slide into new positions'
    },
    grow: {
      duration: 700,
      easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      narrative: 'New elements grow from existing ones'
    },
    layer: {
      duration: 900,
      easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
      narrative: 'New layer appears on top of existing'
    },
    ripple: {
      duration: 1000,
      easing: 'cubic-bezier(0.4, 0, 0.6, 1)',
      narrative: 'Changes ripple outward from focus point'
    }
  };
  
  // Plan a transition from current state to new state
  public planTransition(
    fromState: ComputedState,
    toState: ComputedState,
    config: TransitionConfig,
    impactResponse: EnhancedIdealAIResponse
  ): TransitionPlan {
    // Calculate visual diff
    const diff = this.calculateDiff(fromState, toState);
    
    // Generate transition steps based on diff and config
    const steps = this.generateTransitionSteps(diff, config, impactResponse);
    
    // Identify focus areas
    const focusAreas = this.identifyFocusAreas(diff, impactResponse);
    
    // Create narrative description
    const narrative = this.createTransitionNarrative(diff, config, impactResponse);
    
    const plan: TransitionPlan = {
      steps,
      totalDuration: Math.max(...steps.map(s => s.duration + s.delay)),
      focusAreas,
      narrative
    };
    
    return plan;
  }
  
  // Execute a transition plan
  public async executeTransition(plan: TransitionPlan): Promise<void> {
    if (this.isTransitioning) {
      this.transitionQueue.push(plan);
      return;
    }
    
    this.isTransitioning = true;
    
    try {
      // Group steps by delay for parallel execution
      const stepGroups = this.groupStepsByDelay(plan.steps);
      
      // Execute each group
      for (const group of stepGroups) {
        await Promise.all(
          group.steps.map(step => this.executeStep(step))
        );
      }
      
      // Apply emphasis effects if configured
      if (plan.focusAreas.length > 0) {
        await this.applyEmphasisEffects(plan.focusAreas);
      }
      
    } finally {
      this.isTransitioning = false;
      
      // Process queued transitions
      if (this.transitionQueue.length > 0) {
        const nextPlan = this.transitionQueue.shift()!;
        await this.executeTransition(nextPlan);
      }
    }
  }
  
  // Calculate visual differences between states
  private calculateDiff(from: ComputedState, to: ComputedState): VisualDiff {
    const diff: VisualDiff = {
      colors: [],
      typography: [],
      layout: [],
      additions: [],
      removals: [],
      animations: []
    };
    
    // Compare colors
    Object.keys(to.colors).forEach(key => {
      if (from.colors[key] !== to.colors[key]) {
        diff.colors.push({
          property: key,
          from: from.colors[key] || 'transparent',
          to: to.colors[key]
        });
      }
    });
    
    // Compare typography
    Object.keys(to.typography).forEach(key => {
      if (JSON.stringify(from.typography[key]) !== JSON.stringify(to.typography[key])) {
        diff.typography.push({
          property: key,
          from: from.typography[key],
          to: to.typography[key]
        });
      }
    });
    
    // Compare components (simplified for example)
    const fromComponents = Object.keys(from.components);
    const toComponents = Object.keys(to.components);
    
    toComponents.forEach(comp => {
      if (!fromComponents.includes(comp)) {
        diff.additions.push({ element: comp, type: 'component' });
      }
    });
    
    fromComponents.forEach(comp => {
      if (!toComponents.includes(comp)) {
        diff.removals.push({ element: comp });
      }
    });
    
    // Compare animations
    const fromAnimNames = from.animations.map(a => a.name || a);
    const toAnimNames = to.animations.map(a => a.name || a);
    
    toAnimNames.forEach(name => {
      if (!fromAnimNames.includes(name)) {
        diff.animations.push({ name, action: 'add' });
      }
    });
    
    fromAnimNames.forEach(name => {
      if (!toAnimNames.includes(name)) {
        diff.animations.push({ name, action: 'remove' });
      }
    });
    
    return diff;
  }
  
  // Generate transition steps from diff
  private generateTransitionSteps(
    diff: VisualDiff,
    config: TransitionConfig,
    response: EnhancedIdealAIResponse
  ): TransitionStep[] {
    const steps: TransitionStep[] = [];
    const baseStyle = this.transitionStyles[config.style];
    let currentDelay = 0;
    
    // Color transitions
    diff.colors.forEach((colorChange, index) => {
      steps.push({
        property: `color-${colorChange.property}`,
        from: colorChange.from,
        to: colorChange.to,
        duration: baseStyle.duration,
        delay: currentDelay + (config.stagger || 0) * index,
        easing: baseStyle.easing
      });
    });
    
    // Typography transitions
    if (diff.typography.length > 0) {
      currentDelay += 100; // Slight delay for typography
      diff.typography.forEach((typoChange, index) => {
        steps.push({
          property: `typography-${typoChange.property}`,
          from: typoChange.from,
          to: typoChange.to,
          duration: baseStyle.duration * 0.8,
          delay: currentDelay + (config.stagger || 0) * index,
          easing: baseStyle.easing
        });
      });
    }
    
    // Component additions with special effects
    if (diff.additions.length > 0) {
      currentDelay += 200; // More delay for new elements
      diff.additions.forEach((addition, index) => {
        const effect = this.getAdditionEffect(config.style);
        steps.push({
          property: `add-${addition.element}`,
          from: effect.from,
          to: effect.to,
          duration: baseStyle.duration * 1.2,
          delay: currentDelay + (config.stagger || 0) * index * 2,
          easing: effect.easing || baseStyle.easing
        });
      });
    }
    
    // Component removals
    diff.removals.forEach((removal, index) => {
      steps.push({
        property: `remove-${removal.element}`,
        from: { opacity: 1, scale: 1 },
        to: { opacity: 0, scale: 0.95 },
        duration: baseStyle.duration * 0.6,
        delay: 0, // Remove immediately
        easing: 'ease-in'
      });
    });
    
    // Animation changes
    diff.animations.forEach((animChange, index) => {
      if (animChange.action === 'add') {
        steps.push({
          property: `animation-${animChange.name}`,
          from: { active: false },
          to: { active: true },
          duration: 100,
          delay: baseStyle.duration,
          easing: 'linear'
        });
      }
    });
    
    return steps;
  }
  
  // Get addition effect based on transition style
  private getAdditionEffect(style: TransitionConfig['style']): any {
    const effects = {
      fade: {
        from: { opacity: 0 },
        to: { opacity: 1 }
      },
      morph: {
        from: { opacity: 0, scale: 0.8, y: 20 },
        to: { opacity: 1, scale: 1, y: 0 }
      },
      slide: {
        from: { opacity: 0, x: -50 },
        to: { opacity: 1, x: 0 }
      },
      grow: {
        from: { opacity: 0, scale: 0, transformOrigin: 'center' },
        to: { opacity: 1, scale: 1, transformOrigin: 'center' },
        easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)'
      },
      layer: {
        from: { opacity: 0, z: -100 },
        to: { opacity: 1, z: 0 }
      },
      ripple: {
        from: { opacity: 0, scale: 0, transformOrigin: 'center' },
        to: { opacity: 1, scale: 1, transformOrigin: 'center' },
        easing: 'cubic-bezier(0.4, 0, 0.6, 1)'
      }
    };
    
    return effects[style] || effects.fade;
  }
  
  // Identify areas to focus on during transition
  private identifyFocusAreas(
    diff: VisualDiff,
    response: EnhancedIdealAIResponse
  ): string[] {
    const areas: string[] = [];
    
    // Areas with significant changes
    if (diff.colors.length > 3) {
      areas.push('.color-scheme');
    }
    
    if (diff.additions.length > 0) {
      areas.push(...diff.additions.map(a => `.${a.element}`));
    }
    
    // Areas specified in the response
    if (response.transition.emphasis) {
      areas.push(...response.transition.emphasis.elements);
    }
    
    // Key components that changed
    if (response.modifications.components?.hero) {
      areas.push('.hero-content');
    }
    
    if (response.modifications.components?.header) {
      areas.push('.site-header');
    }
    
    return [...new Set(areas)]; // Remove duplicates
  }
  
  // Create a narrative description of the transition
  private createTransitionNarrative(
    diff: VisualDiff,
    config: TransitionConfig,
    response: EnhancedIdealAIResponse
  ): string {
    const parts: string[] = [];
    
    // Base narrative
    parts.push(this.transitionStyles[config.style].narrative);
    
    // Describe major changes
    if (diff.colors.length > 0) {
      parts.push(`Color scheme shifts to reflect ${response.answerId} personality`);
    }
    
    if (diff.additions.length > 0) {
      parts.push(`New ${diff.additions[0].type} emerges to support ${response.context.accumulatedProfile.brandPersonality.join(', ')}`);
    }
    
    if (response.relationships.synergies && response.relationships.synergies.length > 0) {
      parts.push(`Elements harmonize to create ${response.relationships.synergies[0].effect}`);
    }
    
    return parts.join('. ') + '.';
  }
  
  // Group steps by delay for parallel execution
  private groupStepsByDelay(steps: TransitionStep[]): { delay: number; steps: TransitionStep[] }[] {
    const groups = new Map<number, TransitionStep[]>();
    
    steps.forEach(step => {
      if (!groups.has(step.delay)) {
        groups.set(step.delay, []);
      }
      groups.get(step.delay)!.push(step);
    });
    
    return Array.from(groups.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([delay, steps]) => ({ delay, steps }));
  }
  
  // Execute a single transition step
  private async executeStep(step: TransitionStep): Promise<void> {
    // Wait for delay
    if (step.delay > 0) {
      await this.wait(step.delay);
    }
    
    // This would integrate with your actual rendering system
    // For now, we'll just log the transition
    console.log(`Transitioning ${step.property}:`, {
      from: step.from,
      to: step.to,
      duration: step.duration,
      easing: step.easing
    });
    
    // Simulate transition duration
    await this.wait(step.duration);
  }
  
  // Apply emphasis effects to focus areas
  private async applyEmphasisEffects(focusAreas: string[]): Promise<void> {
    logger.info('Applying emphasis to:', focusAreas);
    // This would apply visual emphasis effects like glow, scale, etc.
    await this.wait(300);
  }
  
  // Utility wait function
  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  // Get transition recommendation based on context
  public recommendTransition(
    stage: number,
    changeIntensity: 'low' | 'medium' | 'high',
    previousStyle?: TransitionConfig['style']
  ): TransitionConfig {
    // Progressive enhancement through stages
    const stageStyles: Record<number, TransitionConfig['style'][]> = {
      1: ['fade', 'morph'],
      2: ['morph', 'slide'],
      3: ['slide', 'grow'],
      4: ['grow', 'layer'],
      5: ['layer', 'ripple']
    };
    
    // Duration based on change intensity
    const durations = {
      low: 400,
      medium: 600,
      high: 800
    };
    
    // Select style based on stage and variety
    const availableStyles = stageStyles[stage] || ['morph'];
    let selectedStyle = availableStyles[0];
    
    // Avoid repeating the same style
    if (previousStyle && availableStyles.includes(previousStyle)) {
      selectedStyle = availableStyles.find(s => s !== previousStyle) || availableStyles[0];
    }
    
    return {
      style: selectedStyle as TransitionConfig['style'],
      duration: durations[changeIntensity],
      stagger: stage > 2 ? 50 : 0,
      emphasis: stage > 3 ? {
        elements: ['.new-feature', '.updated-section'],
        effect: 'pulse'
      } : undefined,
      interpolation: {
        colorBlending: 'hsl',
        layoutShift: 'smooth'
      }
    };
  }
  
  // Preview a transition without executing
  public previewTransition(
    fromState: ComputedState,
    toState: ComputedState,
    config: TransitionConfig
  ): {
    duration: number;
    complexity: 'simple' | 'moderate' | 'complex';
    description: string;
  } {
    const diff = this.calculateDiff(fromState, toState);
    const totalChanges = 
      diff.colors.length + 
      diff.typography.length + 
      diff.additions.length + 
      diff.removals.length +
      diff.animations.length;
    
    const complexity = 
      totalChanges < 5 ? 'simple' :
      totalChanges < 15 ? 'moderate' : 
      'complex';
    
    const baseStyle = this.transitionStyles[config.style];
    const duration = baseStyle.duration + (config.stagger || 0) * Math.min(totalChanges, 10);
    
    return {
      duration,
      complexity,
      description: `${baseStyle.narrative} with ${totalChanges} changes over ${duration}ms`
    };
  }
}