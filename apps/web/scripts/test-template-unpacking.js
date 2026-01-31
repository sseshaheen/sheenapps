#!/usr/bin/env node

/**
 * Test script for template unpacking
 * Run with: node scripts/test-template-unpacking.js
 */

const fs = require('fs').promises
const path = require('path')
const { execSync } = require('child_process')

// Test template based on the mock service salon template
const testTemplate = {
  name: "test-unpacking-template",
  templateFiles: [
    {
      file: "package.json",
      content: `{
  "name": "test-template",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.0.0",
    "typescript": "^5.0.0",
    "vite": "^4.4.0"
  }
}`
    },
    {
      file: "vite.config.ts",
      content: `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})`
    },
    {
      file: "index.html",
      content: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Test Template</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`
    },
    {
      file: "src/main.tsx",
      content: `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)`
    },
    {
      file: "src/App.tsx",
      content: `export default function App() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <h1>Test Template Unpacking</h1>
      <p>If you can see this, the unpacking worked! 🎉</p>
      <div style={{ marginTop: '2rem', padding: '1rem', backgroundColor: '#f0f0f0', borderRadius: '8px' }}>
        <h2>Template Details:</h2>
        <ul>
          <li>Name: test-unpacking-template</li>
          <li>Files: package.json, vite.config.ts, index.html, src/main.tsx, src/App.tsx</li>
          <li>Build: Vite + React + TypeScript</li>
        </ul>
      </div>
    </div>
  )
}`
    }
  ]
}

// Alternative format with files array (test both formats)
const testTemplateWithFilesArray = {
  name: "test-files-array",
  templateFiles: ["package.json", "src/App.tsx"],
  files: [
    {
      path: "package.json",
      content: testTemplate.templateFiles[0].content
    },
    {
      path: "src/App.tsx", 
      content: testTemplate.templateFiles[4].content
    }
  ]
}

async function testUnpacking(template, testName) {
  console.log(`\n🧪 Testing: ${testName}`)
  console.log('================================')
  
  const testDir = path.join(__dirname, '..', 'tmp', 'test-unpacking', template.name)
  
  try {
    // Clean up any existing test directory
    await fs.rm(testDir, { recursive: true, force: true })
    await fs.mkdir(testDir, { recursive: true })
    
    console.log(`📁 Test directory: ${testDir}`)
    console.log(`📋 Template structure:`)
    console.log(`   - name: ${template.name}`)
    console.log(`   - templateFiles: ${template.templateFiles?.length || 0} items`)
    console.log(`   - files: ${template.files?.length || 0} items`)
    
    // Process templateFiles array
    if (template.templateFiles && Array.isArray(template.templateFiles)) {
      console.log(`\n📦 Processing templateFiles array...`)
      
      for (const entry of template.templateFiles) {
        let filePath
        let content
        
        if (typeof entry === 'string') {
          // String entry - look up in files array
          filePath = entry
          const fileData = template.files?.find(f => 
            f.path === entry || f.file === entry || f.filename === entry
          )
          
          if (fileData && fileData.content) {
            content = fileData.content
            console.log(`   ✓ Found content for '${entry}' in files array`)
          } else {
            console.log(`   ⚠️ No content found for '${entry}'`)
            continue
          }
        } else if (typeof entry === 'object') {
          // Object entry
          filePath = entry.path || entry.file || entry.filename || entry.name
          content = entry.content
          
          if (!filePath) {
            console.log(`   ⚠️ Entry missing path:`, entry)
            continue
          }
        }
        
        if (content) {
          await writeFile(testDir, filePath, content)
        }
      }
    }
    
    // Process files array
    if (template.files && Array.isArray(template.files)) {
      console.log(`\n📦 Processing files array...`)
      
      for (const entry of template.files) {
        if (typeof entry === 'string') {
          console.log(`   ⚠️ Skipping string entry: ${entry}`)
          continue
        }
        
        if (!entry.content) {
          console.log(`   ⚠️ Skipping entry without content:`, entry.path || entry.file || '(unknown)')
          continue
        }
        
        const filePath = entry.path || entry.file || entry.filename
        if (filePath) {
          await writeFile(testDir, filePath, entry.content)
        }
      }
    }
    
    // Check what was created
    console.log(`\n📋 Files created:`)
    await listFiles(testDir, testDir)
    
    // Try to build if package.json exists
    const packageJsonPath = path.join(testDir, 'package.json')
    if (await fs.access(packageJsonPath).then(() => true).catch(() => false)) {
      console.log(`\n🔨 Found package.json, attempting build...`)
      
      try {
        console.log('   Installing dependencies...')
        execSync('npm install', { cwd: testDir, stdio: 'inherit' })
        
        console.log('   Building project...')
        execSync('npm run build', { cwd: testDir, stdio: 'inherit' })
        
        console.log('✅ Build successful!')
      } catch (buildError) {
        console.error('❌ Build failed:', buildError.message)
      }
    }
    
    console.log(`\n✅ Test '${testName}' completed`)
    
  } catch (error) {
    console.error(`\n❌ Test '${testName}' failed:`, error.message)
  }
}

async function writeFile(baseDir, filePath, content) {
  const fullPath = path.join(baseDir, filePath)
  const dir = path.dirname(fullPath)
  
  await fs.mkdir(dir, { recursive: true })
  
  // Process content (handle escapes)
  const processedContent = content
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
  
  await fs.writeFile(fullPath, processedContent, 'utf8')
  console.log(`   ✓ Created: ${filePath}`)
}

async function listFiles(dir, baseDir, indent = '') {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    const relativePath = path.relative(baseDir, fullPath)
    
    if (entry.isDirectory()) {
      console.log(`${indent}📁 ${relativePath}/`)
      if (entry.name !== 'node_modules') {
        await listFiles(fullPath, baseDir, indent + '  ')
      }
    } else {
      const stats = await fs.stat(fullPath)
      console.log(`${indent}📄 ${relativePath} (${stats.size} bytes)`)
    }
  }
}

// Run tests
async function runTests() {
  console.log('🚀 Template Unpacking Test Suite')
  console.log('================================')
  
  // Test 1: Standard template with templateFiles as objects
  await testUnpacking(testTemplate, 'Standard Template (objects in templateFiles)')
  
  // Test 2: Template with mixed format (strings in templateFiles, content in files)
  await testUnpacking(testTemplateWithFilesArray, 'Mixed Format (strings + files array)')
  
  // Test 3: Load and test the actual mock service template
  try {
    console.log('\n🔍 Loading mock service template...')
    const mockServicePath = path.join(__dirname, '..', 'src', 'services', 'ai', 'mock-service.ts')
    const mockServiceContent = await fs.readFile(mockServicePath, 'utf8')
    
    // Extract the salon template (this is a bit hacky but works for testing)
    const templateMatch = mockServiceContent.match(/const salonTemplate: any =\s*\n([\s\S]*?)return salonTemplate/m)
    if (templateMatch) {
      console.log('✓ Found salonTemplate in mock service')
      // Note: We can't easily parse this from the TypeScript file, so we'll use our test template
      console.log('  (Using test template instead of parsing TypeScript)')
    }
  } catch (error) {
    console.log('⚠️ Could not load mock service template:', error.message)
  }
  
  console.log('\n✅ All tests completed!')
  console.log('\nTo test with a real template JSON:')
  console.log('1. Save your template JSON to a file (e.g., template.json)')
  console.log('2. Modify this script to load and test it')
}

// Run the tests
runTests().catch(console.error)