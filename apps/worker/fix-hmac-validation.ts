#!/usr/bin/env ts-node

/**
 * Migration script to update all routes to use consistent HMAC validation
 * This replaces the old incorrect `body + path` format with the proper HMAC middleware
 * that uses `timestamp + body` format as per v1 specification
 */

import { promises as fs } from 'fs';
import path from 'path';

const ROUTES_TO_FIX = [
  'src/routes/createPreview.ts',
  'src/routes/buildPreview.ts', 
  'src/routes/versions.ts'
];

async function fixRoute(filePath: string) {
  console.log(`Fixing ${filePath}...`);
  
  let content = await fs.readFile(filePath, 'utf-8');
  
  // Step 1: Add import for HMAC middleware if not present
  if (!content.includes("import { requireHmacSignature }")) {
    // Find the last import statement
    const lastImportMatch = content.match(/^import .* from .*$/gm);
    if (lastImportMatch) {
      const lastImport = lastImportMatch[lastImportMatch.length - 1];
      const insertPos = content.indexOf(lastImport) + lastImport.length;
      content = content.slice(0, insertPos) + 
        "\nimport { requireHmacSignature } from '../middleware/hmacValidation';" + 
        content.slice(insertPos);
    }
  }
  
  // Step 2: Remove old verifySignature function and SHARED_SECRET
  content = content.replace(/const SHARED_SECRET[^;]*;?\n/g, '');
  content = content.replace(/const VALIDATED_SHARED_SECRET[^;]*;?\n/g, '');
  content = content.replace(/if \(!SHARED_SECRET\)[^}]*}\n/g, '');
  content = content.replace(/if \(!VALIDATED_SHARED_SECRET\)[^}]*}\n/g, '');
  content = content.replace(/\/\/ TypeScript assertion[^\n]*\n/g, '');
  
  // Remove verifySignature function
  const verifyFuncRegex = /function verifySignature\([^)]*\)[^{]*\{[^}]*\}\n/g;
  content = content.replace(verifyFuncRegex, '');
  
  // Step 3: Replace inline signature verification with middleware
  // Pattern 1: In route handlers
  const inlineVerifyRegex = /const sig = .*\n.*const body = .*\n.*const signaturePath = .*\n.*if \(!sig \|\| !verifySignature[^}]*\}\n/g;
  content = content.replace(inlineVerifyRegex, '');
  
  // Pattern 2: Simpler inline checks
  content = content.replace(/if \(!.*verifySignature\([^)]*\)\)[^}]*return reply[^}]*\}\n/g, '');
  
  // Step 4: Add middleware to route definitions
  // For each route definition, add preHandler
  const routeRegex = /(app\.(get|post|put|delete|patch)<[^>]*>\([^,]+,\s*\{)/g;
  content = content.replace(routeRegex, (match, prefix) => {
    if (!match.includes('preHandler')) {
      return prefix + '\n    preHandler: requireHmacSignature(),';
    }
    return match;
  });
  
  // Step 5: Clean up unused crypto import
  if (!content.includes('createHmac') && content.includes("import { createHmac }")) {
    content = content.replace(/import \{ createHmac \} from 'crypto';\n/g, '');
  }
  
  await fs.writeFile(filePath, content, 'utf-8');
  console.log(`✅ Fixed ${filePath}`);
}

async function main() {
  console.log('🔧 Fixing HMAC validation in all routes...\n');
  
  for (const route of ROUTES_TO_FIX) {
    try {
      await fixRoute(route);
    } catch (error) {
      console.error(`❌ Failed to fix ${route}:`, error);
    }
  }
  
  console.log('\n✅ All routes updated to use consistent HMAC validation!');
  console.log('\nIMPORTANT: Please review the changes and test all endpoints.');
}

main().catch(console.error);