# Codex Integration Plan
## Supporting OpenAI Codex Alongside Claude Code

**Date**: January 16, 2026
**Status**: Phase 1 Implementation In Progress ✅
**Goal**: Add support for OpenAI Codex agentic coding tool while maintaining existing Claude Code functionality

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Critical Production Requirements](#critical-production-requirements) *(NEW - Expert Review)*
3. [Codex Deep Analysis](#codex-deep-analysis)
4. [Current Architecture Analysis](#current-architecture-analysis)
5. [Technical Comparison: Codex vs Claude Code](#technical-comparison-codex-vs-claude-code)
6. [Integration Architecture](#integration-architecture)
7. [Implementation Plan](#implementation-plan)
8. [Risk Assessment](#risk-assessment)
9. [Testing Strategy](#testing-strategy)
10. [Rollout Plan](#rollout-plan)
11. [Decisions Made](#decisions-made) *(NEW)*

---

## Executive Summary

### Overview

This document provides a comprehensive analysis and implementation plan for integrating **OpenAI Codex** into the SheenApps platform alongside existing **Claude Code** support. The platform currently spawns terminal sessions and interacts with Claude Code non-interactively through JSON outputs. We aim to extend this architecture to support Codex with minimal disruption.

### Key Findings

1. **Strong Architectural Similarity**: Both tools use:
   - Terminal-based CLI interfaces
   - JSON Lines (JSONL) output format
   - Session-based conversation management
   - Similar tool/action execution patterns
   - Non-interactive execution modes

2. **Existing Abstraction Layer**: The platform already has:
   - Provider factory pattern (`ProviderFactory`)
   - Executor strategy pattern (`ClaudeExecutorFactory`)
   - Abstract interfaces (`AIProvider`, `IClaudeExecutor`)
   - Redis-based pub/sub orchestration

3. **Path Forward**: The existing architecture is well-positioned for multi-tool support. Primary work involves:
   - Creating Codex-specific implementations of existing interfaces
   - Handling CLI differences (commands, flags, output formats)
   - Unified session management across tools
   - User preference/selection mechanisms

### Recommendation

**Proceed with integration** using the provider abstraction pattern. Estimated effort: 2-3 weeks for core implementation, 1 week for testing and refinement.

---

## Critical Production Requirements

*This section incorporates expert review feedback, validated against official Codex documentation (January 2026).*

### Overview

Running Codex on a server for multiple users is fundamentally different from the CLI's intended "runs locally on your computer" use case. We are effectively building **"Codex-as-a-Service"**. These requirements address the gaps that could cause production issues.

### 1. Authentication Strategy (DECISION MADE)

**Official Docs Confirm** ([Authentication](https://developers.openai.com/codex/auth/), [Non-interactive mode](https://developers.openai.com/codex/noninteractive/)):
- Two methods: ChatGPT OAuth or API Key
- For `codex exec`: Set `CODEX_API_KEY` environment variable (NOT `OPENAI_API_KEY`)
- `CODEX_API_KEY` is **only** supported in `codex exec` mode
- Can force login method via config: `forced_login_method = "api"` (or `"chatgpt"`) in config.toml

**Our Approach (Phased)**:

| Phase | Server Count | Auth Method | Notes |
|-------|--------------|-------------|-------|
| **Phase 1** | 1 server | Subscription via OAuth | `codex login` once, use keyring storage so CODEX_HOME isolation works |
| **Phase 2** | 2-5 servers | API Key (`CODEX_API_KEY`) | Env var per server, usage-based billing |
| **Phase 3** | Scale | API Key + per-user keys (optional) | If user-level billing needed |

**Why this works for us:**
- Single server currently = manual login is acceptable
- Using subscription account initially (not API key)
- API key is trivial to switch to later (just set env var)
- No complex OAuth token management needed

**Implementation:**
```bash
# Phase 1: Manual login with keyring storage (do once per server)
# First, set keyring storage in ~/.codex/config.toml:
# cli_auth_credentials_store = "keyring"

codex login  # Auth stored in OS keyring, survives CODEX_HOME changes

# Phase 2+: API key (CODEX_API_KEY, not OPENAI_API_KEY)
export CODEX_API_KEY="sk-..."
codex exec --json "task"
```

### 2. Isolation: CODEX_HOME Per-Job (CRITICAL)

**Official Docs Confirm** ([Advanced Configuration](https://developers.openai.com/codex/config-advanced/)):
- `CODEX_HOME` environment variable controls storage location (default `~/.codex`)
- Contains: `config.toml`, `auth.json`, `history.jsonl`, sessions
- `history.persistence = "none"` disables session persistence

**The Problem:**
Without isolation, multiple users/jobs on same server could:
- Read each other's session history
- Inherit each other's config changes
- Cause "mysterious" behavior from shared state

**Our Solution - Two Options:**

**Option A: Isolated CODEX_HOME per job (Recommended)**
```bash
# Create isolated home for each job
export CODEX_HOME="/tmp/codex-job-${JOB_ID}"
mkdir -p "$CODEX_HOME"

# Copy minimal config if needed
cat > "$CODEX_HOME/config.toml" << 'EOF'
[history]
persistence = "none"

sandbox_mode = "workspace-write"
approval_policy = "never"
EOF

# Run Codex (no prompts, true headless)
codex exec --json "task"

# Cleanup after job
rm -rf "$CODEX_HOME"
```

**Option B: Shared CODEX_HOME, disabled persistence**
```bash
# In ~/.codex/config.toml on server:
[history]
persistence = "none"

# All jobs share config but no session data leaks
```

**Recommendation:** Use **Option A** for production. It's slightly more setup but guarantees complete isolation. Option B is acceptable for Phase 1 testing.

### ⚠️ CRITICAL: How Auth Works with CODEX_HOME Isolation

**The Problem:** If using `cli_auth_credentials_store = "file"` (default on some systems), credentials are stored in `${CODEX_HOME}/auth.json`. This means per-job CODEX_HOME isolation **breaks authentication** unless you handle it.

**Three Solutions:**

| Solution | How It Works | When to Use |
|----------|--------------|-------------|
| **A. Use OS Keyring** | Set `cli_auth_credentials_store = "keyring"` in base config. Auth stored in OS keyring, survives CODEX_HOME changes. | Phase 1 (single server, manual login) |
| **B. Copy auth.json** | Copy `/home/codex-user/.codex/auth.json` into each job's `$CODEX_HOME/auth.json` | Phase 1 (if keyring not available) |
| **C. API Key Mode** | Set `CODEX_API_KEY` env var. No auth.json needed. | Phase 2+ (multiple servers) |

**For Phase 1 (Subscription Account):**
```bash
# On server, set in base ~/.codex/config.toml:
cli_auth_credentials_store = "keyring"

# Then login once (stored in OS keyring, not file):
codex login

# Now per-job CODEX_HOME works because auth is in keyring, not file
```

**For Phase 2+ (API Key):**
```bash
# No auth.json needed - just set CODEX_API_KEY (not OPENAI_API_KEY)
export CODEX_API_KEY="sk-..."
export CODEX_HOME="/tmp/codex-job-${JOB_ID}"
codex exec --json "task"
```

**Security Note for Phase 1 (Shared OAuth):**
Manual OAuth login creates a **shared super-user credential**. This means:
- No per-user attribution in Codex logs
- All jobs consume the same account quota
- If credentials leak, all access is compromised

Mitigations:
- Lock down file permissions on `~/.codex/` (chmod 700)
- Use a dedicated Unix user for Codex execution
- Monitor quota usage
- Plan to migrate to API keys (Phase 2) for better isolation

### ⚠️ Keyring Fallback for Headless Servers

On many headless Linux servers/containers, OS keyring may be unavailable or flaky. Add runtime detection:

```typescript
async function getAuthStrategy(): Promise<'keyring' | 'file' | 'apikey'> {
  // Try keyring first (best for Phase 1)
  if (await isKeyringAvailable()) {
    return 'keyring';
  }

  // Fallback to file-based auth (copy auth.json per job)
  if (await fileExists('/home/codex-user/.codex/auth.json')) {
    return 'file';
  }

  // Ultimate fallback: require CODEX_API_KEY
  if (process.env.CODEX_API_KEY) {
    return 'apikey';
  }

  throw new Error('No Codex authentication available');
}
```

**Practical approach for Phase 1:**
1. Try `cli_auth_credentials_store = "keyring"` first
2. If keyring unavailable, use `cli_auth_credentials_store = "file"` and copy `auth.json` into each job's CODEX_HOME
3. Document which approach your server uses

### 2.5 Git Repository Requirement (IMPORTANT)

**Official Docs Confirm** ([Non-interactive mode](https://developers.openai.com/codex/noninteractive/)):
- Codex requires running inside a Git repository by default
- This is a safety feature to enable diff tracking and prevent destructive changes
- Bypass with `--skip-git-repo-check` flag

**Our Options:**

| Option | Pros | Cons |
|--------|------|------|
| **A. `git init` in workspace** (Recommended) | Better UX, safer diffs, can commit baseline | Slight setup overhead |
| **B. `--skip-git-repo-check`** | Simple, no setup | No diff safety net |

**Recommended: Option A**
```bash
# In job setup, before running Codex:
cd "$WORKSPACE_DIR"
git init
git add -A
git commit -m "Initial state" --allow-empty

# Then run Codex
codex exec --json "task"

# After Codex, can see what changed:
git diff
```

**If using Option B** (ephemeral workspaces where git init is overkill):
```bash
codex exec --json --skip-git-repo-check "task"
```

**Add to CodexStreamProcess spawn args:**
```typescript
const args = ['exec', '--json'];
if (!options.isGitRepo) {
  args.push('--skip-git-repo-check');
}
args.push(prompt);
```

### 3. stdout/stderr Discipline (CRITICAL)

**Official Docs Confirm** ([Non-interactive mode](https://developers.openai.com/codex/noninteractive/)):
- With `--json`, stdout becomes JSONL stream
- Progress/debug info goes to stderr
- "Stream results to stdout or JSONL"

**The Rule:**
```
NEVER use 2>&1 when --json is enabled
```

**Implementation:**
```typescript
// CORRECT: Separate streams
const process = spawn('codex', ['exec', '--json', prompt], {
  stdio: ['pipe', 'pipe', 'pipe']  // stdin, stdout, stderr separate
});

// Parse stdout as JSONL
process.stdout.on('data', (chunk) => {
  // This is guaranteed to be JSON
  parseJsonLines(chunk);
});

// Log stderr for debugging (not JSON)
process.stderr.on('data', (chunk) => {
  logger.debug('codex stderr:', chunk.toString());
});

// WRONG: Merged streams (will break JSON parsing)
// const process = spawn('codex', args, { stdio: ['pipe', 'pipe', 'pipe'] });
// process.stdout.pipe(process.stderr);  // DON'T DO THIS
```

**Note:** Our existing `ClaudeStreamProcess` already handles this correctly. Maintain the same pattern for `CodexStreamProcess`.

### 4. Security Defaults (IMPORTANT)

**Official Docs Confirm** ([Security](https://developers.openai.com/codex/security/)):
- Sandbox modes: `read-only` | `workspace-write` | `danger-full-access`
- Approval policies (`--ask-for-approval`): `untrusted` | `on-failure` | `on-request` | `never`
- Network disabled by default
- Enterprise can enforce via `requirements.toml`

**Our Defaults for Hosted Codex:**

```toml
# ~/.codex/config.toml (or per-job config)

# Allow writes only to project workspace
sandbox_mode = "workspace-write"

# No prompts - required for non-interactive/headless operation
# Valid values: untrusted | on-failure | on-request | never
approval_policy = "never"

# Network disabled unless explicitly needed
[sandbox_workspace_write]
network_access = false

# Web search off by default (privacy)
[features]
web_search_request = false
```

**Approval Policy Values Explained:**
| Value | Behavior |
|-------|----------|
| `untrusted` | Asks before any command execution |
| `on-failure` | Asks only after a command fails |
| `on-request` | Asks for risky commands (default for `--full-auto`) |
| `never` | Never prompts - true headless mode |

**Flags for `codex exec`:**
```bash
# For our non-interactive setup, use approval_policy = "never" in config
# Then simply:
codex exec --json "task"

# DON'T use --full-auto - it sets "on-request" which may still prompt!
# codex exec --json --full-auto "task"  # May hang waiting for input

# NEVER use in production:
# --dangerously-bypass-approvals-and-sandbox  # Complete bypass of all safety
# --sandbox danger-full-access                 # Full system access
```

**Why NOT `--full-auto` for our use case:**
- `--full-auto` sets `--ask-for-approval on-request` (may prompt for risky commands)
- In non-interactive mode, a prompt = process hangs waiting for input
- Instead, set `approval_policy = "never"` in config for true headless operation

**Our approach** (equivalent to Claude's `--dangerously-skip-permissions`):
```toml
# In config.toml
sandbox_mode = "workspace-write"  # Constrains writes to project dir
approval_policy = "never"         # No prompts - required for non-interactive
```

This is safe because:
- `workspace-write` still constrains file operations to project directory
- Network disabled by default
- Only approval prompts are skipped, not the sandbox

### 5. Version Tracking (EASY WIN)

**Official Docs Confirm** ([Changelog](https://developers.openai.com/codex/changelog/)):
- Codex CLI is actively updated (check changelog for current version)
- Latest model: GPT-5.2-Codex (as of December 2025)
- Schema changes happen (e.g., `item_type` → `type`, `assistant_message` → `agent_message`)

**Do NOT hardcode version numbers** - they become stale quickly. Instead, capture dynamically.

**Implementation:**
```typescript
// On service startup and in every session log
async function captureCodexVersion(): Promise<string> {
  const { stdout } = await execAsync('codex --version');
  return stdout.trim();  // e.g., "codex 0.86.0"
}

// Include in session metadata
const sessionResult = {
  // ... other fields
  toolVersion: await captureCodexVersion(),
  model: 'gpt-5.2-codex',  // Or from config
};
```

**Parser Resilience:**
```typescript
// Handle unknown event types gracefully
function parseCodexEvent(line: string): CodexEvent | null {
  try {
    const event = JSON.parse(line);

    // Known types
    if (['thread.started', 'turn.started', 'item.started', 'item.completed', 'turn.completed', 'error'].includes(event.type)) {
      return event;
    }

    // Unknown type - log but don't crash
    logger.warn(`Unknown Codex event type: ${event.type}`, { event });
    return { type: 'unknown', raw: event };

  } catch (e) {
    logger.error('Failed to parse Codex JSONL line', { line, error: e });
    return null;
  }
}
```

### 6. Config Precedence (IMPORTANT FOR HOSTED)

**Official Docs Confirm** ([CLI Reference](https://developers.openai.com/codex/cli/reference/), [Config Docs](https://developers.openai.com/codex/config-basic/)):

Config is resolved in this order (highest to lowest precedence):
1. **CLI flags** (`--model`, `--sandbox`, etc.)
2. **`-c`/`--config` overrides** (`-c key=value`)
3. **Profile** (`--profile <name>` or `profile = "<name>"` in config)
4. **config.toml** (`~/.codex/config.toml` or `$CODEX_HOME/config.toml`)
5. **Built-in defaults**

**Why this matters for hosted Codex:**
```bash
# Keep a locked-down baseline in config.toml:
# ~/.codex/config.toml
sandbox_mode = "workspace-write"
approval_policy = "never"  # Required for non-interactive
[history]
persistence = "none"

# Override per-job using -c (no file writing needed):
codex exec --json -c "model=gpt-5.2-codex" -c "model_reasoning_effort=high" "task"
```

**Benefits:**
- Base security settings always apply
- Per-job customization without touching files
- Reduces temp file creation in `/tmp`

### 6.5 Security Lockdown (PRODUCTION HARDENING)

**Official Docs Confirm** ([Security](https://developers.openai.com/codex/security/), [Config Reference](https://developers.openai.com/codex/config-reference/)):
- `requirements.toml` enforces settings users/jobs cannot override
- Enterprise admins can lock down security-sensitive options
- Jobs shouldn't be able to relax sandbox/approval via `-c` overrides

**For Hosted Codex: Prevent Jobs from Relaxing Security**

Option A: Use `requirements.toml` (if supported on your setup):
```toml
# /etc/codex/requirements.toml (Unix) or via MDM (macOS)
# Jobs CANNOT override these settings

allowed_sandbox_modes = ["workspace-write"]  # Disallow danger-full-access
allowed_approval_policies = ["never", "on-request"]  # Disallow weaker policies
```

Option B: Server-side validation (simpler for your setup):
```typescript
// In CodexStreamProcess, reject dangerous overrides
const FORBIDDEN_OVERRIDES = [
  'sandbox_mode=danger-full-access',
  'approval_policy=untrusted',  // If you want to enforce "never" only
];

function validateConfigOverrides(overrides: string[]): void {
  for (const override of overrides) {
    if (FORBIDDEN_OVERRIDES.some(f => override.includes(f))) {
      throw new Error(`Security override not allowed: ${override}`);
    }
  }
}
```

**Safe knobs to allow per-job overrides:**
- `model` - Which model to use
- `model_reasoning_effort` - Reasoning depth
- `model_verbosity` - Response verbosity

**Never allow per-job overrides:**
- `sandbox_mode` - Keep locked to `workspace-write`
- `approval_policy` - Keep locked to `never`
- `network_access` - Keep disabled unless explicitly needed

### 7. Model Configuration (FLEXIBILITY)

**Official Docs Confirm** ([Models](https://developers.openai.com/codex/models/)):
- Multiple Codex-tuned variants available, not just one
- Models can be specified via `--model` flag or config

**Available Models** (as of Jan 2026):
| Model | Description |
|-------|-------------|
| `gpt-5.2-codex` | Latest, most advanced agentic coding model |
| `gpt-5.1-codex-max` | Optimized for long-horizon agentic tasks |
| `gpt-5.1-codex-mini` | Cost-effective, smaller variant |
| `gpt-5.1-codex` | Previous generation (superseded by max) |
| `gpt-5-codex` | Earlier generation |

**Don't hardcode model names** - treat as "latest recommended" default, allow override:

**Implementation:**
```typescript
// Accept arbitrary model strings
interface CodexConfig {
  model?: string;  // NOT an enum, any string accepted
}

// Default to latest known, but allow override
const DEFAULT_MODEL = 'gpt-5.2-codex';

// In codex exec call
const modelFlag = config.model || process.env.CODEX_MODEL || DEFAULT_MODEL;
const args = ['exec', '--json', '--model', modelFlag, prompt];
```

### 7. Architectural Refinement (RECOMMENDED)

**Expert Suggestion:** Rename Claude-specific interfaces to tool-agnostic names.

**Our Approach (Pragmatic, Not Over-Engineered):**

Instead of complex adapter layers, we'll:
1. Rename interfaces to generic names (one-time refactor)
2. Create a simple normalized event type
3. Keep tool-specific implementations straightforward

**Interface Renames:**
```typescript
// Before                    // After
IClaudeExecutor          →   IAgentExecutor
ClaudeExecutorFactory    →   AgentExecutorFactory
ClaudeSession            →   // Keep, add CodexSession alongside
ClaudeStreamProcess      →   // Keep, add CodexStreamProcess alongside
```

**Simple Normalized Event (Not a complex adapter):**
```typescript
// Internal normalized event format
interface AgentEvent {
  type: 'message' | 'tool_call' | 'tool_result' | 'progress' | 'error' | 'usage';

  // For messages
  text?: string;

  // For tool calls
  tool?: string;          // 'Write', 'Bash', 'Edit', etc.
  toolInput?: any;
  toolResult?: string;

  // For progress
  status?: 'started' | 'completed';

  // For usage
  inputTokens?: number;
  outputTokens?: number;
  cost?: number;

  // Always include raw event for debugging
  raw: any;
  source: 'claude' | 'codex';
}

// Each parser normalizes to this format
// ClaudeMessageParser → AgentEvent[]
// CodexMessageParser → AgentEvent[]
```

**Why this is enough:**
- Unified frontend streaming (same event format)
- Unified metrics/logging
- No complex adapter inheritance hierarchies
- Still tool-specific where needed (process spawning, flags)

### 8. What We're NOT Doing (Avoiding Overengineering)

Based on expert review, these are deferred or rejected:

| Suggestion | Decision | Reason |
|------------|----------|--------|
| Unified Session Manager | **DEFER to Phase 3+** | Focus on getting Codex working first |
| Complex event adapter layer | **SIMPLIFIED** | Simple normalized event type is sufficient |
| Cross-tool session migration | **NOT NEEDED** | Sessions are tool-specific, no business need |
| Per-user OAuth token management | **NOT NEEDED** | API key is simpler for our use case |
| Version pinning in Docker | **OPTIONAL** | Manual updates acceptable for 1-5 servers |
| Automatic Claude↔Codex fallback | **DEFER** | Nice to have, not MVP |

### Summary: Phase 0 Prerequisites (Before Writing Code)

Before implementing Codex support, ensure:

- [ ] **Auth decision made**: Phase 1 = subscription via OAuth (use `cli_auth_credentials_store = "keyring"`), Phase 2+ = API key (`CODEX_API_KEY`)
- [ ] **Keyring fallback**: If keyring unavailable on headless server, use file-based auth with auth.json copy
- [ ] **Isolation strategy chosen**: Option A (isolated CODEX_HOME) or Option B (shared, no persistence)
- [ ] **Auth + isolation handled**: If using per-job CODEX_HOME, use keyring storage or copy auth.json
- [ ] **Git repo strategy**: Either `git init` in workspace (recommended) or use `--skip-git-repo-check`
- [ ] **Security defaults documented**: `workspace-write` + `never` (required for non-interactive)
- [ ] **Security lockdown**: Prevent jobs from relaxing sandbox/approval via `-c` overrides
- [ ] **Don't use --full-auto**: It sets `on-request` which may prompt. Use `approval_policy = "never"` in config instead.
- [ ] **stderr/stdout discipline**: Parser only reads stdout, stderr to logs
- [ ] **Version capture**: Add `codex --version` to startup and session logs (don't hardcode versions)
- [ ] **Model flexibility**: Accept arbitrary model strings (multiple variants: gpt-5.2-codex, gpt-5.1-codex-max, etc.)
- [ ] **Config precedence**: Use `-c key=value` for per-job overrides, keep base config locked down

---

## Codex Deep Analysis

### 1. What is Codex?

**Codex** is OpenAI's agentic coding tool that runs locally as a terminal-based CLI application. It's built in Rust (97.4% of codebase) and released under Apache-2.0 license.

**Key Characteristics**:
- Local execution on user's machine
- Cloud integration option (`codex cloud`)
- Powered by GPT-5.2-Codex (latest) and GPT-5 models
- Interactive TUI (Terminal UI) and non-interactive modes
- Session persistence with resumption support
- Integrates with ChatGPT Plus/Pro/Business/Enterprise plans

### 2. Installation & Distribution

**Methods**:
```bash
# NPM (primary for automation)
npm install -g @openai/codex

# Homebrew (macOS)
brew install --cask codex

# Direct binary download
# Available for: macOS (arm64/x86_64), Linux (x86_64/arm64)
```

**Binary Locations**:
- `/usr/local/bin/codex` (typical NPM global install)
- `/opt/homebrew/bin/codex` (Homebrew on Apple Silicon)
- Custom PATH locations

### 3. Authentication

**Two Methods**:

1. **ChatGPT Account Integration** (Default):
   - OAuth flow: `codex login`
   - Credentials stored in `~/.codex/` (keyring or file)
   - Requires ChatGPT Plus/Pro/Team/Edu/Enterprise

2. **API Key**:
   - Set `CODEX_API_KEY` environment variable
   - Only works in `codex exec` (non-interactive) mode
   - Requires separate API access setup

### 4. Configuration System

**Primary Config File**: `~/.codex/config.toml`

**Key Configuration Categories**:

```toml
# Authentication
forced_login_method = "chatgpt"  # or "api"
cli_auth_credentials_store = "auto"  # "file", "keyring", or "auto"

# Model Selection
model = "gpt-5.2-codex"  # or "gpt-5", don't hardcode - accept any string
model_provider = "openai"
model_reasoning_effort = "medium"  # minimal | low | medium | high | xhigh
model_verbosity = "medium"  # low | medium | high

# Security & Permissions
sandbox_mode = "workspace-write"  # read-only | workspace-write | danger-full-access
approval_policy = "never"  # untrusted | on-failure | on-request | never (use "never" for headless)

# Session Management
[history]
persistence = "save-all"  # or "none"
max_bytes = 10485760  # 10MB default
model_auto_compact_token_limit = 100000

# MCP Server Integration
[mcp_servers.example]
command = "/path/to/server"
enabled_tools = ["tool1", "tool2"]
startup_timeout_sec = 10
tool_timeout_sec = 60

# Feature Flags
[features]
unified_exec = true
shell_snapshot = false
web_search_request = false
```

**Admin-Enforced Config**: `requirements.toml`
- Locks down security-sensitive settings
- Restricts `allowed_approval_policies`
- Constrains `allowed_sandbox_modes`

### 5. CLI Commands & Interface

#### Interactive Mode

```bash
# Launch TUI
codex

# With initial prompt
codex "Create a React component for user authentication"

# With image input
codex --image screenshot.png "Implement this design"

# Model selection
codex --model gpt-5 "Task description"

# Web search enabled
codex --search "Research and implement OAuth2 flow"

# Custom working directory
codex --cd /path/to/project "Task"

# Profile selection
codex --profile production "Task"
```

**In-Session Commands** (Slash Commands):
- `/model` - Switch between GPT-5-Codex and GPT-5
- `/review` - Code review mode with diff analysis
- `/status` - Session information and statistics
- And more (full list in official docs)

#### Non-Interactive Mode (Critical for Integration)

```bash
# Basic execution
codex exec "Generate release notes"

# With JSON output (machine-readable)
codex exec --json "Task description"

# Output to file
codex exec "Task" --output-last-message result.txt
codex exec "Task" -o result.txt

# Resume session
codex exec resume --last "Continue with more changes"
codex exec resume <SESSION_ID> "Additional instructions"

# With approval/sandbox flags
codex exec --full-auto "Task"  # Auto-approve workspace writes
codex exec --sandbox danger-full-access "Task"  # Full system access
codex exec --dangerously-bypass-approvals-and-sandbox "Task"  # YOLO mode

# Configuration override
codex exec -c model=gpt-5 -c sandbox_mode=read-only "Task"

# Schema-validated output
codex exec --output-schema schema.json -o output.json "Task"

# CI/CD usage with API key
CODEX_API_KEY=sk-xxx codex exec --json "Task"
```

**Exit Codes**:
- `0` - Success
- Non-zero - Various error conditions (needs documentation)

### 6. JSON Output Format (CRITICAL)

When `--json` flag is used, Codex outputs **JSON Lines (JSONL)** format to stdout, with progress/debug info to stderr.

#### Event Types

**Thread/Turn Events**:
```json
{"type": "thread.started", "thread_id": "thread_abc123"}
{"type": "turn.started", "turn_id": "turn_001"}
{"type": "turn.completed", "usage": {"input_tokens": 24763, "cached_input_tokens": 24448, "output_tokens": 122}}
{"type": "turn.failed", "error": "..."}
```

**Item Events** (Core Actions):
```json
{"type": "item.started", "item": {"id": "item_1", "type": "command_execution", "command": "bash -lc ls", "status": "in_progress"}}
{"type": "item.updated", "item": {"id": "item_1", "progress": 50}}
{"type": "item.completed", "item": {"id": "item_3", "type": "agent_message", "text": "Task completed successfully."}}
```

**Item Types**:
- `agent_message` - Text response from Codex
- `reasoning` - Internal reasoning/thinking process
- `command_execution` - Shell command runs
- `file_change` - File creation/modification/deletion
- `mcp_tool_call` - External tool invocation via MCP
- `web_search` - Web search queries and results
- `todo_list` - Task tracking updates
- `plan_update` - Plan modifications
- `error` - Error events

**Error Event**:
```json
{"type": "error", "error": {"code": "...", "message": "..."}}
```

#### Session Result Format

Final output (last line) in non-interactive mode is typically:
```json
{
  "type": "item.completed",
  "item": {
    "id": "final",
    "type": "agent_message",
    "text": "Summary of work completed..."
  }
}
```

**Note**: Documentation inconsistencies exist (2025-2026 issues):
- Field names changed: `item_type` → `type`
- Value changes: `assistant_message` → `agent_message`
- No formal JSON Schema available yet (requested in GitHub issues)

### 7. Session Management

#### Session Storage

**Location**: `~/.codex/sessions/<uuid>.jsonl`

**Format**: JSONL file with:
1. **Header line**: Metadata (session ID, source, timestamp, model provider)
2. **Event lines**: All conversation events chronologically

**Managed by**: `RolloutRecorder` component

**Session Lifecycle**:
1. **Creation**: New `<uuid>.jsonl` file on first run
2. **Persistence**: Automatic after each turn
3. **Resumption**: Load existing JSONL file by session ID
4. **Compaction**: Automatic when token limit exceeded (configurable)

#### Resumption

```bash
# Resume last session
codex resume
codex exec resume --last

# Resume specific session
codex resume <SESSION_ID>
codex exec resume <SESSION_ID>

# List sessions (via shell)
ls ~/.codex/sessions/

# View session content
cat ~/.codex/sessions/<uuid>.jsonl

# Third-party tools
# CodexMonitor: macOS menu bar app for session management
```

**Resumption Behavior**:
- Preserves full conversation history
- Maintains context and approvals
- Appends to existing JSONL file
- Can provide additional instructions

### 8. Tool Capabilities

Codex can perform similar operations to Claude Code:

| Capability | Description |
|------------|-------------|
| **File Operations** | Read, write, edit, delete files |
| **Command Execution** | Run shell commands with approval |
| **Code Review** | Analyze diffs, provide feedback |
| **Web Search** | Fetch external context (optional) |
| **MCP Integration** | Extend with external tools |
| **Image Analysis** | Parse screenshots/designs (PNG/JPEG) |
| **Plan Management** | Create and track multi-step plans |
| **Todo Tracking** | Manage task lists |
| **Session Compaction** | Auto-compress context when needed |

### 9. Model Context Protocol (MCP)

**Purpose**: Extend Codex with external tools/data sources

**Configuration** (`~/.codex/config.toml`):
```toml
[mcp_servers.filesystem]
command = "npx -y @modelcontextprotocol/server-filesystem /allowed/path"
enabled_tools = ["read_file", "write_file"]

[mcp_servers.api_service]
url = "https://example.com/mcp"
enabled_tools = ["fetch_data"]
```

**Integration Points**:
- STDIO servers (local processes)
- HTTP servers (remote services)
- OAuth support for authenticated servers
- Configurable timeouts and tool filtering

### 10. Cloud Integration

**Codex Cloud** (`codex cloud`):
- Parallel task execution
- Multi-attempt best-of-N runs (`--attempts 1-4`)
- Environment-based deployment
- Web interface: `chatgpt.com/codex`

**Workflow**:
```bash
# Submit cloud task
codex cloud --env prod --attempts 3 "Implement feature X"

# Apply resulting diff locally
codex apply
```

### 11. Platform Support

| Platform | Status | Notes |
|----------|--------|-------|
| **macOS** | ✅ Full | Primary development target |
| **Linux** | ✅ Full | Fully supported |
| **Windows** | ⚠️ Experimental | WSL recommended, native support improving |

### 12. Key Differences from Claude Code

| Aspect | Claude Code | Codex |
|--------|-------------|-------|
| **Provider** | Anthropic | OpenAI |
| **Models** | Claude 3.5 Sonnet, etc. | GPT-5-Codex, GPT-5 |
| **License** | Proprietary | Apache-2.0 (open source) |
| **Language** | Unknown | Rust |
| **Config Format** | Unknown/JSON | TOML |
| **MCP Support** | Yes | Yes |
| **Cloud Mode** | No | Yes (`codex cloud`) |
| **Image Input** | Yes | Yes (PNG/JPEG) |
| **Session Format** | Custom JSONL | Custom JSONL (different schema) |
| **Exec Command** | `claude` | `codex exec` |
| **Resume Flag** | `-r <session_id>` | `resume <session_id>` subcommand |
| **JSON Flag** | `--output-format stream-json` | `--json` |
| **Auth** | API key | OAuth or API key |

### 13. Documentation Sources

**Official Docs**:
- [Codex CLI Overview](https://developers.openai.com/codex/cli/)
- [Command Line Reference](https://developers.openai.com/codex/cli/reference/)
- [Non-Interactive Mode](https://developers.openai.com/codex/noninteractive/)
- [Configuration Reference](https://developers.openai.com/codex/config-reference/)
- [Codex Changelog](https://developers.openai.com/codex/changelog/)

**GitHub**:
- [openai/codex](https://github.com/openai/codex)

**Community Resources**:
- [CodexMonitor](https://github.com/Cocoanetics/CodexMonitor) - Session management tool
- Various blog posts and tutorials (2026 content available)

---

## Current Architecture Analysis

### 1. Overview

The SheenApps platform uses a **multi-layered architecture** for AI coding tool integration:

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                        │
│              sheenappsai/src/lib/ai/claudeRunner.ts         │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTPS + HMAC
                            ↓
┌─────────────────────────────────────────────────────────────┐
│              Claude Worker Backend (Node.js)                 │
│                    sheenapps-claude-worker                   │
├─────────────────────────────────────────────────────────────┤
│                 ProviderFactory (Abstraction)                │
│    ├─ ClaudeProvider (SDK)                                   │
│    ├─ ClaudeCLIProvider (CLI wrapper) ← DEFAULT             │
│    └─ MockAIProvider (testing)                               │
├─────────────────────────────────────────────────────────────┤
│              ClaudeExecutorFactory (Strategy)                │
│    ├─ RedisClaudeExecutor ← DEFAULT                         │
│    ├─ HTTPClaudeExecutor (planned)                          │
│    └─ DirectClaudeExecutor (planned)                        │
├─────────────────────────────────────────────────────────────┤
│          ClaudeStreamProcess & ClaudeSession                 │
│  - Process spawning (sh -c 'cd $DIR && claude')             │
│  - stdin/stdout/stderr management                           │
│  - JSONL parsing (MessageParser)                            │
├─────────────────────────────────────────────────────────────┤
│                   Claude CLI Binary                          │
│         /usr/local/bin/claude                                │
└─────────────────────────────────────────────────────────────┘
```

### 2. Key Components

#### A. Provider Factory Pattern

**File**: `src/providers/providerFactory.ts`

**Purpose**: Select AI provider based on configuration

```typescript
interface AIProvider {
  name: string;
  plan(prompt, context, sessionId?): Promise<{tasks, usage, claudeSessionId?}>;
  planStream?(prompt, context, sessionId?): AsyncIterableIterator<...>;
  transform(input, sessionId?): Promise<{output, usage, claudeSessionId?}>;
  transformWithSession?(input, sessionId, contextPrompt): Promise<...>;
  callWithTools?(prompt, tools): Promise<{response, toolCalls?, usage}>;
}
```

**Current Providers**:
- `claude` - Direct Anthropic SDK
- `claude-cli` - CLI wrapper (production default)
- `mock` - Testing
- `gpt` - Placeholder (not implemented)

**Selection**:
```typescript
const providerType = process.env.AI_PROVIDER || 'claude-cli'
const provider = ProviderFactory.getProvider(providerType)
```

#### B. Executor Strategy Pattern

**File**: `src/providers/IClaudeExecutor.ts`

**Purpose**: Decouple execution method from provider logic

```typescript
interface IClaudeExecutor {
  execute(prompt, args, cwd?): Promise<ClaudeExecutorResult>;
  executeStream?(prompt, args, cwd, onChunk): Promise<ClaudeExecutorResult>;
  healthCheck(): Promise<boolean>;
  getMetrics?(): Promise<ClaudeExecutorMetrics>;
  initialize?(): Promise<void>;
  shutdown?(): Promise<void>;
}

interface ClaudeExecutorResult {
  success: boolean;
  output: string;
  error?: string;
  usage?: {inputTokens, outputTokens, totalCost};
  duration?: number;
  sessionId?: string;
}
```

**Current Executors**:
1. **RedisClaudeExecutor** (default):
   - Uses Redis pub/sub for IPC
   - Scalable, multi-process safe
   - Channels: `claude:stream:{requestId}`, `claude:cli:response:{requestId}`

2. **HTTPClaudeExecutor** (planned)
3. **DirectClaudeExecutor** (planned, testing)

#### C. Process Spawning Layer

**Files**:
- `src/stream/claudeProcess.ts` - `ClaudeStreamProcess`
- `src/stream/claudeSession.ts` - `ClaudeSession`

**ClaudeStreamProcess Responsibilities**:
- Find Claude binary (checks multiple locations)
- Spawn child process: `sh -c 'cd $DIR && claude [args]'`
- Manage stdin/stdout/stderr streams
- Line-by-line output reading
- Timeout and cleanup (SIGTERM → SIGKILL)

**ClaudeSession Responsibilities**:
- High-level orchestration
- Rate limiting (global singleton)
- Message parsing (via `MessageParser`)
- Session resumption (`-r` flag)
- Continue-prompt mechanism (sends `\n` if stuck)
- Tool call tracking
- Progress event emission (i18n codes)
- Usage tracking (tokens, cost)
- Error classification

#### D. Message Parser

**File**: `src/stream/messageParser.ts`

**Purpose**: Parse Claude's `stream-json` output

**Extracts**:
- Session ID (from first message)
- Tool uses: Write, Edit, MultiEdit, Bash, Read, Glob, Grep, TodoWrite, ExitPlanMode
- Usage statistics (tokens, cost)
- Error flags
- Result messages (final output)

**Claude Message Format**:
```json
{"type": "message_start", "session_id": "...", "message": {...}}
{"type": "content_block_start", "index": 0, "content_block": {"type": "text"}}
{"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": "..."}}
{"type": "tool_use", "name": "Write", "input": {...}, "tool_use_id": "..."}
{"type": "tool_result", "content": "..."}
{"type": "message_delta", "delta": {"stop_reason": "end_turn"}}
{"type": "message_stop"}
{"type": "result", "is_error": false, "result": "..."}
```

### 3. Frontend Integration

**File**: `sheenappsai/src/lib/ai/claudeRunner.ts`

**Features**:
- HMAC signature verification
- Correlation ID tracking
- Retry logic (exponential backoff)
- Rate limit handling (429 → fallback to GPT-4)
- Sentry error tracking
- Usage monitoring

**Request Flow**:
```typescript
const signature = createHmac('sha256', secret).update(prompt).digest('hex')

fetch(workerUrl, {
  method: 'POST',
  headers: {
    'x-sheen-signature': signature,
    'x-correlation-id': correlationId,
  },
  body: JSON.stringify({prompt}),
})
```

### 4. Configuration

**Environment Variables**:
```bash
# Provider selection
AI_PROVIDER=claude-cli  # claude | claude-cli | mock | gpt

# Executor mode
CLAUDE_EXECUTOR_MODE=redis  # redis | http | direct

# Authentication
CLAUDE_API_KEY=...
ANTHROPIC_API_KEY=...

# Redis (for executor coordination)
REDIS_HOST=127.0.0.1
REDIS_PORT=6379

# Timeouts
CLAUDE_TIMEOUTS.complex=600000  # 10 minutes
CLAUDE_TIMEOUTS.documentation=300000  # 5 minutes
```

### 5. Session Management

**Claude Session Lifecycle**:
1. `ClaudeSession.run(prompt, cwd, sessionId?)` - Initial or resumed
2. Rate limiter acquisition
3. Process spawn with args: `--output-format stream-json`, `--verbose`, `--dangerously-skip-permissions`
4. Resume flag: `-r ${sessionId}` if resuming
5. Prompt sent via stdin
6. Line-by-line output parsing
7. Continue mechanism (periodic `\n` if no output)
8. Result detection → process termination
9. Return `SessionResult` with metadata

**SessionResult Structure**:
```typescript
interface SessionResult {
  success: boolean;
  result: string;
  error?: string;
  messages: StreamMessage[];
  sessionId?: string;
  totalCost?: number;
  tokenUsage?: {input: number; output: number};
  filesCreated?: number;
  filesModified?: number;
  errorsEncountered?: number;
  errorsFixed?: number;
  toolCallsTotal?: number;
  needsFallback?: boolean;  // For resumption logic
}
```

### 6. Error Handling

**Services**:
- `claudeErrorClassifier.ts` - Categorize errors
- `claudeErrorResolver.ts` - Attempt recovery
- `usageLimitService.ts` - Detect usage limits (exit code 127)
- `SystemConfigurationError` - Missing binary

**Error Categories**:
- TypeScript compilation errors
- Dependency resolution
- File not found (ENOENT)
- Build failures
- Usage limits exceeded

### 7. Key Abstractions Suitable for Codex

✅ **Reusable**:
- `AIProvider` interface - High-level contract
- `IClaudeExecutor` interface - Execution abstraction
- `ProviderFactory` pattern - Provider selection
- `ClaudeExecutorFactory` pattern - Executor selection
- Redis pub/sub orchestration - IPC mechanism
- HMAC authentication - Security
- Retry logic - Resilience

⚠️ **Needs Adaptation**:
- `ClaudeStreamProcess` - Binary discovery, flags, output format
- `ClaudeSession` - Session resumption syntax
- `MessageParser` - Event schema differences
- Tool call extraction - Field name variations

❌ **Claude-Specific** (requires new implementations):
- Claude CLI flag syntax (`--output-format stream-json` vs `--json`)
- Session resumption (`-r sessionId` vs `resume sessionId`)
- Message event schema

---

## Technical Comparison: Codex vs Claude Code

### 1. CLI Interface Comparison

| Aspect | Claude Code | Codex |
|--------|-------------|-------|
| **Interactive Launch** | `claude` | `codex` |
| **Non-Interactive** | `claude <prompt>` with flags | `codex exec <prompt>` |
| **JSON Output** | `--output-format stream-json` | `--json` |
| **Verbose Mode** | `--verbose` | N/A (always verbose in JSON?) |
| **Permissions** | `--dangerously-skip-permissions` | `--full-auto`, `--dangerously-bypass-approvals-and-sandbox` |
| **Resume Session** | `-r <session_id>` | `resume <session_id>` (subcommand) or `codex exec resume --last` |
| **Working Dir** | Via shell wrapper (`cd $DIR && claude`) | `--cd <path>` or `-C <path>` |
| **Model Selection** | Unknown (API key determines) | `--model <name>` or `-m <name>` |
| **Config Override** | Unknown | `-c key=value` (repeatable) |
| **Output to File** | Capture stdout | `--output-last-message <path>` or `-o <path>` |

### 2. JSON Output Schema Comparison

#### Event Type Mapping

| Event Class | Claude Code | Codex |
|-------------|-------------|-------|
| **Session Start** | `message_start` | `thread.started` |
| **Turn Start** | `message_start` (same) | `turn.started` |
| **Turn End** | `message_stop` | `turn.completed` |
| **Content Start** | `content_block_start` | `item.started` |
| **Content Update** | `content_block_delta` | `item.updated` |
| **Content End** | `content_block_stop` | `item.completed` |
| **Tool Use** | `tool_use` | `item.started` with `type: "command_execution"` or `"file_change"` |
| **Tool Result** | `tool_result` | `item.completed` |
| **Final Result** | `result` | `item.completed` with `type: "agent_message"` |
| **Error** | `result` with `is_error: true` | `error` or `turn.failed` |

#### Field Name Differences

| Concept | Claude Code | Codex |
|---------|-------------|-------|
| **Session ID** | `session_id` (top-level) | `thread_id` |
| **Message ID** | `message.id` | `turn_id` |
| **Content Type** | `content.type` | `item.type` |
| **Tool Name** | `name` | Embedded in `item.type` |
| **Tool Input** | `input` | `item.command`, `item.file_path`, etc. |
| **Text Content** | `text` (in delta) | `item.text` |
| **Stop Reason** | `delta.stop_reason` | `turn.completed` (implicit) |

#### Item/Tool Type Mapping

| Capability | Claude Code | Codex |
|------------|-------------|-------|
| **Text Response** | `type: "text"` | `item.type: "agent_message"` |
| **File Write** | `tool_use` `name: "Write"` | `item.type: "file_change"` with action |
| **File Edit** | `tool_use` `name: "Edit"` | `item.type: "file_change"` with action |
| **Command Exec** | `tool_use` `name: "Bash"` | `item.type: "command_execution"` |
| **File Read** | `tool_use` `name: "Read"` | (Implicit, or `file_change` with read) |
| **Search** | `tool_use` `name: "Grep"` | `item.type: "web_search"` (different!) |
| **Web Search** | N/A | `item.type: "web_search"` |
| **Reasoning** | N/A (or hidden) | `item.type: "reasoning"` |
| **Todo** | `tool_use` `name: "TodoWrite"` | `item.type: "todo_list"` |
| **MCP Tool** | N/A | `item.type: "mcp_tool_call"` |

### 3. Session Management Comparison

| Aspect | Claude Code | Codex |
|--------|-------------|-------|
| **Storage Location** | Unknown (likely `~/.claude/`) | `~/.codex/sessions/<uuid>.jsonl` |
| **File Format** | JSONL (custom schema) | JSONL (custom schema, different) |
| **Resume Syntax** | `claude -r <session_id> <prompt>` | `codex resume <session_id> <prompt>` or `codex exec resume --last` |
| **Session ID Source** | From first message (`session_id`) | From thread start (`thread_id`) or filename |
| **Compaction** | Unknown | Automatic at `model_auto_compact_token_limit` |
| **Persistence Config** | Unknown | `history.persistence = "save-all"` or `"none"` |

### 4. Authentication Comparison

| Aspect | Claude Code | Codex |
|--------|-------------|-------|
| **Method 1** | API key (`CLAUDE_API_KEY`, `ANTHROPIC_API_KEY`) | OAuth via ChatGPT account |
| **Method 2** | N/A | API key (`CODEX_API_KEY`) - exec mode only |
| **Credential Storage** | Unknown | `~/.codex/` (keyring or file) |
| **Login Command** | Unknown | `codex login` |
| **Logout Command** | Unknown | `codex logout` |

### 5. Configuration Comparison

| Aspect | Claude Code | Codex |
|--------|-------------|-------|
| **Config File** | Unknown | `~/.codex/config.toml` |
| **Format** | Likely JSON or YAML | TOML |
| **Location** | Unknown (likely `~/.claude/`) | `~/.codex/` |
| **Profiles** | Unknown | Supported (`--profile` flag) |
| **Runtime Override** | Unknown | `-c key=value` flag |
| **Admin Lock** | Unknown | `requirements.toml` |

### 6. Capabilities Comparison

| Feature | Claude Code | Codex | Notes |
|---------|-------------|-------|-------|
| **File Operations** | ✅ | ✅ | Both support read/write/edit |
| **Command Execution** | ✅ | ✅ | Shell command execution |
| **Image Input** | ✅ | ✅ | Screenshots, design specs |
| **Web Search** | ❓ | ✅ | Codex has explicit support |
| **Code Review** | ❓ | ✅ | Codex has `/review` command |
| **MCP Integration** | ✅ | ✅ | Both support MCP servers |
| **Session Resumption** | ✅ | ✅ | Different syntax |
| **Cloud Execution** | ❌ | ✅ | Codex Cloud unique |
| **Reasoning Display** | ❓ | ✅ | Codex exposes reasoning |
| **Todo Tracking** | ✅ | ✅ | Both have task management |
| **Plan Management** | ❓ | ✅ | Codex has plan updates |

### 7. Platform Support Comparison

| Platform | Claude Code | Codex |
|----------|-------------|-------|
| **macOS** | ✅ | ✅ |
| **Linux** | ✅ | ✅ |
| **Windows** | ❓ | ⚠️ Experimental (WSL recommended) |

### 8. License & Access Comparison

| Aspect | Claude Code | Codex |
|--------|-------------|-------|
| **License** | Proprietary (Anthropic) | Apache-2.0 (Open Source) |
| **Source Code** | Closed | Open (github.com/openai/codex) |
| **Access Model** | API subscription | ChatGPT subscription or API |
| **Pricing** | Per-token (Anthropic pricing) | Included in ChatGPT plans |

---

## Integration Architecture

### 1. Design Principles

1. **Abstraction-First**: Leverage existing `AIProvider` and `IClaudeExecutor` interfaces
2. **Zero Breaking Changes**: No modifications to existing Claude Code functionality
3. **Configuration-Driven**: User selects tool via environment variable or UI preference
4. **Unified Session Management**: Abstract session handling across tools
5. **Consistent API Surface**: Frontend should be agnostic to underlying tool
6. **Gradual Rollout**: Feature flag for Codex support

### 2. Proposed Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                        │
│              sheenappsai/src/lib/ai/aiRunner.ts             │
│              (Renamed from claudeRunner.ts)                  │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTPS + HMAC
                            ↓
┌─────────────────────────────────────────────────────────────┐
│              AI Worker Backend (Node.js)                     │
│              (sheenapps-claude-worker - rename?)             │
├─────────────────────────────────────────────────────────────┤
│                 ProviderFactory (Enhanced)                   │
│    ├─ ClaudeProvider (SDK)                                   │
│    ├─ ClaudeCLIProvider (CLI wrapper)                        │
│    ├─ CodexProvider (NEW - SDK placeholder)                 │
│    ├─ CodexCLIProvider (NEW - CLI wrapper) ← NEW DEFAULT    │
│    └─ MockAIProvider (testing)                               │
├─────────────────────────────────────────────────────────────┤
│              ExecutorFactory (Renamed, Enhanced)             │
│    ├─ RedisExecutor (tool-agnostic)                         │
│    ├─ HTTPExecutor (planned)                                │
│    └─ DirectExecutor (planned)                              │
├─────────────────────────────────────────────────────────────┤
│          Tool-Specific Process Layers                        │
│    ├─ ClaudeStreamProcess & ClaudeSession                    │
│    └─ CodexStreamProcess & CodexSession (NEW)               │
├─────────────────────────────────────────────────────────────┤
│                Unified Message Parser                        │
│    ├─ ClaudeMessageParser (existing)                         │
│    └─ CodexMessageParser (NEW)                              │
├─────────────────────────────────────────────────────────────┤
│                   Session Manager (NEW)                      │
│    - Unified session storage abstraction                     │
│    - Tool-agnostic session ID mapping                        │
│    - Cross-tool session migration (future)                   │
└─────────────────────────────────────────────────────────────┘
                            │ Child Process
                            ↓
┌─────────────────────────────────────────────────────────────┐
│              Tool Binaries (Discovered at Runtime)           │
│    ├─ /usr/local/bin/claude                                  │
│    └─ /usr/local/bin/codex                                   │
└─────────────────────────────────────────────────────────────┘
```

### 3. New Components

#### A. CodexCLIProvider

**File**: `src/providers/codexCLIProvider.ts`

**Responsibilities**:
- Implement `AIProvider` interface
- Delegate to `CodexSession` for execution
- Map abstract method calls (`plan`, `transform`, etc.) to Codex prompts
- Handle usage tracking and cost calculation

**Example Structure**:
```typescript
export class CodexCLIProvider implements AIProvider {
  name = 'codex-cli'

  async plan(prompt: string, context: any, sessionId?: string) {
    const session = new CodexSession()
    const result = await session.run(
      `Plan the following task:\n${prompt}`,
      context.cwd,
      sessionId
    )
    // Parse result for tasks
    return { tasks: extractTasks(result), usage: result.usage, codexSessionId: result.sessionId }
  }

  async transform(input: string, sessionId?: string) {
    const session = new CodexSession()
    const result = await session.run(input, process.cwd(), sessionId)
    return { output: result.result, usage: result.usage, codexSessionId: result.sessionId }
  }

  async initialize() {
    // Check for codex binary
    const codexPath = await findCodexBinary()
    if (!codexPath) throw new SystemConfigurationError('Codex CLI not found')
  }

  async healthCheck() {
    try {
      await execAsync('codex --version')
      return true
    } catch {
      return false
    }
  }
}
```

#### B. CodexStreamProcess

**File**: `src/stream/codexProcess.ts`

**Responsibilities**:
- Find Codex binary (check NPM global, Homebrew, PATH)
- Spawn child process: `codex exec --json <prompt>` (or with --cd flag)
- Manage stdin/stdout/stderr streams
- Line-by-line JSONL output reading
- Timeout and cleanup

**Key Differences from ClaudeStreamProcess**:
- Command: `codex exec` instead of `claude`
- Flags: `--json` instead of `--output-format stream-json`
- Working directory: `--cd $DIR` flag instead of shell wrapper
- Resume: Separate flow (needs session ID from previous run)

**Example Structure**:
```typescript
export class CodexStreamProcess {
  static async spawn(prompt: string, cwd: string, options: CodexSpawnOptions) {
    const codexBinary = await findCodexBinary()

    const args = ['exec', '--json']

    if (cwd) args.push('--cd', cwd)
    if (options.model) args.push('--model', options.model)
    if (options.fullAuto) args.push('--full-auto')
    if (options.configOverrides) {
      options.configOverrides.forEach(([key, value]) => {
        args.push('-c', `${key}=${value}`)
      })
    }

    args.push(prompt)

    const childProcess = spawn(codexBinary, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        CODEX_API_KEY: options.apiKey || process.env.CODEX_API_KEY,
      },
    })

    return new CodexStreamProcess(childProcess, options)
  }

  // ... similar to ClaudeStreamProcess but adapted for Codex
}
```

#### C. CodexSession

**File**: `src/stream/codexSession.ts`

**Responsibilities**:
- High-level orchestration (like `ClaudeSession`)
- Rate limiting
- Message parsing via `CodexMessageParser`
- Session resumption handling
- Tool call tracking
- Progress event emission
- Usage tracking

**Key Differences from ClaudeSession**:
- Use `CodexStreamProcess` for spawning
- Parse Codex-specific JSON events
- Handle resumption differently (subcommand vs flag)
- Map Codex item types to internal tool call format

**Example Structure**:
```typescript
export class CodexSession {
  async run(prompt: string, cwd: string, sessionId?: string): Promise<SessionResult> {
    const rateLimiter = getGlobalRateLimiter()
    await rateLimiter.acquire()

    try {
      const process = await CodexStreamProcess.spawn(prompt, cwd, {
        fullAuto: true,
        timeout: 300000,
      })

      const parser = new CodexMessageParser()
      const messages: any[] = []

      for await (const line of process.stdout) {
        const event = parser.parse(line)
        if (event) {
          messages.push(event)
          this.handleEvent(event)
        }
      }

      return {
        success: !process.error,
        result: parser.getFinalMessage(),
        sessionId: parser.getSessionId(),
        messages,
        // ... usage, tool calls, etc.
      }
    } finally {
      rateLimiter.release()
    }
  }

  async resume(sessionId: string, prompt: string, cwd: string): Promise<SessionResult> {
    // Use `codex exec resume <sessionId> <prompt>`
    const process = await CodexStreamProcess.spawnResume(sessionId, prompt, cwd)
    // ... similar to run()
  }

  private handleEvent(event: CodexEvent) {
    // Emit progress events based on event.type
    // Track tool calls (file_change, command_execution, etc.)
  }
}
```

#### D. CodexMessageParser

**File**: `src/stream/codexMessageParser.ts`

**Responsibilities**:
- Parse Codex JSONL output
- Extract session ID (`thread_id` from `thread.started`)
- Identify tool calls from `item.started` events
- Track usage from `turn.completed` events
- Detect final result (last `item.completed` with `type: "agent_message"`)

**Event Handling**:
```typescript
export class CodexMessageParser {
  parse(line: string): CodexEvent | null {
    try {
      const event = JSON.parse(line) as CodexEvent

      switch (event.type) {
        case 'thread.started':
          this.threadId = event.thread_id
          break

        case 'turn.started':
          this.currentTurn = event.turn_id
          break

        case 'turn.completed':
          this.usage = event.usage
          break

        case 'item.started':
        case 'item.completed':
          return this.parseItem(event)

        case 'error':
        case 'turn.failed':
          this.error = event
          break
      }

      return event
    } catch (e) {
      return null
    }
  }

  private parseItem(event: CodexItemEvent): ToolCall | null {
    const { item } = event

    switch (item.type) {
      case 'file_change':
        return {
          tool: 'Write',  // or 'Edit' based on action
          input: { file_path: item.file_path, content: item.content }
        }

      case 'command_execution':
        return {
          tool: 'Bash',
          input: { command: item.command }
        }

      case 'agent_message':
        if (event.type === 'item.completed') {
          this.finalMessage = item.text
        }
        return null

      // ... other types
    }
  }

  getSessionId(): string { return this.threadId }
  getFinalMessage(): string { return this.finalMessage }
  getUsage(): Usage { return this.usage }
}
```

#### E. Unified Session Manager (Optional, Phase 2)

**File**: `src/session/sessionManager.ts`

**Purpose**: Abstract session storage across tools

**Responsibilities**:
- Map internal session IDs to tool-specific IDs
- Store metadata (tool type, creation time, last used)
- Enable cross-tool session queries
- Future: Session migration between tools

**Structure**:
```typescript
interface UnifiedSession {
  id: string;  // Internal UUID
  tool: 'claude' | 'codex';
  toolSessionId: string;  // Tool-specific ID
  createdAt: Date;
  lastUsedAt: Date;
  metadata: Record<string, any>;
}

export class SessionManager {
  async createSession(tool: string, toolSessionId: string): Promise<string> {
    const id = uuid()
    await db.sessions.create({
      id,
      tool,
      toolSessionId,
      createdAt: new Date(),
    })
    return id
  }

  async getSession(id: string): Promise<UnifiedSession | null> {
    return db.sessions.findById(id)
  }

  async getToolSessionId(id: string): Promise<string | null> {
    const session = await this.getSession(id)
    return session?.toolSessionId || null
  }
}
```

### 4. Configuration Strategy

#### Environment Variables

```bash
# Tool selection (new)
AI_TOOL=codex  # claude | codex (default: claude for backward compat)

# Provider type (existing, still relevant)
AI_PROVIDER=codex-cli  # claude-cli | codex-cli | mock

# Executor mode (existing, tool-agnostic)
EXECUTOR_MODE=redis  # redis | http | direct

# Authentication (tool-specific)
CLAUDE_API_KEY=...
CODEX_API_KEY=...

# Codex-specific config
CODEX_MODEL=gpt-5-codex  # gpt-5-codex | gpt-5
CODEX_CONFIG_PROFILE=default  # Profile from ~/.codex/config.toml
```

#### Provider Factory Enhancement

```typescript
export class ProviderFactory {
  static getProvider(type?: string): AIProvider {
    const tool = process.env.AI_TOOL || 'claude'
    const providerType = type || process.env.AI_PROVIDER || `${tool}-cli`

    switch (providerType) {
      case 'claude':
      case 'claude-sdk':
        return new ClaudeProvider()

      case 'claude-cli':
        return new ClaudeCLIProvider()

      case 'codex':
      case 'codex-sdk':
        return new CodexProvider()  // Future: direct API

      case 'codex-cli':
        return new CodexCLIProvider()

      case 'mock':
        return new MockAIProvider()

      default:
        throw new Error(`Unknown provider: ${providerType}`)
    }
  }
}
```

### 5. Binary Discovery Strategy

**Challenges**:
- Both tools can be installed via NPM, Homebrew, or direct download
- Installation locations vary by method and platform
- Need graceful fallback and clear error messages

**Search Order** (Codex):
1. `CODEX_BINARY` environment variable (override)
2. `/usr/local/bin/codex` (NPM global default)
3. `/opt/homebrew/bin/codex` (Homebrew on Apple Silicon)
4. `~/.local/bin/codex` (manual install)
5. `which codex` (PATH search)

**Implementation**:
```typescript
async function findCodexBinary(): Promise<string | null> {
  // Check override
  if (process.env.CODEX_BINARY) {
    if (await fileExists(process.env.CODEX_BINARY)) {
      return process.env.CODEX_BINARY
    }
  }

  // Check common locations
  const candidates = [
    '/usr/local/bin/codex',
    '/opt/homebrew/bin/codex',
    path.join(os.homedir(), '.local/bin/codex'),
  ]

  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return candidate
    }
  }

  // Check PATH
  try {
    const { stdout } = await execAsync('which codex')
    return stdout.trim()
  } catch {
    return null
  }
}
```

### 6. User Selection Mechanism

**Phase 1: Configuration-Based**
- Users set `AI_TOOL` environment variable
- Platform administrators choose default tool
- No UI changes required

**Phase 2: User Preference (Database)**
- Add `preferred_tool` column to `users` table
- User settings page to select preferred tool
- Frontend sends tool preference with each request

**Phase 3: Per-Request Selection (Advanced)**
- UI dropdown: "Use Claude" vs "Use Codex"
- Request includes `tool` parameter
- Useful for A/B testing or tool-specific strengths

### 7. Backward Compatibility Strategy

1. **Default Behavior**: If `AI_TOOL` not set, default to `claude`
2. **Existing Env Vars**: `AI_PROVIDER=claude-cli` still works
3. **No API Changes**: `AIProvider` interface unchanged
4. **Frontend Agnostic**: `claudeRunner.ts` → `aiRunner.ts` (transparent rename)
5. **Session IDs**: Existing Claude sessions unaffected

### 8. Feature Flag Approach

```typescript
// Feature flag service
const features = {
  codexSupport: process.env.FEATURE_CODEX === 'true',
}

// In provider factory
if (providerType.startsWith('codex') && !features.codexSupport) {
  throw new Error('Codex support not enabled. Set FEATURE_CODEX=true')
}

// In frontend UI (future)
{features.codexSupport && (
  <select name="tool">
    <option value="claude">Claude Code</option>
    <option value="codex">Codex</option>
  </select>
)}
```

---

## Implementation Plan

### Phase 1: Core Integration (Week 1-2)

#### Sprint 1.1: Foundation (Days 1-3)

**Tasks**:
1. Create `CodexMessageParser`
   - Parse JSONL events (`thread.started`, `turn.started`, `item.*`, `turn.completed`)
   - Extract session ID, usage, final message
   - Map item types to tool calls
   - Unit tests with sample Codex output

2. Create `CodexStreamProcess`
   - Binary discovery (NPM, Homebrew, PATH)
   - Process spawning with `codex exec --json`
   - Flag handling (`--cd`, `--model`, `--full-auto`, `-c`)
   - Stdin/stdout/stderr management
   - Unit tests with mock process

3. Create `CodexSession`
   - Orchestration layer (rate limiting, error handling)
   - Use `CodexStreamProcess` and `CodexMessageParser`
   - Tool call tracking
   - Progress event emission
   - Unit tests

**Deliverables**:
- `src/stream/codexMessageParser.ts` with tests
- `src/stream/codexProcess.ts` with tests
- `src/stream/codexSession.ts` with tests
- Binary discovery utility

**Testing**:
- Unit tests with mocked Codex output
- Integration test with real Codex CLI (local dev)

#### Sprint 1.2: Provider Implementation (Days 4-6)

**Tasks**:
1. Create `CodexCLIProvider`
   - Implement `AIProvider` interface
   - Map `plan()` to Codex prompts
   - Map `transform()` to Codex prompts
   - Handle session resumption
   - Initialize and health check

2. Enhance `ProviderFactory`
   - Add `codex-cli` case
   - Add `AI_TOOL` environment variable support
   - Maintain backward compatibility

3. Update Executor Layer
   - Ensure `RedisExecutor` is tool-agnostic (likely already is)
   - Test with Codex provider

4. Add Configuration
   - Environment variable documentation
   - Feature flag (`FEATURE_CODEX`)
   - Binary path override (`CODEX_BINARY`)

**Deliverables**:
- `src/providers/codexCLIProvider.ts` with tests
- Updated `src/providers/providerFactory.ts`
- Configuration documentation
- Environment variable examples

**Testing**:
- Unit tests for provider methods
- Integration tests with real Codex
- Redis executor tests with Codex

#### Sprint 1.3: End-to-End Integration (Days 7-10)

**Tasks**:
1. Worker Integration
   - Update worker routes to use new provider
   - Test with Codex via API calls
   - Verify HMAC authentication works
   - Monitor error handling

2. Frontend Updates (Optional Phase 1)
   - Rename `claudeRunner.ts` to `aiRunner.ts` (transparent)
   - Update imports
   - No functional changes yet

3. Session Management
   - Verify session creation with Codex
   - Test session resumption
   - Handle session not found gracefully

4. Error Handling
   - Classify Codex-specific errors
   - Map to existing error types
   - Update error messages for clarity

**Deliverables**:
- Working end-to-end flow with Codex
- API tests demonstrating Codex usage
- Error handling for Codex-specific issues
- Documentation update

**Testing**:
- API integration tests (Postman, curl)
- E2E test with frontend → worker → Codex
- Session resumption tests
- Error scenario tests (missing binary, auth failure)

### Phase 2: Advanced Features (Week 3)

#### Sprint 2.1: User Preferences (Days 11-13)

**Tasks**:
1. Database Schema
   - Add `preferred_tool` column to `users` table (enum: 'claude', 'codex')
   - Migration script
   - Default to 'claude'

2. User Settings API
   - GET `/api/user/settings` - Retrieve preferences
   - PUT `/api/user/settings` - Update preferences
   - Include `preferred_tool` field

3. Worker Integration
   - Read user preference from request context
   - Override `AI_TOOL` based on user preference
   - Fallback to default if preference not set

**Deliverables**:
- Database migration
- User preferences API endpoints
- Worker preference handling
- API documentation

**Testing**:
- Preference CRUD tests
- Preference-based provider selection tests
- Default behavior tests

#### Sprint 2.2: Frontend UI (Days 14-16)

**Tasks**:
1. Settings Page
   - Add "Preferred AI Tool" dropdown
   - Options: Claude Code, Codex
   - Save to API on change
   - Show current selection

2. Optional: Inline Tool Selector
   - Per-request tool selection (advanced)
   - Dropdown in builder UI
   - "Use Claude" vs "Use Codex"
   - Pass tool preference in API request

3. Usage Analytics
   - Track which tool users prefer
   - Monitor success rates per tool
   - A/B testing infrastructure (optional)

**Deliverables**:
- User settings UI component
- Optional inline tool selector
- Analytics tracking
- User-facing documentation

**Testing**:
- UI tests for settings page
- Tool selection persistence tests
- Analytics event verification

### Phase 3: Optimization & Monitoring (Week 4)

#### Sprint 3.1: Performance Optimization (Days 17-19)

**Tasks**:
1. Binary Caching
   - Cache discovered binary paths
   - Invalidate on health check failure
   - Reduce filesystem overhead

2. Output Streaming Optimization
   - Ensure efficient JSONL parsing
   - Minimize memory usage for long sessions
   - Benchmark vs Claude Code

3. Rate Limiting
   - Per-tool rate limits (if needed)
   - Shared vs separate rate limiters
   - Configuration options

**Deliverables**:
- Performance benchmarks
- Optimized binary discovery
- Rate limiting configuration

**Testing**:
- Load testing with concurrent requests
- Memory profiling
- Rate limit tests

#### Sprint 3.2: Monitoring & Observability (Days 20-21)

**Tasks**:
1. Metrics
   - Tool usage breakdown (Claude vs Codex)
   - Success rates per tool
   - Average latency per tool
   - Token usage and cost per tool

2. Logging
   - Structured logs for tool selection
   - Session lifecycle events
   - Error logs with tool context

3. Alerting
   - Binary not found alerts
   - Elevated error rates per tool
   - Usage limit warnings

4. Dashboard
   - Grafana dashboard for tool metrics
   - Success rate comparison
   - Cost comparison

**Deliverables**:
- Prometheus metrics
- Structured logging
- Alert configurations
- Grafana dashboard

**Testing**:
- Verify metrics emission
- Test alert thresholds
- Dashboard validation

### Phase 4: Documentation & Rollout (Final Days)

#### Sprint 4.1: Documentation (Days 22-23)

**Tasks**:
1. User Documentation
   - How to choose between Claude and Codex
   - Installation instructions (both tools)
   - Authentication setup for both tools
   - Troubleshooting guide

2. Admin Documentation
   - Configuration guide
   - Binary discovery process
   - Feature flag usage
   - Monitoring and alerts

3. Developer Documentation
   - Architecture diagrams
   - Provider implementation guide
   - Adding new tools (future)
   - Testing guide

**Deliverables**:
- User-facing docs (README, wiki)
- Admin runbook
- Developer guide
- Troubleshooting FAQ

#### Sprint 4.2: Rollout Strategy (Days 24-25)

**Tasks**:
1. Gradual Rollout
   - Enable for internal users first (feature flag)
   - Monitor for issues
   - Gather feedback

2. Beta Testing
   - Select beta users
   - Provide documentation
   - Collect usage data and feedback

3. General Availability
   - Enable for all users (default off, opt-in)
   - Announcement and documentation
   - Support preparation

4. Post-Launch Monitoring
   - Monitor error rates
   - Track adoption
   - Iterate based on feedback

**Deliverables**:
- Rollout plan
- Beta user feedback
- Launch announcement
- Support resources

**Testing**:
- Smoke tests in production-like environment
- Beta user acceptance testing
- Rollback procedure validation

---

## Risk Assessment

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **JSON Schema Divergence** | High | Medium | Build flexible parser; use defensive parsing; handle schema evolution |
| **Session Incompatibility** | Medium | Medium | Separate session storage; no cross-tool resumption initially |
| **Binary Discovery Failure** | Medium | High | Clear error messages; fallback to PATH; health checks; user override |
| **Authentication Issues** | Medium | Medium | Support both OAuth and API key; clear setup docs; test both methods |
| **Performance Degradation** | Low | Medium | Benchmark early; optimize hot paths; monitor latency |
| **Codex API Changes** | Medium | High | Pin Codex version; monitor changelog; version detection; graceful degradation |
| **Redis Pub/Sub Issues** | Low | High | Already proven with Claude; reuse existing patterns |
| **Windows Compatibility** | Medium | Low | Document WSL requirement; test on Windows; Codex handles platform diffs |

### Product Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **User Confusion** | Medium | Medium | Clear UI; documentation; default to Claude (existing behavior) |
| **Split User Base** | Low | Low | Offer choice; track preferences; optimize both tools |
| **Support Complexity** | Medium | Medium | Unified error handling; clear logging; tool context in tickets |
| **Cost Implications** | Medium | Medium | Track usage per tool; optimize prompts; monitor costs |
| **Feature Parity** | High | Low | Document differences; set expectations; don't promise 1:1 parity |

### Operational Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Deployment Complexity** | Low | Medium | Phased rollout; feature flags; rollback plan |
| **Monitoring Gaps** | Medium | Medium | Add tool-specific metrics; update dashboards; alert on anomalies |
| **Incident Response** | Low | High | Update runbooks; train support; tool-aware debugging |
| **Dependency Management** | Medium | Low | Lock Codex version; test upgrades; document compatibility |

---

## Testing Strategy

### 1. Unit Testing

**Components to Test**:
- `CodexMessageParser` - Parse all event types, handle malformed JSON
- `CodexStreamProcess` - Binary discovery, flag construction, process lifecycle
- `CodexSession` - Rate limiting, tool tracking, usage calculation
- `CodexCLIProvider` - Interface compliance, method implementations
- Binary discovery utilities - All search paths, file existence checks

**Test Data**:
- Sample Codex JSONL outputs (various scenarios)
- Mock process stdout/stderr
- Edge cases (empty output, errors, timeouts)

**Tools**:
- Jest/Vitest for unit tests
- Mock filesystem (`mock-fs`)
- Mock child processes

### 2. Integration Testing

**Scenarios**:
1. **Simple Task Execution**
   - Spawn Codex, send prompt, receive result
   - Verify session ID extraction
   - Check tool calls tracked correctly

2. **Session Resumption**
   - Create session, get session ID
   - Resume session with new prompt
   - Verify continuity

3. **Error Handling**
   - Codex binary not found
   - Authentication failure
   - Timeout scenarios
   - Invalid JSON output

4. **Tool Comparison**
   - Same prompt to Claude and Codex
   - Compare outputs (informally)
   - Verify both work correctly

**Environment**:
- Local dev machines with Codex installed
- Docker container with Codex pre-installed
- CI pipeline with Codex setup

### 3. End-to-End Testing

**User Flows**:
1. **Default Tool (Claude)**
   - User makes request, no preference set
   - Verify Claude used (existing behavior)

2. **Explicit Codex Selection**
   - Set `AI_TOOL=codex` environment variable
   - User makes request
   - Verify Codex used, successful completion

3. **User Preference**
   - User sets preference to Codex in settings
   - Make request without explicit tool selection
   - Verify preference honored

4. **Session Continuity**
   - Start task with Codex
   - Resume session
   - Verify context preserved

**Tools**:
- Playwright for UI automation
- API testing (Postman, curl scripts)
- E2E test suite

### 4. Performance Testing

**Metrics to Measure**:
- Binary discovery time
- Process spawn latency
- JSON parsing throughput
- End-to-end request duration
- Memory usage per session
- Concurrent session capacity

**Scenarios**:
- Single request (baseline)
- 10 concurrent requests
- 50 concurrent requests
- Long-running session (1000+ events)

**Tools**:
- Apache Bench, k6, or Artillery
- Memory profilers (Node.js `--inspect`)
- Grafana dashboards for visualization

### 5. Compatibility Testing

**Dimensions**:
- **Platforms**: macOS (Intel, Apple Silicon), Linux (x86_64, ARM), Windows (WSL)
- **Codex Versions**: Latest stable, previous major version
- **Node.js Versions**: 18.x, 20.x, 22.x
- **Installation Methods**: NPM global, Homebrew, direct binary

**Test Matrix**:
- Priority 1: macOS + NPM + latest Codex
- Priority 2: Linux + NPM + latest Codex
- Priority 3: All combinations (CI matrix)

### 6. Security Testing

**Checks**:
- API key exposure in logs (redaction)
- HMAC signature validation with Codex requests
- Command injection via prompt escaping
- File access restrictions (sandbox mode)
- Session hijacking (session ID security)

**Tools**:
- Manual security review
- Static analysis (ESLint security plugins)
- Dependency vulnerability scanning

---

## Rollout Plan

### Stage 1: Internal Alpha (Week 4)

**Target**: 1-2 developers

**Actions**:
1. Enable `FEATURE_CODEX=true` for dev environments
2. Test with real tasks
3. Gather initial feedback
4. Fix critical bugs

**Success Criteria**:
- Codex executes tasks successfully
- No crashes or data loss
- Feedback is positive or actionable

### Stage 2: Internal Beta (Week 5)

**Target**: 5-10 internal users (engineering team)

**Actions**:
1. Deploy to staging environment
2. Provide documentation and setup instructions
3. Offer both Claude and Codex options
4. Collect usage metrics and feedback

**Success Criteria**:
- 80% success rate for Codex tasks
- No critical bugs reported
- Positive sentiment from testers

### Stage 3: External Beta (Week 6-7)

**Target**: 50-100 selected users (opt-in)

**Actions**:
1. Send invitations with setup guide
2. Enable feature flag for beta users
3. Monitor usage and errors closely
4. Provide dedicated support channel

**Success Criteria**:
- Similar success rate to Claude
- No major incidents
- Actionable feedback incorporated

### Stage 4: General Availability (Week 8+)

**Target**: All users (opt-in)

**Actions**:
1. Announce Codex support in release notes
2. Update documentation
3. Enable feature for all users (default: Claude)
4. Provide tool selection in settings

**Success Criteria**:
- Stable error rates
- Growing adoption
- Positive user feedback

### Stage 5: Default for New Users (Future)

**Consideration**: Once Codex is proven stable and cost-effective

**Actions**:
1. Make Codex default for new accounts (configurable)
2. Migrate existing users gradually (opt-in)
3. Continue supporting Claude indefinitely

---

## Decisions Made

*Based on expert review, official documentation research, and our specific situation (1 server currently, expanding to 2-5 later).*

### Technical Decisions

| Question | Decision | Rationale |
|----------|----------|-----------|
| **Authentication** | Phase 1: Subscription via OAuth + keyring storage<br>Phase 2+: API key (`CODEX_API_KEY`) | Subscription account now, API key later. Use `cli_auth_credentials_store = "keyring"` so auth survives CODEX_HOME isolation. Note: `codex exec` uses `CODEX_API_KEY`, not `OPENAI_API_KEY`. |
| **Session Storage** | Isolated `CODEX_HOME` per job with `history.persistence = "none"` | Prevents cross-user session/config leakage. Use keyring for auth (not file) so isolation doesn't break login. |
| **Version Management** | Capture `codex --version` in logs. No hard pin required. | Version pinning optional for 1-5 servers. Manual updates acceptable. |
| **Binary Installation** | Pre-install via `npm i -g @openai/codex` on server | Simplest approach. Can add to Docker image later. |
| **Git Repo Requirement** | `git init` in workspace (or `--skip-git-repo-check` for ephemeral) | Better diff tracking with git init. Use flag only if git init is overkill. |
| **Cross-Tool Migration** | **Not supported** in v1 | Sessions are tool-specific. No clear business need. |
| **Output Streaming** | **Yes** - stream JSONL events to frontend | Already doing this for Claude. Same pattern for Codex. |
| **Security Lockdown** | Server-side validation of `-c` overrides | Prevent jobs from relaxing sandbox/approval. Only allow safe knobs (model, reasoning_effort). |

### Security Decisions

| Setting | Value | Rationale |
|---------|-------|-----------|
| **sandbox_mode** | `workspace-write` | Allows writes to project dir only. Safe for hosted. |
| **approval_policy** | `never` | No prompts - required for non-interactive headless operation (like Claude's `--dangerously-skip-permissions`). |
| **--full-auto flag** | **Not needed** | We use `approval_policy = "never"` in config instead. `--full-auto` only sets `on-request` which may still prompt. |
| **danger-full-access** | **NEVER** in production | Too risky for hosted environment. |
| **network_access** | `false` (default) | Enable only if explicitly needed per task. |
| **web_search** | `false` (default) | Privacy consideration. Enable per-task if needed. |

### Architecture Decisions

| Question | Decision | Rationale |
|----------|----------|-----------|
| **Interface naming** | Rename to generic: `IAgentExecutor`, `AgentExecutorFactory` | Cleaner for multi-tool support. One-time refactor. |
| **Event normalization** | Simple `AgentEvent` type, not complex adapter layer | Unified frontend streaming without overengineering. |
| **Unified Session Manager** | **DEFER to Phase 3+** | Focus on Codex working first. |
| **Parser design** | Gracefully handle unknown events, log warnings | Codex schema evolves. Don't crash on new event types. |
| **Default tool** | **Claude remains default** until Codex is proven | Feature flag (`FEATURE_CODEX`) for opt-in. |

### Product Decisions

| Question | Decision | Rationale |
|----------|----------|-----------|
| **Tool Selection UX** | Settings preference first, per-request later | Start simple. Add per-request dropdown in Phase 2. |
| **Branding** | Use actual names: "Claude Code", "Codex" | Users know these brands. No need to abstract. |
| **Feature Parity** | Document differences, don't promise 1:1 | Tools have different strengths. Set expectations. |
| **Billing** | Track usage separately per tool | May have different costs. Keep data granular. |
| **Deprecation** | No plans to deprecate either | Support both indefinitely. Let users choose. |

### Operational Decisions

| Question | Decision | Rationale |
|----------|----------|-----------|
| **Monitoring** | Unified error rate + per-tool breakdown | Alert on overall, diagnose by tool. |
| **Failover** | **No automatic fallback** in v1 | Complexity. Error to user is cleaner. Consider for v2. |
| **Support** | Standard support, document Codex-specific gotchas | No special OpenAI expertise needed. |

### Remaining Open Questions (Truly Uncertain)

1. **Rate Limits**: What are Codex's rate limits? Need to test/monitor in production.
2. **Cost Comparison**: How does Codex cost compare to Claude for equivalent tasks? Need real data.
3. **Performance Comparison**: Is Codex faster/slower for typical SheenApps tasks? Need benchmarks.
4. **User Preference**: Will users prefer one tool? Need to track after rollout.

---

## Implementation Progress

*This section tracks actual implementation progress as work proceeds.*

### Status: Phase 1 Core Implementation In Progress

**Started**: January 16, 2026
**Last Updated**: January 16, 2026

### Completed Tasks

| Task | File | Description |
|------|------|-------------|
| ✅ **CodexMessageParser** | `src/stream/codexMessageParser.ts` | Parse Codex JSONL events (thread.started, turn.*, item.*, error). Includes `AgentEvent` normalization for unified streaming. |
| ✅ **CodexStreamProcess** | `src/stream/codexProcess.ts` | Spawn `codex exec --json` with proper flags, CODEX_HOME isolation, binary discovery (NPM, Homebrew, PATH, Cargo). |
| ✅ **CodexSession** | `src/stream/codexSession.ts` | High-level session management, mirrors ClaudeSession API. Handles run(), resume(), progress tracking. |
| ✅ **CodexCLIProvider** | `src/providers/codexCLIProvider.ts` | Implements `AIProvider` interface using CodexSession. plan(), transform(), transformWithSession() methods. |
| ✅ **ProviderFactory Update** | `src/providers/providerFactory.ts` | Added `codex-cli` provider type, `getCodexConfig()` helper for env var loading. |
| ✅ **Index Export File** | `src/stream/codex.ts` | Barrel export for all Codex stream components. |
| ✅ **Timeout Configuration** | `src/config/timeouts.env.ts` | Added `CODEX_TIMEOUTS` (initial, resume, complex, documentation, errorFix). |

### Environment Variables Added

| Variable | Default | Purpose |
|----------|---------|---------|
| `CODEX_MODEL` | - | Model selection (e.g., gpt-5.2-codex) |
| `CODEX_APPROVAL_POLICY` | `never` | Approval policy (never/on-request/on-failure/untrusted) |
| `CODEX_SANDBOX_MODE` | `workspace-write` | Sandbox mode (off/workspace-write/workspace-full) |
| `CODEX_SKIP_GIT_REPO_CHECK` | `true` | Skip git repo requirement for ephemeral workspaces |
| `CODEX_HOME` | - | Custom CODEX_HOME for isolation |
| `CODEX_API_KEY` | - | API key for codex exec mode |
| `CODEX_INITIAL_TIMEOUT` | 1200000 | Initial build timeout (20 min) |
| `CODEX_RESUME_TIMEOUT` | 1200000 | Resume session timeout (20 min) |
| `CODEX_COMPLEX_TIMEOUT` | 900000 | Complex build timeout (15 min) |
| `CODEX_DOCUMENTATION_TIMEOUT` | 300000 | Documentation timeout (5 min) |
| `CODEX_ERROR_FIX_TIMEOUT` | 600000 | Error fix timeout (10 min) |

### Key Implementation Notes

1. **Binary Discovery**: Implemented in `CodexStreamProcess.findCodexBinary()`. Checks:
   - `/usr/local/bin/codex` (NPM global)
   - `/opt/homebrew/bin/codex` (Homebrew Apple Silicon)
   - `~/.cargo/bin/codex` (Rust/Cargo install)
   - PATH fallback

2. **Session Management**: Using thread_id from Codex (maps to Claude's session_id for API compatibility). Resume uses `--thread` flag.

3. **Security Defaults**: All sessions use:
   - `approval_policy = "never"` (non-interactive)
   - `sandbox_mode = "workspace-write"` (safe defaults)
   - `--skip-git-repo-check` (for ephemeral workspaces)

4. **Event Normalization**: `AgentEvent` type provides unified event format for frontend streaming, regardless of which tool (Claude/Codex) is running.

### Remaining Phase 1 Tasks

- [ ] Unit tests for CodexMessageParser
- [ ] Unit tests for CodexStreamProcess
- [ ] Integration tests with actual Codex binary
- [ ] E2E test through ProviderFactory
- [ ] Verify CODEX_HOME isolation works correctly

### Discoveries & Observations

*Document any important discoveries, gotchas, or deviations from the plan here.*

1. **Codex exec stdin behavior**: Codex accepts prompt via stdin like Claude, but uses `--json` flag instead of `--output-format stream-json`.

2. **Thread ID vs Session ID**: Codex uses "thread_id" nomenclature. Mapped to "sessionId" in our types for API compatibility with existing Claude infrastructure.

3. **Turn completion**: Codex emits `turn.completed` when done, unlike Claude's `result` message type. Parser handles both appropriately.

---

## Appendix A: Command Reference

### Claude Code

```bash
# Interactive
claude

# Non-interactive
claude "prompt" --output-format stream-json --verbose --dangerously-skip-permissions

# Resume
claude -r <session_id> "follow-up prompt"
```

### Codex

```bash
# Interactive
codex
codex "prompt"

# Non-interactive
codex exec "prompt"
codex exec --json "prompt"

# Resume
codex resume <session_id> "follow-up prompt"
codex exec resume --last "follow-up prompt"

# With flags
codex exec --json --cd /path --model gpt-5 --full-auto "prompt"

# Config override
codex exec -c model=gpt-5 -c sandbox_mode=read-only "prompt"

# Output to file
codex exec "prompt" -o result.txt

# With API key (non-interactive only)
CODEX_API_KEY=sk-xxx codex exec --json "prompt"
```

---

## Appendix B: Environment Variables

| Variable | Values | Default | Purpose |
|----------|--------|---------|---------|
| `AI_TOOL` | `claude`, `codex` | `claude` | Select AI coding tool |
| `AI_PROVIDER` | `claude-cli`, `codex-cli`, `claude`, `codex`, `mock` | `claude-cli` | Provider implementation |
| `EXECUTOR_MODE` | `redis`, `http`, `direct` | `redis` | Execution strategy |
| `FEATURE_CODEX` | `true`, `false` | `false` | Enable Codex support |
| `CLAUDE_API_KEY` | API key string | - | Anthropic API authentication |
| `CODEX_API_KEY` | API key string | - | OpenAI Codex API authentication (exec mode only) |
| `CODEX_BINARY` | File path | Auto-discover | Override Codex binary location |
| `CODEX_MODEL` | `gpt-5-codex`, `gpt-5` | `gpt-5-codex` | Codex model selection |
| `CODEX_CONFIG_PROFILE` | Profile name | `default` | Codex config.toml profile |
| `REDIS_HOST` | Hostname/IP | `127.0.0.1` | Redis server host |
| `REDIS_PORT` | Port number | `6379` | Redis server port |

---

## Appendix C: File Structure

```
sheenapps-claude-worker/
├── src/
│   ├── providers/
│   │   ├── aiProvider.ts              # Interface (existing)
│   │   ├── providerFactory.ts         # Enhanced for Codex
│   │   ├── claudeProvider.ts          # Existing
│   │   ├── claudeCLIProvider.ts       # Existing
│   │   ├── codexProvider.ts           # NEW (Phase 2)
│   │   └── codexCLIProvider.ts        # NEW
│   ├── stream/
│   │   ├── claudeProcess.ts           # Existing
│   │   ├── claudeSession.ts           # Existing
│   │   ├── messageParser.ts           # Existing (Claude)
│   │   ├── codexProcess.ts            # NEW
│   │   ├── codexSession.ts            # NEW
│   │   └── codexMessageParser.ts      # NEW
│   ├── executors/
│   │   ├── IClaudeExecutor.ts         # Interface (existing, rename to IExecutor?)
│   │   ├── claudeExecutorFactory.ts   # Existing (rename to executorFactory?)
│   │   └── redisExecutor.ts           # Tool-agnostic (existing, adapt)
│   ├── session/
│   │   └── sessionManager.ts          # NEW (Phase 2)
│   ├── utils/
│   │   ├── binaryDiscovery.ts         # NEW
│   │   └── codexConfigReader.ts       # NEW (optional)
│   └── config/
│       └── envValidation.ts           # Enhanced for Codex vars
└── tests/
    ├── unit/
    │   ├── codexMessageParser.test.ts
    │   ├── codexProcess.test.ts
    │   ├── codexSession.test.ts
    │   └── codexCLIProvider.test.ts
    ├── integration/
    │   ├── codexExecution.test.ts
    │   └── toolComparison.test.ts
    └── e2e/
        └── codexWorkflow.test.ts
```

---

## Sources & References

### Official Documentation
- [Codex CLI Overview](https://developers.openai.com/codex/cli/)
- [Command Line Reference](https://developers.openai.com/codex/cli/reference/)
- [Configuration Reference](https://developers.openai.com/codex/config-reference/)
- [Non-Interactive Mode](https://developers.openai.com/codex/noninteractive/)
- [Codex Features](https://developers.openai.com/codex/cli/features/)
- [Codex Changelog](https://developers.openai.com/codex/changelog/)
- [OpenAI Codex Introduction](https://openai.com/index/introducing-codex/)

### GitHub & Community
- [openai/codex Repository](https://github.com/openai/codex)
- [CodexMonitor Tool](https://github.com/Cocoanetics/CodexMonitor)
- [Codex GitHub Issues](https://github.com/openai/codex/issues)

### Technical Articles
- [Best AI Coding Agents for 2026](https://www.faros.ai/blog/best-ai-coding-agents-2026)
- [OpenAI Codex Redefines AI-Native Engineering](https://www.startuphub.ai/ai-news/ai-video/2026/openais-codex-redefines-the-ai-native-engineering-workflow/)
- [Codex CLI Overview](https://ccusage.com/guide/codex/)

---

## Conclusion

Integrating OpenAI Codex into the SheenApps platform is **technically feasible and architecturally sound**. The existing abstraction layers (Provider Factory, Executor Strategy) provide a solid foundation for multi-tool support.

**Key Success Factors**:
1. Leverage existing patterns (minimize new abstractions)
2. Handle JSON schema differences gracefully
3. Comprehensive testing (unit, integration, E2E)
4. Phased rollout with feature flags
5. Clear documentation and user communication

**Estimated Timeline**: 3-4 weeks for full implementation and testing, with gradual rollout over 4-8 weeks.

**Next Steps**:
1. Address open questions with stakeholders
2. Set up development environment with Codex
3. Begin Phase 1 implementation (core integration)
4. Iterate based on testing and feedback

This plan provides a clear roadmap from research to production deployment, with comprehensive risk mitigation and testing strategies.