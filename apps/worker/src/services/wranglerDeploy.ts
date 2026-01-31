import { spawn } from 'child_process';
import { DeploymentResult } from './cloudflarePages';

/**
 * Get environment variables formatted for Wrangler CLI
 * Wrangler specifically requires CLOUDFLARE_* naming convention
 */
function getWranglerEnvironment(customEnv: Record<string, string> = {}): Record<string, string | undefined> {
  return {
    // System environment
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    USER: process.env.USER,
    NODE_ENV: process.env.NODE_ENV,
    
    // Wrangler requires CLOUDFLARE_* variables (mapped from CF_*)
    CLOUDFLARE_API_TOKEN: process.env.CF_API_TOKEN_WORKERS,
    CLOUDFLARE_ACCOUNT_ID: process.env.CF_ACCOUNT_ID,
    
    // Also include CF_* variables for compatibility
    CF_API_TOKEN: process.env.CF_API_TOKEN_WORKERS,
    CF_ACCOUNT_ID: process.env.CF_ACCOUNT_ID,
    
    // Custom environment overrides
    ...customEnv
  };
}

// Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
export interface WranglerDeployOptions {
  buildDir: string;
  projectName: string;
  branch?: string | undefined;
  commitMessage?: string | undefined;
  env?: Record<string, string> | undefined;
}

export interface WranglerDeployResult extends DeploymentResult {
  branchUrl?: string | undefined;
  output: string;
}

export class WranglerDeployService {
  private wranglerPath: string;

  constructor() {
    // Use the known wrangler path or fallback to PATH
    this.wranglerPath = process.env.WRANGLER_PATH || '/opt/homebrew/bin/wrangler';
  }

  private parseDeploymentOutput(output: string): Partial<WranglerDeployResult> {
    // Extract URLs from output
    const urlRegex = /https:\/\/[\w-]+\.[\w-]+\.pages\.dev/g;
    const urls = output.match(urlRegex) || [];
    
    // Extract deployment ID from URL
    const deploymentUrl = urls[0];
    let deploymentId = '';
    if (deploymentUrl) {
      const match = deploymentUrl.match(/https:\/\/([\w-]+)\./);
      if (match?.[1]) deploymentId = match[1];
    }
    
    // Check for success indicators
    const success = output.includes('Deployment complete') || 
                   output.includes('Success') || 
                   output.includes('Published') ||
                   (deploymentUrl !== undefined);
    
    // Use conditional spread to avoid assigning undefined to optional properties
    return {
      deploymentId,
      ...(deploymentUrl !== undefined && { url: deploymentUrl }),
      ...(urls[1] !== undefined && { branchUrl: urls[1] }),
      environment: 'preview'
    };
  }

  private async deployWithRetry(options: WranglerDeployOptions, maxRetries = 3): Promise<WranglerDeployResult> {
    let lastError: Error;
    
    console.log(`🔄 [Cloudflare Debug] Starting deployment with retry (max ${maxRetries} attempts)`);
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🚀 [Cloudflare Debug] Deployment attempt ${attempt}/${maxRetries}`);
        return await this.deployOnce(options);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        console.log(`❌ [Cloudflare Debug] Attempt ${attempt} failed: ${lastError.message}`);
        console.log(`🔍 [Cloudflare Debug] Error analysis:`);
        console.log(`   - Is retryable: ${this.isRetryableError(lastError)}`);
        console.log(`   - Has more attempts: ${attempt < maxRetries}`);
        console.log(`   - Error contains "Authentication": ${lastError.message.includes('Authentication')}`);
        console.log(`   - Error contains "code: 10000": ${lastError.message.includes('code: 10000')}`);
        
        if (this.isRetryableError(lastError) && attempt < maxRetries) {
          // Longer delays for network-related errors
          const isNetworkError = /fetch failed|network error|ECONNRESET|ETIMEDOUT|ENOTFOUND/i.test(lastError.message);
          const baseDelay = isNetworkError ? Math.pow(3, attempt) * 2000 : Math.pow(2, attempt) * 1000; // 6s, 18s, 54s for network issues
          const jitter = Math.random() * 1000; // 0-1s random jitter
          const delay = baseDelay + jitter;
          
          console.log(`⏳ [Cloudflare Debug] Deployment attempt ${attempt} failed, retrying in ${Math.round(delay)}ms...`);
          console.log(`📋 [Cloudflare Debug] Error: ${lastError.message}`);
          
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          console.log(`🛑 [Cloudflare Debug] Not retrying - either not retryable or max attempts reached`);
          throw lastError;
        }
      }
    }
    
    throw lastError!;
  }

  private isRetryableError(error: Error): boolean {
    const retryablePatterns = [
      /fetch failed/i,
      /network error/i,
      /timeout/i,
      /connection reset/i,
      /ECONNRESET/i,
      /ETIMEDOUT/i,
      /ENOTFOUND/i
    ];
    
    return retryablePatterns.some(pattern => pattern.test(error.message));
  }

  private async testNetworkConnectivity(): Promise<void> {
    console.log('🌐 [Cloudflare Debug] Testing network connectivity...');
    
    try {
      // Test DNS resolution first
      const dns = require('dns');
      const { promisify } = require('util');
      const lookup = promisify(dns.lookup);
      
      console.log('🔍 [Cloudflare Debug] Testing DNS resolution for api.cloudflare.com...');
      const dnsResult = await lookup('api.cloudflare.com');
      console.log(`✅ [Cloudflare Debug] DNS resolved: ${dnsResult.address}`);
      
      // Test HTTPS connectivity
      console.log('🔍 [Cloudflare Debug] Testing HTTPS connectivity...');
      const https = require('https');
      
      await new Promise((resolve, reject) => {
        const req = https.request('https://api.cloudflare.com', {
          method: 'HEAD',
          timeout: 10000
        }, (res: any) => {
          console.log(`✅ [Cloudflare Debug] HTTPS connection successful (status: ${res.statusCode})`);
          resolve(res);
        });
        
        req.on('error', (error: any) => {
          console.log(`❌ [Cloudflare Debug] HTTPS connection failed: ${error.message}`);
          reject(error);
        });
        
        req.on('timeout', () => {
          console.log('❌ [Cloudflare Debug] HTTPS connection timed out');
          req.destroy();
          reject(new Error('Connection timeout'));
        });
        
        req.end();
      });
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`⚠️  [Cloudflare Debug] Network connectivity test failed: ${errorMessage}`);
      console.log('🔧 [Cloudflare Debug] Troubleshooting suggestions:');
      console.log('   1. Check internet connection');
      console.log('   2. Verify DNS settings (try: scutil --dns | grep nameserver)');
      console.log('   3. Flush DNS cache (try: sudo dscacheutil -flushcache)');
      console.log('   4. Check for firewall/proxy blocking api.cloudflare.com');
      console.log('   5. Try from different network if possible');
      console.log('🔄 [Cloudflare Debug] Proceeding with deployment attempt anyway...\n');
    }
  }

  async deploy(options: WranglerDeployOptions): Promise<WranglerDeployResult> {
    return this.deployWithRetry(options);
  }

  private async deployOnce(options: WranglerDeployOptions): Promise<WranglerDeployResult> {
    const { buildDir, projectName, branch, commitMessage, env } = options;
    
    // Test network connectivity before attempting deployment
    await this.testNetworkConnectivity();
    
    // 🔍 DEBUG: Environment variable analysis
    const cfToken = process.env.CF_API_TOKEN_WORKERS;
    const cfAccountId = process.env.CF_ACCOUNT_ID;
    
    console.log('\n🔍 [Cloudflare Debug] Environment Analysis:');
    console.log(`📋 Project: ${projectName}`);
    console.log(`📁 Build Dir: ${buildDir}`);
    console.log(`🌿 Branch: ${branch || 'default'}`);
    console.log(`🔑 CF_API_TOKEN_WORKERS: ${cfToken ? '✅ SET (' + cfToken.substring(0, 8) + '...)' : '❌ NOT SET'}`);
    console.log(`🏢 CF_ACCOUNT_ID: ${cfAccountId ? '✅ SET (' + cfAccountId + ')' : '❌ NOT SET'}`);
    console.log(`🛠️  Wrangler Path: ${this.wranglerPath}`);
    console.log(`📍 Working Directory: ${process.cwd()}`);
    console.log(`🌍 NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
    console.log(`🔐 Token type: ${typeof cfToken}, length: ${cfToken ? cfToken.length : 0}`);
    console.log(`🔐 Token validation: ${cfToken && cfToken.length > 10 ? '✅ Valid format' : '❌ Invalid format'}`);
    console.log('');
    
    if (!cfToken) {
      console.error('❌ [Cloudflare Debug] CRITICAL: No Cloudflare API token found!');
      console.error('   Check environment variable: CF_API_TOKEN_WORKERS');
      console.error('   Current env keys containing "CF_":', Object.keys(process.env).filter(k => k.startsWith('CF_')));
      throw new Error('No Cloudflare API token available for deployment');
    }
    
    if (!cfToken || cfToken.length < 10) {
      console.error('❌ [Cloudflare Debug] CRITICAL: Cloudflare API token is invalid (too short)!');
      throw new Error('Invalid Cloudflare API token format');
    }
    
    return new Promise((resolve, reject) => {
      const args = ['pages', 'deploy', buildDir, `--project-name=${projectName}`, '--commit-dirty=true'];
      
      if (branch) args.push(`--branch=${branch}`);
      if (commitMessage) args.push(`--commit-message="${commitMessage}"`);
      
      console.log(`🚀 [Cloudflare Debug] Executing: ${this.wranglerPath} ${args.join(' ')}`);
      
      // Use centralized Wrangler environment configuration
      const deployEnv = getWranglerEnvironment({
        ...env,
        // Non-interactive mode
        CI: 'true',
        // Disable update checks
        WRANGLER_DISABLE_UPDATE_CHECK: 'true',
        // Force UTF-8 encoding
        LANG: 'en_US.UTF-8',
        LC_ALL: 'en_US.UTF-8'
      });
      
      // 🔍 DEBUG: Final environment check
      console.log(`🔐 [Cloudflare Debug] Final token check: ${deployEnv.CLOUDFLARE_API_TOKEN ? '✅ Present' : '❌ Missing'}`);
      console.log(`🔐 [Cloudflare Debug] Token length: ${deployEnv.CLOUDFLARE_API_TOKEN?.length || 0}`);
      console.log(`🔐 [Cloudflare Debug] Account ID: ${deployEnv.CLOUDFLARE_ACCOUNT_ID ? '✅ Present' : '❌ Missing'}`);
      console.log(`🔐 [Cloudflare Debug] Environment keys: ${Object.keys(deployEnv).filter(k => k.includes('CLOUDFLARE') || k.includes('CF_')).join(', ')}`);
      
      const wrangler = spawn(this.wranglerPath, args, {
        shell: true,
        env: deployEnv,
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd(),
        timeout: 5 * 60 * 1000 // 5 minutes timeout
      });
      
      let output = '';
      let errorOutput = '';
      
      wrangler.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        console.log('[Wrangler]:', text.trim());
      });
      
      wrangler.stderr.on('data', (data) => {
        const text = data.toString();
        errorOutput += text;
        console.error('[Wrangler Error]:', text.trim());
      });
      
      wrangler.on('exit', (code) => {
        if (code === 0) {
          const result = this.parseDeploymentOutput(output);
          
          if (!result.url) {
            reject(new Error('Failed to extract deployment URL from Wrangler output'));
            return;
          }
          
          resolve({
            deploymentId: result.deploymentId || 'unknown',
            url: result.url,
            environment: 'preview',
            branchUrl: result.branchUrl,
            output,
            ...result
          } as WranglerDeployResult);
        } else {
          let errorMsg = `Wrangler deployment failed with code ${code}: ${errorOutput || output}`;
          
          // Enhanced error handling for fetch failures
          if (errorOutput.includes('fetch failed') || output.includes('fetch failed')) {
            errorMsg += '\n\n🔧 Network Troubleshooting Suggestions:';
            errorMsg += '\n   1. Check internet connection and DNS settings';
            errorMsg += '\n   2. Flush DNS cache: sudo dscacheutil -flushcache';
            errorMsg += '\n   3. Check if api.cloudflare.com is accessible: curl -I https://api.cloudflare.com';
            errorMsg += '\n   4. Verify no firewall/proxy is blocking Cloudflare API';
            errorMsg += '\n   5. Try deployment from different network if possible';
            errorMsg += '\n   6. Check Cloudflare status: https://www.cloudflarestatus.com/';
          }
          
          reject(new Error(errorMsg));
        }
      });
      
      wrangler.on('error', (error: any) => {
        let errorMsg = `Failed to spawn wrangler: ${error.message}`;
        
        // Detect timeout errors
        if (error.message.includes('timeout') || error.code === 'SIGTERM') {
          errorMsg += '\n\n⏰ Process Timeout Detected:';
          errorMsg += '\n   - The deployment process timed out after 5 minutes';
          errorMsg += '\n   - This usually indicates network connectivity issues';
          errorMsg += '\n   - Consider checking your internet connection and DNS settings';
        }
        
        reject(new Error(errorMsg));
      });
    });
  }
  
  async createProject(projectName: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const args = ['pages', 'project', 'create', projectName];
      
      console.log(`Creating project: ${this.wranglerPath} ${args.join(' ')}`);
      
      const createEnv = getWranglerEnvironment({
        CI: 'true',
        WRANGLER_DISABLE_UPDATE_CHECK: 'true',
        LANG: 'en_US.UTF-8',
        LC_ALL: 'en_US.UTF-8'
      });

      const wrangler = spawn(this.wranglerPath, args, {
        shell: true,
        env: createEnv,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let output = '';
      
      wrangler.stdout.on('data', (data) => {
        output += data.toString();
        console.log('[Wrangler Create]:', data.toString().trim());
      });
      
      wrangler.stderr.on('data', (data) => {
        output += data.toString();
        console.error('[Wrangler Create Error]:', data.toString().trim());
      });
      
      wrangler.on('exit', (code) => {
        if (code === 0 || output.includes('already exists')) {
          resolve(true);
        } else {
          console.error('Project creation failed:', output);
          resolve(false);
        }
      });
      
      wrangler.on('error', (error) => {
        console.error('Failed to spawn wrangler:', error);
        resolve(false);
      });
    });
  }

  async checkWranglerAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const checkEnv = getWranglerEnvironment({
        WRANGLER_DISABLE_UPDATE_CHECK: 'true',
        LANG: 'en_US.UTF-8',
        LC_ALL: 'en_US.UTF-8'
      });

      const wrangler = spawn(this.wranglerPath, ['--version'], {
        shell: true,
        env: checkEnv,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let output = '';
      
      wrangler.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      wrangler.on('exit', (code) => {
        if (code === 0) {
          console.log(`Wrangler available: ${output.trim()}`);
          resolve(true);
        } else {
          console.error('Wrangler not available at:', this.wranglerPath);
          resolve(false);
        }
      });
      
      wrangler.on('error', () => {
        console.error('Wrangler not found at:', this.wranglerPath);
        resolve(false);
      });
    });
  }
}