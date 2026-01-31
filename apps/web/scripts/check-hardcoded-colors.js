#!/usr/bin/env node

/**
 * CI Guardrail: Check for hardcoded colors
 * Prevents regression to hardcoded hex/rgb/hsl values
 * Based on expert recommendation from systematic modernization plan
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

// Regex pattern from expert feedback
const HARDCODED_COLOR_REGEX = /#([0-9a-f]{3,8})|rgb\(|hsl\(/gi

// Files to exclude from checking
const EXCLUDE_PATTERNS = [
  '**/*.test.*',
  '**/__tests__/**',
  '**/node_modules/**',
  '**/scripts/**', // This script itself
  '**/migrations/**', // Migration files may contain legacy data
  '**/api/placeholder/**', // SVG generation API needs colors
  '**/api/export/**', // Export API needs hardcoded colors
  '**/api/local-preview/**', // Preview API needs hardcoded colors  
  '**/utils/chart-colors.ts', // Utility file documenting color mappings
  '**/utils/tokens-to-css-vars.ts', // Token utilities may reference colors
  '**/utils/logger.ts', // Logger may use console colors
  '**/utils/template-theme-loader.ts', // Template system needs color references
  '**/styles/mobile-responsive.css', // Legacy responsive styles
  '**/styles/dark-mode-fix.css', // Dark mode utility styles
  '**/services/preview/**', // Preview service generates dynamic HTML with colors
  '**/services/refinement/**', // AI refinement may contain color examples
  '**/components/sections/**', // Sections may use decorative colors temporarily
]

// Known acceptable patterns (with context)
const ACCEPTABLE_PATTERNS = [
  // Template processing and dynamic content
  'var(--tpl-', // Template tokens
  'hsl(var(--', // CSS variable usage (good pattern)
  'rgb(var(--', // CSS variable usage (good pattern)
  'rgba(var(--', // CSS variable usage (good pattern)
  'hsla(var(--', // CSS variable usage (good pattern)
  // Comments and documentation
  '/* ', // Color values in comments are OK
  '// ', // Color values in comments are OK
  // Error codes and anchors
  'Error #', // React error codes
  'href="#', // Anchor links
  // Template and dynamic generation systems
  'style="', // Dynamic inline styles for generated content
  'stop-color=', // SVG gradient stops
  // React Hydration errors (not colors)
  '#418', '#423', // React hydration error codes
]

function isExcluded(filePath) {
  return EXCLUDE_PATTERNS.some(pattern => {
    // Convert glob pattern to regex more safely
    const regexPattern = pattern
      .replace(/\*\*/g, '.*')  // ** matches any path
      .replace(/\*/g, '[^/]*') // * matches any filename chars
    const regex = new RegExp(regexPattern)
    return regex.test(filePath)
  })
}

function isAcceptablePattern(line, filePath) {
  return ACCEPTABLE_PATTERNS.some(pattern => {
    return line.includes(pattern) || filePath.includes(pattern)
  })
}

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8')
  const lines = content.split('\n')
  const errors = []

  lines.forEach((line, index) => {
    const matches = line.match(HARDCODED_COLOR_REGEX)
    if (matches && !isAcceptablePattern(line, filePath)) {
      errors.push({
        file: filePath,
        line: index + 1,
        content: line.trim(),
        matches: matches
      })
    }
  })

  return errors
}

function main() {
  console.log('🎨 Checking for hardcoded colors...')
  
  // Find all source files
  const command = 'find src -type f -name "*.tsx" -o -name "*.ts" -o -name "*.css" -o -name "*.js"'
  const files = execSync(command, { encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(file => file && !isExcluded(file))

  let totalErrors = 0
  const errorsByFile = new Map()

  files.forEach(file => {
    const errors = checkFile(file)
    if (errors.length > 0) {
      errorsByFile.set(file, errors)
      totalErrors += errors.length
    }
  })

  if (totalErrors === 0) {
    console.log('✅ No hardcoded colors found!')
    console.log(`   Checked ${files.length} files`)
    process.exit(0)
  }

  console.log(`❌ Found ${totalErrors} hardcoded color(s) in ${errorsByFile.size} file(s):`)
  console.log()

  errorsByFile.forEach((errors, file) => {
    console.log(`📄 ${file}:`)
    errors.forEach(error => {
      console.log(`   Line ${error.line}: ${error.content}`)
      console.log(`   Found: ${error.matches.join(', ')}`)
    })
    console.log()
  })

  console.log('💡 Use design system tokens instead:')
  console.log('   - CSS: hsl(var(--accent)), hsl(var(--chart-primary))')
  console.log('   - Tailwind: bg-accent, text-chart-primary')
  console.log('   - Charts: import { CHART_COLOR_ARRAY } from "@/utils/chart-colors"')
  console.log()

  process.exit(1)
}

if (require.main === module) {
  main()
}

module.exports = { checkFile, isExcluded, isAcceptablePattern }