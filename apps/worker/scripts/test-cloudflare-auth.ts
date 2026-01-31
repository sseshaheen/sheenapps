import { config } from 'dotenv';
import fetch from 'node-fetch';

// Load environment variables
config();

async function testCloudflareAuth() {
  const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
  const CF_API_TOKEN = process.env.CF_API_TOKEN_WORKERS;
  
  console.log('Testing Cloudflare authentication...\n');
  console.log('Account ID:', CF_ACCOUNT_ID);
  console.log('API Token exists:', !!CF_API_TOKEN);
  console.log('API Token length:', CF_API_TOKEN?.length || 0);
  console.log('API Token preview:', CF_API_TOKEN ? `${CF_API_TOKEN.substring(0, 8)}...` : 'undefined');
  
  // Test 1: Verify token with user details endpoint
  console.log('\n1. Testing token validity...');
  try {
    const response = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json() as any;
    console.log('Token verification response:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Token verification failed:', error);
  }
  
  // Test 2: List Pages projects
  console.log('\n2. Testing Pages access...');
  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/pages/projects`,
      {
        headers: {
          'Authorization': `Bearer ${CF_API_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const data = await response.json() as any;
    if (data.success) {
      console.log('✅ Successfully accessed Pages API');
      console.log('Projects found:', data.result?.length || 0);
      data.result?.forEach((project: any) => {
        console.log(`  - ${project.name} (${project.production_branch || 'main'})`);
      });
    } else {
      console.log('❌ Failed to access Pages API');
      console.log('Errors:', JSON.stringify(data.errors, null, 2));
    }
  } catch (error) {
    console.error('Pages API test failed:', error);
  }
  
  // Test 3: Check specific project
  console.log('\n3. Checking specific project...');
  const projectName = process.env.CF_PAGES_PROJECT_NAME || 'sheenapps-preview';
  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/pages/projects/${projectName}`,
      {
        headers: {
          'Authorization': `Bearer ${CF_API_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const data = await response.json() as any;
    if (data.success) {
      console.log(`✅ Project '${projectName}' exists`);
      console.log('Project details:', {
        name: data.result.name,
        subdomain: data.result.subdomain,
        created_on: data.result.created_on
      });
    } else {
      console.log(`❌ Project '${projectName}' not found or not accessible`);
      console.log('Errors:', JSON.stringify(data.errors, null, 2));
    }
  } catch (error) {
    console.error('Project check failed:', error);
  }
}

testCloudflareAuth();