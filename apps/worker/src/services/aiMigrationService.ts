/**
 * AI Migration Service
 *
 * AI-forward migration system with 4 specialized Claude agents:
 * - Planner: Analyzes site + user brief, creates migration plan
 * - Transformer: Executes plan using constrained toolbox
 * - Critic: Scores outputs against quality rubrics
 * - Executive: Applies fixes or escalates to user
 */

import { getPool } from './database';
import { unifiedLogger } from './unifiedLogger';
import { ulid } from 'ulid';
import { claudeCLIMainProcess } from './claudeCLIMainProcess';
import { AIPromptService } from './aiPromptService';
import { AIToolboxService } from './aiToolboxService';
import { QualityGatesService } from './qualityGatesService';
import * as crypto from 'crypto';

// Core interfaces for AI agents
export interface UserBrief {
  goals: 'preserve' | 'modernize' | 'uplift';
  style_preferences: {
    colors?: string[];
    typography?: 'minimal' | 'expressive' | 'classic';
    spacing?: 'tight' | 'normal' | 'spacious';
    motion?: 'none' | 'subtle' | 'dynamic';
  };
  framework_preferences: {
    strict_url_preservation: boolean;
    allow_route_consolidation: boolean;
    prefer_ssg: boolean;
  };
  content_tone?: 'neutral' | 'marketing' | 'formal';
  non_negotiables?: {
    brand_colors?: string[];
    legal_text?: string[];
    tracking_ids?: string[];
  };
  risk_appetite: 'conservative' | 'balanced' | 'bold';
  custom_instructions?: string;
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

export interface TransformResult {
  routes: Array<{
    src: string;
    target: string;
    status: number;
  }>;
  components: Array<{
    path: string;
    content: string;
  }>;
  styles: Array<{
    path: string;
    content: string;
  }>;
  redirects: Array<{
    from: string;
    to: string;
    code: number;
  }>;
  notes: string[];
  risk: {
    sanitized_nodes: number;
    legacy_block_ratio: number;
  };
}

export interface CriticResult {
  scores: {
    seo: number;
    security: number;
    performance: number;
    accessibility: number;
    coverage: number;
  };
  actions: Array<{
    type: 'file_edit' | 'remap' | 'tool_call';
    description: string;
    params: Record<string, any>;
  }>;
  should_retry: boolean;
}

export interface MigrationBudget {
  max_tokens: number;
  max_tool_calls: number;
  max_wall_minutes: number;
  token_cost_cap: number;
}

export class AIMigrationService {
  private pool = getPool();
  private promptService: AIPromptService;
  private toolboxService: AIToolboxService;
  private qualityGatesService: QualityGatesService;

  // AI model configurations by agent role
  private readonly AGENT_CONFIGS = {
    planner: {
      temperature: 0.1,
      maxTokens: 4000,
      args: ['--temperature', '0.1']
    },
    transformer: {
      temperature: 0.2,
      maxTokens: 8000,
      args: ['--temperature', '0.2']
    },
    critic: {
      temperature: 0.1,
      maxTokens: 3000,
      args: ['--temperature', '0.1']
    },
    executive: {
      temperature: 0.2,
      maxTokens: 2000,
      args: ['--temperature', '0.2']
    }
  };

  constructor() {
    this.promptService = new AIPromptService();
    this.toolboxService = new AIToolboxService();
    this.qualityGatesService = new QualityGatesService();
  }

  /**
   * Execute a migration phase using appropriate AI agent with audit trail
   */
  async executePhase(migrationId: string, phaseName: string): Promise<any> {
    const client = await this.pool.connect();

    try {
      // Get migration context with enhanced data
      const migrationResult = await client.query(`
        SELECT mp.*, mb.goals, mb.style_preferences, mb.framework_preferences,
               mb.content_tone, mb.non_negotiables, mb.risk_appetite, mb.custom_instructions,
               mp.run_seed, mp.tool_contract_version
        FROM migration_projects mp
        LEFT JOIN migration_user_brief mb ON mb.migration_project_id = mp.id
        WHERE mp.id = $1
      `, [migrationId]);

      if (migrationResult.rows.length === 0) {
        throw new Error('Migration project not found');
      }

      const migration = migrationResult.rows[0];
      const userBrief: UserBrief = this.parseUserBrief(migration);

      // Create phase tracking entry
      const phaseId = await this.createPhaseEntry(migrationId, phaseName, migration.tool_contract_version);

      // Route to appropriate agent based on phase
      let result;
      const agentName = this.getAgentForPhase(phaseName);

      try {
        await this.markPhaseRunning(phaseId);

        switch (phaseName) {
          case 'content_extraction': {
            // Get site data for planner
            const siteData = await this.getSiteDataForPlanning(migrationId);
            const budget = this.getDefaultBudget(userBrief.risk_appetite);
            result = await this.runPlannerAgent(migrationId, siteData, userBrief, budget);
            break;
          }
          case 'design_analysis':
          case 'component_mapping':
          case 'logic_transformation': {
            // Get plan for transformer
            const plan = await this.getMigrationPlan(migrationId);
            result = await this.runTransformerAgent(migrationId, plan, userBrief, migration.tool_contract_version || '1.0.0');
            break;
          }
          case 'asset_optimization': {
            // Get transform result for critic
            const transformResult = await this.getTransformResult(migrationId);
            result = await this.runCriticAgent(migrationId, transformResult);
            break;
          }
          case 'project_generation':
          case 'build_validation': {
            // Get critic result for executive
            const criticResult = await this.getCriticResult(migrationId);
            result = await this.runExecutiveAgent(migrationId, criticResult, userBrief);
            break;
          }
          default:
            throw new Error(`Unknown phase: ${phaseName}`);
        }

        await this.markPhaseCompleted(phaseId, result);

        unifiedLogger.system('startup', 'info', 'AI phase executed', {
          migrationId,
          phaseName,
          agentName,
          success: true
        });

        return result;

      } catch (error) {
        await this.markPhaseFailed(phaseId, (error as Error).message);
        throw error;
      }

    } catch (error) {
      unifiedLogger.system('error', 'error', 'AI phase execution failed', {
        migrationId,
        phaseName,
        error: (error as Error).message
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get appropriate agent name for phase
   */
  private getAgentForPhase(phaseName: string): string {
    const agentMapping: Record<string, string> = {
      'content_extraction': 'planner',
      'design_analysis': 'transformer',
      'component_mapping': 'transformer',
      'logic_transformation': 'transformer',
      'asset_optimization': 'critic',
      'project_generation': 'executive',
      'build_validation': 'executive'
    };
    return agentMapping[phaseName] || 'unknown';
  }

  /**
   * Create phase tracking entry with audit
   */
  private async createPhaseEntry(migrationId: string, phaseName: string, toolContractVersion: string): Promise<string> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        INSERT INTO migration_phases (
          migration_project_id, phase_name, phase_order,
          tool_contract_version, prompt_hash, model
        ) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (migration_project_id, phase_name)
        DO UPDATE SET
          tool_contract_version = $4,
          prompt_hash = $5,
          model = $6,
          status = 'pending'
        RETURNING id
      `, [
        migrationId,
        phaseName,
        this.getPhaseOrder(phaseName),
        toolContractVersion || '1.0.0',
        this.getPromptHash(phaseName),
        'claude-3-5-sonnet-20241022' // TODO: Make configurable
      ]);

      return result.rows[0].id;
    } finally {
      client.release();
    }
  }

  /**
   * Mark phase as running
   */
  private async markPhaseRunning(phaseId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`
        UPDATE migration_phases
        SET status = 'running', started_at = NOW()
        WHERE id = $1
      `, [phaseId]);
    } finally {
      client.release();
    }
  }

  /**
   * Mark phase as completed
   */
  private async markPhaseCompleted(phaseId: string, result: any): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`
        UPDATE migration_phases
        SET status = 'completed', output_data = $2, completed_at = NOW()
        WHERE id = $1
      `, [phaseId, result]);
    } finally {
      client.release();
    }
  }

  /**
   * Mark phase as failed
   */
  private async markPhaseFailed(phaseId: string, errorMessage: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`
        UPDATE migration_phases
        SET status = 'failed', error_message = $2, completed_at = NOW()
        WHERE id = $1
      `, [phaseId, errorMessage]);
    } finally {
      client.release();
    }
  }


  /**
   * Generate system prompt with toolbox documentation
   */
  private getSystemPrompt(): string {
    return `You are the Migration Executive. Your goal is to migrate websites to Next.js 14 App Router + Tailwind CSS while maximizing fidelity to the user brief.

CONSTRAINTS:
- You may only call tools from the approved toolbox
- You must output valid JSON per the schema requirements
- Never fetch outside verified/allowed hosts
- Always respect robots.txt and ownership verification
- You are accountable for SEO preservation and quality gates

TOOLBOX AVAILABLE:
- crawl.fetch(url, render_js?) - Fetch and analyze web pages
- normalize.map(urls[]) - Build canonical URL mapping
- seo.snapshot(url) - Extract SEO metadata
- transform.html_to_component(html, rules) - Convert HTML to React
- transform.css_to_tailwind(css) - Convert CSS to Tailwind
- sanitizer.legacy_block(html) - Sanitize unsafe content
- project.write(path, content) - Write project files
- verifier.run(kind) - Run quality checks

OUTPUT REQUIREMENTS:
- All outputs must be valid JSON matching the required schema
- Include reasoning for all decisions
- Preserve SEO elements (titles, meta, canonicals)
- Maintain accessibility standards
- Generate CSP-safe code only`;
  }

  /**
   * Generate planner-specific prompt
   */
  private getPlannerPrompt(userBrief: UserBrief): string {
    return `TASK: Analyze the website and create a migration plan to Next.js 14 + Tailwind CSS.

USER BRIEF:
Goals: ${userBrief.goals}
Style Preferences: ${JSON.stringify(userBrief.style_preferences)}
Framework Preferences: ${JSON.stringify(userBrief.framework_preferences)}
Risk Appetite: ${userBrief.risk_appetite}
Custom Instructions: ${userBrief.custom_instructions || 'None'}

REQUIREMENTS:
1. Plan must preserve URLs for SEO (use normalize.map tool)
2. Respect user's style preferences and brand colors
3. Apply risk appetite: conservative = more LegacyBlocks, bold = more transformation
4. Include quality verification steps
5. Stay within budget constraints

OUTPUT: JSON plan with steps array and budgets object only.`;
  }

  /**
   * Generate transformer-specific prompt
   */
  private getTransformerPrompt(userBrief: UserBrief, phaseName: string): string {
    return `TASK: Execute ${phaseName} transformation phase.

USER BRIEF GUIDANCE:
- Goals: ${userBrief.goals}
- Style: ${JSON.stringify(userBrief.style_preferences)}
- Custom Instructions: ${userBrief.custom_instructions || 'None'}

TRANSFORMATION RULES:
1. Convert HTML to semantic React components
2. Apply Tailwind CSS following user style preferences
3. Preserve brand colors from non_negotiables
4. Use LegacyBlock wrapper for unsafe/complex content
5. Generate CSP-compatible code
6. Maintain accessibility standards

OUTPUT: JSON with routes, components, styles, redirects, notes, and risk assessment.`;
  }

  /**
   * Generate critic-specific prompt
   */
  private getCriticPrompt(): string {
    return `TASK: Score the migration outputs against quality rubrics.

SCORING CRITERIA:
- SEO (0-100): Redirect accuracy ≥95%, meta parity, canonical preservation
- Security (0-100): CSP compliance, DOMPurify usage, no unsafe-inline
- Performance (0-100): Lighthouse score targets, image optimization
- Accessibility (0-100): WCAG AA compliance, alt text coverage ≥95%
- Coverage (0-100): Minimize legacy_block_ratio

If any score <90, propose specific fix actions.

OUTPUT: JSON with scores object, actions array, and should_retry boolean.`;
  }

  /**
   * Generate executive-specific prompt
   */
  private getExecutivePrompt(): string {
    return `TASK: Apply critic fixes or escalate to user for preferences.

DECISION CRITERIA:
- Apply fixes automatically if confidence >80%
- Escalate to user if fixes would significantly change design
- Mark complete if all scores >90%
- Recommend manual review for legacy_block_ratio >25%

OUTPUT: JSON with action, project_ready status, and escalations array.`;
  }

  /**
   * Parse user brief from database row
   */
  private parseUserBrief(row: any): UserBrief {
    return {
      goals: row.goals || 'modernize',
      style_preferences: row.style_preferences || {},
      framework_preferences: row.framework_preferences || {
        strict_url_preservation: true,
        allow_route_consolidation: false,
        prefer_ssg: true
      },
      content_tone: row.content_tone,
      non_negotiables: row.non_negotiables,
      risk_appetite: row.risk_appetite || 'balanced',
      custom_instructions: row.custom_instructions
    };
  }

  /**
   * Log tool call for audit trail
   */
  private async logToolCall(migrationId: string, agent: string, tool: string, args: any, result?: any, tokens?: number): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`
        INSERT INTO migration_tool_calls (
          migration_project_id, agent, tool, args_json, result_meta, cost_tokens
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [migrationId, agent, tool, args, result, tokens || 0]);
    } finally {
      client.release();
    }
  }

  /**
   * Hash prompt for reproducibility tracking
   */
  private hashPrompt(prompt: string): string {
    return crypto.createHash('sha256').update(prompt).digest('hex').substring(0, 16);
  }

  /**
   * Get phase order for consistent sequencing
   */
  private getPhaseOrder(phaseName: string): number {
    const phaseOrder: Record<string, number> = {
      'content_extraction': 1,
      'design_analysis': 2,
      'component_mapping': 3,
      'logic_transformation': 4,
      'asset_optimization': 5,
      'project_generation': 6,
      'build_validation': 7
    };
    return phaseOrder[phaseName] || 999;
  }

  /**
   * Get prompt hash for version tracking
   */
  private getPromptHash(phaseName: string): string {
    const prompts = {
      'content_extraction': this.getSystemPrompt() + this.getPlannerPrompt({ goals: 'modernize', style_preferences: {}, framework_preferences: { strict_url_preservation: true, allow_route_consolidation: false, prefer_ssg: true }, risk_appetite: 'balanced' }),
      'design_analysis': this.getTransformerPrompt({ goals: 'modernize', style_preferences: {}, framework_preferences: { strict_url_preservation: true, allow_route_consolidation: false, prefer_ssg: true }, risk_appetite: 'balanced' }, phaseName),
      'asset_optimization': this.getCriticPrompt(),
      'project_generation': this.getExecutivePrompt()
    };

    const promptText = prompts[phaseName as keyof typeof prompts] || phaseName;
    return this.hashPrompt(promptText);
  }

  /**
   * Validate plan against schema
   */
  private validatePlanSchema(plan: MigrationPlan): void {
    if (!plan.steps || plan.steps.length === 0) {
      throw new Error('Plan must have at least one step');
    }

    if (!plan.budgets || !plan.budgets.tokens || !plan.budgets.tool_calls) {
      throw new Error('Plan must include valid budgets');
    }

    for (const step of plan.steps) {
      if (!step.tool || !step.args || !step.why) {
        throw new Error('Each step must have tool, args, and reasoning');
      }

      // Validate tool versioning
      if (!step.tool.includes('@')) {
        throw new Error(`Tool must be versioned: ${step.tool}`);
      }
    }
  }

  /**
   * Validate transform result against schema
   */
  private validateTransformSchema(result: TransformResult): void {
    if (!result.routes || !result.components || !result.redirects) {
      throw new Error('Transform result must include routes, components, and redirects');
    }

    if (!result.risk || typeof result.risk.legacy_block_ratio !== 'number') {
      throw new Error('Transform result must include risk assessment');
    }
  }

  /**
   * Validate critic result against schema
   */
  private validateCriticSchema(result: CriticResult): void {
    if (!result.scores || typeof result.should_retry !== 'boolean') {
      throw new Error('Critic result must include scores and retry decision');
    }

    const requiredScores = ['seo', 'security', 'performance', 'accessibility', 'coverage'];
    for (const score of requiredScores) {
      const scoreValue = (result.scores as any)[score];
      if (typeof scoreValue !== 'number' || scoreValue < 0 || scoreValue > 100) {
        throw new Error(`Invalid ${score} score: must be 0-100`);
      }
    }
  }

  /**
   * Apply auto-fix action via toolbox
   */
  private async applyAutoFix(migrationId: string, action: any): Promise<any> {
    try {
      // Use toolbox service to apply fixes
      const result = await this.toolboxService.executeToolCall(
        migrationId,
        migrationId, // Use migrationId as phaseId
        `autofix.${action.type}@1.0.0`,
        action.params,
        '1.0.0' // Tool contract version
      );

      unifiedLogger.system('startup', 'info', 'Auto-fix applied successfully', {
        migrationId,
        actionType: action.type,
        description: action.description
      });

      return {
        applied: true,
        description: action.description,
        result: result,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      unifiedLogger.system('error', 'error', 'Auto-fix failed', {
        migrationId,
        actionType: action.type,
        description: action.description,
        error: (error as Error).message
      });

      throw new Error(`Auto-fix failed: ${(error as Error).message}`);
    }
  }

  // ============================================================================
  // AI AGENT IMPLEMENTATIONS WITH CLAUDE CLI
  // ============================================================================

  /**
   * Planner Agent - Analyzes site and creates migration plan using Claude CLI
   */
  async runPlannerAgent(
    migrationId: string,
    siteData: any,
    userBrief: UserBrief,
    budget?: MigrationBudget
  ): Promise<MigrationPlan> {
    try {
      const systemPrompt = this.getSystemPrompt();
      const plannerPrompt = this.getPlannerPrompt(userBrief);
      const fullPrompt = `${systemPrompt}\n\n${plannerPrompt}\n\nSite Data: ${JSON.stringify(siteData, null, 2)}`;

      const config = this.AGENT_CONFIGS.planner;
      const response = await claudeCLIMainProcess.request(
        fullPrompt,
        [...config.args, '--max-tokens', config.maxTokens.toString()],
        this.getMigrationWorkingDirectory(migrationId)
      );

      if (!response.success) {
        throw new Error(`Claude CLI request failed: ${response.error}`);
      }

      // Parse JSON response
      let plan: MigrationPlan;
      try {
        // Extract JSON from Claude response if needed
        const jsonMatch = response.result?.match(/```json\s*\n([\s\S]*?)\n```/);
        const jsonText = jsonMatch ? jsonMatch[1] : response.result;
        plan = JSON.parse(jsonText || '{}');
      } catch (error) {
        throw new Error(`Planner Agent returned invalid JSON: ${response.result?.slice(0, 200)}...`);
      }

      // Validate plan structure
      this.validatePlanSchema(plan);

      // Enforce budget constraints if provided
      if (budget && plan.budgets.tokens > budget.max_tokens) {
        plan.budgets.tokens = budget.max_tokens;
        unifiedLogger.system('warning', 'warn', 'Plan token budget reduced to fit limits', {
          migrationId,
          requestedTokens: plan.budgets.tokens,
          allowedTokens: budget.max_tokens
        });
      }

      // Log plan creation with usage data
      await this.logToolCall(migrationId, 'planner', 'create_migration_plan', {}, {
        steps: plan.steps.length,
        budgetTokens: plan.budgets.tokens,
        toolCalls: plan.budgets.tool_calls,
        inputTokens: response.usage?.inputTokens || 0,
        outputTokens: response.usage?.outputTokens || 0,
        totalCost: response.usage?.totalCost || 0
      }, (response.usage?.inputTokens || 0) + (response.usage?.outputTokens || 0));

      return plan;

    } catch (error) {
      unifiedLogger.system('error', 'error', 'Planner Agent failed', {
        migrationId,
        error: (error as Error).message
      });
      throw new Error(`Planner Agent failed: ${(error as Error).message}`);
    }
  }

  /**
   * Transformer Agent - Executes migration plan using toolbox with Claude CLI
   */
  async runTransformerAgent(
    migrationId: string,
    plan: MigrationPlan,
    userBrief: UserBrief,
    toolContractVersion: string
  ): Promise<TransformResult> {
    try {
      const transformerPrompt = this.getTransformerPrompt(userBrief, 'transform');

      // Execute plan steps using toolbox
      const results = [];
      let tokenBudgetRemaining = plan.budgets.tokens;
      let toolCallsRemaining = plan.budgets.tool_calls;

      for (const step of plan.steps) {
        if (tokenBudgetRemaining <= 0 || toolCallsRemaining <= 0) {
          unifiedLogger.system('warning', 'warn', 'Budget exhausted during transformation', {
            migrationId,
            remainingTokens: tokenBudgetRemaining,
            remainingToolCalls: toolCallsRemaining
          });
          break;
        }

        try {
          // Execute tool via toolbox service
          const toolResult = await this.toolboxService.executeToolCall(
            migrationId,
            migrationId, // Use migrationId as phaseId for now
            step.tool,
            step.args,
            toolContractVersion
          );

          results.push({
            tool: step.tool,
            result: toolResult,
            success: true
          });

          // Update budget tracking
          toolCallsRemaining--;

        } catch (error) {
          unifiedLogger.system('error', 'error', 'Tool execution failed in transformer', {
            migrationId,
            tool: step.tool,
            error: (error as Error).message
          });

          results.push({
            tool: step.tool,
            error: (error as Error).message,
            success: false
          });
        }
      }

      // Use Claude CLI to process results into final transformation
      const fullPrompt = `${transformerPrompt}\n\nTool execution results:\n${JSON.stringify(results, null, 2)}\n\nGenerate the final transformation result as JSON:`;

      const config = this.AGENT_CONFIGS.transformer;
      const response = await claudeCLIMainProcess.request(
        fullPrompt,
        [...config.args, '--max-tokens', config.maxTokens.toString()],
        this.getMigrationWorkingDirectory(migrationId)
      );

      if (!response.success) {
        throw new Error(`Claude CLI request failed: ${response.error}`);
      }

      let transformResult: TransformResult;
      try {
        // Extract JSON from Claude response if needed
        const jsonMatch = response.result?.match(/```json\s*\n([\s\S]*?)\n```/);
        const jsonText = jsonMatch ? jsonMatch[1] : response.result;
        transformResult = JSON.parse(jsonText || '{}');
      } catch (error) {
        throw new Error(`Transformer Agent returned invalid JSON: ${response.result?.slice(0, 200)}...`);
      }

      // Validate result
      this.validateTransformSchema(transformResult);

      return transformResult;

    } catch (error) {
      unifiedLogger.system('error', 'error', 'Transformer Agent failed', {
        migrationId,
        error: (error as Error).message
      });
      throw new Error(`Transformer Agent failed: ${(error as Error).message}`);
    }
  }

  /**
   * Critic Agent - Evaluates transformation quality and suggests fixes using Claude CLI
   */
  async runCriticAgent(
    migrationId: string,
    transformResult: TransformResult,
    qualityMetrics?: any
  ): Promise<CriticResult> {
    try {
      const criticPrompt = this.getCriticPrompt();

      // Run quality gates first
      const qualityResults = await this.runQualityGates(transformResult);

      const fullPrompt = `${criticPrompt}\n\nTransform Result:\n${JSON.stringify(transformResult, null, 2)}\n\nQuality Gates Results:\n${JSON.stringify(qualityResults, null, 2)}\n\nProvide your assessment as JSON:`;

      const config = this.AGENT_CONFIGS.critic;
      const response = await claudeCLIMainProcess.request(
        fullPrompt,
        [...config.args, '--max-tokens', config.maxTokens.toString()],
        this.getMigrationWorkingDirectory(migrationId)
      );

      if (!response.success) {
        throw new Error(`Claude CLI request failed: ${response.error}`);
      }

      let criticResult: CriticResult;
      try {
        // Extract JSON from Claude response if needed
        const jsonMatch = response.result?.match(/```json\s*\n([\s\S]*?)\n```/);
        const jsonText = jsonMatch ? jsonMatch[1] : response.result;
        criticResult = JSON.parse(jsonText || '{}');
      } catch (error) {
        throw new Error(`Critic Agent returned invalid JSON: ${response.result?.slice(0, 200)}...`);
      }

      // Validate result
      this.validateCriticSchema(criticResult);

      // Log critic assessment with usage data
      await this.logToolCall(migrationId, 'critic', 'assess_quality', transformResult, {
        overallScore: Object.values(criticResult.scores).reduce((sum, score) => sum + score, 0) / 5,
        actionCount: criticResult.actions.length,
        shouldRetry: criticResult.should_retry,
        inputTokens: response.usage?.inputTokens || 0,
        outputTokens: response.usage?.outputTokens || 0,
        totalCost: response.usage?.totalCost || 0
      }, (response.usage?.inputTokens || 0) + (response.usage?.outputTokens || 0));

      return criticResult;

    } catch (error) {
      unifiedLogger.system('error', 'error', 'Critic Agent failed', {
        migrationId,
        error: (error as Error).message
      });
      throw new Error(`Critic Agent failed: ${(error as Error).message}`);
    }
  }

  /**
   * Executive Agent - Applies fixes or escalates to user using Claude CLI
   */
  async runExecutiveAgent(
    migrationId: string,
    criticResult: CriticResult,
    userBrief?: UserBrief
  ): Promise<any> {
    try {
      const executivePrompt = this.getExecutivePrompt();

      const fullPrompt = `${executivePrompt}\n\nCritic Assessment:\n${JSON.stringify(criticResult, null, 2)}\n\nUser Brief Context:\n${JSON.stringify(userBrief, null, 2)}\n\nProvide your executive decision as JSON:`;

      const config = this.AGENT_CONFIGS.executive;
      const response = await claudeCLIMainProcess.request(
        fullPrompt,
        [...config.args, '--max-tokens', config.maxTokens.toString()],
        this.getMigrationWorkingDirectory(migrationId)
      );

      if (!response.success) {
        throw new Error(`Claude CLI request failed: ${response.error}`);
      }

      let executiveResult: any;
      try {
        // Extract JSON from Claude response if needed
        const jsonMatch = response.result?.match(/```json\s*\n([\s\S]*?)\n```/);
        const jsonText = jsonMatch ? jsonMatch[1] : response.result;
        executiveResult = JSON.parse(jsonText || '{}');
      } catch (error) {
        throw new Error(`Executive Agent returned invalid JSON: ${response.result?.slice(0, 200)}...`);
      }

      // Execute auto-fixes
      const appliedFixes = [];
      const escalations = [];

      for (const action of criticResult.actions) {
        if (action.type === 'file_edit' || action.type === 'remap') {
          try {
            // Apply auto-fix via toolbox
            const fixResult = await this.applyAutoFix(migrationId, action);
            appliedFixes.push({
              action: action.description,
              result: 'success',
              details: fixResult
            });
          } catch (error) {
            escalations.push({
              action: action.description,
              reason: 'Auto-fix failed',
              error: (error as Error).message
            });
          }
        } else {
          // Escalate complex issues
          escalations.push({
            action: action.description,
            reason: 'Requires manual intervention',
            userAction: 'Review and approve changes'
          });
        }
      }

      const finalResult = {
        ...executiveResult,
        appliedFixes,
        escalations,
        needsUserInput: escalations.length > 0,
        status: escalations.length === 0 ? 'completed' : 'needs_user_input'
      };

      // Log executive actions with usage data
      await this.logToolCall(migrationId, 'executive', 'apply_fixes', criticResult, {
        fixesApplied: appliedFixes.length,
        escalationsRequired: escalations.length,
        status: finalResult.status,
        inputTokens: response.usage?.inputTokens || 0,
        outputTokens: response.usage?.outputTokens || 0,
        totalCost: response.usage?.totalCost || 0
      }, (response.usage?.inputTokens || 0) + (response.usage?.outputTokens || 0));

      return finalResult;

    } catch (error) {
      unifiedLogger.system('error', 'error', 'Executive Agent failed', {
        migrationId,
        error: (error as Error).message
      });
      throw new Error(`Executive Agent failed: ${(error as Error).message}`);
    }
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Get migration working directory for Claude CLI
   */
  private getMigrationWorkingDirectory(migrationId: string): string {
    const os = require('os');
    const path = require('path');
    return path.join(os.homedir(), 'projects', 'migrations', `migration-${migrationId}`);
  }

  /**
   * Get site data for planning phase
   */
  private async getSiteDataForPlanning(migrationId: string): Promise<any> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT ma.data
        FROM migration_analysis ma
        WHERE ma.migration_project_id = $1
        AND ma.analysis_type = 'preliminary'
        ORDER BY ma.created_at DESC
        LIMIT 1
      `, [migrationId]);

      return result.rows.length > 0 ? result.rows[0].data : {};
    } finally {
      client.release();
    }
  }

  /**
   * Get default budget based on risk appetite
   */
  private getDefaultBudget(riskAppetite: string): MigrationBudget {
    const budgets = {
      conservative: {
        max_tokens: 2000000,
        max_tool_calls: 400,
        max_wall_minutes: 30,
        token_cost_cap: 25
      },
      balanced: {
        max_tokens: 3000000,
        max_tool_calls: 600,
        max_wall_minutes: 45,
        token_cost_cap: 40
      },
      bold: {
        max_tokens: 5000000,
        max_tool_calls: 1000,
        max_wall_minutes: 60,
        token_cost_cap: 75
      }
    };

    return budgets[riskAppetite as keyof typeof budgets] || budgets.balanced;
  }

  /**
   * Get migration plan from previous phase
   */
  private async getMigrationPlan(migrationId: string): Promise<MigrationPlan> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT output_data
        FROM migration_phases
        WHERE migration_project_id = $1
        AND phase_name = 'content_extraction'
        AND status = 'completed'
        ORDER BY completed_at DESC
        LIMIT 1
      `, [migrationId]);

      if (result.rows.length === 0) {
        throw new Error('No completed planning phase found');
      }

      return result.rows[0].output_data as MigrationPlan;
    } finally {
      client.release();
    }
  }

  /**
   * Get transform result from previous phase
   */
  private async getTransformResult(migrationId: string): Promise<TransformResult> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT output_data
        FROM migration_phases
        WHERE migration_project_id = $1
        AND phase_name IN ('design_analysis', 'component_mapping', 'logic_transformation')
        AND status = 'completed'
        ORDER BY completed_at DESC
        LIMIT 1
      `, [migrationId]);

      if (result.rows.length === 0) {
        throw new Error('No completed transformation phase found');
      }

      return result.rows[0].output_data as TransformResult;
    } finally {
      client.release();
    }
  }

  /**
   * Get critic result from previous phase
   */
  private async getCriticResult(migrationId: string): Promise<CriticResult> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`
        SELECT output_data
        FROM migration_phases
        WHERE migration_project_id = $1
        AND phase_name = 'asset_optimization'
        AND status = 'completed'
        ORDER BY completed_at DESC
        LIMIT 1
      `, [migrationId]);

      if (result.rows.length === 0) {
        throw new Error('No completed critic phase found');
      }

      return result.rows[0].output_data as CriticResult;
    } finally {
      client.release();
    }
  }

  /**
   * Run quality gates using the quality gates service
   */
  private async runQualityGates(transformResult: TransformResult): Promise<any> {
    const results: any = {};

    try {
      // Use the actual quality gates service for comprehensive testing
      const migrationWorkingDir = this.getMigrationWorkingDirectory('temp-quality-check');

      // Create temporary project structure for testing
      const fs = require('fs').promises;
      const path = require('path');

      await fs.mkdir(migrationWorkingDir, { recursive: true });

      // Write components to temporary directory for validation
      for (const component of transformResult.components) {
        const componentPath = path.join(migrationWorkingDir, component.path);
        const componentDir = path.dirname(componentPath);
        await fs.mkdir(componentDir, { recursive: true });
        await fs.writeFile(componentPath, component.content);
      }

      // Run build validation
      try {
        results.build = await this.qualityGatesService.validateBuild(migrationWorkingDir);
      } catch (error) {
        results.build = { passed: false, error: (error as Error).message };
      }

      // Run quality checks if we have routes to test
      if (transformResult.routes && transformResult.routes.length > 0) {
        const testUrls = transformResult.routes
          .filter(route => route.status === 200)
          .map(route => `http://localhost:3000${route.target}`)
          .slice(0, 3); // Limit to first 3 URLs for performance

        if (testUrls.length > 0) {
          try {
            results.performance = await this.qualityGatesService.runLighthouse(testUrls);
          } catch (error) {
            results.performance = { passed: false, error: (error as Error).message };
          }

          try {
            results.accessibility = await this.qualityGatesService.checkAccessibility(testUrls);
          } catch (error) {
            results.accessibility = { passed: false, error: (error as Error).message };
          }
        }
      }

      // SEO validation based on redirects
      if (transformResult.redirects && transformResult.redirects.length > 0) {
        results.seo = await this.qualityGatesService.verifySEO(
          transformResult.redirects.map(redirect => ({
            src: redirect.from,
            target: redirect.to,
            code: redirect.code
          }))
        );
      }

      // Clean up temporary directory
      await fs.rmdir(migrationWorkingDir, { recursive: true }).catch(() => {});

    } catch (error) {
      results.error = (error as Error).message;
      unifiedLogger.system('error', 'error', 'Quality gates execution failed', {
        error: (error as Error).message
      });
    }

    return results;
  }
}