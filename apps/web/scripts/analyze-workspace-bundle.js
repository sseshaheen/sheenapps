/**
 * Workspace Bundle Analyzer
 *
 * Analyzes workspace component bundle sizes and dependencies
 * Part of Phase 3 bundle optimization
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

// Configuration
const WORKSPACE_COMPONENTS_DIR = path.join(process.cwd(), 'src/components/workspace')
const WORKSPACE_HOOKS_DIR = path.join(process.cwd(), 'src/hooks/workspace')
const WORKSPACE_STORE_DIR = path.join(process.cwd(), 'src/store')
const OUTPUT_DIR = path.join(process.cwd(), 'docs/bundle-analysis')

// Bundle size thresholds (in KB)
const THRESHOLDS = {
  COMPONENT_MAX_SIZE: 50,
  HOOK_MAX_SIZE: 15,
  STORE_MAX_SIZE: 25,
  TOTAL_WORKSPACE_MAX_SIZE: 200
}

// Analysis results
const analysis = {
  timestamp: new Date().toISOString(),
  components: [],
  hooks: [],
  stores: [],
  dependencies: new Map(),
  totalSize: 0,
  recommendations: [],
  optimizationOpportunities: []
}

/**
 * Get file size in KB
 */
function getFileSize(filePath) {
  try {
    const stats = fs.statSync(filePath)
    return Math.round((stats.size / 1024) * 100) / 100
  } catch (error) {
    return 0
  }
}

/**
 * Analyze imports in a file
 */
function analyzeImports(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    const imports = []

    // Match import statements
    const importRegex = /import\s+(?:[^'"]*\s+from\s+)?['"]([^'"]+)['"]/g
    let match

    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1]

      // Skip relative imports and focus on external dependencies
      if (!importPath.startsWith('.') && !importPath.startsWith('@/')) {
        imports.push(importPath)

        // Track dependency usage
        const count = analysis.dependencies.get(importPath) || 0
        analysis.dependencies.set(importPath, count + 1)
      }
    }

    return imports
  } catch (error) {
    return []
  }
}

/**
 * Calculate component complexity score
 */
function calculateComplexityScore(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    let complexity = 0

    // Count hooks
    complexity += (content.match(/use[A-Z]\w*/g) || []).length * 2

    // Count JSX elements
    complexity += (content.match(/<[A-Z]\w*/g) || []).length

    // Count conditional rendering
    complexity += (content.match(/\?\s*</g) || []).length * 3

    // Count event handlers
    complexity += (content.match(/on[A-Z]\w*\s*=/g) || []).length

    // Count state updates
    complexity += (content.match(/set[A-Z]\w*\(/g) || []).length

    return complexity
  } catch (error) {
    return 0
  }
}

/**
 * Analyze workspace components
 */
function analyzeComponents() {
  console.log('📦 Analyzing workspace components...')

  function analyzeDirectory(dir, prefix = '') {
    const items = fs.readdirSync(dir)

    for (const item of items) {
      const itemPath = path.join(dir, item)
      const stats = fs.statSync(itemPath)

      if (stats.isDirectory()) {
        analyzeDirectory(itemPath, `${prefix}${item}/`)
      } else if (item.endsWith('.tsx') || item.endsWith('.ts')) {
        const size = getFileSize(itemPath)
        const imports = analyzeImports(itemPath)
        const complexity = calculateComplexityScore(itemPath)

        const component = {
          name: `${prefix}${item}`,
          path: itemPath,
          size,
          imports: imports.length,
          externalDependencies: imports,
          complexity,
          isOverThreshold: size > THRESHOLDS.COMPONENT_MAX_SIZE
        }

        analysis.components.push(component)
        analysis.totalSize += size

        // Add recommendations for large components
        if (component.isOverThreshold) {
          analysis.recommendations.push(
            `Component ${component.name} (${size}KB) exceeds threshold (${THRESHOLDS.COMPONENT_MAX_SIZE}KB). Consider splitting or lazy loading.`
          )
        }

        // Add recommendations for high complexity
        if (complexity > 50) {
          analysis.recommendations.push(
            `Component ${component.name} has high complexity (${complexity}). Consider refactoring.`
          )
        }
      }
    }
  }

  analyzeDirectory(WORKSPACE_COMPONENTS_DIR)
}

/**
 * Analyze workspace hooks
 */
function analyzeHooks() {
  console.log('🎣 Analyzing workspace hooks...')

  if (!fs.existsSync(WORKSPACE_HOOKS_DIR)) return

  const hookFiles = fs.readdirSync(WORKSPACE_HOOKS_DIR).filter(file =>
    file.endsWith('.ts') || file.endsWith('.tsx')
  )

  for (const file of hookFiles) {
    const filePath = path.join(WORKSPACE_HOOKS_DIR, file)
    const size = getFileSize(filePath)
    const imports = analyzeImports(filePath)

    const hook = {
      name: file,
      path: filePath,
      size,
      imports: imports.length,
      externalDependencies: imports,
      isOverThreshold: size > THRESHOLDS.HOOK_MAX_SIZE
    }

    analysis.hooks.push(hook)
    analysis.totalSize += size

    if (hook.isOverThreshold) {
      analysis.recommendations.push(
        `Hook ${hook.name} (${size}KB) exceeds threshold (${THRESHOLDS.HOOK_MAX_SIZE}KB). Consider optimization.`
      )
    }
  }
}

/**
 * Analyze workspace stores
 */
function analyzeStores() {
  console.log('🏪 Analyzing workspace stores...')

  const storeFiles = fs.readdirSync(WORKSPACE_STORE_DIR).filter(file =>
    file.includes('workspace') && (file.endsWith('.ts') || file.endsWith('.tsx'))
  )

  for (const file of storeFiles) {
    const filePath = path.join(WORKSPACE_STORE_DIR, file)
    const size = getFileSize(filePath)
    const imports = analyzeImports(filePath)

    const store = {
      name: file,
      path: filePath,
      size,
      imports: imports.length,
      externalDependencies: imports,
      isOverThreshold: size > THRESHOLDS.STORE_MAX_SIZE
    }

    analysis.stores.push(store)
    analysis.totalSize += size

    if (store.isOverThreshold) {
      analysis.recommendations.push(
        `Store ${store.name} (${size}KB) exceeds threshold (${THRESHOLDS.STORE_MAX_SIZE}KB). Consider splitting state.`
      )
    }
  }
}

/**
 * Identify optimization opportunities
 */
function identifyOptimizations() {
  console.log('🎯 Identifying optimization opportunities...')

  // Find most used dependencies
  const topDependencies = Array.from(analysis.dependencies.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)

  // Suggest code splitting for heavy dependencies
  for (const [dep, count] of topDependencies) {
    if (count > 5 && ['monaco-editor', 'highlight.js', 'chart.js'].includes(dep)) {
      analysis.optimizationOpportunities.push(
        `Dependency '${dep}' is used in ${count} files. Consider lazy loading or code splitting.`
      )
    }
  }

  // Find duplicate functionality
  const componentNames = analysis.components.map(c => c.name.toLowerCase())
  const duplicatePatterns = ['viewer', 'browser', 'manager', 'monitor']

  for (const pattern of duplicatePatterns) {
    const matching = componentNames.filter(name => name.includes(pattern))
    if (matching.length > 2) {
      analysis.optimizationOpportunities.push(
        `Multiple components with '${pattern}' pattern found (${matching.length}). Consider consolidation.`
      )
    }
  }

  // Check total bundle size
  if (analysis.totalSize > THRESHOLDS.TOTAL_WORKSPACE_MAX_SIZE) {
    analysis.optimizationOpportunities.push(
      `Total workspace bundle size (${analysis.totalSize}KB) exceeds threshold (${THRESHOLDS.TOTAL_WORKSPACE_MAX_SIZE}KB). Implement aggressive code splitting.`
    )
  }
}

/**
 * Generate report
 */
function generateReport() {
  console.log('📊 Generating bundle analysis report...')

  // Create output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  }

  // Summary statistics
  const summary = {
    totalComponents: analysis.components.length,
    totalHooks: analysis.hooks.length,
    totalStores: analysis.stores.length,
    totalSize: `${analysis.totalSize}KB`,
    largestComponent: analysis.components.reduce((max, c) => c.size > max.size ? c : max, { size: 0 }),
    averageComponentSize: `${Math.round(analysis.totalSize / analysis.components.length * 100) / 100}KB`,
    totalDependencies: analysis.dependencies.size,
    recommendations: analysis.recommendations.length,
    optimizations: analysis.optimizationOpportunities.length
  }

  // Generate markdown report
  const reportMarkdown = `# Workspace Bundle Analysis Report

Generated: ${analysis.timestamp}

## Summary

- **Total Components**: ${summary.totalComponents}
- **Total Hooks**: ${summary.totalHooks}
- **Total Stores**: ${summary.totalStores}
- **Total Bundle Size**: ${summary.totalSize}
- **Largest Component**: ${summary.largestComponent.name} (${summary.largestComponent.size}KB)
- **Average Component Size**: ${summary.averageComponentSize}
- **External Dependencies**: ${summary.totalDependencies}

## Components Analysis

| Component | Size (KB) | Complexity | Status |
|-----------|-----------|------------|--------|
${analysis.components.map(c =>
  `| ${c.name} | ${c.size} | ${c.complexity} | ${c.isOverThreshold ? '⚠️ Over threshold' : '✅ OK'} |`
).join('\n')}

## Recommendations

${analysis.recommendations.map(r => `- ${r}`).join('\n')}

## Optimization Opportunities

${analysis.optimizationOpportunities.map(o => `- ${o}`).join('\n')}

## Top Dependencies

${Array.from(analysis.dependencies.entries())
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10)
  .map(([dep, count]) => `- ${dep}: used in ${count} files`)
  .join('\n')}

## Bundle Size Distribution

- Components: ${analysis.components.reduce((sum, c) => sum + c.size, 0)}KB
- Hooks: ${analysis.hooks.reduce((sum, h) => sum + h.size, 0)}KB
- Stores: ${analysis.stores.reduce((sum, s) => sum + s.size, 0)}KB
`

  // Write reports
  fs.writeFileSync(path.join(OUTPUT_DIR, 'workspace-bundle-analysis.md'), reportMarkdown)
  fs.writeFileSync(path.join(OUTPUT_DIR, 'workspace-bundle-analysis.json'), JSON.stringify(analysis, null, 2))

  console.log(`✅ Reports generated in ${OUTPUT_DIR}`)
  console.log(`📈 Total workspace bundle size: ${analysis.totalSize}KB`)
  console.log(`⚠️  ${analysis.recommendations.length} recommendations`)
  console.log(`🎯 ${analysis.optimizationOpportunities.length} optimization opportunities`)
}

/**
 * Main analysis function
 */
function runAnalysis() {
  console.log('🔍 Starting workspace bundle analysis...')

  try {
    analyzeComponents()
    analyzeHooks()
    analyzeStores()
    identifyOptimizations()
    generateReport()

    console.log('✅ Workspace bundle analysis completed successfully!')
  } catch (error) {
    console.error('❌ Analysis failed:', error.message)
    process.exit(1)
  }
}

// Run analysis if called directly
if (require.main === module) {
  runAnalysis()
}

module.exports = {
  runAnalysis,
  analysis,
  THRESHOLDS
}