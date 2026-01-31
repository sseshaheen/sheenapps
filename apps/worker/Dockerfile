#########################  Build stage  #########################
FROM node:22-slim AS builder
WORKDIR /app

# Install all deps (including dev for build)
COPY package*.json ./
RUN npm ci

# This ARG will break cache whenever you change its default
ARG CACHEBUST=1


# Compile TS → JS
COPY tsconfig.json ./
COPY src ./src
RUN npm run build           # outputs to /app/dist

# Drop dev deps
RUN npm prune --production

#########################  Runtime stage  #########################
FROM node:22-slim
ENV NODE_ENV=production
ENV HOME=/home/appuser

# Runtime tools + Claude CLI + pnpm
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl git ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g @anthropic-ai/claude-code pnpm@9.15.2 \
    && pnpm setup \
    && echo "export PNPM_HOME=\"$HOME/.local/share/pnpm\"" >> /etc/profile.d/pnpm.sh \
    && echo "export PATH=\"\$PNPM_HOME:\$PATH\"" >> /etc/profile.d/pnpm.sh

# Create non-root user *with* home directory
RUN groupadd -r appuser \
    && useradd -r -m -d "$HOME" -g appuser appuser \
    # ensure home is owned by appuser
    && chown -R appuser:appuser "$HOME"

# App working dir
WORKDIR /app

# Copy built code & deps
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist         ./dist
COPY package.json                     ./

# Copy and set up entrypoint
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh \
    && chown appuser:appuser /entrypoint.sh \
    && chown -R appuser:appuser /app

# Switch to non-root
USER appuser

EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/healthz', r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# Launch via entrypoint (which writes the credentials then starts the server)
CMD ["/entrypoint.sh"]
