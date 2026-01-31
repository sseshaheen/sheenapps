#!/usr/bin/env node

/**
 * Smoke Test Baseline Performance Checker
 * 
 * Compares current test run times against baseline and alerts on regressions.
 * Usage: node scripts/check-smoke-baseline.js test-results/smoke-results.json
 */

const fs = require('fs')
const path = require('path')

const BASELINE_FILE = path.join(__dirname, 'smoke-baseline.json')
const PERFORMANCE_THRESHOLD = 1.2 // 120% of baseline

function loadBaseline() {
  try {
    if (fs.existsSync(BASELINE_FILE)) {
      return JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'))
    }
  } catch (error) {
    console.warn('Could not load baseline file:', error.message)
  }
  return {}
}

function saveBaseline(baseline) {
  try {
    fs.writeFileSync(BASELINE_FILE, JSON.stringify(baseline, null, 2))
    console.log('✅ Baseline updated successfully')
  } catch (error) {
    console.error('❌ Failed to save baseline:', error.message)
  }
}

function parseTestResults(resultsPath) {
  try {
    const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'))
    
    const testTimes = {}
    
    // Parse Playwright test results structure (nested suites)
    function parseNestedSuites(suites) {
      suites.forEach(suite => {
        // Check for specs at this level
        if (suite.specs) {
          suite.specs.forEach(spec => {
            const testName = spec.title || spec.name
            if (spec.tests && spec.tests.length > 0) {
              const test = spec.tests[0]
              if (test.results && test.results.length > 0) {
                const result = test.results[0]
                if (result.duration) {
                  testTimes[testName] = result.duration
                }
              }
            }
          })
        }
        
        // Recursively check nested suites
        if (suite.suites && suite.suites.length > 0) {
          parseNestedSuites(suite.suites)
        }
      })
    }
    
    if (results.suites) {
      parseNestedSuites(results.suites)
    }
    
    // Alternative parsing for different result formats
    if (Object.keys(testTimes).length === 0 && results.tests) {
      results.tests.forEach(test => {
        if (test.title && test.duration) {
          testTimes[test.title] = test.duration
        }
      })
    }
    
    return testTimes
  } catch (error) {
    console.error('❌ Failed to parse test results:', error.message)
    return {}
  }
}

function checkPerformance(current, baseline) {
  const alerts = []
  const improvements = []
  const newTests = []
  
  Object.entries(current).forEach(([testName, currentTime]) => {
    const baselineTime = baseline[testName]
    
    if (!baselineTime) {
      newTests.push({
        test: testName,
        duration: currentTime
      })
      return
    }
    
    const ratio = currentTime / baselineTime
    const changePercent = Math.round((ratio - 1) * 100)
    
    if (ratio > PERFORMANCE_THRESHOLD) {
      alerts.push({
        test: testName,
        baseline: baselineTime,
        current: currentTime,
        increase: changePercent,
        severity: ratio > 1.5 ? 'critical' : 'warning'
      })
    } else if (ratio < 0.8) {
      improvements.push({
        test: testName,
        baseline: baselineTime,
        current: currentTime,
        improvement: Math.abs(changePercent)
      })
    }
  })
  
  return { alerts, improvements, newTests }
}

function updateBaseline(current, baseline) {
  const updated = { ...baseline }
  
  Object.entries(current).forEach(([testName, currentTime]) => {
    const baselineTime = baseline[testName]
    
    if (!baselineTime) {
      // New test - add to baseline
      updated[testName] = currentTime
    } else {
      // Use median of last 5 runs (simplified: just update if improvement or small regression)
      const ratio = currentTime / baselineTime
      if (ratio < 1.1) { // Update baseline if within 10% or better
        updated[testName] = Math.round((baselineTime + currentTime) / 2) // Running average
      }
    }
  })
  
  return updated
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function main() {
  const resultsPath = process.argv[2]
  
  if (!resultsPath) {
    console.error('❌ Usage: node check-smoke-baseline.js <results-file>')
    process.exit(1)
  }
  
  if (!fs.existsSync(resultsPath)) {
    console.error(`❌ Results file not found: ${resultsPath}`)
    process.exit(1)
  }
  
  console.log('🔍 Checking smoke test performance baseline...')
  
  const baseline = loadBaseline()
  const current = parseTestResults(resultsPath)
  
  if (Object.keys(current).length === 0) {
    console.warn('⚠️  No test timing data found in results')
    process.exit(0)
  }
  
  console.log(`📊 Found timing data for ${Object.keys(current).length} tests`)
  
  if (Object.keys(baseline).length === 0) {
    console.log('📝 No baseline found, creating initial baseline...')
    saveBaseline(current)
    
    console.log('\n📋 Initial baseline:')
    Object.entries(current).forEach(([test, duration]) => {
      console.log(`  • ${test}: ${formatDuration(duration)}`)
    })
    
    process.exit(0)
  }
  
  const { alerts, improvements, newTests } = checkPerformance(current, baseline)
  
  // Report results
  if (newTests.length > 0) {
    console.log('\n🆕 New tests:')
    newTests.forEach(({ test, duration }) => {
      console.log(`  • ${test}: ${formatDuration(duration)}`)
    })
  }
  
  if (improvements.length > 0) {
    console.log('\n🚀 Performance improvements:')
    improvements.forEach(({ test, baseline, current, improvement }) => {
      console.log(`  • ${test}: ${formatDuration(baseline)} → ${formatDuration(current)} (${improvement}% faster)`)
    })
  }
  
  if (alerts.length > 0) {
    console.log('\n⚠️  Performance regressions detected:')
    console.table(alerts.map(alert => ({
      Test: alert.test,
      Baseline: formatDuration(alert.baseline),
      Current: formatDuration(alert.current),
      'Increase %': `+${alert.increase}%`,
      Severity: alert.severity
    })))
    
    const criticalAlerts = alerts.filter(a => a.severity === 'critical')
    if (criticalAlerts.length > 0) {
      console.error(`\n❌ ${criticalAlerts.length} critical performance regression(s) detected!`)
      console.error('Tests taking >150% of baseline time need immediate attention.')
      process.exit(1)
    } else {
      console.warn(`\n⚠️  ${alerts.length} performance warning(s) detected.`)
      console.warn('Tests taking >120% of baseline time should be investigated.')
    }
  } else {
    console.log('\n✅ All tests within performance baseline!')
  }
  
  // Update baseline with new tests and improvements
  const updatedBaseline = updateBaseline(current, baseline)
  if (JSON.stringify(updatedBaseline) !== JSON.stringify(baseline)) {
    console.log('\n📝 Updating baseline with new tests and improvements...')
    saveBaseline(updatedBaseline)
  }
  
  // Exit with error code if there are performance alerts
  if (alerts.length > 0) {
    process.exit(1)
  }
}

if (require.main === module) {
  main()
}

module.exports = {
  checkPerformance,
  parseTestResults,
  loadBaseline,
  saveBaseline,
  PERFORMANCE_THRESHOLD
}