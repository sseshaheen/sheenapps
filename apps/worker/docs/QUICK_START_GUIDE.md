# Claude Worker Quick Start Guide

This guide helps you integrate with the Claude Worker API quickly.

## Prerequisites

- API endpoint URL
- Shared secret for authentication
- Node.js or any HTTP client

## Basic Integration

### 1. Setup Authentication

```javascript
const crypto = require('crypto');
const axios = require('axios');

const API_URL = 'https://your-api-endpoint.com';
const SHARED_SECRET = 'your-shared-secret';

function createSignature(payload) {
  return crypto.createHmac('sha256', SHARED_SECRET)
    .update(JSON.stringify(payload))
    .digest('hex');
}
```

### 2. Generate Code

```javascript
async function generateCode(userId, projectId, prompt) {
  const payload = { userId, projectId, prompt };
  const signature = createSignature(payload);
  
  const response = await axios.post(`${API_URL}/generate`, payload, {
    headers: {
      'x-sheen-signature': signature,
      'Content-Type': 'application/json'
    }
  });
  
  return response.data;
}

// Usage
const result = await generateCode('user123', 'my-app', 'Create a React todo app');
console.log(result.output);
```

### 3. Build and Deploy with Progress Tracking

```javascript
async function buildProject(userId, projectId, prompt, parentVersionId = null) {
  const payload = { userId, projectId, prompt, parentVersionId };
  const signature = createSignature(payload);
  
  // Start build
  const response = await axios.post(`${API_URL}/build-preview-for-new-project`, payload, {
    headers: {
      'x-sheen-signature': signature,
      'Content-Type': 'application/json'
    }
  });
  
  const { jobId } = response.data;
  console.log('Build started with ID:', jobId);
  
  // Monitor progress
  return await trackBuildProgress(jobId);
}

async function trackBuildProgress(buildId) {
  let lastEventId = 0;
  let completed = false;
  
  while (!completed) {
    // Get new events
    const eventsResponse = await axios.get(
      `${API_URL}/api/builds/${buildId}/events?lastEventId=${lastEventId}`
    );
    
    const { events, lastEventId: newLastEventId } = eventsResponse.data;
    lastEventId = newLastEventId;
    
    // Process events
    events.forEach(event => {
      console.log(`[${event.type}] ${event.data.message || 'Progress update'}`);
      
      if (event.type === 'deploy_completed') {
        console.log('✅ Build completed! Preview URL:', event.data.previewUrl);
        completed = true;
      } else if (event.type.includes('_failed')) {
        console.error('❌ Build failed:', event.data.error);
        completed = true;
      }
    });
    
    if (!completed) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Poll every 2 seconds
    }
  }
  
  // Get final status
  const statusResponse = await axios.get(`${API_URL}/api/builds/${buildId}/status`);
  return statusResponse.data;
}

// Usage
const build = await buildProject('user123', 'my-app', 'Add dark mode');
console.log('Final Status:', build.status);
console.log('Preview URL:', build.previewUrl);
```

### 4. Check Build Status

```javascript
async function getLatestVersion(userId, projectId) {
  const response = await axios.get(
    `${API_URL}/build-preview/${userId}/${projectId}/latest`
  );
  
  return response.data.version;
}

// Usage
const latest = await getLatestVersion('user123', 'my-app');
console.log('Status:', latest.status);
console.log('URL:', latest.previewUrl);
```

## Python Example

```python
import requests
import hashlib
import hmac
import json

API_URL = 'https://your-api-endpoint.com'
SHARED_SECRET = 'your-shared-secret'

def create_signature(payload):
    message = json.dumps(payload).encode()
    secret = SHARED_SECRET.encode()
    return hmac.new(secret, message, hashlib.sha256).hexdigest()

def generate_code(user_id, project_id, prompt):
    payload = {
        'userId': user_id,
        'projectId': project_id,
        'prompt': prompt
    }
    
    headers = {
        'x-sheen-signature': create_signature(payload),
        'Content-Type': 'application/json'
    }
    
    response = requests.post(f'{API_URL}/generate', 
                           json=payload, 
                           headers=headers)
    
    return response.json()

# Usage
result = generate_code('user123', 'my-app', 'Create a React todo app')
print(result['output'])
```

## cURL Examples

### Generate Code

```bash
# Calculate signature (using Node.js)
SIGNATURE=$(node -e "
  const crypto = require('crypto');
  const payload = {userId: 'user123', projectId: 'my-app', prompt: 'Create a React app'};
  console.log(crypto.createHmac('sha256', '$SHARED_SECRET')
    .update(JSON.stringify(payload))
    .digest('hex'));
")

# Make request
curl -X POST https://api.example.com/generate \
  -H "Content-Type: application/json" \
  -H "x-sheen-signature: $SIGNATURE" \
  -d '{
    "userId": "user123",
    "projectId": "my-app",
    "prompt": "Create a React todo app"
  }'
```

### Check Latest Version

```bash
curl https://api.example.com/build-preview/user123/my-app/latest
```

## Best Practices

### 1. Error Handling

```javascript
async function safeApiCall(fn) {
  try {
    return await fn();
  } catch (error) {
    if (error.response) {
      // API error
      console.error('API Error:', error.response.data);
      
      switch (error.response.status) {
        case 429:
          console.error('Rate limit exceeded, retry after delay');
          break;
        case 401:
          console.error('Invalid signature');
          break;
        case 503:
          console.error('Service unavailable');
          break;
      }
    } else {
      // Network error
      console.error('Network Error:', error.message);
    }
    throw error;
  }
}
```

### 2. Rate Limit Handling

```javascript
class RateLimitedClient {
  constructor(apiUrl, secret) {
    this.apiUrl = apiUrl;
    this.secret = secret;
    this.queue = [];
    this.processing = false;
  }
  
  async request(endpoint, payload) {
    return new Promise((resolve, reject) => {
      this.queue.push({ endpoint, payload, resolve, reject });
      this.processQueue();
    });
  }
  
  async processQueue() {
    if (this.processing || this.queue.length === 0) return;
    
    this.processing = true;
    const { endpoint, payload, resolve, reject } = this.queue.shift();
    
    try {
      const result = await this.makeRequest(endpoint, payload);
      resolve(result);
    } catch (error) {
      if (error.response?.status === 429) {
        // Retry after delay
        this.queue.unshift({ endpoint, payload, resolve, reject });
        await new Promise(r => setTimeout(r, 60000)); // Wait 1 minute
      } else {
        reject(error);
      }
    }
    
    // Process next request after delay
    setTimeout(() => {
      this.processing = false;
      this.processQueue();
    }, 1000); // 1 second between requests
  }
  
  async makeRequest(endpoint, payload) {
    // Implementation here
  }
}
```

### 3. Real-time Webhook Integration

Set up webhooks to receive real-time build progress updates:

```javascript
const express = require('express');
const crypto = require('crypto');
const app = express();

// Configure webhook endpoint (set these in your worker environment)
// MAIN_APP_WEBHOOK_URL=https://your-app.com/api/webhooks/claude-worker
// WEBHOOK_SECRET=your-webhook-secret-123

app.use(express.json());

app.post('/api/webhooks/claude-worker', (req, res) => {
  // Verify HMAC signature (security)
  const signature = req.headers['x-webhook-signature'];
  const payload = JSON.stringify(req.body);
  const expectedSignature = crypto
    .createHmac('sha256', process.env.WEBHOOK_SECRET)
    .update(payload)
    .digest('hex');
  
  if (signature !== expectedSignature) {
    return res.status(401).send('Invalid signature');
  }
  
  const { buildId, type, data, timestamp } = req.body;
  
  console.log(`[${type}] Build ${buildId}: ${data.message || 'Update'}`);
  
  switch (type) {
    case 'plan_started':
      console.log('🔄 Planning started...');
      break;
    case 'plan_generated':
      console.log(`📋 Plan ready with ${data.taskCount} tasks`);
      break;
    case 'task_started':
      console.log(`⚙️  Starting: ${data.taskName}`);
      break;
    case 'task_completed':
      console.log(`✅ Completed: ${data.taskName} (${data.filesCreated} files)`);
      break;
    case 'deploy_started':
      console.log('🚀 Deployment started...');
      break;
    case 'deploy_completed':
      console.log(`✅ Live at: ${data.previewUrl}`);
      // Notify user, update database, etc.
      notifyUser(buildId, data.previewUrl);
      break;
    case 'task_failed':
    case 'deploy_failed':
      console.error(`❌ Failed: ${data.error}`);
      // Handle failure, notify user, retry, etc.
      handleBuildFailure(buildId, data.error);
      break;
  }
  
  res.status(200).send('OK');
});

async function notifyUser(buildId, previewUrl) {
  // Your notification logic here
  console.log(`Sending notification for build ${buildId}: ${previewUrl}`);
}

async function handleBuildFailure(buildId, error) {
  // Your error handling logic here
  console.error(`Handling failure for build ${buildId}: ${error}`);
}
```

#### Webhook Monitoring

Check webhook delivery status:

```javascript
async function checkWebhookStatus() {
  const response = await axios.get(`${API_URL}/api/webhooks/status`);
  const { enabled, webhookUrl, stats } = response.data;
  
  console.log('Webhook Status:', {
    enabled,
    url: webhookUrl,
    failures: stats.totalFailures,
    pendingRetries: stats.pendingRetries,
    eventsLast24h: stats.eventsLast24h
  });
  
  if (stats.totalFailures > 0) {
    console.warn('⚠️  Some webhooks failed - check your endpoint!');
  }
}
```

## Common Use Cases

### 1. Progressive App Building

```javascript
// Initial build
let version = await buildProject('user123', 'my-app', 'Create a React todo app');

// Add features incrementally
version = await buildProject(
  'user123', 
  'my-app', 
  'Add a delete button to todo items',
  version.versionId // Parent version for incremental build
);
```

### 2. Version Management

```javascript
// List all versions
const versions = await axios.get(`${API_URL}/versions/user123/my-app`);

// Compare versions
const diff = await axios.get(
  `${API_URL}/versions/${oldVersion}/diff/${newVersion}?mode=stats`
);

// Rollback to previous version
const rollback = await axios.post(`${API_URL}/versions/rollback`, {
  userId: 'user123',
  projectId: 'my-app',
  targetVersionId: oldVersion
}, {
  headers: { 'x-sheen-signature': createSignature(...) }
});
```

### 3. Health Monitoring

```javascript
async function checkHealth() {
  const health = await axios.get(`${API_URL}/myhealthz`);
  const executor = await axios.get(`${API_URL}/claude-executor/health`);
  
  return {
    api: health.data.status === 'healthy',
    claude: executor.data.status === 'healthy',
    metrics: executor.data.metrics
  };
}

// Monitor health
setInterval(async () => {
  const status = await checkHealth();
  if (!status.api || !status.claude) {
    console.error('Service unhealthy:', status);
    // Alert your monitoring system
  }
}, 60000); // Check every minute
```

## Troubleshooting

### Common Issues

1. **Invalid Signature (401)**
   - Ensure payload is stringified before signing
   - Check that shared secret matches
   - Verify header name is `x-sheen-signature`

2. **Rate Limit (429)**
   - Implement exponential backoff
   - Check rate limit in health endpoint
   - Consider caching responses

3. **Build Failures**
   - Check error message in response
   - Verify project directory exists
   - Ensure valid framework detection

4. **Timeout Issues**
   - Long builds may timeout
   - Use webhook for completion notification
   - Check build status periodically

## Support

For issues or questions:
1. Check the [API Reference](./API_REFERENCE.md)
2. Review error messages and status codes
3. Monitor the health endpoints
4. Check rate limit status