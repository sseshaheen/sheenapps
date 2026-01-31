const fs = require('fs')
const path = require('path')

const locales = ['en', 'ar', 'ar-eg', 'ar-sa', 'ar-ae', 'fr', 'fr-ma', 'es', 'de']

console.log('📦 Starting translation file splitting...\n')

locales.forEach(locale => {
  const monolithicFile = path.join(__dirname, `../src/messages/${locale}.json`)
  
  if (!fs.existsSync(monolithicFile)) {
    console.log(`⚠️  Skipping ${locale} - file not found`)
    return
  }
  
  const messages = JSON.parse(fs.readFileSync(monolithicFile, 'utf8'))
  const outputDir = path.join(__dirname, `../src/messages/${locale}`)
  
  // Create locale directory
  fs.mkdirSync(outputDir, { recursive: true })
  
  // Split by top-level keys
  let fileCount = 0
  Object.keys(messages).forEach(namespace => {
    const namespacePath = path.join(outputDir, `${namespace}.json`)
    fs.writeFileSync(
      namespacePath, 
      JSON.stringify(messages[namespace], null, 2)
    )
    fileCount++
    console.log(`✅ Created ${locale}/${namespace}.json`)
  })
  
  console.log(`   📁 Created ${fileCount} namespace files for ${locale}\n`)
})

console.log('✅ Translation splitting complete!')
console.log('📝 Next steps:')
console.log('   1. Update Next.js i18n configuration to load split files')
console.log('   2. Test that all translations still work')
console.log('   3. Consider removing monolithic files after verification')