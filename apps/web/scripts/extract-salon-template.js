#!/usr/bin/env node

/**
 * Extract salon template from mock-service.ts for testing
 */

const fs = require('fs').promises
const path = require('path')

async function extractSalonTemplate() {
  try {
    // Read the mock service file
    const mockServicePath = path.join(__dirname, '..', 'src', 'services', 'ai', 'mock-service.ts')
    const content = await fs.readFile(mockServicePath, 'utf8')
    
    // Find salonTemplate definition
    const templateStart = content.indexOf('const salonTemplate: any = {')
    if (templateStart === -1) {
      console.error('Could not find salonTemplate in mock-service.ts')
      return
    }
    
    // Find the end of the template (before "return salonTemplate")
    const templateEnd = content.indexOf('return salonTemplate', templateStart)
    if (templateEnd === -1) {
      console.error('Could not find end of salonTemplate')
      return
    }
    
    // Extract the template definition
    let templateCode = content.substring(templateStart, templateEnd).trim()
    
    // Remove trailing semicolon if present
    templateCode = templateCode.replace(/;[\s]*$/, '')
    
    // Create a function to evaluate the template
    const evalCode = `
      const globals = { version: '^15.13.0' }; // Mock globals for template
      ${templateCode}
      return salonTemplate;
    `
    
    // Evaluate the template
    const templateFunc = new Function(evalCode)
    const salonTemplate = templateFunc()
    
    // Save to JSON file
    const outputPath = path.join(__dirname, 'salon-template.json')
    await fs.writeFile(outputPath, JSON.stringify(salonTemplate, null, 2))
    
    console.log(`✅ Extracted salon template to: ${outputPath}`)
    console.log(`📋 Template structure:`)
    console.log(`   - name: ${salonTemplate.name}`)
    console.log(`   - templateFiles: ${salonTemplate.templateFiles?.length || 0} items`)
    console.log(`   - files: ${salonTemplate.files?.length || 0} items`)
    
    return outputPath
    
  } catch (error) {
    console.error('❌ Failed to extract template:', error.message)
    process.exit(1)
  }
}

// Run extraction and test
extractSalonTemplate().then(async (templatePath) => {
  if (templatePath) {
    console.log('\n🧪 Now you can test the template with:')
    console.log(`node scripts/test-unpack-json.js ${templatePath}`)
    console.log(`node scripts/test-unpack-json.js ${templatePath} --install --build`)
  }
})