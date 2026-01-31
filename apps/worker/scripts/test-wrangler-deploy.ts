import { config } from 'dotenv';
import { WranglerDeployService } from '../src/services/wranglerDeploy';
import fs from 'fs';
import path from 'path';

// Load environment variables
config();

async function testWranglerDeploy() {
  console.log('🧪 Testing Wrangler Deployment Integration\n');
  
  // Create test directory
  const testDir = path.join(process.cwd(), 'test-wrangler-deploy-' + Date.now());
  fs.mkdirSync(testDir, { recursive: true });
  
  console.log('📁 Created test directory:', testDir);
  
  // Create test HTML files
  const indexHtml = `<!DOCTYPE html>
<html>
<head>
    <title>Wrangler Deploy Test</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
      body {
        margin: 0;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
      }
      .container {
        text-align: center;
        padding: 3rem;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 20px;
        backdrop-filter: blur(10px);
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
      }
      h1 {
        font-size: 3rem;
        margin-bottom: 1rem;
      }
      .timestamp {
        font-size: 0.9rem;
        opacity: 0.8;
        margin-top: 2rem;
      }
      .success {
        color: #4ade80;
        font-weight: bold;
      }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎉 Wrangler Deploy Test</h1>
        <p class="success">✅ Successfully deployed with Wrangler CLI!</p>
        <p>This page was deployed using the new Wrangler integration.</p>
        <p class="timestamp">Deployed at: ${new Date().toISOString()}</p>
    </div>
</body>
</html>`;

  const aboutHtml = `<!DOCTYPE html>
<html>
<head>
    <title>About - Wrangler Test</title>
    <meta charset="UTF-8">
    <style>
      body {
        font-family: Arial, sans-serif;
        padding: 2rem;
        max-width: 800px;
        margin: 0 auto;
      }
    </style>
</head>
<body>
    <h1>About This Test</h1>
    <p>This is a test page to verify multi-file deployments work correctly.</p>
    <p><a href="/">Back to Home</a></p>
</body>
</html>`;

  fs.writeFileSync(path.join(testDir, 'index.html'), indexHtml);
  fs.writeFileSync(path.join(testDir, 'about.html'), aboutHtml);
  
  console.log('📝 Created test HTML files\n');
  
  const service = new WranglerDeployService();
  
  try {
    // First check if Wrangler is available
    console.log('🔍 Checking Wrangler availability...');
    const isAvailable = await service.checkWranglerAvailable();
    
    if (!isAvailable) {
      console.error('❌ Wrangler is not available. Please install it first.');
      console.log('Run: npm install -g wrangler');
      return;
    }
    
    console.log('✅ Wrangler is available\n');
    
    // Deploy the test directory
    console.log('🚀 Starting deployment...\n');
    
    const result = await service.deploy({
      buildDir: testDir,
      projectName: process.env.CF_PAGES_PROJECT_NAME || 'sheenapps-preview',
      branch: 'wrangler-test',
      commitMessage: 'Test deployment from Wrangler integration'
    });
    
    console.log('\n✅ Deployment successful!');
    console.log('📍 Deployment ID:', result.deploymentId);
    console.log('🌐 URL:', result.url);
    console.log('🌿 Branch URL:', result.branchUrl || 'N/A');
    console.log('\n🔗 Visit your deployment:', result.url);
    
    // Wait a bit before checking if the URL is accessible
    console.log('\n⏳ Waiting 5 seconds for deployment to propagate...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Check if the deployment is accessible
    console.log('🔍 Checking if deployment is accessible...');
    try {
      const fetch = (await import('node-fetch')).default;
      const response = await fetch(result.url);
      console.log('📡 Response status:', response.status);
      
      if (response.status === 200) {
        console.log('✅ Deployment is accessible!');
        const content = await response.text();
        console.log('📄 Content length:', content.length, 'bytes');
        console.log('✨ Contains success message:', content.includes('Successfully deployed'));
      } else {
        console.log('⚠️ Deployment returned status:', response.status);
      }
    } catch (error) {
      console.error('❌ Failed to check deployment:', error);
    }
    
  } catch (error) {
    console.error('\n❌ Deployment failed:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
    }
  } finally {
    // Clean up test directory
    console.log('\n🧹 Cleaning up test directory...');
    fs.rmSync(testDir, { recursive: true, force: true });
    console.log('✅ Cleanup complete');
  }
}

// Run the test
testWranglerDeploy().catch(console.error);