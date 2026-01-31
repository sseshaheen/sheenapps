/**
 * 🔍 LOGIN REDIRECT DEBUG UTILITY
 * Run this in browser console when on /en/builder/new to diagnose the issue
 */

console.log('🔍 LOGIN REDIRECT DIAGNOSTIC');
console.log('='.repeat(50));

// Current page analysis
console.log('📍 CURRENT PAGE ANALYSIS:');
console.log('window.location.href:', window.location.href);
console.log('window.location.pathname:', window.location.pathname);
console.log('window.location.origin:', window.location.origin);

// ✅ EXPERT FIX: Test locale extraction issue
console.log('🔍 LOCALE EXTRACTION TEST:');
const pathnameSplitLocale = window.location.pathname?.split('/')[1] || 'en';
const htmlLangLocale = document.documentElement.lang || 'en';
console.log('❌ OLD METHOD - pathname.split()[1]:', pathnameSplitLocale);
console.log('✅ NEW METHOD - document.documentElement.lang:', htmlLangLocale);
console.log('🎯 ACTUAL LOCALE (should be used):', htmlLangLocale);

// Use the correct locale for testing
const extractedLocale = htmlLangLocale;

// Test the prefix-aware validation logic (EXPERT SOLUTION)
const locale = extractedLocale;
const knownSafePrefixes = [
  `/${locale}`,
  `/${locale}/dashboard`,
  `/${locale}/builder`,        // ✅ Now allows /builder/workspace/uuid
  `/${locale}/builder/new`,
  `/${locale}/builder/workspace`,
  `/${locale}/profile`,
  `/${locale}/settings`
];

console.log('🛡️ PREFIX-AWARE VALIDATION (Expert Solution):');
console.log('knownSafePrefixes:', knownSafePrefixes);
console.log('Current path:', window.location.pathname);

// Test prefix-aware matching
const windowPath = window.location.pathname;
const hasValidPrefix = knownSafePrefixes.some(prefix => windowPath.startsWith(prefix));
console.log('✅ Has valid prefix?', hasValidPrefix);

// Test the client-side logic (Expert Solution)
let predictedCurrentPath;

if (windowPath && hasValidPrefix) {
  predictedCurrentPath = windowPath;
  console.log('✅ CLIENT (Expert): Using validated window path:', windowPath);
} else {
  // Simulate the fallback logic with pathname normalization
  console.log('⚠️ CLIENT (Expert): Window path failed validation, normalizing pathname...');
  
  // Simulate stripLeadingLocale function
  const LOCALE_RE = /^\/([a-z]{2}(?:-[a-z]{2})?)(?=\/|$)/i;
  const localPath = windowPath || '/';
  const prefixlessPath = localPath.replace(LOCALE_RE, '') || '/';
  predictedCurrentPath = `/${locale}${prefixlessPath}`;
  
  console.log('   originalPath:', localPath);
  console.log('   prefixlessPath:', prefixlessPath);
  console.log('   finalPath:', predictedCurrentPath);
}

console.log('🎯 PREDICTED REDIRECT PATH:', predictedCurrentPath);

// Test server-side prefix-aware allowlist logic (EXPERT SOLUTION)
const ALLOWED_REDIRECT_PATHS = [
  '/',
  '/dashboard',
  '/dashboard/billing',
  '/dashboard/settings', 
  '/dashboard/projects',
  '/builder',
  '/builder/new',
  '/builder/workspace', // ✅ Now supports /builder/workspace/uuid
  '/profile',
  '/settings',
  '/billing',
  '/help',
  '/docs'
];

console.log('🔍 SERVER PREFIX-AWARE VALIDATION (Expert Solution):');

// Simulate stripLeadingLocale from server
const LOCALE_RE_SERVER = /^\/([a-z]{2}(?:-[a-z]{2})?)(?=\/|$)/i;
const pathWithoutLocale = predictedCurrentPath.replace(LOCALE_RE_SERVER, '') || '/';
console.log('pathWithoutLocale:', pathWithoutLocale);
console.log('ALLOWED_REDIRECT_PATHS:', ALLOWED_REDIRECT_PATHS);

// Test prefix-aware validation (supports dynamic children)
const isAllowedPrefix = ALLOWED_REDIRECT_PATHS.some(allowed => 
  pathWithoutLocale === allowed || pathWithoutLocale.startsWith(`${allowed}/`)
);
console.log('✅ Is allowed prefix?', isAllowedPrefix);

// Show which specific prefix matched
const matchingPrefix = ALLOWED_REDIRECT_PATHS.find(allowed => 
  pathWithoutLocale === allowed || pathWithoutLocale.startsWith(`${allowed}/`)
);
console.log('   Matching prefix:', matchingPrefix || 'NONE');

// Test locale normalization (server-side protection)
console.log('🛡️ LOCALE NORMALIZATION TEST:');
const LOCALE_VALIDATION_RE = /^([a-z]{2}(?:-[a-z]{2})?)$/i;
function normalizeLocale(input, fallback = 'en') {
  const v = (input || '').trim();
  return LOCALE_VALIDATION_RE.test(v) ? v.toLowerCase() : fallback;
}

console.log('normalizeLocale("en"):', normalizeLocale('en'));
console.log('normalizeLocale("builder"):', normalizeLocale('builder')); // Should return "en"
console.log('normalizeLocale("fr-ma"):', normalizeLocale('fr-ma'));

// Manual form data inspection
console.log('🔍 FORM DATA SIMULATION:');
console.log('Would send to /api/auth/sign-in:');
console.log('  returnTo:', predictedCurrentPath);
console.log('  locale:', locale);
console.log('  normalizedLocale:', normalizeLocale(locale));

console.log('='.repeat(50));
console.log('💡 NEXT STEPS:');
console.log('1. Login and check Network tab for actual form data');
console.log('2. Check server logs for validation results');
console.log('3. Verify middleware is not rewriting URLs');