# Progress Tracking API

## Overview

The modular Claude Worker now provides real-time progress tracking for all builds through two simple REST endpoints. This allows the main app to monitor build progress without polling the database directly.

## Quick Start

1. Start a build using existing endpoints (no changes needed)
2. Use `jobId` from response as `buildId` for progress tracking
3. Poll progress using the endpoints below

## Endpoints

### GET /api/builds/:buildId/events

Get build progress events with incremental polling support.

**Parameters:**
- `buildId` (path): The job ID returned from build endpoints
- `lastEventId` (query): Optional. Only return events after this ID

**Example Request:**
```bash
GET /api/builds/27/events?lastEventId=5
```

**Example Response:**
```json
{
  "buildId": "27",
  "events": [
    {
      "id": 6,
      "type": "task_completed",
      "data": {
        "taskName": "Create HTML Test Page",
        "filesCreated": 1
      },
      "timestamp": "2025-07-22T07:14:36.224Z"
    }
  ],
  "lastEventId": 6
}
```

### GET /api/builds/:buildId/status

Get aggregated build status and progress percentage.

**Parameters:**
- `buildId` (path): The job ID returned from build endpoints

**Example Request:**
```bash
GET /api/builds/27/status
```

**Example Response:**
```json
{
  "buildId": "27",
  "status": "completed",
  "progress": 100,
  "previewUrl": "https://e05f45e2.sheenapps-preview.pages.dev",
  "error": null,
  "eventCount": 12,
  "lastUpdate": "2025-07-22T07:15:20.107Z"
}
```

## Event Types

### Planning Phase
- `plan_started`: Build planning has begun
- `plan_generated`: Plan created with task breakdown

### Execution Phase  
- `task_started`: Individual task execution started
- `task_completed`: Task finished successfully
- `task_failed`: Task failed with error details

### Deployment Phase
- `deploy_started`: Deployment process initiated
- `build_started`: Building application assets
- `deploy_progress`: Uploading to Cloudflare Pages
- `deploy_completed`: Deployment successful with preview URL
- `deploy_failed`: Deployment failed with error details

## Status Values

- `unknown`: No events yet (shouldn't happen)
- `planning`: Generating implementation plan
- `executing`: Running tasks to create files
- `deploying`: Building and deploying to Cloudflare Pages  
- `completed`: Build successful with preview URL
- `failed`: Build failed at any stage

## Progress Calculation

Progress is calculated based on events received:

- 0-10%: Initial planning
- 10-70%: Task execution (incremental per task)
- 70-80%: Deployment preparation
- 80-100%: Cloudflare deployment
- 100%: Complete with preview URL

## Integration Examples

### JavaScript Polling Client

```javascript
class BuildProgress {
  constructor(buildId) {
    this.buildId = buildId;
    this.lastEventId = 0;
    this.events = [];
  }

  async pollEvents() {
    const response = await fetch(
      `/api/builds/${this.buildId}/events?lastEventId=${this.lastEventId}`
    );
    const data = await response.json();
    
    this.events.push(...data.events);
    this.lastEventId = data.lastEventId;
    
    return data.events;
  }

  async getStatus() {
    const response = await fetch(`/api/builds/${this.buildId}/status`);
    return response.json();
  }

  startPolling(callback) {
    const poll = async () => {
      try {
        const newEvents = await this.pollEvents();
        if (newEvents.length > 0) {
          callback(newEvents);
        }
        
        const status = await this.getStatus();
        if (status.status === 'completed' || status.status === 'failed') {
          return; // Stop polling
        }
        
        setTimeout(poll, 2000); // Poll every 2 seconds
      } catch (error) {
        console.error('Polling error:', error);
        setTimeout(poll, 5000); // Retry in 5 seconds
      }
    };
    
    poll();
  }
}

// Usage
const progress = new BuildProgress('27');
progress.startPolling((events) => {
  events.forEach(event => {
    console.log(`${event.type}: ${event.data.message}`);
    if (event.type === 'deploy_completed') {
      console.log(`Preview: ${event.data.previewUrl}`);
    }
  });
});
```

### React Hook Example

```javascript
import { useState, useEffect } from 'react';

export function useBuildProgress(buildId) {
  const [status, setStatus] = useState(null);
  const [events, setEvents] = useState([]);
  const [lastEventId, setLastEventId] = useState(0);

  useEffect(() => {
    if (!buildId) return;

    const pollEvents = async () => {
      try {
        const response = await fetch(
          `/api/builds/${buildId}/events?lastEventId=${lastEventId}`
        );
        const data = await response.json();
        
        if (data.events.length > 0) {
          setEvents(prev => [...prev, ...data.events]);
          setLastEventId(data.lastEventId);
        }
        
        const statusResponse = await fetch(`/api/builds/${buildId}/status`);
        const statusData = await statusResponse.json();
        setStatus(statusData);
        
        if (statusData.status !== 'completed' && statusData.status !== 'failed') {
          setTimeout(pollEvents, 2000);
        }
      } catch (error) {
        console.error('Error polling build progress:', error);
        setTimeout(pollEvents, 5000);
      }
    };

    pollEvents();
  }, [buildId, lastEventId]);

  return { status, events };
}
```

## Performance Notes

- Event polling is efficient using incremental `lastEventId` 
- Typical build generates 8-15 events over 60-120 seconds
- Each event is <1KB, minimal bandwidth usage
- No authentication required (builds are public anyway)
- Database queries are optimized with composite indexes

## Error Handling

- Endpoints return empty arrays on database errors (non-blocking)
- Invalid `buildId` returns empty event list
- Network failures should retry with exponential backoff
- Events continue to be stored even if API calls fail

## Testing

Use the provided test scripts:
- `test-progress-simple.sh`: Basic functionality test
- `test-progress-flow.sh`: Full end-to-end monitoring

Both scripts are in the project root and can be run directly.

## Next Phase: Webhooks

Phase 2 will add webhook delivery for real-time push notifications:
- HMAC-signed webhook payloads
- Automatic retry with exponential backoff  
- Webhook failure tracking and recovery

Let the team know if you need webhook delivery sooner than planned!