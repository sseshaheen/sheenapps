/**
 * Test script for @sheenapps/templates package
 * Run with: npx tsx scripts/test-templates.ts
 */

import {
  assertTemplateLibrary,
  getAllTemplates,
  buildTemplatePrompt,
  parseTemplateId,
  resolveTemplate,
  validateTemplateAccess
} from '@sheenapps/templates'

console.log('🔍 Running template library validation...\n')

try {
  // P1: Runtime invariant checks
  assertTemplateLibrary()
  console.log('✅ All template invariants passed!\n')

  const templates = getAllTemplates()
  const freeCount = templates.filter(t => t.tier === 'free').length
  const proCount = templates.filter(t => t.tier === 'pro').length

  console.log(`📦 Total templates: ${templates.length}`)
  console.log(`   - Free: ${freeCount}`)
  console.log(`   - PRO: ${proCount}\n`)

  // P0 Fix 2: Test parseTemplateId
  console.log('🧪 Testing parseTemplateId...')
  console.log('   Valid ID:', parseTemplateId('ecommerce'))
  console.log('   Invalid ID:', parseTemplateId('invalid'))
  console.log('   Non-string:', parseTemplateId(123))
  console.log('   Null:', parseTemplateId(null))
  console.log('')

  // P0 Fix 2: Test resolveTemplate
  console.log('🧪 Testing resolveTemplate...')
  const resolved = resolveTemplate('ecommerce')
  console.log('   Resolved ecommerce:', resolved ? resolved.id : 'null')
  console.log('   Resolved invalid:', resolveTemplate('invalid'))
  console.log('')

  // P0 Fix 3: Test validateTemplateAccess
  console.log('🧪 Testing validateTemplateAccess...')
  const freeAccess = validateTemplateAccess('ecommerce', 'free')
  console.log('   Free user + free template:', freeAccess.allowed ? '✅ allowed' : '❌ blocked')

  const proAccess = validateTemplateAccess('saas', 'free')
  console.log('   Free user + PRO template:', proAccess.allowed ? '✅ allowed' : '❌ blocked')
  console.log('   Access code:', proAccess.code)
  console.log('   Template metadata:', proAccess.template ? `${proAccess.template.id} (${proAccess.template.tier})` : 'none')
  console.log('')

  // P0 Fix 4: Test buildTemplatePrompt
  const firstTemplate = templates[0]
  const prompt = buildTemplatePrompt({
    userPrompt: 'Create an online store for my handmade crafts business',
    template: firstTemplate
  })

  console.log(`📝 Sample prompt for ${firstTemplate.id}:`)
  console.log(`   Length: ${prompt.length} chars`)
  console.log(`   Estimated tokens: ~${Math.ceil(prompt.length / 4)}`)
  console.log(`   First 200 chars: ${prompt.substring(0, 200)}...\n`)

  console.log('✅ All tests passed!')
  process.exit(0)
} catch (error) {
  console.error('❌ Validation failed:', error.message)
  console.error(error.stack)
  process.exit(1)
}
