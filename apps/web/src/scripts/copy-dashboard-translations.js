#!/usr/bin/env node

/**
 * Copy Dashboard Translations Script
 * 
 * Copies the dashboard section from English advisor.json to all other locales
 * Preserves existing translations in target locales where they exist
 */

/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');

const TARGET_LOCALES = ['ar-ae', 'ar-eg', 'ar-sa', 'ar', 'de', 'es', 'fr-ma', 'fr'];
const MESSAGES_DIR = path.join(__dirname, '..', 'messages');
const SOURCE_FILE = path.join(MESSAGES_DIR, 'en', 'advisor.json');

console.log('🚀 Starting dashboard translations copy process...\n');

try {
  // Read source English translations
  const sourceContent = fs.readFileSync(SOURCE_FILE, 'utf8');
  const sourceData = JSON.parse(sourceContent);
  
  if (!sourceData.dashboard) {
    console.error('❌ No dashboard section found in English advisor.json');
    process.exit(1);
  }

  const dashboardSection = sourceData.dashboard;
  console.log('📊 English dashboard section loaded with keys:');
  console.log(`   - ${Object.keys(dashboardSection).join(', ')}`);
  console.log('');

  let successCount = 0;
  let errorCount = 0;

  // Copy to each target locale
  for (const locale of TARGET_LOCALES) {
    try {
      const targetFile = path.join(MESSAGES_DIR, locale, 'advisor.json');
      
      // Check if target file exists
      if (!fs.existsSync(targetFile)) {
        console.log(`⚠️  ${locale}: advisor.json not found, skipping`);
        continue;
      }

      // Read existing target translations
      const targetContent = fs.readFileSync(targetFile, 'utf8');
      const targetData = JSON.parse(targetContent);

      // Preserve existing dashboard translations if they exist
      // This ensures we don't overwrite any existing locale-specific translations
      const existingDashboard = targetData.dashboard || {};
      
      // Merge English dashboard with existing (existing takes precedence)
      const mergedDashboard = {
        ...dashboardSection,  // English as base
        ...existingDashboard  // Existing translations override
      };

      // Deep merge for nested objects
      const deepMerge = (source, target) => {
        const result = { ...source };
        
        Object.keys(target).forEach(key => {
          if (target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
            result[key] = deepMerge(source[key] || {}, target[key]);
          } else {
            result[key] = target[key];
          }
        });
        
        return result;
      };

      // Apply deep merge to preserve nested translations
      targetData.dashboard = deepMerge(dashboardSection, existingDashboard);

      // Write back to file
      const outputContent = JSON.stringify(targetData, null, 2);
      fs.writeFileSync(targetFile, outputContent, 'utf8');

      console.log(`✅ ${locale}: Dashboard translations updated successfully`);
      
      // Log what was preserved vs added
      const preservedKeys = Object.keys(existingDashboard);
      const newKeys = Object.keys(dashboardSection).filter(k => !preservedKeys.includes(k));
      
      if (preservedKeys.length > 0) {
        console.log(`   └─ Preserved: ${preservedKeys.join(', ')}`);
      }
      if (newKeys.length > 0) {
        console.log(`   └─ Added: ${newKeys.join(', ')}`);
      }

      successCount++;

    } catch (error) {
      console.error(`❌ ${locale}: Failed to update dashboard translations`);
      console.error(`   └─ Error: ${error.message}`);
      errorCount++;
    }
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📋 DASHBOARD TRANSLATIONS COPY SUMMARY');
  console.log('='.repeat(50));
  console.log(`✅ Successful updates: ${successCount}`);
  console.log(`❌ Failed updates: ${errorCount}`);
  console.log(`📊 Locales processed: ${TARGET_LOCALES.length}`);
  
  if (successCount === TARGET_LOCALES.length) {
    console.log('\n🎉 ALL TRANSLATIONS COPIED SUCCESSFULLY!');
    console.log('All 8 locales now have the complete dashboard translations.');
  } else if (errorCount > 0) {
    console.log(`\n⚠️  ${errorCount} locales failed to update. Check errors above.`);
  }
  
  console.log('='.repeat(50));

} catch (error) {
  console.error('❌ Fatal error during translation copy:', error);
  process.exit(1);
}
