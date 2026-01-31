/**
 * Currency Conversion Service
 * Provides real-time currency conversion using stored exchange rates
 */

import { pool } from './database';

export class CurrencyConversionService {
  /**
   * Convert price from one currency to another using latest exchange rates
   */
  static async convertPrice(
    amount: number,
    fromCurrency: string,
    toCurrency: string
  ): Promise<number | null> {
    if (fromCurrency === toCurrency) {
      return amount;
    }

    const rate = await this.getCurrencyConversion(fromCurrency, toCurrency);
    if (rate === null) {
      return null;
    }

    return amount * rate;
  }

  /**
   * Convert price and round to nearest integer for clean subscription pricing
   */
  static async convertPriceToInteger(
    amount: number,
    fromCurrency: string,
    toCurrency: string
  ): Promise<number | null> {
    const convertedPrice = await this.convertPrice(amount, fromCurrency, toCurrency);
    if (convertedPrice === null) {
      return null;
    }
    
    return Math.round(convertedPrice);
  }

  /**
   * Get exchange rate between two currencies
   */
  static async getCurrencyConversion(
    fromCurrency: string,
    toCurrency: string
  ): Promise<number | null> {
    try {
      // Try direct conversion
      const result = await pool!.query(`
        SELECT rate 
        FROM exchange_rates 
        WHERE from_currency = $1 AND to_currency = $2
        ORDER BY effective_date DESC 
        LIMIT 1
      `, [fromCurrency, toCurrency]);

      if (result.rows.length > 0) {
        return result.rows[0].rate;
      }

      // Try reverse conversion (e.g., if we have EGP->USD but need USD->EGP)
      const reverseResult = await pool!.query(`
        SELECT rate 
        FROM exchange_rates 
        WHERE from_currency = $2 AND to_currency = $1
        ORDER BY effective_date DESC 
        LIMIT 1
      `, [fromCurrency, toCurrency]);

      if (reverseResult.rows.length > 0) {
        return 1 / reverseResult.rows[0].rate;
      }

      console.warn(`[CurrencyConversion] No exchange rate found for ${fromCurrency} -> ${toCurrency}`);
      return null;

    } catch (error) {
      console.error('[CurrencyConversion] Error getting exchange rate:', error);
      return null;
    }
  }

  /**
   * Get all available exchange rates for a base currency
   */
  static async getAvailableCurrencies(baseCurrency: string = 'USD'): Promise<string[]> {
    try {
      const result = await pool!.query(`
        SELECT DISTINCT to_currency as currency
        FROM exchange_rates 
        WHERE from_currency = $1
        ORDER BY to_currency
      `, [baseCurrency]);

      return result.rows.map(row => row.currency);
    } catch (error) {
      console.error('[CurrencyConversion] Error getting available currencies:', error);
      return [];
    }
  }
}