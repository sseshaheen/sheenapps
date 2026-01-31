#!/usr/bin/env node

/**
 * Prebuild Guard Script
 * Prevents illegal App Router usage of next/document components
 * 
 * This script detects and prevents build failures caused by importing
 * Html, Head, Main, NextScript from next/document in App Router projects.
 * 
 * Usage: node scripts/prebuild-guard.mjs
 * Environment: PROJECT_PATH (defaults to current working directory)
 */

import fs from 'node:fs';
import path from 'node:path';

const root = process.env.PROJECT_PATH || process.cwd();
const hasApp = fs.existsSync(path.join(root, 'app'));
const offenders = [];

/**
 * Scan a file for illegal next/document imports and Html component usage
 */
function scanFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Check for next/document imports
    const hasDocumentImport = /from\s+['"]next\/document['"]/.test(content);
    
    // Check for Html component usage (case sensitive)
    const hasHtmlComponent = /<\s*Html\b/.test(content);
    
    if (hasDocumentImport || hasHtmlComponent) {
      offenders.push({
        file: filePath,
        issues: {
          documentImport: hasDocumentImport,
          htmlComponent: hasHtmlComponent
        }
      });
    }
  } catch (error) {
    console.warn(`⚠️  Warning: Could not read file ${filePath}: ${error.message}`);
  }
}

/**
 * Recursively walk through directory and scan relevant files
 */
function walkDirectory(dir) {
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      // Skip hidden files, node_modules, and build directories
      if (entry.name.startsWith('.') || 
          entry.name === 'node_modules' || 
          entry.name.startsWith('.next') ||
          entry.name === 'dist' ||
          entry.name === 'build') {
        continue;
      }
      
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        walkDirectory(fullPath);
      } else if (/\.(jsx?|tsx?)$/.test(entry.name)) {
        scanFile(fullPath);
      }
    }
  } catch (error) {
    console.warn(`⚠️  Warning: Could not scan directory ${dir}: ${error.message}`);
  }
}

/**
 * Validate app/layout.* exists and has proper structure
 */
function validateLayout() {
  const layoutFiles = ['layout.tsx', 'layout.jsx', 'layout.ts', 'layout.js'];
  const layoutPath = layoutFiles
    .map(f => path.join(root, 'app', f))
    .find(fs.existsSync);

  if (!layoutPath) {
    console.error('❌ App Router project missing app/layout.* file');
    return false;
  }

  try {
    const content = fs.readFileSync(layoutPath, 'utf8');
    
    const hasHtml = /<html\b/.test(content);
    const hasBody = /<body\b/.test(content);
    
    if (!hasHtml || !hasBody) {
      console.error('❌ app/layout.* must render <html><body>…</body></html>');
      console.error(`   Found in: ${layoutPath}`);
      console.error(`   Has <html>: ${hasHtml}`);
      console.error(`   Has <body>: ${hasBody}`);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error(`❌ Could not validate layout file ${layoutPath}: ${error.message}`);
    return false;
  }
}

/**
 * Main execution
 */
function main() {
  console.log('🔍 Running prebuild guard...');
  console.log(`📁 Scanning: ${root}`);
  
  // Only run for App Router projects
  if (!hasApp) {
    console.log('✅ Not an App Router project - skipping next/document check');
    process.exit(0);
  }
  
  console.log('📱 App Router project detected');
  
  // Scan app directory for violations
  walkDirectory(path.join(root, 'app'));
  
  // Also scan src/app if it exists
  const srcAppPath = path.join(root, 'src', 'app');
  if (fs.existsSync(srcAppPath)) {
    console.log('📁 Scanning src/app directory...');
    walkDirectory(srcAppPath);
  }
  
  // Report violations
  if (offenders.length > 0) {
    console.error('❌ App Router project must not use next/document components:');
    console.error('');
    
    offenders.forEach(({ file, issues }) => {
      console.error(`   📄 ${path.relative(root, file)}`);
      if (issues.documentImport) {
        console.error('      ⚠️  Imports from "next/document"');
      }
      if (issues.htmlComponent) {
        console.error('      ⚠️  Uses <Html> component');
      }
    });
    
    console.error('');
    console.error('💡 Fix: Remove next/document imports and use plain <html><body> in app/layout.tsx');
    console.error('   Learn more: https://nextjs.org/docs/messages/no-document-import-in-page');
    process.exit(1);
  }
  
  // Validate layout structure
  if (!validateLayout()) {
    process.exit(1);
  }
  
  console.log('✅ Prebuild guard passed - no next/document violations found');
  process.exit(0);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { scanFile, walkDirectory, validateLayout };