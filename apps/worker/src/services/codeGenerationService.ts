/**
 * Code Generation Service
 *
 * Generates production-ready Next.js 15 code from AI migration plan
 * Phase 4 implementation with simplified component generation
 */

import { unifiedLogger } from './unifiedLogger';
import type { MigrationPlan, PagePlan } from './migrationPlanningService';

// =============================================================================
// TYPES
// =============================================================================

export interface GeneratedProject {
  name: string;
  framework: 'nextjs';
  files: GeneratedFile[];
  assets: GeneratedAsset[];
  metadata: {
    totalFiles: number;
    totalSize: number;
    generatedAt: Date;
    componentsCount: number;
    pagesCount: number;
  };
}

export interface GeneratedFile {
  path: string; // Relative path from project root (e.g., 'app/page.tsx')
  content: string;
  type: 'page' | 'component' | 'config' | 'style' | 'type' | 'util';
}

export interface GeneratedAsset {
  originalUrl: string;
  localPath: string; // Relative path from project root (e.g., 'public/images/logo.png')
  content: Buffer;
  mimeType: string;
  size: number;
  optimized: boolean;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Escape a string for safe interpolation in TypeScript single-quoted string literals.
 * Handles: single quotes, backslashes, newlines, carriage returns, template literals.
 */
function tsString(str: string | undefined | null): string {
  if (!str) return '';
  return str
    .replace(/\\/g, '\\\\')           // Escape backslashes first
    .replace(/'/g, "\\'")             // Escape single quotes
    .replace(/\n/g, '\\n')            // Escape newlines
    .replace(/\r/g, '\\r')            // Escape carriage returns
    .replace(/\t/g, '\\t')            // Escape tabs
    .replace(/\${/g, '\\${');         // Escape template literal interpolations
}

// =============================================================================
// CODE GENERATION SERVICE
// =============================================================================

export class CodeGenerationService {
  /**
   * Generate complete Next.js 15 project from migration plan
   */
  async generateProject(plan: MigrationPlan, projectName: string): Promise<GeneratedProject> {
    unifiedLogger.system('startup', 'info', 'Starting code generation', {
      projectName,
      pagesCount: plan.pages.length,
      componentsCount: plan.componentLibrary.length,
    });

    const files: GeneratedFile[] = [];

    // Step 1: Generate project infrastructure
    unifiedLogger.system('startup', 'info', 'Generating project infrastructure');
    files.push(...this.generateInfrastructure(plan, projectName));

    // Step 2: Generate design system / Tailwind config
    unifiedLogger.system('startup', 'info', 'Generating design system');
    files.push(...this.generateDesignSystem(plan));

    // Step 3: Generate page components
    unifiedLogger.system('startup', 'info', 'Generating page components', {
      count: plan.pages.length,
    });
    files.push(...this.generatePages(plan));

    const totalSize = files.reduce((sum, f) => sum + Buffer.byteLength(f.content, 'utf8'), 0);

    const project: GeneratedProject = {
      name: projectName,
      framework: 'nextjs',
      files,
      assets: [], // TODO: Asset processing
      metadata: {
        totalFiles: files.length,
        totalSize,
        generatedAt: new Date(),
        componentsCount: plan.componentLibrary.length,
        pagesCount: plan.pages.length,
      },
    };

    unifiedLogger.system('startup', 'info', 'Code generation complete', {
      files: files.length,
      totalSize: `${(totalSize / 1024 / 1024).toFixed(2)}MB`,
    });

    return project;
  }

  // ===========================================================================
  // INFRASTRUCTURE GENERATION
  // ===========================================================================

  private generateInfrastructure(
    plan: MigrationPlan,
    projectName: string
  ): GeneratedFile[] {
    const files: GeneratedFile[] = [];

    // package.json
    files.push({
      path: 'package.json',
      type: 'config',
      content: this.generatePackageJson(projectName),
    });

    // tsconfig.json
    files.push({
      path: 'tsconfig.json',
      type: 'config',
      content: this.generateTsConfig(),
    });

    // next.config.js
    files.push({
      path: 'next.config.js',
      type: 'config',
      content: this.generateNextConfig(),
    });

    // .gitignore
    files.push({
      path: '.gitignore',
      type: 'config',
      content: this.generateGitignore(),
    });

    // next-env.d.ts (required by tsconfig.json)
    files.push({
      path: 'next-env.d.ts',
      type: 'type',
      content: this.generateNextEnvDts(),
    });

    // README.md
    files.push({
      path: 'README.md',
      type: 'config',
      content: this.generateReadme(projectName, plan),
    });

    return files;
  }

  private generateNextEnvDts(): string {
    return `/// <reference types="next" />
/// <reference types="next/image-types/global" />

// NOTE: This file should not be edited
// see https://nextjs.org/docs/app/building-your-application/configuring/typescript for more information.
`;
  }

  private generatePackageJson(projectName: string): string {
    return JSON.stringify({
      name: projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      version: '0.1.0',
      private: true,
      scripts: {
        dev: 'next dev',
        build: 'next build',
        start: 'next start',
        lint: 'next lint',
      },
      dependencies: {
        next: '^15.0.0',
        react: '^19.0.0',
        'react-dom': '^19.0.0',
      },
      devDependencies: {
        '@types/node': '^20',
        '@types/react': '^19',
        '@types/react-dom': '^19',
        autoprefixer: '^10',
        eslint: '^8',
        'eslint-config-next': '^15',
        postcss: '^8',
        tailwindcss: '^3.4.0',
        typescript: '^5',
      },
      engines: {
        node: '>=18.17.0',
      },
    }, null, 2);
  }

  private generateTsConfig(): string {
    return JSON.stringify({
      compilerOptions: {
        target: 'ES2020',
        lib: ['dom', 'dom.iterable', 'esnext'],
        allowJs: true,
        skipLibCheck: true,
        strict: true,
        noEmit: true,
        esModuleInterop: true,
        module: 'esnext',
        moduleResolution: 'bundler',
        resolveJsonModule: true,
        isolatedModules: true,
        jsx: 'preserve',
        incremental: true,
        plugins: [{ name: 'next' }],
        paths: { '@/*': ['./*'] },
      },
      include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
      exclude: ['node_modules'],
    }, null, 2);
  }

  private generateNextConfig(): string {
    // Use CommonJS format (module.exports) since package.json doesn't have "type": "module"
    return `/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
};

module.exports = nextConfig;
`;
  }

  private generateGitignore(): string {
    return `# Dependencies
node_modules

# Next.js
/.next/
/out/

# Production
/build

# Misc
.DS_Store
*.pem

# Debug
npm-debug.log*

# Local env files
.env*.local
.env

# Vercel
.vercel

# TypeScript
*.tsbuildinfo
`;
  }

  private generateReadme(projectName: string, plan: MigrationPlan): string {
    return `# ${projectName}

This is a Next.js project generated by SheenApps Migration Tool.

## Getting Started

Install dependencies:

\`\`\`bash
npm install
\`\`\`

Run the development server:

\`\`\`bash
npm run dev
\`\`\`

Open [http://localhost:3000](http://localhost:3000) to see the result.

## Project Structure

- **app/** - Next.js App Router pages (${plan.pages.length} pages)
- **components/** - Reusable components (${plan.componentLibrary.length} types)
- **public/** - Static assets

## Technology Stack

- Next.js 15 with App Router
- TypeScript
- Tailwind CSS
- React 19

---

Generated with [SheenApps](https://sheenapp.com) 🚀
`;
  }

  // ===========================================================================
  // DESIGN SYSTEM GENERATION
  // ===========================================================================

  private generateDesignSystem(plan: MigrationPlan): GeneratedFile[] {
    const files: GeneratedFile[] = [];

    // Tailwind config
    files.push({
      path: 'tailwind.config.ts',
      type: 'config',
      content: this.generateTailwindConfig(plan),
    });

    // PostCSS config
    files.push({
      path: 'postcss.config.js',
      type: 'config',
      content: `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`,
    });

    // Global styles
    files.push({
      path: 'app/globals.css',
      type: 'style',
      content: this.generateGlobalStyles(),
    });

    return files;
  }

  private generateTailwindConfig(plan: MigrationPlan): string {
    const { designSystem } = plan;
    const primaryColor = designSystem.colors.primary || '#3b82f6';
    const secondaryColor = designSystem.colors.secondary || '#8b5cf6';

    return `import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '${primaryColor}',
        secondary: '${secondaryColor}',
      },
    },
  },
  plugins: [],
};

export default config;
`;
  }

  private generateGlobalStyles(): string {
    return `@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --foreground-rgb: 0, 0, 0;
  --background-start-rgb: 255, 255, 255;
  --background-end-rgb: 255, 255, 255;
}

@media (prefers-color-scheme: dark) {
  :root {
    --foreground-rgb: 255, 255, 255;
    --background-start-rgb: 0, 0, 0;
    --background-end-rgb: 0, 0, 0;
  }
}

body {
  color: rgb(var(--foreground-rgb));
  background: linear-gradient(
      to bottom,
      transparent,
      rgb(var(--background-end-rgb))
    )
    rgb(var(--background-start-rgb));
}
`;
  }

  // ===========================================================================
  // PAGE GENERATION
  // ===========================================================================

  private generatePages(plan: MigrationPlan): GeneratedFile[] {
    const files: GeneratedFile[] = [];

    // Generate root layout
    files.push({
      path: 'app/layout.tsx',
      type: 'page',
      content: this.generateRootLayout(plan),
    });

    // Generate each page
    for (const page of plan.pages) {
      const pagePath = this.routeToFilePath(page.targetRoute);
      files.push({
        path: pagePath,
        type: 'page',
        content: this.generatePage(page),
      });
    }

    return files;
  }

  private generateRootLayout(plan: MigrationPlan): string {
    return `import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'My Next.js Site',
  description: 'Generated with SheenApps Migration Tool',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
`;
  }

  private generatePage(page: PagePlan): string {
    const componentName = this.routeToComponentName(page.targetRoute);
    // Use tsString() to safely escape metadata for single-quoted TypeScript strings
    const metaTitle = tsString(page.seoMetadata.title || page.title || 'Page');
    const metaDescription = tsString(page.seoMetadata.description || '');
    const pageTitle = tsString(page.title);
    const originalUrl = tsString(page.originalUrl);
    const componentTypes = page.components.map(c => c.type).join(', ');

    return `import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '${metaTitle}',
  description: '${metaDescription}',
};

export default function ${componentName}() {
  return (
    <div className="min-h-screen p-8">
      <h1 className="text-4xl font-bold mb-4">${pageTitle}</h1>
      <p className="text-gray-600">
        This page was migrated from: ${originalUrl}
      </p>
      {/* TODO: Add components: ${componentTypes} */}
    </div>
  );
}
`;
  }

  /**
   * Strip query strings and hash fragments from a route
   * Prevents invalid file paths like app/about?x=y/page.tsx
   */
  private cleanRoute(route: string): string {
    return route.split('?')[0]!.split('#')[0]!;
  }

  private routeToFilePath(route: string): string {
    const cleaned = this.cleanRoute(route);
    if (cleaned === '/') {
      return 'app/page.tsx';
    }
    const segments = cleaned.replace(/^\//, '').replace(/\/$/, '');
    return `app/${segments}/page.tsx`;
  }

  private routeToComponentName(route: string): string {
    const cleaned = this.cleanRoute(route);
    if (cleaned === '/') {
      return 'HomePage';
    }
    const parts = cleaned.split('/').filter(Boolean);
    // Handle hyphenated routes: /about-us → AboutUs, /my-blog-post → MyBlogPost
    const name = parts.map(part =>
      part.split('-').map(word =>
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      ).join('')
    ).join('');
    return `${name}Page`;
  }
}
