# syntax=docker/dockerfile:1.6
# ShadowPaste V19 — Production image (Phase 12)
# Multi-stage build: deps → builder → runner.  Next.js `output: "standalone"`
# produces a self-contained server.js we run under Bun for fast cold-start.
# Base image: node:20-slim (Prisma native bindings + WebCrypto require Node >= 20).

# ----------------------------------------------------------------------------
# Stage 1 — base: node + bun
# ----------------------------------------------------------------------------
FROM node:20-slim AS base
WORKDIR /app
ENV NODE_ENV=production
# Install Bun (used as runtime + script runner; matches local dev)
RUN apt-get update -y \
 && apt-get install -y --no-install-recommends ca-certificates curl unzip \
 && curl -fsSL https://bun.sh/install | bash \
 && apt-get clean && rm -rf /var/lib/apt/lists/*
ENV BUN_INSTALL="/root/.bun"
ENV PATH="/root/.bun/bin:${PATH}"

# ----------------------------------------------------------------------------
# Stage 2 — deps: install production + dev deps (cached layer)
# ----------------------------------------------------------------------------
FROM base AS deps
WORKDIR /app
COPY package.json bun.lock* ./
# Install ALL deps (dev needed for next build + prisma generate)
RUN bun install --frozen-lockfile || bun install

# ----------------------------------------------------------------------------
# Stage 3 — builder: prisma generate + next build
# ----------------------------------------------------------------------------
FROM deps AS builder
WORKDIR /app
COPY prisma ./prisma
COPY . .

# Generate Prisma Client before Next.js build so imports resolve
ENV DATABASE_URL="postgresql://shadow:shadow@db:5432/shadowpaste"
ENV AUTH_PEPPER="change-me-in-prod-via-secret"
RUN bunx prisma generate

# Next.js standalone build.  Output goes to .next/standalone (+ .next/static).
# next.config.ts already sets output: "standalone".
RUN bun run build

# ----------------------------------------------------------------------------
# Stage 4 — runner: minimal runtime image
# ----------------------------------------------------------------------------
FROM base AS runner
WORKDIR /app

# Drop root — run as a non-privileged user
RUN addgroup --system sp && adduser --system --ingroup sp sp

# Copy standalone server, static assets, public, prisma schema + migrations
COPY --from=builder --chown=sp:sp /app/.next/standalone ./
COPY --from=builder --chown=sp:sp /app/.next/static ./.next/static
COPY --from=builder --chown=sp:sp /app/public ./public
COPY --from=builder --chown=sp:sp /app/prisma ./prisma
COPY --from=builder --chown=sp:sp /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=sp:sp /app/node_modules/@prisma ./node_modules/@prisma

USER sp

# Production env — must be overridden by docker-compose / -e at runtime.
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV DATABASE_URL="postgresql://shadow:shadow@db:5432/shadowpaste"
ENV AUTH_PEPPER="change-me-in-prod-via-secret"

EXPOSE 3000

# Healthcheck — Next.js responds 200 on /
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/ || exit 1

# Run the standalone server with Bun (matches package.json `start` script)
CMD ["bun", "server.js"]
