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
    NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:'+process.env.PORT+'/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

CMD ["node", "build/index-http.js"]
