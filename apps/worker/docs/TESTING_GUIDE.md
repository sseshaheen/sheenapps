# Testing Guide for Claude Worker

This guide explains how to test the Claude Worker with various prompts and scenarios.

## Prerequisites

1. **Worker Running**
   ```bash
   npm run dev  # Development mode
   # or
   npm start    # Production mode
   ```

2. **Redis Running**
   ```bash
   redis-cli ping  # Should return PONG
   ```

3. **Environment Variables**
   - Ensure `.env` file is configured
   - `SHARED_SECRET` must match between client and server

## Test Scripts

### 1. TypeScript Test Script

The most flexible testing option with full control over parameters.

```bash
# Test with default SaaS template
npm run test:worker

# Test with custom prompt (simple, no quotes)
npm run test:worker --prompt "Create a portfolio website with dark mode"

# Test with prompt from file (handles quotes properly)
npm run test:worker --prompt-file my-prompt.txt

# Test with prompt from stdin using heredoc (RECOMMENDED for complex prompts)
npm run test:worker --prompt-file - <<'EOF'
Create a React app with:
- A header that says "Welcome to Our Site"
- A button labeled 'Click Me!'
- JSON config: {"theme": "dark", "title": "My \"App\""}
EOF

# Test with specific user/project
npm run test:worker --user myuser --project myproject

# Test rebuild functionality
npm run test:worker -e rebuild-preview -b VERSION_ID --prompt "Add contact form"

# Show help
npm run test:worker --help
```

### Handling Quotes and Special Characters

When your prompt contains quotes or special characters, use the `--prompt-file` option:

```bash
# Option 1: Save prompt to file
cat > prompt.txt << 'EOF'
Create a component with:
- Text that says "Hello 'World'"
- Button onClick={() => alert("Clicked!")}
- CSS: font-family: 'Arial', "Helvetica", sans-serif;
EOF
npm run test:worker --prompt-file prompt.txt

# Option 2: Use stdin with heredoc (recommended)
npm run test:worker --prompt-file - <<'EOF'
Your complex prompt with "quotes" and 'apostrophes' here
EOF

# Option 3: Pipe from echo (for simple cases)
echo 'Create a button that says "Click Me"' | npm run test:worker --prompt-file -
```

See `./scripts/examplePrompts.sh` for more examples.

### 2. Quick Bash Test

A simple script that runs through a complete test scenario.

```bash
./scripts/quickTest.sh
```

This script will:
1. Create a new project with a SaaS landing page
2. Wait for build completion
3. Retrieve the preview URL
4. List project versions
5. Test rebuild functionality

### 3. Manual cURL Testing

For direct API testing:

```bash
# Set variables
SHARED_SECRET="your-secret"
USER_ID="test-user-123"
PROJECT_ID="test-project-123"

# Create payload
PAYLOAD='{
  "userId": "'$USER_ID'",
  "projectId": "'$PROJECT_ID'",
  "prompt": "Create a blog with Next.js",
  "framework": "nextjs"
}'

# Generate signature
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SHARED_SECRET" | cut -d' ' -f2)

# Send request
curl -X POST http://localhost:3000/build-preview-for-new-project \
  -H "Content-Type: application/json" \
  -H "x-sheen-signature: $SIGNATURE" \
  -d "$PAYLOAD"
```

## Example Prompts

### 1. SaaS Landing Page (Default)
```
Create a minimal SaaS landing page with Hero section, 3 features, and pricing table. Use React + Vite + Tailwind CSS v4.
```

### 2. Portfolio Website
```
Build a developer portfolio with:
- Hero section with animated background
- Projects grid with filtering
- About section
- Contact form
- Dark mode toggle
Tech: React + Vite + Tailwind CSS v4
```

### 3. E-commerce Product Page
```
Create an e-commerce product page with:
- Image gallery with zoom
- Product details
- Size/color selectors
- Add to cart button
- Customer reviews section
Tech: React + Vite + Tailwind CSS v4
```

### 4. Blog Template
```
Design a modern blog with:
- Article list with pagination
- Individual article page
- Categories sidebar
- Search functionality
- Newsletter signup
Tech: Next.js + Tailwind CSS v4
```

## Testing Workflow

### Complete Test Cycle

1. **Initial Build**
   ```bash
   npm run test:worker --user testuser1 --project blog1
   ```

2. **Check Status**
   ```bash
   curl http://localhost:3000/preview/testuser1/blog1/latest
   ```

3. **List Versions**
   ```bash
   curl http://localhost:3000/versions/testuser1/blog1
   ```

4. **Make Changes**
   ```bash
   npm run test:worker -e rebuild-preview \
     --user testuser1 \
     --project blog1 \
     --prompt "Change header to dark theme"
   ```

5. **Compare Versions**
   ```bash
   curl http://localhost:3000/versions/VERSION1/diff/VERSION2?mode=stats
   ```

6. **Rollback if Needed**
   ```bash
   PAYLOAD='{"userId":"testuser1","projectId":"blog1","targetVersionId":"VERSION1"}'
   SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SHARED_SECRET" | cut -d' ' -f2)
   
   curl -X POST http://localhost:3000/versions/rollback \
     -H "Content-Type: application/json" \
     -H "x-sheen-signature: $SIGNATURE" \
     -d "$PAYLOAD"
   ```

## Monitoring Build Progress

### Check Worker Logs
The worker logs will show:
- Claude CLI execution
- Dependency installation progress
- Build status
- Deployment to Cloudflare Pages
- Git operations

### Check Queue Status
Monitor Redis for queue information:
```bash
redis-cli
> KEYS bull:builds:*
> LLEN bull:builds:wait
```

### Database Queries
If using PostgreSQL:
```sql
-- Check recent builds
SELECT * FROM project_versions 
ORDER BY created_at DESC 
LIMIT 10;

-- Check specific project
SELECT * FROM project_versions 
WHERE user_id = 'testuser1' 
AND project_id = 'blog1';
```

## Common Issues

### Build Fails
1. Check Claude CLI is authenticated
2. Verify pnpm is installed
3. Check disk space for builds
4. Review worker logs for errors

### Preview URL Not Available
1. Build might still be in progress
2. Check Cloudflare Pages deployment status
3. Verify webhook is configured correctly

### Rate Limiting
- New builds: 5/hour per user
- Rebuilds: 20/hour per project
- IP limit: 100 requests/hour

## Performance Testing

### Load Test
```bash
# Run multiple builds concurrently
for i in {1..5}; do
  npm run test:worker --user "user$i" --project "project$i" &
done
```

### Cache Performance
Monitor cache hits:
```bash
# Check pnpm cache size
du -sh ~/.pnpm-cache

# Monitor install times in logs
grep "Installing dependencies" worker.log | grep -o "[0-9]* ms"
```

## Debugging Tips

1. **Enable Debug Logging**
   ```bash
   DEBUG=* npm run dev
   ```

2. **Check Build Artifacts**
   ```bash
   ls -la ~/projects/USER_ID/PROJECT_ID/
   ```

3. **Verify Git History**
   ```bash
   cd ~/projects/USER_ID/PROJECT_ID/
   git log --oneline
   git tag
   ```

4. **Test R2 Upload**
   Check R2 bucket for artifacts:
   - Pattern: `USER_ID/PROJECT_ID/snapshots/VERSION_ID.zip`

## Cleanup After Testing

```bash
# Remove test projects
rm -rf ~/projects/test-*

# Clear Redis queue
redis-cli FLUSHDB

# Clean database (careful!)
psql $DATABASE_URL -c "DELETE FROM project_versions WHERE user_id LIKE 'test-%';"
```