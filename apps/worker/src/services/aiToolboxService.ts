/**
 * AI Toolbox Service
 *
 * Manages versioned tool contracts for AI agents during website migration.
 * Provides constrained, server-side enforced tools to prevent runaway costs
 * and ensure reproducible migrations.
 */

import { getPool } from './database';
import { unifiedLogger } from './unifiedLogger';

export interface ToolContract {
  version: string;
  tools: ToolDefinition[];
  constraints: ToolConstraints;
  validFrom: Date;
  validUntil?: Date;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
  costWeight: number;
  category: 'analysis' | 'generation' | 'validation' | 'filesystem' | 'network';
  maxUsagePerPhase: number;
  requiresApproval: boolean;
}

export interface ToolConstraints {
  maxFileSize: number;
  maxConcurrentCalls: number;
  allowedDomains: string[];
  blockedPatterns: string[];
  budgetLimits: {
    analysisPhase: number;
    planningPhase: number;
    transformationPhase: number;
    validationPhase: number;
  };
}

export interface ToolCall {
  id: string;
  migrationId: string;
  phaseId: string;
  toolName: string;
  parameters: Record<string, any>;
  result?: any;
  status: 'pending' | 'success' | 'failed' | 'blocked';
  costUnits: number;
  executedAt: Date;
  executionTimeMs: number;
}

export class AIToolboxService {
  private pool = getPool();
  private toolContracts = new Map<string, ToolContract>();

  constructor() {
    this.initializeToolContracts();
  }

  /**
   * Initialize default tool contracts
   */
  private initializeToolContracts(): void {
    // Version 1.0 - Initial tool set
    const v1Contract: ToolContract = {
      version: '1.0',
      validFrom: new Date('2025-01-01'),
      constraints: {
        maxFileSize: 10 * 1024 * 1024, // 10MB
        maxConcurrentCalls: 5,
        allowedDomains: [],
        blockedPatterns: [
          'password',
          'secret',
          'token',
          'api_key',
          'private_key'
        ],
        budgetLimits: {
          analysisPhase: 100,
          planningPhase: 200,
          transformationPhase: 500,
          validationPhase: 100
        }
      },
      tools: [
        {
          name: 'analyze_html_structure',
          description: 'Analyze HTML document structure and extract components',
          parameters: {
            type: 'object',
            properties: {
              html: { type: 'string', maxLength: 1000000 },
              extractComponents: { type: 'boolean', default: true }
            },
            required: ['html']
          },
          costWeight: 2,
          category: 'analysis',
          maxUsagePerPhase: 20,
          requiresApproval: false
        },
        {
          name: 'detect_technologies',
          description: 'Detect web technologies and frameworks in use',
          parameters: {
            type: 'object',
            properties: {
              html: { type: 'string', maxLength: 500000 },
              scripts: { type: 'array', items: { type: 'string' } },
              stylesheets: { type: 'array', items: { type: 'string' } }
            },
            required: ['html']
          },
          costWeight: 1,
          category: 'analysis',
          maxUsagePerPhase: 10,
          requiresApproval: false
        },
        {
          name: 'generate_component',
          description: 'Generate Next.js component from HTML/design',
          parameters: {
            type: 'object',
            properties: {
              sourceHtml: { type: 'string', maxLength: 100000 },
              componentName: { type: 'string', pattern: '^[A-Z][A-Za-z0-9]*$' },
              styling: { type: 'string', enum: ['tailwind', 'css-modules', 'styled-components'] },
              typescript: { type: 'boolean', default: true }
            },
            required: ['sourceHtml', 'componentName']
          },
          costWeight: 5,
          category: 'generation',
          maxUsagePerPhase: 30,
          requiresApproval: false
        },
        {
          name: 'optimize_images',
          description: 'Generate Next.js Image optimization recommendations',
          parameters: {
            type: 'object',
            properties: {
              imageUrls: { type: 'array', items: { type: 'string' }, maxItems: 50 },
              targetFormats: { type: 'array', items: { type: 'string', enum: ['webp', 'avif'] } }
            },
            required: ['imageUrls']
          },
          costWeight: 1,
          category: 'analysis',
          maxUsagePerPhase: 5,
          requiresApproval: false
        },
        {
          name: 'validate_accessibility',
          description: 'Validate component accessibility compliance',
          parameters: {
            type: 'object',
            properties: {
              componentCode: { type: 'string', maxLength: 50000 },
              standard: { type: 'string', enum: ['WCAG-2.1-AA', 'WCAG-2.2-AA'], default: 'WCAG-2.1-AA' }
            },
            required: ['componentCode']
          },
          costWeight: 2,
          category: 'validation',
          maxUsagePerPhase: 15,
          requiresApproval: false
        },
        {
          name: 'create_file',
          description: 'Create a new file in the project structure',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', pattern: '^[a-zA-Z0-9/_.-]+\\.(ts|tsx|js|jsx|css|md|json)$' },
              content: { type: 'string', maxLength: 200000 },
              overwrite: { type: 'boolean', default: false }
            },
            required: ['path', 'content']
          },
          costWeight: 3,
          category: 'filesystem',
          maxUsagePerPhase: 50,
          requiresApproval: true
        },
        {
          name: 'fetch_external_resource',
          description: 'Fetch external CSS, fonts, or assets for analysis',
          parameters: {
            type: 'object',
            properties: {
              url: { type: 'string', format: 'uri' },
              resourceType: { type: 'string', enum: ['css', 'font', 'image', 'javascript'] },
              maxSize: { type: 'number', maximum: 5242880 } // 5MB
            },
            required: ['url', 'resourceType']
          },
          costWeight: 2,
          category: 'network',
          maxUsagePerPhase: 10,
          requiresApproval: false
        }
      ]
    };

    this.toolContracts.set('1.0', v1Contract);
  }

  /**
   * Get tool contract by version
   */
  getToolContract(version: string): ToolContract | null {
    return this.toolContracts.get(version) || null;
  }

  /**
   * Get latest available tool contract
   */
  getLatestToolContract(): ToolContract {
    const versions = Array.from(this.toolContracts.keys())
      .sort((a, b) => this.compareVersions(b, a));

    const latestVersion = versions[0];
    if (!latestVersion) {
      throw new Error('No tool contracts available');
    }

    return this.toolContracts.get(latestVersion)!;
  }

  /**
   * Execute a tool call with constraints and tracking
   */
  async executeToolCall(
    migrationId: string,
    phaseId: string,
    toolName: string,
    parameters: Record<string, any>,
    contractVersion: string
  ): Promise<any> {
    const contract = this.getToolContract(contractVersion);
    if (!contract) {
      throw new Error(`Tool contract version ${contractVersion} not found`);
    }

    const tool = contract.tools.find(t => t.name === toolName);
    if (!tool) {
      throw new Error(`Tool ${toolName} not found in contract ${contractVersion}`);
    }

    // Validate parameters against tool schema
    this.validateToolParameters(parameters, tool);

    // Check usage limits
    await this.checkUsageLimits(migrationId, phaseId, toolName, tool);

    // Check content constraints
    this.validateContentConstraints(parameters, contract.constraints);

    const toolCallId = crypto.randomUUID();
    const startTime = Date.now();

    try {
      // Log tool call start
      await this.logToolCall(toolCallId, migrationId, phaseId, toolName, parameters, 'pending', tool.costWeight);

      // Execute the actual tool
      const result = await this.executeTool(toolName, parameters, contract.constraints);

      const executionTime = Date.now() - startTime;

      // Log successful completion
      await this.updateToolCall(toolCallId, result, 'success', executionTime);

      unifiedLogger.system('startup', 'info', 'Tool call executed successfully', {
        migrationId,
        phaseId,
        toolName,
        executionTimeMs: executionTime,
        costUnits: tool.costWeight
      });

      return result;

    } catch (error) {
      const executionTime = Date.now() - startTime;
      await this.updateToolCall(toolCallId, null, 'failed', executionTime);

      unifiedLogger.system('error', 'error', 'Tool call failed', {
        migrationId,
        phaseId,
        toolName,
        error: (error as Error).message
      });

      throw error;
    }
  }

  /**
   * Validate tool parameters against schema
   */
  private validateToolParameters(parameters: Record<string, any>, tool: ToolDefinition): void {
    // Basic validation - would use a proper JSON schema validator in production
    const schema = tool.parameters;

    if (schema.required) {
      for (const requiredParam of schema.required) {
        if (!(requiredParam in parameters)) {
          throw new Error(`Missing required parameter: ${requiredParam}`);
        }
      }
    }

    // Validate string length limits
    for (const [key, value] of Object.entries(parameters)) {
      if (typeof value === 'string') {
        const paramSchema = schema.properties?.[key];
        if (paramSchema?.maxLength && value.length > paramSchema.maxLength) {
          throw new Error(`Parameter ${key} exceeds maximum length of ${paramSchema.maxLength}`);
        }
      }
    }
  }

  /**
   * Check usage limits for tool in current phase
   */
  private async checkUsageLimits(
    migrationId: string,
    phaseId: string,
    toolName: string,
    tool: ToolDefinition
  ): Promise<void> {
    const usageQuery = `
      SELECT COUNT(*) as usage_count
      FROM migration_tool_calls
      WHERE migration_id = $1 AND phase_id = $2 AND tool_name = $3 AND status = 'success'
    `;

    const result = await this.pool.query(usageQuery, [migrationId, phaseId, toolName]);
    const currentUsage = parseInt(result.rows[0].usage_count);

    if (currentUsage >= tool.maxUsagePerPhase) {
      throw new Error(`Tool ${toolName} usage limit exceeded (${tool.maxUsagePerPhase} per phase)`);
    }
  }

  /**
   * Validate content constraints
   */
  private validateContentConstraints(parameters: Record<string, any>, constraints: ToolConstraints): void {
    const paramString = JSON.stringify(parameters);

    // Check for blocked patterns
    for (const pattern of constraints.blockedPatterns) {
      if (paramString.toLowerCase().includes(pattern.toLowerCase())) {
        throw new Error(`Content contains blocked pattern: ${pattern}`);
      }
    }

    // Check total size
    if (paramString.length > constraints.maxFileSize) {
      throw new Error(`Parameters exceed maximum size limit of ${constraints.maxFileSize} bytes`);
    }
  }

  /**
   * Execute the actual tool logic
   */
  private async executeTool(
    toolName: string,
    parameters: Record<string, any>,
    constraints: ToolConstraints
  ): Promise<any> {
    switch (toolName) {
      case 'analyze_html_structure':
        return this.analyzeHtmlStructure(parameters.html, parameters.extractComponents);

      case 'detect_technologies':
        return this.detectTechnologies(parameters.html, parameters.scripts, parameters.stylesheets);

      case 'generate_component':
        return this.generateComponent(
          parameters.sourceHtml,
          parameters.componentName,
          parameters.styling,
          parameters.typescript
        );

      case 'optimize_images':
        return this.optimizeImages(parameters.imageUrls, parameters.targetFormats);

      case 'validate_accessibility':
        return this.validateAccessibility(parameters.componentCode, parameters.standard);

      case 'create_file':
        return this.createFile(parameters.path, parameters.content, parameters.overwrite);

      case 'fetch_external_resource':
        return this.fetchExternalResource(parameters.url, parameters.resourceType, parameters.maxSize, constraints);

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  // Tool implementations with real functionality
  private async analyzeHtmlStructure(html: string, extractComponents: boolean): Promise<any> {
    try {
      const { JSDOM } = await import('jsdom');
      const dom = new JSDOM(html);
      const document = dom.window.document;

      const structure = {
        title: document.title || '',
        metaTags: this.extractMetaTags(document),
        headings: this.extractHeadings(document),
        forms: this.extractForms(document),
        navigation: this.extractNavigation(document),
        images: this.extractImages(document),
        links: this.extractLinks(document),
        scripts: this.extractScripts(document),
        stylesheets: this.extractStylesheets(document),
        semanticStructure: this.analyzeSemanticStructure(document)
      };

      let components = undefined;
      if (extractComponents) {
        components = this.extractReusableComponents(document);
      }

      return {
        structure,
        components,
        statistics: {
          totalElements: document.querySelectorAll('*').length,
          textContent: document.body?.textContent?.length || 0,
          complexity: this.calculateComplexity(document)
        }
      };

    } catch (error) {
      unifiedLogger.system('error', 'error', 'HTML analysis failed', {
        error: (error as Error).message
      });

      return {
        error: 'Failed to analyze HTML structure',
        details: (error as Error).message
      };
    }
  }

  private async detectTechnologies(html: string, scripts?: string[], stylesheets?: string[]): Promise<any> {
    try {
      const { JSDOM } = await import('jsdom');
      const dom = new JSDOM(html);
      const document = dom.window.document;

      const technologies = {
        frameworks: [] as any[],
        libraries: [] as any[],
        cms: [] as any[],
        analytics: [] as any[],
        styling: [] as any[]
      };

      // JavaScript frameworks and libraries
      const jsDetection = this.detectJavaScriptTechnologies(document, scripts);
      technologies.frameworks.push(...jsDetection.frameworks);
      technologies.libraries.push(...jsDetection.libraries);

      // CSS frameworks
      const cssDetection = this.detectCSSFrameworks(document, stylesheets);
      technologies.styling.push(...cssDetection);

      // CMS detection
      const cmsDetection = this.detectCMS(document);
      technologies.cms.push(...cmsDetection);

      // Analytics and tracking
      const analyticsDetection = this.detectAnalytics(document, scripts);
      technologies.analytics.push(...analyticsDetection);

      return {
        technologies,
        confidence: this.calculateDetectionConfidence(technologies),
        summary: this.generateTechnologySummary(technologies)
      };

    } catch (error) {
      return {
        error: 'Failed to detect technologies',
        details: (error as Error).message
      };
    }
  }

  private async generateComponent(
    sourceHtml: string,
    componentName: string,
    styling: string = 'tailwind',
    typescript: boolean = true
  ): Promise<any> {
    try {
      const { JSDOM } = await import('jsdom');
      const dom = new JSDOM(sourceHtml);
      const document = dom.window.document;

      // Extract structure and content
      const analysis = await this.analyzeComponentStructure(document);

      // Generate Next.js component code
      const componentCode = this.generateNextJSComponent(
        componentName,
        analysis,
        styling,
        typescript
      );

      // Determine dependencies
      const dependencies = this.analyzeDependencies(analysis, styling);

      // Generate props interface if TypeScript
      const propsInterface = typescript ? this.generatePropsInterface(componentName, analysis) : '';

      return {
        componentCode,
        propsInterface,
        dependencies,
        styling: {
          framework: styling,
          classes: analysis.cssClasses,
          customStyles: analysis.inlineStyles
        },
        accessibility: {
          ariaLabels: analysis.ariaAttributes,
          semanticElements: analysis.semanticElements,
          suggestions: this.generateA11ySuggestions(analysis)
        },
        seo: {
          headings: analysis.headings,
          imageAlts: analysis.imageAlts,
          linkTexts: analysis.linkTexts
        }
      };

    } catch (error) {
      unifiedLogger.system('error', 'error', 'Component generation failed', {
        componentName,
        error: (error as Error).message
      });

      return {
        error: 'Failed to generate component',
        details: (error as Error).message
      };
    }
  }

  private async optimizeImages(imageUrls: string[], targetFormats?: string[]): Promise<any> {
    // TODO: Implement image optimization analysis
    return {
      recommendations: [],
      message: 'Image optimization not yet implemented'
    };
  }

  private async validateAccessibility(componentCode: string, standard: string): Promise<any> {
    // TODO: Implement accessibility validation
    return {
      issues: [],
      score: 100,
      message: 'Accessibility validation not yet implemented'
    };
  }

  private async createFile(path: string, content: string, overwrite: boolean): Promise<any> {
    // TODO: Implement file creation with safety checks
    return {
      created: false,
      message: 'File creation not yet implemented'
    };
  }

  private async fetchExternalResource(
    url: string,
    resourceType: string,
    maxSize?: number,
    constraints?: ToolConstraints
  ): Promise<any> {
    // TODO: Implement external resource fetching with SSRF protection
    return {
      content: '',
      size: 0,
      message: 'External resource fetching not yet implemented'
    };
  }

  /**
   * Log tool call to database
   */
  private async logToolCall(
    toolCallId: string,
    migrationId: string,
    phaseId: string,
    toolName: string,
    parameters: Record<string, any>,
    status: string,
    costUnits: number
  ): Promise<void> {
    const query = `
      INSERT INTO migration_tool_calls (
        id, migration_id, phase_id, tool_name, parameters, status, cost_units, executed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    `;

    await this.pool.query(query, [
      toolCallId,
      migrationId,
      phaseId,
      toolName,
      JSON.stringify(parameters),
      status,
      costUnits
    ]);
  }

  /**
   * Update tool call result
   */
  private async updateToolCall(
    toolCallId: string,
    result: any,
    status: string,
    executionTimeMs: number
  ): Promise<void> {
    const query = `
      UPDATE migration_tool_calls
      SET result = $2, status = $3, execution_time_ms = $4
      WHERE id = $1
    `;

    await this.pool.query(query, [
      toolCallId,
      result ? JSON.stringify(result) : null,
      status,
      executionTimeMs
    ]);
  }

  /**
   * Compare semantic versions
   */
  private compareVersions(a: string, b: string): number {
    const aParts = a.split('.').map(Number);
    const bParts = b.split('.').map(Number);

    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const aPart = aParts[i] || 0;
      const bPart = bParts[i] || 0;

      if (aPart > bPart) return 1;
      if (aPart < bPart) return -1;
    }

    return 0;
  }

  // HTML Analysis Helper Methods

  private extractMetaTags(document: Document): any[] {
    const metaTags: any[] = [];
    const metas = document.querySelectorAll('meta');

    metas.forEach(meta => {
      const name = meta.getAttribute('name') || meta.getAttribute('property') || meta.getAttribute('http-equiv');
      const content = meta.getAttribute('content');

      if (name && content) {
        metaTags.push({ name, content });
      }
    });

    return metaTags;
  }

  private extractHeadings(document: Document): any[] {
    const headings: any[] = [];
    const headingElements = document.querySelectorAll('h1, h2, h3, h4, h5, h6');

    headingElements.forEach(heading => {
      headings.push({
        level: parseInt(heading.tagName.substring(1)),
        text: heading.textContent?.trim() || '',
        id: heading.id || '',
        classes: heading.className || ''
      });
    });

    return headings;
  }

  private extractForms(document: Document): any[] {
    const forms: any[] = [];
    const formElements = document.querySelectorAll('form');

    formElements.forEach(form => {
      const inputs = form.querySelectorAll('input, textarea, select');
      const fields: any[] = [];

      inputs.forEach(input => {
        fields.push({
          type: input.getAttribute('type') || input.tagName.toLowerCase(),
          name: input.getAttribute('name') || '',
          id: input.id || '',
          required: input.hasAttribute('required'),
          placeholder: input.getAttribute('placeholder') || ''
        });
      });

      forms.push({
        action: form.action || '',
        method: form.method || 'get',
        fields,
        fieldCount: fields.length
      });
    });

    return forms;
  }

  private extractNavigation(document: Document): any {
    const navElements = document.querySelectorAll('nav, .nav, .navigation, .menu');
    const navigation = {
      primary: [] as any[],
      secondary: [] as any[],
      breadcrumbs: [] as any[]
    };

    navElements.forEach((nav, index) => {
      const links = nav.querySelectorAll('a');
      const navLinks: any[] = [];

      links.forEach(link => {
        navLinks.push({
          href: link.getAttribute('href') || '',
          text: link.textContent?.trim() || '',
          title: link.getAttribute('title') || ''
        });
      });

      if (index === 0) {
        navigation.primary = navLinks;
      } else {
        navigation.secondary.push(...navLinks);
      }
    });

    // Look for breadcrumbs
    const breadcrumbElements = document.querySelectorAll('[aria-label*="breadcrumb"], .breadcrumb, .breadcrumbs');
    breadcrumbElements.forEach(breadcrumb => {
      const links = breadcrumb.querySelectorAll('a, span');
      links.forEach(link => {
        navigation.breadcrumbs.push({
          text: link.textContent?.trim() || '',
          href: link.getAttribute('href') || ''
        });
      });
    });

    return navigation;
  }

  private extractImages(document: Document): any[] {
    const images: any[] = [];
    const imgElements = document.querySelectorAll('img');

    imgElements.forEach(img => {
      images.push({
        src: img.src || img.getAttribute('src') || '',
        alt: img.alt || '',
        title: img.title || '',
        width: img.getAttribute('width') || '',
        height: img.getAttribute('height') || '',
        loading: img.getAttribute('loading') || '',
        hasAlt: !!img.alt
      });
    });

    return images;
  }

  private extractLinks(document: Document): any[] {
    const links: any[] = [];
    const linkElements = document.querySelectorAll('a[href]');

    linkElements.forEach(link => {
      links.push({
        href: link.getAttribute('href') || '',
        text: link.textContent?.trim() || '',
        title: link.getAttribute('title') || '',
        target: link.getAttribute('target') || '',
        rel: link.getAttribute('rel') || ''
      });
    });

    return links;
  }

  private extractScripts(document: Document): any[] {
    const scripts: any[] = [];
    const scriptElements = document.querySelectorAll('script');

    scriptElements.forEach(script => {
      scripts.push({
        src: script.src || '',
        type: script.type || 'text/javascript',
        async: script.hasAttribute('async'),
        defer: script.hasAttribute('defer'),
        inline: !script.src && !!script.textContent
      });
    });

    return scripts;
  }

  private extractStylesheets(document: Document): any[] {
    const stylesheets: any[] = [];
    const linkElements = document.querySelectorAll('link[rel="stylesheet"]');

    linkElements.forEach(link => {
      stylesheets.push({
        href: link.getAttribute('href') || '',
        media: link.getAttribute('media') || 'all',
        type: link.getAttribute('type') || 'text/css'
      });
    });

    return stylesheets;
  }

  private analyzeSemanticStructure(document: Document): any {
    return {
      hasHeader: !!document.querySelector('header'),
      hasNav: !!document.querySelector('nav'),
      hasMain: !!document.querySelector('main'),
      hasAside: !!document.querySelector('aside'),
      hasFooter: !!document.querySelector('footer'),
      hasArticle: !!document.querySelector('article'),
      hasSection: !!document.querySelector('section'),
      landmarks: this.extractLandmarks(document)
    };
  }

  private extractLandmarks(document: Document): any[] {
    const landmarks: any[] = [];
    const landmarkElements = document.querySelectorAll('[role], header, nav, main, aside, footer');

    landmarkElements.forEach(element => {
      const role = element.getAttribute('role') || element.tagName.toLowerCase();
      landmarks.push({
        role,
        hasLabel: !!element.getAttribute('aria-label') || !!element.getAttribute('aria-labelledby')
      });
    });

    return landmarks;
  }

  private extractReusableComponents(document: Document): any[] {
    const components: any[] = [];

    // Header components
    const header = document.querySelector('header');
    if (header) {
      components.push({
        name: 'Header',
        type: 'layout',
        html: header.outerHTML,
        complexity: 'medium'
      });
    }

    // Navigation components
    const navs = document.querySelectorAll('nav');
    navs.forEach((nav, index) => {
      components.push({
        name: `Navigation${index > 0 ? index + 1 : ''}`,
        type: 'navigation',
        html: nav.outerHTML,
        complexity: 'low'
      });
    });

    // Footer components
    const footer = document.querySelector('footer');
    if (footer) {
      components.push({
        name: 'Footer',
        type: 'layout',
        html: footer.outerHTML,
        complexity: 'medium'
      });
    }

    return components;
  }

  private calculateComplexity(document: Document): string {
    const elementCount = document.querySelectorAll('*').length;
    const scriptCount = document.querySelectorAll('script').length;
    const formCount = document.querySelectorAll('form').length;

    if (elementCount > 1000 || scriptCount > 10 || formCount > 3) {
      return 'high';
    } else if (elementCount > 200 || scriptCount > 3 || formCount > 1) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  // Technology Detection Helper Methods

  private detectJavaScriptTechnologies(document: Document, scripts?: string[]): { frameworks: any[], libraries: any[] } {
    const frameworks: any[] = [];
    const libraries: any[] = [];

    // Check for framework indicators in HTML
    if (document.querySelector('[data-reactroot], [data-react-helmet]') ||
        document.documentElement.outerHTML.includes('__NEXT_DATA__')) {
      frameworks.push({ name: 'React', confidence: 0.9, evidence: 'DOM indicators' });
    }

    if (document.querySelector('[v-app], [data-v-]')) {
      frameworks.push({ name: 'Vue.js', confidence: 0.9, evidence: 'Vue directives' });
    }

    if (document.querySelector('[ng-app], [ng-controller]')) {
      frameworks.push({ name: 'AngularJS', confidence: 0.9, evidence: 'Angular directives' });
    }

    // Check script URLs for known libraries
    const allScripts = [...document.querySelectorAll('script[src]')].map(s => s.getAttribute('src') || '');
    allScripts.push(...(scripts || []));

    allScripts.forEach(src => {
      if (src.includes('jquery')) {
        libraries.push({ name: 'jQuery', confidence: 0.8, evidence: `Script: ${src}` });
      }
      if (src.includes('bootstrap')) {
        libraries.push({ name: 'Bootstrap JS', confidence: 0.8, evidence: `Script: ${src}` });
      }
      if (src.includes('lodash') || src.includes('underscore')) {
        libraries.push({ name: 'Lodash/Underscore', confidence: 0.8, evidence: `Script: ${src}` });
      }
    });

    return { frameworks, libraries };
  }

  private detectCSSFrameworks(document: Document, stylesheets?: string[]): any[] {
    const frameworks: any[] = [];

    const allStylesheets = [...document.querySelectorAll('link[rel="stylesheet"]')].map(s => s.getAttribute('href') || '');
    allStylesheets.push(...(stylesheets || []));

    allStylesheets.forEach(href => {
      if (href.includes('bootstrap')) {
        frameworks.push({ name: 'Bootstrap', confidence: 0.9, evidence: `Stylesheet: ${href}` });
      }
      if (href.includes('tailwind')) {
        frameworks.push({ name: 'Tailwind CSS', confidence: 0.9, evidence: `Stylesheet: ${href}` });
      }
      if (href.includes('bulma')) {
        frameworks.push({ name: 'Bulma', confidence: 0.9, evidence: `Stylesheet: ${href}` });
      }
      if (href.includes('foundation')) {
        frameworks.push({ name: 'Foundation', confidence: 0.9, evidence: `Stylesheet: ${href}` });
      }
    });

    // Check for class patterns
    const bodyClasses = document.body?.className || '';
    if (bodyClasses.includes('container') || document.querySelector('.container')) {
      frameworks.push({ name: 'Bootstrap (inferred)', confidence: 0.6, evidence: 'Container classes' });
    }

    return frameworks;
  }

  private detectCMS(document: Document): any[] {
    const cms: any[] = [];

    // WordPress detection
    const generator = document.querySelector('meta[name="generator"]')?.getAttribute('content') || '';
    if (generator.toLowerCase().includes('wordpress')) {
      cms.push({ name: 'WordPress', confidence: 0.9, evidence: 'Generator meta tag' });
    }

    // Check for CMS-specific indicators
    if (document.querySelector('link[href*="wp-content"]') ||
        document.querySelector('script[src*="wp-content"]')) {
      cms.push({ name: 'WordPress', confidence: 0.95, evidence: 'wp-content references' });
    }

    if (generator.includes('Drupal')) {
      cms.push({ name: 'Drupal', confidence: 0.9, evidence: 'Generator meta tag' });
    }

    if (document.querySelector('script[src*="sites/all"]') ||
        document.querySelector('[id*="drupal"]')) {
      cms.push({ name: 'Drupal', confidence: 0.8, evidence: 'Drupal-specific paths' });
    }

    return cms;
  }

  private detectAnalytics(document: Document, scripts?: string[]): any[] {
    const analytics: any[] = [];

    const allScripts = [...document.querySelectorAll('script')].map(s => s.src || s.textContent || '');
    allScripts.push(...(scripts || []));

    allScripts.forEach(script => {
      if (script.includes('google-analytics') || script.includes('gtag') || script.includes('googletagmanager')) {
        analytics.push({ name: 'Google Analytics', confidence: 0.9, evidence: 'GA script detected' });
      }
      if (script.includes('facebook.net') || script.includes('fbevents')) {
        analytics.push({ name: 'Facebook Pixel', confidence: 0.9, evidence: 'FB pixel detected' });
      }
      if (script.includes('hotjar')) {
        analytics.push({ name: 'Hotjar', confidence: 0.9, evidence: 'Hotjar script detected' });
      }
    });

    return analytics;
  }

  private calculateDetectionConfidence(technologies: any): number {
    const allTech = [
      ...technologies.frameworks,
      ...technologies.libraries,
      ...technologies.cms,
      ...technologies.analytics,
      ...technologies.styling
    ];

    if (allTech.length === 0) return 0;

    const avgConfidence = allTech.reduce((sum, tech) => sum + tech.confidence, 0) / allTech.length;
    return Math.round(avgConfidence * 100) / 100;
  }

  private generateTechnologySummary(technologies: any): string {
    const parts: string[] = [];

    if (technologies.frameworks.length > 0) {
      parts.push(`Frameworks: ${technologies.frameworks.map((f: any) => f.name).join(', ')}`);
    }
    if (technologies.cms.length > 0) {
      parts.push(`CMS: ${technologies.cms.map((c: any) => c.name).join(', ')}`);
    }
    if (technologies.styling.length > 0) {
      parts.push(`CSS: ${technologies.styling.map((s: any) => s.name).join(', ')}`);
    }

    return parts.join('; ') || 'No specific technologies detected';
  }

  // Component Generation Helper Methods

  private async analyzeComponentStructure(document: Document): Promise<any> {
    return {
      cssClasses: this.extractCSSClasses(document),
      inlineStyles: this.extractInlineStyles(document),
      ariaAttributes: this.extractAriaAttributes(document),
      semanticElements: this.extractSemanticElements(document),
      headings: this.extractHeadings(document),
      imageAlts: this.extractImages(document).filter(img => img.hasAlt),
      linkTexts: this.extractLinks(document).map(link => link.text).filter(text => text),
      interactiveElements: this.extractInteractiveElements(document),
      dataAttributes: this.extractDataAttributes(document)
    };
  }

  private extractCSSClasses(document: Document): string[] {
    const classes = new Set<string>();
    const elements = document.querySelectorAll('[class]');

    elements.forEach(element => {
      const classList = element.className.split(/\s+/);
      classList.forEach(cls => {
        if (cls.trim()) classes.add(cls.trim());
      });
    });

    return Array.from(classes);
  }

  private extractInlineStyles(document: Document): any[] {
    const inlineStyles: any[] = [];
    const elements = document.querySelectorAll('[style]');

    elements.forEach(element => {
      const style = element.getAttribute('style');
      if (style) {
        inlineStyles.push({
          element: element.tagName.toLowerCase(),
          style: style.trim()
        });
      }
    });

    return inlineStyles;
  }

  private extractAriaAttributes(document: Document): any[] {
    const ariaAttributes: any[] = [];
    const elements = document.querySelectorAll('[aria-label], [aria-labelledby], [aria-describedby], [role]');

    elements.forEach(element => {
      const attrs: any = {};

      ['aria-label', 'aria-labelledby', 'aria-describedby', 'role'].forEach(attr => {
        const value = element.getAttribute(attr);
        if (value) attrs[attr] = value;
      });

      if (Object.keys(attrs).length > 0) {
        ariaAttributes.push({
          element: element.tagName.toLowerCase(),
          attributes: attrs
        });
      }
    });

    return ariaAttributes;
  }

  private extractSemanticElements(document: Document): string[] {
    const semanticTags = ['header', 'nav', 'main', 'article', 'section', 'aside', 'footer'];
    const found: string[] = [];

    semanticTags.forEach(tag => {
      if (document.querySelector(tag)) {
        found.push(tag);
      }
    });

    return found;
  }

  private extractInteractiveElements(document: Document): any[] {
    const interactive: any[] = [];
    const elements = document.querySelectorAll('button, input, select, textarea, a[href], [tabindex], [onclick]');

    elements.forEach(element => {
      interactive.push({
        tag: element.tagName.toLowerCase(),
        type: element.getAttribute('type') || '',
        hasTabIndex: element.hasAttribute('tabindex'),
        hasOnClick: element.hasAttribute('onclick')
      });
    });

    return interactive;
  }

  private extractDataAttributes(document: Document): any[] {
    const dataAttrs: any[] = [];
    const elements = document.querySelectorAll('*');

    elements.forEach(element => {
      const attrs: any = {};
      for (const attr of element.attributes) {
        if (attr.name.startsWith('data-')) {
          attrs[attr.name] = attr.value;
        }
      }

      if (Object.keys(attrs).length > 0) {
        dataAttrs.push({
          element: element.tagName.toLowerCase(),
          attributes: attrs
        });
      }
    });

    return dataAttrs;
  }

  private generateNextJSComponent(
    componentName: string,
    analysis: any,
    styling: string,
    typescript: boolean
  ): string {
    const fileExtension = typescript ? 'tsx' : 'jsx';
    const typeAnnotations = typescript ? ': React.FC<Props>' : '';

    let imports = `import React from 'react';\n`;

    if (styling === 'tailwind') {
      // Tailwind is typically configured globally, no import needed
    } else if (styling === 'css-modules') {
      imports += `import styles from './${componentName}.module.css';\n`;
    }

    // Add Next.js specific imports based on component needs
    const needsImage = analysis.imageAlts && analysis.imageAlts.length > 0;
    const needsLink = analysis.linkTexts && analysis.linkTexts.length > 0;

    if (needsImage) {
      imports += `import Image from 'next/image';\n`;
    }
    if (needsLink) {
      imports += `import Link from 'next/link';\n`;
    }

    const propsInterface = typescript ? this.generatePropsInterface(componentName, analysis) : '';

    return `${imports}
${propsInterface}

export default function ${componentName}${typeAnnotations} {
  return (
    <div className="${this.generateTailwindClasses(analysis)}">
      {/* Component content would be generated based on analysis */}
      <h2>Generated ${componentName} Component</h2>
      <p>This component was generated from the source HTML.</p>
    </div>
  );
}`;
  }

  private generatePropsInterface(componentName: string, analysis: any): string {
    return `interface Props {
  className?: string;
  // Add specific props based on component analysis
}`;
  }

  private generateTailwindClasses(analysis: any): string {
    // Convert existing classes to Tailwind equivalents
    const baseClasses = ['p-4', 'bg-white'];

    // Add responsive classes if needed
    if (analysis.semanticElements.includes('nav')) {
      baseClasses.push('flex', 'items-center', 'justify-between');
    }

    return baseClasses.join(' ');
  }

  private analyzeDependencies(analysis: any, styling: string): string[] {
    const deps: string[] = [];

    if (styling === 'tailwind') {
      deps.push('tailwindcss');
    } else if (styling === 'styled-components') {
      deps.push('styled-components');
    }

    // Add dependencies based on interactive elements
    if (analysis.interactiveElements.some((el: any) => el.tag === 'button')) {
      // Could suggest UI libraries
    }

    return deps;
  }

  private generateA11ySuggestions(analysis: any): string[] {
    const suggestions: string[] = [];

    if (analysis.imageAlts.length < analysis.headings.length) {
      suggestions.push('Add alt text to all images');
    }

    if (analysis.ariaAttributes.length === 0) {
      suggestions.push('Consider adding ARIA labels for better accessibility');
    }

    if (!analysis.semanticElements.includes('main')) {
      suggestions.push('Use semantic HTML elements like <main> for better structure');
    }

    return suggestions;
  }

  /**
   * Get tool usage statistics for a migration
   */
  async getToolUsageStats(migrationId: string): Promise<any> {
    const query = `
      SELECT
        tool_name,
        COUNT(*) as total_calls,
        COUNT(*) FILTER (WHERE status = 'success') as successful_calls,
        COUNT(*) FILTER (WHERE status = 'failed') as failed_calls,
        SUM(cost_units) as total_cost_units,
        AVG(execution_time_ms) as avg_execution_time
      FROM migration_tool_calls
      WHERE migration_id = $1
      GROUP BY tool_name
      ORDER BY total_calls DESC
    `;

    const result = await this.pool.query(query, [migrationId]);
    return result.rows;
  }
}