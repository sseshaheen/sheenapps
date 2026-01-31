#!/usr/bin/env bash

# Debug: show which credential var is present
if [ -n "${CLAUDE_CREDENTIALS_B64:-}" ]; then
  echo "→ Using CLAUDE_CREDENTIALS_B64 (base64 encoded)"
elif [ -n "${CLAUDE_CREDENTIALS_JSON:-}" ]; then
  echo "→ Using CLAUDE_CREDENTIALS_JSON (raw JSON)"
else
  echo "✖ No CLAUDE_CREDENTIALS_B64 or CLAUDE_CREDENTIALS_JSON provided" >&2
  exit 1
fi

echo "→ env contains: $(env | grep CLAUDE_CRED)"

set -euo pipefail

# Debug: print Railway’s URL env vars
echo "→ RAILWAY_SERVICE_URL = ${RAILWAY_SERVICE_URL:-<not set>}"
echo "→ RAILWAY_STATIC_URL  = ${RAILWAY_STATIC_URL:-<not set>}"

# Write the device credential into the path the CLI reads
CONFIG_DIR="$HOME/.config/claude-code"
mkdir -p "$CONFIG_DIR"

if [ -n "${CLAUDE_CREDENTIALS_B64:-}" ]; then
  echo "$CLAUDE_CREDENTIALS_B64" | base64 -d > "$CONFIG_DIR/auth.json"
else
  echo "$CLAUDE_CREDENTIALS_JSON" > "$CONFIG_DIR/auth.json"
fi
chmod 600 "$CONFIG_DIR/auth.json"
echo "→ Wrote credential to $CONFIG_DIR/auth.json"

# Hand off to Fastify server
exec node dist/server.js
