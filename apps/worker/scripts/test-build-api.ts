#!/usr/bin/env npx tsx

import { createHmac } from 'crypto';

// Test the /build-preview-for-new-project endpoint
async function testBuildAPI() {
  const API_URL = process.env.API_URL || 'http://localhost:3456';
  const SHARED_SECRET = process.env.SHARED_SECRET || 'test-secret';
  
  // Generate random app name
  const randomAppName = `test-app-${Math.random().toString(36).substring(7)}`;
  
  const payload = {
    userId: 'test-user-123',
    projectId: randomAppName,
    prompt: 'Create a modern todo list app with the following features:\n' +
            '- Add new todos with a form\n' + 
            '- Mark todos as complete with checkboxes\n' +
            '- Delete todos with a button\n' +
            '- Filter todos by all/active/completed\n' +
            '- Persist todos in localStorage\n' +
            '- Use a clean, modern design with Tailwind CSS\n' +
            '- Add smooth animations for adding/removing todos',
    framework: 'react'
  };
  
  const payloadString = JSON.stringify(payload);
  const signature = createHmac('sha256', SHARED_SECRET)
    .update(payloadString)
    .digest('hex');
  
  console.log('🚀 Testing /build-preview-for-new-project');
  console.log('📦 Project ID:', randomAppName);
  console.log('🔐 Using secret:', SHARED_SECRET.substring(0, 10) + '...');
  console.log('📝 Payload:', payloadString);
  console.log('🔏 Signature:', signature);
  console.log('\n');
  
  try {
    const response = await fetch(`${API_URL}/build-preview-for-new-project`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sheen-Signature': signature
      },
      body: payloadString
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      console.error('❌ API Error:', response.status, response.statusText);
      console.error('Response:', result);
      return;
    }
    
    console.log('✅ Build queued successfully!');
    console.log('Job ID:', result.jobId);
    console.log('Version ID:', result.versionId);
    console.log('Status:', result.status);
    console.log('\n');
    
    // Poll for progress
    if (result.jobId) {
      console.log('📊 Monitoring build progress...');
      await monitorBuildProgress(API_URL, payload.userId, payload.projectId, result.jobId);
    }
    
  } catch (error) {
    console.error('❌ Request failed:', error);
  }
}

// Monitor build progress by polling the events endpoint
async function monitorBuildProgress(apiUrl: string, userId: string, projectId: string, jobId: string) {
  const buildId = jobId; // In our system, jobId is often the buildId
  let lastEventId = 0;
  let completed = false;
  let attempts = 0;
  const maxAttempts = 60; // 5 minutes with 5 second intervals
  
  while (!completed && attempts < maxAttempts) {
    attempts++;
    
    try {
      // Try to get events (this endpoint might need authentication)
      const eventsUrl = `${apiUrl}/api/builds/${buildId}/events?since=${lastEventId}`;
      const response = await fetch(eventsUrl);
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.events && data.events.length > 0) {
          for (const event of data.events) {
            const timestamp = new Date(event.timestamp).toLocaleTimeString();
            console.log(`[${timestamp}] ${event.type}: ${event.data?.message || JSON.stringify(event.data)}`);
            
            // Update last event ID
            if (event.id > lastEventId) {
              lastEventId = event.id;
            }
            
            // Check for completion
            if (event.type === 'deploy_completed') {
              completed = true;
              console.log('\n🎉 Build completed successfully!');
              console.log('Preview URL:', event.data.previewUrl);
              break;
            } else if (event.type === 'build_failed' || event.type === 'deploy_failed') {
              completed = true;
              console.error('\n❌ Build failed:', event.data.error || event.data.message);
              break;
            }
          }
        }
      } else if (response.status === 404) {
        // Events endpoint might not be available yet
        console.log('⏳ Waiting for build to start...');
      }
      
    } catch (error) {
      // Events endpoint might not be publicly accessible
      console.log('⚠️  Cannot access events endpoint, checking preview URL instead...');
      
      // Try the preview endpoint as fallback
      try {
        const previewUrl = `${apiUrl}/preview/${userId}/${projectId}/latest`;
        const previewResponse = await fetch(previewUrl);
        
        if (previewResponse.ok) {
          const preview = await previewResponse.json();
          if (preview.previewUrl) {
            completed = true;
            console.log('\n🎉 Build completed!');
            console.log('Preview URL:', preview.previewUrl);
            console.log('Version ID:', preview.latestVersionId);
            break;
          }
        }
      } catch (previewError) {
        // Ignore and continue polling
      }
    }
    
    if (!completed) {
      // Wait 5 seconds before next poll
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  
  if (!completed && attempts >= maxAttempts) {
    console.log('\n⏱️  Timeout: Build is taking longer than expected');
    console.log('You can check the BullMQ dashboard at', `${apiUrl}/admin/queues`);
  }
}

// Run the test
testBuildAPI().catch(console.error);