/**
 * Plan Name Translation Utility
 * Maps backend plan enum to localized display names
 */

import type { PlanName } from '@/types/billing'

export function getLocalizedPlanName(
  plan: PlanName,
  pricingTranslations: any
): string {
  const planKey = plan.toLowerCase()
  return pricingTranslations?.plans?.[planKey]?.name || plan
}
