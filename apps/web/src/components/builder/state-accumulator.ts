// State Accumulator System for Managing Cumulative Preview Impacts

import { EnhancedIdealAIResponse } from './enhanced-ideal-ai-response';

// Core state interfaces
export interface BaseState {
  structure: {
    layout: 'default' | 'modern' | 'classic';
    sections: string[];
  };
  theme: {
    mode: 'light' | 'dark' | 'auto';
    baseline: 'neutral' | 'warm' | 'cool';
  };
  defaults: {
    colors: Record<string, string>;
    typography: Record<string, any>;
    spacing: Record<string, string>;
    animations: string[];
  };
}

export interface LayerState {
  id: string;
  questionId: string;
  answerId: string;
  timestamp: number;
  modifications: EnhancedIdealAIResponse['modifications'];
  relationships: EnhancedIdealAIResponse['relationships'];
  metadata: {
    source: string;
    priority: number;
  };
}

export interface ComputedState extends BaseState {
  // Merged result of all layers
  colors: Record<string, string>;
  typography: Record<string, any>;
  components: Record<string, any>;
  animations: Array<any>;
  content: Record<string, any>;
  globalStyles: Record<string, any>;
  
  // Layer tracking
  appliedLayers: string[];
  activeEffects: string[];
}

// Main State Accumulator Class
export class StateAccumulator {
  private baseState: BaseState;
  private layers: Map<string, LayerState> = new Map();
  private computedState: ComputedState | null = null;
  private history: ComputedState[] = [];
  
  constructor(baseState: BaseState) {
    this.baseState = baseState;
    this.computedState = this.initializeComputedState();
  }
  
  // Initialize computed state from base
  private initializeComputedState(): ComputedState {
    return {
      ...this.baseState,
      colors: { ...this.baseState.defaults.colors },
      typography: { ...this.baseState.defaults.typography },
      components: {},
      animations: [...this.baseState.defaults.animations],
      content: {},
      globalStyles: {},
      appliedLayers: [],
      activeEffects: []
    };
  }
  
  // Add a new layer from AI response
  public addLayer(response: EnhancedIdealAIResponse): ComputedState {
    const layer: LayerState = {
      id: response.responseId,
      questionId: response.questionId,
      answerId: response.answerId,
      timestamp: Date.now(),
      modifications: response.modifications,
      relationships: response.relationships,
      metadata: {
        source: 'ai-response',
        priority: this.calculatePriority(response)
      }
    };
    
    // Store layer
    this.layers.set(layer.id, layer);
    
    // Save current state to history
    if (this.computedState) {
      this.history.push({ ...this.computedState });
    }
    
    // Recompute state with new layer
    this.computedState = this.computeState();
    
    // Apply synergies if any
    this.applySynergies(response);
    
    return this.computedState;
  }
  
  // Remove a layer and all subsequent layers
  public removeLayer(layerId: string): ComputedState {
    const layer = this.layers.get(layerId);
    if (!layer) return this.computedState!;
    
    // Find all layers added after this one
    const layersToRemove = Array.from(this.layers.values())
      .filter(l => l.timestamp >= layer.timestamp)
      .map(l => l.id);
    
    // Remove layers
    layersToRemove.forEach(id => this.layers.delete(id));
    
    // Recompute state
    this.computedState = this.computeState();
    return this.computedState;
  }
  
  // Main computation logic - merge all layers
  private computeState(): ComputedState {
    // Start with fresh computed state
    let state = this.initializeComputedState();
    
    // Sort layers by timestamp
    const sortedLayers = Array.from(this.layers.values())
      .sort((a, b) => a.timestamp - b.timestamp);
    
    // Apply each layer in order
    sortedLayers.forEach(layer => {
      state = this.applyLayer(state, layer);
      state.appliedLayers.push(layer.id);
    });
    
    return state;
  }
  
  // Apply a single layer to the state
  private applyLayer(state: ComputedState, layer: LayerState): ComputedState {
    const newState = { ...state };
    const mods = layer.modifications;
    
    // Merge colors
    if (mods.colors) {
      newState.colors = this.mergeColors(state.colors, mods.colors);
    }
    
    // Merge typography
    if (mods.typography) {
      newState.typography = this.mergeTypography(state.typography, mods.typography);
    }
    
    // Merge components
    if (mods.components) {
      newState.components = this.mergeComponents(state.components, mods.components);
    }
    
    // Merge animations
    if (mods.animations) {
      newState.animations = this.mergeAnimations(state.animations, mods.animations);
    }
    
    // Merge content
    if (mods.content) {
      newState.content = this.mergeContent(state.content, mods.content);
    }
    
    // Merge global styles
    if (mods.globalStyles) {
      newState.globalStyles = this.mergeGlobalStyles(state.globalStyles, mods.globalStyles);
    }
    
    return newState;
  }
  
  // Intelligent color merging
  private mergeColors(existing: Record<string, string>, updates: any): Record<string, string> {
    const merged = { ...existing };
    
    // Direct color updates
    if (updates.primary) merged.primary = updates.primary;
    if (updates.secondary) merged.secondary = updates.secondary;
    if (updates.accent) merged.accent = updates.accent;
    
    // Background colors
    if (updates.background) {
      if (updates.background.light) merged['background-light'] = updates.background.light;
      if (updates.background.dark) merged['background-dark'] = updates.background.dark;
    }
    
    // Text colors
    if (updates.text) {
      if (updates.text.primary) merged['text-primary'] = updates.text.primary;
      if (updates.text.secondary) merged['text-secondary'] = updates.text.secondary;
      if (updates.text.accent) merged['text-accent'] = updates.text.accent;
    }
    
    // Gradients
    if (updates.gradients) {
      Object.entries(updates.gradients).forEach(([key, value]) => {
        merged[`gradient-${key}`] = value as string;
      });
    }
    
    return merged;
  }
  
  // Typography merging with inheritance
  private mergeTypography(existing: Record<string, any>, updates: any): Record<string, any> {
    const merged = { ...existing };
    
    // Font updates
    if (updates.headingFont) merged.headingFont = updates.headingFont;
    if (updates.bodyFont) merged.bodyFont = updates.bodyFont;
    
    // Scale multiplication
    if (updates.scale) {
      merged.scale = (merged.scale || 1) * updates.scale;
    }
    
    // Weight updates
    if (updates.weights) {
      merged.weights = { ...merged.weights, ...updates.weights };
    }
    
    // Specific overrides
    if (updates.overrides) {
      merged.overrides = merged.overrides || {};
      Object.entries(updates.overrides).forEach(([key, value]) => {
        merged.overrides[key] = { ...(merged.overrides[key] || {}), ...(value as any) };
      });
    }
    
    return merged;
  }
  
  // Component merging with modifications
  private mergeComponents(existing: Record<string, any>, updates: any): Record<string, any> {
    const merged = { ...existing };
    
    // Process each component update
    Object.entries(updates).forEach(([componentName, componentUpdates]: [string, any]) => {
      if (componentName === 'newComponents') {
        // Add new components
        merged.additionalComponents = merged.additionalComponents || [];
        merged.additionalComponents.push(...(componentUpdates as any[]));
      } else {
        // Merge existing component modifications
        merged[componentName] = this.mergeComponentModifications(
          merged[componentName] || {},
          componentUpdates
        );
      }
    });
    
    return merged;
  }
  
  // Deep merge for component modifications
  private mergeComponentModifications(existing: any, updates: any): any {
    const merged = { ...existing };
    
    // Merge modifications
    if (updates.modifications) {
      merged.modifications = { ...merged.modifications, ...updates.modifications };
    }
    
    // Add elements
    if (updates.addElements) {
      merged.elements = merged.elements || [];
      merged.elements.push(...updates.addElements);
    }
    
    // Remove elements
    if (updates.removeElements) {
      merged.removedElements = merged.removedElements || [];
      merged.removedElements.push(...updates.removeElements);
    }
    
    // Merge element styles
    if (updates.elementStyles) {
      merged.elementStyles = { ...merged.elementStyles, ...updates.elementStyles };
    }
    
    // Merge content updates
    if (updates.content) {
      merged.content = this.mergeComponentContent(merged.content, updates.content);
    }
    
    // Add sections
    if (updates.addSections) {
      merged.sections = merged.sections || [];
      merged.sections.push(...updates.addSections);
    }
    
    // Visual effects
    if (updates.visualEffects) {
      merged.visualEffects = { ...merged.visualEffects, ...updates.visualEffects };
    }
    
    return merged;
  }
  
  // Content merging for components
  private mergeComponentContent(existing: any = {}, updates: any): any {
    const merged = { ...existing };
    
    // Merge headline updates
    if (updates.headline) {
      merged.headline = merged.headline || {};
      if (updates.headline.prepend) {
        merged.headline.text = updates.headline.prepend + (merged.headline.text || '');
      }
      if (updates.headline.append) {
        merged.headline.text = (merged.headline.text || '') + updates.headline.append;
      }
      if (updates.headline.replace) {
        merged.headline.text = updates.headline.replace;
      }
      if (updates.headline.style) {
        merged.headline.style = { ...merged.headline.style, ...updates.headline.style };
      }
    }
    
    // Similar logic for subheadline
    if (updates.subheadline) {
      merged.subheadline = { ...merged.subheadline, ...updates.subheadline };
    }
    
    return merged;
  }
  
  // Animation merging
  private mergeAnimations(existing: any[], updates: any): any[] {
    let merged = [...existing];
    
    // Add new animations
    if (updates.add) {
      merged = [...merged, ...updates.add];
    }
    
    // Remove animations
    if (updates.remove) {
      merged = merged.filter(anim => 
        !updates.remove.includes(anim.name || anim)
      );
    }
    
    // Modify existing animations
    if (updates.modify) {
      merged = merged.map(anim => {
        const animName = anim.name || anim;
        if (updates.modify[animName]) {
          return { ...anim, ...updates.modify[animName] };
        }
        return anim;
      });
    }
    
    return merged;
  }
  
  // Content merging
  private mergeContent(existing: Record<string, any>, updates: any): Record<string, any> {
    const merged = { ...existing };
    
    // Replacements
    if (updates.replacements) {
      merged.replacements = { ...merged.replacements, ...updates.replacements };
    }
    
    // Additions
    if (updates.additions) {
      merged.additions = { ...merged.additions, ...updates.additions };
    }
    
    return merged;
  }
  
  // Global styles merging
  private mergeGlobalStyles(existing: Record<string, any>, updates: any): Record<string, any> {
    const merged = { ...existing };
    
    // CSS variables
    if (updates.cssVariables) {
      merged.cssVariables = { ...merged.cssVariables, ...updates.cssVariables };
    }
    
    // Utilities
    if (updates.utilities) {
      merged.utilities = { ...merged.utilities, ...updates.utilities };
    }
    
    return merged;
  }
  
  // Apply synergistic effects
  private applySynergies(response: EnhancedIdealAIResponse): void {
    if (!response.relationships.synergies) return;
    
    response.relationships.synergies.forEach(synergy => {
      // Check if all required answers are present
      const hasAllAnswers = synergy.withAnswers.every(answerId =>
        Array.from(this.layers.values()).some(layer => layer.answerId === answerId)
      );
      
      if (hasAllAnswers && synergy.bonusModifications) {
        // Create a synthetic layer for synergy effects
        const synergyLayer: LayerState = {
          id: `synergy-${Date.now()}`,
          questionId: 'synergy',
          answerId: 'bonus',
          timestamp: Date.now(),
          modifications: synergy.bonusModifications,
          relationships: { enhances: [], conflicts: [], synergies: [] },
          metadata: {
            source: 'synergy',
            priority: 10 // High priority for synergies
          }
        };
        
        // Apply the synergy layer
        this.computedState = this.applyLayer(this.computedState!, synergyLayer);
        this.computedState.activeEffects.push(synergy.effect);
      }
    });
  }
  
  // Calculate layer priority
  private calculatePriority(response: EnhancedIdealAIResponse): number {
    // Later questions have higher priority
    const questionPriorities: Record<string, number> = {
      'brand-personality': 1,
      'target-audience': 2,
      'key-features': 3,
      'unique-value': 4,
      'growth-stage': 5
    };
    
    return questionPriorities[response.questionId] || 0;
  }
  
  // Get current state
  public getState(): ComputedState {
    return this.computedState!;
  }
  
  // Get state at specific point
  public getStateAtLayer(layerId: string): ComputedState | null {
    const tempAccumulator = new StateAccumulator(this.baseState);
    const sortedLayers = Array.from(this.layers.values())
      .sort((a, b) => a.timestamp - b.timestamp);
    
    for (const layer of sortedLayers) {
      tempAccumulator.layers.set(layer.id, layer);
      if (layer.id === layerId) break;
    }
    
    return tempAccumulator.computeState();
  }
  
  // Get layer history
  public getLayerHistory(): LayerState[] {
    return Array.from(this.layers.values())
      .sort((a, b) => a.timestamp - b.timestamp);
  }
  
  // Reset to base state
  public reset(): void {
    this.layers.clear();
    this.history = [];
    this.computedState = this.initializeComputedState();
  }
  
  // Export state for debugging
  public exportState(): any {
    return {
      baseState: this.baseState,
      layers: Array.from(this.layers.entries()),
      computedState: this.computedState,
      history: this.history
    };
  }
}

// Helper function to create default base state
export function createDefaultBaseState(): BaseState {
  return {
    structure: {
      layout: 'default',
      sections: ['header', 'hero', 'features', 'testimonials', 'cta', 'footer']
    },
    theme: {
      mode: 'light',
      baseline: 'neutral'
    },
    defaults: {
      colors: {
        primary: '#000000',
        secondary: '#666666',
        accent: '#0066ff',
        'background-light': '#ffffff',
        'background-dark': '#000000',
        'text-primary': '#000000',
        'text-secondary': '#666666',
        'text-accent': '#0066ff'
      },
      typography: {
        headingFont: 'Inter',
        bodyFont: 'Inter',
        scale: 1,
        weights: {
          light: 300,
          regular: 400,
          bold: 700
        }
      },
      spacing: {
        xs: '0.25rem',
        sm: '0.5rem',
        md: '1rem',
        lg: '2rem',
        xl: '4rem'
      },
      animations: ['fade-in']
    }
  };
}