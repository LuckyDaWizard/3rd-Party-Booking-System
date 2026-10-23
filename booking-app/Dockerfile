FROM node:24.22.1-alpine AS base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

# Build the app
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set build-time env vars (these get baked into the client bundle)
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
# Sentry: DSN + environment are inlined into the client bundle at build time.
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_APP_ENV=production
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_PUBLIC_APP_ENV=$NEXT_PUBLIC_APP_ENV

# SENTRY_AUTH_TOKEN (source-map upload) arrives as a BuildKit secret so it
# never lands in an image layer or `docker history`. If the secret isn't
# provided the file is absent, the token is empty, and the build just skips
# the upload.
RUN --mount=type=secret,id=sentry_auth_token \
    SENTRY_AUTH_TOKEN="$(cat /run/secrets/sentry_auth_token 2>/dev/null)" \
    npm run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
# Bind to all interfaces so the container's 127.0.0.1 also answers (needed
# for the Dockerfile HEALTHCHECK below). Without this, Next.js's standalone
# server.js can bind to only the Docker network interface, making IPv4
# loopback probes fail with "Connection refused" even though external
# traffic via Traefik works fine.
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

# Liveness + readiness probe. Docker marks the container "unhealthy" if this
# fails three times in a row, which pairs with docker-compose's
# `restart: unless-stopped` to auto-recover a hung process. The probe is
# routed through the app's /api/health endpoint so it also verifies DB
# connectivity, not just the Node process.
#
# Uses BusyBox-compatible wget syntax (alpine's default): -q for quiet,
# -O - writes the body to stdout which we discard via redirection. The
# long-form --quiet / --spider flags aren't available on BusyBox wget.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
