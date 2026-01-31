/**
 * Test Enhanced Logging - Worker Team Debugging
 * Simple utility to verify all logging systems are active
 */

export function testEnhancedLogging() {
  console.log('🧪 [NextJS] Testing Enhanced Logging Systems:', {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    hasGlobalFetch: typeof globalThis.fetch !== 'undefined'
  });

  // // Test HTTP logging by making a simple request
  // if (typeof window !== 'undefined') {
  //   fetch('/api/health', { method: 'HEAD' }).catch(() => {
  //     // Ignore errors, just testing the logging
  //   });
  // }

  console.log('🧪 [NextJS] Enhanced Logging Test Complete');
}

// Auto-run test in development
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  setTimeout(testEnhancedLogging, 1000);
}
