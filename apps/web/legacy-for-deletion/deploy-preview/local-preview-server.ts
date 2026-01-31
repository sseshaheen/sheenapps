import { logger } from '@/utils/logger'
import { execSync } from 'child_process'
import { promises as fs } from 'fs'
import path from 'path'

export class LocalPreviewServer {
  private static readonly LOCAL_PREVIEW_PORT = 3001
  private static readonly LOCAL_PREVIEW_BASE = `http://localhost:${LocalPreviewServer.LOCAL_PREVIEW_PORT}`
  private static readonly PREVIEWS_DIR = path.join(process.cwd(), 'tmp', 'previews')
  private static serverInstance: any = null

  /**
   * Start local preview server if not already running
   */
  static async ensureServerRunning(): Promise<void> {
    if (process.env.NODE_ENV !== 'development') return

    try {
      // Check if server is already running
      const response = await fetch(`${this.LOCAL_PREVIEW_BASE}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(1000)
      })
      if (response.ok) {
        logger.info('🟢 Local preview server already running')
        return
      }
    } catch (error) {
      // Server not running, start it
      logger.info('🚀 Starting local preview server...')
      await this.startServer()
    }
  }

  /**
   * Build and serve a preview locally
   */
  static async buildAndServePreview(projectId: string, templateData: any): Promise<string> {
    const isLocal = process.env.NODE_ENV === 'development'

    if (!isLocal) {
      // Production: use hosted preview
      return `https://preview--${projectId}.sheenapps.com`
    }

    logger.info(`🏗️ Building local preview for project: ${projectId}`)

    try {
      // Ensure server is running
      await this.ensureServerRunning()

      // Create project directory
      const projectDir = path.join(this.PREVIEWS_DIR, projectId)
      await fs.mkdir(projectDir, { recursive: true })

      // Save template files
      await this.saveTemplateFiles(projectDir, templateData)

      // Ensure vite-env.d.ts exists (matching test script behavior)
      await this.ensureViteEnv(projectDir)

      // Build the project
      await this.buildProject(projectDir)

      // Return local URL
      const previewUrl = `${this.LOCAL_PREVIEW_BASE}/preview/${projectId}`
      logger.info(`✅ Local preview ready: ${previewUrl}`)

      return previewUrl

    } catch (error) {
      logger.error('❌ Local preview build failed:', error)
      throw error
    }
  }

  /**
   * Save template files to local directory
   */
  private static async saveTemplateFiles(projectDir: string, templateData: any): Promise<void> {
    logger.info(`📂 Template structure:`, {
      hasFiles: !!templateData.files,
      hasTemplateFiles: !!templateData.templateFiles,
      filesLength: templateData.files?.length || 0,
      templateFilesLength: templateData.templateFiles?.length || 0,
      name: templateData.name
    })

    // Process templateFiles[] first (like the shell script)
    if (templateData.templateFiles && Array.isArray(templateData.templateFiles)) {
      logger.info(`📦 Processing templateFiles array (${templateData.templateFiles.length} items)`)

      for (const entry of templateData.templateFiles) {
        let filePath: string
        let content: string | undefined

        if (typeof entry === 'string') {
          // It's a string - need to look up content in files array
          filePath = entry

          // Find matching file in files array
          const fileData = templateData.files?.find((f: any) =>
            f.path === entry || f.file === entry || f.filename === entry
          )

          if (fileData && fileData.content) {
            content = fileData.content
          } else {
            logger.warn(`⚠️ No content found for templateFiles entry: ${entry}`)
            continue
          }
        } else if (typeof entry === 'object') {
          // It's an object - extract path and content
          filePath = entry.path || entry.file || entry.filename || entry.name
          content = entry.content

          if (!filePath) {
            logger.warn('⚠️ templateFiles entry missing path/file/filename/name:', entry)
            continue
          }
        } else {
          logger.warn('⚠️ Invalid templateFiles entry type:', typeof entry)
          continue
        }

        if (content) {
          await this.writeFile(projectDir, filePath, content)
        }
      }
    }

    // Process files[] array (skip strings and entries without content)
    if (templateData.files && Array.isArray(templateData.files)) {
      logger.info(`📦 Processing files array (${templateData.files.length} items)`)

      for (const entry of templateData.files) {
        // Skip plain strings
        if (typeof entry === 'string') {
          logger.warn(`⚠️ Skipping files[] entry '${entry}' (string, no content)`)
          continue
        }

        // Skip objects without content
        if (!entry.content) {
          const path = entry.path || entry.file || entry.filename || '(unknown)'
          logger.warn(`⚠️ Skipping files[] entry '${path}' (no content field)`)
          continue
        }

        // Valid file - unpack it
        const filePath = entry.path || entry.file || entry.filename
        if (filePath) {
          await this.writeFile(projectDir, filePath, entry.content)
        }
      }
    }

    // If no files were saved, log a warning
    if (!templateData.files?.length && !templateData.templateFiles?.length) {
      logger.warn('No template files found in either files or templateFiles arrays')
    }

    // Create package.json if it doesn't exist
    const packageJsonPath = path.join(projectDir, 'package.json')
    try {
      await fs.access(packageJsonPath)
    } catch {
      await this.createPackageJson(projectDir, templateData)
    }

  }

  /**
   * Write a file with proper content handling (like the shell script)
   */
  private static async writeFile(projectDir: string, filePath: string, content: string): Promise<void> {
    const fullPath = path.join(projectDir, filePath)
    const dir = path.dirname(fullPath)

    // Ensure directory exists
    await fs.mkdir(dir, { recursive: true })

    // Process content to handle escaped newlines and quotes (mimicking printf '%b' and sed)
    // This mimics: printf '%b' "$content" | sed 's/\\"/"/g'
    const processedContent = content
      .replace(/\\n/g, '\n')  // Convert \n to actual newlines
      .replace(/\\t/g, '\t')  // Convert \t to tabs
      .replace(/\\r/g, '\r')  // Convert \r to carriage returns
      .replace(/\\"/g, '"')   // Convert \" to " (after other escapes)
      .replace(/\\\\/g, '\\') // Convert \\ to \ (must be last)

    // Write file
    await fs.writeFile(fullPath, processedContent, 'utf8')
    logger.info(`📄 Saved: ${filePath}`)
  }

  /**
   * Create a basic package.json for the project
   */
  private static async createPackageJson(projectDir: string, templateData: any): Promise<void> {
    const packageJson = {
      name: `preview-${templateData.name || 'template'}`,
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

    await fs.writeFile(
      path.join(projectDir, 'package.json'),
      JSON.stringify(packageJson, null, 2)
    )

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
    await fs.writeFile(path.join(projectDir, 'vite.config.ts'), viteConfig)

    // Create index.html
    const indexHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Preview</title>
    <script src="https://cdn.tailwindcss.com"></script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`
    await fs.writeFile(path.join(projectDir, 'index.html'), indexHtml)

    // Create postcss.config.js
    const postcssConfig = `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  }
}
`
    await fs.writeFile(path.join(projectDir, 'postcss.config.js'), postcssConfig)

    // Create main.tsx if it doesn't exist
    const mainTsxPath = path.join(projectDir, 'src', 'main.tsx')
    try {
      await fs.access(mainTsxPath)
    } catch {
      const mainTsx = `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
`
      await fs.writeFile(mainTsxPath, mainTsx)
    }

    // Create App.tsx if it doesn't exist
    const appTsxPath = path.join(projectDir, 'src', 'App.tsx')
    try {
      await fs.access(appTsxPath)
    } catch {
      const appTsx = `import React from 'react'

export default function App() {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-800 mb-4">
          Preview Loading...
        </h1>
        <p className="text-gray-600">
          Template: ${templateData.name || 'Untitled'}
        </p>
      </div>
    </div>
  )
}
`
      await fs.writeFile(appTsxPath, appTsx)
    }

  }

  /**
   * Ensure vite-env.d.ts exists for TypeScript projects
   */
  private static async ensureViteEnv(projectDir: string): Promise<void> {
    const viteEnvPath = path.join(projectDir, 'src', 'vite-env.d.ts')
    try {
      await fs.access(viteEnvPath)
      logger.info('📄 vite-env.d.ts already exists')
    } catch {
      // Create src directory if it doesn't exist
      const srcDir = path.join(projectDir, 'src')
      await fs.mkdir(srcDir, { recursive: true })

      const viteEnv = `/// <reference types="vite/client" />
`
      await fs.writeFile(viteEnvPath, viteEnv)
      logger.info('📄 Created vite-env.d.ts for TypeScript support')
    }
  }

  /**
   * Build the project using pnpm
   */
  private static async buildProject(projectDir: string): Promise<void> {
    logger.info(`🔨 Building project in: ${projectDir}`)

    try {
      // Fix package.json versions if needed
      const packageJsonPath = path.join(projectDir, 'package.json')
      if (await fs.access(packageJsonPath).then(() => true).catch(() => false)) {
        let packageContent = await fs.readFile(packageJsonPath, 'utf8')
        let packageJson = JSON.parse(packageContent)
        logger.info(`📦 Original package.json dependencies:`, packageJson.dependencies)
        logger.info(`📦 Original package.json devDependencies:`, packageJson.devDependencies)

        // Quick fix for known problematic versions
        let modified = false

        if (packageJson.devDependencies?.globals === '^15.16.0') {
          packageJson.devDependencies.globals = '^15.13.0' // Use a known good version
          modified = true
        }

        if (modified) {
          await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2))
          logger.info(`✅ Fixed package.json versions`)
        }
      }

      // Install dependencies
      // Force pnpm by using npx to bypass workspace detection
      execSync('npx pnpm@latest install', {
        cwd: projectDir,
        stdio: 'inherit',
        env: {
          ...process.env,
          // Disable npm workspace detection
          npm_config_workspaces_update: 'false',
          npm_config_include_workspace_root: 'false'
        }
      })

      // Build project
      execSync('npx pnpm@latest run build', {
        cwd: projectDir,
        stdio: 'inherit',
        env: {
          ...process.env,
          npm_config_workspaces_update: 'false',
          npm_config_include_workspace_root: 'false'
        }
      })

      logger.info('✅ Project built successfully')

    } catch (error) {
      logger.error('❌ Build failed:', error)
      throw new Error(`Build failed: ${error}`)
    }
  }

  /**
   * Start the local preview server
   */
  private static async startServer(): Promise<void> {
    // For now, we'll use a simple approach where Next.js serves the built files
    // In a more complex setup, we could start a separate Express server

    // Create the previews directory in public so Next.js can serve it
    const publicPreviewsDir = path.join(process.cwd(), 'public', 'previews')
    await fs.mkdir(publicPreviewsDir, { recursive: true })

    // Create a simple health check endpoint
    // This would be handled by our API routes
    logger.info('🟢 Local preview server ready (using Next.js static serving)')
  }

  /**
   * Get the preview URL for a project
   */
  static getPreviewUrl(projectId: string): string {
    if (process.env.NODE_ENV === 'development') {
      // Use our API route for serving local previews
      return `/api/local-preview/${projectId}`
    }
    return `https://preview--${projectId}.sheenapps.com`
  }

  /**
   * Clean up old previews
   */
  static async cleanupOldPreviews(): Promise<void> {
    try {
      const previewsDir = this.PREVIEWS_DIR
      const entries = await fs.readdir(previewsDir, { withFileTypes: true })

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const projectDir = path.join(previewsDir, entry.name)
          const stats = await fs.stat(projectDir)

          // Remove previews older than 1 hour
          if (Date.now() - stats.mtime.getTime() > 60 * 60 * 1000) {
            await fs.rm(projectDir, { recursive: true, force: true })
            logger.info(`🧹 Cleaned up old preview: ${entry.name}`)
          }
        }
      }
    } catch (error) {
      logger.warn('Failed to cleanup old previews:', error)
    }
  }
}
