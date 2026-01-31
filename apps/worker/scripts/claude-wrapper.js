#!/usr/bin/env node
/**
 * Claude CLI Wrapper
 * 
 * This wrapper script provides a consistent way to execute Claude CLI
 * from BullMQ worker processes, which have restricted environments.
 * It resolves the Claude binary location at runtime and handles PATH issues.
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Try multiple Claude locations in order of preference
const claudePaths = [
  '/opt/homebrew/bin/claude',                    // macOS Homebrew (most common)
  '/usr/local/bin/claude',                       // Linux/alternative install
  path.join(process.env.HOME || '', '.npm/bin/claude'), // npm global install
  '/usr/bin/claude'                              // System-wide install
];

function findClaude() {
  // Method 1: Use 'command -v' to find Claude in PATH
  try {
    const claudePath = execSync('command -v claude', { 
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'] // Suppress stderr
    }).trim();
    
    if (claudePath && fs.existsSync(claudePath)) {
      return claudePath;
    }
  } catch (error) {
    // command -v failed, try known paths
  }
  
  // Method 2: Check known paths directly
  for (const claudePath of claudePaths) {
    try {
      // Check if file exists and is executable
      fs.accessSync(claudePath, fs.constants.X_OK);
      return claudePath;
    } catch (error) {
      // Path doesn't exist or isn't executable, continue
    }
  }
  
  // Method 3: Last resort - try 'which' command
  try {
    const claudePath = execSync('which claude', { 
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    
    if (claudePath && fs.existsSync(claudePath)) {
      return claudePath;
    }
  } catch (error) {
    // which also failed
  }
  
  throw new Error(
    'Claude CLI not found. Please install it with:\n' +
    '  npm install -g @anthropic-ai/claude-code\n' +
    'Or ensure it\'s in your PATH'
  );
}

// Find Claude binary once at startup
let CLAUDE_BIN;
try {
  CLAUDE_BIN = findClaude();
  if (process.env.DEBUG_CLAUDE_WRAPPER) {
    console.error(`[claude-wrapper] Found Claude at: ${CLAUDE_BIN}`);
  }
} catch (error) {
  console.error(`[claude-wrapper] Error: ${error.message}`);
  process.exit(1);
}

// Get command line arguments (everything after 'node claude-wrapper.js')
const args = process.argv.slice(2);

// CRITICAL SAFETY CHECK: Ensure we're not in the worker app directory
const currentDir = process.cwd();
const workerIndicators = ['src/workers', 'bullmq', 'claudeCLIProvider.ts'];
let indicatorCount = 0;

for (const indicator of workerIndicators) {
  if (fs.existsSync(path.join(currentDir, indicator))) {
    indicatorCount++;
  }
}

if (indicatorCount >= 2) {
  console.error(`[claude-wrapper] CRITICAL: Attempting to run Claude in worker app directory!`);
  console.error(`[claude-wrapper] Current directory: ${currentDir}`);
  console.error(`[claude-wrapper] This would create files in the wrong location.`);
  process.exit(1);
}

// Additional check: ensure we're in a project directory
if (!currentDir.includes('/projects/')) {
  console.error(`[claude-wrapper] WARNING: Not in a project directory: ${currentDir}`);
  console.error(`[claude-wrapper] Expected path to contain '/projects/'`);
}

// Spawn Claude with the provided arguments
const proc = spawn(CLAUDE_BIN, args, {
  stdio: 'inherit', // Inherit stdin, stdout, stderr from parent
  cwd: process.cwd(), // Inherit the current working directory from parent
  env: {
    ...process.env,
    // Ensure PATH includes common binary locations
    PATH: [
      '/opt/homebrew/bin',
      '/usr/local/bin',
      '/usr/bin',
      '/bin',
      process.env.PATH
    ].filter(Boolean).join(':')
  }
});

// Handle spawn errors
proc.on('error', (err) => {
  console.error(`[claude-wrapper] Failed to start Claude: ${err.message}`);
  console.error(`[claude-wrapper] Attempted to run: ${CLAUDE_BIN}`);
  process.exit(1);
});

// Pass through the exit code
proc.on('exit', (code, signal) => {
  if (signal) {
    console.error(`[claude-wrapper] Claude terminated by signal: ${signal}`);
    process.exit(1);
  }
  process.exit(code || 0);
});