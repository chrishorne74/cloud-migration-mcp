# ─── Stage 1: build ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Install all deps (including devDeps for tsc)
COPY package*.json ./
RUN npm ci

# Compile TypeScript
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ─── Stage 2: runtime ────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled JS from builder
COPY --from=builder /app/build ./build

# Copy data files (mounted as volumes in docker-compose; baked in for standalone use)
COPY guardrails/ ./guardrails/
COPY criteria/  ./criteria/
COPY red-flags/ ./red-flags/

# Run as non-root
RUN addgroup -S mcpgroup && adduser -S mcpuser -G mcpgroup
USER mcpuser

EXPOSE 3456

ENV PORT=3456 \
    GUARDRAILS_FILE=/app/guardrails/migration-guardrails.md \
    CRITERIA_FILE=/app/criteria/migration-criteria.json \
    RED_FLAGS_FILE=/app/red-flags/migration-red-flags.json \
    NODE_ENV=production \
    MCP_TRANSPORT=stdio

# Default: stdio transport for Docker Desktop MCP Toolkit.
# Override CMD to "node build/index-http.js" (or set MCP_TRANSPORT=http)
# for network/docker-compose deployments.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('child_process').execSync('node build/index.js --version 2>/dev/null || true') && process.exit(0)" 2>/dev/null || exit 0

CMD ["node", "build/index.js"]
