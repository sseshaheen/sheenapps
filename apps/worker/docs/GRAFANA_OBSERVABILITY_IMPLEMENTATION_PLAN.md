# Grafana Cloud Observability Implementation Plan for Worker Service

## Executive Summary
Implement comprehensive observability for the sheenapps-worker service running on VM, using Grafana Alloy as the collector and OpenTelemetry for instrumentation. Ship traces, metrics, and logs to Grafana Cloud (sheenapps.grafana.net).

## Implementation Progress

### 🚀 Current Status: Phase 1 - Infrastructure Setup
**Started**: 2025-01-16  
**Environment**: Development/Local Testing

### ✅ Completed
- [x] Created all configuration files and code templates
- [x] Applied expert review improvements (security, metrics naming, sampling)
- [x] Phase 2: Application Instrumentation (90% complete)
  - [x] Added OpenTelemetry SDK dependencies
  - [x] Initialized OTel in server startup
  - [x] Instrumented build worker with distributed tracing
  - [x] Added custom span attributes and events
  - [x] Integrated structured logging with Pino
  - [x] Created custom metrics with Prometheus naming
  - [x] Added heartbeat metric for health monitoring
- [x] Phase 3: Metrics & Monitoring (partial)
  - [x] Defined custom metrics with proper naming
  - [x] Created alert rules with correct metric names

### 🔄 In Progress
- [ ] Phase 1: Infrastructure Setup (VM deployment pending)
- [ ] TypeScript compilation issues with Resource class

### 📝 Implementation Notes & Discoveries

#### 2025-01-16 - Phase 2 Implementation
1. **Dependencies Installed**: Successfully added all OpenTelemetry packages using pnpm
2. **Worker Architecture**: The application uses BullMQ for job processing with multiple workers:
   - `buildWorker.ts` - Main build processing
   - `modularWorkers.ts` - Modular task processing
   - `streamWorker.ts` - Stream processing
   - `deployWorker.ts` - Deployment tasks

3. **Instrumentation Applied**:
   - ✅ Added OpenTelemetry initialization to server startup
   - ✅ Wrapped build job processing with distributed tracing
   - ✅ Added custom span attributes for build metadata
   - ✅ Integrated structured logging with Pino
   - ✅ Added metrics tracking for active jobs

4. **External Services Identified** (need tracing):
   - Claude CLI (via spawn process)
   - pnpm install/build commands
   - Cloudflare R2 uploads
   - Cloudflare Pages deployments
   - PostgreSQL database operations
   - Redis/BullMQ queue operations

5. **Challenges & Solutions**:
   - **Challenge**: Claude CLI is called via spawn, not HTTP
   - **Solution**: Wrapped spawn calls with `JobTracer.traceExternalCall`
   - **Challenge**: Complex async job processing with webhooks
   - **Solution**: Implemented proper context propagation through job metadata
   - **Challenge**: TypeScript compatibility with OTel Resource class
   - **Solution**: (In progress) May need to adjust import pattern or version

### 💡 Improvements & Discoveries

1. **Code Quality Improvements Made**:
   - Replaced console.log with structured logging (Pino)
   - Added proper error handling with trace context
   - Implemented metrics tracking for job lifecycle
   - Added span events for key milestones

2. **Architecture Insights**:
   - BullMQ jobs can carry trace context in metadata
   - Spawn processes can be traced as external calls
   - Webhook events provide good trace correlation points

3. **Recommended Future Enhancements**:
   - Add trace propagation to webhook payloads
   - Instrument database calls with query details
   - Add custom metrics for Claude API latency
   - Implement SLO tracking with error budgets
   - Add trace sampling based on user tier

### ⚠️ Important Decisions & Changes
- **Metrics Naming**: Changed from dots to underscores (Prometheus convention)
- **Security**: Alloy bound to localhost only (127.0.0.1)
- **Sampling**: Parent-based sampling with Alloy tail sampling
- **Heartbeat**: Added worker_heartbeat metric for health monitoring

## 1. Architecture Overview

### Data Flow
```
Worker App (OTel SDK) → Grafana Alloy (VM) → Grafana Cloud OTLP Gateway
     ↓                        ↓                         ↓
  Traces/Metrics          Collector              Grafana Cloud
  /Logs @4318            Processing             (sheenapps.grafana.net)
```

### Components
- **Application**: Worker service with OpenTelemetry SDK
- **Collector**: Grafana Alloy on VM (ports 4317/4318)
- **Backend**: Grafana Cloud OTLP endpoint (prod-eu-west-2)

## 2. Implementation Phases

### Phase 1: Infrastructure Setup (Day 1-2)
- [ ] Install and configure Grafana Alloy on VM
- [ ] Set up secure credential management
- [ ] Configure network/firewall rules
- [ ] Validate Alloy health endpoints

### Phase 2: Application Instrumentation (Day 3-5)
- [ ] Add OpenTelemetry SDK to worker
- [ ] Implement trace context propagation
- [ ] Add custom spans for job processing
- [ ] Configure structured logging with trace correlation

### Phase 3: Metrics & Monitoring (Day 6-7)
- [ ] Define custom metrics (job duration, queue lag)
- [ ] Create Grafana dashboards
- [ ] Configure alerting rules
- [ ] Test alert routing

### Phase 4: Production Rollout (Day 8-10)
- [ ] Staging environment validation
- [ ] Performance impact assessment
- [ ] Production deployment with sampling
- [ ] Documentation and runbooks

## 3. Technical Implementation Details

### 3.1 Resource Attributes Schema
```yaml
Required Attributes:
  service.name: sheenapps-worker
  service.namespace: sheenapps
  service.version: ${APP_VERSION}
  deployment.environment: prod|staging|dev

Optional Attributes:
  team: platform
  region: eu-west-2
  queue.name: ${QUEUE_NAME}
  node.hostname: ${HOSTNAME}
```

### 3.2 Sampling Strategy
- **Development**: 100% sampling
- **Staging**: 100% sampling
- **Production**: 
  - Head sampling: 10% baseline
  - Tail sampling: 100% for errors
  - Dynamic sampling based on queue type

### 3.3 Security Configuration
```yaml
Credentials Storage:
  - Location: /etc/sheenapps/secrets/
  - Format: Environment variables
  - Rotation: Quarterly via CI/CD
  
Access Control:
  - Token Scopes: Metrics:Write, Logs:Write, Traces:Write
  - Network: Internal only (4317/4318)
  - External: HTTPS only to Grafana Cloud
```

## 4. Application Code Changes

### 4.1 OpenTelemetry Initialization
```typescript
// src/observability/otel.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';

const resource = new Resource({
  [SemanticResourceAttributes.SERVICE_NAME]: 'sheenapps-worker',
  [SemanticResourceAttributes.SERVICE_NAMESPACE]: 'sheenapps',
  [SemanticResourceAttributes.SERVICE_VERSION]: process.env.APP_VERSION || 'dev',
  [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || 'dev',
  'team': 'platform',
  'region': process.env.AWS_REGION || 'eu-west-2',
});

const traceExporter = new OTLPTraceExporter({
  url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://127.0.0.1:4318/v1/traces',
});

const metricExporter = new OTLPMetricExporter({
  url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://127.0.0.1:4318/v1/metrics',
});

export const sdk = new NodeSDK({
  resource,
  instrumentations: [getNodeAutoInstrumentations({
    '@opentelemetry/instrumentation-fs': { enabled: false },
  })],
  spanProcessor: new BatchSpanProcessor(traceExporter),
  metricReader: new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 30000,
  }),
});

// Initialize
sdk.start();
process.on('SIGTERM', () => sdk.shutdown());
```

### 4.2 Job Processing Instrumentation
```typescript
// src/observability/job-tracer.ts
import { context, trace, propagation, SpanKind, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('sheenapps-worker', '1.0.0');

export class JobTracer {
  // Inject trace context when enqueueing
  static injectContext(jobPayload: any): any {
    const carrier: Record<string, string> = {};
    propagation.inject(context.active(), carrier);
    return {
      ...jobPayload,
      _traceContext: carrier,
    };
  }

  // Extract and continue trace when processing
  static async processWithTrace(job: any, handler: Function) {
    const extractedContext = propagation.extract(
      context.active(),
      job._traceContext || {}
    );

    return context.with(extractedContext, async () => {
      const span = tracer.startSpan(`job.process.${job.type}`, {
        kind: SpanKind.CONSUMER,
        attributes: {
          'job.id': job.id,
          'job.type': job.type,
          'job.queue': job.queue,
          'job.attempt': job.attempt || 1,
        },
      });

      try {
        const result = await handler(job);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({ 
          code: SpanStatusCode.ERROR, 
          message: error.message 
        });
        throw error;
      } finally {
        span.end();
      }
    });
  }
}
```

### 4.3 Structured Logging Integration
```typescript
// src/observability/logger.ts
import pino from 'pino';
import { context, trace } from '@opentelemetry/api';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    log(object) {
      const span = trace.getSpan(context.active());
      if (span) {
        const spanContext = span.spanContext();
        return {
          ...object,
          trace_id: spanContext.traceId,
          span_id: spanContext.spanId,
          service_name: 'sheenapps-worker',
        };
      }
      return object;
    },
  },
  serializers: {
    error: pino.stdSerializers.err,
  },
});
```

### 4.4 Custom Metrics
```typescript
// src/observability/metrics.ts
import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('sheenapps-worker', '1.0.0');

// Job processing metrics
export const jobDuration = meter.createHistogram('job.duration', {
  description: 'Job processing duration in milliseconds',
  unit: 'ms',
});

export const jobCounter = meter.createCounter('job.processed', {
  description: 'Number of jobs processed',
});

export const queueLag = meter.createObservableGauge('queue.lag', {
  description: 'Queue processing lag in seconds',
  unit: 's',
});

// Usage example
export function recordJobMetrics(jobType: string, duration: number, success: boolean) {
  jobDuration.record(duration, {
    'job.type': jobType,
    'job.status': success ? 'success' : 'failure',
  });
  
  jobCounter.add(1, {
    'job.type': jobType,
    'job.status': success ? 'success' : 'failure',
  });
}
```

## 5. Grafana Alloy Configuration

### 5.1 Main Configuration File
```yaml
# /etc/alloy/config.yaml
receivers:
  otlp:
    protocols:
      http:
        endpoint: 0.0.0.0:4318
      grpc:
        endpoint: 0.0.0.0:4317

  # Log collection from systemd
  journald:
    directory: /var/log/journal
    units: 
      - sheenapps-worker.service
    priority: info

processors:
  resource:
    attributes:
      - key: service.namespace
        value: sheenapps
        action: upsert
      - key: deployment.environment
        value: ${ENVIRONMENT}
        action: upsert
      - key: host.name
        value: ${HOSTNAME}
        action: insert

  batch:
    timeout: 10s
    send_batch_size: 1024
    send_batch_max_size: 2048

  # Tail sampling for production
  tail_sampling:
    decision_wait: 10s
    num_traces: 50000
    expected_new_traces_per_sec: 100
    policies:
      - name: errors-policy
        type: status_code
        status_code:
          status_codes: [ERROR]
      - name: latency-policy
        type: latency
        latency:
          threshold_ms: 5000
      - name: probabilistic-policy
        type: probabilistic
        probabilistic:
          sampling_percentage: 10

  # Memory limiter to prevent OOM
  memory_limiter:
    check_interval: 1s
    limit_mib: 512
    spike_limit_mib: 128

exporters:
  otlphttp:
    endpoint: ${GRAFANA_OTLP_ENDPOINT}
    headers:
      Authorization: ${GRAFANA_OTLP_AUTH}
    timeout: 30s
    retry_on_failure:
      enabled: true
      initial_interval: 5s
      max_interval: 30s
      max_elapsed_time: 300s

extensions:
  health_check:
    endpoint: 0.0.0.0:13133
    path: /healthz
  
  pprof:
    endpoint: 127.0.0.1:1777

service:
  extensions: [health_check, pprof]
  telemetry:
    logs:
      level: info
    metrics:
      level: detailed
      address: 0.0.0.0:8888

  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, resource, tail_sampling, batch]
      exporters: [otlphttp]
    
    metrics:
      receivers: [otlp]
      processors: [memory_limiter, resource, batch]
      exporters: [otlphttp]
    
    logs:
      receivers: [otlp, journald]
      processors: [memory_limiter, resource, batch]
      exporters: [otlphttp]
```

### 5.2 Environment Variables
```bash
# /etc/sheenapps/alloy.env
ENVIRONMENT=prod
HOSTNAME=$(hostname)
GRAFANA_OTLP_ENDPOINT=https://otlp-gateway-prod-eu-west-2.grafana.net/otlp
GRAFANA_OTLP_AUTH=Basic Z2xjXzllemp...  # Token from setup
```

### 5.3 Systemd Service
```ini
# /etc/systemd/system/grafana-alloy.service
[Unit]
Description=Grafana Alloy
After=network.target

[Service]
Type=simple
User=alloy
Group=alloy
EnvironmentFile=/etc/sheenapps/alloy.env
ExecStart=/usr/local/bin/alloy --config.file=/etc/alloy/config.yaml
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=grafana-alloy

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/alloy /var/log/alloy

[Install]
WantedBy=multi-user.target
```

## 6. Dashboards and Alerts

### 6.1 Golden Signals Dashboard
```json
{
  "dashboard": {
    "title": "Sheenapps Worker - Golden Signals",
    "panels": [
      {
        "title": "Request Rate",
        "targets": [{
          "expr": "sum(rate(job_processed_total[5m])) by (job_type)"
        }]
      },
      {
        "title": "Error Rate",
        "targets": [{
          "expr": "sum(rate(job_processed_total{status='failure'}[5m])) / sum(rate(job_processed_total[5m]))"
        }]
      },
      {
        "title": "P95 Latency",
        "targets": [{
          "expr": "histogram_quantile(0.95, rate(job_duration_bucket[5m]))"
        }]
      },
      {
        "title": "Queue Lag",
        "targets": [{
          "expr": "queue_lag"
        }]
      }
    ]
  }
}
```

### 6.2 Alert Rules
```yaml
# alerts.yaml
groups:
  - name: worker_alerts
    interval: 30s
    rules:
      - alert: HighErrorRate
        expr: |
          sum(rate(job_processed_total{status="failure"}[5m])) 
          / sum(rate(job_processed_total[5m])) > 0.05
        for: 5m
        labels:
          severity: warning
          team: platform
        annotations:
          summary: "High error rate detected ({{ $value | humanizePercentage }})"
          description: "Worker error rate is above 5% for 5 minutes"

      - alert: HighJobLatency
        expr: |
          histogram_quantile(0.95, rate(job_duration_bucket[5m])) > 5000
        for: 10m
        labels:
          severity: warning
          team: platform
        annotations:
          summary: "High job processing latency"
          description: "P95 latency is above 5 seconds"

      - alert: QueueBacklog
        expr: queue_lag > 300
        for: 15m
        labels:
          severity: critical
          team: platform
        annotations:
          summary: "Queue backlog detected"
          description: "Queue lag is above 5 minutes"

      - alert: WorkerDown
        expr: up{job="sheenapps-worker"} == 0
        for: 5m
        labels:
          severity: critical
          team: platform
        annotations:
          summary: "Worker is down"
          description: "Worker has been down for 5 minutes"
```

## 7. Testing Plan

### 7.1 Local Testing
```bash
# 1. Start Alloy locally
docker run -d \
  --name alloy \
  -p 4318:4318 \
  -p 13133:13133 \
  -v $(pwd)/alloy-config.yaml:/etc/alloy/config.yaml \
  grafana/alloy:latest

# 2. Verify health
curl http://localhost:13133/healthz

# 3. Send test trace
curl -X POST http://localhost:4318/v1/traces \
  -H "Content-Type: application/json" \
  -d @test-trace.json

# 4. Check Alloy metrics
curl http://localhost:8888/metrics
```

### 7.2 Integration Testing
```typescript
// test/observability.test.ts
import { sdk } from '../src/observability/otel';
import { JobTracer } from '../src/observability/job-tracer';

describe('Observability', () => {
  beforeAll(() => sdk.start());
  afterAll(() => sdk.shutdown());

  test('should create spans for job processing', async () => {
    const job = { id: 'test-1', type: 'email', data: {} };
    
    await JobTracer.processWithTrace(job, async () => {
      // Simulate job processing
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    // Verify span was created (check Alloy received data)
  });

  test('should propagate trace context', () => {
    const job = { id: 'test-2', type: 'webhook' };
    const enrichedJob = JobTracer.injectContext(job);
    
    expect(enrichedJob._traceContext).toBeDefined();
    expect(enrichedJob._traceContext.traceparent).toBeDefined();
  });
});
```

## 8. Rollout Plan

### Stage 1: Development Environment (Day 1-3)
- Deploy Alloy to dev VM
- Enable 100% sampling
- Validate all three signals working
- Create initial dashboards

### Stage 2: Staging Environment (Day 4-6)
- Deploy to staging with production config
- Run load tests
- Tune sampling rates
- Validate alerts fire correctly

### Stage 3: Production Canary (Day 7-8)
- Deploy to 10% of production workers
- Monitor performance impact
- Validate data quality
- Check cost/volume metrics

### Stage 4: Full Production (Day 9-10)
- Roll out to all workers
- Enable tail sampling
- Configure production alerts
- Document runbooks

## 9. Operations Runbook

### 9.1 Common Queries

#### Find Slow Jobs
```promql
histogram_quantile(0.99, 
  sum(rate(job_duration_bucket[5m])) by (job_type, le)
) > 10000
```

#### Trace Failed Jobs
```logql
{service_name="sheenapps-worker"} 
|= "error" 
| json 
| trace_id != ""
```

#### Correlate Logs with Traces
```logql
{service_name="sheenapps-worker"} 
| json 
| trace_id="abc123..."
```

### 9.2 Troubleshooting

#### Issue: No data in Grafana
1. Check Alloy health: `curl http://vm-ip:13133/healthz`
2. Verify network connectivity to Grafana Cloud
3. Check Alloy logs: `journalctl -u grafana-alloy -f`
4. Validate token permissions in Grafana Cloud UI

#### Issue: High memory usage
1. Check Alloy memory: `curl http://vm-ip:8888/metrics | grep alloy_memory`
2. Reduce batch size in config
3. Enable memory_limiter processor
4. Adjust sampling rates

#### Issue: Missing traces
1. Verify context propagation in job code
2. Check sampling configuration
3. Validate trace exporter is configured
4. Look for errors in Alloy logs

### 9.3 Maintenance Tasks

#### Weekly
- Review dashboard usage and alert noise
- Check Alloy resource consumption
- Validate data retention policies

#### Monthly
- Analyze cost/usage in Grafana Cloud
- Review and tune sampling rates
- Update dashboards based on incidents

#### Quarterly
- Rotate access tokens
- Review and update alert thresholds
- Audit resource attributes and labels

## 10. Security Considerations

### 10.1 Credential Management
- Store tokens in secure vault (HashiCorp Vault, AWS Secrets Manager)
- Use least-privilege access tokens
- Rotate tokens quarterly
- Never commit tokens to git

### 10.2 Network Security
- Alloy listens on localhost only for OTLP
- Use TLS for Grafana Cloud exports
- Firewall rules restrict access to health/metrics endpoints
- No public exposure of collector endpoints

### 10.3 Data Privacy
- No PII in traces/metrics/logs
- Sanitize sensitive data before emission
- Use attribute filtering in Alloy if needed
- Comply with data retention policies

## 11. Cost Optimization

### 11.1 Volume Estimates
```
Daily Estimates (Production):
- Traces: ~1M spans (with 10% sampling)
- Metrics: ~500K data points
- Logs: ~10GB (compressed)

Monthly Cost Estimate:
- Traces: $50-100
- Metrics: $30-50
- Logs: $100-150
- Total: ~$200-300/month
```

### 11.2 Optimization Strategies
- Use tail sampling for traces (keep errors, sample success)
- Aggregate metrics at source when possible
- Filter unnecessary log levels
- Use resource processors to drop unused attributes
- Monitor usage weekly and adjust

## 12. Success Criteria

### Technical Metrics
- [ ] All three signals (traces, metrics, logs) flowing to Grafana
- [ ] < 1% data loss under normal operation
- [ ] < 100ms added latency to job processing
- [ ] < 5% CPU overhead from instrumentation

### Business Metrics
- [ ] Mean time to detection (MTTD) < 5 minutes
- [ ] Mean time to resolution (MTTR) reduced by 50%
- [ ] 100% of critical jobs have observability
- [ ] All team members trained on dashboards

## 13. Dependencies and Risks

### Dependencies
- Grafana Cloud account active
- Network connectivity to Grafana endpoints
- VM resources for Alloy (2GB RAM, 2 CPU cores)
- Application deployment pipeline for code changes

### Risks and Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| Token compromise | High | Rotate quarterly, use vault |
| Alloy failure | Medium | Local buffering, app-direct fallback |
| Cost overrun | Medium | Sampling, monitoring, alerts |
| Performance impact | Low | Load testing, gradual rollout |

## 14. Timeline

| Week | Phase | Deliverables |
|------|-------|--------------|
| 1 | Setup & Development | Alloy deployed, app instrumented |
| 2 | Testing & Validation | Dashboards created, alerts configured |
| 3 | Production Rollout | Full deployment, documentation complete |

## 15. Current Status & Next Steps

### 🚧 Current Blockers
1. **TypeScript Issue**: Resource class import from @opentelemetry/resources
   - Error: "Resource only refers to a type, but is being used as a value"
   - Workaround: May need to use a different initialization pattern or update dependencies

### 📋 Immediate Next Steps
1. **Fix TypeScript Issues**
   - Resolve Resource class import
   - Ensure all OTel types are properly imported
   
2. **Local Testing**
   - Run test:observability script
   - Verify traces are generated
   - Check metrics are recorded
   
3. **Alloy Setup (VM)**
   - Run install-alloy.sh on target VM
   - Configure credentials in /etc/sheenapps/secrets/alloy.env
   - Start and verify Alloy service
   
4. **Integration Testing**
   - Point worker to local Alloy (127.0.0.1:4318)
   - Verify data flows to Grafana Cloud
   - Import dashboards and alerts

### 🎯 Success Validation
- [ ] Worker starts without errors
- [ ] Test script runs successfully
- [ ] Traces visible in Alloy metrics endpoint
- [ ] Data appears in Grafana Cloud
- [ ] Dashboards populate with real data
- [ ] Alerts fire on test conditions

## 16. Appendix

### A. Environment Variables Reference
```bash
# Application
OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
OTEL_SERVICE_NAME=sheenapps-worker
OTEL_RESOURCE_ATTRIBUTES=team=platform,region=eu-west-2
NODE_ENV=production
APP_VERSION=1.0.0
LOG_LEVEL=info

# Alloy
ENVIRONMENT=prod
GRAFANA_OTLP_ENDPOINT=https://otlp-gateway-prod-eu-west-2.grafana.net/otlp
GRAFANA_OTLP_AUTH=Basic <token>
```

### B. Useful Commands
```bash
# Check Alloy status
systemctl status grafana-alloy

# View Alloy logs
journalctl -u grafana-alloy -f

# Test OTLP endpoint
curl -X POST http://localhost:4318/v1/traces \
  -H "Content-Type: application/json" \
  -d '{"resourceSpans":[]}'

# Alloy metrics
curl http://localhost:8888/metrics

# Restart Alloy
systemctl restart grafana-alloy
```

### C. References
- [OpenTelemetry Node.js Documentation](https://opentelemetry.io/docs/instrumentation/js/)
- [Grafana Alloy Documentation](https://grafana.com/docs/alloy/latest/)
- [Grafana Cloud OTLP Documentation](https://grafana.com/docs/grafana-cloud/send-data/otlp/)
- [Worker Service Repository](https://github.com/sheenapps/worker)

---

**Document Version**: 1.0.0  
**Last Updated**: 2025-01-16  
**Author**: Platform Team  
**Review Status**: Draft