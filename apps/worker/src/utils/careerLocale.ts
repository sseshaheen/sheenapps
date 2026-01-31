/**
 * Career Portal Locale Utilities
 * 
 * Handles locale normalization and field selection for the career portal
 * Treats all Arabic variants (ar-EG, ar-SA, etc.) as single Arabic (ar)
 * Primary locale is Arabic with English fallback
 */

// =====================================================
// Types
// =====================================================

export type CareerLocale = 'ar' | 'en';

export interface LocalizedField {
  ar?: string;
  en?: string;
  [key: string]: string | undefined;
}

// =====================================================
// Locale Normalization
// =====================================================

/**
 * Normalizes locale input to supported career locales
 * Treats all ar-* variants as 'ar'
 * Defaults to 'ar' for unsupported locales
 * 
 * @param input - Raw locale string from headers or user input
 * @returns Normalized locale ('ar' or 'en')
 */
export function normalizeCareerLocale(input?: string | null): CareerLocale {
  if (!input) return 'ar'; // Default to Arabic
  
  const lc = input.toLowerCase().trim();
  
  // Treat all Arabic variants as single Arabic
  if (lc === 'ar' || lc.startsWith('ar-')) {
    return 'ar';
  }
  
  // Check for English
  if (lc === 'en' || lc.startsWith('en-')) {
    return 'en';
  }
  
  // Default to Arabic for any other locale
  return 'ar';
}

// =====================================================
// Field Selection
// =====================================================

/**
 * Picks the appropriate localized value from a multilingual field
 * Fallback order: requested locale -> Arabic -> English -> null
 * 
 * @param field - Multilingual field object
 * @param locale - Requested locale
 * @returns Localized string or null if no translation available
 */
export function pickLocalizedField(
  field: LocalizedField | null | undefined,
  locale: CareerLocale
): string | null {
  if (!field) return null;
  
  // Try requested locale first
  if (field[locale]) {
    return field[locale];
  }
  
  // Fallback to Arabic (primary locale)
  if (field.ar) {
    return field.ar;
  }
  
  // Fallback to English
  if (field.en) {
    return field.en;
  }
  
  // No translation available
  return null;
}

/**
 * Picks multiple localized fields from an object
 * Useful for transforming database records for API responses
 * 
 * @param obj - Object containing multilingual fields
 * @param fields - Array of field names to localize
 * @param locale - Requested locale
 * @returns Object with localized fields
 */
export function pickLocalizedFields<T extends Record<string, any>>(
  obj: T,
  fields: string[],
  locale: CareerLocale
): Partial<T> {
  const result: any = {};
  
  for (const field of fields) {
    const multilingualField = obj[`multilingual_${field}`];
    if (multilingualField) {
      result[field] = pickLocalizedField(multilingualField, locale);
    }
  }
  
  return result;
}

// =====================================================
// Response Transformation
// =====================================================

/**
 * Transforms a job record from database format to API response format
 * Replaces multilingual_* fields with localized values
 * 
 * @param job - Raw job record from database
 * @param locale - Requested locale
 * @returns Transformed job object for API response
 */
export function transformJobForResponse(job: any, locale: CareerLocale): any {
  if (!job) return null;
  
  const {
    multilingual_title,
    multilingual_description,
    multilingual_requirements,
    multilingual_benefits,
    ...rest
  } = job;
  
  return {
    ...rest,
    title: pickLocalizedField(multilingual_title, locale),
    description: pickLocalizedField(multilingual_description, locale),
    requirements: pickLocalizedField(multilingual_requirements, locale),
    benefits: pickLocalizedField(multilingual_benefits, locale)
  };
}

/**
 * Transforms a category record from database format to API response format
 * 
 * @param category - Raw category record from database
 * @param locale - Requested locale
 * @returns Transformed category object for API response
 */
export function transformCategoryForResponse(category: any, locale: CareerLocale): any {
  if (!category) return null;
  
  const {
    multilingual_name,
    multilingual_description,
    ...rest
  } = category;
  
  return {
    ...rest,
    name: pickLocalizedField(multilingual_name, locale),
    description: pickLocalizedField(multilingual_description, locale)
  };
}

/**
 * Transforms a company record from database format to API response format
 * 
 * @param company - Raw company record from database
 * @param locale - Requested locale
 * @returns Transformed company object for API response
 */
export function transformCompanyForResponse(company: any, locale: CareerLocale): any {
  if (!company) return null;
  
  const {
    multilingual_name,
    multilingual_description,
    ...rest
  } = company;
  
  return {
    ...rest,
    name: pickLocalizedField(multilingual_name, locale),
    description: pickLocalizedField(multilingual_description, locale)
  };
}

// =====================================================
// Header Parsing
// =====================================================

/**
 * Extracts and normalizes locale from request headers
 * Checks x-sheen-locale header first, then Accept-Language
 * 
 * @param headers - Request headers object
 * @returns Normalized locale
 */
export function getLocaleFromHeaders(headers: Record<string, string | string[] | undefined>): CareerLocale {
  // Check x-sheen-locale header (preferred)
  const sheenLocale = headers['x-sheen-locale'] as string | undefined;
  if (sheenLocale) {
    return normalizeCareerLocale(sheenLocale);
  }
  
  // Check Accept-Language header
  const acceptLanguage = headers['accept-language'] as string | undefined;
  if (acceptLanguage) {
    // Parse first language from Accept-Language
    // Example: "ar-EG,ar;q=0.9,en-US;q=0.8,en;q=0.7"
    const firstLang = acceptLanguage.split(',')[0]?.split(';')[0]?.trim();
    return normalizeCareerLocale(firstLang);
  }
  
  // Default to Arabic
  return 'ar';
}

/**
 * Transform a career job response based on locale
 * Extracts the appropriate language content from multilingual fields
 * Generic version that handles any multilingual fields
 */
export function transformCareerResponseForLocale(
  job: any,
  locale: CareerLocale
): any {
  const transformed: any = {
    id: job.id,
    slug: job.slug,
    department: job.department,
    employment_type: job.employment_type,
    experience_level: job.experience_level,
    posted_at: job.posted_at,
    application_deadline: job.application_deadline,
    is_remote: job.is_remote,
    is_featured: job.is_featured,
    view_count: job.view_count,
    application_count: job.application_count,
    created_at: job.created_at,
    updated_at: job.updated_at,
    is_active: job.is_active
  };
  
  // Extract multilingual fields
  const multilingualFields = [
    'multilingual_title',
    'multilingual_description', 
    'multilingual_requirements',
    'multilingual_benefits',
    'multilingual_location',
    'multilingual_meta_description',
    'multilingual_meta_keywords'
  ];
  
  for (const field of multilingualFields) {
    if (job[field]) {
      const simpleFieldName = field.replace('multilingual_', '');
      // Try requested locale first, fall back to Arabic, then English
      transformed[simpleFieldName] = 
        job[field][locale] || 
        job[field]['ar'] || 
        job[field]['en'] || 
        '';
    }
  }
  
  // Copy non-multilingual salary field as-is
  if (job.salary) {
    transformed.salary = job.salary;
  }
  
  return transformed;
}

// =====================================================
// Validation Helpers
// =====================================================

/**
 * Validates that a multilingual field has at least Arabic content
 * Used to ensure primary locale is always present
 * 
 * @param field - Multilingual field to validate
 * @returns True if Arabic content exists
 */
export function hasArabicContent(field: LocalizedField | null | undefined): boolean {
  return !!(field && field.ar && field.ar.trim().length > 0);
}

/**
 * Ensures a multilingual field has Arabic content
 * Throws an error if Arabic is missing
 * 
 * @param field - Multilingual field to validate
 * @param fieldName - Name of the field for error message
 */
export function requireArabicContent(field: LocalizedField | null | undefined, fieldName: string): void {
  if (!hasArabicContent(field)) {
    throw new Error(`Arabic content is required for ${fieldName}`);
  }
}