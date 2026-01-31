#!/usr/bin/env node

/**
 * Console Logs Migration Script
 * 
 * Automatically replaces console.* calls with logger calls
 * Run: node scripts/migrate-console-logs.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Directories to process
const SOURCE_DIRS = ['src'];
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

// Console replacement patterns
const REPLACEMENTS = [
  {
    pattern: /console\.log\((.*?)\);?/g,
    replacement: "logger.info($1);"
  },
  {
    pattern: /console\.error\((.*?)\);?/g,
    replacement: "logger.error($1);"
  },
  {
    pattern: /console\.warn\((.*?)\);?/g,
    replacement: "logger.warn($1);"
  },
  {
    pattern: /console\.info\((.*?)\);?/g,
    replacement: "logger.info($1);"
  },
  {
    pattern: /console\.debug\((.*?)\);?/g,
    replacement: "logger.debug('general', $1);"
  }
];

function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);

  files.forEach(file => {
    const filePath = path.join(dirPath, file);
    
    if (fs.statSync(filePath).isDirectory()) {
      // Skip node_modules and .next
      if (!['node_modules', '.next', 'dist', 'out'].includes(file)) {
        arrayOfFiles = getAllFiles(filePath, arrayOfFiles);
      }
    } else {
      // Check if file has target extension
      if (EXTENSIONS.some(ext => file.endsWith(ext))) {
        arrayOfFiles.push(filePath);
      }
    }
  });

  return arrayOfFiles;
}

function migrateFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  let hasConsole = false;

  // Check if file has console statements
  REPLACEMENTS.forEach(({ pattern }) => {
    if (pattern.test(content)) {
      hasConsole = true;
    }
  });

  if (!hasConsole) {
    return { modified: false, hasLogger: content.includes('import { logger }') };
  }

  // Add logger import if not present
  if (!content.includes('import { logger }')) {
    // Find best place to add import
    const importRegex = /^import .* from .*$/gm;
    const imports = content.match(importRegex) || [];
    
    if (imports.length > 0) {
      // Add after last import
      const lastImport = imports[imports.length - 1];
      const lastImportIndex = content.lastIndexOf(lastImport);
      const insertPoint = lastImportIndex + lastImport.length;
      
      content = content.slice(0, insertPoint) + 
                "\nimport { logger } from '@/utils/logger';" + 
                content.slice(insertPoint);
      modified = true;
    } else {
      // Add at beginning
      content = "import { logger } from '@/utils/logger';\n\n" + content;
      modified = true;
    }
  }

  // Apply replacements
  REPLACEMENTS.forEach(({ pattern, replacement }) => {
    const originalContent = content;
    content = content.replace(pattern, replacement);
    if (content !== originalContent) {
      modified = true;
    }
  });

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
  }

  return { modified, hasLogger: true };
}

function main() {
  console.log('🔍 Scanning for console statements...\n');

  let allFiles = [];
  SOURCE_DIRS.forEach(dir => {
    if (fs.existsSync(dir)) {
      allFiles = allFiles.concat(getAllFiles(dir));
    }
  });

  console.log(`📁 Found ${allFiles.length} files to process`);

  let totalModified = 0;
  let totalWithConsole = 0;

  allFiles.forEach(filePath => {
    const result = migrateFile(filePath);
    
    if (result.modified) {
      totalModified++;
      console.log(`✅ ${filePath}`);
    }
    
    // Count files that had console statements
    const content = fs.readFileSync(filePath, 'utf8');
    if (REPLACEMENTS.some(({ pattern }) => pattern.test(content))) {
      totalWithConsole++;
    }
  });

  console.log(`\n📊 Migration Results:`);
  console.log(`   - Files modified: ${totalModified}`);
  console.log(`   - Files with remaining console: ${totalWithConsole}`);
  
  if (totalModified > 0) {
    console.log(`\n🧹 Running lint fix...`);
    try {
      execSync('npm run lint:fix', { stdio: 'inherit' });
      console.log('✅ Lint fix completed');
    } catch (error) {
      console.log('⚠️  Manual lint fix may be needed');
    }
  }

  if (totalWithConsole > 0) {
    console.log(`\n⚠️  ${totalWithConsole} files still have console statements`);
    console.log('   These may need manual review (complex expressions, etc.)');
  } else {
    console.log('\n🎉 All console statements migrated!');
  }
}

if (require.main === module) {
  main();
}

module.exports = { migrateFile, getAllFiles };