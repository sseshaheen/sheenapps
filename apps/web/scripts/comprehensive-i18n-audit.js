#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const glob = require('glob');

console.log('🔍 Comprehensive i18n Audit - Finding Real Runtime Issues');
console.log('=====================================\n');

// Configuration
const srcDir = 'src';
const messagesDir = 'src/messages';
const locales = ['en', 'ar-eg', 'ar-sa', 'ar-ae', 'ar', 'fr', 'fr-ma', 'es', 'de'];

// Patterns for detecting hardcoded English text
const ENGLISH_TEXT_PATTERNS = [
  // Common UI text
  /["'`]\s*Sign In\s*["'`]/gi,
  /["'`]\s*Login\s*["'`]/gi,
  /["'`]\s*Log In\s*["'`]/gi,
  /["'`]\s*Sign Up\s*["'`]/gi,
  /["'`]\s*Register\s*["'`]/gi,
  /["'`]\s*Create Account\s*["'`]/gi,
  /["'`]\s*Get Started\s*["'`]/gi,
  /["'`]\s*Start Building\s*["'`]/gi,
  /["'`]\s*Build Your Idea\s*["'`]/gi,
  /["'`]\s*Learn More\s*["'`]/gi,
  /["'`]\s*Read More\s*["'`]/gi,
  /["'`]\s*Contact Us\s*["'`]/gi,
  /["'`]\s*About Us\s*["'`]/gi,
  /["'`]\s*Home\s*["'`]/gi,
  /["'`]\s*Dashboard\s*["'`]/gi,
  /["'`]\s*Settings\s*["'`]/gi,
  /["'`]\s*Profile\s*["'`]/gi,
  /["'`]\s*Logout\s*["'`]/gi,
  /["'`]\s*Log Out\s*["'`]/gi,
  /["'`]\s*Save\s*["'`]/gi,
  /["'`]\s*Cancel\s*["'`]/gi,
  /["'`]\s*Delete\s*["'`]/gi,
  /["'`]\s*Remove\s*["'`]/gi,
  /["'`]\s*Edit\s*["'`]/gi,
  /["'`]\s*Update\s*["'`]/gi,
  /["'`]\s*Create\s*["'`]/gi,
  /["'`]\s*Add\s*["'`]/gi,
  /["'`]\s*New\s*["'`]/gi,
  /["'`]\s*View\s*["'`]/gi,
  /["'`]\s*Show\s*["'`]/gi,
  /["'`]\s*Hide\s*["'`]/gi,
  /["'`]\s*Open\s*["'`]/gi,
  /["'`]\s*Close\s*["'`]/gi,
  /["'`]\s*Submit\s*["'`]/gi,
  /["'`]\s*Send\s*["'`]/gi,
  /["'`]\s*Upload\s*["'`]/gi,
  /["'`]\s*Download\s*["'`]/gi,
  /["'`]\s*Export\s*["'`]/gi,
  /["'`]\s*Import\s*["'`]/gi,
  /["'`]\s*Search\s*["'`]/gi,
  /["'`]\s*Filter\s*["'`]/gi,
  /["'`]\s*Sort\s*["'`]/gi,
  /["'`]\s*Loading\.\.\.\s*["'`]/gi,
  /["'`]\s*Please wait\s*["'`]/gi,
  /["'`]\s*Try again\s*["'`]/gi,
  /["'`]\s*Error\s*["'`]/gi,
  /["'`]\s*Success\s*["'`]/gi,
  /["'`]\s*Warning\s*["'`]/gi,
  /["'`]\s*Info\s*["'`]/gi,
  /["'`]\s*Notice\s*["'`]/gi,
  /["'`]\s*Continue\s*["'`]/gi,
  /["'`]\s*Next\s*["'`]/gi,
  /["'`]\s*Previous\s*["'`]/gi,
  /["'`]\s*Back\s*["'`]/gi,
  /["'`]\s*Forward\s*["'`]/gi,
  /["'`]\s*Confirm\s*["'`]/gi,
  /["'`]\s*Yes\s*["'`]/gi,
  /["'`]\s*No\s*["'`]/gi,
  /["'`]\s*OK\s*["'`]/gi,
  /["'`]\s*Okay\s*["'`]/gi,
  /["'`]\s*Help\s*["'`]/gi,
  /["'`]\s*Support\s*["'`]/gi,
  /["'`]\s*FAQ\s*["'`]/gi,
  /["'`]\s*Documentation\s*["'`]/gi,
  /["'`]\s*Docs\s*["'`]/gi,
  /["'`]\s*Guide\s*["'`]/gi,
  /["'`]\s*Tutorial\s*["'`]/gi,
  /["'`]\s*More\s*["'`]/gi,
  /["'`]\s*Less\s*["'`]/gi,
  /["'`]\s*Show More\s*["'`]/gi,
  /["'`]\s*Show Less\s*["'`]/gi,
  /["'`]\s*Expand\s*["'`]/gi,
  /["'`]\s*Collapse\s*["'`]/gi,
  /["'`]\s*Toggle\s*["'`]/gi,
  /["'`]\s*Select\s*["'`]/gi,
  /["'`]\s*Choose\s*["'`]/gi,
  /["'`]\s*Pick\s*["'`]/gi,
  /["'`]\s*Options\s*["'`]/gi,
  /["'`]\s*Preferences\s*["'`]/gi,
  /["'`]\s*Configuration\s*["'`]/gi,
  /["'`]\s*Config\s*["'`]/gi,
  
  // Common phrases
  /["'`]\s*Click here\s*["'`]/gi,
  /["'`]\s*Get started\s*["'`]/gi,
  /["'`]\s*Learn more\s*["'`]/gi,
  /["'`]\s*Read more\s*["'`]/gi,
  /["'`]\s*Find out more\s*["'`]/gi,
  /["'`]\s*Tell us more\s*["'`]/gi,
  /["'`]\s*Coming soon\s*["'`]/gi,
  /["'`]\s*Under construction\s*["'`]/gi,
  /["'`]\s*Page not found\s*["'`]/gi,
  /["'`]\s*Something went wrong\s*["'`]/gi,
  /["'`]\s*An error occurred\s*["'`]/gi,
  /["'`]\s*Please try again\s*["'`]/gi,
  /["'`]\s*Invalid input\s*["'`]/gi,
  /["'`]\s*Required field\s*["'`]/gi,
  /["'`]\s*Optional field\s*["'`]/gi,
  /["'`]\s*Choose your language\s*["'`]/gi,
  /["'`]\s*Select language\s*["'`]/gi,
  /["'`]\s*Change language\s*["'`]/gi,
  
  // Business/App specific
  /["'`]\s*Build Your Idea\s*["'`]/gi,
  /["'`]\s*Start Building\s*["'`]/gi,
  /["'`]\s*Create Your App\s*["'`]/gi,
  /["'`]\s*Launch Your Business\s*["'`]/gi,
  /["'`]\s*Deploy Now\s*["'`]/gi,
  /["'`]\s*Preview\s*["'`]/gi,
  /["'`]\s*Live Preview\s*["'`]/gi,
  /["'`]\s*How it Works\s*["'`]/gi,
  /["'`]\s*Pricing\s*["'`]/gi,
  /["'`]\s*Features\s*["'`]/gi,
  /["'`]\s*Contact\s*["'`]/gi,
  /["'`]\s*About\s*["'`]/gi,
  
  // Longer phrases that might be missed
  /["'`][A-Z][a-z\s]{10,50}["'`]/g,  // Sentences starting with capital
];

// Files to exclude from the scan
const EXCLUDE_PATTERNS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/coverage/**',
  '**/*.test.*',
  '**/*.spec.*',
  '**/scripts/**',
  '**/docs/**',
  '**/README.md',
  '**/*.md',
  '**/package*.json',
  '**/tsconfig*.json',
  '**/next.config.*',
  '**/tailwind.config.*',
];

// Issues tracker
const issues = {
  hardcodedText: [],
  missingTranslationHooks: [],
  translationFileIssues: [],
  componentIssues: [],
  runtimeIssues: []
};

// 1. Scan for hardcoded English text in components
function scanHardcodedText() {
  console.log('📱 Scanning components for hardcoded English text...\n');
  
  const componentFiles = glob.sync(`${srcDir}/**/*.{tsx,jsx,ts,js}`, {
    ignore: EXCLUDE_PATTERNS
  });

  componentFiles.forEach(file => {
    try {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      
      ENGLISH_TEXT_PATTERNS.forEach(pattern => {
        let match;
        pattern.lastIndex = 0; // Reset regex
        
        while ((match = pattern.exec(content)) !== null) {
          const lineNumber = content.substring(0, match.index).split('\n').length;
          const lineContent = lines[lineNumber - 1]?.trim();
          
          // Skip if it's in a comment
          if (lineContent?.includes('//') || lineContent?.includes('/*') || lineContent?.includes('*/')) {
            continue;
          }
          
          // Skip if it's in a translation file
          if (file.includes('/messages/')) {
            continue;
          }
          
          // Skip if it's already using translation function
          const surroundingContext = content.substring(Math.max(0, match.index - 100), match.index + 100);
          if (surroundingContext.includes('t(') || surroundingContext.includes('useTranslations') || 
              surroundingContext.includes('messages.') || surroundingContext.includes('translations.')) {
            continue;
          }
          
          issues.hardcodedText.push({
            file: file.replace(process.cwd() + '/', ''),
            line: lineNumber,
            text: match[0],
            context: lineContent,
            severity: 'high'
          });
        }
      });
    } catch (error) {
      console.warn(`⚠️ Could not read file ${file}: ${error.message}`);
    }
  });
}

// 2. Check for components that should use translations but don't
function scanMissingTranslationHooks() {
  console.log('🔗 Checking for missing useTranslations hooks...\n');
  
  const componentFiles = glob.sync(`${srcDir}/components/**/*.{tsx,jsx}`, {
    ignore: EXCLUDE_PATTERNS
  });

  componentFiles.forEach(file => {
    try {
      const content = fs.readFileSync(file, 'utf8');
      
      // Check if component contains text content but no translation hook
      const hasTextContent = /["'`][A-Za-z\s]{3,}["'`]/.test(content);
      const hasTranslationHook = /useTranslations|useMessages|messages\.|translations\./.test(content);
      const isClientComponent = content.includes("'use client'") || content.includes('"use client"');
      
      if (hasTextContent && !hasTranslationHook && isClientComponent) {
        issues.missingTranslationHooks.push({
          file: file.replace(process.cwd() + '/', ''),
          reason: 'Client component with text content but no translation hook',
          severity: 'medium'
        });
      }
    } catch (error) {
      console.warn(`⚠️ Could not read file ${file}: ${error.message}`);
    }
  });
}

// 3. Validate translation file structure
function validateTranslationFiles() {
  console.log('📄 Validating translation file structure...\n');
  
  const baseLocale = 'en';
  let baseStructure = {};
  
  // Load base structure
  try {
    const namespaces = fs.readdirSync(path.join(messagesDir, baseLocale));
    
    for (const namespace of namespaces) {
      if (namespace.endsWith('.json')) {
        const namespaceName = namespace.replace('.json', '');
        const filePath = path.join(messagesDir, baseLocale, namespace);
        const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        baseStructure[namespaceName] = getAllKeys(content);
      }
    }
  } catch (error) {
    issues.translationFileIssues.push({
      file: `${messagesDir}/${baseLocale}`,
      error: error.message,
      severity: 'critical'
    });
    return;
  }
  
  // Compare other locales
  locales.forEach(locale => {
    if (locale === baseLocale) return;
    
    for (const [namespace, baseKeys] of Object.entries(baseStructure)) {
      try {
        const filePath = path.join(messagesDir, locale, `${namespace}.json`);
        
        if (!fs.existsSync(filePath)) {
          issues.translationFileIssues.push({
            file: `${messagesDir}/${locale}/${namespace}.json`,
            error: 'File does not exist',
            severity: 'critical'
          });
          continue;
        }
        
        const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const localeKeys = getAllKeys(content);
        
        const missingKeys = baseKeys.filter(key => !localeKeys.includes(key));
        const extraKeys = localeKeys.filter(key => !baseKeys.includes(key));
        
        if (missingKeys.length > 0) {
          issues.translationFileIssues.push({
            file: `${messagesDir}/${locale}/${namespace}.json`,
            error: `Missing keys: ${missingKeys.join(', ')}`,
            missingKeys,
            severity: 'high'
          });
        }
        
        if (extraKeys.length > 0) {
          issues.translationFileIssues.push({
            file: `${messagesDir}/${locale}/${namespace}.json`,
            error: `Extra keys: ${extraKeys.join(', ')}`,
            extraKeys,
            severity: 'low'
          });
        }
        
      } catch (error) {
        issues.translationFileIssues.push({
          file: `${messagesDir}/${locale}/${namespace}.json`,
          error: error.message,
          severity: 'critical'
        });
      }
    }
  });
}

// Helper function to get all keys from nested object
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

// 4. Check runtime translation usage patterns
function checkRuntimePatterns() {
  console.log('⚡ Checking runtime translation patterns...\n');
  
  const pageFiles = glob.sync(`${srcDir}/app/**/page.{tsx,jsx}`, {
    ignore: EXCLUDE_PATTERNS
  });

  pageFiles.forEach(file => {
    try {
      const content = fs.readFileSync(file, 'utf8');
      
      // Check if page loads translations but doesn't pass them properly
      const loadsTranslations = /messages\s*=.*import.*\.json/.test(content);
      const hasTranslationProps = /translations\s*[=:]/gi.test(content);
      
      if (loadsTranslations && !hasTranslationProps) {
        issues.runtimeIssues.push({
          file: file.replace(process.cwd() + '/', ''),
          issue: 'Page loads translations but may not pass them to components',
          severity: 'medium'
        });
      }
      
      // Check for direct message imports without proper error handling
      if (content.includes('import(') && content.includes('messages/') && !content.includes('try') && !content.includes('catch')) {
        issues.runtimeIssues.push({
          file: file.replace(process.cwd() + '/', ''),
          issue: 'Dynamic message import without error handling',
          severity: 'medium'
        });
      }
      
    } catch (error) {
      console.warn(`⚠️ Could not read file ${file}: ${error.message}`);
    }
  });
}

// Generate comprehensive report
function generateReport() {
  console.log('\n🎯 COMPREHENSIVE I18N AUDIT REPORT');
  console.log('=====================================\n');
  
  const totalIssues = Object.values(issues).flat().length;
  const criticalIssues = Object.values(issues).flat().filter(i => i.severity === 'critical').length;
  const highIssues = Object.values(issues).flat().filter(i => i.severity === 'high').length;
  
  console.log(`📊 Summary: ${totalIssues} total issues found`);
  console.log(`🚨 Critical: ${criticalIssues} | ⚠️ High: ${highIssues} | 📝 Medium/Low: ${totalIssues - criticalIssues - highIssues}\n`);
  
  // 1. Hardcoded Text Issues (Most Critical for Runtime)
  if (issues.hardcodedText.length > 0) {
    console.log(`🚨 HARDCODED ENGLISH TEXT (${issues.hardcodedText.length} issues)`);
    console.log('==========================================');
    console.log('These cause English text to appear in non-English locales:\n');
    
    issues.hardcodedText.slice(0, 15).forEach(issue => {
      console.log(`📍 ${issue.file}:${issue.line}`);
      console.log(`   Text: ${issue.text}`);
      console.log(`   Context: ${issue.context}`);
      console.log(`   Fix: Replace with {t('key')} or {translations.key}\n`);
    });
    
    if (issues.hardcodedText.length > 15) {
      console.log(`   ... and ${issues.hardcodedText.length - 15} more hardcoded text issues\n`);
    }
  }
  
  // 2. Missing Translation Hooks
  if (issues.missingTranslationHooks.length > 0) {
    console.log(`🔗 MISSING TRANSLATION HOOKS (${issues.missingTranslationHooks.length} issues)`);
    console.log('============================================');
    issues.missingTranslationHooks.slice(0, 10).forEach(issue => {
      console.log(`📍 ${issue.file}`);
      console.log(`   ${issue.reason}`);
      console.log(`   Fix: Add useTranslations() hook\n`);
    });
    
    if (issues.missingTranslationHooks.length > 10) {
      console.log(`   ... and ${issues.missingTranslationHooks.length - 10} more components\n`);
    }
  }
  
  // 3. Translation File Issues
  if (issues.translationFileIssues.length > 0) {
    console.log(`📄 TRANSLATION FILE ISSUES (${issues.translationFileIssues.length} issues)`);
    console.log('=======================================');
    issues.translationFileIssues.slice(0, 10).forEach(issue => {
      console.log(`📍 ${issue.file}`);
      console.log(`   Error: ${issue.error}`);
      if (issue.missingKeys) {
        console.log(`   Missing: ${issue.missingKeys.slice(0, 3).join(', ')}${issue.missingKeys.length > 3 ? '...' : ''}`);
      }
      console.log('');
    });
    
    if (issues.translationFileIssues.length > 10) {
      console.log(`   ... and ${issues.translationFileIssues.length - 10} more file issues\n`);
    }
  }
  
  // 4. Runtime Issues
  if (issues.runtimeIssues.length > 0) {
    console.log(`⚡ RUNTIME ISSUES (${issues.runtimeIssues.length} issues)`);
    console.log('=============================');
    issues.runtimeIssues.forEach(issue => {
      console.log(`📍 ${issue.file}`);
      console.log(`   ${issue.issue}\n`);
    });
  }
  
  // Action Plan
  console.log('🎯 PRIORITY ACTION PLAN');
  console.log('========================');
  console.log('1. 🚨 Fix hardcoded text in components (causes visible English in non-English locales)');
  console.log('2. 📄 Fix critical translation file errors (JSON syntax, missing files)');
  console.log('3. 🔗 Add missing translation hooks to components');
  console.log('4. ⚡ Address runtime loading issues');
  console.log('5. 📝 Clean up extra/missing translation keys\n');
  
  // Next Steps
  if (issues.hardcodedText.length > 0) {
    console.log('🛠️ IMMEDIATE FIXES NEEDED:');
    console.log('===========================');
    
    // Group by file for easier fixing
    const fileGroups = {};
    issues.hardcodedText.forEach(issue => {
      if (!fileGroups[issue.file]) fileGroups[issue.file] = [];
      fileGroups[issue.file].push(issue);
    });
    
    Object.entries(fileGroups).slice(0, 5).forEach(([file, fileIssues]) => {
      console.log(`\n📝 ${file} (${fileIssues.length} issues):`);
      fileIssues.slice(0, 3).forEach(issue => {
        console.log(`   Line ${issue.line}: ${issue.text} → {t('...')}`);
      });
      if (fileIssues.length > 3) {
        console.log(`   ... and ${fileIssues.length - 3} more`);
      }
    });
    
    console.log('\n💡 Add useTranslations() hook and create translation keys for these texts.');
  }
  
  console.log('\n✅ Audit complete! Address issues in priority order for best results.');
}

// Run the comprehensive audit
async function runAudit() {
  try {
    scanHardcodedText();
    scanMissingTranslationHooks();
    validateTranslationFiles();
    checkRuntimePatterns();
    generateReport();
  } catch (error) {
    console.error('❌ Audit failed:', error);
    process.exit(1);
  }
}

runAudit();