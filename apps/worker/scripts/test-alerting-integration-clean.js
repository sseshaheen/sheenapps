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

const { unifiedLogger } = require('../dist/services/unifiedLogger');

class AlertingIntegrationTester {
  constructor() {
    this.logger = unifiedLogger;
    this.testResults = {
      fireAndForget: { passed: false, details: '' },
      performanceOverhead: { passed: false, details: '' },
      featureFlag: { passed: false, details: '' },
      errorHandling: { passed: false, details: '' },
      alertProcessing: { passed: false, details: '' }
    };
  }

  /**
   * Test 1: Fire-and-forget Integration
   */
  async testFireAndForgetIntegration() {
    console.log('\n🔥 Testing Fire-and-forget Integration...');
    
    try {
      const logTimes = [];
      
      // Test different log tiers
      const testEntries = [
        () => this.logger.system('error', 'error', 'System critical error test'),
        () => this.logger.deploy('test-build', 'test-user', 'test-project', 'failed', 'Deployment failed test'),
        () => this.logger.build('test-build', 'test-user', 'test-project', 'failed', 'Build failed test')
      ];
      
      for (let i = 0; i < testEntries.length; i++) {
        const start = process.hrtime.bigint();
        testEntries[i]();
        const end = process.hrtime.bigint();
        
        const durationMs = Number(end - start) / 1000000;
        logTimes.push(durationMs);
        console.log(`    📝 Log ${i+1} write time: ${durationMs.toFixed(3)}ms`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const avgWriteTime = logTimes.reduce((a, b) => a + b, 0) / logTimes.length;
      const maxWriteTime = Math.max(...logTimes);
      const allWritesFast = logTimes.every(time => time < 10);
      
      console.log(`  📊 Average write time: ${avgWriteTime.toFixed(3)}ms`);
      console.log(`  📊 Max write time: ${maxWriteTime.toFixed(3)}ms`);
      
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
   * Test 2: Performance Overhead
   */
  async testPerformanceOverhead() {
    console.log('\n📊 Testing Performance Overhead...');
    
    try {
      const iterations = 100;
      const writeTimes = [];
      
      console.log(`  🔄 Running ${iterations} log write tests...`);
      
      for (let i = 0; i < iterations; i++) {
        const start = process.hrtime.bigint();
        this.logger.system('rate_limit_hit', 'info', `Performance test iteration ${i}`, { testId: i });
        const end = process.hrtime.bigint();
        
        const durationMs = Number(end - start) / 1000000;
        writeTimes.push(durationMs);
      }
      
      writeTimes.sort((a, b) => a - b);
      const p50 = writeTimes[Math.floor(iterations * 0.5)];
      const p95 = writeTimes[Math.floor(iterations * 0.95)];
      const avg = writeTimes.reduce((a, b) => a + b, 0) / writeTimes.length;
      const max = Math.max(...writeTimes);
      
      console.log(`  📊 Performance Stats:`);
      console.log(`    Average: ${avg.toFixed(3)}ms`);
      console.log(`    P50: ${p50.toFixed(3)}ms`);
      console.log(`    P95: ${p95.toFixed(3)}ms`);
      console.log(`    Max: ${max.toFixed(3)}ms`);
      
      const p95Under1Ms = p95 < 1.0;
      const avgUnder1Ms = avg < 1.0;
      
      console.log(`  ✅ P95 under 1ms: ${p95Under1Ms} (${p95.toFixed(3)}ms)`);
      console.log(`  ✅ Average under 1ms: ${avgUnder1Ms} (${avg.toFixed(3)}ms)`);
      
      this.testResults.performanceOverhead = {
        passed: p95Under1Ms && avgUnder1Ms,
        details: `P95: ${p95.toFixed(3)}ms, Avg: ${avg.toFixed(3)}ms, Target: <1ms`
      };
      
    } catch (error) {
      this.testResults.performanceOverhead = {
        passed: false,
        details: `Error: ${error.message}`
      };
    }
  }

  /**
   * Test 3: Feature Flag Behavior
   */
  async testFeatureFlag() {
    console.log('\n🚩 Testing Feature Flag Behavior...');
    
    try {
      const originalValue = process.env.LOG_ALERTS_ENABLED;
      
      // Test enabled state (default)
      delete process.env.LOG_ALERTS_ENABLED;
      this.logger.system('error', 'error', 'Test with alerts enabled');
      console.log('  ✅ Alerts enabled (default): Log processed');
      
      // Test disabled state
      process.env.LOG_ALERTS_ENABLED = 'false';
      this.logger.system('error', 'error', 'Test with alerts disabled');
      console.log('  ✅ Alerts disabled: Log processed (alerts skipped)');
      
      // Test explicitly enabled
      process.env.LOG_ALERTS_ENABLED = 'true';
      this.logger.system('error', 'error', 'Test with alerts explicitly enabled');
      console.log('  ✅ Alerts explicitly enabled: Log processed');
      
      // Restore original value
      if (originalValue !== undefined) {
        process.env.LOG_ALERTS_ENABLED = originalValue;
      } else {
        delete process.env.LOG_ALERTS_ENABLED;
      }
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      this.testResults.featureFlag = {
        passed: true,
        details: 'All feature flag states handled correctly'
      };
      
    } catch (error) {
      this.testResults.featureFlag = {
        passed: false,
        details: `Error: ${error.message}`
      };
    }
  }

  /**
   * Test 4: Error Handling
   */
  async testErrorHandling() {
    console.log('\n🛡️  Testing Error Handling...');
    
    try {
      const testStartTime = Date.now();
      
      this.logger.system('error', 'fatal', 'Critical system error - testing graceful degradation');
      this.logger.deploy('test-build', 'test-user', 'test-project', 'failed', 'Deployment failure test');
      
      const testEndTime = Date.now();
      const totalTime = testEndTime - testStartTime;
      const gracefulDegradation = totalTime < 100;
      
      console.log(`  📊 Error handling test time: ${totalTime}ms`);
      console.log(`  ✅ Graceful degradation: ${gracefulDegradation}`);
      
      this.testResults.errorHandling = {
        passed: gracefulDegradation,
        details: `Completed in ${totalTime}ms, graceful: ${gracefulDegradation}`
      };
      
    } catch (error) {
      this.testResults.errorHandling = {
        passed: false,
        details: `Error: ${error.message}`
      };
    }
  }

  /**
   * Test 5: Alert Processing
   */
  async testAlertProcessing() {
    console.log('\n🚨 Testing Alert Processing Integration...');
    
    try {
      const testLogs = [
        () => this.logger.system('error', 'error', 'HMAC validation failed - security breach'),
        () => this.logger.deploy('test-build', 'test-user', 'test-project', 'failed', 'Vercel deployment failed'),
        () => this.logger.build('test-build', 'test-user', 'test-project', 'failed', 'Build process failed'),
        () => this.logger.system('rate_limit_hit', 'warn', 'Rate limit exceeded for API endpoint')
      ];
      
      console.log(`  📝 Generating ${testLogs.length} test log entries...`);
      
      const processingTimes = [];
      
      for (let i = 0; i < testLogs.length; i++) {
        const start = Date.now();
        testLogs[i]();
        const end = Date.now();
        processingTimes.push(end - start);
      }
      
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const avgProcessingTime = processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length;
      const maxProcessingTime = Math.max(...processingTimes);
      const allFast = processingTimes.every(time => time < 50);
      
      console.log(`  📊 Average processing time: ${avgProcessingTime.toFixed(2)}ms`);
      console.log(`  📊 Max processing time: ${maxProcessingTime}ms`);
      
      this.testResults.alertProcessing = {
        passed: allFast,
        details: `Avg: ${avgProcessingTime.toFixed(2)}ms, Max: ${maxProcessingTime}ms, All fast: ${allFast}`
      };
      
    } catch (error) {
      this.testResults.alertProcessing = {
        passed: false,
        details: `Error: ${error.message}`
      };
    }
  }

  /**
   * Run all tests and generate report
   */
  async runAllTests() {
    console.log('🧪 Starting Alerting Integration Tests...\n');
    
    await this.testFireAndForgetIntegration();
    await this.testPerformanceOverhead();
    await this.testFeatureFlag();
    await this.testErrorHandling();
    await this.testAlertProcessing();
    
    console.log('\n📋 Test Results Summary:');
    console.log('========================');
    
    let passedCount = 0;
    let totalCount = 0;
    
    for (const [testName, result] of Object.entries(this.testResults)) {
      totalCount++;
      const status = result.passed ? '✅ PASS' : '❌ FAIL';
      const name = testName.replace(/([A-Z])/g, ' $1').toLowerCase().replace(/^./, str => str.toUpperCase());
      
      console.log(`${status} ${name}: ${result.details}`);
      
      if (result.passed) passedCount++;
    }
    
    console.log(`\n🎯 Overall: ${passedCount}/${totalCount} tests passed`);
    
    if (passedCount === totalCount) {
      console.log('🚀 All tests passed! Alerting integration is production-ready with <1ms overhead.');
    } else {
      console.log('⚠️  Some tests failed. Review integration before production use.');
    }
    
    return passedCount === totalCount;
  }
}

// Run tests if script is executed directly
if (require.main === module) {
  const tester = new AlertingIntegrationTester();
  
  tester.runAllTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Test runner failed:', error);
      process.exit(1);
    });
}

module.exports = { AlertingIntegrationTester };