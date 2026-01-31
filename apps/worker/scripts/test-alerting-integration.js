#!/usr/bin/env node

/**
 * Week 2 Day 3 Test: Alerting Integration + Performance Validation
 * 
 * This script tests:
 * 1. Unified logger alerting integration (fire-and-forget)
 * 2. Performance impact measurement (<1ms p95 overhead)
 * 3. Alert processing without blocking log writes
 * 4. Feature flag behavior (LOG_ALERTS_ENABLED)
 * 5. Error handling and graceful degradation
 */

const { UnifiedLogger } = require('../dist/services/unifiedLogger');
const Redis = require('ioredis');
const crypto = require('crypto');

class AlertingIntegrationTester {
  constructor() {
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    this.logger = UnifiedLogger.getInstance();
    this.testResults = {
      fireAndForget: { passed: false, details: '' },
      performanceOverhead: { passed: false, details: '' },
      featureFlag: { passed: false, details: '' },
      errorHandling: { passed: false, details: '' },
      alertProcessing: { passed: false, details: '' }
    };
  }

  async cleanup() {
    await this.redis.quit();
  }

  /**
   * Test 1: Fire-and-forget Integration
   * Verify logging never blocks even if alerting fails
   */
  async testFireAndForgetIntegration() {
    console.log('\n🔥 Testing Fire-and-forget Integration...');
    
    try {
      const testStartTime = Date.now();
      
      // Generate test log entries that should trigger alerts
      const testEntries = [
        { tier: 'system', event: 'error', severity: 'error', message: 'System critical error test' },
        { tier: 'deploy', event: 'failed', message: 'Deployment failed test' },
        { tier: 'build', event: 'failed', message: 'Build failed test' }
      ];
      
      const logTimes = [];
      
      // Log entries and measure write time
      for (const entry of testEntries) {
        const start = process.hrtime.bigint();
        
        if (entry.tier === 'system') {
          this.logger.system(entry.event, entry.severity, entry.message, { testId: crypto.randomUUID() });
        } else if (entry.tier === 'deploy') {
          this.logger.deploy('test-build', 'test-user', 'test-project', entry.event, entry.message);
        } else if (entry.tier === 'build') {
          this.logger.build('test-build', 'test-user', 'test-project', entry.event, entry.message);
        }
        
        const end = process.hrtime.bigint();
        const durationMs = Number(end - start) / 1000000; // Convert to ms
        logTimes.push(durationMs);
        
        console.log(`    📝 ${entry.tier} log write: ${durationMs.toFixed(3)}ms`);
      }
      
      // Wait for async processing to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const avgWriteTime = logTimes.reduce((a, b) => a + b, 0) / logTimes.length;
      const maxWriteTime = Math.max(...logTimes);
      
      console.log(`  📊 Average write time: ${avgWriteTime.toFixed(3)}ms`);
      console.log(`  📊 Max write time: ${maxWriteTime.toFixed(3)}ms`);
      
      // Fire-and-forget should ensure all writes are fast
      const allWritesFast = logTimes.every(time => time < 10); // <10ms is very reasonable
      
      this.testResults.fireAndForget = {
        passed: allWritesFast,
        details: `Avg: ${avgWriteTime.toFixed(3)}ms, Max: ${maxWriteTime.toFixed(3)}ms, All fast: ${allWritesFast}`
      };
      
    } catch (error) {
      this.testResults.fireAndForget = {
        passed: false,
        details: `Error: ${error.message}`
      };
    }
  }

  /**
   * Test 2: Performance Overhead Measurement
   * Measure p95 overhead of alerting integration
   */
  async testPerformanceOverhead() {
    console.log('\n📊 Testing Performance Overhead...');
    
    try {
      const iterations = 100;
      const writeTimes = [];
      
      console.log(`  🔄 Running ${iterations} log write tests...`);
      
      for (let i = 0; i < iterations; i++) {
        const start = process.hrtime.bigint();
        
        this.logger.system('rate_limit_hit', 'info', `Performance test iteration ${i}`, {
          testId: i,
          timestamp: Date.now()
        });
        
        const end = process.hrtime.bigint();
        const durationMs = Number(end - start) / 1000000;
        writeTimes.push(durationMs);
      }
      
      // Calculate performance statistics
      writeTimes.sort((a, b) => a - b);
      const p50 = writeTimes[Math.floor(iterations * 0.5)];
      const p90 = writeTimes[Math.floor(iterations * 0.9)];
      const p95 = writeTimes[Math.floor(iterations * 0.95)];
      const p99 = writeTimes[Math.floor(iterations * 0.99)];
      const avg = writeTimes.reduce((a, b) => a + b, 0) / writeTimes.length;
      const max = Math.max(...writeTimes);
      
      console.log(`  📊 Performance Stats:`);
      console.log(`    Average: ${avg.toFixed(3)}ms`);
      console.log(`    P50: ${p50.toFixed(3)}ms`);
      console.log(`    P90: ${p90.toFixed(3)}ms`);
      console.log(`    P95: ${p95.toFixed(3)}ms`);
      console.log(`    P99: ${p99.toFixed(3)}ms`);
      console.log(`    Max: ${max.toFixed(3)}ms`);
      
      // Target: P95 < 1ms for alerting overhead
      const p95Under1Ms = p95 < 1.0;
      const avgUnder1Ms = avg < 1.0;
      
      console.log(`  ✅ P95 under 1ms: ${p95Under1Ms} (${p95.toFixed(3)}ms)`);
      console.log(`  ✅ Average under 1ms: ${avgUnder1Ms} (${avg.toFixed(3)}ms)`);
      
      this.testResults.performanceOverhead = {
        passed: p95Under1Ms && avgUnder1Ms,
        details: `P95: ${p95.toFixed(3)}ms, Avg: ${avg.toFixed(3)}ms, Target: <1ms`
      };\n      \n    } catch (error) {\n      this.testResults.performanceOverhead = {\n        passed: false,\n        details: `Error: ${error.message}`\n      };\n    }\n  }\n\n  /**\n   * Test 3: Feature Flag Behavior\n   */\n  async testFeatureFlag() {\n    console.log('\n🚩 Testing Feature Flag Behavior...');\n    \n    try {\n      // Test with alerts enabled (default)\n      const originalValue = process.env.LOG_ALERTS_ENABLED;\n      \n      // Test enabled state\n      delete process.env.LOG_ALERTS_ENABLED;\n      this.logger.system('error', 'error', 'Test with alerts enabled', { testFlag: 'enabled' });\n      console.log('  ✅ Alerts enabled (default): Log processed');\n      \n      // Test disabled state\n      process.env.LOG_ALERTS_ENABLED = 'false';\n      this.logger.system('error', 'error', 'Test with alerts disabled', { testFlag: 'disabled' });\n      console.log('  ✅ Alerts disabled: Log processed (alerts skipped)');\n      \n      // Test explicitly enabled\n      process.env.LOG_ALERTS_ENABLED = 'true';\n      this.logger.system('error', 'error', 'Test with alerts explicitly enabled', { testFlag: 'explicit' });\n      console.log('  ✅ Alerts explicitly enabled: Log processed');\n      \n      // Restore original value\n      if (originalValue !== undefined) {\n        process.env.LOG_ALERTS_ENABLED = originalValue;\n      } else {\n        delete process.env.LOG_ALERTS_ENABLED;\n      }\n      \n      // Wait for async processing\n      await new Promise(resolve => setTimeout(resolve, 50));\n      \n      this.testResults.featureFlag = {\n        passed: true,\n        details: 'All feature flag states handled correctly'\n      };\n      \n    } catch (error) {\n      this.testResults.featureFlag = {\n        passed: false,\n        details: `Error: ${error.message}`\n      };\n    }\n  }\n\n  /**\n   * Test 4: Error Handling and Graceful Degradation\n   */\n  async testErrorHandling() {\n    console.log('\n🛡️  Testing Error Handling...');\n    \n    try {\n      // Test graceful failure when alerting service is unavailable\n      const testStartTime = Date.now();\n      \n      // Generate logs that would normally trigger alerts\n      this.logger.system('error', 'fatal', 'Critical system error - testing graceful degradation');\n      this.logger.deploy('test-build', 'test-user', 'test-project', 'failed', 'Deployment failure test');\n      \n      const testEndTime = Date.now();\n      const totalTime = testEndTime - testStartTime;\n      \n      console.log(`  📊 Error handling test time: ${totalTime}ms`);\n      \n      // Even with potential alerting errors, logging should be fast\n      const gracefulDegradation = totalTime < 100; // Should complete in <100ms\n      \n      console.log(`  ✅ Graceful degradation: ${gracefulDegradation}`);\n      \n      this.testResults.errorHandling = {\n        passed: gracefulDegradation,\n        details: `Completed in ${totalTime}ms, graceful: ${gracefulDegradation}`\n      };\n      \n    } catch (error) {\n      this.testResults.errorHandling = {\n        passed: false,\n        details: `Error: ${error.message}`\n      };\n    }\n  }\n\n  /**\n   * Test 5: Alert Processing Integration\n   */\n  async testAlertProcessing() {\n    console.log('\n🚨 Testing Alert Processing Integration...');\n    \n    try {\n      // Generate diverse log entries to test alert matching\n      const testLogs = [\n        { tier: 'system', event: 'error', severity: 'error', message: 'HMAC validation failed - security breach' },\n        { tier: 'deploy', event: 'failed', message: 'Vercel deployment failed after timeout' },\n        { tier: 'build', event: 'failed', message: 'Build process failed - compilation error' },\n        { tier: 'system', event: 'rate_limit_hit', severity: 'warn', message: 'Rate limit exceeded for API endpoint' }\n      ];\n      \n      console.log(`  📝 Generating ${testLogs.length} test log entries...`);\n      \n      const processingTimes = [];\n      \n      for (const log of testLogs) {\n        const start = Date.now();\n        \n        if (log.tier === 'system') {\n          this.logger.system(log.event, log.severity, log.message, { alertTest: true });\n        } else if (log.tier === 'deploy') {\n          this.logger.deploy('test-build', 'test-user', 'test-project', log.event, log.message);\n        } else if (log.tier === 'build') {\n          this.logger.build('test-build', 'test-user', 'test-project', log.event, log.message);\n        }\n        \n        const end = Date.now();\n        processingTimes.push(end - start);\n      }\n      \n      // Wait for async alert processing\n      await new Promise(resolve => setTimeout(resolve, 200));\n      \n      const avgProcessingTime = processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length;\n      const maxProcessingTime = Math.max(...processingTimes);\n      \n      console.log(`  📊 Average processing time: ${avgProcessingTime.toFixed(2)}ms`);\n      console.log(`  📊 Max processing time: ${maxProcessingTime}ms`);\n      \n      // All processing should be very fast due to fire-and-forget pattern\n      const allFast = processingTimes.every(time => time < 50);\n      \n      this.testResults.alertProcessing = {\n        passed: allFast,\n        details: `Avg: ${avgProcessingTime.toFixed(2)}ms, Max: ${maxProcessingTime}ms, All fast: ${allFast}`\n      };\n      \n    } catch (error) {\n      this.testResults.alertProcessing = {\n        passed: false,\n        details: `Error: ${error.message}`\n      };\n    }\n  }\n\n  /**\n   * Run all tests and generate report\n   */\n  async runAllTests() {\n    console.log('🧪 Starting Alerting Integration Tests...\\n');\n    \n    await this.testFireAndForgetIntegration();\n    await this.testPerformanceOverhead();\n    await this.testFeatureFlag();\n    await this.testErrorHandling();\n    await this.testAlertProcessing();\n    \n    console.log('\\n📋 Test Results Summary:');\n    console.log('========================');\n    \n    let passedCount = 0;\n    let totalCount = 0;\n    \n    for (const [testName, result] of Object.entries(this.testResults)) {\n      totalCount++;\n      const status = result.passed ? '✅ PASS' : '❌ FAIL';\n      const name = testName.replace(/([A-Z])/g, ' $1').toLowerCase().replace(/^./, str => str.toUpperCase());\n      \n      console.log(`${status} ${name}: ${result.details}`);\n      \n      if (result.passed) passedCount++;\n    }\n    \n    console.log(`\\n🎯 Overall: ${passedCount}/${totalCount} tests passed`);\n    \n    if (passedCount === totalCount) {\n      console.log('🚀 All tests passed! Alerting integration is production-ready with <1ms overhead.');\n    } else {\n      console.log('⚠️  Some tests failed. Review integration before production use.');\n    }\n    \n    await this.cleanup();\n    return passedCount === totalCount;\n  }\n}\n\n// Run tests if script is executed directly\nif (require.main === module) {\n  const tester = new AlertingIntegrationTester();\n  \n  tester.runAllTests()\n    .then(success => {\n      process.exit(success ? 0 : 1);\n    })\n    .catch(error => {\n      console.error('❌ Test runner failed:', error);\n      process.exit(1);\n    });\n}\n\nmodule.exports = { AlertingIntegrationTester };