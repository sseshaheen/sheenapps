#!/usr/bin/env node

/**
 * Test script for Cloudflare authentication issue
 * 
 * This script tests:
 * 1. Current API token permissions
 * 2. Wrangler authentication status
 * 3. Cloudflare Pages API access
 * 4. Token validation and permissions check
 */

const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Colors for output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(`🔍 ${title}`, 'cyan');
  console.log('='.repeat(60));
}

async function runCommand(command, description) {
  try {
    log(`\n📌 ${description}`, 'blue');
    log(`Command: ${command}`, 'yellow');
    
    const { stdout, stderr } = await execAsync(command, {
      env: process.env,
      cwd: path.join(__dirname, '..')
    });
    
    if (stdout) {
      console.log(stdout);
    }
    if (stderr) {
      log('STDERR:', 'yellow');
      console.log(stderr);
    }
    
    return { success: true, stdout, stderr };
  } catch (error) {
    log(`❌ Command failed: ${error.message}`, 'red');
    if (error.stdout) {
      console.log(error.stdout);
    }
    if (error.stderr) {
      console.log(error.stderr);
    }
    return { success: false, error };
  }
}

async function testCloudflareAuth() {
  log('\n🚀 Cloudflare Authentication Test Script', 'magenta');
  log('Testing Cloudflare API token and permissions...', 'magenta');
  
  // 1. Check environment variables
  logSection('Environment Variables');
  const hasToken = !!process.env.CF_API_TOKEN_WORKERS;
  const hasAccountId = !!process.env.CF_ACCOUNT_ID;
  
  log(`CF_API_TOKEN_WORKERS: ${hasToken ? '✅ Set' : '❌ Not set'}`, hasToken ? 'green' : 'red');
  log(`CF_ACCOUNT_ID: ${hasAccountId ? '✅ Set' : '❌ Not set'}`, hasAccountId ? 'green' : 'red');
  
  if (hasToken) {
    const tokenPreview = process.env.CF_API_TOKEN_WORKERS.substring(0, 8) + '...';
    log(`Token preview: ${tokenPreview}`, 'yellow');
  }
  
  if (!hasToken) {
    log('\n❌ CF_API_TOKEN_WORKERS is not set. Please set it in your .env file.', 'red');
    process.exit(1);
  }
  
  // 2. Test Wrangler authentication
  logSection('Wrangler Authentication Status');
  await runCommand('wrangler whoami', 'Checking current Wrangler authentication');
  
  // 3. Test Cloudflare API directly
  logSection('Direct API Test');
  const accountId = process.env.CF_ACCOUNT_ID || '9a81e730a78395926ac4a371c6028a4d';
  
  // Test API token validity
  await runCommand(
    `curl -X GET "https://api.cloudflare.com/client/v4/user/tokens/verify" \
     -H "Authorization: Bearer ${process.env.CF_API_TOKEN_WORKERS}" \
     -H "Content-Type: application/json" | jq '.'`,
    'Verifying API token validity'
  );
  
  // Test account access
  await runCommand(
    `curl -X GET "https://api.cloudflare.com/client/v4/accounts/${accountId}" \
     -H "Authorization: Bearer ${process.env.CF_API_TOKEN_WORKERS}" \
     -H "Content-Type: application/json" | jq '.'`,
    'Testing account access'
  );
  
  // Test Pages project list
  await runCommand(
    `curl -X GET "https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects" \
     -H "Authorization: Bearer ${process.env.CF_API_TOKEN_WORKERS}" \
     -H "Content-Type: application/json" | jq '.'`,
    'Listing Cloudflare Pages projects'
  );
  
  // Test specific project access
  await runCommand(
    `curl -X GET "https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/sheenapps-preview" \
     -H "Authorization: Bearer ${process.env.CF_API_TOKEN_WORKERS}" \
     -H "Content-Type: application/json" | jq '.'`,
    'Accessing sheenapps-preview project'
  );
  
  // 4. Test Wrangler Pages commands
  logSection('Wrangler Pages Commands');
  
  // List Pages projects
  await runCommand('wrangler pages project list', 'Listing Pages projects via Wrangler');
  
  // 5. Test a minimal deployment
  logSection('Test Deployment');
  
  // Create a test directory
  const testDir = path.join(__dirname, '..', 'temp', 'cloudflare-test');
  await runCommand(`mkdir -p ${testDir}`, 'Creating test directory');
  
  // Create a test HTML file
  const testHtml = `<!DOCTYPE html>
<html>
<head>
    <title>Cloudflare Auth Test</title>
</head>
<body>
    <h1>Cloudflare Authentication Test</h1>
    <p>Generated at: ${new Date().toISOString()}</p>
</body>
</html>`;
  
  await runCommand(
    `echo '${testHtml}' > ${testDir}/index.html`,
    'Creating test HTML file'
  );
  
  // Try to deploy
  log('\n🚀 Attempting test deployment...', 'yellow');
  const deployResult = await runCommand(
    `wrangler pages deploy ${testDir} --project-name=sheenapps-preview --branch=auth-test --commit-message="Auth test ${Date.now()}"`,
    'Deploying test site'
  );
  
  // 6. Summary
  logSection('Test Summary');
  
  if (deployResult.success) {
    log('✅ Deployment successful! Your Cloudflare authentication is working correctly.', 'green');
    
    // Extract deployment URL if available
    const urlMatch = deployResult.stdout.match(/https:\/\/[^\s]+\.pages\.dev/);
    if (urlMatch) {
      log(`\n🌐 Deployment URL: ${urlMatch[0]}`, 'green');
    }
  } else {
    log('❌ Deployment failed. Authentication or permissions issue detected.', 'red');
    log('\n📋 Recommended Actions:', 'yellow');
    log('1. Visit https://dash.cloudflare.com/profile/api-tokens', 'yellow');
    log('2. Create or edit your API token', 'yellow');
    log('3. Ensure it has these permissions:', 'yellow');
    log('   - Account: Cloudflare Pages:Edit', 'cyan');
    log('   - Zone: Page Rules:Edit (if using custom domains)', 'cyan');
    log('4. Update CLOUDFLARE_API_TOKEN in your .env file', 'yellow');
  }
  
  // Cleanup
  await runCommand(`rm -rf ${testDir}`, 'Cleaning up test directory');
  
  log('\n✅ Test completed', 'green');
}

// Run the test
testCloudflareAuth().catch(error => {
  log(`\n❌ Unexpected error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});