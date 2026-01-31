#!/usr/bin/env node

/**
 * Generate Initial Smoke Test Baseline
 * 
 * Creates the initial performance baseline from test results.
 * Usage: npm run test:smoke:baseline
 */

const fs = require('fs')
const path = require('path')
const { parseTestResults, saveBaseline } = require('./check-smoke-baseline')

const RESULTS_PATH = 'test-results/smoke-results.json'
const BASELINE_FILE = path.join(__dirname, 'smoke-baseline.json')

function main() {
  console.log('🎯 Generating smoke test performance baseline...')
  
  if (!fs.existsSync(RESULTS_PATH)) {
    console.error(`❌ Test results not found: ${RESULTS_PATH}`)
    console.error('Run tests first with: npm run test:smoke')
    process.exit(1)
  }
  
  const testTimes = parseTestResults(RESULTS_PATH)
  
  if (Object.keys(testTimes).length === 0) {
    console.error('❌ No timing data found in test results')
    process.exit(1)
  }
  
  console.log(`📊 Extracted timing data for ${Object.keys(testTimes).length} tests:`)
  
  // Sort tests by duration for display
  const sortedTests = Object.entries(testTimes)
    .sort(([, a], [, b]) => b - a)
  
  sortedTests.forEach(([test, duration]) => {
    const durationStr = duration < 1000 
      ? `${duration}ms` 
      : `${(duration / 1000).toFixed(1)}s`
    console.log(`  • ${test}: ${durationStr}`)
  })
  
  // Calculate total duration
  const totalDuration = Object.values(testTimes).reduce((sum, time) => sum + time, 0)
  const totalDurationStr = totalDuration < 1000 
    ? `${totalDuration}ms` 
    : `${(totalDuration / 1000).toFixed(1)}s`
    
  console.log(`\n⏱️  Total test suite duration: ${totalDurationStr}`)
  
  // Check if we're within the 90-second target
  if (totalDuration > 90000) {
    console.warn(`\n⚠️  Suite duration exceeds 90-second target by ${((totalDuration - 90000) / 1000).toFixed(1)}s`)
    console.warn('Consider optimizing slow tests or moving them to full E2E suite')
  } else {
    console.log(`\n✅ Suite duration within 90-second target (${(90 - totalDuration / 1000).toFixed(1)}s margin)`)
  }
  
  // Save baseline
  saveBaseline(testTimes)
  
  console.log(`\n💾 Baseline saved to: ${BASELINE_FILE}`)
  console.log('\nFuture test runs will be compared against this baseline.')
  console.log('Performance alerts will trigger if tests exceed 120% of these times.')
  
  // Generate metadata
  const metadata = {
    generated: new Date().toISOString(),
    totalTests: Object.keys(testTimes).length,
    totalDuration: totalDuration,
    slowestTest: sortedTests[0],
    fastestTest: sortedTests[sortedTests.length - 1],
    averageDuration: Math.round(totalDuration / Object.keys(testTimes).length)
  }
  
  const metadataFile = path.join(__dirname, 'smoke-baseline-metadata.json')
  fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2))
  
  console.log(`\n📋 Baseline metadata:`)
  console.log(`  • Generated: ${metadata.generated}`)
  console.log(`  • Tests: ${metadata.totalTests}`)
  console.log(`  • Average duration: ${metadata.averageDuration}ms`)
  console.log(`  • Slowest: ${metadata.slowestTest[0]} (${metadata.slowestTest[1]}ms)`)
  console.log(`  • Fastest: ${metadata.fastestTest[0]} (${metadata.fastestTest[1]}ms)`)
}

if (require.main === module) {
  main()
}