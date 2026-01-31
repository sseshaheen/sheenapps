# OpenClaw Development Environment

Local Docker setup for testing OpenClaw AI Assistant integration.

## Quick Start

```bash
# 1. Copy environment template
cp .env.example .env

# 2. Add your Anthropic API key to .env
echo "ANTHROPIC_API_KEY=sk-ant-xxxxx" >> .env

# 3. Start the gateway
docker-compose up -d

# 4. Check health
curl http://localhost:18789/health

# 5. View logs
docker-compose logs -f openclaw-gateway
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Your Machine                               │
│                                                              │
│  ┌──────────────────┐    ┌──────────────────────────────┐  │
│  │ OpenClaw Gateway │    │ sheenapps-claude-worker     │  │
│  │ :18789           │───▶│ :8080                        │  │
│  │                  │    │                              │  │
│  │ - Telegram       │    │ POST /v1/webhooks/openclaw   │  │
│  │ - WebChat        │    │ GET  /v1/admin/inhouse/...   │  │
│  │ - WhatsApp (off) │    │                              │  │
│  └──────────────────┘    └──────────────────────────────┘  │
│           │                           │                     │
│           ▼                           ▼                     │
│  ┌──────────────────┐    ┌──────────────────────────────┐  │
│  │ Redis            │    │ PostgreSQL                    │  │
│  │ :6380            │    │ (your dev instance)           │  │
│  └──────────────────┘    └──────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Configuration

### Gateway Config (`config/gateway.json5`)

The gateway is pre-configured for SheenApps integration:

- **Tools**: Only `sheenapps.*` tools allowed
- **Channels**: Telegram & WebChat enabled, WhatsApp disabled
- **Security**: Canvas disabled, file/shell/web tools blocked
- **Webhooks**: Sends events to worker at `host.docker.internal:8080`

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | Yes | - | Anthropic API key for Claude |
| `OPENAI_API_KEY` | No | - | OpenAI API key (optional) |
| `SHEENAPPS_WEBHOOK_SECRET` | No | `dev-webhook-secret` | HMAC secret for webhook signing |

## Testing

### 1. Enable Dev Mode in Worker

Set in your worker environment:

```bash
OPENCLAW_DEV_MODE=true
```

This makes the Gateway Service return simulated responses without needing a real gateway.

### 2. Test Webhook Flow

```bash
# Simulate a message.received event
curl -X POST http://localhost:8080/v1/webhooks/openclaw \
  -H "Content-Type: application/json" \
  -H "x-openclaw-signature: sha256=$(echo -n '{"deliveryId":"test-001","event":"message.received","projectId":"proj-123","gatewayId":"gw-001","timestamp":"2026-01-31T12:00:00Z","data":{"channel":"telegram","senderId":"user-123","content":"Hello!"}}' | openssl dgst -sha256 -hmac 'dev-webhook-secret' | awk '{print $2}')" \
  -H "x-openclaw-delivery-id: test-001" \
  -d '{"deliveryId":"test-001","event":"message.received","projectId":"proj-123","gatewayId":"gw-001","timestamp":"2026-01-31T12:00:00Z","data":{"channel":"telegram","senderId":"user-123","content":"Hello!"}}'
```

### 3. Connect Telegram Bot

1. Create a bot with [@BotFather](https://t.me/BotFather)
2. Get your bot token
3. Configure in gateway or via admin API:

```bash
# Via gateway RPC
curl -X POST http://localhost:18789/rpc \
  -H "Content-Type: application/json" \
  -d '{"method":"channels.connect","params":{"channel":"telegram","credentials":{"token":"YOUR_BOT_TOKEN"}}}'
```

## Ports

| Port | Service | Description |
|------|---------|-------------|
| 18789 | Gateway HTTP/WS | Main API endpoint |
| 18790 | WhatsApp QR UI | QR code scanner (if enabled) |
| 18793 | Canvas Host | Interactive UI (disabled) |
| 6380 | Redis | Session cache (mapped to avoid conflict) |

## Troubleshooting

### Gateway won't start

```bash
# Check logs
docker-compose logs openclaw-gateway

# Verify API key
docker-compose exec openclaw-gateway env | grep ANTHROPIC
```

### Webhooks not received

```bash
# Check if worker is reachable from container
docker-compose exec openclaw-gateway curl -v http://host.docker.internal:8080/health
```

### Reset everything

```bash
docker-compose down -v
docker-compose up -d
```

## Related Files

- `/src/services/openclawGatewayService.ts` - Gateway client
- `/src/workers/openclawWebhookWorker.ts` - Webhook processor
- `/src/routes/openclawWebhook.ts` - Webhook endpoint
- `/docs/SHEENAPPS_OPENCLAW_ANALYSIS.md` - Full analysis
