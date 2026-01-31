const fs = require('fs')
const path = require('path')

const locales = ['en', 'ar', 'ar-eg', 'ar-sa', 'ar-ae', 'fr', 'fr-ma', 'es', 'de', 'en-XA']

console.log('📦 Merging error namespaces and fixing consistency...\n')

locales.forEach(locale => {
  const errorsFile = path.join(__dirname, `../src/messages/${locale}/errors.json`)
  const buildErrorsBackup = path.join(__dirname, `../src/messages/${locale}/buildErrors.json.backup`)
  
  // Read existing errors.json
  let errors = {}
  if (fs.existsSync(errorsFile)) {
    errors = JSON.parse(fs.readFileSync(errorsFile, 'utf8'))
  }
  
  // Read buildErrors backup if it exists
  if (fs.existsSync(buildErrorsBackup)) {
    const buildErrors = JSON.parse(fs.readFileSync(buildErrorsBackup, 'utf8'))
    
    // Fix INTERNAL → INTERNAL_ERROR
    if (buildErrors.INTERNAL) {
      buildErrors.INTERNAL_ERROR = buildErrors.INTERNAL
      delete buildErrors.INTERNAL
    }
    if (buildErrors.titles?.INTERNAL) {
      buildErrors.titles.INTERNAL_ERROR = buildErrors.titles.INTERNAL
      delete buildErrors.titles.INTERNAL
    }
    if (buildErrors.retryButtons?.INTERNAL) {
      buildErrors.retryButtons.INTERNAL_ERROR = buildErrors.retryButtons.INTERNAL
      delete buildErrors.retryButtons.INTERNAL
    }
    
    // Add all Worker error codes to the main errors object
    Object.keys(buildErrors).forEach(key => {
      if (key !== 'titles' && key !== 'retryButtons' && key !== 'countdown') {
        // These are the actual error code messages
        errors[key] = buildErrors[key]
      }
    })
    
    // Add the grouped sections
    errors.titles = buildErrors.titles || {}
    errors.retryButtons = buildErrors.retryButtons || {}
    errors.countdown = buildErrors.countdown || {}
  }
  
  // Add any missing error codes from our ERROR_CODES constant
  const errorCodes = [
    'AUTH_FAILED',
    'AUTH_EXPIRED', 
    'AI_LIMIT_REACHED',
    'INSUFFICIENT_BALANCE',
    'BUILD_TIMEOUT',
    'BUILD_FAILED',
    'RATE_LIMITED',
    'NETWORK_TIMEOUT',
    'INTERNAL_ERROR',
    'INVALID_INPUT',
    'VALIDATION_FAILED'
  ]
  
  errorCodes.forEach(code => {
    if (!errors[code] && locale === 'en') {
      // Add placeholder for missing codes in English
      console.log(`  ⚠️ Adding missing error code: ${code}`)
      errors[code] = `Error: ${code.replace(/_/g, ' ').toLowerCase()}`
    }
  })
  
  // Write the merged file
  fs.writeFileSync(errorsFile, JSON.stringify(errors, null, 2))
  console.log(`✅ Merged errors for ${locale}`)
})

console.log('\n✅ Error namespace merge complete!')
console.log('📝 Next steps:')
console.log('   1. Review merged errors.json files')
console.log('   2. Ensure Arabic translations are actually in Arabic')
console.log('   3. Update code references from buildErrors to errors')