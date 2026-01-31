# Bubblewrap Security Integration Plan

## Overview

This document outlines the plan to integrate Bubblewrap (bwrap) sandboxing for Claude CLI execution in the sheenapps-claude-worker project. The goal is to enhance security by sandboxing Claude CLI processes within the target project folder only.

## Current Architecture Analysis

### Current Claude CLI Execution Points

1. **Primary Execution Path**: `claudeCLIMainProcess.ts` → `claude-wrapper.js` → `claude` binary
2. **Stream Execution**: `ClaudeStreamProcess` in `src/stream/claudeProcess.ts`
3. **Error Handlers**: Various error classification and recovery services
4. **Executor Pattern**: `RedisClaudeExecutor` → `claudeCLIMainProcess` → wrapper

### Current Security Measures

- ✅ Path validation via `PathGuard.validateProjectPath()`
- ✅ Working directory enforcement
- ✅ Environment variable sanitization
- ✅ Rate limiting and circuit breaker patterns
- ❌ No process sandboxing (current gap)

## Proposed Integration Architecture

### 1. Project Structure Changes

```
src/
├── security/
│   ├── sandbox/
│   │   ├── bwrapExecutor.ts      # Bubblewrap process spawning
│   │   ├── sandboxSupervisor.ts  # Process pooling per project
│   │   ├── seccompProfile.ts     # Syscall filtering management
│   │   └── platformDetector.ts   # Linux/macOS detection
│   ├── config/
│   │   ├── seccomp.json         # Minimal syscall allowlist
│   │   └── bwrap-config.json    # Sandbox configuration
│   └── index.ts                 # Security module exports
```

### 2. Implementation Components

#### A. Seccomp Profile Generation

**File**: `src/security/config/seccomp.json`

**Generation Process**:
1. Run `strace -cf claude --dangerously-skip-permissions` in test environment
2. Extract minimal required syscalls
3. Create allowlist-based seccomp profile

**Minimal Profile Structure** (~40 syscalls instead of 300+):
```json
{
  "defaultAction": "SCMP_ACT_ERRNO",
  "archMap": [
    {
      "architecture": "SCMP_ARCH_X86_64",
      "subArchitectures": ["SCMP_ARCH_X86", "SCMP_ARCH_X32"]
    }
  ],
  "syscalls": [
    {
      "names": [
        "openat", "read", "write", "close", "stat", "fstat",
        "mmap", "munmap", "mprotect", "brk",
        "execve", "exit", "exit_group", "wait4",
        "futex", "clock_gettime", "gettimeofday", "nanosleep",
        "getpid", "getuid", "getgid", "geteuid", "getegid",
        "rt_sigaction", "rt_sigprocmask", "rt_sigreturn",
        "ioctl", "fcntl", "flock", "fsync",
        "getcwd", "chdir", "access", "faccessat",
        "mkdir", "rmdir", "unlink", "rename",
        "pipe", "pipe2", "dup", "dup2", "dup3",
        "socket", "connect", "sendto", "recvfrom", "shutdown",
        "poll", "select", "epoll_create1", "epoll_wait", "epoll_ctl"
      ],
      "action": "SCMP_ACT_ALLOW"
    }
  ]
}
```

#### B. Bubblewrap Executor

**File**: `src/security/sandbox/bwrapExecutor.ts`

```typescript
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';
import { PathGuard } from '../../services/pathGuard';

interface BwrapConfig {
  projectPath: string;
  allowNetworking: boolean;
  readOnlyPaths: string[];
  readWritePaths: string[];
  environmentVars: Record<string, string>;
}

export class BwrapExecutor {
  private static readonly SECCOMP_PATH = path.resolve(__dirname, '../config/seccomp.json');
  private static readonly BWRAP_BINARY = 'bwrap';

  async spawnSandboxedClaude(
    args: string[],
    config: BwrapConfig
  ): Promise<ChildProcess> {
    // Validate project path
    PathGuard.validateProjectPath(config.projectPath);

    // Ensure seccomp profile exists
    await this.ensureSeccompProfile();

    // Build bwrap arguments
    const bwrapArgs = await this.buildBwrapArgs(config);

    // Platform-specific execution
    if (os.platform() === 'darwin') {
      return this.spawnOnMacOS(bwrapArgs, args, config);
    } else {
      return this.spawnOnLinux(bwrapArgs, args, config);
    }
  }

  private async buildBwrapArgs(config: BwrapConfig): Promise<string[]> {
    const args = [
      '--die-with-parent',
      '--unshare-all',
      '--share-net', // Allow networking for Claude API calls

      // Essential system paths (read-only)
      '--ro-bind', '/usr', '/usr',
      '--ro-bind', '/bin', '/bin',
      '--ro-bind', '/lib', '/lib',
      '--ro-bind', '/lib64', '/lib64',
      '--ro-bind', '/etc/resolv.conf', '/etc/resolv.conf',
      '--ro-bind', '/etc/ssl', '/etc/ssl',

      // Project workspace (read-write, but restricted to project path)
      '--bind', config.projectPath, '/workspace',
      '--chdir', '/workspace',

      // DNS resolution files
      '--ro-bind', '/etc/hosts', '/etc/hosts',
      '--ro-bind', '/etc/nsswitch.conf', '/etc/nsswitch.conf',

      // Minimal proc and dev
      '--proc', '/proc',
      '--dev', '/dev',

      // Temporary directory (isolated)
      '--tmpfs', '/tmp',

      // Seccomp filtering
      '--seccomp', BwrapExecutor.SECCOMP_PATH,

      // Environment variables
      ...this.buildEnvArgs(config.environmentVars),

      // Command to execute
      '--'
    ];

    return args;
  }

  private buildEnvArgs(envVars: Record<string, string>): string[] {
    const args: string[] = [];

    // Essential environment variables
    const essentialVars = {
      'PATH': '/usr/bin:/bin:/usr/local/bin',
      'HOME': '/tmp/claude-home',
      'TMPDIR': '/tmp',
      ...envVars
    };

    for (const [key, value] of Object.entries(essentialVars)) {
      args.push('--setenv', key, value);
    }

    return args;
  }

  private async spawnOnLinux(
    bwrapArgs: string[],
    claudeArgs: string[],
    config: BwrapConfig
  ): Promise<ChildProcess> {
    const claudeBinary = await this.findClaudeBinary();

    return spawn(BwrapExecutor.BWRAP_BINARY, [
      ...bwrapArgs,
      claudeBinary,
      '--dangerously-skip-permissions',
      ...claudeArgs
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: config.projectPath
    });
  }

  private async spawnOnMacOS(
    bwrapArgs: string[],
    claudeArgs: string[],
    config: BwrapConfig
  ): Promise<ChildProcess> {
    // For macOS, we'd need to use Docker or VM-based sandboxing
    // This is a simplified approach - in production, consider Docker
    console.warn('[BwrapExecutor] macOS detected - sandbox features limited');

    const claudeBinary = await this.findClaudeBinary();

    // Fallback to basic spawn with limited environment
    return spawn(claudeBinary, [
      '--dangerously-skip-permissions',
      ...claudeArgs
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: config.projectPath,
      env: {
        PATH: '/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin',
        HOME: config.projectPath // Restrict HOME to project directory
      }
    });
  }

  private async findClaudeBinary(): Promise<string> {
    const possiblePaths = [
      '/opt/homebrew/bin/claude',
      '/usr/local/bin/claude',
      '/usr/bin/claude'
    ];

    for (const claudePath of possiblePaths) {
      try {
        await fs.access(claudePath, fs.constants.X_OK);
        return claudePath;
      } catch {
        continue;
      }
    }

    throw new Error('Claude binary not found in expected locations');
  }

  private async ensureSeccompProfile(): Promise<void> {
    try {
      await fs.access(BwrapExecutor.SECCOMP_PATH);
    } catch {
      throw new Error(`Seccomp profile not found at ${BwrapExecutor.SECCOMP_PATH}`);
    }
  }
}
```

#### C. Sandbox Supervisor

**File**: `src/security/sandbox/sandboxSupervisor.ts`

```typescript
import { EventEmitter } from 'events';
import { ChildProcess } from 'child_process';
import { BwrapExecutor } from './bwrapExecutor';

interface SupervisorProcess {
  process: ChildProcess;
  projectPath: string;
  lastUsed: Date;
  isIdle: boolean;
}

export class SandboxSupervisor extends EventEmitter {
  private processes = new Map<string, SupervisorProcess>();
  private executor = new BwrapExecutor();
  private readonly IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes
  private cleanupInterval?: NodeJS.Timeout;

  constructor() {
    super();
    this.startCleanupInterval();
  }

  async getOrCreateProcess(projectId: string, projectPath: string): Promise<ChildProcess> {
    let supervisorProcess = this.processes.get(projectId);

    if (!supervisorProcess || supervisorProcess.process.killed) {
      supervisorProcess = await this.createNewProcess(projectId, projectPath);
      this.processes.set(projectId, supervisorProcess);
    }

    supervisorProcess.lastUsed = new Date();
    supervisorProcess.isIdle = false;

    return supervisorProcess.process;
  }

  private async createNewProcess(projectId: string, projectPath: string): Promise<SupervisorProcess> {
    console.log(`[SandboxSupervisor] Creating new sandboxed process for project: ${projectId}`);

    const config = {
      projectPath,
      allowNetworking: true,
      readOnlyPaths: ['/usr', '/bin', '/lib'],
      readWritePaths: [projectPath],
      environmentVars: {
        'CLAUDE_PROJECT_ID': projectId,
        'NODE_ENV': 'production'
      }
    };

    const process = await this.executor.spawnSandboxedClaude(
      ['--output-format', 'stream-json', '--verbose'],
      config
    );

    process.on('exit', (code) => {
      console.log(`[SandboxSupervisor] Process for ${projectId} exited with code ${code}`);
      this.processes.delete(projectId);
    });

    process.on('error', (error) => {
      console.error(`[SandboxSupervisor] Process error for ${projectId}:`, error);
      this.processes.delete(projectId);
    });

    return {
      process,
      projectPath,
      lastUsed: new Date(),
      isIdle: false
    };
  }

  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      const now = new Date();

      for (const [projectId, supervisorProcess] of this.processes.entries()) {
        const idleTime = now.getTime() - supervisorProcess.lastUsed.getTime();

        if (idleTime > this.IDLE_TIMEOUT) {
          console.log(`[SandboxSupervisor] Cleaning up idle process for ${projectId}`);
          supervisorProcess.process.kill('SIGTERM');
          this.processes.delete(projectId);
        }
      }
    }, 60000); // Check every minute
  }

  async shutdown(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    const shutdownPromises = Array.from(this.processes.values()).map(supervisorProcess => {
      return new Promise<void>((resolve) => {
        supervisorProcess.process.on('exit', () => resolve());
        supervisorProcess.process.kill('SIGTERM');

        // Force kill after 5 seconds
        setTimeout(() => {
          if (!supervisorProcess.process.killed) {
            supervisorProcess.process.kill('SIGKILL');
          }
          resolve();
        }, 5000);
      });
    });

    await Promise.all(shutdownPromises);
    this.processes.clear();
  }
}
```

### 3. Integration Points

#### A. Update `claudeCLIMainProcess.ts`

Replace the current `executeClaudeCLI` method:

```typescript
// Add import
import { SandboxSupervisor } from '../security/sandbox/sandboxSupervisor';

export class ClaudeCLIMainProcessService {
  private sandboxSupervisor = new SandboxSupervisor();

  private executeClaudeCLI(prompt: string, args: string[], cwd?: string): Promise<string> {
    return new Promise(async (resolve, reject) => {
      if (!cwd) {
        reject(new Error('No working directory provided for Claude CLI execution'));
        return;
      }

      try {
        // Validate path
        PathGuard.validateProjectPath(cwd);

        // Generate project ID from path
        const projectId = Buffer.from(cwd).toString('base64').slice(0, 16);

        // Get sandboxed process
        const process = await this.sandboxSupervisor.getOrCreateProcess(projectId, cwd);

        // Execute command in sandbox
        const fullArgs = ['-p', prompt, ...args];

        // Send command to sandboxed process
        process.stdin?.write(JSON.stringify({
          command: 'execute',
          args: fullArgs
        }) + '\n');

        let stdout = '';
        let stderr = '';

        const dataHandler = (data: Buffer) => {
          stdout += data.toString();
        };

        const errorHandler = (data: Buffer) => {
          stderr += data.toString();
        };

        process.stdout?.on('data', dataHandler);
        process.stderr?.on('data', errorHandler);

        // Set timeout
        const timeout = setTimeout(() => {
          process.stdout?.off('data', dataHandler);
          process.stderr?.off('data', errorHandler);
          reject(new Error('Claude CLI execution timeout'));
        }, 60000);

        // Listen for completion
        process.once('message', (result) => {
          clearTimeout(timeout);
          process.stdout?.off('data', dataHandler);
          process.stderr?.off('data', errorHandler);

          if (result.success) {
            resolve(stdout);
          } else {
            reject(new Error(result.error || stderr));
          }
        });

      } catch (error: any) {
        reject(error);
      }
    });
  }

  async shutdown(): Promise<void> {
    await this.sandboxSupervisor.shutdown();
    // ... existing shutdown code
  }
}
```

### 4. Testing Strategy

#### A. Security Tests

**File**: `src/security/__tests__/sandboxSecurity.test.ts`

```typescript
describe('Sandbox Security Tests', () => {
  test('should deny access to system files', async () => {
    // Test that sandboxed process cannot read /etc/passwd
  });

  test('should restrict file system access to project directory', async () => {
    // Test that process cannot access files outside project path
  });

  test('should enforce seccomp syscall filtering', async () => {
    // Test that dangerous syscalls are blocked
  });

  test('should isolate network access appropriately', async () => {
    // Test network restrictions work as expected
  });
});
```

#### B. Performance Tests

- Measure cold start vs pooled process latency
- Load testing with parallel requests
- Memory usage monitoring

### 5. Configuration

#### A. Environment Variables

```bash
# Enable sandbox mode
CLAUDE_SANDBOX_ENABLED=true

# Sandbox configuration
CLAUDE_SANDBOX_MODE=bwrap  # Options: bwrap, docker, none
CLAUDE_SECCOMP_PROFILE=/path/to/seccomp.json
CLAUDE_SANDBOX_TIMEOUT=300000  # 5 minutes
CLAUDE_SANDBOX_MAX_PROCESSES=10

# Platform-specific
CLAUDE_MACOS_SANDBOX_MODE=docker  # For macOS fallback
```

#### B. Configuration File

**File**: `src/security/config/bwrap-config.json`

```json
{
  "defaultConfig": {
    "allowNetworking": true,
    "timeoutMs": 300000,
    "maxProcesses": 50,
    "readOnlySystemPaths": [
      "/usr", "/bin", "/lib", "/lib64",
      "/etc/resolv.conf", "/etc/ssl"
    ],
    "blockedSyscalls": [
      "ptrace", "process_vm_readv", "process_vm_writev",
      "mount", "umount", "chroot", "pivot_root"
    ],
    "maxSandboxStartupMs": 3000
  },
  "profiles": {
    "development": {
      "strict": false,
      "allowPtrace": true
    },
    "production": {
      "strict": true,
      "allowPtrace": false
    }
  }
}
```

### 6. Migration Plan

#### Phase 1: Infrastructure Setup
1. Create security module structure
2. Generate seccomp profile via strace analysis
3. Implement BwrapExecutor with basic functionality
4. Add configuration management

#### Phase 2: Integration
1. Update claudeCLIMainProcess to use sandbox
2. Implement SandboxSupervisor with process pooling
3. Add environment detection (Linux/macOS)
4. Update existing tests

#### Phase 3: Validation & Optimization
1. Security testing and validation
2. Performance benchmarking
3. Error handling improvements
4. Documentation updates

#### Phase 4: Production Deployment
1. No need for feature flag or gradual rollout (product not launched yet)
2. Monitoring and alerting setup
3. Performance tuning
4. Full production deployment

### 7. Security Benefits

- **Process Isolation**: Claude CLI runs in isolated namespace
- **File System Restriction**: Access limited to project directory only
- **Syscall Filtering**: Dangerous system calls blocked via seccomp
- **Resource Limits**: Memory and CPU constraints enforced
- **Network Isolation**: Controlled network access for API calls only
- **Privilege Dropping**: Runs with minimal required privileges

### 8. Monitoring & Alerting

- Sandbox escape attempts detection
- Resource usage monitoring
- Performance metrics tracking
- Security violation logging
- Process lifecycle management
- Supervisor lifecycle events (created, reused, idle_killed)
- Cold start time tracking with maxSandboxStartupMs threshold

### 9. Feedback Incorporation

Based on review feedback, the following changes will be implemented:

#### Accepted Improvements

1. **Minimal Seccomp Profile**: Reduce syscall allowlist from 300+ to ~40 essential calls:
   ```json
   {
     "defaultAction": "SCMP_ACT_ERRNO",
     "syscalls": [
       {
         "names": [
           "openat", "read", "write", "close", "stat", "fstat",
           "mmap", "munmap", "mprotect", "brk",
           "execve", "exit", "exit_group", "wait4",
           "futex", "clock_gettime", "gettimeofday", "nanosleep",
           "getpid", "getuid", "getgid", "geteuid", "getegid",
           "rt_sigaction", "rt_sigprocmask", "rt_sigreturn",
           "ioctl", "fcntl", "flock", "fsync",
           "getcwd", "chdir", "access", "faccessat",
           "mkdir", "rmdir", "unlink", "rename",
           "pipe", "pipe2", "dup", "dup2", "dup3",
           "socket", "connect", "sendto", "recvfrom", "shutdown",
           "poll", "select", "epoll_create1", "epoll_wait", "epoll_ctl"
         ],
         "action": "SCMP_ACT_ALLOW"
       }
     ]
   }
   ```

2. **Use `--dev` Instead of Individual Device Bindings**: Simplify device setup in buildBwrapArgs:
   ```typescript
   // Replace individual device bindings with:
   '--dev', '/dev',
   ```

3. **Add DNS Resolution Files**: Include in buildBwrapArgs:
   ```typescript
   '--ro-bind', '/etc/hosts', '/etc/hosts',
   '--ro-bind', '/etc/nsswitch.conf', '/etc/nsswitch.conf',
   ```

4. **Multipass Integration for macOS**: Add proper VM-based sandboxing:
   ```typescript
   private async spawnOnMacOS(
     bwrapArgs: string[],
     claudeArgs: string[],
     config: BwrapConfig
   ): Promise<ChildProcess> {
     // Check if Multipass is available
     try {
       execSync('multipass --version', { stdio: 'ignore' });

       // Ensure VM exists and project is mounted
       await this.ensureMultipassVM(config.projectPath);

       return spawn('multipass', [
         'exec', 'claude-sandbox', '--',
         BwrapExecutor.BWRAP_BINARY,
         ...bwrapArgs,
         '/usr/bin/claude',
         '--dangerously-skip-permissions',
         ...claudeArgs
       ], {
         stdio: ['pipe', 'pipe', 'pipe'],
         cwd: config.projectPath
       });
     } catch {
       // Fallback to Docker or limited sandboxing
       console.warn('[BwrapExecutor] Multipass not available, using limited sandbox');
       return this.spawnWithDocker(bwrapArgs, claudeArgs, config);
     }
   }
   ```

5. **Enhanced Supervisor Metrics**: Add event emission in SandboxSupervisor:
   ```typescript
   private async createNewProcess(projectId: string, projectPath: string): Promise<SupervisorProcess> {
     const startTime = Date.now();

     // ... existing code ...

     const process = await this.executor.spawnSandboxedClaude(args, config);

     const startupTime = Date.now() - startTime;
     this.emit('supervisor:created', { projectId, startupTime });

     // Check against max startup time
     if (startupTime > (process.env.CLAUDE_MAX_SANDBOX_STARTUP_MS || 500)) {
       console.warn(`[SandboxSupervisor] Slow startup: ${startupTime}ms for ${projectId}`);
     }

     return supervisorProcess;
   }

   private startCleanupInterval(): void {
     // ... in cleanup logic ...
     this.emit('supervisor:idle_killed', { projectId, idleTime });
   }
   ```

6. **Negative Seccomp Test**: Add to security tests:
   ```typescript
   test('should block dangerous syscalls via seccomp', async () => {
     const testBinary = path.join(__dirname, 'fixtures', 'ptrace-test');
     const result = await runInSandbox([testBinary]);

     expect(result.exitCode).toBe(1);
     expect(result.stderr).toContain('Operation not permitted');
     expect(result.errno).toBe('EPERM');
   });
   ```

7. **Configuration Enhancements**: Update bwrap-config.json:
   ```json
   {
     "defaultConfig": {
       "maxSandboxStartupMs": 3000,
       // ... rest of config
     }
   }
   ```

#### Network Isolation Consideration

While the feedback suggests using `--unshare-net` with an HTTPS proxy, we'll keep `--share-net` for now because:
- Claude CLI needs direct API access to Anthropic's servers
- Setting up a proxy adds complexity without clear security benefit for our use case
- We can revisit this if specific network isolation requirements emerge

However, we'll make this configurable:
```typescript
if (config.allowNetworking) {
  args.push('--share-net');
} else {
  args.push('--unshare-net');
  // Future: Add proxy configuration here
}
```

### 10. Updated Implementation Checklist

1. **Seccomp Profile**
   - [ ] Run strace to capture Claude CLI syscalls
   - [ ] Trim to minimal ~40 syscalls
   - [ ] Test with negative cases (ptrace blocker)

2. **BwrapExecutor Updates**
   - [ ] Switch to `--dev` flag
   - [ ] Add DNS resolution files
   - [ ] Make network isolation configurable
   - [ ] Add startup time tracking

3. **Multipass Integration**
   - [ ] Implement ensureMultipassVM method
   - [ ] Add VM setup documentation
   - [ ] Test identical behavior between Linux/macOS

4. **Supervisor Enhancements**
   - [ ] Add metric events (created, reused, idle_killed)
   - [ ] Implement startup time threshold checking
   - [ ] Add grafana dashboards for supervisor metrics

5. **Testing**
   - [ ] Add negative seccomp test with ptrace
   - [ ] Add startup time regression tests
   - [ ] Validate Multipass behavior matches Linux

This comprehensive plan provides a secure, performant implementation of Bubblewrap sandboxing for Claude CLI execution while maintaining compatibility with the existing architecture.
