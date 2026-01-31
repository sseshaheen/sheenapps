# OpenClaw Analysis for SheenApps Integration

**Date:** January 31, 2026
**Purpose:** Evaluate OpenClaw for potential integration with SheenApps platform

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [What OpenClaw Is](#what-openclaw-is)
3. [Core Architecture](#core-architecture)
4. [Key Capabilities](#key-capabilities)
5. [Integration Options for SheenApps](#integration-options-for-sheenapps)
6. [Option A: Borrow Ideas](#option-a-borrow-ideas)
7. [Option B: Provide as Add-on](#option-b-provide-as-add-on)
8. [Recommendation](#recommendation)
9. [Implementation Roadmap](#implementation-roadmap)

---
## Env Vars Needed

Based on the docker-compose.yml, here are the environment variables for the OpenClaw gateway:

Required
┌───────────────────┬───────────────────────────────────────────────────────┐
│     Variable      │                      Description                      │
├───────────────────┼───────────────────────────────────────────────────────┤
│ ANTHROPIC_API_KEY │ Anthropic API key for Claude models (must be in .env) │
└───────────────────┴───────────────────────────────────────────────────────┘
Optional with Defaults
┌──────────────────────────┬────────────────────┬─────────────────────────────────────────┐
│         Variable         │      Default       │               Description               │
├──────────────────────────┼────────────────────┼─────────────────────────────────────────┤
│ OPENCLAW_GATEWAY_TAG     │ 0.12.3             │ Gateway Docker image version            │
├──────────────────────────┼────────────────────┼─────────────────────────────────────────┤
│ OPENAI_API_KEY           │ (empty)            │ OpenAI API key (if using OpenAI models) │
├──────────────────────────┼────────────────────┼─────────────────────────────────────────┤
│ SHEENAPPS_WEBHOOK_SECRET │ dev-webhook-secret │ HMAC secret for webhook signatures      │
└──────────────────────────┴────────────────────┴─────────────────────────────────────────┘
Hardcoded in Compose (not env-configurable)
┌───────────────────────┬───────────────────────────────────────────────────────┬─────────────────────────────────┐
│       Variable        │                         Value                         │           Description           │
├───────────────────────┼───────────────────────────────────────────────────────┼─────────────────────────────────┤
│ PROJECT_ID            │ dev-project-001                                       │ SheenApps project identifier    │
├───────────────────────┼───────────────────────────────────────────────────────┼─────────────────────────────────┤
│ GATEWAY_PORT          │ 18789                                                 │ Gateway listen port             │
├───────────────────────┼───────────────────────────────────────────────────────┼─────────────────────────────────┤
│ GATEWAY_HOST          │ 0.0.0.0                                               │ Gateway bind address            │
├───────────────────────┼───────────────────────────────────────────────────────┼─────────────────────────────────┤
│ SHEENAPPS_WORKER_URL  │ http://host.docker.internal:8080                      │ Worker API endpoint             │
├───────────────────────┼───────────────────────────────────────────────────────┼─────────────────────────────────┤
│ SHEENAPPS_WEBHOOK_URL │ http://host.docker.internal:8080/v1/webhooks/openclaw │ Webhook callback URL            │
├───────────────────────┼───────────────────────────────────────────────────────┼─────────────────────────────────┤
│ TOOL_POLICY           │ read-only                                             │ Tool access policy (Phase 1)    │
├───────────────────────┼───────────────────────────────────────────────────────┼─────────────────────────────────┤
│ CANVAS_ENABLED        │ false                                                 │ Canvas UI disabled for security │
├───────────────────────┼───────────────────────────────────────────────────────┼─────────────────────────────────┤
│ REDIS_URL             │ redis://redis:6379                                    │ Redis connection string         │
├───────────────────────┼───────────────────────────────────────────────────────┼─────────────────────────────────┤
│ LOG_LEVEL             │ debug                                                 │ Logging verbosity               │
└───────────────────────┴───────────────────────────────────────────────────────┴─────────────────────────────────┘
Minimal .env File

ANTHROPIC_API_KEY=sk-ant-api03-xxxxx

Full .env File (with optional overrides)

ANTHROPIC_API_KEY=sk-ant-api03-xxxxx
OPENAI_API_KEY=sk-xxxxx
SHEENAPPS_WEBHOOK_SECRET=your-production-secret
OPENCLAW_GATEWAY_TAG=0.12.3


---
## Quick Status (Updated: 31 Jan 2026 - 8:00PM)

### What's Done ✅

| Component | Location |
|-----------|----------|
| Database schema | Migrations 154, 155, 156, **157** |
| Admin API routes | `/src/routes/adminInhouseOpenClaw.ts` |
| Frontend UI | `InhouseAIAssistant.tsx` with 4 tabs |
| SDK package | `/sheenapps-packages/openclaw/` |
| Webhook handler | `/src/routes/openclawWebhook.ts` |
| **Webhook worker** | `/src/workers/openclawWebhookWorker.ts` |
| **Gateway service** | `/src/services/openclawGatewayService.ts` |
| **Tool data provider** | `/src/services/openclawToolProvider.ts` |
| **OpenClaw queue** | `openclaw-webhooks` in `modularQueues.ts` |
| **Dev Docker setup** | `/docker/openclaw-dev/` |
| Feature flags | `openclaw_whatsapp_beta`, `openclaw_enabled` |
| Pricing tiers | Starter $19, Pro $49, Enterprise $149 |

### Next Steps (Local Testing)

```bash
# 1. Start OpenClaw gateway locally
cd sheenapps-claude-worker/docker/openclaw-dev
cp .env.example .env
# Add ANTHROPIC_API_KEY to .env
docker-compose up -d

# 2. Enable dev mode in worker
export OPENCLAW_DEV_MODE=true

# 3. Run the new migrations
# Migration 156 adds: delivery_id, event_data to event_log + openclaw_tool_usage table
# Migration 157 adds: UNIQUE on delivery_id + leads partial unique index

# 4. Test webhook flow
curl http://localhost:18789/health
```

### What Remains ⏳

**Infrastructure (Not Deployed):**
- K8s StatefulSet for production gateway pods (documented in Appendix C)
- Per-project PVC storage for session persistence

**Real Integration (Dev mode ready, production needs gateway):**
- Connect to real OpenClaw gateway (use dev mode for now: `OPENCLAW_DEV_MODE=true`)
- Telegram bot → gateway connection
- WebChat widget serving
- WhatsApp QR flow

**Validation (During Beta):**
- Container persistence testing
- Tool policy enforcement
- WhatsApp session stability

### Code Quality Improvements (Applied Jan 31, 2026)

Based on code review feedback, the following improvements were applied:

| Improvement | Details |
|-------------|---------|
| **DoS Protection** | Added `MAX_FILTERS_PER_QUERY=10` and `MAX_IN_CLAUSE_ITEMS=50` limits in toolProvider |
| **Constants** | Extracted magic numbers (`DEFAULT_RESULT_LIMIT`, `MAX_RESULT_LIMIT`, etc.) for maintainability |
| **Consistent Logging** | Replaced `console.log/error/warn` with `ServerLoggingService` across all OpenClaw files |
| **Graceful Shutdown** | Added `startOpenClawWebhookWorker()` and `stopOpenClawWebhookWorker()` to server.ts lifecycle |
| **DOWN Migration** | Created `156_openclaw_processing_pipeline_down.sql` for rollback capability |
| **lookupOrders Bug Fix** | Fixed AND/OR logic - status now AND'ed outside lookup OR group |
| **Idempotency** | Added UNIQUE on `delivery_id` + `ON CONFLICT DO NOTHING` in logEvent (migration 157) |
| **UTC Billing** | Billing periods now computed in SQL with `date_trunc('month', now() AT TIME ZONE 'UTC')` |
| **PII Scrubbing** | Added `scrubEventData()` to remove message content before storing in event_log |
| **Leads Index** | Added partial unique index `idx_leads_unique_phone_per_project` for upsert support |

**Not Applied (Reviewer overengineering):**
- Abstract queue interface (YAGNI - only BullMQ)
- Circuit breaker (premature - dev mode already provides fallback)
- Knex.js query builder (current parameterized queries are secure)
- Query caching (premature optimization)
- Per-channel sent/received breakdown (can add later if needed)

## Summary of Recommendations

### Critical Architecture Decision

**One Gateway per project** (not shared pool). OpenClaw is designed as one Gateway per host owning the WhatsApp session. Multi-tenant shared gateway = session leakage hell.

### Phase 0: Spike (Days 1-5) ⏭️ DEFERRED

Deferred to beta rollout - will validate with real users:
- [ ] Run OpenClaw in container with persistent state - does it survive restarts?
- [ ] Hard-disable dangerous tools, allow only `sheenapps.*` tools
- [ ] Test WhatsApp session stability across container restarts
- [ ] Verify session isolation: `projectId + channel + sender_id → session_id`

### Phase 1: Connector + Security (Weeks 1-4) ✅ DONE

1. [x] `@sheenapps/openclaw` package + tool policy (read-only first)
2. [x] `/v1/webhooks/openclaw` + idempotency keys + **kill switch**
3. [x] Gateway provisioning documented (K8s config in Appendix C)
4. [x] Metrics endpoint + health checks + observability

### Phase 2: UX (Weeks 5-8) ✅ DONE

- [x] "AI Assistant" toggle in Run Hub
- [x] Channel connect: Telegram token, WebChat embed
- [x] WhatsApp QR behind feature flag (UI placeholder)
- [x] Config panel: locale settings, business hours, handoff

### Phase 3: Launch with Guardrails (Weeks 9-12) ✅ DONE

**GA:** Telegram + WebChat (predictable, API-based, low ban risk)
**Beta:** WhatsApp behind feature flag + explicit reliability disclaimer

- [x] Arabic localization - skipped (internal admin tool)
- [x] Pricing: **messages + included tokens** (Migration 155)
- [ ] Beta with 10-20 Arabic-speaking businesses
- [ ] Instrument as business feature: leads captured, orders resolved, response time

### Phase 4: Processing Pipeline ✅ DONE (NEW)

- [x] Dedicated OpenClaw webhook queue (`openclaw-webhooks`)
- [x] Webhook worker for event processing
- [x] Gateway service with dev mode support
- [x] Tool data provider (orders, products, leads)
- [x] Dev Docker Compose for local testing

### Post-Launch

- Month 6: Build-native vs deepen-OpenClaw based on adoption data


## Executive Summary

**OpenClaw** is a self-hosted personal AI assistant that unifies messaging channels (WhatsApp, Telegram, Slack, Discord, Signal, iMessage, Teams, WebChat, Matrix, Zalo) with an embedded AI agent. Users run a single "Gateway" daemon that owns all channel connections and routes messages to an intelligent agent capable of executing tools, maintaining memory, and rendering interactive UIs.

What OpenClaw Provides

OpenClaw is a self-hosted AI assistant gateway that unifies 12+ messaging channels (WhatsApp, Telegram, Discord, Slack, Signal, iMessage, Teams, Matrix, Zalo) with an
embedded AI agent. Key features:

- Multi-channel inbox with unified message routing
- AI agent with tool calling, memory, and skills
- Plugin architecture for custom channels and tools
- Canvas for interactive HTML UIs
- Cron scheduling for automated tasks
- Voice support (TTS/STT, telephony)

My Recommendation: Hybrid Approach

**Execution Timeline (Weeks 0-12):** See detailed roadmap below.

**Strategic Horizon:**
| Horizon | Timeline | Goal |
|---------|----------|------|
| Build + Ship | Weeks 0-12 | Telegram + WebChat GA, WhatsApp beta |
| Learn + Iterate | Months 3-6 | Collect usage data, identify friction |
| Decide Direction | Month 6+ | Native-lite build OR deepen OpenClaw integration |
Why Add-on First?

1. Faster time to market (1-2 months vs 3-4 months)
2. Lower risk (proven solution)
3. Validates demand before engineering investment
4. Matches your infra pattern (Easy Mode = managed, Builder Mode = self-hosted)

SheenApps-Specific Integration Points

The document includes concrete integration details based on exploring your codebase:

- Query API: POST /v1/gateway/query for orders/leads/products
- Webhook: Add POST /v1/webhooks/openclaw using your existing HMAC pattern
- SDK: New @sheenapps/openclaw package in sheenapps-packages
- Run Hub: Widget showing OpenClaw metrics (messages, leads, response time)
- Localization: Ready-to-go with your 9-locale setup (ar-eg, ar-sa, ar-ae, etc.)

Key Value for Arabic Entrepreneurs

The biggest opportunity is WhatsApp + Telegram AI support for:
- Auto-reply to customer inquiries
- Order status lookups by phone number
- Lead capture from conversations
- 24/7 availability in Arabic


### Key Value Propositions

| For SheenApps Users | OpenClaw Capability |
|---------------------|---------------------|
| **Customer Support** | Multi-channel AI assistant answering on WhatsApp, Telegram, etc. |
| **Lead Generation** | Auto-respond to inquiries, qualify leads, capture contact info |
| **Order Management** | AI agent with tool access to check orders, process returns |
| **Automated Workflows** | Cron-based scheduled tasks, hook-triggered automations |
| **Multilingual Support** | RTL-aware, works with Arabic text |
| **No-Code AI Integration** | Config-driven setup, no programming required |

### Bottom Line

OpenClaw provides a **production-ready, multi-channel AI gateway** that could give SheenApps users an instant "AI assistant on WhatsApp/Telegram" without building from scratch. The question is whether to:

- **A.** Extract patterns/ideas and build a SheenApps-native solution
- **B.** Offer OpenClaw as an integrated add-on for power users

---

## What OpenClaw Is

OpenClaw is a **personal AI assistant control plane** designed for:

1. **Channel Unification** — Single inbox for WhatsApp, Telegram, Discord, Slack, Signal, iMessage, Teams, Matrix, Zalo, etc.
2. **AI Agent Execution** — Embedded Pi Agent runtime with tool access (file I/O, web search, code execution)
3. **Multi-Platform** — macOS, iOS, Android, Linux, Windows (WSL2)
4. **Self-Hosted** — Runs on your own hardware, you own your data
5. **Extensible** — Plugin architecture for custom channels, tools, skills

### What It Is NOT

- Not a chatbot builder (no visual flow editor)
- Not a CRM (no customer database, pipeline views)
- Not a marketing automation platform (no email sequences, A/B testing)
- Not designed for multi-tenant SaaS (single-user by default)

---

## Core Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         OPENCLAW GATEWAY                            │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐        │
│  │ WhatsApp  │  │ Telegram  │  │  Discord  │  │   Slack   │  ...   │
│  │  Baileys  │  │   grammY  │  │  discord  │  │   Bolt    │        │
│  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘        │
│        │              │              │              │               │
│        └──────────────┴──────────────┴──────────────┘               │
│                              │                                      │
│                    ┌─────────▼─────────┐                           │
│                    │  Message Router   │                           │
│                    │  (Session Keys,   │                           │
│                    │   Allowlists,     │                           │
│                    │   Security)       │                           │
│                    └─────────┬─────────┘                           │
│                              │                                      │
│                    ┌─────────▼─────────┐                           │
│                    │  Pi Agent Core    │                           │
│                    │  (LLM, Tools,     │                           │
│                    │   Memory, Skills) │                           │
│                    └─────────┬─────────┘                           │
│                              │                                      │
│        ┌─────────────────────┼─────────────────────┐               │
│        │                     │                     │               │
│  ┌─────▼─────┐         ┌─────▼─────┐         ┌────▼────┐          │
│  │  Canvas   │         │  Control  │         │  Mobile │          │
│  │ (A2UI/    │         │    UI     │         │   Apps  │          │
│  │  HTML)    │         │  (Web)    │         │(iOS/And)│          │
│  └───────────┘         └───────────┘         └─────────┘          │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Breakdown

| Component | Purpose | Technology |
|-----------|---------|------------|
| **Gateway** | WebSocket server (port 18789), owns channel connections, routes messages | TypeScript, Node.js 22+ |
| **Channels** | Plugin-based adapters for each messaging platform | Baileys, grammY, discord.js, Bolt |
| **Agent Core** | LLM execution with tool calling, memory, sessions | Pi Agent Core (embedded) |
| **Canvas** | Interactive HTML/UI rendering controlled by agent | Lit Web Components, A2UI |
| **Control UI** | Browser-based admin dashboard | Vite, TypeScript, Lit |
| **Config** | JSON5 configuration with hot-reload | Zod schemas, validation |

### Message Flow

```
1. User sends message on WhatsApp
2. Gateway receives via Baileys adapter
3. Security check (allowlist, require-mention for groups)
4. Session resolution (map sender → agent session)
5. Queue (lane-based deduplication)
6. Pi Agent processes (LLM inference, tool calls)
7. Response generated (may include media, reactions)
8. Outbound adapter delivers to WhatsApp
9. User receives reply
```

---

## Key Capabilities

### 1. Multi-Channel Messaging

| Channel | Status | Notes |
|---------|--------|-------|
| WhatsApp | Built-in | Baileys web scrape, session persistence |
| Telegram | Built-in | grammY bot framework |
| Discord | Built-in | Bot + channels.discord.js |
| Slack | Built-in | Slack Bolt |
| Signal | Built-in | signal-utils CLI wrapper |
| iMessage | Built-in | macOS only, imsg CLI |
| LINE | Built-in | @line/bot-sdk |
| Google Chat | Plugin | REST API |
| Teams | Plugin | @openclaw/msteams |
| Matrix | Plugin | End-to-end encryption |
| Zalo | Plugin | Vietnamese app |
| WebChat | Built-in | Browser embed |

**Key Features:**
- Unified inbox across all channels
- Per-channel markdown rendering
- Media handling (images, audio, video, files)
- Thread/reply support where available
- Reactions and message editing
- Channel-specific rate limiting

### 2. AI Agent System

**LLM Providers Supported:**
- Anthropic (Claude Opus/Sonnet/Haiku)
- OpenAI (GPT-4o, GPT-4 Turbo)
- Google Gemini
- GitHub Copilot
- Ollama (local)
- Qwen, MiniMax, GLM

**Agent Capabilities:**
- Tool calling (file read/write, web search, code execution)
- Multi-turn conversation with context
- Session persistence (JSONL files)
- Memory system (markdown + vector)
- Skill framework (pre-built prompts)
- Streaming responses

### 3. Automation & Scheduling

**Cron System:**
- Add scheduled jobs via CLI or API
- Trigger agent actions on schedule
- Examples: daily reports, reminder messages, data sync

**Hooks:**
- Inbound hooks (pre-process messages)
- Outbound hooks (post-process responses)
- Custom validation/transformation

### 4. Canvas (Interactive UI)

The agent can render interactive HTML interfaces:
- Forms, dashboards, charts
- Real-time bidirectional communication
- A2UI component library
- Served via Canvas Host (port 18793)

### 5. Voice Support

- Text-to-Speech (OpenAI, ElevenLabs, Edge TTS)
- Voice message transcription
- Telephony plugin (Twilio, Telnyx, Plivo)

### 6. Security

- DM allowlists (regex patterns)
- Group mention requirements
- Tool policy per group/sender
- API token authentication
- Sandboxed workspaces (optional)

---

## Integration Options for SheenApps

Given SheenApps' focus on **Arabic-speaking entrepreneurs** building **web businesses**, here are the key integration opportunities:

### Use Cases for SheenApps Users

| Use Case | OpenClaw Solution | SheenApps Fit |
|----------|------------------|---------------|
| **WhatsApp Business** | Auto-reply, lead capture, order status | High |
| **Telegram Support Bot** | Customer support, FAQ answering | High |
| **Order Notifications** | Webhook → agent → multi-channel delivery | High |
| **Appointment Booking** | AI assistant schedules via calendar tools | Medium |
| **Product Catalog** | Canvas-rendered product browser | Medium |
| **Inventory Alerts** | Cron-based stock checks → owner notification | Medium |
| **Multi-Language** | RTL Arabic support, translation | High |

### Integration Architecture Options

#### Option 1: SheenApps-Managed Gateways (Recommended)

**Key insight:** OpenClaw is designed as one Gateway per host. Do NOT share gateways across projects.

```
┌─────────────────────────────────────────────────────────────────┐
│                     SHEENAPPS PLATFORM (K8s)                    │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │           Isolated Gateway Instances (StatefulSet)        │  │
│  │                                                           │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │  │
│  │  │ Project A   │  │ Project B   │  │ Project C   │  ...  │  │
│  │  │ Gateway Pod │  │ Gateway Pod │  │ Gateway Pod │       │  │
│  │  │ + PVC       │  │ + PVC       │  │ + PVC       │       │  │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘       │  │
│  │         │                │                │               │  │
│  └─────────┼────────────────┼────────────────┼───────────────┘  │
│            │                │                │                  │
│            └────────────────┼────────────────┘                  │
│                             ▼                                   │
│                 ┌───────────────────────┐                       │
│                 │     Run Hub API       │                       │
│                 │  (internal network)   │                       │
│                 └───────────────────────┘                       │
└─────────────────────────────────────────────────────────────────┘
```

**Pros:**
- Complete session isolation (no cross-project leakage)
- Users don't manage infrastructure
- Centralized billing and monitoring
- WhatsApp sessions survive pod restarts (PVC)

**Cons:**
- Higher resource usage (one pod per project)
- LLM API key management per project (or use SheenApps-owned keys)

#### Option 2: Self-Hosted by User (Add-on)

```
User's Device (macOS/Linux/VPS)
┌─────────────────────────────┐
│      OpenClaw Gateway       │
│   + SheenApps Plugin        │
│         │                   │
│         ▼                   │
│   SheenApps Webhook API     │
│   (orders, leads, etc.)     │
└─────────────────────────────┘
```

**Pros:**
- Users control their data
- No multi-tenant complexity
- OpenClaw handles channel complexity

**Cons:**
- Users need technical setup
- Support burden on SheenApps
- Fragmented experience

#### Option 3: Borrow Patterns, Build Native

Build SheenApps-native messaging with ideas from OpenClaw:
- Channel plugin architecture
- Session management patterns
- Tool framework design

**Pros:**
- Full control over UX
- Tight Run Hub integration
- Simpler for end users

**Cons:**
- High engineering investment
- Re-implementing solved problems
- Slower time to market

---

## Option A: Borrow Ideas

If you choose to **build a SheenApps-native solution**, here are the key patterns worth borrowing:

### 1. Channel Plugin Architecture

OpenClaw's channel plugins are well-designed:

```typescript
interface ChannelPlugin {
  id: string
  meta: ChannelMeta
  adapters: {
    config: ChannelConfigAdapter
    auth: ChannelAuthAdapter
    messaging: ChannelMessagingAdapter
    outbound: ChannelOutboundAdapter
    security: ChannelSecurityAdapter
    // ... more adapters
  }
}
```

**Borrow:** This clean separation of concerns makes adding new channels straightforward.

### 2. Message Normalization

All channels normalize inbound messages to a common format:

```typescript
interface NormalizedMessage {
  id: string
  senderId: string
  senderName: string
  text: string
  media?: MediaAttachment[]
  timestamp: Date
  channel: string
  account: string
  isGroup: boolean
  threadId?: string
}
```

**Borrow:** Unified message model simplifies downstream processing.

### 3. Session Key Resolution

Mapping sender → session is non-trivial (especially multi-account):

```typescript
// sender@channel/account → session
const sessionKey = resolveSessionKey(message)
```

**Borrow:** Account-aware session resolution prevents cross-talk.

### 4. Allowlist/Security Model

Per-channel security policies:

```typescript
{
  "channels.whatsapp.dm.allowlist": ["972*", "971*"],  // Israel, UAE
  "channels.whatsapp.groups.requireMention": true
}
```

**Borrow:** Flexible security rules prevent abuse.

### 5. Cron/Scheduling System

Simple job scheduling:

```typescript
{
  "cron.entries": [
    {
      "id": "daily-report",
      "schedule": "0 9 * * *",
      "channel": "telegram",
      "target": "12345",
      "message": "Daily sales report: {{sales_summary}}"
    }
  ]
}
```

**Borrow:** Built-in scheduling for notifications, reports.

### 6. Tool Framework

Agent tools with schema validation:

```typescript
const tools = [
  {
    name: "check_order",
    description: "Check order status by ID",
    parameters: z.object({
      orderId: z.string()
    }),
    execute: async ({ orderId }) => {
      return await sheenAppsApi.getOrder(orderId)
    }
  }
]
```

**Borrow:** Extensible tool system for SheenApps actions.

### Estimated Build Effort (Native Solution)

| Component | Effort | OpenClaw Reference |
|-----------|--------|-------------------|
| WhatsApp adapter | 2-3 weeks | src/web/, Baileys |
| Telegram adapter | 1 week | src/telegram/ |
| Message routing | 1 week | src/routing/ |
| Session management | 1 week | src/agents/sessions/ |
| AI agent integration | 2 weeks | src/agents/ |
| Cron system | 1 week | src/cron/ |
| Config management | 1 week | src/config/ |
| **Total** | **9-11 weeks** | — |

---

## Option B: Provide as Add-on

If you choose to **offer OpenClaw as an integrated add-on**, here's how:

### Integration Architecture

```
┌───────────────────────────────────────────────────────────────────┐
│                     SHEENAPPS PLATFORM                            │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                     Run Hub Dashboard                       │  │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌──────────────┐  │  │
│  │  │  Leads  │  │ Orders  │  │ Revenue │  │ AI Assistant │  │  │
│  │  └─────────┘  └─────────┘  └─────────┘  └──────┬───────┘  │  │
│  └──────────────────────────────────────────────────│─────────┘  │
│                                                     │            │
│  ┌──────────────────────────────────────────────────▼─────────┐  │
│  │              SheenApps OpenClaw Plugin                      │  │
│  │  ┌─────────────────────────────────────────────────────┐   │  │
│  │  │  Tools:                                              │   │  │
│  │  │  - get_orders(customer_phone)                        │   │  │
│  │  │  - create_lead(name, phone, email, notes)            │   │  │
│  │  │  - get_products(category?)                           │   │  │
│  │  │  - check_inventory(product_id)                       │   │  │
│  │  │  - create_order(customer, items)                     │   │  │
│  │  │  - send_invoice(order_id, channel)                   │   │  │
│  │  └─────────────────────────────────────────────────────┘   │  │
│  └────────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              ▼                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                OpenClaw Gateway (Managed)                   │  │
│  │     WhatsApp  │  Telegram  │  Discord  │  WebChat          │  │
│  └────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────┘
```

### SheenApps Plugin for OpenClaw

Create a SheenApps-specific OpenClaw plugin:

```typescript
// extensions/sheenapps/index.ts
import { definePlugin } from 'openclaw/plugin-sdk'

export default definePlugin({
  id: '@sheenapps/openclaw-connector',

  tools: [
    {
      name: 'sheenapps.orders.list',
      description: 'List orders for a customer by phone number',
      parameters: {
        customerPhone: { type: 'string', description: 'Customer phone (E.164)' }
      },
      execute: async ({ customerPhone }, ctx) => {
        const orders = await sheenAppsApi.listOrders({ phone: customerPhone })
        return formatOrderList(orders)
      }
    },
    {
      name: 'sheenapps.leads.create',
      description: 'Create a new lead from incoming inquiry',
      parameters: {
        name: { type: 'string' },
        phone: { type: 'string' },
        email: { type: 'string', optional: true },
        source: { type: 'string' },
        notes: { type: 'string', optional: true }
      },
      execute: async (params, ctx) => {
        const lead = await sheenAppsApi.createLead(params)
        return `Lead created: ${lead.id}`
      }
    },
    {
      name: 'sheenapps.products.search',
      description: 'Search products in the catalog',
      parameters: {
        query: { type: 'string' },
        category: { type: 'string', optional: true }
      },
      execute: async ({ query, category }) => {
        const products = await sheenAppsApi.searchProducts(query, { category })
        return formatProductList(products)
      }
    },
    // ... more tools
  ],

  skills: [
    {
      id: 'customer-support',
      name: 'SheenApps Customer Support',
      systemPrompt: `You are a helpful customer support assistant for a business powered by SheenApps.

Your capabilities:
- Check order status using the customer's phone number
- Answer questions about products
- Help with returns and refunds
- Collect lead information from inquiries

Always be polite, professional, and respond in the customer's language (Arabic or English).
When a customer asks about an order, ask for their phone number to look it up.`
    }
  ],

  config: {
    apiKey: { type: 'string', required: true },
    siteId: { type: 'string', required: true },
    defaultLanguage: { type: 'string', default: 'ar' }
  }
})
```

### User Experience Flow

1. **Enable Add-on in Run Hub**
   - User clicks "Enable AI Assistant" in Run Hub
   - SheenApps provisions OpenClaw gateway (managed)
   - Auto-configures SheenApps plugin with API credentials

2. **Connect Channels**
   - User scans QR code to connect WhatsApp
   - Or enters Telegram bot token
   - Guided setup in Run Hub UI

3. **Configure Assistant**
   - Choose personality/tone
   - Set business hours
   - Configure auto-replies
   - Set lead capture rules

4. **Go Live**
   - Assistant starts handling messages
   - Leads flow into Run Hub
   - Order lookups work automatically

### Pricing Model (Messages + Tokens)

**Principle:** Charge by usage, not flat model tier. WhatsApp conversations can explode costs.

| Component | Included | Overage |
|-----------|----------|---------|
| **Base subscription** | Gateway runtime + support | $19/mo |
| **Message credits** | 500/mo | $0.02/message |
| **Token credits** | 100K/mo | $0.50/100K tokens |
| **Channels** | Telegram + WebChat | WhatsApp beta: +$10/mo |

**Regional adjustments:** Apply SheenApps' existing multipliers (Egypt 0.15x, Saudi 1.1x, etc.)

### Technical Requirements for Add-on

1. **Managed Gateway Infrastructure**
   - Kubernetes cluster for gateway pods
   - Per-user isolated gateway instances
   - Persistent storage for sessions

2. **SheenApps API**
   - REST API for orders, leads, products
   - Webhook for real-time updates
   - API key authentication

3. **LLM API Keys**
   - SheenApps-owned Anthropic/OpenAI accounts
   - Usage tracking per user
   - Cost allocation

4. **WhatsApp Business API**
   - Meta Business verification
   - Message template approvals
   - Per-user phone number provisioning
   - OR use web-scrape Baileys (riskier but no approval needed)

---

## Recommendation

### For SheenApps, I recommend: **Hybrid Approach**

**Phase 1: Quick Win with OpenClaw Add-on (3-6 months)**
- Offer OpenClaw as a managed add-on for power users
- Build SheenApps plugin with Run Hub integration
- Target Arabic-speaking early adopters
- Learn from real usage patterns

**Phase 2: Native Lite Solution (6-12 months)**
- Build simplified WhatsApp + Telegram native integration
- Borrow patterns from OpenClaw (channel plugins, session management)
- Focus on Easy Mode users (no config needed)
- Keep OpenClaw add-on for Builder Mode users

**Phase 3: Full Native (12-18 months)**
- Complete native multi-channel solution
- Advanced features inspired by OpenClaw
- Deprecate OpenClaw add-on OR keep as advanced option

### Why This Approach?

| Criterion | Add-on First | Build First |
|-----------|-------------|-------------|
| **Time to Market** | 1-2 months | 3-4 months |
| **Risk** | Lower (proven solution) | Higher (unknown unknowns) |
| **User Experience** | Good (may feel separate) | Best (fully integrated) |
| **Control** | Limited | Full |
| **Cost** | Per-user runtime | Engineering investment |

**For Arabic-speaking entrepreneurs**, the key value is **WhatsApp + Telegram auto-reply for customer support**. OpenClaw delivers this today.

---

## Implementation Roadmap

### Phase 0: Spike (Days 1-5)

Before building UI, answer the scary questions:

| Day | Task |
|-----|------|
| 1 | Run OpenClaw in Docker with persistent volume, test restart survival |
| 2 | Configure tool policy: disable all tools except `sheenapps.*` |
| 3 | Connect WhatsApp via Baileys, simulate container restart, check session |
| 4 | Test session isolation: two different senders, verify no context leakage |
| 5 | Document findings, go/no-go decision |

**Session Key Strategy** (must verify in spike):
```
projectId + channel + external_sender_id → session_id
```

### Phase 0: Manual Validation Steps

> **Note**: Complete these validation steps before proceeding to Phase 1 implementation.
> These are manual tests to validate critical assumptions.

#### Day 1: Container Persistence Test

```bash
# 1. Clone OpenClaw repository
git clone https://github.com/openclaw/openclaw.git ~/openclaw
cd ~/openclaw

# 2. Create persistent data directory
mkdir -p ~/.openclaw-sheenapps-test/data

# 3. Run OpenClaw in Docker with persistent volume
docker run -d \
  --name openclaw-spike \
  -v ~/.openclaw-sheenapps-test/data:/app/data \
  -p 18789:18789 \
  -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
  openclaw/gateway:latest

# 4. Verify gateway is running
curl http://localhost:18789/health

# 5. Send a test message via RPC
curl -X POST http://localhost:18789/rpc \
  -H "Content-Type: application/json" \
  -d '{"method": "chat.send", "params": {"channel": "test", "message": "Hello"}}'

# 6. Force restart and verify persistence
docker stop openclaw-spike
docker start openclaw-spike
sleep 5
curl http://localhost:18789/health

# 7. Check if previous session state survived
ls -la ~/.openclaw-sheenapps-test/data/sessions/
```

**Expected Results:**
- [ ] Gateway starts successfully after restart
- [ ] Session files exist in data/sessions/
- [ ] No data loss on restart

#### Day 2: Tool Policy Configuration

```bash
# 1. Create SheenApps-only tool policy config
cat > ~/.openclaw-sheenapps-test/config/tool-policy.json5 << 'EOF'
{
  // Disable all default tools
  "tools.default.enabled": false,

  // Only allow sheenapps.* tools
  "tools.allowlist": [
    "sheenapps.*"
  ],

  // Explicitly block dangerous tools
  "tools.blocklist": [
    "file.*",
    "shell.*",
    "web.*",
    "code.*"
  ],

  // Disable Canvas (attack surface)
  "canvas.enabled": false
}
EOF

# 2. Restart gateway with new config
docker stop openclaw-spike
docker run -d \
  --name openclaw-spike \
  -v ~/.openclaw-sheenapps-test/data:/app/data \
  -v ~/.openclaw-sheenapps-test/config:/app/config \
  -p 18789:18789 \
  -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
  openclaw/gateway:latest

# 3. Verify tool policy is enforced
# Try to call a blocked tool - should fail
curl -X POST http://localhost:18789/rpc \
  -H "Content-Type: application/json" \
  -d '{"method": "tools.call", "params": {"tool": "file.read", "args": {"path": "/etc/passwd"}}}'

# Expected: Error - tool not allowed
```

**Expected Results:**
- [ ] Default tools (file, shell, web, code) are blocked
- [ ] Only sheenapps.* namespace tools are callable
- [ ] Canvas is disabled
- [ ] Policy persists across restarts

#### Day 3: WhatsApp Session Stability

```bash
# 1. Configure WhatsApp channel
cat > ~/.openclaw-sheenapps-test/config/channels.json5 << 'EOF'
{
  "channels.whatsapp.enabled": true,
  "channels.whatsapp.sessions.path": "/app/data/whatsapp-sessions",
  "channels.whatsapp.dm.allowlist": ["*"],  // Test mode - allow all
  "channels.whatsapp.groups.requireMention": true
}
EOF

# 2. Restart with WhatsApp enabled
docker stop openclaw-spike
docker run -d \
  --name openclaw-spike \
  -v ~/.openclaw-sheenapps-test/data:/app/data \
  -v ~/.openclaw-sheenapps-test/config:/app/config \
  -p 18789:18789 \
  -p 18790:18790 \  # QR code web UI
  -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
  openclaw/gateway:latest

# 3. Open QR code scanner in browser
open http://localhost:18790/whatsapp/qr

# 4. Scan QR with your WhatsApp and verify connection
curl http://localhost:18789/channels/status

# 5. Simulate container crash and restart
docker kill openclaw-spike
docker start openclaw-spike
sleep 10

# 6. Check if WhatsApp session survived
curl http://localhost:18789/channels/status | jq '.whatsapp.connected'
```

**Expected Results:**
- [ ] QR code scan successfully links WhatsApp
- [ ] Session files created in data/whatsapp-sessions/
- [ ] Session survives container restart (no re-scan needed)
- [ ] Reconnection takes < 30 seconds after restart

#### Day 4: Session Isolation Test

```bash
# 1. Configure session key strategy
cat > ~/.openclaw-sheenapps-test/config/sessions.json5 << 'EOF'
{
  // Session key pattern for SheenApps
  // Format: {projectId}:{channel}:{senderId}
  "agent.sessions.keyPattern": "{{env.PROJECT_ID}}:{{channel}}:{{sender.id}}",
  "agent.sessions.storage": "/app/data/sessions",
  "agent.sessions.maxAge": "7d"
}
EOF

# 2. Start gateway with test project ID
docker stop openclaw-spike
docker run -d \
  --name openclaw-spike \
  -v ~/.openclaw-sheenapps-test/data:/app/data \
  -v ~/.openclaw-sheenapps-test/config:/app/config \
  -p 18789:18789 \
  -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
  -e PROJECT_ID="proj_test123" \
  openclaw/gateway:latest

# 3. Simulate two different senders
# Sender A
curl -X POST http://localhost:18789/rpc \
  -H "Content-Type: application/json" \
  -d '{
    "method": "chat.send",
    "params": {
      "channel": "telegram",
      "senderId": "user_alice_123",
      "message": "My order number is ORD-001"
    }
  }'

# Sender B
curl -X POST http://localhost:18789/rpc \
  -H "Content-Type: application/json" \
  -d '{
    "method": "chat.send",
    "params": {
      "channel": "telegram",
      "senderId": "user_bob_456",
      "message": "My order number is ORD-999"
    }
  }'

# 4. Verify session isolation - Sender A should NOT see Sender B's context
curl -X POST http://localhost:18789/rpc \
  -H "Content-Type: application/json" \
  -d '{
    "method": "chat.send",
    "params": {
      "channel": "telegram",
      "senderId": "user_alice_123",
      "message": "What was my order number?"
    }
  }'
# Expected: Agent responds with ORD-001, NOT ORD-999

# 5. Check session files are properly isolated
ls -la ~/.openclaw-sheenapps-test/data/sessions/
# Expected: Separate session files for each sender
# - proj_test123:telegram:user_alice_123.jsonl
# - proj_test123:telegram:user_bob_456.jsonl
```

**Expected Results:**
- [ ] Session files are created with correct key pattern
- [ ] User A's context is NOT visible to User B
- [ ] Agent correctly recalls context per-session
- [ ] Session keys include projectId for multi-tenant isolation

#### Day 5: Go/No-Go Documentation

After completing Days 1-4, document findings:

```markdown
## Phase 0 Spike Results

**Date:** ___________
**Tester:** ___________

### Container Persistence
- [ ] PASS / [ ] FAIL
- Notes: _______________________

### Tool Policy Enforcement
- [ ] PASS / [ ] FAIL
- Notes: _______________________

### WhatsApp Session Stability
- [ ] PASS / [ ] FAIL
- Reconnection time: _____ seconds
- Notes: _______________________

### Session Isolation
- [ ] PASS / [ ] FAIL
- Notes: _______________________

### Go/No-Go Decision
- [ ] GO - Proceed to Phase 1
- [ ] NO-GO - Issues found: _______________________

### Open Questions/Risks Identified
1. ___________
2. ___________
3. ___________
```

---

### Phase 1: Connector + Security (Weeks 1-4)

| Week | Milestone |
|------|-----------|
| 1 | `@sheenapps/openclaw-connector` plugin with read-only tools |
| 2 | `/v1/webhooks/openclaw` + idempotency + HMAC + **kill switch** |
| 3 | Gateway provisioning: **one isolated instance per project** + PV |
| 4 | Health checks, metrics endpoint, restart handling, **observability** |

**Architecture:** K8s StatefulSet with per-project PVC (not shared gateway pool).

**Kill Switch (Run Hub toggle):**
- Instantly disable all outbound replies per project
- Instantly disable all tool calls per project
- This is the difference between "beta risk" and "we can sleep"

**Idempotency Implementation:**
- Key: `gateway_instance_id + channel + message_id`
- Storage: Redis with 7-day TTL (or Postgres table)
- Worker drops duplicates before enqueue

**Canvas Default Stance:**
- **Managed deployments:** Canvas OFF by default
- **Builder Mode:** Enable behind flag, with isolated origin + strict CSP + no internal network access
- Canvas is powerful but "interactive UI" can become "interactive liability"

### Phase 2: UX (Weeks 5-8)

| Week | Milestone |
|------|-----------|
| 5 | "AI Assistant" toggle in Run Hub, Telegram bot token flow |
| 6 | WebChat embed code generator, config panel (business hours, handoff) |
| 7 | WhatsApp QR flow (behind feature flag, beta only) |
| 8 | Run Hub metrics widget: messages, leads, response time |

### Phase 3: Launch (Weeks 9-12)

| Week | Milestone |
|------|-----------|
| 9 | Arabic localization, RTL testing |
| 10 | Pricing: messages + tokens (not flat tier) |
| 11 | **GA: Telegram + WebChat** (stable, API-based) |
| 12 | **Beta: WhatsApp** (feature flag + reliability disclaimer) |

### Post-Launch (Months 4-6)

- Collect usage: leads captured, orders resolved, response time
- Identify friction points and common customizations
- Month 6: decide native-build vs deepen-OpenClaw

---

## Key Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| WhatsApp bans (Baileys) | **High** | High | Launch WhatsApp as beta only, Telegram + WebChat GA first |
| Session/data leakage | Medium | **Critical** | Isolated gateway per project, strict session key strategy |
| LLM costs explode | Medium | Medium | Token caps per message, Haiku for simple queries |
| WhatsApp session instability | Medium | Medium | Spike validates restart survival, alert on disconnect |
| OpenClaw breaking changes | Low | Medium | Pin version, MIT license allows fork |
| Arabic LLM quality | Medium | Medium | System prompt tuning, human handoff option |

### Network Security Notes

- Gateway WS defaults to loopback (127.0.0.1:18789) - do not expose publicly
- Use private network / sidecar / internal ingress with auth
- Canvas host (18793) is an attack surface - disable or sandbox for managed deployments

### Observability & Audit Trail

**Structured logs** (every request):
- `projectId`, `channel`, `senderId`, `sessionId`, `messageId`, `toolName`

**Tracing:**
- Correlation ID across: webhook → queue → agent → tool → reply

**Audit table** (Postgres):
- All tool calls, especially write tools
- Timestamp, projectId, sessionId, toolName, params, result

**Alerts:**
- WhatsApp disconnect (session expired)
- High error rate (>5% in 5min)
- Token spike (>2x normal)
- Reply latency spike (>10s p95)

---

## Conclusion

OpenClaw provides a **mature, extensible foundation** for multi-channel AI assistants. For SheenApps, the fastest path to value is:

1. **Spike first** (5 days) - prove session isolation, restart survival, tool policy
2. **Launch Telegram + WebChat GA** - stable, API-based, low risk
3. **WhatsApp as beta** - behind feature flag, explicit reliability disclaimer
4. **Learn from real users** - measure leads captured, orders resolved, response time
5. **Decide on native build** based on adoption data at month 6

**Key Architecture Rule:** One isolated Gateway per project. Never share gateways.

**Key Pricing Rule:** Charge by messages + tokens, not flat model tier (WhatsApp conversations can explode costs).

**Remember:** OpenClaw is the nervous system, SheenApps is the product. Win by making it feel native in Run Hub, constraining it into safe behaviors, and measuring business outcomes.

---

## Appendix: OpenClaw Quick Reference

### Key Files for Integration

| File | Purpose |
|------|---------|
| `src/plugin-sdk/index.ts` | Plugin API exports |
| `src/channels/plugins/types.*.ts` | Channel adapter interfaces |
| `src/gateway/protocol/index.ts` | RPC method registry |
| `src/agents/pi-tools*.ts` | Tool definition patterns |
| `extensions/*/index.ts` | Example plugins |

### Useful CLI Commands

```bash
# Run gateway
openclaw gateway run --bind loopback --port 18789

# Check channel status
openclaw channels status --probe

# Send test message
openclaw send --channel telegram --target 12345 --message "Hello!"

# Add cron job
openclaw cron add --schedule "0 9 * * *" --channel telegram --target 12345 --message "Daily report"

# Check config
openclaw config get channels.whatsapp

# View docs
open https://docs.openclaw.ai
```

### Architecture Diagrams

```
Session Resolution:
  sender_id + channel + account → session_key → agent_session

Tool Execution:
  user_message → agent → tool_call → tool_result → agent → response

Channel Flow:
  inbound → normalize → security → queue → agent → outbound → deliver
```

---

## Appendix B: SheenApps Platform Integration Points

After exploring the SheenApps codebase, here are the specific integration points:

### SheenApps Architecture Overview

| Repo | Purpose | Tech Stack |
|------|---------|------------|
| **sheenappsai** | Next.js 15 frontend + marketing | React 19, Tailwind 4, Zustand, Supabase |
| **sheenapps-claude-worker** | Fastify 5 backend (164 routes) | Node.js 22, PostgreSQL, BullMQ, Redis |
| **sheenapps-packages** | SDK monorepo | @sheenapps/ai, @sheenapps/connectors, etc. |

### Existing APIs for OpenClaw Integration

**1. Easy Mode Gateway Query API**
```typescript
// Endpoint: POST /v1/gateway/query
// Allows querying user's project data (orders, leads, products, customers)
{
  table: 'orders',  // or 'leads', 'products', 'customers'
  select: '*',
  filters: [{ column: 'status', operator: 'eq', value: 'pending' }],
  limit: 100
}
```
*Perfect for OpenClaw tools to fetch user's business data.*

**2. Run Hub Workflow APIs**
```typescript
// List workflow runs
GET /v1/admin/inhouse/workflow-runs

// Retry failed workflow
POST /v1/admin/inhouse/workflow-runs/:id/retry

// Business events
GET /v1/admin/inhouse/business-events
```
*OpenClaw can trigger and monitor automated workflows.*

**3. Unified Chat API**
```typescript
// Endpoint: POST /v1/chat/unified
// Already supports AI-powered chat with build mode toggle
{
  messages: [...],
  projectId: 'xxx',
  buildMode: false  // Set true for code generation
}
```
*Could be extended to route to OpenClaw for customer-facing chat.*

### Webhook Infrastructure

SheenApps already has robust webhook handling:

```typescript
// Existing webhooks
POST /v1/webhooks/github/:projectId   // GitHub push/PR events
POST /v1/webhooks/cloudflare-callback // Deployment status
POST /v1/webhooks/stripe              // Payment events

// New webhook for OpenClaw
POST /v1/webhooks/openclaw            // Channel messages, leads, orders
```

All webhooks use **HMAC-SHA256** signature validation and **BullMQ** for guaranteed delivery.

### SDK Distribution Path

Add OpenClaw connector to the existing SDK monorepo:

```
sheenapps-packages/
├── packages/
│   ├── ai/                 # @sheenapps/ai (existing)
│   ├── connectors/         # @sheenapps/connectors (existing)
│   ├── openclaw/           # @sheenapps/openclaw (NEW)
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── tools.ts    # SheenApps-specific OpenClaw tools
│   │   │   ├── skills.ts   # Customer support skill definitions
│   │   │   └── types.ts    # TypeScript types
│   │   └── tsconfig.json
```

### Localization Alignment

SheenApps and OpenClaw both support Arabic markets:

| SheenApps Locale | OpenClaw Channel | Notes |
|------------------|------------------|-------|
| ar-eg (Egypt) | WhatsApp, Telegram | High mobile penetration |
| ar-sa (Saudi) | WhatsApp, Telegram | Premium market |
| ar-ae (UAE) | WhatsApp, Telegram | Premium market |
| ar (MSA) | All | Fallback |
| fr-ma (Morocco) | WhatsApp | French/Arabic bilingual |

**Request header**: `x-sheen-locale` already passed to all API calls.

### Session Isolation Strategy

**Critical:** Every tool call must include `projectId` + `sessionId` to prevent cross-customer leakage.

```typescript
// Session key resolution (in connector)
function resolveSessionKey(message: InboundMessage): string {
  // projectId comes from gateway config (one gateway = one project)
  // channel + senderId ensures customer isolation
  return `${projectId}:${message.channel}:${message.senderId}`
}
```

**Security:** `projectId` must be asserted server-side from gateway config. Never trust client-supplied projectId. A compromised gateway must not be able to claim it belongs to another project.

### Tool Policy: Read-Only First

**Phase 1 (launch):** Only read tools enabled
- `sheenapps.query` - read orders, products, customers
- `sheenapps.products.search` - search catalog

**Phase 2 (after validation):** Write tools with confirmation
- `sheenapps.lead.create` - requires user confirmation prompt
- `sheenapps.workflow.trigger` - admin-only or gated

### Concrete Tool Definitions

Based on SheenApps' actual APIs, here are production-ready OpenClaw tools:

```typescript
// @sheenapps/openclaw/src/tools.ts

// READ-ONLY TOOLS (Phase 1 - enabled by default)
export const readOnlyTools = [
  {
    name: 'sheenapps.query',
    description: 'Query data from the user\'s SheenApps project',
    parameters: {
      table: { type: 'string', enum: ['orders', 'leads', 'products', 'customers'] },
      filters: { type: 'array', optional: true },
      limit: { type: 'number', default: 10 }
    },
    execute: async ({ table, filters, limit }, ctx) => {
      // ctx.projectId comes from gateway config
      // ctx.sessionId ensures customer isolation
      const res = await fetch(`${WORKER_URL}/v1/gateway/query`, {
        method: 'POST',
        headers: createWorkerAuthHeaders('POST', '/v1/gateway/query', body),
        body: JSON.stringify({
          table, filters, limit,
          projectId: ctx.projectId,
          sessionId: ctx.sessionId  // for audit trail
        })
      })
      return res.json()
    }
  },
]

// WRITE TOOLS (Phase 2 - gated, requires confirmation)
export const writeTools = [

  {
    name: 'sheenapps.workflow.trigger',
    description: 'Trigger an automated workflow (e.g., send email, recover cart)',
    parameters: {
      actionId: { type: 'string', enum: ['recover_abandoned', 'send_promo', 'follow_up'] },
      params: { type: 'object' }
    },
    execute: async ({ actionId, params }, ctx) => {
      // Enqueue workflow via BullMQ
      const res = await fetch(`${WORKER_URL}/v1/workflows/trigger`, {
        method: 'POST',
        headers: createWorkerAuthHeaders('POST', '/v1/workflows/trigger', body),
        body: JSON.stringify({ actionId, params, projectId: ctx.projectId })
      })
      return res.json()
    }
  },

  {
    name: 'sheenapps.lead.create',
    description: 'Create a new lead from a customer inquiry',
    parameters: {
      name: { type: 'string' },
      phone: { type: 'string', description: 'E.164 format' },
      email: { type: 'string', optional: true },
      source: { type: 'string', default: 'whatsapp' },
      notes: { type: 'string', optional: true }
    },
    execute: async (params, ctx) => {
      const res = await fetch(`${WORKER_URL}/v1/gateway/mutate`, {
        method: 'POST',
        headers: createWorkerAuthHeaders('POST', '/v1/gateway/mutate', body),
        body: JSON.stringify({
          table: 'leads',
          operation: 'insert',
          data: { ...params, projectId: ctx.projectId }
        })
      })
      return res.json()
    }
  }
]
```

### Authentication Flow

SheenApps uses dual-signature HMAC:

```typescript
// From sheenapps-claude-worker
function createWorkerAuthHeaders(method: string, path: string, body: unknown) {
  const timestamp = Date.now().toString()
  const signature = hmacSHA256(
    `${method}:${path}:${timestamp}:${JSON.stringify(body)}`,
    process.env.SHEEN_SK!
  )
  return {
    'x-sheen-timestamp': timestamp,
    'x-sheen-signature': signature,
    'x-sheen-locale': 'ar'  // or user's locale
  }
}
```

OpenClaw plugin would use the same pattern with a per-project API key.

### Run Hub Dashboard Widget

Add OpenClaw metrics to the existing Run Hub:

```typescript
// New endpoint
GET /v1/admin/inhouse/openclaw-metrics?projectId={id}

// Response
{
  channels: [
    { id: 'whatsapp', status: 'connected', messagesLast24h: 150 },
    { id: 'telegram', status: 'connected', messagesLast24h: 45 }
  ],
  leadsCreated: 12,
  ordersLookedUp: 34,
  avgResponseTime: '2.3s',
  topQueries: ['order status', 'product availability', 'returns']
}
```

### Pricing Alignment

Match SheenApps' regional pricing model:

| Region | SheenApps Multiplier | Suggested AI Price |
|--------|---------------------|-------------------|
| Egypt (ar-eg) | 0.15 | $5/mo |
| Morocco (fr-ma) | 0.70 | $20/mo |
| Saudi (ar-sa) | 1.10 | $35/mo |
| UAE (ar-ae) | 1.20 | $40/mo |

### Infrastructure Decision

**For Easy Mode users:** SheenApps-managed OpenClaw gateways (K8s pods per project)

**For Builder Mode users:** Self-hosted OpenClaw with @sheenapps/openclaw plugin

This mirrors the existing Easy Mode vs Pro infrastructure pattern.

---

## Summary: Recommended First Steps

1. **Week 1-2**: Create `@sheenapps/openclaw` package in sheenapps-packages monorepo
2. **Week 3-4**: Add `/v1/webhooks/openclaw` endpoint to sheenapps-claude-worker
3. **Week 5-6**: Build OpenClaw gateway provisioning for Easy Mode projects
4. **Week 7-8**: Add "AI Assistant" panel to Run Hub dashboard
5. **Week 9-10**: Arabic localization and RTL testing
6. **Week 11-12**: Beta with 10-20 Arabic-speaking businesses

**Total estimated effort**: 12 weeks for Telegram + WebChat GA, WhatsApp beta behind feature flag.

---

## Appendix C: Infrastructure Planning (K8s Configuration)

> **Status**: Planning document for Phase 1 gateway provisioning.
> Last updated: January 31, 2026

### Architecture: Isolated Gateway Instances

Each SheenApps project that enables OpenClaw gets its own isolated gateway pod. This prevents session leakage and provides clean resource boundaries.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        SHEENAPPS K8S CLUSTER                                 │
│                                                                              │
│  Namespace: openclaw-gateways                                                │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                                                                         │ │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐        │ │
│  │  │ Gateway Pod     │  │ Gateway Pod     │  │ Gateway Pod     │  ...   │ │
│  │  │ proj_abc123     │  │ proj_def456     │  │ proj_ghi789     │        │ │
│  │  │                 │  │                 │  │                 │        │ │
│  │  │ ┌─────────────┐ │  │ ┌─────────────┐ │  │ ┌─────────────┐ │        │ │
│  │  │ │ OpenClaw    │ │  │ │ OpenClaw    │ │  │ │ OpenClaw    │ │        │ │
│  │  │ │ Gateway     │ │  │ │ Gateway     │ │  │ │ Gateway     │ │        │ │
│  │  │ └─────────────┘ │  │ └─────────────┘ │  │ └─────────────┘ │        │ │
│  │  │ ┌─────────────┐ │  │ ┌─────────────┐ │  │ ┌─────────────┐ │        │ │
│  │  │ │ PVC: 1Gi    │ │  │ │ PVC: 1Gi    │ │  │ │ PVC: 1Gi    │ │        │ │
│  │  │ │ (sessions)  │ │  │ │ (sessions)  │ │  │ │ (sessions)  │ │        │ │
│  │  │ └─────────────┘ │  │ └─────────────┘ │  │ └─────────────┘ │        │ │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘        │ │
│  │                                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                         Internal Services                              │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │   │
│  │  │ Redis Cluster│  │ PostgreSQL   │  │ Worker API   │               │   │
│  │  │ (sessions)   │  │ (metrics)    │  │ (webhooks)   │               │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘               │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### StatefulSet Configuration

```yaml
# openclaw-gateway-statefulset.yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: openclaw-gateway
  namespace: openclaw-gateways
spec:
  serviceName: openclaw-gateway
  replicas: 0  # Scaled by provisioning service
  selector:
    matchLabels:
      app: openclaw-gateway
  template:
    metadata:
      labels:
        app: openclaw-gateway
    spec:
      containers:
      - name: gateway
        image: ghcr.io/sheenapps/openclaw-gateway:v1.0.0
        ports:
        - containerPort: 18789
          name: gateway
        - containerPort: 9090
          name: metrics
        env:
        - name: PROJECT_ID
          valueFrom:
            fieldRef:
              fieldPath: metadata.labels['project-id']
        - name: ANTHROPIC_API_KEY
          valueFrom:
            secretRef:
              name: sheenapps-llm-keys
              key: anthropic-key
        - name: SHEENAPPS_WORKER_URL
          value: "http://sheenapps-worker.default.svc.cluster.local:8080"
        - name: SHEENAPPS_API_KEY
          valueFrom:
            secretRef:
              name: $(PROJECT_ID)-openclaw-secret
              key: api-key
        - name: TOOL_POLICY
          value: "read-only"  # Phase 1
        - name: CANVAS_ENABLED
          value: "false"
        volumeMounts:
        - name: session-data
          mountPath: /app/data
        - name: config
          mountPath: /app/config
          readOnly: true
        resources:
          requests:
            memory: "256Mi"
            cpu: "100m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: gateway
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: gateway
          initialDelaySeconds: 5
          periodSeconds: 5
      volumes:
      - name: config
        configMap:
          name: $(PROJECT_ID)-openclaw-config
  volumeClaimTemplates:
  - metadata:
      name: session-data
    spec:
      accessModes: ["ReadWriteOnce"]
      storageClassName: fast-ssd
      resources:
        requests:
          storage: 1Gi
```

### ConfigMap Template

```yaml
# openclaw-config-template.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${PROJECT_ID}-openclaw-config
  namespace: openclaw-gateways
data:
  gateway.json5: |
    {
      // Project binding
      "project.id": "${PROJECT_ID}",

      // Security: Only allow SheenApps tools
      "tools.default.enabled": false,
      "tools.allowlist": ["sheenapps.*"],
      "tools.blocklist": ["file.*", "shell.*", "web.*", "code.*"],

      // Disable Canvas (attack surface)
      "canvas.enabled": false,

      // Session configuration
      "agent.sessions.keyPattern": "${PROJECT_ID}:{{channel}}:{{sender.id}}",
      "agent.sessions.storage": "/app/data/sessions",
      "agent.sessions.maxAge": "7d",

      // Webhook configuration
      "webhooks.enabled": true,
      "webhooks.url": "http://sheenapps-worker.default.svc.cluster.local:8080/v1/webhooks/openclaw",
      "webhooks.secret": "${WEBHOOK_SECRET}",
      "webhooks.events": [
        "message.received",
        "message.sent",
        "tool.called",
        "tool.completed",
        "lead.created",
        "channel.connected",
        "channel.disconnected",
        "error.occurred"
      ],

      // LLM configuration
      "llm.provider": "anthropic",
      "llm.model": "claude-3-haiku",
      "llm.maxTokensPerMessage": 2000,

      // Rate limiting
      "rateLimit.messagesPerMinute": 30,
      "rateLimit.tokensPerMinute": 50000
    }
```

### Gateway Provisioning Service

The worker API provides endpoints for gateway lifecycle management:

```typescript
// src/routes/openclawAdmin.ts (to be implemented)

/**
 * POST /v1/admin/openclaw/gateways
 * Provision a new gateway for a project
 */
interface ProvisionGatewayRequest {
  projectId: string
  channels: Array<'telegram' | 'webchat' | 'whatsapp'>
  config?: {
    defaultLocale?: string
    enableWriteTools?: boolean
  }
}

/**
 * DELETE /v1/admin/openclaw/gateways/:projectId
 * Deprovision a gateway (keeps data for 30 days)
 */

/**
 * POST /v1/admin/openclaw/gateways/:projectId/restart
 * Restart a gateway pod
 */

/**
 * POST /v1/admin/openclaw/gateways/:projectId/kill-switch
 * Enable/disable the project's kill switch
 */
interface KillSwitchRequest {
  enabled: boolean
  reason: string
}
```

### Monitoring & Alerts

```yaml
# openclaw-prometheus-rules.yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: openclaw-alerts
  namespace: openclaw-gateways
spec:
  groups:
  - name: openclaw.rules
    rules:
    # Gateway down
    - alert: OpenClawGatewayDown
      expr: up{job="openclaw-gateway"} == 0
      for: 2m
      labels:
        severity: critical
      annotations:
        summary: "OpenClaw gateway {{ $labels.project_id }} is down"

    # WhatsApp disconnected
    - alert: OpenClawWhatsAppDisconnected
      expr: openclaw_channel_connected{channel="whatsapp"} == 0
      for: 5m
      labels:
        severity: warning
      annotations:
        summary: "WhatsApp disconnected for project {{ $labels.project_id }}"

    # High error rate
    - alert: OpenClawHighErrorRate
      expr: |
        rate(openclaw_errors_total[5m]) / rate(openclaw_messages_total[5m]) > 0.05
      for: 5m
      labels:
        severity: warning
      annotations:
        summary: "High error rate (>5%) for project {{ $labels.project_id }}"

    # Token spike
    - alert: OpenClawTokenSpike
      expr: |
        rate(openclaw_tokens_used_total[1h]) > 2 * rate(openclaw_tokens_used_total[1h] offset 1d)
      for: 30m
      labels:
        severity: warning
      annotations:
        summary: "Token usage spike detected for project {{ $labels.project_id }}"

    # Reply latency
    - alert: OpenClawHighLatency
      expr: |
        histogram_quantile(0.95, rate(openclaw_reply_duration_seconds_bucket[5m])) > 10
      for: 5m
      labels:
        severity: warning
      annotations:
        summary: "High reply latency (p95 > 10s) for project {{ $labels.project_id }}"
```

### Cost Estimation

| Component | Per Project | Notes |
|-----------|-------------|-------|
| Gateway Pod | ~$10/mo | 256Mi RAM, 100m CPU |
| PVC Storage | ~$0.50/mo | 1Gi SSD |
| Network (internal) | ~$0 | Same cluster |
| LLM API | Variable | Haiku: ~$0.25/1K msgs |

**Projected cost per active project**: $10-15/mo base + LLM usage

### Security Checklist

- [ ] Gateway WS port (18789) NOT exposed to internet
- [ ] Canvas host (18793) disabled
- [ ] Tool policy enforced (only sheenapps.* allowed)
- [ ] Project ID injected from K8s label (not config)
- [ ] API keys in K8s Secrets (not ConfigMaps)
- [ ] Network policy: gateway → worker only
- [ ] PVC encrypted at rest
- [ ] Logs scrubbed of PII before shipping

---

## Appendix D: Implementation Progress

> **Last Updated**: January 31, 2026

### Implementation Approach: Option B (Add-on)

We are implementing **Option B: Provide as Add-on** as the first phase of the recommended Hybrid Approach:

| Phase | Approach | Timeline | Status |
|-------|----------|----------|--------|
| Current | Option B: OpenClaw Add-on | Months 1-3 | ✅ In Progress |
| Future | Evaluate: Native Lite vs Deepen OpenClaw | Month 6 | Pending |

**What "Option B" means:**
- SheenApps manages OpenClaw gateway instances (one per project)
- Users configure via Run Hub UI, don't touch OpenClaw directly
- We built integration layer, not native messaging

**What we did NOT build (Option A patterns):**
- Native channel adapters (Baileys, grammY)
- Our own agent runner/agentic loop
- Native session management with JSONL

### Phase 0: Spike (Days 1-5) ⏭️ DEFERRED

> **Status**: Skipped for now. Validation will happen during beta rollout.

- [ ] Run OpenClaw in container with persistent state
- [ ] Hard-disable dangerous tools, allow only `sheenapps.*`
- [ ] Test WhatsApp session stability across restarts
- [ ] Verify session isolation

**Rationale**: Proceeded directly to implementation. These validations will be performed during controlled beta with real users.

### Phase 1: Connector + Security (Weeks 1-4) ✅ COMPLETE

| Task | Status | Notes |
|------|--------|-------|
| Create `@sheenapps/openclaw` package | ✅ DONE | `/sheenapps-packages/openclaw/` |
| Add `/v1/webhooks/openclaw` endpoint | ✅ DONE | `/src/routes/openclawWebhook.ts` |
| Database migration for webhook tables | ✅ DONE | Migration 154 |
| Kill switch feature flag | ✅ DONE | `openclaw_kill_switch` |
| Gateway provisioning K8s config | 📝 DOCUMENTED | See Appendix C (not deployed) |
| Metrics endpoint design | ✅ DONE | See Appendix E |
| Admin API routes | ✅ DONE | `/src/routes/adminInhouseOpenClaw.ts` |

**Note on K8s Config**: The StatefulSet and ConfigMap templates are documented but not deployed. Actual gateway provisioning will happen when we're ready for beta.

### Phase 2: UX (Weeks 5-8) ✅ COMPLETE

| Task | Status | Notes |
|------|--------|-------|
| "AI Assistant" toggle in Run Hub | ✅ DONE | `InhouseAIAssistant.tsx` with enable/disable |
| Channel connect: Telegram token flow | ✅ DONE | Token input dialog + API connection |
| WebChat embed code generator | ✅ DONE | Copy-to-clipboard embed snippet |
| Config panel: business hours, handoff | ✅ DONE | Config tab with locale settings |
| Run Hub nav item | ✅ DONE | Added to `admin-nav-model.ts` |
| Admin page route | ✅ DONE | `/admin/inhouse/ai-assistant` |
| WhatsApp QR (behind feature flag) | ⏳ PLANNED | UI placeholder added, marked as beta |

**Phase 2 Verification (January 31, 2026):**
- TypeScript compilation: ✅ Passes (both frontend and worker)
- Backend routes registered: ✅ `/v1/admin/inhouse/openclaw/*`
- Frontend component: ✅ Fully functional with 4 tabs
- API proxying: ✅ Uses catch-all route pattern

**Phase 2 Implementation Details:**

Frontend Components Created:
- `/src/components/admin/InhouseAIAssistant.tsx` - Main dashboard component
- `/src/app/admin/inhouse/ai-assistant/page.tsx` - Page using factory pattern

Features Implemented:
- Project selector dropdown with auto-selection
- Four tabs: Overview, Channels, Metrics, Config
- Enable/disable toggle with kill switch override
- Gateway status display with health indicators
- Channel status cards (Telegram, WebChat, WhatsApp)
- Telegram bot connection dialog with token validation
- WebChat embed code generator with copy functionality
- Kill switch dialog with reason requirement
- Metrics display (messages, leads, tool calls, errors)
- Top queries visualization
- Real-time refresh capability

Backend Admin Routes (`/v1/admin/inhouse/openclaw/*`):
- `GET /config` - Get OpenClaw configuration
- `PUT /config` - Update configuration (enable/disable, channels)
- `GET /metrics` - Dashboard metrics with channel stats
- `GET /health` - Gateway health and kill switch status
- `POST /channels/telegram` - Connect Telegram bot
- `GET /embed-code` - Generate WebChat embed code
- `POST /kill-switch` - Toggle kill switch
- `GET /usage` - Get usage and billing data (messages, tokens, costs)
- `GET /feature-flags` - Get OpenClaw-related feature flags

### Phase 3: Launch (Weeks 9-12) ✅ COMPLETE

| Task | Status | Notes |
|------|--------|-------|
| Arabic localization | ⏭️ SKIPPED | Inhouse admin is internal tool with English-only UI (intentional) |
| RTL testing | ⏭️ SKIPPED | Inherits RTL support from main admin layout system |
| Pricing: messages + tokens | ✅ DONE | Migration 155 with tiers, quotas, usage tracking |
| GA: Telegram + WebChat | ✅ DONE | Fully functional in Phase 2 |
| Beta: WhatsApp (feature flag) | ✅ DONE | Feature flag + beta disclaimer UI |

**Phase 3 Implementation Details (January 31, 2026):**

Database Migration (155_openclaw_usage_billing.sql):
- `openclaw_usage` - Monthly usage tracking (messages, tokens, costs)
- `openclaw_quotas` - Per-project quota configuration
- `openclaw_pricing_tiers` - Standard pricing tiers (Starter $19, Pro $49, Enterprise $149)
- Feature flags: `openclaw_whatsapp_beta`, `openclaw_enabled`

Frontend Updates:
- Added Usage & Billing section to Metrics tab with progress bars
- WhatsApp card with beta reliability disclaimer
- Feature flag check for WhatsApp beta access
- Billing period display with estimated costs

Pricing Model:
- **Starter**: $19/mo, 500 messages, 100K tokens
- **Pro**: $49/mo, 2000 messages, 500K tokens
- **Enterprise**: $149/mo, 10K messages, 2M tokens + WhatsApp beta
- Overage: $0.02/message, $0.50/100K tokens

WhatsApp Beta Disclaimer Includes:
- Session disconnection risks
- Potential account restrictions from WhatsApp
- Message delivery delays
- Recommendation to use Telegram + WebChat for production

### Phase 4: Processing Pipeline (January 31, 2026) ✅ COMPLETE

| Task | Status | Notes |
|------|--------|-------|
| Add OpenClaw queue to modularQueues | ✅ DONE | `openclaw-webhooks` queue with typed job data |
| Create OpenClaw webhook worker | ✅ DONE | `/src/workers/openclawWebhookWorker.ts` |
| Create Gateway Service | ✅ DONE | `/src/services/openclawGatewayService.ts` |
| Create Tool Data Provider | ✅ DONE | `/src/services/openclawToolProvider.ts` |
| Dev Mode Docker Compose | ✅ DONE | `/docker/openclaw-dev/` |
| Database migration 156 | ✅ DONE | Adds `delivery_id`, `event_data` to event_log + `openclaw_tool_usage` table |

**Phase 4 Implementation Details:**

**1. OpenClaw Queue (`modularQueues.ts`):**
- Added `OpenClawWebhookJobData` type with full event schema
- Created `openclaw-webhooks` queue with 3 retries, exponential backoff
- Helper functions: `addOpenClawWebhookJob()`, `queueOpenClawWebhook()`

**2. Webhook Worker (`openclawWebhookWorker.ts`):**
- Processes all OpenClaw event types from gateway
- Handlers for: messages, tools, leads, channels, sessions, errors
- Tracks usage in `openclaw_usage` table (messages + tokens per billing period)
- Updates channel status in `openclaw_channel_status`
- Creates leads in `leads` table on `lead.created` events
- Logs all events to `openclaw_event_log` for audit

**3. Gateway Service (`openclawGatewayService.ts`):**
- Client for OpenClaw gateway HTTP/RPC API
- Methods: `checkHealth()`, `getChannelStatuses()`, `sendMessage()`
- Provisioning: `provisionGateway()`, `deprovisionGateway()`
- Channel management: `connectChannel()`, `disconnectChannel()`
- **DEV MODE**: Set `OPENCLAW_DEV_MODE=true` for simulated responses

**4. Tool Data Provider (`openclawToolProvider.ts`):**
- Executes tool requests from AI agent
- Phase 1 (read-only): `executeQuery()`, `searchProducts()`, `lookupOrders()`
- Phase 2 (write): `createLead()`
- SQL injection protection via allowed columns/tables
- All queries scoped to `projectId`

**5. Dev Mode Infrastructure (`docker/openclaw-dev/`):**
- Docker Compose with OpenClaw gateway + Redis
- Pre-configured for SheenApps integration
- Tool policy: only `sheenapps.*` tools allowed
- Canvas disabled, file/shell/web tools blocked
- Webhooks configured to send to `host.docker.internal:8080`

### Current State Summary (January 31, 2026)

| Component | Status | Location |
|-----------|--------|----------|
| **Database Schema** | ✅ Ready | Migrations 154, 155, 156 |
| **Admin API Routes** | ✅ Ready | `/src/routes/adminInhouseOpenClaw.ts` |
| **Frontend UI** | ✅ Ready | `InhouseAIAssistant.tsx` |
| **SDK Package** | ✅ Ready | `/sheenapps-packages/openclaw/` |
| **Webhook Handler** | ✅ Ready | `/src/routes/openclawWebhook.ts` |
| **Webhook Worker** | ✅ Ready | `/src/workers/openclawWebhookWorker.ts` |
| **Gateway Service** | ✅ Ready | `/src/services/openclawGatewayService.ts` |
| **Tool Data Provider** | ✅ Ready | `/src/services/openclawToolProvider.ts` |
| **OpenClaw Queue** | ✅ Ready | `openclaw-webhooks` in `modularQueues.ts` |
| **Feature Flags** | ✅ Ready | `openclaw_whatsapp_beta`, `openclaw_enabled` |
| **Dev Mode Docker** | ✅ Ready | `/docker/openclaw-dev/` |
| **K8s Deployment** | 📝 Documented | Not deployed yet |
| **Actual OpenClaw Gateways** | ⏳ Not Started | Requires K8s setup |
| **Real Telegram Integration** | ⏳ Not Started | Needs gateway running |
| **Real WhatsApp Integration** | ⏳ Not Started | Beta, needs gateway + QR flow |

**What's Working Now:**
- Admin can view AI Assistant page in Run Hub
- Admin can configure settings (stored in project metadata)
- Usage/billing tables ready to track data
- Feature flags control WhatsApp beta access
- Webhook processing pipeline complete (queue → worker → metrics)
- Gateway service ready with dev mode for local testing
- Tool data provider connects AI tools to actual project data
- Docker Compose available for local gateway testing

**What's NOT Working Yet:**
- No actual OpenClaw gateway instances running in production
- No real messages flowing through the system
- Telegram bot tokens stored but not connected to real gateway
- WebChat embed code generated but widget not served

**Next Steps for Go-Live:**
1. Start OpenClaw gateway locally using Docker Compose
2. Test webhook flow end-to-end (gateway → webhook → queue → worker)
3. Connect real Telegram bot and test message flow
4. Deploy K8s infrastructure for production gateways
5. Beta test WhatsApp with selected users

---

## Appendix E: Metrics & Health Endpoints Design

### GET /v1/admin/inhouse/openclaw-metrics

Returns metrics for the Run Hub dashboard.

```typescript
interface OpenClawMetricsResponse {
  projectId: string
  channels: Array<{
    id: 'whatsapp' | 'telegram' | 'webchat' | 'discord'
    status: 'connected' | 'disconnected' | 'error'
    connectedAt?: string
    lastMessageAt?: string
    messageCount24h: number
    errorMessage?: string
  }>
  totals: {
    messages24h: number
    leadsCreated24h: number
    ordersQueried24h: number
    tokensUsed24h: number
  }
  performance: {
    avgResponseTimeMs: number
    p95ResponseTimeMs: number
    errorRate: number  // 0-1
  }
  topQueries: Array<{
    query: string
    count: number
  }>
  usage: {
    tokensUsed: number
    tokensLimit: number
    messagesUsed: number
    messagesLimit: number
    periodStart: string
    periodEnd: string
  }
}
```

### GET /v1/admin/inhouse/openclaw-health

Returns health status for monitoring.

```typescript
interface OpenClawHealthResponse {
  projectId: string
  gatewayStatus: 'healthy' | 'degraded' | 'down' | 'not_provisioned'
  gatewayUptime: number  // seconds
  channels: Array<{
    id: string
    status: 'ok' | 'warning' | 'error'
    message?: string
    lastChecked: string
  }>
  killSwitch: {
    enabled: boolean
    enabledAt?: string
    reason?: string
  }
  lastHealthCheck: string
}
```

### Implementation Notes

1. **Caching**: Metrics cached in Redis for 60 seconds
2. **Aggregation**: Daily metrics table pre-aggregated (see migration 154)
3. **Real-time**: Channel status updated via webhooks
4. **Cost tracking**: Token usage tracked per-message for billing

---

## Appendix F: OpenClaw Internal Architecture Deep Dive

> **Source**: Technical analysis of OpenClaw internals (January 2026)
> **Relevance**: Understanding OpenClaw's architecture informs our integration decisions and helps identify what it's good/bad at.

### Core Architecture

OpenClaw is a **TypeScript CLI application** (not Python, not Next.js). It:
- Runs locally and exposes a Gateway Server for channel connections
- Makes calls to LLM APIs (Anthropic, OpenAI, local models)
- Executes tools locally on the host machine

### Message Flow

```
User Message → Channel Adapter → Gateway Server → Agent Runner → LLM API → Agentic Loop → Response
```

### Key Architectural Components

#### 1. Channel Adapters
- Each messenger (Telegram, WhatsApp, Slack) has a dedicated adapter
- Adapters normalize messages and extract attachments
- **SheenApps Implication**: Our webhook handler must account for adapter-specific quirks

#### 2. Gateway Server (The Heart)
- Task/session coordinator handling multiple overlapping requests
- Uses **lane-based command queue** for serialization

**Critical Insight: "Default to Serial, go for Parallel explicitly"**

Sessions have dedicated lanes. Low-risk parallelizable tasks (cron jobs) run in separate lanes. This prevents:
- Interleaved garbage in logs
- Race conditions with shared state
- Debugging nightmares from over-parallelization

```
Lane is an abstraction over queues where serialization is the default, not an afterthought.
Mental model shift: "what's safe to parallelize?" instead of "what do I need to lock?"
```

**SheenApps Implication**: Our webhook processing should follow this pattern—process per-session serially, only parallelize across sessions.

#### 3. Agent Runner
- Dynamic model selection with **API key rotation and cooldown management**
- Fallback to different models if primary fails
- Dynamic system prompt assembly (tools, skills, memory, session history)
- **Context window guard**: Compacts session (summarizes) if context nearly full

**SheenApps Implication**: We should implement similar context management and model fallback logic.

#### 4. Agentic Loop
- Streams responses from LLM
- If LLM returns tool call → execute locally → add results to conversation → repeat
- Max turns default: ~20
- This is where Computer Use happens

### Memory System (Simple but Effective)

**Two-layer system:**
1. **Session transcripts**: JSONL files (each line = message/tool call/result)
2. **Memory files**: Markdown in `MEMORY.md` or `memory/` folder

**Hybrid Search:**
- **Vector search**: SQLite-based, configurable embedding provider
- **Keyword search**: FTS5 (SQLite extension)
- Example: "authentication bug" finds both "auth issues" (semantic) AND exact phrase (keyword)

**Smart Syncing**: File watcher triggers on file changes

**How memory is created**: The agent uses standard file `write` tool—no special memory API. Between conversations, a hook summarizes previous conversation to markdown.

**Limitations:**
- Memory persists forever with no forgetting curve
- Old memories have equal weight to new ones
- No memory compression/merging over time

**SheenApps Implication**: Simple is good. We don't need complex memory management for customer support use cases.

### Browser Tool: Semantic Snapshots (Not Screenshots!)

OpenClaw uses **semantic snapshots** instead of screenshots—a text-based representation of the page's accessibility tree (ARIA):

```
- button "Sign In" [ref=1]
- textbox "Email" [ref=2]
- textbox "Password" [ref=3]
- link "Forgot password?" [ref=4]
- heading "Welcome back"
- list
  - listitem "Dashboard"
  - listitem "Settings"
```

**Advantages:**
| Aspect | Screenshot | Semantic Snapshot |
|--------|-----------|-------------------|
| Size | ~5 MB | ~50 KB |
| Token cost | High (image) | Low (text) |
| Precision | Visual guess | Exact element refs |
| Reliability | OCR errors | Structured data |

**SheenApps Implication**: If we ever add web scraping tools, use ARIA tree approach, not screenshots.

### Safety Model

**Allowlist-based command approval:**
```json
// ~/.clawdbot/exec-approvals.json
{
  "agents": {
    "main": {
      "allowlist": [
        { "pattern": "/usr/bin/npm", "lastUsedAt": 1706644800 },
        { "pattern": "/opt/homebrew/bin/git", "lastUsedAt": 1706644900 }
      ]
    }
  }
}
```

**Pre-approved safe commands:** `jq`, `grep`, `cut`, `sort`, `uniq`, `head`, `tail`, `tr`, `wc`

**Blocked dangerous patterns:**
```bash
npm install $(cat /etc/passwd)     # command substitution
cat file > /etc/hosts              # redirection to system files
rm -rf / || echo "failed"          # chained with ||
(sudo rm -rf /)                    # subshell with sudo
```

**SheenApps Implication**: Our tool policy must be even stricter—only allow `sheenapps.*` tools, block all shell/file/web tools.

### What OpenClaw is Good At

1. **Multi-channel unification** - Proven channel adapters
2. **Session isolation** - Lane-based architecture
3. **Local tool execution** - Full computer access when needed
4. **Context management** - Automatic compaction
5. **Simple memory** - Explainable, debuggable

### What OpenClaw is Bad At (for our use case)

1. **Multi-tenant SaaS** - Designed for single-user, we need isolation per project
2. **Memory longevity** - No forgetting curve, old context accumulates forever
3. **Production safety** - Designed for power users who understand risks
4. **WhatsApp reliability** - Baileys is unofficial, session can break

### Actionable Insights for SheenApps

1. **Adopt lane-based serialization** for webhook processing
2. **Implement context compaction** before hitting token limits
3. **Use hybrid search** (vector + keyword) for any future knowledge base features
4. **Keep tool policy strict** - read-only first, write tools gated
5. **Don't rely on memory for critical state** - use database, not JSONL
6. **Plan for WhatsApp instability** - beta only, kill switch ready

---

*Document generated for SheenApps integration planning.*
*Analysis based on OpenClaw v2026.1.29 and SheenApps codebase as of January 31, 2026.*
