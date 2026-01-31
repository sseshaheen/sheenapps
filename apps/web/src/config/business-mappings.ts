/**
 * Business name mappings for different layout/personality choices
 * Centralized configuration to avoid hardcoding in components
 */

export const SALON_BUSINESS_NAMES: Record<string, string> = {
  'luxury-premium': 'ÉLITE SALON',
  'warm-approachable': 'Sunny Side Salon',
  'modern-minimal': 'MONO Salon',
  'bold-vibrant': 'VIVID Studio',
  'classic-timeless': 'Heritage Salon',
  'boutique-exclusive': 'THE ATELIER',
  'eco-natural': 'Pure Elements Salon',
  'tech-modern': 'NEXUS Beauty Lab',
  'families-children': 'Family Tree Salon',
  'young-professionals': 'SHARP Studios',
  'trendy-youth': 'BUZZ Salon'
}

export const DEFAULT_SALON_NAME = 'ÉLITE SALON'
export const DEFAULT_BUSINESS_NAME = 'Your Business'

/**
 * Get the appropriate business name for a given layout/choice ID
 */
export function getBusinessNameForLayout(
  choiceId: string | undefined,
  isSalon: boolean
): string {
  if (!isSalon) return DEFAULT_BUSINESS_NAME
  
  const id = choiceId || 'luxury-premium'
  return SALON_BUSINESS_NAMES[id] || DEFAULT_SALON_NAME
}