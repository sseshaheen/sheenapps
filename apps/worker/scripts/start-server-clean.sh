#!/bin/bash
# Start server in a clean environment without Claude Code env vars

cd /Users/sh/Sites/sheenapps-claude-worker

# Unset Claude Code environment variables
unset CLAUDE_CODE_ENTRYPOINT
unset CLAUDECODE

# Clean any hanging jobs first
node clean-all-jobs.js

echo "Starting server in stream mode..."
echo "Working directory: $(pwd)"
echo "ARCH_MODE: stream"
echo ""

# Start the server
npm start