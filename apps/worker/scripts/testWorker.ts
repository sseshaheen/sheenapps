#!/usr/bin/env ts-node

import * as dotenv from 'dotenv';
import { createHmac } from 'crypto';

dotenv.config();

const WORKER_URL = process.env.WORKER_URL || 'http://localhost:3000';
const SHARED_SECRET = process.env.SHARED_SECRET!;

interface TestOptions {
  userId?: string;
  projectId?: string;
  prompt?: string;
  endpoint?: 'generate' | 'build-preview-for-new-project' | 'rebuild-preview';
  framework?: 'react' | 'nextjs' | 'vue' | 'svelte';
  baseVersionId?: string;
}

// Example Claude template generation prompt
const DEFAULT_TEMPLATE_PROMPT = `SYSTEM:
You are TemplateGen-Vite-Seed. You have the seed boilerplate shown below.
Read that JSON as your starting point and **modify** its \`templateFiles\`
and \`files\` entries in-place to implement the user's spec.
**Output only** the final JSON object and write it to output.json …
(no markdown).

TAILWIND v4 RULES:
- No tailwind.config.js – use @theme inside src/index.css.
- Always \`@import "tailwindcss";\`

REACT COMPONENT RULES:
  1. Every React component file MUST export the component:
     - Use \`export default ComponentName\` for the main component
     - Or use named exports: \`export function ComponentName() { ... }\`
  2. Ensure all imports match the export style used
  3. The main App component in src/App.tsx MUST have a default export
  4. Verify all component imports in the generated files resolve correctly
  5. Never place <style> tags in TSX/JSX files
  6. Remember that TSX files can only contain valid TypeScript/JavaScript code
  7. Component functions must return valid JSX only
  8. Ensure all string literals with quotes are properly escaped or use template literals.
  9. For background SVGs in Tailwind, prefer CSS gradients or external files
  10. Test that all Tailwind spacing utilities render with expected pixel values
  11. Escape special HTML characters in JSX text content

TAILWIND v4 STRICT CHECKLIST (generation MUST satisfy all items)
1. devDependencies include exactly "tailwindcss": "4.1.11" and "@tailwindcss/vite": "4.1.11" (no other Tailwind packages).
2. vite.config.ts registers @tailwindcss/vite in its plugins array.
3. NO tailwind.config.js (or *.cjs, *.mjs) is created.
4. src/index.css begins with @import "tailwindcss"; before anything else.
5. src/index.css contains :root { ... } for CSS variables (NOT @theme - that's for extending Tailwind). @theme { ... } should only define Tailwind-specific extensions if needed
6. All class usage assumes Tailwind's default content scanning – you do not reference a content array anywhere.
7. All React components are properly exported and importable
8. src/App.tsx has a default export that matches the import in src/main.tsx
9. The generated page(s) should be mobile responsive
10. When you insert images, make sure their src is not broken (not 404)
11. All color values in Tailwind classes use hex codes directly: bg-[#1e3a5f]
12. Never use CSS custom properties in arbitrary value syntax: NOT bg-[var(--color)]
13. Verify standard utilities work: p-8 should create 2rem/32px padding
14. For complex SVG backgrounds, use external files or gradient alternatives

SEED:
\`\`\`json
{
  "name": "{project-name}",
  "slug": "{project-slug}",
  "description": "description",
  "version": "0.1.0",
  "author": "TemplateSeed",
  "repository": "",
  "license": "MIT",
  "tech_stack": [],
  "metadata": {
    "tags": [],
    "industry_tags": [],
    "style_tags": [],
    "core_pages": {},
    "components": [],
    "design_tokens": {},
    "rsc_path": ""
  },
  "templateFiles": [],
  "files": []
}
\`\`\`

USER SPEC:
• Goal: Clean, whitespace-heavy SaaS landing page.
• Sections / Components: Hero; 3-column feature grid; Pricing (3 plans); Testimonials carousel; Sticky CTA bar.
• Tech: Vite 7 + React 19.1 + Tailwind CSS 4.1.11
• Style tags: minimal, clean, light-mode, pastel, rtl
• Industry tag: saas
• Extra:`;

async function generateSignature(payload: any): Promise<string> {
  return createHmac('sha256', SHARED_SECRET)
    .update(JSON.stringify(payload))
    .digest('hex');
}

async function testWorker(options: TestOptions = {}) {
  const {
    userId = 'test-user-' + Date.now(),
    projectId = 'test-project-' + Date.now(),
    prompt = DEFAULT_TEMPLATE_PROMPT,
    endpoint = 'build-preview-for-new-project',
    framework = 'react',
    baseVersionId
  } = options;

  console.log(`\n🧪 Testing Claude Worker`);
  console.log(`📍 Endpoint: ${endpoint}`);
  console.log(`👤 User ID: ${userId}`);
  console.log(`📁 Project ID: ${projectId}`);
  console.log(`🔧 Framework: ${framework}`);
  console.log(`📝 Prompt length: ${prompt.length} characters`);
  console.log(`\n⏳ Sending request...\n`);

  const requestBody: any = {
    userId,
    projectId,
    prompt
  };

  if (endpoint === 'build-preview-for-new-project') {
    requestBody.framework = framework;
  } else if (endpoint === 'rebuild-preview') {
    if (baseVersionId) {
      requestBody.baseVersionId = baseVersionId;
    }
  }

  const signature = await generateSignature(requestBody);

  try {
    // Dynamic import for node-fetch
    const fetch = (await import('node-fetch')).default;
    
    const response = await fetch(`${WORKER_URL}/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-sheen-signature': signature
      },
      body: JSON.stringify(requestBody)
    });

    const result = await response.json() as any;

    if (response.ok) {
      console.log('✅ Success!');
      console.log(JSON.stringify(result, null, 2));

      if (result.jobId) {
        console.log(`\n📋 Job queued with ID: ${result.jobId}`);
        console.log(`🔑 Version ID: ${result.versionId}`);
        console.log('\nTo check the latest preview URL, run:');
        console.log(`curl ${WORKER_URL}/preview/${userId}/${projectId}/latest`);
      }
    } else {
      console.error('❌ Error:', response.status, response.statusText);
      console.error(JSON.stringify(result, null, 2));
    }
  } catch (error: any) {
    console.error('❌ Request failed:', error.message);
  }
}

// Handle prompt from file or stdin
async function getPromptFromFile(filePath: string): Promise<string> {
  if (filePath === '-') {
    // Read from stdin
    const chunks: string[] = [];
    process.stdin.setEncoding('utf8');
    
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    
    return chunks.join('');
  } else {
    // Read from file
    const fs = await import('fs/promises');
    return fs.readFile(filePath, 'utf8');
  }
}

// Parse command line arguments
async function parseArgs(): Promise<TestOptions> {
  const args = process.argv.slice(2);
  const options: TestOptions = {};

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];

    switch (key) {
      case '--user':
      case '-u':
        options.userId = value;
        break;
      case '--project':
      case '-p':
        options.projectId = value;
        break;
      case '--prompt':
        options.prompt = value;
        break;
      case '--prompt-file':
      case '-pf':
        // Read prompt from file (supports quotes and special chars)
        options.prompt = await getPromptFromFile(value);
        break;
      case '--endpoint':
      case '-e':
        options.endpoint = value as any;
        break;
      case '--framework':
      case '-f':
        options.framework = value as any;
        break;
      case '--base':
      case '-b':
        options.baseVersionId = value;
        break;
      case '--help':
      case '-h':
      console.log(`
Claude Worker Test Script

Usage: npm run test:worker [options]

Options:
  --user, -u         User ID (default: test-user-<timestamp>)
  --project, -p      Project ID (default: test-project-<timestamp>)
  --prompt           Custom prompt (default: SaaS landing page template)
  --prompt-file, -pf Read prompt from file (use '-' for stdin)
  --endpoint, -e     Endpoint to test (default: build-preview-for-new-project)
                     Options: generate, build-preview-for-new-project, rebuild-preview
  --framework, -f    Framework (default: react)
                     Options: react, nextjs, vue, svelte
  --base, -b         Base version ID (for rebuild-preview)
  --help, -h         Show this help message

Examples:
  # Test with default SaaS template
  npm run test:worker

  # Test with custom prompt
  npm run test:worker --prompt "Create a simple blog with Next.js"

  # Test with prompt from file (handles quotes properly)
  npm run test:worker --prompt-file prompt.txt

  # Test with prompt from stdin
  echo "Create a blog with 'quotes' and \"double quotes\"" | npm run test:worker --prompt-file -

  # Test with multi-line prompt from heredoc
  npm run test:worker --prompt-file - <<'EOF'
  Create a website with:
  - A hero section that says "Welcome to My Site"
  - A footer with 'Copyright 2024'
  - Complex JSON: {"key": "value with \"nested\" quotes"}
  EOF

  # Test rebuild with base version
  npm run test:worker -e rebuild-preview -b 01HX123ABC --prompt "Change header color to blue"
`);
      process.exit(0);
    }
  }
  
  return options;
}

// Main function
async function main() {
  const options = await parseArgs();
  await testWorker(options);
}

// Run the test
main().catch(console.error);