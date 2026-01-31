#!/usr/bin/env node

/**
 * Memory Regression Test Runner
 * 
 * Runs memory tests with proper garbage collection and reporting
 * Fails build if memory growth exceeds limits
 */

const { spawn } = require('child_process')
const path = require('path')

// Configuration
const MEMORY_TEST_CONFIG = {
  // Test timeouts
  SHORT_TEST_TIMEOUT: 45000, // 45 seconds
  EXTENDED_TEST_TIMEOUT: 360000, // 6 minutes
  
  // Memory limits
  HEAP_GROWTH_LIMIT_MB: 2,
  TOTAL_GROWTH_LIMIT_MB: 4,
  
  // Test patterns
  MEMORY_TEST_PATTERN: 'src/**/*memory-regression*.test.{ts,tsx}',
  
  // Environment
  NODE_OPTIONS: [
    '--expose-gc', // Enable garbage collection
    '--max-old-space-size=4096', // 4GB heap limit
    '--trace-warnings' // Show memory warnings
  ]
}

function runMemoryTests(options = {}) {
  return new Promise((resolve, reject) => {
    console.log('🧠 Running Memory Regression Tests...')
    console.log('Configuration:', MEMORY_TEST_CONFIG)
    
    const vitestPath = path.join(__dirname, '../node_modules/.bin/vitest')
    
    const args = [
      'run', // Run tests once (not watch mode)
      '--reporter=verbose',
      '--timeout=360000', // 6 minute timeout for extended tests
      MEMORY_TEST_CONFIG.MEMORY_TEST_PATTERN
    ]
    
    // Add extended test flag if requested
    if (options.extended) {
      process.env.RUN_EXTENDED_MEMORY_TESTS = 'true'
      console.log('🕐 Extended memory tests enabled (this may take 5-10 minutes)')
    }
    
    // Add memory configuration
    process.env.NODE_OPTIONS = MEMORY_TEST_CONFIG.NODE_OPTIONS.join(' ')
    process.env.MEMORY_HEAP_LIMIT_MB = MEMORY_TEST_CONFIG.HEAP_GROWTH_LIMIT_MB.toString()
    process.env.MEMORY_TOTAL_LIMIT_MB = MEMORY_TEST_CONFIG.TOTAL_GROWTH_LIMIT_MB.toString()
    
    const vitest = spawn('node', [vitestPath, ...args], {
      stdio: 'inherit',
      env: { ...process.env },
      cwd: path.join(__dirname, '..')
    })
    
    vitest.on('close', (code) => {
      if (code === 0) {
        console.log('✅ Memory regression tests passed!')
        console.log('📊 Memory growth is within acceptable limits')
        resolve()
      } else {
        console.error('❌ Memory regression tests failed!')
        console.error('🚨 Memory growth exceeds limits - potential memory leak detected')
        reject(new Error(`Memory tests failed with exit code ${code}`))
      }
    })
    
    vitest.on('error', (error) => {
      console.error('❌ Failed to run memory tests:', error)
      reject(error)
    })
  })
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2)
  const options = {
    extended: args.includes('--extended') || args.includes('-e'),
    ci: args.includes('--ci'),
    help: args.includes('--help') || args.includes('-h')
  }
  
  if (options.help) {
    console.log(`
Memory Regression Test Runner

Usage: node scripts/run-memory-tests.js [options]

Options:
  --extended, -e    Run extended memory tests (5-10 minutes)
  --ci              Run in CI mode with appropriate timeouts
  --help, -h        Show this help message

Examples:
  node scripts/run-memory-tests.js                # Quick memory tests
  node scripts/run-memory-tests.js --extended     # Extended memory tests
  npm run test:memory                             # Via npm script
  npm run test:memory:extended                    # Extended via npm
`)
    process.exit(0)
  }
  
  // Run the tests
  runMemoryTests(options)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error.message)
      process.exit(1)
    })
}

module.exports = { runMemoryTests, MEMORY_TEST_CONFIG }