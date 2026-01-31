// Import all preview impacts
import { luxuryPremiumImpact } from './luxury-premium-impact'
import { warmApproachableImpact } from './warm-approachable-impact'
import { modernMinimalImpact } from './modern-minimal-impact'
import { boldVibrantImpact } from './bold-vibrant-impact'
import { classicTimelessImpact } from './classic-timeless-impact'
import { boutiqueExclusiveImpact } from './boutique-exclusive-impact'
import { ecoNaturalImpact } from './eco-natural-impact'
import { techModernImpact } from './tech-modern-impact'
import { familiesChildrenImpact } from './families-children-impact'
import { youngProfessionalsImpact } from './young-professionals-impact'
import { trendyYouthImpact } from './trendy-youth-impact'

// Export all preview impacts for easy import
export { luxuryPremiumImpact, warmApproachableImpact, modernMinimalImpact, boldVibrantImpact, classicTimelessImpact, boutiqueExclusiveImpact, ecoNaturalImpact, techModernImpact, familiesChildrenImpact, youngProfessionalsImpact, trendyYouthImpact }

// Map for easy lookup by choice ID
export const PREVIEW_IMPACTS = {
  'luxury-premium': luxuryPremiumImpact,
  'warm-approachable': warmApproachableImpact,
  'modern-minimal': modernMinimalImpact,
  'bold-vibrant': boldVibrantImpact,
  'classic-timeless': classicTimelessImpact,
  'boutique-exclusive': boutiqueExclusiveImpact,
  'eco-natural': ecoNaturalImpact,
  'tech-modern': techModernImpact,
  'families-children': familiesChildrenImpact,
  'young-professionals': youngProfessionalsImpact,
  'trendy-youth': trendyYouthImpact
} as const

export type ChoiceId = keyof typeof PREVIEW_IMPACTS