import { config } from 'dotenv';
import fetch from 'node-fetch';

// Load environment variables
config();

async function checkProjectConfig() {
  const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
  const CF_API_TOKEN = process.env.CF_API_TOKEN_WORKERS;
  const CF_PAGES_PROJECT_NAME = process.env.CF_PAGES_PROJECT_NAME || 'sheenapps-preview';
  
  console.log('Checking Cloudflare Pages project configuration...\n');
  
  try {
    // Get project details
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/pages/projects/${CF_PAGES_PROJECT_NAME}`,
      {
        headers: {
          'Authorization': `Bearer ${CF_API_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const data = await response.json() as any;
    
    if (data.success) {
      console.log('Project configuration:');
      console.log('  Name:', data.result.name);
      console.log('  Created:', data.result.created_on);
      console.log('  Production branch:', data.result.production_branch);
      console.log('  Source:', data.result.source);
      console.log('  Build config:', JSON.stringify(data.result.build_config, null, 2));
      console.log('  Deployment configs:', JSON.stringify(data.result.deployment_configs, null, 2));
      
      if (data.result.source?.type === 'github') {
        console.log('\n⚠️  This project is configured for GitHub integration, not Direct Upload!');
        console.log('You may need to create a new project for Direct Upload or change the configuration.');
      }
    } else {
      console.log('Failed to get project:', data.errors);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

checkProjectConfig();