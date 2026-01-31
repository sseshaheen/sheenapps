# Production Environment Variables for Observability

## Required OpenTelemetry Variables for Production

Add these to your production `.env` file:

```bash
# ============================================
# OPENTELEMETRY CONFIGURATION (REQUIRED)
# ============================================

# Service identification
OTEL_SERVICE_NAME=sheenapps-worker
OTEL_RESOURCE_ATTRIBUTES=service.namespace=sheenapps,team=platform,region=eu-west-2,environment=production

# OTLP Exporter - Point to local Alloy collector
OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf

# Sampling configuration for production (10% baseline)
OTEL_TRACES_SAMPLER=parentbased_traceidratio
OTEL_TRACES_SAMPLER_ARG=0.1

# Metrics configuration for Prometheus compatibility
OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE=delta

# Disable debug logging in production
OTEL_DEBUG=false
OTEL_SDK_DISABLED=false

# Instance identification (optional but recommended)
INSTANCE_ID=${HOSTNAME:-worker-prod-1}

# ============================================
# EXISTING VARIABLES TO VERIFY
# ============================================

# Make sure these are set for proper identification
NODE_ENV=production
APP_VERSION=1.0.0  # Update with your actual version

# Logging level (info for production)
LOG_LEVEL=info
```

## For Staging Environment

Use similar settings but with different values:

```bash
# Staging uses 100% sampling for better debugging
OTEL_TRACES_SAMPLER_ARG=1.0
OTEL_RESOURCE_ATTRIBUTES=service.namespace=sheenapps,team=platform,region=eu-west-2,environment=staging
NODE_ENV=staging
LOG_LEVEL=debug
```

## For Development/Local Testing

```bash
# Development can use console exporter for debugging
OTEL_EXPORTER_CONSOLE=true  # Optional: see traces in console
OTEL_DEBUG=true
OTEL_TRACES_SAMPLER_ARG=1.0  # 100% sampling in dev
NODE_ENV=development
LOG_LEVEL=trace
```

## Direct to Grafana Cloud (Emergency Bypass)

If Alloy is down and you need to send directly to Grafana Cloud:

```bash
# EMERGENCY ONLY - Bypasses Alloy, sends directly to Grafana
# Get these values from Grafana Cloud UI: Connections → OpenTelemetry → Configure
OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp-gateway-prod-eu-west-2.grafana.net/otlp
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic <YOUR_GRAFANA_CLOUD_TOKEN>
```

## Verification Checklist

After adding these variables, verify:

1. **Check SDK initialization**:
   ```bash
   # With OTEL_DEBUG=true temporarily
   npm start
   # Should see: "Initializing OpenTelemetry SDK..."
   ```

2. **Verify Alloy is receiving data**:
   ```bash
   curl http://localhost:8888/metrics | grep worker_
   # Should see your custom metrics
   ```

3. **Check Alloy health**:
   ```bash
   curl http://localhost:13133/healthz
   # Should return: OK
   ```

4. **Verify in Grafana Cloud**:
   - Go to Explore → Traces
   - Query: `{service.name="sheenapps-worker"}`
   - Should see traces within 1-2 minutes

## Important Notes

1. **DO NOT commit `.env` to git** - Use `.env.example` as template
2. **Rotate tokens quarterly** - Set calendar reminders
3. **Monitor costs** - 10% sampling in production keeps costs reasonable
4. **Instance ID** - Helps identify which worker instance in scaled deployments

## Troubleshooting

If traces aren't appearing:

1. **Check Alloy is running**:
   ```bash
   systemctl status grafana-alloy
   ```

2. **Check Alloy logs**:
   ```bash
   journalctl -u grafana-alloy -f
   ```

3. **Verify network connectivity**:
   ```bash
   telnet localhost 4318
   ```

4. **Test with curl**:
   ```bash
   curl -X POST http://localhost:4318/v1/traces \
     -H "Content-Type: application/json" \
     -d '{"resourceSpans":[]}'
   # Should return 200 OK or similar
   ```