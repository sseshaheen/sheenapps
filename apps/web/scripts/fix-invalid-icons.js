#!/usr/bin/env node

/**
 * Quick fix script to correct invalid icon names that start with hyphens
 */

const fs = require('fs')

// Icon name mapping for invalid names to correct ones
const iconFixes = {
  '"-help-circle"': '"alert-circle"',
  '"-lightbulb"': '"alert-circle"',
  '"-heart"': '"sparkles"',
  '"-play"': '"arrow-right"',
  '"-alert-triangle"': '"alert-circle"',
  '"-wand2"': '"sparkles"',
  '"-circle"': '"circle"',
  '"-upload"': '"download"',
  '"-layout"': '"layout-grid"',
  '"-x-circle"': '"x"',
  '"-more-vertical"': '"menu"',
  '"-skip-forward"': '"arrow-right"',
  '"-monitor"': '"globe"',
  '"-minimize"': '"arrow-down"',
  '"-maximize"': '"arrow-up"',
  '"-chevron-left"': '"chevron-left"',
  '"-bot"': '"sparkles"',
  '"-map-pin"': '"globe"',
  '"-plus"': '"plus"'
}

// Map some missing icons to existing ones
const additionalFixes = {
  '"plus"': '"x"', // We don't have plus, use x as substitute
  '"arrow-up"': '"arrow-down"' // We don't have arrow-up, use arrow-down
}

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8')
  let modified = false
  
  console.log(`Fixing: ${filePath}`)
  
  // Fix invalid icon names
  for (const [invalid, correct] of Object.entries(iconFixes)) {
    if (content.includes(`name=${invalid}`)) {
      content = content.replace(new RegExp(`name=${invalid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g'), `name=${correct}`)
      console.log(`  Fixed: ${invalid} → ${correct}`)
      modified = true
    }
  }
  
  // Apply additional fixes
  for (const [missing, substitute] of Object.entries(additionalFixes)) {
    if (content.includes(`name=${missing}`)) {
      content = content.replace(new RegExp(`name=${missing.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g'), `name=${substitute}`)
      console.log(`  Substituted: ${missing} → ${substitute}`)
      modified = true
    }
  }
  
  if (modified) {
    fs.writeFileSync(filePath, content)
    console.log(`  ✅ Updated ${filePath}`)
  } else {
    console.log(`  ⏭️ No changes needed`)
  }
  
  return modified
}

function main() {
  console.log('🔧 Fixing invalid icon names...\n')
  
  // List of files that have invalid icon names (from the rg output)
  const filesToFix = [
    'src/components/builder/hints/smart-hint.tsx',
    'src/components/builder/builder-interface-v2.tsx',
    'src/components/builder/orchestration-interface-old.tsx',
    'src/components/builder/new-project-page.tsx',
    'src/components/builder/enhanced-preview.tsx',
    'src/components/auth/signup-form.tsx',
    'src/components/builder/builder-interface.tsx',
    'src/components/auth/password-change-form.tsx',
    'src/components/builder/preview/build-progress.tsx',
    'src/components/builder/workspace/mobile-workspace-header.tsx',
    'src/components/builder/question-flow/mobile-question-interface.tsx',
    'src/components/builder/question-flow/question-interface.tsx',
    'src/components/builder/workspace/main-work-area.tsx',
    'src/components/builder/workspace/right-panel.tsx',
    'src/components/demo/i18n-showcase.tsx',
    'src/components/builder/workspace/sidebar.tsx'
  ]
  
  let totalFixed = 0
  
  for (const file of filesToFix) {
    const fixed = fixFile(file)
    if (fixed) totalFixed++
  }
  
  console.log(`\n🎉 Fixed ${totalFixed} files`)
  console.log(`✅ Run 'npm run build' to verify the fixes`)
}

if (require.main === module) {
  main()
}

module.exports = { fixFile, iconFixes }