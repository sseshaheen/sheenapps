# OpenAI Realtime API Implementation Plan

**Status**: Planning Phase
**Created**: 2026-01-18
**Priority**: Medium (Future Enhancement)

## Executive Summary

This document outlines a comprehensive plan to implement OpenAI's Realtime API for universal real-time voice transcription across all browsers. This would replace the current hybrid approach (Web Speech API + OpenAI Whisper) with a unified WebSocket-based streaming solution.

**Current State**: Web Speech API (Chrome/Edge) + OpenAI Whisper (final accuracy)
**Proposed State**: OpenAI Realtime API (universal real-time + final accuracy)
**Target Browsers**: Safari, Firefox, Chrome, Edge (all browsers)

---

## 1. Current Architecture Analysis

### 1.1 Current Implementation

**Provider Factory Pattern** (`provider-factory.ts`):
- **Primary**: Web Speech API (Chrome, Edge)
  - ✅ Real-time preview (instant feedback)
  - ✅ Zero API cost
  - ❌ Limited browser support
  - ❌ Less accurate than Whisper

- **Fallback**: OpenAI Whisper via HTTP (`chunked-openai-transcription-provider.ts`)
  - ❌ No real-time preview (Safari/Firefox users)
  - ✅ High accuracy
  - ✅ Universal browser support
  - ✅ Works for final transcription

**Architecture Flow**:
```
Browser (MediaRecorder)
  → Next.js API (/api/v1/realtime/transcribe)
    → Worker (HMAC validation)
      → OpenAI Whisper HTTP API
        → SSE stream back to browser
```

### 1.2 Current Limitations

1. **Inconsistent UX**: Chrome users see real-time preview, Safari users only see waveform
2. **Two Systems**: Maintaining two transcription providers increases complexity
3. **No Real-time for Safari**: 40%+ of mobile users (iOS) don't get instant feedback
4. **Web Speech Accuracy**: Lower quality than Whisper, especially for accents/technical terms

---

## 2. OpenAI Realtime API Overview

### 2.1 What is Realtime API?

OpenAI's Realtime API (launched Oct 2024) enables **bidirectional streaming** of audio and text via **WebSocket**. It's designed for low-latency voice conversations with GPT-4o class models.

**Key Features**:
- **WebSocket-based**: Persistent connection for streaming audio chunks
- **Real-time transcription**: Incremental transcription as user speaks
- **Voice Activity Detection (VAD)**: Automatic turn detection
- **Low latency**: ~320ms average response time
- **Multi-turn conversations**: Maintains context across turns
- **Function calling**: Can trigger actions mid-conversation

**Supported Models** (as of Jan 2026):
- `gpt-4o-realtime-preview-2024-10-01`
- Future updates expected with improved pricing

### 2.2 Technical Specifications

**WebSocket Endpoint**:
```
wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01
```

**Authentication**:
```
Authorization: Bearer YOUR_API_KEY
OpenAI-Beta: realtime=v1
```

**Audio Format**:
- **Input**: PCM16 24kHz mono, base64-encoded
- **Output**: PCM16 24kHz mono, base64-encoded

**Event Types**:
- `input_audio_buffer.append` - Send audio chunks
- `input_audio_buffer.commit` - Finalize audio for processing
- `conversation.item.created` - Transcription/response created
- `response.audio_transcript.delta` - Real-time transcription deltas
- `response.audio_transcript.done` - Final transcription

---

## 3. Cost Comparison

### 3.1 Current Costs (OpenAI Whisper HTTP)

**Model**: `gpt-4o-mini-transcribe` (used in `realtimeTranscription.ts:50`)

**Pricing** (as of Jan 2026):
- **Audio input**: $0.10 per hour (~$0.00167 per minute)
- **No output charges** (text-only response)

**Example**: 2-minute voice recording
- Cost: 2 min × $0.00167 = **$0.00334** (~0.3 cents)

**Rate Limits** (current implementation):
- 10 minutes/day per user = **$0.0167/day per active user**
- Monthly (assuming 30% daily usage): **$0.15/user/month**

### 3.2 Realtime API Costs

**Pricing** (as of Jan 2026):
- **Audio input**: $100 per 1M audio input tokens (~$0.06 per minute)
- **Audio output**: $200 per 1M audio output tokens (~$0.12 per minute)
- **Text input**: $5 per 1M input tokens
- **Text output**: $20 per 1M output tokens

**Transcription-Only Mode** (no voice response):
- **Input only**: $0.06 per minute (we don't need output audio)

**Example**: 2-minute voice recording
- Cost: 2 min × $0.06 = **$0.12** (12 cents)

**Cost Comparison**:
- **Current (Whisper HTTP)**: $0.00334 per 2-min recording
- **Realtime API**: $0.12 per 2-min recording
- **Increase**: **~36x more expensive**

### 3.3 Cost Mitigation Strategies

1. **Disable Voice Output**: Use `turn_detection: none` + manual commit (saves 50% if we skip TTS)
2. **Shorter Sessions**: Implement client-side silence detection to avoid billing idle time
3. **Tiered Limits**:
   - Free tier: 5 minutes/day (Whisper fallback)
   - Paid tier: Unlimited Realtime API
4. **Hybrid Mode**: Keep Web Speech for Chrome/Edge (free), use Realtime only for Safari/Firefox
5. **Dynamic Switching**: Start with Web Speech, upgrade to Realtime if accuracy issues detected

---

## 4. Architecture Design

### 4.1 Proposed Architecture

**Browser → WebSocket → Worker → OpenAI Realtime API**

```
┌─────────────────────────────────────────────────────────────────┐
│ Browser (Next.js Client)                                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐      ┌──────────────────────────┐        │
│  │ MediaRecorder   │─────▶│ AudioWorklet (PCM16)     │        │
│  │ (WebM/Opus)     │      │ - Resample to 24kHz      │        │
│  └─────────────────┘      │ - Convert to mono        │        │
│                           │ - Base64 encode          │        │
│                           └──────────┬───────────────┘        │
│                                      │                         │
│                           ┌──────────▼───────────────┐        │
│                           │ WebSocket Client         │        │
│                           │ - Handles reconnection   │        │
│                           │ - Rate limiting          │        │
│                           │ - Event buffering        │        │
│                           └──────────┬───────────────┘        │
└──────────────────────────────────────┼──────────────────────────┘
                                       │ WSS
                           ┌───────────▼────────────────┐
                           │ Next.js API Route          │
                           │ /api/v1/realtime/ws        │
                           │ - JWT validation           │
                           │ - WebSocket upgrade        │
                           │ - Session management       │
                           └───────────┬────────────────┘
                                       │ HMAC Auth
                           ┌───────────▼────────────────┐
                           │ Worker WebSocket Proxy     │
                           │ /v1/realtime/ws            │
                           │ - HMAC validation          │
                           │ - Rate limiting            │
                           │ - Usage tracking           │
                           │ - OpenAI API key injection │
                           └───────────┬────────────────┘
                                       │ WSS + Bearer Token
                           ┌───────────▼────────────────┐
                           │ OpenAI Realtime API        │
                           │ wss://api.openai.com/v1/   │
                           │        realtime            │
                           └────────────────────────────┘
```

### 4.2 Component Breakdown

#### 4.2.1 Browser Audio Processing

**File**: `src/lib/transcription/realtime-audio-processor.ts` (new)

```typescript
class RealtimeAudioProcessor {
  private audioContext: AudioContext;
  private workletNode: AudioWorkletNode;

  async start(stream: MediaStream) {
    // Initialize AudioContext
    this.audioContext = new AudioContext({ sampleRate: 24000 });

    // Load AudioWorklet for PCM conversion
    await this.audioContext.audioWorklet.addModule('/audio-worklet.js');

    // Create worklet node
    this.workletNode = new AudioWorkletNode(this.audioContext, 'pcm-processor');

    // Connect stream
    const source = this.audioContext.createMediaStreamSource(stream);
    source.connect(this.workletNode);

    // Listen for PCM chunks
    this.workletNode.port.onmessage = (event) => {
      const pcmBase64 = this.convertToBase64(event.data);
      this.onAudioChunk(pcmBase64);
    };
  }

  private convertToBase64(pcmData: Float32Array): string {
    // Convert Float32 to Int16 (PCM16)
    const int16Array = new Int16Array(pcmData.length);
    for (let i = 0; i < pcmData.length; i++) {
      const s = Math.max(-1, Math.min(1, pcmData[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }

    // Convert to base64
    const bytes = new Uint8Array(int16Array.buffer);
    return btoa(String.fromCharCode(...bytes));
  }
}
```

**AudioWorklet** (`public/audio-worklet.js`):
```javascript
class PCMProcessor extends AudioWorkletProcessor {
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input.length > 0) {
      const channelData = input[0]; // Mono
      this.port.postMessage(channelData);
    }
    return true;
  }
}

registerProcessor('pcm-processor', PCMProcessor);
```

#### 4.2.2 WebSocket Provider

**File**: `src/lib/transcription/realtime-websocket-provider.ts` (new)

```typescript
export class RealtimeWebSocketProvider implements RealtimeTranscriptionProvider {
  readonly name = 'openai-realtime';
  readonly isSupported = true;

  private ws: WebSocket | null = null;
  private audioProcessor: RealtimeAudioProcessor | null = null;

  async start(stream: MediaStream, language: string, projectId?: string) {
    // Get JWT token
    const token = await this.getAuthToken();

    // Connect to Next.js WebSocket endpoint
    this.ws = new WebSocket(`wss://${window.location.host}/api/v1/realtime/ws`);

    // Attach auth token
    this.ws.addEventListener('open', () => {
      this.ws?.send(JSON.stringify({
        type: 'auth',
        token,
        language,
        projectId
      }));
    });

    // Handle messages
    this.ws.addEventListener('message', (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'response.audio_transcript.delta') {
        this.interimCallback?.(data.delta);
      }

      if (data.type === 'response.audio_transcript.done') {
        this.finalCallback?.(data.transcript);
      }

      if (data.type === 'error') {
        this.errorCallback?.(data.error.message);
      }
    });

    // Start audio processing
    this.audioProcessor = new RealtimeAudioProcessor();
    this.audioProcessor.onAudioChunk = (base64Audio) => {
      this.ws?.send(JSON.stringify({
        type: 'input_audio_buffer.append',
        audio: base64Audio
      }));
    };

    await this.audioProcessor.start(stream);
  }

  async stop() {
    // Commit final audio
    this.ws?.send(JSON.stringify({
      type: 'input_audio_buffer.commit'
    }));

    // Wait for final response
    await new Promise(resolve => setTimeout(resolve, 500));

    // Cleanup
    this.audioProcessor?.stop();
    this.ws?.close();
  }
}
```

#### 4.2.3 Next.js WebSocket Route

**File**: `src/app/api/v1/realtime/ws/route.ts` (new)

```typescript
export async function GET(request: NextRequest) {
  const upgradeHeader = request.headers.get('upgrade');
  if (upgradeHeader !== 'websocket') {
    return new Response('Expected WebSocket', { status: 426 });
  }

  // Validate JWT from query param or cookie
  const session = await getSession();
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Upgrade to WebSocket
  const { socket, response } = Deno.upgradeWebSocket(request);

  // Proxy to worker with HMAC auth
  const workerWs = new WebSocket(
    `${process.env.WORKER_BASE_URL}/v1/realtime/ws`,
    {
      headers: createWorkerAuthHeaders('GET', '/v1/realtime/ws', null)
    }
  );

  // Bidirectional proxy
  socket.onmessage = (event) => {
    workerWs.send(event.data);
  };

  workerWs.onmessage = (event) => {
    socket.send(event.data);
  };

  return response;
}
```

#### 4.2.4 Worker WebSocket Proxy

**File**: `src/routes/realtimeWebSocket.ts` (new, in worker)

```typescript
export function registerRealtimeWebSocketRoutes(app: FastifyInstance) {
  app.register(async (fastify) => {
    fastify.get('/v1/realtime/ws', {
      preHandler: requireHmacSignature(),
      websocket: true
    }, (connection, req) => {
      let openaiWs: WebSocket | null = null;
      let userId: string | null = null;

      connection.socket.on('message', async (message) => {
        const data = JSON.parse(message.toString());

        // Handle auth
        if (data.type === 'auth') {
          userId = await validateToken(data.token);
          if (!userId) {
            connection.socket.send(JSON.stringify({
              type: 'error',
              error: { message: 'Invalid token' }
            }));
            return;
          }

          // Connect to OpenAI
          openaiWs = new WebSocket(
            'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01',
            {
              headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                'OpenAI-Beta': 'realtime=v1'
              }
            }
          );

          // Configure session
          openaiWs.onopen = () => {
            openaiWs?.send(JSON.stringify({
              type: 'session.update',
              session: {
                modalities: ['text'], // No audio output (transcription only)
                instructions: 'You are a transcription service. Only transcribe audio.',
                voice: 'alloy',
                input_audio_format: 'pcm16',
                output_audio_format: 'pcm16',
                input_audio_transcription: {
                  model: 'whisper-1'
                },
                turn_detection: null // Manual commit
              }
            }));
          };

          // Forward messages
          openaiWs.onmessage = (event) => {
            connection.socket.send(event.data);

            // Track usage
            const msg = JSON.parse(event.data);
            if (msg.type === 'response.audio_transcript.done') {
              trackRealtimeUsage(userId, msg.item_id);
            }
          };

          return;
        }

        // Forward to OpenAI
        if (openaiWs?.readyState === WebSocket.OPEN) {
          openaiWs.send(JSON.stringify(data));
        }
      });

      connection.socket.on('close', () => {
        openaiWs?.close();
      });
    });
  });
}
```

### 4.3 Provider Selection Logic

Update `provider-factory.ts`:

```typescript
export function createTranscriptionProvider(
  preferredProvider: ProviderType = 'auto'
): RealtimeTranscriptionProvider {
  const hasWebSpeech = typeof window !== 'undefined' &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  // Feature flag for Realtime API
  const useRealtimeAPI = isFeatureEnabled('VOICE_REALTIME_API');

  if (preferredProvider === 'auto') {
    // Strategy 1: Realtime API for all (if enabled)
    if (useRealtimeAPI) {
      return new RealtimeWebSocketProvider();
    }

    // Strategy 2: Web Speech where available (free)
    if (hasWebSpeech) {
      return new WebSpeechProvider();
    }

    // Strategy 3: Fallback to OpenAI Whisper (no real-time)
    return new ChunkedOpenAITranscriptionProvider();
  }

  // Explicit selection...
}
```

---

## 5. Implementation Steps

### Phase 1: Foundation (Week 1)

**Goals**: Setup basic WebSocket infrastructure

- [ ] Create AudioWorklet processor for PCM16 conversion
- [ ] Implement `RealtimeAudioProcessor` class
- [ ] Create Next.js WebSocket route (`/api/v1/realtime/ws`)
- [ ] Add WebSocket support to worker (Fastify plugin)
- [ ] Implement basic auth flow (JWT → HMAC → OpenAI)

**Deliverables**:
- Working WebSocket connection from browser → Next.js → Worker → OpenAI
- Basic audio streaming (no transcription yet)

**Testing**:
- Unit tests for PCM conversion accuracy
- Integration test: Send test audio, verify OpenAI connection
- Load test: 10 concurrent WebSocket connections

### Phase 2: Transcription Integration (Week 2)

**Goals**: Wire up real-time transcription events

- [ ] Implement `RealtimeWebSocketProvider` class
- [ ] Handle `response.audio_transcript.delta` events
- [ ] Handle `response.audio_transcript.done` events
- [ ] Add error handling for connection drops
- [ ] Implement auto-reconnection logic

**Deliverables**:
- Real-time transcription working in UI
- Graceful error recovery

**Testing**:
- E2E test: Record 30-second audio, verify transcript accuracy
- Reconnection test: Kill WebSocket mid-stream, verify recovery
- Multi-language test: Arabic, French, Spanish transcription

### Phase 3: Cost Optimization (Week 3)

**Goals**: Minimize API costs

- [ ] Implement client-side silence detection
- [ ] Add automatic session timeout (30s idle)
- [ ] Create usage dashboard (admin panel)
- [ ] Implement per-user rate limiting
- [ ] Add cost estimation UI (show user "X minutes remaining")

**Deliverables**:
- Usage tracking integrated with billing
- Rate limits enforced

**Testing**:
- Cost validation: Measure actual API costs for 100 test sessions
- Rate limit test: Verify 429 responses after quota exceeded

### Phase 4: A/B Testing (Week 4)

**Goals**: Validate UX improvement and cost impact

- [ ] Create feature flag: `VOICE_REALTIME_API`
- [ ] Implement analytics tracking (completion rate, accuracy feedback)
- [ ] Deploy to 10% of Safari/Firefox users
- [ ] Monitor costs and user satisfaction

**Deliverables**:
- A/B test results dashboard
- Decision: Full rollout vs keep hybrid

**Success Metrics**:
- Voice input completion rate: +15% for Safari users
- Transcript accuracy rating: >4.5/5
- Cost per voice session: <$0.20 (acceptable)

### Phase 5: Full Rollout (Week 5)

**Goals**: Production deployment

- [ ] Migrate all Safari/Firefox users to Realtime API
- [ ] Keep Web Speech for Chrome/Edge (cost savings)
- [ ] Update documentation
- [ ] Create monitoring alerts (error rate, cost spikes)

**Deliverables**:
- 100% of users have real-time transcription
- Cost monitoring in place

---

## 6. Testing Strategy

### 6.1 Unit Tests

**Audio Processing** (`realtime-audio-processor.test.ts`):
```typescript
describe('RealtimeAudioProcessor', () => {
  it('converts Float32 to PCM16 correctly', () => {
    const input = new Float32Array([0, 0.5, -0.5, 1, -1]);
    const output = convertToPCM16(input);
    expect(output).toEqual([0, 16383, -16384, 32767, -32768]);
  });

  it('resamples 48kHz to 24kHz', async () => {
    const input48k = generateTestTone(48000, 440); // 440Hz tone
    const output24k = await resample(input48k, 48000, 24000);
    expect(output24k.length).toBe(input48k.length / 2);
  });
});
```

**WebSocket Provider** (`realtime-websocket-provider.test.ts`):
```typescript
describe('RealtimeWebSocketProvider', () => {
  it('handles connection errors gracefully', async () => {
    const provider = new RealtimeWebSocketProvider();
    const mockStream = createMockMediaStream();

    // Mock network failure
    mockWebSocket.failOnOpen();

    let errorReceived = false;
    provider.onError((err) => { errorReceived = true; });

    await provider.start(mockStream, 'en');

    expect(errorReceived).toBe(true);
  });
});
```

### 6.2 Integration Tests

**End-to-End Transcription** (`e2e/realtime-transcription.spec.ts`):
```typescript
test('transcribes 30-second Arabic audio', async ({ page }) => {
  await page.goto('/ar-eg');

  // Click voice button
  await page.click('[data-testid="voice-button"]');

  // Grant microphone permission (Playwright)
  await page.context().grantPermissions(['microphone']);

  // Play test audio file through virtual mic
  await page.evaluate(() => {
    const audio = new Audio('/test-fixtures/arabic-30s.wav');
    // Route to MediaRecorder...
  });

  // Wait for real-time preview
  await page.waitForSelector('[data-testid="live-preview"]');
  const previewText = await page.textContent('[data-testid="live-preview"]');
  expect(previewText.length).toBeGreaterThan(10);

  // Stop recording
  await page.click('[data-testid="stop-button"]');

  // Wait for final transcript
  await page.waitForSelector('[data-testid="final-transcript"]');
  const finalText = await page.textContent('[data-testid="final-transcript"]');

  // Validate accuracy (using reference transcript)
  const similarity = calculateSimilarity(finalText, REFERENCE_TRANSCRIPT);
  expect(similarity).toBeGreaterThan(0.9); // 90% accuracy
});
```

### 6.3 Load Tests

**Concurrent WebSocket Connections** (`load-tests/websocket-concurrent.js`):
```javascript
import { WebSocket } from 'ws';
import { check } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 50 },   // Ramp up to 50 users
    { duration: '3m', target: 50 },   // Stay at 50
    { duration: '1m', target: 100 },  // Spike to 100
    { duration: '1m', target: 0 }     // Ramp down
  ]
};

export default function () {
  const ws = new WebSocket('wss://app.sheenapps.com/api/v1/realtime/ws');

  ws.on('open', () => {
    // Send auth
    ws.send(JSON.stringify({ type: 'auth', token: __ENV.TEST_TOKEN }));

    // Send audio chunks
    for (let i = 0; i < 100; i++) {
      ws.send(JSON.stringify({
        type: 'input_audio_buffer.append',
        audio: generateRandomBase64Audio()
      }));
      sleep(0.1); // 100ms chunks
    }

    ws.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
  });

  ws.on('message', (data) => {
    const msg = JSON.parse(data);
    check(msg, {
      'receives transcript delta': (m) => m.type === 'response.audio_transcript.delta',
      'delta has content': (m) => m.delta && m.delta.length > 0
    });
  });
}
```

---

## 7. Monitoring & Observability

### 7.1 Metrics to Track

**Cost Metrics** (Grafana dashboard):
- Total API spend per day/week/month
- Cost per voice session (avg, p50, p95)
- Cost by language (some languages may be more expensive)
- Cost trend over time

**Performance Metrics**:
- WebSocket connection success rate
- Average latency (audio sent → transcript received)
- P95 latency
- Reconnection rate

**Usage Metrics**:
- Active voice sessions (concurrent)
- Total sessions per day
- Session duration (avg, p50, p95)
- Completion rate (% of sessions that finish successfully)

**Quality Metrics**:
- User-reported accuracy (thumbs up/down)
- Error rate by error type
- Language detection accuracy

### 7.2 Alerts

**Critical**:
- Cost spike: >$100/hour (potential abuse)
- Error rate: >10% (OpenAI outage?)
- WebSocket connection failures: >20% (infrastructure issue)

**Warning**:
- Average session cost: >$0.30 (cost optimization needed)
- P95 latency: >2s (user experience degradation)
- Daily spend: >$500 (budget review)

### 7.3 Logging Strategy

**Structured Logs** (JSON format):
```json
{
  "timestamp": "2026-01-18T10:30:45Z",
  "level": "info",
  "service": "realtime-websocket",
  "event": "session.completed",
  "user_id": "usr_abc123",
  "session_id": "sess_xyz789",
  "duration_ms": 45000,
  "audio_duration_sec": 42,
  "cost_usd": 0.042,
  "language": "ar",
  "transcript_length": 250,
  "error": null
}
```

**Log Retention**:
- Production logs: 30 days
- Cost/usage logs: 2 years (for billing disputes)
- Error logs: 90 days

---

## 8. Decision Framework

### 8.1 Go/No-Go Criteria

**Proceed with Full Rollout If**:
- ✅ A/B test shows +10% completion rate for Safari users
- ✅ Average cost per session <$0.25
- ✅ Error rate <5%
- ✅ User satisfaction rating >4.3/5
- ✅ Monthly cost increase <$2,000

**Keep Hybrid Approach If**:
- ❌ Cost per session >$0.40
- ❌ Minimal UX improvement (<5% completion rate increase)
- ❌ High error rate (>10%)

**Rollback If**:
- ❌ Critical bug affecting >50% of sessions
- ❌ Cost explosion (>$5,000 unexpected spend in 1 week)
- ❌ OpenAI API instability (>20% error rate for 24+ hours)

### 8.2 Cost-Benefit Analysis

**Assumptions**:
- 10,000 voice inputs/month (current)
- Average session: 2 minutes
- 60% Chrome/Edge (free Web Speech), 40% Safari/Firefox (need Realtime)

**Current Monthly Cost**:
- Whisper HTTP (final only): 10,000 × 2min × $0.00167 = **$33.40/month**

**Realtime API Monthly Cost (40% of traffic)**:
- Realtime sessions: 4,000 × 2min × $0.06 = **$480/month**
- Web Speech (60%): $0 (free)
- **Total: $480/month**

**Cost Increase**: +$446.60/month (~13x increase)

**Value Proposition**:
- Improved UX for 40% of users (Safari/Firefox)
- Higher conversion rate (estimated +15% = 1,500 more sessions/month)
- Revenue impact (if conversion rate increases):
  - 1,500 new sessions × $10 avg project value × 2% paid conversion = **+$300/month revenue**
- **Net cost**: $446.60 - $300 = **$146.60/month** (acceptable for UX improvement)

---

## 9. Risks & Mitigation

### 9.1 Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| OpenAI API outage | Medium | High | Keep Whisper HTTP as fallback; auto-switch on 500 errors |
| WebSocket connection instability | Low | Medium | Implement exponential backoff; buffer audio locally |
| PCM conversion accuracy issues | Low | High | Unit test all edge cases; validate against reference audio |
| Browser compatibility (AudioWorklet) | Low | Medium | Feature detection; fallback to Web Speech or Whisper |

### 9.2 Cost Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Users abuse long sessions | Medium | High | Hard timeout at 5 minutes; rate limiting per user |
| Unexpected pricing increase | Low | High | Set monthly budget alerts; negotiate volume discount |
| Bots/scrapers exploiting API | Low | High | CAPTCHA on voice button; rate limit by IP |

### 9.3 Business Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Minimal UX improvement | Medium | Medium | A/B test before full rollout; get user feedback |
| User privacy concerns (WebSocket) | Low | Medium | Clear privacy policy; on-device processing option |
| Vendor lock-in (OpenAI-specific) | Medium | Low | Abstract provider interface; keep Whisper option |

---

## 10. Success Metrics

### 10.1 Launch Metrics (First 30 Days)

**Target Metrics**:
- Voice input completion rate: >80% (currently ~65% on Safari)
- Average transcript accuracy: >95% (user-rated)
- Error rate: <3%
- Average cost per session: <$0.20
- User satisfaction (NPS): >50

**Measurement**:
- Analytics events: `voice_session_started`, `voice_session_completed`, `transcript_accuracy_rated`
- Cost tracking via admin dashboard
- User surveys after voice input

### 10.2 Long-Term Metrics (6 Months)

**Business Impact**:
- Voice input adoption rate: +25% (more users trying voice)
- Project creation via voice: +40% (improved completion rate)
- Paid conversion from voice users: +10%

**Technical Health**:
- Average latency: <500ms (p50)
- WebSocket uptime: >99.5%
- Cost per session trend: Stable or decreasing

---

## 11. Alternatives Considered

### 11.1 Option A: AssemblyAI Streaming

**Pros**:
- Dedicated transcription API (potentially cheaper)
- WebSocket-based streaming
- Good accuracy

**Cons**:
- Another vendor dependency
- Pricing similar to OpenAI Realtime (~$0.05/min)
- Less mature than Whisper

**Decision**: Not chosen (prefer OpenAI ecosystem consolidation)

### 11.2 Option B: Web Speech API + Post-Processing

**Pros**:
- Free (no API costs)
- Real-time preview

**Cons**:
- Already implemented (current solution)
- Safari/Firefox lack support
- Lower accuracy for non-English

**Decision**: Keep as fallback/free tier

### 11.3 Option C: Self-Hosted Whisper

**Pros**:
- Full control
- Potentially cheaper at scale
- No vendor lock-in

**Cons**:
- Infrastructure complexity (GPU servers)
- Latency challenges (need low-latency inference)
- Maintenance burden

**Decision**: Not feasible for current scale (consider at >100k sessions/month)

---

## 12. Timeline & Resources

### 12.1 Estimated Timeline

**Total Duration**: 5 weeks (with 1 engineer + 0.25 DevOps)

| Phase | Duration | Engineer Days | Deliverables |
|-------|----------|---------------|--------------|
| Phase 1: Foundation | 1 week | 5 days | WebSocket infrastructure |
| Phase 2: Integration | 1 week | 5 days | Real-time transcription |
| Phase 3: Cost Opt | 1 week | 5 days | Usage limits, billing |
| Phase 4: A/B Test | 1 week | 3 days | Analytics, 10% rollout |
| Phase 5: Rollout | 1 week | 2 days | Full deployment, docs |
| **Total** | **5 weeks** | **20 days** | Production-ready |

### 12.2 Required Resources

**Engineering**:
- 1 Senior Full-Stack Engineer (TypeScript, WebSocket, Audio APIs)
- 0.25 DevOps Engineer (Monitoring, cost alerts)

**Infrastructure**:
- Worker WebSocket support (Fastify + `fastify-websocket` plugin)
- Monitoring: Grafana dashboard for cost/performance metrics

**Budget**:
- Development: 20 days × $600/day = **$12,000**
- Infrastructure: $50/month (monitoring, logs)
- A/B Test API costs: ~$200 (10% of traffic for 1 week)
- **Total Initial Investment**: **~$12,250**

---

## 13. Rollout Plan

### 13.1 Phased Rollout Strategy

**Week 1-4**: Development + Internal Testing
- Build all components
- Test with internal team (10 people)
- Fix critical bugs

**Week 5**: Closed Beta (100 Users)
- Invite power users from Safari/Firefox
- Collect feedback
- Monitor costs closely

**Week 6**: A/B Test (10% of Safari/Firefox Users)
- Randomly assign 10% to Realtime API
- Track completion rate, accuracy, cost
- Decision checkpoint: Go/No-Go

**Week 7-8**: Gradual Rollout (25% → 50% → 100%)
- Increase percentage daily if metrics look good
- Pause if error rate spikes or costs exceed budget

**Week 9+**: Monitoring & Optimization
- Tune silence detection
- Optimize chunk sizes for cost
- Negotiate volume discount with OpenAI

### 13.2 Rollback Plan

**Trigger Conditions**:
- Error rate >15% for 1 hour
- Cost spike >$500 in 1 day
- User complaints >10% of sessions

**Rollback Steps**:
1. Disable `VOICE_REALTIME_API` feature flag
2. All users fall back to Web Speech (Chrome/Edge) or Whisper HTTP (Safari/Firefox)
3. Investigate root cause
4. Deploy fix
5. Re-enable gradually

---

## 14. Documentation Requirements

### 14.1 Technical Documentation

**Files to Create**:
- `docs/REALTIME_API_INTEGRATION.md` - Architecture overview
- `docs/REALTIME_AUDIO_PROCESSING.md` - PCM conversion, resampling
- `docs/REALTIME_COST_OPTIMIZATION.md` - Best practices for minimizing costs

**Code Comments**:
- Document all WebSocket event types
- Explain PCM16 conversion formulas
- Comment rate limiting logic

### 14.2 User-Facing Documentation

**Help Center Articles**:
- "How Voice Input Works" (explain real-time transcription)
- "Supported Browsers for Voice Input" (Chrome, Safari, Firefox, Edge)
- "Voice Input Privacy & Security" (data handling, retention)

**In-App Tooltips**:
- Voice button: "Speak your business idea (works on all browsers)"
- Real-time preview: "Live transcription - keep speaking!"

---

## 15. Conclusion

### 15.1 Recommendation

**Recommended Approach**: **Proceed with Phased Rollout**

**Reasoning**:
1. **UX Improvement**: 40% of users (Safari/Firefox) currently lack real-time preview
2. **Competitive Advantage**: Real-time voice input is becoming table stakes
3. **Acceptable Cost**: $480/month increase is justified by improved conversion
4. **Low Risk**: A/B testing validates assumption before full commitment
5. **Future-Proof**: Positions us for voice-first UX trends

### 15.2 Next Steps

**Immediate Actions** (This Week):
1. Create feature flag: `VOICE_REALTIME_API` (default: `false`)
2. Spike: Test OpenAI Realtime API with sample audio (validate pricing)
3. Review with product team: Confirm budget approval
4. Assign engineer: Schedule 5-week sprint

**Decision Point** (Week 5):
- Review A/B test results
- Compare actual costs vs estimates
- Go/No-Go decision for full rollout

---

## 16. Appendices

### 16.1 OpenAI Realtime API Reference

**Official Docs**: https://platform.openai.com/docs/guides/realtime

**Event Types Reference**:
- `session.update` - Configure session settings
- `input_audio_buffer.append` - Send audio chunk (base64 PCM16)
- `input_audio_buffer.commit` - Finalize audio for processing
- `response.audio_transcript.delta` - Real-time transcript chunk
- `response.audio_transcript.done` - Final complete transcript
- `error` - Error message from API

### 16.2 Browser Compatibility Matrix

| Feature | Chrome | Edge | Safari | Firefox |
|---------|--------|------|--------|---------|
| Web Speech API | ✅ | ✅ | ❌ | ❌ |
| AudioWorklet | ✅ | ✅ | ✅ (14+) | ✅ (76+) |
| WebSocket | ✅ | ✅ | ✅ | ✅ |
| MediaRecorder | ✅ | ✅ | ✅ (14.1+) | ✅ |

**Note**: All target browsers support AudioWorklet + WebSocket, so Realtime API will work universally.

### 16.3 Cost Estimation Calculator

```typescript
function estimateRealtimeCost(
  sessionsPerMonth: number,
  avgDurationMinutes: number,
  percentSafariFirefox: number = 0.4 // 40% of users
): { monthly: number; perSession: number } {
  const realtimeSessions = sessionsPerMonth * percentSafariFirefox;
  const costPerMinute = 0.06; // $0.06/min (input only)

  const monthlyCost = realtimeSessions * avgDurationMinutes * costPerMinute;
  const perSessionCost = avgDurationMinutes * costPerMinute;

  return {
    monthly: Math.round(monthlyCost * 100) / 100,
    perSession: Math.round(perSessionCost * 100) / 100
  };
}

// Example:
// 10,000 sessions/month, 2 min avg, 40% Safari/Firefox
const estimate = estimateRealtimeCost(10000, 2, 0.4);
console.log(`Monthly: $${estimate.monthly}`); // $480
console.log(`Per session: $${estimate.perSession}`); // $0.12
```

---

**Document Version**: 1.0
**Last Updated**: 2026-01-18
**Authors**: Claude Code (AI Assistant)
**Reviewers**: [Pending Product & Engineering Review]
