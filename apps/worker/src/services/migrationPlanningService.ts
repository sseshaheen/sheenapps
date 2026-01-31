/**
 * Migration Planning Service
 *
 * AI-powered planning phase that analyzes crawled website data and generates:
 * 1. Fine-grained component identification (Button, Input, Card, Form, etc.)
 * 2. Next.js App Router structure
 * 3. URL mappings for SEO-safe redirects
 *
 * Uses UnifiedClaudeService (CLI-based) for consistent AI execution
 */

import { getUnifiedClaudeService, UnifiedClaudeService } from './unifiedClaudeService';
import { unifiedLogger } from './unifiedLogger';
import { CrawlResult, PageResult } from './websiteCrawlerService';
import { UserBrief } from './aiMigrationService';

export interface ComponentIdentification {
  type: string; // 'Button', 'Input', 'Card', 'Form', 'Hero', 'Navigation', etc.
  role: string; // 'primary-cta', 'navigation-link', 'form-field', etc.
  content?: string; // Text content or description
  attributes?: Record<string, any>; // Extracted attributes (href, type, etc.)
}

export interface PagePlan {
  originalUrl: string;
  targetRoute: string;
  pageType: string; // 'landing', 'product', 'blog', 'about', 'contact', etc.
  title: string;
  components: ComponentIdentification[];
  seoMetadata: {
    title?: string;
    description?: string;
    keywords?: string[];
  };
}

export interface RouteStructure {
  path: string; // '/app/about/page.tsx'
  type: 'page' | 'layout' | 'not-found';
  dynamic?: boolean; // true for [slug] routes
}

export interface UrlMapping {
  sourceUrl: string;
  targetRoute: string;
  redirectCode: 301 | 302 | 307 | 308;
  reason: string; // Why this mapping exists
}

export interface DesignSystem {
  colors: {
    primary?: string;
    secondary?: string;
    accent?: string;
    background?: string;
    text?: string;
  };
  typography: {
    headingFont?: string;
    bodyFont?: string;
    scale?: 'tight' | 'normal' | 'spacious';
  };
  spacing: 'tight' | 'normal' | 'spacious';
  borderRadius?: 'none' | 'small' | 'medium' | 'large';
  shadows?: 'none' | 'subtle' | 'prominent';
}

export interface MigrationPlan {
  pages: PagePlan[];
  routes: RouteStructure[];
  urlMappings: UrlMapping[];
  designSystem: DesignSystem;
  componentLibrary: string[]; // Unique component types identified
  recommendations: string[];
  metadata: {
    totalPages: number;
    pagesAnalyzed: number;
    timestamp: string;
  };
}

export class MigrationPlanningService {
  private claudeService: UnifiedClaudeService;

  constructor() {
    this.claudeService = getUnifiedClaudeService();
  }

  /**
   * Generate migration plan from crawl results
   */
  async generatePlan(
    crawlResult: CrawlResult,
    userBrief: UserBrief
  ): Promise<MigrationPlan> {
    unifiedLogger.system('startup', 'info', 'Starting AI-powered migration planning', {
      totalPages: crawlResult.pages.length,
      assets: crawlResult.assets.length,
      userGoals: userBrief.goals,
    });

    // 1. Sample top 10 pages for analysis
    const sampled = this.sampleTopPages(crawlResult.pages, 10);

    // 2. Analyze with Claude Sonnet 4.5
    const aiPlan = await this.analyzeWithAI(sampled, crawlResult, userBrief);

    // 3. Generate route structure
    const routes = this.generateRouteStructure(aiPlan.pages, userBrief);

    // 4. Generate URL mappings
    const urlMappings = this.generateUrlMappings(crawlResult.pages, aiPlan.pages, userBrief);

    // 5. Build complete plan
    const plan: MigrationPlan = {
      pages: aiPlan.pages,
      routes,
      urlMappings,
      designSystem: aiPlan.designSystem,
      componentLibrary: this.extractComponentLibrary(aiPlan.pages),
      recommendations: aiPlan.recommendations,
      metadata: {
        totalPages: crawlResult.pages.length,
        pagesAnalyzed: sampled.length,
        timestamp: new Date().toISOString(),
      },
    };

    unifiedLogger.system('startup', 'info', 'Migration plan generated', {
      pages: plan.pages.length,
      routes: plan.routes.length,
      urlMappings: plan.urlMappings.length,
      componentTypes: plan.componentLibrary.length,
    });

    return plan;
  }

  /**
   * Sample top pages by importance (homepage + most linked)
   */
  private sampleTopPages(pages: PageResult[], limit: number): PageResult[] {
    // Always include homepage
    const homepage = pages.find(p =>
      p.url.endsWith('/') ||
      p.url.match(/\/(index\.(html?|php))?$/i)
    );

    // Sort remaining by number of inbound links
    const linkCounts = new Map<string, number>();
    pages.forEach(page => {
      page.links.forEach(link => {
        linkCounts.set(link, (linkCounts.get(link) || 0) + 1);
      });
    });

    const sorted = pages
      .filter(p => p !== homepage)
      .sort((a, b) => (linkCounts.get(b.url) || 0) - (linkCounts.get(a.url) || 0));

    const sampled = homepage ? [homepage, ...sorted.slice(0, limit - 1)] : sorted.slice(0, limit);

    unifiedLogger.system('startup', 'info', 'Sampled pages for AI analysis', {
      total: pages.length,
      sampled: sampled.length,
      hasHomepage: !!homepage,
    });

    return sampled;
  }

  /**
   * Analyze pages with Claude for fine-grained component identification
   * Uses UnifiedClaudeService (CLI-based) for consistent execution
   */
  private async analyzeWithAI(
    pages: PageResult[],
    fullCrawl: CrawlResult,
    userBrief: UserBrief
  ): Promise<{
    pages: PagePlan[];
    designSystem: DesignSystem;
    recommendations: string[];
  }> {
    const systemPrompt = this.buildSystemPrompt();
    const userPrompt = this.buildUserPrompt(pages, fullCrawl, userBrief);

    unifiedLogger.system('startup', 'info', 'Calling Claude CLI for component analysis', {
      pagesInPrompt: pages.length,
    });

    try {
      const result = await this.claudeService.execute<{
        pages: PagePlan[];
        designSystem: DesignSystem;
        recommendations: string[];
      }>({
        systemPrompt,
        userPrompt,
        maxTokens: 16000, // Large output for detailed component analysis
        outputFormat: 'json',
      });

      if (!result.success || !result.data) {
        throw new Error(result.error || 'AI analysis failed');
      }

      // Validate structure
      if (!result.data.pages || !Array.isArray(result.data.pages)) {
        throw new Error('Invalid response: missing pages array');
      }

      unifiedLogger.system('startup', 'info', 'AI analysis complete', {
        inputTokens: result.usage?.inputTokens ?? 0,
        outputTokens: result.usage?.outputTokens ?? 0,
        pagesAnalyzed: result.data.pages.length,
        duration: result.duration,
      });

      return {
        pages: result.data.pages,
        designSystem: result.data.designSystem || {},
        recommendations: result.data.recommendations || [],
      };

    } catch (error) {
      unifiedLogger.system('error', 'error', 'Claude CLI call failed', {
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Build system prompt for fine-grained component analysis
   */
  private buildSystemPrompt(): string {
    return `You are an expert Next.js migration specialist with deep knowledge of React component patterns, UI/UX design systems, and modern web development best practices.

Your task is to analyze website HTML and identify FINE-GRAINED components suitable for a Next.js 15 migration using App Router and Tailwind CSS.

## Fine-Grained Component Types

**Layout Components:**
- Header, Footer, Navigation, Sidebar, Container, Section, Wrapper

**Interactive Components:**
- Button, IconButton, Link, Anchor, Dropdown, Menu, Modal, Dialog, Drawer, Tabs, Accordion

**Form Components:**
- Form, Input, Textarea, Select, Checkbox, Radio, Switch, Label, FieldSet, ValidationMessage

**Display Components:**
- Card, Badge, Tag, Chip, Avatar, Image, Icon, Divider, Separator

**Content Components:**
- Hero, Heading, Paragraph, List, OrderedList, UnorderedList, Blockquote, Code, Pre

**Media Components:**
- ImageGallery, Carousel, VideoPlayer, AudioPlayer

**Data Components:**
- Table, DataGrid, Chart, Graph

**Feedback Components:**
- Alert, Toast, Notification, Progress, Spinner, Skeleton

**Navigation Components:**
- Breadcrumb, Pagination, Stepper

**Business Components:**
- PricingCard, Testimonial, FeatureList, TeamMember, ContactForm, Newsletter

## Analysis Guidelines

1. **Be Specific**: Identify Button vs IconButton, List vs OrderedList
2. **Extract Roles**: Each component should have a role (e.g., "primary-cta", "navigation-link")
3. **Capture Content**: Brief description of what the component displays
4. **Identify Patterns**: Reusable components that appear multiple times
5. **Respect User Intent**: Consider migration goals (preserve/modernize/uplift)

## Output Format

Return ONLY valid JSON (no markdown, no explanations):

{
  "pages": [
    {
      "originalUrl": "/about",
      "targetRoute": "/about",
      "pageType": "info",
      "title": "About Us",
      "components": [
        {
          "type": "Header",
          "role": "site-header",
          "content": "Logo and main navigation",
          "attributes": { "sticky": true }
        },
        {
          "type": "Hero",
          "role": "page-hero",
          "content": "About Us headline with background image"
        },
        {
          "type": "Button",
          "role": "primary-cta",
          "content": "Contact Us",
          "attributes": { "href": "/contact", "variant": "primary" }
        }
      ],
      "seoMetadata": {
        "title": "About Us - Company Name",
        "description": "Learn about our mission...",
        "keywords": ["about", "company", "team"]
      }
    }
  ],
  "designSystem": {
    "colors": {
      "primary": "#3B82F6",
      "secondary": "#8B5CF6",
      "background": "#FFFFFF",
      "text": "#1F2937"
    },
    "typography": {
      "headingFont": "Inter",
      "bodyFont": "Inter",
      "scale": "normal"
    },
    "spacing": "normal",
    "borderRadius": "medium",
    "shadows": "subtle"
  },
  "recommendations": [
    "Consider consolidating similar CTA buttons into a reusable Button component",
    "Homepage hero could benefit from lazy-loaded background image",
    "Forms should include client-side validation"
  ]
}`;
  }

  /**
   * Build user prompt with page samples
   */
  private buildUserPrompt(
    pages: PageResult[],
    fullCrawl: CrawlResult,
    userBrief: UserBrief
  ): string {
    // Summarize each page (don't send full HTML - too many tokens)
    const pageSummaries = pages.map((page, index) => {
      // Extract key elements from HTML
      const summary = this.extractPageSummary(page);
      return `
## Page ${index + 1}: ${page.url}
- **Title**: ${page.title}
- **Links Found**: ${page.links.length}
- **Summary**: ${summary}
`;
    }).join('\n');

    return `Analyze this website for Next.js 15 migration with FINE-GRAINED component identification.

## Migration Context

**Total Pages Crawled**: ${fullCrawl.pages.length}
**Assets Found**: ${fullCrawl.assets.length} (${fullCrawl.assets.filter(a => a.type === 'image').length} images, ${fullCrawl.assets.filter(a => a.type === 'css').length} stylesheets, ${fullCrawl.assets.filter(a => a.type === 'js').length} scripts)

**User Goals**: ${userBrief.goals}
- **Style**: ${JSON.stringify(userBrief.style_preferences)}
- **Framework**: ${JSON.stringify(userBrief.framework_preferences)}
- **Risk Appetite**: ${userBrief.risk_appetite}
${userBrief.custom_instructions ? `- **Custom Instructions**: ${userBrief.custom_instructions}` : ''}

## Pages to Analyze (Top ${pages.length})

${pageSummaries}

## Your Task

1. Identify ALL fine-grained components on each page (Button, Input, Card, etc.)
2. Assign roles to each component (e.g., "primary-cta", "navigation-link")
3. Extract design system (colors, fonts, spacing)
4. Generate target routes following Next.js App Router conventions
5. Provide actionable recommendations

Remember:
- ${userBrief.framework_preferences.strict_url_preservation ? '✅ STRICT URL PRESERVATION - Keep original URLs as much as possible' : '❌ Flexible URLs - Can consolidate/modernize routes'}
- ${userBrief.goals === 'preserve' ? '✅ PRESERVE design - Minimal changes' : userBrief.goals === 'modernize' ? '🔄 MODERNIZE - Update components to modern patterns' : '✨ UPLIFT - Complete redesign recommended'}

Return ONLY the JSON structure (no markdown code blocks).`;
  }

  /**
   * Extract page summary from HTML (avoid sending full HTML)
   */
  private extractPageSummary(page: PageResult): string {
    // Extract key information without full HTML
    const linkCount = page.links.length;
    const hasForm = page.html.toLowerCase().includes('<form');
    const imageCount = (page.html.match(/<img/gi) || []).length;
    const buttonCount = (page.html.match(/<button/gi) || []).length;
    const headingMatches = page.html.match(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi) || [];
    const headings = headingMatches.slice(0, 3).map(h =>
      h.replace(/<[^>]+>/g, '').trim()
    );

    return `${linkCount} links, ${imageCount} images, ${buttonCount} buttons${hasForm ? ', contains form' : ''}. Key headings: ${headings.join(', ')}`;
  }


  /**
   * Generate Next.js App Router structure
   */
  private generateRouteStructure(
    pages: PagePlan[],
    userBrief: UserBrief
  ): RouteStructure[] {
    const routes: RouteStructure[] = [];

    // Always include root layout
    routes.push({
      path: '/app/layout.tsx',
      type: 'layout',
      dynamic: false,
    });

    // Generate page routes
    pages.forEach(page => {
      const route = page.targetRoute;

      // Root page
      if (route === '/' || route === '') {
        routes.push({
          path: '/app/page.tsx',
          type: 'page',
          dynamic: false,
        });
      } else {
        // Nested pages
        const cleanRoute = route.replace(/^\//, '').replace(/\/$/, '');
        routes.push({
          path: `/app/${cleanRoute}/page.tsx`,
          type: 'page',
          dynamic: cleanRoute.includes('['),
        });
      }
    });

    // Add not-found page
    routes.push({
      path: '/app/not-found.tsx',
      type: 'not-found',
      dynamic: false,
    });

    return routes;
  }

  /**
   * Generate URL mappings for SEO redirects
   */
  private generateUrlMappings(
    allPages: PageResult[],
    analyzedPages: PagePlan[],
    userBrief: UserBrief
  ): UrlMapping[] {
    const mappings: UrlMapping[] = [];

    // Create map of analyzed URLs to target routes
    const routeMap = new Map<string, string>();
    analyzedPages.forEach(page => {
      routeMap.set(page.originalUrl, page.targetRoute);
    });

    allPages.forEach(page => {
      const sourceUrl = page.url;

      // Find target route (from analyzed pages or normalize)
      let targetRoute = routeMap.get(sourceUrl);

      if (!targetRoute) {
        // Auto-generate for unanalyzed pages
        targetRoute = this.normalizeUrl(sourceUrl, userBrief);
      }

      // Only create mapping if URLs differ
      if (sourceUrl !== targetRoute) {
        mappings.push({
          sourceUrl,
          targetRoute,
          redirectCode: 301, // Permanent redirect for SEO
          reason: sourceUrl.includes('.html')
            ? 'Remove .html extension'
            : 'Normalize URL structure',
        });
      }
    });

    return mappings;
  }

  /**
   * Normalize URL for Next.js routing
   */
  private normalizeUrl(url: string, userBrief: UserBrief): string {
    try {
      const parsed = new URL(url);
      let path = parsed.pathname;

      if (userBrief.framework_preferences.strict_url_preservation) {
        // Keep as close to original as possible
        return path;
      }

      // Remove file extensions
      path = path.replace(/\.(html?|php|asp|aspx)$/i, '');

      // Remove index
      path = path.replace(/\/index$/i, '');

      // Ensure leading slash
      if (!path.startsWith('/')) {
        path = '/' + path;
      }

      // Remove trailing slash (except root)
      if (path !== '/' && path.endsWith('/')) {
        path = path.slice(0, -1);
      }

      return path;

    } catch {
      // If URL parsing fails, return as-is
      return url;
    }
  }

  /**
   * Extract unique component types for component library
   */
  private extractComponentLibrary(pages: PagePlan[]): string[] {
    const types = new Set<string>();

    pages.forEach(page => {
      page.components.forEach(component => {
        types.add(component.type);
      });
    });

    return Array.from(types).sort();
  }
}
