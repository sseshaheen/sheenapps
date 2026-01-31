#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const glob = require('glob');

console.log('🎯 UI-Focused i18n Audit - User-Facing Issues Only');
console.log('===================================================\n');

// Configuration - Focus on user-facing areas
const UI_DIRECTORIES = [
  'src/components/ui/**/*.{tsx,jsx}',
  'src/components/layout/**/*.{tsx,jsx}', 
  'src/components/builder/**/*.{tsx,jsx}',
  'src/components/auth/**/*.{tsx,jsx}',
  'src/app/**/page.{tsx,jsx}',
  'src/app/**/*content*.{tsx,jsx}',
];

// User-facing text patterns (not dev/logging text)
const USER_FACING_PATTERNS = [
  // Authentication & User Actions
  /["'`]\s*Sign In\s*["'`]/gi,
  /["'`]\s*Login\s*["'`]/gi,
  /["'`]\s*Log In\s*["'`]/gi,
  /["'`]\s*Sign Up\s*["'`]/gi,
  /["'`]\s*Register\s*["'`]/gi,
  /["'`]\s*Create Account\s*["'`]/gi,
  /["'`]\s*Logout\s*["'`]/gi,
  /["'`]\s*Log Out\s*["'`]/gi,
  
  // Navigation & Actions
  /["'`]\s*Home\s*["'`]/gi,
  /["'`]\s*Dashboard\s*["'`]/gi,
  /["'`]\s*Settings\s*["'`]/gi,
  /["'`]\s*Profile\s*["'`]/gi,
  /["'`]\s*Help\s*["'`]/gi,
  /["'`]\s*Support\s*["'`]/gi,
  /["'`]\s*Contact\s*["'`]/gi,
  /["'`]\s*About\s*["'`]/gi,
  /["'`]\s*More\s*["'`]/gi,
  /["'`]\s*Menu\s*["'`]/gi,
  
  // Common UI Actions
  /["'`]\s*Save\s*["'`]/gi,
  /["'`]\s*Cancel\s*["'`]/gi,
  /["'`]\s*Delete\s*["'`]/gi,
  /["'`]\s*Remove\s*["'`]/gi,
  /["'`]\s*Edit\s*["'`]/gi,
  /["'`]\s*Update\s*["'`]/gi,
  /["'`]\s*Create\s*["'`]/gi,
  /["'`]\s*Add\s*["'`]/gi,
  /["'`]\s*Submit\s*["'`]/gi,
  /["'`]\s*Send\s*["'`]/gi,
  /["'`]\s*Close\s*["'`]/gi,
  /["'`]\s*Open\s*["'`]/gi,
  /["'`]\s*View\s*["'`]/gi,
  /["'`]\s*Show\s*["'`]/gi,
  /["'`]\s*Hide\s*["'`]/gi,
  
  // User Feedback
  /["'`]\s*Loading\.\.\.\s*["'`]/gi,
  /["'`]\s*Please wait\s*["'`]/gi,
  /["'`]\s*Try again\s*["'`]/gi,
  /["'`]\s*Error\s*["'`]/gi,
  /["'`]\s*Success\s*["'`]/gi,
  /["'`]\s*Warning\s*["'`]/gi,
  /["'`]\s*Continue\s*["'`]/gi,
  /["'`]\s*Next\s*["'`]/gi,
  /["'`]\s*Back\s*["'`]/gi,
  /["'`]\s*Yes\s*["'`]/gi,
  /["'`]\s*No\s*["'`]/gi,
  /["'`]\s*OK\s*["'`]/gi,
  /["'`]\s*Confirm\s*["'`]/gi,
  
  // App-specific text
  /["'`]\s*Build Your Idea\s*["'`]/gi,
  /["'`]\s*Start Building\s*["'`]/gi,
  /["'`]\s*Get Started\s*["'`]/gi,
  /["'`]\s*Learn More\s*["'`]/gi,
  /["'`]\s*How it Works\s*["'`]/gi,
  /["'`]\s*Pricing\s*["'`]/gi,
  /["'`]\s*Features\s*["'`]/gi,
  /["'`]\s*Choose your language\s*["'`]/gi,
  /["'`]\s*Select language\s*["'`]/gi,
  
  // Form fields and labels
  /["'`]\s*Email\s*["'`]/gi,
  /["'`]\s*Password\s*["'`]/gi,
  /["'`]\s*Username\s*["'`]/gi,
  /["'`]\s*Name\s*["'`]/gi,
  /["'`]\s*Search\s*["'`]/gi,
  /["'`]\s*Filter\s*["'`]/gi,
  /["'`]\s*Sort\s*["'`]/gi,
  
  // Common phrases users see
  /["'`]\s*Coming soon\s*["'`]/gi,
  /["'`]\s*Page not found\s*["'`]/gi,
  /["'`]\s*Something went wrong\s*["'`]/gi,
  /["'`]\s*No results found\s*["'`]/gi,
  /["'`]\s*Click here\s*["'`]/gi,
];

// Files to exclude
const EXCLUDE_PATTERNS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/scripts/**',
  '**/docs/**',
  '**/*.test.*',
  '**/*.spec.*',
  '**/utils/**',     // Exclude utility files
  '**/lib/**',       // Exclude library files  
  '**/services/**',  // Exclude service files
  '**/hooks/**',     // Exclude hook files (unless UI-related)
  '**/types/**',     // Exclude type files
  '**/store/**',     // Exclude store files
];

const uiIssues = {
  criticalHardcodedText: [],
  componentsMissingHooks: [],
  jsonSyntaxErrors: []
};

// 1. Scan UI components for hardcoded text
function scanUIHardcodedText() {
  console.log('🖼️ Scanning UI components for hardcoded text...\n');
  
  const uiFiles = [];
  UI_DIRECTORIES.forEach(pattern => {
    const files = glob.sync(pattern, { ignore: EXCLUDE_PATTERNS });
    uiFiles.push(...files);
  });

  // Remove duplicates
  const uniqueFiles = [...new Set(uiFiles)];
  
  uniqueFiles.forEach(file => {
    try {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      
      USER_FACING_PATTERNS.forEach(pattern => {
        let match;
        pattern.lastIndex = 0;
        
        while ((match = pattern.exec(content)) !== null) {
          const lineNumber = content.substring(0, match.index).split('\n').length;
          const lineContent = lines[lineNumber - 1]?.trim();
          
          // Skip comments
          if (lineContent?.includes('//') || lineContent?.includes('/*')) {
            continue;
          }
          
          // Skip translation files
          if (file.includes('/messages/')) {
            continue;
          }
          
          // Skip if already using translation
          const surroundingContext = content.substring(Math.max(0, match.index - 150), match.index + 150);
          if (surroundingContext.includes('t(') || 
              surroundingContext.includes('useTranslations') || 
              surroundingContext.includes('messages.') || 
              surroundingContext.includes('translations.') ||
              surroundingContext.includes('{t(')) {
            continue;
          }
          
          // Skip if it's a prop or type definition
          if (lineContent.includes('type ') || 
              lineContent.includes('interface ') || 
              lineContent.includes('const ') ||
              lineContent.includes('=') && lineContent.includes(':')) {
            continue;
          }
          
          uiIssues.criticalHardcodedText.push({
            file: file.replace(process.cwd() + '/', ''),
            line: lineNumber,
            text: match[0],
            context: lineContent,
            category: getTextCategory(match[0])
          });
        }
      });
    } catch (error) {
      console.warn(`⚠️ Could not read file ${file}: ${error.message}`);
    }
  });
}

// 2. Check components that need translation hooks
function checkUIComponentHooks() {
  console.log('🔧 Checking UI components for missing translation hooks...\n');
  
  const componentFiles = glob.sync('src/components/**/*.{tsx,jsx}', {
    ignore: EXCLUDE_PATTERNS
  });

  componentFiles.forEach(file => {
    try {
      const content = fs.readFileSync(file, 'utf8');
      
      // Check if component has user-facing text but no translation hook
      const hasUserText = USER_FACING_PATTERNS.some(pattern => {
        pattern.lastIndex = 0;
        return pattern.test(content);
      });
      
      const hasTranslationHook = /useTranslations|useMessages|messages\.|translations\./.test(content);
      const isClientComponent = content.includes("'use client'") || content.includes('"use client"');
      
      if (hasUserText && !hasTranslationHook && isClientComponent) {
        // Count how many user-facing text patterns are found
        let textCount = 0;
        USER_FACING_PATTERNS.forEach(pattern => {
          pattern.lastIndex = 0;
          const matches = content.match(pattern);
          if (matches) textCount += matches.length;
        });
        
        uiIssues.componentsMissingHooks.push({
          file: file.replace(process.cwd() + '/', ''),
          textCount,
          priority: textCount > 3 ? 'high' : 'medium'
        });
      }
    } catch (error) {
      console.warn(`⚠️ Could not read file ${file}: ${error.message}`);
    }
  });
}

// 3. Check for JSON syntax errors that break translations
function checkJSONSyntax() {
  console.log('📋 Checking translation files for syntax errors...\n');
  
  const locales = ['en', 'ar-eg', 'ar-sa', 'ar-ae', 'ar', 'fr', 'fr-ma', 'es', 'de'];
  
  locales.forEach(locale => {
    const localeDir = `src/messages/${locale}`;
    
    if (!fs.existsSync(localeDir)) {
      uiIssues.jsonSyntaxErrors.push({
        file: localeDir,
        error: 'Directory does not exist',
        severity: 'critical'
      });
      return;
    }
    
    const files = fs.readdirSync(localeDir);
    
    files.forEach(file => {
      if (file.endsWith('.json')) {
        const filePath = path.join(localeDir, file);
        
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          JSON.parse(content);
        } catch (error) {
          uiIssues.jsonSyntaxErrors.push({
            file: filePath.replace('src/', ''),
            error: error.message,
            severity: 'critical'
          });
        }
      }
    });
  });
}

// Helper function to categorize text
function getTextCategory(text) {
  const clean = text.replace(/["'`]/g, '').toLowerCase().trim();
  
  if (['sign in', 'login', 'log in', 'sign up', 'register', 'logout'].includes(clean)) {
    return 'auth';
  }
  if (['save', 'cancel', 'delete', 'edit', 'submit', 'close'].includes(clean)) {
    return 'actions';
  }
  if (['home', 'dashboard', 'settings', 'profile', 'help', 'about'].includes(clean)) {
    return 'navigation';
  }
  if (['loading...', 'please wait', 'error', 'success'].includes(clean)) {
    return 'feedback';
  }
  if (clean.includes('build') || clean.includes('start') || clean.includes('create')) {
    return 'builder';
  }
  
  return 'general';
}

// Generate focused report
function generateFocusedReport() {
  console.log('\n🎯 UI-FOCUSED I18N AUDIT REPORT');
  console.log('==============================\n');
  
  const totalUIIssues = Object.values(uiIssues).flat().length;
  const criticalCount = uiIssues.jsonSyntaxErrors.filter(i => i.severity === 'critical').length;
  const highPriorityComponents = uiIssues.componentsMissingHooks.filter(i => i.priority === 'high').length;
  
  console.log(`📊 UI Issues Summary:`);
  console.log(`   🚨 ${uiIssues.criticalHardcodedText.length} hardcoded text instances (visible to users)`);
  console.log(`   🔧 ${uiIssues.componentsMissingHooks.length} components missing translation hooks (${highPriorityComponents} high priority)`);
  console.log(`   📋 ${uiIssues.jsonSyntaxErrors.length} JSON syntax errors (${criticalCount} critical)\n`);
  
  // 1. Critical Hardcoded Text (User-Visible)
  if (uiIssues.criticalHardcodedText.length > 0) {
    console.log(`🚨 HARDCODED TEXT IN UI (${uiIssues.criticalHardcodedText.length} issues)`);
    console.log('================================');
    console.log('These appear as English text in non-English locales:\n');
    
    // Group by category
    const categories = {};
    uiIssues.criticalHardcodedText.forEach(issue => {
      if (!categories[issue.category]) categories[issue.category] = [];
      categories[issue.category].push(issue);
    });
    
    Object.entries(categories).forEach(([category, issues]) => {
      console.log(`📱 ${category.toUpperCase()} (${issues.length} issues):`);
      issues.slice(0, 5).forEach(issue => {
        console.log(`   📍 ${issue.file}:${issue.line}`);
        console.log(`      ${issue.text} → should use {t('...')}`);
        console.log(`      Context: ${issue.context.substring(0, 80)}${issue.context.length > 80 ? '...' : ''}`);
        console.log('');
      });
      
      if (issues.length > 5) {
        console.log(`      ... and ${issues.length - 5} more ${category} issues\n`);
      }
    });
  }
  
  // 2. Components Missing Hooks  
  if (uiIssues.componentsMissingHooks.length > 0) {
    console.log(`🔧 COMPONENTS MISSING TRANSLATION HOOKS (${uiIssues.componentsMissingHooks.length} components)`);
    console.log('=============================================');
    
    const highPriority = uiIssues.componentsMissingHooks.filter(c => c.priority === 'high');
    const mediumPriority = uiIssues.componentsMissingHooks.filter(c => c.priority === 'medium');
    
    if (highPriority.length > 0) {
      console.log('🚨 HIGH PRIORITY (multiple text instances):');
      highPriority.slice(0, 8).forEach(comp => {
        console.log(`   📍 ${comp.file} (${comp.textCount} text instances)`);
        console.log(`      Fix: Add useTranslations() hook\n`);
      });
    }
    
    if (mediumPriority.length > 0) {
      console.log('📝 MEDIUM PRIORITY:');
      mediumPriority.slice(0, 5).forEach(comp => {
        console.log(`   📍 ${comp.file} (${comp.textCount} text instances)`);
      });
      
      if (mediumPriority.length > 5) {
        console.log(`   ... and ${mediumPriority.length - 5} more components\n`);
      }
    }
  }
  
  // 3. JSON Syntax Errors
  if (uiIssues.jsonSyntaxErrors.length > 0) {
    console.log(`📋 TRANSLATION FILE ERRORS (${uiIssues.jsonSyntaxErrors.length} files)`);
    console.log('============================');
    console.log('These prevent translations from loading:\n');
    
    uiIssues.jsonSyntaxErrors.forEach(error => {
      console.log(`🚨 ${error.file}`);
      console.log(`   Error: ${error.error}`);
      console.log(`   Impact: All translations in this file won't load\n`);
    });
  }
  
  // Action Plan
  console.log('🎯 IMMEDIATE ACTION PLAN FOR UI');
  console.log('===============================');
  console.log('1. 🚨 Fix JSON syntax errors (prevents all translations from loading)');
  console.log('2. 🔧 Add translation hooks to high-priority components');  
  console.log('3. 📱 Replace hardcoded text with translation calls');
  console.log('4. ✅ Test translations in Arabic/French/Spanish locales\n');
  
  // Quick wins
  if (uiIssues.jsonSyntaxErrors.length > 0) {
    console.log('🛠️ QUICK WINS - Fix These JSON Files First:');
    console.log('============================================');
    uiIssues.jsonSyntaxErrors.forEach(error => {
      console.log(`📋 ${error.file} - ${error.error.split('(')[0]}`);
    });
    console.log('');
  }
  
  console.log('✅ This focused audit shows only user-visible i18n issues.');
  console.log('🎯 Fix these to ensure proper localization for all users.\n');
}

// Run the focused audit
async function runFocusedAudit() {
  try {
    scanUIHardcodedText();
    checkUIComponentHooks();
    checkJSONSyntax();
    generateFocusedReport();
  } catch (error) {
    console.error('❌ UI Audit failed:', error);
    process.exit(1);
  }
}

runFocusedAudit();