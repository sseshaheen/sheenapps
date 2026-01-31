// Salon Response Matrix - Central Export Hub
// Aggregates all layout-specific responses for organized access

import { luxuryPremiumResponses } from './layouts/luxury-premium'
import { warmApproachableResponses } from './layouts/warm-approachable'
import { modernMinimalResponses } from './layouts/modern-minimal'
import { boldVibrantResponses } from './layouts/bold-vibrant'
import type { AIComponentResponse } from '../types'
import { logger } from '@/utils/logger';

export interface SalonResponseMatrix {
  [layoutId: string]: {
    [section: string]: {
      [suggestion: string]: AIComponentResponse
    }
  }
}

// Central response matrix combining all layouts
export const salonResponseMatrix: SalonResponseMatrix = {
  'luxury-premium': luxuryPremiumResponses,
  'warm-approachable': warmApproachableResponses,
  'modern-minimal': modernMinimalResponses,
  'bold-vibrant': boldVibrantResponses
}

// Helper function to get response by layout, section, and suggestion
export function getSalonResponse(
  layout: string,
  section: string,
  suggestion: string
): AIComponentResponse | null {
  const normalizedSuggestion = normalizeSuggestion(suggestion)
  
  // First try exact match
  const exactMatch = salonResponseMatrix[layout]?.[section]?.[normalizedSuggestion]
  if (exactMatch) return exactMatch
  
  // Try to find partial matches
  const sectionResponses = salonResponseMatrix[layout]?.[section]
  if (!sectionResponses) return null
  
  // Check if the user input contains key words from our suggestions
  const suggestionLower = suggestion.toLowerCase()
  logger.info(`🔍 Checking partial matches for "${suggestion}" (normalized: "${normalizedSuggestion}")`)
  logger.info(`🔍 Available keys:`, Object.keys(sectionResponses))
  
  for (const [key, response] of Object.entries(sectionResponses)) {
    // Check if key words match
    if (suggestionLower.includes('visual') && key.includes('visual')) return response
    if (suggestionLower.includes('pricing') && key.includes('pricing')) return response
    if (suggestionLower.includes('testimonial') && key.includes('testimonial')) return response
    if (suggestionLower.includes('layout') && key.includes('layout')) return response
    if (suggestionLower.includes('professional') && key.includes('professional')) return response
    if (suggestionLower.includes('contact') && key.includes('contact')) return response
    if (suggestionLower.includes('social') && key.includes('social')) return response
    if (suggestionLower.includes('logo') && key.includes('logo')) return response
    if (suggestionLower.includes('modern') && key.includes('modern')) return response
    if (suggestionLower.includes('booking') && key.includes('booking')) return response
    if (suggestionLower.includes('color') && key.includes('color')) return response
    if (suggestionLower.includes('compelling') && key.includes('compelling')) return response
    if (suggestionLower.includes('star') && key.includes('star')) return response
    if (suggestionLower.includes('rating') && key.includes('rating')) return response
    if (suggestionLower.includes('review') && key.includes('review')) return response
    if (suggestionLower.includes('style') && key.includes('style')) return response
    
  }
  
  return null
}

// Helper function to normalize suggestion text for consistent lookup
function normalizeSuggestion(suggestion: string): string {
  return suggestion
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // Remove punctuation
    .replace(/\s+/g, '-')        // Replace spaces with hyphens
    .trim()
}

// Get all available layouts
export function getAvailableLayouts(): string[] {
  return Object.keys(salonResponseMatrix)
}

// Get all suggestions for a specific layout and section
export function getSuggestionsForSection(layout: string, section: string): string[] {
  const sectionResponses = salonResponseMatrix[layout]?.[section]
  return sectionResponses ? Object.keys(sectionResponses) : []
}

// Export individual layout responses for direct access if needed
export {
  luxuryPremiumResponses,
  warmApproachableResponses,
  modernMinimalResponses,
  boldVibrantResponses
}

