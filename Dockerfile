FROM node:20-slim

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json package-lock.json ./
COPY packages/server/package.json packages/server/
COPY packages/shared/package.json packages/shared/
COPY packages/web/package.json packages/web/

# Install ALL dependencies (including devDeps — tsx is needed at runtime)
# NODE_ENV must NOT be production here so devDeps are installed
RUN npm ci && \
    npm cache clean --force

# Copy source code (only server and shared — web is not needed)
COPY packages/shared/ packages/shared/
COPY packages/server/ packages/server/

# Create non-root user for security
RUN addgroup --system nexus && adduser --system --ingroup nexus nexus

# Create auth directory with correct permissions (for Baileys)
RUN mkdir -p /app/.baileys-auth && chown nexus:nexus /app/.baileys-auth

USER nexus

ENV PORT=3001

EXPOSE 3001

# Run with tsx since shared package exports raw TypeScript
CMD ["npx", "tsx", "packages/server/src/index.ts"]
