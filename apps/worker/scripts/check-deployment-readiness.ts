import { config } from 'dotenv';
import { spawn } from 'child_process';
import * as fs from 'fs';

// Load environment variables
config();

/**
 * Deployment Readiness Checker for Cloudflare Three-Lane System
 * 
 * Validates that all dependencies and environment variables are properly configured
 * before attempting deployment.
 */

interface ReadinessCheck {
  name: string;
  description: string;
  check: () => Promise<{ passed: boolean; message: string; details?: string }>;
  critical: boolean;
}

async function checkEnvironmentVariables(): Promise<{ passed: boolean; message: string; details?: string }> {
  const required = [
    { key: 'CF_ACCOUNT_ID', description: 'Cloudflare Account ID' },
    { key: 'CLOUDFLARE_API_TOKEN', alt: 'CF_API_TOKEN_WORKERS', description: 'Cloudflare API Token' }
  ];
  
  const missing: string[] = [];
  
  for (const env of required) {
    const value = process.env[env.key] || (env.alt && process.env[env.alt]);
    if (!value) {
      missing.push(env.description);
    }
  }
  
  if (missing.length > 0) {
    return {
      passed: false,
      message: `Missing required environment variables`,
      details: `Missing: ${missing.join(', ')}\n\nPlease set:\n- CF_ACCOUNT_ID=your-cloudflare-account-id\n- CLOUDFLARE_API_TOKEN=your-cloudflare-api-token\n\nOr alternatively use CF_API_TOKEN_WORKERS instead of CLOUDFLARE_API_TOKEN`
    };
  }
  
  return {
    passed: true,
    message: 'All required environment variables are set'
  };
}

async function checkWranglerCLI(): Promise<{ passed: boolean; message: string; details?: string }> {
  const possiblePaths = [
    process.env.WRANGLER_PATH,
    '/opt/homebrew/bin/wrangler',
    '/usr/local/bin/wrangler',
    'wrangler'
  ].filter(Boolean);
  
  for (const wranglerPath of possiblePaths) {
    try {
      const result = await new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
        const proc = spawn(wranglerPath!, ['--version'], { stdio: 'pipe' });
        let stdout = '';
        let stderr = '';
        
        proc.stdout.on('data', (data) => stdout += data.toString());
        proc.stderr.on('data', (data) => stderr += data.toString());
        
        proc.on('exit', (code) => resolve({ code: code || 0, stdout, stderr }));
        proc.on('error', () => resolve({ code: 1, stdout: '', stderr: 'Command not found' }));
      });
      
      if (result.code === 0) {
        return {
          passed: true,
          message: `Wrangler CLI available at ${wranglerPath}: ${result.stdout.trim()}`
        };
      }
    } catch (error) {
      continue;
    }
  }
  
  return {
    passed: false,
    message: 'Wrangler CLI not found',
    details: 'Install Wrangler CLI with: npm install -g wrangler\n\nOr set WRANGLER_PATH environment variable to the correct path'
  };
}

async function checkNodeModules(): Promise<{ passed: boolean; message: string; details?: string }> {
  try {
    // Check if required modules can be imported
    await import('../src/services/cloudflareThreeLaneDeployment');
    await import('../src/services/supabaseDeploymentIntegration');
    
    return {
      passed: true,
      message: 'All required TypeScript modules can be imported'
    };
  } catch (error) {
    return {
      passed: false,
      message: 'Failed to import required modules',
      details: `Error: ${(error as Error).message}\n\nTry running: npm install`
    };
  }
}

async function checkFileSystemPermissions(): Promise<{ passed: boolean; message: string; details?: string }> {
  const testDir = '/tmp/cloudflare-three-lane-test';
  
  try {
    // Test creating directory and files
    await fs.promises.mkdir(testDir, { recursive: true });
    await fs.promises.writeFile(`${testDir}/test.json`, '{"test": true}');
    await fs.promises.readFile(`${testDir}/test.json`, 'utf-8');
    await fs.promises.rm(testDir, { recursive: true, force: true });
    
    return {
      passed: true,
      message: 'File system permissions are adequate'
    };
  } catch (error) {
    return {
      passed: false,
      message: 'File system permission issues detected',
      details: `Error: ${(error as Error).message}\n\nEnsure the application has read/write permissions`
    };
  }
}

async function checkNetworkConnectivity(): Promise<{ passed: boolean; message: string; details?: string }> {
  try {
    // Test DNS resolution and HTTPS connectivity to Cloudflare API
    const https = require('https');
    
    await new Promise<void>((resolve, reject) => {
      const req = https.request('https://api.cloudflare.com', {
        method: 'HEAD',
        timeout: 10000
      }, (res: any) => {
        if (res.statusCode && res.statusCode < 400) {
          resolve();
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
      
      req.on('error', reject);
      req.on('timeout', () => reject(new Error('Request timeout')));
      req.end();
    });
    
    return {
      passed: true,
      message: 'Network connectivity to Cloudflare API confirmed'
    };
  } catch (error) {
    return {
      passed: false,
      message: 'Network connectivity issues detected',
      details: `Error: ${(error as Error).message}\n\nCheck:\n- Internet connection\n- DNS settings\n- Firewall/proxy configuration\n- Access to api.cloudflare.com`
    };
  }
}

async function checkPatternDetectionTools(): Promise<{ passed: boolean; message: string; details?: string }> {
  const tools = ['git', 'rg'];
  const available: string[] = [];
  const missing: string[] = [];
  
  for (const tool of tools) {
    try {
      await new Promise<void>((resolve, reject) => {
        const proc = spawn(tool, ['--version'], { stdio: 'ignore' });
        proc.on('exit', (code) => code === 0 ? resolve() : reject());
        proc.on('error', reject);
      });
      available.push(tool);
    } catch {
      missing.push(tool);
    }
  }
  
  if (available.length === 0) {
    return {
      passed: false,
      message: 'No pattern detection tools available',
      details: 'Install git or ripgrep (rg) for optimal pattern detection performance'
    };
  }
  
  return {
    passed: true,
    message: `Pattern detection tools available: ${available.join(', ')}`,
    details: missing.length > 0 ? `Optional tools not found: ${missing.join(', ')}` : undefined
  };
}

const readinessChecks: ReadinessCheck[] = [
  {
    name: 'Environment Variables',
    description: 'Required Cloudflare environment variables',
    check: checkEnvironmentVariables,
    critical: true
  },
  {
    name: 'Wrangler CLI',
    description: 'Cloudflare Wrangler command-line tool',
    check: checkWranglerCLI,
    critical: true
  },
  {
    name: 'Node Modules',
    description: 'TypeScript modules and dependencies',
    check: checkNodeModules,
    critical: true
  },
  {
    name: 'File System Permissions',
    description: 'Read/write access for manifest files',
    check: checkFileSystemPermissions,
    critical: true
  },
  {
    name: 'Network Connectivity',
    description: 'Access to Cloudflare APIs',
    check: checkNetworkConnectivity,
    critical: true
  },
  {
    name: 'Pattern Detection Tools',
    description: 'Git and ripgrep for code analysis',
    check: checkPatternDetectionTools,
    critical: false
  }
];

async function runDeploymentReadinessCheck() {
  console.log('🔍 Cloudflare Three-Lane Deployment Readiness Check\n');
  
  let criticalFailures = 0;
  let warningCount = 0;
  
  for (const check of readinessChecks) {
    console.log(`📋 Checking: ${check.name}`);
    console.log(`   ${check.description}`);
    
    try {
      const result = await check.check();
      
      if (result.passed) {
        console.log(`   ✅ ${result.message}`);
        if (result.details) {
          console.log(`   💡 ${result.details}`);
        }
      } else {
        const symbol = check.critical ? '❌' : '⚠️';
        console.log(`   ${symbol} ${result.message}`);
        if (result.details) {
          console.log(`   📝 ${result.details}`);
        }
        
        if (check.critical) {
          criticalFailures++;
        } else {
          warningCount++;
        }
      }
    } catch (error) {
      const symbol = check.critical ? '❌' : '⚠️';
      console.log(`   ${symbol} Check failed: ${(error as Error).message}`);
      
      if (check.critical) {
        criticalFailures++;
      } else {
        warningCount++;
      }
    }
    
    console.log('');
  }
  
  // Summary
  console.log('📊 Readiness Summary:');
  console.log(`   Critical checks: ${readinessChecks.filter(c => c.critical).length - criticalFailures}/${readinessChecks.filter(c => c.critical).length} passed`);
  console.log(`   Optional checks: ${readinessChecks.filter(c => !c.critical).length - warningCount}/${readinessChecks.filter(c => !c.critical).length} passed`);
  
  if (criticalFailures === 0) {
    console.log('\n🎉 Deployment readiness: ✅ READY');
    console.log('   The Cloudflare Three-Lane system is ready for deployment!');
    
    if (warningCount > 0) {
      console.log(`   ⚠️ ${warningCount} optional warning(s) - system will work but may have reduced performance`);
    }
  } else {
    console.log('\n🚨 Deployment readiness: ❌ NOT READY');
    console.log(`   ${criticalFailures} critical issue(s) must be resolved before deployment`);
    process.exit(1);
  }
  
  console.log('\n📋 Next steps:');
  console.log('   1. Address any critical issues above');
  console.log('   2. Test with: npm run test:cloudflare-three-lane');
  console.log('   3. Deploy with confidence! 🚀');
}

// Run the readiness check
if (require.main === module) {
  runDeploymentReadinessCheck().catch((error) => {
    console.error('\n💥 Readiness check failed:', error);
    process.exit(1);
  });
}