# Claude Code Authentication Setup

Since Claude Code CLI requires interactive authentication on first use, you'll need to complete a one-time manual setup before deploying the worker.

## Option 1: Using API Key Only (Recommended)

If the Claude Code CLI supports direct API key authentication:

1. Set your API key in the `.env` file:
   ```
   CLAUDE_API_KEY=sk-ant-api...
   ```

2. The worker will automatically set this as `ANTHROPIC_API_KEY` when spawning the Claude process.

## Option 2: Manual Authentication (If API Key Doesn't Work)

If the CLI requires interactive login despite having an API key:

### Step 1: Build the Docker Image
```bash
docker build -t claude-worker .
```

### Step 2: Run Container Interactively
```bash
# Create a temporary .env file with your keys
cp .env.example .env
# Edit .env with your SHARED_SECRET and CLAUDE_API_KEY

# Run container with interactive shell
docker run -it --env-file .env claude-worker /bin/bash
```

### Step 3: Authenticate Inside Container
```bash
# Inside the container, run claude and complete authentication
claude
# Follow the prompts to log in via Anthropic Console or Claude.ai
```

### Step 4: Extract Authentication Files
```bash
# From another terminal, find your container ID
docker ps

# Copy the auth directory
docker cp <container-id>:/home/appuser/.claude ./claude-auth
```

### Step 5: Include Auth Files in Build
1. Place the `claude-auth` directory in your project root
2. The Dockerfile will automatically copy these files during build
3. Add `claude-auth/` to `.gitignore` to avoid committing credentials

### Step 6: Deploy
Now you can deploy the Docker image with pre-configured authentication.

## Testing Authentication

To verify authentication is working:

```bash
# Test locally
docker run --env-file .env claude-worker

# Test the /generate endpoint
curl -X POST http://localhost:3000/generate \
     -H "Content-Type: application/json" \
     -H "x-sheen-signature: $(echo -n '{"prompt":"hello"}' | \
                                openssl dgst -sha256 -hmac "$SHARED_SECRET" | \
                                cut -d" " -f2)" \
     -d '{"prompt":"Write a hello world in Python"}'
```

## Important Notes

- The authentication files contain sensitive credentials - never commit them to git
- Authentication may expire after some time and need to be refreshed
- Consider setting up monitoring to alert when authentication fails
- The `-p` flag is used for non-interactive execution once authenticated