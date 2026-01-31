/**
 * Advisor Localization Utilities
 * Handles fallbacks between localized and default content
 */

export interface LocalizedAdvisorField<T = string> {
  localized?: T;
  default: T;
}

/**
 * Get localized content with fallback to default
 */
export function getLocalizedContent<T>(
  localizedField?: T,
  defaultField?: T
): T | undefined {
  return localizedField || defaultField;
}

/**
 * Get localized bio with fallback
 */
export function getLocalizedBio(advisor: any): string | undefined {
  return getLocalizedContent(advisor.localized_bio, advisor.bio);
}

/**
 * Get localized display name with fallback
 */
export function getLocalizedDisplayName(advisor: any): string {
  return getLocalizedContent(advisor.localized_display_name, advisor.display_name) || advisor.display_name || 'Unknown Advisor';
}

/**
 * Get localized specialties with fallback
 */
export function getLocalizedSpecialties(advisor: any): any[] {
  const localized = advisor.localized_specialties;
  const defaultSpecialties = advisor.specialties;
  
  // If we have localized specialties, use them
  if (localized && Array.isArray(localized) && localized.length > 0) {
    return localized;
  }
  
  // Fallback to default specialties
  if (defaultSpecialties && Array.isArray(defaultSpecialties)) {
    return defaultSpecialties;
  }
  
  return [];
}

/**
 * Get display name for specialty (handles both localized and default formats)
 */
export function getSpecialtyDisplayName(specialty: any): string {
  // Localized format: { specialty_key, display_name, description }
  if (specialty.display_name) {
    return specialty.display_name;
  }
  
  // Default format: { key, label } or just string
  if (specialty.label) {
    return specialty.label;
  }
  
  if (typeof specialty === 'string') {
    return specialty;
  }
  
  // Fallback
  return specialty.key || specialty.specialty_key || 'Unknown';
}

/**
 * Get description for specialty
 */
export function getSpecialtyDescription(specialty: any): string | undefined {
  return specialty.description;
}

/**
 * Comprehensive advisor content localization
 */
export function getLocalizedAdvisorContent(advisor: any) {
  return {
    bio: getLocalizedBio(advisor),
    specialties: getLocalizedSpecialties(advisor),
    // Add other localized fields as needed
  };
}