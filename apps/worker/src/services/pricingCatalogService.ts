import { PoolClient } from 'pg';
import { pool } from '../services/database';
import { beautifyMinor, beautifyYearlyMinor, minorToDisplay, displayToMinor, calculateDisplayedDiscount } from './pricingBeautification';
import { findOptimalYearlyPrice } from './smartYearlyPricing';

// Expert-final API contract types
export interface SubscriptionPlan {
  key: string;
  name: string;
  minutes: number;
  price: number;              // Monthly price (for backwards compatibility)
  monthlyPrice: number;       // Explicit monthly price
  yearlyPrice: number;        // Auto-calculated yearly price with discount
  yearlyDiscount?: number;    // Database discount percentage (0-100)
  displayedDiscount?: number; // Marketing-safe discount calculated from displayed prices
  bonusDaily?: number;
  monthlyBonusCap?: number;
  rolloverCap?: number;
  taxInclusive: boolean;
  advisor: {
    eligible: boolean;
    payoutUSD?: number;
    sessions: number | "community" | "daily";
  };
}

export interface Package {
  key: string;
  name: string;
  minutes: number;
  price: number;
  taxInclusive: boolean;
}

export interface PricingCatalog {
  version: string;
  rollover_policy: {
    days: number;
  };
  subscriptions: SubscriptionPlan[];
  packages: Package[];
}

export interface PricingItem {
  id: string;
  catalog_version_id: string;
  item_key: string;
  item_type: 'subscription' | 'package';
  seconds: number;
  unit_amount_cents: number;
  unit_amount_yearly_cents?: number;     // Auto-calculated yearly price
  yearly_discount_percentage?: number;   // Discount percentage for yearly pricing
  currency: string;
  tax_inclusive: boolean;
  bonus_daily_seconds?: number;
  bonus_monthly_cap_seconds?: number;
  rollover_cap_seconds?: number;
  advisor_eligible: boolean;
  advisor_payout_cents?: number;
  advisor_sessions_value?: string;       // NEW: Advisor sessions configuration from database
  expires_days?: number;
  display_name: string;
  display_order: number;
  is_active: boolean;
}

export interface CatalogVersion {
  id: string;
  version_tag: string;
  is_active: boolean;
  effective_at: Date;
  rollover_days: number;
  created_by?: string;
  created_at: Date;
}

class PricingCatalogService {
  /**
   * Parse advisor sessions value from database
   */
  private parseAdvisorSessions(sessionsValue: string | null, isEligible: boolean): number | "community" | "daily" {
    // For non-eligible plans, always return 'community' regardless of DB value
    if (!isEligible) {
      return 'community';
    }

    if (!sessionsValue) {
      return 'community'; // Default fallback for eligible plans
    }

    if (sessionsValue === 'community' || sessionsValue === 'daily') {
      return sessionsValue;
    }

    // Try to parse as number
    const numValue = parseInt(sessionsValue, 10);
    if (!isNaN(numValue) && numValue >= 0) {
      return numValue;
    }

    return 'community'; // Fallback for invalid values
  }

  /**
   * Get the active pricing catalog in expert-final API format
   */
  async getActiveCatalog(currency?: string): Promise<PricingCatalog> {
    
    const client: PoolClient = await pool!.connect();
    try {
      // Get active catalog version and items in one query
      const query = `
        SELECT 
          cv.version_tag,
          cv.rollover_days,
          pi.*
        FROM pricing_catalog_versions cv
        JOIN pricing_items pi ON cv.id = pi.catalog_version_id
        WHERE cv.is_active = true 
          AND pi.is_active = true
          ${currency ? 'AND pi.currency = $1' : ''}
        ORDER BY pi.display_order ASC
      `;
      
      const result = await client.query(query, currency ? [currency] : []);
      
      if (result.rows.length === 0) {
        throw new Error(`No active pricing catalog found${currency ? ` for currency ${currency}` : ''}`);
      }

      const version = result.rows[0].version_tag;
      const rolloverDays = result.rows[0].rollover_days;
      
      // Separate subscriptions and packages
      const subscriptions: SubscriptionPlan[] = [];
      const packages: Package[] = [];
      
      for (const item of result.rows) {
        if (item.item_type === 'subscription') {
          
          // Work with minor units (cents) throughout, beautify before display
          const monthlyMinor = item.unit_amount_cents;                           // From DB (int)

          // Use smart yearly pricing for clean monthly equivalents
          const monthlyPrice = minorToDisplay(beautifyMinor(monthlyMinor, item.currency), item.currency);
          
          let yearlyPrice: number;
          let displayedDiscount: number;
          
          if (item.yearly_discount_percentage && item.yearly_discount_percentage > 0) {
            // Calculate optimal yearly price that results in clean monthly equivalent
            const smartPricing = findOptimalYearlyPrice(monthlyPrice, item.currency, item.yearly_discount_percentage);
            yearlyPrice = smartPricing.yearlyPriceDisplay;
            
            // DEBUG: Log smart pricing results
            if (item.item_key === 'lite') {
              console.log(`[SmartPricing] ${item.item_key}: input(monthly=${monthlyPrice}, discount=${item.yearly_discount_percentage})`);
              console.log(`[SmartPricing] algorithm returned:`, smartPricing);
              console.log(`[SmartPricing] yearlyPrice being set to:`, smartPricing.yearlyPriceDisplay);
            }
            
            // Calculate displayed discount from smart pricing (fix currency conversion)
            const smartMonthlyMinor = beautifyMinor(monthlyMinor, item.currency);
            const smartYearlyMinor = displayToMinor(smartPricing.yearlyPriceDisplay, item.currency); // Use proper conversion
            displayedDiscount = calculateDisplayedDiscount(smartMonthlyMinor, smartYearlyMinor);
          } else {
            // No discount case
            yearlyPrice = monthlyPrice * 12;
            displayedDiscount = 0;
          }

          const subscriptionPlan = {
            key: item.item_key,
            name: item.display_name,
            minutes: Math.floor(item.seconds / 60), // Convert seconds to minutes for API
            price: monthlyPrice, // Backwards compatibility - monthly price
            monthlyPrice: monthlyPrice, // Explicit monthly price
            yearlyPrice: yearlyPrice,   // Auto-calculated yearly price with discount
            ...(item.yearly_discount_percentage && { yearlyDiscount: item.yearly_discount_percentage }),
            ...(displayedDiscount > 0 && { displayedDiscount }), // Marketing-safe discount for "Save X%" banners
            ...(item.bonus_daily_seconds && { bonusDaily: Math.floor(item.bonus_daily_seconds / 60) }),
            ...(item.bonus_monthly_cap_seconds && { monthlyBonusCap: Math.floor(item.bonus_monthly_cap_seconds / 60) }),
            ...(item.rollover_cap_seconds && { rolloverCap: Math.floor(item.rollover_cap_seconds / 60) }),
            taxInclusive: item.tax_inclusive, // Add tax inclusive flag
            advisor: {
              eligible: item.advisor_eligible,
              ...(item.advisor_payout_cents && { payoutUSD: item.advisor_payout_cents / 100 }), // Convert cents to dollars
              sessions: this.parseAdvisorSessions(item.advisor_sessions_value, item.advisor_eligible)
            }
          };
          
          // DEBUG: Log final plan structure
          if (item.item_key === 'lite') {
            console.log(`[SmartPricing] Final plan:`, JSON.stringify({
              key: subscriptionPlan.key,
              monthlyPrice: subscriptionPlan.monthlyPrice,
              yearlyPrice: subscriptionPlan.yearlyPrice,
              displayedDiscount: subscriptionPlan.displayedDiscount
            }, null, 2));
          }
          
          subscriptions.push(subscriptionPlan);
        } else if (item.item_type === 'package') {
          // Apply price beautification to packages for multi-currency professional pricing
          const packageMinor = item.unit_amount_cents;                          // From DB (int)
          const prettyPackageMinor = beautifyMinor(packageMinor, item.currency); // Beautify in minor units
          const packagePrice = minorToDisplay(prettyPackageMinor, item.currency); // Convert to display price
          
          
          packages.push({
            key: item.item_key,
            name: item.display_name,
            minutes: Math.floor(item.seconds / 60), // Convert seconds to minutes for API
            price: packagePrice, // Beautified price for professional multi-currency display
            taxInclusive: item.tax_inclusive // Add tax inclusive flag
          });
        }
      }
      
      return {
        version,
        rollover_policy: {
          days: rolloverDays
        },
        subscriptions,
        packages
      };
      
    } finally {
      client.release();
    }
  }

  /**
   * Get pricing item by key from active catalog (with optional currency filtering)
   */
  async getPricingItem(itemKey: string, currency?: string): Promise<PricingItem | null> {
    const client: PoolClient = await pool!.connect();
    try {
      const query = `
        SELECT pi.*
        FROM pricing_catalog_versions cv
        JOIN pricing_items pi ON cv.id = pi.catalog_version_id
        WHERE cv.is_active = true 
          AND pi.item_key = $1
          AND pi.is_active = true
          ${currency ? 'AND pi.currency = $2' : ''}
        ORDER BY pi.created_at DESC
        LIMIT 1
      `;
      
      const result = await client.query(query, currency ? [itemKey, currency] : [itemKey]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return result.rows[0] as PricingItem;
      
    } finally {
      client.release();
    }
  }

  /**
   * Get pricing item by Stripe price ID
   */
  async getPricingItemByStripeId(stripePriceId: string): Promise<PricingItem | null> {
    const client: PoolClient = await pool!.connect();
    try {
      const query = `
        SELECT pi.*
        FROM pricing_catalog_versions cv
        JOIN pricing_items pi ON cv.id = pi.catalog_version_id
        WHERE cv.is_active = true 
          AND pi.stripe_price_id = $1
          AND pi.is_active = true
      `;
      
      const result = await client.query(query, [stripePriceId]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return result.rows[0] as PricingItem;
      
    } finally {
      client.release();
    }
  }

  /**
   * Validate catalog before activation (expert requirement)
   */
  async validateCatalogBeforeActivation(versionId: string): Promise<void> {
    const client: PoolClient = await pool!.connect();
    try {
      await client.query('BEGIN');
      
      // Ensure exactly one active catalog after this change
      const activeCountQuery = `
        SELECT COUNT(*) as count
        FROM pricing_catalog_versions
        WHERE is_active = true AND id != $1
      `;
      const activeResult = await client.query(activeCountQuery, [versionId]);
      
      if (parseInt(activeResult.rows[0].count) > 0) {
        // Will be handled by the trigger, but let's verify
        console.warn('Multiple active catalogs detected, trigger will handle deactivation');
      }
      
      // Validate all required fields for the version being activated
      const validationQuery = `
        SELECT 
          item_key,
          item_type,
          stripe_price_id,
          bonus_monthly_cap_seconds,
          rollover_cap_seconds,
          seconds,
          unit_amount_cents
        FROM pricing_items
        WHERE catalog_version_id = $1 AND is_active = true
      `;
      
      const items = await client.query(validationQuery, [versionId]);
      
      if (items.rows.length === 0) {
        throw new Error('Catalog has no active pricing items');
      }

      // Validate we have required subscription tiers
      const subscriptionKeys = items.rows
        .filter(item => item.item_type === 'subscription')
        .map(item => item.item_key);
      
      if (!subscriptionKeys.includes('free')) {
        throw new Error('Catalog must include free tier subscription');
      }

      for (const item of items.rows) {
        // Validate free tier has bonus_monthly_cap_seconds
        if (item.item_key === 'free' && !item.bonus_monthly_cap_seconds) {
          throw new Error('Free tier must have bonus_monthly_cap_seconds set');
        }
        
        // Validate paid subscriptions have rollover_cap_seconds
        if (item.item_type === 'subscription' && 
            item.item_key !== 'free' && 
            !item.rollover_cap_seconds) {
          throw new Error(`Paid subscription ${item.item_key} must have rollover_cap_seconds set`);
        }
        
        // Validate subscriptions have stripe_price_id (except free)
        if (item.item_type === 'subscription' && 
            item.item_key !== 'free' && 
            !item.stripe_price_id) {
          throw new Error(`Subscription ${item.item_key} must have stripe_price_id set`);
        }

        // Validate pricing consistency
        if (item.seconds < 0 || item.unit_amount_cents < 0) {
          throw new Error(`Item ${item.item_key} has invalid pricing: seconds=${item.seconds}, price=${item.unit_amount_cents}`);
        }

        // Validate free tier is actually free
        if (item.item_key === 'free' && (item.seconds > 0 || item.unit_amount_cents > 0)) {
          throw new Error('Free tier must have 0 seconds and 0 price');
        }
      }

      // Validate rollover caps are sensible (not more than 10x the base allocation)
      for (const item of items.rows) {
        if (item.item_type === 'subscription' && item.rollover_cap_seconds > 0 && item.seconds > 0) {
          const rolloverRatio = item.rollover_cap_seconds / item.seconds;
          if (rolloverRatio > 10) {
            throw new Error(`Subscription ${item.item_key} has excessive rollover cap: ${rolloverRatio}x base allocation`);
          }
        }
      }
      
      await client.query('COMMIT');
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Enhanced catalog activation with comprehensive validation
   */
  async activateCatalogVersionSafely(versionId: string, adminUserId?: string): Promise<{
    success: boolean;
    warnings: string[];
    validationChecks: string[];
  }> {
    const warnings: string[] = [];
    const validationChecks: string[] = [];
    
    try {
      // Pre-activation validation
      await this.validateCatalogBeforeActivation(versionId);
      validationChecks.push('✅ Catalog structure validation passed');

      // Check for potential pricing conflicts
      const client: PoolClient = await pool!.connect();
      try {
        const duplicateStripeIds = await client.query(`
          SELECT stripe_price_id, COUNT(*) as count
          FROM pricing_items 
          WHERE catalog_version_id = $1 AND stripe_price_id IS NOT NULL
          GROUP BY stripe_price_id
          HAVING COUNT(*) > 1
        `, [versionId]);

        if (duplicateStripeIds.rows.length > 0) {
          throw new Error(`Duplicate Stripe price IDs found: ${duplicateStripeIds.rows.map(r => r.stripe_price_id).join(', ')}`);
        }
        validationChecks.push('✅ No duplicate Stripe price IDs');

        // Check for significant pricing changes that might affect existing users
        const currentActiveQuery = await client.query(`
          SELECT cv.id, cv.version_tag
          FROM pricing_catalog_versions cv
          WHERE cv.is_active = true
        `);

        if (currentActiveQuery.rows.length > 0) {
          const currentVersionId = currentActiveQuery.rows[0].id;
          const pricingChanges = await client.query(`
            SELECT 
              new_items.item_key,
              old_items.unit_amount_cents as old_price,
              new_items.unit_amount_cents as new_price,
              old_items.seconds as old_seconds,
              new_items.seconds as new_seconds
            FROM pricing_items new_items
            LEFT JOIN pricing_items old_items ON 
              old_items.catalog_version_id = $1 AND 
              old_items.item_key = new_items.item_key
            WHERE new_items.catalog_version_id = $2
              AND (
                old_items.unit_amount_cents != new_items.unit_amount_cents OR
                old_items.seconds != new_items.seconds
              )
          `, [currentVersionId, versionId]);

          for (const change of pricingChanges.rows) {
            if (change.old_price && change.new_price > change.old_price) {
              warnings.push(`⚠️ Price increase for ${change.item_key}: $${change.old_price/100} → $${change.new_price/100}`);
            }
            if (change.old_seconds && change.new_seconds < change.old_seconds) {
              warnings.push(`⚠️ Minutes reduced for ${change.item_key}: ${Math.floor(change.old_seconds/60)} → ${Math.floor(change.new_seconds/60)} minutes`);
            }
          }
        }

        validationChecks.push('✅ Pricing change analysis completed');
      } finally {
        client.release();
      }

      // Activate the catalog
      await this.activateCatalogVersion(versionId);
      validationChecks.push('✅ Catalog activated successfully');

      return {
        success: true,
        warnings,
        validationChecks
      };

    } catch (error) {
      validationChecks.push(`❌ Activation failed: ${error instanceof Error ? error.message : String(error)}`);
      return {
        success: false,
        warnings,
        validationChecks
      };
    }
  }

  /**
   * Create new catalog version (admin function)
   */
  async createCatalogVersion(
    versionTag: string, 
    rolloverDays: number = 90,
    createdBy?: string
  ): Promise<string> {
    const client: PoolClient = await pool!.connect();
    try {
      const query = `
        INSERT INTO pricing_catalog_versions (version_tag, rollover_days, created_by)
        VALUES ($1, $2, $3)
        RETURNING id
      `;
      
      const result = await client.query(query, [versionTag, rolloverDays, createdBy]);
      return result.rows[0].id;
      
    } finally {
      client.release();
    }
  }

  /**
   * Activate a catalog version (with validation)
   */
  async activateCatalogVersion(versionId: string): Promise<void> {
    const client: PoolClient = await pool!.connect();
    try {
      // First validate the catalog
      await this.validateCatalogBeforeActivation(versionId);
      
      // Activate the version (trigger will deactivate others)
      const query = `
        UPDATE pricing_catalog_versions 
        SET is_active = true, effective_at = NOW()
        WHERE id = $1
      `;
      
      await client.query(query, [versionId]);
      
    } finally {
      client.release();
    }
  }

  /**
   * Get catalog ETag for cache validation
   */
  async getCatalogETag(currency?: string): Promise<string> {
    const client: PoolClient = await pool!.connect();
    try {
      const query = `
        SELECT 
          cv.version_tag,
          cv.created_at as last_modified,
          cv.effective_at
        FROM pricing_catalog_versions cv
        JOIN pricing_items pi ON cv.id = pi.catalog_version_id
        WHERE cv.is_active = true
          AND pi.is_active = true
          ${currency ? 'AND pi.currency = $1' : ''}
        GROUP BY cv.version_tag, cv.effective_at, cv.created_at
        ORDER BY cv.effective_at DESC
        LIMIT 1
      `;
      
      const result = await client.query(query, currency ? [currency] : []);
      
      // If no catalog found for the specific currency, try USD as fallback
      if (result.rows.length === 0 && currency && currency !== 'USD') {
        console.log(`[PricingCatalog] No catalog found for ${currency}, falling back to USD for ETag`);
        return await this.getCatalogETag('USD');
      }
      
      if (result.rows.length === 0) {
        throw new Error('No active catalog found');
      }
      
      const row = result.rows[0];
      const lastModified = Math.max(
        new Date(row.last_modified).getTime(),
        new Date(row.effective_at).getTime()
      );
      
      // Create ETag from version, last modified timestamp, and currency (for cache isolation)
      const currencyId = currency || 'all';
      return `"${row.version_tag}-${lastModified}-${currencyId}"`;
      
    } finally {
      client.release();
    }
  }

}

export const pricingCatalogService = new PricingCatalogService();