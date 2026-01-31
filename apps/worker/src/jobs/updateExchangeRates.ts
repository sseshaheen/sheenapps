import { pool } from '../services/database';
import fetch from 'node-fetch';
import { ServerLoggingService } from '../services/serverLoggingService';

// Load environment variables when running standalone
if (require.main === module) {
  require('dotenv').config();
}

const loggingService = ServerLoggingService.getInstance();

interface ExchangeRateResponse {
  result: string;
  base_code: string;
  conversion_rates: Record<string, number>;
}

/**
 * Update exchange rates from external API
 * Runs daily to keep rates current
 */
export async function updateExchangeRates(): Promise<void> {
  try {
    console.log('[ExchangeRates] Starting daily exchange rate update...');
    
    // Option 1: Use a free API like exchangerate-api.com
    // You'll need to sign up for a free API key at https://app.exchangerate-api.com/
    const API_KEY = process.env.EXCHANGE_RATE_API_KEY;
    
    if (!API_KEY) {
      console.log('[ExchangeRates] No API key found, falling back to Stripe...');
      // Fallback to Stripe's exchange rates if available
      await updateFromStripe();
      return;
    }

    console.log('[ExchangeRates] Using exchange rate API with key:', API_KEY.substring(0, 8) + '...');

    // Fetch latest rates with USD as base
    const response = await fetch(
      `https://v6.exchangerate-api.com/v6/${API_KEY}/latest/USD`
    );
    
    if (!response.ok) {
      throw new Error(`Exchange rate API error: ${response.status}`);
    }
    
    const data = await response.json() as ExchangeRateResponse;

    // Validate API response structure
    if (!data || data.result !== 'success' || !data.conversion_rates || typeof data.conversion_rates !== 'object') {
      console.error('[ExchangeRates] Invalid API response structure:', data);
      throw new Error('Invalid API response: missing or invalid conversion_rates object');
    }

    const rates = data.conversion_rates;
    const date = new Date().toISOString().split('T')[0];
    
    console.log(`[ExchangeRates] Received rates for ${Object.keys(rates).length} currencies`);

    // Currencies we care about
    const targetCurrencies = ['EUR', 'GBP', 'EGP', 'SAR', 'AED', 'CAD', 'AUD'];

    // Insert or update rates
    const updatedCurrencies: string[] = [];
    const missingCurrencies: string[] = [];
    
    for (const currency of targetCurrencies) {
      if (rates[currency] && typeof rates[currency] === 'number') {
        try {
          const rate = 1 / rates[currency]; // Convert to "X to USD" format
          
          await pool?.query(`
            INSERT INTO exchange_rates (from_currency, to_currency, rate, effective_date, source)
            VALUES ($1, 'USD', $2, $3, 'exchangerate-api')
            ON CONFLICT (from_currency, to_currency, effective_date)
            DO UPDATE SET 
              rate = EXCLUDED.rate,
              source = EXCLUDED.source,
              created_at = NOW()
          `, [currency, rate, date]);
          
          updatedCurrencies.push(currency);
          console.log(`[ExchangeRates] Updated ${currency} to USD: ${rate.toFixed(6)}`);
        } catch (error) {
          console.error(`[ExchangeRates] Failed to update ${currency}:`, error);
          missingCurrencies.push(currency);
        }
      } else {
        missingCurrencies.push(currency);
        console.warn(`[ExchangeRates] Missing rate for ${currency} in API response`);
      }
    }
    
    if (missingCurrencies.length > 0) {
      console.warn(`[ExchangeRates] Missing currencies: ${missingCurrencies.join(', ')}`);
    }

    // Also store USD to USD for consistency
    await pool?.query(`
      INSERT INTO exchange_rates (from_currency, to_currency, rate, effective_date, source)
      VALUES ('USD', 'USD', 1.0, $1, 'system')
      ON CONFLICT (from_currency, to_currency, effective_date)
      DO UPDATE SET rate = 1.0
    `, [date]);

    await loggingService.logServerEvent(
      'capacity',
      'info',
      'Exchange rates updated successfully',
      {
        date,
        updatedCurrencies,
        missingCurrencies,
        totalRequested: targetCurrencies.length,
        totalUpdated: updatedCurrencies.length,
        source: 'exchangerate-api'
      }
    );

    console.log('[ExchangeRates] Exchange rate update completed');
    
  } catch (error) {
    console.error('[ExchangeRates] Failed to update exchange rates:', error);
    await loggingService.logCriticalError('exchange_rate_update_failed', error as Error, {
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Alternative: Get exchange rates from Stripe
 * Stripe provides exchange rates for currencies they support
 */
async function updateFromStripe(): Promise<void> {
  try {
    console.log('[ExchangeRates] Fetching rates from Stripe...');
    
    const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
    if (!STRIPE_SECRET_KEY) {
      console.warn('[ExchangeRates] No Stripe key found, using static fallback rates');
      await useFallbackRates();
      return;
    }
    
    // Stripe's exchange rates are available via their API
    // These are the rates they use for payouts
    const stripe = require('stripe')(STRIPE_SECRET_KEY);
    
    // Get balance to see available currencies and their exchange rates
    const balance = await stripe.balance.retrieve();
    
    // Stripe provides rates in their Country Specs API
    const countrySpecs = await stripe.countrySpecs.list({ limit: 100 });
    
    // For each country, get the supported currencies and rates
    const date = new Date().toISOString().split('T')[0];
    const rates = new Map<string, number>();
    
    // Note: Stripe doesn't directly provide exchange rates via API
    // You might need to use their Transfer rates or calculate from actual transactions
    
    // If Stripe API doesn't provide rates, use fallback
    console.warn('[ExchangeRates] Stripe API does not provide direct exchange rates, using fallback');
    await useFallbackRates();
    
  } catch (error) {
    console.error('[ExchangeRates] Failed to update from Stripe:', error);
    throw error;
  }
}

/**
 * Use static fallback rates when APIs are unavailable
 */
async function useFallbackRates(): Promise<void> {
  const date = new Date().toISOString().split('T')[0];
  
  // Fallback to reasonable defaults with a warning
  const fallbackRates = {
    'EUR': 0.92,   // As of late 2024
    'GBP': 0.79,   // As of late 2024
    'EGP': 0.032,  // As of late 2024
    'SAR': 0.266,  // As of late 2024
    'AED': 0.272,  // As of late 2024
    'CAD': 0.74,   // As of late 2024
    'AUD': 0.65    // As of late 2024
  };

  for (const [currency, rate] of Object.entries(fallbackRates)) {
    await pool?.query(`
      INSERT INTO exchange_rates (from_currency, to_currency, rate, effective_date, source)
      VALUES ($1, 'USD', $2, $3, 'static-fallback')
      ON CONFLICT (from_currency, to_currency, effective_date)
      DO UPDATE SET 
        rate = EXCLUDED.rate,
        source = EXCLUDED.source
    `, [currency, rate, date]);
  }

  console.log('[ExchangeRates] Updated rates from static fallback values');
  console.warn('[ExchangeRates] ⚠️ Using static fallback rates - exchange rate APIs unavailable');
}

/**
 * Manual update function for specific rates
 * Useful for corrections or special cases
 */
export async function setExchangeRate(
  fromCurrency: string, 
  toCurrency: string, 
  rate: number, 
  effectiveDate?: string
): Promise<void> {
  const date = effectiveDate || new Date().toISOString().split('T')[0];
  
  await pool?.query(`
    INSERT INTO exchange_rates (from_currency, to_currency, rate, effective_date, source)
    VALUES ($1, $2, $3, $4, 'manual')
    ON CONFLICT (from_currency, to_currency, effective_date)
    DO UPDATE SET 
      rate = EXCLUDED.rate,
      source = EXCLUDED.source,
      created_at = NOW()
  `, [fromCurrency, toCurrency, rate, date]);
  
  console.log(`[ExchangeRates] Manually set ${fromCurrency} to ${toCurrency}: ${rate} for ${date}`);
}

// Run immediately if called directly
if (require.main === module) {
  updateExchangeRates()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Failed to update exchange rates:', error);
      process.exit(1);
    });
}