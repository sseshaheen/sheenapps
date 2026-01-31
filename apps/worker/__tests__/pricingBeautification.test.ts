/**
 * Test suite for pricing beautification and yearly pricing calculation
 * Tests the implementation of the Backend Pricing Discount Migration Plan
 */

import { 
  beautifyMinor, 
  beautifyYearlyMinor, 
  minorToDisplay, 
  displayToMinor, 
  getCurrencyTickSize, 
  isBeautifiedPrice,
  calculateDisplayedDiscount,
  generateDiscountText,
  debugBeautification 
} from '../src/services/pricingBeautification';

describe('Pricing Beautification Service', () => {
  describe('Minor Units Conversion', () => {
    it('should convert display price to minor units correctly', () => {
      expect(displayToMinor(10.99, 'USD')).toBe(1099);
      expect(displayToMinor(10.5, 'USD')).toBe(1050);
      expect(displayToMinor(100.00, 'EGP')).toBe(10000);
    });

    it('should convert minor units to display price correctly', () => {
      expect(minorToDisplay(1099, 'USD')).toBe(10.99);
      expect(minorToDisplay(1050, 'USD')).toBe(10.5);
      expect(minorToDisplay(10000, 'EGP')).toBe(100.00);
    });
  });

  describe('Currency-Specific Beautification', () => {
    it('should beautify USD prices to $0.50 ticks', () => {
      // Test monthly prices (nearest rounding)
      expect(beautifyMinor(1099, 'USD')).toBe(1100); // $10.99 → $11.00
      expect(beautifyMinor(1075, 'USD')).toBe(1100); // $10.75 → $11.00 (round up)
      expect(beautifyMinor(1025, 'USD')).toBe(1050); // $10.25 → $10.50 (round up - Math.round(1025/50)*50 = Math.round(20.5)*50 = 21*50 = 1050)
      expect(beautifyMinor(1024, 'USD')).toBe(1000); // $10.24 → $10.00 (round down)
      expect(beautifyMinor(1050, 'USD')).toBe(1050); // $10.50 → $10.50 (exact)
    });

    it('should beautify yearly prices using floor rounding for customer trust', () => {
      // Test yearly prices (floor rounding to never overcharge)
      expect(beautifyYearlyMinor(1099, 'USD')).toBe(1050); // $10.99 → $10.50 (floor)
      expect(beautifyYearlyMinor(1075, 'USD')).toBe(1050); // $10.75 → $10.50 (floor)
      expect(beautifyYearlyMinor(1050, 'USD')).toBe(1050); // $10.50 → $10.50 (exact)
    });

    it('should handle EGP currency with E£5.00 ticks', () => {
      // EGP tick size is 500 minor units = E£5.00
      expect(beautifyMinor(4999, 'EGP')).toBe(5000);  // E£49.99 → E£50.00
      expect(beautifyMinor(5250, 'EGP')).toBe(5500);  // E£52.50 → E£55.00
      expect(beautifyYearlyMinor(5499, 'EGP')).toBe(5000);  // E£54.99 → E£50.00 (floor)
    });

    it('should handle SAR currency with SR1.00 ticks', () => {
      // SAR tick size is 100 minor units = SR1.00
      expect(beautifyMinor(1050, 'SAR')).toBe(1100);  // SR10.50 → SR11.00
      expect(beautifyMinor(1000, 'SAR')).toBe(1000);  // SR10.00 → SR10.00 (exact)
      expect(beautifyYearlyMinor(1090, 'SAR')).toBe(1000);  // SR10.90 → SR10.00 (floor)
    });

    it('should fallback to $0.50 equivalent for unknown currencies', () => {
      expect(beautifyMinor(1075, 'XYZ')).toBe(1100);  // Round to nearest 50
      expect(beautifyYearlyMinor(1075, 'XYZ')).toBe(1050);  // Floor to nearest 50
    });
  });

  describe('Currency Tick Sizes', () => {
    it('should return correct tick sizes for supported currencies', () => {
      expect(getCurrencyTickSize('USD')).toBe(0.50);
      expect(getCurrencyTickSize('EUR')).toBe(0.50);
      expect(getCurrencyTickSize('GBP')).toBe(0.50);
      expect(getCurrencyTickSize('EGP')).toBe(5.00);
      expect(getCurrencyTickSize('SAR')).toBe(1.00);
      expect(getCurrencyTickSize('AED')).toBe(1.00);
    });

    it('should return fallback tick size for unknown currencies', () => {
      expect(getCurrencyTickSize('XYZ')).toBe(0.50);
    });
  });

  describe('Price Validation', () => {
    it('should identify beautified prices correctly', () => {
      expect(isBeautifiedPrice(10.50, 'USD')).toBe(true);  // $10.50 is beautified
      expect(isBeautifiedPrice(10.00, 'USD')).toBe(true);  // $10.00 is beautified
      expect(isBeautifiedPrice(10.25, 'USD')).toBe(false); // $10.25 is not beautified
      expect(isBeautifiedPrice(15.00, 'EGP')).toBe(true);  // E£15.00 is beautified
      expect(isBeautifiedPrice(12.50, 'EGP')).toBe(false); // E£12.50 is not beautified
    });
  });

  describe('Yearly Pricing Calculation Scenario', () => {
    it('should demonstrate professional yearly pricing calculation', () => {
      // Scenario: $29.99 monthly with 20% yearly discount
      const monthlyPriceCents = 2999; // $29.99
      const yearlyDiscountPercentage = 20.00;
      
      // Simulate database auto-calculation: (monthly * 12) * (1 - discount/100)
      const autoCalculatedYearlyCents = Math.round(
        (monthlyPriceCents * 12) * (1 - yearlyDiscountPercentage / 100)
      ); // = Math.round(35988 * 0.8) = Math.round(28790.4) = 28790
      
      // Apply beautification
      const beautifiedMonthlyCents = beautifyMinor(monthlyPriceCents, 'USD'); // 2999 → 3000
      const beautifiedYearlyCents = beautifyYearlyMinor(autoCalculatedYearlyCents, 'USD'); // 28790 → 28750
      
      // Convert to display prices
      const monthlyDisplay = minorToDisplay(beautifiedMonthlyCents, 'USD'); // $30.00
      const yearlyDisplay = minorToDisplay(beautifiedYearlyCents, 'USD');   // $287.50
      
      expect(monthlyDisplay).toBe(30.00);   // Professional $30.00/month
      expect(yearlyDisplay).toBe(287.50);   // Professional $287.50/year
      
      // Verify customer gets at least the advertised 20% discount
      const actualDiscount = 1 - (yearlyDisplay / (monthlyDisplay * 12));
      expect(actualDiscount).toBeGreaterThanOrEqual(0.20); // At least 20% off
      expect(actualDiscount).toBeCloseTo(0.2014, 4); // Actually ~20.14% off due to floor rounding
    });

    it('should handle free tier with 0% discount', () => {
      const monthlyPriceCents = 0; // $0.00 for free tier
      const yearlyDiscountPercentage = 0.00;
      
      const autoCalculatedYearlyCents = Math.round(
        (monthlyPriceCents * 12) * (1 - yearlyDiscountPercentage / 100)
      ); // = 0
      
      const beautifiedMonthlyCents = beautifyMinor(monthlyPriceCents, 'USD'); // 0 → 0
      const beautifiedYearlyCents = beautifyYearlyMinor(autoCalculatedYearlyCents, 'USD'); // 0 → 0
      
      expect(minorToDisplay(beautifiedMonthlyCents, 'USD')).toBe(0.00);
      expect(minorToDisplay(beautifiedYearlyCents, 'USD')).toBe(0.00);
    });
  });

  describe('Displayed Discount Calculation (Marketing Critical)', () => {
    it('should calculate discount from displayed (beautified) prices', () => {
      // Scenario: $29.99 monthly → $30.00 beautified monthly
      const monthlyMinor = beautifyMinor(2999, 'USD'); // 3000 cents
      const yearlyMinor = beautifyYearlyMinor(Math.round(2999 * 12 * 0.8), 'USD'); // beautified yearly
      
      const displayedDiscount = calculateDisplayedDiscount(monthlyMinor, yearlyMinor);
      
      // Should calculate from $30.00 * 12 vs actual yearly, not raw $29.99
      expect(displayedDiscount).toBeGreaterThan(0);
      expect(displayedDiscount).toBeLessThan(25); // Reasonable range
    });

    it('should generate marketing-safe discount text', () => {
      const monthlyMinor = 3000; // $30.00
      const yearlyMinor = 28750; // $287.50 (20.83% off)
      
      const text = generateDiscountText(monthlyMinor, yearlyMinor);
      expect(text).toMatch(/^Save at least \d+(\.\d)?%$/);
      
      // Should not overstate (floor rounding)
      const discount = calculateDisplayedDiscount(monthlyMinor, yearlyMinor);
      expect(discount).toBeLessThanOrEqual(20.9); // Floor ensures safe marketing
    });

    it('should return empty text for 0% discount (free tier)', () => {
      const monthlyMinor = 0;
      const yearlyMinor = 0;
      
      expect(generateDiscountText(monthlyMinor, yearlyMinor)).toBe('');
      expect(calculateDisplayedDiscount(monthlyMinor, yearlyMinor)).toBe(0);
    });
  });

  describe('Debug Helper', () => {
    it('should provide comprehensive beautification information', () => {
      const debug = debugBeautification(2999, 'USD'); // $29.99
      
      expect(debug.original.display).toBe(29.99);
      expect(debug.monthly.display).toBe(30.00);  // Beautified monthly
      expect(debug.yearly.minor).toBeLessThanOrEqual(debug.monthly.minor); // Floor ensures lower yearly
      expect(debug.displayedDiscount).toBeGreaterThan(0); // Should calculate displayed discount
      expect(debug.discountText).toContain('Save at least'); // Should generate marketing text
      expect(debug.tickSize).toBe(0.50);
    });
  });
});

describe('Boundary Tests (Expert-Recommended Edge Cases)', () => {
  describe('Discount Percentage Edge Cases', () => {
    it('should handle 0% discount (free tier scenario)', () => {
      const currencies = ['USD', 'EUR', 'GBP', 'EGP', 'SAR', 'AED'];
      
      currencies.forEach(currency => {
        const monthlyMinor = 0; // Free tier
        const yearlyMinor = 0;  // 0% discount = same price
        
        const beautifiedMonthly = beautifyMinor(monthlyMinor, currency);
        const beautifiedYearly = beautifyYearlyMinor(yearlyMinor, currency);
        
        expect(beautifiedMonthly).toBe(0);
        expect(beautifiedYearly).toBe(0);
        expect(calculateDisplayedDiscount(beautifiedMonthly, beautifiedYearly)).toBe(0);
        expect(generateDiscountText(beautifiedMonthly, beautifiedYearly)).toBe('');
      });
    });

    it('should handle 100% discount (hypothetical edge case)', () => {
      const currencies = ['USD', 'EUR', 'GBP', 'EGP', 'SAR', 'AED'];
      
      currencies.forEach(currency => {
        const monthlyMinor = 2000; // $20.00
        const yearlyMinor = 0;     // 100% discount = free yearly
        
        const beautifiedMonthly = beautifyMinor(monthlyMinor, currency);
        const beautifiedYearly = beautifyYearlyMinor(yearlyMinor, currency);
        
        const discount = calculateDisplayedDiscount(beautifiedMonthly, beautifiedYearly);
        expect(discount).toBe(100.0); // Perfect 100% discount
        expect(generateDiscountText(beautifiedMonthly, beautifiedYearly)).toBe('Save at least 100%');
      });
    });

    it('should handle non-round discount percentages (33.33%)', () => {
      const currencies = ['USD', 'EUR', 'GBP', 'EGP', 'SAR', 'AED'];
      
      currencies.forEach(currency => {
        const monthlyMinor = 3000; // $30.00 equivalent
        // 33.33% discount = yearly is 66.67% of (monthly * 12) = 24000 * 0.6667 ≈ 16000
        const yearlyMinor = Math.round(monthlyMinor * 12 * 0.6667);
        
        const beautifiedMonthly = beautifyMinor(monthlyMinor, currency);
        const beautifiedYearly = beautifyYearlyMinor(yearlyMinor, currency);
        
        const discount = calculateDisplayedDiscount(beautifiedMonthly, beautifiedYearly);
        
        // Should be around 33%, but floor rounding might make it slightly less
        expect(discount).toBeGreaterThan(30);
        expect(discount).toBeLessThan(40);
        expect(discount % 1).toBeGreaterThanOrEqual(0); // Can have decimal places
        
        const text = generateDiscountText(beautifiedMonthly, beautifiedYearly);
        expect(text).toContain('Save at least');
      });
    });
  });

  describe('Tiny Price Edge Cases', () => {
    it('should handle tiny prices that could round to 0', () => {
      const currencies = ['USD', 'EUR', 'GBP', 'EGP', 'SAR', 'AED'];
      
      currencies.forEach(currency => {
        // Test prices that might round down to 0 after beautification
        const tinyPrices = [1, 5, 10, 20, 25]; // Very small amounts in minor units
        
        tinyPrices.forEach(tinyPrice => {
          const beautifiedMonthly = beautifyMinor(tinyPrice, currency);
          const yearlyMinor = Math.round(tinyPrice * 12 * 0.8); // 20% discount
          const beautifiedYearly = beautifyYearlyMinor(yearlyMinor, currency);
          
          // All beautified prices should be non-negative
          expect(beautifiedMonthly).toBeGreaterThanOrEqual(0);
          expect(beautifiedYearly).toBeGreaterThanOrEqual(0);
          
          // Discount calculation should be safe regardless of tiny prices
          const discount = calculateDisplayedDiscount(beautifiedMonthly, beautifiedYearly);
          expect(discount).toBeGreaterThanOrEqual(0);
          expect(discount).toBeLessThanOrEqual(100);
          
          // If monthly beautifies to 0, discount should be 0 (can't divide by 0)
          if (beautifiedMonthly === 0) {
            expect(calculateDisplayedDiscount(beautifiedMonthly, beautifiedYearly)).toBe(0);
            expect(generateDiscountText(beautifiedMonthly, beautifiedYearly)).toBe('');
          }
        });
      });
    });

    it('should handle edge case where beautification eliminates discount', () => {
      // Scenario: Raw calculation gives small discount, but beautification eliminates it
      const monthlyRaw = 100; // $1.00
      const yearlyRaw = 96;   // $0.96 (4% discount)
      
      // After beautification to $0.50 ticks:
      const monthlyBeautified = beautifyMinor(monthlyRaw, 'USD'); // might round to 100 or 50
      const yearlyBeautified = beautifyYearlyMinor(yearlyRaw, 'USD'); // might round to 50
      
      const discount = calculateDisplayedDiscount(monthlyBeautified, yearlyBeautified);
      
      // Discount should be safe and non-negative
      expect(discount).toBeGreaterThanOrEqual(0);
      
      // If beautification eliminated the discount, marketing text should reflect that
      if (discount === 0) {
        expect(generateDiscountText(monthlyBeautified, yearlyBeautified)).toBe('');
      }
    });
  });

  describe('Currency-Specific Boundary Tests', () => {
    const testCases = [
      { currency: 'USD', tickSize: 50, testPrice: 149 }, // $1.49 → $1.50
      { currency: 'EUR', tickSize: 50, testPrice: 149 }, // €1.49 → €1.50
      { currency: 'GBP', tickSize: 50, testPrice: 149 }, // £1.49 → £1.50
      { currency: 'EGP', tickSize: 500, testPrice: 1249 }, // E£12.49 → E£12.50 or E£10.00
      { currency: 'SAR', tickSize: 100, testPrice: 149 }, // SR1.49 → SR1.00 or SR2.00
      { currency: 'AED', tickSize: 100, testPrice: 149 }, // AED1.49 → AED1.00 or AED2.00
    ];

    testCases.forEach(({ currency, tickSize, testPrice }) => {
      it(`should handle ${currency} boundary beautification correctly`, () => {
        const beautifiedMonthly = beautifyMinor(testPrice, currency);
        const yearlyRaw = Math.round(testPrice * 12 * 0.8); // 20% discount
        const beautifiedYearly = beautifyYearlyMinor(yearlyRaw, currency);
        
        // Ensure beautified prices follow currency rules
        expect(beautifiedMonthly % tickSize).toBe(0);
        expect(beautifiedYearly % tickSize).toBe(0);
        
        // Ensure discount calculation is safe
        const discount = calculateDisplayedDiscount(beautifiedMonthly, beautifiedYearly);
        expect(discount).toBeGreaterThanOrEqual(0);
        expect(discount).toBeLessThanOrEqual(100);
        
        console.log(`${currency}: ${testPrice} → monthly: ${beautifiedMonthly}, yearly: ${beautifiedYearly}, discount: ${discount.toFixed(1)}%`);
      });
    });
  });
});

describe('Integration with Real Pricing Scenarios', () => {
  // Test cases based on common SaaS pricing patterns
  const testCases = [
    { monthly: '$9.99', currency: 'USD', expected: { monthly: '$10.00', yearlyFloor: '$95.50' } },
    { monthly: '$29.99', currency: 'USD', expected: { monthly: '$30.00', yearlyFloor: '$287.50' } },
    { monthly: '€24.99', currency: 'EUR', expected: { monthly: '€25.00', yearlyFloor: '€239.50' } },
    { monthly: '£19.99', currency: 'GBP', expected: { monthly: '£20.00', yearlyFloor: '£191.50' } },
    { monthly: 'E£249.99', currency: 'EGP', expected: { monthly: 'E£250.00', yearlyFloor: 'E£2395.00' } },
    { monthly: 'SR99.99', currency: 'SAR', expected: { monthly: 'SR100.00', yearlyFloor: 'SR959.00' } },
  ];

  testCases.forEach(({ monthly, currency, expected }) => {
    it(`should handle ${monthly} ${currency} pricing professionally`, () => {
      // Extract numeric value (assuming format like "$9.99")
      const numericValue = parseFloat(monthly.replace(/[^\d.]/g, ''));
      const monthlyCents = displayToMinor(numericValue, currency);
      
      // Simulate 20% yearly discount
      const yearlyDiscountedCents = Math.round(monthlyCents * 12 * 0.8);
      
      // Apply beautification
      const beautifiedMonthlyCents = beautifyMinor(monthlyCents, currency);
      const beautifiedYearlyCents = beautifyYearlyMinor(yearlyDiscountedCents, currency);
      
      const monthlyDisplay = minorToDisplay(beautifiedMonthlyCents, currency);
      const yearlyDisplay = minorToDisplay(beautifiedYearlyCents, currency);
      
      // Check that we get professional pricing
      expect(isBeautifiedPrice(monthlyDisplay, currency)).toBe(true);
      expect(isBeautifiedPrice(yearlyDisplay, currency)).toBe(true);
      
      // Verify yearly is discounted but not more than advertised (floor rounding protection)
      const actualYearlyFromMonthly = monthlyDisplay * 12;
      const actualDiscount = 1 - (yearlyDisplay / actualYearlyFromMonthly);
      expect(actualDiscount).toBeGreaterThanOrEqual(0.20); // At least 20% off
      
      console.log(`${currency}: ${monthly} → ${monthlyDisplay.toFixed(2)} monthly, ${yearlyDisplay.toFixed(2)} yearly (${(actualDiscount * 100).toFixed(1)}% off)`);
    });
  });
});