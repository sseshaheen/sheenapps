#!/usr/bin/env node

/**
 * 🛡️ Client Bundle Security Checker
 * 
 * Phase 1.3: CI Security Guards
 * Expert-recommended build-time security validation
 * 
 * This script checks for:
 * 1. Accidental Supabase imports in client code
 * 2. Service role key exposure in client bundle
 * 3. Dangerous patterns that could leak credentials
 * 4. Environment variable misconfigurations
 * 
 * Reference: SERVER_ONLY_SUPABASE_ARCHITECTURE_PLAN.md Phase 1.3
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

console.log('🛡️ CLIENT BUNDLE SECURITY CHECKER\n');

// Dangerous patterns that should NEVER appear in client code
const DANGEROUS_PATTERNS = [
  {
    pattern: /supabase-js/gi,
    description: 'Supabase client library import',
    severity: 'critical'
  },
  {
    pattern: /SUPABASE_SERVICE_ROLE_KEY/gi,
    description: 'Service role key exposure',
    severity: 'critical'
  },
  {
    pattern: /createClient.*service_role/gi,
    description: 'Service role client creation',
    severity: 'critical'
  },
  {
    pattern: /supabase.*\.from\s*\(\s*['"`]\w+['"`]\s*\)/gi,
    description: 'Direct Supabase table access',
    severity: 'high'
  },
  {
    pattern: /\.from\s*\(\s*['"`]\w+['"`]\s*\)\s*\.select/gi,
    description: 'Supabase query chain',
    severity: 'high'
  },
  {
    pattern: /\.from\s*\(\s*['"`]\w+['"`]\s*\)\s*\.insert/gi,
    description: 'Supabase insert chain',
    severity: 'high'
  },
  {
    pattern: /\.from\s*\(\s*['"`]\w+['"`]\s*\)\s*\.update/gi,
    description: 'Supabase update chain',
    severity: 'high'  
  },
  {
    pattern: /\.from\s*\(\s*['"`]\w+['"`]\s*\)\s*\.delete/gi,
    description: 'Supabase delete chain',
    severity: 'high'
  },
  {
    pattern: /\.channel\s*\(/gi,
    description: 'Supabase realtime channel',
    severity: 'medium'
  },
  {
    pattern: /\.subscribe\s*\(/gi,
    description: 'Supabase realtime subscription',
    severity: 'medium'
  }
];

// Client code directories to check
const CLIENT_DIRS = [
  'src/components/**/*.tsx',
  'src/components/**/*.ts', 
  'src/hooks/**/*.ts',
  'src/hooks/**/*.tsx',
  'src/pages/**/*.tsx',
  'src/pages/**/*.ts'
];

// Files to ignore (known safe files)
const IGNORE_PATTERNS = [
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/*.stories.tsx',
  '**/node_modules/**',
  '**/.next/**',
  '**/dist/**',
  '**/build/**'
];

// Check environment variables for client exposure
function checkEnvironmentSecurity() {
  console.log('🔍 Checking environment variable security...\n');
  
  const envFiles = ['.env.local', '.env', '.env.production'];
  const violations = [];
  
  envFiles.forEach(envFile => {
    if (fs.existsSync(envFile)) {
      const content = fs.readFileSync(envFile, 'utf8');
      const lines = content.split('\n');
      
      lines.forEach((line, index) => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          // Check for dangerous NEXT_PUBLIC_ variables
          if (trimmed.startsWith('NEXT_PUBLIC_SUPABASE_ANON_KEY') || 
              trimmed.startsWith('NEXT_PUBLIC_SUPABASE_SERVICE')) {
            violations.push({
              file: envFile,
              line: index + 1,
              content: trimmed.split('=')[0] + '=***',
              severity: 'critical',
              description: 'Supabase credentials exposed to client bundle'
            });
          }
        }
      });
    }
  });
  
  if (violations.length > 0) {
    console.log('❌ ENVIRONMENT SECURITY VIOLATIONS:');
    violations.forEach(v => {
      console.log(`  ${v.file}:${v.line} - ${v.description}`);
      console.log(`    ${v.content}`);
    });
    console.log('');
  } else {
    console.log('✅ Environment variables are secure\n');
  }
  
  return violations;
}

// Check client code files for dangerous patterns
function checkClientCodeSecurity() {
  console.log('🔍 Checking client code for dangerous patterns...\n');
  
  const violations = [];
  
  // Get all client files
  const allFiles = [];
  CLIENT_DIRS.forEach(pattern => {
    const files = glob.sync(pattern, { ignore: IGNORE_PATTERNS });
    allFiles.push(...files);
  });
  
  console.log(`📁 Scanning ${allFiles.length} client files...`);
  
  allFiles.forEach(filePath => {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      
      DANGEROUS_PATTERNS.forEach(({ pattern, description, severity }) => {
        const matches = content.match(pattern);
        if (matches) {
          // Get line numbers for each match
          const lines = content.split('\n');
          lines.forEach((line, index) => {
            if (pattern.test(line)) {
              violations.push({
                file: filePath,
                line: index + 1,
                content: line.trim(),
                pattern: pattern.toString(),
                description,
                severity
              });
            }
          });
        }
      });
      
    } catch (error) {
      console.log(`⚠️  Could not read file: ${filePath}`);
    }
  });
  
  return violations;
}

// Group violations by severity
function groupViolationsBySeverity(violations) {
  const grouped = {
    critical: violations.filter(v => v.severity === 'critical'),
    high: violations.filter(v => v.severity === 'high'),
    medium: violations.filter(v => v.severity === 'medium')
  };
  
  return grouped;
}

// Display violations
function displayViolations(grouped) {
  let hasViolations = false;
  
  if (grouped.critical.length > 0) {
    hasViolations = true;
    console.log('🚨 CRITICAL SECURITY VIOLATIONS:');
    grouped.critical.forEach(v => {
      console.log(`  ${v.file}:${v.line} - ${v.description}`);
      console.log(`    ${v.content}`);
    });
    console.log('');
  }
  
  if (grouped.high.length > 0) {
    hasViolations = true;
    console.log('⚠️  HIGH SEVERITY VIOLATIONS:');
    grouped.high.forEach(v => {
      console.log(`  ${v.file}:${v.line} - ${v.description}`);
      console.log(`    ${v.content}`);
    });
    console.log('');
  }
  
  if (grouped.medium.length > 0) {
    hasViolations = true;
    console.log('ℹ️  MEDIUM SEVERITY VIOLATIONS:');
    grouped.medium.forEach(v => {
      console.log(`  ${v.file}:${v.line} - ${v.description}`);
      console.log(`    ${v.content}`);
    });
    console.log('');
  }
  
  return hasViolations;
}

// Main execution
async function main() {
  try {
    // Check environment security
    const envViolations = checkEnvironmentSecurity();
    
    // Check client code security
    const codeViolations = checkClientCodeSecurity();
    
    // Combine all violations
    const allViolations = [...envViolations, ...codeViolations];
    const grouped = groupViolationsBySeverity(allViolations);
    
    // Display results
    console.log('📊 SECURITY SCAN RESULTS:\n');
    const hasViolations = displayViolations(grouped);
    
    // Summary
    console.log('🎯 SUMMARY:');
    console.log(`  Critical violations: ${grouped.critical.length}`);
    console.log(`  High severity: ${grouped.high.length}`);
    console.log(`  Medium severity: ${grouped.medium.length}`);
    console.log(`  Total violations: ${allViolations.length}\n`);
    
    if (hasViolations) {
      if (grouped.critical.length > 0 || grouped.high.length > 0) {
        console.log('❌ SECURITY SCAN FAILED');
        console.log('Critical and high severity violations must be fixed before deployment.\n');
        
        console.log('🔧 REMEDIATION STEPS:');
        console.log('1. Move Supabase operations to server actions (/src/lib/actions/)');
        console.log('2. Use API routes for database queries (/src/app/api/)');
        console.log('3. Remove client-side Supabase imports');
        console.log('4. Use server-only repositories for database access');
        console.log('5. Check SERVER_ONLY_SUPABASE_ARCHITECTURE_PLAN.md for guidance');
        
        process.exit(1);
      } else {
        console.log('⚠️  SECURITY SCAN PASSED (with warnings)');
        console.log('Medium severity violations should be addressed when possible.\n');
      }
    } else {
      console.log('✅ SECURITY SCAN PASSED');
      console.log('No client-side database access violations found.\n');
      
      console.log('🎉 CLIENT BUNDLE IS SECURE:');
      console.log('✅ No Supabase client imports');
      console.log('✅ No service role key exposure');
      console.log('✅ No direct database queries');
      console.log('✅ Environment variables properly configured');
    }
    
  } catch (error) {
    console.error('❌ Security scan failed:', error.message);
    process.exit(1);
  }
}

// Install glob if not present
try {
  require('glob');
} catch (e) {
  console.log('Installing required dependency: glob');
  require('child_process').execSync('npm install glob --save-dev', { stdio: 'inherit' });
}

// Run the security check
main();