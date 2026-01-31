# Local Development Preview System

## Overview

The local preview system allows developers to test the template building and preview functionality without needing access to production hosting. It automatically detects development mode and builds templates locally using the same pipeline that will be used in production.

## How It Works

### Development Mode Detection
```typescript
const isDevelopment = process.env.NODE_ENV === 'development'
```

### Local Build Pipeline
```
AI Template JSON
    ↓
LocalPreviewServer.buildAndServePreview()
    ↓
1. Save files to tmp/previews/[projectId]/
2. Create package.json with vite config
3. Run: npm install && npm run build
4. Serve dist/ via /api/local-preview/[projectId]
    ↓
SimpleIframePreview shows: /api/local-preview/[projectId]
```

### Environment-Aware URLs
- **Development**: `/api/local-preview/[projectId]`
- **Production**: `https://preview--[projectId].sheenapps.com`

## Quick Start

### 1. Test the System
```bash
# Run the test script
node scripts/test-local-preview.js

# Start dev server
npm run dev

# Visit test page
open http://localhost:3000/test-local-preview
```

### 2. Use in Workspace
1. Start development server: `npm run dev`
2. Navigate to any project workspace
3. Generate a template with AI
4. The preview will automatically build locally and show in the iframe

## Key Features

### Visual Environment Indicator
- **GREEN "LOCAL"** badge in development
- **BLUE "HOSTED"** badge in production

### Same Build Process
- Uses identical `npm install && npm run build` pipeline
- Same vite configuration
- Same error handling

### Automatic Cleanup
- Previews stored in `tmp/previews/[projectId]/`
- Auto-cleanup of old previews (>1 hour)

## File Structure

```
tmp/previews/[projectId]/
├── package.json          # Generated with vite config
├── vite.config.ts        # Vite build configuration
├── index.html            # Entry point
├── src/
│   ├── App.tsx          # Main component from AI
│   ├── main.tsx         # React entry point
│   └── ...              # Other AI-generated files
└── dist/                # Built files (served by API)
    ├── index.html
    ├── assets/
    └── ...
```

## API Routes

### `/api/projects/[id]/deploy-preview` (POST)
- **Development**: Builds locally using `LocalPreviewServer`
- **Production**: Triggers hosted build (mock for now)

### `/api/local-preview/[projectId]` (GET)
- **Development**: Serves built files from `tmp/previews/[projectId]/dist/`
- **Production**: Returns 403 (not available)

## Testing

### Manual Testing
1. Visit `/test-local-preview`
2. Click "Create Test Preview"
3. Watch the iframe load the built template

### Automated Testing
```bash
node scripts/test-local-preview.js
```

This script:
- Creates a test template
- Builds it locally
- Verifies the build output
- Provides instructions for testing

## Configuration

### Default Settings
- **Preview Port**: 3001 (not used, using API routes instead)
- **Build Tool**: Vite + React
- **Package Manager**: npm (not pnpm - fixed to match project standard)
- **Cleanup**: 1 hour retention

### Template Generation
The system automatically creates:
- `package.json` with React + Vite dependencies
- `vite.config.ts` with build configuration
- `index.html` with Tailwind CDN
- `src/main.tsx` React entry point

## Error Handling

### Build Failures
- Shows error message in iframe
- Logs detailed errors to console
- Provides fallback UI with retry option

### Missing Files
- Shows "Building..." spinner
- Helpful error messages
- Graceful degradation

## Benefits

1. **No External Dependencies**: Works completely offline
2. **Same as Production**: Uses identical build process
3. **Fast Development**: No need to deploy to test
4. **Visual Feedback**: Clear development vs production indicators
5. **Easy Testing**: Complete test suite included

## Troubleshooting

### Common Issues

**PostCSS configuration errors**
- Fixed: The system now creates its own `postcss.config.js` to avoid conflicts
- Each preview build is isolated with its own config

**Build fails with dependency errors**
```bash
# Clear the preview cache
rm -rf tmp/previews/
```

**Iframe shows 404**
- Check if build completed successfully
- Look for errors in Next.js console
- Verify files exist in `tmp/previews/[projectId]/dist/`

**Slow build times**
- First build installs dependencies (~30s)
- Subsequent builds are faster (~5s)
- Consider pre-warming common dependencies

### Debug Mode
```bash
# Enable debug logging
DEBUG=preview:* npm run dev
```

## Future Enhancements

1. **Build Caching**: Cache node_modules between builds
2. **Hot Reload**: Watch for changes and rebuild
3. **Multiple Projects**: Support concurrent preview builds
4. **Performance Monitoring**: Track build times and optimization
5. **Custom Dependencies**: Allow templates to specify dependencies