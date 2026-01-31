# AI Template Generation Inconsistencies & Solutions

## Overview

Based on the `unpack-template.sh` script analysis, AI-generated templates exhibit several inconsistencies that must be handled robustly in our preview system.

## Common Inconsistencies

### 1. File Structure Variations

The AI generates files in multiple formats:

```javascript
// Format 1: String references in templateFiles
{
  "templateFiles": ["src/App.tsx", "src/index.css"],
  "files": [
    { "path": "src/App.tsx", "content": "..." },
    { "path": "src/index.css", "content": "..." }
  ]
}

// Format 2: Objects in templateFiles
{
  "templateFiles": [
    { "path": "src/App.tsx", "content": "..." },
    { "file": "src/index.css", "content": "..." }  // Note: 'file' instead of 'path'
  ]
}

// Format 3: Mixed formats
{
  "templateFiles": ["src/App.tsx"],  // String
  "files": [
    { "filename": "src/App.tsx", "content": "..." }  // Note: 'filename' field
  ]
}
```

### 2. Path Field Naming

The AI inconsistently names the path field:
- `path` - Most common
- `file` - Alternative
- `filename` - Another variant
- `name` - Least common

### 3. Content Escaping Issues

```javascript
// AI might generate escaped content
{
  "content": "import React from \"react\"\\nconst App = () => {\\n  return <div>Hello</div>\\n}"
}

// Needs to be processed to:
{
  "content": "import React from \"react\"\nconst App = () => {\n  return <div>Hello</div>\n}"
}
```

### 4. Missing Content

Some file entries might be strings without corresponding content:
```javascript
{
  "templateFiles": ["src/missing.tsx"],  // No matching entry in files[]
  "files": [
    { "path": "src/other.tsx", "content": "..." }
  ]
}
```

### 5. Invalid Dependencies

```javascript
{
  "dependencies": {
    "react": "^18.0.0",
    "some-ai-hallucinated-package": "^1.0.0",  // Doesn't exist on npm
    "lodash": "not-found"  // Invalid version
  }
}
```

## Implementation Solutions

### 1. Robust File Extraction

Our `robust-payload-adapter.ts` handles all variations:

```typescript
function normalizeFileEntry(entry: string | TemplateFile, allFiles?: any[]) {
  // Handle strings by looking up in files array
  if (typeof entry === 'string') {
    const fileObj = allFiles?.find(f => 
      f.path === entry || f.file === entry || f.filename === entry
    );
    return fileObj ? { path: entry, content: fileObj.content } : null;
  }
  
  // Handle objects with various path fields
  const path = entry.path || entry.file || entry.filename || entry.name;
  return path && entry.content ? { path, content: entry.content } : null;
}
```

### 2. Content Processing

Properly handle escape sequences:

```typescript
function processContent(content: string): string {
  return content
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}
```

### 3. Entry Point Discovery

Multiple fallback strategies:

```typescript
const entryPriority = [
  'src/App.tsx',
  'src/main.tsx',
  'App.tsx',
  // ... more fallbacks
];

// Also check for .jsx files
// Look in various directories
// Use any React file as last resort
```

### 4. Deduplication

Handle files appearing in both arrays:

```typescript
const seenPaths = new Set<string>();

// Process templateFiles first (they take precedence)
// Then process files array (skip duplicates)
```

## Integration with Preview System

### Updated LivePreview Component

```typescript
import { adaptPayloadForPreview } from '@/services/preview/robust-payload-adapter';

export function LivePreview({ payload }: { payload: TemplatePayload }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  
  useEffect(() => {
    try {
      // Use robust adapter
      const { entry, files, metadata } = adaptPayloadForPreview(payload);
      
      // Send to worker
      worker.postMessage({ entry, files });
      
    } catch (err) {
      // Handle validation errors
      setStatus('error');
      showFallbackSkeleton(err.message);
    }
  }, [payload]);
}
```

### Error Recovery

When AI generates invalid templates:

1. **Show meaningful errors**: "No entry point found" instead of cryptic errors
2. **Attempt recovery**: Try multiple entry point patterns
3. **Graceful degradation**: Show skeleton with error details
4. **Log for debugging**: Track common failure patterns

## Benefits

1. **Resilience**: Handles whatever format the AI generates
2. **User Experience**: Preview works even with inconsistent data
3. **Debugging**: Clear error messages help identify issues
4. **Future-Proof**: Easy to add new format variations

## Testing Considerations

Test with various malformed payloads:

```typescript
// Test: String-only templateFiles
const payload1 = {
  name: "test",
  templateFiles: ["App.tsx"],
  files: [{ path: "App.tsx", content: "..." }]
};

// Test: Mixed path field names
const payload2 = {
  name: "test",
  files: [
    { path: "App.tsx", content: "..." },
    { file: "index.css", content: "..." },
    { filename: "config.js", content: "..." }
  ]
};

// Test: Escaped content
const payload3 = {
  name: "test",
  files: [{
    path: "App.tsx",
    content: "const msg = \"Hello\\nWorld\"\\nexport default msg"
  }]
};
```

## Monitoring & Improvement

Track failure patterns to improve AI prompts:

```typescript
// Log validation failures
logger.error('Template validation failed', {
  reason: 'no_entry_point',
  filesChecked: files.map(f => f.path),
  payload: payload.name
});

// Could feed back to AI training
```

This robust handling ensures the preview system works reliably regardless of AI inconsistencies, providing a smooth experience for users while gathering data to improve the AI's output quality over time.