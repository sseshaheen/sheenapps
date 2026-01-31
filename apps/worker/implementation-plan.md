# SheenApps Claude Worker

A standalone microservice that wraps the **Claude Code CLI** behind a hardened HTTP interface. It delivers deterministic code‑generation for the SheenApps platform without exposing your Claude API key or exhausting your main Next.js backend.

---

## ✨ Features

| Capability                  | Detail                                                           |
| --------------------------- | ---------------------------------------------------------------- |
| **Fastify** server          | Minimal, battle‑tested Node.js framework                         |
| **HMAC‑signed** requests    | Shared secret verification between Next.js and worker            |
| **Global rate‑limit**       | Single shared limit (per Claude subscription) enforced in‑memory |
| **Work queue**              | `p‑queue` with `concurrency = 1` to avoid CLI races              |
| **Timeout & Buffer guards** | 2‑minute execution ceiling, 10 MB stdout cap                     |
| **/myhealthz** endpoint       | Ready/Liveness probe for Railway & Grafana                       |
| **Dockerised**              | Thin Node 20 image with CLAUDE CLI pre‑installed                 |
| **Observability hooks**     | Prometheus metrics, Grafana alerts, Sentry tags                  |

---

## 📂 Repo layout

```
.
├── src/
│   └── server.ts          # Fastify app + queue + CLI exec
├── __tests__/             # Vitest/Jest unit tests for worker logic
├── Dockerfile             # Multi‑stage build (prod size ≈ 130 MB)
├── railway.toml           # Build/deploy settings for Railway
├── cron.yaml              # Optional health‑check cron in Railway
├── grafana-alerts.yaml    # Prometheus‑style alert rules
└── .env.example           # Template env vars
```

---

## 🚀 Quick start (local)

```bash
git clone https://github.com/sheenapps/sheenapps-claude-worker.git
cd sheenapps-claude-worker
cp .env.example .env        # fill SHARED_SECRET & CLAUDE_API_KEY
npm ci
npm run dev                 # nodemon + ts-node
```

### Test a call

```bash
curl -X POST http://localhost:3000/generate \
     -H "Content-Type: application/json" \
     -H "x-sheen-signature: $(echo -n '{"prompt":"hello"}' | \
                                openssl dgst -sha256 -hmac "$SHARED_SECRET" | \
                                cut -d" " -f2)" \
     -d '{"prompt":"Write a hello‑world python script"}'
```

---

## 🛠️ Configuration

### Environment variables (`.env.example`)

```env
SHARED_SECRET=replace-me                  # same value in Next.js app
CLAUDE_API_KEY=optional-if-cli-needs-it   # only when Claude CLI needs auth
NODE_ENV=production
```

### Runtime flags

For most deployments you don’t need to change the in‑code constants, but you can export:

```env
MAX_GLOBAL_CALLS_PER_HR=100        # override default 100
PORT=3000                          # Fastify listen port
```

---

## 🐳 Docker

```dockerfile
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:20-slim
RUN apt-get update && apt-get install -y curl git && rm -rf /var/lib/apt/lists/*
# ↳ install Claude CLI ⬇ (update when Anthropic changes installer)
RUN curl -fsSL https://claude.ai/install.sh | sh

WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["node", "src/server.js"]
```

Build locally:

```bash
docker build -t claude-worker:latest .
docker run -p 3000:3000 --env-file .env claude-worker
```

---

## 🏗️ Railway deployment

1. **Create a new service** → “Deploy from GitHub”.
2. Set build root to repo root; Railway auto‑detects the `Dockerfile`.
3. Add env vars `SHARED_SECRET`, `CLAUDE_API_KEY`.
4. Paste the **Health Check Cron** (below) into a separate cron service if desired.
5. Promote once build succeeds.

### railway.toml

```toml
[build]
builder = "dockerfile"

[deploy]
healthcheckPath = "/myhealthz"
healthcheckTimeout = 30
restartPolicyType = "always"
restartPolicyMaxRetries = 10

[env]
NODE_ENV = "production"
```

### cron.yaml (optional)

```yaml
schedule: "*/5 * * * *"
command: |
  curl -f https://<YOUR-SERVICE>.railway.app/myhealthz || \
  (echo "Health check failed" && exit 1)
```

---

## 🔍 Observability & alerts

#### Prometheus queries

```promql
# request rate per second
rate(http_requests_total{job="claude-worker"}[5m])

# 5xx error rate
rate(http_requests_total{job="claude-worker",status=~"5.."}[5m])

# 429 rate (global limit)
rate(http_requests_total{job="claude-worker",status="429"}[5m])

# p95 latency
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))
```

#### grafana-alerts.yaml

```yaml
groups:
  - name: claude-worker
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_total{job="claude-worker",status=~"5.."}[5m]) > 0.1
        for: 5m
      - alert: WorkerDown
        expr: up{job="claude-worker"} == 0
        for: 2m
      - alert: HighQueueDepth
        expr: claude_worker_queue_depth > 50
        for: 10m
```

---

## 🧪 Testing

### Unit tests (`__tests__/worker.test.ts`)

```typescript
import { verifySignature } from '../src/server';

describe('Claude Worker', () => {
  it('verifies HMAC signatures', () => {
    const payload = JSON.stringify({ prompt: 'test' });
    const secret  = 'abc';
    const sig = require('crypto').createHmac('sha256', secret).update(payload).digest('hex');
    expect(verifySignature(payload, sig)).toBe(true);
  });
  // add rate‑limit & error‑handling tests as needed
});
```

### Load testing (k6 snippet)

```js
import http from 'k6/http';
export default function () {
  const body = JSON.stringify({ prompt: 'hello' });
  const sig  = /* precompute HMAC */;
  http.post('https://<worker>/generate', body, {
    headers: { 'Content-Type': 'application/json', 'x-sheen-signature': sig },
  });
}
```

---

## 🔐 Security notes

1. **All requests signed** with SHA‑256 HMAC (`SHARED_SECRET`).
2. **Global quota** prevents runaway costs if Next.js layer misbehaves.
3. CLI is executed in a **non‑privileged** container; consider `seccomp`/`gvisor` for stronger isolation.
4. **Never commit secrets** – store in Railway/Vercel secret manager.

---

## 🗺️ Roadmap

-

---

## 🙌 Contributing

Pull requests welcome! Please run `npm run lint && npm test` before submitting.

---

## License

MIT © SheenApps Inc.

