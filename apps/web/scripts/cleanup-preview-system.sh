#!/bin/bash

# Cleanup script to remove complex preview system
# Run this after creating a backup branch

echo "🧹 Starting cleanup of complex preview system..."

# Create backup branch first
echo "📌 Creating backup branch..."
git checkout -b backup/complex-preview-system-$(date +%Y%m%d-%H%M%S)
git add -A
git commit -m "Backup: Complex preview system before cleanup"

# Switch to cleanup branch
echo "🔄 Creating cleanup branch..."
git checkout -b feature/simple-iframe-preview

# Remove preview component files
echo "🗑️  Removing preview components..."
rm -f src/components/builder/preview/LivePreview.tsx
rm -f src/components/builder/preview/dynamic-component.tsx
rm -f src/components/builder/preview/iframe-preview-container.tsx
rm -f src/components/builder/preview/isolated-preview-container.tsx
rm -f src/components/builder/preview/pixel-perfect-renderer.tsx
rm -f src/components/builder/preview/preview-mode-toggle.tsx
rm -f src/components/builder/preview/compiled-preview.tsx
rm -f src/components/builder/preview/compiled-preview-v2.tsx
rm -f src/components/builder/preview/simple-template-preview.tsx
rm -f src/components/builder/preview/full-template-preview.tsx
rm -f src/components/builder/preview/test-pixel-perfect.tsx
rm -f src/components/builder/preview/react-component-preview.tsx
rm -rf src/components/builder/preview/section-renderers/
rm -rf src/components/builder/preview/__tests__/

# Remove preview service files
echo "🗑️  Removing preview services..."
rm -f src/services/preview/robust-payload-adapter.ts
rm -f src/services/preview/bundle-cache.ts
rm -f src/services/preview/bundle-entry-template.ts
rm -f src/services/preview/compiler-service.ts
rm -f src/services/preview/css-generator.ts
rm -f src/services/preview/srcdoc-builder.ts
rm -f src/services/preview/style-injector.ts
rm -f src/services/preview/tailwind-extractor.ts
rm -f src/services/preview/live-preview-engine.ts
rm -f src/services/preview/auto-binding-service.ts
rm -f src/services/preview/dynamic-component-generator.ts
rm -f src/services/preview/enhanced-css-generator.ts
rm -f src/services/preview/preview-html-factory.ts
rm -f src/services/preview/fallback-skeleton.ts
rm -f src/services/preview/live-template-executor.ts
rm -f src/services/preview/simple-template-executor.ts
rm -f src/services/preview/unified-preview-provider.ts
rm -f src/services/preview/section-data-enricher.ts

# Remove worker files
echo "🗑️  Removing worker files..."
rm -f src/workers/component-compiler.worker.ts
rm -f src/workers/template-renderer.worker.ts
rm -f public/previewCompileWorker.js
rm -f public/esbuild.wasm

# Remove code editing services (if preview-specific)
echo "🗑️  Removing code editing services..."
rm -f src/services/code-editing/ast-analyzer.ts
rm -f src/services/code-editing/code-edit-orchestrator.ts
rm -f src/services/code-editing/code-validator.ts
rm -f src/services/code-editing/component-index.ts
rm -f src/services/code-editing/incremental-compiler.ts
rm -f src/services/code-editing/intent-parser.ts
rm -f src/services/code-editing/patch-generator.ts

# Remove test pages
echo "🗑️  Removing test pages..."
rm -f src/app/test-pixel-perfect/page.tsx
rm -f src/app/test-live-preview/page.tsx
rm -f src/app/test-dynamic-compilation/page.tsx
rm -f src/app/test-full-template-compilation/page.tsx

# Remove prompt-to-code components (if not needed)
echo "🗑️  Removing prompt-to-code components..."
rm -f src/components/builder/code-edit/code-diff-viewer.tsx
rm -f src/components/builder/code-edit/prompt-editor-modal.tsx
rm -f src/components/builder/code-edit/prompt-editor.tsx
rm -f src/hooks/use-prompt-editor.ts

# Remove documentation about complex preview
echo "🗑️  Removing old documentation..."
rm -rf docs/builder-live-preview/
rm -rf docs/outdated-docs-and-plans/

# Keep only the new simple plan
mkdir -p docs/simple-iframe-preview/
mv /Users/sh/Sites/sheenappsai/docs/builder-live-preview/SIMPLE_IFRAME_PREVIEW_PLAN.md docs/simple-iframe-preview/ 2>/dev/null || true

echo "✅ File cleanup complete!"
echo ""
echo "Next steps:"
echo "1. Create src/components/builder/preview/simple-iframe-preview.tsx"
echo "2. Update src/components/builder/workspace/workspace-preview.tsx"
echo "3. Simplify src/components/builder/workspace/workspace-core.tsx"
echo "4. Update imports in remaining files"
echo "5. Remove preview-related code from builder-store.ts"
echo ""
echo "Run 'git status' to see all removed files"