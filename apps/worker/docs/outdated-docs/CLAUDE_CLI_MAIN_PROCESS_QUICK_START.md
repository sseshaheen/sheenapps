# Claude CLI Main Process Implementation - Quick Start Guide

## Overview
This guide provides the minimal implementation needed to get Claude CLI working with the modular architecture by executing it in the main process.

## Step 1: Create the Service (10 minutes)

Create `/src/services/claudeCLIMainProcess.ts`:

```typescript
import { spawn } from 'child_process';
import * as path from 'path';
import Redis from 'ioredis';
import { ulid } from 'ulid';

class ClaudeCLIMainProcessService {
  private subRedis: Redis;
  private pubRedis: Redis;
  
  async initialize() {
    // Setup Redis connections
    this.subRedis = new Redis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379'),
    });
    
    this.pubRedis = new Redis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379'),
    });
    
    // Subscribe to requests
    await this.subRedis.subscribe('claude:cli:requests');
    
    this.subRedis.on('message', async (channel, message) => {
      if (channel === 'claude:cli:requests') {
        const request = JSON.parse(message);
        await this.handleRequest(request);
      }
    });
    
    console.log('✅ Claude CLI main process service initialized');
  }
  
  private async handleRequest(request: any) {
    try {
      const result = await this.executeClaudeCLI(
        request.prompt,
        request.args,
        request.cwd
      );
      
      await this.pubRedis.publish('claude:cli:responses', JSON.stringify({
        id: request.id,
        success: true,
        result
      }));
    } catch (error: any) {
      await this.pubRedis.publish('claude:cli:responses', JSON.stringify({
        id: request.id,
        success: false,
        error: error.message
      }));
    }
  }
  
  private executeClaudeCLI(prompt: string, args: string[], cwd?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const wrapperPath = path.join(process.cwd(), 'scripts', 'claude-wrapper.js');
      
      const proc = spawn('node', [wrapperPath, ...args], {
        cwd: cwd || process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe'],
        env: process.env
      });
      
      let stdout = '';
      let stderr = '';
      
      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      
      proc.on('error', (err) => {
        reject(new Error(`Failed to spawn Claude: ${err.message}`));
      });
      
      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Claude CLI exited with code ${code}: ${stderr}`));
          return;
        }
        resolve(stdout);
      });
      
      proc.stdin.write(prompt);
      proc.stdin.end();
    });
  }
  
  // For providers to call
  async request(prompt: string, args: string[], cwd?: string): Promise<string> {
    const requestId = ulid();
    const responseRedis = new Redis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379'),
    });
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        responseRedis.unsubscribe();
        responseRedis.disconnect();
        reject(new Error('Claude CLI request timeout'));
      }, 60000);
      
      responseRedis.subscribe('claude:cli:responses', async (err) => {
        if (err) {
          clearTimeout(timeout);
          reject(err);
          return;
        }
        
        responseRedis.on('message', (channel, message) => {
          const response = JSON.parse(message);
          if (response.id === requestId) {
            clearTimeout(timeout);
            responseRedis.unsubscribe();
            responseRedis.disconnect();
            
            if (response.success) {
              resolve(response.result);
            } else {
              reject(new Error(response.error));
            }
          }
        });
        
        // Publish request
        await this.pubRedis.publish('claude:cli:requests', JSON.stringify({
          id: requestId,
          prompt,
          args,
          cwd
        }));
      });
    });
  }
  
  async shutdown() {
    await this.subRedis.unsubscribe();
    this.subRedis.disconnect();
    this.pubRedis.disconnect();
  }
}

export const claudeCLIMainProcess = new ClaudeCLIMainProcessService();
```

## Step 2: Update Server.ts (5 minutes)

Add to `/src/server.ts` in the `startServer` function:

```typescript
import { claudeCLIMainProcess } from './services/claudeCLIMainProcess';

async function startServer() {
  try {
    // ... existing code ...
    
    // Initialize Claude CLI in main process for modular mode
    if (process.env.ARCH_MODE === 'modular') {
      await claudeCLIMainProcess.initialize();
      console.log('✅ Claude CLI main process handler started');
    }
    
    // ... rest of server startup ...
  } catch (err) {
    console.error('Failed to start:', err);
    process.exit(1);
  }
}

// Add to shutdown handler
const shutdownHandler = async () => {
  console.log('Shutting down gracefully...');
  
  // ... existing shutdown code ...
  
  if (process.env.ARCH_MODE === 'modular') {
    await claudeCLIMainProcess.shutdown();
  }
  
  await app.close();
  process.exit(0);
};
```

## Step 3: Update Claude CLI Provider (5 minutes)

Replace the `runClaudeCLI` method in `/src/providers/claudeCLIProvider.ts`:

```typescript
import { claudeCLIMainProcess } from '../services/claudeCLIMainProcess';

export class ClaudeCLIProvider implements AIProvider {
  private async runClaudeCLI(prompt: string, cwd?: string): Promise<string> {
    const args = ["-p", "--print", "--output-format", "json", "--dangerously-skip-permissions"];
    
    console.log(`[Claude CLI] Requesting execution via main process`);
    
    try {
      const result = await claudeCLIMainProcess.request(prompt, args, cwd);
      console.log(`[Claude CLI] Received response from main process`);
      return result;
    } catch (error: any) {
      console.error(`[Claude CLI] Main process error:`, error.message);
      throw error;
    }
  }
  
  // ... rest of the implementation stays the same ...
}
```

## Step 4: Test the Implementation (5 minutes)

1. **Rebuild the project**:
   ```bash
   npm run build
   ```

2. **Start the server with modular mode**:
   ```bash
   ARCH_MODE=modular npm start
   ```

3. **In another terminal, trigger a build**:
   ```bash
   # Use your existing test script
   ./scripts/test-modular.sh
   ```

4. **Watch the logs** for:
   - "✅ Claude CLI main process handler started"
   - "[Claude CLI] Requesting execution via main process"
   - "[Claude CLI] Received response from main process"

## Debugging Tips

### Check Redis Communication
```bash
# Monitor Redis messages
redis-cli MONITOR

# Or subscribe to specific channels
redis-cli SUBSCRIBE "claude:cli:*"
```

### Add Debug Logging
Set `DEBUG=claude:*` environment variable for detailed logs:
```bash
DEBUG=claude:* ARCH_MODE=modular npm start
```

### Common Issues

1. **"Claude CLI request timeout"**
   - Check if Claude CLI is installed: `which claude`
   - Check if wrapper script exists: `ls scripts/claude-wrapper.js`
   - Check Redis connection

2. **"Failed to spawn Claude"**
   - Verify Claude CLI works: `claude --version`
   - Check PATH in main process
   - Try absolute path in wrapper script

3. **Redis connection errors**
   - Ensure Redis is running: `redis-cli ping`
   - Check Redis host/port configuration

## Performance Considerations

- **Latency**: Adds ~10-20ms for Redis round-trip
- **Concurrency**: Main process handles requests sequentially
- **Memory**: Minimal overhead (~10MB for Redis connections)

## Next Steps

1. **Monitor Performance**: Watch for bottlenecks under load
2. **Add Metrics**: Track request count, latency, errors
3. **Consider Queuing**: If high volume, add request queuing
4. **Plan Migration**: To HTTP service for production scale

## Quick Rollback

If issues arise, simply set `ARCH_MODE=monolith` to revert to the old system without any code changes.