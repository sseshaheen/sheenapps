#!/usr/bin/env tsx

import fetch from 'node-fetch';

// Configuration
const API_URL = process.env.API_URL || 'http://localhost:3002';
const USER_ID = 'test-user';
const PROJECT_ID = 'test-project-' + Date.now();

async function testUpdateProject() {
  console.log('🧪 Testing Project Update Flow\n');

  // Step 1: Create initial project
  console.log('1️⃣ Creating initial project...');
  const createResponse = await fetch(`${API_URL}/create-preview-for-new-project`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: USER_ID,
      projectId: PROJECT_ID,
      prompt: 'Create a simple counter app with increment and decrement buttons',
      framework: 'react'
    })
  });

  if (!createResponse.ok) {
    const error = await createResponse.text();
    console.error('❌ Failed to create project:', error);
    return;
  }

  const createResult = await createResponse.json();
  console.log('✅ Project created:', createResult);
  console.log('   Build ID:', createResult.buildId);

  // Wait for initial build to complete
  console.log('\n⏳ Waiting 30 seconds for initial build to complete...');
  await new Promise(resolve => setTimeout(resolve, 30000));

  // Step 2: Update the project
  console.log('\n2️⃣ Updating project...');
  const updateResponse = await fetch(`${API_URL}/update-project`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: USER_ID,
      projectId: PROJECT_ID,
      prompt: 'Add a reset button that sets the counter back to 0'
    })
  });

  if (!updateResponse.ok) {
    const error = await updateResponse.text();
    console.error('❌ Failed to update project:', error);
    return;
  }

  const updateResult = await updateResponse.json();
  console.log('✅ Update queued:', updateResult);
  console.log('   Build ID:', updateResult.buildId);
  console.log('   Base Version:', updateResult.baseVersionId);
  console.log('   Estimated Time:', updateResult.estimatedTime);

  // Step 3: Check progress
  console.log('\n3️⃣ Monitoring progress...');
  const progressUrl = `${API_URL}/progress/${updateResult.buildId}`;
  
  for (let i = 0; i < 10; i++) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const progressResponse = await fetch(progressUrl);
    if (progressResponse.ok) {
      const progress = await progressResponse.json();
      console.log(`   Status: ${progress.status} - ${progress.stage || 'waiting'}`);
      
      if (progress.status === 'completed' && progress.previewUrl) {
        console.log(`\n🎉 Update completed successfully!`);
        console.log(`   Preview URL: ${progress.previewUrl}`);
        break;
      } else if (progress.status === 'failed') {
        console.error(`\n❌ Update failed:`, progress.error);
        break;
      }
    }
  }

  console.log('\n✨ Test completed!');
}

// Run the test
testUpdateProject().catch(console.error);