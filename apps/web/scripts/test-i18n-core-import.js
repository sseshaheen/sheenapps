#!/usr/bin/env node

/**
 * Test script for Worker team to verify i18n-core package import
 * Run this after extracting the package to vendor/
 */

console.log('🧪 Testing @sheenapps/i18n-core package import...\n');

try {
  // Test basic import
  const i18nCore = require('@sheenapps/i18n-core');
  console.log('✅ Package imported successfully');
  
  // Test available exports
  const expectedExports = [
    'ERROR_CODES',
    'PROGRESS_CODES',
    'toBaseLocale',
    'validateLocale',
    'getSupportedLocales',
    'isolateBidiText',
    'wrapBidiText',
    'formatNumber',
    'formatCurrency',
    'formatDate',
    'formatRelativeTime'
  ];
  
  console.log('\n📋 Testing exports:');
  let allExportsFound = true;
  
  expectedExports.forEach(exportName => {
    if (i18nCore[exportName]) {
      console.log(`  ✅ ${exportName} - found`);
    } else {
      console.log(`  ❌ ${exportName} - missing`);
      allExportsFound = false;
    }
  });
  
  // Test ERROR_CODES
  console.log('\n🔍 Testing ERROR_CODES:');
  const { ERROR_CODES } = i18nCore;
  const sampleErrorCodes = [
    'AI_LIMIT_REACHED',
    'INSUFFICIENT_BALANCE',
    'NETWORK_TIMEOUT',
    'BUILD_FAILED'
  ];
  
  sampleErrorCodes.forEach(code => {
    if (ERROR_CODES[code]) {
      console.log(`  ✅ ${code}: "${ERROR_CODES[code]}"`);
    } else {
      console.log(`  ❌ ${code}: not found`);
    }
  });
  
  // Test locale utilities
  console.log('\n🌐 Testing locale utilities:');
  const { toBaseLocale, validateLocale } = i18nCore;
  
  // Test toBaseLocale
  const testLocales = [
    ['ar-eg', 'ar'],
    ['fr-ma', 'fr'],
    ['en-US', 'en'],
    ['es', 'es']
  ];
  
  console.log('  Testing toBaseLocale:');
  testLocales.forEach(([input, expected]) => {
    const result = toBaseLocale(input);
    if (result === expected) {
      console.log(`    ✅ toBaseLocale('${input}') = '${result}'`);
    } else {
      console.log(`    ❌ toBaseLocale('${input}') = '${result}' (expected: '${expected}')`);
    }
  });
  
  // Test validateLocale
  console.log('  Testing validateLocale:');
  const validLocale = validateLocale('ar-eg');
  const invalidLocale = validateLocale('xx-YY');
  console.log(`    ✅ validateLocale('ar-eg') = '${validLocale}'`);
  console.log(`    ✅ validateLocale('xx-YY') = '${invalidLocale}' (fallback)`);
  
  // Test BiDi utilities
  console.log('\n📝 Testing BiDi utilities:');
  const { isolateBidiText } = i18nCore;
  
  const arabicText = 'مرحبا 123 العالم';
  const isolated = isolateBidiText(arabicText);
  console.log(`  Original: "${arabicText}"`);
  console.log(`  Isolated: "${isolated}"`);
  
  // Summary
  console.log('\n' + '='.repeat(50));
  if (allExportsFound) {
    console.log('✅ All tests passed! Package is ready to use.');
    console.log('\nYou can now import in your Worker code:');
    console.log(`
  import { 
    ERROR_CODES, 
    toBaseLocale,
    validateLocale 
  } from '@sheenapps/i18n-core';
    `);
  } else {
    console.log('⚠️ Some exports are missing. Please check the package.');
  }
  
} catch (error) {
  console.error('❌ Failed to import package:', error.message);
  console.error('\nMake sure you have:');
  console.error('1. Extracted the package to vendor/@sheenapps/i18n-core/');
  console.error('2. Added to package.json dependencies:');
  console.error('   "@sheenapps/i18n-core": "file:./vendor/@sheenapps/i18n-core"');
  console.error('3. Run: npm install');
  process.exit(1);
}