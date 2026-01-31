#!/usr/bin/env node

/**
 * Runtime Translation Checker
 * Tests if translations are loading correctly by simulating the loading process
 */

const fs = require('fs');
const path = require('path');

const MESSAGES_DIR = path.join(__dirname, '../src/messages');

// Test the actual loading mechanism used by the app
async function testTranslationLoading(locale) {
  console.log(`🔍 Testing translation loading for locale: ${locale}`);
  
  try {
    // Simulate the loadMessages function from i18n/request.ts
    const namespaces = [
      'common', 'navigation', 'auth', 'builder', 'dashboard', 
      'billing', 'errors', 'hero', 'techTeam', 'workflow',
      'pricing', 'features', 'workspace', 'userMenu', 
      'success', 'footer', 'projects', 'toasts', 'chat'
    ];
    
    const messages = {};
    let hasNamespaceFiles = false;
    let loadedCount = 0;
    let failedCount = 0;
    
    for (const ns of namespaces) {
      try {
        const filePath = path.join(MESSAGES_DIR, locale, `${ns}.json`);
        
        if (!fs.existsSync(filePath)) {
          console.log(`   ❌ ${ns}: File missing`);
          failedCount++;
          continue;
        }
        
        const content = fs.readFileSync(filePath, 'utf8');
        const nsMessages = JSON.parse(content);
        messages[ns] = nsMessages;
        hasNamespaceFiles = true;
        loadedCount++;
        
        console.log(`   ✅ ${ns}: Loaded ${Object.keys(nsMessages).length} top-level keys`);
        
      } catch (error) {
        console.log(`   ❌ ${ns}: Error - ${error.message}`);
        failedCount++;
      }
    }
    
    console.log(`\n📊 Summary for ${locale}:`);
    console.log(`   Loaded: ${loadedCount} namespaces`);
    console.log(`   Failed: ${failedCount} namespaces`);
    console.log(`   Has files: ${hasNamespaceFiles}`);
    
    // Test regional fallback for ar-eg
    if (locale.includes('-')) {
      const baseLocale = locale.split('-')[0];
      console.log(`\n🔄 Testing regional fallback: ${locale} → ${baseLocale}`);
      
      try {
        const baseMessages = await testTranslationLoading(baseLocale);
        console.log(`   Base locale (${baseLocale}) loaded: ${Object.keys(baseMessages).length} namespaces`);
        
        // Simulate deep merge
        const mergedCount = Object.keys({...baseMessages, ...messages}).length;
        console.log(`   Merged result: ${mergedCount} namespaces`);
        
      } catch (error) {
        console.log(`   ❌ Base locale fallback failed: ${error.message}`);
      }
    }
    
    return messages;
    
  } catch (error) {
    console.error(`❌ Failed to test ${locale}:`, error.message);
    return {};
  }
}

// Test specific translation access patterns
function testTranslationAccess(messages, testCases) {
  console.log(`\n🧪 Testing translation access patterns:`);
  
  for (const testCase of testCases) {
    const { path: keyPath, description } = testCase;
    
    try {
      const parts = keyPath.split('.');
      let current = messages;
      
      for (const part of parts) {
        if (!current || typeof current !== 'object' || !(part in current)) {
          console.log(`   ❌ ${description}: Missing key '${keyPath}'`);
          break;
        }
        current = current[part];
      }
      
      if (current !== undefined && current !== null) {
        console.log(`   ✅ ${description}: Found '${keyPath}'`);
      }
      
    } catch (error) {
      console.log(`   ❌ ${description}: Error accessing '${keyPath}' - ${error.message}`);
    }
  }
}

// Main test function
async function runTests() {
  console.log('🚀 Runtime Translation Loading Test\n');
  
  // Test ar-eg specifically (the reported problem locale)
  const arEgMessages = await testTranslationLoading('ar-eg');
  
  // Test common translation access patterns that might fail
  const testCases = [
    { path: 'navigation.howItWorks', description: 'Navigation item' },
    { path: 'hero.title', description: 'Hero title' },
    { path: 'hero.floatingBadges.aiHumans', description: 'Hero floating badge' },
    { path: 'hero.trustBar.featuresCount', description: 'Hero trust bar' },
    { path: 'dashboard.title', description: 'Dashboard title' },
    { path: 'auth.login.title', description: 'Auth login title' },
    { path: 'builder.interface.chat.title', description: 'Builder chat title' },
    { path: 'errors.generic.somethingWrong', description: 'Generic error' },
    { path: 'pricing.plans.free.name', description: 'Pricing plan name' },
    { path: 'userMenu.profile', description: 'User menu item' }
  ];
  
  testTranslationAccess(arEgMessages, testCases);
  
  // Test if the issue might be with a specific namespace
  console.log(`\n📋 Namespace details for ar-eg:`);
  for (const [namespace, data] of Object.entries(arEgMessages)) {
    const keyCount = countKeys(data);
    console.log(`   ${namespace}: ${keyCount} total keys`);
  }
}

// Helper to count all nested keys
function countKeys(obj) {
  let count = 0;
  for (const key in obj) {
    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
      count += countKeys(obj[key]);
    } else {
      count++;
    }
  }
  return count;
}

// Run the tests
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { testTranslationLoading };