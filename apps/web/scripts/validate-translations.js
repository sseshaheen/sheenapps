#!/usr/bin/env node

/**
 * Translation Validation Script
 * 
 * Validates that all translation files are complete and consistent
 * across all 10 supported locales.
 * 
 * Usage: node scripts/validate-translations.js
 */

const fs = require('fs');
const path = require('path');

const LOCALES = ['en', 'ar-eg', 'ar-sa', 'ar-ae', 'ar', 'fr', 'fr-ma', 'es', 'de'];
const MESSAGES_DIR = path.join(__dirname, '../src/messages');

let hasErrors = false;

function logError(message) {
  console.error(`❌ ${message}`);
  hasErrors = true;
}

function logWarning(message) {
  console.warn(`⚠️  ${message}`);
}

function logSuccess(message) {
  console.log(`✅ ${message}`);
}

function logInfo(message) {
  console.log(`ℹ️  ${message}`);
}

/**
 * Get all translation files for a given locale
 */
function getTranslationFiles(locale) {
  const localeDir = path.join(MESSAGES_DIR, locale);
  if (!fs.existsSync(localeDir)) {
    return [];
  }
  
  return fs.readdirSync(localeDir)
    .filter(file => file.endsWith('.json'))
    .map(file => file.replace('.json', ''));
}

/**
 * Load and parse a translation file
 */
function loadTranslationFile(locale, filename) {
  const filePath = path.join(MESSAGES_DIR, locale, `${filename}.json`);
  
  if (!fs.existsSync(filePath)) {
    return null;
  }
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    logError(`Invalid JSON in ${locale}/${filename}.json: ${error.message}`);
    return null;
  }
}

/**
 * Get all translation keys from an object (nested support)
 */
function getAllKeys(obj, prefix = '') {
  const keys = [];
  
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      keys.push(...getAllKeys(value, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  
  return keys;
}

/**
 * Check if all locales have the same translation files
 */
function validateFileConsistency() {
  logInfo('🔍 Checking file consistency across locales...');
  
  const baseLocale = 'en';
  const baseFiles = getTranslationFiles(baseLocale);
  
  if (baseFiles.length === 0) {
    logError(`No translation files found for base locale '${baseLocale}'`);
    return;
  }
  
  logInfo(`Found ${baseFiles.length} translation files in base locale: ${baseFiles.join(', ')}`);
  
  for (const locale of LOCALES) {
    if (locale === baseLocale) continue;
    
    const localeFiles = getTranslationFiles(locale);
    
    // Check for missing files
    const missingFiles = baseFiles.filter(file => !localeFiles.includes(file));
    const extraFiles = localeFiles.filter(file => !baseFiles.includes(file));
    
    if (missingFiles.length > 0) {
      logError(`${locale} is missing files: ${missingFiles.join(', ')}`);
    }
    
    if (extraFiles.length > 0) {
      logWarning(`${locale} has extra files: ${extraFiles.join(', ')}`);
    }
    
    if (missingFiles.length === 0 && extraFiles.length === 0) {
      logSuccess(`${locale} has all required translation files`);
    }
  }
}

/**
 * Check if all translation keys are consistent across locales
 */
function validateKeyConsistency() {
  logInfo('🔍 Checking translation key consistency...');
  
  const baseLocale = 'en';
  const baseFiles = getTranslationFiles(baseLocale);
  
  for (const filename of baseFiles) {
    logInfo(`Checking keys in ${filename}.json...`);
    
    const baseTranslations = loadTranslationFile(baseLocale, filename);
    if (!baseTranslations) continue;
    
    const baseKeys = getAllKeys(baseTranslations);
    
    for (const locale of LOCALES) {
      if (locale === baseLocale) continue;
      
      const localeTranslations = loadTranslationFile(locale, filename);
      if (!localeTranslations) {
        logError(`${locale}/${filename}.json is missing or invalid`);
        continue;
      }
      
      const localeKeys = getAllKeys(localeTranslations);
      
      // Check for missing keys
      const missingKeys = baseKeys.filter(key => !localeKeys.includes(key));
      const extraKeys = localeKeys.filter(key => !baseKeys.includes(key));
      
      if (missingKeys.length > 0) {
        logError(`${locale}/${filename}.json is missing keys: ${missingKeys.join(', ')}`);
      }
      
      if (extraKeys.length > 0) {
        logWarning(`${locale}/${filename}.json has extra keys: ${extraKeys.join(', ')}`);
      }
      
      if (missingKeys.length === 0 && extraKeys.length === 0) {
        logSuccess(`${locale}/${filename}.json has all required keys`);
      }
    }
  }
}

// Note: Pseudo-locale (en-XA) validation removed as files moved to deprecated-en-xa/

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * Main validation function
 */
function main() {
  console.log('🌐 Translation Validation Script');
  console.log('='.repeat(50));
  
  logInfo(`Validating ${LOCALES.length} locales: ${LOCALES.join(', ')}`);
  logInfo(`Messages directory: ${MESSAGES_DIR}`);
  
  console.log('');
  
  validateFileConsistency();
  console.log('');
  
  validateKeyConsistency();
  console.log('');
  
  console.log('='.repeat(50));
  
  if (hasErrors) {
    console.error('❌ Translation validation failed with errors!');
    console.error('Please fix the issues above before proceeding.');
    process.exit(1);
  } else {
    console.log('✅ All translation validations passed!');
    console.log('🎉 Your localization is consistent across all locales.');
  }
}

// Run validation
main();