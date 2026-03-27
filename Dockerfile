# ── Stage 1: builder ──────────────────────────────────────────────────────────
FROM node:22-slim AS builder

# better-sqlite3 native addon requires C++ build tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy lockfile and package manifests first (layer caching)
COPY package.json package-lock.json ./

# Install all dependencies; also compiles better-sqlite3 native .node addon via node-gyp
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/

# Compile TypeScript to dist/
RUN npm run build

# Drop devDependencies without recompiling better-sqlite3
RUN npm prune --omit=dev

# ── Stage 2: runner ───────────────────────────────────────────────────────────
FROM node:22-slim AS runner

ENV NODE_ENV=production
WORKDIR /app

# Same base image (node:22-slim) → glibc matches → better-sqlite3 .node binary works
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./

# Create writable data dir for SQLite (DB resolves to /app/data/subscriptions.db)
# Mount a host volume here for persistence: -v /host/data:/app/data
RUN mkdir -p /app/data && chown -R node:node /app/data

# Declare mount point for persistence
VOLUME ["/app/data"]

# Run as non-root user (pre-created in official node images)
USER node

CMD ["node", "dist/index.js"]
