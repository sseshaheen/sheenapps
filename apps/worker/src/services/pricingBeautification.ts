/**
 * Pricing Beautification Service
 * 
 * Handles currency-specific price beautification for professional pricing display.
 * Uses minor units approach (cents) to eliminate floating point precision issues.
 * 
 * Key principles:
 * - Work in minor units (cents) throughout to avoid floating point drift
 * - Use floor rounding for yearly prices to guarantee advertised discount
 * - Use nearest rounding for monthly prices for professional appearance
 * - Ensure Stripe checkout consistency by using same beautified prices
 */

export interface CurrencyRule {
  minorUnit: number;  // Decimal places for the currency (usually 2)
  tickMinor: number;  // Smallest professional tick in minor units
}

/**
 * Currency-specific beautification rules
 * Based on professional pricing standards for each currency
 */
export const CURRENCY_RULES: Record<string, CurrencyRule> = {
  USD: { minorUnit: 2, tickMinor: 50 },   // 50 cents = $0.50 ticks
  EUR: { minorUnit: 2, tickMinor: 50 },   // 50 cents = €0.50 ticks  
  GBP: { minorUnit: 2, tickMinor: 50 },   // 50 pence = £0.50 ticks
  EGP: { minorUnit: 2, tickMinor: 500 },  // 500 piastres = E£5.00 ticks
  SAR: { minorUnit: 2, tickMinor: 100 },  // 100 halalas = SR1.00 ticks
  AED: { minorUnit: 2, tickMinor: 100 },  // 100 fils = AED1.00 ticks
} as const;

/**
 * Round minor units (cents) to professional ticks using nearest rounding
 * Used for monthly prices where professional appearance is key
 */
export function beautifyMinor(amountMinor: number, currency: string): number {
  const rule = CURRENCY_RULES[currency.toUpperCase()];
  if (!rule) {
    // Fallback: round to nearest 50 minor units (0.50 equivalent)
    return Math.round(amountMinor / 50) * 50;
  }
  
  return Math.round(amountMinor / rule.tickMinor) * rule.tickMinor;
}

/**
 * Round minor units DOWN to professional ticks (floor rounding)
 * Used for yearly prices to guarantee "at least X%" discount (customer trust)
 * 
 * This ensures we never give customers less discount than advertised.
 * If we say "20% off", the final price guarantees at least 20% savings.
 */
export function beautifyMinorFloor(amountMinor: number, currency: string): number {
  const rule = CURRENCY_RULES[currency.toUpperCase()];
  if (!rule) {
    // Fallback: floor to 50 minor units (0.50 equivalent)  
    return Math.floor(amountMinor / 50) * 50;
  }
  
  return Math.floor(amountMinor / rule.tickMinor) * rule.tickMinor;
}

/**
 * Round minor units (cents) to professional ticks using floor rounding
 * Used for yearly prices to guarantee never overcharging (customer trust)
 * 
 * Floor rounding ensures that if we advertise "Save 20%", the customer
 * actually saves at least 20% (and potentially slightly more)
 */
export function beautifyYearlyMinor(amountMinor: number, currency: string): number {
  const rule = CURRENCY_RULES[currency];
  if (!rule) {
    return Math.floor(amountMinor / 50) * 50;
  }
  
  return Math.floor(amountMinor / rule.tickMinor) * rule.tickMinor;
}

/**
 * Convert minor units to display price
 * Handles currency-specific decimal places
 */
export function minorToDisplay(amountMinor: number, currency: string): number {
  const rule = CURRENCY_RULES[currency];
  const minorUnit = rule?.minorUnit || 2;  // Default to 2 decimal places
  
  return amountMinor / Math.pow(10, minorUnit);
}

/**
 * Convert display price to minor units
 * Handles currency-specific decimal places
 */
export function displayToMinor(displayAmount: number, currency: string): number {
  const rule = CURRENCY_RULES[currency];
  const minorUnit = rule?.minorUnit || 2;  // Default to 2 decimal places
  
  return Math.round(displayAmount * Math.pow(10, minorUnit));
}

/**
 * Get the professional tick size for a currency in display units
 * Useful for frontend to understand minimum price increments
 */
export function getCurrencyTickSize(currency: string): number {
  const rule = CURRENCY_RULES[currency];
  if (!rule) {
    return 0.50; // Default $0.50 equivalent
  }
  
  return minorToDisplay(rule.tickMinor, currency);
}

/**
 * Validate that a price follows professional pricing rules for the currency
 * Returns true if the price ends in appropriate ticks
 */
export function isBeautifiedPrice(displayAmount: number, currency: string): boolean {
  const amountMinor = displayToMinor(displayAmount, currency);
  const beautified = beautifyMinor(amountMinor, currency);
  
  return Math.abs(amountMinor - beautified) < 0.01; // Allow for tiny floating point differences
}

/**
 * Calculate displayed discount percentage from beautified prices (CRITICAL FOR MARKETING ACCURACY)
 * 
 * This ensures "Save X%" banners match exactly what users see in the UI.
 * Uses floor rounding to never overstate savings ("Save at least X%").
 * 
 * @param monthlyMinor - Beautified monthly price in minor units
 * @param yearlyMinor - Beautified yearly price in minor units  
 * @returns Discount percentage (0-100) that's safe to display
 */
export function calculateDisplayedDiscount(monthlyMinor: number, yearlyMinor: number): number {
  const annualFromMonthly = monthlyMinor * 12;
  if (annualFromMonthly === 0) return 0;
  
  const discountPct = (1 - (yearlyMinor / annualFromMonthly)) * 100;
  
  // Never overstate: round down to one decimal place
  // e.g., 20.3% → 20.3%, 20.09% → 20.0%
  return Math.max(0, Math.floor(discountPct * 10) / 10);
}

/**
 * Generate marketing-safe discount text from beautified prices
 * 
 * @param monthlyMinor - Beautified monthly price in minor units
 * @param yearlyMinor - Beautified yearly price in minor units
 * @returns Marketing text like "Save at least 20%" or "Save 20.5%" 
 */
export function generateDiscountText(monthlyMinor: number, yearlyMinor: number): string {
  const discount = calculateDisplayedDiscount(monthlyMinor, yearlyMinor);
  
  if (discount === 0) return '';
  
  // Format: remove unnecessary .0, keep meaningful decimals
  const formatted = discount % 1 === 0 ? discount.toString() : discount.toFixed(1);
  
  return `Save at least ${formatted}%`;
}

/**
 * Debug helper to show beautification results
 * Useful during development and testing
 */
export function debugBeautification(originalMinor: number, currency: string): {
  original: { minor: number; display: number };
  monthly: { minor: number; display: number };
  yearly: { minor: number; display: number };
  displayedDiscount: number;
  discountText: string;
  tickSize: number;
} {
  const monthlyMinor = beautifyMinor(originalMinor, currency);
  const yearlyMinor = beautifyYearlyMinor(originalMinor, currency);
  
  return {
    original: {
      minor: originalMinor,
      display: minorToDisplay(originalMinor, currency)
    },
    monthly: {
      minor: monthlyMinor,
      display: minorToDisplay(monthlyMinor, currency)
    },
    yearly: {
      minor: yearlyMinor,
      display: minorToDisplay(yearlyMinor, currency)
    },
    displayedDiscount: calculateDisplayedDiscount(monthlyMinor, yearlyMinor),
    discountText: generateDiscountText(monthlyMinor, yearlyMinor),
    tickSize: getCurrencyTickSize(currency)
  };
}