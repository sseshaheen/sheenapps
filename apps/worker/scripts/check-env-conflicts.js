#!/usr/bin/env node
// Script to detect conflicts between existing .env and plan recommendations

const fs = require('fs');
const path = require('path');

// Expected values from the plan (update these based on your standards)
const EXPECTED_DEFAULTS = {
  NODE_ENV: ['development', 'staging', 'production'],
  ARCH_MODE: ['stream', 'monolith', 'modular', 'direct'],
  PORT: ['3000', '8080', '80', '443'],
  LOG_LEVEL: ['debug', 'info', 'warn', 'error'],
  SKIP_QUEUE: ['true', 'false'],
  DIRECT_MODE: ['true', 'false']
};

// Critical variables that should be reviewed if different
const CRITICAL_VARS = [
  'ARCH_MODE',
  'DATABASE_URL',
  'SHARED_SECRET',
  'NODE_ENV'
];

function checkConflicts() {
  const envPath = path.join(process.cwd(), '.env');
  const examplePath = path.join(process.cwd(), '.env.example');
  
  if (!fs.existsSync(envPath)) {
    console.log('No .env file found - nothing to check');
    return;
  }
  
  const conflicts = [];
  const warnings = [];
  const deprecatedFound = [];
  
  // Parse .env file
  const envContent = fs.readFileSync(envPath, 'utf8');
  const envVars = {};
  envContent.split('\n').forEach(line => {
    if (line.trim() && !line.startsWith('#')) {
      const [key, ...valueParts] = line.split('=');
      if (key) {
        let value = valueParts.join('=').trim();
        // Remove surrounding quotes if present
        if ((value.startsWith("'") && value.endsWith("'")) || 
            (value.startsWith('"') && value.endsWith('"'))) {
          value = value.slice(1, -1);
        }
        envVars[key.trim()] = value;
      }
    }
  });
  
  // Check for deprecated variables
  if (envVars['CLOUDFLARE_ACCOUNT_ID'] && envVars['CF_ACCOUNT_ID']) {
    deprecatedFound.push({
      old: 'CLOUDFLARE_ACCOUNT_ID',
      new: 'CF_ACCOUNT_ID',
      action: 'Remove CLOUDFLARE_ACCOUNT_ID (using CF_ACCOUNT_ID)'
    });
  }
  
  if (envVars['CLOUDFLARE_API_TOKEN'] && envVars['CF_API_TOKEN_WORKERS']) {
    deprecatedFound.push({
      old: 'CLOUDFLARE_API_TOKEN',
      new: 'CF_API_TOKEN_WORKERS',
      action: 'Remove CLOUDFLARE_API_TOKEN (using CF_API_TOKEN_WORKERS)'
    });
  }
  
  // Check for unexpected values
  Object.entries(envVars).forEach(([key, value]) => {
    if (EXPECTED_DEFAULTS[key]) {
      if (!EXPECTED_DEFAULTS[key].includes(value)) {
        const item = {
          variable: key,
          current: value,
          expected: EXPECTED_DEFAULTS[key].join(' or '),
          critical: CRITICAL_VARS.includes(key)
        };
        
        if (item.critical) {
          conflicts.push(item);
        } else {
          warnings.push(item);
        }
      }
    }
  });
  
  // Report findings
  console.log('=== Environment Configuration Check ===\n');
  
  if (deprecatedFound.length > 0) {
    console.log('📦 DEPRECATED VARIABLES FOUND:');
    deprecatedFound.forEach(({ old, new: newVar, action }) => {
      console.log(`  ${old} → ${newVar}`);
      console.log(`    Action: ${action}\n`);
    });
  }
  
  if (conflicts.length > 0) {
    console.log('🚨 CRITICAL CONFLICTS FOUND:');
    console.log('These differences might affect application behavior:\n');
    conflicts.forEach(({ variable, current, expected }) => {
      console.log(`  ${variable}:`);
      console.log(`    Current:  "${current}"`);
      console.log(`    Expected: ${expected}`);
      console.log(`    Action:   Keep "${current}" if it's working in production\n`);
    });
  }
  
  if (warnings.length > 0) {
    console.log('⚠️  WARNINGS:');
    console.log('These differences are probably intentional:\n');
    warnings.forEach(({ variable, current, expected }) => {
      console.log(`  ${variable}: "${current}" (expected: ${expected})`);
    });
    console.log('');
  }
  
  if (conflicts.length === 0 && warnings.length === 0 && deprecatedFound.length === 0) {
    console.log('✅ No conflicts or deprecated variables detected');
    console.log('✅ Your configuration follows the recommended patterns');
  } else {
    console.log('📝 NEXT STEPS:');
    console.log('1. Review the conflicts above');
    console.log('2. Keep your working production values');
    console.log('3. Document any intentional differences in comments');
    if (deprecatedFound.length > 0) {
      console.log('4. Run "npm run env:migrate" to clean up deprecated variables');
    }
    console.log(`${deprecatedFound.length > 0 ? '5' : '4'}. Test thoroughly before deploying`);
  }
  
  // Summary
  console.log('\n=== Summary ===');
  console.log(`Critical Conflicts: ${conflicts.length}`);
  console.log(`Warnings: ${warnings.length}`);
  console.log(`Deprecated Variables: ${deprecatedFound.length}`);
}

checkConflicts();