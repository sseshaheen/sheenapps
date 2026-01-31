const fs = require('fs')
const path = require('path')

// Character mapping for pseudo-localization
const charMap = {
  'a': 'ȧ', 'A': 'Ȧ',
  'b': 'ƀ', 'B': 'Ɓ',
  'c': 'ƈ', 'C': 'Ƈ',
  'd': 'ḓ', 'D': 'Ḓ',
  'e': 'ḗ', 'E': 'Ḗ',
  'f': 'ƒ', 'F': 'Ƒ',
  'g': 'ɠ', 'G': 'Ɠ',
  'h': 'ħ', 'H': 'Ħ',
  'i': 'ḯ', 'I': 'Ḯ',
  'j': 'ĵ', 'J': 'Ĵ',
  'k': 'ķ', 'K': 'Ķ',
  'l': 'ŀ', 'L': 'Ŀ',
  'm': 'ḿ', 'M': 'Ḿ',
  'n': 'ƞ', 'N': 'Ƞ',
  'o': 'ȯ', 'O': 'Ȯ',
  'p': 'ƥ', 'P': 'Ƥ',
  'q': 'ɋ', 'Q': 'Ɋ',
  'r': 'ř', 'R': 'Ř',
  's': 'ş', 'S': 'Ş',
  't': 'ŧ', 'T': 'Ŧ',
  'u': 'ŭ', 'U': 'Ŭ',
  'v': 'ṽ', 'V': 'Ṽ',
  'w': 'ẇ', 'W': 'Ẇ',
  'x': 'ẋ', 'X': 'Ẋ',
  'y': 'ẏ', 'Y': 'Ẏ',
  'z': 'ẑ', 'Z': 'Ẑ'
}

function pseudoLocalize(text) {
  if (typeof text !== 'string') return text
  
  // Skip placeholders and special patterns
  if (text.includes('{') && text.includes('}')) {
    // Preserve ICU message format placeholders
    return text.replace(/([^{]*?)(\{[^}]+\})([^{]*)/g, (match, before, placeholder, after) => {
      return pseudoLocalize(before) + placeholder + pseudoLocalize(after)
    })
  }
  
  // Transform regular text
  let result = ''
  for (const char of text) {
    result += charMap[char] || char
  }
  
  // Add brackets to make pseudo-locale obvious and test text expansion
  // This helps identify layout issues with longer translations
  return `[${result}]`
}

function transformJsonFile(filePath) {
  const content = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  
  function transformObject(obj) {
    const transformed = {}
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        transformed[key] = pseudoLocalize(value)
      } else if (Array.isArray(value)) {
        transformed[key] = value.map(item => 
          typeof item === 'string' ? pseudoLocalize(item) : item
        )
      } else if (typeof value === 'object' && value !== null) {
        transformed[key] = transformObject(value)
      } else {
        transformed[key] = value
      }
    }
    return transformed
  }
  
  return transformObject(content)
}

// Generate pseudo-locale files
console.log('🎭 Generating pseudo-locale (en-XA) for development testing...\n')

const sourceDir = path.join(__dirname, '../src/messages/en')
const targetDir = path.join(__dirname, '../src/messages/en-XA')

// Get all JSON files in the English directory
const files = fs.readdirSync(sourceDir).filter(file => file.endsWith('.json'))

files.forEach(file => {
  const sourcePath = path.join(sourceDir, file)
  const targetPath = path.join(targetDir, file)
  
  const transformed = transformJsonFile(sourcePath)
  fs.writeFileSync(targetPath, JSON.stringify(transformed, null, 2))
  
  console.log(`✅ Generated ${file}`)
})

console.log('\n✅ Pseudo-locale generation complete!')
console.log('📝 To use the pseudo-locale:')
console.log('   1. Set NODE_ENV=development')
console.log('   2. Navigate to /en-XA/* routes')
console.log('   3. Check for layout issues with accented characters')
console.log('   4. Verify all text is wrapped in brackets [text]')