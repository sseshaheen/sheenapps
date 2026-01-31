/**
 * Fastify TypeScript Declarations for I18n
 *
 * Type-safe locale access after middleware resolution
 * Expert recommendation: Resolve once, type it, never re-parse
 */

import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    locale: string;        // Base language code: 'ar', 'en', 'fr', etc.
    localeTag?: string;    // Full BCP-47 tag: 'ar-EG', 'ar', 'en-US', etc.
    region?: string | null; // Region code extracted from tag: 'EG', 'US', null for base
  }
}

// Export for convenience in other files
export interface LocaleInfo {
  base: string;      // 'ar'
  tag: string;       // 'ar-EG' or 'ar'
  region: string | null; // 'EG' | null
}