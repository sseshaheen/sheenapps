import { config } from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
config();

/**
 * Quick utility to check the deployment target for a specific project
 */

interface DeploymentManifest {
  target: 'pages-static' | 'pages-edge' | 'workers-node';
  reasons: string[];
  notes?: string[];
  timestamp: string;
  version: string;
  switched?: boolean;
  switchReason?: string;
  supabaseIntegration?: {
    hasSupabase: boolean;
    connectionType: 'oauth' | 'manual' | null;
    needsServiceRole: boolean;
  };
}

async function checkDeploymentTarget(projectPath: string): Promise<void> {
  console.log(`🔍 Checking deployment target for: ${projectPath}\n`);

  // Check if project path exists
  if (!fs.existsSync(projectPath)) {
    console.log('❌ Project path does not exist');
    return;
  }

  // Check for .sheenapps directory
  const sheenappsDir = path.join(projectPath, '.sheenapps');
  if (!fs.existsSync(sheenappsDir)) {
    console.log('⚠️ No .sheenapps directory found - project not processed by three-lane system yet');
    console.log('💡 Run detection first: POST /v1/cloudflare/detect-target');
    return;
  }

  // Check for deployment manifest
  const manifestPath = path.join(sheenappsDir, 'deploy-target.json');
  if (!fs.existsSync(manifestPath)) {
    console.log('⚠️ No deployment manifest found');
    console.log('💡 Run detection first: POST /v1/cloudflare/detect-target');
    return;
  }

  try {
    // Read and parse manifest
    const manifestContent = await fs.promises.readFile(manifestPath, 'utf-8');
    const manifest: DeploymentManifest = JSON.parse(manifestContent);

    // Display target information
    const targetEmoji = manifest.target === 'workers-node' ? '🔧' : 
                       manifest.target === 'pages-edge' ? '⚡' : '📄';
    
    console.log(`${targetEmoji} **Deployment Target: ${manifest.target}**`);
    console.log(`🕐 Detected: ${new Date(manifest.timestamp).toLocaleString()}`);
    console.log(`📝 Version: ${manifest.version}`);
    
    if (manifest.switched) {
      console.log(`🔄 **Target was switched during deployment**`);
      console.log(`   Reason: ${manifest.switchReason}`);
    }

    console.log('\n📋 Detection Reasons:');
    manifest.reasons.forEach((reason, index) => {
      console.log(`   ${index + 1}. ${reason}`);
    });

    if (manifest.notes && manifest.notes.length > 0) {
      console.log('\n💡 Additional Notes:');
      manifest.notes.forEach((note, index) => {
        console.log(`   • ${note}`);
      });
    }

    if (manifest.supabaseIntegration) {
      console.log('\n🗄️ Supabase Integration:');
      console.log(`   Has Supabase: ${manifest.supabaseIntegration.hasSupabase ? '✅' : '❌'}`);
      if (manifest.supabaseIntegration.hasSupabase) {
        console.log(`   Connection Type: ${manifest.supabaseIntegration.connectionType}`);
        console.log(`   Needs Service Role: ${manifest.supabaseIntegration.needsServiceRole ? '✅' : '❌'}`);
      }
    }

    // Display deployment characteristics
    console.log('\n🎯 Deployment Characteristics:');
    switch (manifest.target) {
      case 'pages-static':
        console.log('   • Static site generation');
        console.log('   • No server-side functionality');
        console.log('   • Fast global CDN delivery');
        console.log('   • Only public environment variables');
        break;
      case 'pages-edge':
        console.log('   • Server-side rendering with Edge Runtime');
        console.log('   • Fast global execution');
        console.log('   • Web APIs only (no Node.js built-ins)');
        console.log('   • Limited environment variables');
        break;
      case 'workers-node':
        console.log('   • Full Node.js compatibility');
        console.log('   • Server-side functionality');
        console.log('   • Database connections with service keys');
        console.log('   • ISR and revalidation support');
        break;
    }

    // Check for manual override
    const configPath = path.join(sheenappsDir, 'config.json');
    if (fs.existsSync(configPath)) {
      try {
        const configContent = await fs.promises.readFile(configPath, 'utf-8');
        const config = JSON.parse(configContent);
        console.log('\n👤 Manual Override Configured:');
        console.log(`   Target: ${config.deployTarget}`);
        console.log(`   Reason: ${config.reason || 'No reason specified'}`);
      } catch (error) {
        console.log('\n⚠️ Manual override file exists but is invalid JSON');
      }
    }

    // Suggest next steps
    console.log('\n📋 Next Steps:');
    console.log('   1. Deploy: POST /v1/cloudflare/deploy');
    console.log('   2. Override: Create .sheenapps/config.json with {"deployTarget": "target"}');
    console.log('   3. Re-detect: POST /v1/cloudflare/detect-target (if project changed)');

  } catch (error) {
    console.log('❌ Failed to read deployment manifest:', (error as Error).message);
  }
}

// CLI interface
async function main() {
  const projectPath = process.argv[2];
  
  if (!projectPath) {
    console.log('Usage: npx ts-node scripts/check-deployment-target.ts <project-path>');
    console.log('\nExample:');
    console.log('  npx ts-node scripts/check-deployment-target.ts /path/to/my-nextjs-app');
    console.log('  npx ts-node scripts/check-deployment-target.ts .');
    process.exit(1);
  }

  const resolvedPath = path.resolve(projectPath);
  await checkDeploymentTarget(resolvedPath);
}

// Export for programmatic use
export { checkDeploymentTarget };

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}