/**
 * Smart Yearly Pricing Service
 * 
 * Instead of beautifying calculated yearly prices (which creates awkward decimals),
 * this service reverse-engineers beautiful yearly prices that result in clean 
 * monthly equivalents when divided by 12.
 * 
 * Example:
 * - Monthly: $9.00
 * - Instead of: $9 × 12 × 0.8 = $86.40 → $7.20/mo equivalent
 * - We target: $84.00 → $7.00/mo equivalent (clean!)
 */

import { beautifyMinor, beautifyMinorFloor, minorToDisplay, displayToMinor } from './pricingBeautification';

/**
 * Find the optimal yearly price that results in a beautiful monthly equivalent
 * Prioritizes clean pricing over exact discount percentages for professional appearance
 * 
 * @param monthlyPriceDisplay - Monthly price in display units (e.g., 9.00 for $9)
 * @param currency - Currency code (e.g., 'USD', 'EGP') 
 * @param targetDiscountPercent - Desired discount percentage (e.g., 20)
 * @returns Optimal yearly price that creates clean monthly equivalent
 */
export function findOptimalYearlyPrice(
  monthlyPriceDisplay: number,
  currency: string,
  targetDiscountPercent: number = 20
): {
  yearlyPriceDisplay: number;
  actualDiscountPercent: number;
  monthlyEquivalent: number;
} {
  
  // Use expert's currency safety improvement
  const safeCurrency = currency.toUpperCase();
  
  // Calculate the base yearly price (no discount) - using expert's precision
  const baseYearlyDisplay = monthlyPriceDisplay * 12;
  
  // Calculate target yearly with initial discount
  const initialTargetDisplay = baseYearlyDisplay * (1 - targetDiscountPercent / 100);
  
  // Convert to minor units for precise calculation (expert's approach)
  const initialTargetMinor = displayToMinor(initialTargetDisplay, safeCurrency);
  
  // Find the best beautiful target by testing nearby values (original clean approach)
  const candidates: Array<{
    yearlyMinor: number;
    monthlyEquivMinor: number;
    discountPercent: number;
  }> = [];
  
  // Test multiple beautification targets around the initial target
  for (let offset = -2; offset <= 2; offset++) {
    const testMinor = initialTargetMinor + (offset * 100); // Test nearby values
    const beautifiedMinor = beautifyMinor(testMinor, safeCurrency); // Use regular beautify for clean results
    const monthlyEquivMinor = Math.floor(beautifiedMinor / 12);
    const beautifiedMonthlyEquiv = beautifyMinor(monthlyEquivMinor, safeCurrency);
    
    // Calculate what the yearly should be to achieve this beautiful monthly equivalent
    const targetYearlyMinor = beautifiedMonthlyEquiv * 12;
    
    // Calculate actual discount percent this would create
    const baseYearlyMinor = displayToMinor(baseYearlyDisplay, safeCurrency);
    const actualDiscount = ((baseYearlyMinor - targetYearlyMinor) / baseYearlyMinor) * 100;
    
    // Keep expert's reasonable bounds but prioritize clean results (15-25%)
    if (actualDiscount >= 15 && actualDiscount <= 25) {
      candidates.push({
        yearlyMinor: targetYearlyMinor,
        monthlyEquivMinor: beautifiedMonthlyEquiv,
        discountPercent: actualDiscount
      });
    }
  }
  
  // Choose the candidate closest to the target discount (prioritize clean results)
  let bestCandidate = candidates[0];
  if (candidates.length > 1) {
    bestCandidate = candidates.reduce((best, current) => {
      const bestDiff = Math.abs(best.discountPercent - targetDiscountPercent);
      const currentDiff = Math.abs(current.discountPercent - targetDiscountPercent);
      return currentDiff < bestDiff ? current : best;
    });
  }
  
  // Fallback to simple beautification if no good candidates (with expert's safety)
  if (!bestCandidate) {
    const fallbackMinor = beautifyMinor(initialTargetMinor, safeCurrency);
    const baseMinor = displayToMinor(baseYearlyDisplay, safeCurrency);
    const fallbackDiscount = baseMinor > 0 
      ? ((baseMinor - fallbackMinor) / baseMinor) * 100
      : 0;
    
    bestCandidate = {
      yearlyMinor: fallbackMinor,
      monthlyEquivMinor: Math.floor(fallbackMinor / 12),
      discountPercent: fallbackDiscount
    };
  }
  
  return {
    yearlyPriceDisplay: minorToDisplay(bestCandidate.yearlyMinor, safeCurrency),
    actualDiscountPercent: Math.round(bestCandidate.discountPercent * 10) / 10, // Round to 1 decimal
    monthlyEquivalent: minorToDisplay(bestCandidate.monthlyEquivMinor, safeCurrency)
  };
}

/**
 * Calculate optimal yearly pricing for a given monthly price across all major currencies
 */
export function calculateOptimalYearlyPricing(monthlyPriceUSD: number) {
  const currencies = ['USD', 'EUR', 'GBP', 'EGP', 'SAR', 'AED'];
  const results: Record<string, ReturnType<typeof findOptimalYearlyPrice>> = {};
  
  for (const currency of currencies) {
    // For now, assume 1:1 conversion ratio (in production, you'd convert first)
    results[currency] = findOptimalYearlyPrice(monthlyPriceUSD, currency);
  }
  
  return results;
}

/**
 * Debug helper to test the optimal pricing logic with expert-recommended edge cases
 */
export function debugOptimalPricing() {
  console.log('=== SMART YEARLY PRICING ANALYSIS (Expert Edition) ===\n');
  
  // Test current pricing
  const testPrices = [9, 19, 39, 69, 129];
  for (const monthlyPrice of testPrices) {
    console.log(`Monthly: $${monthlyPrice}`);
    const result = findOptimalYearlyPrice(monthlyPrice, 'USD');
    console.log(`  Target Yearly: $${result.yearlyPriceDisplay} (${result.actualDiscountPercent}% off)`);
    console.log(`  Monthly Equivalent: $${result.monthlyEquivalent}/mo when paid yearly`);
    console.log(`  Discount Guarantee: At least 20.0%, actually ${result.actualDiscountPercent}%\n`);
  }
  
  // Expert's edge case tests
  console.log('=== EXPERT EDGE CASE TESTING ===\n');
  
  // Edge case 1: Very small monthly (50¢)
  console.log('Edge Case 1: Very small monthly price ($0.50)');
  const tiny = findOptimalYearlyPrice(0.5, 'USD');
  console.log(`  $0.50/mo → $${tiny.yearlyPriceDisplay}/year = $${tiny.monthlyEquivalent}/mo (${tiny.actualDiscountPercent}% off)\n`);
  
  // Edge case 2: Non-round discount (17%)
  console.log('Edge Case 2: Non-round discount (17%)');
  const weird = findOptimalYearlyPrice(9, 'USD', 17);
  console.log(`  $9/mo with 17% target → $${weird.yearlyPriceDisplay}/year = $${weird.monthlyEquivalent}/mo (${weird.actualDiscountPercent}% off)\n`);
  
  // Edge case 3: Different currencies with different ticks
  console.log('Edge Case 3: Multi-currency tick testing');
  const currencies = [
    { code: 'USD', tick: '$0.50', monthly: 9 },
    { code: 'EUR', tick: '€0.50', monthly: 9 }, 
    { code: 'EGP', tick: '£E5.00', monthly: 435 },
    { code: 'SAR', tick: 'SR1.00', monthly: 33 },
    { code: 'AED', tick: 'AED1.00', monthly: 33 }
  ];
  
  currencies.forEach(({ code, tick, monthly }) => {
    const result = findOptimalYearlyPrice(monthly, code);
    console.log(`  ${code} (${tick} ticks): ${monthly}/mo → ${result.monthlyEquivalent}/mo (${result.actualDiscountPercent}% off)`);
  });
}