# Website Migration Tool - Comprehensive Implementation Plan

**Status**: 🟡 Partial Implementation
**Last Updated**: 2026-01-19
**Priority**: High

---

## Executive Summary

The website migration tool has a complete **frontend UI with i18n support** and **database schema**, but is missing the **core orchestration logic** that actually executes migrations. This document outlines everything needed to make the tool production-ready.

### Current State

#### ✅ What's Working (100% Complete)
- **Frontend UI** (`sheenappsai/src/`)
  - Migration start form with presets (preserve/modernize/redesign)
  - Real-time progress view with SSE connection
  - Phase timeline visualization
  - Success/failure states with proper CTAs
  - Full i18n support (9 locales: en, ar, ar-eg, ar-sa, ar-ae, fr, fr-ma, es, de)
  - Connection status indicators
  - Event log for debugging

- **API Routes** (`sheenappsai/src/app/api/migration/`)
  - Proxy route with HMAC validation
  - Idempotency key handling
  - Rate limiting headers
  - Request size protection (256KB)
  - Correlation ID tracking

- **Database Schema** (`sheenapps-claude-worker/migrations/088_*.sql`)
  - `migration_projects` - Main project tracking
  - `migration_jobs` - Job stages (ANALYZE, PLAN, TRANSFORM, VERIFY, DEPLOY)
  - `migration_phases` - Phase execution tracking
  - `migration_analysis` - Site analysis results
  - `migration_map` - URL mapping for SEO
  - `migration_tool_calls` - AI tool usage audit
  - `migration_events` - SSE event storage
  - `migration_user_brief` - User preferences
  - `migration_retries` - Retry tracking
  - `migration_idempotency` - Deduplication

- **Service Infrastructure** (`sheenapps-claude-worker/src/services/`)
  - `MigrationOrchestratorService` - Skeleton with helper methods
  - `migrationSSEService` - Event broadcasting (fully implemented)
  - `migrationProjectService` - Project CRUD operations
  - `migrationVerificationService` - Domain ownership verification
  - `migrationAITimeService` - Budget tracking
  - `migrationAnalyticsService` - Metrics tracking
  - `migrationRecoveryService` - Error recovery

#### ❌ What's Missing (0% Complete)

1. **Core Orchestration Logic**
   - `executeAIPipeline()` exists but is never called
   - No automatic execution after migration start
   - Missing processing queue/worker
   - No phase progression logic

2. **AI Agent Pipeline**
   - Analysis agent (website crawling, structure detection)
   - Planning agent (component mapping, route planning)
   - Transformation agent (code generation)
   - Verification agent (quality checks)

3. **Website Analysis Service**
   - HTML/CSS parsing
   - Asset discovery and downloading
   - Component identification
   - SEO metadata extraction

4. **Code Generation**
   - Next.js component generation
   - Tailwind CSS conversion
   - Route structure creation
   - Asset optimization

5. **Integration with Builder**
   - Project creation in `projects` table
   - File system creation
   - Git repository initialization
   - Initial deployment

---

## Phase 1: Core Orchestration (Week 1)

### Goal
Make the migration tool actually execute when started.

### Tasks

#### 1.1 Implement Migration Execution Trigger
**File**: `sheenapps-claude-worker/src/routes/migration.ts:102-120`

```typescript
// After startMigration, trigger execution
const migrationProject = await orchestrator.startMigration({
  sourceUrl,
  userId,
  userPrompt: typeof userBrief === 'string' ? userBrief : JSON.stringify(userBrief)
});

// 🔴 ADD: Trigger async execution
await orchestrator.processMigration(migrationProject.id, userId);

return reply.code(201).send({
  migrationId: migrationProject.id,
  status: 'analyzing',
  message: 'Migration started successfully',
  nextSteps: ['verify_ownership', 'preliminary_analysis']
});
```

#### 1.2 Implement `processMigration()` Method
**File**: `sheenapps-claude-worker/src/services/migrationOrchestratorService.ts`

```typescript
/**
 * Process migration through AI pipeline
 * Public method called from route handler
 */
async processMigration(migrationId: string, userId: string): Promise<void> {
  try {
    // Verify ownership
    const migration = await this.getMigrationProject(migrationId, userId);
    if (!migration) {
      throw new Error('Migration not found');
    }

    // Run async pipeline (don't await - let it run in background)
    this.executeAIPipeline(migrationId).catch(error => {
      unifiedLogger.system('error', 'error', 'Migration pipeline failed', {
        migrationId,
        error: error.message
      });
    });

  } catch (error) {
    throw new Error(`Failed to process migration: ${(error as Error).message}`);
  }
}
```

#### 1.3 Implement Phase Progression Logic
**File**: `sheenapps-claude-worker/src/services/migrationOrchestratorService.ts:582-730`

The `executeAIPipeline()` method exists but is incomplete. It needs:

```typescript
private async executeAIPipeline(migrationId: string): Promise<void> {
  try {
    // Phase 1: Analysis (0-25%)
    await this.broadcastProgress(migrationId, 'ANALYZE', 0, 'Starting website analysis...');
    const analysisResult = await this.runAnalysisPhase(migrationId);
    await this.broadcastProgress(migrationId, 'ANALYZE', 25, 'Analysis complete');

    // Phase 2: Planning (25-40%)
    await this.broadcastProgress(migrationId, 'PLAN', 25, 'Planning component structure...');
    const plan = await this.runPlanningPhase(migrationId, analysisResult);
    await this.broadcastProgress(migrationId, 'PLAN', 40, 'Planning complete');

    // Phase 3: Transformation (40-75%)
    await this.broadcastProgress(migrationId, 'TRANSFORM', 40, 'Generating Next.js code...');
    const projectId = await this.runTransformationPhase(migrationId, plan);
    await this.broadcastProgress(migrationId, 'TRANSFORM', 75, 'Code generation complete');

    // Phase 4: Verification (75-90%)
    await this.broadcastProgress(migrationId, 'VERIFY', 75, 'Running quality checks...');
    await this.runVerificationPhase(migrationId, projectId);
    await this.broadcastProgress(migrationId, 'VERIFY', 90, 'Verification complete');

    // Phase 5: Deployment (90-100%)
    await this.broadcastProgress(migrationId, 'DEPLOY', 90, 'Deploying project...');
    await this.runDeploymentPhase(migrationId, projectId);

    // Mark complete
    await this.markMigrationComplete(migrationId, projectId);
    await this.broadcastComplete(migrationId, projectId);

  } catch (error) {
    await this.markMigrationFailed(migrationId, error as Error);
    await this.broadcastFailed(migrationId, (error as Error).message);
  }
}
```

#### 1.4 Implement Progress Broadcasting Helpers

```typescript
private async broadcastProgress(
  migrationId: string,
  phase: string,
  progress: number,
  message: string
): Promise<void> {
  const event = migrationSSEService.createPhaseUpdateEvent(
    migrationId,
    phase,
    progress,
    undefined,
    [],
    0
  );
  await migrationSSEService.broadcastMigrationUpdate(migrationId, event);
}

private async broadcastComplete(migrationId: string, projectId: string): Promise<void> {
  const event = migrationSSEService.createDoneEvent(
    migrationId,
    true,
    0,
    0,
    projectId,
    '',
    { message: 'Migration completed successfully!' }
  );
  await migrationSSEService.broadcastMigrationUpdate(migrationId, event);
}

private async broadcastFailed(migrationId: string, message: string): Promise<void> {
  const event = migrationSSEService.createErrorEvent(
    migrationId,
    'TRANSFORM',
    0,
    'MIGRATION_FAILED',
    message,
    false,
    {}
  );
  await migrationSSEService.broadcastMigrationUpdate(migrationId, event);
}
```

---

## Phase 2: Website Analysis Agent (Week 2)

### Goal
Implement AI agent that analyzes source website and extracts structure.

### Tasks

#### 2.1 Create Website Crawler Service
**New File**: `sheenapps-claude-worker/src/services/websiteCrawlerService.ts`

```typescript
export class WebsiteCrawlerService {
  async crawlWebsite(url: string, maxPages: number = 50): Promise<CrawlResult> {
    // 1. Fetch homepage HTML
    // 2. Parse links and extract navigation
    // 3. Crawl up to maxPages
    // 4. Download and catalog assets (images, fonts, etc.)
    // 5. Extract color palette, typography
    // 6. Identify framework (WordPress, React, static, etc.)
    // 7. Map page hierarchy
  }
}
```

**Dependencies**:
- `cheerio` for HTML parsing
- `axios` for HTTP requests
- `sharp` for image analysis (color extraction)
- `css-tree` for CSS parsing

#### 2.2 Implement Analysis Phase

```typescript
private async runAnalysisPhase(migrationId: string): Promise<AnalysisResult> {
  // 1. Get migration project
  const migration = await this.getMigrationProject(migrationId, '');

  // 2. Crawl website
  const crawler = new WebsiteCrawlerService();
  const crawlResult = await crawler.crawlWebsite(migration.sourceUrl);

  // 3. Analyze with AI (Claude Sonnet)
  const aiAnalysis = await this.aiService.analyzeWebsite(crawlResult);

  // 4. Store analysis in migration_analysis table
  await this.storeAnalysis(migrationId, 'detailed', aiAnalysis);

  // 5. Return structured result
  return {
    pages: crawlResult.pages,
    components: aiAnalysis.components,
    assets: crawlResult.assets,
    seoStructure: aiAnalysis.seo,
    designSystem: aiAnalysis.designSystem
  };
}
```

#### 2.3 Create AI Analysis Prompts
**New File**: `sheenapps-claude-worker/src/prompts/analysisPrompts.ts`

```typescript
export const WEBSITE_ANALYSIS_PROMPT = `
You are analyzing a website for migration to Next.js 14 + Tailwind CSS.

Given the following website structure:
- Homepage HTML: {html}
- Navigation links: {links}
- Page titles: {titles}
- CSS styles: {styles}

Analyze and return:
1. Component hierarchy (Header, Footer, Sections, Cards, etc.)
2. Design tokens (colors, fonts, spacing scale)
3. Content structure (text, images, forms)
4. SEO metadata (titles, descriptions, keywords)
5. Routing structure (recommended Next.js routes)

Return as JSON with this structure:
{
  "components": [...],
  "designSystem": {...},
  "routes": [...],
  "seo": {...}
}
`;
```

---

## Phase 3: Planning Agent (Week 3)

### Goal
Create detailed migration plan with component mapping.

### Tasks

#### 3.1 Implement Planning Phase

```typescript
private async runPlanningPhase(
  migrationId: string,
  analysis: AnalysisResult
): Promise<MigrationPlan> {
  // 1. Get user brief preferences
  const userBrief = await this.getUserBrief(migrationId, '');

  // 2. Generate component map (old URL → Next.js component)
  const componentMap = await this.aiService.planComponents(analysis, userBrief);

  // 3. Generate route structure
  const routes = await this.aiService.planRoutes(analysis);

  // 4. Create URL mapping for SEO (301 redirects)
  const urlMap = await this.generateUrlMap(analysis.pages, routes);

  // 5. Store in migration_map table
  await this.storeUrlMap(migrationId, urlMap);

  return {
    components: componentMap,
    routes,
    urlMap,
    assetOptimizations: []
  };
}
```

#### 3.2 Create Component Mapping Logic

```typescript
// Map old website sections to React components
{
  "oldPage": "/about",
  "newRoute": "/about",
  "components": [
    { "type": "Hero", "content": "...", "style": "..." },
    { "type": "Team", "content": "...", "style": "..." },
    { "type": "CTA", "content": "...", "style": "..." }
  ]
}
```

---

## Phase 4: Transformation Agent (Week 4-5)

### Goal
Generate actual Next.js code from plan.

### Tasks

#### 4.1 Create Code Generation Service
**New File**: `sheenapps-claude-worker/src/services/codeGenerationService.ts`

```typescript
export class CodeGenerationService {
  async generateProject(plan: MigrationPlan): Promise<GeneratedProject> {
    // 1. Generate app structure (app/, components/, public/)
    // 2. Generate page components
    // 3. Generate reusable components
    // 4. Generate Tailwind config with design tokens
    // 5. Generate package.json with dependencies
    // 6. Optimize and download assets
  }
}
```

#### 4.2 Implement Component Templates

```typescript
// Use Claude Code Generation with structured prompts
const componentPrompt = `
Generate a Next.js component for:
- Type: {componentType}
- Content: {content}
- Style: {designTokens}
- Framework: Next.js 14 App Router
- CSS: Tailwind CSS
- TypeScript: Strict mode

Requirements:
- Responsive design
- Accessibility (ARIA labels, semantic HTML)
- Image optimization (next/image)
- SEO-friendly
- RTL support if needed

Return as:
{
  "filename": "components/Hero.tsx",
  "code": "..."
}
`;
```

#### 4.3 Integrate with Projects Table

```typescript
private async runTransformationPhase(
  migrationId: string,
  plan: MigrationPlan
): Promise<string> {
  // 1. Generate code
  const codeGen = new CodeGenerationService();
  const generatedProject = await codeGen.generateProject(plan);

  // 2. Create project in database
  const migration = await this.getMigrationProject(migrationId, '');
  const project = await this.createProject(migration.userId, generatedProject);

  // 3. Write files to storage
  await this.writeProjectFiles(project.id, generatedProject.files);

  // 4. Update migration with target_project_id
  await this.updateMigrationProject(migrationId, { targetProjectId: project.id });

  return project.id;
}

private async createProject(
  userId: string,
  generatedProject: GeneratedProject
): Promise<Project> {
  const result = await this.pool.query(`
    INSERT INTO projects (owner_id, name, description, tech_stack)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `, [
    userId,
    generatedProject.name,
    'Migrated website',
    ['nextjs', 'tailwind', 'typescript']
  ]);

  return result.rows[0];
}
```

---

## Phase 5: Verification & Deployment (Week 6)

### Goal
Quality checks and deployment preparation.

### Tasks

#### 5.1 Implement Quality Gates

```typescript
private async runVerificationPhase(
  migrationId: string,
  projectId: string
): Promise<void> {
  // 1. TypeScript compilation check
  const tsCheck = await this.verifyTypeScript(projectId);

  // 2. Build test (next build)
  const buildCheck = await this.verifyBuild(projectId);

  // 3. Accessibility audit (basic)
  const a11yCheck = await this.verifyAccessibility(projectId);

  // 4. SEO check (meta tags, sitemap)
  const seoCheck = await this.verifySEO(projectId);

  // Store verification results
  await this.storeVerificationResults(migrationId, {
    typescript: tsCheck,
    build: buildCheck,
    accessibility: a11yCheck,
    seo: seoCheck
  });
}
```

#### 5.2 Implement Deployment Phase

```typescript
private async runDeploymentPhase(
  migrationId: string,
  projectId: string
): Promise<void> {
  // 1. Initialize git repository
  await this.initGitRepo(projectId);

  // 2. Create initial commit
  await this.createInitialCommit(projectId, 'Initial migration');

  // 3. Mark project as ready
  await this.markProjectReady(projectId);

  // 4. Trigger initial build (optional)
  // await this.triggerBuild(projectId);
}
```

---

## Phase 6: Testing & Polish (Week 7)

### Tasks

#### 6.1 End-to-End Testing

```typescript
// Test full migration flow
describe('Migration E2E', () => {
  it('should migrate a simple landing page', async () => {
    const migrationId = await startMigration('https://example.com');
    await waitForCompletion(migrationId);
    const project = await getProject(migrationId);
    expect(project).toBeDefined();
    expect(project.files).toContainFile('app/page.tsx');
  });
});
```

#### 6.2 Error Handling & Recovery

- Implement retry logic for failed phases
- Add timeout handling (30 min max)
- Budget enforcement (stop if exceeds AI time)
- Graceful degradation (partial migration)

#### 6.3 Documentation

- User guide (how to start migration)
- Developer docs (how to extend agents)
- API documentation
- Troubleshooting guide

---

## Architecture Decisions

### Why Not a Queue?

Initially, we considered using BullMQ queue for migration jobs, but decided against it because:

1. **Simplicity**: Migrations are infrequent (not high-throughput)
2. **Real-time feedback**: Direct execution allows immediate SSE updates
3. **Less complexity**: No need to manage queue workers
4. **Error handling**: Easier to debug in-process execution

**Decision**: Use async in-process execution with error boundaries.

### Why Separate Phases?

The pipeline is divided into 5 distinct phases to:

1. **Enable progress tracking** (users see clear milestones)
2. **Allow checkpoints** (can retry individual phases)
3. **Facilitate debugging** (know exactly where it failed)
4. **Support customization** (users can adjust after planning)

### AI Model Selection

- **Analysis & Planning**: Claude Sonnet 4.5 (balanced speed/quality)
- **Code Generation**: Claude Sonnet 4.5 (high quality code)
- **Verification**: Claude Haiku (fast, deterministic checks)

---

## Success Metrics

### Phase 1-2 Success Criteria
- ✅ Migration starts and sends SSE events
- ✅ Analysis phase completes and stores results
- ✅ Progress bar updates in real-time

### Phase 3-4 Success Criteria
- ✅ Planning phase generates valid component map
- ✅ Code generation creates valid Next.js project
- ✅ Generated code passes TypeScript compilation
- ✅ Project appears in builder

### Phase 5-6 Success Criteria
- ✅ End-to-end migration completes without errors
- ✅ User can view migrated project in builder
- ✅ Quality gates pass (build, a11y, SEO)
- ✅ User can deploy migrated project

---

## Risk Mitigation

### High Risks

1. **AI hallucination in code generation**
   - **Mitigation**: Multi-stage verification, TypeScript compiler as validator
   - **Fallback**: Manual code review prompts

2. **Budget overruns (AI time)**
   - **Mitigation**: Hard limits per phase, streaming vs batch
   - **Fallback**: Stop execution, notify user

3. **Complex website structures**
   - **Mitigation**: Start with simple sites, gradual rollout
   - **Fallback**: Manual migration option

4. **Asset licensing issues**
   - **Mitigation**: Download but don't redistribute, user responsibility
   - **Warning**: Add disclaimer about asset rights

### Medium Risks

1. **Slow execution (>30 min)**
   - **Mitigation**: Optimize prompts, parallel processing

2. **Memory leaks in crawling**
   - **Mitigation**: Stream processing, pagination

3. **Rate limiting from source websites**
   - **Mitigation**: Respectful crawling (1 req/sec), user-agent identification

---

## Dependencies & Prerequisites

### Required NPM Packages

```json
{
  "dependencies": {
    "cheerio": "^1.0.0-rc.12",
    "axios": "^1.6.0",
    "sharp": "^0.33.0",
    "css-tree": "^2.3.1",
    "puppeteer": "^21.0.0" // Optional: for JavaScript-heavy sites
  }
}
```

### Environment Variables

```bash
# Migration settings
MIGRATION_MAX_PAGES=50
MIGRATION_TIMEOUT_MS=1800000  # 30 minutes
MIGRATION_MAX_AI_TIME=1200    # 20 minutes in seconds

# AI model configuration
MIGRATION_ANALYSIS_MODEL=claude-sonnet-4.5
MIGRATION_CODEGEN_MODEL=claude-sonnet-4.5
MIGRATION_VERIFY_MODEL=claude-haiku-4.0
```

### Database Migrations

All required tables exist in migration `088_website_migration_tool_schema.sql`.
No additional migrations needed for MVP.

---

## Timeline Estimate

| Phase | Duration | Parallel Work Possible |
|-------|----------|----------------------|
| Phase 1: Core Orchestration | 3-5 days | No |
| Phase 2: Analysis Agent | 5-7 days | Yes (can start while Phase 1 completes) |
| Phase 3: Planning Agent | 4-6 days | Yes (needs Phase 2 data structure) |
| Phase 4: Code Generation | 7-10 days | No (needs Phase 3 complete) |
| Phase 5: Verification | 3-4 days | Partial (can start verification logic early) |
| Phase 6: Testing & Polish | 5-7 days | Yes (write tests as you go) |

**Total: 4-6 weeks** (single developer, full-time)
**Minimum Viable: 2-3 weeks** (with scope reduction)

---

## Scope Reduction Options (MVP)

If timeline is tight, consider:

1. **Skip verification phase**: Trust TypeScript compiler only
2. **Limit page count**: Max 10 pages for MVP
3. **Simple sites only**: No JavaScript frameworks, static HTML only
4. **Manual QA**: Skip automated quality gates
5. **No asset optimization**: Just link to original URLs
6. **Template-based**: Use predefined Next.js templates instead of AI generation

**With scope reduction: 1-2 weeks to working prototype**

---

## Next Immediate Actions

### This Week (Week 1)

1. ✅ **[DONE]** Fix UI issues (connection status, translations, success state)
2. 🔴 **[TODO]** Implement `processMigration()` method
3. 🔴 **[TODO]** Wire up phase broadcasting
4. 🔴 **[TODO]** Create mock pipeline (returns fake data, proves SSE works)
5. 🔴 **[TODO]** Test end-to-end with mock data

### Next Week (Week 2)

1. 🔴 **[TODO]** Implement website crawler service
2. 🔴 **[TODO]** Create AI analysis prompts
3. 🔴 **[TODO]** Build analysis phase
4. 🔴 **[TODO]** Store results in `migration_analysis` table
5. 🔴 **[TODO]** Test with 3-5 real websites

---

## Appendix: Key Files Reference

### Frontend
- `sheenappsai/src/app/[locale]/migrate/page.tsx` - Migration start page
- `sheenappsai/src/app/[locale]/migrate/[id]/page.tsx` - Progress page
- `sheenappsai/src/components/migration/migration-start-form.tsx` - Form component
- `sheenappsai/src/components/migration/migration-progress-view.tsx` - Progress component
- `sheenappsai/src/app/api/migration/[...path]/route.ts` - API proxy

### Backend
- `sheenapps-claude-worker/src/routes/migration.ts` - API routes (LINE 546: processMigration TODO)
- `sheenapps-claude-worker/src/services/migrationOrchestratorService.ts` - Main orchestrator
- `sheenapps-claude-worker/src/services/migrationSSEService.ts` - Event broadcasting
- `sheenapps-claude-worker/migrations/088_website_migration_tool_schema.sql` - Database schema

### To Create
- `sheenapps-claude-worker/src/services/websiteCrawlerService.ts`
- `sheenapps-claude-worker/src/services/codeGenerationService.ts`
- `sheenapps-claude-worker/src/prompts/analysisPrompts.ts`
- `sheenapps-claude-worker/src/prompts/codegenPrompts.ts`

---

## Questions for Product Team

1. **Scope**: MVP with scope reduction (2-3 weeks) or full implementation (4-6 weeks)?
2. **Pricing**: How much AI time budget per migration? (Currently 20 min default)
3. **Priority websites**: Should we optimize for specific platforms (WordPress, Webflow, etc.)?
4. **Quality bar**: What's minimum acceptable quality for generated code?
5. **Launch plan**: Beta with limited users first, or general availability?

---

**End of Implementation Plan**
