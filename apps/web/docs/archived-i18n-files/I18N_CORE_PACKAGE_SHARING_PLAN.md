# i18n-Core Package Sharing Strategy

## 🎯 Current Situation

- **Package Location**: `/packages/i18n-core/` in Next.js repository
- **Package Status**: Built and ready at `/packages/i18n-core/dist/`
- **Worker Location**: Separate repository (confirmed by absence of `/worker/` directory)
- **Package Scope**: `@sheenapps/i18n-core` (marked as private)

### ⚠️ Important Discovery (August 8, 2025)

After analyzing Worker's `errorCodes.ts`, we found:
- **Worker has 38 error codes** (vs shared package's 11)
- **Worker has Zod validation** for parameters
- **Worker has kill switch** for message migration
- **Recommendation**: Worker should KEEP their error codes, optionally use locale utilities only

## 🤔 Key Considerations

### What Worker Can Use from This Package (Updated)

1. ~~**Error Code Constants**~~ - Worker keeps their own (more comprehensive)
2. **Locale Utilities** ✅ - Base locale conversion, validation, etc.
3. **BiDi Utilities** ✅ - Proper RTL text handling (if needed)
4. **Formatters** ✅ - Consistent date/number formatting (if needed)
5. ~~**Type Safety**~~ - Worker has their own types with Zod

### Challenges

1. **Cross-Repository Sharing**: Package in Next.js repo, Worker in separate repo
2. **Version Synchronization**: Keeping both teams on same version
3. **Development Workflow**: Worker team needs to iterate quickly
4. **Type Safety**: TypeScript definitions must be available
5. **Build Pipeline**: Package must be built before Worker can use it

## 📋 Sharing Options Analysis

### Option 1: Manual Copy (Quick Start)
**Approach**: Copy built files manually to Worker repo

```bash
# One-time setup in Worker repo
mkdir -p vendor/i18n-core
cp -r ../nextjs/packages/i18n-core/dist/* vendor/i18n-core/

# In Worker's package.json
{
  "dependencies": {
    "@sheenapps/i18n-core": "file:./vendor/i18n-core"
  }
}
```

**Pros**:
- ✅ Immediate availability
- ✅ No infrastructure changes
- ✅ Worker team has full control
- ✅ Works offline

**Cons**:
- ❌ Manual synchronization
- ❌ Version drift risk
- ❌ No automatic updates
- ❌ Duplicate code

**When to Use**: Initial implementation, proof of concept

### Option 2: Private NPM Registry (Recommended for Production)
**Approach**: Publish to private registry (Verdaccio, npm Enterprise, GitHub Packages)

```bash
# Setup private registry (e.g., GitHub Packages)
npm config set @sheenapps:registry https://npm.pkg.github.com

# In Next.js repo - publish
cd packages/i18n-core
npm version patch
npm publish

# In Worker repo - install
npm install @sheenapps/i18n-core@latest
```

**Pros**:
- ✅ Professional approach
- ✅ Version management
- ✅ Automatic dependency resolution
- ✅ CI/CD friendly

**Cons**:
- ❌ Registry setup required
- ❌ Authentication complexity
- ❌ Network dependency

**When to Use**: Production environment, multiple teams

### Option 3: Git Submodule (Compromise)
**Approach**: Include i18n-core as git submodule

```bash
# In Worker repo
git submodule add https://github.com/sheenapps/nextjs.git nextjs-shared
git config -f .gitmodules submodule.nextjs-shared.sparse-checkout true
echo "packages/i18n-core/*" > .git/modules/nextjs-shared/sparse-checkout

# Package.json reference
{
  "dependencies": {
    "@sheenapps/i18n-core": "file:./nextjs-shared/packages/i18n-core"
  }
}
```

**Pros**:
- ✅ Version control integration
- ✅ Selective checkout (only i18n-core)
- ✅ Automated updates via git
- ✅ No separate infrastructure

**Cons**:
- ❌ Git submodule complexity
- ❌ Build step required
- ❌ Potential merge conflicts

**When to Use**: Medium-term solution, same organization

### Option 4: Monorepo (Long-term Vision)
**Approach**: Merge Next.js and Worker into monorepo

```
sheenapps/
├── apps/
│   ├── nextjs/
│   └── worker/
└── packages/
    └── i18n-core/
```

**Pros**:
- ✅ Single source of truth
- ✅ Atomic changes across projects
- ✅ Shared tooling
- ✅ Simplified CI/CD

**Cons**:
- ❌ Major refactoring required
- ❌ Team coordination needed
- ❌ Migration complexity

**When to Use**: Future architecture, unified team

## 🚀 Recommended Implementation Plan

### Phase 1: Immediate (Day 1) - Manual Copy
1. **Build the package**:
   ```bash
   cd packages/i18n-core
   npm run build
   ```

2. **Create distribution archive**:
   ```bash
   tar -czf i18n-core-dist.tar.gz \
     dist/ \
     package.json \
     README.md
   ```

3. **Worker team extracts**:
   ```bash
   mkdir -p vendor/@sheenapps/i18n-core
   tar -xzf i18n-core-dist.tar.gz -C vendor/@sheenapps/i18n-core
   ```

4. **Worker imports**:
   ```typescript
   import { ERROR_CODES, toBaseLocale } from '@sheenapps/i18n-core';
   ```

### Phase 2: Short-term (Week 1) - Automation Script
Create automation script in Next.js repo:

```bash
#!/bin/bash
# scripts/export-i18n-core.sh

set -e

echo "Building i18n-core package..."
cd packages/i18n-core
npm run build

echo "Creating distribution package..."
VERSION=$(node -p "require('./package.json').version")
DIST_NAME="i18n-core-v${VERSION}-$(date +%Y%m%d)"

mkdir -p ../../dist-exports
tar -czf "../../dist-exports/${DIST_NAME}.tar.gz" \
  dist/ \
  package.json \
  README.md \
  --transform "s,^,@sheenapps/i18n-core/,"

echo "Creating latest symlink..."
cd ../../dist-exports
ln -sf "${DIST_NAME}.tar.gz" "i18n-core-latest.tar.gz"

echo "✅ Package exported to: dist-exports/${DIST_NAME}.tar.gz"
echo "📦 Worker team can download from: dist-exports/i18n-core-latest.tar.gz"
```

### Phase 3: Medium-term (Week 2-3) - Private Registry

1. **Set up GitHub Packages**:
   ```yaml
   # .github/workflows/publish-i18n-core.yml
   name: Publish i18n-core
   on:
     push:
       paths:
         - 'packages/i18n-core/**'
       branches:
         - main
   
   jobs:
     publish:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v3
         - uses: actions/setup-node@v3
           with:
             node-version: '18'
             registry-url: 'https://npm.pkg.github.com'
         
         - name: Build package
           run: |
             cd packages/i18n-core
             npm ci
             npm run build
         
         - name: Publish to GitHub Packages
           run: |
             cd packages/i18n-core
             npm publish
           env:
             NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
   ```

2. **Worker team configuration**:
   ```bash
   # .npmrc in Worker repo
   @sheenapps:registry=https://npm.pkg.github.com
   //npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
   ```

3. **Install in Worker**:
   ```bash
   npm install @sheenapps/i18n-core@latest
   ```

## 📝 Worker Team Integration Guide

### Step 1: Initial Setup (Manual Approach)

```bash
# 1. Get the package from Next.js team
curl -O https://shared-location/i18n-core-latest.tar.gz

# 2. Extract to vendor directory
mkdir -p vendor
tar -xzf i18n-core-latest.tar.gz -C vendor/

# 3. Update package.json
{
  "dependencies": {
    "@sheenapps/i18n-core": "file:./vendor/@sheenapps/i18n-core"
  }
}

# 4. Install
npm install
```

### Step 2: Usage in Worker Code (Updated - Selective Import)

```typescript
// src/i18n/setup.ts

// KEEP your existing error codes - they're more comprehensive
import { ERROR_CODES, validateErrorParams } from '../types/errorCodes';

// ONLY import utilities you actually need
import {
  toBaseLocale,
  validateLocale,
  isolateBidiText
} from '@sheenapps/i18n-core';

// Use YOUR error codes
const error = {
  code: ERROR_CODES.BUILD_FAILED,  // Your 38 codes
  params: validateErrorParams(ERROR_CODES.BUILD_FAILED, { reason: 'timeout' })
};

// Use shared locale utilities if needed
const baseLocale = toBaseLocale('ar-eg'); // Returns 'ar'
const locale = validateLocale(req.headers['x-sheen-locale']);

// Use BiDi utilities if generating RTL text
const rtlText = isolateBidiText(arabicMessage);
```

### Step 3: TypeScript Configuration

```json
// tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "@sheenapps/i18n-core": ["./vendor/@sheenapps/i18n-core/dist/index.d.ts"]
    }
  }
}
```

## 🔄 Version Management Strategy

### Semantic Versioning
- **Patch (1.0.x)**: Bug fixes, documentation
- **Minor (1.x.0)**: New error codes, utilities (backward compatible)
- **Major (x.0.0)**: Breaking changes (coordinate with Worker team)

### Change Communication
1. **Slack notification** for any updates
2. **Changelog** in package root
3. **Migration guide** for breaking changes

### Testing Protocol
1. Next.js team tests locally
2. Publish to staging registry
3. Worker team tests in development
4. Promote to production

## 📊 Decision Matrix

| Criteria | Manual | Registry | Submodule | Monorepo |
|----------|--------|----------|-----------|----------|
| Setup Speed | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐ |
| Maintenance | ⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| Version Control | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| CI/CD Integration | ⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Team Independence | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |

## 🎯 Recommendation

### Immediate Action (Today)
1. **Use Manual Copy** to unblock Worker team
2. Build package: `cd packages/i18n-core && npm run build`
3. Create tarball with distribution files
4. Share via Slack/Google Drive/S3

### Next Sprint
1. **Implement automation script** for package export
2. **Set up GitHub Packages** for private registry
3. **Document update process** for both teams

### Long-term (Q2 2025)
1. **Evaluate monorepo** migration
2. **Consider Turborepo/Nx** for build optimization
3. **Implement automated testing** across packages

## ✅ Success Criteria

- [ ] Worker team can import and use i18n-core
- [ ] TypeScript types resolve correctly
- [ ] No manual code duplication
- [ ] Version updates don't break Worker
- [ ] CI/CD pipeline includes package publishing
- [ ] Both teams can iterate independently

## 📚 Additional Resources

- [GitHub Packages Documentation](https://docs.github.com/en/packages)
- [npm Workspaces Guide](https://docs.npmjs.com/cli/v8/using-npm/workspaces)
- [Verdaccio Private Registry](https://verdaccio.org/)
- [Lerna Monorepo Management](https://lerna.js.org/)