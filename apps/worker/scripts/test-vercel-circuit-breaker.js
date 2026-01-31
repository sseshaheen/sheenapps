#!/usr/bin/env node

/**
 * Circuit Breaker Unit Test (No API calls required)
 * Tests the circuit breaker logic in isolation
 */

// Mock circuit breaker state for testing
class MockCircuitBreaker {
  constructor() {
    this.state = {
      failures: 0,
      lastFailureTime: 0,
      state: 'CLOSED' // CLOSED, OPEN, HALF_OPEN
    };
    this.failureThreshold = 3;
    this.recoveryTimeout = 10000; // 10 seconds
  }

  // Simulate the circuit breaker logic from vercelAPIService
  shouldAllowRequest() {
    if (this.state.state === 'CLOSED') {
      return true;
    }
    
    if (this.state.state === 'OPEN') {
      const now = Date.now();
      if (now - this.state.lastFailureTime > this.recoveryTimeout) {
        this.state.state = 'HALF_OPEN';
        return true;
      }
      return false;
    }
    
    if (this.state.state === 'HALF_OPEN') {
      return true;
    }
    
    return false;
  }

  recordSuccess() {
    this.state.failures = 0;
    this.state.state = 'CLOSED';
  }

  recordFailure() {
    this.state.failures++;
    this.state.lastFailureTime = Date.now();
    
    if (this.state.failures >= this.failureThreshold) {
      this.state.state = 'OPEN';
    }
  }
}

async function testCircuitBreaker() {
  console.log('🛡️  Testing Circuit Breaker Logic (Isolated)...\n');
  
  const cb = new MockCircuitBreaker();
  let testsPassed = 0;
  let totalTests = 0;

  // Test 1: Initial state
  totalTests++;
  console.log('Test 1: Initial state should be CLOSED');
  if (cb.state.state === 'CLOSED' && cb.state.failures === 0) {
    console.log('✅ PASS: Initial state is CLOSED with 0 failures');
    testsPassed++;
  } else {
    console.log(`❌ FAIL: Expected CLOSED/0, got ${cb.state.state}/${cb.state.failures}`);
  }

  // Test 2: Allow requests when CLOSED
  totalTests++;
  console.log('\nTest 2: Should allow requests when CLOSED');
  if (cb.shouldAllowRequest() === true) {
    console.log('✅ PASS: Allows requests when CLOSED');
    testsPassed++;
  } else {
    console.log('❌ FAIL: Should allow requests when CLOSED');
  }

  // Test 3: Record failures and transition to OPEN
  totalTests++;
  console.log('\nTest 3: Should transition to OPEN after threshold failures');
  cb.recordFailure(); // 1st failure
  cb.recordFailure(); // 2nd failure
  cb.recordFailure(); // 3rd failure - should open circuit
  
  if (cb.state.state === 'OPEN' && cb.state.failures === 3) {
    console.log('✅ PASS: Transitioned to OPEN after 3 failures');
    testsPassed++;
  } else {
    console.log(`❌ FAIL: Expected OPEN/3, got ${cb.state.state}/${cb.state.failures}`);
  }

  // Test 4: Block requests when OPEN
  totalTests++;
  console.log('\nTest 4: Should block requests when OPEN');
  if (cb.shouldAllowRequest() === false) {
    console.log('✅ PASS: Blocks requests when OPEN');
    testsPassed++;
  } else {
    console.log('❌ FAIL: Should block requests when OPEN');
  }

  // Test 5: Transition to HALF_OPEN after recovery timeout
  totalTests++;
  console.log('\nTest 5: Should transition to HALF_OPEN after recovery timeout');
  
  // Simulate time passing
  cb.state.lastFailureTime = Date.now() - 11000; // 11 seconds ago
  const allowsAfterTimeout = cb.shouldAllowRequest();
  
  if (allowsAfterTimeout && cb.state.state === 'HALF_OPEN') {
    console.log('✅ PASS: Transitioned to HALF_OPEN after timeout');
    testsPassed++;
  } else {
    console.log(`❌ FAIL: Expected HALF_OPEN/true, got ${cb.state.state}/${allowsAfterTimeout}`);
  }

  // Test 6: Success resets circuit to CLOSED
  totalTests++;
  console.log('\nTest 6: Success should reset circuit to CLOSED');
  cb.recordSuccess();
  
  if (cb.state.state === 'CLOSED' && cb.state.failures === 0) {
    console.log('✅ PASS: Success resets to CLOSED with 0 failures');
    testsPassed++;
  } else {
    console.log(`❌ FAIL: Expected CLOSED/0, got ${cb.state.state}/${cb.state.failures}`);
  }

  // Summary
  console.log(`\n📊 Circuit Breaker Tests: ${testsPassed}/${totalTests} passed`);
  
  if (testsPassed === totalTests) {
    console.log('🎉 All circuit breaker tests passed!');
    return true;
  } else {
    console.log('⚠️  Some circuit breaker tests failed');
    return false;
  }
}

// Run test
testCircuitBreaker()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('❌ Circuit breaker test failed:', error);
    process.exit(1);
  });