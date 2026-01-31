#!/usr/bin/env node

/**
 * Test template unpacking with a JSON file
 * Usage: node scripts/test-unpack-json.js [template.json]
 */

const fs = require('fs').promises
const path = require('path')
const { execSync } = require('child_process')

async function unpackTemplate(template, outputDir) {
  console.log(`📦 Unpacking template: ${template.name || 'unnamed'}`)
  console.log(`📁 Output directory: ${outputDir}`)
  console.log(`📋 Template structure:`)
  console.log(`   - templateFiles: ${template.templateFiles?.length || 0} items`)
  console.log(`   - files: ${template.files?.length || 0} items`)
  
  let fileCount = 0
  
  // Process templateFiles array (like shell script)
  if (template.templateFiles && Array.isArray(template.templateFiles)) {
    console.log(`\n📦 Processing templateFiles array...`)
    
    for (const entry of template.templateFiles) {
      let filePath
      let content
      
      if (typeof entry === 'string') {
        // String - look up in files array
        filePath = entry
        const fileData = template.files?.find(f => 
          f.path === entry || f.file === entry || f.filename === entry
        )
        
        if (fileData && fileData.content) {
          content = fileData.content
        } else {
          console.log(`   ⚠️ No content for: ${entry}`)
          continue
        }
      } else if (typeof entry === 'object') {
        // Object - get path and content
        filePath = entry.path || entry.file || entry.filename || entry.name
        content = entry.content
      }
      
      if (filePath && content) {
        await writeFile(outputDir, filePath, content)
        fileCount++
      }
    }
  }
  
  // Process files array
  if (template.files && Array.isArray(template.files)) {
    console.log(`\n📦 Processing files array...`)
    
    for (const entry of template.files) {
      if (typeof entry === 'string') {
        console.log(`   ⚠️ Skipping string: ${entry}`)
        continue
      }
      
      if (!entry.content) {
        console.log(`   ⚠️ No content for: ${entry.path || entry.file || '(unknown)'}`)
        continue
      }
      
      const filePath = entry.path || entry.file || entry.filename
      if (filePath) {
        await writeFile(outputDir, filePath, entry.content)
        fileCount++
      }
    }
  }
  
  console.log(`\n✅ Unpacked ${fileCount} files`)
  return fileCount
}

async function writeFile(baseDir, filePath, content) {
  const fullPath = path.join(baseDir, filePath)
  const dir = path.dirname(fullPath)
  
  await fs.mkdir(dir, { recursive: true })
  
  // Process escapes like shell script
  const processedContent = content
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
  
  await fs.writeFile(fullPath, processedContent, 'utf8')
  console.log(`   ✓ ${filePath}`)
}

async function ensureViteEnv(outputDir) {
  const viteEnvPath = path.join(outputDir, 'src', 'vite-env.d.ts')
  try {
    await fs.access(viteEnvPath)
  } catch {
    await fs.mkdir(path.join(outputDir, 'src'), { recursive: true })
    await fs.writeFile(viteEnvPath, '/// <reference types="vite/client" />\n', 'utf8')
    console.log('   ✓ Created src/vite-env.d.ts (for TypeScript CSS imports)')
  }
}

async function main() {
  const args = process.argv.slice(2)
  
  if (args.length === 0) {
    console.log('Usage: node scripts/test-unpack-json.js [template.json]')
    console.log('\nOr pipe JSON:')
    console.log('  cat template.json | node scripts/test-unpack-json.js')
    console.log('\nOr use test template:')
    console.log('  node scripts/test-unpack-json.js --test')
    process.exit(1)
  }
  
  let template
  const outputDir = path.join(__dirname, '..', 'tmp', 'test-unpack', Date.now().toString())
  
  if (args[0] === '--test') {
    // Use built-in test template
    template = {
      name: 'test-template',
      templateFiles: [
        {
          file: 'package.json',
          content: '{\n  "name": "test",\n  "version": "1.0.0"\n}'
        },
        {
          file: 'src/index.js',
          content: 'console.log("Hello from unpacked template!");'
        }
      ]
    }
  } else if (args[0] === '-') {
    // Read from stdin
    let input = ''
    process.stdin.on('data', chunk => input += chunk)
    process.stdin.on('end', async () => {
      try {
        template = JSON.parse(input)
        await processTemplate(template, outputDir)
      } catch (error) {
        console.error('❌ Failed to parse JSON:', error.message)
        process.exit(1)
      }
    })
    return
  } else {
    // Read from file
    try {
      const jsonPath = path.resolve(args[0])
      const content = await fs.readFile(jsonPath, 'utf8')
      template = JSON.parse(content)
    } catch (error) {
      console.error('❌ Failed to read template:', error.message)
      process.exit(1)
    }
  }
  
  await processTemplate(template, outputDir)
}

async function processTemplate(template, outputDir) {
  try {
    // Clean and create output directory
    await fs.rm(outputDir, { recursive: true, force: true })
    await fs.mkdir(outputDir, { recursive: true })
    
    // Unpack the template
    const fileCount = await unpackTemplate(template, outputDir)
    
    if (fileCount === 0) {
      console.log('⚠️ No files were unpacked!')
      return
    }
    
    // List created files
    console.log('\n📋 Created files:')
    await listFiles(outputDir)
    
    // Ensure vite-env.d.ts exists for TypeScript projects
    await ensureViteEnv(outputDir)
    
    // Try to install and build if package.json exists
    const packageJsonPath = path.join(outputDir, 'package.json')
    if (await fs.access(packageJsonPath).then(() => true).catch(() => false)) {
      console.log('\n🔨 Found package.json')
      
      const doInstall = process.argv.includes('--install') || process.argv.includes('-i')
      const doBuild = process.argv.includes('--build') || process.argv.includes('-b')
      
      if (doInstall || doBuild) {
        try {
          if (doInstall) {
            console.log('📦 Installing dependencies...')
            execSync('npm install', { cwd: outputDir, stdio: 'inherit' })
          }
          
          if (doBuild) {
            console.log('🏗️ Building project...')
            execSync('npm run build', { cwd: outputDir, stdio: 'inherit' })
          }
          
          console.log('✅ Success!')
        } catch (error) {
          console.error('❌ Build error:', error.message)
        }
      } else {
        console.log('💡 Add --install or --build to test npm commands')
      }
    }
    
    console.log(`\n✅ Template unpacked to: ${outputDir}`)
    
  } catch (error) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

async function listFiles(dir, baseDir = dir, indent = '') {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    const relativePath = path.relative(baseDir, fullPath)
    
    if (entry.isDirectory() && entry.name !== 'node_modules') {
      console.log(`${indent}📁 ${relativePath}/`)
      await listFiles(fullPath, baseDir, indent + '  ')
    } else if (entry.isFile()) {
      console.log(`${indent}📄 ${relativePath}`)
    }
  }
}

main().catch(console.error)