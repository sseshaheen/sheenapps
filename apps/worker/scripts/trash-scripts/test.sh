#!/usr/bin/env bash
set -eo pipefail

# ► Production host (has CLAUDE_CREDENTIALS_JSON)
WORKER_HOST="sheenapps-claude-worker.up.railway.app"
SHARED_SECRET="nKl7jN4rMPqkEXFGDQAwTHzS8Qlm7+k0zE3z9BfB9XM="

PROMPT='{"prompt":"One-line haiku about the ocean"}'
SIGNATURE=$(printf '%s' "$PROMPT" \
            | openssl dgst -sha256 -hmac "$SHARED_SECRET" \
            | awk '{print $2}')

# Use -i to show status + headers, and --fail to error on HTTP>=400
curl -i --fail -X POST "https://${WORKER_HOST}/generate" \
     -H "Content-Type: application/json" \
     -H "x-sheen-signature: $SIGNATURE" \
     -d "$PROMPT"
