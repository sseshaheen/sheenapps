/**
 * Clean, maintainable recommendations prompt builder
 * Eliminates duplication and centralizes JSON schema
 */

import { z } from 'zod';

export type RecommendationsPromptOpts = {
  readonly projectType: 'create' | 'update';
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  readonly framework?: string | undefined;
  readonly originalPrompt: string;
  readonly currentVersion?: string | undefined;   // undefined on initial build
  readonly isEasyMode?: boolean | undefined;      // Easy Mode project flag
};

// Zod schema that keeps runtime and TypeScript in sync
export const RecommendationSchemaZ = z.object({
  schemaVersion: z.literal(1),
  recommendations: z.array(z.object({
    id: z.number().int().positive(),
    title: z.string().min(1),
    description: z.string().min(1),
    category: z.string().min(1),
    complexity: z.enum(['easy', 'medium', 'hard']),
    impact: z.enum(['low', 'medium', 'high']),
    versionHint: z.enum(['patch', 'minor', 'major']),
    prompt: z.string().min(1),
  })).min(1).max(10), // 1-10 recommendations
  project_info: z.object({
    type: z.string().min(1),
    framework: z.string().min(1),
    version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Must be valid semver'),
    version_description: z.string().min(1),
    change_type: z.enum(['patch', 'minor', 'major']),
    breaking_risk: z.enum(['none', 'low', 'medium', 'high']),
    // Optional: Only included for initial builds
    suggestedProjectName: z.string().min(1).max(50).optional(),
  }),
});

// TypeScript interface derived from zod schema
export type RecommendationSchema = z.infer<typeof RecommendationSchemaZ>;

function buildJsonSchemaExample(opts: RecommendationsPromptOpts): string {
  const isInitial = opts.projectType === 'create';

  // Generate intelligent example based on context
  const versionInfo = isInitial
    ? {
        version: "1.0.0",
        version_description: "Initial release with core functionality",
        change_type: "major",
        breaking_risk: "none"
      }
    : {
        version: opts.currentVersion ? incrementVersion(opts.currentVersion, 'minor') : "1.1.0",
        version_description: "Added new features and improvements",
        change_type: "minor",
        breaking_risk: "low"
      };

  const exampleTitle = isInitial ? "Add User Authentication" : "Improve Mobile Responsiveness";
  const exampleDescription = isInitial ? "Users need secure login functionality" : "Optimize interface for mobile devices";
  const examplePrompt = isInitial ? "Implement user registration and login system" : "Make the layout responsive on smaller screens";

  return `{
  "schemaVersion": 1,
  "recommendations": [
    {
      "id": 1,
      "title": "${exampleTitle}",
      "description": "${exampleDescription}",
      "category": "${isInitial ? 'feature' : 'ui'}",
      "complexity": "medium",
      "impact": "high",
      "versionHint": "${isInitial ? 'minor' : 'patch'}",
      "prompt": "${examplePrompt}"
    }
  ],
  "project_info": {
    "type": "web_app",
    "framework": "${opts.framework || 'Unknown'}",
    "version": "${versionInfo.version}",${isInitial ? `
    "suggestedProjectName": "Task Tracker Pro",` : ''}
    "version_description": "${versionInfo.version_description}",
    "change_type": "${versionInfo.change_type}",
    "breaking_risk": "${versionInfo.breaking_risk}"
  }
}`;
}

// Helper to increment version for examples with proper validation
function incrementVersion(currentVersion: string | undefined, type: 'patch' | 'minor' | 'major'): string {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(currentVersion ?? '');
  if (!m) return '1.0.0'; // fallback for malformed or undefined

  const parts = m.slice(1).map(Number);
  const major = parts[0] ?? 1;
  const minor = parts[1] ?? 0;
  const patch = parts[2] ?? 0;

  switch (type) {
    case 'major': return `${major + 1}.0.0`;
    case 'minor': return `${major}.${minor + 1}.0`;
    case 'patch': return `${major}.${minor}.${patch + 1}`;
    default: return `${major}.${minor + 1}.0`;
  }
}

export function buildRecommendationsPrompt(opts: RecommendationsPromptOpts): string {
  const ctx = [
    `You just ${opts.projectType === 'create' ? 'created' : 'updated'} this project.`,
    opts.framework ? `Framework: ${opts.framework}.` : undefined,
    `User request: "${opts.originalPrompt.replace(/\n/g, ' ')}"`
  ].filter(Boolean).join(' ');

  const versionLine = opts.currentVersion
    ? `Current version is ${opts.currentVersion}. Determine the next semantic version based on your changes.`
    : `This is the initial version; set "version" to "1.0.0".`;

  // SDK guidance for Easy Mode projects
  const sdkGuidance = opts.isEasyMode ? `
## Available Platform Features (Easy Mode)

This is an Easy Mode project with access to these @sheenapps SDKs:
- **@sheenapps/auth**: User authentication (signup, login, magic links, sessions)
- **@sheenapps/db**: Database operations (queries, CRUD, relationships)
- **@sheenapps/storage**: File uploads, images, documents with signed URLs
- **@sheenapps/jobs**: Background tasks, scheduled jobs, cron-based automation
- **@sheenapps/secrets**: Secure storage for API keys and credentials
- **@sheenapps/email**: Transactional emails (welcome, password reset, notifications)
- **@sheenapps/payments**: Stripe integration (checkout, subscriptions, billing portal)
- **@sheenapps/analytics**: Event tracking, page views, user identification

When suggesting features, consider how they could leverage these SDKs. For example:
- "Add user authentication" → uses @sheenapps/auth
- "Add file upload for user avatars" → uses @sheenapps/storage
- "Add subscription billing" → uses @sheenapps/payments
- "Send welcome emails" → uses @sheenapps/email
- "Track user signups" → uses @sheenapps/analytics
- "Schedule daily reports" → uses @sheenapps/jobs
` : '';

  return `${ctx}

## Task
Create .sheenapps/recommendations.json with 3-7 next-step recommendations.

${versionLine}
${sdkGuidance}
## Output Format
${buildJsonSchemaExample(opts)}

## Rules
• Return only valid JSON (no markdown, no commentary)
• Use the exact schema format shown above
• For versionHint: "patch" = fixes/tweaks, "minor" = features, "major" = breaking changes or major updates
• For complexity: "easy" = quick fixes, "medium" = moderate effort, "hard" = significant work
• For impact: "low" = minor changes, "medium" = noticeable improvements, "high" = major enhancements
• For project_info:${opts.projectType === 'create' ? `
  - suggestedProjectName: Suggest a descriptive 2-4 word name based on the project's purpose (not generic like "My App")` : ''}
  - For change_type: match the significance of your actual changes
  - For breaking_risk: assess impact on existing functionality
• If file exists, replace it completely`.trim();
}

/**
 * Validates that a parsed recommendations object matches our expected schema
 * Uses zod for comprehensive validation that prevents runtime drift
 */
export function validateRecommendationsSchema(data: unknown): data is RecommendationSchema {
  return RecommendationSchemaZ.safeParse(data).success;
}
