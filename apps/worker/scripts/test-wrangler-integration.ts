import { config } from 'dotenv';
import { deployToCloudflarePages } from '../src/services/cloudflarePages';
import fs from 'fs';
import path from 'path';

// Load environment variables
config();

async function testWranglerIntegration() {
  console.log('🧪 Testing Wrangler Integration in cloudflarePages.ts\n');
  
  // Create test directory
  const testDir = path.join(process.cwd(), 'test-integration-' + Date.now());
  fs.mkdirSync(testDir, { recursive: true });
  
  console.log('📁 Created test directory:', testDir);
  
  // Create test HTML
  const html = `<!DOCTYPE html>
<html>
<head>
    <title>Wrangler Integration Test</title>
    <style>
      body {
        background: linear-gradient(45deg, #f093fb 0%, #f5576c 100%);
        color: white;
        font-family: Arial, sans-serif;
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100vh;
        margin: 0;
      }
      .container {
        text-align: center;
        padding: 2rem;
        background: rgba(0, 0, 0, 0.2);
        border-radius: 10px;
      }
      .timestamp {
        font-size: 0.8rem;
        opacity: 0.7;
        margin-top: 1rem;
      }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎉 Wrangler Integration Test</h1>
        <p>This deployment used Wrangler CLI</p>
        <p class="timestamp">Deployed: ${new Date().toISOString()}</p>
    </div>
</body>
</html>`;

  fs.writeFileSync(path.join(testDir, 'index.html'), html);
  
  console.log('📝 Created test HTML file\n');
  
  try {
    console.log('🚀 Calling deployToCloudflarePages...\n');
    
    const result = await deployToCloudflarePages(testDir);
    
    console.log('\n✅ Deployment successful!');
    console.log('📍 Deployment ID:', result.deploymentId);
    console.log('🌐 URL:', result.url);
    console.log('🌍 Environment:', result.environment);
    console.log('\n🔗 Visit:', result.url);
    
    // Wait and check accessibility
    console.log('\n⏳ Waiting 5 seconds...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log('🔍 Checking deployment...');
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(result.url);
    console.log('📡 Status:', response.status);
    console.log('✅ Success:', response.status === 200);
    
  } catch (error) {
    console.error('\n❌ Deployment failed:', error);
  } finally {
    // Clean up
    console.log('\n🧹 Cleaning up...');
    fs.rmSync(testDir, { recursive: true, force: true });
  }
}

testWranglerIntegration().catch(console.error);