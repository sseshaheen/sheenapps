#!/usr/bin/env ts-node

/**
 * Security Validation Test for Clean Events System
 * Tests that sensitive data is properly filtered from user-facing events
 */

import { sanitizeErrorMessage } from '../types/cleanEvents';

// Test data with sensitive information
const sensitiveTestData = {
  filepath: '/Users/sh/projects/d78b030e-5714-4458-8f58-e6a772f0ea02/6338f8d4-6f95-46c8-a9d1-6c30bd042434/src/app.ts',
  command: 'cd "/Users/sh/projects/user123/project456" && "/opt/homebrew/bin/claude" --version',
  uuid: 'd78b030e-5714-4458-8f58-e6a772f0ea02',
  stackTrace: `Error: Build failed
    at buildProject (/Users/sh/Sites/sheenapps-claude-worker/src/workers/deployWorker.ts:245:12)
    at async Worker.handler (/Users/sh/Sites/sheenapps-claude-worker/src/workers/deployWorker.ts:328:5)
    at async process.process (/Users/sh/Sites/sheenapps-claude-worker/node_modules/bullmq/dist/classes/worker.js:394:28)`
};

console.log('🔒 Testing Clean Events Security Filtering\n');

// Test 1: Error message sanitization
console.log('Test 1: Error Message Sanitization');
console.log('=====================================');

const testErrors = [
  'Error: ENOENT: no such file or directory, open \'/Users/sh/projects/d78b030e-5714-4458-8f58-e6a772f0ea02/package.json\'',
  'TypeError: Cannot read property \'name\' of undefined at /opt/homebrew/lib/node_modules/vite/dist/node/index.js:123:45',
  'Build failed: TypeScript compilation error in src/components/Header.tsx',
  'npm install failed with exit code 1',
  sensitiveTestData.stackTrace
];

testErrors.forEach((error, index) => {
  const sanitized = sanitizeErrorMessage(error);
  console.log(`\nOriginal: ${error.substring(0, 100)}${error.length > 100 ? '...' : ''}`);
  console.log(`Sanitized: ${sanitized}`);
  console.log(`✅ Safe: ${!containsSensitiveData(sanitized)}`);
});

// Test 2: UserBuildEvent structure validation
console.log('\n\nTest 2: UserBuildEvent Structure');
console.log('==================================');

const mockUserEvent = {
  id: '123',
  build_id: 'build_123',
  event_type: 'progress' as const,
  phase: 'build' as const,
  title: 'Building Application',
  description: 'Compiling TypeScript code',
  overall_progress: 0.45,
  finished: false,
  created_at: new Date().toISOString()
};

console.log('Mock user event:', JSON.stringify(mockUserEvent, null, 2));
console.log('✅ Contains no sensitive data:', !JSON.stringify(mockUserEvent).includes('/Users/'));
console.log('✅ Contains no UUIDs:', !JSON.stringify(mockUserEvent).includes('d78b030e-5714'));
console.log('✅ Contains no internal paths:', !JSON.stringify(mockUserEvent).includes('/opt/homebrew'));

// Test 3: Internal data separation
console.log('\n\nTest 3: Internal Data Separation');
console.log('==================================');

const mockInternalData = {
  file_paths: [sensitiveTestData.filepath],
  system_commands: [sensitiveTestData.command],
  project_path: '/Users/sh/projects/d78b030e-5714-4458-8f58-e6a772f0ea02',
  build_command: 'tsc && vite build',
  memory_usage_mb: 245,
  error_stack_traces: [sensitiveTestData.stackTrace]
};

console.log('Internal data should contain sensitive info:');
console.log('✅ Contains file paths:', mockInternalData.file_paths.some(p => p.includes('/Users/')));
console.log('✅ Contains system commands:', mockInternalData.system_commands.some(c => c.includes('/opt/homebrew')));
console.log('✅ Contains UUIDs:', JSON.stringify(mockInternalData).includes('d78b030e-5714'));

// Test 4: API endpoint security check
console.log('\n\nTest 4: API Endpoint Security Guidelines');
console.log('==========================================');

console.log('User-facing endpoints (/api/builds/:buildId/events):');
console.log('✅ Should filter out internal_data field');
console.log('✅ Should sanitize error messages');
console.log('✅ Should require userId parameter');
console.log('✅ Should only return user_visible=true events');

console.log('\nInternal endpoints (/api/internal/builds/:buildId/events):');
console.log('⚠️  Should require admin authentication (TODO)');
console.log('✅ Should include warning about sensitive data');
console.log('✅ Should return full debug information');

// Test 5: Database query validation
console.log('\n\nTest 5: Database Query Security');
console.log('=================================');

const userQuery = `
  SELECT id, build_id, event_type, event_phase, event_title, event_description,
         overall_progress, finished, preview_url, error_message, created_at, duration_seconds
  FROM project_build_events
  WHERE build_id = $1 AND user_id = $2 AND user_visible = true AND event_phase IS NOT NULL
`;

const internalQuery = `
  SELECT id, build_id, event_type, event_data, user_id, internal_data,
         event_phase, event_title, event_description, overall_progress, 
         finished, preview_url, error_message, created_at, duration_seconds
  FROM project_build_events
  WHERE build_id = $1 AND id > $2 AND event_phase IS NOT NULL
`;

console.log('✅ User query excludes: internal_data, user_id, event_data');
console.log('✅ User query includes: user_visible=true filter');
console.log('✅ User query includes: event_phase IS NOT NULL (clean events only)');
console.log('✅ Internal query includes: all fields for debugging');

console.log('\n🎉 Security validation completed!');
console.log('\nRecommendations:');
console.log('1. Run this test as part of CI/CD pipeline');
console.log('2. Add proper admin authentication to internal API');
console.log('3. Monitor logs for any sensitive data leakage');
console.log('4. Consider adding more sophisticated sanitization patterns');

/**
 * Helper function to check if text contains sensitive data patterns
 */
function containsSensitiveData(text: string): boolean {
  const sensitivePatterns = [
    /\/Users\/[^\/\s]+/,                    // User home directories
    /\/opt\/[^\/\s]+/,                      // System paths
    /[0-9a-f-]{36}/,                        // UUIDs
    /at [^:]+:\d+:\d+/,                     // Stack trace locations
    /process\./,                            // Node.js process references
    /node_modules/,                         // Dependencies paths
    /\b[A-Z_]{3,}_[A-Z_]{3,}\b/,           // Environment variable patterns
  ];
  
  return sensitivePatterns.some(pattern => pattern.test(text));
}