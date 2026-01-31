/**
 * AI Prompt Service
 *
 * Manages system prompts and user brief injection for the AI agents
 * in the website migration tool. Provides templated prompts for each
 * agent role with consistent formatting and tool documentation.
 */

import { unifiedLogger } from './unifiedLogger';

export interface UserBrief {
  goals: 'preserve' | 'modernize' | 'uplift';
  style_preferences?: {
    colors?: string[];
    typography?: 'minimal' | 'expressive' | 'classic';
    spacing?: 'tight' | 'normal' | 'spacious';
    motion?: 'none' | 'subtle' | 'dynamic';
  };
  framework_preferences?: {
    strict_url_preservation?: boolean;
    allow_route_consolidation?: boolean;
    prefer_ssg?: boolean;
  };
  content_tone?: 'neutral' | 'marketing' | 'formal';
  non_negotiables?: {
    brand_colors?: string[];
    legal_text?: string[];
    tracking_ids?: string[];
  };
  risk_appetite?: 'conservative' | 'balanced' | 'bold';
  custom_instructions?: string;
}

export interface SiteAnalysisData {
  technologies: Array<{
    category: string;
    name: string;
    version?: string;
    confidence: number;
  }>;
  structure: {
    totalPages: number;
    pageTypes: Array<{ type: string; count: number }>;
  };
  content: {
    totalText: number;
    languages: string[];
    forms: Array<{ type: string; action: string }>;
  };
  performance: {
    loadTime: number;
    totalRequests: number;
    totalSize: number;
  };
  seo: {
    hasMetaDescription: boolean;
    hasTitleTags: boolean;
    hasStructuredData: boolean;
  };
}

export interface MigrationPlan {
  steps: Array<{
    tool: string;
    args: Record<string, any>;
    why: string;
  }>;
  budgets: {
    tokens: number;
    tool_calls: number;
    max_wall_minutes: number;
  };
}

export class AIPromptService {
  private readonly SYSTEM_VERSION = '1.0.0';
  private readonly TARGET_STACK = 'Next.js 14 App Router + SSG + Tailwind CSS';

  /**
   * Get base system prompt with global constraints and toolbox documentation
   */
  async getSystemPrompt(): Promise<string> {
    return `You are an expert website migration specialist working with a constrained toolbox to migrate websites to modern ${this.TARGET_STACK} projects.

## Core Principles

1. **Quality First**: Every migration must pass quality gates (build success, performance, accessibility, SEO)
2. **User Brief Driven**: Always follow the user's stated goals, preferences, and non-negotiables
3. **Tool Budget Aware**: Respect token limits and tool call constraints
4. **Reproducible**: Use deterministic approaches where possible, document reasoning
5. **Safety**: Never break builds, always preserve SEO value, maintain security

## Available Toolbox (Version ${this.SYSTEM_VERSION})

### Analysis Tools
- \`analyze_html_structure\`: Extract components and structure from HTML
- \`detect_technologies\`: Identify frameworks, libraries, and patterns in use

### Generation Tools
- \`generate_component\`: Create Next.js component from HTML/design
- \`optimize_images\`: Generate Next.js Image optimization recommendations

### Validation Tools
- \`validate_accessibility\`: Check WCAG compliance of generated components
- \`verifier.run\`: Run quality gates (visual, performance, a11y, redirects)

### File Operations
- \`create_file\`: Create new files in project (requires approval for writes)
- \`project.read\`: Read existing project files
- \`project.patch\`: Apply minimal edits to existing files

### Network Tools
- \`fetch_external_resource\`: Fetch CSS, fonts, or assets for analysis (SSRF protected)

## Quality Thresholds (Must-Not-Regress)
- Build success: 100% (no build failures allowed)
- Redirect accuracy: 95% (preserve SEO value)
- Lighthouse performance: 80+ (maintain speed)
- WCAG A compliance: 90%+ (accessibility)
- Legacy block ratio: <25% (minimize unsanitized content)

## Output Format Requirements

Always respond with valid JSON matching the expected schema for your agent role.
Include \`why\` explanations for each decision.
Respect budget constraints provided in the context.

## Error Handling

If a tool call fails:
1. Log the error details
2. Try alternative approaches within budget
3. If no alternatives work, suggest escalation to user with specific fixes needed

Remember: You are part of an AI agent pipeline. Focus on your specific role while maintaining awareness of the overall migration quality and user satisfaction.`;
  }

  /**
   * Get Planner Agent prompt for migration plan generation
   */
  async getPlannerPrompt(siteData: SiteAnalysisData, userBrief: UserBrief): Promise<string> {
    const briefSummary = this.formatUserBrief(userBrief);
    const siteSummary = this.formatSiteAnalysis(siteData);

    return `${await this.getSystemPrompt()}

## Your Role: Migration Planner

You analyze the source website and user requirements to create a detailed migration plan.

## Site Analysis Summary
${siteSummary}

## User Brief
${briefSummary}

## Your Task

Create a comprehensive migration plan that:
1. Respects the user's goals and preferences
2. Handles the detected technologies appropriately
3. Preserves SEO value through proper URL mapping
4. Stays within budget constraints
5. Includes quality validation steps

## Output Schema

Return JSON matching this exact structure:

\`\`\`json
{
  "steps": [
    {
      "tool": "analyze_html_structure",
      "args": { "html": "...", "extractComponents": true },
      "why": "Extract reusable components from the homepage"
    },
    {
      "tool": "generate_component",
      "args": { "sourceHtml": "...", "componentName": "Header" },
      "why": "Create modern Header component with navigation"
    }
  ],
  "budgets": {
    "tokens": 25000,
    "tool_calls": 50,
    "max_wall_minutes": 15
  },
  "url_mapping": [
    {
      "src": "/old-page.html",
      "target": "/new-page",
      "redirect_code": 301,
      "why": "Preserve SEO value with permanent redirect"
    }
  ],
  "risk_assessment": {
    "complexity": "medium",
    "legacy_content_ratio": 15,
    "estimated_success": 90
  }
}
\`\`\`

Focus on creating a plan that the Transformer Agent can execute step-by-step within the specified budget.`;
  }

  /**
   * Get Transformer Agent prompt for code generation and transformation
   */
  async getTransformerPrompt(plan: MigrationPlan, userBrief: UserBrief): Promise<string> {
    const briefSummary = this.formatUserBrief(userBrief);

    return `${await this.getSystemPrompt()}

## Your Role: Migration Transformer

You execute the migration plan by generating modern ${this.TARGET_STACK} code that matches the user's requirements.

## Migration Plan to Execute
${JSON.stringify(plan, null, 2)}

## User Brief
${briefSummary}

## Your Task

Execute each step in the migration plan:
1. Follow the exact sequence of tool calls
2. Generate clean, modern code that follows Next.js 14 best practices
3. Apply user style preferences throughout
4. Ensure all components are accessible and performant
5. Preserve content hierarchy and SEO structure

## Code Generation Standards

### Next.js 14 App Router
- Use app directory structure: \`app/page.tsx\`, \`app/layout.tsx\`
- Implement Server Components by default
- Use Client Components only when needed (\`'use client'\`)
- Generate proper metadata exports for SEO

### Tailwind CSS
- Use utility classes for styling
- Respect user's spacing and typography preferences
- Implement responsive design patterns
- Follow Tailwind best practices for maintainability

### TypeScript
- Generate fully typed components
- Use proper interfaces for props
- Include JSDoc comments for complex logic

### Accessibility
- Include proper ARIA labels and roles
- Ensure keyboard navigation works
- Use semantic HTML elements
- Generate alt text for images

## Output Schema

Return JSON with your transformation results:

\`\`\`json
{
  "routes": [
    {
      "src": "/old-page.html",
      "target": "/new-page",
      "status": 200
    }
  ],
  "components": [
    {
      "path": "app/components/Header.tsx",
      "content": "export default function Header() { ... }"
    }
  ],
  "styles": [
    {
      "path": "app/globals.css",
      "content": "@tailwind base; ..."
    }
  ],
  "redirects": [
    {
      "from": "/old-page.html",
      "to": "/new-page",
      "code": 301
    }
  ],
  "notes": [
    "Generated responsive header with mobile menu",
    "Preserved brand colors from user preferences"
  ],
  "risk": {
    "sanitized_nodes": 5,
    "legacy_block_ratio": 12
  }
}
\`\`\`

Execute the plan step by step, respecting budget constraints and user preferences.`;
  }

  /**
   * Get Critic Agent prompt for quality scoring and improvement suggestions
   */
  async getCriticPrompt(artifacts: any, metrics: any): Promise<string> {
    return `${await this.getSystemPrompt()}

## Your Role: Migration Critic

You evaluate the transformation results against quality thresholds and suggest improvements.

## Transformation Artifacts
${JSON.stringify(artifacts, null, 2)}

## Current Quality Metrics
${JSON.stringify(metrics, null, 2)}

## Your Task

Score the migration across all quality dimensions and suggest specific improvements:

1. **Build Validation**: Will the Next.js project build successfully?
2. **SEO Preservation**: Are redirects properly configured?
3. **Performance**: Will the site load quickly and efficiently?
4. **Accessibility**: Does it meet WCAG A standards?
5. **Code Quality**: Is the code maintainable and follows best practices?

## Quality Thresholds to Validate Against
- Build success: 100% (must pass)
- Redirect accuracy: 95%+
- Lighthouse performance: 80+
- WCAG A compliance: 90%+
- Legacy block ratio: <25%

## Output Schema

Return JSON with your quality assessment:

\`\`\`json
{
  "scores": {
    "seo": 95,
    "security": 100,
    "performance": 82,
    "accessibility": 88,
    "coverage": 90
  },
  "gate_results": {
    "build_validation": {
      "passed": true,
      "details": "No TypeScript or build errors detected"
    },
    "performance_check": {
      "passed": true,
      "score": 82,
      "details": "Lighthouse performance above threshold"
    }
  },
  "actions": [
    {
      "type": "file_edit",
      "description": "Add missing alt text to product images",
      "params": {
        "file": "app/components/ProductGrid.tsx",
        "changes": ["Add alt props to Image components"]
      }
    }
  ],
  "should_retry": false,
  "recommendations": [
    "Consider lazy loading for product images",
    "Add loading states for better UX"
  ]
}
\`\`\`

Be specific about what needs to be fixed and whether the Executive Agent can auto-apply the fixes.`;
  }

  /**
   * Get Executive Agent prompt for applying fixes and escalation decisions
   */
  async getExecutivePrompt(criticResults: any): Promise<string> {
    return `${await this.getSystemPrompt()}

## Your Role: Migration Executive

You apply fixes identified by the Critic Agent or escalate issues to the user when manual intervention is needed.

## Critic Assessment
${JSON.stringify(criticResults, null, 2)}

## Your Task

For each action suggested by the Critic:

1. **Auto-Fix**: If \`auto_fix: true\`, apply the fix using appropriate tools
2. **Escalate**: If manual intervention needed, provide clear guidance to user
3. **Quality Gate**: Ensure all thresholds are met before marking complete

## Auto-Fix Capabilities

You can automatically fix:
- TypeScript compilation errors
- ESLint violations
- Missing alt text and ARIA labels
- Simple redirect configuration issues
- Performance optimizations (image optimization, lazy loading)

## Escalation Criteria

Escalate to user when:
- Complex design decisions needed
- Business logic clarification required
- Budget exceeded and priorities must be set
- Quality gates cannot be met with available tools

## Output Schema

\`\`\`json
{
  "applied_fixes": [
    {
      "action_id": "fix-alt-text",
      "tool": "project.patch",
      "result": "success",
      "details": "Added alt text to 12 images"
    }
  ],
  "escalations": [
    {
      "issue": "Complex navigation logic",
      "reason": "Business logic clarification needed",
      "user_action_required": "Review and approve navigation structure",
      "options": [
        "Keep original navigation structure",
        "Simplify to single-level menu",
        "Create mega-menu with categories"
      ]
    }
  ],
  "final_status": "needs_user_input",
  "quality_summary": {
    "all_gates_passed": false,
    "blocking_issues": 1,
    "total_fixes_applied": 5
  },
  "next_steps": [
    "User review required for navigation structure",
    "Re-run quality gates after user input"
  ]
}
\`\`\`

Apply all possible auto-fixes before escalating. Be decisive about what can be fixed automatically vs. what needs user input.`;
  }

  /**
   * Parse and validate user brief data
   */
  async parseUserBrief(briefData: any): Promise<UserBrief> {
    const userBrief: UserBrief = {
      goals: briefData.goals || 'preserve',
      risk_appetite: briefData.risk_appetite || 'balanced'
    };

    if (briefData.style_preferences) {
      userBrief.style_preferences = {
        colors: briefData.style_preferences.colors || [],
        typography: briefData.style_preferences.typography || 'minimal',
        spacing: briefData.style_preferences.spacing || 'normal',
        motion: briefData.style_preferences.motion || 'subtle'
      };
    }

    if (briefData.framework_preferences) {
      userBrief.framework_preferences = {
        strict_url_preservation: briefData.framework_preferences.strict_url_preservation ?? true,
        allow_route_consolidation: briefData.framework_preferences.allow_route_consolidation ?? false,
        prefer_ssg: briefData.framework_preferences.prefer_ssg ?? true
      };
    }

    if (briefData.non_negotiables) {
      userBrief.non_negotiables = {
        brand_colors: briefData.non_negotiables.brand_colors || [],
        legal_text: briefData.non_negotiables.legal_text || [],
        tracking_ids: briefData.non_negotiables.tracking_ids || []
      };
    }

    userBrief.content_tone = briefData.content_tone;
    userBrief.custom_instructions = briefData.custom_instructions;

    return userBrief;
  }

  /**
   * Inject user brief context into any prompt
   */
  async injectBriefIntoPrompt(prompt: string, brief: UserBrief): Promise<string> {
    const briefContext = this.formatUserBrief(brief);

    // Find a good insertion point or append at the end
    if (prompt.includes('## User Brief')) {
      return prompt.replace(/## User Brief[\s\S]*?(?=##|$)/, `## User Brief\n${briefContext}\n`);
    } else {
      return `${prompt}\n\n## User Brief\n${briefContext}`;
    }
  }

  // Private helper methods

  private formatUserBrief(brief: UserBrief): string {
    let formatted = `**Goals**: ${brief.goals}\n`;
    formatted += `**Risk Appetite**: ${brief.risk_appetite}\n`;

    if (brief.style_preferences) {
      formatted += `**Style Preferences**:\n`;
      if (brief.style_preferences.colors?.length) {
        formatted += `  - Brand Colors: ${brief.style_preferences.colors.join(', ')}\n`;
      }
      formatted += `  - Typography: ${brief.style_preferences.typography}\n`;
      formatted += `  - Spacing: ${brief.style_preferences.spacing}\n`;
      formatted += `  - Motion: ${brief.style_preferences.motion}\n`;
    }

    if (brief.framework_preferences) {
      formatted += `**Framework Preferences**:\n`;
      formatted += `  - Strict URL Preservation: ${brief.framework_preferences.strict_url_preservation}\n`;
      formatted += `  - Allow Route Consolidation: ${brief.framework_preferences.allow_route_consolidation}\n`;
      formatted += `  - Prefer SSG: ${brief.framework_preferences.prefer_ssg}\n`;
    }

    if (brief.non_negotiables) {
      formatted += `**Non-Negotiables**:\n`;
      if (brief.non_negotiables.brand_colors?.length) {
        formatted += `  - Brand Colors: ${brief.non_negotiables.brand_colors.join(', ')}\n`;
      }
      if (brief.non_negotiables.legal_text?.length) {
        formatted += `  - Legal Text: ${brief.non_negotiables.legal_text.length} items\n`;
      }
      if (brief.non_negotiables.tracking_ids?.length) {
        formatted += `  - Tracking IDs: ${brief.non_negotiables.tracking_ids.join(', ')}\n`;
      }
    }

    if (brief.content_tone) {
      formatted += `**Content Tone**: ${brief.content_tone}\n`;
    }

    if (brief.custom_instructions) {
      formatted += `**Custom Instructions**: ${brief.custom_instructions}\n`;
    }

    return formatted;
  }

  private formatSiteAnalysis(siteData: SiteAnalysisData): string {
    let formatted = `**Technologies Detected**:\n`;

    const techsByCategory = siteData.technologies.reduce((acc, tech) => {
      const category = tech.category;
      const existing = acc[category] ?? [];
      existing.push(`${tech.name}${tech.version ? ` ${tech.version}` : ''}`);
      acc[category] = existing;
      return acc;
    }, {} as Record<string, string[]>);

    for (const [category, techs] of Object.entries(techsByCategory)) {
      formatted += `  - ${category}: ${techs.join(', ')}\n`;
    }

    formatted += `\n**Site Structure**:\n`;
    formatted += `  - Total Pages: ${siteData.structure.totalPages}\n`;
    formatted += `  - Page Types: ${siteData.structure.pageTypes.map(pt => `${pt.type} (${pt.count})`).join(', ')}\n`;

    formatted += `\n**Content Analysis**:\n`;
    formatted += `  - Total Text: ${Math.round(siteData.content.totalText / 1000)}k characters\n`;
    formatted += `  - Languages: ${siteData.content.languages.join(', ')}\n`;
    formatted += `  - Forms: ${siteData.content.forms.length} detected\n`;

    formatted += `\n**Performance Baseline**:\n`;
    formatted += `  - Load Time: ${siteData.performance.loadTime}ms\n`;
    formatted += `  - Total Requests: ${siteData.performance.totalRequests}\n`;
    formatted += `  - Total Size: ${Math.round(siteData.performance.totalSize / 1024)}KB\n`;

    return formatted;
  }
}