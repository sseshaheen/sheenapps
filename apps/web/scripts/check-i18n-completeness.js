#!/usr/bin/env node

/**
 * I18n Completeness Checker
 * Analyzes translation files to find missing keys across locales
 */

const fs = require('fs');
const path = require('path');

const MESSAGES_DIR = path.join(__dirname, '../src/messages');
const BASE_LOCALE = 'en';

// All supported locales from CLAUDE.md
const LOCALES = ['en', 'ar-eg', 'ar-sa', 'ar-ae', 'ar', 'fr', 'fr-ma', 'es', 'de'];

// Get all namespaces from English directory
function getNamespaces() {
  const enDir = path.join(MESSAGES_DIR, BASE_LOCALE);
  if (!fs.existsSync(enDir)) {
    console.error(`❌ English directory not found: ${enDir}`);
    process.exit(1);
  }
  
  return fs.readdirSync(enDir)
    .filter(file => file.endsWith('.json'))
    .map(file => file.replace('.json', ''));
}

// Load JSON file safely
function loadJSON(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.warn(`⚠️ Failed to load ${filePath}: ${error.message}`);
    return null;
  }
}

// Get all keys from an object recursively
function getAllKeys(obj, prefix = '') {
  let keys = [];
  
  for (const key in obj) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    
    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
      keys = keys.concat(getAllKeys(obj[key], fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  
  return keys;
}

// Check if a nested key exists in an object
function hasNestedKey(obj, keyPath) {
  const parts = keyPath.split('.');
  let current = obj;
  
  for (const part of parts) {
    if (!current || typeof current !== 'object' || !(part in current)) {
      return false;
    }
    current = current[part];
  }
  
  return true;
}

// Main analysis function
function analyzeTranslations() {
  console.log('🔍 Analyzing i18n completeness...\n');
  
  const namespaces = getNamespaces();
  console.log(`📦 Found ${namespaces.length} namespaces: ${namespaces.join(', ')}\n`);
  
  let totalIssues = 0;
  const report = {};
  
  for (const namespace of namespaces) {
    console.log(`📝 Checking namespace: ${namespace}`);
    
    // Load base (English) translations
    const baseFile = path.join(MESSAGES_DIR, BASE_LOCALE, `${namespace}.json`);
    const baseTranslations = loadJSON(baseFile);
    
    if (!baseTranslations) {
      console.log(`❌ Could not load base translations for ${namespace}`);
      continue;
    }
    
    const baseKeys = getAllKeys(baseTranslations);
    console.log(`   📊 Base keys: ${baseKeys.length}`);
    
    report[namespace] = {
      baseKeys: baseKeys.length,
      locales: {}
    };
    
    // Check each locale
    for (const locale of LOCALES) {
      if (locale === BASE_LOCALE) continue;
      
      const localeFile = path.join(MESSAGES_DIR, locale, `${namespace}.json`);
      const localeTranslations = loadJSON(localeFile);
      
      if (!localeTranslations) {
        console.log(`   ❌ ${locale}: File missing or invalid`);
        report[namespace].locales[locale] = { 
          status: 'missing_file',
          missing: baseKeys.length,
          missingKeys: baseKeys
        };
        totalIssues += baseKeys.length;
        continue;
      }
      
      // Find missing keys
      const missingKeys = baseKeys.filter(key => !hasNestedKey(localeTranslations, key));
      const extraKeys = getAllKeys(localeTranslations).filter(key => !hasNestedKey(baseTranslations, key));
      
      report[namespace].locales[locale] = {
        status: missingKeys.length === 0 ? 'complete' : 'incomplete',
        total: getAllKeys(localeTranslations).length,
        missing: missingKeys.length,
        extra: extraKeys.length,
        missingKeys,
        extraKeys
      };
      
      if (missingKeys.length > 0) {
        console.log(`   ⚠️  ${locale}: ${missingKeys.length} missing keys`);
        totalIssues += missingKeys.length;
        
        // Show first few missing keys as examples
        const examples = missingKeys.slice(0, 3);
        console.log(`      Examples: ${examples.join(', ')}`);
        if (missingKeys.length > 3) {
          console.log(`      + ${missingKeys.length - 3} more...`);
        }
      } else {
        console.log(`   ✅ ${locale}: Complete`);
      }
      
      if (extraKeys.length > 0) {
        console.log(`   ℹ️  ${locale}: ${extraKeys.length} extra keys (not in base)`);
      }
    }
    
    console.log('');
  }
  
  // Summary
  console.log('📋 SUMMARY');
  console.log('=' .repeat(50));
  console.log(`Total missing translations: ${totalIssues}`);
  
  if (totalIssues === 0) {
    console.log('🎉 All translations are complete!');
  } else {
    console.log(`\n🚨 Issues found in the following locales:`);
    
    // Group issues by locale
    const localeIssues = {};
    for (const [namespace, data] of Object.entries(report)) {
      for (const [locale, info] of Object.entries(data.locales)) {
        if (info.missing > 0) {
          if (!localeIssues[locale]) localeIssues[locale] = 0;
          localeIssues[locale] += info.missing;
        }
      }
    }
    
    for (const [locale, count] of Object.entries(localeIssues)) {
      console.log(`   ${locale}: ${count} missing translations`);
    }
  }
  
  return { report, totalIssues };
}

// Run analysis
if (require.main === module) {
  analyzeTranslations();
}

module.exports = { analyzeTranslations };