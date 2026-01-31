#!/usr/bin/env node

/**
 * Test script for local preview functionality
 * Run with: node scripts/test-local-preview.js
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const TEST_PROJECT_ID = 'test-local-preview'
const PREVIEWS_DIR = path.join(__dirname, '..', 'tmp', 'previews')

console.log('🧪 Testing Local Preview System')
console.log('================================')

// Test template data
const testTemplate = {
  name: 'Test Template',
  files: [
    {
      path: 'src/App.tsx',
      content: `import React from 'react'

export default function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-500 to-blue-600 flex items-center justify-center">
      <div className="text-center text-white">
        <h1 className="text-4xl font-bold mb-4">🚀 Local Preview Test</h1>
        <p className="text-xl mb-6">This template was built locally using the preview system</p>
        <div className="bg-white bg-opacity-20 rounded-lg p-6">
          <p className="text-lg">
            Test completed at: {new Date().toLocaleString()}
          </p>
          <p className="text-sm mt-2">
            Project ID: ${TEST_PROJECT_ID}
          </p>
        </div>
      </div>
    </div>
  )
}`
    },
    {
      path: 'src/main.tsx',
      content: `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
`
    }
  ]
}

async function testLocalPreview() {
  try {
    console.log('1. 📁 Creating test project directory...')
    const projectDir = path.join(PREVIEWS_DIR, TEST_PROJECT_ID)
    
    // Clean up any existing test
    if (fs.existsSync(projectDir)) {
      fs.rmSync(projectDir, { recursive: true, force: true })
    }
    
    fs.mkdirSync(projectDir, { recursive: true })
    fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true })
    
    console.log('2. 💾 Saving template files...')
    
    // Save template files
    for (const file of testTemplate.files) {
      const filePath = path.join(projectDir, file.path)
      fs.writeFileSync(filePath, file.content)
      console.log(`   ✓ ${file.path}`)
    }
    
    console.log('3. 📦 Creating package.json...')
    const packageJson = {
      name: 'test-local-preview',
      version: '1.0.0',
      private: true,
      scripts: {
        build: 'vite build',
        preview: 'vite preview'
      },
      dependencies: {
        react: '^18.2.0',
        'react-dom': '^18.2.0'
      },
      devDependencies: {
        '@types/react': '^18.2.0',
        '@types/react-dom': '^18.2.0',
        '@vitejs/plugin-react': '^4.0.0',
        autoprefixer: '^10.4.0',
        postcss: '^8.4.0',
        tailwindcss: '^3.3.0',
        typescript: '^5.0.0',
        vite: '^4.4.0'
      }
    }
    
    fs.writeFileSync(
      path.join(projectDir, 'package.json'),
      JSON.stringify(packageJson, null, 2)
    )
    
    console.log('4. ⚙️ Creating config files...')
    
    // Create vite config
    const viteConfig = `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false
  }
})
`
    fs.writeFileSync(path.join(projectDir, 'vite.config.ts'), viteConfig)
    
    // Create index.html
    const indexHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Local Preview Test</title>
    <script src="https://cdn.tailwindcss.com"></script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`
    fs.writeFileSync(path.join(projectDir, 'index.html'), indexHtml)
    
    // Create postcss.config.js
    const postcssConfig = `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  }
}
`
    fs.writeFileSync(path.join(projectDir, 'postcss.config.js'), postcssConfig)
    
    console.log('5. 🔧 Installing dependencies...')
    execSync('npm install', { 
      cwd: projectDir,
      stdio: 'inherit'
    })
    
    console.log('6. 🏗️ Building project...')
    execSync('npm run build', { 
      cwd: projectDir,
      stdio: 'inherit'
    })
    
    console.log('7. ✅ Checking build output...')
    const distDir = path.join(projectDir, 'dist')
    if (fs.existsSync(path.join(distDir, 'index.html'))) {
      console.log('   ✓ index.html created')
    } else {
      throw new Error('Build failed - no index.html found')
    }
    
    console.log('')
    console.log('🎉 Local Preview Test Completed Successfully!')
    console.log('==========================================')
    console.log('')
    console.log('To test the preview:')
    console.log('1. Start your Next.js dev server: npm run dev')
    console.log('2. Navigate to: http://localhost:3000/test-local-preview')
    console.log('3. Click "Create Test Preview"')
    console.log('4. The iframe should show the built template')
    console.log('')
    console.log('Or test the API directly:')
    console.log(`   curl http://localhost:3000/api/local-preview/${TEST_PROJECT_ID}`)
    console.log('')
    
  } catch (error) {
    console.error('❌ Local Preview Test Failed:', error.message)
    process.exit(1)
  }
}

testLocalPreview()