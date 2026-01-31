# Logging Configuration Guide

## Overview

The Claude Worker uses Fastify's built-in Pino logger. You can configure logging behavior through environment variables.

## Quick Start

### To Disable Request Logs Completely

Add to your `.env`:
```bash
DISABLE_REQUEST_LOGGING=true
```

### To Change Log Level

```bash
# Options: trace, debug, info, warn, error, fatal
LOG_LEVEL=warn  # Only show warnings and errors
```

### To Use Pretty Logs in Development

Pretty logs are enabled by default in development. To disable:
```bash
PRETTY_LOGS=false
```

## Environment Variables

| Variable | Values | Default | Description |
|----------|--------|---------|-------------|
| `DISABLE_REQUEST_LOGGING` | `true`/`false` | `false` | Completely disable all HTTP request logging |
| `LOG_LEVEL` | `trace`, `debug`, `info`, `warn`, `error`, `fatal` | `info` | Minimum log level to display |
| `PRETTY_LOGS` | `true`/`false` | `true` (in dev) | Use pretty formatted logs in development |
| `LOG_HEADERS` | `true`/`false` | `false` | Include request headers in logs (production only) |

## Log Formats

### Development (Pretty Logs)

When `NODE_ENV=development` and `PRETTY_LOGS≠false`:
```
[12:34:56] req-1 GET /api/health - 200 in 5ms
[12:34:57] req-2 POST /generate - 201 in 1234ms
```

### Production (JSON Logs)

Standard Pino JSON format:
```json
{
  "level": 30,
  "time": 1753189242959,
  "pid": 72841,
  "hostname": "server-1",
  "reqId": "req-1",
  "req": {
    "method": "GET",
    "url": "/api/health"
  },
  "res": {
    "statusCode": 200
  },
  "responseTime": 2.34,
  "msg": "request completed"
}
```

## Common Configurations

### Silent Mode (No Logs)
```bash
DISABLE_REQUEST_LOGGING=true
```

### Errors Only
```bash
LOG_LEVEL=error
```

### Debug Mode (Very Verbose)
```bash
LOG_LEVEL=debug
LOG_HEADERS=true
```

### Production Recommended
```bash
LOG_LEVEL=info
PRETTY_LOGS=false
LOG_HEADERS=false
```

## Filtering Specific Routes

To reduce noise from health checks or admin routes, you can add custom filtering:

```typescript
// In server.ts, add to loggerConfig():
hooks: {
  logMethod(inputArgs, method) {
    // Don't log health checks
    if (inputArgs[0]?.url?.includes('/health')) {
      return;
    }
    // Don't log admin routes
    if (inputArgs[0]?.url?.includes('/admin/')) {
      return;
    }
    return method.apply(this, inputArgs);
  }
}
```

## Log Levels Explained

- **trace**: Most detailed, includes internal framework operations
- **debug**: Detailed debugging information
- **info**: General informational messages (default)
- **warn**: Warning messages
- **error**: Error messages
- **fatal**: Fatal errors that cause shutdown

## Security Notes

- Sensitive headers (`authorization`, `x-sheen-signature`) are automatically redacted
- Request bodies are not logged by default
- Headers are only logged when `LOG_HEADERS=true`

## Performance Considerations

- Logging has minimal performance impact at `info` level
- `trace` and `debug` levels can impact performance
- Consider using `warn` or `error` in high-traffic production environments
- Pretty logs add overhead; disable in production with `PRETTY_LOGS=false`