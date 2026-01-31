#!/bin/bash

# Export i18n-core package for Worker team
# This script builds and packages the i18n-core for distribution

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}📦 i18n-Core Package Export Script${NC}"
echo "===================================="

# Navigate to package directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PACKAGE_DIR="${SCRIPT_DIR}/../packages/i18n-core"

if [ ! -d "$PACKAGE_DIR" ]; then
    echo -e "${RED}❌ Error: i18n-core package not found at $PACKAGE_DIR${NC}"
    exit 1
fi

cd "$PACKAGE_DIR"

# Clean previous build
echo -e "${YELLOW}🧹 Cleaning previous build...${NC}"
rm -rf dist/
rm -f *.tgz

# Build the package
echo -e "${YELLOW}🔨 Building i18n-core package...${NC}"
npm run build

if [ ! -d "dist" ]; then
    echo -e "${RED}❌ Error: Build failed - dist directory not created${NC}"
    exit 1
fi

# Get package version
VERSION=$(node -p "require('./package.json').version")
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
DIST_NAME="sheenapps-i18n-core-v${VERSION}-${TIMESTAMP}"

# Create exports directory
EXPORT_DIR="${SCRIPT_DIR}/../dist-exports"
mkdir -p "$EXPORT_DIR"

# Create the distribution package
echo -e "${YELLOW}📦 Creating distribution package...${NC}"

# Create a temporary directory for the package
TEMP_DIR=$(mktemp -d)
PACKAGE_ROOT="${TEMP_DIR}/@sheenapps/i18n-core"
mkdir -p "$PACKAGE_ROOT"

# Copy necessary files
cp -r dist/* "$PACKAGE_ROOT/"
cp package.json "$PACKAGE_ROOT/"

# Create a README for the Worker team
cat > "$PACKAGE_ROOT/README.md" << EOF
# @sheenapps/i18n-core

Shared i18n utilities for SheenApps platform.

## Installation

\`\`\`bash
# Add to package.json dependencies:
"@sheenapps/i18n-core": "file:./vendor/@sheenapps/i18n-core"

# Then run:
npm install
\`\`\`

## Usage

\`\`\`typescript
import { 
  ERROR_CODES, 
  toBaseLocale, 
  validateLocale,
  isolateBidiText 
} from '@sheenapps/i18n-core';

// Use error codes
const error = {
  code: ERROR_CODES.AI_LIMIT_REACHED,
  params: { resetTime: Date.now() + 300000 }
};

// Convert regional locale to base
const baseLocale = toBaseLocale('ar-eg'); // Returns 'ar'
\`\`\`

## Version: ${VERSION}
Built: ${TIMESTAMP}
EOF

# Create tarball
cd "$TEMP_DIR"
tar -czf "${EXPORT_DIR}/${DIST_NAME}.tar.gz" ./@sheenapps

# Create a latest symlink
cd "$EXPORT_DIR"
rm -f i18n-core-latest.tar.gz
ln -s "${DIST_NAME}.tar.gz" i18n-core-latest.tar.gz

# Create extraction instructions
cat > "${EXPORT_DIR}/WORKER_TEAM_INSTRUCTIONS.md" << EOF
# i18n-Core Package for Worker Team

## Package Information
- **Version**: ${VERSION}
- **Built**: ${TIMESTAMP}
- **File**: ${DIST_NAME}.tar.gz

## Installation Instructions

### Step 1: Extract the package
\`\`\`bash
# In your Worker repository root:
mkdir -p vendor
cd vendor
tar -xzf path/to/${DIST_NAME}.tar.gz
\`\`\`

### Step 2: Update package.json
\`\`\`json
{
  "dependencies": {
    "@sheenapps/i18n-core": "file:./vendor/@sheenapps/i18n-core"
  }
}
\`\`\`

### Step 3: Install
\`\`\`bash
npm install
\`\`\`

### Step 4: Use in your code
\`\`\`typescript
import { ERROR_CODES, toBaseLocale } from '@sheenapps/i18n-core';
\`\`\`

## Package Contents
- Error code constants
- Locale utilities (validation, conversion)
- BiDi text utilities for RTL support
- Formatter utilities
- TypeScript type definitions

## Questions?
Contact the Next.js team on Slack #frontend channel
EOF

# Clean up temp directory
rm -rf "$TEMP_DIR"

# Output summary
echo -e "${GREEN}✅ Package exported successfully!${NC}"
echo
echo "📦 Package Details:"
echo "   Version: ${VERSION}"
echo "   Location: ${EXPORT_DIR}/${DIST_NAME}.tar.gz"
echo "   Latest: ${EXPORT_DIR}/i18n-core-latest.tar.gz"
echo
echo "📋 Next Steps:"
echo "   1. Share ${DIST_NAME}.tar.gz with Worker team"
echo "   2. Worker team should follow instructions in WORKER_TEAM_INSTRUCTIONS.md"
echo
echo -e "${GREEN}✨ Done!${NC}"